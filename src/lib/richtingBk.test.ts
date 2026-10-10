import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { BkIndex, Erkenning, KoppelingBestand, OnderdeelKwalificaties } from './beroepskwalificaties';
import { valideerBkIndex, valideerKoppelingBestand } from './beroepskwalificaties';
import { BK_ZONDER_TITEL, bkKader, type RichtingBk } from './richtingBk';
import { richtingInfo, type RichtingInfo, type RichtingKeuze } from './richtingKader';
import type { MatrixBestand } from './studierichtingen';

// ── Fixtures ────────────────────────────────────────────────────────────────

const HIER = fileURLToPath(new URL('.', import.meta.url));
const lees = (pad: string): unknown => JSON.parse(readFileSync(join(HIER, '../../tests/fixtures', pad), 'utf8'));

const MATRIX = lees('structuur/uit/studierichtingen.json') as MatrixBestand;
const KOPPELING = lees('kwalificaties/uit/koppeling.json') as KoppelingBestand;
const INDEX = lees('kwalificaties/uit/index.json') as BkIndex;
const VANDAAG = '2026-10-10';

function info(groep: string, vandaag = VANDAAG): RichtingInfo {
  const i = richtingInfo(MATRIX, groep, vandaag);
  if (!i) throw new Error(`${groep} staat niet in de structuurfixtures`);
  return i;
}

function keuze(groep: string, extra: Partial<RichtingKeuze> = {}): RichtingKeuze {
  return { groep, soort: 'so', ...extra };
}

function kader(groep: string, extra: Partial<RichtingKeuze> = {}, vandaag = VANDAAG): RichtingBk {
  return bkKader(KOPPELING, INDEX, info(groep, vandaag), keuze(groep, extra), vandaag);
}

/** Een eigen koppeling met deze records (zelfde kop als de fixture). */
function koppelingMet(records: OnderdeelKwalificaties[]): KoppelingBestand {
  return { ...KOPPELING, onderdelen: records, aantalOnderdelen: records.length };
}

/** Een koppeling die door de validator van K1 komt (zo test een geval niets wat de koppeling nooit kan bevatten). */
function geldig(k: KoppelingBestand): KoppelingBestand {
  expect(valideerKoppelingBestand(k)).toEqual([]);
  return k;
}

function erkenning(adv: string, bks: string[], extra: Partial<Erkenning> = {}): Erkenning {
  return { adv, status: 'ERKEND', begindatum: '2023-09-01', bks: bks.map((bk) => ({ bk, titel: `Titel ${bk}` })), bekrachtigingen: [], ...extra };
}

function opgehaald(onderdeel: number, groep: string, erkenningen: Erkenning[]): OnderdeelKwalificaties {
  return { onderdeel, groep, status: 'opgehaald', opgehaald: '2026-10-10T00:00:00Z', erkenningen };
}

function diepBevroren<T>(v: T): T {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v as Record<string, unknown>)) diepBevroren(x);
    Object.freeze(v);
  }
  return v;
}

describe('de fixtures zelf', () => {
  it('zijn geldig volgens de validators van K1', () => {
    expect(valideerKoppelingBestand(KOPPELING)).toEqual([]);
    expect(valideerBkIndex(INDEX)).toEqual([]);
  });
});

// ── G-0008: twee BK's, 565 alleen in de aanloopvariant ──────────────────────

