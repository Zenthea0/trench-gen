import type { BlocDef, Symetrie } from './types.js';
import { construireVariantes, estUtilisable, signatureSymetrique, varianteDe } from './blocs.js';
import { caseSymetrique, nomCase } from './cases.js';

/** Un bloc imposé : il est conservé tel quel (type et orientation) par la génération. */
export interface CelluleFixe {
  l: number;
  c: number;
  typeId: string;
  rotation: number;
}

export interface Options {
  lignes: number;
  colonnes: number;
  /** Une tranchée peut-elle déboucher sur le bord de la table ? */
  sortieBord: boolean;
  /** Nombre exact de réseaux de tranchées (1 à 6), ou null = aucune exigence (nombre libre). */
  nbReseaux: number | null;
  /**
   * true = aucun réseau de tranchées ne peut être complètement fermé : chacun doit avoir
   * au moins une rampe de sortie ou, si c'est autorisé, une ouverture sur le bord de la table.
   */
  exigerSortie: boolean;
  /**
   * Symétrie de la table. Une case et sa case symétrique reçoivent toujours des blocs du même
   * type (posés par paires) ; au centre ou sur l'axe, le bloc doit être identique à son image.
   */
  symetrie: Symetrie;
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
  /** Blocs imposés, conservés en l'état (leurs symétriques sont imposés aussi). */
  fixes: CelluleFixe[];
}

