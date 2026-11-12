// De adressen van het deel basisonderwijs: elk scherm wordt gelezen, en basisRoute(basisPad(x)) geeft x terug.

import { describe, expect, it } from 'vitest';
import type { GoVak } from './go/types';
import { basisPad, basisRoute, doelPad, EIND_SLUG, SOORT_SLUG, vakSlug, vakVanSlug, type BasisScherm } from './basisRoutes';
import { PAKKET_BEGINSCHERMEN } from './pakketten';
import { INVOERINGSKALENDER, LEERJAREN_BASIS, WERKT_NAAR, type Eindmoment, type SoortBasis } from './kalender';

const SOORTEN: SoortBasis[] = ['bao', 'bubao'];
const EINDEN: Eindmoment[] = ['K3', 'L4', 'L6'];
const VAKKEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Splitst een pad zoals de router het doet: het stuk achter '/basis' en de zoekopdracht. */
function lees(pad: string): BasisScherm {
  const [pad0, zoek = ''] = pad.split('?');
  return basisRoute(pad0.replace(/^\/basis\/?/, ''), zoek ? `?${zoek}` : '');
}

const GO_VAKKEN: GoVak[] = ['AA', 'BU', 'FR', 'GE', 'IT', 'LL', 'LO', 'MV', 'NL', 'SV', 'WI', 'WT'];

/** Alle schermen van het GO!: het overzicht, de lesplannen, de lessenlijnen en de leerplandoelen. */
function goSchermen(): BasisScherm[] {
  const uit: BasisScherm[] = [{ s: 'go' }, { s: 'lesplannen' }, { s: 'lesplannen', alle: true }];
  for (const leerjaar of LEERJAREN_BASIS) uit.push({ s: 'lesplannen', leerjaar });
  for (const vak of GO_VAKKEN) {
    uit.push({ s: 'lesplannen', vak }, { s: 'lesplannen', vak, leerjaar: 'K1' });
    uit.push({ s: 'lessenlijn', vak, lijn: 'biologie-van-organismen' }, { s: 'lessenlijn', vak, lijn: 'ict-2', leerjaar: 'L6' });
    uit.push({ s: 'leerplandoelen', vak }, { s: 'leerplandoelen', vak, leerjaar: 'K1' });
    uit.push({ s: 'lesplannen', vak, alle: true }, { s: 'leerplandoelen', vak, alle: true });
    uit.push({ s: 'leerplandoelen', vak, zonder: true }, { s: 'leerplandoelen', vak, leerjaar: 'L3', zonder: true });
    uit.push({ s: 'leerplandoelen', vak, alle: true, rubriek: `${vak}-r012`, zonder: true });
    uit.push({ s: 'leerplandoelen', vak, rubriek: `${vak}-r012` }, { s: 'leerplandoelen', vak, leerjaar: 'L3', rubriek: `${vak}-r1234` });
    for (const code of ['001', '086', '998']) uit.push({ s: 'leerplandoel', code: `${vak}.${code}` });
  }
  for (const code of ['LP0001', 'LP0014a', 'LP0014b', 'LP0065', 'LP9999z']) {
    uit.push({ s: 'lesplan', code });
    for (const stap of [1, 2, 3, 4, 5, 6]) uit.push({ s: 'lesplan', code, stap });
  }
  return uit;
}

/** De drie schermen van het pakket Lichtkamer, met en zonder hun zoekparameters. */
function pakketSchermen(): BasisScherm[] {
  const uit: BasisScherm[] = [{ s: 'pakket', pakket: 'lichtkamer', eind: 'L4' }];
  for (const leerjaar of ['L3', 'L4'] as const) uit.push({ s: 'pakket', pakket: 'lichtkamer', eind: 'L4', leerjaar });
  for (const s of ['bord', 'oefen'] as const) {
    uit.push({ s, pakket: 'lichtkamer', eind: 'L4' });
    for (const scherm of PAKKET_BEGINSCHERMEN) uit.push({ s, pakket: 'lichtkamer', eind: 'L4', scherm });
  }
  return uit;
}

