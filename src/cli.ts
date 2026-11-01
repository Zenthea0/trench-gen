import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BlocDef, FichierBlocs } from './types.js';
import { generer, OPTIONS_DEFAUT, type Options } from './generateur.js';
import { verifier } from './verificateur.js';
import { rendreAscii, rendreCodes } from './rendu.js';

const AIDE = `Usage : npm run generer -- [options]

  --lignes N         nombre de lignes de la table (défaut ${OPTIONS_DEFAUT.lignes})
  --colonnes N       nombre de colonnes (défaut ${OPTIONS_DEFAUT.colonnes})
  --graine N         graine aléatoire (défaut ${OPTIONS_DEFAUT.graine})
  --bord oui|non     une tranchée peut-elle sortir sur le bord de table ? (défaut oui)
  --reseaux un|plusieurs   un seul réseau connexe ou plusieurs (défaut un)
  --sortie-requise oui|non   chaque réseau doit avoir une rampe ou une ouverture sur le bord (défaut oui)
  --densite 0..1    tendance à poser des tranchées plutôt que des blocs plats (défaut ${OPTIONS_DEFAUT.densite})
  --min-tranchee N   nombre minimal de cases contenant une tranchée (défaut 0)
  --temps MS         budget de temps en ms (défaut ${OPTIONS_DEFAUT.tempsMaxMs})
  --stock "id=n,id=n"  remplace les quantités de certains blocs (ex : "droit=5,croix=0")
  --blocs FICHIER    fichier de définition des blocs (défaut data/blocs.json)
  --codes            affiche aussi la grille sous forme de codes id + rotation
  --json             affiche uniquement le résultat en JSON
`;

function lireArgs(argv: string[]): Record<string, string | true> {
  const r: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const cle = a.slice(2);
    const suite = argv[i + 1];
    if (suite !== undefined && !suite.startsWith('--')) {
      r[cle] = suite;
      i++;
    } else {
      r[cle] = true;
    }
  }
  return r;
}

export function chargerBlocs(chemin?: string): BlocDef[] {
  const url = chemin ?? fileURLToPath(new URL('../data/blocs.json', import.meta.url));
  return (JSON.parse(readFileSync(url, 'utf8')) as FichierBlocs).blocs;
}

export function appliquerStock(blocs: BlocDef[], spec: string): BlocDef[] {
  const surcharge = new Map<string, number>();
  for (const part of spec.split(',')) {
    const [id, q] = part.split('=').map((s) => s.trim());
    if (!id || q === undefined || !/^\d+$/.test(q)) throw new Error(`Stock invalide : « ${part} ».`);
    if (!blocs.some((b) => b.id === id)) throw new Error(`Bloc inconnu dans --stock : « ${id} ».`);
    surcharge.set(id, Number(q));
  }
  return blocs.map((b) => (surcharge.has(b.id) ? { ...b, quantite: surcharge.get(b.id)! } : b));
}

function principal() {
  const args = lireArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(AIDE);
    return;
  }
  const num = (k: string, defaut: number) => (typeof args[k] === 'string' ? Number(args[k]) : defaut);
  const options: Partial<Options> = {
    lignes: num('lignes', OPTIONS_DEFAUT.lignes),
    colonnes: num('colonnes', OPTIONS_DEFAUT.colonnes),
    graine: num('graine', OPTIONS_DEFAUT.graine),
    densite: num('densite', OPTIONS_DEFAUT.densite),
    tempsMaxMs: num('temps', OPTIONS_DEFAUT.tempsMaxMs),
    minBlocsTranchee: num('min-tranchee', 0),
    sortieBord: args.bord !== 'non',
    unSeulReseau: args.reseaux !== 'plusieurs',
    exigerSortie: args['sortie-requise'] !== 'non',
  };

  let blocs = chargerBlocs(typeof args.blocs === 'string' ? args.blocs : undefined);
  if (typeof args.stock === 'string') blocs = appliquerStock(blocs, args.stock);

  const res = generer(blocs, options);
  if (!res.ok) {
    console.error(`✗ Échec : ${res.raison}  (${res.stats.essais} essais, ${res.stats.noeuds} nœuds, ${res.stats.ms} ms)`);
    process.exitCode = 1;
    return;
  }
  const opts = { ...OPTIONS_DEFAUT, ...options };
  const rapport = verifier(res.grille, blocs, opts);

  if (args.json) {
    console.log(JSON.stringify({ options: opts, grille: res.grille }, null, 2));
    return;
  }
  console.log(
    `Table ${opts.lignes}×${opts.colonnes} — graine ${opts.graine} — ${res.stats.essais} essai(s), ${res.stats.noeuds} nœuds, ${res.stats.ms} ms`,
  );
  console.log(rendreAscii(res.grille, blocs));
  if (args.codes) console.log('\n' + rendreCodes(res.grille, blocs));
  const util = blocs
    .filter((b) => rapport.utilisation[b.id])
    .map((b) => `${b.nom} ${rapport.utilisation[b.id]}/${b.quantite}`)
    .join(' · ');
  console.log(`\nBlocs utilisés : ${util}`);
  console.log(`Réseaux : ${rapport.reseaux}`);
  console.log(
    rapport.erreurs.length === 0
      ? 'Vérification indépendante : OK'
      : 'Vérification indépendante : ERREURS\n - ' + rapport.erreurs.join('\n - '),
  );
  if (rapport.erreurs.length) process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) principal();
