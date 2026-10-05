import { describe, expect, it } from 'vitest';
import type { MinimumdoelenIndexSet, MinimumdoelenSetBestand } from './minimumdoelen';
import { losVerwijzingenOp, normaliseerMdCode, stelSetsVoor, vindVerwijzingen, zoekVerwijzingBlokken } from './minimumdoelVerwijzing';

// Nagemaakte sets in de vorm van laag 1 (geen echte API-gegevens nodig).
function set(id: string, doelen: { id?: string; code: string; tekst?: string; rubriek?: string }[]): MinimumdoelenSetBestand {
  return {
    app: 'boosterz',
    kind: 'minimumdoelen',
    v: 1,
    set: {
      id, naam: `Set ${id}`, sleutelcompetenties: [], bron: '', api: '', naamsvermelding: '', licentie: '',
      opgehaald: '2026-10-05T00:00:00Z', aantal: doelen.length, sha256: '',
    },
    doelen: doelen.map((d) => ({
      ...(d.id !== undefined ? { id: d.id } : {}),
      code: d.code,
      tekst: d.tekst ?? `<p>Doel ${d.code}</p>`,
      ...(d.rubriek ? { extra: { titels: { '1': { titel: d.rubriek, nr: '1' } } } } : {}),
    })),
  };
}

describe('normaliseerMdCode', () => {
  it('stelt codes met en zonder voorloopnullen gelijk', () => {
    expect(normaliseerMdCode('09.01')).toBe('9.1');
    expect(normaliseerMdCode('9.1')).toBe('9.1');
    expect(normaliseerMdCode('09.10')).toBe('9.10');
    expect(normaliseerMdCode('11.17.01')).toBe('11.17.1');
    expect(normaliseerMdCode('0.0')).toBe('0.0');
  });

  it('houdt alleen cijfers en punten en laat lege delen weg', () => {
    expect(normaliseerMdCode('MD 09.01')).toBe('9.1');
    expect(normaliseerMdCode('BG 1.2')).toBe('1.2');
    expect(normaliseerMdCode('9..1.')).toBe('9.1');
    expect(normaliseerMdCode('.12')).toBe('12');
  });

  it('geeft een lege tekst zonder cijfers', () => {
    expect(normaliseerMdCode('zie eindterm')).toBe('');
    expect(normaliseerMdCode('')).toBe('');
    expect(normaliseerMdCode('...')).toBe('');
  });
});