/** Alle schermen die de app kan bouwen. */
function alleSchermen(): BasisScherm[] {
  const uit: BasisScherm[] = [{ s: 'start' }, { s: 'kies' }, { s: 'onbekend' }];
  for (const soort of SOORTEN) {
    for (const leerjaar of LEERJAREN_BASIS) uit.push({ s: 'leerjaar', soort, leerjaar });
    for (const eind of EINDEN) {
      uit.push({ s: 'moment', soort, eind });
      for (const vak of VAKKEN) {
        uit.push({ s: 'vak', soort, eind, vak });
        uit.push({ s: 'vak', soort, eind, vak, onderwerp: '3.5' });
        for (const leerjaar of LEERJAREN_BASIS.filter((l) => WERKT_NAAR[l] === eind)) {
          uit.push({ s: 'vak', soort, eind, vak, leerjaar });
          uit.push({ s: 'vak', soort, eind, vak, leerjaar, onderwerp: '10.12' });
        }
      }
    }
    uit.push({ s: 'leerlijnen', soort });
    for (const leerjaar of LEERJAREN_BASIS) uit.push({ s: 'leerlijnen', soort, leerjaar });
    for (const vak of VAKKEN) {
      uit.push({ s: 'leerlijn', soort, vak });
      uit.push({ s: 'leerlijn', soort, vak, onderwerp: '3.5' });
      uit.push({ s: 'leerlijn', soort, vak, leerjaar: 'L3' });
      uit.push({ s: 'leerlijn', soort, vak, leerjaar: 'K2', onderwerp: '3.5' });
    }
    for (const vraag of ['', 'schaduw', 'licht en schaduw', 'W&T', '92767', '3.5.4', 'a+b=c?', 'één / twee #3 %', 'breuken 6de leerjaar']) {
      uit.push({ s: 'zoek', soort, vraag, bereik: 'alles' });
      for (const leerjaar of LEERJAREN_BASIS) {
        uit.push({ s: 'zoek', soort, vraag, leerjaar, bereik: 'leerjaar' });
        uit.push({ s: 'zoek', soort, vraag, leerjaar, bereik: 'alles' });
      }
    }
  }
  uit.push({ s: 'doel', setId: 'ODS_3408', doelId: '92767' }, { s: 'doel', setId: 'ODS_9999', doelId: '1' });
  uit.push(...goSchermen());
  uit.push(...pakketSchermen());
  return uit;
}

