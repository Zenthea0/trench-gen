import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BlocDef, Symetrie } from '../types.js';
import type { CellulePosee, Grille, Resultat } from '../generateur.js';
import { construireVariantes, estUtilisable, rotationSuivante, typesAutoSymetriques } from '../blocs.js';
import { verifier } from '../verificateur.js';
import { caseSymetrique, cleCase, depuisCle, nomCase } from '../cases.js';
import { ApercuBloc, GrilleSvg } from './Tuile.js';
import { appliquerQuantites, BLOCS_BASE, charger, quantitesExemple, sauver, type Etat, type Reglages } from './stockStore.js';
import { exporterPng } from './export.js';

type Onglet = 'carte' | 'blocs' | 'reglages';

interface Generation {
  grille: Grille;
  graine: number;
  blocs: BlocDef[];
  lignes: number;
  colonnes: number;
  ms: number;
  /** true dès qu'un bloc a été modifié à la main : la graine ne décrit plus la carte. */
  modifiee: boolean;
  /** Empreinte des paramètres utilisés, pour savoir si la carte affichée est périmée. */
  cle: string;
}

const LIMITE_CASES_CONSEILLEE = 144;

function conseil(raison: string): string {
  if (/figé/.test(raison)) {
    return raison.startsWith('Aucune configuration')
      ? 'Désélectionnez certains blocs pour laisser plus de liberté au générateur.'
      : 'Corrigez ou désélectionnez les blocs concernés, puis regénérez.';
  }
  if (raison.startsWith('Stock insuffisant')) return "Ajoutez des blocs dans l'onglet Blocs, ou réduisez la taille de la table.";
  if (raison.startsWith('Aucune configuration')) {
    return 'Essayez d’autoriser les sorties sur le bord de table ou plusieurs réseaux, ou ajoutez des blocs variés (croix, rampes, plats).';
  }
  if (raison.startsWith('Temps imparti')) return 'Relancez la génération, ou autorisez plusieurs réseaux pour faciliter la recherche.';
  return '';
}

function descriptionBloc(b: BlocDef): string {
  if (!estUtilisable(b)) return 'Jamais posé (fin de tranchée interdite)';
  if (b.liaisons.length === 0) return 'Terrain sans tranchée';
  if (b.pente) return 'Sortie de tranchée (pente)';
  if (b.liaisons.some((g) => g.length === 1)) return 'Fin de tranchée (impasse)';
  if (!b.centre) {
    return b.liaisons.length > 1 ? `${b.liaisons.length} tranchées en diagonale, indépendantes` : 'Tranchée en diagonale dans un coin';
  }
  return `${b.liaisons[0].length} ouvertures`;
}

function Stepper(props: { valeur: number; min?: number; max?: number; onChange: (v: number) => void; etiquette: string }) {
  const { valeur, min = 0, max = 999, onChange, etiquette } = props;
  const borne = (v: number) => Math.min(max, Math.max(min, Math.floor(Number.isFinite(v) ? v : min)));
  return (
    <div className="stepper" role="group" aria-label={etiquette}>
      <button type="button" aria-label={`Diminuer ${etiquette}`} onClick={() => onChange(borne(valeur - 1))} disabled={valeur <= min}>
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={valeur}
        aria-label={etiquette}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(borne(e.currentTarget.valueAsNumber))}
      />
      <button type="button" aria-label={`Augmenter ${etiquette}`} onClick={() => onChange(borne(valeur + 1))} disabled={valeur >= max}>
        +
      </button>
    </div>
  );
}

function Interrupteur(props: { actif: boolean; onChange: (v: boolean) => void; titre: string; aide: string }) {
  return (
    <label className="interrupteur">
      <span className="texte">
        <strong>{props.titre}</strong>
        <small>{props.aide}</small>
      </span>
      <input type="checkbox" role="switch" checked={props.actif} onChange={(e) => props.onChange(e.currentTarget.checked)} />
      <span className="piste" aria-hidden="true" />
    </label>
  );
}