describe('bkKader op de fixtures: G-0008 (2de graad A, duaal en aanloop)', () => {
  it('geeft 2 BK\'s, op titel, met titel, niveau en aantal uit de index', () => {
    const k = kader('G-0008');
    expect(k.herkomst).toBe('api');
    expect(k.bks.map((b) => [b.bk, b.titel, b.vks, b.aantal])).toEqual([
      ['BK-0390-2', 'Onthaalmedewerker', 3, 12],
      ['BK-0464-1', 'Recreatief medewerker', 4, 13],
    ]);
    expect(k.bks.map((b) => [b.nummer, b.versie])).toEqual([['BK-0390', 2], ['BK-0464', 1]]);
    expect(k.opgehaald).toBe('2026-10-10T00:00:00Z');
    expect(k.toekomst).toBeUndefined();
  });

  it('de versie van een afgelopen erkenning (BK-0390-1) telt niet', () => {
    expect(kader('G-0008').bks.map((b) => b.bk)).not.toContain('BK-0390-1');
  });

  it('per BK de onderdelen: BK-0390-2 alleen in 8, BK-0464-1 in 8 en in de aanloopvariant 565', () => {
    const [onthaal, recreatief] = kader('G-0008').bks;
    expect(onthaal).toMatchObject({ onderdelen: [8], alleOnderdelen: false });
    expect(recreatief).toMatchObject({ onderdelen: [8, 565], alleOnderdelen: true });
    for (const b of [onthaal, recreatief]) {
      expect(b.zonderBestand).toBeUndefined();
      expect(b.nieuwereVersie).toBeUndefined();
      expect(b.totDatum).toBeUndefined();
      expect(b.nietMeerInBron).toBeUndefined();
    }
  });

  it('de aanloopvariant (onderdeel 565) heeft alleen BK-0464-1', () => {
    const k = kader('G-0008', { onderdeel: 565 });
    expect(k.herkomst).toBe('api');
    expect(k.bks.map((b) => b.bk)).toEqual(['BK-0464-1']);
    expect(k.bks[0]).toMatchObject({ onderdelen: [565], alleOnderdelen: true });
  });

  it('onderdeel 8 heeft beide', () => {
    expect(kader('G-0008', { onderdeel: 8 }).bks.map((b) => b.bk)).toEqual(['BK-0390-2', 'BK-0464-1']);
  });

  it('jaar en soort onderwijs (OV4) veranderen niets', () => {
    const basis = kader('G-0008');
    expect(kader('G-0008', { jaar: 3 })).toEqual(basis);
    expect(kader('G-0008', { jaar: 4, soort: 'buso' })).toEqual(basis);
  });

  it('wat leerlingen kunnen behalen: uniek, op naam, met de soort', () => {
    const k = kader('G-0008');
    expect(k.bekrachtigingen).toEqual([
      { naam: 'Bewijs van beroepskwalificatie Onthaalmedewerker (BK-0390-2)', soort: 'beroepskwalificatie' },
      { naam: 'Bewijs van beroepskwalificatie Recreatief medewerker (BK-0464-1)', soort: 'beroepskwalificatie' },
      { naam: 'Bewijs van deelkwalificatie Onthaal (BK-0390-2-DBK-01)', soort: 'deelkwalificatie' },
      { naam: 'Bewijs van slagen voor de basisvorming Assistent dierlijke productie', soort: 'ander' },
      { naam: 'Diploma van secundair onderwijs, onderwijskwalificatie niveau 3 Assistent dierlijke productie', soort: 'onderwijskwalificatie' },
    ]);
  });

  it('een vroegere dag: de afgelopen erkenning geldt dan nog, met haar einde en zonder bestand', () => {
    const k = kader('G-0008', {}, '2024-01-01');
    const oud = k.bks.find((b) => b.bk === 'BK-0390-1');
    expect(oud).toMatchObject({ titel: 'Onthaalmedewerker', zonderBestand: true, totDatum: '2024-08-31', onderdelen: [8] });
    expect(oud?.vks).toBeUndefined();
    expect(oud?.aantal).toBeUndefined();
  });
});

// ── G-0009: BuSO, met een erkenning zonder lijst, een toekomstige en een 404 ─

describe('bkKader op de fixtures: G-0009 (BuSO)', () => {
  it('herkomst api met de BK\'s van 10 en 12; 9 heeft geen lijst, 11 is afgebouwd, 931 gaf twee keer 404', () => {
    const k = kader('G-0009');
    expect(k.herkomst).toBe('api');
    expect(k.bks.map((b) => b.bk)).toEqual(['BK-9999-1', 'BK-9999-3']);
  });

  it('BK-9999-1: alleen in onderdeel 10, met een nieuwere erkende versie', () => {
    const b = kader('G-0009').bks[0];
    expect(b).toMatchObject({ bk: 'BK-9999-1', titel: 'Nagebootste beroepskwalificatie', onderdelen: [10], alleOnderdelen: false, nieuwereVersie: 'BK-9999-2', aantal: 3, vks: 2 });
    expect(b.zonderBestand).toBeUndefined();
  });

  it('BK-9999-3: niet gevonden, dus zonder bestand; de titel komt uit de koppeling; 3 is niet ouder dan 2', () => {
    const b = kader('G-0009').bks[1];
    expect(b).toMatchObject({ bk: 'BK-9999-3', titel: 'Nagebootste beroepskwalificatie zonder detail', zonderBestand: true, onderdelen: [12] });
    expect(b.nieuwereVersie).toBeUndefined();
    expect(b.aantal).toBeUndefined();
  });

  it('toekomst: vanaf 1 september 2027 komt BK-9999-2 erbij (titels uniek)', () => {
    expect(kader('G-0009').toekomst).toEqual({
      vanaf: '2027-09-01',
      titels: ['Nagebootste beroepskwalificatie', 'Nagebootste beroepskwalificatie zonder detail'],
    });
  });

  it('de wissel op 1 september 2027 gebeurt vanzelf, zonder nieuwe run', () => {
    const k = kader('G-0009', {}, '2027-09-01');
    expect(k.bks.map((b) => b.bk)).toEqual(['BK-9999-1', 'BK-9999-2', 'BK-9999-3']);
    expect(k.toekomst).toBeUndefined();
  });

  it('per onderdeel: 9 geen, 10 api, 11 en 931 nog niet opgehaald', () => {
    expect(kader('G-0009', { onderdeel: 9 })).toMatchObject({ herkomst: 'geen', bks: [] });
    expect(kader('G-0009', { onderdeel: 10 }).bks.map((b) => b.bk)).toEqual(['BK-9999-1']);
    expect(kader('G-0009', { onderdeel: 10 }).toekomst).toEqual({ vanaf: '2027-09-01', titels: ['Nagebootste beroepskwalificatie'] });
    expect(kader('G-0009', { onderdeel: 11 })).toMatchObject({ herkomst: 'nog-niet-opgehaald', bks: [] });
    expect(kader('G-0009', { onderdeel: 931 })).toMatchObject({ herkomst: 'nog-niet-opgehaald', bks: [] });
  });

  it('een onderdeel van een andere richting als keuze: dan de geldige onderdelen', () => {
    expect(kader('G-0009', { onderdeel: 8 })).toEqual(kader('G-0009'));
  });
});

