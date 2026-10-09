import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_DOELGROEP_TITEL, MAX_DOELGROEP_VAK, doelgroepTekst, doelgroepVoorLeerplan, graadTekst, jaarTekst, sanitizeDoelgroep,
  zelfdeRichting, type Doelgroep,
} from './doelgroep';
import { peekHandoff, setHandoff, takeHandoff } from './handoff';

// Alle groepnummers en titels hieronder zijn voorbeelden; de echte komen uit de matrix van de studierichtingen.

const HEX = '0123456789abcdef'.repeat(4);

/** Een volledige, geldige doelgroep (zoals een leerplan van een richting ze krijgt, plus jaar en vak). */
function volledig(): Doelgroep {
  return {
    groep: 'G-0193', titel: 'Natuurwetenschappen', graad: 2, jaar: 4, soort: 'so',
    onderdeel: 12345, vak: 'Biologie', kader: HEX, volgtKader: true,
  };
}

/** Zoals het uit een bestand, link of opslag komt: via JSON. */
const viaJson = <T>(x: T): unknown => JSON.parse(JSON.stringify(x));

describe('sanitizeDoelgroep: geldige invoer', () => {
  it('neemt alle velden over, als nieuw object', () => {
    const ruw = volledig();
    const d = sanitizeDoelgroep(ruw);
    expect(d).toStrictEqual(volledig());
    expect(d).not.toBe(ruw);
  });

  it('heeft alleen groep, titel en soort nodig; de rest valt weg zonder lege sleutels', () => {
    const d = sanitizeDoelgroep({ groep: 'G-0009' });
    expect(d).toStrictEqual({ groep: 'G-0009', titel: 'G-0009', soort: 'so' });
    expect(Object.keys(d!).sort()).toEqual(['groep', 'soort', 'titel']);
  });

  it('aanvaardt groepnummers van 4 tot 6 cijfers', () => {
    for (const groep of ['G-0001', 'G-12345', 'G-999999']) expect(sanitizeDoelgroep({ groep })?.groep).toBe(groep);
  });

  it('laat de invoer ongemoeid', () => {
    const ruw = { groep: 'G-0193', titel: '  Natuur\nwetenschappen  ', jaar: 9, graad: '2', vreemd: 1 };
    const kopie = JSON.parse(JSON.stringify(ruw));
    sanitizeDoelgroep(ruw);
    expect(ruw).toEqual(kopie);
  });
});