/** Nombre de réseaux : libre, ou exactement N (1 à 6). Un réseau = des tranchées reliées entre elles. */
function SelecteurReseaux(props: { valeur: number | null; onChange: (v: number | null) => void }) {
  const dernier = useRef(props.valeur ?? 1);
  if (props.valeur !== null) dernier.current = props.valeur;
  const n = props.valeur;
  const impose = n !== null;
  return (
    <div className="groupe">
      <div className="symetrie-titre" id="titre-reseaux">
        <strong>Nombre de réseaux de tranchées</strong>
        <small>Un réseau est un ensemble de tranchées reliées entre elles.</small>
      </div>
      <div className="options-choix" role="radiogroup" aria-labelledby="titre-reseaux">
        <button type="button" role="radio" aria-checked={!impose} data-reseaux="libre" onClick={() => props.onChange(null)}>
          <span className="texte">
            <strong>Nombre libre</strong>
            <small>Aucune exigence : la carte peut avoir un ou plusieurs réseaux.</small>
          </span>
        </button>
        <button type="button" role="radio" aria-checked={impose} data-reseaux="impose" onClick={() => props.onChange(dernier.current)}>
          <span className="texte">
            <strong>Nombre imposé</strong>
            <small>La carte a exactement le nombre de réseaux choisi, de 1 à 6.</small>
          </span>
        </button>
      </div>
      {n !== null && (
        <div className="ligne-reglage">
          <span className="texte">
            <strong>Nombre de réseaux</strong>
            <small>{n === 1 ? 'Toutes les tranchées sont reliées entre elles.' : `${n} réseaux séparés.`}</small>
          </span>
          <Stepper valeur={n} min={1} max={6} etiquette="nombre de réseaux" onChange={(v) => props.onChange(v)} />
        </div>
      )}
    </div>
  );
}

const OPTIONS_SYMETRIE: { id: Symetrie; titre: string; aide: string }[] = [
  { id: 'aucune', titre: 'Aucune symétrie', aide: 'La carte est entièrement libre.' },
  {
    id: 'centrale',
    titre: 'Symétrie centrale (demi-tour)',
    aide: "La carte est identique si on la tourne d'un demi-tour (180°) : le bloc en haut à gauche se retrouve en bas à droite, tourné d'un demi-tour.",
  },
  {
    id: 'axiale',
    titre: 'Symétrie axiale (miroir haut / bas)',
    aide: "La moitié haute de la carte est le reflet de la moitié basse, de part et d'autre d'un axe horizontal Est–Ouest qui coupe la table en deux.",
  },
];

/** Petit schéma qui montre l'effet de chaque symétrie : un motif en « L » et son image. */
function PictoSymetrie({ type }: { type: Symetrie }) {
  const motif = <path d="M10 5 V17 H20" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />;
  return (
    <svg viewBox="0 0 60 44" width="60" height="44" aria-hidden="true">
      <rect x="1.5" y="1.5" width="57" height="41" rx="5" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.45" />
      {motif}
      {type === 'aucune' && <circle cx="43" cy="31" r="6" fill="none" stroke="currentColor" strokeWidth="4" />}
      {type === 'centrale' && (
        <>
          <g transform="rotate(180 30 22)">{motif}</g>
          <circle cx="30" cy="22" r="3.5" fill="#1c7ed6" />
        </>
      )}
      {type === 'axiale' && (
        <>
          <g transform="translate(0 44) scale(1 -1)">{motif}</g>
          <line x1="3" x2="57" y1="22" y2="22" stroke="#1c7ed6" strokeWidth="2.5" strokeDasharray="5 3" />
        </>
      )}
    </svg>
  );
}

