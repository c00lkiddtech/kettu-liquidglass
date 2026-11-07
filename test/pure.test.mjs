import assert from "node:assert/strict";
import test from "node:test";

import {
    applyAlpha,
    chooseBlurProps,
    DEFAULT_SETTINGS,
    highlightColor,
    isGlassToken,
    normalizeSettings,
    sanitizeWallpaper,
    SURFACE_TARGETS,
    surfaceAlpha,
    wallpaperBlurRadius,
} from "../plugins/liquid-glass/src/pure.ts";

test("glass tokens include page, sheet, and input backgrounds", () => {
    for (const name of [
        "BACKGROUND_PRIMARY",
        "BACKGROUND_SECONDARY",
        "BACKGROUND_SECONDARY_ALT",
        "BACKGROUND_TERTIARY",
        "BACKGROUND_FLOATING",
        "BACKGROUND_MOBILE_PRIMARY",
        "BACKGROUND_MOBILE_SECONDARY",
        "BACKGROUND_NESTED_FLOATING",
        "BACKGROUND_MODIFIER_ACCENT",
        "CHAT_BACKGROUND",
        "CHANNELTEXTAREA_BACKGROUND",
        "KEYBOARD",
        "BG_BACKDROP",
        "BG_BASE_PRIMARY",
        "BG_BASE_SECONDARY",
        "BG_BASE_TERTIARY",
        "BG_MOD_FAINT",
        "BG_MOD_STRONG",
        "BG_MOD_SUBTLE",
        "BG_SURFACE_OVERLAY",
        "BG_SURFACE_OVERLAY_TMP",
        "BG_SURFACE_RAISED",
    ]) {
        assert.equal(isGlassToken(name), true, name);
    }
});

test("text, icons, spoilers, and scrollbars stay opaque", () => {
    for (const name of [
        "TEXT_NORMAL",
        "TEXT_MUTED",
        "HEADER_PRIMARY",
        "HEADER_SECONDARY",
        "INTERACTIVE_NORMAL",
        "CHANNEL_ICON",
        "CHANNELS_DEFAULT",
        "SCROLLBAR_THIN_THUMB",
        "TEXT_LINK",
        "SPOILER_HIDDEN_BACKGROUND",
        "SPOILER_REVEALED_BACKGROUND",
        "",
    ]) {
        assert.equal(isGlassToken(name), false, name);
    }
    assert.equal(isGlassToken(null), false);
});

test("floating surfaces are more opaque than the page, modifiers stay faint", () => {
    const page = surfaceAlpha("BACKGROUND_PRIMARY", 42);
    const sheet = surfaceAlpha("BG_SURFACE_OVERLAY", 42);
    const hover = surfaceAlpha("BACKGROUND_MODIFIER_HOVER", 42);
    assert.ok(sheet > page);
    assert.ok(hover < page);
    assert.ok(hover <= 0.22);
});

test("applyAlpha rewrites hex and rgb without stacking", () => {
    assert.equal(applyAlpha("#112233", 0.5), "rgba(17, 34, 51, 0.5)");
    assert.equal(applyAlpha("#abc", 1), "rgba(170, 187, 204, 1)");
    assert.equal(applyAlpha("rgb(1, 2, 3)", 0.25), "rgba(1, 2, 3, 0.25)");
    assert.equal(applyAlpha("rgba(1, 2, 3, 0.9)", 0.4), "rgba(1, 2, 3, 0.4)");
    assert.equal(applyAlpha("not-a-color", 0.5), "not-a-color");
    assert.equal(applyAlpha(12, 0.5), 12);
});

test("wallpaper URLs are http(s) only", () => {
    assert.equal(sanitizeWallpaper("  https://cdn.example.com/a.png  "), "https://cdn.example.com/a.png");
    assert.equal(sanitizeWallpaper("javascript:alert(1)"), "");
    assert.equal(sanitizeWallpaper("file:///etc/passwd"), "");
    assert.equal(sanitizeWallpaper(""), "");
    assert.equal(sanitizeWallpaper("not a url"), "");
});

test("normalizeSettings clamps and falls back", () => {
    const settings = normalizeSettings({ blur: 400, opacity: 1, highlight: -5, tint: "nope", wallpaper: "ftp://x", enabled: false });
    assert.equal(settings.enabled, false);
    assert.equal(settings.blur, 100);
    assert.equal(settings.opacity, 12);
    assert.equal(settings.highlight, 0);
    assert.equal(settings.tint, "auto");
    assert.equal(settings.wallpaper, "");
    assert.deepEqual(normalizeSettings(undefined), { ...DEFAULT_SETTINGS, enabled: true });
});

test("blur props follow the keys a view actually has", () => {
    const known = chooseBlurProps({
        amount: 80,
        dark: true,
        keys: ["blurAmount", "blurRadius", "blurType", "overlayColor", "enabled"],
        overlay: "rgba(0, 0, 0, 0.4)",
    });
    assert.equal(known.blurAmount, 80);
    assert.equal(known.blurRadius, 20);
    assert.equal(known.blurType, "dark");
    assert.equal(known.overlayColor, "rgba(0, 0, 0, 0.4)");
    assert.equal(known.enabled, true);
    assert.equal("type" in known, false);

    const fallback = chooseBlurProps({ amount: 10, dark: false, keys: null, overlay: "rgba(255,255,255,0.4)" });
    assert.equal(fallback.blurAmount, 10);
    assert.equal(fallback.blurType, "light");
    assert.equal(wallpaperBlurRadius(100), 16);
});

test("highlight strength changes the rim alpha", () => {
    const low = highlightColor(0, true);
    const high = highlightColor(100, true);
    const lowA = Number(low.match(/[\d.]+(?=\))/)?.[0]);
    const highA = Number(high.match(/[\d.]+(?=\))/)?.[0]);
    assert.ok(highA > lowA);
});

test("every requested surface has a target", () => {
    const covers = SURFACE_TARGETS.map(target => target.covers).join(" | ").toLowerCase();
    for (const phrase of [
        "chat background",
        "message list",
        "chat input",
        "header",
        "bottom tab bar",
        "server list",
        "channel list",
        "bottom sheets",
        "action sheets",
        "long-press",
        "modals",
        "settings",
        "profile",
        "context menu",
    ]) {
        assert.ok(covers.includes(phrase), phrase);
    }
});