describe('basisRoute: elk scherm wordt gelezen', () => {
  it('start en kies', () => {
    expect(basisRoute('', '')).toEqual({ s: 'start' });
    expect(basisRoute('/', '')).toEqual({ s: 'start' });
    expect(basisRoute('kies', '')).toEqual({ s: 'kies' });
    expect(basisRoute('kies/', '')).toEqual({ s: 'kies' });
  });

  it('leerjaar: soort en leerjaar, hoofdletters maken voor het leerjaar niet uit', () => {
    expect(basisRoute('leerjaar/gewoon/L3', '')).toEqual({ s: 'leerjaar', soort: 'bao', leerjaar: 'L3' });
    expect(basisRoute('leerjaar/gewoon/l3', '')).toEqual({ s: 'leerjaar', soort: 'bao', leerjaar: 'L3' });
    expect(basisRoute('leerjaar/buitengewoon/k2', '')).toEqual({ s: 'leerjaar', soort: 'bubao', leerjaar: 'K2' });
  });

  it('moment', () => {
    expect(basisRoute('moment/gewoon/einde-4de', '')).toEqual({ s: 'moment', soort: 'bao', eind: 'L4' });
    expect(basisRoute('moment/buitengewoon/einde-kleuter', '')).toEqual({ s: 'moment', soort: 'bubao', eind: 'K3' });
    expect(basisRoute('moment/gewoon/einde-6de', '')).toEqual({ s: 'moment', soort: 'bao', eind: 'L6' });
  });

  it('vak met leerjaar en onderwerp', () => {
    expect(basisRoute('vak/gewoon/einde-4de/wetenschap-en-techniek', '?leerjaar=L3&onderwerp=3.5')).toEqual({
      s: 'vak', soort: 'bao', eind: 'L4', vak: 3, leerjaar: 'L3', onderwerp: '3.5',
    });
    expect(basisRoute('vak/gewoon/einde-kleuter/wiskunde', '')).toEqual({ s: 'vak', soort: 'bao', eind: 'K3', vak: 2 });
  });

  it('leerlijnen en leerlijn', () => {
    expect(basisRoute('leerlijn/gewoon', '?leerjaar=L3')).toEqual({ s: 'leerlijnen', soort: 'bao', leerjaar: 'L3' });
    expect(basisRoute('leerlijn/buitengewoon', '')).toEqual({ s: 'leerlijnen', soort: 'bubao' });
    expect(basisRoute('leerlijn/gewoon/wetenschap-en-techniek', '?leerjaar=l3&onderwerp=3.5')).toEqual({
      s: 'leerlijn', soort: 'bao', vak: 3, leerjaar: 'L3', onderwerp: '3.5',
    });
  });

  it('doel', () => {
    expect(basisRoute('doel/ODS_3408/92767', '')).toEqual({ s: 'doel', setId: 'ODS_3408', doelId: '92767' });
  });

  it('zoek: de standaarden zijn gewoon onderwijs en bereik "alles" zonder leerjaar', () => {
    expect(basisRoute('zoek', '?q=schaduw')).toEqual({ s: 'zoek', soort: 'bao', vraag: 'schaduw', bereik: 'alles' });
    expect(basisRoute('zoek', '')).toEqual({ s: 'zoek', soort: 'bao', vraag: '', bereik: 'alles' });
    expect(basisRoute('zoek', '?q=schaduw&soort=buitengewoon&leerjaar=L3')).toEqual({
      s: 'zoek', soort: 'bubao', vraag: 'schaduw', leerjaar: 'L3', bereik: 'leerjaar',
    });
    expect(basisRoute('zoek', '?q=a&leerjaar=L3&bereik=alles')).toMatchObject({ leerjaar: 'L3', bereik: 'alles' });
    expect(basisRoute('zoek', '?q=a&bereik=leerjaar')).toMatchObject({ bereik: 'alles' }); // zonder leerjaar kan het niet
    expect(basisRoute('zoek', 'q=a%20b+c')).toMatchObject({ vraag: 'a b c' }); // ook zonder vraagteken vooraan
  });
});

