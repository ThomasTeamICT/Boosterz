import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAX_DOELEN, MAX_SETS } from './curriculum';
import { sanitizeDoelgroep } from './doelgroep';
import { leerplanUitSelectie } from './doelenSamenstellen';
import type { Minimumdoel, MinimumdoelenIndex, MinimumdoelenIndexSet, MinimumdoelenSetBestand } from './minimumdoelen';
import {
  FINALITEIT_LABEL,
  bouwKader,
  doelgroepVan,
  filterRichtingen,
  isUitbreidingsSet,
  kaderGroepSleutel,
  kaderVingerafdruk,
  kenmerkenVan,
  naarSetKeuzes,
  richtingInfo,
  selectieVanKader,
  setPastBijJaar,
  type RichtingFilter,
  type RichtingInfo,
  type RichtingKader,
  type RichtingKeuze,
} from './richtingKader';
import {
  groepnummersVanDoel,
  type MatrixBestand,
  type RichtingDoelenBestand,
  type RichtingDoelenIndex,
  type RichtingDoelenIndexRegel,
  type RichtingDoelenSet,
  type StudierichtingGroep,
  type Structuuronderdeel,
} from './studierichtingen';

const VANDAAG = '2026-10-09';
const SHA = 'ab'.repeat(32);

// ── Nagemaakte gegevens ─────────────────────────────────────────────────────

function onderdeel(nummer: number, groep: string, extra: Partial<Structuuronderdeel> = {}): Structuuronderdeel {
  return {
    nummer, groep, titel: `Onderdeel ${nummer}`, onderwijsvorm: 'ASO', begindatum: '2021-09-01',
    leerjaren: [{ code: '1' }, { code: '2' }], hoofdstructuren: ['311', '321'], ...extra,
  };
}

function groep(nummer: string, titel: string, onderdelen: number[], extra: Partial<StudierichtingGroep> = {}): StudierichtingGroep {
  return { nummer, titel, graad: '2', finaliteit: 'DO', onderdelen, ...extra };
}

function matrixVan(groepen: StudierichtingGroep[], onderdelen: Structuuronderdeel[]): MatrixBestand {
  return {
    app: 'boosterz', kind: 'studierichtingen', v: 1, bron: 'x', api: 'x', naamsvermelding: 'x', licentie: 'x',
    opgehaald: '2026-10-09T00:00:00Z', aantalGroepen: groepen.length, aantalOnderdelen: onderdelen.length, sha256: SHA, groepen, onderdelen,
  };
}

/** Een set in de index. `soort` bepaalt het begin van de naam; zonder geldigheid is ze gewoon geldig. */
function indexSet(id: string, vak: string, extra: Partial<MinimumdoelenIndexSet> & { soort?: 'so' | 'buso' } = {}): MinimumdoelenIndexSet {
  const { soort = 'so', ...rest } = extra;
  const begin = soort === 'buso' ? 'Buitengewoon Secundair onderwijs 2de graad Opleidingsvorm 4' : 'Secundair onderwijs 2de graad';
  return {
    id, naam: `${begin} -  ${vak} - Cesuurdoelen`, korteNaam: vak, geldigheid: 'Geldig', graad: '2de graad', aantal: 5,
    sha256: `${id.replace(/\D/g, '').padStart(2, '0')}${'cd'.repeat(31)}`.slice(0, 64), opgehaald: '2026-10-05T10:00:00Z', bestand: `${id}.json`, ...rest,
  };
}

/** De koppeling van een set: standaard alle doelen, gemaakt met het versiemerk van de index. */
function koppelSet(s: MinimumdoelenIndexSet, ids?: string[], extra: Partial<RichtingDoelenSet> = {}): RichtingDoelenSet {
  return {
    set: s.id, setSha: s.sha256.slice(0, 16), setAantal: s.aantal,
    ids: ids ?? Array.from({ length: s.aantal }, (_, i) => `${s.id.replace(/\D/g, '')}${i + 1}`), ...extra,
  };
}

function koppelBestand(nummer: string, sets: RichtingDoelenSet[], extra: Partial<RichtingDoelenBestand> = {}): RichtingDoelenBestand {
  return {
    app: 'boosterz', kind: 'richtingdoelen', v: 1, groep: nummer, titel: 'Titel', graad: '2', methode: 'api',
    filter: `structuuronderdeel_groep_nummer=${nummer}`, bron: 'x', api: 'x', naamsvermelding: 'x', licentie: 'x',
    opgehaald: '2026-10-09T00:00:00Z', aantal: sets.reduce((n, s) => n + s.ids.length, 0), sha256: SHA, sets, ...extra,
  };
}

function regelVan(b: RichtingDoelenBestand): RichtingDoelenIndexRegel {
  return { groep: b.groep, status: 'gekoppeld', methode: b.methode, aantal: b.aantal, sets: b.sets.length, sha256: b.sha256, opgehaald: b.opgehaald, bestand: `${b.groep}.json` };
}

/** Een gewone richting van de 2de graad met één onderdeel. */
function gewoneInfo(extra: Partial<Structuuronderdeel> = {}, groepExtra: Partial<StudierichtingGroep> = {}): RichtingInfo {
  const m = matrixVan([groep('G-0100', 'Testrichting', [100], groepExtra)], [onderdeel(100, 'G-0100', { ov4: true, ...extra })]);
  return richtingInfo(m, 'G-0100', VANDAAG)!;
}

function keuze(soort: 'so' | 'buso' = 'so', extra: Partial<RichtingKeuze> = {}): RichtingKeuze {
  return { groep: 'G-0100', soort, ...extra };
}

function kaderUit(sets: MinimumdoelenIndexSet[], koppel: RichtingDoelenSet[], opties: { info?: RichtingInfo; keuze?: RichtingKeuze } = {}): RichtingKader {
  const info = opties.info ?? gewoneInfo();
  const bestand = koppelBestand(info.groep.nummer, koppel);
  return bouwKader(bestand, regelVan(bestand), sets, opties.keuze ?? keuze('so', { groep: info.groep.nummer }), info);
}

const ids = (sets: readonly { set: { id: string } }[]) => sets.map((s) => s.set.id);

// ── isUitbreidingsSet ───────────────────────────────────────────────────────

describe('isUitbreidingsSet', () => {
  it('het laatste deel na " - " is "Uitbreidingsdoelen"', () => {
    expect(isUitbreidingsSet('Secundair onderwijs 1ste graad A-stroom -  Competenties in het Nederlands - Uitbreidingsdoelen')).toBe(true);
    expect(isUitbreidingsSet('Buitengewoon Secundair onderwijs 1ste graad B-stroom Opleidingsvorm 4 -  Competenties in het Nederlands - Uitbreidingsdoelen')).toBe(true);
    expect(isUitbreidingsSet('Secundair onderwijs 1ste graad A-stroom - X - uitbreidingsdoelen ')).toBe(true);
  });

  it('eindtermen, cesuurdoelen en een naam zonder streepje zijn het niet', () => {
    expect(isUitbreidingsSet('Secundair onderwijs 1ste graad A-stroom -  Competenties in het Nederlands - Eindtermen')).toBe(false);
    expect(isUitbreidingsSet('Secundair onderwijs 2de graad -  Biologie - Cesuurdoelen')).toBe(false);
    expect(isUitbreidingsSet('Uitbreidingsdoelen')).toBe(false);
    expect(isUitbreidingsSet('')).toBe(false);
    // Het woord midden in de naam telt niet.
    expect(isUitbreidingsSet('Secundair onderwijs - Uitbreidingsdoelen voor wiskunde - Eindtermen')).toBe(false);
  });
});

// ── richtingInfo ────────────────────────────────────────────────────────────

