// De selectors over de gegevens van het GO!: kleine fixtures als tekst in dit bestand, plus een controle op de echte
// bestanden dat elke lessenlijn een eigen, werkend adresdeel heeft.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  aantalLesplannenPerLeeftijd,
  goDoelBestaat,
  groepeerBijDoelen,
  ikDoelenVanDoel,
  leerplandoelenBijMinimumdoel,
  lesplanVanCode,
  lesplannenFilter,
  lesplannenMetDoel,
  lesplannenPerLeeftijd,
  lessenlijnTabel,
  lessenlijnen,
  rubriekPad,
  rubriekPadVanDoel,
  slugVan,
  vakVanDoelcode,
  vindLeerplandoel,
  vindLessenlijn,
} from './goModel';
import { GO_VAKKEN_BIJ_VAK, isGoVak } from './types';
import type { GoBijDoel, GoBijMinimumdoelBestand, GoIndex, GoLeerplanBestand, GoLesplanBestand, GoRubriek } from './types';

type IndexLesplan = GoIndex['lesplannen'][number];

function lp(code: string, leeftijd: IndexLesplan['leeftijd'], vak: IndexLesplan['vak'], lessenlijn: string, lessenreeks: string, doelen: string[] = []): IndexLesplan {
  return { code, titel: `Titel ${code}`, leeftijd, vak, lessenlijn, lessenreeks, doelen, bestand: `lesplannen/${code}.json`, sha256: 'x'.repeat(64) };
}

/** Bewust niet op volgorde, om te zien dat de selectors zelf sorteren. */
const INDEX = {
  app: 'boosterz',
  kind: 'go-index',
  v: 1,
  naamsvermelding: 'GO! onderwijs van de Vlaamse Gemeenschap',
  ingelezen: '2026-11-09',
  leerplan: [],
  bijMinimumdoel: [],
  lesplannen: [
    lp('LP0074', '2,5-4', 'WT', 'Biologie van organismen', 'Flora en schimmels: classificeren', ['WT.028', 'WT.039']),
    lp('LP0001', '2,5-4', 'WT', 'Biologie van de mens', 'Levenscyclus en lichamelijke veranderingen', ['WT.086']),
    lp('LP0200', '4-5', 'WT', 'Biologie van organismen', 'Fauna: classificeren', ['WT.028']),
    lp('LP0014b', '2,5-4', 'WT', 'Biologie van de mens', 'Fysieke functies: algemeen', ['WT.216']),
    lp('LP0014a', '2,5-4', 'WT', 'Biologie van de mens', 'Fysieke functies: algemeen', ['WT.176']),
    lp('LP0300', '8-9', 'WI', 'Getallen & bewerkingen', 'Optellen', ['WI.001']),
    lp('LP0301', '2,5-4', 'WI', 'Getallen en bewerkingen', 'Tellen', ['WI.002']),
  ],
} as unknown as GoIndex;

describe('slugVan', () => {
  it('kleine letters, zonder accenten, met streepjes', () => {
    expect(slugVan('Biologie van organismen')).toBe('biologie-van-organismen');
    expect(slugVan('Één  lessenlijn, café: crème & ëxtra!')).toBe('een-lessenlijn-cafe-creme-extra');
    expect(slugVan('  -- Rand --  ')).toBe('rand');
    expect(slugVan('Fauna: levenscyclus 2')).toBe('fauna-levenscyclus-2');
    expect(slugVan('???')).toBe('');
    expect(slugVan('')).toBe('');
  });
});

describe('vakVanDoelcode', () => {
  it('kent de twaalf voorvoegsels en weigert de rest', () => {
    expect(vakVanDoelcode('WT.086')).toBe('WT');
    expect(vakVanDoelcode('IT.001')).toBe('IT');
    expect(vakVanDoelcode('WI.998')).toBe('WI');
    for (const fout of ['XX.001', 'WT.01', 'WT086', 'wt.086', 'WT.086a', '', 'AK.001']) expect(vakVanDoelcode(fout), fout).toBeUndefined();
    expect(vakVanDoelcode(undefined as unknown as string)).toBeUndefined();
  });
});

