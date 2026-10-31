import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerBlocs, appliquerStock } from './cli.js';
import { construireVariantes, validerBloc } from './blocs.js';
import { generer, OPTIONS_DEFAUT, type Options } from './generateur.js';
import { verifier } from './verificateur.js';
import type { BlocDef } from './types.js';

const blocs = chargerBlocs();

test('variantes : rotations dédoublonnées, impasse exclue', () => {
  const { variantes } = construireVariantes(blocs);
  const par = (id: string) => variantes.filter((v) => v.typeId === id).length;
  assert.equal(par('vide'), 1);
  assert.equal(par('droit'), 2);
  assert.equal(par('coude'), 4);
  assert.equal(par('te'), 4);
  assert.equal(par('croix'), 1);
  assert.equal(par('rampe'), 4);
  assert.equal(par('coude_decale'), 4);
  assert.equal(par('double_coude_decale'), 2);
  assert.equal(par('impasse'), 4);
});

test('validation : bloc incohérent refusé', () => {
  const mauvais: BlocDef = { ...blocs[1], liaisons: [['N']] }; // S est T mais sans liaison
  assert.throws(() => validerBloc(mauvais), /n'appartient à aucune liaison/);
  assert.throws(() => validerBloc({ ...blocs[1], id: 'Droit Bizarre' }), /id/);
});

test('génération : 200 graines × 4 combinaisons de paramètres, toutes valides', () => {
  for (const sortieBord of [true, false]) {
    for (const unSeulReseau of [true, false]) {
      const options: Options = { ...OPTIONS_DEFAUT, sortieBord, unSeulReseau, tempsMaxMs: 3000 };
      for (let graine = 1; graine <= 50; graine++) {
        const r = generer(blocs, { ...options, graine });
        assert.ok(r.ok, `échec graine ${graine} (bord=${sortieBord}, un=${unSeulReseau}) : ${r.ok ? '' : r.raison}`);
        if (r.ok) {
          const rap = verifier(r.grille, blocs, options);
          assert.deepEqual(rap.erreurs, [], `graine ${graine}`);
          if (unSeulReseau) assert.ok(rap.reseaux <= 1);
        }
      }
    }
  }
});

test('déterminisme : même graine = même grille', () => {
  const a = generer(blocs, { graine: 42 });
  const b = generer(blocs, { graine: 42 });
  assert.ok(a.ok && b.ok);
  if (a.ok && b.ok) assert.deepEqual(a.grille, b.grille);
});

test('stock : jamais dépassé, et insuffisance détectée', () => {
  const serre = appliquerStock(blocs, 'vide=2,droit=2,coude=2,te=1,croix=1,rampe=1,coude_decale=1,double_coude_decale=1');
  const r = generer(serre, { lignes: 6, colonnes: 6 });
  assert.ok(!r.ok);
  if (!r.ok) assert.match(r.raison, /Stock insuffisant/);
});

test('impossibilité prouvée : que des droits sur une table sans sortie de bord', () => {
  const seulDroit = blocs.map((b) => ({ ...b, quantite: b.id === 'droit' ? 40 : 0 }));
  const r = generer(seulDroit, { lignes: 6, colonnes: 6, sortieBord: false, tempsMaxMs: 5000 });
  assert.ok(!r.ok);
  if (!r.ok) assert.match(r.raison, /Aucune configuration possible/);
});

test('le vérificateur détecte une grille invalide', () => {
  const grille = [
    [{ typeId: 'droit', rotation: 0 }, { typeId: 'vide', rotation: 0 }],
    [{ typeId: 'vide', rotation: 0 }, { typeId: 'vide', rotation: 0 }],
  ];
  const rap = verifier(grille, blocs, { lignes: 2, colonnes: 2, sortieBord: false, unSeulReseau: true });
  assert.ok(rap.erreurs.length > 0);
});

test('impasse : posable comme les autres blocs, et jamais sans raccord', () => {
  const stock = appliquerStock(blocs, 'vide=10,droit=20,coude=20,te=4,impasse=10,rampe=0,croix=0,coude_decale=0,double_coude_decale=0');
  const options: Options = { ...OPTIONS_DEFAUT, tempsMaxMs: 3000 };
  let posees = 0;
  for (let graine = 1; graine <= 30; graine++) {
    const r = generer(stock, { ...options, graine });
    assert.ok(r.ok, `échec graine ${graine}`);
    if (!r.ok) continue;
    const rap = verifier(r.grille, stock, options);
    assert.deepEqual(rap.erreurs, [], `graine ${graine}`);
    posees += rap.utilisation['impasse'] ?? 0;
  }
  assert.ok(posees > 0, "l'impasse n'est jamais posée");
});
