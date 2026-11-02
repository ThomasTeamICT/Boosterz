import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MinimumdoelenIndexSet, MinimumdoelenSetKop } from '../minimumdoelen';
import { geldigheidTekst } from '../minimumdoelenBron';
import { INVOERINGSKALENDER, type Invoeringskalender, type LeerjaarBasis } from './kalender';
import {
  basisSet,
  doelInfo,
  geldigheidTekstBasis,
  golfVanOudeSet,
  invoering,
  invoeringVanSet,
  kalenderTegenGegevens,
  kalenderVoorSet,
  laagsteZekerheid,
  setsDieGelden,
  soortDoelVan,
  tweelingSets,
  vakVanKorteNaam,
  type BasisSet,
  type SetKopBasis,
} from './moment';
import {
  BRON_HOE_LABEL,
  EINDMOMENT_LABEL,
  GOLF_TEKST,
  GOLF_ZEKERHEID_UITLEG,
  MOMENT_OUD_LABEL,
  SOORT_DOELEN_LABEL,
  STATUS_LABEL,
  ZEKERHEID_LABEL,
  ZEKERHEID_UITLEG,
  leerjarenTekst,
  samengesteldTekst,
  statusDeel,
  vervallenTekst,
  vervangenTekst,
  voorWieTekst,
  zekerheidLabel,
  zekerheidUitleg,
} from './momentTeksten';

// ─── Zelfgemaakte koppen in de echte naamvorm (met de dubbele spatie van de bron) ─────────────

type Kop = SetKopBasis & { versie?: string };
const kop = (id: string, naam: string, extra: Partial<Kop> = {}): Kop => ({ id, naam, ...extra });

const NIEUW = { versie: '2.0', geldigheid: 'Geldig', geldigVan: '2025-09-01' };
const OUD = { versie: '1.0', geldigheid: 'Geldig', geldigVan: '2010-09-01' };

const L4_NL = kop('N_L4_NL', 'Lager Onderwijs 4de leerjaar -  Nederlands - Te bereiken minimumdoelen op populatieniveau', {
  ...NIEUW,
  korteNaam: 'Nederlands',
  leerjaar: '4de leerjaar',
  aantal: 72,
});
const L4_WT = kop('N_L4_WT', 'Lager Onderwijs 4de leerjaar -  Wetenschap en techniek - Te bereiken minimumdoelen op populatieniveau', {
  ...NIEUW,
  korteNaam: 'Wetenschap en techniek',
  leerjaar: '4de leerjaar',
  aantal: 44,
});
const L6_WT = kop('N_L6_WT', 'Lager Onderwijs 6de leerjaar -  Wetenschap en techniek - Te bereiken minimumdoelen op populatieniveau', {
  ...NIEUW,
  korteNaam: 'Wetenschap en techniek',
  leerjaar: '6de leerjaar',
  aantal: 40,
});
const K_NL = kop('N_K_NL', 'Kleuteronderwijs -  Nederlands - Te bereiken minimumdoelen op populatieniveau', {
  ...NIEUW,
  korteNaam: 'Nederlands',
  aantal: 7,
});
const K_AK = kop('N_K_AK', 'Kleuteronderwijs -  Aardrijkskunde - Na te streven minimumdoelen op populatieniveau', {
  ...NIEUW,
  korteNaam: 'Aardrijkskunde',
  aantal: 17,
});
const K_MV = kop('N_K_MV', 'Kleuteronderwijs -  Muzische vorming - Na te streven minimumdoelen op populatieniveau', {
  ...NIEUW,
  korteNaam: 'Muzische vorming',
  aantal: 12,
});
const L4_BURGER = kop('N_L4_BU', 'Lager Onderwijs 4de leerjaar -  Burgerschap - Te bereiken minimumdoelen op populatieniveau', {
  ...NIEUW,
  korteNaam: 'Burgerschap',
  leerjaar: '4de leerjaar',
  aantal: 10,
});
const BU_L4_WT = kop(
  'N_BU_L4_WT',
  'Buitengewoon Lager Onderwijs 4de leerjaar -  Wetenschap en techniek - Na te streven minimumdoelen op populatieniveau',
  { ...NIEUW, korteNaam: 'Wetenschap en techniek', leerjaar: '4de leerjaar', aantal: 44 },
);
const BU_K_NL = kop('N_BU_K_NL', 'Buitengewoon Kleuteronderwijs -  Nederlands - Na te streven minimumdoelen op populatieniveau', {
  ...NIEUW,
  korteNaam: 'Nederlands',
  aantal: 7,
});

const OUD_NL_EINDTERMEN = kop('O_L_NL', 'Lager Onderwijs - Leergebied - Nederlands - Eindtermen', {
  ...OUD,
  korteNaam: 'Nederlands',
  geldigTot: '2028-08-31',
  aantal: 47,
});
const OUD_FRANS = kop('O_L_FR', 'Lager Onderwijs - Leergebied - Frans - Eindtermen', {
  ...OUD,
  korteNaam: 'Frans',
  geldigTot: '2030-08-31',
  aantal: 20,
});
const OUD_LEREN_LEREN = kop('O_L_LL', 'Lager Onderwijs - Leergebied - Leren leren - Eindtermen', {
  ...OUD,
  korteNaam: 'Leren leren',
  geldigTot: '2030-08-31',
  aantal: 15,
});
const OUD_ZONDER_EINDE = kop('O_K_ZE', 'Buitengewoon Kleuteronderwijs Type 7 - Leergebied - Wereldoriëntatie: dovencultuur - Aanvullende - Ontwikkelingsdoelen', {
  ...OUD,
  korteNaam: 'Wereldoriëntatie: dovencultuur',
  aantal: 15,
});
const OUD_K_NL = kop('O_K_NL', 'Kleuteronderwijs - Leergebied - Nederlands - Ontwikkelingsdoelen', {
  ...OUD,
  geldigheid: 'Niet meer geldig',
  korteNaam: 'Nederlands',
  geldigTot: '2026-08-31',
  aantal: 31,
});
const OUD_K_MV = kop('O_K_MV', 'Kleuteronderwijs - Leergebied - Muzische Vorming - Ontwikkelingsdoelen', {
  ...OUD,
  korteNaam: 'Muzische Vorming',
  geldigTot: '2027-08-31',
  aantal: 20,
});
const OUD_BU_L_ONT = kop('O_BU_L', 'Buitengewoon Lager Onderwijs Type 3 - Leergebied - Wiskunde - Ontwikkelingsdoelen', {
  ...OUD,
  korteNaam: 'Wiskunde',
  geldigTot: '2028-08-31',
  aantal: 18,
});
const OUD_LEEG = kop('O_BU_LEEG', 'Buitengewoon Lager Onderwijs Type 3 - Leergebied - Alle leergebieden - Ontwikkelingsdoelen', {
  ...OUD,
  korteNaam: 'Alle leergebieden',
  geldigTot: '2030-08-31',
  aantal: 1,
});
const OUD_EIND_2029 = kop('O_L_2029', 'Lager Onderwijs - Leergebied - Wiskunde - Eindtermen', {
  ...OUD,
  korteNaam: 'Wiskunde',
  geldigTot: '2029-08-31',
  aantal: 30,
});
const OUD_EIND_2020 = kop('O_BU_2020', 'Buitengewoon Lager Onderwijs Type 2 - Leergebied - Nederlands - Ontwikkelingsdoelen', {
  ...OUD,
  korteNaam: 'Nederlands',
  geldigTot: '2020-08-31',
  aantal: 20,
});

const SECUNDAIR = kop('S_1', 'Secundair Onderwijs 1ste graad A-stroom - Vak - Nederlands - Eindtermen', {
  versie: '2.1',
  geldigheid: 'Geldig',
  geldigVan: '2019-09-01',
  geldigTot: '2030-08-31',
  korteNaam: 'Nederlands',
  aantal: 20,
});
const LERARENOPLEIDING = kop('L_1', 'Lerarenopleiding - Opleiding - Leraar Kleuteronderwijs - Eindtermen', { korteNaam: 'Leraar Kleuteronderwijs', aantal: 30 });

/** Alleen voor de compiler: de kop van een indexregel en van een setbestand passen allebei op wat het model nodig heeft. */
type MoetWaarZijn<T extends true> = T;
export type PastOpDeKop = [
  MoetWaarZijn<MinimumdoelenIndexSet extends SetKopBasis ? true : false>,
  MoetWaarZijn<MinimumdoelenSetKop extends SetKopBasis ? true : false>,
];

const info = (s: Kop, k?: Invoeringskalender): BasisSet => {
  const b = k ? basisSet(s, k) : basisSet(s);
  if (!b) throw new Error(`${s.id} is geen basisset`);
  return b;
};
const status = (s: BasisSet, lj: LeerjaarBasis, sj: number, k?: Invoeringskalender) => (k ? invoering(s, lj, sj, k) : invoering(s, lj, sj));

// ─── soortDoelVan, vakVanKorteNaam ───────────────────────────────────────────

