/** Noms des côtés d'un bloc, dans l'ordre horaire. L'indice 0..3 correspond à N,E,S,O. */
export type NomCote = 'N' | 'E' | 'S' | 'O';

/** T = tranchée (ouverture), S = surface (pas de tranchée sur ce côté). */
export type TypeCote = 'T' | 'S';

/**
 * Définition d'un type de bloc, telle que stockée dans data/blocs.json.
 * Le moteur ne connaît AUCUN type en dur : ajouter un bloc = ajouter un objet ici.
 */
export interface BlocDef {
  /** Identifiant technique : minuscules, chiffres, "_". Ne change jamais. */
  id: string;
  /** Nom affiché, libre. */
  nom: string;
  /** Type de chaque côté dans l'orientation de référence (rotation 0). */
  cotes: Record<NomCote, TypeCote>;
  /** Groupes de côtés reliés entre eux par une tranchée à l'intérieur du bloc. */
  liaisons: NomCote[][];
  /** true si la tranchée passe par le centre (information visuelle, sans effet sur la génération). */
  centre: boolean;
  /**
   * Règle sur les groupes d'un seul côté (tranchée qui se termine dans le bloc) :
   *  - null ou "interdite" : un groupe d'un seul côté interdit le bloc (il n'est jamais posé)
   *  - "autorisee"         : le bloc peut être posé ; son unique ouverture suit les mêmes règles
   *                          de raccord que tous les autres côtés (impasse, rampe de sortie)
   */
  fin: 'interdite' | 'autorisee' | null;
  /** true si le bloc comporte une pente pour sortir de la tranchée (dessin uniquement). */
  pente?: boolean;
  /** Nombre d'exemplaires possédés (saisi par l'utilisateur). */
  quantite: number;
}

export interface FichierBlocs {
  version: number;
  blocs: BlocDef[];
}

/** Un bloc dans une orientation donnée (rotation de 0 à 3 quarts de tour horaires). */
export interface Variante {
  typeId: string;
  /** Indice du type dans la liste des types utilisables. */
  typeIndex: number;
  rotation: number;
  /** cotes[d] = true si le côté d (0=N,1=E,2=S,3=O) est une tranchée. */
  cotes: boolean[];
  /** Groupes de côtés (indices 0..3) reliés entre eux. */
  groupes: number[][];
  /** groupeDeCote[d] = indice du groupe contenant le côté d, ou -1. */
  groupeDeCote: number[];
  fin: BlocDef['fin'];
  /** true si le bloc comporte une rampe de sortie (la tranchée remonte à la surface). */
  pente: boolean;
  /** true si aucun côté n'est une tranchée (bloc plat). */
  vide: boolean;
  signature: string;
}