describe('richtingInfo', () => {
  it('is onbekend voor een groep die niet in de matrix staat', () => {
    const m = matrixVan([groep('G-0100', 'A', [1])], [onderdeel(1, 'G-0100')]);
    expect(richtingInfo(m, 'G-9999', VANDAAG)).toBeUndefined();
  });

  it('jaren: de 2de graad geeft 3 en 4, de 3de graad 5 en 6, een zevende jaar 7, de 1ste graad het leerjaar', () => {
    const m = matrixVan(
      [
        groep('G-0100', 'Twee', [1]),
        groep('G-0200', 'Drie', [2], { graad: '3' }),
        groep('G-0300', 'Zeven', [3], { graad: '3', type7: 'BSO_TIJDELIJK' }),
        groep('G-0400', 'Eerste leerjaar A', [4], { graad: '1', finaliteit: undefined }),
        groep('G-0500', 'Tweede leerjaar B: Techniek', [5], { graad: '1', finaliteit: undefined }),
      ],
      [
        onderdeel(1, 'G-0100'),
        onderdeel(2, 'G-0200'),
        onderdeel(3, 'G-0300', { leerjaren: [{ code: '3' }] }),
        onderdeel(4, 'G-0400', { leerjaren: [{ code: '1' }] }),
        onderdeel(5, 'G-0500', { leerjaren: [{ code: '2' }] }),
      ],
    );
    const jaren = (nr: string) => richtingInfo(m, nr, VANDAAG)!.jaren;
    expect(jaren('G-0100')).toEqual([3, 4]);
    expect(jaren('G-0200')).toEqual([5, 6]);
    expect(jaren('G-0300')).toEqual([7]);
    expect(jaren('G-0400')).toEqual([1]);
    expect(jaren('G-0500')).toEqual([2]);
    expect(richtingInfo(m, 'G-0400', VANDAAG)!.stroom).toBe('A');
    expect(richtingInfo(m, 'G-0500', VANDAAG)!.stroom).toBe('B');
    expect(richtingInfo(m, 'G-0100', VANDAAG)!.stroom).toBeUndefined();
    expect(richtingInfo(m, 'G-0100', VANDAAG)!.graad).toBe(2);
    expect(richtingInfo(m, 'G-0300', VANDAAG)!.soort).toBe('zevende');
  });

  it('jaren: aanloop en afgebouwde onderdelen en leerjaren tellen niet mee, de rest wel (unie)', () => {
    const m = matrixVan(
      [groep('G-0100', 'Mix', [1, 2, 3, 4])],
      [
        onderdeel(1, 'G-0100', { leerjaren: [{ code: '1' }] }),
        onderdeel(2, 'G-0100', { leerjaren: [{ code: '2' }], aanloop: true }),
        onderdeel(3, 'G-0100', { leerjaren: [{ code: '2', einddatum: '2025-08-31' }] }),
        onderdeel(4, 'G-0100', { leerjaren: [{ code: '2' }], einddatum: '2025-08-31' }),
      ],
    );
    const info = richtingInfo(m, 'G-0100', VANDAAG)!;
    expect(info.jaren).toEqual([3]);
    expect(info.afgebouwd).toBe(false);
  });

  it('een afgebouwde richting: afgebouwd, afgebouwdSinds, opvolgers en de jaren die ze had', () => {
    const m = matrixVan(
      [
        groep('G-0010', 'Animator', [10], { graad: '3', type7: 'BSO_TIJDELIJK' }),
        groep('G-0020', 'Animator', [20, 21], { graad: '3', type7: 'NA_OK3' }),
        groep('G-0030', 'Andere', [30]),
      ],
      [
        onderdeel(10, 'G-0010', { leerjaren: [{ code: '3', einddatum: '2025-08-31' }], einddatum: '2025-08-31', volgende: [21, 10, 999] }),
        onderdeel(20, 'G-0020', { leerjaren: [{ code: '3' }] }),
        onderdeel(21, 'G-0020', { leerjaren: [{ code: '3' }], vorige: [10] }),
        onderdeel(30, 'G-0030'),
      ],
    );
    const info = richtingInfo(m, 'G-0010', VANDAAG)!;
    expect(info.afgebouwd).toBe(true);
    expect(info.afgebouwdSinds).toBe('2025-08-31');
    expect(info.jaren).toEqual([7]);
    expect(info.kanBuso).toBe(false);
    expect(info.opvolgers.map((g) => g.nummer)).toEqual(['G-0020']);
    // Op de einddatum zelf geldt het onderdeel nog.
    expect(richtingInfo(m, 'G-0010', '2025-08-31')!.afgebouwd).toBe(false);
    expect(richtingInfo(m, 'G-0020', VANDAAG)!.afgebouwd).toBe(false);
    expect(richtingInfo(m, 'G-0020', VANDAAG)!.opvolgers).toEqual([]);
  });

  it('een richting met een afgebouwd én een geldig onderdeel is niet afgebouwd', () => {
    const m = matrixVan([groep('G-0100', 'Deels', [1, 2])], [onderdeel(1, 'G-0100', { einddatum: '2024-08-31' }), onderdeel(2, 'G-0100')]);
    expect(richtingInfo(m, 'G-0100', VANDAAG)!.afgebouwd).toBe(false);
    expect(richtingInfo(m, 'G-0100', VANDAAG)!.afgebouwdSinds).toBeUndefined();
  });

  it('kanBuso: alleen met een geldig onderdeel met ov4', () => {
    expect(gewoneInfo({ ov4: true }).kanBuso).toBe(true);
    expect(gewoneInfo({ ov4: undefined }).kanBuso).toBe(false);
    expect(gewoneInfo({ ov4: true, einddatum: '2025-08-31' }).kanBuso).toBe(false);
    const m = matrixVan([groep('G-0100', 'Deels', [1, 2])], [onderdeel(1, 'G-0100', { ov4: true, einddatum: '2024-08-31' }), onderdeel(2, 'G-0100')]);
    expect(richtingInfo(m, 'G-0100', VANDAAG)!.kanBuso).toBe(false);
  });

  it('vormen, domeinen en duaal komen uit de geldige onderdelen; een domein in hoofdletters wordt leesbaar, "STEM" blijft', () => {
    const m = matrixVan(
      [groep('G-0100', 'Toerisme', [1, 2, 3, 4])],
      [
        onderdeel(1, 'G-0100', { onderwijsvorm: 'TSO', studiedomein: { omschrijving: 'ECONOMIE EN ORGANISATIE' } }),
        onderdeel(2, 'G-0100', { onderwijsvorm: 'TSO', studiedomein: { omschrijving: 'STEM' } }),
        onderdeel(3, 'G-0100', { onderwijsvorm: 'BSO', studiedomein: { omschrijving: 'Taal en cultuur' }, duaal: true }),
        onderdeel(4, 'G-0100', { onderwijsvorm: 'KSO', studiedomein: { omschrijving: 'KUNST EN CREATIE' }, einddatum: '2024-08-31' }),
      ],
    );
    const info = richtingInfo(m, 'G-0100', VANDAAG)!;
    expect(info.vormen).toEqual(['bso', 'tso']);
    expect(info.domeinen).toEqual(['Economie en organisatie', 'STEM', 'Taal en cultuur']);
    expect(info.duaal).toBe(true);
  });

  it('zelfdeNaam: dezelfde naam in een andere graad (zonder accenten en hoofdletters), niet de eigen graad, buso of afgebouwd', () => {
    const m = matrixVan(
      [
        groep('G-0100', 'Humane wetenschappen', [1]),
        groep('G-0200', 'HUMANE wetenschappen', [2], { graad: '3' }),
        groep('G-0300', 'Humane wetenschappen', [3], { graad: undefined, finaliteit: undefined, opleidingsvorm: { omschrijving: 'Beroepsonderwijs' } }),
        groep('G-0400', 'Humane wetenschappen', [4], { graad: '3' }),
      ],
      [
        onderdeel(1, 'G-0100'),
        onderdeel(2, 'G-0200'),
        onderdeel(3, 'G-0300', { hoofdstructuren: ['321'] }),
        onderdeel(4, 'G-0400', { einddatum: '2020-08-31' }),
      ],
    );
    expect(richtingInfo(m, 'G-0100', VANDAAG)!.zelfdeNaam.map((g) => g.nummer)).toEqual(['G-0200']);
    expect(richtingInfo(m, 'G-0200', VANDAAG)!.zelfdeNaam.map((g) => g.nummer)).toEqual(['G-0100']);
    expect(richtingInfo(m, 'G-0300', VANDAAG)!.zelfdeNaam).toEqual([]);
  });

  it('een groep die niet meer in de bron staat, draagt dat mee', () => {
    const info = gewoneInfo({}, { nietMeerInBron: '2026-11-03' });
    expect(info.nietMeerInBron).toBe('2026-11-03');
  });
});

// ── Weergave, sleutel en doelgroep ──────────────────────────────────────────

describe('kenmerken, sleutel en doelgroep', () => {
  it('kenmerkenVan: graad, finaliteit, vorm, domein en jaren in één regel', () => {
    const info = gewoneInfo({ studiedomein: { omschrijving: 'DOMEINOVERSCHRIJDEND' } });
    expect(kenmerkenVan(info)).toBe('2de graad · Doorstroomfinaliteit · aso · Domeinoverschrijdend · 3de en 4de jaar');
  });

  it('kenmerkenVan: wat ontbreekt blijft weg, een onbekende finaliteit blijft zoals ze is, de 1ste graad toont geen jaren', () => {
    const m = matrixVan(
      [
        groep('G-0100', 'Eerste leerjaar A', [1], { graad: '1', finaliteit: undefined }),
        groep('G-0200', 'Iets', [2], { graad: '3', finaliteit: 'XY' }),
        groep('G-0300', 'Zeven', [3], { graad: '3', finaliteit: 'A', type7: 'BSO_TIJDELIJK' }),
        groep('G-0400', 'Buso', [4], { graad: undefined, finaliteit: 'A', opleidingsvorm: { omschrijving: 'Beroepsonderwijs' } }),
      ],
      [
        onderdeel(1, 'G-0100', { onderwijsvorm: undefined, leerjaren: [{ code: '1' }] }),
        onderdeel(2, 'G-0200', { onderwijsvorm: undefined }),
        onderdeel(3, 'G-0300', { leerjaren: [{ code: '3' }], onderwijsvorm: 'BSO' }),
        onderdeel(4, 'G-0400', { onderwijsvorm: undefined, leerjaren: [{ code: '1' }], hoofdstructuren: ['321'] }),
      ],
    );
    const tekst = (nr: string) => kenmerkenVan(richtingInfo(m, nr, VANDAAG)!);
    expect(tekst('G-0100')).toBe('1ste graad');
    expect(tekst('G-0200')).toBe('3de graad · XY · 5de en 6de jaar');
    expect(tekst('G-0300')).toBe('3de graad · Arbeidsmarktfinaliteit · bso · 7de jaar');
    expect(tekst('G-0400')).toBe('Buitengewoon onderwijs · Arbeidsmarktfinaliteit');
  });

  it('de labels van de finaliteit', () => {
    expect(FINALITEIT_LABEL).toEqual({ DO: 'Doorstroomfinaliteit', DU: 'Dubbele finaliteit', A: 'Arbeidsmarktfinaliteit' });
  });

  it('kaderGroepSleutel: 1ste graad per stroom en soort, de rest per groep en soort', () => {
    const m = matrixVan(
      [
        groep('G-0100', 'Eerste leerjaar A', [1], { graad: '1' }),
        groep('G-0101', 'Tweede leerjaar A: Stem-wetenschappen', [2], { graad: '1' }),
        groep('G-0102', 'Tweede leerjaar B', [3], { graad: '1' }),
        groep('G-0193', 'Natuurwetenschappen', [4]),
        groep('G-0555', 'Zonder stroom', [5], { graad: '1' }),
      ],
      [onderdeel(1, 'G-0100'), onderdeel(2, 'G-0101'), onderdeel(3, 'G-0102'), onderdeel(4, 'G-0193'), onderdeel(5, 'G-0555')],
    );
    const info = (nr: string) => richtingInfo(m, nr, VANDAAG)!;
    expect(kaderGroepSleutel(info('G-0100'), 'so')).toBe('1|A|so');
    expect(kaderGroepSleutel(info('G-0101'), 'so')).toBe('1|A|so');
    expect(kaderGroepSleutel(info('G-0100'), 'buso')).toBe('1|A|buso');
    expect(kaderGroepSleutel(info('G-0102'), 'so')).toBe('1|B|so');
    expect(kaderGroepSleutel(info('G-0193'), 'so')).toBe('G-0193|so');
    expect(kaderGroepSleutel(info('G-0193'), 'buso')).toBe('G-0193|buso');
    // Een groep van de 1ste graad waarvan de stroom niet te lezen is, deelt niets.
    expect(kaderGroepSleutel(info('G-0555'), 'so')).toBe('G-0555|so');
  });

  it('doelgroepVan: een geldige, gesaneerde doelgroep met titel, graad, jaar, soort, onderdeel en vak', () => {
    const info = gewoneInfo({ titel: 'Natuurwetenschappen in een domein' });
    const d = doelgroepVan(info, keuze('so', { jaar: 4, onderdeel: 100 }), { vak: ' Biologie ' });
    expect(d).toEqual({ groep: 'G-0100', titel: 'Natuurwetenschappen in een domein', graad: 2, jaar: 4, soort: 'so', onderdeel: 100, vak: 'Biologie' });
    expect(sanitizeDoelgroep(d)).toEqual(d);
  });

  it('doelgroepVan: zonder onderdeel de titel van de groep; een vreemd onderdeel of een jaar buiten de graad valt weg; buso alleen als het kan', () => {
    const info = gewoneInfo();
    expect(doelgroepVan(info, keuze('so'))).toEqual({ groep: 'G-0100', titel: 'Testrichting', graad: 2, soort: 'so' });
    expect(doelgroepVan(info, keuze('so', { onderdeel: 777 })).onderdeel).toBeUndefined();
    expect(doelgroepVan(info, keuze('so', { jaar: 6 })).jaar).toBeUndefined();
    expect(doelgroepVan(info, keuze('buso')).soort).toBe('buso');
    expect(doelgroepVan(gewoneInfo({ ov4: undefined }), keuze('buso')).soort).toBe('so');
  });

  it('doelgroepVan: een richting van het buitengewoon onderwijs is altijd buso en heeft geen graad', () => {
    const m = matrixVan(
      [groep('G-0400', 'Buso', [4], { graad: undefined, opleidingsvorm: { omschrijving: 'Beroepsonderwijs' } })],
      [onderdeel(4, 'G-0400', { hoofdstructuren: ['321'] })],
    );
    const info = richtingInfo(m, 'G-0400', VANDAAG)!;
    const d = doelgroepVan(info, { groep: 'G-0400', soort: 'so' });
    expect(d).toEqual({ groep: 'G-0400', titel: 'Buso', soort: 'buso' });
  });
});

