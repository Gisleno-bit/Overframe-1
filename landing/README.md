# Overframe Landing

Public marketing site for [Overframe](https://overframe.app). Built with **Next.js 16** App Router (declared `^16.2.6` in `package.json`), **Tailwind CSS**, and TypeScript.

## Dev

```bash
# from the monorepo root
pnpm install
pnpm --filter overframe-landing dev
```

Serves the development site at <http://localhost:3001>.

## Build

```bash
pnpm --filter overframe-landing build
```

The build is configured as a static export (`next.config.mjs`, `output: 'export'`) to `landing/out`. The declared `start` script runs `next start`; do not use it as a static-export preview recipe. Serve the exported directory with an approved static host/tool when previewing it.

## Structure

```
landing/
├── app/
│   ├── layout.tsx          ← Root layout: metadata, JSON-LD, fonts
│   ├── page.tsx            ← Home page
│   ├── download/           ← Windows download page
│   ├── changelog/          ← GitHub Releases fetched at static-build time
│   ├── contact/            ← Contact channels
│   ├── privacy/            ← Privacy policy
│   ├── terms/              ← Terms of service
│   ├── legal/              ← Legal notice (noindex)
│   ├── opengraph-image.tsx ← Generated OG image
│   ├── apple-icon.tsx      ← Generated Apple touch icon
│   ├── sitemap.ts
│   └── robots.ts
├── components/             ← Page sections and UI
├── lib/
│   ├── config.ts           ← Central site config (URLs, links, metadata)
│   └── ...
├── public/
│   └── favicon.svg
├── styles/
├── next.config.mjs
├── tailwind.config.ts
└── tsconfig.json
```

## Deployment

Cloudflare Pages is the documented hosting target. Local source verifies a static export, not the current deployment status or hosting-account configuration.

The changelog fetch uses `cache: 'force-cache'` during static generation (`app/changelog/page.tsx`); new releases require a rebuild to appear. There is no `public/demo.mp4` in the tracked landing assets.

Set `NEXT_PUBLIC_DOWNLOAD_URL` to override the installer download URL at build time. Defaults to the upstream project's `Overframe-Setup.exe` release URL in `lib/config.ts` and `next.config.mjs`; the fork remote does not automatically change that product download channel. Live release availability is not checked by this documentation review.

## Public-copy discrepancies still open

Static source review on 2026-09-10; the TSX/config product files were intentionally not edited in this documentation-only task. Resolve these before reusing the affected promises in a release or Store listing. The [security guide](../.claude/guides/SECURITY.md) gives the full network inventory.

| Copy requiring correction | Current evidence / remaining validation |
|---|---|
| `app/privacy/page.tsx`: everything stays local, no transmission, no personal data on servers | `useCollectionShare.ts` and main IPC upload exported collection data, including notes/creator metadata/images; browsing and remote resources also use the network |
| Local data described as one file including browsing history | Electron settings/sessions use `app.getPath('userData')`; native browser data uses `%APPDATA%\Overframe\WebView2`. No searchable application history DB exists in source |
| Updates only at launch/manually | `src/main/index.ts` configures hourly checks in packaged non-Store builds, plus manual control in IPC |
| Shared collections stored until deletion | Versioned worker uses a 90-day KV TTL; live deployment, host logs and deletion request handling are not verified |
| Uninstall removes all local data; deletion requests handled within 30 days | Uninstall attempts userData removal and ignores errors; native browser path is independent. Validate cleanup and the owner's actual support process before promising either outcome |
| Network list omits release news and Instant Gaming assets | `WelcomePage.tsx` fetches GitHub releases, loads IG CSS and images; favicons and remote collection/profile artwork also create requests |
| `lib/config.ts` promises no anti-cheat risk | Global uiohook and Win32 process/window detection are present. Lack of game injection does not establish compatibility with every anti-cheat product |