describe('sanitizeDoelgroep: ongeldige invoer', () => {
  it('geen object of een fout groepnummer: undefined', () => {
    const gevallen: unknown[] = [
      undefined, null, 0, 1, true, 'G-0193', [], [{ groep: 'G-0193' }], () => 1,
      {}, { groep: '' }, { groep: 'G-193' }, { groep: 'G-1234567' }, { groep: 'g-0193' }, { groep: ' G-0193' },
      { groep: 'G-0193 ' }, { groep: 'G-0193\n' }, { groep: 'G-01a3' }, { groep: 193 }, { groep: ['G-0193'] },
      { titel: 'Natuurwetenschappen' }, { groep: { toString: () => 'G-0193' } },
    ];
    for (const g of gevallen) expect(sanitizeDoelgroep(g), String(JSON.stringify(g))).toBeUndefined();
  });

  it('laat onbekende sleutels vallen, ook __proto__ en constructor, zonder het prototype aan te raken', () => {
    const ruw = JSON.parse('{"groep":"G-0193","titel":"T","__proto__":{"vervuild":true},"constructor":"x","extra":1}');
    const d = sanitizeDoelgroep(ruw)!;
    expect(Object.keys(d).sort()).toEqual(['groep', 'soort', 'titel']);
    expect(Object.getPrototypeOf(d)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(d, '__proto__')).toBe(false);
    expect((d as unknown as Record<string, unknown>).vervuild).toBeUndefined();
    expect(({} as Record<string, unknown>).vervuild).toBeUndefined();
  });

  it('leest alleen eigen velden, nooit iets uit het prototype', () => {
    const ruw = Object.create({ groep: 'G-0193', titel: 'Geërfd' }) as Record<string, unknown>;
    expect(sanitizeDoelgroep(ruw)).toBeUndefined();
    const metEigenGroep = Object.assign(Object.create({ titel: 'Geërfd', jaar: 4, graad: 2 }) as object, { groep: 'G-0193' });
    expect(sanitizeDoelgroep(metEigenGroep)).toStrictEqual({ groep: 'G-0193', titel: 'G-0193', soort: 'so' });
  });

  it('titel: één regel, getrimd, hoogstens 160 tekens; leeg of geen tekst wordt het groepnummer', () => {
    expect(sanitizeDoelgroep({ groep: 'G-0193', titel: '  Natuur-\n\t wetenschappen\r\n ' })?.titel).toBe('Natuur- wetenschappen');
    expect(sanitizeDoelgroep({ groep: 'G-0193', titel: 'A\u0000B\u0007C D' })?.titel).toBe('A B C D');
    expect(sanitizeDoelgroep({ groep: 'G-0193', titel: '   ' })?.titel).toBe('G-0193');
    expect(sanitizeDoelgroep({ groep: 'G-0193', titel: 42 })?.titel).toBe('G-0193');
    const lang = sanitizeDoelgroep({ groep: 'G-0193', titel: 'x'.repeat(500) })!.titel;
    expect(lang).toHaveLength(MAX_DOELGROEP_TITEL);
    // Precies op de grens wordt niet ingekort; afknippen laat geen spatie achteraan.
    expect(sanitizeDoelgroep({ groep: 'G-0193', titel: 'y'.repeat(160) })!.titel).toHaveLength(160);
    expect(sanitizeDoelgroep({ groep: 'G-0193', titel: `${'z'.repeat(159)} staart` })!.titel).toBe('z'.repeat(159));
  });

  it('titel: knipt geen emoji (tekenpaar) doormidden', () => {
    const titel = `${'a'.repeat(159)}🌱 en meer`;
    const t = sanitizeDoelgroep({ groep: 'G-0193', titel })!.titel;
    expect(t).toBe('a'.repeat(159));
    expect(/[\ud800-\udbff]$/.test(t)).toBe(false);
  });

  it('graad: 1 tot 3, ook als tekst; anders weg', () => {
    expect(sanitizeDoelgroep({ groep: 'G-0193', graad: '3' })?.graad).toBe(3);
    expect(sanitizeDoelgroep({ groep: 'G-0193', graad: ' 1 ' })?.graad).toBe(1);
    for (const graad of [0, 4, -1, 2.5, '2.0', '02', 'twee', '', null, NaN, Infinity, true, [2]]) {
      expect(sanitizeDoelgroep({ groep: 'G-0193', graad }), String(graad)).not.toHaveProperty('graad');
    }
  });

  it('jaar: geheel getal dat bij de graad past (1: 1–2, 2: 3–4, 3: 5–7); anders weg', () => {
    const geldig: [number, number][] = [[1, 1], [1, 2], [2, 3], [2, 4], [3, 5], [3, 6], [3, 7]];
    for (const [graad, jaar] of geldig) expect(sanitizeDoelgroep({ groep: 'G-0193', graad, jaar })?.jaar, `${graad}/${jaar}`).toBe(jaar);
    const ongeldig: [unknown, unknown][] = [
      [2, 0], [2, 8], [2, 2.5], [2, 3.5], [2, '4'], [2, NaN], [2, -3], [2, null],
      [1, 3], [2, 2], [2, 5], [3, 4], [1, 7], // buiten de graad
      [undefined, 4], [undefined, 1], ['vier', 4], // zonder (geldige) graad
    ];
    for (const [graad, jaar] of ongeldig) {
      const d = sanitizeDoelgroep({ groep: 'G-0193', graad, jaar });
      expect(d, `${String(graad)}/${String(jaar)}`).not.toHaveProperty('jaar');
    }
    // Het jaar valt weg, de graad blijft.
    expect(sanitizeDoelgroep({ groep: 'G-0193', graad: 2, jaar: 5 })).toStrictEqual({ groep: 'G-0193', titel: 'G-0193', graad: 2, soort: 'so' });
  });

  it('soort: alleen buso bij precies "buso"', () => {
    expect(sanitizeDoelgroep({ groep: 'G-0009', soort: 'buso' })?.soort).toBe('buso');
    for (const soort of ['BUSO', ' buso', 'gewoon', 'so', undefined, 1, true]) {
      expect(sanitizeDoelgroep({ groep: 'G-0009', soort })?.soort, String(soort)).toBe('so');
    }
  });

  it('onderdeel: geheel getal van 1 tot 999999; anders weg', () => {
    expect(sanitizeDoelgroep({ groep: 'G-0193', onderdeel: 1 })?.onderdeel).toBe(1);
    expect(sanitizeDoelgroep({ groep: 'G-0193', onderdeel: 999999 })?.onderdeel).toBe(999999);
    for (const onderdeel of [0, -1, 1_000_000, 1.5, '505', NaN, Infinity, null]) {
      expect(sanitizeDoelgroep({ groep: 'G-0193', onderdeel }), String(onderdeel)).not.toHaveProperty('onderdeel');
    }
  });

  it('vak: één regel, getrimd, hoogstens 80 tekens; leeg valt weg', () => {
    expect(sanitizeDoelgroep({ groep: 'G-0193', vak: '  Biologie \n' })?.vak).toBe('Biologie');
    expect(sanitizeDoelgroep({ groep: 'G-0193', vak: 'b'.repeat(200) })?.vak).toHaveLength(MAX_DOELGROEP_VAK);
    expect(sanitizeDoelgroep({ groep: 'G-0193', vak: 'c'.repeat(80) })?.vak).toHaveLength(80);
    for (const vak of ['', '   ', '\n\t', 7, null, ['Biologie']]) {
      expect(sanitizeDoelgroep({ groep: 'G-0193', vak }), String(vak)).not.toHaveProperty('vak');
    }
  });

  it('kader: alleen 64 kleine hex-tekens', () => {
    expect(sanitizeDoelgroep({ groep: 'G-0193', kader: HEX })?.kader).toBe(HEX);
    for (const kader of [HEX.toUpperCase(), HEX.slice(1), `${HEX}0`, `${HEX.slice(1)}g`, ` ${HEX}`, '', 12, null]) {
      expect(sanitizeDoelgroep({ groep: 'G-0193', kader }), String(kader)).not.toHaveProperty('kader');
    }
  });

  it('volgtKader: alleen true', () => {
    expect(sanitizeDoelgroep({ groep: 'G-0193', volgtKader: true })?.volgtKader).toBe(true);
    for (const volgtKader of [false, 'true', 1, null, {}]) {
      expect(sanitizeDoelgroep({ groep: 'G-0193', volgtKader }), String(volgtKader)).not.toHaveProperty('volgtKader');
    }
  });
});