// ── filterRichtingen ────────────────────────────────────────────────────────

describe('filterRichtingen', () => {
  const m = matrixVan(
    [
      groep('G-0100', 'Natuurwetenschappen', [1]),
      groep('G-0200', 'Économie', [2], { graad: '3', finaliteit: 'DU' }),
      groep('G-0210', 'Economie en organisatie', [3], { graad: '3', finaliteit: 'A' }),
      groep('G-0300', 'Animator', [4], { graad: '3', finaliteit: undefined, type7: 'BSO_TIJDELIJK' }),
      groep('G-0310', 'Aanloop kok', [5], { finaliteit: 'A' }),
      groep('G-0400', 'Assistent plantaardige productie', [6], { graad: undefined, opleidingsvorm: { omschrijving: 'Beroepsonderwijs' } }),
      groep('G-0500', 'Oude richting', [7], { graad: '2', finaliteit: 'A' }),
      groep('G-0510', 'Verdwenen richting', [8], { nietMeerInBron: '2026-11-03' }),
      groep('G-0600', 'OKAN', [9], { graad: undefined, finaliteit: undefined }),
      groep('G-0700', 'Eerste leerjaar A', [10], { graad: '1', finaliteit: undefined }),
    ],
    [
      onderdeel(1, 'G-0100', { studiedomein: { omschrijving: 'DOMEINOVERSCHRIJDEND' } }),
      onderdeel(2, 'G-0200'),
      onderdeel(3, 'G-0210', { titel: 'Economie en organisatie, domein handel' }),
      onderdeel(4, 'G-0300', { leerjaren: [{ code: '3' }] }),
      onderdeel(5, 'G-0310', { aanloop: true }),
      onderdeel(6, 'G-0400', { hoofdstructuren: ['321'] }),
      onderdeel(7, 'G-0500', { einddatum: '2024-08-31' }),
      onderdeel(8, 'G-0510'),
      onderdeel(9, 'G-0600'),
      onderdeel(10, 'G-0700', { leerjaren: [{ code: '1' }] }),
    ],
  );
  const BASIS: RichtingFilter = { zoek: '', ookMeer: false, afgebouwd: false };
  const nrs = (f: Partial<RichtingFilter> = {}) => filterRichtingen(m, { ...BASIS, ...f }, VANDAAG).map((i) => i.groep.nummer);

  it('standaard: gewone richtingen (en OKAN als "ander"), zonder afgebouwd, buso, aanloop, zevende jaren en wat uit de bron verdween', () => {
    expect(nrs().sort()).toEqual(['G-0100', 'G-0200', 'G-0210', 'G-0600', 'G-0700'].sort());
  });

  it('is gesorteerd op titel zonder accenten, daarna op groepnummer', () => {
    expect(nrs()).toEqual(['G-0200', 'G-0210', 'G-0700', 'G-0100', 'G-0600']);
  });

  it('ookMeer: ook zevende jaren, aanloopjaren en buitengewoon onderwijs', () => {
    expect(nrs({ ookMeer: true }).sort()).toEqual(['G-0100', 'G-0200', 'G-0210', 'G-0300', 'G-0310', 'G-0400', 'G-0600', 'G-0700'].sort());
  });

  it('afgebouwd: ook wat afgebouwd is en wat niet meer in de bron staat', () => {
    expect(nrs({ afgebouwd: true }).sort()).toEqual(['G-0100', 'G-0200', 'G-0210', 'G-0500', 'G-0510', 'G-0600', 'G-0700'].sort());
    expect(nrs({ afgebouwd: true, ookMeer: true })).toHaveLength(10);
  });

  it('graad en finaliteit', () => {
    expect(nrs({ graad: 3 })).toEqual(['G-0200', 'G-0210']);
    expect(nrs({ graad: 1 })).toEqual(['G-0700']);
    expect(nrs({ graad: 2 })).toEqual(['G-0100']);
    expect(nrs({ graad: 3, finaliteit: 'DU' })).toEqual(['G-0200']);
    expect(nrs({ finaliteit: 'A' })).toEqual(['G-0210']);
    expect(nrs({ finaliteit: '' })).toHaveLength(5);
  });

  it('zoeken: zonder accenten en hoofdletters, in de titel, de onderdelen en het studiedomein; elk woord moet passen', () => {
    expect(nrs({ zoek: 'natuurwet' })).toEqual(['G-0100']);
    expect(nrs({ zoek: 'ÉCONOMIE' })).toEqual(['G-0200', 'G-0210']);
    expect(nrs({ zoek: 'economie handel' })).toEqual(['G-0210']);
    expect(nrs({ zoek: 'domeinoverschrijdend' })).toEqual(['G-0100']);
    expect(nrs({ zoek: 'economie nergens' })).toEqual([]);
    expect(nrs({ zoek: '   ' })).toHaveLength(5);
    expect(nrs({ zoek: 'animator', ookMeer: true })).toEqual(['G-0300']);
  });

  it('geeft de info van elke richting mee', () => {
    const info = filterRichtingen(m, BASIS, VANDAAG).find((i) => i.groep.nummer === 'G-0100')!;
    expect(info).toEqual(richtingInfo(m, 'G-0100', VANDAAG));
  });
});

// ── bouwKader: de regels ────────────────────────────────────────────────────

describe('bouwKader: R1, alleen sets uit de index', () => {
  it('een set die niet in de index staat gaat naar onbekend (gesorteerd), de rest blijft', () => {
    const a = indexSet('ODS_100', 'Biologie');
    const kader = kaderUit([a], [koppelSet(a), koppelSet(indexSet('ODS_300', 'X')), koppelSet(indexSet('ODS_90', 'Y'))]);
    expect(ids(kader.sets)).toEqual(['ODS_100']);
    expect(kader.onbekend).toEqual(['ODS_90', 'ODS_300']);
  });
});

describe('bouwKader: R2, het soort onderwijs', () => {
  const so = indexSet('ODS_100', 'Biologie');
  const buso = indexSet('ODS_101', 'Biologie', { soort: 'buso' });
  const vwo = indexSet('ODS_102', 'Biologie', { naam: 'Secundair Volwassenenonderwijs 2de graad - Biologie' });
  const index = [so, buso, vwo];

  it('so: de naam beslist als onderwijssoort ontbreekt; de rest telt als andere soort', () => {
    const kader = kaderUit(index, [koppelSet(so), koppelSet(buso), koppelSet(vwo)]);
    expect(ids(kader.sets)).toEqual(['ODS_100']);
    expect(kader.verborgenAndereSoort).toBe(2);
  });

  it('het officiële veld onderwijssoort "Buitengewoon" gaat voor de naam', () => {
    const kader = kaderUit(index, [koppelSet(so, undefined, { onderwijssoort: 'Buitengewoon' }), koppelSet(buso)]);
    expect(ids(kader.sets)).toEqual([]);
    expect(kader.verborgenAndereSoort).toBe(2);
    const buKader = kaderUit(index, [koppelSet(so, undefined, { onderwijssoort: 'Buitengewoon' }), koppelSet(buso)], { keuze: keuze('buso') });
    expect(ids(buKader.sets)).toEqual(['ODS_100', 'ODS_101']);
    expect(buKader.verborgenAndereSoort).toBe(0);
  });

  it('een andere waarde van onderwijssoort laat de naam beslissen', () => {
    const kader = kaderUit(index, [koppelSet(so, undefined, { onderwijssoort: 'Gewoon' }), koppelSet(buso, undefined, { onderwijssoort: 'Gewoon' })]);
    expect(ids(kader.sets)).toEqual(['ODS_100']);
  });

  it('buso met een geldig onderdeel met ov4: alleen de buitengewone sets; de keuze blijft buso', () => {
    const kader = kaderUit(index, [koppelSet(so), koppelSet(buso), koppelSet(vwo)], { keuze: keuze('buso') });
    expect(ids(kader.sets)).toEqual(['ODS_101']);
    expect(kader.verborgenAndereSoort).toBe(2);
    expect(kader.keuze.soort).toBe('buso');
  });

  it('buso zonder ov4 kan niet: het kader is dat van so, en de keuze in het kader zegt dat', () => {
    const info = gewoneInfo({ ov4: undefined });
    const kader = kaderUit(index, [koppelSet(so), koppelSet(buso)], { info, keuze: keuze('buso') });
    expect(ids(kader.sets)).toEqual(['ODS_100']);
    expect(kader.keuze.soort).toBe('so');
  });

  it('een richting van het buitengewoon onderwijs is altijd buso, ook als so gevraagd wordt', () => {
    const m = matrixVan(
      [groep('G-0400', 'Buso', [4], { graad: undefined, opleidingsvorm: { omschrijving: 'Beroepsonderwijs' } })],
      [onderdeel(4, 'G-0400', { hoofdstructuren: ['321'] })],
    );
    const info = richtingInfo(m, 'G-0400', VANDAAG)!;
    const bestand = koppelBestand('G-0400', [koppelSet(so), koppelSet(buso)]);
    const kader = bouwKader(bestand, regelVan(bestand), index, { groep: 'G-0400', soort: 'so' }, info);
    expect(ids(kader.sets)).toEqual(['ODS_101']);
    expect(kader.keuze.soort).toBe('buso');
  });
});

