import { describe, expect, it } from 'vitest';
import { LEERJAREN_BASIS, WERKT_NAAR } from '../kalender';
import {
  EINDMOMENT_VAN_GO_MOMENT,
  GO_LEESBRIL,
  GO_LEESBRIL_UITLEG,
  GO_LEESBRIL_ZEKERHEID,
  GO_LEEFTIJDEN,
  isGoLeeftijd,
  isLeeftijdenlijst,
  leeftijdenLabel,
  leeftijdenVanMoment,
  leeftijdLabel,
  leeftijdVanLeerjaar,
  leerjaarVanLeeftijd,
  meestalTekst,
  momentPastBijLeeftijden,
  vergelijkLeeftijden,
} from './leeftijden';
import { GO_MOMENTEN, type GoLeeftijd } from './types';

describe('de leeftijdsgroepen van het GO!', () => {
  it('zijn er negen, in de volgorde van de kolommen van de doelensets', () => {
    expect(GO_LEEFTIJDEN).toEqual(['2,5-4', '4-5', '5-6', '6-7', '7-8', '8-9', '9-10', '10-11', '11-12']);
  });

  it('herkent alleen die negen', () => {
    for (const l of GO_LEEFTIJDEN) expect(isGoLeeftijd(l)).toBe(true);
    for (const x of ['2,5-3', '3-4', '12-13', '2.5-4', '', ' 4-5', 4, null, undefined]) expect(isGoLeeftijd(x)).toBe(false);
  });

  it('schrijft een groep en een lijst zoals een lesplan ze tussen haakjes zet', () => {
    expect(leeftijdLabel('2,5-4')).toBe('2,5-4 jaar');
    expect(leeftijdenLabel(['2,5-4', '4-5', '5-6'])).toBe('2,5-4 jaar, 4-5 jaar, 5-6 jaar');
    expect(leeftijdenLabel([])).toBe('');
  });

  it('vergelijkt en controleert de volgorde', () => {
    expect(vergelijkLeeftijden('2,5-4', '4-5')).toBeLessThan(0);
    expect(vergelijkLeeftijden('11-12', '10-11')).toBeGreaterThan(0);
    expect(vergelijkLeeftijden('9-10', '9-10')).toBe(0);
    expect(isLeeftijdenlijst([])).toBe(true);
    expect(isLeeftijdenlijst(['2,5-4', '9-10'])).toBe(true);
    expect(isLeeftijdenlijst(['4-5', '2,5-4'])).toBe(false);
    expect(isLeeftijdenlijst(['4-5', '4-5'])).toBe(false);
    expect(isLeeftijdenlijst(['4-5', 'x'])).toBe(false);
    expect(isLeeftijdenlijst('4-5')).toBe(false);
  });
});

describe('de leesbril naar de leerjaren van de app (waarschijnlijk)', () => {
  it('legt de negen regels vast', () => {
    expect(GO_LEESBRIL).toEqual([
      { leeftijd: '2,5-4', leerjaar: 'K1', meestal: 'instapklas en 1ste kleuterklas' },
      { leeftijd: '4-5', leerjaar: 'K2', meestal: '2de kleuterklas' },
      { leeftijd: '5-6', leerjaar: 'K3', meestal: '3de kleuterklas' },
      { leeftijd: '6-7', leerjaar: 'L1', meestal: '1ste leerjaar' },
      { leeftijd: '7-8', leerjaar: 'L2', meestal: '2de leerjaar' },
      { leeftijd: '8-9', leerjaar: 'L3', meestal: '3de leerjaar' },
      { leeftijd: '9-10', leerjaar: 'L4', meestal: '4de leerjaar' },
      { leeftijd: '10-11', leerjaar: 'L5', meestal: '5de leerjaar' },
      { leeftijd: '11-12', leerjaar: 'L6', meestal: '6de leerjaar' },
    ]);
  });

  it('heeft zekerheid waarschijnlijk en zegt waarom', () => {
    expect(GO_LEESBRIL_ZEKERHEID).toBe('waarschijnlijk');
    expect(GO_LEESBRIL_UITLEG).toBe(
      'Het GO! deelt zijn leerplan in per leeftijd. Welk leerjaar dat is, hangt af van het kind; dit is de leeftijd van de meeste kinderen in dat leerjaar.',
    );
  });

  it('geeft elke groep één adres: één leerjaar per groep en één groep per leerjaar', () => {
    expect(GO_LEESBRIL.map((r) => r.leeftijd)).toEqual([...GO_LEEFTIJDEN]);
    expect(GO_LEESBRIL.map((r) => r.leerjaar)).toEqual([...LEERJAREN_BASIS]);
    for (const l of GO_LEEFTIJDEN) expect(leeftijdVanLeerjaar(leerjaarVanLeeftijd(l))).toBe(l);
    for (const lj of LEERJAREN_BASIS) expect(leerjaarVanLeeftijd(leeftijdVanLeerjaar(lj))).toBe(lj);
    expect(leeftijdVanLeerjaar('K1')).toBe('2,5-4');
    expect(leerjaarVanLeeftijd('2,5-4')).toBe('K1');
  });

  it('zet "meestal" altijd voor de klas, nooit de klas alleen', () => {
    expect(meestalTekst('2,5-4')).toBe('meestal instapklas en 1ste kleuterklas');
    expect(meestalTekst('11-12')).toBe('meestal 6de leerjaar');
  });

  it('gooit een duidelijke fout bij een onbekende waarde (geen stille terugval)', () => {
    expect(() => leeftijdVanLeerjaar('K0' as never)).toThrow(/Geen leeftijdsgroep voor het leerjaar K0/);
    expect(() => leerjaarVanLeeftijd('3-4' as never)).toThrow(/Geen leesbril voor de leeftijd 3-4/);
  });
});

