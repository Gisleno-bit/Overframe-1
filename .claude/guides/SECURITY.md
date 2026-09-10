# Guide Sécurité — Overframe

> Claude et Codex lisent ce fichier avant toute modification IPC, navigation, données persistées, ou dépendances.
> Réconciliation du 2026-09-10 sur `ce29252` : preuves de code local, pas une certification de sécurité ni une vérification des services déployés.

---

## Modèle de menace

Overframe est un navigateur superposé sur un PC gaming. Les menaces réelles :

| Menace | Vecteur | Mitigation |
|---|---|---|
| XSS via web content | Page malveillante dans un onglet | Onglets rendus par **Edge WebView2** — processus OS séparé, aucun accès Node, aucun preload Electron |
| Privilege escalation | Renderer → main via IPC | contextIsolation:true, API preload limitée et validation à la frontière IPC ; les lacunes restantes sont listées ci-dessous |
| Navigation dangereuse | URL file:// ou javascript: | `isSafeUrl()` (handlers.ts, requêtes renderer) + garde `NavigationStarting` dans l'addon natif (navigations in-page) |
| Popup hijack | window.open() dans un onglet | `NewWindowRequested` → ouvert en nouvel onglet (http/https uniquement) |
| Data exfiltration | Abus du renderer ou du pont IPC | Pas d'accès Node direct dans le renderer ; contrôler aussi les capacités IPC et les sorties réseau |
| Dépendance compromise | npm supply chain | pnpm check:deps avant chaque ajout |

---

## Checklist par type de modification

### Tout nouveau handler IPC (`src/main/ipc/handlers.ts`)

- [ ] **Valider le type de tous les arguments** — ne jamais faire confiance au renderer
- [ ] **Borner les tailles et valeurs** et vérifier l'émetteur/la frame autorisés pour la capacité exposée ; les types TypeScript ne valident pas les messages à l'exécution
- [ ] **Appliquer `app.isPackaged` si dev-only** — les handlers de debug ne doivent pas exister en prod
- [ ] **Vérifier que le canal est dans `src/shared/ipc.ts`** — pas de string littérale inline

```typescript
// Exemple de validation d'un argument (contrôle d'émetteur à adapter au canal)
ipcMain.handle(IPC.MyChannel, (_e, id: unknown) => {
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return null
  return doSomething(id)
})

// Mauvais
ipcMain.handle('my:channel', (_e, id) => doSomething(id))
```

### Toute navigation / chargement d'URL

- [ ] Requêtes venant du renderer (`tabs:create`, `tabs:navigate`) : contrôle de protocole et de taille via `isSafeBoundedUrl()` (handlers.ts)
- [ ] Entrées web venant du renderer : autoriser uniquement `http:` et `https:`
- [ ] Navigations principales signalées par `NavigationStarting` : conserver la garde native `IsAllowedNavScheme` (http/https/about ; `about:blank` sert notamment au déchargement des onglets). Ne pas présenter cette garde comme un filtre de toutes les sous-ressources
- [ ] Popups (`NewWindowRequested`) : routés en nouvel onglet Overframe, http/https uniquement (`TabManager.handlePopup`)
- [ ] Distinguer l'ouverture dans le navigateur de l'OS : `SystemOpenExternal` accepte http/https/mailto ; ce n'est pas une navigation WebView2

```typescript
// Vérification obligatoire avant tout loadURL demandé par le renderer
if (!isSafeBoundedUrl(url)) return
tabManager.navigate(id, url)
```

### Tout nouveau composant React avec du contenu externe

- [ ] **Jamais `dangerouslySetInnerHTML`** avec des données non contrôlées
- [ ] **Jamais stocker de secrets** (tokens, clés) dans le renderer ou electron-store
- [ ] Si affichage d'URL : utiliser `new URL(url).hostname` pour extraire le domaine, pas de string brute

### Toute nouvelle dépendance npm

- [ ] Obtenir l'accord humain explicite avant l'ajout ; un audit réussi ne remplace pas cet accord
- [ ] Lancer `pnpm check:deps` — script d'audit des dépendances dangereuses
- [ ] Vérifier la licence (MIT, Apache, ISC seulement)
- [ ] Vérifier le nombre de mainteneurs et l'activité (pas de package abandonné)
- [ ] Préférer les packages natifs Node.js si possible

