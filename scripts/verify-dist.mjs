import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
const code = await readFile("dist/index.js");
const hash = createHash("sha256").update(code).digest("hex");

assert.equal(manifest.name, "Liquid Glass");
assert.equal(typeof manifest.description, "string");
assert.ok(Array.isArray(manifest.authors) && manifest.authors.length > 0);
assert.equal(manifest.main, "index.js");
assert.equal(manifest.hash, hash);
assert.equal(manifest.vendetta.icon, "ThemeDarkIcon");

const source = code.toString("utf8");
for (const needle of [
    "resolveSemanticColor",
    "VisualEffectView",
    "HACK_fixModalInteraction",
    "onLoad",
    "onUnload",
    "blurAmount",
]) {
    assert.ok(source.includes(needle), `bundle missing ${needle}`);
}

assert.equal(source.includes("require("), false, "bundle should not call require");
assert.ok(source.startsWith("function("), "bundle should be an expression Kettu can return");

const fakeReact = {
    createElement() { return { props: {} }; },
    useState: (v) => [v, () => {}],
    useEffect: () => {},
    Fragment: "Fragment",
};
const vendetta = {
    logger: { log() {}, info() {}, warn() {}, error() {} },
    metro: {
        common: {
            React: fakeReact,
            ReactNative: {
                View: "View",
                Image: "Image",
                Text: "Text",
                StyleSheet: { flatten: () => ({}), absoluteFillObject: {} },
                Dimensions: { get: () => ({ width: 390, height: 844 }) },
                UIManager: { getViewManagerConfig: () => null, hasViewManagerConfig: () => false },
            },
        },
        findByProps() { throw new Error("missing module"); },
        findByName() { throw new Error("missing module"); },
        findByDisplayName() { throw new Error("missing module"); },
        findByStoreName() { throw new Error("missing module"); },
    },
    plugin: { storage: {} },
    patcher: { after() { return () => {}; } },
    storage: { useProxy: (s) => s },
    ui: { components: {} },
    utils: { findInReactTree: () => null },
};

const loaded = (0, eval)(`vendetta=>{return ${source}}`)(vendetta);
const plugin = loaded.default;
assert.equal(typeof plugin.onLoad, "function");
assert.equal(typeof plugin.onUnload, "function");
assert.equal(typeof plugin.settings, "function");
plugin.onLoad();
plugin.onUnload();

const patches = [];
const semantic = Symbol("semantic");
const colorHost = {
    resolveSemanticColor(_theme, _obj) {
        return "#112233";
    },
};
const themeListeners = [];
const glassVendetta = {
    ...vendetta,
    logger: vendetta.logger,
    patcher: {
        after(method, parent, cb) {
            patches.push({ method, parent, cb });
            return () => {};
        },
    },
    metro: {
        ...vendetta.metro,
        findByProps(prop) {
            if (prop === "SemanticColor") {
                return { SemanticColor: { BACKGROUND_PRIMARY: {}, TEXT_NORMAL: {} }, default: { meta: colorHost } };
            }
            throw new Error("missing " + prop);
        },
        findByStoreName(name) {
            if (name === "ThemeStore") return { theme: "dark", addChangeListener(fn) { themeListeners.push(fn); }, emitChange() {} };
            throw new Error("missing " + name);
        },
    },
    plugin: { storage: { enabled: true, opacity: 40, blur: 10, highlight: 50, tint: "dark", wallpaper: "" } },
};
const glass = (0, eval)(`vendetta=>{return ${source}}`)(glassVendetta).default;
glass.onLoad();
const colorPatch = patches.find(p => p.method === "resolveSemanticColor" && p.parent === colorHost);
assert.ok(colorPatch, "resolveSemanticColor was patched");
const colorObj = { [semantic]: "BACKGROUND_PRIMARY" };
const frosted = colorPatch.cb(["dark", colorObj], "#112233");
assert.match(String(frosted), /^rgba\(17, 34, 51,/);
const text = colorPatch.cb(["dark", { [semantic]: "TEXT_NORMAL" }], "#ffffff");
assert.equal(text, "#ffffff");
glass.onUnload();

console.log("dist/manifest.json and dist/index.js look valid");
console.log("stub onLoad/onUnload survived missing modules");
console.log("semantic BACKGROUND_PRIMARY became", frosted);
console.log("sha256", hash);