describe('bouwKader: R3, oude versies', () => {
  it('een set die niet meer geldt, of "Onbekend" naast een geldige set met dezelfde naam, valt weg en wordt geteld', () => {
    const nu = indexSet('ODS_100', 'Biologie');
    const oud = indexSet('ODS_90', 'Chemie', { geldigheid: 'Niet meer geldig' });
    const onbekendOud = indexSet('ODS_80', 'Biologie', { geldigheid: 'Onbekend' });
    const alleenOnbekend = indexSet('ODS_70', 'Fysica', { geldigheid: 'Onbekend' });
    const kader = kaderUit([nu, oud, onbekendOud, alleenOnbekend], [koppelSet(nu), koppelSet(oud), koppelSet(onbekendOud), koppelSet(alleenOnbekend)]);
    expect(ids(kader.sets)).toEqual(['ODS_70', 'ODS_100']);
    expect(kader.verborgenOud).toBe(2);
  });

  it('een oude set van het andere soort telt alleen bij verborgenAndereSoort', () => {
    const nu = indexSet('ODS_100', 'Biologie');
    const oudBuso = indexSet('ODS_90', 'Chemie', { geldigheid: 'Niet meer geldig', soort: 'buso' });
    const kader = kaderUit([nu, oudBuso], [koppelSet(nu), koppelSet(oudBuso)]);
    expect(kader.verborgenOud).toBe(0);
    expect(kader.verborgenAndereSoort).toBe(1);
  });
});

describe('bouwKader: R4, het jaar', () => {
  const gewoon = indexSet('ODS_100', 'Biologie', { graad: '3de graad' });
  const lj3 = indexSet('ODS_110', 'Competenties in het Nederlands', { graad: '3de graad', leerjaar: '3de leerjaar' });
  const lj3Oud = indexSet('ODS_90', 'Project', { graad: '3de graad', leerjaar: '3de leerjaar', geldigheid: 'Niet meer geldig' });
  const index = [gewoon, lj3, lj3Oud];
  const koppel = [koppelSet(gewoon), koppelSet(lj3), koppelSet(lj3Oud)];

  function infoVan(extra: Partial<StudierichtingGroep>, od: Partial<Structuuronderdeel> = {}): RichtingInfo {
    const m = matrixVan([groep('G-0100', 'Richting', [1], { graad: '3', ...extra })], [onderdeel(1, 'G-0100', od)]);
    return richtingInfo(m, 'G-0100', VANDAAG)!;
  }

  it('setPastBijJaar: de drie gevallen', () => {
    const drie = infoVan({});
    const zeven = infoVan({ type7: 'BSO_TIJDELIJK' }, { leerjaren: [{ code: '3' }] });
    const twee = gewoneInfo();
    expect(setPastBijJaar({ leerjaar: '3de leerjaar' }, drie, true)).toBe(false);
    expect(setPastBijJaar({}, drie, true)).toBe(true);
    expect(setPastBijJaar({ leerjaar: '3de leerjaar' }, zeven, true)).toBe(true);
    expect(setPastBijJaar({}, zeven, true)).toBe(false);
    expect(setPastBijJaar({}, zeven, false)).toBe(true);
    expect(setPastBijJaar({ leerjaar: '3de leerjaar' }, zeven, false)).toBe(true);
    expect(setPastBijJaar({ leerjaar: '3de leerjaar' }, twee, true)).toBe(true);
    expect(setPastBijJaar({}, twee, true)).toBe(true);
  });

  it('een richting van de 3de graad (5de en 6de jaar): sets van het 3de leerjaar staan in nietVoorDitJaar', () => {
    const info = infoVan({});
    const kader = kaderUit(index, koppel, { info, keuze: keuze('so', { jaar: 5 }) });
    expect(ids(kader.sets)).toEqual(['ODS_100']);
    expect(ids(kader.nietVoorDitJaar)).toEqual(['ODS_110']);
    // De oude set van het 3de leerjaar is verborgen als oud en staat niet ook nog eens bij "niet voor dit jaar".
    expect(kader.verborgenOud).toBe(1);
    expect(kader.aantalDoelen).toBe(5);
  });

  it('een zevende jaar met sets van het 3de leerjaar: alleen die; zonder zulke sets: alle', () => {
    const info = infoVan({ type7: 'BSO_TIJDELIJK' }, { leerjaren: [{ code: '3' }] });
    const metLj3 = kaderUit(index, koppel, { info, keuze: keuze('so', { jaar: 7 }) });
    expect(ids(metLj3.sets)).toEqual(['ODS_110']);
    expect(ids(metLj3.nietVoorDitJaar)).toEqual(['ODS_100']);
    const zonder = kaderUit([gewoon], [koppelSet(gewoon)], { info, keuze: keuze('so', { jaar: 7 }) });
    expect(ids(zonder.sets)).toEqual(['ODS_100']);
    expect(zonder.nietVoorDitJaar).toEqual([]);
    // Alleen een oude set van het 3de leerjaar in de koppeling telt niet: er zijn dan geen sets van het 3de leerjaar.
    const alleenOud = kaderUit([gewoon, lj3Oud], [koppelSet(gewoon), koppelSet(lj3Oud)], { info, keuze: keuze('so', { jaar: 7 }) });
    expect(ids(alleenOud.sets)).toEqual(['ODS_100']);
  });

  it('de 2de graad en het buitengewoon onderwijs: het jaar sluit niets uit', () => {
    const tweede = indexSet('ODS_120', 'Iets', { leerjaar: '3de leerjaar' });
    const kader = kaderUit([gewoon, tweede], [koppelSet(gewoon), koppelSet(tweede)]);
    expect(ids(kader.sets)).toEqual(['ODS_100', 'ODS_120']);
    expect(kader.nietVoorDitJaar).toEqual([]);
  });
});

describe('bouwKader: R5, R6 en R7', () => {
  it('volledig: alle doelen van de set; een deel is niet volledig', () => {
    const a = indexSet('ODS_100', 'Biologie', { aantal: 13 });
    const kader = kaderUit([a], [koppelSet(a, ['1', '2', '3', '4'])]);
    expect(kader.sets[0].volledig).toBe(false);
    expect(kader.sets[0].ids).toEqual(['1', '2', '3', '4']);
    expect(kaderUit([a], [koppelSet(a)]).sets[0].volledig).toBe(true);
  });

  it('versieGelijk: het versiemerk is het begin van de sha256 in de index', () => {
    const a = indexSet('ODS_100', 'Biologie');
    expect(kaderUit([a], [koppelSet(a)]).sets[0].versieGelijk).toBe(true);
    expect(kaderUit([a], [koppelSet(a, undefined, { setSha: '0123456789abcdef' })]).sets[0].versieGelijk).toBe(false);
    // Eén teken verschil, helemaal achteraan in het versiemerk, is al een andere versie.
    const bijna = a.sha256.slice(0, 15) + (a.sha256[15] === 'f' ? 'e' : 'f');
    expect(kaderUit([a], [koppelSet(a, undefined, { setSha: bijna })]).sets[0].versieGelijk).toBe(false);
    // Wat na de eerste 16 tekens van de sha256 komt, doet niet mee.
    const andereStaart = { ...a, sha256: a.sha256.slice(0, 16) + '0'.repeat(48) };
    expect(kaderUit([andereStaart], [koppelSet(a)]).sets[0].versieGelijk).toBe(true);
  });

  it('een uitbreidingsset is niet verplicht en telt niet mee in aantalVerplicht, wel in aantalDoelen', () => {
    const a = indexSet('ODS_100', 'Nederlands', { aantal: 4 });
    const u = indexSet('ODS_101', 'Nederlands', { aantal: 3, naam: 'Secundair onderwijs 2de graad -  Competenties in het Nederlands - Uitbreidingsdoelen' });
    const kader = kaderUit([a, u], [koppelSet(a), koppelSet(u)]);
    expect(kader.sets.map((k) => k.verplicht)).toEqual([true, false]);
    expect(kader.aantalDoelen).toBe(7);
    expect(kader.aantalVerplicht).toBe(4);
  });

  it('de volgorde is oplopend setnummer (numeriek), ongeacht de volgorde in de koppeling en de index', () => {
    const lijst = ['ODS_1000', 'ODS_90', 'ODS_2795', 'ODS_100'].map((id) => indexSet(id, `Vak ${id}`));
    const kader = kaderUit([...lijst].reverse(), lijst.map((s) => koppelSet(s)));
    expect(ids(kader.sets)).toEqual(['ODS_90', 'ODS_100', 'ODS_1000', 'ODS_2795']);
  });

  it('de nummers van een set blijven zoals de koppeling ze geeft', () => {
    const a = indexSet('ODS_100', 'Biologie', { aantal: 13 });
    const kader = kaderUit([a], [koppelSet(a, ['89285', '89286', '89290'])]);
    expect(kader.sets[0].ids).toEqual(['89285', '89286', '89290']);
  });
});

