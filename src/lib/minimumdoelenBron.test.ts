import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FOUT_NIET_GELADEN,
  MAX_SETS_IN_CACHE,
  SOORT_LABEL,
  SOORT_VOLGORDE,
  contextVanSet,
  datumLeesbaar,
  doelPastBijZoek,
  filterSets,
  geldigheidTekst,
  geldigheidVan,
  graadOpties,
  heeftActueleSets,
  hoortBijBasis,
  indexHeeftGeldigheid,
  isBasisSoort,
  isGeldigSetId,
  isOudeVersie,
  isStemSet,
  laadIndex,
  laadSet,
  momentVanSet,
  opvolgersVan,
  oudeVersieIds,
  setKenmerken,
  soortVanSet,
  tweelingSleutel,
  vakSetsBijStem,
  veiligeLink,
  wisMinimumdoelenCache,
  zijnTweeling,
  zoekTermen,
  zoekVoorbeelden,
  zonderAccenten,
  type SetFilter,
} from './minimumdoelenBron';
import { htmlNaarTekst, metUitbreidingOpDoelzin, type MinimumdoelenIndexSet, type MinimumdoelenSetBestand } from './minimumdoelen';

// ── Hulpmiddelen ────────────────────────────────────────────────────────────

/** De echte gegevens in de repo. */
const DATA_MAP_ECHT = join(fileURLToPath(new URL('../../', import.meta.url)), 'public', 'leerplannen', 'minimumdoelen');

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

  it('zet de uitbreiding op de doelzin (basisonderwijs) achter de doelzin, letterlijk, en laat extra ongemoeid', async () => {
    const json = setJson('ODS_3405');
    const uitbreiding = '<ul><li>bijdoen, erbij, samen(tellen), samenvoegen;</li><li>splitsen;</li></ul>';
    json.doelen[0] = { id: '1', code: '01.01', tekst: '<p>De kleuters kennen de volgende begrippen [F]:</p>', extra: { uitbreiding_op_doelzin: `${uitbreiding} ` } } as (typeof json.doelen)[number];
    stubFetch(() => antwoord(json));
    const bestand = await laadSet('ODS_3405');
    expect(bestand.doelen[0].tekst).toBe(`<p>De kleuters kennen de volgende begrippen [F]:</p>\n${uitbreiding}`);
    expect(bestand.doelen[0].extra?.uitbreiding_op_doelzin).toBe(`${uitbreiding} `);
    expect(htmlNaarTekst(bestand.doelen[0].tekst)).toBe('De kleuters kennen de volgende begrippen [F]:\n• bijdoen, erbij, samen(tellen), samenvoegen;\n• splitsen;');
    expect(bestand.doelen[1].tekst).toBe('Tweede.');
    // Twee keer toepassen geeft hetzelfde; een set zonder uitbreiding blijft hetzelfde object.
    expect(metUitbreidingOpDoelzin(bestand)).toBe(bestand);
    const zonder = setJson('ODS_1') as unknown as MinimumdoelenSetBestand;
    expect(metUitbreidingOpDoelzin(zonder)).toBe(zonder);
  });

  it.runIf(existsSync(join(DATA_MAP_ECHT, 'ODS_3405.json')))('de echte set ODS_3405 (wiskunde, kleuters): elk doel met een uitbreiding krijgt de volledige tekst', () => {
    const ruw = JSON.parse(readFileSync(join(DATA_MAP_ECHT, 'ODS_3405.json'), 'utf8')) as MinimumdoelenSetBestand;
    const volledig = metUitbreidingOpDoelzin(ruw);
    const met = ruw.doelen.filter((d) => typeof d.extra?.uitbreiding_op_doelzin === 'string');
    expect(met.length).toBeGreaterThan(0);
    const doel = volledig.doelen.find((d) => d.code === '2.2.1');
    expect(htmlNaarTekst(doel!.tekst)).toMatch(/^De kleuters kennen de volgende begrippen \[F\]:\n• bijdoen, erbij, samen\(tellen\), samenvoegen;\n• weg\(nemen\), eraf;/);
    expect(ruw.doelen.find((d) => d.code === '2.2.1')!.tekst).toBe('<p>De kleuters kennen de volgende begrippen [F]:</p>');
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

  it('heeft een label per soort, en een volgorde met alle soorten', () => {
    expect(Object.keys(SOORT_LABEL).sort()).toEqual(['ander', 'bao', 'bubao', 'buso', 'so', 'vwo']);
    expect(SOORT_LABEL.bao).toBe('Basisonderwijs');
    expect(SOORT_LABEL.bubao).toBe('Buitengewoon basisonderwijs');
    expect(SOORT_LABEL.buso).toMatch(/^Buitengewoon/);
    expect([...SOORT_VOLGORDE]).toEqual(['so', 'buso', 'vwo', 'bao', 'bubao', 'ander']);
    expect([...SOORT_VOLGORDE].sort()).toEqual(Object.keys(SOORT_LABEL).sort());
  });
});

// De echte namen uit de officiële bron (de dubbele spatie na het streepje staat ook zo in de bron).
const NAAM = {
  ODS_3395: 'Lager Onderwijs 4de leerjaar -  Nederlands - Te bereiken minimumdoelen op populatieniveau',
  ODS_3397: 'Kleuteronderwijs -  Nederlands - Na te streven minimumdoelen op populatieniveau',
  ODS_2104: 'Kleuteronderwijs - Leergebied - Nederlands - Ontwikkelingsdoelen',
  ODS_2110: 'Lager Onderwijs - Leergebied - Nederlands - Eindtermen',
  ODS_2114: 'Lager Onderwijs - Leergebiedoverschrijdende - Ict - Eindtermen',
  ODS_3406: 'Lager Onderwijs 4de leerjaar -  Wiskunde - Te bereiken minimumdoelen op populatieniveau',
  ODS_3465: 'Buitengewoon Lager Onderwijs 4de leerjaar -  Nederlands - Na te streven minimumdoelen op populatieniveau',
  ODS_3467: 'Buitengewoon Lager Onderwijs 4de leerjaar -  Wiskunde - Na te streven minimumdoelen op populatieniveau',
  ODS_3485: 'Buitengewoon Kleuteronderwijs -  Nederlands - Na te streven minimumdoelen op populatieniveau',
  ODS_2297: 'Buitengewoon Kleuteronderwijs Type 2 - Leergebied - Communicatie En Taal - Ontwikkelingsdoelen',
  ODS_2305: 'Buitengewoon Kleuteronderwijs Type 7 - Leergebied - Muzische Vorming - Aanvullende - Ontwikkelingsdoelen',
  ODS_2379: 'Buitengewoon Kleuteronderwijs Type 7 - Leergebied - Muzische Vorming - Ontwikkelingsdoelen',
  ODS_2310: 'Buitengewoon Lager Onderwijs Type 8 - Leergebied - Leren Leren - Bijkomende - Ontwikkelingsdoelen',
  ODS_2571: 'Buitengewoon Lager Onderwijs Basisaanbod - Leergebied - Nederlands - Ontwikkelingsdoelen',
  ODS_2958: 'Buitengewoon Kleuteronderwijs Type 3 - Leergebied - Alle leergebieden - Ontwikkelingsdoelen',
  ODS_2842: 'Lerarenopleiding - Opleiding - Leraar Kleuteronderwijs - Eindtermen',
  ODS_2843: 'Lerarenopleiding - Opleiding - Leerkracht Lager onderwijs - Eindtermen',
} as const;

