import type { ReactNode } from 'react';
import type { BlocDef, NomCote } from '../types.js';
import type { Grille } from '../generateur.js';

/**
 * Dessin des blocs en SVG. Chaque bloc est dessiné dans son orientation de référence
 * (viewBox 0..100) puis tourné de rotation × 90° : le dessin n'est donc écrit qu'une fois
 * par type de bloc et fonctionne pour n'importe quel bloc ajouté dans blocs.json.
 */

export const COULEURS = {
  sol: '#d8c7a0',
  solOmbre: '#c8b68c',
  rebord: '#8a6e4a',
  fond: '#3a2b1d',
  planche: '#5a4631',
  pente: '#e9dcbc',
  grille: 'rgba(60,45,30,0.28)',
  accent: '#d9480f',
};

const LARGEUR_REBORD = 48;
const LARGEUR_FOND = 32;

const MILIEU: Record<NomCote, [number, number]> = {
  N: [50, 0],
  E: [100, 50],
  S: [50, 100],
  O: [0, 50],
};
const OPPOSE: Record<NomCote, NomCote> = { N: 'S', S: 'N', E: 'O', O: 'E' };

/** Si les deux côtés sont voisins (ex. S et O), renvoie le coin qui les sépare. */
function coinEntre(a: NomCote, b: NomCote): [number, number] | null {
  if (OPPOSE[a] === b) return null;
  const aire = new Set([a, b]);
  const x = aire.has('E') ? 100 : aire.has('O') ? 0 : null;
  const y = aire.has('S') ? 100 : aire.has('N') ? 0 : null;
  return x === null || y === null ? null : [x, y];
}

function trace(groupe: NomCote[], centre: boolean): { d: string; centreCarre: boolean } {
  // Liaison décalée : un quart de cercle centré sur le coin qui sépare les deux côtés.
  // Rayon 50 : l'arc part du milieu d'un côté et arrive au milieu de l'autre, à angle droit,
  // donc il se raccorde exactement à une tranchée droite du bloc voisin.
  if (!centre && groupe.length === 2) {
    const coin = coinEntre(groupe[0], groupe[1]);
    if (coin) {
      const [x1, y1] = MILIEU[groupe[0]];
      const [x2, y2] = MILIEU[groupe[1]];
      const produit = (x1 - coin[0]) * (y2 - coin[1]) - (y1 - coin[1]) * (x2 - coin[0]);
      return { d: `M${x1} ${y1} A50 50 0 0 ${produit > 0 ? 1 : 0} ${x2} ${y2}`, centreCarre: false };
    }
  }
  // Tranchée par le centre : un segment depuis le milieu de chaque côté.
  const d = groupe
    .map((c) => {
      const [x, y] = MILIEU[c];
      return `M${x} ${y} L50 50`;
    })
    .join(' ');
  return { d, centreCarre: true };
}

/** Contenu SVG d'un bloc, dans un repère 0..100, avant rotation. */
function ContenuBloc({ bloc }: { bloc: BlocDef }) {
  const traces = bloc.liaisons.map((g) => ({ groupe: g, ...trace(g, bloc.centre) }));
  const rampes = bloc.pente ? bloc.liaisons.filter((g) => g.length === 1) : [];

  const couche = (largeur: number, couleur: string, cle: string): ReactNode => (
    <g key={cle}>
      {traces.map((t, i) => (
        <g key={i}>
          <path d={t.d} fill="none" stroke={couleur} strokeWidth={largeur} strokeLinecap="butt" strokeLinejoin="miter" />
          {t.centreCarre && <rect x={50 - largeur / 2} y={50 - largeur / 2} width={largeur} height={largeur} fill={couleur} />}
        </g>
      ))}
    </g>
  );

  return (
    <>
      <rect width="100" height="100" fill={COULEURS.sol} />
      {bloc.liaisons.length === 0 && (
        <g fill={COULEURS.solOmbre}>
          <ellipse cx="28" cy="32" rx="9" ry="6" />
          <ellipse cx="70" cy="64" rx="12" ry="7" />
          <circle cx="62" cy="24" r="4" />
          <circle cx="22" cy="74" r="3.5" />
          <circle cx="84" cy="30" r="2.5" />
        </g>
      )}
      {rampes.map((g, i) => {
        // Pente : du fond de la tranchée (centre) vers la surface, côté opposé à la tranchée.
        // Dessinée pour une tranchée au sud (pente vers le nord), puis tournée selon le côté réel.
        const quarts = (['N', 'E', 'S', 'O'].indexOf(g[0]) - 2 + 4) % 4;
        return (
          <g key={i} transform={`rotate(${quarts * 90} 50 50)`}>
            <polygon points="34,50 66,50 58,0 42,0" fill="url(#degrade-pente)" stroke={COULEURS.rebord} strokeWidth="3" strokeLinejoin="round" />
            <g fill="none" stroke={COULEURS.fond} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.55">
              <polyline points="42,34 50,26 58,34" />
              <polyline points="43,22 50,15 57,22" />
            </g>
          </g>
        );
      })}
      {couche(LARGEUR_REBORD, COULEURS.rebord, 'rebord')}
      {couche(LARGEUR_FOND, COULEURS.fond, 'fond')}
      {/* planches de fond de tranchée */}
      <g stroke={COULEURS.planche} strokeWidth="1.6" opacity="0.7">
        {traces.map((t, i) => (
          <path key={i} d={t.d} fill="none" strokeWidth={LARGEUR_FOND - 8} strokeDasharray="1.6 8" />
        ))}
      </g>
    </>
  );
}

