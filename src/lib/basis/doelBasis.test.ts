// De doelen van het basisonderwijs als gegevens (src/lib/basis/doelBasis.ts), met zelfgemaakte setbestanden en koppen.
// De getallen op de echte gegevens (998 doelen, 48 onderwerpen, 124 rijen, ...) staan in basisIngang.echt.test.ts.

import { describe, expect, it } from 'vitest';
import type { Minimumdoel, MinimumdoelenIndexSet, MinimumdoelenSetBestand } from '../minimumdoelen';
import {
  codeVergelijk, doelenVanSet, leerlijnVanVak, rubrieken, samenvoegen, setsVanVak, setsVoorVak, telPerSoort, vakkenOpMoment,
  voegVolgordeSamen, zelfdeRubriek, type DoelBasis,
} from './doelBasis';
import type { Eindmoment } from './kalender';
import { basisSet } from './moment';

// ─── Hulp ───────────────────────────────────────────────────────────────────

const NIEUW = { versie: '2.0', geldigVan: '2025-09-01' };
const POP = 'Te bereiken minimumdoelen op populatieniveau';
const NASTREVEN = 'Na te streven minimumdoelen op populatieniveau';

function kop(id: string, naam: string, korteNaam: string, aantal: number): MinimumdoelenIndexSet {
  return { id, naam, korteNaam, aantal, sha256: 'x', opgehaald: '2026-11-01T00:00:00Z', bestand: `${id}.json`, geldigheid: 'Geldig', ...NIEUW };
}

const WT_K = kop('WT_K', `Kleuteronderwijs -  Wetenschap en techniek - ${NASTREVEN}`, 'Wetenschap en techniek', 5);
const WT_L4 = kop('WT_L4', `Lager Onderwijs 4de leerjaar -  Wetenschap en techniek - ${POP}`, 'Wetenschap en techniek', 7);
const WT_L6 = kop('WT_L6', `Lager Onderwijs 6de leerjaar -  Wetenschap en techniek - ${POP}`, 'Wetenschap en techniek', 7);
const NL_KP = kop('NL_KP', `Kleuteronderwijs -  Nederlands - ${POP}`, 'Nederlands', 7);
const NL_KN = kop('NL_KN', `Kleuteronderwijs -  Nederlands - ${NASTREVEN}`, 'Nederlands', 35);
const BU_WT_L4 = kop('BU_WT_L4', `Buitengewoon Lager Onderwijs 4de leerjaar -  Wetenschap en techniek - ${NASTREVEN}`, 'Wetenschap en techniek', 7);
const OUD = { ...kop('OUD', 'Lager Onderwijs - Leergebied - Frans - Eindtermen', 'Frans', 27), versie: '1.0' };
const LEEG = kop('LEEG', 'Buitengewoon Lager Onderwijs Type 3 - Leergebied - Alle leergebieden - Ontwikkelingsdoelen', 'Alle leergebieden', 1);
const SO = kop('SO', 'Secundair Onderwijs 1ste graad - Nederlands - Eindtermen', 'Nederlands', 3);
const INDEX = [WT_K, WT_L4, WT_L6, NL_KP, NL_KN, BU_WT_L4, OUD, LEEG, SO];

function doel(id: string, code: string, tekst: string, onderwerp: string, subthema?: string, rest: Partial<Minimumdoel> = {}, extra: Record<string, unknown> = {}): Minimumdoel {
  const titels: Record<string, unknown> = { '1': { titel: onderwerp } };
  if (subthema) titels['2'] = { titel: subthema };
  return { id, code, tekst, type: 'Te bereiken minimumdoelen op populatieniveau', extra: { titels, ...extra }, ...rest } as Minimumdoel;
}

function bestand(set: MinimumdoelenIndexSet, doelen: Minimumdoel[]): MinimumdoelenSetBestand {
  return { app: 'boosterz', kind: 'minimumdoelen', v: 1, set: { id: set.id, naam: set.naam } as MinimumdoelenSetBestand['set'], doelen };
}

const info = (set: MinimumdoelenIndexSet) => {
  const i = basisSet(set);
  if (!i) throw new Error(`geen basisset: ${set.id}`);
  return i;
};

