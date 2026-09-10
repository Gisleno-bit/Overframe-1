# Overframe — Claude Code Guide

## What This Project Is

Overframe is a **Windows-only Electron desktop app** — a lightweight transparent browser overlay for gamers. Press `Alt+B` (configurable) to toggle an Electron shell with Edge WebView2 tabs over borderless windowed games without Alt+Tabbing. It supports per-game profiles, tab sessions, link collections, global hotkeys, and system tray integration.

---

## Starting the App

```bash
# Install deps (compiles native modules — requires VS Build Tools 2022)
pnpm install

# Dev mode with hot reload
pnpm dev

# Type-check both processes
pnpm typecheck

# Lint
pnpm lint

# Run tests
pnpm test

# Build for production
pnpm build

# Package as Windows installer → dist/
pnpm make
```

**To launch and observe the running app**, follow WORKFLOW and coordinate runtime ownership first. The repository has no `/run` or `/verify` command; `pnpm dev` and the Observer provide the documented workflow. After native C++ changes, run `pnpm build:addon` before runtime QA; `pnpm build` alone rebuilds JavaScript.

The landing page (Next.js, separate workspace) runs with `pnpm landing`.

---

## Architecture — Main, Shell and Web Content

```
Main Process (Node.js)
  ├─ Managers: TabManager, ProfileManager, CollectionsManager, SessionManager, ShortcutManager
  ├─ electron-store (persistent JSON: profiles, collections, settings)
  ├─ TabManager → WebView2View → native WebView2 addon (owned by main)
  └─ IPC handlers (src/main/ipc/)
           ↕ contextBridge (src/preload/index.ts)
Renderer Process (React + Zustand)
  ├─ window.aether.* — the entire IPC API surface
  └─ src/renderer/store/ — Zustand stores (appStore, missionsStore)
Web tabs are controlled by main, not directly by the React renderer.
Web Content Layer
  └─ Microsoft Edge WebView2 controllers — Edge processes, no Electron preload or Node access
```

**Rule:** The renderer has zero Node.js access. Every OS operation goes through `window.aether.*` → preload → IPC handler → main process manager.

---

## Key Files — Read These First

| File | What it does |
|---|---|
| [src/main/index.ts](src/main/index.ts) | App lifecycle, manager initialization, event wiring |
| [src/preload/index.ts](src/preload/index.ts) | Full IPC API surface exposed to renderer (`window.aether`) |
| [src/renderer/App.tsx](src/renderer/App.tsx) | React root, IPC subscriptions, event listeners |
| [src/renderer/store/appStore.ts](src/renderer/store/appStore.ts) | Central Zustand store (tabs, profiles, collections, UI state) |
| [src/main/managers/TabManager.ts](src/main/managers/TabManager.ts) | WebView2 tab lifecycle, navigation, zoom, mute, downloads |
| [src/main/managers/ProfileManager.ts](src/main/managers/ProfileManager.ts) | Game detection via ps-list/native inspection; 5s active / 15s idle polling |
| [src/main/store/index.ts](src/main/store/index.ts) | Store interface, defaults and migrations (no JSON Schema validator supplied) |
| [src/shared/types.ts](src/shared/types.ts) | All shared TypeScript types (TabState, Profile, Collection, etc.) |
| [src/shared/ipc.ts](src/shared/ipc.ts) | IPC channel name constants |

---

## IPC Pattern

All IPC calls are typed end-to-end. Never use raw `ipcRenderer` in the renderer — always go through `window.aether`.

```typescript
// Renderer: getAll returns both tabs and activeId.
const { tabs, activeId } = await window.aether.tabs.getAll()
await window.aether.tabs.create('https://google.com')

// Event subscriptions return a cleanup function.
const unsubscribe = window.aether.on.tabUpdated((tab) => {
  console.log(tab.id, tab.title)
})
unsubscribe() // call when the consumer unmounts
```

The full API surface is in [src/preload/index.ts](src/preload/index.ts) — check this file to know what's available before adding new IPC channels. Declare channels in `src/shared/ipc.ts` and validate arguments at runtime in main before calling managers; static typing is not input validation.

---

## Data Models