describe('bouwKader: herkomst en grenzen', () => {
  const a = indexSet('ODS_100', 'Biologie');
  const info = gewoneInfo();

  it('api en graad-en-stroom komen uit het bestand; opgehaald ook', () => {
    const api = koppelBestand('G-0100', [koppelSet(a)]);
    const k1 = bouwKader(api, regelVan(api), [a], keuze(), info);
    expect(k1.herkomst).toBe('api');
    expect(k1.opgehaald).toBe('2026-10-09T00:00:00Z');
    expect(k1.nietMeerInBron).toBeUndefined();
    const stroom = koppelBestand('G-0100', [koppelSet(a)], { methode: 'graad-en-stroom', graad: '1', filter: 'graad=1ste graad; stroom=A-stroom (regel)' });
    expect(bouwKader(stroom, regelVan(stroom), [a], keuze(), info).herkomst).toBe('graad-en-stroom');
  });

  it('geen regel, een index zonder die groep, of "nog-niet-opgehaald": nog-niet-opgehaald, zonder sets', () => {
    const b = koppelBestand('G-0100', [koppelSet(a)]);
    const k0 = bouwKader(null, undefined, [a], keuze(), info);
    expect(k0).toMatchObject({ herkomst: 'nog-niet-opgehaald', sets: [], aantalDoelen: 0, aantalVerplicht: 0, nietVoorDitJaar: [], onbekend: [], teGroot: false });
    expect(k0.opgehaald).toBeUndefined();
    // Zonder regel telt een meegegeven bestand niet: de koppeling is er dan niet.
    expect(bouwKader(b, undefined, [a], keuze(), info).herkomst).toBe('nog-niet-opgehaald');
    const regel: RichtingDoelenIndexRegel = { groep: 'G-0100', status: 'nog-niet-opgehaald' };
    expect(bouwKader(b, regel, [a], keuze(), info)).toMatchObject({ herkomst: 'nog-niet-opgehaald', sets: [] });
  });

  it('een gekoppelde groep zonder bestand (of met het bestand van een andere groep) is nog-niet-opgehaald', () => {
    const b = koppelBestand('G-0100', [koppelSet(a)]);
    expect(bouwKader(null, regelVan(b), [a], keuze(), info).herkomst).toBe('nog-niet-opgehaald');
    const anders = koppelBestand('G-0999', [koppelSet(a)]);
    expect(bouwKader(anders, regelVan(b), [a], keuze(), info)).toMatchObject({ herkomst: 'nog-niet-opgehaald', sets: [] });
  });

  it('status "geen": herkomst geen; een laatst bekend bestand wordt nog gebruikt, met nietMeerInBron', () => {
    const regel: RichtingDoelenIndexRegel = { groep: 'G-0100', status: 'geen', opgehaald: '2026-11-03T05:53:02Z' };
    const zonder = bouwKader(null, regel, [a], keuze(), info);
    expect(zonder).toMatchObject({ herkomst: 'geen', sets: [], opgehaald: '2026-11-03T05:53:02Z' });
    const oud = koppelBestand('G-0100', [koppelSet(a)], { nietMeerInBron: '2026-11-03' });
    const metBestand = bouwKader(oud, { ...regel, bestand: 'G-0100.json', nietMeerInBron: '2026-11-03' }, [a], keuze(), info);
    expect(metBestand.herkomst).toBe('geen');
    expect(metBestand.nietMeerInBron).toBe('2026-11-03');
    expect(ids(metBestand.sets)).toEqual(['ODS_100']);
  });

  it('teGroot: meer dan 50 sets, of meer dan 5000 doelen', () => {
    const veel = Array.from({ length: MAX_SETS + 1 }, (_, i) => indexSet(`ODS_${1000 + i}`, `Vak ${i}`, { aantal: 2 }));
    expect(kaderUit(veel, veel.map((s) => koppelSet(s))).teGroot).toBe(true);
    expect(kaderUit(veel.slice(0, MAX_SETS), veel.slice(0, MAX_SETS).map((s) => koppelSet(s))).teGroot).toBe(false);
    const groot = indexSet('ODS_100', 'Groot', { aantal: MAX_DOELEN + 1 });
    expect(kaderUit([groot], [koppelSet(groot)]).teGroot).toBe(true);
    const net = indexSet('ODS_100', 'Net', { aantal: MAX_DOELEN });
    expect(kaderUit([net], [koppelSet(net)]).teGroot).toBe(false);
  });

  it('de gegevens van de invoer blijven ongewijzigd', () => {
    const b = koppelBestand('G-0100', [koppelSet(a), koppelSet(indexSet('ODS_50', 'X'))]);
    const voor = JSON.stringify(b);
    bouwKader(b, regelVan(b), [a], keuze(), info);
    expect(JSON.stringify(b)).toBe(voor);
  });
});

// ── selectieVanKader, naarSetKeuzes en de vingerafdruk ──────────────────────

/** Een echte set met `n` doelen met nummers `<prefix>1` tot `<prefix>n`. */
function setBestand(id: string, n: number, prefix: string): MinimumdoelenSetBestand {
  const doelen: Minimumdoel[] = Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, code: `1.${String(i + 1).padStart(2, '0')}`, tekst: `Doel ${i + 1} van ${id}.` }));
  return {
    app: 'boosterz', kind: 'minimumdoelen', v: 1,
    set: {
      id, naam: `Secundair onderwijs 2de graad -  Testvak - Cesuurdoelen`, korteNaam: 'Testvak', sleutelcompetenties: [], bron: 'x', api: 'x', naamsvermelding: 'x',
      licentie: 'x', opgehaald: '2026-10-05T10:00:00Z', aantal: n, sha256: SHA,
    },
    doelen,
  };
}

describe('selectieVanKader', () => {
  const hele = indexSet('ODS_100', 'Wiskunde', { aantal: 3 });
  const deel = indexSet('ODS_110', 'Biologie', { aantal: 13 });
  const uitbreiding = indexSet('ODS_120', 'Nederlands', { aantal: 2, naam: 'Secundair onderwijs 2de graad -  Competenties in het Nederlands - Uitbreidingsdoelen' });
  const kader = kaderUit([hele, deel, uitbreiding], [koppelSet(hele), koppelSet(deel, ['a1', 'a2', 'a3', 'a4']), koppelSet(uitbreiding)]);

  it('een volledige set is "alle", een deel zijn nummers; uitbreiding niet standaard; in de volgorde van het kader', () => {
    const s = selectieVanKader(kader);
    expect([...s.keys()]).toEqual(['ODS_100', 'ODS_110']);
    expect(s.get('ODS_100')).toBe('alle');
    expect(s.get('ODS_110')).toEqual(['a1', 'a2', 'a3', 'a4']);
  });

  it('ookUitbreiding voegt de uitbreidingssets toe; sets beperkt tot de genoemde sets (ook zonder ze te kennen)', () => {
    expect([...selectieVanKader(kader, { ookUitbreiding: true }).keys()]).toEqual(['ODS_100', 'ODS_110', 'ODS_120']);
    expect([...selectieVanKader(kader, { sets: ['ODS_110', 'ODS_999'] }).keys()]).toEqual(['ODS_110']);
    expect([...selectieVanKader(kader, { sets: [] }).keys()]).toEqual([]);
    // Een uitbreidingsset komt er alleen met ookUitbreiding in, ook als ze genoemd wordt.
    expect([...selectieVanKader(kader, { sets: ['ODS_120'] }).keys()]).toEqual([]);
    expect([...selectieVanKader(kader, { sets: ['ODS_120'], ookUitbreiding: true }).keys()]).toEqual(['ODS_120']);
  });

  it('een volledige set met een ander versiemerk blijft "alle" (de huidige inhoud)', () => {
    const k = kaderUit([hele], [koppelSet(hele, undefined, { setSha: 'f'.repeat(16) })]);
    expect(k.sets[0].versieGelijk).toBe(false);
    expect(selectieVanKader(k).get('ODS_100')).toBe('alle');
  });

  it('een kader zonder sets geeft een lege selectie', () => {
    expect(selectieVanKader(bouwKader(null, undefined, [], keuze(), gewoneInfo())).size).toBe(0);
  });
});

describe('naarSetKeuzes', () => {
  const A = setBestand('ODS_100', 3, 'w');
  const B = setBestand('ODS_110', 13, 'a');
  const bestanden = new Map([['ODS_100', A], ['ODS_110', B]]);

  it('een volledige set blijft "alle"', () => {
    const { keuzes, ontbrekend } = naarSetKeuzes(new Map([['ODS_100', 'alle']]), bestanden);
    expect(keuzes).toEqual([{ bestand: A, doelen: 'alle' }]);
    expect(ontbrekend).toEqual([]);
  });

  it('een deelset geeft ALTIJD een lijst nummers, nooit "alle": 4 van 13 blijven 4', () => {
    const { keuzes } = naarSetKeuzes(new Map([['ODS_110', ['a1', 'a2', 'a3', 'a4']]]), bestanden);
    expect(keuzes).toHaveLength(1);
    expect(keuzes[0].doelen).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(Array.isArray(keuzes[0].doelen)).toBe(true);
  });

  it('ook een deelset die toevallig alle doelen van het bestand noemt, blijft een lijst', () => {
    const { keuzes } = naarSetKeuzes(new Map([['ODS_100', ['w1', 'w2', 'w3']]]), bestanden);
    expect(keuzes[0].doelen).toEqual(['w1', 'w2', 'w3']);
  });

  it('de nummers staan in de volgorde van de set, zonder dubbels', () => {
    const { keuzes } = naarSetKeuzes(new Map([['ODS_110', ['a10', 'a2', 'a2', ' a1 ']]]), bestanden);
    expect(keuzes[0].doelen).toEqual(['a1', 'a2', 'a10']);
  });

  it('nummers die niet meer in het bestand staan komen in ontbrekend, niet in de keuze', () => {
    const { keuzes, ontbrekend } = naarSetKeuzes(new Map([['ODS_110', ['a1', 'a99', 'a98']]]), bestanden);
    expect(keuzes[0].doelen).toEqual(['a1']);
    expect(ontbrekend).toEqual([{ set: 'ODS_110', ids: ['a98', 'a99'] }]);
  });

  it('blijft er niets over, dan is er voor die set geen keuze; een set zonder geladen bestand valt weg', () => {
    const { keuzes, ontbrekend } = naarSetKeuzes(new Map<string, 'alle' | string[]>([['ODS_110', ['x1']], ['ODS_999', ['y']], ['ODS_100', 'alle']]), bestanden);
    expect(keuzes.map((k) => k.bestand.set.id)).toEqual(['ODS_100']);
    expect(ontbrekend).toEqual([{ set: 'ODS_110', ids: ['x1'] }]);
  });

  it('de volgorde van de selectie blijft; een lege selectie geeft niets', () => {
    const { keuzes } = naarSetKeuzes(new Map<string, 'alle' | string[]>([['ODS_110', ['a1']], ['ODS_100', 'alle']]), bestanden);
    expect(keuzes.map((k) => k.bestand.set.id)).toEqual(['ODS_110', 'ODS_100']);
    expect(naarSetKeuzes(new Map(), bestanden)).toEqual({ keuzes: [], ontbrekend: [] });
  });

  it('regressie (§ 9.5): een deelset van 4 van 13 geeft na naarSetKeuzes en leerplanUitSelectie 4 doelen, niet 13', () => {
    const hele = indexSet('ODS_100', 'Wiskunde', { aantal: 3 });
    const deel = indexSet('ODS_110', 'Biologie', { aantal: 13 });
    const kader = kaderUit([hele, deel], [koppelSet(hele, ['w1', 'w2', 'w3']), koppelSet(deel, ['a2', 'a5', 'a7', 'a11'])]);
    const { keuzes, ontbrekend } = naarSetKeuzes(selectieVanKader(kader), bestanden);
    expect(ontbrekend).toEqual([]);
    const r = leerplanUitSelectie(keuzes, { titel: 'Test' });
    expect(r.bevestigd).toBe(true);
    expect(r.leerplan.goals).toHaveLength(3 + 4);
    expect(r.leerplan.minimumdoelenSets).toEqual(['ODS_100', 'ODS_110']);
  });
});