describe('soortDoelVan', () => {
  it('kent de vijf soorten doelen', () => {
    expect(soortDoelVan('Te bereiken minimumdoelen op populatieniveau')).toBe('populatie');
    expect(soortDoelVan('Te bereiken minimumdoelen op individueel niveau')).toBe('individueel');
    expect(soortDoelVan('Na te streven minimumdoelen op populatieniveau')).toBe('nastreven');
    expect(soortDoelVan('Ontwikkelingsdoelen')).toBe('ontwikkelingsdoelen');
    expect(soortDoelVan('Eindtermen')).toBe('eindtermen');
  });

  it('werkt na trim, kleine letters en één spatie per reeks', () => {
    expect(soortDoelVan('  te   bereiken  minimumdoelen op populatieniveau ')).toBe('populatie');
    expect(soortDoelVan('EINDTERMEN')).toBe('eindtermen');
    expect(soortDoelVan('na te streven minimumdoelen op populatieniveau')).toBe('nastreven');
  });

  it('geeft undefined voor al de rest', () => {
    for (const x of ['', 'Vak', 'Aanvullende ontwikkelingsdoelen', 'Specifieke eindtermen', 'constructor', '__proto__', undefined]) {
      expect(soortDoelVan(x)).toBeUndefined();
    }
  });
});

describe('vakVanKorteNaam', () => {
  it('zoekt exact op de sleutel, zonder accenten, hoofdletters en dubbele spaties', () => {
    expect(vakVanKorteNaam('Nederlands')?.nr).toBe(1);
    expect(vakVanKorteNaam('  Wetenschap   en techniek ')?.nr).toBe(3);
    expect(vakVanKorteNaam('ICT')?.nr).toBe(8);
    expect(vakVanKorteNaam('Lichamelijke opvoeding')?.golf).toBe(2);
    expect(vakVanKorteNaam('Muzische vorming')?.naam).toBe('Muzische vorming');
  });

  it('geeft undefined voor een onbekend vak of zonder naam', () => {
    expect(vakVanKorteNaam('Burgerschap')).toBeUndefined();
    expect(vakVanKorteNaam('Wetenschappen en techniek')).toBeUndefined();
    expect(vakVanKorteNaam('')).toBeUndefined();
    expect(vakVanKorteNaam(undefined)).toBeUndefined();
  });

  it('draagt de zekerheid en de bronnen van de golf mee', () => {
    expect(vakVanKorteNaam('Nederlands')?.zekerheid).toBe('zeker');
    expect(vakVanKorteNaam('Aardrijkskunde')).toMatchObject({ golf: 2, zekerheid: 'waarschijnlijk' });
    expect(vakVanKorteNaam('Aardrijkskunde')?.bronnen).not.toContain('api');
  });
});

describe('laagsteZekerheid', () => {
  it('neemt de laagste en is zeker bij een lege lijst', () => {
    expect(laagsteZekerheid([])).toBe('zeker');
    expect(laagsteZekerheid(['zeker', 'waarschijnlijk'])).toBe('waarschijnlijk');
    expect(laagsteZekerheid(['waarschijnlijk', 'onzeker', 'zeker'])).toBe('onzeker');
  });
});

// ─── basisSet ────────────────────────────────────────────────────────────────

describe('basisSet', () => {
  it('leest een nieuwe lagere set: eindmoment L4, vak 3, golf 1 uit het vak, populatie en de leerjaren L1-L4', () => {
    const b = info(L4_WT);
    expect(b).toMatchObject({
      soort: 'bao',
      moment: 'lager',
      generatie: 'nieuw',
      eindmoment: 'L4',
      golf: 1,
      golfUit: 'vak',
      soortDoelen: 'populatie',
      leeg: false,
      geldigVanaf: 2025,
    });
    expect(b.vak?.nr).toBe(3);
    expect(b.leerjaren).toEqual(['L1', 'L2', 'L3', 'L4']);
    expect(b.geldigTotEnMet).toBeUndefined();
  });

  it('haalt het eindmoment zonder leerjaar uit de naam', () => {
    const zonder = { ...L4_WT, leerjaar: undefined };
    expect(info(zonder).eindmoment).toBe('L4');
    expect(info({ ...L6_WT, leerjaar: undefined }).eindmoment).toBe('L6');
    expect(info(L6_WT)).toMatchObject({ eindmoment: 'L6', leerjaren: ['L5', 'L6'] });
  });

  it('geeft een nieuwe lagere set zonder te lezen leerjaar geen eindmoment en geen leerjaren', () => {
    const b = info(kop('X', 'Lager Onderwijs -  Nederlands - Te bereiken minimumdoelen op populatieniveau', { korteNaam: 'Nederlands', aantal: 5 }));
    expect(b.eindmoment).toBeUndefined();
    expect(b.leerjaren).toEqual([]);
    expect(b.vak?.nr).toBe(1);
  });

  it('leest een nieuwe set van het buitengewoon basisonderwijs met na te streven doelen', () => {
    const b = info(
      kop('X', 'Buitengewoon Kleuteronderwijs -  Wiskunde - Na te streven minimumdoelen op populatieniveau', { ...NIEUW, korteNaam: 'Wiskunde', aantal: 9 }),
    );
    expect(b).toMatchObject({ soort: 'bubao', moment: 'kleuter', eindmoment: 'K3', soortDoelen: 'nastreven', golf: 1 });
    expect(b.vak?.nr).toBe(2);
    expect(b.leerjaren).toEqual(['K1', 'K2', 'K3']);
  });

  it('leest een nieuwe kleuterset zonder leerjaar: eindmoment K3', () => {
    expect(info(K_AK)).toMatchObject({ soort: 'bao', moment: 'kleuter', eindmoment: 'K3', golf: 2, golfUit: 'vak', soortDoelen: 'nastreven' });
  });

  it('leest een oude lagere set: eindtermen, alle leerjaren, geen vak, golf uit de einddatum', () => {
    const b = info(OUD_NL_EINDTERMEN);
    expect(b).toMatchObject({ soort: 'bao', moment: 'lager', generatie: 'oud', soortDoelen: 'eindtermen', golf: 1, golfUit: 'einddatum', geldigVanaf: 2010, geldigTotEnMet: 2027 });
    expect(b.vak).toBeUndefined();
    expect(b.eindmoment).toBeUndefined();
    expect(b.leerjaren).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6']);
  });

  it('geeft de golf van een oude set uit zijn einddatum: 2028 is golf 1, 2030 golf 2, 2029 en geen einddatum geen golf', () => {
    expect(info(OUD_NL_EINDTERMEN).golf).toBe(1);
    expect(info(OUD_FRANS)).toMatchObject({ golf: 2, golfUit: 'einddatum' });
    expect(info(OUD_EIND_2029)).toMatchObject({ golfUit: 'geen' });
    expect(info(OUD_EIND_2029).golf).toBeUndefined();
    expect(info(OUD_ZONDER_EINDE)).toMatchObject({ golfUit: 'geen', moment: 'kleuter', soort: 'bubao' });
    expect(info(OUD_ZONDER_EINDE).golf).toBeUndefined();
    expect(info(OUD_K_NL).golf).toBe(1);
    expect(info(OUD_K_MV).golf).toBe(2);
  });

  it('leest de soort doelen van een oude set uit de naam, niet uit het moment: bubao-lager is ontwikkelingsdoelen', () => {
    expect(info(OUD_BU_L_ONT)).toMatchObject({ soort: 'bubao', moment: 'lager', soortDoelen: 'ontwikkelingsdoelen' });
    expect(info(OUD_K_NL).soortDoelen).toBe('ontwikkelingsdoelen');
    expect(info(OUD_NL_EINDTERMEN).soortDoelen).toBe('eindtermen');
  });

  it('bepaalt de generatie uit het laatste naamdeel en nooit uit de versie', () => {
    expect(info({ ...L4_NL, versie: '2.1' }).generatie).toBe('nieuw');
    expect(info({ ...L4_NL, versie: undefined }).generatie).toBe('nieuw');
    expect(info({ ...L4_NL, versie: '1.0' }).generatie).toBe('nieuw');
    expect(info({ ...OUD_NL_EINDTERMEN, versie: '2.0' }).generatie).toBe('oud');
    expect(info({ ...OUD_NL_EINDTERMEN, versie: '3.0' }).generatie).toBe('oud');
  });

  it('merkt de schijnsets zonder doelen als leeg', () => {
    expect(info(OUD_LEEG).leeg).toBe(true);
    expect(info({ ...OUD_LEEG, aantal: 0 }).leeg).toBe(true);
    expect(info({ ...OUD_LEEG, aantal: 2 }).leeg).toBe(false);
    expect(info({ ...OUD_LEEG, korteNaam: 'Wiskunde' }).leeg).toBe(false);
    expect(info(OUD_NL_EINDTERMEN).leeg).toBe(false);
  });

  it('geeft undefined voor het secundair, de lerarenopleiding en een naam zonder moment', () => {
    expect(basisSet(SECUNDAIR)).toBeUndefined();
    expect(basisSet(LERARENOPLEIDING)).toBeUndefined();
    expect(basisSet(kop('X', 'Volwassenenonderwijs - Opleiding - Nederlands - Eindtermen'))).toBeUndefined();
    expect(basisSet(kop('X', 'Basisonderwijs - Leergebied - Nederlands - Eindtermen'))).toBeUndefined();
  });

  it('rekent met een meegegeven kalender', () => {
    const k: Invoeringskalender = { ...INVOERINGSKALENDER, vakken: INVOERINGSKALENDER.vakken.filter((v) => v.nr !== 1) };
    expect(basisSet(L4_NL, k)?.vak).toBeUndefined();
    expect(basisSet(L4_NL, k)?.golfUit).toBe('geen');
  });
});