describe('basisRoute: wat wegvalt of onbekend is', () => {
  it('?leerjaar bij een vak valt weg als het niet naar het eindmoment werkt', () => {
    expect(basisRoute('vak/gewoon/einde-4de/nederlands', '?leerjaar=L5')).toEqual({ s: 'vak', soort: 'bao', eind: 'L4', vak: 1 });
    expect(basisRoute('vak/gewoon/einde-6de/nederlands', '?leerjaar=L5')).toMatchObject({ leerjaar: 'L5' });
    expect(basisRoute('vak/gewoon/einde-kleuter/nederlands', '?leerjaar=L1')).toEqual({ s: 'vak', soort: 'bao', eind: 'K3', vak: 1 });
  });

  it('een ongeldig leerjaar of onderwerp valt weg', () => {
    expect(basisRoute('leerlijn/gewoon', '?leerjaar=L7')).toEqual({ s: 'leerlijnen', soort: 'bao' });
    expect(basisRoute('leerlijn/gewoon/ict', '?onderwerp=3')).toEqual({ s: 'leerlijn', soort: 'bao', vak: 8 });
    expect(basisRoute('leerlijn/gewoon/ict', '?onderwerp=3.5.4')).toEqual({ s: 'leerlijn', soort: 'bao', vak: 8 });
    expect(basisRoute('leerlijn/gewoon/ict', '?onderwerp=100.1')).toEqual({ s: 'leerlijn', soort: 'bao', vak: 8 });
    expect(basisRoute('leerlijn/gewoon/ict', '?onderwerp=a.b')).toEqual({ s: 'leerlijn', soort: 'bao', vak: 8 });
    expect(basisRoute('leerlijn/gewoon', '?klas=L3')).toEqual({ s: 'leerlijnen', soort: 'bao' }); // 'klas' is geen woord van dit deel
  });

  it('de drie schermen van het pakket Lichtkamer (LK-8)', () => {
    expect(basisRoute('pakket/lichtkamer/einde-4de', '')).toEqual({ s: 'pakket', pakket: 'lichtkamer', eind: 'L4' });
    expect(basisRoute('pakket/lichtkamer/einde-4de', '?leerjaar=L3')).toEqual({ s: 'pakket', pakket: 'lichtkamer', eind: 'L4', leerjaar: 'L3' });
    expect(basisRoute('pakket/lichtkamer/einde-4de', '?leerjaar=l4')).toEqual({ s: 'pakket', pakket: 'lichtkamer', eind: 'L4', leerjaar: 'L4' });
    expect(basisRoute('bord/lichtkamer/einde-4de', '')).toEqual({ s: 'bord', pakket: 'lichtkamer', eind: 'L4' });
    expect(basisRoute('oefen/lichtkamer/einde-4de', '?scherm=onderzoek-schaduw')).toEqual({ s: 'oefen', pakket: 'lichtkamer', eind: 'L4', scherm: 'onderzoek-schaduw' });
    expect(basisPad({ s: 'pakket', pakket: 'lichtkamer', eind: 'L4' })).toBe('/basis/pakket/lichtkamer/einde-4de');
    expect(basisPad({ s: 'pakket', pakket: 'lichtkamer', eind: 'L4', leerjaar: 'L3' })).toBe('/basis/pakket/lichtkamer/einde-4de?leerjaar=L3');
    expect(basisPad({ s: 'bord', pakket: 'lichtkamer', eind: 'L4' })).toBe('/basis/bord/lichtkamer/einde-4de');
    expect(basisPad({ s: 'oefen', pakket: 'lichtkamer', eind: 'L4' })).toBe('/basis/oefen/lichtkamer/einde-4de');
  });

  it('?meet (de meetstand van de kijkdoos) en andere vreemde zoekparameters storen de padlezer niet', () => {
    expect(basisRoute('oefen/lichtkamer/einde-4de', '?meet')).toEqual({ s: 'oefen', pakket: 'lichtkamer', eind: 'L4' });
    expect(basisRoute('bord/lichtkamer/einde-4de', '?meet=1&scherm=check')).toEqual({ s: 'bord', pakket: 'lichtkamer', eind: 'L4', scherm: 'check' });
    expect(basisRoute('pakket/lichtkamer/einde-4de', '?meet&leerjaar=L3&x=1')).toEqual({ s: 'pakket', pakket: 'lichtkamer', eind: 'L4', leerjaar: 'L3' });
  });

  it('een ongeldig leerjaar of beginscherm valt weg, een leerjaar van een ander pakketmoment ook', () => {
    expect(basisRoute('pakket/lichtkamer/einde-4de', '?leerjaar=L5')).toEqual({ s: 'pakket', pakket: 'lichtkamer', eind: 'L4' });
    expect(basisRoute('pakket/lichtkamer/einde-4de', '?leerjaar=alle')).toEqual({ s: 'pakket', pakket: 'lichtkamer', eind: 'L4' });
    expect(basisRoute('oefen/lichtkamer/einde-4de', '?scherm=xyz')).toEqual({ s: 'oefen', pakket: 'lichtkamer', eind: 'L4' });
    expect(basisRoute('bord/lichtkamer/einde-4de', '?scherm=')).toEqual({ s: 'bord', pakket: 'lichtkamer', eind: 'L4' });
  });

  it('onzin geeft "onbekend", zonder fout', () => {
    const onzin: [string, string][] = [
      ['xyz', ''], ['kies/extra', ''], ['leerjaar', ''], ['leerjaar/gewoon', ''], ['leerjaar/gewoon/L7', ''], ['leerjaar/so/L3', ''],
      ['leerjaar/gewoon/L3/extra', ''], ['klas/gewoon/L3', ''], ['moment/gewoon/einde-3de', ''], ['moment/gewoon', ''],
      ['vak/gewoon/einde-4de/zang', ''], ['vak/gewoon/einde-4de', ''], ['leerlijn', ''], ['leerlijn/gewoon/zang', ''],
      ['leerlijn/gewoon/ict/extra', ''], ['doel', ''], ['doel/ODS_3408', ''], ['doel/3408/92767', ''], ['doel/ODS_3408/abc', ''],
      ['doel/ODS_3408/92767/extra', ''], ['doel/ods_3408/92767', ''], ['zoek/extra', ''], ['zoek', '?soort=so'], ['%E0%A4%A', ''],
      ['a/b/c/d/e/f', ''], ['..', ''], ['onbekend', ''], ['proef', ''], ['proef/kijkdoos', ''], ['proef/kijkdoos', '?meet'],
      ['pakket', ''], ['pakket/lichtkamer', ''], ['pakket/lichtkamer/einde-6de', ''], ['pakket/lichtkamer/einde-kleuter', ''],
      ['pakket/rekenen/einde-4de', ''], ['pakket/Lichtkamer/einde-4de', ''], ['pakket/lichtkamer/einde-4de/extra', ''],
      ['bord', ''], ['bord/lichtkamer', ''], ['bord/lichtkamer/einde-3de', ''], ['bord/lichtkamer/einde-4de/x', ''],
      ['oefen', ''], ['oefen/lichtkamer', ''], ['oefen/onbekend/einde-4de', ''], ['oefen/lichtkamer/einde-4de/x', ''],
    ];
    for (const [splat, zoek] of onzin) expect(basisRoute(splat, zoek), `${splat}${zoek}`).toEqual({ s: 'onbekend' });
  });

  it('gooit nooit een fout, ook niet bij vreemde invoer', () => {
    const vreemd = [undefined, null, 5, {}, [], '\u0000', '%', '%%%', 'a'.repeat(5000)] as unknown[];
    for (const v of vreemd) {
      expect(() => basisRoute(v as string, v as string)).not.toThrow();
      expect(basisRoute(v as string, '')).toBeTruthy();
    }
    expect(basisRoute('', undefined as unknown as string)).toEqual({ s: 'start' });
    expect(basisRoute('zoek', '?q=%E0%A4%A')).toMatchObject({ s: 'zoek' });
  });

  it('een zoekvraag is hoogstens 200 tekens', () => {
    const lang = basisRoute('zoek', `?q=${'a'.repeat(500)}`);
    expect(lang).toMatchObject({ s: 'zoek' });
    expect((lang as { vraag: string }).vraag).toHaveLength(200);
  });
});