describe('lesplannen per leeftijd', () => {
  it('geeft de lesplannen van de groep, oplopend op code, en laat de index ongemoeid', () => {
    const voor = JSON.stringify(INDEX);
    expect(lesplannenPerLeeftijd(INDEX, '2,5-4').map((l) => l.code)).toEqual(['LP0001', 'LP0014a', 'LP0014b', 'LP0074', 'LP0301']);
    expect(lesplannenPerLeeftijd(INDEX, '4-5').map((l) => l.code)).toEqual(['LP0200']);
    expect(lesplannenPerLeeftijd(INDEX, '11-12')).toEqual([]);
    expect(JSON.stringify(INDEX)).toBe(voor);
  });

  it('filtert ook op vak, of op niets', () => {
    expect(lesplannenFilter(INDEX, { leeftijd: '2,5-4', vak: 'WI' }).map((l) => l.code)).toEqual(['LP0301']);
    expect(lesplannenFilter(INDEX, { vak: 'WI' }).map((l) => l.code)).toEqual(['LP0300', 'LP0301']);
    expect(lesplannenFilter(INDEX)).toHaveLength(7);
  });

  it('telt per groep, alleen de groepen met lesplannen en in volgorde', () => {
    expect(aantalLesplannenPerLeeftijd(INDEX)).toEqual([
      { leeftijd: '2,5-4', aantal: 5 },
      { leeftijd: '4-5', aantal: 1 },
      { leeftijd: '8-9', aantal: 1 },
    ]);
  });

  it('lesplanVanCode vindt een lesplan of niets', () => {
    expect(lesplanVanCode(INDEX, 'LP0200')?.titel).toBe('Titel LP0200');
    expect(lesplanVanCode(INDEX, 'LP9999')).toBeUndefined();
  });

  it('lesplannenMetDoel geeft de lesplannen met het doel in deel 2, oplopend op code', () => {
    expect(lesplannenMetDoel(INDEX, 'WT.028').map((l) => l.code)).toEqual(['LP0074', 'LP0200']);
    expect(lesplannenMetDoel(INDEX, 'WT.999')).toEqual([]);
  });
});

describe('lessenlijnen en slugs', () => {
  it('groepeert per vak (in de volgorde van de vakken) en lijn (op het eerste lesplan), met reeksen', () => {
    const lijnen = lessenlijnen(INDEX);
    expect(lijnen.map((l) => `${l.vak}:${l.slug}`)).toEqual([
      'WI:getallen-bewerkingen',
      'WI:getallen-en-bewerkingen',
      'WT:biologie-van-de-mens',
      'WT:biologie-van-organismen',
    ]);
    const mens = lijnen.find((l) => l.slug === 'biologie-van-de-mens');
    expect(mens?.naam).toBe('Biologie van de mens');
    expect(mens?.reeksen.map((r) => [r.naam, r.lesplannen.map((l) => l.code)])).toEqual([
      ['Levenscyclus en lichamelijke veranderingen', ['LP0001']],
      ['Fysieke functies: algemeen', ['LP0014a', 'LP0014b']],
    ]);
    expect(mens?.lesplannen.map((l) => l.code)).toEqual(['LP0001', 'LP0014a', 'LP0014b']);
    expect(mens?.leeftijden).toEqual(['2,5-4']);
  });

  it('twee lijnen met dezelfde slug krijgen een eigen adresdeel', () => {
    const index = {
      ...INDEX,
      lesplannen: [lp('LP0001', '2,5-4', 'WT', 'Plant & dier', 'a'), lp('LP0002', '2,5-4', 'WT', 'Plant en dier', 'b'), lp('LP0003', '2,5-4', 'WT', 'Plant: dier', 'c')],
    } as GoIndex;
    const slugs = lessenlijnen(index).map((l) => l.slug);
    expect(slugs).toEqual(['plant-dier', 'plant-en-dier', 'plant-dier-2']);
    expect(new Set(slugs).size).toBe(3);
  });

  it('een filter laat de slug gelijk en filtert de reeksen en lesplannen', () => {
    const alles = lessenlijnen(INDEX).map((l) => l.slug);
    const organismen = lessenlijnen(INDEX, { leeftijd: '4-5' });
    expect(organismen.map((l) => l.slug)).toEqual(['biologie-van-organismen']);
    expect(alles).toContain('biologie-van-organismen');
    expect(organismen[0].reeksen).toEqual([{ naam: 'Fauna: classificeren', lesplannen: [lesplanVanCode(INDEX, 'LP0200')] }]);
    expect(organismen[0].leeftijden).toEqual(['4-5']);
    expect(lessenlijnen(INDEX, { vak: 'WI' }).map((l) => l.vak)).toEqual(['WI', 'WI']);
    expect(lessenlijnen(INDEX, { leeftijd: '11-12' })).toEqual([]);
  });

  it('vindLessenlijn zoekt op vak en slug; een onbekende slug geeft niets', () => {
    expect(vindLessenlijn(INDEX, 'WT', 'biologie-van-organismen')?.naam).toBe('Biologie van organismen');
    expect(vindLessenlijn(INDEX, 'WI', 'biologie-van-organismen')).toBeUndefined();
    expect(vindLessenlijn(INDEX, 'WT', 'bestaat-niet')).toBeUndefined();
    expect(vindLessenlijn(INDEX, 'WT', '')).toBeUndefined();
  });

  it('de tabel heeft de reeksen als rijen en de leeftijdsgroepen als kolommen', () => {
    const lijn = vindLessenlijn(INDEX, 'WT', 'biologie-van-organismen');
    expect(lijn).toBeDefined();
    const tabel = lessenlijnTabel(lijn!);
    expect(tabel.kolommen).toEqual(['2,5-4', '4-5']);
    expect(tabel.rijen.map((r) => r.reeks)).toEqual(['Flora en schimmels: classificeren', 'Fauna: classificeren']);
    expect(tabel.rijen[0].cellen.map((c) => c.map((l) => l.code))).toEqual([['LP0074'], []]);
    expect(tabel.rijen[1].cellen.map((c) => c.map((l) => l.code))).toEqual([[], ['LP0200']]);
    for (const r of tabel.rijen) expect(r.cellen).toHaveLength(tabel.kolommen.length);
  });
});