describe('vindVerwijzingen', () => {
  it('vindt codes na de gangbare aanduidingen, hoofdletterongevoelig', () => {
    expect(vindVerwijzingen('De leerlingen … (MD 09.01)')).toEqual(['09.01']);
    expect(vindVerwijzingen('ET 9.1')).toEqual(['9.1']);
    expect(vindVerwijzingen('em: 3.2.1')).toEqual(['3.2.1']);
    expect(vindVerwijzingen('Minimumdoelen: 09.01')).toEqual(['09.01']);
    expect(vindVerwijzingen('minimumdoel 09.02')).toEqual(['09.02']);
    expect(vindVerwijzingen('Eindtermen. 1.4')).toEqual(['1.4']);
    expect(vindVerwijzingen('eindterm 1.5')).toEqual(['1.5']);
  });

  it('leest lijsten met komma, puntkomma, "en" en "/", ook met herhaalde aanduiding', () => {
    expect(vindVerwijzingen('MD 09.01, 09.03; 09.05 en 09.07 / 09.08')).toEqual(['09.01', '09.03', '09.05', '09.07', '09.08']);
    expect(vindVerwijzingen('MD 09.01, MD 09.03')).toEqual(['09.01', '09.03']);
    expect(vindVerwijzingen('MD 09.01 en ET 9.4')).toEqual(['09.01', '9.4']);
  });

  it('schrijft een reeks uit, opgevuld naar het formaat van het begin', () => {
    expect(vindVerwijzingen('MD 09.01-09.03')).toEqual(['09.01', '09.02', '09.03']);
    expect(vindVerwijzingen('ET 9.1 – 9.3')).toEqual(['9.1', '9.2', '9.3']);
    expect(vindVerwijzingen('MD 09.08-09.11')).toEqual(['09.08', '09.09', '09.10', '09.11']);
    expect(vindVerwijzingen('MD 09.01-03')).toEqual(['09.01', '09.02', '09.03']);
  });

  it('geeft bij een ongeldige of te lange reeks alleen de uiteinden', () => {
    expect(vindVerwijzingen('MD 09.01-10.03')).toEqual(['09.01', '10.03']);
    expect(vindVerwijzingen('MD 1.1-1.40')).toEqual(['1.1', '1.40']);
    expect(vindVerwijzingen('MD 1.5-1.2')).toEqual(['1.5', '1.2']);
    expect(vindVerwijzingen('MD 1.1-1.30')).toHaveLength(30);
  });

  it('ontdubbelt op de genormaliseerde code en houdt de volgorde en de schrijfwijze', () => {
    expect(vindVerwijzingen('MD 09.03, 09.01 … later ook ET 9.1 en (MD 9.3)')).toEqual(['09.03', '09.01']);
  });

  it('herkent geen aanduiding midden in een woord en geen codes zonder punt', () => {
    expect(vindVerwijzingen('het 9.1 en emmer 3.2')).toEqual([]);
    expect(vindVerwijzingen('ET 12 en MD 3')).toEqual([]);
    expect(vindVerwijzingen('De leerlingen meten 9.1 meter.')).toEqual([]);
    expect(vindVerwijzingen('')).toEqual([]);
  });

  it('neemt geen code te veel: 1.2.3.4.5 is geen code, een zin na "en" stopt de lijst', () => {
    expect(vindVerwijzingen('MD 1.2.3.4.5')).toEqual([]);
    expect(vindVerwijzingen('MD 09.01 en de leerlingen')).toEqual(['09.01']);
    expect(vindVerwijzingen('ET 9.1 – De leerlingen')).toEqual(['9.1']);
  });

  it('herkent "t.e.m.", "t/m" en "tot en met" als reeks', () => {
    expect(vindVerwijzingen('MD 09.01 t.e.m. 09.03')).toEqual(['09.01', '09.02', '09.03']);
    expect(vindVerwijzingen('MD 09.01 tem 09.03')).toEqual(['09.01', '09.02', '09.03']);
    expect(vindVerwijzingen('MD 09.01 t/m 09.03')).toEqual(['09.01', '09.02', '09.03']);
    expect(vindVerwijzingen('MD 09.01 tot en met 09.03, 09.05')).toEqual(['09.01', '09.02', '09.03', '09.05']);
    expect(vindVerwijzingen('ET 9.1 Tot En Met 9.2')).toEqual(['9.1', '9.2']);
    expect(zoekVerwijzingBlokken('(MD 09.01 t.e.m. 09.03)')[0].tekst).toBe('MD 09.01 t.e.m. 09.03');
  });

  it('markeert een reeks die niet uitgeschreven kan worden als onvolledig', () => {
    const verschillend = zoekVerwijzingBlokken('MD 09.08-10.02');
    expect(verschillend[0]).toMatchObject({ onvolledig: true, codes: ['09.08', '10.02'] });
    expect(verschillend[0].onvolledigeReeksen).toEqual([{ van: '09.08', tot: '10.02' }]);
    expect(zoekVerwijzingBlokken('MD 09.01-09.40')[0]).toMatchObject({ onvolledig: true, onvolledigeReeksen: [{ van: '09.01', tot: '09.40' }] });
    expect(zoekVerwijzingBlokken('MD 1.5-1.2')[0].onvolledig).toBe(true);
    expect(zoekVerwijzingBlokken('MD 09.01-99')[0].onvolledig).toBe(true);
    // Een volledige reeks of een gewone lijst is niet onvolledig.
    expect(zoekVerwijzingBlokken('MD 09.01-09.03, 09.05')[0]).not.toHaveProperty('onvolledig');
    expect(zoekVerwijzingBlokken('MD 09.01-03')[0]).not.toHaveProperty('onvolledigeReeksen');
  });

  it('leest "5.1a" niet als "5.1": een code mag niet in een letter overlopen', () => {
    expect(vindVerwijzingen('MD 5.1a')).toEqual([]);
    expect(vindVerwijzingen('(MD 5.1a)')).toEqual([]);
    expect(vindVerwijzingen('MD 09.01, 09.02b')).toEqual(['09.01']);
    expect(vindVerwijzingen('MD 09.01-03a')).toEqual(['09.01']);
    expect(vindVerwijzingen('MD 09.01.')).toEqual(['09.01']);
    expect(vindVerwijzingen('(MD 09.01)')).toEqual(['09.01']);
  });

  it('geeft de plaats van elk blok, zodat de lezer het uit de tekst kan halen', () => {
    const t = 'Tekst (MD 09.01, 09.03) en ET 9.1-9.2.';
    const blokken = zoekVerwijzingBlokken(t);
    expect(blokken.map((b) => b.tekst)).toEqual(['MD 09.01, 09.03', 'ET 9.1-9.2']);
    expect(t.slice(blokken[0].start, blokken[0].eind)).toBe('MD 09.01, 09.03');
    expect(blokken[1].codes).toEqual(['9.1', '9.2']);
  });
});

