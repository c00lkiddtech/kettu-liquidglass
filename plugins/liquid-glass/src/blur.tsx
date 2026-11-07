import { logger } from "@vendetta";
import { React, ReactNative } from "@vendetta/metro/common";

import { findComponent, findModuleByPath } from "./finder";
import { BLUR_MODULE_PATHS, chooseBlurProps, glassFill, NATIVE_BLUR_NAMES, NATIVE_GRADIENT_NAMES } from "./pure";
import { publishRuntime } from "./runtime";
import { isDarkTint, readSettings } from "./storage";

let cachedBlur: any = undefined;
let cachedGradient: any = undefined;
let reported = false;

function uiManager(): any {
    return ReactNative?.UIManager;
}

function viewConfig(name: string): { validAttributes?: Record<string, unknown> } | null {
    try {
        const ui = uiManager();
        if (!ui) return null;
        if (typeof ui.hasViewManagerConfig === "function" && ui.hasViewManagerConfig(name) === false) {
            const direct = ui.getViewManagerConfig?.(name);
            if (!direct) return null;
        }
        const config = ui.getViewManagerConfig?.(name) ?? ui[name];
        if (!config || typeof config !== "object") return null;
        return config;
    } catch {
        return null;
    }
}

function nativeComponent(name: string): any | null {
    const config = viewConfig(name);
    if (!config) return null;
    try {
        const required = ReactNative.requireNativeComponent?.(name);
        return required ?? null;
    } catch (e) {
        logger.error(`[Liquid Glass] requireNativeComponent(${name}) failed`, e);
        return null;
    }
}

function propKeysFrom(value: any): string[] {
    const keys = new Set<string>();
    const add = (obj: any) => {
        if (!obj || typeof obj !== "object") return;
        Object.keys(obj).forEach(key => keys.add(key));
    };
    add(value?.propTypes);
    add(value?.defaultProps);
    try {
        const source = Function.prototype.toString.call(value?.render ?? value?.type?.render ?? value?.default ?? value);
        if (source && !source.includes("[bytecode]") && !source.includes("[native code]")) {
            const matched = source.match(/\b(blurAmount|blurRadius|blurType|blurStyle|blurIntensity|intensity|overlayColor|tintColor|effectStyle|reducedTransparencyFallbackColor|blurEnabled)\b/g);
            matched?.forEach(key => keys.add(key));
        }
    } catch { /* toString threw */ }
    return [...keys];
}

function componentFromModule(mod: any): any | null {
    if (!mod) return null;
    if (typeof mod === "function" || typeof mod.render === "function" || typeof mod.type?.render === "function") return mod;
    if (typeof mod.default === "function" || mod.default?.render || mod.default?.type?.render) return mod.default;
    if (mod.VisualEffectView) return mod.VisualEffectView;
    if (mod.BlurView) return mod.BlurView;
    return null;
}

export function resolveBlur(): { component: any; keys: string[] | null; label: string } | null {
    if (cachedBlur !== undefined) return cachedBlur;
    try {
        for (const path of BLUR_MODULE_PATHS) {
            const component = componentFromModule(findModuleByPath(path));
            if (!component) continue;
            const keys = propKeysFrom(component);
            cachedBlur = { component, keys: keys.length ? keys : null, label: path };
            return cachedBlur;
        }

        const byName = componentFromModule(findComponent({ names: ["VisualEffectView", "BlurView"] }));
        if (byName) {
            const keys = propKeysFrom(byName);
            cachedBlur = { component: byName, keys: keys.length ? keys : null, label: "metro VisualEffectView" };
            return cachedBlur;
        }

        const byProps = findComponent({ props: ["blurType", "blurAmount"] });
        const fromProps = componentFromModule(byProps);
        if (fromProps) {
            cachedBlur = { component: fromProps, keys: ["blurType", "blurAmount", "overlayColor"], label: "blurType/blurAmount module" };
            return cachedBlur;
        }

        for (const name of NATIVE_BLUR_NAMES) {
            const config = viewConfig(name);
            const component = nativeComponent(name);
            if (!component) continue;
            const keys = Object.keys(config?.validAttributes ?? {});
            cachedBlur = { component, keys: keys.length ? keys : null, label: `native ${name}` };
            return cachedBlur;
        }
    } catch (e) {
        logger.error("[Liquid Glass] blur lookup failed", e);
    }
    cachedBlur = null;
    return null;
}

export function resolveGradient(): any | null {
    if (cachedGradient !== undefined) return cachedGradient;
    for (const name of NATIVE_GRADIENT_NAMES) {
        const component = nativeComponent(name);
        if (component) {
            cachedGradient = component;
            return component;
        }
    }
    cachedGradient = null;
    return null;
}

export function reportBlurStatus(): void {
    if (reported) return;
    reported = true;
    const found = resolveBlur();
    const gradient = resolveGradient();
    const blur = found
        ? `Native blur: ${found.label}${found.keys?.length ? ` (${found.keys.slice(0, 8).join(", ")})` : ""}.`
        : "No blur view in UIManager or metro. Using tinted glass and rim light.";
    const extra = gradient ? " Linear gradient view is available." : "";
    publishRuntime({ blur: blur + extra });
    logger.log("[Liquid Glass] " + blur + extra);
}

export function forgetBlurCache(): void {
    cachedBlur = undefined;
    cachedGradient = undefined;
    reported = false;
}

export function BlurFill(props: { radius?: number }): JSX.Element | null {
    const settings = readSettings();
    if (!settings.enabled || settings.blur <= 0) return null;
    const found = resolveBlur();
    if (!found) return null;
    const dark = isDarkTint();
    const blurProps = chooseBlurProps({
        amount: settings.blur,
        dark,
        keys: found.keys,
        overlay: glassFill(Math.min(92, settings.opacity + 8), dark),
    });
    return React.createElement(found.component, {
        ...blurProps,
        pointerEvents: "none",
        style: {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: props.radius,
        },
    });
}

export function SpecularRim(): JSX.Element {
    const settings = readSettings();
    const dark = isDarkTint();
    const alpha = (0.08 + (settings.highlight / 100) * 0.7).toFixed(3);
    return React.createElement(ReactNative.View, {
        pointerEvents: "none",
        style: {
            position: "absolute",
            top: 0,
            left: 12,
            right: 12,
            height: 1,
            backgroundColor: dark ? `rgba(255,255,255,${alpha})` : `rgba(255,255,255,${alpha})`,
        },
    });
}