describe('echte index: elke lessenlijn heeft een eigen, werkend adresdeel', () => {
  const ECHT = JSON.parse(
    readFileSync(join(fileURLToPath(new URL('../../../../', import.meta.url)), 'public', 'basis', 'go', 'index.json'), 'utf8'),
  ) as GoIndex;

  it('elke lessenlijn is terug te vinden op zijn slug, en elk lesplan staat in precies één lijn', () => {
    const lijnen = lessenlijnen(ECHT);
    const sleutels = lijnen.map((l) => `${l.vak}/${l.slug}`);
    expect(new Set(sleutels).size).toBe(sleutels.length);
    for (const l of lijnen) {
      expect(l.slug, l.naam).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(vindLessenlijn(ECHT, l.vak, l.slug)?.naam).toBe(l.naam);
    }
    expect(lijnen.reduce((n, l) => n + l.lesplannen.length, 0)).toBe(ECHT.lesplannen.length);
    for (const lesplan of ECHT.lesplannen) expect(lesplanVanCode(ECHT, lesplan.code)).toBe(lesplan);
  });
});

// ── Rubriekpad ───────────────────────────────────────────────────────────────

function rubriek(id: string, soort: GoRubriek['soort'], ouder?: string): GoRubriek {
  return { id, soort, tekst: `Tekst ${id}`, rij: 1, ...(ouder ? { ouder } : {}) };
}

const LEERPLAN = {
  app: 'boosterz',
  kind: 'go-leerplan',
  v: 1,
  vak: 'WT',
  naam: 'Wetenschap en techniek',
  rubrieken: [
    rubriek('WT-r001', 'onderwerp'),
    rubriek('WT-r002', 'subthema', 'WT-r001'),
    rubriek('WT-r003', 'rubriek', 'WT-r002'),
    rubriek('WT-r004', 'subrubriek', 'WT-r003'),
    rubriek('WT-r005', 'subrubriek', 'WT-r002'), // een niveau overgeslagen
    rubriek('WT-r006', 'onderwerp'),
  ],
  doelen: [
    { code: 'WT.001', tekst: 'Een.', rubriek: 'WT-r004' },
    { code: 'WT.002', tekst: 'Twee.', rubriek: 'WT-r006' },
  ],
} as unknown as GoLeerplanBestand;