describe('golfVanOudeSet', () => {
  it('zoekt de golf waarvan het laatste schooljaar past', () => {
    expect(golfVanOudeSet('bao', 'lager', '2028-08-31')).toBe(1);
    expect(golfVanOudeSet('bao', 'lager', '2030-08-31')).toBe(2);
    expect(golfVanOudeSet('bao', 'kleuter', '2027-08-31')).toBe(2);
    expect(golfVanOudeSet('bubao', 'kleuter', '2026-08-31')).toBe(1);
    expect(golfVanOudeSet('bubao', 'lager', '2030-08-31')).toBe(2);
  });

  it('geeft undefined zonder treffer of zonder einddatum', () => {
    expect(golfVanOudeSet('bao', 'lager', '2029-08-31')).toBeUndefined();
    expect(golfVanOudeSet('bao', 'lager', '2020-08-31')).toBeUndefined();
    expect(golfVanOudeSet('bao', 'lager', undefined)).toBeUndefined();
    expect(golfVanOudeSet('bao', 'lager', 'onzin')).toBeUndefined();
    // de einddatum van een andere moment past niet
    expect(golfVanOudeSet('bao', 'kleuter', '2028-08-31')).toBeUndefined();
  });

  it('geeft undefined bij twee treffers', () => {
    const k: Invoeringskalender = {
      ...INVOERINGSKALENDER,
      cellen: INVOERINGSKALENDER.cellen.map((c) => (c.soort === 'bao' && c.golf === 2 && c.leerjaar.startsWith('K') ? { ...c, vanaf: 2026 } : c)),
    };
    expect(golfVanOudeSet('bao', 'kleuter', '2026-08-31', k)).toBeUndefined();
  });
});

// ─── invoering met de echte kalender ─────────────────────────────────────────

describe('invoering: een nieuwe set van de eerste golf (L4, Nederlands)', () => {
  const b = info(L4_NL);

  it('is in 2026 verplicht voor L3 en mag al voor L4, allebei waarschijnlijk', () => {
    expect(status(b, 'L3', 2026)).toMatchObject({ status: 'verplicht', zekerheid: 'waarschijnlijk', verplichtVanaf: 2026 });
    const l4 = status(b, 'L4', 2026);
    expect(l4).toMatchObject({ status: 'mag', zekerheid: 'waarschijnlijk', verplichtVanaf: 2027 });
    expect(l4?.opmerking).toMatch(/getuigschrift/);
    expect(l4?.bronnen).toContain('cohortregel');
  });

  it('geeft undefined voor een leerjaar dat niet bij de set hoort', () => {
    expect(status(b, 'L5', 2026)).toBeUndefined();
    expect(status(b, 'K1', 2026)).toBeUndefined();
  });

  it('is in 2028 voor L4 verplicht en zeker: dan geldt er geen oude set meer', () => {
    expect(status(b, 'L4', 2028)).toMatchObject({ status: 'verplicht', zekerheid: 'zeker', verplichtVanaf: 2027 });
    expect(status(b, 'L1', 2035)).toMatchObject({ status: 'verplicht', zekerheid: 'zeker' });
  });

  it('is vóór geldigVan nog niet, en dat is zeker', () => {
    expect(status(b, 'L4', 2024)).toMatchObject({ status: 'nog-niet', zekerheid: 'zeker', bronnen: ['api'] });
    expect(status(b, 'L4', 2025)).toMatchObject({ status: 'mag' });
  });

  it('geeft per set een Invoering per leerjaar in de volgorde van de leerjaren', () => {
    const lijst = invoeringVanSet(b, 2026);
    expect(lijst.map((i) => i.leerjaar)).toEqual(['L1', 'L2', 'L3', 'L4']);
    expect(lijst.map((i) => i.status)).toEqual(['verplicht', 'verplicht', 'verplicht', 'mag']);
  });
});

describe('invoering: een oude lagere set van de eerste golf', () => {
  const b = info(OUD_NL_EINDTERMEN);

  it('is in 2026 voor L1-L3 vervangen, en geldt voor L4 en L5 tot en met 2026 en voor L6 tot en met 2027', () => {
    for (const lj of ['L1', 'L2', 'L3'] as const) expect(status(b, lj, 2026)).toMatchObject({ status: 'vervangen', laatsteSchooljaar: 2025 });
    expect(status(b, 'L4', 2026)).toMatchObject({ status: 'geldt', laatsteSchooljaar: 2026, zekerheid: 'waarschijnlijk' });
    expect(status(b, 'L5', 2026)).toMatchObject({ status: 'geldt', laatsteSchooljaar: 2026 });
    expect(status(b, 'L6', 2026)).toMatchObject({ status: 'geldt', laatsteSchooljaar: 2027 });
  });

  it('geldt voor L6 nog in 2027 en is in 2028 vervallen, en dat is zeker', () => {
    expect(status(b, 'L6', 2027)).toMatchObject({ status: 'geldt', laatsteSchooljaar: 2027 });
    expect(status(b, 'L6', 2028)).toMatchObject({ status: 'vervallen', zekerheid: 'zeker', bronnen: ['api'] });
    expect(status(b, 'L1', 2028)?.status).toBe('vervallen');
  });

  it('draagt de zekerheid van de golf van zijn eigen einddatum: nooit lager door een vak', () => {
    // Een oude set kent zijn golf uit de eigen einddatum; ook bij een vak dat bij de nieuwe sets nog waarschijnlijk is.
    const frans = info(OUD_FRANS);
    expect(status(frans, 'K1', 2026)).toBeUndefined();
    expect(status(frans, 'L1', 2027)).toMatchObject({ status: 'vervangen', zekerheid: 'waarschijnlijk' });
  });
});

describe('invoering: oude sets met een bijzondere einddatum', () => {
  it('geldt zonder einddatum altijd, zeker, met de reden geen-einddatum', () => {
    const b = info(OUD_ZONDER_EINDE);
    for (const sj of [2019, 2026, 2040]) {
      expect(status(b, 'K2', sj)).toMatchObject({ status: 'geldt', zekerheid: 'zeker', reden: 'geen-einddatum' });
    }
  });

  it('geldt met een einde in 2029 onzeker, met de reden einddatum-buiten-kalender', () => {
    const b = info(OUD_EIND_2029);
    expect(status(b, 'L3', 2026)).toMatchObject({ status: 'geldt', zekerheid: 'onzeker', reden: 'einddatum-buiten-kalender', laatsteSchooljaar: 2028 });
    expect(status(b, 'L3', 2029)?.status).toBe('vervallen');
  });

  it('geldt met een einde in 2020 in 2019 en is zeker, en is in 2026 vervallen', () => {
    const b = info(OUD_EIND_2020);
    expect(status(b, 'L2', 2019)).toMatchObject({ status: 'geldt', zekerheid: 'zeker', laatsteSchooljaar: 2019 });
    expect(status(b, 'L2', 2019)?.reden).toBeUndefined();
    expect(status(b, 'L2', 2026)).toMatchObject({ status: 'vervallen', zekerheid: 'zeker' });
  });

  it('is vervallen voor de oude kleuterset van golf 1 in 2026', () => {
    expect(invoeringVanSet(info(OUD_K_NL), 2026).map((i) => [i.leerjaar, i.status, i.zekerheid])).toEqual([
      ['K1', 'vervallen', 'zeker'],
      ['K2', 'vervallen', 'zeker'],
      ['K3', 'vervallen', 'zeker'],
    ]);
    expect(status(info(OUD_K_NL), 'K1', 2025)).toMatchObject({ status: 'geldt', zekerheid: 'zeker', laatsteSchooljaar: 2025 });
  });
});

