import { logger } from "@vendetta";
import { React, ReactNative } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { findInReactTree } from "@vendetta/utils";

import { BlurFill, reportBlurStatus, SpecularRim } from "./blur";
import { findComponent, findModuleByPath, releaseClaims } from "./finder";
import { applyAlpha, highlightColor, SURFACE_TARGETS, SurfaceKind, surfaceAlpha } from "./pure";
import { publishRuntime } from "./runtime";
import { isDarkTint, readSettings } from "./storage";
import { Wallpaper } from "./wallpaper";

let rootWrapped = false;
const patchedIds: string[] = [];
const missedIds: string[] = [];
const held = new Set<string>();

function patchMethod(parent: any, method: string, cb: (ret: any) => any): (() => void) | null {
    if (!parent || typeof parent[method] !== "function") return null;
    return after(method, parent, (_args, ret) => {
        try {
            const next = cb(ret);
            return next === undefined ? ret : next;
        } catch (e) {
            logger.error("[Liquid Glass] surface render failed", e);
            return ret;
        }
    });
}

/** Patches memo/forwardRef `.render`, class `prototype.render`, or a module's `default`. */
function patchExport(mod: any, cb: (ret: any) => any): (() => void) | null {
    if (!mod) return null;
    const attempts: Array<[any, string]> = [];
    const consider = (obj: any) => {
        if (!obj || (typeof obj !== "object" && typeof obj !== "function")) return;
        if (typeof obj.render === "function") attempts.push([obj, "render"]);
        if (typeof obj.type?.render === "function") attempts.push([obj.type, "render"]);
        if (typeof obj.prototype?.render === "function") attempts.push([obj.prototype, "render"]);
    };
    consider(mod);
    if (typeof mod.default === "function") {
        if (typeof mod.default.prototype?.render === "function") attempts.push([mod.default.prototype, "render"]);
        else attempts.push([mod, "default"]);
    } else {
        consider(mod.default);
    }
    if (mod.ActionSheet) consider(mod.ActionSheet);
    if (mod.ContextMenu) consider(mod.ContextMenu);

    for (const [parent, method] of attempts) {
        try {
            const unpatch = patchMethod(parent, method, cb);
            if (unpatch) return unpatch;
        } catch (e) {
            logger.error("[Liquid Glass] method patch failed", e);
        }
    }
    return null;
}

function hostView(node: any): boolean {
    const type = node?.type;
    if (typeof type === "string") return true;
    const name = type?.displayName || type?.name;
    return name === "View" || name === "AnimatedView";
}

function soften(node: any, token: string): void {
    if (!node?.props) return;
    let flat: any = {};
    try {
        flat = ReactNative.StyleSheet.flatten(node.props.style) ?? {};
    } catch {
        return;
    }
    if (typeof flat.backgroundColor !== "string" || flat.backgroundColor === "transparent") return;
    const settings = readSettings();
    node.props.style = [node.props.style, {
        backgroundColor: applyAlpha(flat.backgroundColor, surfaceAlpha(token, settings.opacity)),
    }];
}

function firstBakedBackground(node: any, depth: number): any | null {
    if (!node || depth > 3) return null;
    if (Array.isArray(node)) {
        for (const child of node) {
            const found = firstBakedBackground(child, depth);
            if (found) return found;
        }
        return null;
    }
    if (!node.props) return null;
    try {
        const flat = ReactNative.StyleSheet.flatten(node.props.style);
        if (typeof flat?.backgroundColor === "string" && flat.backgroundColor !== "transparent") return node;
    } catch {
        return null;
    }
    return firstBakedBackground(node.props.children, depth + 1);
}

function chromeStyle(kind: SurfaceKind): Record<string, unknown> | null {
    const rim = highlightColor(readSettings().highlight, isDarkTint());
    if (kind === "pill") {
        return {
            borderRadius: 26,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: rim,
            marginHorizontal: 10,
            marginBottom: 6,
        };
    }
    if (kind === "tabbar") {
        return { borderRadius: 32, overflow: "hidden", borderWidth: 1, borderColor: rim };
    }
    if (kind === "bar") {
        return { borderBottomWidth: 1, borderBottomColor: rim, overflow: "hidden" };
    }
    if (kind === "sheet") {
        return {
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            overflow: "hidden",
            borderTopWidth: 1,
            borderTopColor: rim,
        };
    }
    return null;
}

function paintElement(node: any, kind: SurfaceKind): void {
    if (!node?.props) return;
    const extra = chromeStyle(kind);
    if (extra) node.props.style = [node.props.style, extra];
    if (!hostView(node)) return;
    if (kind !== "pill" && kind !== "bar" && kind !== "tabbar" && kind !== "sheet") return;
    const blur = React.createElement(BlurFill, { radius: kind === "tabbar" ? 32 : kind === "pill" ? 26 : 28 });
    const rim = React.createElement(SpecularRim, null);
    const children = node.props.children;
    if (Array.isArray(children)) node.props.children = [blur, rim, ...children];
    else if (children == null) node.props.children = [blur, rim];
    else node.props.children = [blur, rim, children];
}