// Het hart van de valkuil (§ 9.5): `volledig` volgt `setAantal` uit de KOPPELING (hoeveel doelen de set telde toen de
// koppeling werd gemaakt), nooit het aantal uit de INDEX (hoeveel ze nu telt). Anders wordt een deelset stil een hele set
// zodra de set krimpt tot het aantal nummers van de koppeling, of een hele set een deelset zodra de set groeit.
describe('volledig volgt setAantal van de koppeling, niet het aantal van de index (§ 7, § 9.5)', () => {
  /** Het versiemerk van een latere versie: anders dan het begin van de sha256 van de index. */
  const LATER = 'f'.repeat(16);

  /** Een set met precies deze nummers, zoals het bestand ze nu heeft. */
  function bestandMet(id: string, nummers: string[]): MinimumdoelenSetBestand {
    const b = setBestand(id, nummers.length, 'x');
    return { ...b, doelen: nummers.map((n, i) => ({ id: n, code: `1.${String(i + 1).padStart(2, '0')}`, tekst: `Doel ${n} van ${id}.` })) };
  }
  const reeks = (prefix: string, van: number, tot: number) => Array.from({ length: tot - van + 1 }, (_, i) => `${prefix}${van + i}`);

  it('koppeling met 4 nummers en setAantal 13, index met aantal 4: volledig is false (4 is niet 13)', () => {
    const nu = indexSet('ODS_110', 'Biologie', { aantal: 4, sha256: 'e'.repeat(64) });
    const kader = kaderUit([nu], [koppelSet(nu, ['a1', 'a2', 'a3', 'a4'], { setAantal: 13, setSha: LATER })]);
    expect(kader.sets).toHaveLength(1);
    expect(kader.sets[0].versieGelijk).toBe(false);
    expect(kader.sets[0].volledig).toBe(false);
    expect(kader.aantalDoelen).toBe(4);
    // Een deelset geeft de nummers, nooit "alle".
    expect(selectieVanKader(kader).get('ODS_110')).toEqual(['a1', 'a2', 'a3', 'a4']);
  });

  it('...en naarSetKeuzes neemt van die deelset de nummers die nog bestaan; de rest staat in ontbrekend en een nieuw doel komt er niet bij', () => {
    const nu = indexSet('ODS_110', 'Biologie', { aantal: 4, sha256: 'e'.repeat(64) });
    const kader = kaderUit([nu], [koppelSet(nu, ['a1', 'a2', 'a3', 'a4'], { setAantal: 13, setSha: LATER })]);
    // De huidige set telt 4 doelen (zoals de index zegt), maar a4 is eruit en a9 is erbij gekomen.
    const huidig = bestandMet('ODS_110', ['a1', 'a2', 'a3', 'a9']);
    const { keuzes, ontbrekend } = naarSetKeuzes(selectieVanKader(kader), new Map([['ODS_110', huidig]]));
    expect(keuzes).toHaveLength(1);
    expect(keuzes[0].doelen).toEqual(['a1', 'a2', 'a3']);
    expect(ontbrekend).toEqual([{ set: 'ODS_110', ids: ['a4'] }]);
    expect(leerplanUitSelectie(keuzes, { titel: 'Test' }).leerplan.goals).toHaveLength(3);
  });

  it('koppeling met 13 nummers en setAantal 13, index met aantal 15: volledig is true (13 is 13)', () => {
    const nu = indexSet('ODS_110', 'Biologie', { aantal: 15, sha256: 'e'.repeat(64) });
    const kader = kaderUit([nu], [koppelSet(nu, reeks('a', 1, 13), { setAantal: 13, setSha: LATER })]);
    expect(kader.sets[0].versieGelijk).toBe(false);
    expect(kader.sets[0].volledig).toBe(true);
    expect(kader.aantalVerplicht).toBe(13);
    expect(selectieVanKader(kader).get('ODS_110')).toBe('alle');
  });

  it('...en naarSetKeuzes neemt van die hele set de huidige inhoud: alle 15 doelen, en niets ontbreekt', () => {
    const nu = indexSet('ODS_110', 'Biologie', { aantal: 15, sha256: 'e'.repeat(64) });
    const kader = kaderUit([nu], [koppelSet(nu, reeks('a', 1, 13), { setAantal: 13, setSha: LATER })]);
    const huidig = bestandMet('ODS_110', reeks('a', 1, 15));
    const { keuzes, ontbrekend } = naarSetKeuzes(selectieVanKader(kader), new Map([['ODS_110', huidig]]));
    expect(keuzes).toEqual([{ bestand: huidig, doelen: 'alle' }]);
    expect(ontbrekend).toEqual([]);
    expect(leerplanUitSelectie(keuzes, { titel: 'Test' }).leerplan.goals).toHaveLength(15);
  });

  it('een hele set die intussen kromp (13 in de koppeling, 11 in de index): nog steeds volledig, de huidige inhoud, en niets "ontbreekt"', () => {
    const nu = indexSet('ODS_110', 'Biologie', { aantal: 11, sha256: 'e'.repeat(64) });
    const kader = kaderUit([nu], [koppelSet(nu, reeks('a', 1, 13), { setAantal: 13, setSha: LATER })]);
    expect(kader.sets[0].volledig).toBe(true);
    const huidig = bestandMet('ODS_110', reeks('a', 1, 11));
    const { keuzes, ontbrekend } = naarSetKeuzes(selectieVanKader(kader), new Map([['ODS_110', huidig]]));
    expect(keuzes[0].doelen).toBe('alle');
    expect(ontbrekend).toEqual([]);
    expect(leerplanUitSelectie(keuzes, { titel: 'Test' }).leerplan.goals).toHaveLength(11);
  });

  it('bij een gelijk versiemerk en een gelijk aantal verandert er niets: volledig en versieGelijk zijn onafhankelijk van elkaar', () => {
    const s = indexSet('ODS_110', 'Biologie', { aantal: 13 });
    const gelijk = kaderUit([s], [koppelSet(s, reeks('a', 1, 4))]).sets[0];
    expect([gelijk.versieGelijk, gelijk.volledig]).toEqual([true, false]);
    const gelijkVolledig = kaderUit([s], [koppelSet(s, reeks('a', 1, 13))]).sets[0];
    expect([gelijkVolledig.versieGelijk, gelijkVolledig.volledig]).toEqual([true, true]);
    const later = kaderUit([s], [koppelSet(s, reeks('a', 1, 13), { setSha: LATER })]).sets[0];
    expect([later.versieGelijk, later.volledig]).toEqual([false, true]);
  });
});