describe('invoering: nieuwe sets in het buitengewoon onderwijs en met een onbekend vak', () => {
  it('geeft een nieuwe set met een onbekend vak altijd mag, onzeker, met de reden onbekend-vak, ook in 2035', () => {
    const b = info(L4_BURGER);
    expect(b.vak).toBeUndefined();
    expect(b.golfUit).toBe('geen');
    for (const sj of [2026, 2030, 2035]) {
      expect(status(b, 'L4', sj)).toMatchObject({ status: 'mag', zekerheid: 'onzeker', reden: 'onbekend-vak' });
    }
    expect(status(b, 'L4', 2024)?.status).toBe('nog-niet');
  });

  it('is voor de bubao-tweeling van de L4-set in 2026 voor L3 verplicht en onzeker', () => {
    const b = info(BU_L4_WT);
    expect(status(b, 'L3', 2026)).toMatchObject({ status: 'verplicht', zekerheid: 'onzeker' });
    expect(status(b, 'L4', 2026)).toMatchObject({ status: 'mag', zekerheid: 'onzeker', verplichtVanaf: 2027 });
  });

  it('is de bubao-kleuterset van de eerste golf in 2026 verplicht en zeker', () => {
    expect(invoeringVanSet(info(BU_K_NL), 2026).map((i) => [i.status, i.zekerheid])).toEqual([
      ['verplicht', 'zeker'],
      ['verplicht', 'zeker'],
      ['verplicht', 'zeker'],
    ]);
  });
});

describe('invoering: de zekerheid van de golf van het vak telt mee', () => {
  it('is zeker voor de kleuterset van Nederlands en voor Muzische vorming, waarvan de golf in de gegevens staat', () => {
    expect(invoeringVanSet(info(K_NL), 2026).every((i) => i.status === 'verplicht' && i.zekerheid === 'zeker')).toBe(true);
    expect(invoeringVanSet(info(K_MV), 2026).every((i) => i.status === 'mag' && i.zekerheid === 'zeker' && i.verplichtVanaf === 2027)).toBe(true);
  });

  it('is waarschijnlijk voor aardrijkskunde, ook al staat de cel van de kleuters zeker', () => {
    const b = info(K_AK);
    expect(b.vak?.zekerheid).toBe('waarschijnlijk');
    for (const i of invoeringVanSet(b, 2026)) expect(i).toMatchObject({ status: 'mag', zekerheid: 'waarschijnlijk', verplichtVanaf: 2027 });
    // ook nadat de kleuters allemaal verplicht zijn en de cel dus zeker is, blijft de golf van het vak waarschijnlijk
    for (const sj of [2027, 2035]) {
      for (const i of invoeringVanSet(b, sj)) expect(i).toMatchObject({ status: 'verplicht', zekerheid: 'waarschijnlijk' });
    }
  });

  it('is vóór geldigVan toch zeker: dat volgt uit de gegevens, niet uit de golf', () => {
    expect(status(info(K_AK), 'K1', 2024)).toMatchObject({ status: 'nog-niet', zekerheid: 'zeker' });
  });

  it('neemt de laagste van cel en vak, ook met een nagebootste kalender', () => {
    const k: Invoeringskalender = {
      ...INVOERINGSKALENDER,
      vakken: INVOERINGSKALENDER.vakken.map((v) => (v.nr === 1 ? { ...v, zekerheid: 'onzeker' as const } : v)),
    };
    const b = info(K_NL, k);
    expect(b.vak?.zekerheid).toBe('onzeker');
    expect(status(b, 'K1', 2026, k)?.zekerheid).toBe('onzeker');
    expect(status(b, 'K1', 2035, k)?.zekerheid).toBe('onzeker');
    // met de echte kalender is dezelfde set zeker
    expect(status(info(K_NL), 'K1', 2026)?.zekerheid).toBe('zeker');
  });
});

describe('invoering: een nagebootste kalender bewijst dat de jaren uit de gegevens komen', () => {
  const k: Invoeringskalender = {
    ...INVOERINGSKALENDER,
    cellen: INVOERINGSKALENDER.cellen.map((c) => {
      if (c.soort === 'bao' && c.golf === 1 && (c.leerjaar === 'L4' || c.leerjaar === 'L5')) return { ...c, vanaf: 2040 };
      if (c.soort === 'bao' && c.golf === 1 && c.leerjaar === 'L6') return { ...c, vanaf: 2041 };
      return c;
    }),
  };

  it('geeft een nieuwe set voor L4 in 2030 mag, met verplichtVanaf 2040', () => {
    const b = info(L4_NL, k);
    expect(status(b, 'L4', 2030, k)).toMatchObject({ status: 'mag', verplichtVanaf: 2040 });
    expect(status(b, 'L4', 2040, k)).toMatchObject({ status: 'verplicht' });
    // met de echte kalender is L4 in 2030 al lang verplicht
    expect(status(info(L4_NL), 'L4', 2030)?.status).toBe('verplicht');
  });

  it('geeft een oude lagere set van golf 1 alleen nog een golf met de nieuwe einddatum', () => {
    const nieuwEinde = { ...OUD_NL_EINDTERMEN, geldigTot: '2041-08-31' };
    expect(info(nieuwEinde, k)).toMatchObject({ golf: 1, golfUit: 'einddatum' });
    // de oude einddatum past niet meer: geen golf, en dus onzeker
    const oudEinde = info(OUD_NL_EINDTERMEN, k);
    expect(oudEinde.golf).toBeUndefined();
    expect(status(oudEinde, 'L3', 2026, k)).toMatchObject({ status: 'geldt', zekerheid: 'onzeker', reden: 'einddatum-buiten-kalender' });
  });

  it('rekent de einde van een oude set voor de nagebootste kalender uit de cel', () => {
    const b = info({ ...OUD_NL_EINDTERMEN, geldigTot: '2041-08-31' }, k);
    expect(status(b, 'L4', 2030, k)).toMatchObject({ status: 'geldt', laatsteSchooljaar: 2039 });
    expect(status(b, 'L4', 2040, k)).toMatchObject({ status: 'vervangen', laatsteSchooljaar: 2039 });
  });
});

// ─── kalenderVoorSet ─────────────────────────────────────────────────────────

