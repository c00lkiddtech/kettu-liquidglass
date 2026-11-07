/**
 * Pure helpers. No Discord, no React. These are unit-tested in Node.
 * Token names come from Vendetta theme manifests and Kettu's
 * SEMANTIC_FALLBACK_MAP (BG_* ↔ BACKGROUND_*).
 */

export type TintChoice = "auto" | "light" | "dark";

export interface GlassSettings {
    enabled: boolean;
    /** 0–100. Drives native blur amount and wallpaper bitmap blur. */
    blur: number;
    /** 12–92. Percent opacity of frosted surfaces. */
    opacity: number;
    /** 0–100. Strength of the specular rim. */
    highlight: number;
    tint: TintChoice;
    /** Empty string means the built-in gradient. */
    wallpaper: string;
}

export const DEFAULT_SETTINGS: GlassSettings = {
    enabled: true,
    blur: 45,
    opacity: 42,
    highlight: 55,
    tint: "auto",
    wallpaper: "",
};

const SKIP_TOKEN =
    /TEXT_|HEADER_PRIMARY|HEADER_SECONDARY|INTERACTIVE_|STATUS_|CHANNEL_ICON|CHANNELS_DEFAULT|SCROLLBAR_|TEXT_LINK|CONTROL_|ICON_|SPOILER|REDESIGN_BUTTON|BUTTON_/;

/**
 * Background / surface semantic tokens that should become translucent.
 * Text, icons, links, scrollbars, spoilers, and button fills stay solid.
 */
export function isGlassToken(name: unknown): name is string {
    if (typeof name !== "string" || name.length === 0) return false;
    if (SKIP_TOKEN.test(name)) return false;
    if (name.startsWith("BG_")) return true;
    if (name.includes("BACKGROUND")) return true;
    if (name === "CHAT_BACKGROUND" || name === "KEYBOARD") return true;
    if (name.endsWith("_BACKGROUND")) return true;
    return false;
}

export function clamp(n: number, min: number, max: number): number {
    if (Number.isNaN(n)) return min;
    return Math.min(max, Math.max(min, n));
}

export function normalizeSettings(raw: Partial<GlassSettings> | null | undefined): GlassSettings {
    const src = raw ?? {};
    const tint = src.tint === "light" || src.tint === "dark" || src.tint === "auto" ? src.tint : DEFAULT_SETTINGS.tint;
    return {
        enabled: src.enabled !== false,
        blur: clamp(numberOr(src.blur, DEFAULT_SETTINGS.blur), 0, 100),
        opacity: clamp(numberOr(src.opacity, DEFAULT_SETTINGS.opacity), 12, 92),
        highlight: clamp(numberOr(src.highlight, DEFAULT_SETTINGS.highlight), 0, 100),
        tint,
        wallpaper: sanitizeWallpaper(typeof src.wallpaper === "string" ? src.wallpaper : ""),
    };
}

function numberOr(value: unknown, fallback: number): number {
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    return Number.isFinite(n) ? n : fallback;
}

/** Only http(s) URLs. Anything else falls back to the gradient. */
export function sanitizeWallpaper(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) return "";
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
        return parsed.toString();
    } catch {
        return "";
    }
}

/**
 * Alpha used when rewriting a resolved semantic color.
 * Floating sheets stay a bit more opaque than the page behind them.
 * Hover / faint modifiers stay faint so rows don't turn into slabs.
 */
export function surfaceAlpha(name: string, opacityPercent: number): number {
    const base = clamp(opacityPercent, 12, 92) / 100;
    if (/MODIFIER_HOVER|MODIFIER_ACTIVE|MODIFIER_SELECTED|BG_MOD_FAINT|BG_MOD_SUBTLE|MESSAGE_HOVER/.test(name)) {
        return Math.min(0.22, base * 0.45);
    }
    if (/MODIFIER_ACCENT|BG_MOD_STRONG/.test(name)) {
        return Math.min(0.3, base * 0.55);
    }
    if (/FLOATING|OVERLAY|NESTED|BACKDROP|RAISED/.test(name)) {
        return clamp(base + 0.14, 0.22, 0.9);
    }
    if (/CHANNELTEXTAREA|KEYBOARD/.test(name)) {
        return clamp(base + 0.1, 0.24, 0.9);
    }
    return base;
}

interface Rgba {
    r: number;
    g: number;
    b: number;
    a: number;
}