describe('sanitizeDoelgroep: idempotent', () => {
  const gevallen: unknown[] = [
    volledig(),
    { groep: 'G-0193' },
    { groep: 'G-0193', titel: `  ${'a'.repeat(158)} 🌱🌱 x \n y`, vak: ` ${'v'.repeat(79)} 🌱 `, graad: '2', jaar: 4 },
    { groep: 'G-0009', titel: '', soort: 'buso', jaar: 3, onderdeel: 4.2, kader: 'ABC', volgtKader: 'ja' },
    JSON.parse('{"groep":"G-0193","__proto__":{"x":1},"titel":"\\u0000Natuur\\r\\nwetenschappen\\u0000"}'),
  ];

  it('twee keer saneren geeft hetzelfde als één keer, ook na JSON', () => {
    for (const g of gevallen) {
      const een = sanitizeDoelgroep(g);
      expect(een).toBeDefined();
      expect(sanitizeDoelgroep(een)).toStrictEqual(een);
      expect(sanitizeDoelgroep(viaJson(een))).toStrictEqual(een);
    }
  });

  it('doelgroepVoorLeerplan haalt het jaar weg, de rest blijft; ook idempotent', () => {
    const d = doelgroepVoorLeerplan(volledig())!;
    const { jaar: _jaar, ...zonderJaar } = volledig();
    void _jaar;
    expect(d).toStrictEqual(zonderJaar);
    expect(d).not.toHaveProperty('jaar');
    expect(doelgroepVoorLeerplan(d)).toStrictEqual(d);
    expect(doelgroepVoorLeerplan({ groep: 'fout' })).toBeUndefined();
    expect(doelgroepVoorLeerplan(undefined)).toBeUndefined();
  });
});

