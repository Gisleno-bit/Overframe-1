# Guide Testing / QA — Overframe

> Claude lit ce fichier avant toute tâche `[TEST]` et écrit un test pour toute logique métier ajoutée.

---

## État vérifié dans le dépôt

Inventaire au **2026-09-10**, base `ce29252` : **15 fichiers de test** dans `src/`. Ils couvrent CollectionsManager, SessionManager, les heuristiques de détection, les migrations du store, les actions de raccourcis, des helpers renderer, les stores Zustand et `hostMatch`. Les nombres de tests et les résultats verts du DEVLOG sont des preuves historiques ; cet inventaire ne remplace pas une exécution fraîche.

La configuration impose **100 % statements/branches/functions/lines sur une allowlist de 15 fichiers source**. Ce n'est ni une mesure de toute la logique du produit, ni une couverture de toute l'application. Par exemple, `missionHelpers.test.ts` existe mais `missionHelpers.ts` ne figure pas dans l'allowlist. Les fenêtres Electron, le wiring IPC/preload, les composants React, TabManager/ProfileManager et les bindings natifs ne sont pas dans ce périmètre. L'objectif reste de **tester ce qui casse silencieusement**, avec une validation runtime complémentaire.

Lancer : `pnpm test` · Couverture : `pnpm test:coverage` · Watch : `pnpm test:watch`

Config : [vitest.config.ts](../../vitest.config.ts) — environnement `node` par défaut, alias `@shared`, découverte `src/**/*.{test,spec}.{ts,tsx}`, provider V8. [vitest.setup.ts](../../vitest.setup.ts) fournit le mock Electron global. `missionsStore.test.ts` utilise déjà `// @vitest-environment happy-dom` pour le stockage navigateur.

---

## Quoi tester — par ordre de priorité

### Priorité 1 — Logique métier pure (facile, haute valeur)

Fonctions sans effet de bord ni dépendance Electron. **Tout nouveau util/helper doit en avoir.**

| Cible | État / suite utile |
|---|---|
| `heuristics.ts` | Tests existants ; étendre aux nouvelles règles de détection |
| `CollectionsManager` (CRUD, export/import compressé et format historique) | Tests existants ; préserver les régressions données, sections et liens |
| `SessionManager` (restore/save/autosave) | Tests existants avec store et TabManager simulés ; ne prouvent pas une restauration native réelle |
| Validation des inputs IPC | Pas de fichier de test des handlers dans l'inventaire actuel ; valider les entrées invalides et les flux légitimes |
| Migrations de store | `src/main/store/index.test.ts` existe ; étendre à chaque évolution persistée |

### Priorité 2 — Managers avec dépendances Electron (mock requis)

`TabManager`, `ProfileManager` dépendent d'Electron et/ou de services natifs. Aucun fichier de test dédié dans l'inventaire actuel. Tester les comportements isolables avec mocks (voir pattern plus bas), puis vérifier les interactions réelles avec WebView2, les fenêtres et la détection de jeu en runtime.

### Priorité 3 — Composants React (non couverts aujourd'hui)

Aucun test de composant `.test.tsx`/`.spec.tsx` dans l'inventaire actuel. `happy-dom` est déjà déclaré dans les devDependencies et utilisé par un test de store ; `@testing-library/react` n'est pas déclaré dans `package.json`. Si cette bibliothèque est retenue pour les composants à logique, son ajout nécessite l'accord humain prévu par WORKFLOW.md.

---

## Gates automatisés et portée

- **Avant tout commit** : appliquer le gate complet de [WORKFLOW.md](../../WORKFLOW.md) §2bis/§9 : `pnpm typecheck` → `pnpm lint` → `pnpm test:coverage` → `pnpm build` → `pnpm smoke`, puis présenter la checklist et attendre la validation humaine. Un guide ou `/ship` abrégé ne dispense pas de ces étapes.
- **Hook Git fourni** : [scripts/pre-commit](../../scripts/pre-commit) lance seulement typecheck + lint. Il ne remplace pas le protocole complet. Le `postinstall` appelle [install-git-hooks.mjs](../../scripts/install-git-hooks.mjs), qui ignore les checkouts où `.git` est un fichier (worktrees liés) ; vérifier le hook effectivement installé et `core.hooksPath` dans chaque checkout.
- **CI configurée** : [.github/workflows/ci.yml](../../.github/workflows/ci.yml) lance typecheck + lint + test:coverage + build sous Ubuntu ; le job Windows (`windows-2022`) installe les dépendances et lance typecheck + build. Aucun smoke ni test gaming n'y est configuré. La présence du workflow ne prouve pas qu'un run distant récent est vert.
- **Addon natif** : `pnpm build` ne reconstruit que le bundle Electron/Vite ; `pnpm smoke` appelle ce build puis le script smoke. Après modification native, lancer `pnpm build:addon` avant la QA runtime.

