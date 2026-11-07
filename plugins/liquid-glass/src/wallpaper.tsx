import { React, ReactNative } from "@vendetta/metro/common";

import { resolveGradient } from "./blur";
import { glassFill, wallpaperBlurRadius } from "./pure";
import { isDarkTint, readSettings } from "./storage";

const BLOBS_DARK = [
    { color: "#3a1878", x: -0.15, y: -0.08, s: 0.85 },
    { color: "#0e4f66", x: 0.35, y: 0.22, s: 0.9 },
    { color: "#6a245c", x: -0.1, y: 0.55, s: 0.75 },
    { color: "#12306e", x: 0.4, y: 0.72, s: 0.7 },
];

const BLOBS_LIGHT = [
    { color: "#ddc8ff", x: -0.1, y: -0.05, s: 0.8 },
    { color: "#c5e4ff", x: 0.4, y: 0.18, s: 0.85 },
    { color: "#ffd0e6", x: -0.05, y: 0.5, s: 0.75 },
    { color: "#c8f3ee", x: 0.45, y: 0.68, s: 0.7 },
];

export function Wallpaper(): JSX.Element | null {
    const settings = readSettings();
    if (!settings.enabled) return null;
    const { View, Image, StyleSheet, Dimensions } = ReactNative;
    const dark = isDarkTint();
    const { width, height } = Dimensions.get("window");
    const blobs = dark ? BLOBS_DARK : BLOBS_LIGHT;
    const Gradient = resolveGradient();
    const base = dark ? "#140e22" : "#f4f0fb";

    const layers: any[] = [];
    if (Gradient) {
        layers.push(React.createElement(Gradient, {
            key: "grad",
            pointerEvents: "none",
            colors: dark ? ["#1a1030", "#12324a", "#4a2048", "#0e3a42"] : ["#f7f1ff", "#e7f3ff", "#ffe8f3", "#e5fffb"],
            start: { x: 0.1, y: 0 },
            end: { x: 0.9, y: 1 },
            style: StyleSheet.absoluteFillObject,
        }));
    }

    blobs.forEach((blob, index) => {
        const size = Math.max(width, height) * blob.s;
        layers.push(React.createElement(View, {
            key: "b" + index,
            pointerEvents: "none",
            style: {
                position: "absolute",
                width: size,
                height: size,
                borderRadius: size / 2,
                left: width * blob.x,
                top: height * blob.y,
                backgroundColor: blob.color,
                opacity: dark ? 0.9 : 0.85,
            },
        }));
    });

    if (settings.wallpaper) {
        layers.push(React.createElement(Image, {
            key: "photo",
            pointerEvents: "none",
            source: { uri: settings.wallpaper },
            resizeMode: "cover",
            blurRadius: wallpaperBlurRadius(settings.blur),
            style: StyleSheet.absoluteFillObject,
        }));
    }

    return React.createElement(View, {
        pointerEvents: "none",
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants",
        style: [StyleSheet.absoluteFillObject, { backgroundColor: base }],
    }, layers.length ? layers : React.createElement(View, {
        style: [StyleSheet.absoluteFillObject, { backgroundColor: glassFill(settings.opacity, dark) }],
    }));
}
