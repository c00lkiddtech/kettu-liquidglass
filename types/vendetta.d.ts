declare module "@vendetta" {
    export const logger: {
        log: (...args: unknown[]) => void;
        info: (...args: unknown[]) => void;
        warn: (...args: unknown[]) => void;
        error: (...args: unknown[]) => void;
    };
}

declare module "@vendetta/metro" {
    export function findByProps(...props: string[]): any;
    export function findByName(name: string, defaultExp?: boolean): any;
    export function findByDisplayName(name: string, defaultExp?: boolean): any;
    export function findByStoreName(name: string): any;
    export const modules: Record<string, any> | undefined;
}

declare module "@vendetta/metro/common" {
    export const React: typeof import("react");
    export const ReactNative: typeof import("react-native");
}

declare module "@vendetta/patcher" {
    export function after(
        method: string,
        parent: any,
        callback: (args: any[], ret: any) => unknown,
        once?: boolean
    ): () => void;
}

declare module "@vendetta/plugin" {
    export const storage: Record<string, any>;
}

declare module "@vendetta/storage" {
    export function useProxy<T extends object>(storage: T): T;
}

declare module "@vendetta/ui/components" {
    export const Forms: any;
    export const ErrorBoundary: any;
}

declare module "@vendetta/utils" {
    export function findInReactTree(tree: any, filter: (node: any) => boolean): any;
}