function paintStyles(value: any, depth = 0): void {
    if (!value || typeof value !== "object" || depth > 5) return;
    if (Array.isArray(value)) {
        value.forEach(item => paintStyles(item, depth + 1));
        return;
    }
    try {
        const settings = readSettings();
        if (!settings.enabled) return;
        if (typeof value.backgroundColor === "string" && value.backgroundColor !== "transparent") {
            value.backgroundColor = applyAlpha(value.backgroundColor, surfaceAlpha("BG_SURFACE_RAISED", settings.opacity));
            value.borderRadius = value.borderRadius ?? 32;
            value.overflow = "hidden";
            value.borderWidth = value.borderWidth ?? 1;
            value.borderColor = value.borderColor ?? highlightColor(settings.highlight, isDarkTint());
            if (value.position === "absolute" || value.bottom === 0 || typeof value.height === "number") {
                value.marginHorizontal = value.marginHorizontal ?? 12;
                value.marginBottom = value.marginBottom ?? 8;
            }
        }
    } catch {
        return;
    }
    for (const key of Object.keys(value)) {
        const child = value[key];
        if (child && typeof child === "object") paintStyles(child, depth + 1);
    }
}

function renderFor(kind: SurfaceKind, ret: any): any {
    const settings = readSettings();
    if (!settings.enabled || ret == null) return ret;

    if (kind === "styles") {
        paintStyles(ret);
        return ret;
    }

    if (kind === "root") {
        rootWrapped = true;
        const shell = firstBakedBackground(ret, 0);
        if (shell) soften(shell, "BACKGROUND_PRIMARY");
        return React.createElement(ReactNative.View, {
            collapsable: false,
            style: { flex: 1, backgroundColor: "transparent" },
        }, React.createElement(Wallpaper, null), ret);
    }

    if (kind === "chat") {
        try {
            const messages = findInReactTree(
                ret,
                node => Boolean(node?.props && "HACK_fixModalInteraction" in node.props && node.props.style)
            );
            if (messages) soften(messages, "CHAT_BACKGROUND");
        } catch (e) {
            logger.error("[Liquid Glass] chat background lookup failed", e);
        }
        if (rootWrapped) return ret;
        return React.createElement(ReactNative.View, {
            collapsable: false,
            style: { flex: 1, backgroundColor: "transparent" },
        }, React.createElement(Wallpaper, null), ret);
    }

    const token = kind === "sheet"
        ? "BG_SURFACE_OVERLAY"
        : kind === "pill"
            ? "CHANNELTEXTAREA_BACKGROUND"
            : "BACKGROUND_PRIMARY";
    const baked = firstBakedBackground(ret, 0);
    if (baked) soften(baked, token);
    const chromeTarget = baked ?? (ret?.props ? ret : null);
    if (chromeTarget && (kind === "pill" || kind === "bar" || kind === "tabbar" || kind === "sheet")) {
        paintElement(chromeTarget, kind);
    }
    return ret;
}

function bind(label: string, mod: any, kind: SurfaceKind, unpatches: Array<() => void>): boolean {
    try {
        const unpatch = patchExport(mod, ret => renderFor(kind, ret));
        if (!unpatch) return false;
        unpatches.push(unpatch);
        if (!patchedIds.includes(label)) patchedIds.push(label);
        return true;
    } catch (e) {
        logger.error(`[Liquid Glass] ${label} failed`, e);
        return false;
    }
}

function already(id: string): boolean {
    for (const key of held) if (key.startsWith(id + ":")) return true;
    return false;
}

function sweep(unpatches: Array<() => void>): void {
    for (const target of SURFACE_TARGETS) {
        let hit = already(target.id);
        for (const path of target.paths) {
            const key = target.id + ":" + path;
            if (held.has(key)) {
                hit = true;
                continue;
            }
            let mod: any = null;
            try {
                mod = findModuleByPath(path);
            } catch (e) {
                logger.error(`[Liquid Glass] lookup ${path} failed`, e);
            }
            if (!mod) continue;
            if (bind(target.covers, mod, target.kind, unpatches)) {
                held.add(key);
                hit = true;
            }
        }
        if (!hit && (target.names?.length || target.props?.length)) {
            const key = target.id + ":name";
            if (!held.has(key)) {
                let mod: any = null;
                try {
                    mod = findComponent({ names: target.names, props: target.props });
                } catch (e) {
                    logger.error(`[Liquid Glass] name lookup ${target.id} failed`, e);
                }
                if (mod && bind(target.covers, mod, target.kind, unpatches)) {
                    held.add(key);
                    hit = true;
                }
            }
        }
        if (!hit && !missedIds.includes(target.covers)) missedIds.push(target.covers);
        if (hit) {
            const index = missedIds.indexOf(target.covers);
            if (index >= 0) missedIds.splice(index, 1);
        }
    }
    publishRuntime({ patched: [...patchedIds], missed: [...missedIds] });
    try {
        reportBlurStatus();
    } catch (e) {
        logger.error("[Liquid Glass] blur report failed", e);
    }
}

export function installSurfaces(): () => void {
    const unpatches: Array<() => void> = [];
    try {
        sweep(unpatches);
    } catch (e) {
        logger.error("[Liquid Glass] surface sweep failed", e);
    }
    const timers = [400, 1500, 4000].map(ms => setTimeout(() => {
        try {
            sweep(unpatches);
        } catch (e) {
            logger.error("[Liquid Glass] surface retry failed", e);
        }
    }, ms));

    return () => {
        timers.forEach(id => clearTimeout(id));
        for (const unpatch of unpatches) {
            try {
                unpatch();
            } catch (e) {
                logger.error("[Liquid Glass] surface unpatch failed", e);
            }
        }
        unpatches.length = 0;
        held.clear();
        patchedIds.length = 0;
        missedIds.length = 0;
        rootWrapped = false;
        releaseClaims();
    };
}
