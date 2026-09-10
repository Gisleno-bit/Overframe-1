# Product Requirements Document — Overframe

**Version**: 1.0  
**Date**: May 2026  
**Status**: Draft requirements; implementation notes reconciled 2026-09-10 against `ce29252`

The document version is not the package version (`0.2.0`). Requirements and success targets below remain product goals unless marked implemented; this review does not establish runtime or gaming acceptance. Open differences are tracked in [TASKS.md](../TASKS.md).

---

## 1. Executive Summary

Overframe is a desktop overlay browser for Windows gamers. It renders a fully functional Chromium-based web browser as a transparent, always-on-top window above any borderless windowed game. The user toggles the overlay with a global hotkey, instantly switching between game focus and browser focus without Alt+Tabbing.

---

## 2. Problem Statement

### The Pain

Every gaming session generates information needs: finding a build, checking a quest guide, looking up a crafting recipe, watching a mechanic tutorial. The current universal solution is **Alt+Tab** — a context switch that breaks immersion, minimizes the game, and reloads assets on some engines.

### Why Existing Solutions Fail

The May 2026 comparison and uniqueness claim below are historical hypotheses, not current verified competitor facts. Validate them through separate research before reusing them in public copy.

| Solution | Failure Mode |
|---|---|
| Alt+Tab | Breaks immersion, slow on some games, minimizes everything |
| Steam Overlay Browser | Limited, no real navigation, Steam-exclusive |
| Overwolf | Heavy (500MB+), intrusive SDK, process injection, poor reputation |
| Second monitor | Hardware requirement, not accessible |
| Phone | Separate device, small screen, attention split |
| Discord mini-browser | Not designed for gaming contexts, no favorites |

### The Gap

No lightweight, universal, non-intrusive overlay browser exists for PC gaming. Overframe fills this gap.

---

## 3. Target Users

### Primary — The Active Gamer

- Age: 16–35
- Plays 2h+ per session
- Regularly consults wikis, tier lists, guides during play
- Does not have a second monitor
- Technically comfortable but not a developer

### Secondary — The Competitive Player

- Consults lineups, callouts, settings between rounds
- Needs speed: overlay opens/closes in under 100ms
- Concerned about anti-cheat — needs clear disclosure

### Non-target

- Casual mobile gamers
- Console players
- Users wanting to embed browser in a specific game (requires SDK/plugin approach)

---

## 4. User Stories

### Core Flow

| ID | As a... | I want to... | So that... |
|---|---|---|---|
| US-01 | gamer | press a hotkey to open the browser overlay | I don't need to Alt+Tab out of my game |
| US-02 | gamer | press the same hotkey to hide the overlay | the browser disappears and my game regains focus |
| US-03 | gamer | type a URL or search term in the address bar | I can navigate to any page |
| US-04 | gamer | move and resize the overlay window freely | I can position it where it doesn't block critical game UI |
| US-05 | gamer | click outside the overlay | my mouse and keyboard return to the game (click-through) |

### Browsing

| ID | As a... | I want to... | So that... |
|---|---|---|---|
| US-06 | gamer | open multiple tabs | I can keep a guide and a wiki open simultaneously |
| US-07 | gamer | see my browsing history | I can quickly return to a page I visited earlier |
| US-08 | gamer | save bookmarks | I can instantly access my most-used gaming resources |
| US-09 | gamer | name and organize bookmarks | I can find them quickly |

### Personalization

| ID | As a... | I want to... | So that... |
|---|---|---|---|
| US-10 | gamer | adjust overlay opacity | it blends better with my game visual |
| US-11 | gamer | configure the global hotkey | it doesn't conflict with my game bindings |
| US-12 | gamer | create profiles per game | my Elden Ring bookmarks don't mix with my Minecraft bookmarks |
| US-13 | gamer | have the app auto-detect my running game | the right profile loads automatically |

### System

| ID | As a... | I want to... | So that... |
|---|---|---|---|
| US-14 | gamer | have Overframe start with Windows | it's always ready without manual launch |
| US-15 | gamer | see a tray icon | I can access settings without disrupting my game |
| US-16 | gamer | click a donation button | I can support the developer if I enjoy the tool |

---

## 5. Feature Specifications

### 5.1 Overlay Window

**Behavior:**
- Always-on-top, floating window (not attached to any game process)
- Default size: 900×600px. The original right-side placement requirement is not implemented: `src/main/store/index.ts` seeds `(100, 100)`; `OverlayWindow.clampToDisplay()` constrains saved bounds to a display.
- Freely draggable by a thin title bar / drag handle
- Freely resizable from any edge/corner
- Persists position and size between sessions

**Toggle states:**
- `HIDDEN` — window invisible, game has full control
- `VISIBLE+FOCUSED` — browser focused, user interacts with it, game receives no input
- `VISIBLE+CLICK-THROUGH` — overlay visible as a transparent layer, `setIgnoreMouseEvents(true, {forward: true})`, game receives all mouse/keyboard input

