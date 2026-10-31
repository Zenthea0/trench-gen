import blocsInitiaux from '../../data/blocs.json';
import type { BlocDef, FichierBlocs } from '../types.js';

/** Définition des types de blocs, telle que livrée avec l'application. */
export const BLOCS_BASE: BlocDef[] = (blocsInitiaux as unknown as FichierBlocs).blocs;

export interface Reglages {
  lignes: number;
  colonnes: number;
  sortieBord: boolean;
  unSeulReseau: boolean;
  quadrillage: boolean;
}

export interface Etat {
  /** Quantité possédée par id de bloc. */
  quantites: Record<string, number>;
  reglages: Reglages;
  /** false tant que l'utilisateur n'a pas modifié le stock (quantités d'exemple). */
  personnalise: boolean;
}

export const REGLAGES_DEFAUT: Reglages = {
  lignes: 6,
  colonnes: 6,
  sortieBord: true,
  unSeulReseau: true,
  quadrillage: true,
};

const CLE = 'trench-gen:v1';

export function quantitesExemple(): Record<string, number> {
  return Object.fromEntries(BLOCS_BASE.map((b) => [b.id, b.quantite]));
}

export function charger(): Etat {
  const defaut: Etat = { quantites: quantitesExemple(), reglages: REGLAGES_DEFAUT, personnalise: false };
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return defaut;
    const lu = JSON.parse(brut) as Partial<Etat>;
    return {
      // Les types de blocs ajoutés plus tard dans blocs.json reprennent leur quantité par défaut.
      quantites: { ...defaut.quantites, ...(lu.quantites ?? {}) },
      reglages: { ...REGLAGES_DEFAUT, ...(lu.reglages ?? {}) },
      personnalise: lu.personnalise === true,
    };
  } catch {
    return defaut;
  }
}

export function sauver(etat: Etat): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(etat));
  } catch {
    /* stockage indisponible (navigation privée...) : l'application reste utilisable */
  }
}

export function appliquerQuantites(quantites: Record<string, number>): BlocDef[] {
  return BLOCS_BASE.map((b) => ({ ...b, quantite: Math.max(0, Math.floor(quantites[b.id] ?? 0)) }));
}
