const LETTRES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Étiquette de colonne : A..Z puis AA, AB... */
export function nomColonne(c: number): string {
  return c < 26 ? LETTRES[c] : LETTRES[Math.floor(c / 26) - 1] + LETTRES[c % 26];
}

/** Nom d'une case : colonne en lettre, ligne en chiffre (ex. D3). */
export function nomCase(l: number, c: number): string {
  return `${nomColonne(c)}${l + 1}`;
}

/** Clé d'une case dans les ensembles (sélection, conflits) : "ligne,colonne". */
export function cleCase(l: number, c: number): string {
  return `${l},${c}`;
}

export function depuisCle(cle: string): [number, number] {
  const [l, c] = cle.split(',').map(Number);
  return [l, c];
}
