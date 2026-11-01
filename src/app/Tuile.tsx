import { useRef } from 'react';
import type { PointerEvent as EvtPointeur, ReactNode } from 'react';
import type { BlocDef, NomCote } from '../types.js';
import type { Grille } from '../generateur.js';
import { cleCase, nomColonne } from '../cases.js';

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
  conflit: '#c92a2a',
};

const LARGEUR_REBORD = 48;
const LARGEUR_FOND = 32;
/** Durée de l'appui long qui active la sélection multiple. */
const DUREE_APPUI_LONG = 450;

const MILIEU: Record<NomCote, [number, number]> = {
  N: [50, 0],
  E: [100, 50],
  S: [50, 100],
  O: [0, 50],
};
const OPPOSE: Record<NomCote, NomCote> = { N: 'S', S: 'N', E: 'O', O: 'E' };

/** Deux côtés sont voisins (ex. S et O) : ils entourent un coin du bloc. */
function sontVoisins(a: NomCote, b: NomCote): boolean {
  return a !== b && OPPOSE[a] !== b;
}

interface Trace {
  d: string;
  /** Tranchée qui passe par le centre : on y ajoute un carré de raccord. */
  centreCarre: boolean;
  /** Facteur appliqué aux largeurs (diagonale : voir ci-dessous). */
  echelle: number;
}

function trace(groupe: NomCote[], centre: boolean): Trace {
  // Liaison décalée : une ligne droite en diagonale, du milieu d'un côté au milieu du côté voisin.
  // Elle coupe le coin du bloc sans passer par le centre. On la prolonge au-delà du bloc : le
  // bloc est découpé à ses bords, ce qui évite tout vide à l'arrivée en biais. Les largeurs sont
  // multipliées par √½ pour que l'ouverture sur le bord ait exactement la même largeur que
  // celle d'une tranchée droite : les blocs voisins se raccordent sans décalage.
  if (!centre && groupe.length === 2 && sontVoisins(groupe[0], groupe[1])) {
    const [x1, y1] = MILIEU[groupe[0]];
    const [x2, y2] = MILIEU[groupe[1]];
    const longueur = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / longueur;
    const uy = (y2 - y1) / longueur;
    const prolongement = 60;
    return {
      d: `M${x1 - ux * prolongement} ${y1 - uy * prolongement} L${x2 + ux * prolongement} ${y2 + uy * prolongement}`,
      centreCarre: false,
      echelle: Math.SQRT1_2,
    };
  }
  // Tranchée par le centre : un segment depuis le milieu de chaque côté.
  const d = groupe
    .map((c) => {
      const [x, y] = MILIEU[c];
      return `M${x} ${y} L50 50`;
    })
    .join(' ');
  return { d, centreCarre: true, echelle: 1 };
}