describe('de rondgang: basisRoute(basisPad(x)) geeft x terug', () => {
  const schermen = alleSchermen();

  it('voor alle combinaties', () => {
    expect(schermen.length).toBeGreaterThan(900);
    for (const x of schermen) {
      const pad = basisPad(x);
      expect(pad.startsWith('/basis'), pad).toBe(true);
      expect(lees(pad), pad).toEqual(x);
    }
  });

  it('elk pad is uniek voor zijn scherm', () => {
    const paden = new Map<string, BasisScherm>();
    for (const x of schermen) {
      const pad = basisPad(x);
      expect(paden.has(pad), pad).toBe(false);
      paden.set(pad, x);
    }
  });

  it('bouwt de paden uit de afspraak', () => {
    expect(basisPad({ s: 'start' })).toBe('/basis');
    expect(basisPad({ s: 'kies' })).toBe('/basis/kies');
    expect(basisPad({ s: 'leerjaar', soort: 'bao', leerjaar: 'L3' })).toBe('/basis/leerjaar/gewoon/L3');
    expect(basisPad({ s: 'moment', soort: 'bubao', eind: 'K3' })).toBe('/basis/moment/buitengewoon/einde-kleuter');
    expect(basisPad({ s: 'vak', soort: 'bao', eind: 'L4', vak: 3, leerjaar: 'L3' })).toBe(
      '/basis/vak/gewoon/einde-4de/wetenschap-en-techniek?leerjaar=L3',
    );
    expect(basisPad({ s: 'leerlijn', soort: 'bao', vak: 3, leerjaar: 'L3', onderwerp: '3.5' })).toBe(
      '/basis/leerlijn/gewoon/wetenschap-en-techniek?leerjaar=L3&onderwerp=3.5',
    );
    expect(basisPad({ s: 'leerlijnen', soort: 'bao' })).toBe('/basis/leerlijn/gewoon');
    expect(basisPad({ s: 'zoek', soort: 'bao', vraag: 'licht en schaduw', leerjaar: 'L3', bereik: 'leerjaar' })).toBe(
      '/basis/zoek?q=licht%20en%20schaduw&soort=gewoon&leerjaar=L3&bereik=leerjaar',
    );
  });

  it('laat een leerjaar weg dat niet naar het eindmoment van een vakpagina werkt, en een onbekend vak geeft het begin', () => {
    expect(basisPad({ s: 'vak', soort: 'bao', eind: 'L4', vak: 1, leerjaar: 'L5' })).toBe('/basis/vak/gewoon/einde-4de/nederlands');
    expect(basisPad({ s: 'vak', soort: 'bao', eind: 'L4', vak: 11 })).toBe('/basis');
    expect(basisPad({ s: 'leerlijn', soort: 'bao', vak: 0 })).toBe('/basis');
    expect(basisPad({ s: 'zoek', soort: 'bao', vraag: 'x', bereik: 'leerjaar' })).toContain('bereik=alles');
  });

  it('de soort- en eindslugs zijn vast', () => {
    expect(SOORT_SLUG).toEqual({ bao: 'gewoon', bubao: 'buitengewoon' });
    expect(EIND_SLUG).toEqual({ K3: 'einde-kleuter', L4: 'einde-4de', L6: 'einde-6de' });
  });
});

