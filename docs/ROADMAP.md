# Roadmap — Overframe

**Model**: DonationWare — free forever, donation-supported  
**Platform**: Windows 10/11  

---

## Version Philosophy

Reconciled against local source `ce29252` on 2026-09-10. The package remains `0.2.0`; the local `v0.2.0` tag is `42008d7`, followed by Store groundwork, idle-memory improvements and AGENTS coordination on `dev`. Publication is recorded historically in DEVLOG, not reverified against GitHub here.

The milestone numbers below are the original planning buckets, not the release contents or a current delivery schedule. `[x]` means implementation is present in the inspected code, not that gaming, installation or release acceptance passed. Definitions of Done remain acceptance goals. Use [TASKS.md](../TASKS.md) for current priorities and [WORKFLOW.md](../WORKFLOW.md) for human approval boundaries.

```
v0.1 → v0.2 → v0.3   Alpha: core mechanics working
v0.5 → v0.6           Beta: feature-complete, UX polish
v1.0                  Public release: stable, documented
v1.x                  Post-launch: community-driven
```

---

## v0.1 — Alpha Core (Week 1–2)

**Goal**: Prove the overlay works. Nothing else matters until this is solid.

### Deliverables
- [x] Electron project scaffold (electron-vite + React + Tailwind + TypeScript)
- [x] Transparent, frameless, always-on-top BrowserWindow
- [x] Native Edge WebView2 tabs via `WebView2View` + C++ addon (replaced Electron `WebContentsView`)
- [x] Global hotkey `Alt+B` toggles window show/hide
- [x] State machine: HIDDEN → FOCUSED → CLICK-THROUGH → HIDDEN
- [x] Click-through mode via `setIgnoreMouseEvents(true, { forward: true })`
- [ ] Original permanent 10px drag-strip requirement — current implementation uses specific TabBar drag targets; product acceptance of the difference remains pending
- [x] Window resizable

Current core evidence: `OverlayWindow.ts`, `shortcutActions.ts`, `TabBar.tsx`. Automatic click-outside/inside transitions in the original acceptance flow below are not implemented; current click-through uses `Alt+C` and explicit UI controls. Hidden state uses immediate opacity/input changes followed by OS hide after 30 seconds.

### Definition of Done
> I can press `Alt+B` while playing a borderless windowed game, see a browser appear on top, interact with it, click outside to enter click-through mode (overlay stays visible but mouse passes to game), press `Alt+B` again to hide it. I can drag the overlay from its top strip while in click-through mode. No crash. No flicker.

---

## v0.2 — Alpha Browser (Week 3–4)

**Goal**: Make it a real browser, not just a WebView2 wrapper.

### Deliverables
- [x] Address bar (URL input + search fallback)
- [x] Back / Forward / Refresh buttons
- [x] Favicon + page title in tab
- [x] Multi-tab support (TabManager + TabBar UI)
- [x] New tab button
- [x] Close tab button
- [x] Tab switching
- [x] Basic navigation events wired to UI (loading indicator, URL updates)

### Definition of Done
> I can open multiple tabs, navigate between them, type URLs, and use browser navigation buttons.

---

## v0.3 — Alpha Persistence (Week 5–6)

**Goal**: Data survives across sessions.

### Deliverables
- [x] `electron-store` integration with typed schema (settings, profiles, collections)
- [ ] `better-sqlite3` history integration — dependency declared, no application DB/manager/IPC implementation
- [ ] History: record every page visit (URL, title, favicon, timestamp) via SQLite INSERT
- [ ] History panel UI (list + search)
- [x] **Link Collections**: create a collection, add/remove links, rename
- [x] Collections panel UI (list of collections + links within)
- [x] Pinned links quick-access bar (max 8, one-click access)
- [x] Window position/size persisted on close
- [x] Collection export as deflate-compressed Base64 JSON
- [x] Collection import from compressed or legacy Base64 JSON
- [x] Short-code sharing with network upload, preview/import and local Base64 fallback (`useCollectionShare.ts`, IPC handlers, `scripts/share-worker`); service deployment not revalidated

### Definition of Done
> My history and collections survive app restarts. I can create an "Elden Ring" collection, add links, export it as a Base64 string, clear it, and re-import it.

---

## v0.5 — Beta Personalization (Week 7–9)

**Goal**: Make the experience feel personal and polished.

### Deliverables
- [x] Opacity slider (20–100%) — keyboard shortcut + settings UI
- [x] Global hotkey configurator via uiohook, with in-app duplicate-binding warnings
- [ ] Detect shortcut conflicts with other applications (original requirement, not implemented)
- [x] System tray icon, Show/Hide, Quit, active-profile tooltip
- [ ] Tray Settings entry and active/hidden icon state (original requirements, not implemented)
- [x] Settings panel for implemented preferences; history retention remains pending
- [x] Start with Windows toggle
- [x] Per-game profiles: create, name, process-name/path matching and stored priority
- [ ] Confirm the original user-defined priority-order UI requirement; model/IPC priority support alone is not completion
- [x] Game detection and profile auto-switch: 5-second active / 15-second hidden-default polling
- [x] Conflict rule: highest-priority profile wins when multiple games detected
- [x] Tray tooltip shows active profile name
- [x] Default-profile fallback for a missing/deleted selected profile
- [ ] Original automatic return to default when no game remains — current `ProfileManager` keeps the last game profile
- [x] Donation links in UI; external page availability not checked

