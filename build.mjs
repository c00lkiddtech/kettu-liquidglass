import { createHash } from "crypto";
import { readFile, writeFile, mkdir } from "fs/promises";
import { extname } from "path";

import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import { rollup } from "rollup";
import esbuild from "rollup-plugin-esbuild";
import swc from "@swc/core";

const extensions = [".js", ".jsx", ".mjs", ".ts", ".tsx", ".cts", ".mts"];

/** @type {import("rollup").InputPluginOption} */
const plugins = [
    nodeResolve(),
    commonjs(),
    {
        name: "swc",
        async transform(code, id) {
            const ext = extname(id);
            if (!extensions.includes(ext)) return null;
            const ts = ext.includes("ts");
            const tsx = ts ? ext.endsWith("x") : undefined;
            const jsx = !ts ? ext.endsWith("x") : undefined;
            const result = await swc.transform(code, {
                filename: id,
                jsc: {
                    target: "es2019",
                    externalHelpers: false,
                    parser: {
                        syntax: ts ? "typescript" : "ecmascript",
                        tsx,
                        jsx,
                    },
                    transform: {
                        react: {
                            runtime: "classic",
                            pragma: "React.createElement",
                            pragmaFrag: "React.Fragment",
                        },
                    },
                },
            });
            return result.code;
        },
    },
    esbuild({ minify: true }),
];

const manifest = JSON.parse(await readFile("./plugins/liquid-glass/manifest.json", "utf8"));
const outDir = "./dist";
const outPath = `${outDir}/index.js`;
await mkdir(outDir, { recursive: true });

const bundle = await rollup({
    input: `./plugins/liquid-glass/${manifest.main}`,
    external: id => id === "react" || id === "react-native" || id.startsWith("@vendetta"),
    onwarn(warning, warn) {
        if (warning.code === "CIRCULAR_DEPENDENCY") return;
        warn(warning);
    },
    plugins,
});

await bundle.write({
    file: outPath,
    format: "iife",
    name: "liquidGlassPlugin",
    compact: true,
    exports: "named",
    globals(id) {
        if (id === "react") return "window.React";
        if (id === "react-native") return "vendetta.metro.common.ReactNative";
        if (id === "@vendetta") return "vendetta";
        if (id.startsWith("@vendetta/")) return "vendetta." + id.slice("@vendetta/".length).replace(/\//g, ".");
        return id;
    },
});
await bundle.close();

// Kettu evals `vendetta=>{return ${bundle}}`. The file has to be an expression.
// Rollup's IIFE is `var name = function(){...}(vendetta);`, and `return var` is a syntax error.
const assignment = "var liquidGlassPlugin=";
let sourceText = (await readFile(outPath, "utf8")).trim();
if (!sourceText.startsWith(assignment)) {
    throw new Error(`Expected bundle to start with ${assignment}`);
}
sourceText = sourceText.slice(assignment.length);
await writeFile(outPath, sourceText);

const source = Buffer.from(sourceText);
manifest.hash = createHash("sha256").update(source).digest("hex");
manifest.main = "index.js";
await writeFile(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Built ${manifest.name}`);
console.log(`  dist/index.js  ${source.length} bytes`);
console.log(`  sha256         ${manifest.hash}`);
