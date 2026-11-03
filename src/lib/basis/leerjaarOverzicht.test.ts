// Het overzicht per leerjaar (src/lib/basis/leerjaarOverzicht.ts), met zelfgemaakte koppen in de echte naamvorm (met de
// dubbele spatie van de bron). De test leest nergens de klok en geen gegevensbestand: het schooljaar is een parameter.
// De getallen op de echte gegevens staan in basisIngang.echt.test.ts.

import { describe, expect, it } from 'vitest';
import type { MinimumdoelenIndexSet } from '../minimumdoelen';
import { LEERJAREN_BASIS, WERKT_NAAR, type LeerjaarBasis, type Schooljaar, type SoortBasis } from './kalender';
import { leerjaarOverzicht, leerjaarZinnen, oudeDoelenWoord } from './leerjaarOverzicht';
import { setsDieGelden } from './moment';

// ─── Koppen ──────────────────────────────────────────────────────────────────

function kop(id: string, naam: string, korteNaam: string, aantal: number, extra: Partial<MinimumdoelenIndexSet> = {}): MinimumdoelenIndexSet {
  return { id, naam, korteNaam, aantal, sha256: 'x', opgehaald: '2026-11-01T00:00:00Z', bestand: `${id}.json`, geldigheid: 'Geldig', ...extra };
}
const NIEUW = { versie: '2.0', geldigVan: '2025-09-01' };
const POP = 'Te bereiken minimumdoelen op populatieniveau';
const NASTREVEN = 'Na te streven minimumdoelen op populatieniveau';

const L4_NL = kop('L4_NL', `Lager Onderwijs 4de leerjaar -  Nederlands - ${POP}`, 'Nederlands', 72, NIEUW);
const L4_WT = kop('L4_WT', `Lager Onderwijs 4de leerjaar -  Wetenschap en techniek - ${POP}`, 'Wetenschap en techniek', 44, NIEUW);
const L4_AK = kop('L4_AK', `Lager Onderwijs 4de leerjaar -  Aardrijkskunde - ${POP}`, 'Aardrijkskunde', 21, NIEUW);
const L4_MV = kop('L4_MV', `Lager Onderwijs 4de leerjaar -  Muzische vorming - ${POP}`, 'Muzische vorming', 38, NIEUW);
const L6_NL = kop('L6_NL', `Lager Onderwijs 6de leerjaar -  Nederlands - ${POP}`, 'Nederlands', 57, NIEUW);
const K_NL_POP = kop('K_NL_POP', `Kleuteronderwijs -  Nederlands - ${POP}`, 'Nederlands', 7, NIEUW);
const K_NL_NA = kop('K_NL_NA', `Kleuteronderwijs -  Nederlands - ${NASTREVEN}`, 'Nederlands', 35, NIEUW);
const K_MV = kop('K_MV', `Kleuteronderwijs -  Muzische vorming - ${NASTREVEN}`, 'Muzische vorming', 28, NIEUW);

const BU_L4_NL = kop('BU_L4_NL', `Buitengewoon Lager Onderwijs 4de leerjaar -  Nederlands - ${NASTREVEN}`, 'Nederlands', 72, NIEUW);
const BU_L4_WT = kop('BU_L4_WT', `Buitengewoon Lager Onderwijs 4de leerjaar -  Wetenschap en techniek - ${NASTREVEN}`, 'Wetenschap en techniek', 44, NIEUW);

const OUD_LO = kop('OUD_LO', 'Lager Onderwijs - Leergebied - Lichamelijke Opvoeding - Eindtermen', 'Lichamelijke Opvoeding', 46, {
  versie: '1.0', geldigVan: '1998-09-01', geldigTot: '2030-08-31',
});
const OUD_FR = kop('OUD_FR', 'Lager Onderwijs - Leergebied - Frans - Eindtermen', 'Frans', 27, {
  versie: '1.0', geldigVan: '2010-09-01', geldigTot: '2030-08-31',
});
const OUD_K_MV = kop('OUD_K_MV', 'Kleuteronderwijs - Leergebied - Muzische Vorming - Ontwikkelingsdoelen', 'Muzische Vorming', 30, {
  versie: '1.0', geldigVan: '1998-09-01', geldigTot: '2027-08-31',
});
const BU_OUD = kop('BU_OUD', 'Buitengewoon Lager Onderwijs Type 3 - Leergebied - Nederlands - Ontwikkelingsdoelen', 'Nederlands', 20, {
  versie: '1.0', geldigVan: '2018-09-01', geldigTot: '2030-08-31',
});
const BU_LEEG = kop('BU_LEEG', 'Buitengewoon Lager Onderwijs Type 3 - Leergebied - Alle leergebieden - Ontwikkelingsdoelen', 'Alle leergebieden', 1, {
  versie: '1.0', geldigVan: '2018-09-01', geldigTot: '2030-08-31',
});
const SECUNDAIR = kop('SO', 'Secundair Onderwijs 1ste graad - Nederlands - Eindtermen', 'Nederlands', 10, { versie: '1.0', geldigVan: '2019-09-01' });