**electron-store** (`aether-store.json` under `app.getPath('userData')`; resolve for the running build):
- `profiles` — game profiles with process names, opacity, window bounds, homepage
- `collections` — named link collections scoped to a profile (or `shared`)
- `sessions` — HTTP(S) URLs, titles, favicons, active index and timestamp per profile; zoom is runtime-only and is not saved
- `settings` — shortcut map, search/homepage, startup, detection, performance and other preferences; fresh `startWithWindows` defaults to true

**Other persistence:** detection exclusions, deleted-profile snapshots and migration markers also live in the store. `sessionDirty` is set at startup/quit, but no crash-recovery reader exists. Renderer mission/UI state also uses localStorage. WebView2 site data uses `%APPDATA%\Overframe\WebView2` in the native addon.

**History remains pending:** `better-sqlite3` is declared as a dependency, but no SQLite/history implementation or history IPC API exists under `src/`. Do not claim a history database is created.

**Session gap:** autosave runs every 15s without waiting for first restore; a `--hidden` launch can overwrite the saved session before first show. Hidden profile switches also defer restore while autosave continues. Track this as a code issue, not completed recovery behavior.

**Key shared types** (see [src/shared/types.ts](src/shared/types.ts)):
- `TabState` — id, url, title, favicon, isLoading, canGoBack, canGoForward
- `Profile` — id, name, processNames[], opacity, windowBounds, homepageUrl
- `Collection` — id, name, profileId | 'shared', source, links[]
- `Link` — id, title, url, note?, favicon?, pinned, order

---

## Overlay Behavior

Three states controlled by visibility and click-through actions (`Alt+B` / `Alt+C` by default):
- `HIDDEN` — opacity zero immediately; OS hide and shell background throttling after 30s
- `FOCUSED` — browser receives input, game does not
- `CLICK_THROUGH` — visible with mouse forwarding outside regions made interactive by renderer hit-testing

Click-through uses renderer hit-testing for UI/drag regions; there is no permanently clickable strip while hidden. Hide/show preserves the previous click-through state.

While visible, the window uses always-on-top at `'screen-saver'` level; hide clears it. Normal startup shows the overlay; `--hidden` defers showing and initial session restoration.

---

## Global Hotkeys

Registered via `uiohook-napi` (WH_KEYBOARD_LL), not Electron `globalShortcut`. Bindings are global; real gaming compatibility still requires human validation:
- `Alt+B` — toggle overlay (default, configurable)
- `Ctrl+T` / `Ctrl+W` — new/close tab
- `Ctrl+Shift+Down` / `Ctrl+Shift+Up` — opacity down/up in 0.05 steps

See [src/main/managers/ShortcutManager.ts](src/main/managers/ShortcutManager.ts) and [src/main/managers/uiohook.ts](src/main/managers/uiohook.ts); defaults are in `src/shared/types.ts`. Changes to global shortcut behavior require explicit human approval.

---

## Conventions

- **TypeScript strict** — no `any`, no raw `ipcRenderer`
- **IPC channels** — always defined as constants in [src/shared/ipc.ts](src/shared/ipc.ts)
- **Zustand** in renderer for UI state; **electron-store** in main for persistence
- **React components** in `src/renderer/components/`, flat or single-folder per component
- **No analytics, no telemetry** — local persistence with explicit network features listed in the security guide; no expansion of egress without review
- **Tailwind** for all styling — no inline styles, no CSS modules. Existing dynamic inline styles (for example TabBar sizing) conflict with the blanket rule and require explicit reconciliation before treating them as approved exceptions.
- Lint: `pnpm lint` | Type-check: `pnpm typecheck` | Tests: `pnpm test`

---

## Guides domaine

Lire le guide correspondant avant toute modification dans ce domaine :

