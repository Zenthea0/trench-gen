import type { BlocDef, NomCote } from './types.js';
import type { Grille, Options } from './generateur.js';

/**
 * Vérificateur INDÉPENDANT du moteur : il ne partage aucun code de rotation ni de recherche avec
 * generateur.ts / blocs.ts. Il sert de filet de sécurité pour les tests et pour l'application.
 */

const NOMS: NomCote[] = ['N', 'E', 'S', 'O'];
const SUIVANT: Record<NomCote, NomCote> = { N: 'E', E: 'S', S: 'O', O: 'N' };
const OPPOSE: Record<NomCote, NomCote> = { N: 'S', S: 'N', E: 'O', O: 'E' };
const VECTEUR: Record<NomCote, [number, number]> = { N: [-1, 0], S: [1, 0], E: [0, 1], O: [0, -1] };

function tourner(c: NomCote, quarts: number): NomCote {
  let r = c;
  for (let i = 0; i < ((quarts % 4) + 4) % 4; i++) r = SUIVANT[r];
  return r;
}

/** Types de côté d'un bloc après rotation, et ses groupes de liaison pivotés. */
function orienter(bloc: BlocDef, rotation: number) {
  const cotes = {} as Record<NomCote, 'T' | 'S'>;
  for (const c of NOMS) cotes[tourner(c, rotation)] = bloc.cotes[c];
  const groupes = bloc.liaisons.map((g) => g.map((c) => tourner(c, rotation)));
  return { cotes, groupes };
}

export interface Rapport {
  erreurs: string[];
  /** Nombre de réseaux de tranchée distincts. */
  reseaux: number;
  /** Utilisation du stock par type. */
  utilisation: Record<string, number>;
}

export function verifier(
  grille: Grille,
  blocs: BlocDef[],
  options: Pick<Options, 'lignes' | 'colonnes' | 'sortieBord' | 'unSeulReseau'> & Partial<Options>,
): Rapport {
  const erreurs: string[] = [];
  const parId = new Map(blocs.map((b) => [b.id, b]));
  const utilisation: Record<string, number> = {};

  if (grille.length !== options.lignes || grille.some((l) => l.length !== options.colonnes)) {
    erreurs.push(`Dimensions de grille incorrectes (attendu ${options.lignes}×${options.colonnes}).`);
    return { erreurs, reseaux: 0, utilisation };
  }

  const orient = grille.map((ligne, l) =>
    ligne.map((cel, c) => {
      const bloc = parId.get(cel.typeId);
      if (!bloc) {
        erreurs.push(`Case (${l},${c}) : type inconnu « ${cel.typeId} ».`);
        return null;
      }
      if (!Number.isInteger(cel.rotation) || cel.rotation < 0 || cel.rotation > 3) {
        erreurs.push(`Case (${l},${c}) : rotation invalide ${cel.rotation}.`);
        return null;
      }
      utilisation[bloc.id] = (utilisation[bloc.id] ?? 0) + 1;
      // Un groupe d'un seul côté est un cul-de-sac, sauf si la fin est autorisée.
      for (const g of bloc.liaisons) {
        if (g.length < 2 && bloc.fin !== 'autorisee') {
          erreurs.push(`Case (${l},${c}) : « ${bloc.id} » forme un cul-de-sac interdit.`);
        }
      }
      return { bloc, ...orienter(bloc, cel.rotation) };
    }),
  );

  // Stock
  for (const [id, k] of Object.entries(utilisation)) {
    const q = parId.get(id)!.quantite;
    if (k > q) erreurs.push(`Stock dépassé pour « ${id} » : ${k} posés pour ${q} disponibles.`);
  }

  // Compatibilité des côtés et bords
  for (let l = 0; l < options.lignes; l++) {
    for (let c = 0; c < options.colonnes; c++) {
      const a = orient[l][c];
      if (!a) continue;
      for (const d of NOMS) {
        const [dl, dc] = VECTEUR[d];
        const nl = l + dl;
        const nc = c + dc;
        const dehors = nl < 0 || nl >= options.lignes || nc < 0 || nc >= options.colonnes;
        if (dehors) {
          if (a.cotes[d] === 'T' && !options.sortieBord) {
            erreurs.push(`Case (${l},${c}) : tranchée vers le bord de table (${d}) alors que c'est interdit.`);
          }
          continue;
        }
        const b = orient[nl][nc];
        if (!b) continue;
        if (a.cotes[d] !== b.cotes[OPPOSE[d]]) {
          erreurs.push(`Cases (${l},${c}) et (${nl},${nc}) : côtés incompatibles (${a.cotes[d]} contre ${b.cotes[OPPOSE[d]]}).`);
        }
      }
    }
  }

  // Réseaux : graphe de groupes, parcours en largeur
  const cle = (l: number, c: number, g: number) => `${l},${c},${g}`;
  const adj = new Map<string, string[]>();
  const ajouter = (x: string, y: string) => {
    if (!adj.has(x)) adj.set(x, []);
    adj.get(x)!.push(y);
  };
  for (let l = 0; l < options.lignes; l++) {
    for (let c = 0; c < options.colonnes; c++) {
      const a = orient[l][c];
      if (!a) continue;
      a.groupes.forEach((_, g) => {
        if (!adj.has(cle(l, c, g))) adj.set(cle(l, c, g), []);
      });
      a.groupes.forEach((groupe, g) => {
        for (const d of groupe) {
          const [dl, dc] = VECTEUR[d];
          const nl = l + dl;
          const nc = c + dc;
          if (nl < 0 || nl >= options.lignes || nc < 0 || nc >= options.colonnes) continue;
          const b = orient[nl][nc];
          if (!b) continue;
          const gb = b.groupes.findIndex((gr) => gr.includes(OPPOSE[d]));
          if (gb >= 0) ajouter(cle(l, c, g), cle(nl, nc, gb));
        }
      });
    }
  }
  const vus = new Set<string>();
  let reseaux = 0;
  for (const depart of adj.keys()) {
    if (vus.has(depart)) continue;
    reseaux++;
    const file = [depart];
    vus.add(depart);
    while (file.length) {
      const x = file.shift()!;
      for (const y of adj.get(x) ?? []) {
        if (!vus.has(y)) {
          vus.add(y);
          file.push(y);
        }
      }
    }
  }
  if (options.unSeulReseau && reseaux > 1) {
    erreurs.push(`${reseaux} réseaux distincts alors qu'un seul est demandé.`);
  }
  if (options.minBlocsTranchee !== undefined) {
    let k = 0;
    for (const ligne of orient) for (const x of ligne) if (x && x.bloc.liaisons.length > 0) k++;
    if (k < options.minBlocsTranchee) {
      erreurs.push(`Seulement ${k} cases de tranchée (minimum ${options.minBlocsTranchee}).`);
    }
  }

  return { erreurs, reseaux, utilisation };
}
