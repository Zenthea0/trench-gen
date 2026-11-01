import type { BlocDef, NomCote } from './types.js';
import type { Grille, Options } from './generateur.js';
import { nomCase } from './cases.js';

/**
 * Vérificateur INDÉPENDANT du moteur : il ne partage aucun code de rotation ni de recherche avec
 * generateur.ts / blocs.ts. Il sert de filet de sécurité pour les tests, et à l'application pour
 * signaler en direct les conflits après une modification manuelle (chaque conflit indique les
 * cases concernées pour pouvoir les mettre en évidence sur la carte).
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

export interface Conflit {
  message: string;
  /** Cases (ligne, colonne) à mettre en évidence. */
  cases: [number, number][];
}

export interface Rapport {
  /** Messages des conflits (même ordre que `conflits`). */
  erreurs: string[];
  conflits: Conflit[];
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
  const conflits: Conflit[] = [];
  const ajouter = (message: string, cases: [number, number][]) => conflits.push({ message, cases });
  const rapport = (reseaux: number): Rapport => ({
    conflits,
    erreurs: conflits.map((c) => c.message),
    reseaux,
    utilisation,
  });
  const parId = new Map(blocs.map((b) => [b.id, b]));
  const utilisation: Record<string, number> = {};
  const casesParType = new Map<string, [number, number][]>();

  if (grille.length !== options.lignes || grille.some((l) => l.length !== options.colonnes)) {
    ajouter(`Dimensions de grille incorrectes (attendu ${options.lignes}×${options.colonnes}).`, []);
    return rapport(0);
  }

  const orient = grille.map((ligne, l) =>
    ligne.map((cel, c) => {
      const bloc = parId.get(cel.typeId);
      if (!bloc) {
        ajouter(`Case ${nomCase(l, c)} : type inconnu « ${cel.typeId} ».`, [[l, c]]);
        return null;
      }
      if (!Number.isInteger(cel.rotation) || cel.rotation < 0 || cel.rotation > 3) {
        ajouter(`Case ${nomCase(l, c)} : rotation invalide ${cel.rotation}.`, [[l, c]]);
        return null;
      }
      utilisation[bloc.id] = (utilisation[bloc.id] ?? 0) + 1;
      if (!casesParType.has(bloc.id)) casesParType.set(bloc.id, []);
      casesParType.get(bloc.id)!.push([l, c]);
      // Un groupe d'un seul côté est une fin de tranchée : permise seulement si le bloc l'autorise.
      for (const g of bloc.liaisons) {
        if (g.length < 2 && bloc.fin !== 'autorisee') {
          ajouter(`Le bloc ${nomCase(l, c)} (${bloc.nom}) forme un cul-de-sac interdit.`, [[l, c]]);
        }
      }
      return { bloc, ...orienter(bloc, cel.rotation) };
    }),
  );

  // Stock
  for (const [id, k] of Object.entries(utilisation)) {
    const bloc = parId.get(id)!;
    if (k > bloc.quantite) {
      ajouter(`Stock dépassé : « ${bloc.nom} » (${k} posés pour ${bloc.quantite} disponibles).`, casesParType.get(id) ?? []);
    }
  }

  // Compatibilité des côtés voisins (une seule fois par paire) et bords de table
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
            ajouter(`Le bloc ${nomCase(l, c)} ouvre une tranchée sur le bord de la table, ce qui est désactivé.`, [[l, c]]);
          }
          continue;
        }
        if (d !== 'E' && d !== 'S') continue;
        const b = orient[nl][nc];
        if (!b) continue;
        const cotéB = b.cotes[OPPOSE[d]];
        if (a.cotes[d] !== cotéB) {
          const mot = (t: 'T' | 'S') => (t === 'T' ? 'tranchée' : 'surface');
          ajouter(`Les blocs ${nomCase(l, c)} et ${nomCase(nl, nc)} ne se raccordent pas (${mot(a.cotes[d])} contre ${mot(cotéB)}).`, [
            [l, c],
            [nl, nc],
          ]);
        }
      }
    }
  }

  // Réseaux : graphe de groupes, parcours en largeur
  const cle = (l: number, c: number, g: number) => `${l},${c},${g}`;
  const adj = new Map<string, string[]>();
  const ajouterArete = (x: string, y: string) => {
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
          if (gb >= 0) ajouterArete(cle(l, c, g), cle(nl, nc, gb));
        }
      });
    }
  }
  const vus = new Set<string>();
  const composantes: string[][] = [];
  for (const depart of adj.keys()) {
    if (vus.has(depart)) continue;
    const membres: string[] = [];
    const file = [depart];
    vus.add(depart);
    while (file.length) {
      const x = file.shift()!;
      membres.push(x);
      for (const y of adj.get(x) ?? []) {
        if (!vus.has(y)) {
          vus.add(y);
          file.push(y);
        }
      }
    }
    composantes.push(membres);
  }
  const casesDe = (membres: string[]): [number, number][] => {
    const uniques = new Map<string, [number, number]>();
    for (const k of membres) {
      const [l, c] = k.split(',').map(Number);
      uniques.set(`${l},${c}`, [l, c]);
    }
    return [...uniques.values()];
  };
  const reseaux = composantes.length;

  if (options.unSeulReseau && reseaux > 1) {
    // On met en évidence tout sauf le plus grand réseau.
    const tailles = composantes.map((m) => casesDe(m).length);
    const principal = tailles.indexOf(Math.max(...tailles));
    const autres = composantes.filter((_, i) => i !== principal).flatMap(casesDe);
    ajouter(`La carte contient ${reseaux} réseaux de tranchées séparés alors qu'un seul est demandé.`, autres);
  }

  if (options.exigerSortie === true) {
    for (const membres of composantes) {
      let sortie = false;
      for (const k of membres) {
        const [l, c, g] = k.split(',').map(Number);
        const a = orient[l][c]!;
        const groupe = a.groupes[g];
        if (a.bloc.pente === true && groupe.length === 1) sortie = true;
        if (options.sortieBord) {
          for (const d of groupe) {
            const [dl, dc] = VECTEUR[d];
            const nl = l + dl;
            const nc = c + dc;
            if (nl < 0 || nl >= options.lignes || nc < 0 || nc >= options.colonnes) sortie = true;
          }
        }
      }
      if (!sortie) {
        const [l0, c0] = membres[0].split(',').map(Number);
        const fin = options.sortieBord ? 'ni rampe de sortie ni ouverture sur le bord de la table' : 'pas de rampe de sortie';
        ajouter(`Le réseau passant par ${nomCase(l0, c0)} est complètement fermé : il n'a ${fin}.`, casesDe(membres));
      }
    }
  }

  if (options.minBlocsTranchee !== undefined) {
    let k = 0;
    for (const ligne of orient) for (const x of ligne) if (x && x.bloc.liaisons.length > 0) k++;
    if (k < options.minBlocsTranchee) {
      ajouter(`Seulement ${k} cases de tranchée (minimum ${options.minBlocsTranchee}).`, []);
    }
  }

  return rapport(reseaux);
}