describe('rubriekPad', () => {
  it('geeft het pad van boven naar onder, eindigend met de rubriek zelf', () => {
    expect(rubriekPad(LEERPLAN, 'WT-r004').map((r) => r.id)).toEqual(['WT-r001', 'WT-r002', 'WT-r003', 'WT-r004']);
    expect(rubriekPad(LEERPLAN, 'WT-r005').map((r) => r.id)).toEqual(['WT-r001', 'WT-r002', 'WT-r005']);
    expect(rubriekPad(LEERPLAN, 'WT-r006').map((r) => r.id)).toEqual(['WT-r006']);
  });

  it('een onbekend id geeft een leeg pad', () => {
    expect(rubriekPad(LEERPLAN, 'WT-r999')).toEqual([]);
    expect(rubriekPad(LEERPLAN, '')).toEqual([]);
  });

  it('een ouder die niet bestaat breekt het pad af, en een kring loopt niet vast', () => {
    const stuk = { ...LEERPLAN, rubrieken: [rubriek('WT-r002', 'subthema', 'WT-r001'), rubriek('WT-r003', 'rubriek', 'WT-r003'), rubriek('WT-r004', 'rubriek', 'WT-r005'), rubriek('WT-r005', 'rubriek', 'WT-r004')] } as GoLeerplanBestand;
    expect(rubriekPad(stuk, 'WT-r002').map((r) => r.id)).toEqual(['WT-r002']);
    expect(rubriekPad(stuk, 'WT-r003').map((r) => r.id)).toEqual(['WT-r003']);
    expect(rubriekPad(stuk, 'WT-r004').map((r) => r.id)).toHaveLength(2);
  });

  it('het pad van een doel en het opzoeken van een doel', () => {
    const doel = vindLeerplandoel(LEERPLAN, 'WT.001');
    expect(doel).toBeDefined();
    expect(rubriekPadVanDoel(LEERPLAN, doel!).map((r) => r.id)).toEqual(['WT-r001', 'WT-r002', 'WT-r003', 'WT-r004']);
    expect(vindLeerplandoel(LEERPLAN, 'WT.999')).toBeUndefined();
  });
});

// ── Omgekeerd ────────────────────────────────────────────────────────────────

function bij(code: string, leeftijden: GoBijDoel['leeftijden'], lesplannen: string[] = []): GoBijDoel {
  return { code, moment: 'KO', status: 'officieel', tekst: `Doel ${code}`, kennisverwerking: 'begrijpen', leeftijden, lesplannen };
}

const BIJ = {
  app: 'boosterz',
  kind: 'go-bij-minimumdoel',
  v: 1,
  vak: 3,
  doelen: {
    '92590': [bij('WT.028', ['2,5-4', '4-5'], ['LP0065', 'LP0074']), bij('NL.004', ['4-5']), bij('WT.001', ['2,5-4'], ['LP0065']), bij('AA.010', ['5-6'])],
    '92609': [],
  },
  sha256: 'x'.repeat(64),
} as unknown as GoBijMinimumdoelBestand;

describe('leerplandoelen bij een minimumdoel', () => {
  it('geeft de doelen bij het nummer, en niets bij een onbekend nummer', () => {
    expect(leerplandoelenBijMinimumdoel(BIJ, '92590').map((d) => d.code)).toEqual(['WT.028', 'NL.004', 'WT.001', 'AA.010']);
    expect(leerplandoelenBijMinimumdoel(BIJ, '92609')).toEqual([]);
    expect(leerplandoelenBijMinimumdoel(BIJ, '1')).toEqual([]);
  });

  it('zoekt in een Map: een sleutel als __proto__ of constructor vindt nooit iets', () => {
    for (const sleutel of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', '', '92590 ', '9259x', 'a']) {
      expect(leerplandoelenBijMinimumdoel(BIJ, sleutel), sleutel).toEqual([]);
    }
    expect(leerplandoelenBijMinimumdoel(BIJ, undefined as unknown as string)).toEqual([]);
  });

  it('groepeert per vakdiscipline (in de volgorde van de vakken) en per leeftijdsgroep', () => {
    const groepen = groepeerBijDoelen(leerplandoelenBijMinimumdoel(BIJ, '92590'));
    expect(groepen.map((g) => g.vak)).toEqual(['AA', 'NL', 'WT']);
    const wt = groepen[2];
    expect(wt.doelen.map((d) => d.code)).toEqual(['WT.001', 'WT.028']);
    expect(wt.perLeeftijd.map((g) => [g.leeftijd, g.doelen.map((d) => d.code)])).toEqual([
      ['2,5-4', ['WT.001', 'WT.028']],
      ['4-5', ['WT.028']],
    ]);
  });

  it('een lege lijst geeft geen groepen, en een code zonder vak valt weg', () => {
    expect(groepeerBijDoelen([])).toEqual([]);
    expect(groepeerBijDoelen([bij('XX.001', ['2,5-4'])])).toEqual([]);
  });
});

// ── Ik-doelen ────────────────────────────────────────────────────────────────

