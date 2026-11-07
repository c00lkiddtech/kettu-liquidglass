import { React, ReactNative } from "@vendetta/metro/common";
import { useProxy } from "@vendetta/storage";
import { storage } from "@vendetta/plugin";
import { Forms, ErrorBoundary } from "@vendetta/ui/components";

import { DEFAULT_SETTINGS, GlassSettings } from "./pure";
import { runtime, subscribeRuntime } from "./runtime";
import { ensureStorage, resetSettings, writeSetting } from "./storage";

function Slider({
    label,
    subLabel,
    value,
    min,
    max,
    onChange,
}: {
    label: string;
    subLabel?: string;
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
}) {
    const SliderRow = Forms?.FormSliderRow;
    if (SliderRow) {
        return React.createElement(SliderRow, {
            label,
            subLabel,
            value,
            minValue: min,
            maxValue: max,
            minimumValue: min,
            maximumValue: max,
            onValueChange: (next: number) => onChange(Math.round(next)),
        });
    }

    const FormRow = Forms?.FormRow;
    const { View, Text } = ReactNative;
    const nudge = (delta: number) => onChange(Math.min(max, Math.max(min, value + delta)));
    const body = React.createElement(View, { style: { flexDirection: "row", alignItems: "center", gap: 12 } },
        React.createElement(Text, { onPress: () => nudge(-5), style: { fontSize: 18, padding: 6 } }, "−"),
        React.createElement(Text, { style: { minWidth: 36, textAlign: "center" } }, String(value)),
        React.createElement(Text, { onPress: () => nudge(5), style: { fontSize: 18, padding: 6 } }, "+")
    );
    if (!FormRow) return React.createElement(View, { style: { padding: 12 } }, React.createElement(Text, null, label), body);
    return React.createElement(FormRow, { label, subLabel, trailing: body });
}

function Page(): JSX.Element {
    useProxy(storage);
    ensureStorage();
    const [, setTick] = React.useState(0);
    React.useEffect(() => subscribeRuntime(() => setTick(tick => tick + 1)), []);

    const { ScrollView, Text } = ReactNative;
    const FormSection = Forms?.FormSection;
    const FormRow = Forms?.FormRow;
    const FormDivider = Forms?.FormDivider;
    const SwitchRow = Forms?.FormSwitchRow ?? Forms?.FormSwitch;
    const FormInput = Forms?.FormInput;
    const Radio = Forms?.FormRadioRow;

    const section = (title: string, children: any[]) => {
        if (FormSection) return React.createElement(FormSection, { title, key: title }, children);
        return React.createElement(ReactNative.View, { key: title, style: { paddingVertical: 8 } },
            React.createElement(Text, { style: { fontWeight: "700", padding: 12 } }, title),
            children
        );
    };

    const tint = (storage.tint ?? "auto") as GlassSettings["tint"];
    const rows = [
        section("Glass", [
            SwitchRow
                ? React.createElement(SwitchRow, {
                    key: "enabled",
                    label: "Liquid glass",
                    subLabel: "Frost surfaces and show the wallpaper through them",
                    value: storage.enabled !== false,
                    onValueChange: (value: boolean) => writeSetting("enabled", value),
                })
                : React.createElement(Text, { key: "enabled" }, "Switch unavailable"),
            React.createElement(Slider, {
                key: "blur",
                label: "Blur intensity",
                subLabel: "Native blur strength, and how soft the wallpaper bitmap is",
                value: Number(storage.blur ?? DEFAULT_SETTINGS.blur),
                min: 0,
                max: 100,
                onChange: value => writeSetting("blur", value),
            }),
            React.createElement(Slider, {
                key: "opacity",
                label: "Surface opacity",
                subLabel: "How solid the frost is. Lower lets more wallpaper through",
                value: Number(storage.opacity ?? DEFAULT_SETTINGS.opacity),
                min: 12,
                max: 92,
                onChange: value => writeSetting("opacity", value),
            }),
            React.createElement(Slider, {
                key: "highlight",
                label: "Accent highlight",
                subLabel: "Specular rim on pills, bars, and sheets",
                value: Number(storage.highlight ?? DEFAULT_SETTINGS.highlight),
                min: 0,
                max: 100,
                onChange: value => writeSetting("highlight", value),
            }),
        ]),
        section("Tint", [
            Radio && React.createElement(Radio, {
                key: "auto",
                label: "Match Discord theme",
                selected: tint === "auto",
                onPress: () => writeSetting("tint", "auto"),
            }),
            Radio && React.createElement(Radio, {
                key: "dark",
                label: "Dark frost",
                selected: tint === "dark",
                onPress: () => writeSetting("tint", "dark"),
            }),
            Radio && React.createElement(Radio, {
                key: "light",
                label: "Light frost",
                selected: tint === "light",
                onPress: () => writeSetting("tint", "light"),
            }),
        ].filter(Boolean)),
        section("Wallpaper", [
            FormInput
                ? React.createElement(FormInput, {
                    key: "url",
                    title: "Image URL",
                    label: "Image URL",
                    placeholder: "https://example.com/wallpaper.jpg",
                    value: storage.wallpaper ?? "",
                    onChange: (value: any) => {
                        const text = typeof value === "string" ? value : value?.nativeEvent?.text;
                        if (typeof text === "string") writeSetting("wallpaper", text);
                    },
                    onChangeText: (value: string) => {
                        if (typeof value === "string") writeSetting("wallpaper", value);
                    },
                })
                : null,
            FormDivider ? React.createElement(FormDivider, { key: "div" }) : null,
            FormRow
                ? React.createElement(FormRow, {
                    key: "hint",
                    label: "Empty URL uses the built-in gradient",
                    subLabel: "http and https only. The gradient stays behind the image if it fails to load.",
                })
                : null,
            FormRow
                ? React.createElement(FormRow, {
                    key: "reset",
                    label: "Reset to defaults",
                    trailing: FormRow.Arrow ?? undefined,
                    onPress: () => resetSettings(),
                })
                : null,
        ].filter(Boolean)),
        section("This session", [
            FormRow
                ? React.createElement(FormRow, {
                    key: "blur",
                    label: "Blur",
                    subLabel: runtime.blur,
                })
                : React.createElement(Text, { key: "blur", style: { padding: 12 } }, runtime.blur),
            FormRow
                ? React.createElement(FormRow, {
                    key: "patched",
                    label: runtime.patched.length ? "Glassed" : "No surfaces patched yet",
                    subLabel: runtime.patched.join(", ") || "Open a chat, then come back. Late screens are patched a few seconds after load.",
                })
                : null,
            runtime.missed.length && FormRow
                ? React.createElement(FormRow, {
                    key: "missed",
                    label: "Not found in this Discord build",
                    subLabel: runtime.missed.join(", "),
                })
                : null,
        ].filter(Boolean)),
    ];

    return React.createElement(ScrollView, {
        style: { flex: 1 },
        contentContainerStyle: { paddingBottom: 48 },
    }, rows);
}

export default function Settings(): JSX.Element {
    if (ErrorBoundary) {
        return React.createElement(ErrorBoundary, null, React.createElement(Page, null));
    }
    return React.createElement(Page, null);
}
