# Guide Performance — Overframe

> Claude lit ce fichier avant toute tâche `[PERF]` ou toute modification touchant les tabs,
> le polling de détection, le rendu, ou la consommation mémoire.
> État du code vérifié à `ce29252` le 2026-09-10 ; aucune mesure runtime nouvelle dans cette réconciliation.

---

## Pourquoi c'est critique

Overframe tourne **par-dessus un jeu**. Chaque MB de RAM et chaque % de CPU consommés sont volés au jeu. Une app overlay lente ou gourmande est inutilisable, peu importe ses fonctionnalités. La performance n'est pas une optimisation tardive — c'est une contrainte de premier ordre.

---

## Cibles chiffrées (source : PRD §6, TECH_SPEC §10)

| Métrique | Cible |
|---|---|
| RAM idle (overlay caché) | **< 150 MB** |
| RAM active (3 onglets) | **< 300 MB** |
| CPU idle | **< 2 %** |
| Temps de réponse hotkey | **< 100 ms** |
| Cold start | **< 3 s** |

Ces valeurs restent des **objectifs**, pas des résultats acquis. Les anciens budgets main ~30 MB, shell ~50 MB, onglet ~60 MB sont des estimations de conception, pas des coûts mesurés de la pile WebView2 actuelle.

Le DEVLOG du **2026-07-19**, section « Audit RAM », rapporte historiquement ~256 MB après deep-hide et laisse la faisabilité des 150 MB ouverte. Ne pas transformer cette mesure ancienne en résultat du checkout courant, ni relever la cible sans décision humaine.

---

## Mesurer (boucle fermée)

L'Observer dev expose une métrique **partielle** :

```bash
curl http://127.0.0.1:9119/metrics
```

[TabManager.getMemorySnapshot()](../../src/main/managers/TabManager.ts) additionne les métriques des processus Electron via `app.getAppMetrics()` (`privateBytes`, sinon `workingSetSize`). Les processus Edge/WebView2 sont absents et chaque onglet est renvoyé avec `privateKb: 0`. Ainsi :

- `appMb` / `totalMb` couvrent Electron, pas l'ensemble du produit.
- `tabsMb: 0` ne signifie pas que les pages consomment zéro mémoire.
- `tabCount` compte les onglets gérés, y compris les onglets lazy.
- `withinBudget` dans [devServer.ts](../../src/main/utils/devServer.ts) compare le total arrondi à 150/300 avec `<=`, pas le strict `<` de la cible.
- La réponse ne donne ni CPU, ni latence hotkey, ni temps de cold start, ni PID détaillé.

**Protocole de mesure pour une tâche `[PERF]` :**

1. Réserver le runtime partagé (instance unique, port 9119, données utilisateur). Vérifier branche/build/PID ; ne pas tuer l'instance d'un autre agent.
2. Utiliser un build identifié, préciser dev/packagé, HMR/DevTools, matériel, pages, nombre d'onglets et état de l'overlay. Les outils de diagnostic peuvent eux-mêmes modifier le coût mesuré.
3. Mesurer avant changement : visible, immédiatement caché, puis après **plus de 30 s** pour inclure le deep-hide. Conserver la RAM Electron séparée de celle de l'arbre de processus WebView2, avec une métrique cohérente dans le Gestionnaire des tâches ou un outil Windows.
4. Mesurer trois onglets actifs avec les mêmes pages et conditions. Mesurer CPU, latence et cold start séparément ; les endpoints d'évaluation/contrôle sont des mutations.
5. Appliquer le changement puis répéter dans les mêmes conditions.
6. **Consigner avant/après chiffrés, périmètre et limites dans DEVLOG.md.** Sans observation des processus natifs, ne pas affirmer que la cible RAM totale est atteinte.

Le harnais existant `scripts/measure-idle.mjs` peut aider à reproduire une observation Electron, mais ne corrige pas les limites de `/metrics`. Les screenshots `capturePage()` de l'Observer ne prouvent pas le rendu natif WebView2.

---

## Mécanismes d'optimisation déjà en place

Ne pas les casser. Les comprendre avant de toucher au rendu ou aux tabs :

