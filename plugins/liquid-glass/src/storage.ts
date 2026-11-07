import { findByStoreName } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";

import { DEFAULT_SETTINGS, GlassSettings, normalizeSettings, TintChoice } from "./pure";

let repaintTimer: ReturnType<typeof setTimeout> | undefined;

export function ensureStorage(): void {
    (Object.keys(DEFAULT_SETTINGS) as (keyof GlassSettings)[]).forEach(key => {
        if (storage[key] === undefined) storage[key] = DEFAULT_SETTINGS[key];
    });
}

export function readSettings(): GlassSettings {
    ensureStorage();
    return normalizeSettings({
        enabled: storage.enabled,
        blur: storage.blur,
        opacity: storage.opacity,
        highlight: storage.highlight,
        tint: storage.tint as TintChoice,
        wallpaper: storage.wallpaper,
    });
}

export function writeSetting<K extends keyof GlassSettings>(key: K, value: GlassSettings[K]): void {
    storage[key] = value;
    scheduleRepaint();
}

export function resetSettings(): void {
    (Object.keys(DEFAULT_SETTINGS) as (keyof GlassSettings)[]).forEach(key => {
        storage[key] = DEFAULT_SETTINGS[key];
    });
    scheduleRepaint();
}

/** ThemeStore.emitChange is how Discord restyles open screens. */
export function requestRepaint(): void {
    try {
        const ThemeStore = findByStoreName("ThemeStore");
        ThemeStore?.emitChange?.();
    } catch {
        /* store not ready */
    }
}

export function scheduleRepaint(): void {
    if (repaintTimer) clearTimeout(repaintTimer);
    repaintTimer = setTimeout(() => {
        repaintTimer = undefined;
        requestRepaint();
    }, 40);
}

export function cancelRepaint(): void {
    if (repaintTimer) clearTimeout(repaintTimer);
    repaintTimer = undefined;
}

export function isDarkTint(): boolean {
    const { tint } = readSettings();
    if (tint === "dark") return true;
    if (tint === "light") return false;
    try {
        const theme = findByStoreName("ThemeStore")?.theme;
        return theme !== "light";
    } catch {
        return true;
    }
}