describe('soortVanSet: basisonderwijs', () => {
  it('deelt het basisonderwijs in als bao', () => {
    for (const id of ['ODS_3395', 'ODS_3397', 'ODS_2104', 'ODS_2110', 'ODS_2114', 'ODS_3406'] as const) expect(soortVanSet(NAAM[id]), id).toBe('bao');
  });

  it('deelt het buitengewoon basisonderwijs in als bubao, niet als buso', () => {
    for (const id of ['ODS_3465', 'ODS_3467', 'ODS_3485', 'ODS_2297', 'ODS_2305', 'ODS_2379', 'ODS_2310', 'ODS_2571', 'ODS_2958'] as const) {
      expect(soortVanSet(NAAM[id]), id).toBe('bubao');
    }
  });

  it('laat de lerarenopleiding ander onderwijs, ook die voor kleuter- en lager onderwijs', () => {
    expect(soortVanSet(NAAM.ODS_2842)).toBe('ander');
    expect(soortVanSet(NAAM.ODS_2843)).toBe('ander');
    expect(soortVanSet('Lerarenopleiding - Opleiding - Leerkracht Secundair onderwijs - Eindtermen')).toBe('ander');
  });

  it('houdt het buitengewoon secundair bij buso, en het gewone secundair en het volwassenenonderwijs zoals ze waren', () => {
    expect(soortVanSet('Buitengewoon Secundair onderwijs 2de graad Opleidingsvorm 4 - Chemie - Cesuurdoelen')).toBe('buso');
    expect(soortVanSet('Buitengewoon Secundair onderwijs Opleidingsvorm 3 - Domein - Lichamelijke Opvoeding - Ontwikkelingsdoelen')).toBe('buso');
    expect(soortVanSet('Secundair onderwijs 1ste graad A-stroom - Vak - Aardrijkskunde - Eindtermen')).toBe('so');
    expect(soortVanSet('Secundair Volwassenenonderwijs 2de graad aso - Vak - Wiskunde - Eindtermen')).toBe('vwo');
  });

  it('vangt dubbele spaties, harde spaties en hoofdletters', () => {
    expect(soortVanSet('  BUITENGEWOON   lager   onderwijs Type 8 - X')).toBe('bubao');
    expect(soortVanSet('Buitengewoon\u00a0Lager\u00a0Onderwijs Type 8 - X')).toBe('bubao');
    expect(soortVanSet('buitengewoon kleuteronderwijs - x')).toBe('bubao');
    expect(soortVanSet('Buitengewoon Basisonderwijs - X')).toBe('bubao');
    expect(soortVanSet('LAGER  ONDERWIJS 6de leerjaar -  Frans - Te bereiken minimumdoelen op populatieniveau')).toBe('bao');
    expect(soortVanSet(' Lager Onderwijs - X')).toBe('bao');
    expect(soortVanSet('Basisonderwijs - Vak - X')).toBe('bao');
  });

  it('telt een woord dat er alleen op lijkt niet mee', () => {
    expect(soortVanSet('Kleuteronderwijsaanbod - X')).toBe('ander');
    expect(soortVanSet('Lageronderwijs - X')).toBe('ander');
  });
});

describe('isBasisSoort en momentVanSet', () => {
  it('isBasisSoort is alleen waar voor bao en bubao', () => {
    for (const soort of SOORT_VOLGORDE) expect(isBasisSoort(soort), soort).toBe(soort === 'bao' || soort === 'bubao');
  });

  it('momentVanSet: kleuter of lager voor het basisonderwijs, ook buitengewoon', () => {
    for (const id of ['ODS_2104', 'ODS_3397', 'ODS_3485', 'ODS_2305'] as const) expect(momentVanSet(NAAM[id]), id).toBe('kleuter');
    for (const id of ['ODS_2110', 'ODS_3395', 'ODS_3465', 'ODS_2571'] as const) expect(momentVanSet(NAAM[id]), id).toBe('lager');
  });

  it('momentVanSet is undefined voor andere soorten, ook voor de lerarenopleiding, en als de naam geen moment noemt', () => {
    expect(momentVanSet('Secundair onderwijs 1ste graad A-stroom - Vak - Aardrijkskunde - Eindtermen')).toBeUndefined();
    expect(momentVanSet('Buitengewoon Secundair onderwijs 2de graad Opleidingsvorm 4 - Chemie - Cesuurdoelen')).toBeUndefined();
    expect(momentVanSet(NAAM.ODS_2842)).toBeUndefined();
    expect(momentVanSet('Basisonderwijs - Vak - X')).toBeUndefined();
    expect(momentVanSet('')).toBeUndefined();
  });
});

