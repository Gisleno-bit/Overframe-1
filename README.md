# Overframe

Free, open-source browser overlay for Windows gamers. Press `Alt+B` to toggle a browser over a borderless windowed game without Alt+Tab. Game and anti-cheat compatibility still require validation.

**[overframe.app](https://overframe.app) · [Releases](https://github.com/overframeApp-arch/Overframe/releases) · Windows 10/11**

![Overframe home — quick access, collections and game detection](docs/screenshots/home.png)

## Features

- Always-on-top Chromium browser overlay
- Configurable global hotkey (default `Alt+B`)
- Click-through mode — toggle with `Alt+C`; mouse passes to the game outside interactive UI regions
- Per-game profiles with process-name/path and window-based detection
- Per-tab zoom controls and a live Electron memory display (WebView2 memory is not included)
- Performance Mode — unloads unprotected web pages while hidden; memory savings depend on the workload
- Keyboard layout support: AZERTY, QWERTY, DVORAK
- No game-process code injection

## Tech Stack

| Layer | Technology |
|---|---|
| Shell | Electron |
| UI | React + Tailwind CSS |
| Web renderer | Microsoft Edge WebView2 (native addon, shared environment with one controller per tab) |
| Storage | electron-store (profiles/collections/settings/sessions), renderer localStorage, separate WebView2 site data; application history remains unimplemented |
| Build | electron-vite + electron-forge |
| Installer | Squirrel.Windows (`Overframe-Setup.exe`) |
| Language | TypeScript |

## Install

1. Download `Overframe-Setup.exe` from the [Releases page](https://github.com/overframeApp-arch/Overframe/releases/latest).
2. Run the installer. This repository's Squirrel packaging has no signing
   configuration. If SmartScreen warns, verify the download source before
   choosing whether to continue.
3. Overframe opens the overlay and creates a tray icon. Press **`Alt+B`** to
   toggle it. Launches through the Windows startup setting use hidden mode.

## Usage

| Action | Shortcut |
|---|---|
| Show / hide overlay | `Alt+B` (configurable) |
| New tab | `Ctrl+T` |
| Close active tab | `Ctrl+W` |
| Focus address bar | `Ctrl+L` |
| Drag the window | Drag a free area of the tab bar |
| Click-through mode | `Alt+C` (configurable) |

Game profiles live in **Settings → Game profiles**. Add the process name
(e.g. `eldenring.exe`) and Overframe auto-switches profile when that game is
running.

Link collections keep your builds, guides and wikis one click away, per game:

![Collections manager — per-game link collections](docs/screenshots/collections.png)

## FAQ

**Windows says "Windows protected your PC" — is this safe?**
The Squirrel packaging in this repository has no signing configuration. A warning
alone does not establish whether a download is safe. Verify that your installer
came from the project's release channel; the source is available for review.

**Will this get me banned by anti-cheat?**
Overframe does not inject code into games or read gameplay memory. It uses a
global keyboard hook and Windows process/window information for game detection.
Those design choices do not guarantee compatibility with every anti-cheat
system. Check the game's rules before using an overlay.

**The overlay doesn't show above my game.**
Your game must run in **borderless windowed** (or windowed) mode. In exclusive
fullscreen, Windows lets the game bypass the desktop compositor, so no window
can appear above it. Most modern games offer borderless windowed in their video
settings.

**Does Overframe block ads?**
Ad blocking is currently unavailable and its Settings toggle is disabled. A
replacement is tracked in [TASKS.md](TASKS.md).

**Where is my data stored?**
Settings, profiles, collections and tab sessions are stored in `aether-store.json`
under Electron's user-data directory (`app.getPath('userData')`). Browser site data
uses `%APPDATA%\Overframe\WebView2`; some UI state uses localStorage. The Squirrel
installation directory under `%LOCALAPPDATA%\Overframe` is a different location.

No Overframe account is required. No telemetry, no analytics. Creating a short
share code uploads that collection, including exported notes, creator metadata
and artwork. Sites, updates, release news, favicons and partner assets also use
the network. See the [network inventory](.claude/guides/SECURITY.md).

## Develop

```powershell
pnpm install        # installs deps, Git hook and native WebView2 addon
pnpm dev            # electron-vite dev server
pnpm build          # JavaScript production bundle → out/
pnpm build:addon    # rebuild WebView2 addon after native changes
pnpm make           # build + package installer → dist/
pnpm typecheck      # type-check main + renderer
pnpm test           # vitest unit tests
```

The repository's CI uses **Node 20** and **pnpm 10**. Native builds require
**Visual Studio Build Tools 2022** on Windows.
Follow [AGENTS.md](AGENTS.md) and [WORKFLOW.md](WORKFLOW.md) for contribution gates
and human validation before committing.