| Mécanisme | Où | Comportement vérifié dans le code |
|---|---|---|
| Pause média au hide | `index.ts` → `TabManager.pauseAllMedia()` | Tente de mettre en pause les éléments HTML video/audio ; ne garantit pas l'arrêt de tout traitement audio/JS |
| Arrêt des chargements | `TabManager.suspendAll()` | Stoppe seulement les chargements en cours ; aucun appel WebView2 `TrySuspend`, aucune garantie que les pages chargées cessent d'exécuter leur JS |
| Mode performance | `TabManager.unloadAll()` | Navigue les onglets chargés non protégés vers about:blank ; conserve les contrôleurs, ignore les onglets lazy et domaines protégés ; recharge au show |
| Deep-hide | `OverlayWindow`, délai 30 s | Opacité zéro immédiatement, puis `win.hide()` et throttling du renderer Electron ; show annule le délai/rétablit le rendu |
| Fenêtres compagnes | `index.ts` → `PopupWindow.releaseCompanionWindows()` | Détruit promo IG/achievement au deep-hide, avec recréation lazy |
| Broadcast mémoire | `index.ts` | Timer 1 Hz actif seulement quand l'overlay est visible |
| Poll idle/active | `ProfileManager.setPollMode()` | 5 s actif / 15 s idle ; hide demande idle seulement avec le profil par défaut, visibilité/détection de jeu rétablit actif |
| Restauration lazy | `onFirstShow()` + `SessionManager` | Restaure au premier show ; onglets inactifs différés jusqu'à activation. Le démarrage normal montre l'overlay, `--hidden` le diffère |
| Sauvegardes | `index.ts`, `SessionManager` | Session toutes les 15 s, retrait d'onglet debouncé 300 ms, changement de profil/quit ; bounds debouncées 500 ms |

**Écart à corriger en code :** l'autosave ne vérifie pas que la restauration initiale/différée a eu lieu. Démarrer `--hidden` ou différer un changement de profil peut écraser une session avant son chargement. Ne pas décrire la restauration comme garantie sans ce correctif et ses tests.

Sources : [index.ts](../../src/main/index.ts), [OverlayWindow.ts](../../src/main/windows/OverlayWindow.ts), [TabManager.ts](../../src/main/managers/TabManager.ts), [SessionManager.ts](../../src/main/managers/SessionManager.ts), [ProfileManager.ts](../../src/main/managers/ProfileManager.ts), [types.ts](../../src/shared/types.ts).

---

## Anti-patterns à éviter

- **Polling serré** — tout `setInterval` < 1 s doit être justifié ; préserver l'adaptation 5/15 s de la détection.
- **Listeners non nettoyés** — prévoir `.off()` / cleanup à chaque abonnement, notamment pour les contrôleurs natifs recréés.
- **État lourd dans Zustand** — ne pas stocker d'objets volumineux (favicons base64, HTML) dans le store renderer ; les garder côté main. Le `TabState` actuel contient un favicon : examiner sa taille et son usage sans traiter l'existant comme une autorisation d'élargir cette exception.
- **Re-render React en cascade** — vérifier qu'un changement d'état ne re-rend pas toute l'arbre. Mémoïser (`useMemo`/`memo`) les composants de liste (onglets, collections).
- **Charger avant d'avoir besoin** — pas de préchargement de panels/onglets non demandés au démarrage (casse le cold start). La restauration lazy ne signifie pas zéro trafic : les appels réseau indépendants des onglets restent à documenter.

---

## Checklist tâche `[PERF]`

- [ ] Métrique mesurée AVANT (chiffre dans DEVLOG), avec périmètre Electron/WebView2 explicite
- [ ] Changement appliqué
- [ ] Métrique mesurée APRÈS dans les mêmes conditions (chiffre dans DEVLOG)
- [ ] Cible atteinte (< 150 MB idle / < 300 MB actif) ; tout changement de cible ou exception nécessite une décision humaine explicite, consignée avant de déclarer la tâche terminée
- [ ] Aucun mécanisme d'optimisation existant cassé, notamment hide/show rapide et après 30 s
- [ ] Aucune régression fonctionnelle (`pnpm test` vert) ; vérifier sessions, médias et domaines protégés
- [ ] Tests et gates WORKFLOW exécutés selon scope ; résultats non exécutés clairement signalés
- [ ] Tous les listeners ajoutés ont leur cleanup
- [ ] Validation gaming humaine avant toute conclusion sur l'impact in-game
