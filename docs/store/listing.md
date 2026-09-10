# Microsoft Store — Submission Kit

Draft submission kit for the proposed Microsoft Store/MSIX route, reconciled
against `ce29252` on 2026-09-10. This is groundwork, not proof of a Store build,
completed submission or publication. `forge.config.ts` still contains only
Squirrel and ZIP makers; `@electron-forge/maker-appx` is not declared in the current
package. Cached remote branch `feat/msix-packaging` contains separate packaging
work and must be coordinated before any implementation is resumed.

Current code gates automatic update checks and the manual check with `process.windowsStore`
(`src/main/index.ts`, `src/main/ipc/handlers.ts`). Runtime Store validation is still
required. The owner must verify current Partner Center, signing, rating and asset
requirements before submission; external policy and fees were not audited here.

## Why the Store matters

- Permanent discovery channel: people search "browser overlay" in the Store
- Proposed Store-managed distribution/update path; signing and installation behavior need validation on the final package
- Account eligibility, fees and current submission requirements need owner verification

## 1. Owner checklist (not completed by this review)

1. Create a Partner Center account: https://partner.microsoft.com/dashboard/registration (verify account type and current terms)
2. Reserve the app name: **Overframe**
3. From Product identity, copy these three values and give them to Claude:
   - `Package/Identity/Name` (looks like `12345YourName.Overframe`)
   - `Package/Identity/Publisher` (looks like `CN=A1B2C3D4-...`)
   - `Package/Properties/PublisherDisplayName`
4. Complete the age-rating questionnaire accurately for the app and its accessible content; do not preselect answers from this draft
5. Approve the dev dependency `@electron-forge/maker-appx` so the MSIX can be built

## 2. Draft listing copy (review before submission)

**Name:** Overframe

**Short description** (Store search card):
Browser overlay for gamers. Press Alt+B to browse wikis, builds and guides on top of your game, without alt-tabbing.

**Description:**

Overframe is a free browser that floats above your game.

Press Alt+B and a full browser opens on top of a game running in borderless windowed mode. Look up a build, follow a quest guide, check the wiki or keep a video running, then press Alt+B again and it is gone. No alt-tab, no second monitor needed.

Built for gaming:

- Browser tabs powered by Microsoft Edge WebView2
- Per-game profiles: Overframe detects the game you are playing and switches to its own tabs, links and layout
- Link collections: keep builds, guides and tools organized per game, and share a collection with a short code
- Click-through mode: the overlay stays visible while your mouse and keyboard control the game
- Global hotkeys that work in game, adjustable opacity, system tray
- No Overframe account or product telemetry. Settings and profiles are stored locally; creating a short share code uploads that collection to the share service

Overframe displays a separate window above the game. It does not inject code into the game or read its gameplay memory. It uses global keyboard shortcuts and Windows process/window information for game detection; compatibility with every game or anti-cheat system is not guaranteed.

**Keywords / search terms:** browser overlay, game overlay, in-game browser, wiki overlay, second screen, gaming browser, alt-tab

**Category:** Utilities & tools

**Privacy policy URL:** https://overframe.app/privacy
**Website:** https://overframe.app
**Support contact:** contact@overframe.app

## 3. Planned screenshots (verify current Store requirements before submission)

To produce before submission (larger window than the dev captures):

- [ ] Home page with quick links and collections (1600x900)
- [ ] Collections manager with a filled collection
- [ ] THE money shot: overlay visible above a real game (human task, any borderless game)

## 4. Proposed forge.config.ts snippet (not integrated)

Coordinate the existing `feat/msix-packaging` work and obtain dependency approval
before using this illustrative snippet. Verify its options against the approved
maker version and the real Partner Center identity.

```ts
import { MakerAppX } from '@electron-forge/maker-appx'

// in makers[]:
new MakerAppX({
  packageName: '<Package/Identity/Name>',
  publisher: '<Package/Identity/Publisher>',
  publisherDisplayName: '<PublisherDisplayName>',
  packageDisplayName: 'Overframe',
  packageDescription: 'Browser overlay for gamers',
  assets: 'public/store-assets', // 44x44, 150x150 logos etc.
}),
```

The current `pnpm make` produces the configured Squirrel/ZIP outputs, not MSIX.
A future Store package requires the approved maker, identity/assets, package
validation and an explicitly authorized submission. Certification timing is an
external operational matter, not established by this repository.

## 5. After first publication

- After an approved first publication, build and validate each Store update with
  the chosen version and submit it through the human-owned release process.
  Decide version parity with the GitHub/Squirrel channel explicitly.
- Consider winget next: one manifest PR to microsoft/winget-pkgs pointing at
  the GitHub Setup.exe.