/** Explique où tombent le centre ou l'axe pour la taille de table choisie, et ce que cela impose. */
function detailSymetrie(sym: Symetrie, L: number, C: number): string[] {
  if (sym === 'aucune') return [];
  const l1 = Math.floor((L - 1) / 2);
  const c1 = Math.floor((C - 1) / 2);
  const lImpair = L % 2 === 1;
  const cImpair = C % 2 === 1;
  const noms = typesAutoSymetriques(BLOCS_BASE, sym).map((b) => b.nom).join(', ');
  const lignes: string[] = [];
  if (sym === 'centrale') {
    if (lImpair && cImpair) {
      lignes.push(`Avec une table ${L}×${C}, le centre est au milieu du bloc ${nomCase(l1, c1)}.`);
      lignes.push(`Ce bloc doit être identique après un demi-tour. Possibles : ${noms} (dans la bonne orientation).`);
    } else if (!lImpair && !cImpair) {
      lignes.push(
        `Avec une table ${L}×${C}, le centre est à l'angle commun des 4 blocs ${nomCase(l1, c1)}, ${nomCase(l1, c1 + 1)}, ${nomCase(l1 + 1, c1)} et ${nomCase(l1 + 1, c1 + 1)}.`,
      );
      lignes.push("Aucun bloc n'est son propre symétrique : les blocs se répondent deux à deux.");
    } else {
      const [a, b] = lImpair ? [nomCase(l1, c1), nomCase(l1, c1 + 1)] : [nomCase(l1, c1), nomCase(l1 + 1, c1)];
      lignes.push(`Avec une table ${L}×${C}, le centre est au milieu de la limite entre les blocs ${a} et ${b}.`);
      lignes.push('Ces deux blocs sont symétriques l’un de l’autre.');
    }
  } else if (lImpair) {
    lignes.push(`Avec ${L} lignes, l'axe traverse la rangée ${l1 + 1}.`);
    lignes.push(`Chaque bloc de cette rangée doit être identique à son reflet. Possibles : ${noms} (dans la bonne orientation).`);
  } else {
    lignes.push(`Avec ${L} lignes, l'axe passe entre les rangées ${l1 + 1} et ${l1 + 2}.`);
    lignes.push("Aucun bloc n'est son propre reflet : les rangées se répondent deux à deux.");
  }
  lignes.push('Deux blocs symétriques sont toujours du même type : le stock est donc consommé par paires.');
  return lignes;
}

