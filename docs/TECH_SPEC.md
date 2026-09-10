# Technical Specification — Overframe

**Version**: 0.1  
**Date**: May 2026  
**Status**: Draft; implementation notes reconciled against `ce29252` on 2026-09-10

The document version is not the app version (`0.2.0`). Pending requirements remain proposals; source review does not establish runtime or gaming acceptance.

---

## 1. Tech Stack

Declared versions: [package.json](../package.json). Windows is the only supported product platform.

| Layer | Technology | Rationale |
|---|---|---|
| Runtime | **Electron 33** | Native OS APIs, IPC and always-on-top shell windows |
| Web renderer | **Microsoft Edge WebView2** | Native child windows via the N-API addon; replaces Electron WebContentsView |
| UI framework | **React 18** | Component model fits tab/panel architecture |
| Styling | **Tailwind CSS 3** | Rapid UI, dark-mode ready, no runtime overhead |
| Language | **TypeScript 5** | End-to-end type safety across main + renderer |
| Bundler | **Vite 5** | Fast HMR for renderer, electron-vite plugin |
| Build/Package | **electron-forge** | Squirrel installer for Windows, auto-update ready |
| Persistence (settings/profiles/collections/sessions) | **electron-store 8** | JSON file storage, defaults and migrations; no JSON Schema validator supplied |
| Persistence (history, proposed) | **better-sqlite3** | Dependency retained; no application history database or API is currently implemented |
| Process detection | **ps-list + koffi** | Process listing and native window/path inspection |
| Global shortcuts | **uiohook-napi** | Low-level keyboard hook, rather than Electron globalShortcut |
| IPC type safety | **Custom typed IPC bridge** | Preload + contextBridge, no raw ipcRenderer exposure |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    MAIN PROCESS                          │
│                                                          │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  │
│  │OverlayWindow│  │ShortcutManager│  │ProfileManager│  │
│  └──────┬───────┘  └───────┬───────┘  └──────┬───────┘  │
│         │                  │                  │          │
│  ┌──────▼──────────────────▼──────────────────▼───────┐  │
│  │                   IPC Router                        │  │
│  └──────────────────────┬────────────────────────────┘  │
│                         │                               │
└─────────────────────────┼───────────────────────────────┘
                          │ contextBridge (preload.ts)
┌─────────────────────────┼───────────────────────────────┐
│              RENDERER PROCESS (Shell UI)                 │
│                                                          │
│  ┌──────────────────────▼────────────────────────────┐  │
│  │                  React App                         │  │
│  │  TabBar | AddressBar | Sidebar | SettingsPanel     │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

Main → TabManager → WebView2View → native addon
┌─────────────────────────────────────────────────────────┐
│             WEB CONTENT LAYER (WebView2)                 │
│                                                          │
│   Tab 1: https://eldenring.wiki.fextralife.com/...       │
│   Tab 2: https://www.google.com                          │
│   Tab N: ...                                             │
└─────────────────────────────────────────────────────────┘
```

---

These are architectural layers, not a fixed OS-process count. The addon is owned by main, not the React renderer. It uses one shared WebView2 environment and one controller per tab; a separate process or cookie profile per tab is not guaranteed.

## 3. Process Architecture

### 3.1 Main Process (`src/main/`)

Runs in Node.js. Owns all OS-level operations.

**Responsibilities:**
- Create and manage the BrowserWindow (overlay shell)
- Register/unregister global shortcuts
- Set always-on-top level and click-through state
- Poll running processes for game detection
- Read/write settings, profiles, collections via electron-store
- Own native WebView2 tab controllers through TabManager
- Serve IPC requests from renderer

**Key Electron APIs used:**

```typescript
// Always-on-top at 'screen-saver' level (above most system UI)
win.setAlwaysOnTop(true, 'screen-saver')

// Transparent window
win.setBackgroundColor('#00000000')
// BrowserWindow option: transparent: true

// Click-through — forward mouse events to windows below
win.setIgnoreMouseEvents(true, { forward: true })

// Click-through OFF — user is interacting with overlay
win.setIgnoreMouseEvents(false)