describe('hoortBijBasis', () => {
  it('is waar voor het (buitengewoon) basisonderwijs en voor de lerarenopleiding kleuter en lager', () => {
    for (const id of ['ODS_3395', 'ODS_3397', 'ODS_2104', 'ODS_3465', 'ODS_3485', 'ODS_2297', 'ODS_2571', 'ODS_2842', 'ODS_2843'] as const) {
      expect(hoortBijBasis(NAAM[id]), id).toBe(true);
    }
    expect(hoortBijBasis('  LERARENOPLEIDING  -  Opleiding - Leraar  Kleuteronderwijs - Eindtermen')).toBe(true);
  });

  it('is onwaar voor het secundair, het volwassenenonderwijs en de lerarenopleiding voor het secundair', () => {
    expect(hoortBijBasis('Lerarenopleiding - Opleiding - Leerkracht Secundair onderwijs - Eindtermen')).toBe(false);
    expect(hoortBijBasis('Secundair onderwijs 1ste graad A-stroom - Vak - Aardrijkskunde - Eindtermen')).toBe(false);
    expect(hoortBijBasis('Buitengewoon Secundair onderwijs 2de graad Opleidingsvorm 4 - Chemie - Cesuurdoelen')).toBe(false);
    expect(hoortBijBasis('Secundair Volwassenenonderwijs 2de graad aso - Vak - Wiskunde - Eindtermen')).toBe(false);
    expect(hoortBijBasis('Iets anders')).toBe(false);
    expect(hoortBijBasis('')).toBe(false);
  });

  it('kijkt niet naar de naam van de opleiding zelf, en een woord dat erop lijkt telt niet mee', () => {
    // Alleen na de eerste kop ("Lerarenopleiding"), en als heel woord.
    expect(hoortBijBasis('Lerarenopleiding kleuteronderwijs')).toBe(false);
    expect(hoortBijBasis('Lerarenopleiding - Opleiding - Leraar Kleuteronderwijsaanbod - Eindtermen')).toBe(false);
    expect(hoortBijBasis('Opleiding - Leraar Kleuteronderwijs - Eindtermen')).toBe(false);
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

  it('contextVanSet en setKenmerken voor het basisonderwijs: moment en soort doelen, zonder leergebied en vak', () => {
    const ctx = (id: keyof typeof NAAM) => contextVanSet(NAAM[id]);
    expect(ctx('ODS_3395')).toBe('Lager Onderwijs 4de leerjaar · Te bereiken minimumdoelen op populatieniveau');
    expect(ctx('ODS_3465')).toBe('Lager Onderwijs 4de leerjaar · Na te streven minimumdoelen op populatieniveau');
    expect(ctx('ODS_2104')).toBe('Kleuteronderwijs · Ontwikkelingsdoelen');
    expect(ctx('ODS_2110')).toBe('Lager Onderwijs · Eindtermen');
    expect(ctx('ODS_2114')).toBe('Lager Onderwijs · Eindtermen');
    // 'Aanvullende' en 'Bijkomende' maken twee sets met dezelfde korte naam van elkaar te onderscheiden.
    expect(ctx('ODS_2305')).toBe('Kleuteronderwijs Type 7 · Aanvullende ontwikkelingsdoelen');
    expect(ctx('ODS_2379')).toBe('Kleuteronderwijs Type 7 · Ontwikkelingsdoelen');
    expect(ctx('ODS_2310')).toBe('Lager Onderwijs Type 8 · Bijkomende ontwikkelingsdoelen');
    expect(ctx('ODS_2571')).toBe('Lager Onderwijs Basisaanbod · Ontwikkelingsdoelen');

    const kenmerken = (id: keyof typeof NAAM) => setKenmerken({ naam: NAAM[id] });
    expect(kenmerken('ODS_3467')).toBe('Buitengewoon basisonderwijs · Lager Onderwijs 4de leerjaar · Na te streven minimumdoelen op populatieniveau');
    expect(kenmerken('ODS_3406')).toBe('Basisonderwijs · Lager Onderwijs 4de leerjaar · Te bereiken minimumdoelen op populatieniveau');
    expect(kenmerken('ODS_3485')).toBe('Buitengewoon basisonderwijs · Kleuteronderwijs · Na te streven minimumdoelen op populatieniveau');
    // De lerarenopleiding blijft zoals ze was.
    expect(kenmerken('ODS_2842')).toBe('Ander onderwijs · Lerarenopleiding · Opleiding');
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
    // 'actueel': zonder oude versies; "Onbekend" zonder geldige naamgenoot blijft
    expect(filterSets(sets, { ...alles, geldigheid: 'actueel' }).map((s) => s.id)).not.toContain('ODS_2118');
    expect(filterSets(sets, { ...alles, geldigheid: 'actueel' }).map((s) => s.id)).toContain('ODS_2300');
    expect(filterSets(sets, { ...alles, graad: '1ste graad' }).map((s) => s.id)).toEqual(['ODS_3287', 'ODS_2118']);
    expect(filterSets(sets, { ...alles, soort: 'buso' }).map((s) => s.id)).toEqual(['ODS_2300']);
    expect(filterSets(sets, { ...alles, soort: 'so', geldigheid: 'G', graad: '1ste graad' }).map((s) => s.id)).toEqual(['ODS_3287']);
  });

  it("'actueel' verbergt ook een oudere versie met \"Onbekend\" naast een geldige set met dezelfde naam", () => {
    const naam = sets[0].naam;
    const oudere = indexSet('ODS_2447', { naam: `${naam} `, korteNaam: 'Ruimtelijk bewustzijn', graad: '1ste graad', stroom: 'A-stroom', geldigheid: 'Onbekend' });
    // Zelfde naam maar andere stroom: geen naamgenoot, dus geen oudere versie.
    const andereStroom = indexSet('ODS_2450', { naam, korteNaam: 'Ruimtelijk bewustzijn', graad: '1ste graad', stroom: 'B-stroom', geldigheid: 'Onbekend' });
    const metOud = [...sets, oudere, andereStroom];
    expect([...oudeVersieIds(metOud)].sort()).toEqual(['ODS_2118', 'ODS_2447']);
    expect(isOudeVersie(oudere, metOud)).toBe(true);
    expect(isOudeVersie(andereStroom, metOud)).toBe(false);
    expect(filterSets(metOud, { ...alles, geldigheid: 'actueel' }).map((s) => s.id)).toEqual(['ODS_3287', 'ODS_2300', 'ODS_2600', 'ODS_2450']);
  });

  it('graadOpties geeft de graden in natuurlijke volgorde, zonder dubbels of lege waarden', () => {
    expect(graadOpties([...sets, indexSet('ODS_9')])).toEqual(['1ste graad', '2de graad', '3de graad']);
  });

  it('zonderAccenten haalt accenten weg', () => {
    expect(zonderAccenten('Één Café Ça')).toBe('een cafe ca');
  });
});

describe('filterSets: stroom', () => {
  const sets: MinimumdoelenIndexSet[] = [
    indexSet('ODS_A', { naam: 'Secundair onderwijs 1ste graad A-stroom -  Competenties in het Nederlands - Eindtermen basisgeletterdheid', korteNaam: 'Nederlands', graad: '1ste graad', stroom: 'A-stroom' }),
    indexSet('ODS_B', { naam: 'Secundair onderwijs 1ste graad B-stroom -  Competenties in het Nederlands - Eindtermen basisgeletterdheid', korteNaam: 'Nederlands', graad: '1ste graad', stroom: 'B-stroom' }),
    indexSet('ODS_BA', { naam: 'Buitengewoon Secundair onderwijs 1ste graad A-stroom Opleidingsvorm 4 -  Competenties in het Nederlands - Eindtermen basisgeletterdheid', korteNaam: 'Nederlands', graad: '1ste graad', stroom: 'A-stroom' }),
    indexSet('ODS_Z', { naam: 'Secundair onderwijs 2de graad aso - Vak - Chemie - Eindtermen', korteNaam: 'Chemie', graad: '2de graad' }),
  ];
  const alles: SetFilter = { zoek: '', geldigheid: 'alle', graad: '', soort: 'alle' };
  const ids = (f: Partial<SetFilter>) => filterSets(sets, { ...alles, ...f }).map((s) => s.id);

  it('zonder stroom of met "allebei" (leeg) blijft alles over', () => {
    expect(ids({})).toEqual(['ODS_A', 'ODS_B', 'ODS_BA', 'ODS_Z']);
    expect(ids({ stroom: '' })).toEqual(['ODS_A', 'ODS_B', 'ODS_BA', 'ODS_Z']);
  });

  it('de A-stroom laat de sets van de B-stroom weg, en omgekeerd', () => {
    expect(ids({ stroom: 'A-stroom' })).toEqual(['ODS_A', 'ODS_BA', 'ODS_Z']);
    expect(ids({ stroom: 'B-stroom' })).toEqual(['ODS_B', 'ODS_Z']);
  });

  it('een set zonder stroom valt nooit weg door de stroom', () => {
    expect(ids({ stroom: 'A-stroom' })).toContain('ODS_Z');
    expect(ids({ stroom: 'B-stroom' })).toContain('ODS_Z');
  });

  it('werkt samen met soort onderwijs, graad en zoektekst', () => {
    expect(ids({ stroom: 'A-stroom', soort: 'so' })).toEqual(['ODS_A', 'ODS_Z']);
    expect(ids({ stroom: 'A-stroom', soort: 'buso' })).toEqual(['ODS_BA']);
    expect(ids({ stroom: 'B-stroom', soort: 'buso' })).toEqual([]);
    expect(ids({ stroom: 'A-stroom', graad: '1ste graad' })).toEqual(['ODS_A', 'ODS_BA']);
    expect(ids({ stroom: 'B-stroom', zoek: 'nederlands' })).toEqual(['ODS_B']);
  });
});

describe('filterSets: basisonderwijs', () => {
  const sets: MinimumdoelenIndexSet[] = [
    indexSet('ODS_1', { naam: 'Secundair onderwijs 1ste graad A-stroom - Vak - Wiskunde - Eindtermen', korteNaam: 'Wiskunde', graad: '1ste graad', stroom: 'A-stroom' }),
    indexSet('ODS_2', { naam: 'Lager Onderwijs 4de leerjaar -  Wiskunde - Te bereiken minimumdoelen op populatieniveau', korteNaam: 'Wiskunde' }),
    indexSet('ODS_3', { naam: 'Buitengewoon Kleuteronderwijs -  Wiskunde - Na te streven minimumdoelen op populatieniveau', korteNaam: 'Wiskunde' }),
  ];
  const alles: SetFilter = { zoek: '', geldigheid: 'alle', graad: '', soort: 'alle' };
  const ids = (f: Partial<SetFilter>) => filterSets(sets, { ...alles, ...f }).map((s) => s.id);

  it("soort 'alle' laat de sets van het basisonderwijs weg, tenzij metBasis aanstaat", () => {
    expect(ids({})).toEqual(['ODS_1']);
    expect(ids({ metBasis: true })).toEqual(['ODS_1', 'ODS_2', 'ODS_3']);
    expect(ids({ metBasis: false })).toEqual(['ODS_1']);
  });

  it("met soort 'bao' of 'bubao' werkt de filter gewoon", () => {
    expect(ids({ soort: 'bao' })).toEqual(['ODS_2']);
    expect(ids({ soort: 'bubao' })).toEqual(['ODS_3']);
    expect(ids({ soort: 'buso' })).toEqual([]);
  });

  it('een zoekterm die precies het nummer van een set is, vindt die set altijd', () => {
    expect(ids({ zoek: 'ODS_2' })).toEqual(['ODS_2']);
    expect(ids({ zoek: 'ods_2' })).toEqual(['ODS_2']);
    expect(ids({ zoek: ' ODS_3 ' })).toEqual(['ODS_3']);
    // Een deel van het nummer, of een nummer met nog een woord erbij, is geen uitdrukkelijke keuze.
    expect(ids({ zoek: 'ODS_' })).toEqual(['ODS_1']);
    expect(ids({ zoek: 'ODS_2 wiskunde' })).toEqual([]);
    // Met een andere soort dan 'alle' blijft de soort gelden.
    expect(ids({ zoek: 'ODS_2', soort: 'so' })).toEqual([]);
  });

  it('een zoekterm op vak vindt geen set van het basisonderwijs', () => {
    expect(ids({ zoek: 'wiskunde' })).toEqual(['ODS_1']);
    expect(ids({ zoek: 'wiskunde', metBasis: true })).toEqual(['ODS_1', 'ODS_2', 'ODS_3']);
  });
});

describe('filterSets: lerarenopleiding voor kleuter en lager', () => {
  const sets: MinimumdoelenIndexSet[] = [
    indexSet('ODS_1', { naam: 'Secundair onderwijs 1ste graad A-stroom - Vak - Wiskunde - Eindtermen', korteNaam: 'Wiskunde', graad: '1ste graad', stroom: 'A-stroom' }),
    indexSet('ODS_2842', { naam: NAAM.ODS_2842, korteNaam: 'Leraar Kleuteronderwijs' }),
    indexSet('ODS_2843', { naam: NAAM.ODS_2843, korteNaam: 'Leerkracht Lager onderwijs' }),
    indexSet('ODS_2844', { naam: 'Lerarenopleiding - Opleiding - Leerkracht Secundair onderwijs - Eindtermen', korteNaam: 'Leerkracht Secundair onderwijs' }),
  ];
  const alles: SetFilter = { zoek: '', geldigheid: 'alle', graad: '', soort: 'alle' };
  const ids = (f: Partial<SetFilter>) => filterSets(sets, { ...alles, ...f }).map((s) => s.id);

  it("soort 'alle' laat de lerarenopleiding voor kleuter en lager weg, die voor het secundair niet", () => {
    expect(ids({})).toEqual(['ODS_1', 'ODS_2844']);
    expect(ids({ metBasis: false })).toEqual(['ODS_1', 'ODS_2844']);
  });

  it('zoeken op kleuter, lager of leraar vindt ze niet zonder metBasis', () => {
    expect(ids({ zoek: 'kleuteronderwijs' })).toEqual([]);
    expect(ids({ zoek: 'eindtermen kleuter' })).toEqual([]);
    expect(ids({ zoek: 'lager onderwijs' })).toEqual([]);
    expect(ids({ zoek: 'leraar' })).toEqual([]);
    expect(ids({ zoek: 'lerarenopleiding' })).toEqual(['ODS_2844']);
    expect(ids({ zoek: 'opleiding' })).toEqual(['ODS_2844']);
  });

  it("met metBasis, met soort 'ander' of op het nummer van de set blijven ze vindbaar (de pagina Officiële minimumdoelen)", () => {
    expect(ids({ metBasis: true })).toEqual(['ODS_1', 'ODS_2842', 'ODS_2843', 'ODS_2844']);
    expect(ids({ zoek: 'kleuteronderwijs', metBasis: true })).toEqual(['ODS_2842']);
    expect(ids({ soort: 'ander' })).toEqual(['ODS_2842', 'ODS_2843', 'ODS_2844']);
    expect(ids({ zoek: 'lager onderwijs', soort: 'ander' })).toEqual(['ODS_2843']);
    expect(ids({ zoek: 'ODS_2842' })).toEqual(['ODS_2842']);
  });
});

describe('tweelingen op naam', () => {
  const so = 'Secundair onderwijs 1ste graad A-stroom -  Competenties in het Nederlands - Eindtermen basisgeletterdheid';
  const buso = 'Buitengewoon Secundair onderwijs 1ste graad A-stroom Opleidingsvorm 4 -  Competenties in het Nederlands - Eindtermen basisgeletterdheid';

  it('de sleutel van een BuSO-set is zijn naam zonder "Buitengewoon " en zonder " Opleidingsvorm 4", gelijk aan die van de SO-set', () => {
    expect(tweelingSleutel(so)).toBe('secundair onderwijs 1ste graad a-stroom - competenties in het nederlands - eindtermen basisgeletterdheid');
    expect(tweelingSleutel(buso)).toBe(tweelingSleutel(so));
  });

  it('hoofdletters, accenten en dubbele spaties tellen niet mee', () => {
    expect(tweelingSleutel('BUITENGEWOON   secundair ONDERWIJS 2de graad aso Opleidingsvorm 4 - Vak - Géographie - Eindtermen'))
      .toBe(tweelingSleutel('Secundair onderwijs 2de graad aso - Vak - Geographie - Eindtermen'));
  });

  it('sets die geen tweeling kunnen hebben, hebben geen sleutel: andere opleidingsvormen, volwassenenonderwijs, ander onderwijs', () => {
    expect(tweelingSleutel('Buitengewoon Secundair onderwijs Opleidingsvorm 3 - Domein - Burgerzin - Ontwikkelingsdoelen')).toBeUndefined();
    expect(tweelingSleutel('Buitengewoon Secundair onderwijs Opleidingsvorm 1 - Ontwikkelingsdoelen')).toBeUndefined();
    expect(tweelingSleutel('Secundair Volwassenenonderwijs Aanvullende Algemene Vorming Minimum - Vak - Ict - Eindtermen')).toBeUndefined();
    expect(tweelingSleutel('Basisonderwijs - Vak - Wiskunde')).toBeUndefined();
    expect(tweelingSleutel('')).toBeUndefined();
  });

  it('een SO-set en zijn BuSO-tweeling, in beide richtingen', () => {
    expect(zijnTweeling({ naam: so }, { naam: buso })).toBe(true);
    expect(zijnTweeling({ naam: buso }, { naam: so })).toBe(true);
  });

  it('geen tweeling: A- tegenover B-stroom, twee SO-sets, twee BuSO-sets, een set met zichzelf, een andere set', () => {
    const b = so.replace('A-stroom', 'B-stroom');
    const busoB = buso.replace('A-stroom', 'B-stroom');
    expect(zijnTweeling({ naam: so }, { naam: busoB })).toBe(false);
    expect(zijnTweeling({ naam: b }, { naam: buso })).toBe(false);
    expect(zijnTweeling({ naam: so }, { naam: b })).toBe(false);
    expect(zijnTweeling({ naam: buso }, { naam: busoB })).toBe(false);
    expect(zijnTweeling({ naam: so }, { naam: so })).toBe(false);
    expect(zijnTweeling({ naam: so }, { naam: buso.replace('Nederlands', 'Frans') })).toBe(false);
  });

  it('een andere versie is geen tweeling; zonder versie op een van beide telt alleen de naam', () => {
    expect(zijnTweeling({ naam: so, versie: '2.1' }, { naam: buso, versie: '2.1' })).toBe(true);
    expect(zijnTweeling({ naam: so, versie: '2.0' }, { naam: buso, versie: '2.1' })).toBe(false);
    expect(zijnTweeling({ naam: so }, { naam: buso, versie: '2.1' })).toBe(true);
    expect(zijnTweeling({ naam: so, versie: '2.1' }, { naam: buso, versie: ' ' })).toBe(true);
  });

  describe('met de meegeleverde index en sets', () => {
    const map = join(fileURLToPath(new URL('../../', import.meta.url)), 'public', 'leerplannen', 'minimumdoelen');
    const pad = join(map, 'index.json');
    const index = existsSync(pad) ? (JSON.parse(readFileSync(pad, 'utf8')) as { sets: MinimumdoelenIndexSet[] }).sets : [];
    const heeft = index.length > 0 && indexHeeftGeldigheid(index);
    const geldig = index.filter((s) => s.geldigheid === 'Geldig');
    const buso4 = geldig.filter((s) => soortVanSet(s.naam) === 'buso' && /Opleidingsvorm 4/i.test(s.naam));
    const paren = geldig.flatMap((b) => geldig.filter((a) => a.id !== b.id && soortVanSet(b.naam) === 'buso' && soortVanSet(a.naam) === 'so' && zijnTweeling(a, b)).map((a) => [a, b] as const));
    const doelIds = (f: MinimumdoelenIndexSet) => (JSON.parse(readFileSync(join(map, `${f.id}.json`), 'utf8')) as { doelen: { id?: string }[] }).doelen.map((d) => d.id ?? '').sort();

    it.runIf(heeft)('alle 180 geldige BuSO-sets van opleidingsvorm 4 hebben precies één SO-tweeling', () => {
      expect(buso4).toHaveLength(180);
      expect(paren).toHaveLength(180);
      for (const b of buso4) expect(paren.filter(([, x]) => x.id === b.id), b.id).toHaveLength(1);
      // Elke SO-set heeft hoogstens één BuSO-tweeling.
      const perSo = new Map<string, number>();
      for (const [a] of paren) perSo.set(a.id, (perSo.get(a.id) ?? 0) + 1);
      expect([...perSo.values()].every((n) => n === 1)).toBe(true);
    });

    it.runIf(heeft)('geen vals paar: een tweeling heeft dezelfde graad, stroom, korte naam en versie, en exact dezelfde vaste nummers', () => {
      for (const [a, b] of paren) {
        expect([b.graad, b.stroom, b.korteNaam, b.versie, b.aantal], `${a.id} en ${b.id}`).toEqual([a.graad, a.stroom, a.korteNaam, a.versie, a.aantal]);
        expect(doelIds(b), `${a.id} en ${b.id}`).toEqual(doelIds(a));
      }
    });

    it.runIf(heeft)('A- en B-stroom, of een andere set, worden nooit aan elkaar gekoppeld', () => {
      const so1 = (stroom: string, kort: string) => geldig.find((s) => soortVanSet(s.naam) === 'so' && s.graad === '1ste graad' && s.stroom === stroom && s.korteNaam === kort)!;
      const buso1 = (stroom: string, kort: string) => geldig.find((s) => soortVanSet(s.naam) === 'buso' && s.graad === '1ste graad' && s.stroom === stroom && s.korteNaam === kort)!;
      expect(zijnTweeling(so1('A-stroom', 'Nederlands'), buso1('A-stroom', 'Nederlands'))).toBe(true);
      expect(zijnTweeling(so1('A-stroom', 'Nederlands'), buso1('B-stroom', 'Nederlands'))).toBe(false);
      expect(zijnTweeling(so1('B-stroom', 'Nederlands'), buso1('A-stroom', 'Nederlands'))).toBe(false);
      expect(zijnTweeling(so1('A-stroom', 'Nederlands'), buso1('A-stroom', 'Digitale competenties'))).toBe(false);
    });

    it.runIf(heeft)('sets die in de index dezelfde naam hebben in een andere versie, zijn geen tweeling', () => {
      const anderVersie = index.filter((b) => soortVanSet(b.naam) === 'buso').flatMap((b) => index.filter((a) => soortVanSet(a.naam) === 'so'
        && tweelingSleutel(a.naam) === tweelingSleutel(b.naam) && a.versie !== b.versie).map((a) => [a, b] as const));
      expect(anderVersie.length).toBeGreaterThan(0);
      for (const [a, b] of anderVersie) expect(zijnTweeling(a, b), `${a.id} en ${b.id}`).toBe(false);
    });

    it.runIf(heeft)('de kenmerken van een BuSO-tweeling noemen de soort en de opleidingsvorm; die van een SO-set niet', () => {
      const nl = (id: string) => index.find((s) => s.id === id)!;
      expect(setKenmerken(nl('ODS_3343'))).toBe('1ste graad · A-stroom · Eindtermen basisgeletterdheid');
      expect(setKenmerken(nl('ODS_3346'))).toBe('Buitengewoon secundair onderwijs · 1ste graad · A-stroom · Opleidingsvorm 4 · Eindtermen basisgeletterdheid');
    });
  });
});

describe('soorten met de meegeleverde index', () => {
  const pad = join(fileURLToPath(new URL('../../', import.meta.url)), 'public', 'leerplannen', 'minimumdoelen', 'index.json');
  const index = existsSync(pad) ? (JSON.parse(readFileSync(pad, 'utf8')) as { sets: MinimumdoelenIndexSet[] }).sets : [];
  // Met de gegevens van vóór PR #11 (alleen secundair en volwassenenonderwijs) zijn de controles op basissets niet nodig.
  const heeftBasis = index.some((s) => s.id === 'ODS_3395');
  const alle: SetFilter = { zoek: '', geldigheid: 'alle', graad: '', soort: 'alle' };

  it.runIf(index.length > 0)('de soort volgt de naam: buso is nooit basisonderwijs en bao en bubao zijn nooit secundair', () => {
    for (const s of index) {
      const naam = s.naam.trim();
      const soort = soortVanSet(s.naam);
      expect(soort === 'buso', s.id).toBe(/^buitengewoon\s+secundair/i.test(naam));
      expect(soort === 'bubao', s.id).toBe(/^buitengewoon\s+(kleuteronderwijs|lager\s+onderwijs)\b/i.test(naam));
      expect(soort === 'bao', s.id).toBe(/^(kleuteronderwijs|lager\s+onderwijs)\b/i.test(naam));
    }
  });

  it.runIf(heeftBasis)('de lerarenopleiding blijft ander onderwijs', () => {
    for (const id of ['ODS_2842', 'ODS_2843', 'ODS_2844']) expect(soortVanSet(index.find((s) => s.id === id)!.naam), id).toBe('ander');
  });

  it.runIf(heeftBasis)("soort 'alle' bevat geen set van het basisonderwijs, met metBasis wel", () => {
    expect(filterSets(index, alle).filter((s) => isBasisSoort(soortVanSet(s.naam)))).toEqual([]);
    const metBasis = filterSets(index, { ...alle, geldigheid: 'actueel', metBasis: true }).map((s) => s.id);
    expect(metBasis).toEqual(expect.arrayContaining(['ODS_3395', 'ODS_3465', 'ODS_3485']));
    // Zoeken op het nummer van een set van het basisonderwijs vindt die set ook zonder metBasis.
    expect(filterSets(index, { ...alle, zoek: 'ODS_3406' }).map((s) => s.id)).toEqual(['ODS_3406']);
  });

  it.runIf(heeftBasis)('de lerarenopleiding voor kleuter en lager komt niet in lijsten voor het secundair, die voor het secundair blijft', () => {
    const zonder = (zoek: string, extra: Partial<SetFilter> = {}) => filterSets(index, { ...alle, zoek, ...extra }).map((s) => s.id);
    expect(filterSets(index, alle).filter((s) => hoortBijBasis(s.naam))).toEqual([]);
    for (const zoek of ['kleuteronderwijs', 'eindtermen kleuter', 'lager onderwijs', 'leraar', 'leerkracht lager']) {
      expect(zonder(zoek), zoek).not.toContain('ODS_2842');
      expect(zonder(zoek), zoek).not.toContain('ODS_2843');
    }
    // De lerarenopleiding voor het secundair verandert niet voor wie ze nu vindt.
    expect(zonder('lerarenopleiding')).toEqual(['ODS_2844']);
    // Op de pagina "Officiële minimumdoelen" (metBasis) en met soort 'ander' staan alle drie er nog.
    expect(zonder('lerarenopleiding', { metBasis: true })).toEqual(['ODS_2842', 'ODS_2843', 'ODS_2844']);
    expect(zonder('', { soort: 'ander' })).toEqual(['ODS_2842', 'ODS_2843', 'ODS_2844']);
    expect(zonder('ODS_2842')).toEqual(['ODS_2842']);
  });

  it.runIf(heeftBasis)('heeftActueleSets: niet voor de lerarenopleiding, wel voor een oude set met actuele sets', () => {
    const set = (id: string) => index.find((s) => s.id === id) as MinimumdoelenIndexSet;
    for (const id of ['ODS_2842', 'ODS_2843', 'ODS_2844']) expect(heeftActueleSets(set(id), index), id).toBe(false);
    for (const id of ['ODS_2104', 'ODS_2318', 'ODS_2123']) expect(heeftActueleSets(set(id), index), id).toBe(true);
    // Voor het secundair verandert er niets: elke oude set buiten de lerarenopleiding heeft nog actuele sets om naar te kijken.
    const oud = oudeVersieIds(index);
    const zonderActueel = index.filter((s) => oud.has(s.id) && !heeftActueleSets(s, index)).map((s) => s.id);
    expect(zonderActueel).toEqual(['ODS_2842', 'ODS_2843', 'ODS_2844']);
  });

  it.runIf(heeftBasis)('onder de actuele sets van het basisonderwijs is elke combinatie van korte naam en kenmerken uniek', () => {
    const oud = oudeVersieIds(index);
    const gezien = new Map<string, string>();
    for (const s of index.filter((x) => isBasisSoort(soortVanSet(x.naam)) && !oud.has(x.id))) {
      const sleutel = `${(s.korteNaam ?? '').toLowerCase()}|${setKenmerken(s)}`;
      expect(gezien.get(sleutel), `${s.id} lijkt op ${gezien.get(sleutel)}`).toBeUndefined();
      gezien.set(sleutel, s.id);
    }
  });
});

describe('opvolgersVan: het type in het buitengewoon basisonderwijs', () => {
  const oudNaam = (type: string, vak: string) => `Buitengewoon Lager Onderwijs Type ${type} - Leergebied - ${vak} - Ontwikkelingsdoelen`;
  const geldig = { geldigheid: 'Geldig' };
  const oud = { geldigheid: 'Niet meer geldig' };
  const sets: MinimumdoelenIndexSet[] = [
    indexSet('ODS_1', { naam: oudNaam('8', 'Nederlands'), korteNaam: 'Nederlands', ...oud }),
    indexSet('ODS_2', { naam: oudNaam('1', 'Nederlands'), korteNaam: 'Nederlands', ...oud }),
    indexSet('ODS_3', { naam: oudNaam('7', 'Communicatie en taal: Nederlands'), korteNaam: 'Communicatie en taal: Nederlands', aantal: 233, ...geldig }),
    indexSet('ODS_4', { naam: 'Buitengewoon Lager Onderwijs Basisaanbod - Leergebied - Nederlands - Ontwikkelingsdoelen', korteNaam: 'Nederlands', aantal: 20, ...geldig }),
    indexSet('ODS_5', { naam: NAAM.ODS_3465, korteNaam: 'Nederlands', aantal: 10, ...geldig }),
    indexSet('ODS_6', { naam: oudNaam('2', 'Motorische En Lichamelijke Ontwikkeling'), korteNaam: 'Motorische En Lichamelijke Ontwikkeling', ...geldig }),
    indexSet('ODS_7', { naam: oudNaam('8', 'Sociaal-Emotionele Ontwikkeling'), korteNaam: 'Sociaal-Emotionele Ontwikkeling', ...oud }),
  ];
  const ids = (id: string) => opvolgersVan(sets.find((s) => s.id === id)!, sets).sets.map((s) => s.id);

  it('laat een set van een ander type weg, en houdt sets zonder type (Basisaanbod, de leerjaren van 2025)', () => {
    // ODS_3 is Type 7: een opvolger van Type 7, niet van Type 8 of Type 1, ook al noemt hij Nederlands.
    expect(ids('ODS_1')).toEqual(['ODS_4', 'ODS_5']);
    expect(ids('ODS_2')).toEqual(['ODS_4', 'ODS_5']);
  });

  it('een set van hetzelfde type blijft een opvolger', () => {
    const type7: MinimumdoelenIndexSet = indexSet('ODS_8', { naam: oudNaam('7', 'Nederlands'), korteNaam: 'Nederlands', ...oud });
    const alle = [...sets, type7];
    expect(opvolgersVan(type7, alle).sets.map((s) => s.id)).toEqual(['ODS_3', 'ODS_4', 'ODS_5']);
  });

  it('het woord "ontwikkeling" alleen maakt een ander leergebied van een ander type geen opvolger', () => {
    expect(ids('ODS_7')).toEqual([]);
    expect(opvolgersVan(sets.find((s) => s.id === 'ODS_7')!, sets).soort).toBe('geen');
  });

  it('verandert niets voor andere soorten: zonder type in de naam telt het type niet mee', () => {
    const so = [
      indexSet('ODS_10', { naam: 'Secundair onderwijs 1ste graad A-stroom - Vak - Latijn type 3 - Eindtermen', korteNaam: 'Latijn', graad: '1ste graad', stroom: 'A-stroom', ...oud }),
      indexSet('ODS_11', { naam: 'Secundair onderwijs 1ste graad A-stroom - Pool - Latijn type 5 - Eindtermen', korteNaam: 'Latijn', graad: '1ste graad', stroom: 'A-stroom', ...geldig }),
    ];
    expect(opvolgersVan(so[0], so).sets.map((s) => s.id)).toEqual(['ODS_11']);
  });
});

describe('heeftActueleSets', () => {
  const sets: MinimumdoelenIndexSet[] = [
    indexSet('ODS_1', { naam: 'Secundair onderwijs 1ste graad A-stroom - Vak - Wiskunde - Eindtermen', graad: '1ste graad', stroom: 'A-stroom', geldigheid: 'Niet meer geldig' }),
    indexSet('ODS_2', { naam: 'Secundair onderwijs 2de graad aso - Vak - Wiskunde - Eindtermen', graad: '2de graad', geldigheid: 'Geldig' }),
    indexSet('ODS_3', { naam: NAAM.ODS_2104, korteNaam: 'Nederlands', geldigheid: 'Niet meer geldig' }),
    indexSet('ODS_4', { naam: NAAM.ODS_3397, korteNaam: 'Nederlands', geldigheid: 'Geldig' }),
    indexSet('ODS_5', { naam: NAAM.ODS_2842, korteNaam: 'Leraar Kleuteronderwijs', geldigheid: 'Niet meer geldig' }),
  ];
  const heeft = (id: string) => heeftActueleSets(sets.find((s) => s.id === id)!, sets);

  it('kijkt naar dezelfde soort onderwijs en dezelfde graad', () => {
    expect(heeft('ODS_1')).toBe(false); // wel een actuele set van het secundair, maar in de 2de graad
    expect(heeft('ODS_3')).toBe(true);
  });

  it('is onwaar voor de lerarenopleiding: er zijn geen sets van die soort die nu gelden', () => {
    expect(heeft('ODS_5')).toBe(false);
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

  it.runIf(heeft)('ziet versie 2.0 met geldigheid "Onbekend" als oudere versie van 2.1', () => {
    // STEM 3de graad doorstroom: 2.0 (Onbekend) → 2.1 (Geldig)
    expect(isOudeVersie(set('ODS_2787'), index)).toBe(true);
    expect(ids('ODS_2787')).toEqual({ soort: 'versie', sets: [set('ODS_3069')] });
    // Volwassenenonderwijs zonder geldige naamgenoot: blijft zichtbaar.
    expect(isOudeVersie(set('ODS_2704'), index)).toBe(false);
    // Elke "Onbekend" die als oud geldt, heeft een nieuwere versie om naar te wijzen.
    for (const s of index.filter((x) => geldigheidVan(x) === 'O' && isOudeVersie(x, index))) {
      expect(opvolgersVan(s, index).soort, s.id).toBe('versie');
    }
  });

  it.runIf(heeft)('geeft voor elke set die niet meer geldt iets terug, zonder zichzelf of andere oude sets', () => {
    let metOpvolger = 0;
    const oud = index.filter((s) => geldigheidVan(s) === 'N');
    for (const s of oud) {
      const o = opvolgersVan(s, index);
      expect(o.sets.every((x) => x.id !== s.id && !isOudeVersie(x, index))).toBe(true);
      if (o.sets.length > 0) metOpvolger++;
    }
    // De meeste oude sets hebben een aanwijsbare opvolger; de rest krijgt "kies een set die nu geldt".
    expect(metOpvolger / oud.length).toBeGreaterThan(0.5);
  });

  it.runIf(heeft)('een oude set van het secundair wijst niet naar het basisonderwijs en omgekeerd', () => {
    // BuSO opleidingsvorm 4 (2010–2025): één opvolger, een set van het buitengewoon secundair.
    expect(ids('ODS_2507').soort).toBe('vak');
    expect(ids('ODS_2507').sets.map((s) => s.id)).toEqual(['ODS_2268']);
    // Lerarenopleiding: nooit een opvolger.
    for (const id of ['ODS_2509', 'ODS_2510', 'ODS_2844']) expect(ids(id).soort, id).toBe('geen');
  });

  // Alleen met de sets van het basisonderwijs in de index.
  const heeftBasis = index.some((s) => s.id === 'ODS_3395');

  it.runIf(heeft && heeftBasis)('oude kleutersets wijzen naar kleutersets, niet naar sets van het lager', () => {
    expect(ids('ODS_2104')).toMatchObject({ soort: 'vak' });
    expect(ids('ODS_2104').sets.map((s) => s.id)).toEqual(['ODS_3397', 'ODS_3401']);
  });

  it.runIf(heeft && heeftBasis)('een oude set van het buitengewoon basisonderwijs krijgt geen opvolger van een ander type', () => {
    const typeVan = (naam: string) => /\btype\s+(\d+)\b/i.exec(naam)?.[1];
    let metType = 0;
    for (const id of oudeVersieIds(index)) {
      const oud = set(id);
      const type = typeVan(oud.naam);
      if (soortVanSet(oud.naam) !== 'bubao' || type === undefined) continue;
      metType++;
      for (const o of opvolgersVan(oud, index).sets) {
        expect(typeVan(o.naam) ?? type, `${id} (Type ${type}) naar ${o.id}`).toBe(type);
      }
    }
    expect(metType).toBeGreaterThan(0);
    // Type 1 en Type 8 (Nederlands) wijzen naar het Basisaanbod en de leerjaren, niet naar Type 7 (ODS_2307).
    for (const id of ['ODS_2311', 'ODS_2318', 'ODS_2376']) {
      expect(ids(id).sets.map((s) => s.id), id).toEqual(['ODS_2571', 'ODS_3465', 'ODS_3466']);
    }
    // Een ander leergebied telt niet mee omdat het woord "ontwikkeling" past (Type 2 Motorische en lichamelijke ontwikkeling).
    for (const id of ['ODS_2313', 'ODS_2315']) expect(ids(id), id).toEqual({ soort: 'geen', sets: [] });
  });

  it.runIf(heeft && heeftBasis)('een opvolger heeft dezelfde soort en hetzelfde moment als de oude set', () => {
    for (const id of oudeVersieIds(index)) {
      const oud = set(id);
      for (const o of opvolgersVan(oud, index).sets) {
        expect(soortVanSet(o.naam), `${id} naar ${o.id}`).toBe(soortVanSet(oud.naam));
        expect(momentVanSet(o.naam), `${id} naar ${o.id}`).toBe(momentVanSet(oud.naam));
      }
    }
  });
});


// ── STEM-sets en zoeken in de doelen ────────────────────────────────────────

describe('zoeken in de doelen', () => {
  const doel = { code: '06.31', tekst: 'De leerlingen leggen het verschil uit tussen mengsels en zuivere stoffen aan de hand van het deeltjesmodel.' };

  it('zoekTermen: zonder accenten, kleine letters, gesplitst op witruimte', () => {
    expect(zoekTermen('  Énergie   DEELTJES ')).toEqual(['energie', 'deeltjes']);
    expect(zoekTermen('')).toEqual([]);
  });

  it('doelPastBijZoek: alle woorden in code, tekst of rubriek', () => {
    expect(doelPastBijZoek(doel, [])).toBe(true);
    expect(doelPastBijZoek(doel, zoekTermen('mengsels deeltjesmodel'))).toBe(true);
    expect(doelPastBijZoek(doel, zoekTermen('06.31'))).toBe(true);
    expect(doelPastBijZoek(doel, zoekTermen('mengsels fotosynthese'))).toBe(false);
    expect(doelPastBijZoek({ ...doel, rubriek: 'Materie' }, zoekTermen('materie'))).toBe(true);
  });

  it('zoekVoorbeelden: alleen woorden die iets vinden, hoogstens drie', () => {
    expect(zoekVoorbeelden([doel])).toEqual(['stoffen']);
    expect(zoekVoorbeelden([{ code: '1', tekst: 'Rekenen met breuken.' }])).toEqual([]);
  });
});

describe('STEM-sets met de meegeleverde index', () => {
  const map = join(fileURLToPath(new URL('../../', import.meta.url)), 'public', 'leerplannen', 'minimumdoelen');
  const pad = join(map, 'index.json');
  const index = existsSync(pad) ? (JSON.parse(readFileSync(pad, 'utf8')) as { sets: MinimumdoelenIndexSet[] }).sets : [];
  const heeft = index.length > 0 && indexHeeftGeldigheid(index);
  const set = (id: string) => index.find((s) => s.id === id) as MinimumdoelenIndexSet;
  const vakken = (id: string) => vakSetsBijStem(set(id), index).map((s) => s.id);

  it.runIf(heeft)('herkent de STEM-sets aan de naam van de sleutelcompetentie', () => {
    expect(isStemSet(set('ODS_3283'))).toBe(true);
    expect(isStemSet(set('ODS_3344'))).toBe(true);
    expect(isStemSet(set('ODS_3287'))).toBe(false);
    expect(isStemSet(set('ODS_3132'))).toBe(false);
  });

  it.runIf(heeft)('vindt de sets per vak naast een STEM-set, per graad en leerjaar', () => {
    expect(vakken('ODS_3283')).toEqual([]);
    expect(vakken('ODS_3020')).toEqual(['ODS_3132', 'ODS_3133', 'ODS_3136']);
    expect(vakken('ODS_3069')).toEqual(['ODS_3116', 'ODS_3117', 'ODS_3120']);
    expect(vakken('ODS_3365')).toEqual(['ODS_3377', 'ODS_3379', 'ODS_3383']);
  });

  it.runIf(heeft)('elk voorbeeldwoord vindt iets in de STEM-set van de 1ste graad A-stroom', () => {
    const bestand = JSON.parse(readFileSync(join(map, 'ODS_3283.json'), 'utf8')) as { doelen: { code: string; tekst: string }[] };
    const voorbeelden = zoekVoorbeelden(bestand.doelen);
    expect(voorbeelden.length).toBeGreaterThan(0);
    for (const w of voorbeelden) expect(bestand.doelen.some((d) => doelPastBijZoek(d, [w])), w).toBe(true);
  });
});