describe('teksten', () => {
  it('jaarTekst: 1ste … 7de jaar', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(jaarTekst)).toEqual([
      '1ste jaar', '2de jaar', '3de jaar', '4de jaar', '5de jaar', '6de jaar', '7de jaar',
    ]);
    expect(jaarTekst(0)).toBe('');
    expect(jaarTekst(2.5)).toBe('');
    expect(jaarTekst(Number.NaN)).toBe('');
  });

  it('graadTekst: 1ste, 2de, 3de graad', () => {
    expect(graadTekst(1)).toBe('1ste graad');
    expect(graadTekst(2)).toBe('2de graad');
    expect(graadTekst(3)).toBe('3de graad');
    expect(graadTekst(4 as 1)).toBe('');
  });

  it('doelgroepTekst: met vak en jaar, zonder vak, zonder jaar', () => {
    const d = sanitizeDoelgroep({ groep: 'G-0193', titel: 'Natuurwetenschappen', graad: 2, jaar: 4, vak: 'Biologie' })!;
    expect(doelgroepTekst(d)).toBe('Biologie · Natuurwetenschappen · 4de jaar');
    expect(doelgroepTekst(d, { zonderVak: true })).toBe('Natuurwetenschappen · 4de jaar');
    expect(doelgroepTekst({ ...d, jaar: undefined, vak: undefined })).toBe('Natuurwetenschappen · 2de graad');
    expect(doelgroepTekst({ groep: 'G-0200', titel: 'Wetenschappen-wiskunde', graad: 3, jaar: 7, soort: 'so' }))
      .toBe('Wetenschappen-wiskunde · 7de jaar');
  });

  it('doelgroepTekst: in de 1ste graad alleen de titel (die noemt het leerjaar al)', () => {
    expect(doelgroepTekst({ groep: 'G-0311', titel: 'Tweede leerjaar A: Stem-wetenschappen', graad: 1, soort: 'so' }))
      .toBe('Tweede leerjaar A: Stem-wetenschappen');
    expect(doelgroepTekst({ groep: 'G-0307', titel: 'Eerste leerjaar A', graad: 1, jaar: 1, soort: 'so', vak: 'Nederlands' }))
      .toBe('Nederlands · Eerste leerjaar A');
  });

  it('doelgroepTekst: buitengewoon onderwijs', () => {
    expect(doelgroepTekst({ groep: 'G-0193', titel: 'Natuurwetenschappen', graad: 2, soort: 'buso' }))
      .toBe('Natuurwetenschappen · 2de graad · buitengewoon (OV4)');
    expect(doelgroepTekst({ groep: 'G-0009', titel: 'Opleidingsvorm 3', soort: 'buso' })).toBe('Opleidingsvorm 3 · buitengewoon');
  });

  it('doelgroepTekst: zonder graad (OKAN) alleen de titel; ongeldig of ongesaneerd gaat eerst door de sanering', () => {
    expect(doelgroepTekst({ groep: 'G-0400', titel: 'Onthaaljaar', soort: 'so' })).toBe('Onthaaljaar');
    expect(doelgroepTekst(undefined as unknown as Doelgroep)).toBe('');
    expect(doelgroepTekst({ groep: 'rommel' } as unknown as Doelgroep)).toBe('');
    expect(doelgroepTekst({ groep: 'G-0193', titel: ' Natuur\nwetenschappen ', graad: 2, jaar: 9, soort: 'so' } as Doelgroep))
      .toBe('Natuur wetenschappen · 2de graad');
  });

  it('zelfdeRichting: zelfde groep en soort', () => {
    const a = sanitizeDoelgroep({ groep: 'G-0193', titel: 'A', graad: 2, jaar: 3, vak: 'Biologie' });
    const b = sanitizeDoelgroep({ groep: 'G-0193', titel: 'Andere titel', graad: 2, jaar: 4 });
    expect(zelfdeRichting(a, b)).toBe(true);
    expect(zelfdeRichting(a, { ...b!, soort: 'buso' })).toBe(false);
    expect(zelfdeRichting(a, { ...b!, groep: 'G-0194' })).toBe(false);
    expect(zelfdeRichting(a, undefined)).toBe(false);
    expect(zelfdeRichting(undefined, undefined)).toBe(false);
    expect(zelfdeRichting({ groep: 'fout' } as Doelgroep, { groep: 'fout' } as Doelgroep)).toBe(false);
  });
});