describe('losVerwijzingenOp', () => {
  const rb = set('ODS_3287', [
    { id: '92186', code: '09.01' },
    { id: '92187', code: '09.02' },
    { id: '92188', code: '09.03' },
    { code: '09.04' }, // zonder id: telt niet
  ]);
  const ao = set('ODS_2119', [
    { id: '73778', code: '1', rubriek: 'Muzikale opvoeding' },
    { id: '73796', code: '1', rubriek: 'Plastische opvoeding' },
    { id: '73800', code: '1.1' },
  ]);

  it('lost een code op naar set + vast nummer, ook met andere schrijfwijze', () => {
    const { refs, problemen } = losVerwijzingenOp(['9.1', '09.03'], [rb]);
    expect(refs).toEqual([
      { set: 'ODS_3287', id: '92186', code: '09.01' },
      { set: 'ODS_3287', id: '92188', code: '09.03' },
    ]);
    expect(problemen).toEqual([]);
  });

  it('meldt onbekende codes, en doelen zonder id tellen niet', () => {
    const { refs, problemen } = losVerwijzingenOp(['09.04', '7.7', 'zie eindterm'], [rb]);
    expect(refs).toEqual([]);
    expect(problemen.map((p) => [p.code, p.soort, p.kandidaten.length])).toEqual([
      ['09.04', 'onbekend', 0],
      ['7.7', 'onbekend', 0],
      ['zie eindterm', 'onbekend', 0],
    ]);
  });

  it('meldt een code die in een set twee keer voorkomt als dubbelzinnig, met alle kandidaten', () => {
    const { refs, problemen } = losVerwijzingenOp(['1'], [ao]);
    expect(refs).toEqual([]);
    expect(problemen).toHaveLength(1);
    expect(problemen[0].soort).toBe('dubbelzinnig');
    expect(problemen[0].kandidaten.map((k) => k.id)).toEqual(['73778', '73796']);
  });

  it('telt hetzelfde doel in twee meegegeven sets als twee kandidaten', () => {
    const kopie = set('ODS_9999', [{ id: '92186', code: '09.01' }]);
    const { refs, problemen } = losVerwijzingenOp(['09.01'], [rb, kopie]);
    expect(refs).toEqual([]);
    expect(problemen[0].soort).toBe('dubbelzinnig');
    expect(problemen[0].kandidaten).toEqual([
      { set: 'ODS_3287', id: '92186', code: '09.01' },
      { set: 'ODS_9999', id: '92186', code: '09.01' },
    ]);
  });

  it('ontdubbelt refs op set + id en problemen op de code, in de volgorde van de codes', () => {
    const { refs, problemen } = losVerwijzingenOp(['09.02', '9.2', '09.01', '8.8', '08.8'], [rb]);
    expect(refs.map((r) => r.code)).toEqual(['09.02', '09.01']);
    expect(problemen.map((p) => p.code)).toEqual(['8.8']);
  });

  it('werkt zonder sets en met lege lijsten', () => {
    expect(losVerwijzingenOp([], [rb])).toEqual({ refs: [], problemen: [] });
    expect(losVerwijzingenOp(['09.01'], []).problemen[0].soort).toBe('onbekend');
  });
});