/** Définitions partagées (dégradé de la pente). À inclure une fois par <svg>. */
export function DefinitionsSvg() {
  return (
    <defs>
      <linearGradient id="degrade-pente" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor={COULEURS.fond} />
        <stop offset="0.55" stopColor="#8a6e4a" />
        <stop offset="1" stopColor={COULEURS.pente} />
      </linearGradient>
    </defs>
  );
}

/** Un bloc dans son orientation, dans un repère 0..100 (à placer dans un <svg> ou un <g>). */
export function TuileContenu({ bloc, rotation }: { bloc: BlocDef; rotation: number }) {
  return (
    <g transform={`rotate(${((rotation % 4) + 4) * 90 % 360} 50 50)`}>
      <ContenuBloc bloc={bloc} />
    </g>
  );
}

/** Aperçu autonome d'un bloc (liste de blocs, liste de montage). */
export function ApercuBloc({ bloc, rotation = 0, taille = 56 }: { bloc: BlocDef; rotation?: number; taille?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={taille} height={taille} role="img" aria-label={bloc.nom} style={{ display: 'block', borderRadius: 6 }}>
      <DefinitionsSvg />
      <TuileContenu bloc={bloc} rotation={rotation} />
      <rect width="100" height="100" fill="none" stroke={COULEURS.grille} strokeWidth="2" />
    </svg>
  );
}

export interface PropsGrille {
  grille: Grille;
  blocs: BlocDef[];
  quadrillage?: boolean;
  selection?: { l: number; c: number } | null;
  onSelection?: (l: number, c: number) => void;
  /** Largeur minimale d'une case en pixels (au-delà, la carte devient défilante). */
  tailleMinCase?: number;
  /** Texte alternatif et identifiant utilisés pour l'export. */
  id?: string;
}

const MARGE = 34;
const LETTRES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Étiquette de colonne : A..Z puis AA, AB... */
export function nomColonne(c: number): string {
  return c < 26 ? LETTRES[c] : LETTRES[Math.floor(c / 26) - 1] + LETTRES[c % 26];
}

/** La carte complète : cases, quadrillage, repères (A–F / 1–6) et case sélectionnée. */
export function GrilleSvg({ grille, blocs, quadrillage = true, selection = null, onSelection, tailleMinCase = 46, id }: PropsGrille) {
  const L = grille.length;
  const C = grille[0]?.length ?? 0;
  const parId = new Map(blocs.map((b) => [b.id, b]));
  const largeur = C * 100 + 2 * MARGE;
  const hauteur = L * 100 + 2 * MARGE;
  const pxMin = C * tailleMinCase + 2 * (MARGE * tailleMinCase) / 100;

  return (
    <svg
      id={id}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${largeur} ${hauteur}`}
      width="100%"
      style={{ minWidth: pxMin, display: 'block', touchAction: 'manipulation', background: '#f3ead8' }}
      role="img"
      aria-label={`Carte de tranchées ${L} lignes sur ${C} colonnes`}
    >
      <DefinitionsSvg />
      <rect width={largeur} height={hauteur} fill="#f3ead8" />
      <g fontFamily="system-ui, sans-serif" fontSize="22" fontWeight="600" fill="#6b5a44" textAnchor="middle">
        {Array.from({ length: C }, (_, c) => (
          <g key={c}>
            <text x={MARGE + c * 100 + 50} y={MARGE - 10}>{nomColonne(c)}</text>
            <text x={MARGE + c * 100 + 50} y={MARGE + L * 100 + 26}>{nomColonne(c)}</text>
          </g>
        ))}
        {Array.from({ length: L }, (_, l) => (
          <g key={l}>
            <text x={MARGE - 14} y={MARGE + l * 100 + 58}>{l + 1}</text>
            <text x={MARGE + C * 100 + 14} y={MARGE + l * 100 + 58}>{l + 1}</text>
          </g>
        ))}
      </g>
      {grille.map((ligne, l) =>
        ligne.map((cel, c) => {
          const bloc = parId.get(cel.typeId);
          if (!bloc) return null;
          return (
            <svg key={`${l}-${c}`} x={MARGE + c * 100} y={MARGE + l * 100} width="100" height="100" viewBox="0 0 100 100">
              <TuileContenu bloc={bloc} rotation={cel.rotation} />
            </svg>
          );
        }),
      )}
      {quadrillage && (
        <g stroke={COULEURS.grille} strokeWidth="1.5" fill="none">
          {Array.from({ length: L + 1 }, (_, l) => (
            <line key={`h${l}`} x1={MARGE} x2={MARGE + C * 100} y1={MARGE + l * 100} y2={MARGE + l * 100} />
          ))}
          {Array.from({ length: C + 1 }, (_, c) => (
            <line key={`v${c}`} y1={MARGE} y2={MARGE + L * 100} x1={MARGE + c * 100} x2={MARGE + c * 100} />
          ))}
        </g>
      )}
      <rect x={MARGE} y={MARGE} width={C * 100} height={L * 100} fill="none" stroke="#3b2d20" strokeWidth="4" />
      {selection && (
        <rect
          x={MARGE + selection.c * 100 + 3}
          y={MARGE + selection.l * 100 + 3}
          width="94"
          height="94"
          fill="rgba(217,72,15,0.12)"
          stroke={COULEURS.accent}
          strokeWidth="5"
          rx="4"
        />
      )}
      {onSelection &&
        grille.map((ligne, l) =>
          ligne.map((_, c) => (
            <rect
              key={`z${l}-${c}`}
              x={MARGE + c * 100}
              y={MARGE + l * 100}
              width="100"
              height="100"
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={() => onSelection(l, c)}
            />
          )),
        )}
    </svg>
  );
}