### Modifications electron-store (données persistées)

- [ ] Valider le type et la plage des valeurs avant écriture
- [ ] Jamais stocker de contenu HTML ou de code exécutable
- [ ] Après une migration de schéma : s'assurer que `migrateStore()` couvre les anciens formats

### Content Security Policy (CSP)

La CSP est définie dans `src/main/lifecycle/csp.ts`. Le hook vise les webContents appartenant à une BrowserWindow (overlay et popups), **pas** les onglets WebView2. Son application aux pages locales packagées reste à vérifier en runtime.

- [ ] Toute ressource externe chargée dans la BrowserWindow doit être listée en CSP
- [ ] Ne jamais assouplir `script-src` pour ajouter `unsafe-eval` ou `unsafe-inline`

**Conflit code/politique non résolu :** la constante `CHROME_CSP` contient déjà ces deux permissions, ainsi que `https://www.instant-gaming.com` dans `script-src`, et autorise tout HTTPS dans `connect-src`/`img-src` (`csp.ts:11–20`). Ce constat ne les approuve pas et ne rend pas la politique moins stricte. Le retrait des permissions inutiles et la vérification de la CSP en build packagé nécessitent un changement de code distinct.

---

## Invariants de sécurité — ne jamais briser

1. `contextIsolation: true` sur toutes les BrowserWindows (overlay + popups)
2. `nodeIntegration: false` partout
3. Les onglets sont rendus par **Edge WebView2** (processus OS séparé) — aucun accès Node, aucun preload Electron, aucune liaison `contextBridge`
4. Les URL web des requêtes renderer doivent être validées côté main ; conserver en complément la garde native `NavigationStarting` pour les navigations principales des onglets
5. Le renderer n'a aucun accès direct à Node.js — tout passe par `window.aether.*`
6. Pas d'analytics ni de télémétrie ; ne pas étendre silencieusement les exceptions réseau existantes. Persistance locale ne signifie pas absence de réseau : consulter l'inventaire ci-dessous

### Modèle d'isolation des onglets (WebView2)

Les onglets ne sont **plus** des `WebContentsView` Electron : ils sont rendus par
**Microsoft Edge WebView2** via l'addon natif (`native/webview2-addon`) chargé par
le main. Chaque onglet utilise un `ICoreWebView2Controller` enfant de la fenêtre
overlay ; le contenu est rendu dans les processus WebView2, distincts d'Electron.
Cela ne signifie pas un processus ni un profil de cookies dédié par onglet.

**Conséquences de sécurité** :
- Le contenu web n'a **aucun pont vers Node.js** : il n'y a pas de preload Electron
  ni de `contextBridge` sur les onglets. L'isolation est structurelle (process
  séparé), pas seulement logique.
- L'ancienne pile `tabStealth` / `contextIsolation:false` a été retirée. Le code
  utilise le runtime WebView2 installé ; il ne prouve pas que toutes les connexions
  Google ou challenges Cloudflare réussissent. La validation humaine correspondante
  reste ouverte dans TASKS.md.
- La garde de navigation est appliquée côté natif (`IsAllowedNavScheme` dans
  `webview2_addon.cpp`) : les schémas hors `http(s)`/`about` sont annulés dans
  `NavigationStarting`.
- Les cookies / le stockage des onglets utilisent le même environnement WebView2
  dédié à Overframe (`%APPDATA%\Overframe\WebView2`, chemin natif dans
  `webview2_addon.cpp:250–260`). Les profils de jeu ne sont pas des conteneurs de
  cookies séparés. Le store JSON et les logs Electron utilisent `app.getPath('userData')`
  (`src/main/store/index.ts`, `src/main/utils/{devLogger,crashLogger}.ts`). Ne pas
  confondre ces données avec le dossier d'installation sous `%LOCALAPPDATA%`.

## Réseau et confidentialité — inventaire du code

Cet inventaire décrit les chemins présents ; il ne crée aucune nouvelle autorisation
d'egress et ne garantit ni le comportement des sites tiers ni la configuration des
services en production.