/** Een doel met alleen wat de leerlijn nodig heeft. */
function d(eind: Eindmoment, code: string, onderwerp: string, subthema?: string, setId = 'S'): DoelBasis {
  const [vak, nr] = code.split('.');
  return {
    setId, id: `${eind}-${code}`, code, soort: 'bao', eind, vak: Number(vak), onderwerpNr: `${vak}.${nr}`, onderwerp,
    ...(subthema ? { subthema } : {}), doelzinHtml: `<p>${code}</p>`,
  };
}

// ─── doelenVanSet ───────────────────────────────────────────────────────────

describe('doelenVanSet', () => {
  const UITB = '<ul><li>een</li><li>twee</li></ul>';

  it('haalt de uitbreiding los van de doelzin als de tekst erop eindigt (zo laadt de app een set)', () => {
    const b = bestand(WT_L4, [
      doel('1', '3.1.2', `<p>De leerlingen kennen de volgende begrippen:</p>\n${UITB}`, 'Leven', 'Organismen', undefined, { uitbreiding_op_doelzin: ` ${UITB} ` }),
    ]);
    const [x] = doelenVanSet(b, info(WT_L4));
    expect(x.doelzinHtml).toBe('<p>De leerlingen kennen de volgende begrippen:</p>');
    expect(x.uitbreidingHtml).toBe(UITB);
  });

  it('haalt de uitbreiding uit extra als het bestand nog zoals de bron is, en verliest zo niets', () => {
    const b = bestand(WT_L4, [doel('1', '3.1.2', '<p>De leerlingen kennen:</p>', 'Leven', undefined, undefined, { uitbreiding_op_doelzin: UITB })]);
    const [x] = doelenVanSet(b, info(WT_L4));
    expect(x.doelzinHtml).toBe('<p>De leerlingen kennen:</p>');
    expect(x.uitbreidingHtml).toBe(UITB);
  });

  it('laat de hele tekst de doelzin als de uitbreiding ergens anders in de tekst staat, of ontbreekt', () => {
    const midden = bestand(WT_L4, [doel('1', '3.1.2', `<p>kop</p>${UITB}<p>staart</p>`, 'Leven', undefined, undefined, { uitbreiding_op_doelzin: UITB })]);
    expect(doelenVanSet(midden, info(WT_L4))[0]).toMatchObject({ doelzinHtml: `<p>kop</p>${UITB}<p>staart</p>` });
    expect(doelenVanSet(midden, info(WT_L4))[0].uitbreidingHtml).toBeUndefined();
    const geen = bestand(WT_L4, [doel('2', '3.1.3', '<p>los doel</p>', 'Leven')]);
    const [y] = doelenVanSet(geen, info(WT_L4));
    expect(y.doelzinHtml).toBe('<p>los doel</p>');
    expect(y.uitbreidingHtml).toBeUndefined();
    expect('uitbreidingHtml' in y).toBe(false);
  });

  it('twee keer toepassen op dezelfde tekst geeft hetzelfde', () => {
    const b = bestand(WT_L4, [doel('1', '3.1.2', `<p>x</p>\n${UITB}`, 'Leven', undefined, undefined, { uitbreiding_op_doelzin: UITB })]);
    expect(doelenVanSet(b, info(WT_L4))).toEqual(doelenVanSet(b, info(WT_L4)));
  });

  it('leest onderwerp, subthema, nummer, vak, soort en moment uit de set en de rubrieken', () => {
    const b = bestand(WT_L4, [doel('92767', '3.5.4', '<p>De leerlingen kennen licht.</p>', 'Natuurkundige verschijnselen', 'Licht')]);
    expect(doelenVanSet(b, info(WT_L4))).toEqual([
      {
        setId: 'WT_L4', id: '92767', code: '3.5.4', soort: 'bao', eind: 'L4', vak: 3, onderwerpNr: '3.5',
        onderwerp: 'Natuurkundige verschijnselen', subthema: 'Licht', soortDoel: 'populatie', doelzinHtml: '<p>De leerlingen kennen licht.</p>',
      },
    ]);
    const bu = bestand(BU_WT_L4, [{ ...doel('92767', '3.5.4', '<p>x</p>', 'Natuurkundige verschijnselen'), type: 'Na te streven minimumdoelen op populatieniveau' }]);
    expect(doelenVanSet(bu, info(BU_WT_L4))[0]).toMatchObject({ soort: 'bubao', soortDoel: 'nastreven', eind: 'L4' });
  });

  it('neemt de richtinggevende woordenschat mee', () => {
    const b = bestand(WT_L4, [doel('1', '3.2.1', '<p>x</p>', 'Leven', undefined, undefined, { woordenschat_richtinggevend: ' <ul><li>de ruggengraat</li></ul> ' })]);
    expect(doelenVanSet(b, info(WT_L4))[0].woordenschatHtml).toBe('<ul><li>de ruggengraat</li></ul>');
    expect(doelenVanSet(bestand(WT_L4, [doel('2', '3.2.2', '<p>x</p>', 'Leven', undefined, undefined, { woordenschat_richtinggevend: '  ' })]), info(WT_L4))[0].woordenschatHtml).toBeUndefined();
  });

  it('geeft [] voor een oude set, een schijnset en een doel zonder nummer of code; en laat de rest staan', () => {
    expect(doelenVanSet(bestand(OUD, [doel('1', '10.1.1', 'x', 'y')]), info(OUD))).toEqual([]);
    const b = bestand(WT_L4, [
      doel('1', '3.1.1', '<p>goed</p>', 'Leven'),
      { code: '3.1.2', tekst: '<p>zonder nummer</p>' } as Minimumdoel,
      doel('3', '', '<p>zonder code</p>', 'Leven'),
    ]);
    expect(doelenVanSet(b, info(WT_L4)).map((x) => x.id)).toEqual(['1']);
  });

  it('geeft een doel zonder rubrieken een onderwerp met zijn nummer, zodat er geen leeg kopje is', () => {
    const [x] = doelenVanSet(bestand(WT_L4, [{ id: '1', code: '3.7.1', tekst: '<p>x</p>' } as Minimumdoel]), info(WT_L4));
    expect(x.onderwerp).toBe('Onderwerp 3.7');
    expect(x.subthema).toBeUndefined();
  });
});

