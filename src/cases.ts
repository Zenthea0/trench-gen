import type { Symetrie } from './types.js';

const LETTRES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Étiquette de colonne : A..Z puis AA, AB... */
export function nomColonne(c: number): string {
  return c < 26 ? LETTRES[c] : LETTRES[Math.floor(c / 26) - 1] + LETTRES[c % 26];
}

/** Nom d'une case : colonne en lettre, ligne en chiffre (ex. D3). */
export function nomCase(l: number, c: number): string {
  return `${nomColonne(c)}${l + 1}`;
}

/** Case symétrique de (l, c) selon la symétrie choisie (la case elle-même si elle est sur l'axe ou au centre). */
export function caseSymetrique(l: number, c: number, lignes: number, colonnes: number, sym: Symetrie): [number, number] {
  if (sym === 'centrale') return [lignes - 1 - l, colonnes - 1 - c];
  if (sym === 'axiale') return [lignes - 1 - l, c];
  return [l, c];
}

/** Clé d'une case dans les ensembles (sélection, conflits) : "ligne,colonne". */
export function cleCase(l: number, c: number): string {
  return `${l},${c}`;
}

export function depuisCle(cle: string): [number, number] {
  const [l, c] = cle.split(',').map(Number);
  return [l, c];
}
