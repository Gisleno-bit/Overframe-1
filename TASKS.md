# TASKS — Overframe

> **Pour Claude :** Lis ce fichier en début de session pour savoir où en est le projet et quoi faire ensuite.
> Mets-le à jour en fin de session : déplace les tâches terminées dans "Done", ajuste les priorités.
> Ne modifie pas la section "Contraintes" sans accord explicite.

---

## État actuel du projet

**Version du package :** `0.2.0`. La publication du 2026-07-19 est consignée dans DEVLOG ; le tag local `v0.2.0` pointe sur `42008d7`. La disponibilité des artefacts et les mises à jour des installations ne sont pas revérifiées ici.
**Base de l'audit du 2026-09-10 :** `dev` / référence locale `origin/dev` à `ce29252`, après la release : préparation Store, deep-hide et coordination AGENTS. `origin` = fork `Gisleno-bit/Overframe-1` ; `upstream` = `overframeapp-arch/Overframe`. Le fetch d'origin/dev effectué avant intégration confirme cette même base ; les autres références distantes restent en cache.
**Réconciliation documentaire :** corrections et revue finale terminées sur `chore/docs-reconciliation` ; intégration dans le `dev` du fork explicitement autorisée par l'humain. Consulter Git/PR pour l'état de livraison. Les résultats historiques ci-dessous ne sont pas des validations du diff courant.

Le code contient l'overlay, les onglets WebView2, les profils, collections et codes de partage, sessions, raccourcis globaux, tray, auto-update et onboarding. L'objectif reste la consolidation vers v1.0 ; présence du code et validation humaine sont distinctes.

[AGENTS.md](AGENTS.md) et [WORKFLOW.md](WORKFLOW.md) restent applicables : Windows uniquement jusqu'à décision humaine explicite, gate complet avant commit et validation humaine préalable. Le minimum typecheck/lint rappelé dans les contraintes ci-dessous ne remplace pas ce gate.

---

## En cours

Aucune implémentation produit engagée par cet audit. Les constats ci-dessous restent à prioriser par le Product Owner.

---

## Priorité haute — Chemin vers v1.0

