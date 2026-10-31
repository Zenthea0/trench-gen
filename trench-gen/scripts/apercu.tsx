// Génère une page HTML d'aperçu (planche des blocs + une carte) pour contrôler le rendu.
// Usage : npx tsx scripts/apercu.tsx sortie.html [graine] [lignes] [colonnes]
import { writeFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { chargerBlocs } from '../src/cli.js';
import { generer } from '../src/generateur.js';
import { ApercuBloc, GrilleSvg } from '../src/app/Tuile.js';

const [, , sortie = 'apercu.html', graine = '7', lignes = '6', colonnes = '6'] = process.argv;
const blocs = chargerBlocs();
const res = generer(blocs, { graine: Number(graine), lignes: Number(lignes), colonnes: Number(colonnes) });
if (!res.ok) throw new Error(res.raison);

const planche = (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
    {blocs.map((b) => (
      <div key={b.id} style={{ textAlign: 'center', font: '13px system-ui' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2, 3].map((r) => (
            <ApercuBloc key={r} bloc={b} rotation={r} taille={84} />
          ))}
        </div>
        <div style={{ marginTop: 4 }}>{b.nom}</div>
      </div>
    ))}
  </div>
);

const html = renderToStaticMarkup(
  <html>
    <body style={{ margin: 16, background: '#f3ead8' }}>
      {planche}
      <div style={{ maxWidth: 760 }}>
        <GrilleSvg grille={res.grille} blocs={blocs} selection={{ l: 2, c: 3 }} />
      </div>
    </body>
  </html>,
);
writeFileSync(sortie, '<!doctype html><meta charset="utf-8">' + html);
console.log('écrit', sortie);
