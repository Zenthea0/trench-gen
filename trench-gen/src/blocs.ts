import type { BlocDef, NomCote, Variante } from './types.js';

export const ORDRE: NomCote[] = ['N', 'E', 'S', 'O'];

/** Vérifie qu'une définition de bloc est cohérente. Lance une Error en français sinon. */
export function validerBloc(b: BlocDef): void {
  const nom = `Bloc « ${b.id} »`;
  if (!/^[a-z0-9_]+$/.test(b.id)) {
    throw new Error(`${nom} : l'id doit contenir uniquement a-z, 0-9 et _.`);
  }
  if (!Number.isInteger(b.quantite) || b.quantite < 0) {
    throw new Error(`${nom} : la quantité doit être un entier ≥ 0.`);
  }
  const vus = new Set<string>();
  for (const g of b.liaisons) {
    if (g.length === 0) throw new Error(`${nom} : groupe de liaison vide.`);
    for (const c of g) {
      if (!ORDRE.includes(c)) throw new Error(`${nom} : côté inconnu « ${c} ».`);
      if (b.cotes[c] !== 'T') {
        throw new Error(`${nom} : le côté ${c} est dans une liaison mais n'est pas une tranchée (T).`);
      }
      if (vus.has(c)) throw new Error(`${nom} : le côté ${c} apparaît dans plusieurs liaisons.`);
      vus.add(c);
    }
  }
  for (const c of ORDRE) {
    if (b.cotes[c] === 'T' && !vus.has(c)) {
      throw new Error(`${nom} : le côté ${c} est une tranchée mais n'appartient à aucune liaison.`);
    }
  }
}

/** Un bloc est utilisable si aucun de ses groupes ne forme un cul-de-sac interdit. */
export function estUtilisable(b: BlocDef): boolean {
  return b.liaisons.every((g) => g.length >= 2 || (g.length === 1 && b.fin === 'autorisee'));
}

/** Calcule le bloc dans une orientation donnée (rotation = nombre de quarts de tour horaires). */
export function varianteDe(bloc: BlocDef, rotation: number, typeIndex = 0): Variante {
  const r = ((rotation % 4) + 4) % 4;
  const cotes = [false, false, false, false];
  const groupeDeCote = [-1, -1, -1, -1];
  const groupes = bloc.liaisons.map((g, gi) => {
    const cotesGroupe = g.map((c) => (ORDRE.indexOf(c) + r) % 4).sort((a, b) => a - b);
    for (const s of cotesGroupe) {
      cotes[s] = true;
      groupeDeCote[s] = gi;
    }
    return cotesGroupe;
  });
  const signature =
    cotes.map((c) => (c ? 'T' : 'S')).join('') +
    '|' +
    groupes
      .map((g) => g.join(''))
      .sort()
      .join(',');
  return {
    typeId: bloc.id,
    typeIndex,
    rotation: r,
    cotes,
    groupes,
    groupeDeCote,
    fin: bloc.fin,
    vide: !cotes.some(Boolean),
    signature,
  };
}

export interface TypeUtilisable {
  id: string;
  quantite: number;
}

/**
 * Construit toutes les variantes (blocs × rotations), en supprimant les doublons dus aux
 * symétries (un bloc « droit » n'a que 2 orientations distinctes, une croix 1 seule).
 * Les blocs inutilisables (impasse) ou en quantité 0 sont écartés.
 */
export function construireVariantes(blocs: BlocDef[]): { variantes: Variante[]; types: TypeUtilisable[] } {
  const ids = new Set<string>();
  for (const b of blocs) {
    validerBloc(b);
    if (ids.has(b.id)) throw new Error(`Id de bloc en double : « ${b.id} ».`);
    ids.add(b.id);
  }
  const types: TypeUtilisable[] = [];
  const variantes: Variante[] = [];
  for (const b of blocs) {
    if (!estUtilisable(b) || b.quantite <= 0) continue;
    const typeIndex = types.length;
    types.push({ id: b.id, quantite: b.quantite });
    const signatures = new Set<string>();
    for (let r = 0; r < 4; r++) {
      const v = varianteDe(b, r, typeIndex);
      if (signatures.has(v.signature)) continue;
      signatures.add(v.signature);
      variantes.push(v);
    }
  }
  return { variantes, types };
}