| Domaine | Guide | Lire quand |
|---|---|---|
| Sécurité | [.claude/guides/SECURITY.md](.claude/guides/SECURITY.md) | IPC handlers, navigation, dépendances |
| Accessibilité | [.claude/guides/ACCESSIBILITY.md](.claude/guides/ACCESSIBILITY.md) | Composants React, interactions, UI |
| Design / UX-UI | [.claude/guides/DESIGN.md](.claude/guides/DESIGN.md) | Tout composant visuel, tokens, layout |
| Performance | [.claude/guides/PERFORMANCE.md](.claude/guides/PERFORMANCE.md) | Tabs, mémoire, polling, animations |
| Testing / QA | [.claude/guides/TESTING.md](.claude/guides/TESTING.md) | Avant tout `[FIX]`, `[FEAT]`, `[TEST]` |
| Coordination H/IA | [WORKFLOW.md](WORKFLOW.md) | Début de session, ouverture de PR |
| Backlog | [TASKS.md](TASKS.md) | Début et fin de chaque session |

**Dans Claude Code**, les hooks et commandes du dépôt assurent une partie de la coordination. Ils ne s’exécutent pas automatiquement dans Codex : suivre [AGENTS.md](AGENTS.md) et reproduire leur intention explicitement.
- **Routage auto** : le hook `guide-router` injecte le bon guide quand tu édites un fichier du domaine (IPC→Sécurité, tabs→Performance, composant→A11y).
- **Subagents spécialisés** (`.claude/agents/`) : `security-reviewer`, `qa-tester`, `perf-auditor`, `a11y-reviewer` — délègue-leur la revue/les tests de leur domaine.
- **Slash commands** (`.claude/commands/`) : `/review-security`, `/cover <fichier>`, `/ship` (Definition-of-Done complète).

---

## Monorepo Structure

```
overframe/                  ← root (Electron app)
├── src/
│   ├── main/               ← Node.js main process
│   │   ├── index.ts
│   │   ├── ipc/            ← IPC handlers
│   │   ├── managers/       ← core business logic
│   │   ├── windows/        ← BrowserWindow + TrayManager
│   │   ├── lifecycle/      ← squirrel hooks, CSP, shortcut actions
│   │   └── store/          ← electron-store instance + schema
│   ├── preload/            ← contextBridge API (window.aether)
│   ├── renderer/           ← React app
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── store/          ← Zustand stores
│   │   └── hooks/
│   └── shared/             ← types, IPC channels, constants
├── landing/                ← Next.js marketing site (separate workspace)
├── docs/                   ← PRD.md, TECH_SPEC.md, ROADMAP.md
├── scripts/                ← asset generation, dep auditing
└── public/                 ← Electron app icons/assets
```

---

## Security Model

| Concern | Mitigation |
|---|---|
| Renderer XSS | `contextIsolation: true`, `nodeIntegration: false`; current shell/popups use `sandbox: false`, an explicit isolation review item |
| Web content privilege escalation | Tabs render in Edge WebView2 (separate OS process) — no Electron preload, no Node bridge |
| Dangerous navigation | `isSafeUrl()` on renderer requests + non-http(s)/about navigations cancelled in the addon's `NavigationStarting` |
| New window popups | Open in new Overframe tab via the addon's `NewWindowRequested` (http/https only) |
| Network boundaries | Existing main egress: user-triggered collection share upload and short-code retrieval, plus packaged non-Store update checks/downloads. Renderer news, partner assets and favicons also make requests; see SECURITY.md. Existing calls do not authorize new egress |

---

The CSP in `src/main/lifecycle/csp.ts` currently includes `unsafe-inline`, `unsafe-eval` and a remote script origin, conflicting with the security guide. Preserve the stricter policy and track remediation; this documentation does not approve that conflict.

## Hot Reload Rules

| What changed | What to do |
|---|---|
| Renderer (`src/renderer/**`) | Nothing — Vite HMR reloads instantly |
| Preload (`src/preload/**`) | Reload the window (Ctrl+R in DevTools, or restart) |
| Main process (`src/main/**`) | **Full restart** of the instance you own; coordinate before stopping any shared runtime |
| Shared types (`src/shared/**`) | Full restart (consumed by both sides) |

---

## Observer HTTP Server (Dev Mode)

Quand l'app tourne (`pnpm dev`), un serveur HTTP démarre sur `http://127.0.0.1:9119`.
Il expose screenshots, logs et état structuré. Réserver le runtime, vérifier le checkout/build, et ne pas remplacer une instance appartenant à un autre agent. `/overlay/eval` et les routes de contrôle modifient l’app ; ce ne sont pas des diagnostics en lecture seule.