describe('doelPad', () => {
  it('bouwt het vaste adres van een doel', () => {
    expect(doelPad({ set: 'ODS_3408', id: '92767' })).toBe('/basis/doel/ODS_3408/92767');
    expect(lees(doelPad({ set: 'ODS_3408', id: '92767' }))).toEqual({ s: 'doel', setId: 'ODS_3408', doelId: '92767' });
  });
});

describe('de tien vaste vakslugs (H9)', () => {
  const VERWACHT = [
    'nederlands', 'wiskunde', 'wetenschap-en-techniek', 'aardrijkskunde', 'geschiedenis',
    'muzische-vorming', 'lichamelijke-opvoeding', 'ict', 'attitudes', 'frans',
  ];

  it('legt de tien slugs vast, op vaknummer 1 tot 10', () => {
    expect(VAKKEN.map((nr) => vakSlug(nr))).toEqual(VERWACHT);
    expect(new Set(VERWACHT).size).toBe(10);
  });

  it('vakVanSlug is het omgekeerde', () => {
    VERWACHT.forEach((slug, i) => expect(vakVanSlug(slug)).toBe(i + 1));
    expect(vakVanSlug('zang')).toBeUndefined();
    expect(vakVanSlug('')).toBeUndefined();
    expect(vakVanSlug('Nederlands')).toBeUndefined();
  });

  it('geeft niets voor een nummer buiten 1 tot 10', () => {
    for (const nr of [0, -1, 11, 1.5, NaN, Infinity]) expect(vakSlug(nr), String(nr)).toBeUndefined();
  });

  it('de tabel hangt niet van de invoeringskalender af, maar de tien vakken van de kalender hebben elk een slug', () => {
    expect(INVOERINGSKALENDER.vakken.map((v) => v.nr).sort((a, b) => a - b)).toEqual(VAKKEN);
    for (const v of INVOERINGSKALENDER.vakken) expect(vakSlug(v.nr)).toBeDefined();
  });
});