// Window frameless
// BrowserWindow option: frame: false, transparent: true
```

Global shortcuts use `ShortcutManager` / `uiohook-napi`; defaults and actions are in `src/shared/types.ts` and `src/main/lifecycle/shortcutActions.ts`.

### 3.2 Renderer Process (`src/renderer/`)

Runs in Chromium. No direct Node.js access. All Node/OS operations go through `window.aether` → preload → IPC → main. Current shell/popups use `contextIsolation: true`, `nodeIntegration: false`, but `sandbox: false`; this is an isolation review item, not approval to weaken policy.

**Responsibilities:**
- Render the browser shell UI (tab bar, address bar, collections panel)
- Manage UI state (active tab, settings open/closed, etc.)
- Request data and actions from main process via IPC

### 3.3 Web content layer (Edge WebView2)

`TabManager` creates `WebView2View` wrappers. The addon creates `ICoreWebView2Controller` child windows of the overlay HWND using the system WebView2 runtime. Web tabs have no Electron preload, `contextBridge` or Node API. `NewWindowRequested` is routed through main into another Overframe tab; deferred popup completion supports opener relationships.

This replaces the earlier Electron `WebContentsView` design. Browser compatibility, sign-in, media and anti-cheat behavior still require runtime and human validation; native embedding alone does not prove them.

---

## 4. Directory Structure

```
overframe/
├── electron.vite.config.ts       # Vite config for main + preload + renderer
├── package.json
├── tsconfig.json
├── forge.config.ts               # electron-forge packaging config
├── native/webview2-addon/         # Native Edge WebView2 backend
│
├── src/
│   ├── main/                     # Main process (Node.js)
│   │   ├── index.ts              # Entry point
│   │   ├── windows/
│   │   │   ├── OverlayWindow.ts  # Overlay BrowserWindow creation & management
│   │   │   ├── TrayManager.ts    # System tray icon & menu
│   │   │   └── PopupWindow.ts    # Popup and companion windows
│   │   ├── managers/
│   │   │   ├── ShortcutManager.ts # uiohook shortcut registration
│   │   │   ├── TabManager.ts     # WebView2 lifecycle per tab
│   │   │   ├── tabs/WebView2View.ts # Native addon wrapper
│   │   │   ├── ProfileManager.ts # Game profiles + process detection
│   │   │   ├── SessionManager.ts # Per-profile session save/restore
│   │   │   └── CollectionsManager.ts # Collections CRUD and sharing
│   │   ├── ipc/
│   │   │   └── handlers.ts       # All IPC handler registrations
│   │   └── store/
│   │       └── index.ts          # electron-store interface, defaults, migrations
│   │
│   ├── preload/                  # Preload scripts (contextBridge)
│   │   └── index.ts              # Exposes typed API to renderer
│   │
│   ├── shared/                   # Types and IPC channel constants
│   └── renderer/                 # React app (Chromium)
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── TabBar.tsx
│       │   ├── AddressBar.tsx
│       │   ├── CollectionBar.tsx
│       │   ├── CollectionsPanel.tsx
│       │   ├── SettingsPanel.tsx
│       │   └── ...
│       ├── hooks/
│       │   ├── useCollectionShare.ts
│       │   └── useGameDetect.ts
│       └── store/
│           ├── appStore.ts       # Zustand store for UI state
│           └── missionsStore.ts
│
└── docs/
    ├── PRD.md
    ├── TECH_SPEC.md
    └── ROADMAP.md
