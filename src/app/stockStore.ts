import blocsInitiaux from '../../data/blocs.json';
import type { BlocDef, FichierBlocs, Symetrie } from '../types.js';

/** Définition des types de blocs, telle que livrée avec l'application. */
export const BLOCS_BASE: BlocDef[] = (blocsInitiaux as unknown as FichierBlocs).blocs;

export interface Reglages {
  lignes: number;
  colonnes: number;
  sortieBord: boolean;
  /** Nombre exact de réseaux de tranchées (1 à 6), ou null = nombre libre. */
  nbReseaux: number | null;
  /** Aucune tranchée complètement fermée : chaque réseau a une rampe ou une ouverture sur le bord. */
  exigerSortie: boolean;
  /** Une seule symétrie à la fois : aucune, centrale (demi-tour) ou axiale (miroir haut/bas). */
  symetrie: Symetrie;
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
  nbReseaux: 1,
  exigerSortie: true,
  symetrie: 'aucune',
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
    const personnalise = lu.personnalise === true;
    return {
      // Tant que l'utilisateur n'a rien saisi, les quantités d'exemple suivent les mises à jour.
      // Les types de blocs ajoutés plus tard dans blocs.json reprennent leur quantité par défaut.
      quantites: personnalise ? { ...defaut.quantites, ...(lu.quantites ?? {}) } : defaut.quantites,
      reglages: migrerReglages(lu.reglages),
      personnalise,
    };
  } catch {
    return defaut;
  }
}

/** Reprend les réglages enregistrés ; l'ancien interrupteur « Un seul réseau » devient « nombre imposé : 1 » ou « libre ». */
function migrerReglages(lus: Partial<Reglages> | undefined): Reglages {
  const { unSeulReseau, ...reste } = (lus ?? {}) as Partial<Reglages> & { unSeulReseau?: boolean };
  const fusion: Reglages = { ...REGLAGES_DEFAUT, ...reste };
  if (!('nbReseaux' in reste) && typeof unSeulReseau === 'boolean') fusion.nbReseaux = unSeulReseau ? 1 : null;
  const n = fusion.nbReseaux;
  if (n !== null && !(Number.isInteger(n) && n >= 1 && n <= 6)) fusion.nbReseaux = REGLAGES_DEFAUT.nbReseaux;
  return fusion;
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
