# Générateur de tranchées — Trench Crusade

Application web (PWA) qui génère des réseaux de tranchées **cohérents** à partir des blocs que possède l'utilisateur. Elle fonctionne sur smartphone et tablette, s'installe sur l'écran d'accueil et marche hors ligne après la première visite.

## Utilisation

- **Blocs** : saisir le nombre d'exemplaires possédés pour chaque type de bloc (enregistré sur l'appareil).
- **Réglages** : taille de la table, tranchées ouvertes ou non sur le bord, un seul réseau ou plusieurs.
- **Carte** : génère et affiche la carte. Toucher une case indique le bloc à y poser. La liste « Blocs à sortir de la boîte » donne le décompte par type. Le bouton d'export produit une image PNG.

## Règles toujours appliquées

- Deux blocs voisins se raccordent : tranchée contre tranchée, surface contre surface.
- Aucune tranchée ne se termine contre un mur. Seule la rampe de sortie peut terminer une tranchée.
- Le stock n'est jamais dépassé.

## Développement

```bash
npm install
npm run dev          # serveur local
npm test             # tests du moteur
npm run bench        # banc d'essai (taux de réussite, temps, validité)
npm run generer      # génération en console (npm run generer -- --help)
npm run build        # typecheck + build de production dans dist/
```

## Déploiement sur GitHub Pages

1. Pousser le code sur la branche `main` d'un dépôt GitHub.
2. Dans **Settings → Pages**, choisir **Source : GitHub Actions**.
3. Chaque `push` sur `main` lance les tests, construit l'application et la publie à l'adresse `https://<utilisateur>.github.io/<depot>/`.

## Ajouter un type de bloc

Tout se passe dans `data/blocs.json`, sans toucher au code :

```json
{ "id": "mon_bloc", "nom": "Mon bloc",
  "cotes": { "N": "T", "E": "S", "S": "T", "O": "S" },
  "liaisons": [["N", "S"]],
  "centre": true, "fin": null, "quantite": 0 }
```

- `id` : minuscules, chiffres et `_`, ne change jamais (il relie le stock sauvegardé).
- `cotes` : `T` (tranchée) ou `S` (surface) pour chaque côté, dans l'orientation de référence.
- `liaisons` : groupes de côtés reliés entre eux à l'intérieur du bloc. Chaque côté `T` doit appartenir à exactement un groupe.
- `centre` : `false` si la tranchée contourne le centre (dessin en courbe).
- `fin` : `"autorisee"` pour un bloc dont une tranchée se termine à l'intérieur (impasse, rampe) : son unique ouverture suit les mêmes règles de raccord que les autres côtés. `"interdite"` ou `null` : le bloc n'est jamais posé s'il a un tel groupe.
- `pente` (optionnel) : `true` si le bloc comporte une pente pour sortir de la tranchée (dessin uniquement).

## Structure

- `src/blocs.ts`, `src/generateur.ts` : moteur (backtracking, sans dépendance au navigateur).
- `src/verificateur.ts` : vérification indépendante des grilles.
- `src/app/` : interface React (dessin SVG des blocs, écrans, stockage local).
- `data/blocs.json` : définition des blocs et quantités d'exemple.
