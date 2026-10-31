import type { BlocDef } from './types.js';
import { generer, OPTIONS_DEFAUT, type Options } from './generateur.js';
import { verifier } from './verificateur.js';
import { chargerBlocs } from './cli.js';

const NB = Number(process.argv[2] ?? 100);

/** Multiplie le stock pour qu'il couvre `facteur` fois le nombre de cases. */
function stockPour(blocs: BlocDef[], cases: number, facteur: number): BlocDef[] {
  const total = blocs.filter((b) => b.liaisons.every((g) => g.length > 1 || b.fin === 'autorisee')).reduce((s, b) => s + b.quantite, 0);
  const k = Math.max(1, Math.ceil((cases * facteur) / total));
  return blocs.map((b) => ({ ...b, quantite: b.quantite * k }));
}

interface Scenario {
  nom: string;
  lignes: number;
  colonnes: number;
  sortieBord: boolean;
  unSeulReseau: boolean;
  stock: 'defaut' | 'large';
}

const scenarios: Scenario[] = [];
for (const [l, c] of [[4, 4], [6, 6], [8, 8], [10, 10]] as const) {
  for (const sortieBord of [true, false]) {
    for (const unSeulReseau of [true, false]) {
      scenarios.push({
        nom: `${l}×${c} bord:${sortieBord ? 'oui' : 'non'} réseau:${unSeulReseau ? 'un' : 'plusieurs'}`,
        lignes: l,
        colonnes: c,
        sortieBord,
        unSeulReseau,
        stock: 'large',
      });
    }
  }
}
scenarios.push({ nom: '6×6 stock par défaut bord:oui réseau:un', lignes: 6, colonnes: 6, sortieBord: true, unSeulReseau: true, stock: 'defaut' });
scenarios.push({ nom: '6×6 stock par défaut bord:non réseau:un', lignes: 6, colonnes: 6, sortieBord: false, unSeulReseau: true, stock: 'defaut' });

const base = chargerBlocs();
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const mediane = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;

console.log(`Banc d'essai : ${NB} graines par scénario, budget 1000 ms par génération\n`);
console.log(pad('Scénario', 54) + pad('Succès', 9) + pad('Invalides', 11) + pad('ms méd.', 9) + pad('ms max', 8) + pad('Distinctes', 12) + 'Cases tranchée');

let invalidesTotal = 0;
for (const s of scenarios) {
  const blocs = s.stock === 'large' ? stockPour(base, s.lignes * s.colonnes, 1.5) : base;
  const options: Partial<Options> = {
    ...OPTIONS_DEFAUT,
    lignes: s.lignes,
    colonnes: s.colonnes,
    sortieBord: s.sortieBord,
    unSeulReseau: s.unSeulReseau,
    tempsMaxMs: 1000,
  };
  let succes = 0;
  let invalides = 0;
  const temps: number[] = [];
  const empreintes = new Set<string>();
  let ratioTranchee = 0;
  for (let graine = 1; graine <= NB; graine++) {
    const r = generer(blocs, { ...options, graine });
    temps.push(r.stats.ms);
    if (!r.ok) continue;
    succes++;
    const rap = verifier(r.grille, blocs, { ...(options as Options) });
    if (rap.erreurs.length) invalides++;
    empreintes.add(JSON.stringify(r.grille));
    const cases = s.lignes * s.colonnes;
    ratioTranchee += (cases - (rap.utilisation['vide'] ?? 0)) / cases;
  }
  invalidesTotal += invalides;
  console.log(
    pad(s.nom, 54) +
      pad(`${succes}/${NB}`, 9) +
      pad(invalides, 11) +
      pad(mediane(temps), 9) +
      pad(Math.max(...temps), 8) +
      pad(empreintes.size, 12) +
      (succes ? `${Math.round((100 * ratioTranchee) / succes)} %` : '—'),
  );
}
console.log(`\nGrilles rejetées par le vérificateur indépendant : ${invalidesTotal}`);
if (invalidesTotal > 0) process.exitCode = 2;