// ── Richtingen zonder BK ────────────────────────────────────────────────────

describe('bkKader zonder BK', () => {
  it('G-0193 (DO, lege lijst) en G-0117 (DO, geen lijst): geen', () => {
    for (const g of ['G-0193', 'G-0117', 'G-0307', 'G-0311', 'G-0327', 'G-0429']) {
      const k = kader(g);
      expect(k.herkomst, g).toBe('geen');
      expect(k.bks, g).toEqual([]);
      expect(k.bekrachtigingen, g).toEqual([]);
      expect(k.toekomst, g).toBeUndefined();
    }
  });

  it('G-0002: nog niet opgehaald', () => {
    expect(kader('G-0002')).toEqual({ herkomst: 'nog-niet-opgehaald', bks: [], bekrachtigingen: [] });
  });

  it('zonder koppeling: nog niet opgehaald, ook met een index', () => {
    expect(bkKader(null, INDEX, info('G-0008'), keuze('G-0008'), VANDAAG)).toEqual({ herkomst: 'nog-niet-opgehaald', bks: [], bekrachtigingen: [] });
  });
});

// ── Wat de eerste echte run toonde (G1 stap 3, 10 oktober 2026) ──────────────
//
// De echte koppeling houdt afgelopen erkenningen bij (bv. onderdeel 1: ADV-1193 tot 2024-08-31 en ADV-1608 vanaf
// 2023-09-01), met studiebekrachtigingen en hun extra velden; 128 onderdelen (allemaal niet meer geldig) staan op
// "nog-niet-opgehaald"; en een richting kan alleen een deelkwalificatie in haar bekrachtigingen hebben (bv. onderdeel
// 69, BK-0500-1-DBK-01). De records hieronder volgen die vorm en gaan eerst door de validator van K1.