const INDEX = [L4_NL, L4_WT, L4_AK, L4_MV, L6_NL, K_NL_POP, K_NL_NA, K_MV, BU_L4_NL, BU_L4_WT, OUD_LO, OUD_FR, OUD_K_MV, BU_OUD, BU_LEEG, SECUNDAIR];

const vraag = (soort: SoortBasis, leerjaar: LeerjaarBasis, sj: Schooljaar) => leerjaarOverzicht(INDEX, { soort, leerjaar }, sj);
const vakNrs = (l: { vak: { nr: number } }[]) => l.map((r) => r.vak.nr);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('leerjaarOverzicht: groeperen per vak', () => {
  const o = vraag('bao', 'L3', 2026);

  it('werkt naar het eindmoment van het leerjaar en laat het schooljaar zoals gevraagd', () => {
    expect(o.eindmoment).toBe('L4');
    expect(o.schooljaar).toBe(2026);
    expect(o.tussenstappen).toBe(true);
    expect(vraag('bao', 'L4', 2026).tussenstappen).toBe(false);
  });

  it('zet de vakken in vakvolgorde, verplicht en mag al gescheiden, met het aantal doelen', () => {
    expect(vakNrs(o.verplicht)).toEqual([1, 3]);
    expect(o.verplicht.map((r) => r.aantal)).toEqual([72, 44]);
    expect(o.verplicht.every((r) => r.status === 'verplicht')).toBe(true);
    expect(vakNrs(o.magAl)).toEqual([4, 6]);
    expect(o.magAl.map((r) => r.aantal)).toEqual([21, 38]);
    expect(o.magAl.every((r) => r.status === 'mag')).toBe(true);
  });

  it('geeft bij "mag al" het schooljaar waarin het verplicht wordt en bij "verplicht" niets', () => {
    expect(o.magAl.map((r) => r.verplichtVanaf)).toEqual([2027, 2027]);
    expect(o.verplicht.every((r) => r.verplichtVanaf === undefined)).toBe(true);
  });

  it('telt alleen de nieuwe sets van het eindmoment mee, en niet het secundair', () => {
    expect(o.aantalDoelen).toBe(72 + 44 + 21 + 38);
    expect(o.aantalVakken).toBe(4);
    const alleSets = [...o.verplicht, ...o.magAl].flatMap((r) => r.sets.map((g) => g.set.id));
    expect(alleSets.sort()).toEqual(['L4_AK', 'L4_MV', 'L4_NL', 'L4_WT']);
  });

  it('neemt de zekerheid van setsDieGelden over en per vak de laagste van zijn sets', () => {
    const g = setsDieGelden(INDEX, { soort: 'bao', leerjaar: 'L3', schooljaar: 2026 });
    expect(o.zekerheid).toBe(g.zekerheid);
    for (const r of [...o.verplicht, ...o.magAl]) {
      const rang = { onzeker: 0, waarschijnlijk: 1, zeker: 2 } as const;
      const laagste = r.sets.map((s) => s.invoering.zekerheid).sort((a, b) => rang[a] - rang[b])[0];
      expect(r.zekerheid).toBe(laagste);
    }
  });

  it('geeft twee sets van één vak één regel met het aantal per soort', () => {
    const k = vraag('bao', 'K2', 2026);
    const nl = k.verplicht.find((r) => r.vak.nr === 1);
    expect(nl?.sets.map((g) => g.set.id)).toEqual(['K_NL_POP', 'K_NL_NA']);
    expect(nl?.aantal).toBe(42);
    expect(nl?.perSoort).toEqual([
      { soort: 'populatie', aantal: 7 },
      { soort: 'nastreven', aantal: 35 },
    ]);
    expect(k.verplicht.filter((r) => r.vak.nr === 1)).toHaveLength(1);
  });

  it('geeft een vak met één soort één regel in perSoort', () => {
    expect(o.verplicht[0].perSoort).toEqual([{ soort: 'populatie', aantal: 72 }]);
  });
});

