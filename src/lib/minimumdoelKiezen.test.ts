import { describe, expect, it } from 'vitest';
import type { MinimumdoelenSetBestand } from './minimumdoelen';
import { filterKiezerRijen, kiezerSets, resultaatVanKiezer } from './minimumdoelKiezen';

// Nagemaakte sets in de vorm van laag 1 (geen echte API-gegevens nodig).
function bestand(id: string, doelen: { id?: string; code: string; tekst?: string; rubriek?: string }[]): MinimumdoelenSetBestand {
  return {
    app: 'boosterz',
    kind: 'minimumdoelen',
    v: 1,
    set: {
      id, naam: `Secundair onderwijs 1ste graad A-stroom - Set ${id}`, korteNaam: `Set ${id}`, sleutelcompetenties: [], bron: '', api: '',
      naamsvermelding: '', licentie: '', opgehaald: '2026-10-05T00:00:00Z', aantal: doelen.length, sha256: '',
    },
    doelen: doelen.map((d) => ({
      ...(d.id !== undefined ? { id: d.id } : {}),
      code: d.code,
      tekst: d.tekst ?? `<p>Minimumdoel ${d.code}</p>`,
      extra: { ...(d.rubriek ? { titels: { '1': { titel: d.rubriek, nr: '1' } } } : {}) },
    })),
  };
}

describe('minimumdoelen kiezen (venster MinimumdoelKiezer)', () => {
  const eerste = bestand('ODS_A', [
    { id: '1', code: '09.01', tekst: '<p>De leerlingen situeren een plaats.</p>', rubriek: 'Ruimte' },
    { id: '2', code: '09.02', tekst: '<p>Ze verklaren verschillen tussen werelddelen.</p>' },
    { code: '09.03', tekst: '<p>Zonder vast nummer.</p>' },
  ]);
  const tweede = bestand('ODS_B', [{ id: '7', code: '1.1', tekst: '<p>Café en élan.</p>' }]);

  it('maakt van de sets rijen om uit te kiezen, zonder HTML en zonder doelen zonder vast nummer', () => {
    const sets = kiezerSets([eerste, tweede]);
    expect(sets.map((s) => s.setId)).toEqual(['ODS_A', 'ODS_B']);
    expect(sets[0].naam).toBe('Set ODS_A');
    expect(sets[0].rijen.map((r) => r.ref)).toEqual([
      { set: 'ODS_A', id: '1', code: '09.01' },
      { set: 'ODS_A', id: '2', code: '09.02' },
    ]);
    expect(sets[0].rijen[0]).toMatchObject({ tekst: 'De leerlingen situeren een plaats.', rubriek: 'Ruimte' });
    expect(sets[0].rijen[1].rubriek).toBe('');
    expect(sets[0].rijen.every((r) => !/<\/?[a-z]/i.test(r.tekst))).toBe(true);
  });

  it('zoekt op code en tekst, zonder accenten en hoofdletters, met alle woorden', () => {
    const rijen = kiezerSets([eerste, tweede]).flatMap((s) => s.rijen);
    expect(filterKiezerRijen(rijen, '').length).toBe(3);
    expect(filterKiezerRijen(rijen, '09.02').map((r) => r.ref.id)).toEqual(['2']);
    expect(filterKiezerRijen(rijen, 'WERELDDELEN').map((r) => r.ref.id)).toEqual(['2']);
    expect(filterKiezerRijen(rijen, 'cafe elan').map((r) => r.ref.id)).toEqual(['7']);
    expect(filterKiezerRijen(rijen, 'leerlingen plaats').map((r) => r.ref.id)).toEqual(['1']);
    expect(filterKiezerRijen(rijen, 'leerlingen werelddelen')).toEqual([]);
  });

  it('geeft de aangevinkte verwijzingen terug; verwijzingen buiten de getoonde sets blijven staan', () => {
    const sets = kiezerSets([eerste, tweede]);
    const buiten = { set: 'ODS_Z', id: '50', code: '5.5' };
    const vooraf = [buiten, { set: 'ODS_A', id: '2', code: '09.02' }, { set: 'ODS_A', id: '1', code: '09.01' }];
    // 09.02 blijft, 09.01 gaat weg, ODS_B 1.1 komt erbij
    const r = resultaatVanKiezer(sets, vooraf, new Set([sets[0].rijen[1].sleutel, sets[1].rijen[0].sleutel]));
    expect(r.map((x) => `${x.set}:${x.id}`)).toEqual(['ODS_Z:50', 'ODS_A:2', 'ODS_B:7']);
    expect(resultaatVanKiezer(sets, vooraf, new Set()).map((x) => x.set)).toEqual(['ODS_Z']);
  });
});