describe('de schermen van het GO!', () => {
  it('go en lesplannen', () => {
    expect(basisRoute('go', '')).toEqual({ s: 'go' });
    expect(basisRoute('go/', '')).toEqual({ s: 'go' });
    expect(basisRoute('lesplannen', '')).toEqual({ s: 'lesplannen' });
    expect(basisRoute('lesplannen', '?leerjaar=k1&vak=wt')).toEqual({ s: 'lesplannen', leerjaar: 'K1', vak: 'WT' });
    // een leerjaar mag hier elk leerjaar zijn: de leeftijdsgroep volgt uit de leesbril, niet uit een eindmoment
    expect(basisRoute('lesplannen', '?leerjaar=L6')).toEqual({ s: 'lesplannen', leerjaar: 'L6' });
  });

  it('lesplan: de code wordt rechtgezet en ?stap moet 1 tot 6 zijn', () => {
    expect(basisRoute('lesplan/LP0065', '')).toEqual({ s: 'lesplan', code: 'LP0065' });
    expect(basisRoute('lesplan/lp0065', '?stap=3')).toEqual({ s: 'lesplan', code: 'LP0065', stap: 3 });
    expect(basisRoute('lesplan/LP0014A', '')).toEqual({ s: 'lesplan', code: 'LP0014a' });
    expect(basisRoute('lesplan/LP0014a', '?stap=0')).toEqual({ s: 'lesplan', code: 'LP0014a' });
    expect(basisRoute('lesplan/LP0014a', '?stap=7')).toEqual({ s: 'lesplan', code: 'LP0014a' });
    expect(basisRoute('lesplan/LP0014a', '?stap=2.5')).toEqual({ s: 'lesplan', code: 'LP0014a' });
    expect(basisRoute('lesplan/LP0014a', '?stap=drie')).toEqual({ s: 'lesplan', code: 'LP0014a' });
  });

  it('lessenlijn: vak, adresdeel en leerjaar', () => {
    expect(basisRoute('lessenlijn/wt/biologie-van-organismen', '?leerjaar=K1')).toEqual({
      s: 'lessenlijn', vak: 'WT', lijn: 'biologie-van-organismen', leerjaar: 'K1',
    });
    expect(basisRoute('lessenlijn/WT/Biologie-van-organismen', '')).toEqual({ s: 'lessenlijn', vak: 'WT', lijn: 'biologie-van-organismen' });
  });

  it('leerplandoelen: vak, leerjaar en rubriek (die bij het vak moet horen)', () => {
    expect(basisRoute('leerplandoelen/wt', '?leerjaar=K1&rubriek=WT-r012')).toEqual({
      s: 'leerplandoelen', vak: 'WT', leerjaar: 'K1', rubriek: 'WT-r012',
    });
    expect(basisRoute('leerplandoelen/wt', '?rubriek=wt-r012')).toMatchObject({ rubriek: 'WT-r012' });
    expect(basisRoute('leerplandoelen/wt', '?rubriek=AA-r012')).toEqual({ s: 'leerplandoelen', vak: 'WT' });
    expect(basisRoute('leerplandoelen/wt', '?rubriek=r012')).toEqual({ s: 'leerplandoelen', vak: 'WT' });
    expect(basisRoute('leerplandoelen/wt', '?leerjaar=L7')).toEqual({ s: 'leerplandoelen', vak: 'WT' });
  });

  it('leerplandoel: de code wordt rechtgezet', () => {
    expect(basisRoute('leerplandoel/WT.086', '')).toEqual({ s: 'leerplandoel', code: 'WT.086' });
    expect(basisRoute('leerplandoel/wt.086', '')).toEqual({ s: 'leerplandoel', code: 'WT.086' });
    expect(basisRoute('leerplandoel/WI.998', '')).toEqual({ s: 'leerplandoel', code: 'WI.998' });
  });

  it('onzin geeft "onbekend", zonder fout', () => {
    const onzin: [string, string][] = [
      ['go/extra', ''], ['lesplannen/extra', ''], ['lesplan', ''], ['lesplan/LP65', ''], ['lesplan/LP0065x1', ''], ['lesplan/LP0065/extra', ''],
      ['lesplan/LP0065aa', ''], ['lesplan/65', ''], ['lessenlijn', ''], ['lessenlijn/wt', ''], ['lessenlijn/xx/biologie', ''],
      ['lessenlijn/wt/Biologie van organismen', ''], ['lessenlijn/wt/-biologie', ''], ['lessenlijn/wt/biologie--van', ''],
      ['lessenlijn/wt/biologie/extra', ''], [`lessenlijn/wt/${'a'.repeat(81)}`, ''], ['leerplandoelen', ''], ['leerplandoelen/xx', ''],
      ['leerplandoelen/wt/extra', ''], ['leerplandoelen/1', ''], ['leerplandoel', ''], ['leerplandoel/WT', ''], ['leerplandoel/WT.86', ''],
      ['leerplandoel/XX.086', ''], ['leerplandoel/WT-086', ''], ['leerplandoel/WT.086/extra', ''], ['leerplandoel/WT.086x', ''],
    ];
    for (const [splat, zoek] of onzin) expect(basisRoute(splat, zoek), `${splat}${zoek}`).toEqual({ s: 'onbekend' });
  });

  it('bouwt de paden uit de afspraak', () => {
    expect(basisPad({ s: 'go' })).toBe('/basis/go');
    expect(basisPad({ s: 'lesplannen' })).toBe('/basis/lesplannen');
    expect(basisPad({ s: 'lesplannen', leerjaar: 'K1', vak: 'WT' })).toBe('/basis/lesplannen?leerjaar=K1&vak=wt');
    expect(basisPad({ s: 'lesplan', code: 'LP0065', stap: 3 })).toBe('/basis/lesplan/LP0065?stap=3');
    expect(basisPad({ s: 'lessenlijn', vak: 'WT', lijn: 'biologie-van-organismen', leerjaar: 'K1' })).toBe(
      '/basis/lessenlijn/wt/biologie-van-organismen?leerjaar=K1',
    );
    expect(basisPad({ s: 'leerplandoelen', vak: 'WT', leerjaar: 'K1', rubriek: 'WT-r012' })).toBe('/basis/leerplandoelen/wt?leerjaar=K1&rubriek=WT-r012');
    expect(basisPad({ s: 'leerplandoel', code: 'WT.086' })).toBe('/basis/leerplandoel/WT.086');
  });

  it('de nieuwe adressen botsen niet met de bestaande leerlijn- en doeladressen', () => {
    expect(basisRoute('leerlijn/gewoon/wetenschap-en-techniek', '')).toMatchObject({ s: 'leerlijn' });
    expect(basisRoute('doel/ODS_3410/92609', '')).toMatchObject({ s: 'doel' });
    expect(basisRoute('lessenlijn/gewoon/ict', '')).toEqual({ s: 'onbekend' });
  });
});