describe('bkKader op de vorm van de echte koppeling', () => {
  const g8 = info('G-0008');

  /** Studiebekrachtiging zoals in de echte koppeling: met extra velden. */
  function bekrachtiging(naam: string, extra: { bk?: string; dbk?: string; onderwijskwalificatie?: true }) {
    return {
      naam, ...extra,
      extra: { categorie: 'Bewijs', led_bewijstype: naam.split(' (')[0], maximale_studiebekrachtiging: false, naam: naam.split(' (')[0] },
    };
  }

  /** Onderdeel 1 in het klein: een afgelopen erkenning (met eigen BK's) en de erkenning van nu, die een jaar overlapten. */
  function zoalsOnderdeel1(onderdeel: number): OnderdeelKwalificaties {
    return opgehaald(onderdeel, 'G-0008', [
      {
        adv: 'ADV-1193', versie: `S-${onderdeel}-V1`, status: 'ERKEND', begindatum: '2017-09-01', einddatum: '2024-08-31',
        bks: [{ bk: 'BK-0130-4', titel: 'Oude titel' }, { bk: 'BK-0131-3', titel: 'Gedeelde titel' }],
        bekrachtigingen: [bekrachtiging('Bewijs van beroepskwalificatie Oude titel (BK-0130-4)', { bk: 'BK-0130-4' })],
      },
      {
        adv: 'ADV-1608', versie: `S-${onderdeel}-V2`, status: 'ERKEND', begindatum: '2023-09-01',
        bks: [
          { bk: 'BK-0130-5', titel: 'Nieuwe titel', extra: { volledigheid: 'Volledig' } },
          { bk: 'BK-0131-3', titel: 'Gedeelde titel', extra: { volledigheid: 'Volledig' } },
          { bk: 'BK-0132-1', titel: 'Derde titel', extra: { volledigheid: 'Volledig' } },
        ],
        bekrachtigingen: [
          bekrachtiging('Bewijs van beroepskwalificatie Nieuwe titel (BK-0130-5)', { bk: 'BK-0130-5' }),
          bekrachtiging('Bewijs van deelkwalificatie Deel A (BK-0130-5-DBK-01)', { dbk: 'BK-0130-5-DBK-01' }),
          bekrachtiging('Bewijs van deelkwalificatie Deel B (BK-0130-5-DBK-02)', { dbk: 'BK-0130-5-DBK-02' }),
          bekrachtiging('Diploma van secundair onderwijs', { onderwijskwalificatie: true }),
        ],
      },
    ]);
  }

  /** De validator van K1 keurt de records goed (zelfde kop als de fixture). */
  const MET_HISTORIEK = geldig(koppelingMet([zoalsOnderdeel1(8), zoalsOnderdeel1(565)]));

  it('alleen de erkenning van nu (op de dag die meegegeven wordt): geen BK, einde of bekrachtiging van de afgelopen erkenning', () => {
    const k = bkKader(MET_HISTORIEK, INDEX, g8, keuze('G-0008'), VANDAAG);
    expect(k.herkomst).toBe('api');
    expect(k.bks.map((b) => [b.bk, b.titel])).toEqual([
      ['BK-0132-1', 'Derde titel'],
      ['BK-0131-3', 'Gedeelde titel'],
      ['BK-0130-5', 'Nieuwe titel'],
    ]);
    for (const b of k.bks) {
      expect(b.totDatum, b.bk).toBeUndefined();
      expect(b).toMatchObject({ onderdelen: [8, 565], alleOnderdelen: true, zonderBestand: true });
    }
    expect(k.bekrachtigingen.map((b) => b.naam)).not.toContain('Bewijs van beroepskwalificatie Oude titel (BK-0130-4)');
    expect(k.bekrachtigingen.map((b) => b.soort)).toEqual(['beroepskwalificatie', 'deelkwalificatie', 'deelkwalificatie', 'onderwijskwalificatie']);
    expect(k.toekomst).toBeUndefined();
  });

  it('de dag beslist: vóór de overlap alleen de oude erkenning, tijdens de overlap beide (met het einde van de oude)', () => {
    const voor = bkKader(MET_HISTORIEK, INDEX, g8, keuze('G-0008'), '2023-08-31');
    expect(voor.bks.map((b) => b.bk).sort()).toEqual(['BK-0130-4', 'BK-0131-3']);
    // Op die dag begint de nieuwe erkenning later: de lijst vanaf 1 september 2023 staat in `toekomst`.
    expect(voor.toekomst).toEqual({ vanaf: '2023-09-01', titels: ['Derde titel', 'Gedeelde titel', 'Nieuwe titel', 'Oude titel'] });
    // BK-0131-3 loopt door in de volgende erkenning: geen vals einde.
    expect(voor.bks.find((b) => b.bk === 'BK-0131-3')?.totDatum).toBeUndefined();
    expect(voor.bks.find((b) => b.bk === 'BK-0130-4')?.totDatum).toBe('2024-08-31');

    const tijdens = bkKader(MET_HISTORIEK, INDEX, g8, keuze('G-0008'), '2024-01-01');
    expect(tijdens.bks.map((b) => b.bk).sort()).toEqual(['BK-0130-4', 'BK-0130-5', 'BK-0131-3', 'BK-0132-1']);
    expect(tijdens.bks.find((b) => b.bk === 'BK-0130-4')?.totDatum).toBe('2024-08-31');
    expect(tijdens.bks.filter((b) => b.totDatum !== undefined).map((b) => b.bk)).toEqual(['BK-0130-4']);

    // De dag na het einde: de oude erkenning telt niet meer, zonder nieuwe run.
    expect(bkKader(MET_HISTORIEK, INDEX, g8, keuze('G-0008'), '2024-09-01').bks.map((b) => b.bk).sort()).toEqual(['BK-0130-5', 'BK-0131-3', 'BK-0132-1']);
  });

  it('nog niet opgehaald voor onderdelen die niet meer gelden (afgebouwd): ze tellen niet mee, ook niet tegen "geen"', () => {
    // G-0009: onderdeel 11 is afgebouwd en staat op "nog-niet-opgehaald" (zoals de 128 in de echte koppeling). Onderdeel
    // 931 geldt wel en krijgt hier ook een lijst zonder BK (over 931 zonder record: zie de randgevallen).
    const alleZonderBk = geldig(koppelingMet(KOPPELING.onderdelen.map((r) => (r.groep === 'G-0009' && r.status !== 'nog-niet-opgehaald'
      ? opgehaald(r.onderdeel, 'G-0009', [erkenning(`ADV-${r.onderdeel}`, [])])
      : r))));
    expect(alleZonderBk.onderdelen.find((r) => r.onderdeel === 11)?.status).toBe('nog-niet-opgehaald');
    expect(info('G-0009').onderdelen.map((o) => o.nummer)).toEqual([9, 10, 11, 12, 931]);
    expect(bkKader(alleZonderBk, INDEX, info('G-0009'), keuze('G-0009'), VANDAAG)).toMatchObject({ herkomst: 'geen', bks: [] });

    // Met BK's: "in elke variant" telt alleen wat geldt en geweten is (9, 10 en 12), niet het afgebouwde 11.
    const alleMetBk = geldig(koppelingMet(KOPPELING.onderdelen.map((r) => (r.groep === 'G-0009' && r.status === 'opgehaald'
      ? opgehaald(r.onderdeel, 'G-0009', [erkenning(`ADV-${r.onderdeel}`, ['BK-0390-2'])])
      : r))));
    const k = bkKader(alleMetBk, INDEX, info('G-0009'), keuze('G-0009'), VANDAAG);
    expect(k.herkomst).toBe('api');
    expect(k.bks).toHaveLength(1);
    expect(k.bks[0]).toMatchObject({ bk: 'BK-0390-2', onderdelen: [9, 10, 12], alleOnderdelen: true });
  });

  it('een richting die volledig afgebouwd is (alle onderdelen nog niet opgehaald): nog niet opgehaald, zonder BK', () => {
    // G-0002 (een afgebouwd 7de jaar): het enige onderdeel staat op "nog-niet-opgehaald".
    expect(KOPPELING.onderdelen.find((r) => r.onderdeel === 2)?.status).toBe('nog-niet-opgehaald');
    expect(info('G-0002').afgebouwd).toBe(true);
    expect(kader('G-0002')).toEqual({ herkomst: 'nog-niet-opgehaald', bks: [], bekrachtigingen: [] });
  });

  it('alleen een deelkwalificatie in de bekrachtigingen (zoals onderdeel 69): geen, met de deelkwalificatie alleen bij naam', () => {
    const naam = 'Bewijs van deelkwalificatie Nagebootst deel (BK-0500-1-DBK-01)';
    const metLegeLijst = geldig(koppelingMet([
      opgehaald(8, 'G-0008', [erkenning('ADV-0069', [], { bekrachtigingen: [bekrachtiging(naam, { dbk: 'BK-0500-1-DBK-01' })] })]),
      opgehaald(565, 'G-0008', [erkenning('ADV-0070', [], { geenLijst: true, bekrachtigingen: [bekrachtiging(naam, { dbk: 'BK-0500-1-DBK-01' })] })]),
    ]));
    const k = bkKader(metLegeLijst, INDEX, g8, keuze('G-0008'), VANDAAG);
    expect(k.herkomst).toBe('geen');
    expect(k.bks).toEqual([]);
    // W4: geen BK afgeleid uit de deelkwalificatie (BK-0500-1), en geen competenties; alleen de naam, één keer.
    expect(k.bekrachtigingen).toEqual([{ naam, soort: 'deelkwalificatie' }]);
    expect(k.toekomst).toBeUndefined();
    // Per variant hetzelfde.
    expect(bkKader(metLegeLijst, INDEX, g8, keuze('G-0008', { onderdeel: 565 }), VANDAAG)).toMatchObject({ herkomst: 'geen', bks: [] });
  });
});