function SelecteurSymetrie(props: { valeur: Symetrie; onChange: (v: Symetrie) => void; lignes: number; colonnes: number }) {
  const detail = detailSymetrie(props.valeur, props.lignes, props.colonnes);
  return (
    <div className="groupe">
      <div className="symetrie-titre" id="titre-symetrie">
        <strong>Symétrie de la table</strong>
        <small>Choisissez une seule option.</small>
      </div>
      <div className="options-symetrie" role="radiogroup" aria-labelledby="titre-symetrie">
        {OPTIONS_SYMETRIE.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={props.valeur === o.id}
            data-symetrie={o.id}
            onClick={() => props.onChange(o.id)}
          >
            <PictoSymetrie type={o.id} />
            <span className="texte">
              <strong>{o.titre}</strong>
              <small>{o.aide}</small>
            </span>
          </button>
        ))}
      </div>
      {detail.length > 0 && (
        <div className="symetrie-detail">
          {detail.map((t, i) => (
            <p key={i}>{t}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [etat, setEtat] = useState<Etat>(charger);
  const [onglet, setOnglet] = useState<Onglet>('carte');
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  /** Cases sélectionnées = cases figées lors d'une régénération. */
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  /** Sélection multiple active : un toucher ajoute ou retire une case au lieu de la remplacer. */
  const [modeMulti, setModeMulti] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);

  const { reglages, quantites } = etat;
  const blocs = useMemo(() => appliquerQuantites(quantites), [quantites]);
  const stockUtilisable = useMemo(() => construireVariantes(blocs).types.reduce((s, t) => s + t.quantite, 0), [blocs]);
  const typesChoisissables = useMemo(() => BLOCS_BASE.filter(estUtilisable), []);
  const cases = reglages.lignes * reglages.colonnes;
  const stockSuffisant = stockUtilisable >= cases;
  const cleCourante = JSON.stringify([
    reglages.lignes,
    reglages.colonnes,
    reglages.sortieBord,
    reglages.nbReseaux,
    reglages.exigerSortie,
    reglages.symetrie,
    quantites,
  ]);

  useEffect(() => sauver(etat), [etat]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 3500);
    return () => clearTimeout(t);
  }, [message]);

  const majReglages = (patch: Partial<Reglages>) => setEtat((e) => ({ ...e, reglages: { ...e.reglages, ...patch } }));
  const majQuantite = (id: string, v: number) =>
    setEtat((e) => ({ ...e, personnalise: true, quantites: { ...e.quantites, [id]: v } }));

  // --- Sélection -----------------------------------------------------------------------------
  const appliquerSelection = (s: Set<string>, multi: boolean) => {
    setSelection(s);
    setModeMulti(multi && s.size > 0);
  };
  const deselectionner = () => appliquerSelection(new Set(), false);
  const basculer = (l: number, c: number) => {
    const k = cleCase(l, c);
    const s = new Set(selection);
    if (s.has(k)) s.delete(k);
    else s.add(k);
    appliquerSelection(s, true);
  };
  const toucher = (l: number, c: number, multi: boolean) => {
    if (modeMulti || multi) {
      basculer(l, c);
      return;
    }
    const k = cleCase(l, c);
    appliquerSelection(selection.size === 1 && selection.has(k) ? new Set() : new Set([k]), false);
  };

  // --- Génération ----------------------------------------------------------------------------
  const lancer = useCallback(() => {
    worker.current?.terminate();
    setEnCours(true);
    setErreur(null);
    const graine = Math.floor(Math.random() * 2147483647);
    const { lignes, colonnes, sortieBord, nbReseaux, exigerSortie, symetrie } = reglages;

    // Les cases sélectionnées sont imposées au générateur : elles gardent type et orientation.
    const memeTable = generation !== null && generation.lignes === lignes && generation.colonnes === colonnes;
    const fixes = memeTable
      ? [...selection].map((k) => {
          const [l, c] = depuisCle(k);
          const cel = generation!.grille[l][c];
          return { l, c, typeId: cel.typeId, rotation: cel.rotation };
        })
      : [];
    if (!memeTable && selection.size > 0) deselectionner();

    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = (e: MessageEvent<Resultat>) => {
      w.terminate();
      setEnCours(false);
      if (e.data.ok) {
        setGeneration({ grille: e.data.grille, graine, blocs, lignes, colonnes, ms: e.data.stats.ms, modifiee: false, cle: cleCourante });
      } else {
        setErreur(e.data.raison);
      }
    };
    w.onerror = () => {
      w.terminate();
      setEnCours(false);
      setErreur('Erreur interne pendant la génération.');
    };
    w.postMessage({
      blocs,
      options: { lignes, colonnes, sortieBord, nbReseaux, exigerSortie, symetrie, fixes, graine, tempsMaxMs: 4000 },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocs, reglages, cleCourante, generation, selection]);

  // Première carte dès l'ouverture, pour voir tout de suite le résultat.
  useEffect(() => {
    lancer();
    return () => worker.current?.terminate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const perimee = generation !== null && generation.cle !== cleCourante;

  // --- Contrôle des règles en direct (après une modification manuelle, ou un changement de règle) ---
  const rapport = useMemo(
    () =>
      generation
        ? verifier(generation.grille, blocs, {
            lignes: generation.lignes,
            colonnes: generation.colonnes,
            sortieBord: reglages.sortieBord,
            nbReseaux: reglages.nbReseaux,
            exigerSortie: reglages.exigerSortie,
            symetrie: reglages.symetrie,
          })
        : null,
    [generation, blocs, reglages.sortieBord, reglages.nbReseaux, reglages.exigerSortie, reglages.symetrie],
  );
  const casesEnConflit = useMemo(
    () => new Set((rapport?.conflits ?? []).flatMap((c) => c.cases.map(([l, col]) => cleCase(l, col)))),
    [rapport],
  );

  // Symétriques des blocs sélectionnés : conservés eux aussi à la régénération.
  const fantomes = useMemo(() => {
    const s = new Set<string>();
    if (!generation || reglages.symetrie === 'aucune') return s;
    for (const k of selection) {
      const [l, c] = depuisCle(k);
      const [ml, mc] = caseSymetrique(l, c, generation.lignes, generation.colonnes, reglages.symetrie);
      const km = cleCase(ml, mc);
      if (!selection.has(km)) s.add(km);
    }
    return s;
  }, [selection, generation, reglages.symetrie]);

  const montage = useMemo(() => {
    if (!generation) return [];
    const compte = new Map<string, number>();
    for (const l of generation.grille) for (const c of l) compte.set(c.typeId, (compte.get(c.typeId) ?? 0) + 1);
    return blocs.filter((b) => compte.has(b.id)).map((b) => ({ bloc: b, n: compte.get(b.id)! }));
  }, [generation, blocs]);

  // --- Édition du bloc sélectionné -----------------------------------------------------------
  const cleUnique = selection.size === 1 ? [...selection][0] : null;
  const [selL, selC] = cleUnique ? depuisCle(cleUnique) : [-1, -1];
  const celluleSel = cleUnique && generation ? generation.grille[selL]?.[selC] : undefined;
  const blocSel = celluleSel ? BLOCS_BASE.find((b) => b.id === celluleSel.typeId) : undefined;
  const miroirSel =
    cleUnique && generation && reglages.symetrie !== 'aucune'
      ? caseSymetrique(selL, selC, generation.lignes, generation.colonnes, reglages.symetrie)
      : null;

  const modifierCellule = (f: (cel: CellulePosee) => CellulePosee) =>
    setGeneration(
      (g) =>
        g && {
          ...g,
          modifiee: true,
          grille: g.grille.map((ligne, i) => (i === selL ? ligne.map((cel, j) => (j === selC ? f(cel) : cel)) : ligne)),
        },
    );
  const changerType = (id: string) => modifierCellule((cel) => ({ typeId: id, rotation: cel.rotation }));
  const tourner = (sens: 1 | -1) => {
    if (!blocSel) return;
    modifierCellule((cel) => ({ ...cel, rotation: rotationSuivante(blocSel, cel.rotation, sens) }));
  };

  const exporter = async () => {
    const svg = document.getElementById('carte-svg') as SVGSVGElement | null;
    if (!svg || !generation) return;
    try {
      const mode = await exporterPng(svg, `tranchees-${generation.lignes}x${generation.colonnes}-${generation.graine}.png`);
      setMessage(mode === 'partage' ? 'Image partagée.' : 'Image enregistrée dans vos téléchargements.');
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <div className="appli">
      <header className="entete">
        <h1>Générateur de tranchées</h1>
        <span className="sous-titre">Trench Crusade</span>
      </header>

      <main className="contenu">
        {onglet === 'carte' && (
          <section aria-label="Carte">
            {!stockSuffisant && (
              <div className="bandeau alerte" role="alert">
                Il manque des blocs : {stockUtilisable} utilisables pour {cases} cases.{' '}
                <button type="button" className="lien" onClick={() => setOnglet('blocs')}>
                  Compléter le stock
                </button>
              </div>
            )}
            {perimee && <div className="bandeau info">Les réglages ou le stock ont changé : regénérez pour appliquer.</div>}
            {erreur && (
              <div className="bandeau alerte" role="alert">
                <strong>{erreur}</strong>
                {conseil(erreur) && <div>{conseil(erreur)}</div>}
              </div>
            )}

            {generation ? (
              <>
                <div className="meta">
                  Table {generation.lignes}×{generation.colonnes} · {generation.lignes * generation.colonnes} blocs
                  {generation.modifiee ? ' · modifiée à la main' : ` · graine ${generation.graine}`}
                  {reglages.symetrie !== 'aucune' && ` · symétrie ${reglages.symetrie === 'centrale' ? 'centrale' : 'axiale'}`}
                </div>
                <div className={`carte${enCours ? ' calcul' : ''}`}>
                  <GrilleSvg
                    id="carte-svg"
                    grille={generation.grille}
                    blocs={generation.blocs}
                    quadrillage={reglages.quadrillage}
                    selection={selection}
                    conflits={casesEnConflit}
                    fantomes={fantomes}
                    symetrie={reglages.symetrie}
                    onTap={toucher}
                    onLongPress={(l, c) => basculer(l, c)}
                  />
                  {enCours && <div className="voile">Calcul en cours…</div>}
                </div>

                {reglages.symetrie !== 'aucune' && (
                  <p className="legende-symetrie">
                    <span className="pastille-guide" aria-hidden="true" />
                    {reglages.symetrie === 'centrale'
                      ? 'Cible bleue : centre de symétrie. La carte est identique après un demi-tour.'
                      : 'Ligne bleue pointillée : axe de symétrie Est–Ouest. Le haut et le bas se répondent comme dans un miroir.'}
                  </p>
                )}

                {rapport && rapport.conflits.length > 0 && (
                  <div className="bandeau avertissement" role="status" aria-live="polite">
                    <strong>
                      {rapport.conflits.length === 1 ? 'Une règle n’est pas respectée' : `${rapport.conflits.length} règles ne sont pas respectées`}
                    </strong>
                    <ul>
                      {rapport.conflits.map((c, i) => (
                        <li key={i}>{c.message}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {selection.size === 0 && (
                  <p className="astuce">
                    Touchez un bloc pour le modifier. Appui long pour en sélectionner plusieurs (Ctrl + clic sur ordinateur). Les blocs
                    sélectionnés sont conservés quand vous regénérez la carte.
                  </p>
                )}

                {selection.size >= 2 && (
                  <div className="barre-selection">
                    <div>
                      <strong>{selection.size} blocs sélectionnés</strong>
                      <small>Conservés à la régénération. Sélectionnez un seul bloc pour le modifier.</small>
                    </div>
                    <button type="button" className="secondaire" onClick={deselectionner}>
                      Tout désélectionner
                    </button>
                  </div>
                )}

                {blocSel && celluleSel && (
                  <section className="edition" aria-label="Modifier le bloc sélectionné">
                    <div className="edition-tete">
                      <ApercuBloc bloc={blocSel} rotation={celluleSel.rotation} taille={64} />
                      <div className="edition-titre">
                        <strong>Case {nomCase(selL, selC)}</strong>
                        <div>{blocSel.nom}</div>
                        <small>{descriptionBloc(blocSel)} · conservé à la régénération</small>
                      </div>
                    </div>
                    <div className="edition-rotation">
                      <button type="button" className="secondaire" onClick={() => tourner(-1)}>
                        ↺ Tourner à gauche
                      </button>
                      <button type="button" className="secondaire" onClick={() => tourner(1)}>
                        ↻ Tourner à droite
                      </button>
                    </div>
                    {miroirSel && (
                      <p className="note-symetrie">
                        {miroirSel[0] === selL && miroirSel[1] === selC
                          ? `Ce bloc est ${reglages.symetrie === 'centrale' ? 'au centre de la table' : "sur l'axe de symétrie"} : il doit être identique à son image.`
                          : `Symétrie active : le bloc en ${nomCase(miroirSel[0], miroirSel[1])} (cadre pointillé) est conservé lui aussi à la régénération. Modifier ce bloc ne modifie pas son symétrique : un avertissement signale alors la rupture de symétrie.`}
                      </p>
                    )}
                    <div className="titre-choix" id="titre-types">
                      Type de bloc
                    </div>
                    <div className="choix-types" role="radiogroup" aria-labelledby="titre-types">
                      {typesChoisissables.map((b) => {
                        const actuel = b.id === celluleSel.typeId;
                        const utilises = rapport?.utilisation[b.id] ?? 0;
                        const quantite = blocs.find((x) => x.id === b.id)?.quantite ?? 0;
                        const epuise = !actuel && utilises >= quantite;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            role="radio"
                            aria-checked={actuel}
                            onClick={() => changerType(b.id)}
                            data-type={b.id}
                          >
                            <ApercuBloc bloc={b} rotation={celluleSel.rotation} taille={48} />
                            <span className="nom">{b.nom}</span>
                            <small className={epuise ? 'epuise' : ''}>
                              {utilises}/{quantite}
                              {epuise ? ' · stock épuisé' : ''}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                    <div className="actions">
                      <button type="button" className="secondaire" onClick={deselectionner}>
                        Désélectionner
                      </button>
                    </div>
                  </section>
                )}
              </>
            ) : (
              !erreur && <div className="vide">{enCours ? 'Calcul en cours…' : 'Aucune carte pour le moment.'}</div>
            )}

            <div className="actions">
              <button type="button" className="primaire" onClick={lancer} disabled={enCours || !stockSuffisant}>
                {generation ? (selection.size > 0 ? 'Regénérer le reste de la carte' : 'Regénérer une carte') : 'Générer une carte'}
              </button>
              <button type="button" className="secondaire" onClick={exporter} disabled={!generation || enCours}>
                Exporter en image
              </button>
            </div>

            {generation && (
              <section className="montage" aria-label="Liste de montage">
                <h2>Blocs à sortir de la boîte</h2>
                <ul>
                  {montage.map(({ bloc, n }) => (
                    <li key={bloc.id}>
                      <ApercuBloc bloc={bloc} taille={44} />
                      <span className="nom">{bloc.nom}</span>
                      <span className={`compte${n > bloc.quantite ? ' depasse' : ''}`}>
                        × {n}
                        <small> / {bloc.quantite}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </section>
        )}

        {onglet === 'blocs' && (
          <section aria-label="Mes blocs">
            <h2>Mes blocs</h2>
            <p className="aide">Indiquez combien d’exemplaires de chaque bloc vous possédez. La carte est toujours construite avec ce stock.</p>
            {!etat.personnalise && (
              <div className="bandeau info">Ces quantités sont des exemples. Remplacez-les par celles de votre collection.</div>
            )}
            <div className={`bilan ${stockSuffisant ? 'ok' : 'ko'}`}>
              {stockUtilisable} blocs utilisables · {cases} cases à remplir
              {stockSuffisant ? ' ✓' : ` — il en manque ${cases - stockUtilisable}`}
            </div>
            <ul className="liste-blocs">
              {BLOCS_BASE.map((b) => {
                const def = blocs.find((x) => x.id === b.id) ?? b;
                const inutilisable = !estUtilisable(b);
                return (
                  <li key={b.id} className={inutilisable ? 'inactif' : ''}>
                    <div className="apercus">
                      <ApercuBloc bloc={b} taille={56} />
                    </div>
                    <div className="texte">
                      <strong>{b.nom}</strong>
                      <small>{descriptionBloc(b)}</small>
                    </div>
                    {inutilisable ? (
                      <span className="exclu">exclu</span>
                    ) : (
                      <Stepper valeur={def.quantite} etiquette={`quantité de ${b.nom}`} onChange={(v) => majQuantite(b.id, v)} />
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="actions">
              <button
                type="button"
                className="secondaire"
                onClick={() =>
                  setEtat((e) => ({ ...e, personnalise: true, quantites: Object.fromEntries(BLOCS_BASE.map((b) => [b.id, 0])) }))
                }
              >
                Tout remettre à zéro
              </button>
              <button
                type="button"
                className="secondaire"
                onClick={() => setEtat((e) => ({ ...e, personnalise: false, quantites: quantitesExemple() }))}
              >
                Quantités d’exemple
              </button>
            </div>
          </section>
        )}

        {onglet === 'reglages' && (
          <section aria-label="Réglages">
            <h2>Réglages</h2>
            <div className="groupe">
              <div className="ligne-reglage">
                <span className="texte">
                  <strong>Lignes</strong>
                  <small>Nombre de blocs dans la hauteur</small>
                </span>
                <Stepper valeur={reglages.lignes} min={1} max={16} etiquette="nombre de lignes" onChange={(v) => majReglages({ lignes: v })} />
              </div>
              <div className="ligne-reglage">
                <span className="texte">
                  <strong>Colonnes</strong>
                  <small>Nombre de blocs dans la largeur</small>
                </span>
                <Stepper valeur={reglages.colonnes} min={1} max={16} etiquette="nombre de colonnes" onChange={(v) => majReglages({ colonnes: v })} />
              </div>
              <div className="total">
                {cases} blocs au total{cases > LIMITE_CASES_CONSEILLEE ? ' — la génération peut être lente' : ''}
              </div>
            </div>

            <SelecteurSymetrie
              valeur={reglages.symetrie}
              onChange={(v) => majReglages({ symetrie: v })}
              lignes={reglages.lignes}
              colonnes={reglages.colonnes}
            />

            <SelecteurReseaux valeur={reglages.nbReseaux} onChange={(v) => majReglages({ nbReseaux: v })} />

            <div className="groupe">
              <Interrupteur
                actif={reglages.sortieBord}
                onChange={(v) => majReglages({ sortieBord: v })}
                titre="Tranchées ouvertes sur le bord"
                aide="Une tranchée peut déboucher sur le bord de la table."
              />
              <Interrupteur
                actif={reglages.exigerSortie}
                onChange={(v) => majReglages({ exigerSortie: v })}
                titre="Aucune tranchée fermée"
                aide="Chaque réseau a au moins une rampe de sortie ou, si c'est autorisé, une ouverture sur le bord de la table."
              />
            </div>

            <div className="groupe">
              <Interrupteur
                actif={reglages.quadrillage}
                onChange={(v) => majReglages({ quadrillage: v })}
                titre="Afficher le quadrillage"
                aide="Traits entre les blocs sur la carte."
              />
            </div>

            <p className="aide">
              Les règles toujours appliquées : deux blocs voisins se raccordent (tranchée contre tranchée, surface contre surface), et le
              stock n’est jamais dépassé. Si vous modifiez un bloc à la main et qu’une règle active n’est plus respectée, la carte vous
              l’indique.
            </p>
          </section>
        )}
      </main>

      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}

      <nav className="onglets" aria-label="Navigation">
        {(
          [
            ['carte', 'Carte'],
            ['blocs', 'Blocs'],
            ['reglages', 'Réglages'],
          ] as const
        ).map(([id, nom]) => (
          <button key={id} type="button" className={onglet === id ? 'actif' : ''} aria-current={onglet === id ? 'page' : undefined} onClick={() => setOnglet(id)}>
            {nom}
          </button>
        ))}
      </nav>
    </div>
  );
}