describe('kaderVingerafdruk', () => {
  const a = indexSet('ODS_100', 'Wiskunde', { aantal: 3 });
  const b = indexSet('ODS_110', 'Biologie', { aantal: 13 });
  const c = indexSet('ODS_120', 'Chemie', { aantal: 25 });
  const kader = kaderUit([a, b, c], [koppelSet(a), koppelSet(b, ['x1', 'x2', 'x3']), koppelSet(c, ['y1'])]);

  it('is een sha256 (64 hex-tekens) en stabiel', () => {
    expect(kaderVingerafdruk(kader)).toMatch(/^[0-9a-f]{64}$/);
    expect(kaderVingerafdruk(kader)).toBe(kaderVingerafdruk(kader));
  });

  it('hangt niet af van de volgorde van de sets of van de nummers', () => {
    const omgekeerd: RichtingKader = {
      ...kader,
      sets: [...kader.sets].reverse().map((k) => ({ ...k, ids: [...k.ids].reverse() })),
    };
    expect(kaderVingerafdruk(omgekeerd)).toBe(kaderVingerafdruk(kader));
  });

  it('verandert met een ander nummer, een andere set of volledig tegenover deel', () => {
    const ander = kaderUit([a, b, c], [koppelSet(a), koppelSet(b, ['x1', 'x2', 'x4']), koppelSet(c, ['y1'])]);
    expect(kaderVingerafdruk(ander)).not.toBe(kaderVingerafdruk(kader));
    const minder = kaderUit([a, b], [koppelSet(a), koppelSet(b, ['x1', 'x2', 'x3'])]);
    expect(kaderVingerafdruk(minder)).not.toBe(kaderVingerafdruk(kader));
    const deelA = kaderUit([a, b, c], [koppelSet(a, ['1', '2']), koppelSet(b, ['x1', 'x2', 'x3']), koppelSet(c, ['y1'])]);
    expect(kaderVingerafdruk(deelA)).not.toBe(kaderVingerafdruk(kader));
  });

  it('een volledige set telt als "set|*": nieuwe nummers in een volledige set veranderen de afdruk niet', () => {
    const k2 = kaderUit([a, b, c], [koppelSet(a, ['p', 'q', 'r']), koppelSet(b, ['x1', 'x2', 'x3']), koppelSet(c, ['y1'])]);
    expect(k2.sets[0].volledig).toBe(true);
    expect(kaderVingerafdruk(k2)).toBe(kaderVingerafdruk(kader));
  });

  it('beperkt tot de genoemde sets (in elke volgorde); onbekende sets doen niet mee', () => {
    const alleen = kaderVingerafdruk(kader, ['ODS_110', 'ODS_100']);
    expect(alleen).toBe(kaderVingerafdruk(kader, ['ODS_100', 'ODS_110', 'ODS_999']));
    expect(alleen).not.toBe(kaderVingerafdruk(kader));
    const zonderC = kaderUit([a, b], [koppelSet(a), koppelSet(b, ['x1', 'x2', 'x3'])]);
    expect(kaderVingerafdruk(zonderC)).toBe(alleen);
    // Het nummer van een andere set verandert de afdruk van deze sets niet.
    const anderC = kaderUit([a, b, c], [koppelSet(a), koppelSet(b, ['x1', 'x2', 'x3']), koppelSet(c, ['z9'])]);
    expect(kaderVingerafdruk(anderC, ['ODS_100', 'ODS_110'])).toBe(alleen);
    expect(kaderVingerafdruk(kader, [])).toBe(kaderVingerafdruk(kaderUit([], [])));
  });
});

// ── Op de fixtures (nagebootste API) en de echte index ──────────────────────

const WORTEL = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURES = join(WORTEL, 'tests', 'fixtures', 'structuur', 'uit');
const INDEX_BESTAND = join(WORTEL, 'public', 'leerplannen', 'minimumdoelen', 'index.json');
const MINIMUMDOELEN_MAP = join(WORTEL, 'public', 'leerplannen', 'minimumdoelen');
const HEEFT_FIXTURES = existsSync(join(FIXTURES, 'studierichtingen.json')) && existsSync(join(FIXTURES, 'richtingdoelen', 'index.json')) && existsSync(INDEX_BESTAND);

function leesJson<T>(pad: string): T {
  return JSON.parse(readFileSync(pad, 'utf8')) as T;
}

/** Alle gegevens van een map met de structuur (matrix, koppeling, bestanden) en de echte index. */
function laadStructuur(map: string) {
  const matrix = leesJson<MatrixBestand>(join(map, 'studierichtingen.json'));
  const koppeling = leesJson<RichtingDoelenIndex>(join(map, 'richtingdoelen', 'index.json'));
  const index = leesJson<MinimumdoelenIndex>(INDEX_BESTAND).sets;
  const bestandVan = (nr: string): { regel: RichtingDoelenIndexRegel | undefined; bestand: RichtingDoelenBestand | null } => {
    const regel = koppeling.groepen.find((r) => r.groep === nr);
    const pad = regel?.bestand ? join(map, 'richtingdoelen', regel.bestand) : undefined;
    return { regel, bestand: pad && existsSync(pad) ? leesJson<RichtingDoelenBestand>(pad) : null };
  };
  const kaderVan = (nr: string, k: Partial<RichtingKeuze> = {}, vandaag = VANDAAG) => {
    const info = richtingInfo(matrix, nr, vandaag)!;
    const { regel, bestand } = bestandVan(nr);
    const keuzeVan: RichtingKeuze = { groep: nr, soort: 'so', ...k };
    return { info, kader: bouwKader(bestand, regel, index, keuzeVan, info), bestand, regel };
  };
  return { matrix, koppeling, index, bestandVan, kaderVan };
}

/**
 * Het hart van "voor elke gekoppelde groep en elk jaar hoogstens 50 sets en 5000 doelen" (de grens van één leerplan):
 * loopt over alle gekoppelde groepen, elk jaar en elk soort onderwijs. Geeft de overtredingen terug.
 */
function overschrijdingen(map: string, vandaag: string): { gekeken: number; fouten: string[] } {
  const { matrix, koppeling, kaderVan } = laadStructuur(map);
  const fouten: string[] = [];
  let gekeken = 0;
  for (const regel of koppeling.groepen) {
    if (regel.status !== 'gekoppeld') continue;
    const info = richtingInfo(matrix, regel.groep, vandaag);
    if (!info) {
      fouten.push(`${regel.groep}: staat niet in de matrix`);
      continue;
    }
    const soorten: ('so' | 'buso')[] = info.kanBuso || info.soort === 'buso' ? ['so', 'buso'] : ['so'];
    const jaren: (number | undefined)[] = info.jaren.length > 0 ? info.jaren : [undefined];
    for (const jaar of jaren) {
      for (const soort of soorten) {
        gekeken++;
        const { kader } = kaderVan(regel.groep, { jaar, soort }, vandaag);
        if (kader.sets.length > MAX_SETS) fouten.push(`${regel.groep} jaar ${jaar ?? '-'} ${soort}: ${kader.sets.length} sets (meer dan ${MAX_SETS})`);
        if (kader.aantalDoelen > MAX_DOELEN) fouten.push(`${regel.groep} jaar ${jaar ?? '-'} ${soort}: ${kader.aantalDoelen} doelen (meer dan ${MAX_DOELEN})`);
        if (kader.teGroot) fouten.push(`${regel.groep} jaar ${jaar ?? '-'} ${soort}: te groot`);
      }
    }
  }
  return { gekeken, fouten };
}