// ── Eigen gevallen ──────────────────────────────────────────────────────────

describe('bkKader: randgevallen', () => {
  const g8 = info('G-0008');

  it('zonder index: de BK\'s uit de koppeling, alle zonder bestand, met de titel uit de koppeling', () => {
    const k = bkKader(KOPPELING, null, g8, keuze('G-0008'), VANDAAG);
    expect(k.bks.map((b) => [b.bk, b.titel, b.zonderBestand])).toEqual([
      ['BK-0390-2', 'Onthaalmedewerker', true],
      ['BK-0464-1', 'Recreatief medewerker', true],
    ]);
    expect(k.bks[0].vks).toBeUndefined();
  });

  it('zonder titel in index en koppeling: een neutrale titel, nooit het BK-nummer', () => {
    const e = erkenning('ADV-1', ['BK-0777-1']);
    e.bks = [{ bk: 'BK-0777-1' }];
    const k = bkKader(koppelingMet([opgehaald(8, 'G-0008', [e])]), INDEX, g8, keuze('G-0008', { onderdeel: 8 }), VANDAAG);
    expect(k.bks[0]).toMatchObject({ bk: 'BK-0777-1', titel: BK_ZONDER_TITEL, zonderBestand: true });
    expect(BK_ZONDER_TITEL).not.toMatch(/BK-\d/);
  });

  it('een record van een andere groep voor hetzelfde onderdeel telt niet', () => {
    const k = bkKader(koppelingMet([opgehaald(8, 'G-0009', [erkenning('ADV-1', ['BK-0390-2'])])]), INDEX, g8, keuze('G-0008', { onderdeel: 8 }), VANDAAG);
    expect(k).toEqual({ herkomst: 'nog-niet-opgehaald', onderdeel: 8, bks: [], bekrachtigingen: [] });
  });

  // Punt 1 van de tweede controle: een onderdeel dat twee keer 404 gaf zonder laatst bekend record, is niet geweten.
  it('twee keer niet gevonden zonder laatst bekend record, de rest zonder BK: nog niet opgehaald, nooit "geen"', () => {
    // Het scenario van de controleur: 9, 10 en 12 opgehaald zonder BK, 11 afgebouwd, 931 twee keer 404 zonder record.
    const zonderBk = geldig(koppelingMet(KOPPELING.onderdelen.map((r) => (r.groep === 'G-0009' && r.status === 'opgehaald'
      ? opgehaald(r.onderdeel, 'G-0009', [erkenning(`ADV-${r.onderdeel}`, [])])
      : r))));
    const rec931 = zonderBk.onderdelen.find((r) => r.onderdeel === 931);
    expect(rec931).toEqual({ onderdeel: 931, groep: 'G-0009', status: 'niet-gevonden', nietMeerInBron: '2026-10-10' });
    const k = bkKader(zonderBk, INDEX, info('G-0009'), keuze('G-0009'), VANDAAG);
    expect(k).toMatchObject({ herkomst: 'nog-niet-opgehaald', bks: [] });
    expect(k.herkomst).not.toBe('geen');
    // Alleen dat onderdeel gekozen: ook niets geweten.
    expect(bkKader(zonderBk, INDEX, info('G-0009'), keuze('G-0009', { onderdeel: 931 }), VANDAAG)).toEqual({
      herkomst: 'nog-niet-opgehaald', onderdeel: 931, bks: [], bekrachtigingen: [],
    });
    // Met BK's in een ander onderdeel blijft het 'api': wat geweten is, telt.
    expect(kader('G-0009').herkomst).toBe('api');
  });

  it('twee keer niet gevonden, maar met een laatst bekend record zonder BK: dat is geweten, dus "geen"', () => {
    const k = bkKader(geldig(koppelingMet([
      opgehaald(8, 'G-0008', [erkenning('ADV-1', [])]),
      { onderdeel: 565, groep: 'G-0008', status: 'niet-gevonden', nietMeerInBron: '2026-10-01', opgehaald: '2026-09-01T00:00:00Z', erkenningen: [erkenning('ADV-2', [])] },
    ])), INDEX, g8, keuze('G-0008'), VANDAAG);
    expect(k).toMatchObject({ herkomst: 'geen', bks: [] });
    // Zonder dat record: niet geweten.
    const zonder = bkKader(geldig(koppelingMet([
      opgehaald(8, 'G-0008', [erkenning('ADV-1', [])]),
      { onderdeel: 565, groep: 'G-0008', status: 'niet-gevonden', nietMeerInBron: '2026-10-01' },
    ])), INDEX, g8, keuze('G-0008'), VANDAAG);
    expect(zonder.herkomst).toBe('nog-niet-opgehaald');
  });

  // Punt 3 van de tweede controle: het kader onthoudt of het voor één variant gemaakt is.
  it('onderdeel: alleen bij een kader voor één gekozen onderdeel van de richting, ook als het leeg is', () => {
    expect(kader('G-0008').onderdeel).toBeUndefined();
    expect(kader('G-0008', { onderdeel: 565 }).onderdeel).toBe(565);
    expect(kader('G-0008', { onderdeel: 8 }).onderdeel).toBe(8);
    expect(kader('G-0009', { onderdeel: 11 })).toEqual({ herkomst: 'nog-niet-opgehaald', onderdeel: 11, bks: [], bekrachtigingen: [] });
    expect(bkKader(null, INDEX, g8, keuze('G-0008', { onderdeel: 565 }), VANDAAG)).toEqual({ herkomst: 'nog-niet-opgehaald', onderdeel: 565, bks: [], bekrachtigingen: [] });
    // Een onderdeel van een andere richting telt niet als keuze: dan het kader van de hele richting, zonder onderdeel.
    expect(kader('G-0009', { onderdeel: 8 }).onderdeel).toBeUndefined();
  });

  it('één onderdeel zonder BK en één nog niet opgehaald: nog niet opgehaald (we kunnen niet zeggen dat er geen is)', () => {
    const k = bkKader(
      koppelingMet([opgehaald(8, 'G-0008', [erkenning('ADV-1', [])]), { onderdeel: 565, groep: 'G-0008', status: 'nog-niet-opgehaald' }]),
      INDEX, g8, keuze('G-0008'), VANDAAG,
    );
    expect(k.herkomst).toBe('nog-niet-opgehaald');
  });

  it('één onderdeel met BK en één nog niet opgehaald: api, en "alle onderdelen" telt alleen wat geweten is', () => {
    const k = bkKader(
      koppelingMet([opgehaald(8, 'G-0008', [erkenning('ADV-1', ['BK-0390-2'])]), { onderdeel: 565, groep: 'G-0008', status: 'nog-niet-opgehaald' }]),
      INDEX, g8, keuze('G-0008'), VANDAAG,
    );
    expect(k.herkomst).toBe('api');
    expect(k.bks[0]).toMatchObject({ bk: 'BK-0390-2', onderdelen: [8], alleOnderdelen: true });
  });

  it('niet meer gevonden, maar met een laatst bekend record: telt mee (api)', () => {
    const rec: OnderdeelKwalificaties = { onderdeel: 8, groep: 'G-0008', status: 'niet-gevonden', nietMeerInBron: '2026-10-01', opgehaald: '2026-09-01T00:00:00Z', erkenningen: [erkenning('ADV-1', ['BK-0390-2'])] };
    const k = bkKader(koppelingMet([rec]), INDEX, g8, keuze('G-0008', { onderdeel: 8 }), VANDAAG);
    expect(k.herkomst).toBe('api');
    expect(k.bks.map((b) => b.bk)).toEqual(['BK-0390-2']);
    expect(k.opgehaald).toBe('2026-09-01T00:00:00Z');
  });

  it('een geannuleerde of nog niet erkende erkenning telt niet', () => {
    const k = bkKader(
      koppelingMet([opgehaald(8, 'G-0008', [erkenning('ADV-1', ['BK-0390-2'], { status: 'GEANNULEERD' }), erkenning('ADV-2', ['BK-0464-1'], { status: 'NIET_ERKEND' })])]),
      INDEX, g8, keuze('G-0008', { onderdeel: 8 }), VANDAAG,
    );
    expect(k).toMatchObject({ herkomst: 'geen', bks: [] });
  });

  it('totDatum: de vroegste over de onderdelen, als elk onderdeel een einde heeft', () => {
    const k = bkKader(koppelingMet([
      opgehaald(8, 'G-0008', [erkenning('ADV-1', ['BK-0390-2'], { einddatum: '2028-08-31' })]),
      opgehaald(565, 'G-0008', [erkenning('ADV-2', ['BK-0390-2'], { einddatum: '2027-08-31' })]),
    ]), INDEX, g8, keuze('G-0008'), VANDAAG);
    expect(k.bks[0].totDatum).toBe('2027-08-31');
  });

  it('geen totDatum als een onderdeel de BK zonder einde noemt', () => {
    const k = bkKader(koppelingMet([
      opgehaald(8, 'G-0008', [erkenning('ADV-1', ['BK-0390-2'], { einddatum: '2027-08-31' })]),
      opgehaald(565, 'G-0008', [erkenning('ADV-2', ['BK-0390-2'])]),
    ]), INDEX, g8, keuze('G-0008'), VANDAAG);
    expect(k.bks[0].totDatum).toBeUndefined();
  });

  it('geen vals einde: een toekomstige erkenning die dezelfde BK verder noemt (zonder einde, of later)', () => {
    const zonderEinde = bkKader(koppelingMet([opgehaald(8, 'G-0008', [
      erkenning('ADV-1', ['BK-0390-2'], { einddatum: '2027-08-31' }),
      erkenning('ADV-2', ['BK-0390-2'], { begindatum: '2027-09-01' }),
    ])]), INDEX, g8, keuze('G-0008', { onderdeel: 8 }), VANDAAG);
    expect(zonderEinde.bks[0].totDatum).toBeUndefined();
    expect(zonderEinde.toekomst).toBeUndefined(); // dezelfde lijst op 1 september 2027
    const later = bkKader(koppelingMet([opgehaald(8, 'G-0008', [
      erkenning('ADV-1', ['BK-0390-2'], { einddatum: '2027-08-31' }),
      erkenning('ADV-2', ['BK-0390-2'], { begindatum: '2027-09-01', einddatum: '2030-08-31' }),
    ])]), INDEX, g8, keuze('G-0008', { onderdeel: 8 }), VANDAAG);
    expect(later.bks[0].totDatum).toBe('2030-08-31');
  });

  it('toekomst: een andere lijst geeft de dag en de titels; een lege lijst of dezelfde lijst niets', () => {
    const vervangen = bkKader(koppelingMet([opgehaald(8, 'G-0008', [
      erkenning('ADV-1', ['BK-0390-2'], { einddatum: '2027-08-31' }),
      erkenning('ADV-2', ['BK-0464-1'], { begindatum: '2027-09-01' }),
    ])]), INDEX, g8, keuze('G-0008', { onderdeel: 8 }), VANDAAG);
    expect(vervangen.toekomst).toEqual({ vanaf: '2027-09-01', titels: ['Recreatief medewerker'] });
    expect(vervangen.bks[0].totDatum).toBe('2027-08-31');
    const leeg = bkKader(koppelingMet([opgehaald(8, 'G-0008', [
      erkenning('ADV-1', ['BK-0390-2'], { einddatum: '2027-08-31' }),
      erkenning('ADV-2', [], { begindatum: '2027-09-01' }),
    ])]), INDEX, g8, keuze('G-0008', { onderdeel: 8 }), VANDAAG);
    expect(leeg.toekomst).toBeUndefined();
  });

  it('toekomst: een versie die de index (nog) niet kent, krijgt de titel uit de toekomstige erkenning, niet de neutrale', () => {
    const zonderToekomst: BkIndex = { ...INDEX, bks: INDEX.bks.filter((r) => r.bk !== 'BK-9999-2') };
    const k = bkKader(KOPPELING, zonderToekomst, info('G-0009'), keuze('G-0009'), VANDAAG);
    expect(k.toekomst?.titels).not.toContain(BK_ZONDER_TITEL);
    const eigen = bkKader(koppelingMet([opgehaald(8, 'G-0008', [
      erkenning('ADV-1', ['BK-0390-2'], { einddatum: '2027-08-31' }),
      { ...erkenning('ADV-2', [], { begindatum: '2027-09-01' }), bks: [{ bk: 'BK-0778-1', titel: 'Een beroep van later' }, { bk: 'BK-0779-1', titel: 'Nog een beroep van later' }] },
    ])]), INDEX, g8, keuze('G-0008', { onderdeel: 8 }), VANDAAG);
    expect(eigen.toekomst).toEqual({ vanaf: '2027-09-01', titels: ['Een beroep van later', 'Nog een beroep van later'] });
  });

  it('nietMeerInBron komt uit de index; nieuwereVersie alleen voor een hogere versie van hetzelfde nummer', () => {
    const index: BkIndex = {
      ...INDEX,
      bks: INDEX.bks.map((r) => (r.bk === 'BK-0390-2' ? { ...r, nietMeerInBron: '2026-12-03', laatstErkend: 'BK-0390-1' } : r)),
    };
    const k = bkKader(KOPPELING, index, g8, keuze('G-0008'), VANDAAG);
    expect(k.bks[0]).toMatchObject({ bk: 'BK-0390-2', nietMeerInBron: '2026-12-03' });
    expect(k.bks[0].nieuwereVersie).toBeUndefined();
  });

  it('wat leerlingen kunnen behalen: de soort volgt onderwijskwalificatie, dan bk, dan dbk', () => {
    const e = erkenning('ADV-1', ['BK-0390-2'], {
      bekrachtigingen: [
        { naam: 'B', bk: 'BK-0390-2', onderwijskwalificatie: true },
        { naam: 'A', dbk: 'BK-0390-2-DBK-01' },
        { naam: ' A ', dbk: 'BK-0390-2-DBK-01' },
        { naam: '' },
        { naam: 'C' },
      ],
    });
    const k = bkKader(koppelingMet([opgehaald(8, 'G-0008', [e])]), INDEX, g8, keuze('G-0008', { onderdeel: 8 }), VANDAAG);
    expect(k.bekrachtigingen).toEqual([
      { naam: 'A', soort: 'deelkwalificatie' },
      { naam: 'B', soort: 'onderwijskwalificatie' },
      { naam: 'C', soort: 'ander' },
    ]);
  });

  it('verandert de invoer niet', () => {
    const koppeling = diepBevroren(structuredClone(KOPPELING));
    const index = diepBevroren(structuredClone(INDEX));
    const i = info('G-0009');
    expect(() => bkKader(koppeling, index, i, keuze('G-0009'), VANDAAG)).not.toThrow();
    expect(koppeling).toEqual(KOPPELING);
    expect(index).toEqual(INDEX);
  });

  it('een ongeldige dag is een fout in de code: luid, ook met een gekozen onderdeel', () => {
    expect(() => bkKader(KOPPELING, INDEX, g8, keuze('G-0008'), 'gisteren')).toThrow(TypeError);
    expect(() => bkKader(KOPPELING, INDEX, g8, keuze('G-0008', { onderdeel: 8 }), '2026-10-10T00:00:00Z')).toThrow(TypeError);
  });
});