```

---

## 5. IPC Contract

All communication between renderer and main process is typed end-to-end. This does not validate runtime inputs: declare channels in `src/shared/ipc.ts` and validate arguments in main handlers before processing. Never expose raw `ipcRenderer` to the renderer.

The excerpt below shows selected methods; [src/preload/index.ts](../src/preload/index.ts) is the full contract. There is no current history API.

### Pattern

```typescript
// preload/index.ts
contextBridge.exposeInMainWorld('aether', {
  // Tabs
  tabs: {
    create: (url?: string) => ipcRenderer.invoke(IPC.TabsCreate, url),
    close: (tabId: string) => ipcRenderer.invoke(IPC.TabsClose, tabId),
    navigate: (tabId: string, url: string) => ipcRenderer.invoke(IPC.TabsNavigate, tabId, url),
    goBack: (tabId: string) => ipcRenderer.invoke(IPC.TabsGoBack, tabId),
    goForward: (tabId: string) => ipcRenderer.invoke(IPC.TabsGoForward, tabId),
    setActive: (tabId: string) => ipcRenderer.invoke(IPC.TabsSetActive, tabId),
  },
  // Overlay
  overlay: {
    setOpacity: (value: number) => ipcRenderer.invoke(IPC.OverlaySetOpacity, value),
    requestClickThrough: () => ipcRenderer.send(IPC.OverlayRequestClickThrough),
    leaveClickThrough: () => ipcRenderer.send(IPC.OverlayLeaveClickThrough),
  },
  // Link Collections
  collections: {
    getAll: () => ipcRenderer.invoke(IPC.CollectionsGetAll),
    create: (collection: NewCollection) => ipcRenderer.invoke(IPC.CollectionsCreate, collection),
    remove: (id: string) => ipcRenderer.invoke(IPC.CollectionsRemove, id),
    rename: (id: string, name: string) => ipcRenderer.invoke(IPC.CollectionsRename, id, name),
    addLink: (collectionId: string, link: NewLink) => ipcRenderer.invoke(IPC.CollectionsAddLink, collectionId, link),
    removeLink: (collectionId: string, linkId: string) => ipcRenderer.invoke(IPC.CollectionsRemoveLink, collectionId, linkId),
    export: (id: string) => ipcRenderer.invoke(IPC.CollectionsExport, id),   // returns Base64 string
    import: (base64: string, profileId: string) => ipcRenderer.invoke(IPC.CollectionsImport, base64, profileId),
  },
  // Profiles
  profiles: {
    getAll: () => ipcRenderer.invoke(IPC.ProfilesGetAll),
    getCurrent: () => ipcRenderer.invoke(IPC.ProfilesGetCurrent),
    create: (profile: NewProfile) => ipcRenderer.invoke(IPC.ProfilesCreate, profile),
    setActive: (id: string) => ipcRenderer.invoke(IPC.ProfilesSetActive, id),
  },
  // Settings
  settings: {
    get: () => ipcRenderer.invoke(IPC.SettingsGet),
    set: <K extends keyof Settings>(key: K, value: Settings[K]) => ipcRenderer.invoke(IPC.SettingsSet, key, value),
  },
  // Main → Renderer events
  on: {
    tabUpdated: (cb: (tab: TabState) => void) => {
      const listener = (_e: unknown, tab: TabState): void => cb(tab)
      ipcRenderer.on(IPC.EventTabUpdated, listener)
      return () => ipcRenderer.removeListener(IPC.EventTabUpdated, listener)
    },
    // Other subscriptions follow the same cleanup pattern.
  }
})
```

---

## 6. Data Models

### electron-store Schema (`src/main/store/index.ts`)

Stores settings, profiles, link collections and sessions in `aether-store.json` under `app.getPath('userData')`, not the Squirrel installation directory `%LOCALAPPDATA%\Overframe`. The schema is a TypeScript interface plus defaults/migrations, not a supplied JSON Schema validator. Persisted schema changes require migration/backward-compatibility consideration and human authority under WORKFLOW.

Selected fields are shown below; full models are in [src/shared/types.ts](../src/shared/types.ts). Profiles and collections have additional optional artwork, creator, section and detection fields.

```typescript
interface AetherStoreSchema {
  settings: Settings        // shortcuts map; fresh startWithWindows default: true
  sessions: Record<string, ProfileSession>
  sessionDirty: boolean
  profiles: Profile[]
  collections: Collection[]
}

interface Profile {
  id: string
  name: string
  processNames: string[]      // e.g. ['eldenring.exe']
  priority: number            // conflict resolution: higher = wins
  homepageUrl?: string
  opacity: number             // 0.2 - 1.0
  windowBounds: { x: number; y: number; width: number; height: number }
}

// Link Collections — replaces simple bookmarks
interface Collection {
  id: string
  name: string                // e.g. "Elden Ring Starter Pack"
  profileId: string | 'shared' // 'shared' = visible in all profiles
  source: 'user' | 'publisher' | 'community'
  links: Link[]
  createdAt: number
  updatedAt: number
}

interface Link {
  id: string
  title: string
  url: string
  note?: string               // short description (optional)
  favicon?: string            // URL or data URI
  pinned: boolean             // appears in quick-access bar
  order: number               // sort order within collection
  section?: string
}