describe('basisRoute: Alle leeftijden en zonder minimumdoel staan in het adres', () => {
  it('leerjaar=alle en zonder=1 worden gelezen en teruggeschreven', () => {
    expect(basisPad({ s: 'leerplandoelen', vak: 'WI', alle: true, zonder: true })).toBe('/basis/leerplandoelen/wi?leerjaar=alle&zonder=1');
    expect(lees('/basis/leerplandoelen/wi?leerjaar=alle&zonder=1')).toEqual({ s: 'leerplandoelen', vak: 'WI', alle: true, zonder: true });
    expect(basisPad({ s: 'lesplannen', alle: true })).toBe('/basis/lesplannen?leerjaar=alle');
    expect(lees('/basis/lesplannen?leerjaar=alle')).toEqual({ s: 'lesplannen', alle: true });
  });
  it('een geldig leerjaar wint van alle', () => {
    expect(lees('/basis/lesplannen?leerjaar=K1&alle=1')).toEqual({ s: 'lesplannen', leerjaar: 'K1' });
    expect(basisPad({ s: 'lesplannen', leerjaar: 'L3', alle: true })).toBe('/basis/lesplannen?leerjaar=L3');
  });
  it('bestaande adressen zonder die parameters blijven gelijk', () => {
    expect(lees('/basis/leerplandoelen/wt')).toEqual({ s: 'leerplandoelen', vak: 'WT' });
    expect(lees('/basis/leerplandoelen/wt?leerjaar=K1')).toEqual({ s: 'leerplandoelen', vak: 'WT', leerjaar: 'K1' });
    expect(lees('/basis/leerplandoelen/wt?zonder=0')).toEqual({ s: 'leerplandoelen', vak: 'WT' });
  });
  it('leerjaar=alle valt bij andere schermen gewoon weg', () => {
    expect(lees('/basis/leerlijn/gewoon?leerjaar=alle')).toEqual({ s: 'leerlijnen', soort: 'bao' });
    expect(lees('/basis/lessenlijn/wt/biologie-van-organismen?leerjaar=alle')).toEqual({ s: 'lessenlijn', vak: 'WT', lijn: 'biologie-van-organismen' });
    expect(lees('/basis/zoek?q=a&leerjaar=alle')).toMatchObject({ s: 'zoek', bereik: 'alles' });
  });
});
