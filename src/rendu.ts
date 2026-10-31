import type { BlocDef } from './types.js';
import type { Grille } from './generateur.js';
import { varianteDe } from './blocs.js';

/** Position (ligne, colonne) dans la tuile 3×3 du milieu de chaque côté N,E,S,O. */
const POS_COTE: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 1],
  [1, 0],
];
/** Coin entre le côté a et le côté a+1. */
const POS_COIN: [number, number][] = [
  [0, 2],
  [2, 2],
  [2, 0],
  [0, 0],
];

/**
 * Tuile 3×3 d'un bloc : '#' tranchée, '~' pente (sortie d'une rampe), '.' bloc plat, ' ' surface.
 */
export function tuile(bloc: BlocDef, rotation: number): string[] {
  const v = varianteDe(bloc, rotation);
  const t = [
    [' ', ' ', ' '],
    [' ', ' ', ' '],
    [' ', ' ', ' '],
  ];
  if (v.vide) t[1][1] = '.';
  for (const g of v.groupes) {
    const adjacents =
      g.length === 2 && (g[1] - g[0] === 1 || (g[0] === 0 && g[1] === 3)) ? (g[0] === 0 && g[1] === 3 ? 3 : g[0]) : -1;
    const decale = !bloc.centre && adjacents >= 0;
    for (const s of g) t[POS_COTE[s][0]][POS_COTE[s][1]] = '#';
    if (decale) {
      t[POS_COIN[adjacents][0]][POS_COIN[adjacents][1]] = '#';
    } else {
      t[1][1] = '#';
    }
    if (g.length === 1 && bloc.pente) {
      const opp = (g[0] + 2) % 4;
      t[POS_COTE[opp][0]][POS_COTE[opp][1]] = '~';
    }
  }
  return t.map((r) => r.join(''));
}

const GLYPHE: Record<string, string> = { '#': '██', '~': '▒▒', '.': '· ', ' ': '  ' };

/** Dessin de la grille en caractères (chaque case = 3 lignes × 6 colonnes). */
export function rendreAscii(grille: Grille, blocs: BlocDef[]): string {
  const parId = new Map(blocs.map((b) => [b.id, b]));
  const C = grille[0].length;
  const sortie: string[] = ['┌' + '─'.repeat(C * 6) + '┐'];
  for (const ligne of grille) {
    const rangees = ['', '', ''];
    for (const cel of ligne) {
      const t = tuile(parId.get(cel.typeId)!, cel.rotation);
      for (let i = 0; i < 3; i++) rangees[i] += [...t[i]].map((ch) => GLYPHE[ch]).join('');
    }
    for (const r of rangees) sortie.push('│' + r + '│');
  }
  sortie.push('└' + '─'.repeat(C * 6) + '┘');
  return sortie.join('\n');
}

/** Tableau compact « id:rotation » de la grille (utile pour reconstituer la table réelle). */
export function rendreCodes(grille: Grille, blocs: BlocDef[]): string {
  const parId = new Map(blocs.map((b) => [b.id, b]));
  const abrege = (id: string) => (parId.get(id)?.id ?? id).slice(0, 6).padEnd(6);
  return grille.map((l) => l.map((c) => `${abrege(c.typeId)}${'↑→↓←'[c.rotation]}`).join(' │ ')).join('\n');
}
