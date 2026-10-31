import type { BlocDef } from './types.js';
import { construireVariantes } from './blocs.js';

export interface Options {
  lignes: number;
  colonnes: number;
  /** Une tranchée peut-elle déboucher sur le bord de la table ? */
  sortieBord: boolean;
  /** true = un seul réseau connexe ; false = plusieurs réseaux acceptés. */
  unSeulReseau: boolean;
  /** 0..1 : tendance à poser des blocs de tranchée plutôt que des blocs plats. */
  densite: number;
  /** Graine du générateur aléatoire (même graine + mêmes paramètres = même résultat). */
  graine: number;
  /** Budget de temps total en millisecondes. */
  tempsMaxMs: number;
  /** Nombre de nœuds explorés avant de recommencer avec un nouveau tirage (redémarrage). */
  noeudsParEssai: number;
  /** Nombre minimal de cases contenant au moins une tranchée. */
  minBlocsTranchee: number;
}

export const OPTIONS_DEFAUT: Options = {
  lignes: 6,
  colonnes: 6,
  sortieBord: true,
  unSeulReseau: true,
  densite: 0.6,
  graine: 1,
  tempsMaxMs: 2000,
  noeudsParEssai: 20000,
  minBlocsTranchee: 0,
};

export interface CellulePosee {
  typeId: string;
  /** Nombre de quarts de tour horaires par rapport à l'orientation de référence (0..3). */
  rotation: number;
}
export type Grille = CellulePosee[][];

export interface Stats {
  essais: number;
  noeuds: number;
  ms: number;
}

export type Resultat =
  | { ok: true; grille: Grille; stats: Stats }
  | { ok: false; raison: string; stats: Stats };

const DL = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];
const OPP = [2, 3, 0, 1];