// ─── codeVergelijk en samenvoegen ───────────────────────────────────────────

describe('codeVergelijk en samenvoegen', () => {
  it('vergelijkt numeriek per deel', () => {
    expect(codeVergelijk('2.3.28', '2.3.4')).toBeGreaterThan(0);
    expect(codeVergelijk('2.3.4', '2.3.28')).toBeLessThan(0);
    expect(codeVergelijk('10.1.1', '9.3.5')).toBeGreaterThan(0);
    expect(codeVergelijk('3.5.4', '3.5.4')).toBe(0);
    expect(codeVergelijk('3.5', '3.5.1')).toBeLessThan(0);
  });

  it('sorteert in een lijst codes goed', () => {
    const codes = ['10.1.1', '2.3.28', '2.3.4', '9.3.5', '2.10.1', '2.3.4'];
    expect([...codes].sort(codeVergelijk)).toEqual(['2.3.4', '2.3.4', '2.3.28', '2.10.1', '9.3.5', '10.1.1']);
  });

  it('is een volgorde: antisymmetrisch en transitief op een steekproef', () => {
    const codes = ['1.1.1', '1.1.10', '1.2.1', '1.10.1', '2.1.1', '10.1.1', '3.5', '3.5.4'];
    for (const a of codes) for (const b of codes) {
      expect(Math.sign(codeVergelijk(a, b)) + Math.sign(codeVergelijk(b, a))).toBe(0);
      for (const c of codes) if (codeVergelijk(a, b) <= 0 && codeVergelijk(b, c) <= 0) expect(codeVergelijk(a, c)).toBeLessThanOrEqual(0);
    }
  });

  it('samenvoegen sorteert twee kleutersets stabiel op code', () => {
    const a = [d('K3', '1.1.1', 'A'), d('K3', '1.2.7', 'B')];
    const b = [d('K3', '1.1.3', 'A'), d('K3', '1.2.2', 'B')];
    expect(samenvoegen([a, b]).map((x) => x.code)).toEqual(['1.1.1', '1.1.3', '1.2.2', '1.2.7']);
    // gelijke codes behouden de volgorde van de lijsten
    const x1 = d('K3', '1.1.1', 'A', undefined, 'EERST');
    const x2 = d('K3', '1.1.1', 'A', undefined, 'DAARNA');
    expect(samenvoegen([[x1], [x2]]).map((x) => x.setId)).toEqual(['EERST', 'DAARNA']);
  });
});

// ─── rubrieken ──────────────────────────────────────────────────────────────

