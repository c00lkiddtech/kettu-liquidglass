export interface RuntimeStatus {
    blur: string;
    patched: string[];
    missed: string[];
}

export const runtime: RuntimeStatus = {
    blur: "Not checked yet.",
    patched: [],
    missed: [],
};

const listeners = new Set<() => void>();

export function subscribeRuntime(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function publishRuntime(patch: Partial<RuntimeStatus>): void {
    if (patch.blur !== undefined) runtime.blur = patch.blur;
    if (patch.patched) runtime.patched = patch.patched;
    if (patch.missed) runtime.missed = patch.missed;
    listeners.forEach(listener => {
        try {
            listener();
        } catch {
            /* settings unmounted */
        }
    });
}