describe.runIf(HEEFT_FIXTURES)('kader op tests/fixtures/structuur/uit en de echte index', () => {
  const { matrix, index, bestandVan, kaderVan } = laadStructuur(FIXTURES);
  const indexPerId = new Map(index.map((s) => [s.id, s]));
  const SO = /^Secundair onderwijs /;

  it('elk kader bevat alleen sets uit de index, van het gevraagde soort, zonder oude versies, in oplopende volgorde', () => {
    for (const nr of ['G-0193', 'G-0117', 'G-0327', 'G-0307', 'G-0008']) {
      const { kader } = kaderVan(nr);
      expect(kader.sets.length, nr).toBeGreaterThan(0);
      for (const k of kader.sets) {
        expect(indexPerId.get(k.set.id), `${nr} ${k.set.id}`).toBeDefined();
        expect(k.set.naam, `${nr} ${k.set.id}`).toMatch(SO);
        expect(k.set.geldigheid, `${nr} ${k.set.id}`).not.toBe('Niet meer geldig');
        expect(k.ids.length).toBeGreaterThan(0);
      }
      const nummers = kader.sets.map((k) => Number(k.set.id.replace('ODS_', '')));
      expect(nummers, nr).toEqual([...nummers].sort((a, b) => a - b));
      expect(kader.onbekend, nr).toEqual([]);
      expect(kader.aantalDoelen, nr).toBe(kader.sets.reduce((n, k) => n + k.ids.length, 0));
    }
  });

  it('G-0193 (Natuurwetenschappen, 2de graad): herkomst api, volledige sets en deelsets, ruim binnen de grenzen', () => {
    const { info, kader } = kaderVan('G-0193', { jaar: 4 });
    expect(info.graad).toBe(2);
    expect(info.jaren).toEqual([3, 4]);
    expect(kader.herkomst).toBe('api');
    expect(kader.keuze).toEqual({ groep: 'G-0193', jaar: 4, soort: 'so' });
    expect(kader.sets.some((k) => k.volledig)).toBe(true);
    expect(kader.sets.some((k) => !k.volledig)).toBe(true);
    expect(kader.teGroot).toBe(false);
    expect(kader.aantalVerplicht).toBe(kader.aantalDoelen);
    expect(kader.verborgenAndereSoort).toBeGreaterThan(0);
    expect(kader.nietVoorDitJaar).toEqual([]);
  });

  // ── G-0193, Biologie: een deelset die bij één versie van de set hoort (§ 7) ──
  // De fixtures horen bij een bepaalde versie van de set ODS_3132. De levende sets in public/leerplannen/minimumdoelen
  // worden elke maand bijgewerkt en mogen veranderen zonder dat een test faalt. Wat strikt is (aantal, ordeningskader,
  // niets ontbreekt) wordt alleen gecontroleerd bij een gelijk versiemerk. Wat bij elke versie moet kloppen, wordt
  // afgeleid uit de huidige set zelf.
  const BIO = 'ODS_3132';
  const bio = kaderVan('G-0193').kader.sets.find((k) => k.set.id === BIO);
  const bioPad = bio ? join(MINIMUMDOELEN_MAP, bio.set.bestand) : undefined;
  const bioNu = bioPad !== undefined && existsSync(bioPad) ? leesJson<MinimumdoelenSetBestand>(bioPad) : undefined;
  const bioIdsNu = new Set((bioNu?.doelen ?? []).map((d) => d.id));
  /** De set staat (nog) als geldige set in de index en minstens één nummer uit de koppeling bestaat nog. */
  const bioBestaatNog = bio !== undefined && bioNu !== undefined && bio.ids.some((id) => bioIdsNu.has(id));
  /** De koppeling en de huidige set zijn van dezelfde versie: dan geldt de strikte regel van § 7. */
  const bioGelijk = bioBestaatNog && bio?.versieGelijk === true;
  if (bio && !bio.versieGelijk) {
    // eslint-disable-next-line no-console
    console.info(`${BIO} heeft sinds de fixtures een andere versie (${bio.set.sha256.slice(0, 16)}): de strikte vergelijking met het ordeningskader wordt overgeslagen (docs/STUDIERICHTINGEN.md § 7).`);
  }

  it.runIf(bio !== undefined)('G-0193: Biologie komt als deelset van 4 nummers uit de koppeling, ook als de set intussen veranderde', () => {
    expect(bio!.volledig).toBe(false);
    expect(bio!.ids).toHaveLength(4);
    expect(bio!.set.korteNaam).toBe('Biologie');
  });

  it.runIf(bioGelijk)('G-0193: alleen bij een gelijk versiemerk van de set: 13 doelen in de index, de 4 doelen zijn die van het ordeningskader en er ontbreekt niets', () => {
    expect(bio!.set.aantal).toBe(13);
    const volgensKader = bioNu!.doelen.filter((d) => groepnummersVanDoel(d).includes('G-0193')).map((d) => d.id).sort();
    expect([...bio!.ids].sort()).toEqual(volgensKader);
    const { keuzes, ontbrekend } = naarSetKeuzes(selectieVanKader(kaderVan('G-0193').kader, { sets: [BIO] }), new Map([[BIO, bioNu!]]));
    expect(ontbrekend).toEqual([]);
    expect(keuzes[0].doelen).toHaveLength(4);
    const r = leerplanUitSelectie(keuzes, { titel: 'Biologie voor Natuurwetenschappen' });
    expect(r.bevestigd).toBe(true);
    expect(r.leerplan.goals).toHaveLength(4);
  });

  it.runIf(bioBestaatNog)('G-0193: de keuze van de deelset blijft een deelset tot in het leerplan, ook als de set veranderde: wat niet meer bestaat staat in ontbrekend (§ 7, § 9.5)', () => {
    const selectie = selectieVanKader(kaderVan('G-0193').kader, { sets: [BIO] });
    expect(selectie.get(BIO)).toEqual(bio!.ids);
    const { keuzes, ontbrekend } = naarSetKeuzes(selectie, new Map([[BIO, bioNu!]]));
    const blijft = bio!.ids.filter((id) => bioIdsNu.has(id)).sort();
    const weg = bio!.ids.filter((id) => !bioIdsNu.has(id)).sort();
    expect(keuzes).toHaveLength(1);
    // Nooit "alle" en nooit meer dan de vier uit de koppeling, wat de huidige set ook telt.
    expect(Array.isArray(keuzes[0].doelen)).toBe(true);
    expect([...(keuzes[0].doelen as string[])].sort()).toEqual(blijft);
    expect(ontbrekend.map((o) => ({ set: o.set, ids: [...o.ids].sort() }))).toEqual(weg.length > 0 ? [{ set: BIO, ids: weg }] : []);
    const r = leerplanUitSelectie(keuzes, { titel: 'Biologie voor Natuurwetenschappen' });
    expect(r.bevestigd).toBe(true);
    expect(r.leerplan.goals).toHaveLength(blijft.length);
  });

  it('G-0193: het buitengewoon onderwijs (OV4) geeft een eigen kader met alleen buitengewone sets', () => {
    const so = kaderVan('G-0193', { soort: 'so' });
    const bu = kaderVan('G-0193', { soort: 'buso' });
    expect(so.info.kanBuso).toBe(true);
    expect(bu.kader.keuze.soort).toBe('buso');
    expect(bu.kader.sets.length).toBeGreaterThan(0);
    for (const k of bu.kader.sets) expect(k.set.naam).toMatch(/^Buitengewoon /);
    expect(ids(bu.kader.sets).some((id) => ids(so.kader.sets).includes(id))).toBe(false);
    expect(kaderVingerafdruk(bu.kader)).not.toBe(kaderVingerafdruk(so.kader));
  });

  it('G-0327 (Humane wetenschappen, 3de graad): sets van het 3de leerjaar staan in nietVoorDitJaar', () => {
    const { info, kader } = kaderVan('G-0327', { jaar: 5 });
    expect(info.jaren).toEqual([5, 6]);
    expect(info.zelfdeNaam.map((g) => g.nummer)).toEqual(['G-0117']);
    expect(kader.nietVoorDitJaar.length).toBeGreaterThan(0);
    for (const k of kader.nietVoorDitJaar) expect(k.set.leerjaar).toBe('3de leerjaar');
    for (const k of kader.sets) expect(k.set.leerjaar).not.toBe('3de leerjaar');
    expect(kenmerkenVan(info)).toBe('3de graad · Doorstroomfinaliteit · aso · Domeinoverschrijdend · 5de en 6de jaar');
  });

  it('G-0307 en G-0311 (1ste graad): graad-en-stroom, A-stroom, voor het 1ste en het 2de leerjaar hetzelfde kader', () => {
    const een = kaderVan('G-0307', { jaar: 1 });
    const twee = kaderVan('G-0311', { jaar: 2 });
    expect(een.info.graad).toBe(1);
    expect(een.info.stroom).toBe('A');
    expect(een.info.jaren).toEqual([1]);
    expect(twee.info.jaren).toEqual([2]);
    expect(een.kader.herkomst).toBe('graad-en-stroom');
    expect(kaderGroepSleutel(een.info, 'so')).toBe(kaderGroepSleutel(twee.info, 'so'));
    expect(kaderGroepSleutel(een.info, 'so')).toBe('1|A|so');
    expect(kaderVingerafdruk(een.kader)).toBe(kaderVingerafdruk(twee.kader));
    for (const k of een.kader.sets) {
      expect(k.set.graad).toBe('1ste graad');
      expect(k.set.stroom).toBe('A-stroom');
      expect(k.volledig).toBe(true);
    }
    expect(een.kader.sets.length).toBeGreaterThan(10);
    // De uitbreidingsdoelen van het Nederlands zijn niet verplicht en staan niet in de standaardselectie.
    const uitbreiding = een.kader.sets.filter((k) => !k.verplicht);
    expect(uitbreiding.length).toBeGreaterThan(0);
    expect(een.kader.aantalVerplicht).toBeLessThan(een.kader.aantalDoelen);
    const standaard = selectieVanKader(een.kader);
    for (const k of uitbreiding) expect(standaard.has(k.set.id)).toBe(false);
    expect(selectieVanKader(een.kader, { ookUitbreiding: true }).size).toBe(standaard.size + uitbreiding.length);
    expect(een.kader.teGroot).toBe(false);
  });

  it('G-0002 (Animator, afgebouwd zevende jaar): geen doelen, wel een opvolger', () => {
    const { info, kader, regel } = kaderVan('G-0002', { jaar: 7 });
    expect(regel?.status).toBe('geen');
    expect(info.soort).toBe('zevende');
    expect(info.afgebouwd).toBe(true);
    expect(info.afgebouwdSinds).toBe('2025-08-31');
    expect(info.jaren).toEqual([7]);
    expect(info.opvolgers.map((g) => g.nummer)).toEqual(['G-0429']);
    expect(kader).toMatchObject({ herkomst: 'geen', sets: [], aantalDoelen: 0, nietVoorDitJaar: [], teGroot: false });
  });

  it('G-0009 (buitengewoon onderwijs, zonder koppeling) heeft geen doelen en is altijd buso', () => {
    const { info, kader } = kaderVan('G-0009');
    expect(info.soort).toBe('buso');
    expect(info.graad).toBeUndefined();
    expect(kader.keuze.soort).toBe('buso');
    expect(kader.herkomst).toBe('geen');
    expect(kader.sets).toEqual([]);
  });

  it('G-0008 (duale richting met een aanloopjaar): jaren 3 en 4, duaal', () => {
    const { info, kader } = kaderVan('G-0008');
    expect(info.jaren).toEqual([3, 4]);
    expect(info.duaal).toBe(true);
    expect(kader.sets.length).toBeGreaterThan(0);
  });

  it('de lijst van richtingen: standaard de gewone richtingen; ookMeer en afgebouwd tonen de rest', () => {
    const basis: RichtingFilter = { zoek: '', ookMeer: false, afgebouwd: false };
    const nrs = (f: Partial<RichtingFilter>) => filterRichtingen(matrix, { ...basis, ...f }, VANDAAG).map((i) => i.groep.nummer);
    expect(nrs({}).sort()).toEqual(['G-0008', 'G-0117', 'G-0193', 'G-0307', 'G-0311', 'G-0327']);
    expect(nrs({ ookMeer: true })).toContain('G-0009');
    expect(nrs({ ookMeer: true })).toContain('G-0429');
    expect(nrs({ ookMeer: true })).not.toContain('G-0002');
    expect(nrs({ ookMeer: true, afgebouwd: true })).toContain('G-0002');
    expect(nrs({ zoek: 'natuurwet', graad: 2 })).toEqual(['G-0193']);
    expect(nrs({ zoek: 'humane' })).toEqual(['G-0117', 'G-0327']);
    expect(nrs({ graad: 1 }).sort()).toEqual(['G-0307', 'G-0311']);
    expect(nrs({ finaliteit: 'A' })).toEqual(['G-0008']);
  });

  it('de koppeling voor elke gekoppelde groep is gebruikt: geen enkele set blijft onbekend', () => {
    const { koppeling } = laadStructuur(FIXTURES);
    for (const regel of koppeling.groepen.filter((r) => r.status === 'gekoppeld')) {
      const { bestand } = bestandVan(regel.groep);
      expect(bestand, regel.groep).not.toBeNull();
      const { kader } = kaderVan(regel.groep);
      expect(kader.onbekend, regel.groep).toEqual([]);
    }
  });

  it('elke gekoppelde groep en elk jaar blijft binnen 50 sets en 5000 doelen', () => {
    const { gekeken, fouten } = overschrijdingen(FIXTURES, VANDAAG);
    expect(gekeken).toBeGreaterThan(8);
    expect(fouten).toEqual([]);
  });
});

// ── De echte data (wanneer die in de repo staat) ────────────────────────────

const ECHTE_MAP = join(WORTEL, 'public', 'leerplannen', 'structuur');
const HEEFT_ECHT = existsSync(join(ECHTE_MAP, 'studierichtingen.json')) && existsSync(join(ECHTE_MAP, 'richtingdoelen', 'index.json')) && existsSync(INDEX_BESTAND);

describe.runIf(HEEFT_ECHT)('de echte studierichtingen en koppeling', () => {
  it('elke gekoppelde groep en elk jaar heeft hoogstens 50 sets en 5000 doelen', () => {
    const { gekeken, fouten } = overschrijdingen(ECHTE_MAP, new Date().toISOString().slice(0, 10));
    expect(gekeken).toBeGreaterThan(0);
    expect(fouten).toEqual([]);
  });
});