export const OPTIONS_DEFAUT: Options = {
  lignes: 6,
  colonnes: 6,
  sortieBord: true,
  nbReseaux: 1,
  exigerSortie: true,
  symetrie: 'aucune',
  densite: 0.6,
  graine: 1,
  tempsMaxMs: 2000,
  noeudsParEssai: 20000,
  minBlocsTranchee: 0,
  fixes: [],
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
 *  - les blocs imposés (options.fixes) et leurs symétriques sont posés d'abord ;
 *  - avec une symétrie, on décide pour une « orbite » (une case et sa symétrique) à la fois ;
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

  if (o.nbReseaux !== null && (!Number.isInteger(o.nbReseaux) || o.nbReseaux < 1 || o.nbReseaux > 6)) {
    return echec('Le nombre de réseaux doit être compris entre 1 et 6, ou laissé libre.');
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

  // --- Symétrie : case symétrique de chaque case, et variante symétrique de chaque variante ---
  const sym = o.symetrie;
  const symActive = sym !== 'aucune';
  const miroirCase = new Int32Array(n);
  for (let l = 0; l < o.lignes; l++) {
    for (let c = 0; c < o.colonnes; c++) {
      const [ml, mc] = caseSymetrique(l, c, o.lignes, o.colonnes, sym);
      miroirCase[l * o.colonnes + c] = ml * o.colonnes + mc;
    }
  }
  // miroirVar[v] : variante du MÊME type qui est l'image de v (-1 si elle n'existe pas).
  const miroirVar = new Int32Array(variantes.length).fill(-1);
  if (sym !== 'aucune') {
    const parSignature = new Map<string, number>();
    variantes.forEach((v, i) => parSignature.set(`${v.typeId}|${v.signature}`, i));
    variantes.forEach((v, i) => {
      const j = parSignature.get(`${v.typeId}|${signatureSymetrique(v, sym)}`);
      if (j !== undefined) miroirVar[i] = j;
    });

    // Le stock est consommé par paires du même type (un seul bloc au centre ou sur l'axe) :
    // on le vérifie d'emblée pour donner une explication claire plutôt qu'un échec de recherche.
    let casesPropres = 0;
    for (let cell = 0; cell < n; cell++) if (miroirCase[cell] === cell) casesPropres++;
    let capacitePaires = 0;
    let singlesPossibles = 0;
    types.forEach((t, ti) => {
      const indices = variantes.map((_, i) => i).filter((i) => variantes[i].typeIndex === ti);
      if (indices.some((i) => miroirVar[i] >= 0)) capacitePaires += 2 * Math.floor(t.quantite / 2);
      if (indices.some((i) => miroirVar[i] === i)) singlesPossibles += t.quantite % 2;
    });
    const capacite = capacitePaires + Math.min(casesPropres, singlesPossibles);
    if (capacite < n) {
      return echec(
        `Stock insuffisant pour la symétrie : les blocs sont posés par paires du même type, ` +
          `ce stock ne permet de remplir que ${capacite} cases sur ${n}.`,
      );
    }
  }
  const lieuPropre = sym === 'centrale' ? 'au centre de la table' : "sur l'axe de symétrie";

  // --- Blocs imposés : validation avant toute recherche, avec des messages précis ---
  const fixesOrig = new Map<number, CelluleFixe>();
  for (const f of o.fixes) {
    if (!Number.isInteger(f.l) || !Number.isInteger(f.c) || f.l < 0 || f.l >= o.lignes || f.c < 0 || f.c >= o.colonnes) {
      return echec('Un bloc figé est en dehors de la table.');
    }
    fixesOrig.set(f.l * o.colonnes + f.c, f);
  }
  const compteFixe = new Map<string, number>();
  for (const [, f] of fixesOrig) {
    const def = blocs.find((b) => b.id === f.typeId);
    if (!def) return echec(`Bloc figé inconnu : « ${f.typeId} ».`);
    if (!estUtilisable(def)) return echec(`Le bloc figé en ${nomCase(f.l, f.c)} (${def.nom}) ne peut pas être posé.`);
    compteFixe.set(def.id, (compteFixe.get(def.id) ?? 0) + 1);
  }
  for (const [id, k] of compteFixe) {
    const def = blocs.find((b) => b.id === id)!;
    if (k > def.quantite) {
      return echec(`Les blocs figés dépassent le stock : « ${def.nom} » (${k} figés pour ${def.quantite} disponibles).`);
    }
  }
  const explicites = new Map<number, number>(); // case -> indice de variante
  for (const [cell, f] of fixesOrig) {
    const def = blocs.find((b) => b.id === f.typeId)!;
    const signature = varianteDe(def, f.rotation).signature;
    explicites.set(cell, variantes.findIndex((v) => v.typeId === f.typeId && v.signature === signature));
  }
  const fixesIdx = new Map<number, number>(explicites);
  if (symActive) {
    for (const [cell, vi] of explicites) {
      const l = Math.floor(cell / o.colonnes);
      const c = cell % o.colonnes;
      const m = miroirVar[vi];
      if (m < 0) return echec(`Le bloc figé en ${nomCase(l, c)} n'a pas de symétrique possible.`);
      const mc = miroirCase[cell];
      if (mc === cell) {
        if (m !== vi) return echec(`Le bloc figé en ${nomCase(l, c)} est ${lieuPropre} : il doit être identique à son symétrique.`);
        continue;
      }
      const autre = explicites.get(mc);
      if (autre !== undefined && autre !== m) {
        return echec(
          `Les blocs figés en ${nomCase(l, c)} et ${nomCase(Math.floor(mc / o.colonnes), mc % o.colonnes)} ne sont pas symétriques.`,
        );
      }
      fixesIdx.set(mc, m); // le symétrique d'un bloc figé est figé lui aussi
    }
    const compteTotal = new Map<number, number>();
    for (const vi of fixesIdx.values()) {
      const ti = variantes[vi].typeIndex;
      compteTotal.set(ti, (compteTotal.get(ti) ?? 0) + 1);
    }
    for (const [ti, k] of compteTotal) {
      if (k > types[ti].quantite) {
        const def = blocs.find((b) => b.id === types[ti].id)!;
        return echec(
          `Les blocs figés et leurs symétriques dépassent le stock : « ${def.nom} » (${k} nécessaires pour ${types[ti].quantite} disponibles).`,
        );
      }
    }
  }
  for (const [cell, vi] of fixesIdx) {
    const v = variantes[vi];
    const l = Math.floor(cell / o.colonnes);
    const c = cell % o.colonnes;
    for (let d = 0; d < 4; d++) {
      const nb = voisin[cell * 4 + d];
      if (nb < 0) {
        if (v.cotes[d] && !o.sortieBord) {
          return echec(`Le bloc figé en ${nomCase(l, c)} ouvre une tranchée sur le bord de la table, ce qui est désactivé.`);
        }
      } else {
        const w = fixesIdx.get(nb);
        if (w !== undefined && variantes[w].cotes[OPP[d]] !== v.cotes[d]) {
          return echec(
            `Les blocs figés en ${nomCase(l, c)} et ${nomCase(Math.floor(nb / o.colonnes), nb % o.colonnes)} ne se raccordent pas.`,
          );
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
    for (const [cell, vi] of fixesIdx) {
      grille[cell] = vi;
      utilise[variantes[vi].typeIndex]++;
      assignes++;
      stockRestant--;
    }
  };

  /** Une variante peut-elle être posée sur une case, vu l'état courant (stock, voisins, bord) ? */
  const posable = (cell: number, vi: number): boolean => {
    const v = variantes[vi];
    if (utilise[v.typeIndex] >= types[v.typeIndex].quantite) return false;
    for (let d = 0; d < 4; d++) {
      const nb = voisin[cell * 4 + d];
      if (nb < 0) {
        if (v.cotes[d] && !o.sortieBord) return false;
      } else {
        const g = grille[nb];
        if (g >= 0 && variantes[g].cotes[OPP[d]] !== v.cotes[d]) return false;
      }
    }
    return true;
  };

  /**
   * Variantes possibles pour une case. Avec une symétrie, on exige aussi que l'image de la
   * variante soit posable sur la case symétrique (voisins, bord, stock pour 2 blocs).
   */
  const domaine = (cell: number): number[] => {
    const res: number[] = [];
    const mir = miroirCase[cell];
    for (let vi = 0; vi < variantes.length; vi++) {
      if (!posable(cell, vi)) continue;
      if (!symActive) {
        res.push(vi);
        continue;
      }
      const m = miroirVar[vi];
      if (m < 0) continue;
      if (mir === cell) {
        if (m === vi) res.push(vi); // sur l'axe ou au centre : le bloc doit être son propre reflet
        continue;
      }
      const ti = variantes[vi].typeIndex;
      grille[cell] = vi;
      utilise[ti]++;
      const ok = posable(mir, m);
      grille[cell] = -1;
      utilise[ti]--;
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
  const analyserReseaux = (): { total: number; fermes: number; fermesSansSortie: number } => {
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
    const ouvert = new Set<number>(); // réseau qui peut encore grandir (côté vers une case vide)
    const sortie = new Set<number>(); // réseau qui a une rampe ou une ouverture sur le bord
    for (let cell = 0; cell < n; cell++) {
      const vi = grille[cell];
      if (vi < 0) continue;
      const v = variantes[vi];
      for (let g = 0; g < v.groupes.length; g++) {
        const r = trouver(cell * G + g);
        present.add(r);
        if (v.pente && v.groupes[g].length === 1) sortie.add(r);
      }
      for (let d = 0; d < 4; d++) {
        if (!v.cotes[d]) continue;
        const nb = voisin[cell * 4 + d];
        const r = trouver(cell * G + v.groupeDeCote[d]);
        if (nb < 0) {
          if (o.sortieBord) sortie.add(r);
        } else if (grille[nb] < 0) {
          ouvert.add(r);
        }
      }
    }
    let fermes = 0;
    let fermesSansSortie = 0;
    for (const r of present) {
      if (!ouvert.has(r)) {
        fermes++;
        if (!sortie.has(r)) fermesSansSortie++;
      }
    }
    return { total: present.size, fermes, fermesSansSortie };
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

  const N = o.nbReseaux;
  const surveiller = N !== null || o.exigerSortie;

  const rec = (): Code => {
    if (assignes === n) {
      const r = analyserReseaux();
      if (N !== null && r.total !== N) return 'epuise';
      // Toute la table est posée : tous les réseaux sont terminés, chacun doit avoir sa sortie.
      if (o.exigerSortie && r.fermesSansSortie > 0) return 'epuise';
      if (nbCasesTranchee() < o.minBlocsTranchee) return 'epuise';
      return 'ok';
    }
    noeudsEssai++;
    stats.noeuds++;
    if (noeudsEssai > o.noeudsParEssai || Date.now() - t0 > o.tempsMaxMs) return 'limite';
    if (stockRestant < n - assignes) return 'epuise';

    if (surveiller && assignes > 0) {
      const r = analyserReseaux();
      // Un réseau fermé ne peut plus ni grandir ni fusionner : il restera un réseau à part entière.
      // Le nombre final de réseaux est donc au moins « fermés + 1 s'il reste un réseau ouvert ».
      if (N !== null && r.fermes + (r.total > r.fermes ? 1 : 0) > N) return 'epuise';
      // Un réseau fermé sans rampe ni ouverture sur le bord ne pourra jamais en avoir.
      if (o.exigerSortie && r.fermesSansSortie >= 1) return 'epuise';
    }

    // Case la plus contrainte (départage aléatoire). Avec une symétrie, on ne considère qu'une
    // case par orbite : la case symétrique est posée en même temps.
    let meilleure = -1;
    let meilleurDom: number[] = [];
    let egalites = 0;
    for (let cell = 0; cell < n; cell++) {
      if (grille[cell] >= 0 || miroirCase[cell] < cell) continue;
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

    const mir = miroirCase[meilleure];
    const double = mir !== meilleure;
    const k = double ? 2 : 1;
    for (const vi of ordonner(meilleurDom)) {
      const ti = variantes[vi].typeIndex;
      grille[meilleure] = vi;
      if (double) grille[mir] = miroirVar[vi];
      utilise[ti] += k;
      assignes += k;
      stockRestant -= k;
      const r = rec();
      if (r !== 'epuise') return r;
      grille[meilleure] = -1;
      if (double) grille[mir] = -1;
      utilise[ti] -= k;
      assignes -= k;
      stockRestant += k;
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
          const idx = l * o.colonnes + c;
          const fixe = fixesOrig.get(idx);
          if (fixe) {
            // Un bloc imposé garde exactement son orientation d'origine.
            ligne.push({ typeId: fixe.typeId, rotation: ((fixe.rotation % 4) + 4) % 4 });
          } else {
            const v = variantes[grille[idx]];
            ligne.push({ typeId: v.typeId, rotation: v.rotation });
          }
        }
        resultat.push(ligne);
      }
      stats.ms = Date.now() - t0;
      return { ok: true, grille: resultat, stats };
    }
    if (r === 'epuise') {
      return echec(
        fixesOrig.size > 0
          ? 'Aucune configuration possible avec les blocs figés et ces règles.'
          : N !== null && N > 1
            ? `Aucune configuration possible avec ${N} réseaux et ces paramètres (stock et règles). Essayez un autre nombre de réseaux.`
            : 'Aucune configuration possible avec ces paramètres (stock et règles).',
      );
    }
  }
  return echec('Temps imparti dépassé sans solution trouvée.');
}