```bash
# Santé — confirme que l'app est prête
curl http://127.0.0.1:9119/ping

# Screenshot PNG → lire avec le Read tool
curl http://127.0.0.1:9119/screenshot --output C:\tmp\screen.png

# État structuré JSON (overlay state, onglets ouverts, profil actif)
curl http://127.0.0.1:9119/state

# RAM des processus Electron uniquement (Edge/WebView2 exclu) vs budget 150/300 MB
curl http://127.0.0.1:9119/metrics

# Piloter l'overlay depuis le terminal (utile avant un screenshot)
curl http://127.0.0.1:9119/overlay/show
curl http://127.0.0.1:9119/overlay/hide

# Exécuter du JS dans le renderer Electron (accès window.aether.*)
# Utiliser PowerShell pour l'encodage URL sur Windows :
# $js = "window.aether.settings.get().then(function(s){return s.applyDarkMode})"
# $enc = [System.Uri]::EscapeDataString($js)
# Invoke-WebRequest "http://127.0.0.1:9119/overlay/eval?js=$enc"
# ⚠️  S'exécute dans l'overlay Electron — PAS dans les tabs WebView2

# Logs console (300 lignes par défaut)
curl http://127.0.0.1:9119/log/renderer
curl http://127.0.0.1:9119/log/webview
curl http://127.0.0.1:9119/log/crash

# Nombre de lignes personnalisé
curl "http://127.0.0.1:9119/log/renderer?lines=50"
```

**Logs écrits automatiquement en dev :**

| Source | Fichier |
|---|---|
| Shell React (renderer) | `app.getPath('userData')/logs/renderer.log` (dev) |
| Onglets WebView2 | Route `webview.log` conservée, mais aucun producteur console WebView2 connecté dans le code actuel |
| Crashes / erreurs fatales | `app.getPath('userData')/logs/crash.log` |

**DevTools & utilitaires :**
```js
window.aether.system.toggleDevTools()   // ouvre DevTools détachés
window.aether.system.devStoreReset()    // efface le store et relance
window.aether.system.simulateCrash()    // écrit une entrée crash.log de test
```

**Données persistées :** le menu système `openFolder('userData')` ouvre le répertoire résolu par Electron. Ne pas le confondre avec l’installation Squirrel sous `%LOCALAPPDATA%\Overframe`.

**Limites Observer :** `/screenshot` capture le renderer Electron via `capturePage()` et ne prouve pas le rendu des fenêtres natives WebView2. `/metrics` ignore leur mémoire (`privateKb: 0` par onglet) ; `withinBudget` compare des MB arrondis avec `<=`. Des logs vides et un smoke vert ne prouvent donc pas le bon fonctionnement des pages natives.

---

## Git Workflow

```
main          ← stable releases only
dev           ← integration branch — all features merge here
  └── feat/<name>      feature branches
  └── fix/<name>       bug fixes
  └── chore/<name>     tooling, config, docs
```

**Rules:**
- Always branch off `dev`
- Commit style: `feat: ...` / `fix: ...` / `chore: ...` (conventional commits)
- Merge back to `dev` via PR — never push directly to `main`
- `pnpm check` is only typecheck + lint. Before any commit, complete WORKFLOW's full gate (`typecheck`, `lint`, `test:coverage`, `build`, `smoke`) and obtain human validation. Commit/push/PR/release authorization must follow the current human instruction and AGENTS.md.

---

## Environment Variables

No `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` consumer exists in current `src/`; the former OAuth table described future work, not setup requirements. Web browsing and existing update/share/partner features use the network.

---

## Workflow Autonome Complet

### Démarrer une session
1. Vérifier Git/branche/worktrees selon [AGENTS.md](AGENTS.md), puis lire WORKFLOW et TASKS. Respecter la tâche humaine explicite et coordonner la propriété avant toute modification.
2. Lire les entrées pertinentes de [.claude/DEVLOG.md](.claude/DEVLOG.md) en vérifiant leurs dates ; la première entrée n’est pas nécessairement la plus récente.
3. Si un test runtime est requis et après coordination : `pnpm dev` → attendre `[dev] Observer → http://127.0.0.1:9119`.
4. `curl http://127.0.0.1:9119/ping` → confirmer que l'app répond