/** Contenu SVG d'un bloc, dans un repère 0..100, avant rotation. */
function ContenuBloc({ bloc }: { bloc: BlocDef }) {
  const traces = bloc.liaisons.map((g) => trace(g, bloc.centre));
  const rampes = bloc.pente ? bloc.liaisons.filter((g) => g.length === 1) : [];

  const couche = (largeur: number, couleur: string, cle: string): ReactNode => (
    <g key={cle}>
      {traces.map((t, i) => (
        <g key={i}>
          <path d={t.d} fill="none" stroke={couleur} strokeWidth={largeur * t.echelle} strokeLinecap="butt" strokeLinejoin="miter" />
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
          <path key={i} d={t.d} fill="none" strokeWidth={(LARGEUR_FOND - 8) * t.echelle} strokeDasharray="1.6 8" />
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
    <g transform={`rotate(${(((rotation % 4) + 4) * 90) % 360} 50 50)`}>
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
  /** Cases sélectionnées (donc conservées lors d'une régénération), au format cleCase(l, c). */
  selection?: ReadonlySet<string>;
  /** Cases en conflit avec une règle de gestion active. */
  conflits?: ReadonlySet<string>;
  /** Toucher bref. `multi` vaut true avec Ctrl, Cmd ou Maj enfoncé (ordinateur). */
  onTap?: (l: number, c: number, multi: boolean) => void;
  /** Appui long : active la sélection multiple. */
  onLongPress?: (l: number, c: number) => void;
  /** Largeur minimale d'une case en pixels (au-delà, la carte devient défilante). */
  tailleMinCase?: number;
  id?: string;
}

const MARGE = 34;

interface Appui {
  l: number;
  c: number;
  x: number;
  y: number;
  timer: number | null;
  long: boolean;
}

/** La carte complète : cases, quadrillage, repères (A–F / 1–6), sélection, cadenas et conflits. */
export function GrilleSvg({ grille, blocs, quadrillage = true, selection, conflits, onTap, onLongPress, tailleMinCase = 46, id }: PropsGrille) {
  const L = grille.length;
  const C = grille[0]?.length ?? 0;
  const parId = new Map(blocs.map((b) => [b.id, b]));
  const largeur = C * 100 + 2 * MARGE;
  const hauteur = L * 100 + 2 * MARGE;
  const pxMin = C * tailleMinCase + (2 * MARGE * tailleMinCase) / 100;
  const appui = useRef<Appui | null>(null);

  const annuler = () => {
    const a = appui.current;
    if (a && a.timer !== null) window.clearTimeout(a.timer);
    appui.current = null;
  };
  const debut = (e: EvtPointeur<SVGRectElement>, l: number, c: number) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    annuler();
    const a: Appui = { l, c, x: e.clientX, y: e.clientY, timer: null, long: false };
    if (onLongPress) {
      a.timer = window.setTimeout(() => {
        a.timer = null;
        a.long = true;
        navigator.vibrate?.(15);
        onLongPress(l, c);
      }, DUREE_APPUI_LONG);
    }
    appui.current = a;
  };
  const mouvement = (e: EvtPointeur<SVGRectElement>) => {
    const a = appui.current;
    // Un doigt qui glisse fait défiler la carte : ce n'est ni un toucher ni un appui long.
    if (a && !a.long && Math.hypot(e.clientX - a.x, e.clientY - a.y) > 10) annuler();
  };
  const fin = (e: EvtPointeur<SVGRectElement>) => {
    const a = appui.current;
    if (!a) return;
    if (a.timer !== null) window.clearTimeout(a.timer);
    appui.current = null;
    if (!a.long) onTap?.(a.l, a.c, e.ctrlKey || e.metaKey || e.shiftKey);
  };

  const position = (cle: string): [number, number] => {
    const [l, c] = cle.split(',').map(Number);
    return [MARGE + c * 100, MARGE + l * 100];
  };

  return (
    <svg
      id={id}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${largeur} ${hauteur}`}
      width="100%"
      style={{
        minWidth: pxMin,
        display: 'block',
        touchAction: 'manipulation',
        background: '#f3ead8',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
      role="img"
      aria-label={`Carte de tranchées ${L} lignes sur ${C} colonnes`}
      onContextMenu={(e) => e.preventDefault()}
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
            <svg
              key={`${l}-${c}`}
              x={MARGE + c * 100}
              y={MARGE + l * 100}
              width="100"
              height="100"
              viewBox="0 0 100 100"
              data-bloc={cel.typeId}
              data-rot={cel.rotation}
              data-case={cleCase(l, c)}
            >
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

      {/* Cases en conflit : cadre rouge pointillé */}
      {conflits &&
        [...conflits].map((k) => {
          const [x, y] = position(k);
          return (
            <rect
              key={`x${k}`}
              data-ui="1"
              data-conflit={k}
              x={x + 3}
              y={y + 3}
              width="94"
              height="94"
              rx="4"
              fill="rgba(201,42,42,0.16)"
              stroke={COULEURS.conflit}
              strokeWidth="5"
              strokeDasharray="12 7"
              pointerEvents="none"
            />
          );
        })}

      {/* Cases sélectionnées : cadre orange et cadenas (elles sont conservées à la régénération) */}
      {selection &&
        [...selection].map((k) => {
          const [x, y] = position(k);
          return (
            <g key={`s${k}`} data-ui="1" data-selection={k} pointerEvents="none">
              <rect x={x + 3} y={y + 3} width="94" height="94" rx="4" fill="rgba(217,72,15,0.12)" stroke={COULEURS.accent} strokeWidth="5" />
              <g transform={`translate(${x + 64} ${y + 8})`}>
                <circle cx="14" cy="14" r="14" fill={COULEURS.accent} />
                <rect x="7.5" y="13" width="13" height="9.5" rx="2" fill="#fff" />
                <path d="M10 13 v-3.5 a4 4 0 0 1 8 0 V13" fill="none" stroke="#fff" strokeWidth="2.4" />
              </g>
            </g>
          );
        })}

      {/* Zones tactiles invisibles : toucher bref, appui long */}
      {(onTap || onLongPress) &&
        grille.map((ligne, l) =>
          ligne.map((_, c) => (
            <rect
              key={`z${l}-${c}`}
              data-ui="1"
              x={MARGE + c * 100}
              y={MARGE + l * 100}
              width="100"
              height="100"
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onPointerDown={(e) => debut(e, l, c)}
              onPointerMove={mouvement}
              onPointerUp={fin}
              onPointerCancel={annuler}
              onPointerLeave={annuler}
            />
          )),
        )}
    </svg>
  );
}