function lesplan(code: string, diplomas: GoLesplanBestand['afgeleid']['diplomas']): GoLesplanBestand {
  return { code, titel: `Titel ${code}`, leeftijd: '2,5-4', afgeleid: { diplomas } } as unknown as GoLesplanBestand;
}
const waar = { deel: 4, blok: 1, rij: 3, kolom: 1 };

describe('ikDoelenVanDoel', () => {
  const LESPLANNEN = [
    lesplan('LP0074', [
      { naam: 'De plantenkenner', leeftijd: '2,5-4', ikDoelen: [{ code: 'WT.028', zinnen: ['Ik maak groepen.'] }, { code: 'WT.039', zinnen: ['Ik herken planten.'] }], waar },
    ]),
    lesplan('LP0065', [
      { naam: 'De dierenkenner', leeftijd: '2,5-4', ikDoelen: [{ code: 'WT.001', zinnen: ['Ik herken dieren.'] }, { code: 'WT.028', zinnen: ['Ik maak een groep van dieren.', 'Ik maak een groep van planten.'] }], waar },
      { naam: 'De groeigoeroe', leeftijd: '4-5', ikDoelen: [{ code: 'WT.028', zinnen: ['Ik sorteer.'] }, { code: 'WT.028', zinnen: ['Ik sorteer nog eens.'] }], waar },
    ]),
  ];

  it('geeft per lesplan en diploma de zinnen van dat doel, oplopend op lesplancode', () => {
    const uit = ikDoelenVanDoel(LESPLANNEN, 'WT.028');
    expect(uit.map((u) => [u.lesplan, u.diploma, u.diplomaLeeftijd, u.zinnen])).toEqual([
      ['LP0065', 'De dierenkenner', '2,5-4', ['Ik maak een groep van dieren.', 'Ik maak een groep van planten.']],
      ['LP0065', 'De groeigoeroe', '4-5', ['Ik sorteer.', 'Ik sorteer nog eens.']],
      ['LP0074', 'De plantenkenner', '2,5-4', ['Ik maak groepen.']],
    ]);
    expect(uit[0].titel).toBe('Titel LP0065');
  });

  it('laat diploma\'s en lesplannen zonder dat doel weg, en wijzigt de invoer niet', () => {
    const volgorde = LESPLANNEN.map((l) => l.code);
    expect(ikDoelenVanDoel(LESPLANNEN, 'WT.039').map((u) => u.lesplan)).toEqual(['LP0074']);
    expect(ikDoelenVanDoel(LESPLANNEN, 'WT.999')).toEqual([]);
    expect(ikDoelenVanDoel([], 'WT.028')).toEqual([]);
    expect(LESPLANNEN.map((l) => l.code)).toEqual(volgorde);
  });
});

describe('GO_VAKKEN_BIJ_VAK', () => {
  it('elk vak van 1 tot 10 heeft alleen geldige vakken van het GO!', () => {
    for (let nr = 1; nr <= 10; nr++) {
      const lijst = GO_VAKKEN_BIJ_VAK[nr];
      expect(lijst, `vak ${nr}`).toBeDefined();
      expect(lijst.length).toBeGreaterThan(0);
      for (const g of lijst) expect(isGoVak(g), `${nr}: ${g}`).toBe(true);
    }
    expect(GO_VAKKEN_BIJ_VAK[3]).toEqual(['WT']);
  });
});

describe('goDoelBestaat', () => {
  it('is waar voor een code die in het leerplan staat en anders niet', () => {
    const aantal = { vak: 'WT', aantal: 307 };
    const index = { ...INDEX, leerplan: [aantal] } as unknown as GoIndex;
    const vak = aantal.vak;
    expect(goDoelBestaat(index, `${vak}.001`)).toBe(true);
    expect(goDoelBestaat(index, `${vak}.${String(aantal.aantal).padStart(3, '0')}`)).toBe(true);
    expect(goDoelBestaat(index, `${vak}.${String(aantal.aantal + 1).padStart(3, '0')}`)).toBe(false);
    expect(goDoelBestaat(index, `${vak}.000`)).toBe(false);
    expect(goDoelBestaat(index, `${vak}.0001`)).toBe(false);
    expect(goDoelBestaat(index, 'ZZ.001')).toBe(false);
    expect(goDoelBestaat(index, 'wt.001')).toBe(false);
    expect(goDoelBestaat(index, 'LP0065')).toBe(false);
  });
});