export function parseColor(input: string): Rgba | null {
    const color = input.trim();
    if (color === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    if (color === "white") return { r: 255, g: 255, b: 255, a: 1 };
    if (color === "black") return { r: 0, g: 0, b: 0, a: 1 };

    const hex = color.match(/^#([0-9a-f]{3,8})$/i);
    if (hex) {
        let h = hex[1];
        if (h.length === 3 || h.length === 4) {
            h = h.split("").map(c => c + c).join("");
        }
        if (h.length !== 6 && h.length !== 8) return null;
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
        if ([r, g, b].some(n => Number.isNaN(n))) return null;
        return { r, g, b, a };
    }

    const rgb = color.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
    if (rgb) {
        return {
            r: clamp(Number(rgb[1]), 0, 255),
            g: clamp(Number(rgb[2]), 0, 255),
            b: clamp(Number(rgb[3]), 0, 255),
            a: rgb[4] === undefined ? 1 : clamp(Number(rgb[4]), 0, 1),
        };
    }
    return null;
}

export function formatRgba(color: Rgba): string {
    const r = Math.round(clamp(color.r, 0, 255));
    const g = Math.round(clamp(color.g, 0, 255));
    const b = Math.round(clamp(color.b, 0, 255));
    const a = Math.round(clamp(color.a, 0, 1) * 1000) / 1000;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Replace alpha. Unparseable values are returned unchanged so a bad token can't blank the UI. */
export function applyAlpha(color: unknown, alpha: number): unknown {
    if (typeof color !== "string") return color;
    const parsed = parseColor(color);
    if (!parsed) return color;
    return formatRgba({ ...parsed, a: clamp(alpha, 0, 1) });
}

export function glassFill(opacityPercent: number, dark: boolean): string {
    const a = clamp(opacityPercent, 12, 92) / 100;
    return dark
        ? formatRgba({ r: 16, g: 14, b: 26, a })
        : formatRgba({ r: 255, g: 255, b: 255, a });
}

export function highlightColor(strengthPercent: number, dark: boolean): string {
    const t = clamp(strengthPercent, 0, 100) / 100;
    const a = 0.06 + t * 0.72;
    return dark
        ? formatRgba({ r: 255, g: 255, b: 255, a })
        : formatRgba({ r: 255, g: 255, b: 255, a: Math.min(0.95, a + 0.12) });
}

const BLUR_AMOUNT_KEYS = new Set(["blurAmount", "intensity", "blurIntensity"]);
const BLUR_RADIUS_KEYS = new Set(["blurRadius", "radius"]);
const BLUR_TYPE_KEYS = new Set(["blurType", "blurStyle", "effectStyle"]);
const OVERLAY_KEYS = new Set(["overlayColor", "tintColor", "colorTint", "reducedTransparencyFallbackColor"]);
const ENABLED_KEYS = new Set(["enabled", "blurEnabled"]);

const FALLBACK_BLUR_KEYS = ["blurAmount", "blurType", "overlayColor"];

export interface BlurPropInput {
    amount: number;
    dark: boolean;
    /** Native or component prop names. Null means we couldn't introspect. */
    keys: string[] | null;
    overlay: string;
}

/**
 * Map the settings onto whatever prop names the blur view actually exposes.
 * Radius keys are capped at 25 because Android blur views reject larger radii.
 * Generic names like `type` are intentionally not filled in.
 */
export function chooseBlurProps(input: BlurPropInput): Record<string, string | number | boolean> {
    const keys = input.keys && input.keys.length > 0 ? input.keys : FALLBACK_BLUR_KEYS;
    const props: Record<string, string | number | boolean> = {};
    const amount = clamp(input.amount, 0, 100);
    const radius = Math.round(amount * 0.25);
    const typeName = input.dark ? "dark" : "light";

    for (const key of keys) {
        if (BLUR_AMOUNT_KEYS.has(key)) props[key] = amount;
        else if (BLUR_RADIUS_KEYS.has(key)) props[key] = radius;
        else if (BLUR_TYPE_KEYS.has(key)) props[key] = typeName;
        else if (OVERLAY_KEYS.has(key)) props[key] = input.overlay;
        else if (ENABLED_KEYS.has(key)) props[key] = amount > 0;
    }
    return props;
}

/** Wallpaper bitmap blur. React Native's blurRadius blurs the image, not the backdrop. */
export function wallpaperBlurRadius(amount: number): number {
    return Math.round(clamp(amount, 0, 100) * 0.16);
}

export type SurfaceKind = "root" | "chat" | "pill" | "bar" | "tabbar" | "sheet" | "panel" | "styles";

export interface SurfaceTarget {
    id: string;
    /** What the user asked to glass. */
    covers: string;
    paths: string[];
    names?: string[];
    /** findByProps(...). Only used when every name is a component export. */
    props?: string[];
    kind: SurfaceKind;
}

/**
 * File paths were checked against:
 * - Kettu src/lib/addons/themes/colors/patches/background.tsx (Messages.tsx, current)
 * - Discord 287.0 android bundle module index (gist 9117125c101a, BlazeK1ng420)
 * Paths that moved between those two are listed together and tried in order.
 */
export const SURFACE_TARGETS: SurfaceTarget[] = [
    {
        id: "root",
        covers: "App shell, so the wallpaper sits behind every screen",
        paths: [
            "modules/main_tabs_v2/native/TabsNavigator.tsx",
            "modules/main_tabs_v2/native/MainTabs.tsx",
            "modules/main_tabs_v2/native/AppComponents.tsx",
        ],
        names: ["TabsNavigator", "MainTabs"],
        kind: "root",
    },
    {
        id: "chat",
        covers: "Chat background and message list",
        paths: [
            "modules/messages/native/Messages.tsx",
            "modules/chat/native/Chat.android.tsx",
            "modules/chat/native/Chat.tsx",
        ],
        kind: "chat",
    },
    {
        id: "dm-list",
        covers: "Home message list",
        paths: ["modules/main_tabs_v2/native/tabs/messages/Messages.tsx"],
        kind: "panel",
    },
    {
        id: "input",
        covers: "Chat input bar",
        paths: ["modules/chat_input/native/ChatInput.tsx"],
        names: ["ChatInput"],
        kind: "pill",
    },
    {
        id: "header",
        covers: "Channel header / nav bar",
        paths: [
            "modules/main_tabs_v2/native/channel/header/ChannelHeader.tsx",
            "modules/main_tabs_v2/native/tabs/messages/MessagesHeader.tsx",
        ],
        names: ["ChannelHeader"],
        kind: "bar",
    },
    {
        id: "tabbar",
        covers: "Bottom tab bar",
        paths: ["modules/main_tabs_v2/native/tabs/you/YouTabBarBackground.tsx"],
        names: ["YouTabBarBackground"],
        kind: "tabbar",
    },
    {
        id: "tabbar-styles",
        covers: "Bottom tab bar layout",
        paths: ["modules/main_tabs_v2/native/shared_components/tab_bar/useTabBarStyles.tsx"],
        kind: "styles",
    },
    {
        id: "guilds",
        covers: "Server list",
        paths: ["modules/guilds_bar/native/GuildsBar.tsx"],
        names: ["GuildsBar"],
        kind: "panel",
    },
    {
        id: "channels",
        covers: "Channel list",
        paths: ["modules/channel_list_v2/native/RedesignChannelList.tsx"],
        names: ["RedesignChannelList"],
        kind: "panel",
    },
    {
        id: "sheets",
        covers: "Bottom sheets and action sheets",
        paths: ["modules/action_sheet/native/components/ActionSheetPresenter.tsx"],
        names: ["ActionSheetPresenter"],
        props: ["ActionSheet"],
        kind: "sheet",
    },
    {
        id: "longpress",
        covers: "Long-press message menu",
        paths: ["modules/messages/native/long_press/LongPressMessageActionSheet.tsx"],
        names: ["LongPressMessageActionSheet"],
        kind: "sheet",
    },
    {
        id: "modals",
        covers: "Modals",
        paths: ["modules/main_tabs_v2/native/modal/ModalScreen.tsx"],
        names: ["ModalScreen"],
        kind: "sheet",
    },
    {
        id: "settings",
        covers: "Settings screens",
        paths: [
            "modules/main_tabs_v2/native/settings/SettingsNavigator.tsx",
            "modules/main_tabs_v2/native/tabs/settings/Settings.tsx",
        ],
        names: ["SettingsNavigator"],
        kind: "panel",
    },
    {
        id: "profile",
        covers: "Profile popout",
        paths: [
            "modules/user_profile/native/UserProfileActionSheet.tsx",
            "modules/user_profile/native/UserProfileCard.tsx",
        ],
        names: ["UserProfileActionSheet", "UserProfileCard"],
        kind: "sheet",
    },
    {
        id: "context",
        covers: "Context menus",
        paths: [],
        props: ["ContextMenu"],
        kind: "sheet",
    },
    {
        id: "friends",
        covers: "Friends screen",
        paths: ["modules/main_tabs_v2/native/friends/screens/FriendsScreen.tsx"],
        names: ["FriendsScreen"],
        kind: "panel",
    },
    {
        id: "you",
        covers: "You / account tab",
        paths: ["modules/main_tabs_v2/native/tabs/you/YouScreen.tsx"],
        names: ["YouScreen"],
        kind: "panel",
    },
];

/** Discord 287.0 ships these JS wrappers around a native blur view. */
export const BLUR_MODULE_PATHS = [
    "modules/visual_effect_view/native/VisualEffectView.tsx",
    "modules/visual_effect_view/native/VisualEffectViewIOS.tsx",
    "modules/visual_effect_view/native/VisualEffectViewAndroid.tsx",
    "modules/activities/panel/native/BlurVisualEffectView.tsx",
];

/** Tried, in order, against UIManager before requireNativeComponent. */
export const NATIVE_BLUR_NAMES = [
    "DCDVisualEffectView",
    "VisualEffectView",
    "RCTVisualEffectView",
    "BlurView",
    "AndroidBlurView",
    "ExpoBlurView",
];

export const NATIVE_GRADIENT_NAMES = ["BVLinearGradient", "RNLinearGradient", "LinearGradient"];