describe('kalenderVoorSet', () => {
  it('maakt van L1-L3 één regel en houdt L4 apart, met de opmerking over het getuigschrift', () => {
    const regels = kalenderVoorSet(info(L4_NL));
    expect(regels).toHaveLength(2);
    expect(regels[0]).toMatchObject({ leerjaren: ['L1', 'L2', 'L3'], soort: 'verplicht-vanaf', jaar: 2026, zekerheid: 'waarschijnlijk' });
    expect(regels[0].opmerking).toBeUndefined();
    expect(regels[1]).toMatchObject({ leerjaren: ['L4'], soort: 'verplicht-vanaf', jaar: 2027, zekerheid: 'waarschijnlijk' });
    expect(regels[1].opmerking).toMatch(/getuigschrift/);
  });

  it('geeft voor een set van het 6de leerjaar L5 en L6 apart, L6 met de opmerking', () => {
    const regels = kalenderVoorSet(info(L6_WT));
    expect(regels.map((r) => [r.leerjaren, r.jaar])).toEqual([[['L5'], 2027], [['L6'], 2028]]);
    expect(regels[0].opmerking).toBeUndefined();
    expect(regels[1].opmerking).toMatch(/2028-2029/);
  });

  it('groepeert bij een oude set L4 en L5 samen en L6 apart', () => {
    const regels = kalenderVoorSet(info(OUD_NL_EINDTERMEN));
    expect(regels.map((r) => [r.leerjaren, r.soort, r.jaar])).toEqual([
      [['L1', 'L2', 'L3'], 'laatste-schooljaar', 2025],
      [['L4', 'L5'], 'laatste-schooljaar', 2026],
      [['L6'], 'laatste-schooljaar', 2027],
    ]);
    // de opmerkingen van de cellen gaan over de nieuwe doelen en blijven bij de oude set weg
    for (const r of regels) expect(r.opmerking).toBeUndefined();
  });

  it('geeft de kleuterset van golf 1 één regel die zeker is', () => {
    expect(kalenderVoorSet(info(K_NL))).toMatchObject([{ leerjaren: ['K1', 'K2', 'K3'], soort: 'verplicht-vanaf', jaar: 2026, zekerheid: 'zeker' }]);
  });

  it('geeft de golf van aardrijkskunde een waarschijnlijke regel, ook bij de zekere kleutercel', () => {
    expect(kalenderVoorSet(info(K_AK))).toMatchObject([{ leerjaren: ['K1', 'K2', 'K3'], jaar: 2027, zekerheid: 'waarschijnlijk' }]);
  });

  it('geeft een oude set zonder einde één regel geen-einde, zeker', () => {
    expect(kalenderVoorSet(info(OUD_ZONDER_EINDE))).toMatchObject([
      { leerjaren: ['K1', 'K2', 'K3'], soort: 'geen-einde', zekerheid: 'zeker', reden: 'geen-einddatum' },
    ]);
  });

  it('geeft een oude set met een einde buiten de kalender een onzekere regel met dat einde', () => {
    expect(kalenderVoorSet(info(OUD_EIND_2029))).toMatchObject([
      { leerjaren: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'], soort: 'laatste-schooljaar', jaar: 2028, zekerheid: 'onzeker', reden: 'einddatum-buiten-kalender' },
    ]);
    expect(kalenderVoorSet(info(OUD_EIND_2020))).toMatchObject([{ jaar: 2019, zekerheid: 'zeker' }]);
  });

  it('geeft een nieuwe set met een onbekend vak één regel onbekend, onzeker', () => {
    expect(kalenderVoorSet(info(L4_BURGER))).toMatchObject([{ leerjaren: ['L1', 'L2', 'L3', 'L4'], soort: 'onbekend', zekerheid: 'onzeker', reden: 'onbekend-vak' }]);
  });

  it('geeft een lege set geen regels', () => {
    expect(kalenderVoorSet(info(OUD_LEEG))).toEqual([]);
  });

  it('geeft de bubao-regels van het lager onzeker, met de opmerking dat de invoering nog niet bevestigd is', () => {
    const regels = kalenderVoorSet(info(BU_L4_WT));
    expect(regels.map((r) => r.zekerheid)).toEqual(['onzeker', 'onzeker']);
    expect(regels[0].opmerking).toMatch(/nog niet bevestigd/);
  });

  it('draagt de bronnen van de cel; samengevoegde regels hebben elke bron één keer', () => {
    const [eerste] = kalenderVoorSet(info(L4_NL));
    expect(eerste.bronnen).toEqual(['codex', 'klasse-2026', 'cohortregel']);
    for (const r of kalenderVoorSet(info(OUD_NL_EINDTERMEN))) expect(new Set(r.bronnen).size).toBe(r.bronnen.length);
  });
});

// ─── setsDieGelden, tweelingSets ─────────────────────────────────────────────

let teller = 0;
const index = (...koppen: Kop[]): MinimumdoelenIndexSet[] =>
  koppen.map((s) => ({
    id: s.id,
    naam: s.naam,
    korteNaam: s.korteNaam,
    versie: s.versie,
    geldigheid: s.geldigheid,
    geldigVan: s.geldigVan,
    geldigTot: s.geldigTot,
    leerjaar: s.leerjaar,
    aantal: s.aantal ?? 1,
    sha256: `sha${++teller}`,
    opgehaald: '2026-11-01T00:00:00Z',
    bestand: `${s.id}.json`,
  }));

describe('setsDieGelden: een nagebootste index van 8 sets', () => {
  const alle = index(L4_NL, L4_BURGER, OUD_NL_EINDTERMEN, OUD_FRANS, OUD_LEREN_LEREN, OUD_LEEG, BU_L4_WT, SECUNDAIR);
  const ids = (l: { set: MinimumdoelenIndexSet }[]) => l.map((g) => g.set.id);

  it('verdeelt voor het 3de leerjaar in 2026 over verplicht, geldt nog en mag al, in de volgorde van de index', () => {
    const g = setsDieGelden(alle, { soort: 'bao', leerjaar: 'L3', schooljaar: 2026 });
    expect(ids(g.verplicht)).toEqual(['N_L4_NL']);
    expect(ids(g.geldtNog)).toEqual(['O_L_FR', 'O_L_LL']);
    // een nieuwe set met een onbekend vak is nooit verplicht: hij mag al, en dat is onzeker
    expect(ids(g.magAl)).toEqual(['N_L4_BU']);
    expect(g.leeg).toEqual([]);
    expect(g.soort).toBe('bao');
    expect(g.leerjaar).toBe('L3');
    expect(g.schooljaar).toBe(2026);
    expect(g.zekerheid).toBe('onzeker');
  });

  it('zet voor het 4de leerjaar in 2026 beide nieuwe sets onder mag al en de oude sets die nog gelden onder geldt nog', () => {
    const g = setsDieGelden(alle, { soort: 'bao', leerjaar: 'L4', schooljaar: 2026 });
    expect(ids(g.verplicht)).toEqual([]);
    expect(ids(g.magAl)).toEqual(['N_L4_NL', 'N_L4_BU']);
    expect(ids(g.geldtNog)).toEqual(['O_L_NL', 'O_L_FR', 'O_L_LL']);
  });

  it('neemt de laagste zekerheid over verplicht, geldt nog en mag al', () => {
    const zonderBurger = index(L4_NL, OUD_NL_EINDTERMEN, OUD_FRANS, SECUNDAIR);
    expect(setsDieGelden(zonderBurger, { soort: 'bao', leerjaar: 'L3', schooljaar: 2026 }).zekerheid).toBe('waarschijnlijk');
    // in 2031 is er alleen nog een zekere nieuwe set
    expect(setsDieGelden(zonderBurger, { soort: 'bao', leerjaar: 'L3', schooljaar: 2031 })).toMatchObject({ zekerheid: 'zeker', geldtNog: [] });
  });

  it('laat vervangen sets weg en zet de lege set alleen onder leeg', () => {
    const g = setsDieGelden(alle, { soort: 'bubao', leerjaar: 'L3', schooljaar: 2026 });
    expect(ids(g.verplicht)).toEqual(['N_BU_L4_WT']);
    expect(ids(g.geldtNog)).toEqual([]);
    expect(g.leeg.map((s) => s.id)).toEqual(['O_BU_LEEG']);
    expect(g.zekerheid).toBe('onzeker');
  });

  it('laat een secundaire set nooit meedoen en een soort niet de andere', () => {
    for (const soort of ['bao', 'bubao'] as const) {
      const g = setsDieGelden(alle, { soort, leerjaar: 'L1', schooljaar: 2026 });
      const alleIds = [...g.verplicht, ...g.geldtNog, ...g.magAl].map((x) => x.set.id);
      expect(alleIds).not.toContain('S_1');
    }
    expect(ids(setsDieGelden(alle, { soort: 'bao', leerjaar: 'L1', schooljaar: 2026 }).verplicht)).not.toContain('N_BU_L4_WT');
  });

  it('geeft geen enkele set en zekerheid zeker voor een leerjaar waarvoor niets in de index staat', () => {
    const g = setsDieGelden(alle, { soort: 'bao', leerjaar: 'K1', schooljaar: 2026 });
    expect(g.verplicht).toEqual([]);
    expect(g.geldtNog).toEqual([]);
    expect(g.magAl).toEqual([]);
    expect(g.zekerheid).toBe('zeker');
  });

  it('laat een set die vervangen of vervallen is, of nog niet geldt, buiten alle lijsten', () => {
    const jaar2024 = setsDieGelden(alle, { soort: 'bao', leerjaar: 'L1', schooljaar: 2024 });
    expect(ids(jaar2024.verplicht)).toEqual([]);
    expect(ids(jaar2024.magAl)).toEqual([]);
    expect(ids(jaar2024.geldtNog)).toEqual(['O_L_NL', 'O_L_FR', 'O_L_LL']);
    const jaar2031 = setsDieGelden(alle, { soort: 'bao', leerjaar: 'L1', schooljaar: 2031 });
    expect(ids(jaar2031.geldtNog)).toEqual([]);
    expect(ids(jaar2031.verplicht)).toEqual(['N_L4_NL']);
  });

  it('geeft een volgorde van de index, niet van de id', () => {
    const omgekeerd = index(OUD_LEREN_LEREN, OUD_FRANS);
    expect(ids(setsDieGelden(omgekeerd, { soort: 'bao', leerjaar: 'L1', schooljaar: 2026 }).geldtNog)).toEqual(['O_L_LL', 'O_L_FR']);
  });

  it('zet een oude set zonder nieuwe tegenhanger (Leren leren) op geldt nog tot hij zelf eindigt', () => {
    const lijst = (lj: LeerjaarBasis, sj: number) => ids(setsDieGelden(alle, { soort: 'bao', leerjaar: lj, schooljaar: sj }).geldtNog);
    expect(lijst('L2', 2026)).toContain('O_L_LL');
    expect(lijst('L6', 2029)).toContain('O_L_LL');
    expect(lijst('L6', 2030)).not.toContain('O_L_LL');
    // het 2de leerjaar volgt vanaf 2027 de nieuwe doelen van de tweede golf: de oude set is er niet meer verplicht
    expect(lijst('L2', 2027)).not.toContain('O_L_LL');
  });
});

describe('een oude set zonder nieuwe tegenhanger (Leren leren)', () => {
  const alle = index(L4_NL, L6_WT, K_AK, OUD_LEREN_LEREN);
  const b = info(OUD_LEREN_LEREN);

  it('heeft geen tweeling: het model koppelt geen oude aan nieuwe sets', () => {
    expect(tweelingSets(b, alle)).toEqual([]);
  });

  it('is vanaf 2027 voor het 1ste tot 3de leerjaar niet meer verplicht en geldt verder nog tot zijn einde', () => {
    expect(invoeringVanSet(b, 2027).map((i) => i.status)).toEqual(['vervangen', 'vervangen', 'vervangen', 'geldt', 'geldt', 'geldt']);
    expect(invoeringVanSet(b, 2030).map((i) => i.status)).toEqual(Array(6).fill('vervallen'));
  });

  it('krijgt teksten die niet zeggen door welke set hij vervangen wordt', () => {
    const vervangen = invoeringVanSet(b, 2027).filter((i) => i.status === 'vervangen').map((i) => i.leerjaar);
    expect(vervangenTekst(vervangen)).toBe('Niet meer verplicht voor het 1ste, 2de en 3de leerjaar: daar gelden de nieuwe minimumdoelen.');
    expect(statusDeel('vervangen', vervangen)).toBe('niet meer verplicht in het 1ste, 2de en 3de leerjaar');
    expect(voorWieTekst(b)).toBe('Oude eindtermen voor het hele lager onderwijs.');
  });
});

describe('tweelingSets', () => {
  const alle = index(L4_WT, BU_L4_WT, L4_NL, K_NL, BU_K_NL, K_AK, OUD_NL_EINDTERMEN, L4_BURGER, L6_WT);

  it('geeft de nieuwe sets van de andere basissoort met hetzelfde vak en eindmoment', () => {
    expect(tweelingSets(info(L4_WT), alle).map((s) => s.id)).toEqual(['N_BU_L4_WT']);
    expect(tweelingSets(info(BU_L4_WT), alle).map((s) => s.id)).toEqual(['N_L4_WT']);
    expect(tweelingSets(info(K_NL), alle).map((s) => s.id)).toEqual(['N_BU_K_NL']);
  });

  it('geeft [] voor een oude set, een set zonder vak of zonder tweeling', () => {
    expect(tweelingSets(info(OUD_NL_EINDTERMEN), alle)).toEqual([]);
    expect(tweelingSets(info(L4_BURGER), alle)).toEqual([]);
    expect(tweelingSets(info(K_AK), alle)).toEqual([]);
    expect(tweelingSets(info(L6_WT), alle)).toEqual([]);
    expect(tweelingSets(info({ ...L4_WT, leerjaar: undefined, naam: 'Lager Onderwijs -  Wetenschap en techniek - Te bereiken minimumdoelen op populatieniveau' }), alle)).toEqual([]);
  });
});

// ─── doelInfo ────────────────────────────────────────────────────────────────

describe('doelInfo', () => {
  it('haalt het vak uit de code: 10.2.1 geeft vak 10', () => {
    const frans = info(
      kop('N_L6_FR', 'Lager Onderwijs 6de leerjaar -  Frans - Na te streven minimumdoelen op populatieniveau', { ...NIEUW, korteNaam: 'Frans', leerjaar: '6de leerjaar' }),
    );
    expect(doelInfo({ code: '10.2.1' }, frans)).toMatchObject({ vak: 10, eindmoment: 'L6', soortDoel: 'nastreven' });
    expect(doelInfo({ code: '3.5.4' }, info(L4_WT)).vak).toBe(3);
  });

  it('geeft geen vak voor HD 3, INFO, een code buiten 1 tot 10 of een oude set', () => {
    const b = info(L4_WT);
    expect(doelInfo({ code: 'HD 3' }, b).vak).toBeUndefined();
    expect(doelInfo({ code: 'INFO' }, b).vak).toBeUndefined();
    expect(doelInfo({ code: '11.1.1' }, b).vak).toBeUndefined();
    expect(doelInfo({ code: '0.1.1' }, b).vak).toBeUndefined();
    expect(doelInfo({ code: '3.5' }, b).vak).toBeUndefined();
    expect(doelInfo({ code: '3.5.4' }, info(OUD_NL_EINDTERMEN)).vak).toBeUndefined();
  });

  it('geeft het eindmoment van de set: een doel heeft geen eigen leerjaar', () => {
    expect(doelInfo({ code: '3.1.1' }, info(L6_WT)).eindmoment).toBe('L6');
    expect(doelInfo({ code: '3.1.1' }, info(K_AK)).eindmoment).toBe('K3');
    expect(doelInfo({ code: '1' }, info(OUD_NL_EINDTERMEN)).eindmoment).toBeUndefined();
  });

  it('laat het type van het doel winnen van de soort doelen van de set, en valt anders terug op de set', () => {
    const b = info(L4_WT);
    expect(doelInfo({ code: '3.1.1', type: 'Na te streven minimumdoelen op populatieniveau' }, b).soortDoel).toBe('nastreven');
    expect(doelInfo({ code: '3.1.1', type: 'Te bereiken minimumdoelen op populatieniveau' }, b).soortDoel).toBe('populatie');
    expect(doelInfo({ code: '3.1.1' }, b).soortDoel).toBe('populatie');
    expect(doelInfo({ code: '3.1.1', type: 'onbekend' }, b).soortDoel).toBe('populatie');
    expect(doelInfo({ code: '1', type: 'Eindtermen' }, info(OUD_NL_EINDTERMEN)).soortDoel).toBe('eindtermen');
  });

  it('hangt de soort doel aan het paar (doel, set): hetzelfde doel is populatie in de ene en nastreven in de andere set', () => {
    const doel = { code: '3.5.4' };
    expect(doelInfo(doel, info(L4_WT)).soortDoel).toBe('populatie');
    expect(doelInfo(doel, info(BU_L4_WT)).soortDoel).toBe('nastreven');
  });
});

// ─── geldigheidTekstBasis ────────────────────────────────────────────────────

describe('geldigheidTekstBasis', () => {
  const NAAM_OUD = OUD_NL_EINDTERMEN.naam;

  it("geeft bij 'Geldig' met een einddatum 'Geldig tot 31 augustus 2028'", () => {
    const g = { geldigheid: 'Geldig', geldigVan: '2010-09-01', geldigTot: '2028-08-31' };
    expect(geldigheidTekstBasis(NAAM_OUD, g)).toBe('Geldig tot 31 augustus 2028');
    expect(geldigheidTekstBasis(NAAM_OUD, g, '2026-11-02')).toBe('Geldig tot 31 augustus 2028');
  });

  it('blijft op de einddatum zelf nog Geldig tot en wordt de dag erna Gold tot', () => {
    const g = { geldigheid: 'Geldig', geldigVan: '2010-09-01', geldigTot: '2028-08-31' };
    expect(geldigheidTekstBasis(NAAM_OUD, g, '2028-08-31')).toBe('Geldig tot 31 augustus 2028');
    expect(geldigheidTekstBasis(NAAM_OUD, g, '2028-09-01')).toBe('Gold tot 31 augustus 2028');
    expect(geldigheidTekstBasis(NAAM_OUD, g, '2040-01-01')).toBe('Gold tot 31 augustus 2028');
    expect(geldigheidTekstBasis(NAAM_OUD, g, '2028-09-01T10:00:00Z')).toBe('Gold tot 31 augustus 2028');
  });

  it('blijft bij Geldig tot als vandaag ontbreekt of niet te lezen is', () => {
    const g = { geldigheid: 'Geldig', geldigTot: '2028-08-31' };
    expect(geldigheidTekstBasis(NAAM_OUD, g, undefined)).toBe('Geldig tot 31 augustus 2028');
    expect(geldigheidTekstBasis(NAAM_OUD, g, 'onzin')).toBe('Geldig tot 31 augustus 2028');
  });

  it("geeft bao zonder einddatum 'Geldig sinds 2025'", () => {
    expect(geldigheidTekstBasis(L4_NL.naam, { geldigheid: 'Geldig', geldigVan: '2025-09-01' }, '2030-01-01')).toBe('Geldig sinds 2025');
  });

  it("geeft 'Niet meer geldig' precies geldigheidTekst", () => {
    const g = { geldigheid: 'Niet meer geldig', geldigVan: '1998-09-01', geldigTot: '2026-08-31' };
    expect(geldigheidTekstBasis(OUD_K_NL.naam, g)).toBe(geldigheidTekst(g));
    expect(geldigheidTekstBasis(OUD_K_NL.naam, g, '2026-11-02')).toBe('Niet meer geldig (1998–2026)');
  });

  it("geeft een set van het secundair met 'Geldig' én een geldigTot precies geldigheidTekst", () => {
    const g = { geldigheid: 'Geldig', geldigVan: '2019-09-01', geldigTot: '2030-08-31' };
    expect(geldigheidTekstBasis(SECUNDAIR.naam, g)).toBe(geldigheidTekst(g));
    expect(geldigheidTekstBasis(SECUNDAIR.naam, g, '2040-01-01')).toBe(geldigheidTekst(g));
    expect(geldigheidTekstBasis(LERARENOPLEIDING.naam, g, '2040-01-01')).toBe(geldigheidTekst(g));
  });

  it('geeft zonder geldigheid niets, zoals geldigheidTekst', () => {
    expect(geldigheidTekstBasis(NAAM_OUD, {})).toBeUndefined();
    expect(geldigheidTekstBasis(NAAM_OUD, { geldigheid: 'Onbekend' }, '2026-11-02')).toBe('Geldigheid niet vermeld');
  });

  it('negeert een einddatum die niet met JJJJ-MM-DD begint', () => {
    expect(geldigheidTekstBasis(NAAM_OUD, { geldigheid: 'Geldig', geldigVan: '2010-09-01', geldigTot: 'ooit' })).toBe('Geldig sinds 2010');
  });
});

// ─── kalenderTegenGegevens ───────────────────────────────────────────────────

describe('kalenderTegenGegevens', () => {
  const compleet = (): Kop[] => [
    kop('A', 'Kleuteronderwijs - Leergebied - Nederlands - Ontwikkelingsdoelen', { ...OUD, korteNaam: 'Nederlands', geldigTot: '2026-08-31' }),
    kop('B', 'Kleuteronderwijs - Leergebied - Muzische Vorming - Ontwikkelingsdoelen', { ...OUD, korteNaam: 'Muzische Vorming', geldigTot: '2027-08-31' }),
    kop('C', 'Lager Onderwijs - Leergebied - Nederlands - Eindtermen', { ...OUD, korteNaam: 'Nederlands', geldigTot: '2028-08-31' }),
    kop('D', 'Lager Onderwijs - Leergebied - Frans - Eindtermen', { ...OUD, korteNaam: 'Frans', geldigTot: '2030-08-31' }),
    kop('E', 'Buitengewoon Kleuteronderwijs Type 3 - Leergebied - Wiskunde - Ontwikkelingsdoelen', { ...OUD, korteNaam: 'Wiskunde', geldigTot: '2026-08-31' }),
    kop('F', 'Buitengewoon Kleuteronderwijs Type 3 - Leergebied - ICT - Ontwikkelingsdoelen', { ...OUD, korteNaam: 'ICT', geldigTot: '2027-08-31' }),
    kop('G', 'Buitengewoon Lager Onderwijs Type 3 - Leergebied - Wiskunde - Ontwikkelingsdoelen', { ...OUD, korteNaam: 'Wiskunde', geldigTot: '2028-08-31' }),
    kop('H', 'Buitengewoon Lager Onderwijs Type 3 - Leergebied - ICT - Ontwikkelingsdoelen', { ...OUD, korteNaam: 'ICT', geldigTot: '2030-08-31' }),
    L4_NL,
    BU_L4_WT,
    SECUNDAIR,
  ];

  it('geeft geen enkele afwijking als de einddata bij de kalender passen', () => {
    expect(kalenderTegenGegevens(index(...compleet()))).toEqual([]);
  });

  it('meldt een einddatum waar de kalender er een verwacht en geen enkele oude set op eindigt', () => {
    const zonderH = compleet().filter((s) => s.id !== 'H');
    const fouten = kalenderTegenGegevens(index(...zonderH));
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toMatch(/buitengewoon basisonderwijs \(lager, golf 2\)/);
    expect(fouten[0]).toMatch(/31 augustus 2030/);
  });

  it('meldt een oude set met een einddatum die in geen enkele golf past', () => {
    const fouten = kalenderTegenGegevens(index(...compleet(), OUD_EIND_2029));
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toMatch(/O_L_2029/);
    expect(fouten[0]).toMatch(/31 augustus 2029/);
  });

  it('meldt een oude set zonder einddatum of met een einde vóór de invoering niet', () => {
    expect(kalenderTegenGegevens(index(...compleet(), OUD_ZONDER_EINDE, OUD_EIND_2020))).toEqual([]);
  });

  it('meldt een nieuwe set met een vak dat niet in de kalender staat, met de korte naam erbij', () => {
    const fouten = kalenderTegenGegevens(index(...compleet(), L4_BURGER));
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toMatch(/N_L4_BU/);
    expect(fouten[0]).toMatch(/Burgerschap/);
  });

  it('meldt een nieuwe lagere set waarvan het leerjaar niet te lezen is', () => {
    const zonder = kop('N_X', 'Lager Onderwijs -  Nederlands - Te bereiken minimumdoelen op populatieniveau', { ...NIEUW, korteNaam: 'Nederlands' });
    const fouten = kalenderTegenGegevens(index(...compleet(), zonder));
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toMatch(/N_X/);
  });

  it('meldt een set van het basisonderwijs waarvan het moment niet te lezen is', () => {
    const fouten = kalenderTegenGegevens(index(...compleet(), kop('M_X', 'Basisonderwijs - Leergebied - Nederlands - Eindtermen')));
    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toMatch(/M_X/);
  });

  it('laat de lerarenopleiding en het secundair met rust', () => {
    expect(kalenderTegenGegevens(index(...compleet(), LERARENOPLEIDING))).toEqual([]);
  });

  it('rekent met een meegegeven kalender', () => {
    const k: Invoeringskalender = {
      ...INVOERINGSKALENDER,
      cellen: INVOERINGSKALENDER.cellen.map((c) => (c.soort === 'bao' && c.golf === 2 && c.leerjaar.startsWith('K') ? { ...c, vanaf: 2028 } : c)),
    };
    const fouten = kalenderTegenGegevens(index(...compleet()), k);
    expect(fouten.some((f) => /31 augustus 2028/.test(f) && /kleuter, golf 2/.test(f))).toBe(true);
  });
});

// ─── De vaste teksten ────────────────────────────────────────────────────────

describe('leerjarenTekst', () => {
  it('schrijft leerjaren en kleuterklassen als zin', () => {
    expect(leerjarenTekst(['L1', 'L2', 'L3'])).toBe('1ste, 2de en 3de leerjaar');
    expect(leerjarenTekst(['L4'])).toBe('4de leerjaar');
    expect(leerjarenTekst(['L4', 'L5'])).toBe('4de en 5de leerjaar');
    expect(leerjarenTekst(['K1', 'K2', 'K3'])).toBe('1ste, 2de en 3de kleuterklas');
    expect(leerjarenTekst(['K1', 'K2'])).toBe('1ste en 2de kleuterklas');
  });

  it('zet met lidwoord het of de ervoor', () => {
    expect(leerjarenTekst(['L4', 'L5'], true)).toBe('het 4de en 5de leerjaar');
    expect(leerjarenTekst(['L1', 'L2', 'L3'], true)).toBe('het 1ste, 2de en 3de leerjaar');
    expect(leerjarenTekst(['K1', 'K2', 'K3'], true)).toBe('de 1ste, 2de en 3de kleuterklas');
    expect(leerjarenTekst(['L6'], true)).toBe('het 6de leerjaar');
  });

  it('sorteert, laat dubbelen weg en kent een lege lijst en een mengeling', () => {
    expect(leerjarenTekst(['L3', 'L1', 'L3'])).toBe('1ste en 3de leerjaar');
    expect(leerjarenTekst([])).toBe('');
    expect(leerjarenTekst(['K3', 'L1'])).toBe('3de kleuterklas en 1ste leerjaar');
    expect(leerjarenTekst(['K3', 'L1'], true)).toBe('de 3de kleuterklas en het 1ste leerjaar');
  });
});

describe('de vaste labels', () => {
  it('geven de afgesproken teksten', () => {
    expect(EINDMOMENT_LABEL).toEqual({
      K3: 'Einde kleuteronderwijs (3de kleuterklas)',
      L4: 'Einde 4de leerjaar',
      L6: 'Einde 6de leerjaar',
    });
    expect(MOMENT_OUD_LABEL).toEqual({ kleuter: 'Kleuteronderwijs', lager: 'Lager onderwijs (één set voor alle leerjaren)' });
    expect(SOORT_DOELEN_LABEL).toEqual({
      populatie: 'Te bereiken op populatieniveau',
      individueel: 'Te bereiken op individueel niveau',
      nastreven: 'Na te streven',
      ontwikkelingsdoelen: 'Ontwikkelingsdoelen (oud)',
      eindtermen: 'Eindtermen (oud)',
    });
    expect(ZEKERHEID_LABEL).toEqual({ waarschijnlijk: 'waarschijnlijk', onzeker: 'nog onzeker' });
    expect(BRON_HOE_LABEL).toEqual({
      gegevens: 'officiële gegevens',
      gelezen: 'nagelezen',
      zoekfragment: 'zoekresultaat (niet geopend)',
      afgeleid: 'afgeleid',
      'nog-te-lezen': 'nog te lezen',
    });
  });

  it('geven bij zeker geen badge', () => {
    expect(zekerheidLabel('zeker')).toBeUndefined();
    expect(zekerheidLabel('waarschijnlijk')).toBe('waarschijnlijk');
    expect(zekerheidLabel('onzeker')).toBe('nog onzeker');
  });

  it('zeggen bij een vervangen set alleen dat hij niet meer verplicht is, zonder een koppeling te beweren', () => {
    expect(STATUS_LABEL.vervangen).toBe('niet meer verplicht');
    expect(STATUS_LABEL.verplicht).toBe('verplicht');
    expect(STATUS_LABEL.mag).toBe('mag al');
    expect(STATUS_LABEL.geldt).toBe('geldt nog');
    expect(STATUS_LABEL.vervallen).toBe('geldt niet meer');
    expect(STATUS_LABEL['nog-niet']).toBe('nog niet');
    expect(statusDeel('verplicht', ['L1', 'L2', 'L3'])).toBe('verplicht in het 1ste, 2de en 3de leerjaar');
    expect(statusDeel('mag', ['L4'])).toBe('mag al in het 4de leerjaar');
    expect(statusDeel('vervangen', ['L1', 'L2', 'L3'])).toBe('niet meer verplicht in het 1ste, 2de en 3de leerjaar');
  });

  it('geven de uitleg bij de zekerheid en bij de redenen', () => {
    expect(ZEKERHEID_UITLEG.waarschijnlijk).toBe(
      'Waarschijnlijk: afgeleid uit het decreet zoals Klasse en de Codex het citeren. De officiële tabel van de Vlaamse overheid is nog niet nagelezen.',
    );
    expect(ZEKERHEID_UITLEG.onzeker).toBe(
      'Nog onzeker: de oude doelen eindigen op dezelfde dagen als in het gewoon basisonderwijs, maar of de invoering per leerjaar hier ook zo loopt, is nog niet bevestigd.',
    );
    expect(ZEKERHEID_UITLEG['einddatum-buiten-kalender']).toBe('Nog onzeker: de einddatum van deze set past niet in de kalender van de app. Kijk de officiële bron na.');
    expect(ZEKERHEID_UITLEG['onbekend-vak']).toBe('Nog onzeker: dit vak staat nog niet in de kalender van de app.');
    expect(zekerheidUitleg('zeker')).toBeUndefined();
    expect(zekerheidUitleg('zeker', 'geen-einddatum')).toBeUndefined();
    expect(zekerheidUitleg('waarschijnlijk')).toBe(ZEKERHEID_UITLEG.waarschijnlijk);
    expect(zekerheidUitleg('onzeker')).toBe(ZEKERHEID_UITLEG.onzeker);
    expect(zekerheidUitleg('onzeker', 'einddatum-buiten-kalender')).toBe(ZEKERHEID_UITLEG['einddatum-buiten-kalender']);
    expect(zekerheidUitleg('onzeker', 'onbekend-vak')).toBe(ZEKERHEID_UITLEG['onbekend-vak']);
  });

  it('zeggen bij de golf van een vak één zin, en uitleg als die niet vaststaat', () => {
    expect(GOLF_TEKST[1]).toBe('Dit vak hoort bij de eerste golf (Nederlands, wiskunde, wetenschap en techniek).');
    expect(GOLF_TEKST[2]).toBe('Dit vak hoort bij de tweede golf (de andere vakken).');
    expect(GOLF_ZEKERHEID_UITLEG.waarschijnlijk).toMatch(/^Waarschijnlijk:/);
    expect(GOLF_ZEKERHEID_UITLEG.onzeker).toMatch(/^Nog onzeker:/);
  });
});

describe('de zinnen van het blok', () => {
  it('zegt voor wie een nieuwe set is, per eindmoment', () => {
    expect(voorWieTekst(info(L4_NL))).toBe(
      'Doelen voor het einde van het 4de leerjaar. Het 1ste, 2de en 3de leerjaar werken ernaartoe; het leerplan van je net legt de tussenstappen vast.',
    );
    expect(voorWieTekst(info(L6_WT))).toBe(
      'Doelen voor het einde van het 6de leerjaar. Het 5de leerjaar werkt ernaartoe; het leerplan van je net legt de tussenstappen vast.',
    );
    expect(voorWieTekst(info(K_AK))).toBe(
      'Doelen voor het einde van het kleuteronderwijs. De 1ste en 2de kleuterklas werken ernaartoe; het leerplan van je net legt de tussenstappen vast.',
    );
  });

  it('volgt bij een oude set de soort doelen en niet het moment', () => {
    expect(voorWieTekst(info(OUD_NL_EINDTERMEN))).toBe('Oude eindtermen voor het hele lager onderwijs.');
    expect(voorWieTekst(info(OUD_K_NL))).toBe('Oude ontwikkelingsdoelen voor het hele kleuteronderwijs.');
    // bubao-lager is ontwikkelingsdoelen, ook al is het moment lager
    expect(voorWieTekst(info(OUD_BU_L_ONT))).toBe('Oude ontwikkelingsdoelen voor het hele lager onderwijs.');
    expect(voorWieTekst(info(OUD_ZONDER_EINDE))).toBe('Oude ontwikkelingsdoelen voor het hele kleuteronderwijs.');
  });

  it('zegt bij leerjaren waar de nieuwe doelen al verplicht zijn alleen dat de oude niet meer verplicht zijn, zonder een set te noemen', () => {
    expect(vervangenTekst(['L1', 'L2', 'L3'])).toBe('Niet meer verplicht voor het 1ste, 2de en 3de leerjaar: daar gelden de nieuwe minimumdoelen.');
    expect(vervangenTekst(['K1', 'K2'])).toBe('Niet meer verplicht voor de 1ste en 2de kleuterklas: daar gelden de nieuwe minimumdoelen.');
    expect(vervangenTekst(['L1'])).not.toMatch(/ODS_|vervangen door/);
  });

  it('zegt bij een helemaal vervallen set sinds wanneer hij niet meer geldt', () => {
    expect(vervallenTekst(info(OUD_K_NL).geldigTotEnMet ?? 0)).toBe('Deze doelen gelden niet meer sinds 1 september 2026.');
    expect(vervallenTekst(2027)).toBe('Deze doelen gelden niet meer sinds 1 september 2028.');
  });

  it('zegt dat de kalender is samengesteld en dat de officiële tekst nog niet is nagelezen', () => {
    expect(samengesteldTekst()).toBe(
      'Kalender samengesteld op 2 november 2026 uit de einddata in de officiële gegevens en uit zoekresultaten. De officiële tekst is nog niet nagelezen.',
    );
  });

  it('zegt zodra een bron is nagelezen op welke dag dat gebeurde', () => {
    const k: Invoeringskalender = {
      ...INVOERINGSKALENDER,
      bronnen: INVOERINGSKALENDER.bronnen.map((b) => (b.id === 'vlaanderen-tabel' ? { ...b, hoe: 'gelezen' as const, gevondenOp: '2026-12-01' } : b)),
    };
    expect(samengesteldTekst(k)).toBe(
      'Kalender samengesteld op 2 november 2026 uit de einddata in de officiële gegevens en uit zoekresultaten en nagelezen in de officiële tekst op 1 december 2026.',
    );
  });

  it("gebruikt nergens het woord 'nagekeken', 'widget' of een koppeling van oud naar nieuw", () => {
    const teksten: string[] = [
      ...Object.values(EINDMOMENT_LABEL),
      ...Object.values(MOMENT_OUD_LABEL),
      ...Object.values(SOORT_DOELEN_LABEL),
      ...Object.values(STATUS_LABEL),
      ...Object.values(ZEKERHEID_LABEL),
      ...Object.values(ZEKERHEID_UITLEG),
      ...Object.values(BRON_HOE_LABEL),
      ...Object.values(GOLF_TEKST),
      ...Object.values(GOLF_ZEKERHEID_UITLEG),
      samengesteldTekst(),
      vervangenTekst(['L1', 'L2', 'L3']),
      vervallenTekst(2026),
      statusDeel('vervangen', ['L4']),
      ...[L4_NL, L6_WT, K_AK, OUD_NL_EINDTERMEN, OUD_BU_L_ONT, OUD_K_NL].map((s) => voorWieTekst(info(s))),
    ];
    for (const t of teksten) {
      expect(t).not.toMatch(/nagekeken/i);
      expect(t).not.toMatch(/widget/i);
      expect(t).not.toMatch(/vervangen door/i);
    }
  });
});

// ─── De module zelf ──────────────────────────────────────────────────────────

describe('de bronbestanden', () => {
  const lees = (naam: string) => readFileSync(fileURLToPath(new URL(naam, import.meta.url)), 'utf8');
  const importen = (bron: string) => [...bron.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+'([^']+)'/gms)].map((m) => m[1]).sort();

  it('lezen nergens de klok', () => {
    for (const naam of ['./moment.ts', './momentTeksten.ts']) {
      const bron = lees(naam);
      expect(bron).not.toMatch(/Date\.now\s*\(/);
      expect(bron).not.toMatch(/new\s+Date\s*\(\s*\)/);
    }
  });

  it('gebruiken geen React, fetch, localStorage of IndexedDB', () => {
    for (const naam of ['./moment.ts', './momentTeksten.ts']) {
      // zonder commentaar: dat noemt wat het bestand níet doet
      const bron = lees(naam)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(bron).not.toMatch(/\bfetch\s*\(/);
      expect(bron).not.toMatch(/localStorage|sessionStorage|indexedDB/);
      expect(bron).not.toMatch(/from\s+'react/);
    }
  });

  it('importeren alleen de toegestane modules', () => {
    expect(importen(lees('./moment.ts'))).toEqual(['../minimumdoelen', '../minimumdoelenBron', './kalender']);
    expect(importen(lees('./momentTeksten.ts'))).toEqual(['../minimumdoelenBron', './kalender', './moment']);
  });

  it('importeert uit minimumdoelenBron alleen exports die er al waren', () => {
    const bron = lees('./moment.ts');
    const blok = /import\s*\{([^}]*)\}\s*from\s*'\.\.\/minimumdoelenBron'/m.exec(bron)?.[1] ?? '';
    const namen = blok.split(',').map((n) => n.replace(/\btype\b/, '').trim()).filter(Boolean).sort();
    expect(namen).toEqual(['MomentBasis', 'datumLeesbaar', 'geldigheidTekst', 'geldigheidVan', 'isBasisSoort', 'momentVanSet', 'soortVanSet', 'zonderAccenten']);
  });
});