describe('leerjaarOverzicht: wat ontbreekt en wat oud is', () => {
  it('zonderNieuweSet: de vakken van de kalender zonder nieuwe set op dat eindmoment, uit de index', () => {
    expect(vraag('bao', 'L3', 2026).zonderNieuweSet.map((v) => v.nr)).toEqual([2, 5, 7, 8, 9, 10]);
    // het eindmoment van het 6de leerjaar heeft in deze index alleen Nederlands
    expect(vraag('bao', 'L5', 2026).zonderNieuweSet.map((v) => v.nr)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // het buitengewoon heeft eigen sets
    expect(vraag('bubao', 'L3', 2026).zonderNieuweSet.map((v) => v.nr)).toEqual([2, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('oud: de oude sets die nog gelden, zonder koppeling aan een vak van de nieuwe sets', () => {
    expect(vraag('bao', 'L3', 2026).oud.map((g) => g.set.id)).toEqual(['OUD_LO', 'OUD_FR']);
    expect(vraag('bao', 'K2', 2026).oud.map((g) => g.set.id)).toEqual(['OUD_K_MV']);
    // een oude set zonder vak in de kalender blijft staan
    expect(vraag('bubao', 'L3', 2026).oud.map((g) => g.set.id)).toEqual(['BU_OUD']);
  });

  it('leeg: een schijnset zonder doelen staat apart en niet bij de oude doelen', () => {
    const o = vraag('bubao', 'L3', 2026);
    expect(o.leeg.map((s) => s.id)).toEqual(['BU_LEEG']);
    expect(o.oud.map((g) => g.set.id)).not.toContain('BU_LEEG');
  });

  it('een leeg overzicht (geen enkele set) geeft lege lijsten en geen fout', () => {
    const o = leerjaarOverzicht([], { soort: 'bao', leerjaar: 'L3' }, 2026);
    expect(o.verplicht).toEqual([]);
    expect(o.magAl).toEqual([]);
    expect(o.oud).toEqual([]);
    expect(o.aantalDoelen).toBe(0);
    expect(o.aantalVakken).toBe(0);
    expect(o.zonderNieuweSet).toHaveLength(10);
    expect(o.alleNastreven).toBe(false);
  });
});

describe('leerjaarOverzicht: opmerkingen en soort doelen', () => {
  it('geeft de opmerking van de invoering één keer, ook als meer sets haar hebben', () => {
    const o = vraag('bubao', 'L3', 2026);
    const volgt = o.opmerkingen.filter((x) => x.startsWith('Volgt de kalender van het gewoon basisonderwijs'));
    expect(volgt).toHaveLength(1);
    expect(new Set(o.opmerkingen).size).toBe(o.opmerkingen.length);
  });

  it('geeft de opmerking over het getuigschrift voor het 4de leerjaar in 2026', () => {
    const o = vraag('bao', 'L4', 2026);
    expect(o.opmerkingen.some((x) => x.includes('getuigschrift'))).toBe(true);
    expect(vraag('bao', 'L2', 2026).opmerkingen).toEqual([]);
  });

  it('alleNastreven: alleen in het buitengewoon, waar elke nieuwe set na te streven is', () => {
    expect(vraag('bubao', 'L3', 2026).alleNastreven).toBe(true);
    expect(vraag('bao', 'L3', 2026).alleNastreven).toBe(false);
  });
});

describe('leerjaarZinnen: geen lege kopjes en alleen zinnen die het model staaft', () => {
  it('2026, 3de leerjaar: verplicht met mag al en oude doelen', () => {
    const o = vraag('bao', 'L3', 2026);
    const z = leerjaarZinnen(o);
    expect(z.verplichtKop).toBe('Dit schooljaar verplicht');
    expect(z.geenVerplichtZin).toBeUndefined();
    expect(z.alleVerplichtZin).toBeUndefined();
    expect(z.magAlZin).toBe('Tot dan mogen de oude doelen nog. Welke oude doelen nog gelden, staat hieronder.');
    expect(z.tussenstappenZin).toBe('Het leerplan van je net legt de tussenstappen vast.');
    expect(z.zonderNieuweSetZin).toBe('Wiskunde, Geschiedenis, Lichamelijke opvoeding, ICT, Attitudes en Frans hebben geen nieuwe doelen voor het einde van het 4de leerjaar.');
  });

  it('2026, 5de leerjaar: nog niets verplicht, met de zin over de oude eindtermen', () => {
    const o = vraag('bao', 'L5', 2026);
    expect(o.verplicht).toEqual([]);
    const z = leerjaarZinnen(o);
    expect(z.verplichtKop).toBe('Dit schooljaar zijn nog geen nieuwe doelen verplicht');
    expect(z.geenVerplichtZin).toBe('Voor dit leerjaar gelden dit schooljaar nog de oude eindtermen (hieronder).');
  });

  it('2026, kleuter: het woord is ontwikkelingsdoelen', () => {
    expect(oudeDoelenWoord(vraag('bao', 'K2', 2026).oud)).toBe('ontwikkelingsdoelen');
    expect(oudeDoelenWoord(vraag('bao', 'L3', 2026).oud)).toBe('eindtermen');
    expect(oudeDoelenWoord([...vraag('bao', 'L3', 2026).oud, ...vraag('bao', 'K2', 2026).oud])).toBe('doelen');
    expect(oudeDoelenWoord([])).toBe('doelen');
  });

  it('2027: alles verplicht, geen mag al en geen oude doelen, dus geen zin erover', () => {
    const o = vraag('bao', 'L3', 2027);
    expect(o.magAl).toEqual([]);
    expect(o.oud).toEqual([]);
    const z = leerjaarZinnen(o);
    expect(z.alleVerplichtZin).toBe('Alle vakken zijn dit schooljaar verplicht.');
    expect(z.magAlZin).toBeUndefined();
    expect(z.geenVerplichtZin).toBeUndefined();
  });

  it('2029 en 2031: geen lege lijsten of zinnen daarover (de oude doelen van het 5de en 6de leerjaar lopen tot 2030)', () => {
    for (const sj of [2029, 2031]) {
      for (const lj of LEERJAREN_BASIS) {
        if (sj === 2029 && WERKT_NAAR[lj] === 'L6') continue;
        const o = vraag('bao', lj, sj);
        const z = leerjaarZinnen(o);
        expect(o.magAl, `${lj} ${sj}`).toEqual([]);
        expect(o.oud, `${lj} ${sj}`).toEqual([]);
        expect(z.magAlZin).toBeUndefined();
        expect(z.geenVerplichtZin).toBeUndefined();
        if (o.verplicht.length > 0) expect(z.alleVerplichtZin).toBe('Alle vakken zijn dit schooljaar verplicht.');
      }
    }
  });

  it('zet het tussenstappenzinnetje alleen bij een leerjaar vóór het eindmoment', () => {
    for (const lj of LEERJAREN_BASIS) {
      const z = leerjaarZinnen(vraag('bao', lj, 2026));
      expect(z.tussenstappenZin !== undefined, lj).toBe(WERKT_NAAR[lj] !== lj);
    }
  });

  it('de zin over een vak zonder nieuwe set noemt het eindmoment en zegt niets over oude doelen', () => {
    const z = leerjaarZinnen(vraag('bao', 'K2', 2026));
    expect(z.zonderNieuweSetZin).toMatch(/^.+ hebben geen nieuwe doelen voor het einde van het kleuteronderwijs\.$/);
    expect(z.zonderNieuweSetZin).not.toMatch(/oude|eindtermen|ontwikkelingsdoelen/);
    const enkel = leerjaarZinnen(leerjaarOverzicht(INDEX_ZONDER_FRANS(), { soort: 'bao', leerjaar: 'L3' }, 2026));
    expect(enkel.zonderNieuweSetZin).toBe('Frans heeft geen nieuwe doelen voor het einde van het 4de leerjaar.');
  });

  it('bevat nergens de zinnen die het model niet staaft', () => {
    for (const sj of [2026, 2027, 2029, 2031]) {
      for (const lj of LEERJAREN_BASIS) {
        for (const soort of ['bao', 'bubao'] as const) {
          const z = leerjaarZinnen(vraag(soort, lj, sj));
          const alles = Object.values(z).join(' ');
          expect(alles).not.toMatch(/Tot dan gelden voor deze vakken/);
          expect(alles).not.toMatch(/alleen doelen voor het einde van het 6de leerjaar/);
        }
      }
    }
  });
});

/** Een index met alle vakken behalve Frans op het 4de leerjaar, voor de enkelvoudsvorm van de zin. */
function INDEX_ZONDER_FRANS(): MinimumdoelenIndexSet[] {
  const namen: [string, number][] = [
    ['Nederlands', 1], ['Wiskunde', 2], ['Wetenschap en techniek', 3], ['Aardrijkskunde', 4], ['Geschiedenis', 5],
    ['Muzische vorming', 6], ['Lichamelijke opvoeding', 7], ['ICT', 8], ['Attitudes', 9],
  ];
  return namen.map(([n, i]) => kop(`X${i}`, `Lager Onderwijs 4de leerjaar -  ${n} - ${POP}`, n, 10, NIEUW));
}