/** Générateur pseudo-aléatoire déterministe. */
export function mulberry32(graine: number): () => number {
  let a = graine | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Code = 'ok' | 'epuise' | 'limite';

/**
 * Génère une grille cohérente par backtracking (problème de satisfaction de contraintes) :
 *  - on choisit toujours la case la plus contrainte (moins de blocs possibles) ;
 *  - on essaie ses candidats dans un ordre aléatoire pondéré ;
 *  - on recommence avec un nouveau tirage si un essai dépasse son budget de nœuds ;
 *  - si l'exploration complète d'un essai échoue, le problème est prouvé impossible.
 */
export function generer(blocs: BlocDef[], options: Partial<Options> = {}): Resultat {
  const o: Options = { ...OPTIONS_DEFAUT, ...options };
  const t0 = Date.now();
  const stats: Stats = { essais: 0, noeuds: 0, ms: 0 };
  const echec = (raison: string): Resultat => {
    stats.ms = Date.now() - t0;
    return { ok: false, raison, stats };
  };

  if (!Number.isInteger(o.lignes) || !Number.isInteger(o.colonnes) || o.lignes < 1 || o.colonnes < 1) {
    return echec('Dimensions de table invalides.');
  }

  const { variantes, types } = construireVariantes(blocs);
  const n = o.lignes * o.colonnes;
  const stockTotal = types.reduce((s, t) => s + t.quantite, 0);
  if (stockTotal < n) {
    return echec(`Stock insuffisant : ${stockTotal} blocs utilisables pour ${n} cases.`);
  }

  const G = Math.max(1, ...variantes.map((v) => v.groupes.length));
  const voisin = new Int32Array(n * 4).fill(-1);
  for (let l = 0; l < o.lignes; l++) {
    for (let c = 0; c < o.colonnes; c++) {
      for (let d = 0; d < 4; d++) {
        const nl = l + DL[d];
        const nc = c + DC[d];
        if (nl >= 0 && nl < o.lignes && nc >= 0 && nc < o.colonnes) {
          voisin[(l * o.colonnes + c) * 4 + d] = nl * o.colonnes + nc;
        }
      }
    }
  }

  const poidsVide = Math.max(1e-3, (1 - o.densite) / Math.max(o.densite, 1e-3));
  const rng = mulberry32(o.graine);

  // État de la recherche
  const grille = new Int32Array(n).fill(-1);
  const utilise = new Array<number>(types.length).fill(0);
  let assignes = 0;
  let stockRestant = stockTotal;
  let noeudsEssai = 0;

  const reinitialiser = () => {
    grille.fill(-1);
    utilise.fill(0);
    assignes = 0;
    stockRestant = stockTotal;
    noeudsEssai = 0;
  };

  /** Variantes posables sur une case, vu l'état courant. */
  const domaine = (cell: number): number[] => {
    const res: number[] = [];
    for (let vi = 0; vi < variantes.length; vi++) {
      const v = variantes[vi];
      if (utilise[v.typeIndex] >= types[v.typeIndex].quantite) continue;
      let ok = true;
      for (let d = 0; d < 4 && ok; d++) {
        const nb = voisin[cell * 4 + d];
        if (nb < 0) {
          if (v.cotes[d] && !o.sortieBord) ok = false;
        } else {
          const g = grille[nb];
          if (g >= 0 && variantes[g].cotes[OPP[d]] !== v.cotes[d]) ok = false;
        }
      }
      if (ok) res.push(vi);
    }
    return res;
  };

  // Analyse des réseaux (union-find sur les groupes de tranchée des cases posées)
  const parent = new Int32Array(n * G);
  const trouver = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const analyserReseaux = (): { total: number; fermes: number } => {
    for (let i = 0; i < parent.length; i++) parent[i] = i;
    for (let cell = 0; cell < n; cell++) {
      const vi = grille[cell];
      if (vi < 0) continue;
      const v = variantes[vi];
      for (let d = 0; d < 4; d++) {
        if (!v.cotes[d]) continue;
        const nb = voisin[cell * 4 + d];
        if (nb < 0 || grille[nb] < 0) continue;
        const w = variantes[grille[nb]];
        const a = trouver(cell * G + v.groupeDeCote[d]);
        const b = trouver(nb * G + w.groupeDeCote[OPP[d]]);
        if (a !== b) parent[a] = b;
      }
    }
    const present = new Set<number>();
    const ouvert = new Set<number>();
    for (let cell = 0; cell < n; cell++) {
      const vi = grille[cell];
      if (vi < 0) continue;
      const v = variantes[vi];
      for (let g = 0; g < v.groupes.length; g++) present.add(trouver(cell * G + g));
      for (let d = 0; d < 4; d++) {
        if (!v.cotes[d]) continue;
        const nb = voisin[cell * 4 + d];
        if (nb >= 0 && grille[nb] < 0) ouvert.add(trouver(cell * G + v.groupeDeCote[d]));
      }
    }
    let fermes = 0;
    for (const r of present) if (!ouvert.has(r)) fermes++;
    return { total: present.size, fermes };
  };

  const nbCasesTranchee = (): number => {
    let k = 0;
    for (let cell = 0; cell < n; cell++) if (grille[cell] >= 0 && !variantes[grille[cell]].vide) k++;
    return k;
  };

  /** Ordre d'essai aléatoire pondéré (tirage sans remise, Efraimidis-Spirakis). */
  const ordonner = (dom: number[]): number[] => {
    const cles = dom.map((vi) => {
      const w = variantes[vi].vide ? poidsVide : 1;
      return { vi, k: Math.pow(rng(), 1 / w) };
    });
    cles.sort((a, b) => b.k - a.k);
    return cles.map((x) => x.vi);
  };

  const rec = (): Code => {
    if (assignes === n) {
      if (o.unSeulReseau && analyserReseaux().total > 1) return 'epuise';
      if (nbCasesTranchee() < o.minBlocsTranchee) return 'epuise';
      return 'ok';
    }
    noeudsEssai++;
    stats.noeuds++;
    if (noeudsEssai > o.noeudsParEssai || Date.now() - t0 > o.tempsMaxMs) return 'limite';
    if (stockRestant < n - assignes) return 'epuise';

    if (o.unSeulReseau && assignes > 0) {
      const r = analyserReseaux();
      // Un réseau fermé ne peut plus grandir : s'il en existe un autre, c'est perdu.
      if (r.total >= 2 && r.fermes >= 1) return 'epuise';
    }

    // Case la plus contrainte (départage aléatoire)
    let meilleure = -1;
    let meilleurDom: number[] = [];
    let egalites = 0;
    for (let cell = 0; cell < n; cell++) {
      if (grille[cell] >= 0) continue;
      const dom = domaine(cell);
      if (dom.length === 0) return 'epuise';
      if (meilleure < 0 || dom.length < meilleurDom.length) {
        meilleure = cell;
        meilleurDom = dom;
        egalites = 1;
      } else if (dom.length === meilleurDom.length) {
        egalites++;
        if (rng() * egalites < 1) {
          meilleure = cell;
          meilleurDom = dom;
        }
      }
    }

    for (const vi of ordonner(meilleurDom)) {
      const ti = variantes[vi].typeIndex;
      grille[meilleure] = vi;
      utilise[ti]++;
      assignes++;
      stockRestant--;
      const r = rec();
      if (r !== 'epuise') return r;
      grille[meilleure] = -1;
      utilise[ti]--;
      assignes--;
      stockRestant++;
    }
    return 'epuise';
  };

  while (Date.now() - t0 < o.tempsMaxMs) {
    stats.essais++;
    reinitialiser();
    const r = rec();
    if (r === 'ok') {
      const resultat: Grille = [];
      for (let l = 0; l < o.lignes; l++) {
        const ligne: CellulePosee[] = [];
        for (let c = 0; c < o.colonnes; c++) {
          const v = variantes[grille[l * o.colonnes + c]];
          ligne.push({ typeId: v.typeId, rotation: v.rotation });
        }
        resultat.push(ligne);
      }
      stats.ms = Date.now() - t0;
      return { ok: true, grille: resultat, stats };
    }
    if (r === 'epuise') return echec('Aucune configuration possible avec ces paramètres (stock et règles).');
  }
  return echec('Temps imparti dépassé sans solution trouvée.');
}