### Qualité & robustesse
- [ ] **[BUG] Session au démarrage masqué** — analyse statique du 2026-09-10 : `--hidden` diffère la restauration au premier show, mais l'autosave 15 s et la sauvegarde au quit peuvent persister une liste vide avant restauration (`src/main/index.ts:72,392–410,423–426`, `SessionManager.ts:19–32,102–106`). Un changement de profil pendant le hide peut aussi sauvegarder les onglets de l'ancien profil sous le nouveau (`index.ts:243–253,410`). Protéger les sessions non restaurées et tester ces deux chemins ; aucun runtime modifié pendant l'audit.
- [ ] **[SEC] CSP / confinement du chrome** — `csp.ts:11–20` autorise déjà `unsafe-inline`, `unsafe-eval`, des scripts IG et HTTPS large, en conflit avec SECURITY.md. Fenêtres chrome `sandbox:false` et absence de garde de navigation/ouverture commune : revue et correction séparées, sans assouplir la politique pour décrire le code existant.
- [ ] **[SEC] Validation IPC encore partielle** — contrôles d'émetteur/frame ponctuels ; `PopupOpen`, `SystemLayoutMap`, `TabsReorder` et plusieurs settings restent insuffisamment bornés/validés (`handlers.ts:219–225,292–295,335–340,646–685`). La revue historique collections/profiles ne couvre pas toute la frontière IPC ; compléter avec tests ciblés.
- [ ] **[SEC/BUG] Import hostile ou malformé** — `inflateSync` synchrone sans borne de sortie, GET de partage lu entièrement avant contrôle de taille, sans timeout explicite ; `null` ou `links:[null]` peuvent lever après le parse (`CollectionsManager.ts:339–381`, `handlers.ts:131–144,469–479`). Risques de blocage/mémoire et de rejet sans feedback UI correct ; aucun crash ni exploit reproduit. Borner le décodage et gérer les erreurs.
- [ ] **[SEC] Observer dev** — routes eval/mutation sans authentification ni validation Host/Origin/méthode (`devServer.ts:28–32,120–172,213`). Le guard packaged et le bind loopback existent ; ils ne font pas de ces endpoints des diagnostics en lecture seule. Durcissement à traiter séparément.
- [ ] **[QA/OUTILLAGE] Hook Git absent de ce checkout** — constat du 2026-09-10 : pas de `.git/hooks/pre-commit`, `core.hooksPath` non configuré. Vérifier/rétablir l'installation avant un futur commit ; le hook fourni ne couvre que typecheck/lint, le gate WORKFLOW complet reste requis.
- [ ] **[DOCS/PRIVACY] Copy publique à réaligner** — `landing/app/privacy/page.tsx` surpromet localité, historique, fréquence d'update, durée de partage et suppression ; le code configure des updates horaires, TTL 90 jours et des ressources distantes. Page TSX laissée intacte dans l'audit documentaire ; voir SECURITY.md et landing/README.md pour l'inventaire. Pratiques de rétention/suppression de l'hébergeur à valider humainement.
- [ ] **[BUG] Adblock indisponible — remplacement à définir, diagnostic MV2 historique** — le diagnostic historique du 2026-07-18 attribuait l'échec au retrait de Manifest V2 dans le runtime observé (Edge 150, uBlock 1.71). Ce diagnostic de version/support tiers n'a pas été revérifié dans cette session. `AddBrowserExtension`/`Enable` répondent "succès", zéro erreur, mais rien ne s'installe ni ne filtre. Probe du 2026-07-18 dans un onglet réel : `googlesyndication`/`doubleclick`/`GTM`/`GA` chargent (pubs NON bloquées) ; `fbevents`/TikTok bloqués par la **tracking prevention intégrée d'Edge** (toujours active — d'où l'impression utilisateur "pas de pub"). Fait : toggle Settings désactivé avec explication honnête (2026-07-18). Pistes de remplacement : uBlock Origin Lite (MV3 — vérifier support WebView2), niveau de tracking prevention via `ICoreWebView2Profile3`, ou filtrage `WebResourceRequested`.
- [ ] **[SEC] `check:deps` rouge sur koffi — trancher** — le script interdit les bindings natifs "hooks/injection", mais koffi ne sert ici qu'à des appels Win32 en lecture seule pour la détection de jeu (`getExeProductName`, `getVisibleGames`, `getWindowIcon`) — pas d'injection (uiohook, déjà accepté, est plus intrusif). Décision : allowlister koffi avec justification dans le script, ou remplacer par un mini-addon dédié. Contrôle frais du 2026-09-10 : `node scripts/check-dangerous-deps.mjs` échoue (exit 1) sur koffi. Ce contrôle de noms de dépendances ne prouve pas une détection anti-cheat.
- [ ] **[QA] Findings mineurs qa-tester (2026-07-18)** — `setIconUrl`/`create` sans sanitisation interne (l'IPC valide déjà — défense en profondeur), import de `sections: ['', ' ']` produit `sections: []` (active le mode sections à tort), `moveLink` avec id inconnu persiste quand même (bump `updatedAt`).
- [ ] **[VALID HUMAIN] [FEAT] WebView2 — test réel Google + Cloudflare** — vérifier un vrai login Google et un site Cloudflare-protégé (Turnstile inclus). L'ancien code de spoofing Electron n'est plus présent ; le backend WebView2 ne garantit pas la réussite de ces flux. Revalider aussi le packaging natif sur le build à livrer (`forge.config.ts` déclare l'addon en `extraResource`).
- [ ] **[PERF] Trancher le budget RAM idle (150 MB) vs plancher architectural (~250 MB)** — l'audit historique du 2026-07-19 (voir DEVLOG) rapporte ~256 MB caché côté Electron. Les chiffres par composant cités dans ce log ne s'additionnent pas à ce total ; refaire une mesure cohérente sur un même snapshot avant toute décision. Options : (a) assumer un budget réaliste ~260 caché / 320 actif dans PRD/PERFORMANCE.md, (b) travaux profonds (détruire/recréer le renderer overlay au deep-hide, ou fenêtre non-transparente ?). Les process WebView2 des onglets ne sont pas comptés par `/metrics` — envisager de les inclure via un comptage natif pour des chiffres honnêtes.
- [ ] **[FIX] Multi-monitor** : vérifier que la fenêtre se souvient du bon écran après un changement de configuration moniteurs.
- [ ] **[FIX] Gestion d'erreur page load** : affiner l'état "failed to load" dans les onglets WebView2 (réseau coupé, SSL invalide ; watchdog/retry déjà présents dans `TabManager`). Ajouter test de régression.

### UX & polish
- [ ] **[BUG/QA] Cohérence homepage nouvel onglet** — le raccourci global utilise la homepage du profil ou `DEFAULT_HOMEPAGE` (`shortcutActions.ts:63–66`) ; vérifier la cohérence avec le réglage global `settings.homepageUrl` et les autres boutons de création. Constat statique, comportement attendu à confirmer.
- [ ] **[QA/STORE] Garde restart-to-update** — `AppRestartToUpdate` ne vérifie que `app.isPackaged` (`handlers.ts:739–741`), contrairement au démarrage et au contrôle manuel qui excluent le Store. Harmonisation/validation à revoir avant livraison Store ; aucun auto-update Store observé.
- [ ] **Context menu WebView2** : vérifier le menu natif et les actions attendues (copier, coller, ouvrir dans un onglet Overframe, inspecter) ; aucune intégration de menu produit dédiée n'est présente dans l'addon.
- [ ] **Vérifier l'onboarding flow** : parcourir les 3 étapes de `OnboardingOverlay`, valider sur une installation de test fraîche ; tout reset du store partagé nécessite une autorisation spécifique.
- [ ] **[PRODUIT] Exigences PRD non implémentées à arbitrer pour v1.0** : historique applicatif SQLite + recherche/rétention, disclaimer anti-cheat au premier lancement, entrée Settings dans le tray, transitions click-through automatiques par clic extérieur/intérieur, bande de drag permanente de 10px et détection de conflits avec les raccourcis d'autres apps. Les contrôles explicites `Alt+C`, zones de drag de TabBar et détection de doublons internes existent ; ne pas confondre ces variantes avec les exigences initiales.

### Release
- [ ] **[VALID HUMAIN] Auto-update v0.1.0 → v0.2.0** : contrôler téléchargement, notification et application à la relance sur une vraie installation. Le code actuel ne prouve pas l'état d'un poste installé.
- [ ] **[DISTRIBUTION] Microsoft Store** : les gardes `process.windowsStore` et le kit de soumission existent dans `dev` ; aucune configuration MakerAppX n'y est intégrée (`forge.config.ts`). Une branche distante mise en cache `feat/msix-packaging` contient un travail distinct : coordonner sa reprise avant de dupliquer ces modifications. Publication/identité Store non vérifiées.
- [ ] **README — GIF de démo** : enregistrer l'overlay en action sur un vrai jeu (tâche humaine — captures statiques faites le 2026-07-18).
- [ ] **[VALID HUMAIN] Installation réelle** : dérouler `Overframe-Setup.exe` (produit le 2026-07-18) sur machine propre — pas de droits admin demandés, app démarre, tray OK.
- [ ] **[CHORE] Dégraisser le package** : mesure historique du 2026-07-18, installeur à 169 MB ; `app.asar.unpacked` embarque un dossier parasite `@rollup/rollup-win32-x64-msvc_tmp_*` (outil de build) — auditer les exclusions electron-forge.

---

## Priorité normale — Backlog post-v1.0

| Priorité | Feature | Version cible |
|---|---|---|
| ★★★ | Remplacement de l'adblock indisponible (voir priorité haute) ; repriorisation soumise au Product Owner | v1.1 |
| ★★☆ | Ctrl+F recherche dans la page courante | v1.2 |
| ★★☆ | Picture-in-Picture mode (vue compacte) | v1.2 |
| ★☆☆ | Cloud sync collections + profils (tier payant) | v1.3 |
| ★☆☆ | CSS custom par site (nettoyage wikis) | v1.4 |
| ★☆☆ | Code signing certificate | v1.5 |

---

## Done — Récent

Les dates et résultats de tests de cette section sont historiques, sauf indication explicite d'une vérification actuelle.

- [x] **[CHORE] Réconciliation documentaire** (2026-09-10) — Codex + revues architecture/QA/sécurité/produit, base `ce29252`. Corrections vérifiées contre le code/Git, exigences et politiques conservées, churn réduit ; contrôles Markdown réussis. Aucun code produit, dépendance déclarée ou CI modifié. L'humain autorise commit/PR/merge dans le fork sous réserve des checks ; statut de livraison dans Git/PR, détails et limites dans DEVLOG.

- [x] **[FEAT] Partage de collections déjà implémenté** — vérifié dans le code à `ce29252` : `useCollectionShare` tente le code court via IPC/POST, puis export compressé Base64 en fallback ; preview/import des deux formats. Worker versionné dans `scripts/share-worker`, expiration KV 90 jours. Déploiement du service non testé pendant cette réconciliation.

- [x] **[PERF] Audit RAM session longue + fixes idle** (2026-07-19) — conclusion du protocole historique perf-auditor : pas de fuite continue observée (+3.4 MB/h attribués à variance GPU + churn V8) ; les 544 MB venaient du dev (HMR/DevTools) sur une base déjà hors budget par design. 3 causes structurelles corrigées : `hide()` ne cachait rien (opacity=0, jamais `win.hide()` → GPU + renderer à plein régime toute la session), fenêtres compagnes immortelles (~30 MB chacune), broadcast mémoire 1 Hz permanent (seul CPU idle non nul). Fix : deep-hide OS après 30 s de grâce + throttling, destruction des compagnes au deep-hide (recréation lazy déjà câblée), broadcast uniquement overlay visible. Mesuré : caché 274.6 → 256.3 MB (-18 côté Electron), compositing GPU éliminé pendant le jeu, dérive stoppée, + bug latent corrigé (une fenêtre enfant native pouvait réapparaître au-dessus du jeu pendant le hide par opacité). Harnais réutilisable : `scripts/measure-idle.mjs`.
- [x] **[SEC] Validation inputs IPC collections + profiles** (2026-07-18) — `isId` sur tous les ids, coercitions `String()` supprimées (title/name/iconUrl stockaient des valeurs brutes non-string), patch `ProfilesUpdate` whitelisté + `opacity`/`windowBounds` bornés, `mode`/`profileId`/`source`/`favicon`/`pinned` validés, tableaux reorder bornés. Revue `security-reviewer` : GO, tous findings traités. Sanity en app réelle : tous les flux légitimes passent.
- [x] **[FIX] Smoke refuse un port 9119 occupé** (2026-07-18) — fail-fast avec message clair au lieu de mesurer silencieusement l'instance pré-existante
- [x] **[RELEASE] `pnpm make` validé** (2026-07-18) — `Overframe-Setup.exe` + nupkg + zip produits, addon WebView2 présent en `extraResource`, natifs unpacked OK
- [x] **[RELEASE] README release-ready** (2026-07-18) — captures (home, collections), FAQ (SmartScreen, anti-cheat, borderless, adblock, données locales), tech stack corrigée (WebView2)
- [x] **Raccourci Ctrl+L** — déjà implémenté (App.tsx, handler DOM) ; la tâche était périmée
- [x] **[FIX] Smoke flaky sur `/overlay/show`** (2026-07-18) — poll-until (3 s max, pas de sleep fixe) sur show ET hide ; ALL PASS ×3 consécutifs
- [x] **[BUG court terme] Toggle adblock honnête** (2026-07-18) — case désactivée + bandeau explicatif en langage simple dans Settings → Browser (vérifié visuellement)
- [x] **[TEST] Couverture 100% restaurée après le WIP bannerFocus** (2026-07-18) — +24 tests (CollectionsManager sections/moveLink/sanitizeFocus, backfill quickLinks, appStore.setHomeTab) via qa-tester
- [x] **[FIX] `updateLink` accepte `section: null`** (2026-07-18) — le widening voulu était annulé par le Pick ; section exclue du spread
- [x] **[FIX] `migrateStore` survit à une entrée `null` dans quickLinks** (2026-07-18) — garde + test de régression
- [x] **[DIAG] Attribution IG — adblock in-app hors de cause** (2026-07-18) — igr= survit, profil persistant ; vrais suspects : achats même compte/machine (confirmé par le support IG), tag absent ; re-tester avec de vrais utilisateurs post-release
- [x] **[FEAT] Ancienne compatibilité Electron (Google, Cloudflare)** (2026-06-01) — `feat/browser-compat` ; historique remplacé par WebView2. Les fichiers et contournements listés ci-dessous ont été retirés ; ce résultat ne valide pas le backend actuel
  - Google login : UA Firefox + Sec-Fetch-* cohérents + identité JS complète (userAgent, productSub, oscpu, buildID, plugins:0, chrome:undefined) + auto-retry sur /rejected (clear cookies AEC + redir /signin/identifier)
  - Cloudflare navigation générale : UA Chrome propre + Sec-CH-UA alignés + userAgentData "Google Chrome" + webdriver:false + chrome.loadTimes/csi/runtime corrects + Function.prototype.toString native
  - `src/shared/userAgent.ts` + `src/preload/tabStealth.ts` + `TabManager` onBeforeSendHeaders + `index.ts` disable-blink-features
  - 162 tests, 100% coverage ; typecheck + lint verts
  - **Cloudflare Turnstile OAuth** (poe.ninja, filterblade) : incompatibilité plateforme WebContentsView documentée dans SECURITY.md — solution future : shell.openExternal
- [x] **Durcissement méthode — chaque axe ≥9/10** (2026-06-01)
  - Garde-fous : egress hors-localhost + `node -e` bloqués, permissions scopées
  - `SessionStart` hook (boot avec branche+TASKS+DEVLOG) ; routage auto des guides métier
  - 4 subagents (`security-reviewer`/`qa-tester`/`perf-auditor`/`a11y-reviewer`) + commands `/review-security` `/cover` `/ship`
  - **Smoke produit** `pnpm smoke` (lance la vraie app, vérifie overlay/screenshot/RAM) — ALL PASS
  - `postinstall` installe le pre-commit ; job CI `build-windows` (natif)
- [x] **Audit méthode + couverture logique métier à 100%** (2026-06-01)
  - Hooks réparés : feedback ESLint réellement remonté à Claude (`additionalContext`), `--max-warnings 0`
  - Garde-fou `PreToolUse` : bloque push main / force-push / reset --hard / clean -f / --no-verify / npm add
  - Setup d'autonomie enfin commité **et poussé** sur `origin/chore/claude-setup`
  - 147 tests, **100% stmts/branches/funcs/lines** sur l'allowlist logique (`vitest.config.ts`) + gate 100% en CI
  - Couvre : `[TEST] CollectionsManager` (CRUD + export/import Base64) et `[TEST] SessionManager` (save/restore/autosave)
- [x] Setup autonomie Claude : CLAUDE.md, devLogger, devServer, hooks, DEVLOG, TASKS (2026-05-29)
- [x] Core overlay + états (HIDDEN / FOCUSED / CLICK_THROUGH)
- [x] TabManager + multi-onglets, désormais rendus par Edge WebView2 (`WebView2View`)
- [x] ProfileManager + détection de jeu par polling processus
- [x] CollectionsManager + SessionManager
- [x] ShortcutManager + uiohook (WH_KEYBOARD_LL)
- [x] TrayManager
- [x] Settings panel
- [x] Onboarding + WelcomePage
- [x] MissionsTracker / Achievements
- [x] Auto-updater (GitHub Releases)
- [x] Crash logger

---

## Contraintes permanentes

- **Windows only** — pas de code macOS/Linux tant que la v1.0 n'est pas sortie
- **Zéro dépendance npm** sans accord explicite — auditer avec `pnpm check:deps`
- **Tout code dev-only** doit être gardé par `!app.isPackaged`
- **Tout canal IPC** doit être déclaré dans `src/shared/ipc.ts` avant usage
- **Pas de push direct sur `main`** — toujours passer par une PR depuis `dev`
- **`pnpm typecheck && pnpm lint`** doit passer avant tout commit

---

## Comment utiliser ce fichier (pour Claude)

1. **En début de session** : lis "État actuel" + "En cours" + "Priorité haute" pour choisir ta tâche.
2. **Pendant la session** : déplace la tâche choisie dans "En cours".
3. **En fin de session** : déplace les tâches terminées dans "Done", mets à jour "État actuel", note la date.
4. **Si tu trouves un bug** : ajoute-le en haut de "Priorité haute" avec le tag `[BUG]`.
5. **Si une tâche bloque** : note le blocage en commentaire sur la ligne, ne la supprime pas.