**Required transitions (original interaction design):**
- `HIDDEN → VISIBLE+FOCUSED` : press global hotkey
- `VISIBLE+FOCUSED → VISIBLE+CLICK-THROUGH` : click outside the overlay panel bounds
- `VISIBLE+CLICK-THROUGH → VISIBLE+FOCUSED` : click inside the overlay panel bounds
- `VISIBLE+* → HIDDEN` : press global hotkey

**Implementation gap:** current transitions use the `Alt+C` shortcut / explicit UI controls, not automatic outside/inside clicks. `show()` also restores the preceding click-through state after hiding. These differ from the requirements above and need product acceptance (`OverlayWindow.ts`, `shortcutActions.ts`, `TabBar.tsx`).

**Drag zone requirement:** a permanent 10px strip should allow dragging during click-through. The current UI uses specific drag targets in `TabBar.tsx`; `DRAG_ZONE_HEIGHT = 10` remains a constant without a corresponding permanent strip. Preserve the requirement pending a product decision.

### 5.2 Global Hotkey

- Default: `Alt+B`
- Configurable via settings panel
- Implemented by `uiohook-napi` (`WH_KEYBOARD_LL`) in `ShortcutManager`, with keyboard-layout mapping; in-game behavior still requires human validation
- Settings warn about duplicate bindings inside Overframe (`ShortcutsSection.tsx`). Detecting a binding used by another application remains an unmet requirement; this is not Electron `globalShortcut` registration.

### 5.3 Web Renderer

- Uses Microsoft Edge WebView2 via `native/webview2-addon` and `WebView2View`; Electron renders the application UI
- Web compatibility target: JavaScript, cookies, localStorage, WebGL. Google login and Cloudflare/Turnstile still require real-user acceptance tests
- Uses the installed WebView2 runtime identity; the former Electron `tabStealth`/UA-spoofing implementation has been removed
- Requirement: no forced tracking/ad injection, no analytics or telemetry. Existing Instant Gaming promotion/affiliate behavior and remote resources are documented in the [security guide](../.claude/guides/SECURITY.md); they must not be described as zero network activity
- Requirement: respect site CSP headers as-is, without bypassing site security. Web pages have no Electron preload or Node bridge; the Electron UI CSP is a separate surface. The existing promotions/affiliate behavior needs assessment against the requirement above; documenting it does not approve a policy exception.

### 5.4 Navigation UI

Elements in the browser chrome:
- Back / Forward buttons
- Refresh button
- Address bar (URL input + search fallback to configurable engine, default: Google)
- Favicon display
- Loading indicator
- Tab bar (multi-tab)
- Settings button
- Donation shortcut button

### 5.5 History — pending implementation

The following requirements are not implemented in the current source. `better-sqlite3` is declared as a dependency, but no application history database, manager, IPC or panel is present. WebView2 back/forward events are not a persistent searchable history feature.

- Stores: URL, title, favicon, timestamp
- Searchable via text input
- No hard entry limit (managed by SQLite efficiently)
- Clearable (full clear or by date range)
- Persisted locally via **SQLite** (`better-sqlite3`) — local file only, never transmitted, no server
- Rationale: SQLite handles frequent INSERT operations efficiently; JSON-based storage rewrites the entire file on every visit

### 5.6 Link Collections

> **Renamed from "Bookmarks"** — the concept is more powerful than simple favorites.

A **Link Collection** is a curated, named list of URLs associated with a game profile. Think of it as a "starter pack" for a specific game.

**Structure:**
- Collection has: `name`, `profileId`, `source` (`user` | `publisher` | `community`), ordered links; optional description, creator signature, images and sections (`src/shared/types.ts`)
- Each link has: `title`, `url`, `note` (optional), `favicon`

**v1.0 — User collections:**
- Create, rename, delete collections
- Add/remove/reorder links within a collection
- Pin up to 8 links in a quick-access bar (one-click access)
- Collections are scoped by `profileId`; the value `'shared'` makes the entire collection visible in every profile

**v1.0 — Export/Import:**
- Local export is **deflate-compressed JSON encoded as Base64**; import also accepts the legacy uncompressed Base64 format (`CollectionsManager.ts`)
- The Share UI first attempts a network short code and falls back to the local export if unavailable (`useCollectionShare.ts`). Short-code preview/import retrieves collection data from the share API; Base64 import works offline
- Sharing sends the exported collection payload, including its links, notes and any creator signature/images, to the configured share service. The versioned worker sets a 90-day KV expiration; live deployment and deletion operations are not verified here
- Intended for community sharing (paste on Reddit, Discord, wikis)

**Future (v1.x):**
- Game publishers can ship an **official starter collection** (distributed as a Base64 string embedded in their wiki/website)
- Community collection directory (opt-in, server-side)
- Per-collection update mechanism (publisher pushes a new version via updated Base64)

### 5.7 Per-Game Profiles

