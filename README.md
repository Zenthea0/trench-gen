# Générateur de tranchées — Trench Crusade

Application web (PWA) qui génère des réseaux de tranchées **cohérents** à partir des blocs que possède l'utilisateur. Elle fonctionne sur smartphone et tablette, s'installe sur l'écran d'accueil et marche hors ligne après la première visite.

## Utilisation

- **Blocs** : saisir le nombre d'exemplaires possédés pour chaque type de bloc (enregistré sur l'appareil).
- **Réglages** : taille de la table, tranchées ouvertes ou non sur le bord, un seul réseau ou plusieurs.
- **Carte** : génère et affiche la carte. La liste « Blocs à sortir de la boîte » donne le décompte par type. Le bouton d'export produit une image PNG.

### Sélectionner et modifier des blocs

- **Toucher un bloc** le sélectionne (cadre orange et cadenas) et ouvre le panneau de modification : changer le type (aperçus, stock affiché) ou tourner le bloc à gauche ou à droite.
- **Appui long** sur un bloc (Ctrl ou Maj + clic sur ordinateur) active la sélection multiple : un toucher ajoute ou retire un bloc. Plusieurs blocs sélectionnés ne sont pas modifiables. « Tout désélectionner » quitte le mode.
- Si une modification casse une règle active (raccord, bord, réseau fermé, plusieurs réseaux, stock), un avertissement liste les règles non respectées et les cases concernées sont encadrées en rouge. Tout disparaît dès que les règles sont de nouveau respectées. Un type dont le stock est épuisé reste choisissable : il est seulement signalé.
- **Regénérer** conserve les blocs sélectionnés (type et orientation) et recalcule le reste. Si ces blocs sont incompatibles entre eux ou dépassent le stock, la génération est refusée avec un message qui explique pourquoi.

## Règles

Toujours appliquées :
- Deux blocs voisins se raccordent : tranchée contre tranchée, surface contre surface.
- Le stock n'est jamais dépassé.

Réglables (onglet Réglages) :
- **Tranchées ouvertes sur le bord** de la table (autorisé par défaut).
- **Un seul réseau** de tranchées (par défaut), ou plusieurs.
- **Aucune tranchée fermée** (par défaut) : chaque réseau a au moins une rampe de sortie ou, si c'est autorisé, une ouverture sur le bord de la table. L'impasse ne compte pas comme sortie.

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
- `centre` : `false` si la tranchée ne passe pas par le centre (dessin en ligne droite en diagonale entre deux côtés voisins).
- `fin` : `"autorisee"` pour un bloc dont une tranchée se termine à l'intérieur (impasse, rampe) : son unique ouverture suit les mêmes règles de raccord que les autres côtés. `"interdite"` ou `null` : le bloc n'est jamais posé s'il a un tel groupe.
- `pente` (optionnel) : `true` si le bloc est une rampe de sortie. Elle compte comme sortie pour la règle « Aucune tranchée fermée » et se dessine avec une pente.

## Structure

- `src/blocs.ts`, `src/generateur.ts` : moteur (backtracking, sans dépendance au navigateur).
- `src/verificateur.ts` : vérification indépendante des grilles.
- `src/app/` : interface React (dessin SVG des blocs, écrans, stockage local).
- `data/blocs.json` : définition des blocs et quantités d'exemple.