### Observer l'UI
```bash
# Montrer l'overlay si nécessaire (`--hidden` le masque au démarrage) :
# (ou l'appuyer manuellement une fois)

# Screenshot
curl http://127.0.0.1:9119/screenshot --output C:\tmp\screen.png
# → Read tool sur C:\tmp\screen.png pour voir le résultat visuellement

# État de l'app
curl http://127.0.0.1:9119/state
```

### Après chaque modification
- Dans Claude Code, le hook `PostToolUse` lance ESLint (`--max-warnings 0`) sur le fichier édité — les erreurs sont remontées dans ton contexte, corrige-les
- Pour une vérification complète : `pnpm typecheck && pnpm lint && pnpm test:coverage` (couverture 100% requise sur le périmètre logique)
- Si modification main/preload : `pnpm smoke` lance la vraie app et vérifie boot + overlay + screenshot + RAM via le devServer
- Si modification main/preload : redémarrer `pnpm dev` (hot reload ne couvre pas le main process)

### Avant tout commit — Protocole QA obligatoire

**Le commit n'intervient qu'APRÈS validation humaine. Séquence :**

```
1. pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build && pnpm smoke
2. Lancer l'app pour tests UI (script Node.js — voir WORKFLOW.md §2bis)
3. Tests via devServer :
   - Screenshots avec Read tool : overlay/state visible, favicons, texte lisible
   - /overlay/eval : vérifier les IPC (settings save, profile update, popup open)
   - /log/renderer : zéro erreur JavaScript
4. Présenter le tableau de résultats + checklist humaine → ATTENDRE validation
5. Committer uniquement après réponse positive
```

**Lancement de l'app pour tests (sans ELECTRON_RUN_AS_NODE) :**
```js
// scripts/test-launch.mjs ou inline dans un node --input-type=module
import electronPath from 'electron'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const childEnv = { ...process.env, NODE_ENV: 'development' }
delete childEnv.ELECTRON_RUN_AS_NODE
delete childEnv.ELECTRON_NO_ATTACH_CONSOLE
const child = spawn(electronPath, [path.join(root,'out/main/index.js')], { cwd: root, env: childEnv, stdio: 'ignore', detached: true })
child.unref()
```

### Ajouter un canal IPC
1. Déclarer la constante dans [src/shared/ipc.ts](src/shared/ipc.ts)
2. Ajouter le handler dans [src/main/ipc/handlers.ts](src/main/ipc/handlers.ts)
3. Exposer dans [src/preload/index.ts](src/preload/index.ts) sous `window.aether.*`

### Clore une session
1. `pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm build && pnpm smoke`
2. Tests UI via devServer (screenshots + /overlay/eval + logs)
3. Présenter les résultats + checklist humaine — **attendre validation avant commit**
4. Après validation : `git add` + `git commit` sur la branche feature
5. Mettre à jour [TASKS.md](TASKS.md) — déplacer les tâches terminées dans "Done"
6. Mettre à jour [.claude/DEVLOG.md](.claude/DEVLOG.md) — nouvelle entrée avec contexte, décisions, prochaine étape

### Hooks automatiques dans Claude Code (pas dans Codex)
| Hook | Déclencheur | Action |
|---|---|---|
| `SessionStart` | Début de session | Injecte branche + tâche "En cours" + dernière entrée DEVLOG dans le contexte |
| `PreToolUse` (Bash) | Avant chaque commande shell | Bloque push `main`, force-push, `reset --hard`, `clean -f`, `--no-verify`, ajout de dépendance, egress réseau hors localhost, `node -e` |
| `PostToolUse` (Edit/Write/MultiEdit) | Après édition `.ts`/`.tsx` | ESLint `--max-warnings 0` → erreurs injectées dans le contexte ; + routage du guide métier selon le path |
| `Stop` | Fin de réponse | `git status` (human/debug-facing — pas injecté à Claude) |
