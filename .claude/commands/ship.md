---
description: Prepare the full Definition-of-Done evidence for human validation before any commit
---

Exécute la checklist "Done" d'Overframe (voir [WORKFLOW.md](../../WORKFLOW.md) §2bis, §6 et §9) pour le travail courant, dans l'ordre. Cette commande n'autorise ni commit, ni push, ni PR ; les instructions humaines explicites de la session priment.

1. **Qualité avant tout commit** : `pnpm typecheck` → `pnpm lint` → `pnpm test:coverage` → `pnpm build` → `pnpm smoke`. Tout doit être vert ; les 100 % de couverture concernent l'allowlist de `vitest.config.ts`, pas tout le produit. Le hook Git (typecheck + lint) ne remplace pas ce protocole. Ne contourne aucun échec ; indique tout check non exécuté et sa raison.
2. **Produit** : coordonne le propriétaire du runtime avant smoke ou lancement de l'app ; ne tue pas une instance inconnue. Si le natif a changé, lance aussi `pnpm build:addon` avant la QA runtime. Le smoke vérifie le boot, les états show/hide et une réponse PNG ; son plafond de 500 MB porte sur Electron seul. Il ne prouve ni les budgets 150/300 MB ni la correction visuelle. Pour toute modification UI, vérifie visuellement et fonctionnellement les features touchées (screenshots, IPC, logs ; observation Windows des surfaces natives si nécessaire). Les endpoints eval/mutation peuvent modifier les données.
3. **Revue de domaine** : selon les fichiers touchés, lance le subagent adéquat (`security-reviewer` pour IPC/preload, `qa-tester` pour logique/régressions, `a11y-reviewer` pour les composants, `perf-auditor` pour tabs/mémoire). Inspecte le diff final et les fichiers non suivis.
4. **Mémoire** : pour les changements significatifs, ajoute une entrée à `.claude/DEVLOG.md` sans réécrire l'historique et mets à jour `TASKS.md`. Distingue implémentation terminée, vérification effectuée et validation humaine en attente.
5. **Validation humaine** : présente les fichiers modifiés, preuves de code/runtime, résultats des checks et revues, limites et checklist humaine. **Attends la validation humaine avant tout commit.** Push et PR nécessitent une demande humaine ; ni merge ni release automatiques, y compris via un tag de release.