describe('rubrieken', () => {
  it('groepeert per onderwerp en subthema in de volgorde van de doelen; zonder subthema geen naam', () => {
    const doelen = [
      d('L4', '3.1.1', 'Leven', 'Planten'),
      d('L4', '3.1.2', 'Leven', 'Planten'),
      d('L4', '3.1.3', 'Leven', 'Dieren'),
      d('L4', '3.2.1', 'Stoffen'),
      d('L4', '3.2.2', 'Stoffen', 'Mengsels'),
    ];
    const r = rubrieken(doelen);
    expect(r.map((o) => [o.nr, o.naam, o.aantal])).toEqual([['3.1', 'Leven', 3], ['3.2', 'Stoffen', 2]]);
    expect(r[0].subthemas.map((g) => [g.naam, g.doelen.length])).toEqual([['Planten', 2], ['Dieren', 1]]);
    expect(r[1].subthemas.map((g) => g.naam)).toEqual([undefined, 'Mengsels']);
    expect('naam' in r[1].subthemas[0]).toBe(false);
  });

  it('houdt een subthema met dezelfde naam onder een ander onderwerp apart', () => {
    const r = rubrieken([d('L4', '3.1.1', 'Leven', 'Algemeen'), d('L4', '3.2.1', 'Stoffen', 'Algemeen')]);
    expect(r).toHaveLength(2);
    expect(r[0].subthemas[0].doelen.map((x) => x.code)).toEqual(['3.1.1']);
    expect(r[1].subthemas[0].doelen.map((x) => x.code)).toEqual(['3.2.1']);
  });

  it('geeft [] voor geen doelen', () => {
    expect(rubrieken([])).toEqual([]);
  });
});

// ─── voegVolgordeSamen ──────────────────────────────────────────────────────