| Surface | Déclencheur et données | Preuve locale |
|---|---|---|
| Onglets WebView2 | Navigation, sous-ressources et activité des sites visités ; comportement tiers distinct de la politique sans télémétrie d'Overframe | TabManager.ts, addon natif |
| Main : partage | Export utilisateur : POST du JSON de collection, avec liens, notes, signature auteur et images présentes. Prévisualisation/import d'un code court : GET du payload | handlers.ts:131–144,451–479, CollectionsManager.exportJson() |
| Main : mises à jour | Builds packagés hors Store : cycle configuré à une heure, plus contrôle manuel ; feed update.electronjs.org et distribution des releases | src/main/index.ts:82–93, handlers.ts:50–74 et handlers Update |
| Renderer : accueil | Lecture du flux GitHub Releases ; chargement de CSS et d'images Instant Gaming, sans clic sur une offre requis pour le CSS | WelcomePage.tsx:199–209,278–292,526 |
| Renderer : images | Favicons Google S2 (nom de domaine transmis), icônes/bannières distantes configurées dans les collections ou profils | TabManager.ts:28–35, collections/atoms.tsx, WelcomePage.tsx |
| Affiliation | Les liens commerciaux peuvent inclure igr=overframe ; le réglage igAutoAffiliate commande l'ajout automatique aux navigations IG | src/shared/ig-affiliate.ts, src/renderer/components/IGNudge.tsx:72–99 |

Le service de partage est configurable par OVERFRAME_SHARE_URL, avec
https://share.overframe.app par défaut. Le worker versionné conserve le payload
dans KV avec une expiration de **90 jours** (scripts/share-worker/index.js:13,86).
La lecture par code ne demande pas d'authentification ; partager le code donne accès
au contenu. Aucun endpoint de suppression n'est implémenté dans ce worker. La
configuration du domaine, les logs de l'hébergeur et une procédure humaine de
suppression ne sont pas vérifiables à partir de ces fichiers.

La page publique landing/app/privacy/page.tsx reste à corriger séparément :
« tout reste local » / « aucune transmission », historique applicatif non retrouvé,
mises à jour seulement au lancement/manuelles, partage « jusqu'à suppression », et
inventaire réseau incomplet. Ne pas garantir l'effacement de toutes les données à
la désinstallation : squirrel.ts:64–75 tente de supprimer userData mais ignore les
erreurs ; le chemin WebView2 est fixé indépendamment. La promesse de traitement
des demandes de suppression sous 30 jours relève d'une validation opérationnelle
humaine, pas de cette revue de code.

## Lacunes de code à traiter séparément

Constats statiques du 2026-09-10 ; aucun exploit ni test des services distants ou du
runtime partagé n'a été exécuté pour valider ces constats.

- **CSP :** conflit avec la politique décrit ci-dessus ; les BrowserWindows utilisent
  aussi sandbox: false (OverlayWindow.ts, PopupWindow.ts). L'absence de Node direct
  ne prouve donc pas le confinement complet du renderer.
- **Frontière IPC :** la validation n'est pas exhaustive. Exemples : PopupOpen
  transmet un payload seulement typé, SystemLayoutMap transmet directement la map
  à Object.entries, et TabsReorder n'a pas de limite de taille
  (handlers.ts:219–225,292–295,335–340, ShortcutManager.ts:76–86). Les contrôles
  d'émetteur sont ponctuels, pas une protection commune à tous les handlers ; les
  fenêtres chrome n'installent pas de garde will-navigate/setWindowOpenHandler.
- **Imports :** la limite Base64 de l'IPC ne borne pas la taille après inflateSync()
  ni le coût de son exécution synchrone dans le main (CollectionsManager.ts:339–357).
  Le décodage accède aussi à parsed.version puis à l.url sans garde contre un objet
  racine ou un élément de links à null (lignes 357,381) : un import malformé peut lever
  une exception au lieu d'être rejeté proprement.
  Le GET de partage lit aussi le corps entier avant la limite, sans timeout explicite
  (handlers.ts:131–144). Risque de blocage ou de consommation mémoire avec un payload
  hostile ; à tester et corriger séparément.
- **Observer dev :** app.isPackaged empêche son démarrage en production et l'écoute
  est sur 127.0.0.1:9119, mais les routes d'évaluation/mutation n'ont pas
  d'authentification ni de validation Host/Origin/méthode (devServer.ts:28–32,120–172,213).
  Le loopback ne suffit pas à considérer ces routes comme des diagnostics en lecture seule.
