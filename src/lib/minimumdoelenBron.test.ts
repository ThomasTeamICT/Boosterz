import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FOUT_NIET_GELADEN,
  MAX_SETS_IN_CACHE,
  SOORT_LABEL,
  contextVanSet,
  datumLeesbaar,
  filterSets,
  geldigheidTekst,
  geldigheidVan,
  graadOpties,
  indexHeeftGeldigheid,
  isGeldigSetId,
  laadIndex,
  laadSet,
  opvolgersVan,
  soortVanSet,
  veiligeLink,
  wisMinimumdoelenCache,
  zonderAccenten,
  type SetFilter,
} from './minimumdoelenBron';
import type { MinimumdoelenIndexSet } from './minimumdoelen';

// ── Hulpmiddelen ────────────────────────────────────────────────────────────

function indexSet(id: string, extra: Partial<MinimumdoelenIndexSet> = {}): MinimumdoelenIndexSet {
  return { id, naam: `Secundair onderwijs 1ste graad A-stroom - Vak - Set ${id} - Eindtermen`, aantal: 2, sha256: 'x', opgehaald: '2026-10-05T10:00:00Z', bestand: `${id}.json`, ...extra };
}

function indexJson(sets: unknown[] = [indexSet('ODS_1'), indexSet('ODS_2')]) {
  return { app: 'boosterz', kind: 'minimumdoelen-index', v: 1, naamsvermelding: 'Bron: test', licentie: 'test', sets };
}

function setJson(id: string) {
  return {
    app: 'boosterz', kind: 'minimumdoelen', v: 1,
    set: { id, naam: `Set ${id}`, sleutelcompetenties: [], bron: 'https://www.onderwijsdoelen.be/', api: 'x', naamsvermelding: 'Bron: test', licentie: 'test', opgehaald: '2026-10-05T10:00:00Z', aantal: 2, sha256: 'abc' },
    doelen: [
      { id: '1', code: '01.01', tekst: '<p>Eerste.</p>' },
      { id: '2', code: '01.02', tekst: 'Tweede.' },
    ],
  };
}

function antwoord(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

/** Nagebootste fetch: een tabel van url-einde naar antwoord (of een functie). */
function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  const fn = vi.fn(async (input: unknown) => handler(String(input)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => wisMinimumdoelenCache());
afterEach(() => vi.unstubAllGlobals());

// ── laadIndex ───────────────────────────────────────────────────────────────

describe('laadIndex', () => {
  it('haalt de index één keer op, ook bij meer dan één aanroep', async () => {
    const fetchFn = stubFetch(() => antwoord(indexJson()));
    const [a, b] = await Promise.all([laadIndex(), laadIndex()]);
    const c = await laadIndex();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0][0])).toMatch(/leerplannen\/minimumdoelen\/index\.json$/);
    expect(a.sets.map((s) => s.id)).toEqual(['ODS_1', 'ODS_2']);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('laat sets zonder bruikbaar id of naam weg', async () => {
    stubFetch(() => antwoord(indexJson([indexSet('ODS_1'), { id: '../x', naam: 'Slecht' }, { id: 'ODS_3' }, indexSet('ODS_4')])));
    const index = await laadIndex();
    expect(index.sets.map((s) => s.id)).toEqual(['ODS_1', 'ODS_4']);
  });

  it('geeft een Nederlandse foutmelding bij een netwerkfout en probeert daarna opnieuw', async () => {
    let poging = 0;
    const fetchFn = stubFetch(() => {
      poging++;
      if (poging === 1) throw new TypeError('Failed to fetch');
      return antwoord(indexJson());
    });
    await expect(laadIndex()).rejects.toThrow(FOUT_NIET_GELADEN);
    expect(FOUT_NIET_GELADEN).toBe('De officiële minimumdoelen konden niet geladen worden. Kijk je internetverbinding na en probeer opnieuw.');
    const index = await laadIndex();
    expect(index.sets).toHaveLength(2);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('geeft dezelfde foutmelding bij een antwoord dat niet ok is of geen json bevat', async () => {
    stubFetch(() => antwoord({}, 503));
    await expect(laadIndex()).rejects.toThrow(FOUT_NIET_GELADEN);
    stubFetch(() => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } }) as unknown as Response);
    await expect(laadIndex()).rejects.toThrow(FOUT_NIET_GELADEN);
  });

  it('controleert de vorm: app, kind en een lijst sets', async () => {
    for (const fout of [
      { ...indexJson(), app: 'iets-anders' },
      { ...indexJson(), kind: 'minimumdoelen' },
      { ...indexJson(), sets: 'geen lijst' },
      null,
      [],
    ]) {
      wisMinimumdoelenCache();
      stubFetch(() => antwoord(fout));
      await expect(laadIndex()).rejects.toThrow(/onverwachte vorm/);
    }
  });
});

