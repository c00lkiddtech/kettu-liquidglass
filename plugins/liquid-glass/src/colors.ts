import { logger } from "@vendetta";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { after } from "@vendetta/patcher";

import { applyAlpha, isGlassToken, surfaceAlpha } from "./pure";
import { readSettings } from "./storage";

let installed: Array<() => void> = [];
let themeListener: (() => void) | undefined;
let disposed = false;

/**
 * First symbol on a semantic color object is the token name.
 * Same extraction Kettu uses in themes/colors/patches/resolver.ts.
 */
export function semanticName(colorObj: any, semanticMap?: Record<string, unknown>): string | null {
    if (!colorObj || typeof colorObj !== "object") return null;
    const symbols = Object.getOwnPropertySymbols(colorObj);
    for (const symbol of symbols) {
        const value = colorObj[symbol];
        if (typeof value !== "string") continue;
        if (!semanticMap || value in semanticMap) return value;
    }
    const first = symbols[0] ? colorObj[symbols[0]] : undefined;
    return typeof first === "string" ? first : null;
}

function resolverHosts(): any[] {
    const hosts: any[] = [];
    let mod: any;
    try {
        mod = findByProps("SemanticColor");
    } catch (e) {
        logger.error("[Liquid Glass] SemanticColor module missing", e);
        return hosts;
    }
    const push = (host: any) => {
        if (host && typeof host.resolveSemanticColor === "function" && !hosts.includes(host)) hosts.push(host);
    };
    push(mod?.default?.meta);
    push(mod?.default?.internal);
    push(mod);
    (hosts as any).semanticMap = mod?.SemanticColor;
    return hosts;
}

function glassReturn(semanticMap: Record<string, unknown> | undefined, args: any[], ret: unknown): unknown {
    try {
        const settings = readSettings();
        if (!settings.enabled) return ret;
        if (typeof ret !== "string") return ret;
        const fromArg = typeof args?.[1] === "string" ? args[1] : semanticName(args?.[1], semanticMap);
        if (!fromArg || !isGlassToken(fromArg)) return ret;
        return applyAlpha(ret, surfaceAlpha(fromArg, settings.opacity));
    } catch (e) {
        logger.error("[Liquid Glass] color rewrite failed", e);
        return ret;
    }
}

function attach(): void {
    if (disposed) return;
    for (const unpatch of installed) {
        try { unpatch(); } catch { /* already gone */ }
    }
    installed = [];
    const hosts = resolverHosts();
    const semanticMap = (hosts as any).semanticMap as Record<string, unknown> | undefined;
    for (const host of hosts) {
        try {
            installed.push(after("resolveSemanticColor", host, (args, ret) => glassReturn(semanticMap, args, ret)));
        } catch (e) {
            logger.error("[Liquid Glass] resolveSemanticColor patch failed", e);
        }
    }
}

/**
 * Re-wrap after Kettu's theme `instead` patch lands. Plugins and themes
 * start in the same Promise.all, so the outermost wrapper can lose the race.
 */
export function installColorPatch(): () => void {
    disposed = false;
    attach();
    const timers = [0, 800, 2500, 6000].map(ms => setTimeout(attach, ms));

    try {
        const ThemeStore = findByStoreName("ThemeStore");
        if (ThemeStore?.addChangeListener) {
            const onChange = () => {
                setTimeout(attach, 0);
            };
            ThemeStore.addChangeListener(onChange);
            themeListener = () => ThemeStore.removeChangeListener?.(onChange);
        }
    } catch (e) {
        logger.error("[Liquid Glass] ThemeStore listener failed", e);
    }

    return () => {
        disposed = true;
        timers.forEach(clearTimeout);
        try { themeListener?.(); } catch { /* noop */ }
        themeListener = undefined;
        for (const unpatch of installed) {
            try { unpatch(); } catch { /* noop */ }
        }
        installed = [];
    };
}