// Export/Import payload (deflate-compressed JSON encoded as Base64)
interface CollectionExport {
  version: 1
  name: string
  source: 'user' | 'publisher' | 'community'
  links: Array<Pick<Link, 'title' | 'url' | 'note' | 'pinned' | 'favicon' | 'section'>>
}
```

### SQLite Schema (history, proposed)

History remains a product requirement, not an implemented feature. No application history manager, database creation/read/write path or preload API exists under `src/`; `better-sqlite3` remains a dependency. The original DDL below is proposed design only.

```sql
CREATE TABLE history (
  id        TEXT PRIMARY KEY,
  url       TEXT NOT NULL,
  title     TEXT,
  favicon   TEXT,          -- data URI or null
  visited_at INTEGER NOT NULL  -- Unix timestamp ms
);
CREATE INDEX idx_history_visited_at ON history(visited_at DESC);
CREATE INDEX idx_history_url ON history(url);
```

The proposed history implementation would use `better-sqlite3`; no history file is currently created by application code.

### Runtime tab state

```typescript
interface TabState {
  id: string
  url: string
  title: string
  favicon: string | null
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  zoomFactor: number
  isAudioPlaying: boolean
  isMuted: boolean
}
```

### Sessions and tab state

[SessionManager.ts](../src/main/managers/SessionManager.ts) saves only HTTP(S) tabs in display order: URL, title, favicon, active index and timestamp. Runtime `TabState` additionally includes loading/navigation flags, `zoomFactor`, audio and mute state. **Zoom is not persisted in sessions.**

Restore creates lazy tabs and activates the saved active tab. `onFirstShow` defers initial restoration; ordinary launch shows immediately, while `--hidden` defers it. Saves occur every 15 seconds, after tab removal with a 300 ms debounce, before profile switch, and at quit. Bounds have a separate 500 ms debounce.

**Unresolved implementation gaps:** zoom persistence and crash-recovery UI must not be described as complete. Autosave and quit save are not gated on first restoration: a `--hidden` launch can overwrite the previous session before it is shown. Hidden profile switches also defer restoration while autosave continues. These paths require a code fix and regression verification, outside this documentation-only change.

Collection sharing sends exported fields, including optional notes/creator metadata/artwork. The UI first requests a network short code, falling back to local compressed Base64; imports also accept legacy uncompressed Base64. See `CollectionsManager.ts`, `useCollectionShare.ts` and SECURITY.md for worker retention and network limits.

WebView2 cookies/site storage use the addon's `%APPDATA%\Overframe\WebView2` directory; Electron logs use `app.getPath('userData')/logs`. Renderer localStorage is separate from the main JSON store. `sessionDirty` has no recovery reader in current code.

---

## 7. Overlay Window Behavior

### State Machine

```
HIDDEN ◄── Alt+B ──► FOCUSED or previous CLICK_THROUGH state
FOCUSED ◄── Alt+C ──► CLICK_THROUGH
```

Current transitions use explicit click-through actions, not automatic outside/inside clicks. The permanent 10px drag-strip requirement is not implemented; renderer hit-testing enables specific UI/drag regions, and hidden windows have no always-clickable strip. See PRD §5.1 for the unresolved interaction requirements.

### Always-on-Top Level

The visible overlay uses `setAlwaysOnTop(true, 'screen-saver')`; hiding clears always-on-top. Borderless windowed gaming is the supported use case, with runtime compatibility still requiring human validation.

### Window Transparency

```typescript
new BrowserWindow({
  transparent: true,
  frame: false,
  backgroundColor: '#00000000',
  hasShadow: false,
  // ...
})
```

The entire BrowserWindow opacity is controlled via `win.setOpacity(value)`. The intended effect includes shell and web content; native content and companion-window appearance require Windows runtime verification. Below 20% opacity the window is considered unusable and the slider is hard-floored at 0.2. This is the intentional design: the overlay fades as a whole, allowing the user to tune game visibility vs content readability according to their preference.

---

## 8. Game Detection

[ProfileManager.ts](../src/main/managers/ProfileManager.ts) polls `ps-list`, matches profiles, and uses [getVisibleGames.ts](../src/main/utils/getVisibleGames.ts) with native window/process inspection for game discovery and disambiguation. It respects detection settings, exclusions and manual overrides. Native inspection uses `koffi`; the old process-name-only pseudocode did not describe this implementation.

Poll intervals are 5 seconds active and 15 seconds idle. `index.ts` requests idle polling when hiding with the default profile; visible state and detected games restore active polling. Protected-domain tabs can survive profile switches. These mechanisms need gaming and multi-monitor validation, not just unit tests.

---

## 9. Security Model

| Concern | Mitigation |
|---|---|
| Renderer XSS | `contextIsolation: true`, no direct Node access |
| Web content privilege escalation | Web content must remain sandboxed and isolated from Electron privileges; WebView2 tabs have no Electron preload or Node bridge. Effective runtime isolation remains to be verified |
| Navigation to `file://` | Validate renderer URL requests in main; native `NavigationStarting` permits http/https/about |
| New window popups | `NewWindowRequested` → `TabManager.handlePopup`, http/https only, opened as Overframe tabs |
| Data exfiltration | No analytics/telemetry; existing egress includes sharing, updates, renderer news/assets/favicons and web browsing. Do not silently expand exceptions |
| IPC parameter injection | Validate all IPC inputs in handlers before processing |

