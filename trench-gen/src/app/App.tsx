import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BlocDef } from '../types.js';
import type { Grille, Resultat } from '../generateur.js';
import { construireVariantes, estUtilisable } from '../blocs.js';
import { ApercuBloc, GrilleSvg, nomColonne } from './Tuile.js';
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
  /** Empreinte des paramètres utilisés, pour savoir si la carte affichée est périmée. */
  cle: string;
}

const LIMITE_CASES_CONSEILLEE = 144;

function conseil(raison: string): string {
  if (raison.startsWith('Stock insuffisant')) return "Ajoutez des blocs dans l'onglet Blocs, ou réduisez la taille de la table.";
  if (raison.startsWith('Aucune configuration')) {
    return 'Essayez d’autoriser les sorties sur le bord de table ou plusieurs réseaux, ou ajoutez des blocs variés (croix, rampes, plats).';
  }
  if (raison.startsWith('Temps imparti')) return 'Relancez la génération, ou autorisez plusieurs réseaux pour faciliter la recherche.';
  return '';
}

function descriptionBloc(b: BlocDef): string {
  if (!estUtilisable(b)) return 'Cul-de-sac : jamais posé';
  if (b.liaisons.length === 0) return 'Terrain sans tranchée';
  if (b.fin === 'autorisee') return 'Sortie de tranchée (pente)';
  if (b.liaisons.length > 1) return `${b.liaisons.length} tranchées indépendantes, décalées`;
  const n = b.liaisons[0].length;
  return b.centre ? `${n} ouvertures` : `Tranchée décalée, ${n} ouvertures`;
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

export default function App() {
  const [etat, setEtat] = useState<Etat>(charger);
  const [onglet, setOnglet] = useState<Onglet>('carte');
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [selection, setSelection] = useState<{ l: number; c: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);

  const { reglages, quantites } = etat;
  const blocs = useMemo(() => appliquerQuantites(quantites), [quantites]);
  const stockUtilisable = useMemo(() => construireVariantes(blocs).types.reduce((s, t) => s + t.quantite, 0), [blocs]);
  const cases = reglages.lignes * reglages.colonnes;
  const stockSuffisant = stockUtilisable >= cases;
  const cleCourante = JSON.stringify([reglages.lignes, reglages.colonnes, reglages.sortieBord, reglages.unSeulReseau, quantites]);

  useEffect(() => sauver(etat), [etat]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 3500);
    return () => clearTimeout(t);
  }, [message]);

  const majReglages = (patch: Partial<Reglages>) => setEtat((e) => ({ ...e, reglages: { ...e.reglages, ...patch } }));
  const majQuantite = (id: string, v: number) =>
    setEtat((e) => ({ ...e, personnalise: true, quantites: { ...e.quantites, [id]: v } }));

  const lancer = useCallback(() => {
    worker.current?.terminate();
    setEnCours(true);
    setErreur(null);
    setSelection(null);
    const graine = Math.floor(Math.random() * 2147483647);
    const { lignes, colonnes, sortieBord, unSeulReseau } = reglages;
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = (e: MessageEvent<Resultat>) => {
      w.terminate();
      setEnCours(false);
      if (e.data.ok) {
        setGeneration({ grille: e.data.grille, graine, blocs, lignes, colonnes, ms: e.data.stats.ms, cle: cleCourante });
      } else {
        setErreur(e.data.raison);
      }
    };
    w.onerror = () => {
      w.terminate();
      setEnCours(false);
      setErreur('Erreur interne pendant la génération.');
    };
    w.postMessage({ blocs, options: { lignes, colonnes, sortieBord, unSeulReseau, graine, tempsMaxMs: 4000 } });
  }, [blocs, reglages, cleCourante]);

  // Première carte dès l'ouverture, pour voir tout de suite le résultat.
  useEffect(() => {
    lancer();
    return () => worker.current?.terminate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const perimee = generation !== null && generation.cle !== cleCourante;

  const montage = useMemo(() => {
    if (!generation) return [];
    const compte = new Map<string, number>();
    for (const l of generation.grille) for (const c of l) compte.set(c.typeId, (compte.get(c.typeId) ?? 0) + 1);
    return generation.blocs.filter((b) => compte.has(b.id)).map((b) => ({ bloc: b, n: compte.get(b.id)! }));
  }, [generation]);

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

  const celluleSel = selection && generation ? generation.grille[selection.l]?.[selection.c] : undefined;
  const blocSel = celluleSel ? generation?.blocs.find((b) => b.id === celluleSel.typeId) : undefined;

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
            {perimee && (
              <div className="bandeau info">Les réglages ou le stock ont changé : regénérez pour appliquer.</div>
            )}
            {erreur && (
              <div className="bandeau alerte" role="alert">
                <strong>{erreur}</strong>
                {conseil(erreur) && <div>{conseil(erreur)}</div>}
              </div>
            )}

            {generation ? (
              <>
                <div className="meta">
                  Table {generation.lignes}×{generation.colonnes} · {generation.lignes * generation.colonnes} blocs · graine {generation.graine}
                </div>
                <div className={`carte${enCours ? ' calcul' : ''}`}>
                  <GrilleSvg
                    id="carte-svg"
                    grille={generation.grille}
                    blocs={generation.blocs}
                    quadrillage={reglages.quadrillage}
                    selection={selection}
                    onSelection={(l, c) => setSelection((s) => (s && s.l === l && s.c === c ? null : { l, c }))}
                  />
                  {enCours && <div className="voile">Calcul en cours…</div>}
                </div>

                {blocSel && celluleSel && selection ? (
                  <div className="info-case">
                    <ApercuBloc bloc={blocSel} rotation={celluleSel.rotation} taille={64} />
                    <div>
                      <strong>
                        Case {nomColonne(selection.c)}
                        {selection.l + 1}
                      </strong>
                      <div>{blocSel.nom}</div>
                      <small>{descriptionBloc(blocSel)}</small>
                    </div>
                  </div>
                ) : (
                  <p className="astuce">Touchez une case pour voir le bloc à y poser.</p>
                )}
              </>
            ) : (
              !erreur && <div className="vide">{enCours ? 'Calcul en cours…' : 'Aucune carte pour le moment.'}</div>
            )}

            <div className="actions">
              <button type="button" className="primaire" onClick={lancer} disabled={enCours || !stockSuffisant}>
                {generation ? 'Regénérer une carte' : 'Générer une carte'}
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
                      <span className="compte">
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

            <div className="groupe">
              <Interrupteur
                actif={reglages.sortieBord}
                onChange={(v) => majReglages({ sortieBord: v })}
                titre="Tranchées ouvertes sur le bord"
                aide="Une tranchée peut déboucher sur le bord de la table."
              />
              <Interrupteur
                actif={reglages.unSeulReseau}
                onChange={(v) => majReglages({ unSeulReseau: v })}
                titre="Un seul réseau"
                aide="Toutes les tranchées sont reliées entre elles. Sinon, plusieurs réseaux séparés sont acceptés."
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
              Les règles toujours appliquées : deux blocs voisins se raccordent (tranchée contre tranchée, surface contre surface), aucune
              tranchée ne se termine contre un mur, et le stock n’est jamais dépassé.
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