---

## Pattern de test (style du projet)

Suivre exactement le style de `heuristics.test.ts` : `describe` par unité, `it` descriptif au présent.

```ts
import { describe, it, expect } from 'vitest'
import { maFonction } from './maFonction'

describe('maFonction', () => {
  it('gère le cas nominal', () => {
    expect(maFonction('entrée')).toBe('sortie')
  })
  it('gère le cas limite vide', () => {
    expect(maFonction('')).toBeNull()
  })
})
```

### Mocker Electron (pour les managers)

Le mock partagé de `vitest.setup.ts` est déjà actif. Le compléter dans le test si nécessaire, sans utiliser le store utilisateur réel. Exemple de remplacement local :

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => 'C:/tmp/test', getAppMetrics: () => [], isPackaged: false },
  // ajouter uniquement ce que le test consomme
}))

// Le store electron-store doit aussi être mocké ou pointé vers un fichier temp.
```

Placer les tests **à côté** du fichier testé : `MonManager.ts` → `MonManager.test.ts`.

---

## Règles

- **Tout `[FIX]` ajoute un test de régression** — un test qui aurait attrapé le bug. Sans ça, le bug reviendra.
- **Tout nouveau util/helper pur** est livré avec ses tests.
- **Ne pas tester les détails d'implémentation** — tester le comportement observable (entrées → sorties), pas les appels internes.
- **Un test doit pouvoir échouer** — un test qui passe toujours ne teste rien. Vérifier qu'il échoue si on casse le code.
- **Tests rapides** — pas d'I/O réseau, pas de vrai filesystem (utiliser temp/mock). La suite doit rester sous quelques secondes.

---

## Smoke, vérification runtime et E2E gaming

`pnpm smoke` construit puis lance la vraie app Electron via [scripts/smoke.mjs](../../scripts/smoke.mjs). Le script vérifie `/ping`, la forme minimale de `/state`, une mémoire positive inférieure à **500 MB**, les transitions logiques show/hide et une réponse PNG de plus de 1 000 octets. Il ne vérifie pas le respect des budgets 150/300 MB, le contenu visuel du PNG, un aller-retour IPC renderer, une navigation WebView2, ni le deep-hide OS après 30 s.

La mémoire de `/metrics` provient des processus Electron (`app.getAppMetrics()`, private bytes avec repli working set) ; les processus Edge/WebView2 ne sont pas inclus. Un smoke vert ne prouve donc pas le budget RAM total de l'application. Voir [PERFORMANCE.md](PERFORMANCE.md) et les mesures Windows complémentaires.

Le smoke refuse le lancement si une requête `/ping` répond déjà sur `127.0.0.1:9119`. Coordonner le propriétaire du runtime avant tout lancement : ce contrôle ne remplace pas l'identification de l'instance, du checkout et du build testés. Les endpoints `/overlay/show`, `/overlay/hide`, `/overlay/eval` et `/tab/eval` modifient l'état ou exécutent du code ; ils ne sont pas de simples lectures. Les captures Electron ne suffisent pas à valider le contenu natif WebView2.

Vitest ne teste pas l'app réelle dans un jeu. Ces flows sont validés manuellement par l'humain avant release (voir [WORKFLOW.md](../../WORKFLOW.md) §4) :

- Toggle overlay `Alt+B` par-dessus un jeu borderless réel
- Click-through et zone de drag
- Détection automatique de profil au lancement d'un jeu
- Comportement multi-écrans
- Performance in-game ressentie

Aucun harnais Playwright/E2E automatisé n'est configuré dans le dépôt actuel. Son ajout éventuel ne remplace pas la validation Windows/in-game et doit respecter l'approbation des nouvelles dépendances.

---

## Checklist tâche `[TEST]`

- [ ] Tests placés à côté du fichier source (`*.test.ts`)
- [ ] Style aligné sur `heuristics.test.ts` (`describe`/`it` au présent)
- [ ] Cas nominal + cas limites + cas d'erreur couverts
- [ ] Vérifié que les tests échouent si on casse volontairement le code
- [ ] `pnpm test` vert
- [ ] `pnpm test:coverage` respecte les seuils sur l'allowlist ; aucun résultat historique présenté comme fraîchement exécuté
- [ ] Pas d'I/O réelle (réseau, fs) — mocks ou temp uniquement
- [ ] Gates complets de WORKFLOW.md et vérification runtime pertinente réalisés avant commit ; checks non exécutés explicitement signalés