Current `sandbox: false`, permissive shell CSP and incomplete IPC validation remain static findings, not approved exceptions or reproduced exploits. See [SECURITY.md](../.claude/guides/SECURITY.md) for requirements, code evidence and the network inventory.

---

## 10. Performance Considerations

### Render Suspension

- On hide, `pauseAllMedia()` attempts to pause HTML media. Normal `suspendAll()` only stops in-flight loads; it does not call WebView2 `TrySuspend` or guarantee loaded-page JavaScript stops.
- Performance mode navigates loaded, unprotected tabs to `about:blank`; controllers remain alive. Show reloads unloaded/stopped pages. Protected domains and lazy tabs are skipped by unload.
- After 30 seconds hidden, `OverlayWindow` performs OS hide and enables shell background throttling. Main releases IG promo/achievement companion windows; they can be recreated lazily.
- The one-second memory broadcast runs only while visible. Detection switches between 5/15-second polling as described above.
- Startup and restored inactive tabs load lazily. This does not imply the whole app makes zero startup requests.

### Memory Budget

Targets/planning estimates, not measured costs. The active total follows PRD's 300 MB target; the previous 330 MB figure conflicted with it.

| Component | Target |
|---|---|
| Main process | ~30MB |
| Shell renderer | ~50MB |
| Per web tab | ~60MB |
| Total (1 tab, hidden) | < 150MB |
| Total (3 tabs, active) | < 300MB |

`TabManager.getMemorySnapshot()` sums Electron `app.getAppMetrics()` values, preferring `privateBytes` and falling back to `workingSetSize`. Native Edge/WebView2 memory is absent; each tab reports `privateKb: 0`. `/metrics` therefore cannot prove whole-product RAM meets budget. Its `withinBudget` uses `<=` on rounded MB, unlike the strict `<` targets.

The DEVLOG entry dated 2026-07-19 recorded about 256 MB after deep hide, already above the idle target. That is historical evidence, not a new measurement or authority to raise the target. Full process-tree measurement and any budget change remain open. See [PERFORMANCE.md](../.claude/guides/PERFORMANCE.md).

### Startup Optimization

- Initial session restoration waits for first show; normal startup shows immediately, while `--hidden` defers it.
- Restored inactive tabs load on activation. There is no implemented history panel; lazy tabs do not imply zero startup traffic.

Other targets remain <2% idle CPU, <100 ms hotkey response and <3 s cold start; current memory instrumentation does not measure them.

---

## 11. Build & Packaging

```typescript
// Selected forge.config.ts options; see that file for the full configuration.
{
  packagerConfig: {
    name: 'Overframe',
    executableName: 'overframe',
    icon: 'public/icons/icon',
    extraResource: ['public/icons', 'native/webview2-addon/build/Release/webview2_addon.node'],
    win32metadata: {
      ProductName: 'Overframe',
      CompanyName: 'Overframe',
    }
  },
  makers: [
    new MakerSquirrel({ name: 'Overframe', exe: 'overframe.exe', setupExe: 'Overframe-Setup.exe' }),
    new MakerZIP({}, ['win32'])
  ]
}
```

**Output**: Windows Squirrel `.exe` installer and ZIP under `dist/`. User-space installation still requires fresh-machine validation.

`pnpm build` rebuilds JavaScript only; `pnpm build:addon` rebuilds native code. `pnpm make` runs both before Forge. The addon ships as an extra resource. Current makers do not include Store/MSIX packaging; `docs/store/listing.md` is submission groundwork. Human dependency, merge and release authority remains binding; never publish releases or release-triggering tags automatically.

---

## 12. Auto-Update

Using `update-electron-app` (wraps Electron's built-in autoUpdater):
- Packaged non-Store builds check on startup and hourly; dev builds do not self-update
- Silent download + install on next launch or deliberate restart-to-update
- `ensureUpdater()` in `handlers.ts` provides status and a one-shot Windows notification; no forced restart during play

```typescript
import { updateElectronApp } from 'update-electron-app'
if (app.isPackaged && !process.windowsStore) {
  updateElectronApp({ updateInterval: '1 hour', notifyUser: false })
  ensureUpdater()
}
```

The startup and manual-check paths guard `process.windowsStore`, but `AppRestartToUpdate` checks only `app.isPackaged`; that inconsistency remains a code finding. This records source behavior, not a verified installed update cycle.
