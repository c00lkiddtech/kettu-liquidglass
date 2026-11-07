import { logger } from "@vendetta";
import { findByDisplayName, findByName, findByProps } from "@vendetta/metro";

const seen = new Set<string>();

function globals(): { modules?: Record<string, { __filePath?: string }>; require?: (id: number) => any; bunny?: any } {
    const g = globalThis as any;
    return {
        modules: g.modules,
        require: typeof g.__r === "function" ? g.__r : undefined,
        bunny: g.bunny,
    };
}

/** Kettu stamps `__filePath` onto window.modules while the bundle imports. */
export function findModuleByPath(path: string): any | null {
    try {
        const bunnyFind = globals().bunny?.metro?.findByFilePath;
        if (typeof bunnyFind === "function") {
            const found = bunnyFind(path, false);
            if (found) return found;
        }
    } catch (e) {
        logger.error("[Liquid Glass] bunny findByFilePath failed", e);
    }

    try {
        const { modules, require } = globals();
        if (!modules || !require) return null;
        const matches: any[] = [];
        for (const id in modules) {
            const filePath = modules[id]?.__filePath;
            if (!filePath) continue;
            if (filePath !== path && !filePath.endsWith("/" + path)) continue;
            try {
                const exported = require(Number(id));
                if (exported) matches.push(exported);
            } catch {
                /* module failed to evaluate */
            }
            if (filePath === path && matches.length) return matches[matches.length - 1];
        }
        return matches.length === 1 ? matches[0] : null;
    } catch (e) {
        logger.error("[Liquid Glass] file path scan failed", e);
        return null;
    }
}

export function findComponent(spec: { paths?: string[]; names?: string[]; props?: string[] }): any | null {
    for (const path of spec.paths ?? []) {
        const mod = findModuleByPath(path);
        if (mod) return mod;
    }
    for (const name of spec.names ?? []) {
        try {
            const byName = findByName(name, true) ?? findByName(name, false);
            if (byName) return byName;
        } catch { /* missing */ }
        try {
            const byDisplay = findByDisplayName(name, true) ?? findByDisplayName(name, false);
            if (byDisplay) return byDisplay;
        } catch { /* missing */ }
    }
    if (spec.props && spec.props.length) {
        try {
            const mod = findByProps(...spec.props);
            if (!mod) return null;
            if (spec.props.length === 1 && mod[spec.props[0]]) return mod[spec.props[0]];
            return mod;
        } catch { /* missing */ }
    }
    return null;
}

/** Remember a successful lookup so retries don't stack patches. */
export function claim(id: string): boolean {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
}

export function releaseClaims(): void {
    seen.clear();
}