// ── Grens: de overdracht tussen pagina's (handoff.ts, sessionStorage) ───────

describe('overdracht (peekHandoff / takeHandoff) saneert de doelgroep', () => {
  function geheugen(): Storage {
    const data = new Map<string, string>();
    return {
      get length() { return data.size; },
      key: (i: number) => [...data.keys()][i] ?? null,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => { data.set(k, String(v)); },
      removeItem: (k: string) => { data.delete(k); },
      clear: () => data.clear(),
    } as Storage;
  }
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', geheugen());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const DG: Doelgroep = { groep: 'G-0193', titel: 'Natuurwetenschappen', graad: 2, jaar: 4, soort: 'so', vak: 'Biologie' };

  it('een geldige doelgroep komt gesaneerd terug, samen met de rest', () => {
    expect(setHandoff({ source: '', title: 'Biologie 4', curriculumId: 'lp-1', goalCodes: ['BIO 1'], doelgroep: DG })).toBe(true);
    const h = peekHandoff()!;
    expect(h.doelgroep).toStrictEqual(DG);
    expect(h).toMatchObject({ source: '', title: 'Biologie 4', curriculumId: 'lp-1', goalCodes: ['BIO 1'] });
    expect(takeHandoff()?.doelgroep).toStrictEqual(DG);
    expect(peekHandoff()).toBeNull();
  });

  it('een geknoeide doelgroep wordt gesaneerd, een ongeldige valt weg (geen sleutel)', () => {
    const geknoeid = JSON.stringify({ source: 'tekst', doelgroep: { ...DG, jaar: 9, titel: ' Natuur\nwetenschappen ', extra: true } })
      .replace('"extra":true', '"extra":true,"__proto__":{"x":1}');
    expect(geknoeid).toContain('"__proto__"');
    sessionStorage.setItem('wf.handoff.v1', geknoeid);
    const dg = peekHandoff()?.doelgroep;
    expect(dg).toStrictEqual({ groep: 'G-0193', titel: 'Natuur wetenschappen', graad: 2, soort: 'so', vak: 'Biologie' });
    expect(Object.getPrototypeOf(dg)).toBe(Object.prototype);
    for (const doelgroep of [{ groep: 'G-1' }, 'G-0193', null, [DG]]) {
      sessionStorage.setItem('wf.handoff.v1', JSON.stringify({ source: 'tekst', doelgroep }));
      const h = peekHandoff()!;
      expect(h.source).toBe('tekst');
      expect(Object.keys(h), JSON.stringify(doelgroep)).not.toContain('doelgroep');
    }
  });

  it('zonder doelgroep blijft de overdracht zoals vroeger', () => {
    setHandoff({ source: 'bron', origin: 'hoofdstuk-3.docx' });
    const h = peekHandoff()!;
    expect(Object.keys(h).sort()).toEqual(['at', 'origin', 'source']);
    sessionStorage.setItem('wf.handoff.v1', '{"geen":"bron"}');
    expect(peekHandoff()).toBeNull();
  });
});

describe('doelgroep.ts zelf', () => {
  it('heeft geen imports (puur, nergens van afhankelijk)', () => {
    const bron = readFileSync(new URL('./doelgroep.ts', import.meta.url), 'utf8');
    expect(bron).not.toMatch(/^\s*import\b/m);
    expect(bron).not.toMatch(/\bimport\s*\(/);
    expect(bron).not.toMatch(/\brequire\s*\(/);
  });
});
