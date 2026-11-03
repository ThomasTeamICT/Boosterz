// De adressen van het deel basisonderwijs: elk scherm wordt gelezen, en basisRoute(basisPad(x)) geeft x terug.

import { describe, expect, it } from 'vitest';
import { basisPad, basisRoute, doelPad, EIND_SLUG, SOORT_SLUG, vakSlug, vakVanSlug, type BasisScherm } from './basisRoutes';
import { INVOERINGSKALENDER, LEERJAREN_BASIS, WERKT_NAAR, type Eindmoment, type SoortBasis } from './kalender';

const SOORTEN: SoortBasis[] = ['bao', 'bubao'];
const EINDEN: Eindmoment[] = ['K3', 'L4', 'L6'];
const VAKKEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Splitst een pad zoals de router het doet: het stuk achter '/basis' en de zoekopdracht. */
function lees(pad: string): BasisScherm {
  const [pad0, zoek = ''] = pad.split('?');
  return basisRoute(pad0.replace(/^\/basis\/?/, ''), zoek ? `?${zoek}` : '');
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

  it('onzin geeft "onbekend", zonder fout', () => {
    const onzin: [string, string][] = [
      ['xyz', ''], ['kies/extra', ''], ['leerjaar', ''], ['leerjaar/gewoon', ''], ['leerjaar/gewoon/L7', ''], ['leerjaar/so/L3', ''],
      ['leerjaar/gewoon/L3/extra', ''], ['klas/gewoon/L3', ''], ['moment/gewoon/einde-3de', ''], ['moment/gewoon', ''],
      ['vak/gewoon/einde-4de/zang', ''], ['vak/gewoon/einde-4de', ''], ['leerlijn', ''], ['leerlijn/gewoon/zang', ''],
      ['leerlijn/gewoon/ict/extra', ''], ['doel', ''], ['doel/ODS_3408', ''], ['doel/3408/92767', ''], ['doel/ODS_3408/abc', ''],
      ['doel/ODS_3408/92767/extra', ''], ['doel/ods_3408/92767', ''], ['zoek/extra', ''], ['zoek', '?soort=so'], ['%E0%A4%A', ''],
      ['a/b/c/d/e/f', ''], ['..', ''], ['onbekend', ''],
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