describe('stelSetsVoor', () => {
  const s = (id: string, extra: Partial<MinimumdoelenIndexSet>): MinimumdoelenIndexSet => ({
    id, naam: `Secundair onderwijs ${id}`, aantal: 1, sha256: '', opgehaald: '', bestand: `${id}.json`, ...extra,
  });
  const index: MinimumdoelenIndexSet[] = [
    s('ODS_1', { korteNaam: 'Wiskunde', graad: '1ste graad', stroom: 'A-stroom', geldigheid: 'Geldig' }),
    s('ODS_2', { korteNaam: 'Ruimtelijk bewustzijn', graad: '1ste graad', stroom: 'A-stroom', geldigheid: 'Geldig' }),
    s('ODS_3', { korteNaam: 'Aardrijkskunde', graad: '1ste graad', stroom: 'A-stroom', geldigheid: 'Niet meer geldig' }),
    s('ODS_4', { korteNaam: 'Ruimtelijk bewustzijn', graad: '1ste graad', stroom: 'B-stroom', geldigheid: 'Geldig' }),
    s('ODS_5', { korteNaam: 'Ruimtelijk bewustzijn', graad: '2de graad', geldigheid: 'Geldig' }),
    s('ODS_6', { korteNaam: 'Vakoverschrijdend', geldigheid: 'Geldig' }),
    s('ODS_7', { korteNaam: 'Économie', graad: '3de graad', geldigheid: 'Geldig' }),
    s('ODS_8', { korteNaam: 'Onbekend', graad: '1ste graad', stroom: 'A-stroom', geldigheid: 'Onbekend' }),
  ];

  it('toont standaard alleen geldige sets, of alles op vraag', () => {
    expect(stelSetsVoor(index).map((x) => x.id)).not.toContain('ODS_3');
    expect(stelSetsVoor(index).map((x) => x.id)).not.toContain('ODS_8');
    expect(stelSetsVoor(index, { alleGeldigheden: true })).toHaveLength(index.length);
  });

  it('filtert niet op geldigheid als de index er geen kent', () => {
    const oud = index.map(({ geldigheid: _g, ...rest }) => rest);
    expect(stelSetsVoor(oud)).toHaveLength(oud.length);
  });

  it('stelt de schrijfwijzen van graad en stroom gelijk', () => {
    for (const graad of ['1ste graad', '1e graad', 'eerste graad', 'graad 1', 'Eerste Graad']) {
      for (const stroom of ['A-stroom', 'A stroom', 'A', 'a']) {
        const ids = stelSetsVoor(index, { graad, stroom }).map((x) => x.id);
        expect(ids, `${graad} / ${stroom}`).toEqual(['ODS_2', 'ODS_1', 'ODS_6']);
      }
    }
    expect(stelSetsVoor(index, { graad: '2de graad' }).map((x) => x.id)).toEqual(['ODS_5', 'ODS_6']);
    expect(stelSetsVoor(index, { graad: 'derde graad' }).map((x) => x.id)).toEqual(['ODS_7', 'ODS_6']);
    expect(stelSetsVoor(index, { graad: '1', stroom: 'B-stroom' }).map((x) => x.id)).toEqual(['ODS_4', 'ODS_6']);
  });

  it('zoekt met alle woorden, zonder accenten en hoofdletterongevoelig, in naam, korte naam en id', () => {
    expect(stelSetsVoor(index, { zoek: 'ruimtelijk 1ste' }).map((x) => x.id)).toEqual([]);
    expect(stelSetsVoor(index, { zoek: 'RUIMTELIJK bewust' }).map((x) => x.id)).toEqual(['ODS_2', 'ODS_4', 'ODS_5']);
    expect(stelSetsVoor(index, { zoek: 'economie' }).map((x) => x.id)).toEqual(['ODS_7']);
    expect(stelSetsVoor(index, { zoek: 'ods_6' }).map((x) => x.id)).toEqual(['ODS_6']);
    expect(stelSetsVoor(index, { zoek: '   ' })).toHaveLength(6);
  });

  it('sorteert exacte graad en stroom eerst, dan op naam (natuurlijk), en verandert de index niet', () => {
    const kopie = JSON.parse(JSON.stringify(index)) as MinimumdoelenIndexSet[];
    const uit = stelSetsVoor(index, { graad: '1ste graad', stroom: 'A' });
    expect(uit[0].id).toBe('ODS_2'); // Ruimtelijk bewustzijn < Wiskunde
    expect(uit[uit.length - 1].id).toBe('ODS_6'); // zonder graad en stroom: achteraan
    expect(index).toEqual(kopie);
    const genummerd = [s('ODS_10', { korteNaam: 'Deel 10' }), s('ODS_9', { korteNaam: 'Deel 9' })];
    expect(stelSetsVoor(genummerd).map((x) => x.id)).toEqual(['ODS_9', 'ODS_10']);
  });
});
