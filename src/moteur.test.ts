import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerBlocs, appliquerStock } from './cli.js';
import { construireVariantes, rotationSuivante, validerBloc } from './blocs.js';
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

test('réseau fermé : détecté par le vérificateur, et seulement quand la règle est active', () => {
  // Une boucle de 4 coudes, sans rampe ni ouverture sur le bord.
  const boucle = [
    [{ typeId: 'coude', rotation: 3 }, { typeId: 'coude', rotation: 0 }],
    [{ typeId: 'coude', rotation: 2 }, { typeId: 'coude', rotation: 1 }],
  ];
  const base = { lignes: 2, colonnes: 2, sortieBord: false, unSeulReseau: true };
  assert.deepEqual(verifier(boucle, blocs, { ...base, exigerSortie: false }).erreurs, []);
  const avec = verifier(boucle, blocs, { ...base, exigerSortie: true });
  assert.equal(avec.erreurs.length, 1);
  assert.match(avec.erreurs[0], /fermé/);
  assert.equal(avec.conflits[0].cases.length, 4);
});

test('réseau fermé : impossible à satisfaire sans rampe ni bord ouvert', () => {
  const stock = appliquerStock(
    blocs,
    'vide=0,droit=20,coude=20,te=10,croix=10,rampe=0,impasse=0,coude_decale=0,double_coude_decale=0',
  );
  const r = generer(stock, { lignes: 3, colonnes: 3, sortieBord: false, tempsMaxMs: 8000 });
  assert.ok(!r.ok);
  if (!r.ok) assert.match(r.raison, /Aucune configuration possible/);
});

test('blocs figés : conservés exactement après régénération', () => {
  const options: Options = { ...OPTIONS_DEFAUT, tempsMaxMs: 3000 };
  for (let graine = 1; graine <= 15; graine++) {
    const base = generer(blocs, { ...options, graine });
    assert.ok(base.ok, `base graine ${graine}`);
    if (!base.ok) continue;
    const fixes = [[0, 0], [1, 3], [2, 2], [4, 5], [5, 1]].map(([l, c]) => ({ l, c, ...base.grille[l][c] }));
    const r = generer(blocs, { ...options, graine: graine + 1000, fixes });
    assert.ok(r.ok, `régénération graine ${graine} : ${r.ok ? '' : r.raison}`);
    if (!r.ok) continue;
    for (const f of fixes) assert.deepEqual(r.grille[f.l][f.c], { typeId: f.typeId, rotation: f.rotation });
    assert.deepEqual(verifier(r.grille, blocs, options).erreurs, [], `graine ${graine}`);
  }
});

test('blocs figés : conflits refusés avec un message clair', () => {
  const incompatibles = [
    { l: 0, c: 0, typeId: 'droit', rotation: 1 }, // tranchée vers l'est
    { l: 0, c: 1, typeId: 'vide', rotation: 0 }, // surface à l'ouest
  ];
  const a = generer(blocs, { fixes: incompatibles });
  assert.ok(!a.ok);
  if (!a.ok) assert.match(a.raison, /ne se raccordent pas/);

  const trop = Array.from({ length: 13 }, (_, i) => ({ l: Math.floor(i / 6), c: i % 6, typeId: 'droit', rotation: 0 }));
  const b = generer(blocs, { fixes: trop });
  assert.ok(!b.ok);
  if (!b.ok) assert.match(b.raison, /dépassent le stock/);

  const bord = generer(blocs, { sortieBord: false, fixes: [{ l: 0, c: 0, typeId: 'droit', rotation: 0 }] });
  assert.ok(!bord.ok);
  if (!bord.ok) assert.match(bord.raison, /bord de la table/);
});

test('rotationSuivante : saute les orientations identiques', () => {
  const bloc = (id: string) => blocs.find((b) => b.id === id)!;
  assert.equal(rotationSuivante(bloc('droit'), 0, 1), 1);
  assert.equal(rotationSuivante(bloc('droit'), 1, 1), 2);
  assert.equal(rotationSuivante(bloc('croix'), 2, 1), 2);
  assert.equal(rotationSuivante(bloc('coude'), 0, -1), 3);
});