- A profile contains: link collections, default homepage, opacity preference, window position/size
- Profile linked to one or more **process names** (e.g., `eldenring.exe`, `Minecraft.Windows.exe`)
- Detection uses `ps-list` and Win32 game-window/path helpers: 5-second active polling, 15 seconds when hidden on the default profile (`ProfileManager.setPollMode`, `src/shared/types.ts`). No game-process injection is part of this implementation
- Manual profile switching available as fallback
- Original requirement: return to the default profile when no game is detected. Current code deliberately keeps the last game profile at game close (`ProfileManager.ts:492–501`); `getActive()` falls back to default only if the selected ID is missing. Product acceptance of this difference remains pending
- **Conflict rule:** after process-name/path disambiguation, highest `priority` wins among matches. The original user-defined priority-order requirement remains to be confirmed in the UI; storage and IPC support alone do not complete it. The tray tooltip displays the active profile (`ProfileManager.ts`, `TrayManager.ts`)

### 5.8 Opacity Control

- Controls the **entire window** opacity (shell + web content) via `win.setOpacity()`
- Slider: 20% → 100% (below 20% is considered unusable, hard floor)
- Persisted per profile
- Quick-access defaults: global `Ctrl+Shift+Down` (decrease) / `Ctrl+Shift+Up` (increase), in 5% steps (`DEFAULT_SHORTCUTS`, `shortcutActions.ts`)
- Note: web content becomes semi-transparent along with the shell — this is the intended behavior for a game overlay context where full readability is traded for game visibility

### 5.9 System Tray

- Implemented: tray icon, active-profile tooltip, Show/Hide and Quit menu entries, double-click toggles the overlay (`TrayManager.ts`)
- Pending requirements: distinct active/hidden icon state and Settings menu entry; neither is wired in the current tray implementation

### 5.10 Settings Panel

Accessible from the browser chrome; access via tray remains pending:
- Hotkey configuration
- Startup with Windows toggle
- Default search engine
- History retention limit — pending with the history feature
- Profile management
- Donation link
- Version info + update check

---

## 6. Non-Functional Requirements

### Performance

| Metric | Target |
|---|---|
| Hotkey response time | < 100ms |
| Cold start time | < 3 seconds |
| Idle RAM (hidden) | < 150MB |
| Active RAM | < 300MB |
| CPU idle | < 2% |

These are targets, not measured guarantees. The 2026-07-19 DEVLOG reports ~256 MB hidden after deep-hide, above the 150 MB target. `/metrics` sums Electron process memory and excludes the Edge WebView2 processes (`TabManager.getMemorySnapshot`); it cannot establish total-product RAM compliance. Keep the 150/300 MB targets until the owner approves a budget decision, supported by consistent measurements. Deep-hide now occurs after a 30-second grace period; verify both quick toggles and reopening after that point.

### Compatibility

- Windows 10 (21H2+) and Windows 11
- Games in **borderless windowed** mode only (documented limitation)
- Screen resolutions: 1080p minimum, 4K supported

### Security

- Electron UI windows use `contextIsolation: true` and `nodeIntegration: false`; all OS operations must cross the declared preload/IPC bridge
- WebView2 content must remain isolated from Electron privileges: no Electron preload, Node bridge or host object is installed on tabs
- Requirement: web content must remain sandboxed. The current WebView2 backend does not use Electron `webPreferences`; its effective runtime isolation needs appropriate verification. Electron UI windows currently set `sandbox: false`; the [security guide](../.claude/guides/SECURITY.md) records this and the separate CSP policy conflicts without approving them
- Preload scripts only for explicit IPC bridges; main-side runtime validation is required
- No external telemetry, no analytics
- The original local-only/no-transmission wording conflicts with implemented sharing and remote resources; resolve that product/privacy wording explicitly. Settings, profiles and sessions persist locally. Collection short-code sharing transmits user-selected data; browsing, updates, release news, favicons and promotion assets also use the network. Existing exceptions must not silently expand

### Reliability

- App must not crash on game launch/close detection failure
- Overlay must restore correct position after monitor configuration changes
- Settings writes are atomic (no data loss on crash)

---

## 7. Out of Scope (v1.0)

- macOS / Linux support
- Full-screen exclusive game support (technically impossible without injection)
- Replacement ad blocker: existing uBlock integration is unavailable and its Settings toggle is disabled. Reprioritize through TASKS; do not market working ad blocking
- Cloud sync of collections/profiles (future proposal; distinct from implemented collection short-code sharing)
- Screenshot/clip capture
- Extensions/plugin system
- Full streaming-media control suite remains out of scope; existing per-tab mute/audio indicators and hide-related media behavior are already implemented
- Mobile companion app
- Code signing certificate (MVP packaging is unsigned; README explains the signing limitation and download-source checks)
- Publisher/community collection directory (v1.x — requires server infrastructure)

---

## 8. Success Metrics

These are original targets, not reported outcomes. Install/session/crash metrics have no product telemetry measurement pipeline; any measurement plan must preserve the no-telemetry policy and receive product approval. No usage figures are inferred from the code.

| Metric | Target (3 months post-launch) |
|---|---|
| GitHub stars | 500+ |
| Active installs | 1,000+ |
| Donation conversion | 2-5% of active users |
| Crash-free sessions | 98%+ |
| Avg. session with overlay | 15+ min |