### Definition of Done
> I can create an "Elden Ring" profile, launch Elden Ring, and Overframe automatically switches to that profile's collections.

---

## v0.6 — Beta Polish (Week 10–11)

**Goal**: Zero obvious bugs. Real-world testing.

### Deliverables
- [ ] Anti-cheat disclaimer modal (first launch only) — not present in the current onboarding component
- [x] Three-step onboarding overlay; fresh-install human validation remains open
- [ ] Complete page-load/offline error UX; navigation watchdog, retry and process-failure handling exist in `TabManager`
- [ ] Validate WebView2 native context menu and integrate any missing Overframe actions (copy, paste, open in an Overframe tab)
- [x] Ctrl+T / Ctrl+W via global uiohook, Ctrl+L in the Electron renderer DOM; native WebView2 focus behavior still needs acceptance testing
- [ ] Validate monitor-change behavior; saved bounds and display clamping exist
- [ ] Meet performance targets: idle CPU < 2%, hidden RAM < 150MB / active < 300MB. Historical July audit reports ~256MB hidden for Electron alone; budget decision and complete WebView2-inclusive measurement remain open
- [x] Packaged non-Store update checks: boot/hourly plus manual; Store guards present. Real installed update validation remains open
- [x] Windows icon assets referenced by Forge and tray (`public/icons`); Store-specific submission assets are separate work

### Definition of Done
> Tested by 5 external users. No P0/P1 bugs. All core flows work without assistance.

---

## v1.0 — Public Release (Week 12)

**Goal**: Ship it.

### Deliverables
- [x] Squirrel `.exe` + Windows ZIP configuration; unsigned packaging run recorded in July DEVLOG. Fresh-machine installation remains open
- [x] MIT license file in repository
- [ ] Verify repository visibility and release download availability before delivery
- [x] README screenshots and setup instructions
- [ ] GIF/demo on a real game (human capture)
- [x] README FAQ: unsigned-packaging/download-source guidance, anti-cheat limitations and supported game modes
- [ ] Ko-fi / PayPal donation page live
- [ ] Release announcement (Reddit r/pcgaming, r/gaming, Discord gaming communities)

### Definition of Done
> Anyone can download, install, and use Overframe without reading any documentation.

---

## Post-Launch (v1.x) — Community-Driven

Original candidate priorities; timing, demand and scope require product review. Implemented short-code sharing has moved above.

| Version | Feature |
|---|---|
| v1.1 | Publisher starter collections (official Base64 bundles embeddable in game wikis) |
| v1.1 | Replace currently unavailable adblock integration; any reprioritization requires owner approval |
| v1.2 | Picture-in-Picture mode (mini compact view) |
| v1.2 | Search within current page (`Ctrl+F`) |
| v1.3 | Cloud sync (collections + profiles) — optional paid tier, privacy-first |
| v1.3 | Community collection directory (browse & install community-curated packs) |
| v1.4 | Custom CSS per site (gaming wiki cleanup profiles) |
| v1.4 | Hotkey presets per game (disable conflicting alt-key combos) |
| v1.5 | Code signing certificate — obtain current pricing and product approval |
| Unapproved proposal | macOS support — Windows-only remains binding until an explicit human decision, including after v1.0 |
| v2.0 | Plugin system (community widgets) |

---

## Current distribution work

Store update guards and [submission draft](store/listing.md) are in this source; `forge.config.ts` still configures Squirrel/ZIP only. Cached remote branch `feat/msix-packaging` contains separate packaging work; coordinate ownership before resuming it. No Store submission/publication is established by this review. New dependencies and all releases require human approval.

Implementation evidence for the checked items: `TabManager`, `AddressBar`, `TabBar`; `CollectionsManager`, `PinnedBar`, `SessionManager`, `store/index.ts`; `ProfileManager`, `ShortcutsSection`, `SettingsPanel`, `TrayManager`; `OnboardingOverlay`, `src/main/index.ts`, `forge.config.ts` and `README.md`.

## Known Hard Limits (Never Supported)

| Limitation | Reason |
|---|---|
| Fullscreen exclusive games | D3D exclusive mode bypasses desktop compositor — impossible without injection |
| Anti-cheat bypass | Out of scope, against ToS, ethical line |
| In-game process injection | Architectural decision: zero injection policy |

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Anti-cheat false positive reports | Medium | High | Clear disclaimer, user education, "competitive mode" (disable entirely; proposal, not implemented). Compatibility requires human testing |
| Z-order issues with specific game engines | Medium | Medium | Per-game workaround list in docs |
| Memory pressure on low-end machines | Low | High | Delayed OS hide/throttling, media pause and optional about:blank unload; suspendAll only stops in-flight loads. Complete memory evidence remains pending |
| Electron major version breaking change | Low | Medium | Pin minor Electron version, test before upgrade. Current declaration is `^33.0.0`; pinning remains unresolved |
| Low donation conversion | High | Low | Validate funding assumptions; no conversion or sustainability outcome measured here |
