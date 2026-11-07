import { logger } from "@vendetta";

import { forgetBlurCache } from "./blur";
import { installColorPatch } from "./colors";
import { releaseClaims } from "./finder";
import Settings from "./settings";
import { cancelRepaint, ensureStorage, requestRepaint } from "./storage";
import { installSurfaces } from "./surfaces";

const unpatches: Array<() => void> = [];

export default {
    onLoad() {
        try {
            ensureStorage();
            unpatches.push(installColorPatch());
            unpatches.push(installSurfaces());
            requestRepaint();
        } catch (e) {
            logger.error("[Liquid Glass] onLoad failed", e);
        }
    },
    onUnload() {
        cancelRepaint();
        while (unpatches.length) {
            const unpatch = unpatches.pop();
            try {
                unpatch?.();
            } catch (e) {
                logger.error("[Liquid Glass] unpatch failed", e);
            }
        }
        releaseClaims();
        forgetBlurCache();
        try {
            requestRepaint();
        } catch {
            /* Discord is already tearing down */
        }
    },
    settings: Settings,
};