// ── laadSet ─────────────────────────────────────────────────────────────────

describe('laadSet', () => {
  it('weigert een ongeldig id zonder iets op te halen', async () => {
    const fetchFn = stubFetch(() => antwoord(setJson('ODS_1')));
    for (const id of ['', 'ods_1', 'ODS_', 'ODS_1a', '../ODS_1', 'ODS_1/../index', 'ODS_1.json', 'ODS_1234567890', ' ODS_1', 'index']) {
      await expect(laadSet(id)).rejects.toThrow(/Ongeldig set-id/);
    }
    expect(fetchFn).not.toHaveBeenCalled();
    expect(isGeldigSetId('ODS_3287')).toBe(true);
    expect(isGeldigSetId('ODS_x')).toBe(false);
  });

  it('haalt een set op en onthoudt hem', async () => {
    const fetchFn = stubFetch((url) => antwoord(setJson(url.match(/(ODS_\d+)\.json$/)![1])));
    const [a, b] = await Promise.all([laadSet('ODS_3287'), laadSet('ODS_3287')]);
    const c = await laadSet('ODS_3287');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0][0])).toMatch(/leerplannen\/minimumdoelen\/ODS_3287\.json$/);
    expect(a.set.id).toBe('ODS_3287');
    expect(a.doelen).toHaveLength(2);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('weigert een beschadigd setbestand en bewaart de mislukking niet', async () => {
    const stuk = { ...setJson('ODS_5'), doelen: [{ id: '1', code: '01.01', tekst: '' }] };
    const fetchFn = stubFetch(() => antwoord(stuk));
    await expect(laadSet('ODS_5')).rejects.toThrow(/beschadigd/);
    stubFetch(() => antwoord(setJson('ODS_5')));
    const gelukt = await laadSet('ODS_5');
    expect(gelukt.set.id).toBe('ODS_5');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('weigert een bestand dat bij een andere set hoort', async () => {
    stubFetch(() => antwoord(setJson('ODS_9')));
    await expect(laadSet('ODS_8')).rejects.toThrow(/andere set/);
  });

  it('meldt een ontbrekende set en een netwerkfout elk met een eigen boodschap, en probeert opnieuw', async () => {
    stubFetch(() => antwoord({}, 404));
    await expect(laadSet('ODS_7')).rejects.toThrow(/bestaat niet/);
    stubFetch(() => { throw new TypeError('offline'); });
    await expect(laadSet('ODS_7')).rejects.toThrow(FOUT_NIET_GELADEN);
    stubFetch(() => antwoord(setJson('ODS_7')));
    expect((await laadSet('ODS_7')).set.id).toBe('ODS_7');
  });

  it(`houdt maximaal ${MAX_SETS_IN_CACHE} sets: de oudste gaat eruit`, async () => {
    const fetchFn = stubFetch((url) => antwoord(setJson(url.match(/(ODS_\d+)\.json$/)![1])));
    for (let i = 1; i <= MAX_SETS_IN_CACHE; i++) await laadSet(`ODS_${i}`);
    expect(fetchFn).toHaveBeenCalledTimes(MAX_SETS_IN_CACHE);
    await laadSet('ODS_1'); // nog in de cache
    expect(fetchFn).toHaveBeenCalledTimes(MAX_SETS_IN_CACHE);
    await laadSet(`ODS_${MAX_SETS_IN_CACHE + 1}`); // één erbij: ODS_1 valt eruit
    expect(fetchFn).toHaveBeenCalledTimes(MAX_SETS_IN_CACHE + 1);
    await laadSet('ODS_2'); // nog in de cache
    expect(fetchFn).toHaveBeenCalledTimes(MAX_SETS_IN_CACHE + 1);
    await laadSet('ODS_1'); // moet opnieuw
    expect(fetchFn).toHaveBeenCalledTimes(MAX_SETS_IN_CACHE + 2);
  });
});

// ── Soort, geldigheid, weergave ─────────────────────────────────────────────

describe('soortVanSet', () => {
  it('leest de soort uit het begin van de naam', () => {
    expect(soortVanSet('Secundair onderwijs 1ste graad A-stroom - Vak - Aardrijkskunde - Eindtermen')).toBe('so');
    expect(soortVanSet('Buitengewoon Secundair onderwijs 2de graad Opleidingsvorm 4 - Chemie - Cesuurdoelen')).toBe('buso');
    expect(soortVanSet('Secundair Volwassenenonderwijs 2de graad aso - Vak - Wiskunde - Eindtermen')).toBe('vwo');
    expect(soortVanSet('Lerarenopleiding - Opleiding - Leerkracht Secundair onderwijs - Eindtermen')).toBe('ander');
    expect(soortVanSet('')).toBe('ander');
  });

  it('heeft een label per soort', () => {
    expect(Object.keys(SOORT_LABEL).sort()).toEqual(['ander', 'buso', 'so', 'vwo']);
    expect(SOORT_LABEL.buso).toMatch(/^Buitengewoon/);
  });
});

describe('geldigheid', () => {
  it('geldigheidVan geeft G, N, O of undefined', () => {
    expect(geldigheidVan({ geldigheid: 'Geldig' })).toBe('G');
    expect(geldigheidVan({ geldigheid: 'Niet meer geldig' })).toBe('N');
    expect(geldigheidVan({ geldigheid: 'Onbekend' })).toBe('O');
    expect(geldigheidVan({ geldigheid: 'iets nieuws' })).toBe('O');
    expect(geldigheidVan({})).toBeUndefined();
    expect(geldigheidVan({ geldigheid: '  ' })).toBeUndefined();
  });

  it('geldigheidTekst maakt leesbare tekst', () => {
    expect(geldigheidTekst({ geldigheid: 'Geldig', geldigVan: '2024-09-01' })).toBe('Geldig sinds 2024');
    expect(geldigheidTekst({ geldigheid: 'Geldig' })).toBe('Geldig');
    expect(geldigheidTekst({ geldigheid: 'Niet meer geldig', geldigVan: '2019-09-01', geldigTot: '2025-08-31' })).toBe('Niet meer geldig (2019–2025)');
    expect(geldigheidTekst({ geldigheid: 'Niet meer geldig', geldigVan: '2019-09-01', geldigTot: '2019-12-31' })).toBe('Niet meer geldig (2019)');
    expect(geldigheidTekst({ geldigheid: 'Niet meer geldig', geldigTot: '2020-08-31' })).toBe('Niet meer geldig (tot 2020)');
    expect(geldigheidTekst({ geldigheid: 'Niet meer geldig' })).toBe('Niet meer geldig');
    expect(geldigheidTekst({ geldigheid: 'Onbekend' })).toBe('Geldigheid niet vermeld');
    expect(geldigheidTekst({})).toBeUndefined();
  });

  it('indexHeeftGeldigheid is alleen waar als minstens één set het veld heeft', () => {
    expect(indexHeeftGeldigheid([indexSet('ODS_1'), indexSet('ODS_2')])).toBe(false);
    expect(indexHeeftGeldigheid([indexSet('ODS_1'), indexSet('ODS_2', { geldigheid: 'Geldig' })])).toBe(true);
  });
});

describe('weergave', () => {
  it('datumLeesbaar zet een ISO-datum om in gewone tekst', () => {
    expect(datumLeesbaar('2026-10-05T12:20:49Z')).toBe('5 oktober 2026');
    expect(datumLeesbaar('onzin')).toBe('onzin');
    expect(datumLeesbaar(undefined)).toBe('');
  });

  it('veiligeLink laat alleen http(s)-links door', () => {
    expect(veiligeLink('https://www.onderwijsdoelen.be/')).toBe('https://www.onderwijsdoelen.be/');
    expect(veiligeLink(' http://example.org/a ')).toBe('http://example.org/a');
    expect(veiligeLink('javascript:alert(1)')).toBeUndefined();
    expect(veiligeLink('data:text/html,x')).toBeUndefined();
    expect(veiligeLink('https://a.be/ b')).toBeUndefined();
    expect(veiligeLink('')).toBeUndefined();
    expect(veiligeLink(undefined)).toBeUndefined();
  });

  it('contextVanSet houdt over wat een set van andere sets met dezelfde naam onderscheidt', () => {
    expect(contextVanSet('Secundair onderwijs 1ste graad A-stroom - Vak - Aardrijkskunde - Eindtermen')).toBe('');
    expect(contextVanSet('Secundair onderwijs 3de graad aso - Pool - Wiskunde - Specifieke eindtermen')).toBe('aso · Pool · Specifieke eindtermen');
    expect(contextVanSet('Buitengewoon Secundair onderwijs 3de graad kso, tso Dubbele finaliteit Opleidingsvorm 4 -  Competenties inzake duurzaamheid - Eindtermen'))
      .toBe('kso, tso Dubbele finaliteit Opleidingsvorm 4');
    expect(contextVanSet('Secundair Volwassenenonderwijs Aanvullende Algemene Vorming Verbreding - Vak - Cultuur - Basiscompetenties'))
      .toBe('Aanvullende Algemene Vorming Verbreding · Basiscompetenties');
    expect(contextVanSet('Secundair onderwijs - Vakoverschrijdende - Stam - Eindtermen')).toBe('Vakoverschrijdende');
    expect(contextVanSet('Buitengewoon Secundair onderwijs Opleidingsvorm 1 - Ontwikkelingsdoelen')).toBe('Opleidingsvorm 1 · Ontwikkelingsdoelen');
    expect(contextVanSet('')).toBe('');
  });
});

// ── Zoeken en filteren ──────────────────────────────────────────────────────

describe('filterSets', () => {
  const sets: MinimumdoelenIndexSet[] = [
    indexSet('ODS_3287', { naam: 'Secundair onderwijs 1ste graad A-stroom - Competenties met betrekking tot ruimtelijk bewustzijn - Eindtermen', korteNaam: 'Ruimtelijk bewustzijn', graad: '1ste graad', stroom: 'A-stroom', geldigheid: 'Geldig' }),
    indexSet('ODS_2118', { naam: 'Secundair onderwijs 1ste graad A-stroom - Vak - Aardrijkskunde - Eindtermen', korteNaam: 'Aardrijkskunde', graad: '1ste graad', stroom: 'A-stroom', geldigheid: 'Niet meer geldig' }),
    indexSet('ODS_2300', { naam: 'Buitengewoon Secundair onderwijs 2de graad Opleidingsvorm 4 - Chemie - Cesuurdoelen', korteNaam: 'Chemie', graad: '2de graad', geldigheid: 'Onbekend' }),
    indexSet('ODS_2600', { naam: 'Secundair Volwassenenonderwijs 3de graad aso - Vak - Géographie - Eindtermen', korteNaam: 'Géographie', graad: '3de graad', geldigheid: 'Geldig' }),
  ];
  const alles: SetFilter = { zoek: '', geldigheid: 'alle', graad: '', soort: 'alle' };

  it('zonder filters blijft alles over, in dezelfde volgorde', () => {
    expect(filterSets(sets, alles).map((s) => s.id)).toEqual(['ODS_3287', 'ODS_2118', 'ODS_2300', 'ODS_2600']);
  });

  it('zoekt zonder accenten en hoofdletterongevoelig, op naam, korte naam en id', () => {
    expect(filterSets(sets, { ...alles, zoek: 'geographie' }).map((s) => s.id)).toEqual(['ODS_2600']);
    expect(filterSets(sets, { ...alles, zoek: 'AARDRIJKS' }).map((s) => s.id)).toEqual(['ODS_2118']);
    expect(filterSets(sets, { ...alles, zoek: 'ods_3287' }).map((s) => s.id)).toEqual(['ODS_3287']);
    expect(filterSets(sets, { ...alles, zoek: '2300' }).map((s) => s.id)).toEqual(['ODS_2300']);
    expect(filterSets(sets, { ...alles, zoek: 'cesuurdoelen chemie' }).map((s) => s.id)).toEqual(['ODS_2300']);
    expect(filterSets(sets, { ...alles, zoek: 'bestaat niet' })).toEqual([]);
  });

  it('filtert op geldigheid, graad en soort', () => {
    expect(filterSets(sets, { ...alles, geldigheid: 'G' }).map((s) => s.id)).toEqual(['ODS_3287', 'ODS_2600']);
    expect(filterSets(sets, { ...alles, geldigheid: 'N' }).map((s) => s.id)).toEqual(['ODS_2118']);
    expect(filterSets(sets, { ...alles, geldigheid: 'O' }).map((s) => s.id)).toEqual(['ODS_2300']);
    // 'actueel': alles behalve wat niet meer geldt
    expect(filterSets(sets, { ...alles, geldigheid: 'actueel' }).map((s) => s.id)).not.toContain('ODS_2118');
    expect(filterSets(sets, { ...alles, geldigheid: 'actueel' }).map((s) => s.id)).toContain('ODS_2300');
    expect(filterSets(sets, { ...alles, graad: '1ste graad' }).map((s) => s.id)).toEqual(['ODS_3287', 'ODS_2118']);
    expect(filterSets(sets, { ...alles, soort: 'buso' }).map((s) => s.id)).toEqual(['ODS_2300']);
    expect(filterSets(sets, { ...alles, soort: 'so', geldigheid: 'G', graad: '1ste graad' }).map((s) => s.id)).toEqual(['ODS_3287']);
  });

  it('graadOpties geeft de graden in natuurlijke volgorde, zonder dubbels of lege waarden', () => {
    expect(graadOpties([...sets, indexSet('ODS_9')])).toEqual(['1ste graad', '2de graad', '3de graad']);
  });

  it('zonderAccenten haalt accenten weg', () => {
    expect(zonderAccenten('Één Café Ça')).toBe('een cafe ca');
  });
});

describe('opvolgersVan met de meegeleverde index', () => {
  const pad = join(fileURLToPath(new URL('../../', import.meta.url)), 'public', 'leerplannen', 'minimumdoelen', 'index.json');
  const index = existsSync(pad) ? (JSON.parse(readFileSync(pad, 'utf8')) as { sets: MinimumdoelenIndexSet[] }).sets : [];
  const heeft = index.length > 0 && indexHeeftGeldigheid(index);
  const set = (id: string) => index.find((s) => s.id === id) as MinimumdoelenIndexSet;
  const ids = (id: string) => opvolgersVan(set(id), index);

  it.runIf(heeft)('wijst bij een oude vakset de sleutelcompetentie van nu aan', () => {
    // Natuurwetenschappen, 1ste graad A-stroom (2010–2020) → Wiskunde, exacte wetenschappen en technologie (STEM)
    expect(ids('ODS_2123')).toMatchObject({ soort: 'vak' });
    expect(ids('ODS_2123').sets[0].id).toBe('ODS_3283');
    // Aardrijkskunde (1997–2020) → Ruimtelijk bewustzijn
    expect(ids('ODS_2118').sets.map((s) => s.id)).toEqual(['ODS_3287']);
    for (const s of ids('ODS_2123').sets) expect(geldigheidVan(s)).not.toBe('N');
  });

  it.runIf(heeft)('wijst bij een oudere versie de nieuwe versie met dezelfde naam aan', () => {
    // Ruimtelijk bewustzijn 2019–2025 → versie 2.1 (sinds 2024)
    expect(ids('ODS_2447')).toEqual({ soort: 'versie', sets: [set('ODS_3287')] });
  });

  it.runIf(heeft)('geeft voor elke set die niet meer geldt iets terug, zonder zichzelf of andere oude sets', () => {
    let metOpvolger = 0;
    const oud = index.filter((s) => geldigheidVan(s) === 'N');
    for (const s of oud) {
      const o = opvolgersVan(s, index);
      expect(o.sets.every((x) => x.id !== s.id && geldigheidVan(x) !== 'N')).toBe(true);
      if (o.sets.length > 0) metOpvolger++;
    }
    // De meeste oude sets hebben een aanwijsbare opvolger; de rest krijgt "kies een set die nu geldt".
    expect(metOpvolger / oud.length).toBeGreaterThan(0.5);
  });
});