describe('moment en leeftijden (de regel voor de twijfel, rechtzetting 1)', () => {
  it('volgt de eindmomenten van de app', () => {
    expect(EINDMOMENT_VAN_GO_MOMENT).toEqual({ KO: 'K3', L4: 'L4', L6: 'L6' });
    expect(leeftijdenVanMoment('KO')).toEqual(['2,5-4', '4-5', '5-6']);
    expect(leeftijdenVanMoment('L4')).toEqual(['6-7', '7-8', '8-9', '9-10']);
    expect(leeftijdenVanMoment('L6')).toEqual(['10-11', '11-12']);
  });

  it('valt voor elke leeftijd en elk moment samen met WERKT_NAAR in kalender.ts', () => {
    for (const l of GO_LEEFTIJDEN) {
      for (const mo of GO_MOMENTEN) {
        expect(momentPastBijLeeftijden(mo, [l]), `${l} ${mo}`).toBe(WERKT_NAAR[leerjaarVanLeeftijd(l)] === EINDMOMENT_VAN_GO_MOMENT[mo]);
      }
    }
  });

  it('geeft de voorbeelden uit het ontwerp en de rechter', () => {
    const wt235: GoLeeftijd[] = ['2,5-4', '4-5', '5-6', '6-7', '7-8', '8-9', '9-10'];
    // WT.235 → L6 3.3.2: twijfel (het ontwerp vermeldde dat niet; de rechter wel).
    expect(momentPastBijLeeftijden('L6', wt235)).toBe(false);
    expect(momentPastBijLeeftijden('KO', wt235)).toBe(true);
    expect(momentPastBijLeeftijden('L4', wt235)).toBe(true);
    // LO.076 (2,5-4 tot 5-6) → L4 7.1.10; BU.001 (2,5-4) → L4 5.3.1; WT.113 (10-11, 11-12) → L4; WT.316 (6-7) → L6.
    expect(momentPastBijLeeftijden('L4', ['2,5-4', '4-5', '5-6'])).toBe(false);
    expect(momentPastBijLeeftijden('L4', ['2,5-4'])).toBe(false);
    expect(momentPastBijLeeftijden('L4', ['10-11', '11-12'])).toBe(false);
    expect(momentPastBijLeeftijden('L6', ['6-7'])).toBe(false);
    // De grenzen: 9-10 hoort bij L4, niet bij L6 (de soepele regel van de verkenner gaf 178 in plaats van 326).
    expect(momentPastBijLeeftijden('L4', ['9-10'])).toBe(true);
    expect(momentPastBijLeeftijden('L6', ['9-10'])).toBe(false);
    expect(momentPastBijLeeftijden('L6', ['8-9'])).toBe(false);
    expect(momentPastBijLeeftijden('L6', ['10-11'])).toBe(true);
    expect(momentPastBijLeeftijden('KO', ['5-6'])).toBe(true);
    expect(momentPastBijLeeftijden('KO', ['6-7'])).toBe(false);
  });

  it('laat zonder leeftijden niets passen', () => {
    for (const mo of GO_MOMENTEN) expect(momentPastBijLeeftijden(mo, [])).toBe(false);
  });
});