describe('voegVolgordeSamen', () => {
  it('houdt de volgorde van elke lijst als ze elkaar niet tegenspreken (eigenschapstest)', () => {
    // een vaste reeks als 'waarheid'; lijsten zijn deelreeksen ervan
    const hoofd = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    let zaad = 12345;
    const volgend = () => ((zaad = (zaad * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let ronde = 0; ronde < 300; ronde++) {
      const lijsten = [0, 1, 2].map(() => hoofd.filter(() => volgend() < 0.55));
      const samen = voegVolgordeSamen(lijsten);
      expect(new Set(samen).size).toBe(samen.length);
      expect(new Set(samen)).toEqual(new Set(lijsten.flat()));
      for (const lijst of lijsten) {
        const posities = lijst.map((x) => samen.indexOf(x));
        expect(posities, `${JSON.stringify(lijsten)} → ${samen}`).toEqual([...posities].sort((p, q) => p - q));
      }
    }
  });

  it('gaat bij een tegenspraak door met de eerst geziene volgorde en verliest niets', () => {
    const samen = voegVolgordeSamen([['a', 'b'], ['b', 'a']]);
    expect(samen).toEqual(['a', 'b']);
    expect(voegVolgordeSamen([['a', 'b', 'c'], ['c', 'a']]).sort()).toEqual(['a', 'b', 'c']);
  });

  it('kleine gevallen', () => {
    expect(voegVolgordeSamen([])).toEqual([]);
    expect(voegVolgordeSamen([[], []])).toEqual([]);
    expect(voegVolgordeSamen([['x']])).toEqual(['x']);
    expect(voegVolgordeSamen([['a', 'c'], ['b', 'c']])).toEqual(['a', 'b', 'c']);
    expect(voegVolgordeSamen([['a', 'a', 'b']])).toEqual(['a', 'b']);
  });
});

// ─── leerlijnVanVak ─────────────────────────────────────────────────────────

describe('leerlijnVanVak', () => {
  const doelen = [
    d('K3', '3.5.1', 'Natuurkundige verschijnselen', 'Licht'),
    d('K3', '3.5.2', 'Natuurkundige verschijnselen', 'Licht'),
    d('L4', '3.5.4', 'Natuurkundige verschijnselen'),
    d('L6', '3.5.4', 'Natuurkundige verschijnselen'),
    d('L6', '3.5.10', 'Natuurkundige verschijnselen', 'Elektriciteit'),
    d('L4', '3.1.1', 'Leven', 'Dieren'),
    d('L6', '3.1.1', 'Leven', 'Dieren'),
    d('L6', '3.1.2', 'Leven', 'Planten'),
  ];
  const ll = leerlijnVanVak(doelen);

  it('zet de onderwerpen op nummer, numeriek', () => {
    expect(ll.map((o) => o.nr)).toEqual(['3.1', '3.5']);
    expect(leerlijnVanVak([d('L4', '3.10.1', 'Tien'), d('L4', '3.9.1', 'Negen')]).map((o) => o.nr)).toEqual(['3.9', '3.10']);
  });

  it('maakt een rij per subthema met een cel per eindmoment, en lege cellen blijven lege lijsten', () => {
    const leven = ll[0];
    expect(leven.rijen.map((r) => r.subthema)).toEqual(['Dieren', 'Planten']);
    expect(leven.rijen[0].cellen.K3).toEqual([]);
    expect(leven.rijen[0].cellen.L4.map((x) => x.code)).toEqual(['3.1.1']);
    expect(leven.rijen[1].cellen.L4).toEqual([]);
    expect(leven.rijen[1].cellen.L6.map((x) => x.code)).toEqual(['3.1.2']);
    expect(leven.aantal).toEqual({ K3: 0, L4: 1, L6: 2 });
  });

  it('zet een rij zonder subthema als rij zonder naam, en de doelen in een cel op code', () => {
    const nat = ll[1];
    expect(nat.rijen.map((r) => r.subthema)).toEqual(['Licht', undefined, 'Elektriciteit']);
    expect(nat.rijen[1].cellen.L6.map((x) => x.code)).toEqual(['3.5.4']);
    expect(nat.rijen[2].cellen.L6.map((x) => x.code)).toEqual(['3.5.10']);
    expect(nat.aantal).toEqual({ K3: 2, L4: 1, L6: 2 });
    expect(nat.naam).toBe('Natuurkundige verschijnselen');
  });

  it('verliest geen doel en zet er geen dubbel', () => {
    const alle = ll.flatMap((o) => o.rijen.flatMap((r) => Object.values(r.cellen).flat()));
    expect(alle.map((x) => x.id).sort()).toEqual(doelen.map((x) => x.id).sort());
  });

  it('is niet afhankelijk van de volgorde van de invoer', () => {
    expect(leerlijnVanVak([...doelen].reverse())).toEqual(ll);
  });

  it('geeft [] voor geen doelen', () => {
    expect(leerlijnVanVak([])).toEqual([]);
  });
});

// ─── zelfdeRubriek ──────────────────────────────────────────────────────────

describe('zelfdeRubriek', () => {
  it('geeft hetzelfde subthema op elk moment', () => {
    const doelen = [
      d('K3', '3.5.1', 'N', 'Licht'), d('K3', '3.5.2', 'N', 'Geluid'),
      d('L4', '3.5.4', 'N', 'Licht'), d('L6', '3.5.4', 'N', 'Licht'), d('L6', '3.5.5', 'N', 'Geluid'),
      d('L4', '3.6.1', 'Anders', 'Licht'),
    ];
    const z = zelfdeRubriek(doelen[2], doelen);
    expect(z.niveau).toBe('subthema');
    expect(z.per.K3.map((x) => x.code)).toEqual(['3.5.1']);
    expect(z.per.L4.map((x) => x.code)).toEqual(['3.5.4']);
    expect(z.per.L6.map((x) => x.code)).toEqual(['3.5.4']);
  });

  it('valt terug op het hele onderwerp als het doel geen subthema heeft', () => {
    const doelen = [
      d('K3', '3.5.1', 'N'), d('K3', '3.5.2', 'N'), d('L4', '3.5.4', 'N'), d('L4', '3.5.5', 'N', 'Licht'),
      d('L6', '3.5.4', 'N'), d('L6', '3.6.1', 'Anders'),
    ];
    const z = zelfdeRubriek(doelen[2], doelen);
    expect(z.niveau).toBe('onderwerp');
    expect(z.per.K3).toHaveLength(2);
    expect(z.per.L4.map((x) => x.code)).toEqual(['3.5.4', '3.5.5']);
    expect(z.per.L6.map((x) => x.code)).toEqual(['3.5.4']);
  });

  it('valt terug op het hele onderwerp als het subthema op een moment ontbreekt waar het onderwerp wel doelen heeft', () => {
    const doelen = [d('K3', '3.5.1', 'N'), d('L4', '3.5.4', 'N', 'Licht'), d('L6', '3.5.4', 'N', 'Licht')];
    const z = zelfdeRubriek(doelen[1], doelen);
    expect(z.niveau).toBe('onderwerp');
    expect(z.per.K3.map((x) => x.code)).toEqual(['3.5.1']);
  });

  it('negeert een moment zonder doelen in het onderwerp, en bevat het doel zelf', () => {
    const doelen = [d('L4', '3.5.4', 'N', 'Licht'), d('L6', '3.5.4', 'N', 'Licht')];
    const z = zelfdeRubriek(doelen[0], doelen);
    expect(z.niveau).toBe('subthema');
    expect(z.per.K3).toEqual([]);
    expect(z.per.L4).toContain(doelen[0]);
  });

  it('kijkt alleen naar hetzelfde vak', () => {
    const doelen = [d('L4', '3.5.4', 'N'), { ...d('L4', '4.5.1', 'N'), vak: 4 }];
    expect(zelfdeRubriek(doelen[0], doelen).per.L4.map((x) => x.code)).toEqual(['3.5.4']);
  });
});

// ─── vakken en sets ─────────────────────────────────────────────────────────

describe('vakkenOpMoment, setsVoorVak en setsVanVak', () => {
  it('vakkenOpMoment: alleen nieuwe, niet-lege sets van de soort en het moment, in vakvolgorde', () => {
    const k = vakkenOpMoment(INDEX, 'bao', 'K3');
    expect(k.map((v) => v.vak.nr)).toEqual([1, 3]);
    expect(k[0].sets.map((s) => s.id)).toEqual(['NL_KP', 'NL_KN']);
    expect(k[0].aantal).toBe(42);
    expect(k[0].perSoort).toEqual([{ soort: 'populatie', aantal: 7 }, { soort: 'nastreven', aantal: 35 }]);
    expect(k[1].perSoort).toEqual([{ soort: 'nastreven', aantal: 5 }]);
    expect(vakkenOpMoment(INDEX, 'bao', 'L4').map((v) => v.vak.nr)).toEqual([3]);
    expect(vakkenOpMoment(INDEX, 'bubao', 'L4').map((v) => v.vak.nr)).toEqual([3]);
    expect(vakkenOpMoment(INDEX, 'bubao', 'K3')).toEqual([]);
    expect(vakkenOpMoment([], 'bao', 'K3')).toEqual([]);
  });

  it('setsVoorVak: één of twee sets', () => {
    expect(setsVoorVak(INDEX, 'bao', 'K3', 1).map((s) => s.id)).toEqual(['NL_KP', 'NL_KN']);
    expect(setsVoorVak(INDEX, 'bao', 'L4', 3).map((s) => s.id)).toEqual(['WT_L4']);
    expect(setsVoorVak(INDEX, 'bubao', 'L4', 3).map((s) => s.id)).toEqual(['BU_WT_L4']);
    expect(setsVoorVak(INDEX, 'bao', 'L6', 1)).toEqual([]);
    expect(setsVoorVak(INDEX, 'bao', 'L4', 10)).toEqual([]); // alleen een oude Franse set: telt niet
  });

  it('setsVanVak: de sets per moment, alleen voor momenten met een set', () => {
    const r = setsVanVak(INDEX, 'bao', 3);
    expect(Object.keys(r).sort()).toEqual(['K3', 'L4', 'L6']);
    expect(r.K3?.map((s) => s.id)).toEqual(['WT_K']);
    expect(r.L4?.map((s) => s.id)).toEqual(['WT_L4']);
    expect(r.L6?.map((s) => s.id)).toEqual(['WT_L6']);
    expect(setsVanVak(INDEX, 'bao', 1)).toEqual({ K3: [expect.objectContaining({ id: 'NL_KP' }), expect.objectContaining({ id: 'NL_KN' })] });
    expect(setsVanVak(INDEX, 'bao', 9)).toEqual({});
  });

  it('telPerSoort houdt de vaste volgorde', () => {
    expect(telPerSoort([
      { soortDoelen: 'nastreven', aantal: 3 }, { soortDoelen: 'populatie', aantal: 1 }, { soortDoelen: 'nastreven', aantal: 4 }, { aantal: 9 },
    ])).toEqual([{ soort: 'populatie', aantal: 1 }, { soort: 'nastreven', aantal: 7 }]);
    expect(telPerSoort([])).toEqual([]);
  });
});
