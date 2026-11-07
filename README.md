# Liquid Glass

A [Kettu](https://github.com/C0C0B01/Kettu) plugin that frosts the Discord mobile app into an iOS 26 “liquid glass” look: translucent surfaces, a wallpaper or gradient showing through, soft specular rims, and pill-shaped chrome.

Kettu continues Bunny, and Bunny still loads [Vendetta plugins](https://github.com/vendetta-mod/polymanifest). This plugin uses that manifest (`name`, `description`, `authors`, `main`, optional `vendetta.icon`) and the `@vendetta/*` API Kettu installs on `window.vendetta` (`metro`, `patcher`, `plugin.storage`, `ui.components.Forms`).

It does **not** ship a native module. A JavaScript plugin cannot add one. Real blur is used only when Discord’s own bundle already registered a blur view.

## Install

1. Build, or use the committed `dist/` folder:

   ```bash
   npm install
   npm run verify
   ```

   That writes `dist/manifest.json` and `dist/index.js`. The manifest’s `hash` is the SHA-256 of `index.js`. Kettu uses it to decide when to re-download.

2. Host **those two files in the same directory** on any static host you control (GitHub Pages, Codeberg Pages, a VPS, `npx serve dist`). Do not rely on a public URL from this repo — nothing here is published for you.

3. In Discord, with Kettu installed: **Settings → Plugins → Install plugin**. Paste the directory URL. Kettu appends a slash if you leave it off, then fetches `manifest.json` and the `main` file (`index.js`) next to it.

   Examples, after you host the folder yourself:

   - Pages site whose root is the contents of `dist/`: `https://<you>.github.io/<repo>/`
   - `dist` kept as a subpath: `https://<you>.github.io/<repo>/dist/`

4. Enable **Liquid Glass**. Open it with the wrench icon for the settings below. The plugin icon is Discord’s `ThemeDarkIcon` asset (the same name Kettu’s theme screen uses). If a future Discord build renames that asset, the row still loads, just without an icon.

Changing a setting restyles open screens by emitting on `ThemeStore`. If a surface was still loading, leave it for a few seconds — the plugin retries lookups at 0.4s, 1.5s, and 4s.

## Settings

| Setting | What it does |
| --- | --- |
| Liquid glass | Master switch. Patches stay installed and do nothing while this is off, and they all come off on unload. |
| Blur intensity | 0–100. Passed to a native blur view when one exists (`blurAmount` / `intensity`, and `blurRadius` capped at 25). Also softens the wallpaper bitmap via React Native `Image` `blurRadius`. |
| Surface opacity | 12–92. Alpha written onto background semantic tokens. Sheets and the composer sit a little higher than the page. Hover and faint modifiers stay faint. |
| Accent highlight | 0–100. Alpha of the white specular rim on the input pill, header, tab bar, and sheets. |
| Tint | Match Discord’s theme, or force dark or light frost. |
| Image URL | `http` or `https` wallpaper. Empty uses the built-in indigo / teal / rose gradient. Any other scheme is ignored. |
| Reset | Restores the defaults above. |

The settings page also lists whether a blur view was found and which surfaces were patched in this session.

## What gets glass

Semantic colors are rewritten in `resolveSemanticColor` (the same hook Kettu’s theme engine patches, on `SemanticColor`’s `meta` or `internal` object). The token name is the string stored on the first symbol of the color object, which is how Kettu’s theme resolver reads it. Background tokens — `BACKGROUND_*`, `BG_*`, `CHAT_BACKGROUND`, `CHANNELTEXTAREA_BACKGROUND`, `KEYBOARD` — are returned as `rgba(...)`. Text, icons, links, scrollbars, spoilers, and button fills are left alone.

On top of that, these components are patched when the module is found. Paths were checked against Kettu’s current theme background patch and against the Discord 287.0 module index. Both paths are tried when they disagree.

| Surface | How |
| --- | --- |
| App shell | `TabsNavigator` / `MainTabs` / `AppComponents`, wrapped in the wallpaper |
| Chat background and message list | `modules/messages/native/Messages.tsx` (the file Kettu’s theme patch uses). The list node is the one with `HACK_fixModalInteraction`. If the shell patch missed, the chat grows its own wallpaper. |
| Home message list | `main_tabs_v2/.../tabs/messages/Messages.tsx` |
| Chat input | `modules/chat_input/native/ChatInput.tsx` — pill, rim, blur when the root is a host `View` |
| Header / nav | `ChannelHeader`, `MessagesHeader` — hairline rim and blur |
| Bottom tab bar | `YouTabBarBackground`, plus `useTabBarStyles` when that hook returns a plain style object (radius, rim, and a small inset when the style is already anchored to the bottom) |
| Server list | `GuildsBar` |
| Channel list | `RedesignChannelList` |
| Bottom sheets and action sheets | `ActionSheetPresenter`, and the `ActionSheet` export |
| Long-press menu | `LongPressMessageActionSheet` |
| Modals | `ModalScreen` |
| Settings | `SettingsNavigator` and the settings tab |
| Profile popout | `UserProfileActionSheet`, `UserProfileCard` |
| Context menus | `ContextMenu` export |
| Friends and You | `FriendsScreen`, `YouScreen` |

Lists and settings rely on the translucent tokens plus the wallpaper. Blur views are inserted only into host `View`s for the input, header, tab bar, and sheets, so a custom component that calls `Children.only` is not given extra children.

## Blur

Discord 287.0’s bundle contains:

- `modules/visual_effect_view/native/VisualEffectView.tsx`
- `VisualEffectViewIOS.tsx` / `VisualEffectViewAndroid.tsx`
- `modules/activities/panel/native/BlurVisualEffectView.tsx`

The plugin looks those up via `__filePath` on `window.modules` (Kettu stamps that while modules import) and, if needed, `findByName("VisualEffectView")`. It also asks `UIManager.getViewManagerConfig` / `hasViewManagerConfig` before `requireNativeComponent`, and only for names that are actually registered: `DCDVisualEffectView`, `VisualEffectView`, `RCTVisualEffectView`, `BlurView`, `AndroidBlurView`, `ExpoBlurView`. Calling `requireNativeComponent` for a missing name throws and can take the UI down; that call is skipped unless the view manager is registered, and it is still inside `try/catch`.

Prop names are taken from `validAttributes`, `propTypes`, `defaultProps`, or a readable `toString` (Hermes bytecode usually has none). Known names are mapped in `chooseBlurProps`. If nothing can be introspected, the fallback props are `blurAmount`, `blurType` (`dark` / `light`), and `overlayColor`. Android blur radius is never set above 25.

`BVLinearGradient` (or `RNLinearGradient` / `LinearGradient`) is used for the default wallpaper when that native view is registered. Otherwise the gradient is a stack of rounded views.

There is no `UIGlassEffect` / iOS 26 liquid-glass view in the module list that was checked. The plugin cannot add one.

## Unload

Every `after` patch is stored and called from `onUnload`. Retries are cleared. `ThemeStore`’s change listener is removed. A missing module is logged and skipped; it does not throw out of `onLoad`.

## Develop

```bash
npm install
npm test          # pure helpers, no Discord
npm run verify    # tests + production bundle + hash check
```

Source lives in `plugins/liquid-glass/`. `build.mjs` follows the Vendetta plugin template: Rollup, SWC (JSX classic runtime, ES2019), esbuild minify, IIFE whose free variables are `vendetta.*`. Entry is `src/index.ts` with `onLoad`, `onUnload`, and `settings`.

## Limits

- Not device-tested. Discord was not running here.
- File paths from Discord 287.0 can move. Kettu’s copy of `modules/messages/native/Messages.tsx` is the newer chat path and is the one this plugin prefers. Anything that isn’t found is listed in the plugin’s settings under “Not found in this Discord build”. Tokens still frost whatever uses semantic colors.
- A Kettu **color theme** patches the same `resolveSemanticColor`. This plugin re-wraps that function at 0s, 0.8s, 2.5s, and 6s, and again on the next theme change, so the glass alpha is the outer wrapper. A theme that replaces the method after that can win until the next re-wrap.
- Message bubbles, avatars, embeds, stickers, videos, and spoilers stay solid on purpose.
- Colors baked into a native screen, or into a `StyleSheet` number created before the plugin loaded and never re-read, will not pick up the token alpha. The chat list is also adjusted at render time when its background is a string.
- Android `VisualEffectView` often needs a blur-target prop this plugin could not confirm from public source. If the native view ignores unknown props, that platform shows the tint and rim instead of a real backdrop blur. iOS `UIVisualEffectView` blurs what is behind it without a target, which is the path most likely to look like glass.
- `Image` `blurRadius` blurs the wallpaper picture itself. It is not a backdrop blur.
- Several stacked blur views are expensive and, on some Android versions, have blanked the screen in other apps. Blur is limited to chrome (input, header, tab bar, sheets), not every row.
- The floating tab-bar inset only happens when `useTabBarStyles` returns a mutable style object that is already bottom-anchored. The tab-bar background view gets radius and a rim, not an extra margin, so the icons are not left outside the glass.
- No iOS 26 refraction, lensing, or interactive glass. Those are system APIs Discord has not exposed to plugins.

## What was verified

Verified here:

- Kettu’s Vendetta loader (`src/core/vendetta/plugins.ts`, `src/core/vendetta/api.tsx`): manifest fields, IIFE eval shape, `onLoad` / `onUnload` / `settings`, patcher, metro finders, storage proxy, Forms.
- Kettu’s theme resolver and chat background patch: `resolveSemanticColor` host, symbol-to-token-name, `HACK_fixModalInteraction`, `modules/messages/native/Messages.tsx`.
- Discord 287.0 module paths for `VisualEffectView`, tabs, chat input, guilds bar, channel list, action sheet presenter, profile sheet, settings navigator.
- `ThemeDarkIcon` as an asset name Kettu already looks up.
- `npm test` and `npm run verify`. The verify step also loads `dist/index.js` the way Kettu does (`vendetta => { return bundle }`) against a stub. With every metro lookup throwing, `onLoad` / `onUnload` do not throw. With a fake `resolveSemanticColor`, `BACKGROUND_PRIMARY` `#112233` at 40% opacity becomes `rgba(17, 34, 51, 0.4)` and `TEXT_NORMAL` is left as `#ffffff`.

Not verified:

- Rendering on a phone or emulator.
- The real prop list of `VisualEffectView` on a current Discord build (287.0 is older than the 331.x builds Kettu users report).
- Whether `__filePath` is already stamped for every screen at the moment the plugin starts. Retries cover late imports; a screen that never loads its module is only frosted through tokens.
- Whether `useTabBarStyles` still returns a plain object.
- Interaction with every installed theme and plugin.
