import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deleteCurriculum, maakEigenKopie, saveCurriculum } from './curriculum';
import { getCourse, sanitizeCourse, saveCourse, saveCourseGuarded, type GuardedSaveResult } from './courses';
import type { Course, CourseSection } from './courseTypes';
import { allSections } from './courseTypes';
import type { Curriculum } from './curriculumTypes';
import { dekkingMinimumdoelen, kaderDoelen, type CursusBijdrage, type MdDekking } from './dekkingMinimumdoelen';
import { leerplanUitSelectie } from './doelenSamenstellen';
import type { Doelgroep } from './doelgroep';
import {
  bewaarGatenOpCursus,
  bewaarNieuweGatenCursus,
  leerplanVoorGaten,
  titelsVoorGaten,
  voegGeplandeSectiesToe,
  type GatenLeerplan,
  type GatenOpslag,
} from './gatenCursus';
import {
  codesVoorDoelen,
  openNietVerplicht,
  openPerSet,
  openVerplichteDoelen,
  selectieVanOpen,
} from './gatenDichten';
import { effectieveStatus } from './leerplanStatus';
import type { Minimumdoel, MinimumdoelenIndex, MinimumdoelenIndexSet, MinimumdoelenSetBestand } from './minimumdoelen';
import { cursusVoorRichting, geraamteHoofdstukken } from './richtingCursus';
import {
  afdrukkenPerSet,
  bouwKader,
  doelgroepVan,
  kaderVingerafdruk,
  richtingInfo,
  volledigeSetsVingerafdruk,
  type KaderSet,
  type RichtingInfo,
  type RichtingKader,
  type RichtingKeuze,
} from './richtingKader';
import type { MatrixBestand, RichtingDoelenBestand, RichtingDoelenIndex, RichtingDoelenIndexRegel } from './studierichtingen';

const VANDAAG = '2026-10-10';
const SHA = 'ab'.repeat(32);

// ── Nagemaakte sets ─────────────────────────────────────────────────────────

function doel(id: string, code: string, tekst: string, rubriek?: string): Minimumdoel {
  return { id, code, tekst, ...(rubriek ? { extra: { titels: { 1: { titel: rubriek } } } } : {}) };
}

function maakBestand(id: string, naam: string, korteNaam: string, doelen: Minimumdoel[]): MinimumdoelenSetBestand {
  return {
    app: 'boosterz', kind: 'minimumdoelen', v: 1,
    set: {
      id, naam, korteNaam, versie: '1.0', geldigheid: 'Geldig', geldigVan: '2024-09-01', graad: '2de graad', sleutelcompetenties: [],
      bron: 'https://www.onderwijsdoelen.be/', api: 'https://onderwijs.api.vlaanderen.be/onderwijsdoelen',
      naamsvermelding: 'Bron: Vlaamse overheid, Departement Onderwijs en Vorming (onderwijsdoelen.be)',
      licentie: 'nog te bevestigen', opgehaald: '2026-10-05T12:20:49Z', aantal: doelen.length, sha256: 'a'.repeat(64),
    },
    doelen,
  };
}

function indexVan(b: MinimumdoelenSetBestand): MinimumdoelenIndexSet {
  return {
    id: b.set.id, naam: b.set.naam, korteNaam: b.set.korteNaam, versie: '1.0', geldigheid: 'Geldig', graad: '2de graad',
    aantal: b.doelen.length, sha256: `${b.set.id.replace(/\D/g, '')}${'cd'.repeat(32)}`.slice(0, 64), opgehaald: '2026-10-05T12:20:49Z', bestand: `${b.set.id}.json`,
  };
}

/** `n` doelen met vaste nummers `<voorvoegsel>1` … `<voorvoegsel>n`, codes `<KODE>01` … en een rubriek per doel. */
function reeks(voorvoegsel: string, kode: string, n: number, rubriek: (i: number) => string | undefined = () => undefined): Minimumdoel[] {
  return Array.from({ length: n }, (_, k) => {
    const i = k + 1;
    return doel(`${voorvoegsel}${i}`, `${kode}${String(i).padStart(2, '0')}`, `Doel ${i} van ${kode}.`, rubriek(i));
  });
}

const NAAM_BEGIN = 'Secundair onderwijs 2de graad';

/** Biologie: 13 doelen, waarvan de koppeling er 4 noemt (b2, b5, b7, b11): een deelset. */
const BIO = maakBestand('ODS_9101', `${NAAM_BEGIN} -  Biologie - Cesuurdoelen`, 'Biologie', reeks('b', 'B', 13, (i) => (i <= 6 ? 'Cel' : 'Organisme')));
/** Wiskunde: 16 doelen, de koppeling noemt ze allemaal: een volledige set. */
const WIS = maakBestand('ODS_9102', `${NAAM_BEGIN} -  Wiskunde - Cesuurdoelen`, 'Wiskunde', reeks('w', 'W', 16, (i) => (i <= 8 ? 'Getallen' : 'Meetkunde')));
const CHE = maakBestand('ODS_9103', `${NAAM_BEGIN} -  Chemie - Cesuurdoelen`, 'Chemie', reeks('c', 'C', 5));
const FYS = maakBestand('ODS_9104', `${NAAM_BEGIN} -  Fysica - Cesuurdoelen`, 'Fysica', reeks('f', 'F', 7));
const UIT = maakBestand('ODS_9105', `${NAAM_BEGIN} -  Nederlands - Uitbreidingsdoelen`, 'Nederlands (uitbreiding)', reeks('u', 'U', 3));

const BIO_KOPPELING = ['b2', 'b5', 'b7', 'b11'];
const ALLE_BESTANDEN = [BIO, WIS, CHE, FYS, UIT];
const BESTANDEN = new Map(ALLE_BESTANDEN.map((b) => [b.set.id, b]));

function kaderSet(b: MinimumdoelenSetBestand, ids: 'alle' | string[], extra: { verplicht?: boolean } = {}): KaderSet {
  const index = indexVan(b);
  const lijst = ids === 'alle' ? b.doelen.map((d) => d.id as string) : ids;
  return { set: index, ids: lijst, volledig: lijst.length === index.aantal, verplicht: extra.verplicht ?? true, versieGelijk: true };
}

function maakKader(sets: KaderSet[], keuze: Partial<RichtingKeuze> = {}): RichtingKader {
  const som = (lijst: KaderSet[]) => lijst.reduce((n, k) => n + k.ids.length, 0);
  return {
    keuze: { groep: 'G-0100', soort: 'so', jaar: 4, ...keuze }, herkomst: 'api', opgehaald: '2026-10-09T00:00:00Z',
    sets, aantalDoelen: som(sets), aantalVerplicht: som(sets.filter((k) => k.verplicht)),
    nietVoorDitJaar: [], verborgenOud: 0, verborgenAndereSoort: 0, onbekend: [], teGroot: false,
  };
}

/** Het kader: Biologie (deel, 4 van 13), Wiskunde (16), Chemie (5), Fysica (7) en een uitbreidingsset (3). 35 doelen, 32 verplicht. */
const KADER = maakKader([
  kaderSet(BIO, BIO_KOPPELING),
  kaderSet(WIS, 'alle'),
  kaderSet(CHE, 'alle'),
  kaderSet(FYS, 'alle'),
  kaderSet(UIT, 'alle', { verplicht: false }),
]);

// ── Nagemaakte matrix, voor RichtingInfo ────────────────────────────────────

function matrixVan(titel = 'Testrichting'): MatrixBestand {
  return {
    app: 'boosterz', kind: 'studierichtingen', v: 1, bron: 'x', api: 'x', naamsvermelding: 'x', licentie: 'x',
    opgehaald: '2026-10-09T00:00:00Z', aantalGroepen: 1, aantalOnderdelen: 1, sha256: SHA,
    groepen: [{ nummer: 'G-0100', titel, graad: '2', finaliteit: 'DO', onderdelen: [100] }],
    onderdelen: [{
      nummer: 100, groep: 'G-0100', titel: `${titel} (variant)`, onderwijsvorm: 'ASO', begindatum: '2021-09-01',
      leerjaren: [{ code: '3' }, { code: '4' }], hoofdstructuren: ['311', '321'], ov4: true,
    }],
  };
}

const INFO = richtingInfo(matrixVan(), 'G-0100', VANDAAG) as RichtingInfo;

// ── Hulp ────────────────────────────────────────────────────────────────────

const ids = (cur: Curriculum) => cur.goals.map((g) => g.refs?.[0].id);
const sleutels = (cur: Curriculum) => cur.goals.map((g) => `${g.refs?.[0].set}|${g.refs?.[0].id}`);

function cursusMet(secties: { titel: string; codes: string[]; inhoud?: boolean; optional?: boolean }[], over: Partial<Course> = {}): Course {
  return {
    id: 'k1', title: 'Wiskunde 4de jaar', author: '', coverEmoji: '📘', code: 'ABC123',
    chapters: [{
      id: 'h1', title: 'Wiskunde',
      sections: secties.map((s, i): CourseSection => ({
        id: `s${i + 1}`, title: s.titel,
        blocks: s.inhoud === false ? [] : [{ id: `b${i + 1}`, type: 'text', markdown: `Uitleg bij ${s.titel}.` }],
        goalCodes: s.codes,
        ...(s.optional ? { optional: true } : {}),
      })),
    }],
    settings: { accentColor: '#4f46e5', requireName: false, showProgressToStudent: true },
    createdAt: 1, updatedAt: 500,
    ...over,
  };
}

function leerplanVan(...keuzes: { bestand: MinimumdoelenSetBestand; doelen: 'alle' | string[] }[]): Curriculum {
  const r = leerplanUitSelectie(keuzes, { titel: 'Testleerplan' });
  expect(r.bevestigd).toBe(true);
  return r.leerplan;
}

function dekkingVan(bijdragen: CursusBijdrage[], kader = KADER, bestanden = BESTANDEN): MdDekking {
  return dekkingMinimumdoelen(kaderDoelen(kader, bestanden), bijdragen, []);
}

/** Het leerplan van Wiskunde (alle 16) en een cursus daarop die W01 tot W13 uitwerkt: W14, W15 en W16 staan open. */
function wiskundeScenario(): { leerplan: Curriculum; cursus: Course; codes: string[] } {
  const leerplan = leerplanVan({ bestand: WIS, doelen: 'alle' });
  const codes = leerplan.goals.map((g) => g.code);
  const cursus = cursusMet(
    [
      { titel: 'Getallen', codes: codes.slice(0, 8) },
      { titel: 'Meetkunde (basis)', codes: codes.slice(8, 13) },
    ],
    { curriculumId: leerplan.id },
  );
  return { leerplan, cursus, codes };
}

// ── De valkuil van § 9.5: een deel blijft een deel ──────────────────────────

describe('leerplanVoorGaten: de valkuil (deelset en volledige set)', () => {
  const { leerplan: lpWis, cursus } = wiskundeScenario();
  const dekking = dekkingVan([{ course: cursus, leerplan: lpWis }]);
  const open = openVerplichteDoelen(dekking);
  const perSet = openPerSet(open);

  it('de dekking klopt met de hand: 32 verplichte doelen, 13 gedekt, 19 open (Biologie 4, Wiskunde 3, Chemie 5, Fysica 7)', () => {
    expect(dekking.totaal).toBe(32);
    expect(dekking.gedekt).toBe(13);
    expect(dekking.open).toBe(19);
    expect(open).toHaveLength(19);
    expect(perSet.map((s) => [s.set, s.doelen.length])).toEqual([['ODS_9101', 4], ['ODS_9102', 3], ['ODS_9103', 5], ['ODS_9104', 7]]);
    // De uitbreidingsset (3 doelen) staat open maar is geen verplicht doel.
    expect(openNietVerplicht(dekking)).toBe(3);
  });

  function maak(selectie: Map<string, string[]>): GatenLeerplan {
    return leerplanVoorGaten({ info: INFO, kader: KADER, selectie, bestanden: BESTANDEN, curricula: [] });
  }

  it('een deelset van 4 van 13 geeft in het leerplan precies 4 doelen', () => {
    const selectie = selectieVanOpen(perSet, new Set(['ODS_9101']));
    expect(selectie.get('ODS_9101')).toEqual(BIO_KOPPELING);
    const r = maak(selectie);
    expect(r.soort).toBe('nieuw');
    if (r.soort !== 'nieuw') return;
    expect(r.leerplan.goals).toHaveLength(4);
    expect(ids(r.leerplan)).toEqual(BIO_KOPPELING);
    expect(r.leerplan.goals).not.toHaveLength(BIO.doelen.length);
  });

  it('een volledige set waarvan 3 van de 16 doelen open staan, geeft er 3 (en niet alle 16)', () => {
    const selectie = selectieVanOpen(perSet, new Set(['ODS_9102']));
    expect(selectie.get('ODS_9102')).toEqual(['w14', 'w15', 'w16']);
    const r = maak(selectie);
    expect(r.soort).toBe('nieuw');
    if (r.soort !== 'nieuw') return;
    expect(r.leerplan.goals).toHaveLength(3);
    expect(ids(r.leerplan)).toEqual(['w14', 'w15', 'w16']);
  });

  it('een volledige set waarvan alles open staat, blijft een lijst: alle 16 doelen, elk met zijn vaste nummer', () => {
    const leeg = dekkingVan([]);
    const selectie = selectieVanOpen(openPerSet(openVerplichteDoelen(leeg)), new Set(['ODS_9102']));
    expect(Array.isArray(selectie.get('ODS_9102'))).toBe(true);
    const r = maak(selectie);
    expect(r.soort).toBe('nieuw');
    if (r.soort !== 'nieuw') return;
    expect(r.leerplan.goals).toHaveLength(16);
  });

  it('de hele selectie samen telt 19 doelen: nergens wordt een set "alle"', () => {
    const r = maak(selectieVanOpen(perSet, new Set(perSet.map((s) => s.set))));
    expect(r.soort).toBe('nieuw');
    if (r.soort !== 'nieuw') return;
    expect(r.leerplan.goals).toHaveLength(4 + 3 + 5 + 7);
    expect(new Set(sleutels(r.leerplan)).size).toBe(19);
  });
});

// ── Het nieuwe leerplan ─────────────────────────────────────────────────────

describe('leerplanVoorGaten: het nieuwe leerplan', () => {
  const gekozen = (...sets: string[]) => new Map<string, string[]>(sets.map((s) => [s, (BESTANDEN.get(s)!.doelen.map((d) => d.id as string))]));
  const biologieDeel = new Map<string, string[]>([['ODS_9101', BIO_KOPPELING], ['ODS_9103', ['c1', 'c3']]]);

  function maak(selectie: ReadonlyMap<string, readonly string[]>, curricula: Curriculum[] = [], kader = KADER, bestanden = BESTANDEN): GatenLeerplan {
    return leerplanVoorGaten({ info: INFO, kader, selectie, bestanden, curricula });
  }

  it('is samengesteld en bevestigd, zonder volgtKader en zonder jaar, met afdrukken voor precies de sets met een gekozen doel', () => {
    const r = maak(biologieDeel);
    expect(r.soort).toBe('nieuw');
    if (r.soort !== 'nieuw') return;
    const lp = r.leerplan;
    expect(lp.herkomst?.methode).toBe('samengesteld');
    expect(effectieveStatus(lp)).toBe('gecontroleerd');
    expect(lp.minimumdoelenSets).toEqual(['ODS_9101', 'ODS_9103']);
    expect(ids(lp)).toEqual([...BIO_KOPPELING, 'c1', 'c3']);
    const dg = lp.doelgroep as Doelgroep;
    expect(dg.groep).toBe('G-0100');
    expect(dg.volgtKader).toBeUndefined();
    expect(dg.jaar).toBeUndefined();
    expect(dg.vak).toBeUndefined();
    // Precies de sets met een gekozen doel; Wiskunde, Fysica en de uitbreidingsset staan wel in het kader maar niet in het leerplan.
    expect(Object.keys(dg.setAfdrukken ?? {})).toEqual(['ODS_9101', 'ODS_9103']);
    expect(dg.setAfdrukken).toEqual(afdrukkenPerSet(KADER, ['ODS_9101', 'ODS_9103']));
    expect(dg.kader).toBe(kaderVingerafdruk(KADER, ['ODS_9101', 'ODS_9103']));
    expect(dg.kaderVolledig).toBe(volledigeSetsVingerafdruk(KADER, ['ODS_9101', 'ODS_9103']));
  });

  it('krijgt de titel "Aanvulling · …", zonder set-id', () => {
    const een = maak(gekozen('ODS_9103'));
    expect(een.soort === 'nieuw' && een.leerplan.title).toBe('Aanvulling · Chemie · Testrichting · 2de graad');
    const meer = maak(gekozen('ODS_9101', 'ODS_9102', 'ODS_9103'));
    expect(meer.soort === 'nieuw' && meer.leerplan.title).toBe('Aanvulling · Biologie en 2 andere · Testrichting · 2de graad');
    const alle = maak(gekozen('ODS_9101', 'ODS_9102', 'ODS_9103', 'ODS_9104'));
    expect(alle.soort === 'nieuw' && alle.leerplan.title).toBe('Aanvulling · Testrichting · 2de graad');
    for (const r of [een, meer, alle]) expect(r.soort === 'nieuw' && r.leerplan.title).not.toMatch(/ODS_/);
  });

  it('een kadernaam met een set-id geeft nooit een set-id in de titel van het leerplan', () => {
    const selectie = new Map([['ODS_9103', ['c1', 'c2']]]);
    const titelMet = (korteNaam: string) => {
      const bestand = maakBestand('ODS_9103', CHE.set.naam, korteNaam, CHE.doelen);
      const kader = maakKader([kaderSet(bestand, 'alle')]);
      const r = maak(selectie, [], kader, new Map([[bestand.set.id, bestand]]));
      if (r.soort !== 'nieuw') throw new Error('verwacht een nieuw leerplan');
      return r.leerplan.title;
    };
    expect(titelMet('Chemie (ODS_9103)')).toBe('Aanvulling · Chemie · Testrichting · 2de graad');
    expect(titelMet('ODS_9103')).not.toMatch(/ODS_/);
    expect(titelMet('Chemie ODS_9103 bis')).not.toMatch(/ODS_/);
  });

  it('een uitbreidingsset die uitdrukkelijk gekozen is, geeft precies de gekozen nummers', () => {
    const r = maak(new Map([['ODS_9105', ['u1', 'u3']]]));
    expect(r.soort).toBe('nieuw');
    if (r.soort !== 'nieuw') return;
    expect(ids(r.leerplan)).toEqual(['u1', 'u3']);
    expect(Object.keys(r.leerplan.doelgroep?.setAfdrukken ?? {})).toEqual(['ODS_9105']);
  });

  it('negeert de volgorde, dubbele en lege nummers in de selectie', () => {
    const r = maak(new Map([['ODS_9103', [' c3 ', 'c1', 'c3', '']], ['ODS_9101', []]]));
    expect(r.soort).toBe('nieuw');
    if (r.soort !== 'nieuw') return;
    expect(ids(r.leerplan)).toEqual(['c1', 'c3']);
    expect(r.leerplan.minimumdoelenSets).toEqual(['ODS_9103']);
  });

  it('hergebruikt een nagekeken leerplan met dezelfde selectie (ook in een andere volgorde)', () => {
    const eerste = maak(biologieDeel);
    if (eerste.soort !== 'nieuw') throw new Error('verwacht een nieuw leerplan');
    const opnieuw = maak(new Map([['ODS_9103', ['c3', 'c1']], ['ODS_9101', [...BIO_KOPPELING].reverse()]]), [eerste.leerplan]);
    expect(opnieuw.soort).toBe('hergebruik');
    expect(opnieuw.soort === 'hergebruik' && opnieuw.leerplan.id).toBe(eerste.leerplan.id);
  });

  it('hergebruikt niet bij een andere selectie, een eigen kopie, een leerplan van een andere groep of een niet nagekeken leerplan', () => {
    const eerste = maak(biologieDeel);
    if (eerste.soort !== 'nieuw') throw new Error('verwacht een nieuw leerplan');
    const lp = eerste.leerplan;
    const anders = (curricula: Curriculum[], selectie: ReadonlyMap<string, readonly string[]> = biologieDeel) => maak(selectie, curricula).soort;

    expect(anders([lp], new Map([['ODS_9101', BIO_KOPPELING]]))).toBe('nieuw');
    expect(anders([lp], new Map([['ODS_9103', ['c1', 'c3']], ['ODS_9101', [...BIO_KOPPELING, 'b1']]]))).toBe('nieuw');
    expect(anders([maakEigenKopie(lp)])).toBe('nieuw');
    expect(anders([{ ...lp, doelgroep: { ...(lp.doelgroep as Doelgroep), groep: 'G-0999' } }])).toBe('nieuw');
    const zonderStatus: Curriculum = { ...lp };
    delete zonderStatus.controle;
    expect(anders([zonderStatus])).toBe('nieuw');
    // Controle: het onaangepaste leerplan wordt wel hergebruikt.
    expect(anders([lp])).toBe('hergebruik');
  });

  it('geeft "veranderd" bij een gekozen nummer dat niet meer in de set staat', () => {
    expect(maak(new Map([['ODS_9101', ['b2', 'b99']]]))).toEqual({ soort: 'veranderd' });
  });

  it('geeft "veranderd" bij een set zonder setbestand, of een set die niet in het kader staat', () => {
    const zonderChemie = new Map(ALLE_BESTANDEN.filter((b) => b.set.id !== 'ODS_9103').map((b) => [b.set.id, b]));
    expect(maak(biologieDeel, [], KADER, zonderChemie)).toEqual({ soort: 'veranderd' });
    const buitenKader = maakBestand('ODS_9999', 'Buiten het kader', 'Buiten', reeks('x', 'X', 2));
    const metBuiten = new Map([...BESTANDEN, [buitenKader.set.id, buitenKader]]);
    expect(maak(new Map([['ODS_9999', ['x1']]]), [], KADER, metBuiten)).toEqual({ soort: 'veranderd' });
    // Een bestand dat niet van de gevraagde set is, telt niet.
    const verkeerd = new Map(BESTANDEN);
    verkeerd.set('ODS_9103', { ...CHE, set: { ...CHE.set, id: 'ODS_9777' } });
    expect(maak(biologieDeel, [], KADER, verkeerd)).toEqual({ soort: 'veranderd' });
  });

  it('geeft "niet-nagekeken" zonder gekozen doelen', () => {
    const r = maak(new Map());
    expect(r).toEqual({ soort: 'niet-nagekeken', waarschuwing: 'Kies minstens één doel' });
  });

  /** 51 sets met elk één gekozen doel: één meer dan een leerplan aankan. De sets heten "Vak 0" (ODS_8000) tot "Vak 50". */
  function eenenvijftigSets() {
    const veel = Array.from({ length: 51 }, (_, i) => maakBestand(`ODS_${8000 + i}`, `${NAAM_BEGIN} -  Vak ${i} - Cesuurdoelen`, `Vak ${i}`, reeks(`v${i}-`, 'V', 1)));
    const kader = maakKader(veel.map((b) => kaderSet(b, 'alle')));
    const bestanden = new Map(veel.map((b) => [b.set.id, b]));
    const selectie = new Map(veel.map((b) => [b.set.id, [b.doelen[0].id as string]]));
    return { kader, bestanden, selectie };
  }

  it('geeft "niet-nagekeken" bij meer dan 50 sets, met een waarschuwing zonder set-id en zonder punt aan het eind', () => {
    const { kader, bestanden, selectie } = eenenvijftigSets();
    const r = maak(selectie, [], kader, bestanden);
    expect(r.soort).toBe('niet-nagekeken');
    if (r.soort !== 'niet-nagekeken') return;
    expect(r.waarschuwing).toContain('51 sets');
    expect(r.waarschuwing).toContain('50 sets');
    expect(r.waarschuwing).not.toMatch(/ODS_/);
    expect(r.waarschuwing).not.toMatch(/[.\s]$/);
  });

  it('geeft "niet-nagekeken" als een gekozen doel geen tekst heeft en dus niet in het leerplan kan, zonder set-id in de waarschuwing', () => {
    const tekstloos = maakBestand('ODS_9101', BIO.set.naam, 'Biologie', BIO.doelen.map((d) => (d.id === 'b2' ? { ...d, tekst: '<p> </p>' } : d)));
    const bestanden = new Map(BESTANDEN);
    bestanden.set('ODS_9101', tekstloos);
    // Een leerplan dat past bij wat het leerplan zou krijgen (alleen b5), mag hier niet hergebruikt worden.
    const goedLeerplan = maak(new Map([['ODS_9101', ['b5']]]), [], KADER, bestanden);
    if (goedLeerplan.soort !== 'nieuw') throw new Error('verwacht een nieuw leerplan');
    const r = maak(new Map([['ODS_9101', ['b2', 'b5']]]), [goedLeerplan.leerplan], KADER, bestanden);
    expect(r).toEqual({ soort: 'niet-nagekeken', waarschuwing: 'Biologie: 1 doel zonder tekst is overgeslagen' });
  });

  it('geeft "niet-nagekeken" als een hele gekozen set geen doel met tekst heeft, naast een goede set, en hergebruikt dan geen leerplan zonder die set', () => {
    const tekstloos = maakBestand('ODS_9101', BIO.set.naam, 'Biologie', BIO.doelen.map((d) => (d.id === 'b2' ? { ...d, tekst: '<p> </p>' } : d)));
    const bestanden = new Map(BESTANDEN);
    bestanden.set('ODS_9101', tekstloos);
    // Zonder de Biologie-set kan het leerplan alleen c1 krijgen: dat is niet wat gekozen is, ook al lijkt c1 er wel op.
    const alleenChemie = maak(new Map([['ODS_9103', ['c1']]]), [], KADER, bestanden);
    if (alleenChemie.soort !== 'nieuw') throw new Error('verwacht een nieuw leerplan');
    const selectie = new Map([['ODS_9101', ['b2']], ['ODS_9103', ['c1']]]);
    const verwacht = { soort: 'niet-nagekeken', waarschuwing: 'Biologie: 1 doel zonder tekst is overgeslagen' };
    expect(maak(selectie, [], KADER, bestanden)).toEqual(verwacht);
    expect(maak(selectie, [alleenChemie.leerplan], KADER, bestanden)).toEqual(verwacht);
  });

  it('geeft bij meer waarschuwingen de eerste, in de volgorde van de gekozen sets', () => {
    const bio = maakBestand('ODS_9101', BIO.set.naam, 'Biologie', BIO.doelen.map((d) => (d.id === 'b2' ? { ...d, tekst: '<p> </p>' } : d)));
    const che = maakBestand('ODS_9103', CHE.set.naam, 'Chemie', CHE.doelen.map((d) => (d.id === 'c1' ? { ...d, tekst: '<p> </p>' } : d)));
    const bestanden = new Map(BESTANDEN);
    bestanden.set('ODS_9101', bio);
    bestanden.set('ODS_9103', che);
    expect(maak(new Map([['ODS_9101', ['b2', 'b5']], ['ODS_9103', ['c1', 'c2']]]), [], KADER, bestanden))
      .toEqual({ soort: 'niet-nagekeken', waarschuwing: 'Biologie: 1 doel zonder tekst is overgeslagen' });
    expect(maak(new Map([['ODS_9103', ['c1', 'c2']], ['ODS_9101', ['b2', 'b5']]]), [], KADER, bestanden))
      .toEqual({ soort: 'niet-nagekeken', waarschuwing: 'Chemie: 1 doel zonder tekst is overgeslagen' });
  });

  it('geeft een oude versie van een set ook door als het leerplan niet bevestigd wordt: dan is dat de waarschuwing', () => {
    const { kader, bestanden, selectie } = eenenvijftigSets();
    const gewoon = maak(selectie, [], kader, bestanden);
    expect(gewoon.soort === 'niet-nagekeken' && gewoon.waarschuwing).toContain('51 sets');
    const metOudeVersie = leerplanVoorGaten({
      info: INFO, kader, selectie, bestanden, curricula: [], oudeVersies: new Set(['ODS_8000', 'ODS_8001']),
    });
    expect(metOudeVersie).toEqual({ soort: 'niet-nagekeken', waarschuwing: 'Vak 0 is een oudere versie. Gebruik liever de versie die nu geldt' });
  });

  it('geeft een oude versie van een set door aan het samenstellen zonder het leerplan te blokkeren', () => {
    const r = leerplanVoorGaten({
      info: INFO, kader: KADER, selectie: biologieDeel, bestanden: BESTANDEN, curricula: [], oudeVersies: new Set(['ODS_9101']),
    });
    expect(r.soort).toBe('nieuw');
  });
});

// ── Titels ──────────────────────────────────────────────────────────────────

describe('titelsVoorGaten', () => {
  const KEUZE: RichtingKeuze = { groep: 'G-0100', soort: 'so', jaar: 4 };
  const namen = new Map([['ODS_9101', 'Biologie'], ['ODS_9102', 'Wiskunde'], ['ODS_9103', 'Chemie'], ['ODS_9104', 'Fysica']]);

  it('bij één set: de naam van de set voor de cursus, en "Aanvulling · Chemie · …" voor het leerplan', () => {
    expect(titelsVoorGaten(INFO, KADER, KEUZE, ['ODS_9103'], namen)).toEqual({
      cursus: 'Chemie · Testrichting · 4de jaar',
      leerplan: 'Aanvulling · Chemie · Testrichting · 2de graad',
    });
  });

  it('bij meer sets: "Aanvulling" voor de cursus en "… en 2 andere" voor het leerplan', () => {
    expect(titelsVoorGaten(INFO, KADER, KEUZE, ['ODS_9101', 'ODS_9102', 'ODS_9103'], namen)).toEqual({
      cursus: 'Aanvulling · Testrichting · 4de jaar',
      leerplan: 'Aanvulling · Biologie en 2 andere · Testrichting · 2de graad',
    });
  });

  it('bij alle verplichte sets noemt het leerplan geen vak', () => {
    expect(titelsVoorGaten(INFO, KADER, KEUZE, ['ODS_9101', 'ODS_9102', 'ODS_9103', 'ODS_9104'], namen).leerplan)
      .toBe('Aanvulling · Testrichting · 2de graad');
  });

  it('gebruikt de naam voor het scherm uit setNamen (bv. met context), anders de naam in het kader', () => {
    expect(titelsVoorGaten(INFO, KADER, KEUZE, ['ODS_9103'], new Map([['ODS_9103', 'Chemie (aso)']])).cursus).toBe('Chemie (aso) · Testrichting · 4de jaar');
    expect(titelsVoorGaten(INFO, KADER, KEUZE, ['ODS_9103'], new Map()).cursus).toBe('Chemie · Testrichting · 4de jaar');
  });

  it('het jaar komt van de keuze; zonder jaar staat de graad', () => {
    expect(titelsVoorGaten(INFO, KADER, { ...KEUZE, jaar: 3 }, ['ODS_9103'], namen).cursus).toBe('Chemie · Testrichting · 3de jaar');
    expect(titelsVoorGaten(INFO, KADER, { groep: 'G-0100', soort: 'so' }, ['ODS_9103'], namen).cursus).toBe('Chemie · Testrichting · 2de graad');
  });

  it('een set zonder bruikbare naam geeft geen set-id in de titel', () => {
    const t = titelsVoorGaten(INFO, KADER, KEUZE, ['ODS_9103'], new Map([['ODS_9103', 'ODS_9103']]));
    expect(t.cursus).toBe('Aanvulling · Testrichting · 4de jaar');
    expect(`${t.cursus}|${t.leerplan}`).not.toMatch(/ODS_/);
    const naamMetId = titelsVoorGaten(INFO, KADER, KEUZE, ['ODS_9103'], new Map([['ODS_9103', 'Chemie (ODS_9103)']]));
    expect(naamMetId.cursus).toBe('Chemie · Testrichting · 4de jaar');
  });

  it('is nooit langer dan 120 tekens, ook niet met lange namen', () => {
    const lang = 'Een erg lange titel van een studierichting '.repeat(5).trim();
    const infoLang = richtingInfo(matrixVan(lang), 'G-0100', VANDAAG) as RichtingInfo;
    const langeSet = maakBestand('ODS_9103', CHE.set.naam, 'Een heel lange naam van een set '.repeat(6).trim(), CHE.doelen);
    const kader = maakKader([kaderSet(langeSet, 'alle'), kaderSet(BIO, BIO_KOPPELING)]);
    const setNamen = new Map([['ODS_9103', langeSet.set.korteNaam as string]]);
    for (const sets of [['ODS_9103'], ['ODS_9103', 'ODS_9101']]) {
      const t = titelsVoorGaten(infoLang, kader, KEUZE, sets, setNamen);
      expect(t.cursus.length).toBeLessThanOrEqual(120);
      expect(t.leerplan.length).toBeLessThanOrEqual(120);
      expect(t.cursus.length).toBeGreaterThan(0);
      expect(t.leerplan.startsWith('Aanvulling')).toBe(true);
    }
  });
});

describe('de titel van het leerplan bij buitengewoon onderwijs: de graad blijft staan', () => {
  const KEUZE_BUSO: RichtingKeuze = { groep: 'G-0100', soort: 'buso', jaar: 4 };
  const SLOT = ' · 2de graad · buitengewoon (OV4)';

  /** Een richting in het buitengewoon onderwijs met één set die `korteNaam` heet (zoals G-0008 met een lange setnaam). */
  function busoMet(korteNaam: string) {
    const info = richtingInfo(matrixVan('Assistent dierlijke productie'), 'G-0100', VANDAAG) as RichtingInfo;
    const bestand = maakBestand('ODS_9103', CHE.set.naam, korteNaam, CHE.doelen);
    const kader = maakKader([kaderSet(bestand, 'alle')], { soort: 'buso' });
    return { info, kader, bestand, bestanden: new Map([[bestand.set.id, bestand]]) };
  }

  it.each([
    ['Wetenschappen en technologie in de praktijk', 'Aanvulling · Wetenschappen en technologie in de prakti… · Assistent dierlijke productie'],
    ['Maatschappelijke en economische competenties', 'Aanvulling · Maatschappelijke en economische competent… · Assistent dierlijke productie'],
  ])('bij een lange setnaam (%s) wordt de naam ingekort en eindigt de titel op "buitengewoon (OV4)"', (korteNaam, begin) => {
    const { info, kader } = busoMet(korteNaam);
    const titel = titelsVoorGaten(info, kader, KEUZE_BUSO, ['ODS_9103'], new Map()).leerplan;
    expect(titel.length).toBeLessThanOrEqual(120);
    expect(titel).toBe(`${begin}${SLOT}`);
    expect(titel.endsWith('buitengewoon (OV4)')).toBe(true);
  });

  it('het leerplan zelf draagt dezelfde titel, zodat de leerkracht het verschil met het gewone leerplan blijft zien', () => {
    const { info, kader, bestanden } = busoMet('Wetenschappen en technologie in de praktijk');
    const r = leerplanVoorGaten({ info, kader, selectie: new Map([['ODS_9103', ['c1', 'c2']]]), bestanden, curricula: [] });
    expect(r.soort).toBe('nieuw');
    if (r.soort !== 'nieuw') return;
    expect(r.leerplan.title.length).toBeLessThanOrEqual(120);
    expect(r.leerplan.title.endsWith('buitengewoon (OV4)')).toBe(true);
    expect(r.leerplan.title).toBe(titelsVoorGaten(info, kader, KEUZE_BUSO, ['ODS_9103'], new Map()).leerplan);
  });

  it('een titel die past, blijft ongewijzigd', () => {
    const { info, kader } = busoMet('Chemie');
    expect(titelsVoorGaten(info, kader, KEUZE_BUSO, ['ODS_9103'], new Map()).leerplan)
      .toBe('Aanvulling · Chemie · Assistent dierlijke productie · 2de graad · buitengewoon (OV4)');
  });
});

// ── voegGeplandeSectiesToe ──────────────────────────────────────────────────

describe('voegGeplandeSectiesToe', () => {
  // Leerplan met Wiskunde (16 doelen, hoofdstuk "Wiskunde" met de rubrieken Getallen en Meetkunde) en Biologie (4 doelen).
  const leerplan = leerplanVan({ bestand: WIS, doelen: 'alle' }, { bestand: BIO, doelen: BIO_KOPPELING });
  const code = (setId: string, id: string) => leerplan.goals.find((g) => g.refs?.[0].set === setId && g.refs[0].id === id)!.code;
  const W = (n: number) => code('ODS_9102', `w${n}`);
  const B = (n: number) => code('ODS_9101', `b${n}`);

  /** Een cursus met twee hoofdstukken en verschillende soorten inhoud, om "diep gelijk" te toetsen. */
  function groteCursus(titelHoofdstuk = 'Wiskunde'): Course {
    return {
      id: 'k1', title: 'Wiskunde 4de jaar', subtitle: 'Testrichting', author: 'A. Leerkracht', coverEmoji: '📘', code: 'ABC123',
      curriculumId: leerplan.id,
      doelgroep: { groep: 'G-0100', titel: 'Testrichting', graad: 2, jaar: 4, soort: 'so' },
      chapters: [
        {
          id: 'h1', title: titelHoofdstuk, emoji: '📖',
          sections: [
            {
              id: 's1', title: 'Getallen', goalCodes: [W(1), W(2)], goals: ['Vrije tekst'],
              blocks: [
                { id: 'b1', type: 'heading', text: 'Kop', level: 2 },
                { id: 'b2', type: 'text', markdown: 'Uitleg met **vet**.' },
                { id: 'b3', type: 'callout', kind: 'goal', title: 'Doelen in deze sectie', text: `${W(1)} — Doel` },
                { id: 'b4', type: 'widget', widgetId: 'w-1', note: 'Oefening' },
              ],
            },
            { id: 's2', title: 'Meetkunde (basis)', blocks: [{ id: 'b5', type: 'text', markdown: 'Meetkunde.' }], goalCodes: [W(9)] },
          ],
        },
        {
          id: 'h2', title: 'Verdieping',
          sections: [{ id: 's3', title: 'Voor wie meer wil', optional: true, goalCodes: [W(16)], blocks: [{ id: 'b6', type: 'divider' }] }],
        },
      ],
      settings: { accentColor: '#112233', requireName: true, showProgressToStudent: false },
      createdAt: 7, updatedAt: 500,
    };
  }

  const alleCodes = (c: Course) => allSections(c).flatMap(({ section }) => section.goalCodes ?? []);

  it('houdt het bestaande deel diep gelijk en zet nieuwe secties achteraan in het hoofdstuk met dezelfde naam', () => {
    const cursus = groteCursus();
    const voor = structuredClone(cursus);
    const r = voegGeplandeSectiesToe(cursus, leerplan, [W(1), W(11), W(12), W(16), B(2), 'BESTAAT NIET']);

    // De gegeven cursus is niet aangepast.
    expect(cursus).toEqual(voor);
    expect(r.course).not.toBe(cursus);
    // Bestaande hoofdstukken, secties en blokken: diep gelijk en in dezelfde volgorde.
    expect(r.course.chapters[0].sections.slice(0, 2)).toEqual(voor.chapters[0].sections);
    expect(r.course.chapters[1]).toEqual(voor.chapters[1]);
    expect({ ...r.course.chapters[0], sections: [] }).toEqual({ ...voor.chapters[0], sections: [] });
    const { chapters: _a, ...restNa } = r.course;
    const { chapters: _b, ...restVoor } = voor;
    void _a; void _b;
    expect(restNa).toEqual(restVoor);

    // Wiskunde: één nieuwe sectie achteraan in het bestaande hoofdstuk; Biologie: een nieuw hoofdstuk achteraan.
    expect(r.course.chapters.map((h) => h.title)).toEqual(['Wiskunde', 'Verdieping', 'Biologie']);
    expect(r.course.chapters[0].sections).toHaveLength(3);
    expect(r.course.chapters[0].sections[2].goalCodes).toEqual([W(11), W(12)]);
    expect(r.course.chapters[2].sections.map((s) => s.goalCodes)).toEqual([[B(2)]]);
    expect(r.toegevoegd).toEqual([W(11), W(12), B(2)]);
    expect(r.alOpCursus).toEqual([W(1), W(16)]);
    expect(r.hoofdstukken).toBe(2);
  });

  it('een nieuwe sectie bevat alleen de doelen-callout, is geen keuzesectie en heeft nieuwe ids', () => {
    const cursus = groteCursus();
    const bestaandeIds = new Set([...cursus.chapters.map((h) => h.id), ...allSections(cursus).flatMap(({ section }) => [section.id, ...section.blocks.map((b) => b.id)])]);
    const r = voegGeplandeSectiesToe(cursus, leerplan, [W(11), W(12), B(2), B(7)]);
    const nieuw = [r.course.chapters[0].sections[2], ...r.course.chapters[2].sections];
    expect(nieuw.length).toBeGreaterThanOrEqual(3);
    for (const s of nieuw) {
      expect(s.blocks).toHaveLength(1);
      expect(s.blocks[0]).toMatchObject({ type: 'callout', kind: 'goal' });
      expect(s.optional).not.toBe(true);
      expect(bestaandeIds.has(s.id)).toBe(false);
      expect(bestaandeIds.has(s.blocks[0].id)).toBe(false);
    }
    const nieuweChapterIds = r.course.chapters.slice(2).map((h) => h.id);
    expect(nieuweChapterIds.every((id) => !bestaandeIds.has(id))).toBe(true);
    // Alle ids in de cursus zijn uniek.
    const alleIds = [...r.course.chapters.map((h) => h.id), ...allSections(r.course).flatMap(({ section }) => [section.id, ...section.blocks.map((b) => b.id)])];
    expect(new Set(alleIds).size).toBe(alleIds.length);
  });

  it('voegt samen op titel zonder te letten op hoofdletters of spaties', () => {
    const r = voegGeplandeSectiesToe(groteCursus('  WISKUNDE '), leerplan, [W(11)]);
    expect(r.course.chapters.map((h) => h.title)).toEqual(['  WISKUNDE ', 'Verdieping']);
    expect(r.course.chapters[0].sections[2].goalCodes).toEqual([W(11)]);
    expect(r.hoofdstukken).toBe(1);
  });

  it('maakt een nieuw hoofdstuk achteraan als er geen hoofdstuk met die naam is', () => {
    const cursus = groteCursus('Algebra');
    const r = voegGeplandeSectiesToe(cursus, leerplan, [W(11), W(3)]);
    expect(r.course.chapters.map((h) => h.title)).toEqual(['Algebra', 'Verdieping', 'Wiskunde']);
    expect(r.course.chapters[2].sections.map((s) => [s.title, s.goalCodes])).toEqual([['Getallen', [W(3)]], ['Meetkunde', [W(11)]]]);
    expect(r.course.chapters.slice(0, 2)).toEqual(cursus.chapters);
  });

  it('zet een code die al op een sectie staat (ook een keuzesectie) niet opnieuw en zet geen code twee keer', () => {
    const cursus = groteCursus();
    const r = voegGeplandeSectiesToe(cursus, leerplan, [W(1), W(16), W(11), W(11), W(11).toLowerCase()]);
    expect(r.alOpCursus).toEqual([W(1), W(16)]);
    expect(r.toegevoegd).toEqual([W(11)]);
    const telling = new Map<string, number>();
    for (const c of alleCodes(r.course)) telling.set(c, (telling.get(c) ?? 0) + 1);
    expect(telling.get(W(11))).toBe(1);
    expect(telling.get(W(1))).toBe(1);
    expect(telling.get(W(16))).toBe(1);
  });

  it('herkent een code in kleine letters of met extra spaties als een code die al op de cursus staat, en geeft ze genormaliseerd terug', () => {
    const cursus = groteCursus();
    const r = voegGeplandeSectiesToe(cursus, leerplan, [`  ${W(1).toLowerCase()} `, W(16).toLowerCase()]);
    expect(r.alOpCursus).toEqual([W(1), W(16)]);
    expect(r.toegevoegd).toEqual([]);
    expect(r.course).toBe(cursus);
    // Samen met een echt nieuwe code: alleen die komt erbij, en de genormaliseerde code staat op de nieuwe sectie.
    const mix = voegGeplandeSectiesToe(cursus, leerplan, [W(1).toLowerCase(), W(11).toLowerCase()]);
    expect(mix.alOpCursus).toEqual([W(1)]);
    expect(mix.toegevoegd).toEqual([W(11)]);
    expect(mix.course.chapters[0].sections[2].goalCodes).toEqual([W(11)]);
  });

  it('herkent ook een code op een sectie van de cursus die in kleine letters of met extra spaties getypt staat', () => {
    const cursus = groteCursus();
    cursus.chapters[0].sections[0].goalCodes = [W(1).toLowerCase(), `  ${W(2).toLowerCase()} `];
    cursus.chapters[1].sections[0].goalCodes = [W(16).toLowerCase()];
    const r = voegGeplandeSectiesToe(cursus, leerplan, [W(1), W(2), W(16), W(11)]);
    expect(r.alOpCursus).toEqual([W(1), W(2), W(16)]);
    expect(r.toegevoegd).toEqual([W(11)]);
    // De codes op de bestaande secties blijven zoals ze stonden.
    expect(r.course.chapters[0].sections[0].goalCodes).toEqual([W(1).toLowerCase(), `  ${W(2).toLowerCase()} `]);
    expect(voegGeplandeSectiesToe(cursus, leerplan, [W(1), W(2), W(16)]).course).toBe(cursus);
  });

  it('geeft de gegeven cursus zelf terug als er niets toe te voegen is', () => {
    const cursus = groteCursus();
    const alles = voegGeplandeSectiesToe(cursus, leerplan, [W(1), W(9), W(16)]);
    expect(alles.course).toBe(cursus);
    expect(alles).toMatchObject({ toegevoegd: [], alOpCursus: [W(1), W(9), W(16)], hoofdstukken: 0 });
    const onbekend = voegGeplandeSectiesToe(cursus, leerplan, ['NIET IN HET LEERPLAN']);
    expect(onbekend.course).toBe(cursus);
    expect(onbekend).toMatchObject({ toegevoegd: [], alOpCursus: [], hoofdstukken: 0 });
    expect(voegGeplandeSectiesToe(cursus, leerplan, []).course).toBe(cursus);
  });

  it('nieuwe hoofdstukken die alleen in hoofdletters verschillen, worden één hoofdstuk', () => {
    const lp = { ...leerplan, goals: [
      { id: 'g1', code: 'A1', text: 'a', theme: 'Alfa › Eerste' },
      { id: 'g2', code: 'A2', text: 'b', theme: 'alfa › Tweede' },
    ] };
    const r = voegGeplandeSectiesToe(groteCursus(), lp, ['A1', 'A2']);
    expect(r.course.chapters.map((h) => h.title)).toEqual(['Wiskunde', 'Verdieping', 'Alfa']);
    expect(r.course.chapters[2].sections.map((s) => s.title)).toEqual(['Eerste', 'Tweede']);
    expect(r.hoofdstukken).toBe(1);
  });

  it('sanitizeCourse laat alle secties, ids en doelcodes staan', () => {
    const r = voegGeplandeSectiesToe(groteCursus(), leerplan, [W(11), W(12), B(2), B(5), B(7)]);
    const saneer = sanitizeCourse(structuredClone(r.course));
    expect(saneer).not.toBeNull();
    const kort = (c: Course) => allSections(c).map(({ chapter, section }) => [chapter.id, section.id, section.title, section.goalCodes ?? []]);
    expect(kort(saneer as Course)).toEqual(kort(r.course));
    expect(saneer?.chapters.map((h) => h.id)).toEqual(r.course.chapters.map((h) => h.id));
    // De doelen-callout blijft een callout van het soort goal.
    const nieuweSectie = (saneer as Course).chapters[0].sections[2];
    expect(nieuweSectie.blocks[0]).toMatchObject({ type: 'callout', kind: 'goal' });
  });
});

describe('voegGeplandeSectiesToe: de dekking', () => {
  it('maakt precies de gekozen open doelen "gepland" en laat de rest van de dekking zoals ze was', () => {
    const { leerplan, cursus } = wiskundeScenario();
    const voor = dekkingVan([{ course: cursus, leerplan }]);
    expect(voor).toMatchObject({ totaal: 32, gedekt: 13, gepland: 0, open: 19 });

    const openWis = openPerSet(openVerplichteDoelen(voor)).find((s) => s.set === 'ODS_9102')!.doelen;
    expect(openWis.map((d) => d.id)).toEqual(['w14', 'w15', 'w16']);
    const { codes, inLeerplan, nietInLeerplan } = codesVoorDoelen(leerplan, openWis);
    expect(inLeerplan).toHaveLength(3);
    expect(nietInLeerplan).toEqual([]);
    const r = voegGeplandeSectiesToe(cursus, leerplan, codes);
    expect(r.toegevoegd).toEqual(codes);

    const na = dekkingVan([{ course: r.course, leerplan }]);
    expect(na).toMatchObject({ totaal: 32, gedekt: 13, gepland: 3, open: 16 });
    expect(na.rijen.filter((rij) => rij.status === 'gepland').map((rij) => rij.doel.id)).toEqual(['w14', 'w15', 'w16']);
    // De rest bleef zoals ze was.
    expect(na.rijen.filter((rij) => rij.status === 'gedekt').map((rij) => rij.doel.id)).toEqual(voor.rijen.filter((rij) => rij.status === 'gedekt').map((rij) => rij.doel.id));
  });
});

// ── Bewaren, met een nagebootste opslag ─────────────────────────────────────

class NepOpslag implements GatenOpslag {
  leerplannen = new Map<string, Curriculum>();
  cursussen = new Map<string, Course>();
  log: string[] = [];
  leerplanVol = false;
  cursusVol = false;
  gooitBijCursus = false;
  gooitBijLeerplan = false;
  gooitBijLezen = false;
  /** Dwingt het antwoord van `saveCourseGuarded` af (een ander tabblad, een verwijderde cursus). */
  guardedAntwoord?: GuardedSaveResult;

  saveCurriculum(c: Curriculum): boolean {
    this.log.push(`saveCurriculum:${c.id}`);
    if (this.gooitBijLeerplan) throw new Error('opslag geblokkeerd');
    if (this.leerplanVol) return false;
    this.leerplannen.set(c.id, c);
    return true;
  }

  deleteCurriculum(id: string): void {
    this.log.push(`deleteCurriculum:${id}`);
    this.leerplannen.delete(id);
  }

  saveCourse(c: Course): boolean {
    this.log.push(`saveCourse:${c.id}`);
    if (this.gooitBijCursus) throw new Error('opslag geblokkeerd');
    if (this.cursusVol) return false;
    this.cursussen.set(c.id, c);
    return true;
  }

  getCourse(id: string): Course | undefined {
    if (this.gooitBijLezen) throw new Error('opslag geblokkeerd');
    return this.cursussen.get(id);
  }

  saveCourseGuarded(c: Course, verwacht: number): GuardedSaveResult {
    this.log.push(`guarded:${c.id}:${verwacht}`);
    if (this.guardedAntwoord) return this.guardedAntwoord;
    const bewaard = this.cursussen.get(c.id);
    if (!bewaard) return { ok: false, reason: 'verwijderd' };
    if (bewaard.updatedAt !== verwacht) return { ok: false, reason: 'gewijzigd', stored: bewaard };
    if (this.cursusVol) return { ok: false, reason: 'mislukt' };
    const updatedAt = bewaard.updatedAt + 1;
    this.cursussen.set(c.id, { ...c, updatedAt });
    return { ok: true, updatedAt };
  }
}

describe('GatenOpslag', () => {
  it('past op de echte functies van de opslag (type-controle)', () => {
    const echt: GatenOpslag = { saveCurriculum, deleteCurriculum, saveCourse, getCourse, saveCourseGuarded };
    expect(Object.keys(echt)).toHaveLength(5);
  });
});

describe('bewaarNieuweGatenCursus', () => {
  const leerplan = leerplanVan({ bestand: CHE, doelen: 'alle' });
  const cursus = cursusMet([{ titel: 'Chemie', codes: [] }], { id: 'nieuw', curriculumId: leerplan.id });

  it('bewaart eerst het nieuwe leerplan en dan de cursus', () => {
    const opslag = new NepOpslag();
    expect(bewaarNieuweGatenCursus({ leerplan, nieuwLeerplan: true, cursus }, opslag)).toEqual({ ok: true });
    expect(opslag.log).toEqual([`saveCurriculum:${leerplan.id}`, 'saveCourse:nieuw']);
    expect(opslag.leerplannen.has(leerplan.id)).toBe(true);
    expect(opslag.cursussen.has('nieuw')).toBe(true);
  });

  it('bewaart een hergebruikt leerplan niet opnieuw', () => {
    const opslag = new NepOpslag();
    opslag.leerplannen.set(leerplan.id, leerplan);
    expect(bewaarNieuweGatenCursus({ leerplan, nieuwLeerplan: false, cursus }, opslag)).toEqual({ ok: true });
    expect(opslag.log).toEqual(['saveCourse:nieuw']);
  });

  it('leerplan vol: niets bewaard, de cursus wordt niet eens geprobeerd', () => {
    const opslag = new NepOpslag();
    opslag.leerplanVol = true;
    expect(bewaarNieuweGatenCursus({ leerplan, nieuwLeerplan: true, cursus }, opslag)).toEqual({ ok: false, wat: 'leerplan' });
    expect(opslag.log).toEqual([`saveCurriculum:${leerplan.id}`]);
    expect(opslag.leerplannen.size).toBe(0);
    expect(opslag.cursussen.size).toBe(0);
  });

  it('cursus vol: een nieuw leerplan wordt weer gewist', () => {
    const opslag = new NepOpslag();
    opslag.cursusVol = true;
    expect(bewaarNieuweGatenCursus({ leerplan, nieuwLeerplan: true, cursus }, opslag)).toEqual({ ok: false, wat: 'cursus' });
    expect(opslag.log).toEqual([`saveCurriculum:${leerplan.id}`, 'saveCourse:nieuw', `deleteCurriculum:${leerplan.id}`]);
    expect(opslag.leerplannen.size).toBe(0);
    expect(opslag.cursussen.size).toBe(0);
  });

  it('cursus vol: een hergebruikt leerplan blijft staan', () => {
    const opslag = new NepOpslag();
    opslag.leerplannen.set(leerplan.id, leerplan);
    opslag.cursusVol = true;
    expect(bewaarNieuweGatenCursus({ leerplan, nieuwLeerplan: false, cursus }, opslag)).toEqual({ ok: false, wat: 'cursus' });
    expect(opslag.log).toEqual(['saveCourse:nieuw']);
    expect(opslag.leerplannen.has(leerplan.id)).toBe(true);
  });

  it('cursus vol terwijl dezelfde cursus er al staat (dubbel geklikt): het leerplan waaraan ze hangt wordt niet gewist', () => {
    const opslag = new NepOpslag();
    const o = { leerplan, nieuwLeerplan: true, cursus };
    // De eerste aanroep lukt, de tweede loopt vast op een volle opslag.
    expect(bewaarNieuweGatenCursus(o, opslag)).toEqual({ ok: true });
    opslag.cursusVol = true;
    expect(bewaarNieuweGatenCursus(o, opslag)).toEqual({ ok: false, wat: 'cursus' });
    expect(opslag.log.some((regel) => regel.startsWith('deleteCurriculum'))).toBe(false);
    expect(opslag.leerplannen.has(leerplan.id)).toBe(true);
    expect(opslag.cursussen.get('nieuw')?.curriculumId).toBe(leerplan.id);
  });

  it('cursus vol en de opslag laat zich niet lezen: het leerplan blijft liever staan dan dat een bewaarde cursus haar leerplan verliest', () => {
    const opslag = new NepOpslag();
    opslag.cursusVol = true;
    opslag.gooitBijLezen = true;
    expect(bewaarNieuweGatenCursus({ leerplan, nieuwLeerplan: true, cursus }, opslag)).toEqual({ ok: false, wat: 'cursus' });
    expect(opslag.log.some((regel) => regel.startsWith('deleteCurriculum'))).toBe(false);
    expect(opslag.leerplannen.has(leerplan.id)).toBe(true);
  });

  it('een opslag die gooit, telt als mislukt en laat niets achter', () => {
    const bijCursus = new NepOpslag();
    bijCursus.gooitBijCursus = true;
    expect(bewaarNieuweGatenCursus({ leerplan, nieuwLeerplan: true, cursus }, bijCursus)).toEqual({ ok: false, wat: 'cursus' });
    expect(bijCursus.leerplannen.size).toBe(0);
    const bijLeerplan = new NepOpslag();
    bijLeerplan.gooitBijLeerplan = true;
    expect(bewaarNieuweGatenCursus({ leerplan, nieuwLeerplan: true, cursus }, bijLeerplan)).toEqual({ ok: false, wat: 'leerplan' });
    expect(bijLeerplan.cursussen.size).toBe(0);
  });
});

describe('bewaarGatenOpCursus', () => {
  /** Een opslag met de cursus van het wiskundescenario (updatedAt 500) en de codes van de drie open doelen. */
  function begin() {
    const { leerplan, cursus, codes } = wiskundeScenario();
    const opslag = new NepOpslag();
    opslag.cursussen.set(cursus.id, cursus);
    return { leerplan, cursus, opslag, codes, open: codes.slice(13) };
  }

  it('leest de cursus opnieuw, zet de secties erbij en bewaart bewaakt met de versie die ze las', () => {
    const { leerplan, cursus, opslag, open } = begin();
    const r = bewaarGatenOpCursus({ courseId: cursus.id, leerplan, codes: open }, opslag);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.toegevoegd).toBe(3);
    expect(opslag.log).toEqual(['guarded:k1:500']);
    const bewaard = opslag.cursussen.get('k1')!;
    expect(bewaard.updatedAt).toBe(501);
    expect(r.course).toEqual(bewaard);
    expect(alleCodesVan(bewaard)).toEqual(expect.arrayContaining(open));
    // De bestaande secties bleven diep gelijk.
    expect(bewaard.chapters[0].sections.slice(0, 2)).toEqual(cursus.chapters[0].sections);
    // Het leerplan werd niet aangepast of bewaard.
    expect(opslag.log.some((regel) => regel.startsWith('saveCurriculum'))).toBe(false);
  });

  it('rekent op de versie in de opslag en niet op een oudere kopie', () => {
    const { leerplan, cursus, opslag, open } = begin();
    // Intussen veranderde de cursus elders: een extra hoofdstuk en een nieuwe versie.
    opslag.cursussen.set(cursus.id, { ...cursus, updatedAt: 900, chapters: [...cursus.chapters, { id: 'extra', title: 'Elders toegevoegd', sections: [] }] });
    const r = bewaarGatenOpCursus({ courseId: cursus.id, leerplan, codes: open }, opslag);
    expect(r.ok).toBe(true);
    expect(opslag.log).toEqual(['guarded:k1:900']);
    expect(opslag.cursussen.get('k1')!.chapters.map((h) => h.id)).toContain('extra');
  });

  it('geeft "verwijderd" als de cursus er niet meer is, zonder te schrijven', () => {
    const { leerplan, opslag, open } = begin();
    expect(bewaarGatenOpCursus({ courseId: 'weg', leerplan, codes: open }, opslag)).toEqual({ ok: false, reden: 'verwijderd' });
    expect(opslag.log).toEqual([]);
  });

  it('geeft "ander-leerplan" als de cursus intussen aan een ander leerplan hangt, zonder te schrijven', () => {
    const { leerplan, cursus, opslag, open } = begin();
    opslag.cursussen.set(cursus.id, { ...cursus, curriculumId: 'iets-anders' });
    expect(bewaarGatenOpCursus({ courseId: cursus.id, leerplan, codes: open }, opslag)).toEqual({ ok: false, reden: 'ander-leerplan' });
    opslag.cursussen.set(cursus.id, { ...cursus, curriculumId: undefined });
    expect(bewaarGatenOpCursus({ courseId: cursus.id, leerplan, codes: open }, opslag)).toEqual({ ok: false, reden: 'ander-leerplan' });
    expect(opslag.log).toEqual([]);
  });

  it('geeft "niets-te-doen" als alle codes al op de cursus staan of niet in het leerplan, zonder te schrijven', () => {
    const { leerplan, cursus, opslag, codes } = begin();
    expect(bewaarGatenOpCursus({ courseId: cursus.id, leerplan, codes: codes.slice(0, 13) }, opslag)).toEqual({ ok: false, reden: 'niets-te-doen' });
    expect(bewaarGatenOpCursus({ courseId: cursus.id, leerplan, codes: ['BESTAAT NIET'] }, opslag)).toEqual({ ok: false, reden: 'niets-te-doen' });
    expect(bewaarGatenOpCursus({ courseId: cursus.id, leerplan, codes: [] }, opslag)).toEqual({ ok: false, reden: 'niets-te-doen' });
    expect(opslag.log).toEqual([]);
  });

  it('geeft "gewijzigd" als de bewaking een andere versie vindt, en laat de opslag zoals ze was', () => {
    const { leerplan, cursus, opslag, open } = begin();
    opslag.guardedAntwoord = { ok: false, reason: 'gewijzigd', stored: { ...cursus, updatedAt: 777 } };
    expect(bewaarGatenOpCursus({ courseId: cursus.id, leerplan, codes: open }, opslag)).toEqual({ ok: false, reden: 'gewijzigd' });
    expect(opslag.cursussen.get('k1')).toEqual(cursus);
  });

  it('geeft "verwijderd" als de cursus tussen lezen en bewaren verdween', () => {
    const { leerplan, cursus, opslag, open } = begin();
    opslag.guardedAntwoord = { ok: false, reason: 'verwijderd' };
    expect(bewaarGatenOpCursus({ courseId: cursus.id, leerplan, codes: open }, opslag)).toEqual({ ok: false, reden: 'verwijderd' });
  });

  it('geeft "mislukt" bij een volle opslag en laat de cursus ongewijzigd', () => {
    const { leerplan, cursus, opslag, open } = begin();
    opslag.cursusVol = true;
    expect(bewaarGatenOpCursus({ courseId: cursus.id, leerplan, codes: open }, opslag)).toEqual({ ok: false, reden: 'mislukt' });
    expect(opslag.cursussen.get('k1')).toEqual(cursus);
  });
});

function alleCodesVan(c: Course): string[] {
  return allSections(c).flatMap(({ section }) => section.goalCodes ?? []);
}

// ── Een nieuwe cursus dicht het gat ─────────────────────────────────────────

describe('een nieuwe cursus voor de gaten', () => {
  it('het leerplan en het geraamte dekken de 19 open doelen: ze staan daarna op "gepland" en er blijft niets open', () => {
    const { leerplan: lpWis, cursus } = wiskundeScenario();
    const voor = dekkingVan([{ course: cursus, leerplan: lpWis }]);
    const perSet = openPerSet(openVerplichteDoelen(voor));
    const selectie = selectieVanOpen(perSet, new Set(perSet.map((s) => s.set)));

    const l = leerplanVoorGaten({ info: INFO, kader: KADER, selectie, bestanden: BESTANDEN, curricula: [] });
    if (l.soort !== 'nieuw') throw new Error('verwacht een nieuw leerplan');
    const dg = doelgroepVan(INFO, KADER.keuze);
    const titels = titelsVoorGaten(INFO, KADER, KADER.keuze, [...selectie.keys()], new Map(perSet.map((s) => [s.set, s.setNaam])));
    const nieuweCursus = cursusVoorRichting({ titel: titels.cursus, auteur: '', doelgroep: dg, leerplan: l.leerplan, start: 'geraamte' });

    const opslag = new NepOpslag();
    expect(bewaarNieuweGatenCursus({ leerplan: l.leerplan, nieuwLeerplan: true, cursus: nieuweCursus }, opslag)).toEqual({ ok: true });
    // De cursus draagt geen kadervelden van het leerplan.
    expect(nieuweCursus.doelgroep?.kader).toBeUndefined();
    expect(nieuweCursus.doelgroep?.setAfdrukken).toBeUndefined();
    expect(nieuweCursus.curriculumId).toBe(l.leerplan.id);

    const na = dekkingVan([{ course: cursus, leerplan: lpWis }, { course: nieuweCursus, leerplan: l.leerplan }]);
    expect(na).toMatchObject({ totaal: 32, gedekt: 13, gepland: 19, open: 0 });
    // Een lege cursus zou de doelen op open laten staan: hier staat elk doel op een sectie.
    expect(allSections(nieuweCursus).flatMap(({ section }) => section.goalCodes ?? [])).toHaveLength(19);
  });

  it('twee keer hetzelfde gat plannen geeft hetzelfde leerplan', () => {
    const selectie = new Map([['ODS_9103', ['c1', 'c2', 'c3', 'c4', 'c5']]]);
    const eerste = leerplanVoorGaten({ info: INFO, kader: KADER, selectie, bestanden: BESTANDEN, curricula: [] });
    if (eerste.soort !== 'nieuw') throw new Error('verwacht een nieuw leerplan');
    const tweede = leerplanVoorGaten({ info: INFO, kader: KADER, selectie, bestanden: BESTANDEN, curricula: [eerste.leerplan] });
    expect(tweede).toEqual({ soort: 'hergebruik', leerplan: eerste.leerplan });
  });
});

// ── Op de fixtures (nagebootste API) en de echte setbestanden ───────────────

const WORTEL = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURES = join(WORTEL, 'tests', 'fixtures', 'structuur', 'uit');
const MINIMUMDOELEN_MAP = join(WORTEL, 'public', 'leerplannen', 'minimumdoelen');
const INDEX_BESTAND = join(MINIMUMDOELEN_MAP, 'index.json');
const HEEFT_DATA = existsSync(join(FIXTURES, 'studierichtingen.json')) && existsSync(join(FIXTURES, 'richtingdoelen', 'index.json')) && existsSync(INDEX_BESTAND);

function leesJson<T>(pad: string): T {
  return JSON.parse(readFileSync(pad, 'utf8')) as T;
}

describe.runIf(HEEFT_DATA)('gaten dichten op G-0193 (fixtures en echte setbestanden)', () => {
  const matrix = leesJson<MatrixBestand>(join(FIXTURES, 'studierichtingen.json'));
  const koppeling = leesJson<RichtingDoelenIndex>(join(FIXTURES, 'richtingdoelen', 'index.json'));
  const index = leesJson<MinimumdoelenIndex>(INDEX_BESTAND).sets;
  const info = richtingInfo(matrix, 'G-0193', VANDAAG) as RichtingInfo;
  const regel = koppeling.groepen.find((r) => r.groep === 'G-0193') as RichtingDoelenIndexRegel;
  const bestand = leesJson<RichtingDoelenBestand>(join(FIXTURES, 'richtingdoelen', regel.bestand as string));
  const kader = bouwKader(bestand, regel, index, { groep: 'G-0193', soort: 'so', jaar: 4 }, info);
  const setBestanden = new Map<string, MinimumdoelenSetBestand>();
  for (const k of kader.sets) {
    const pad = join(MINIMUMDOELEN_MAP, k.set.bestand);
    if (existsSync(pad)) setBestanden.set(k.set.id, leesJson<MinimumdoelenSetBestand>(pad));
  }
  const allesGeladen = setBestanden.size === kader.sets.length;
  const doelen = kaderDoelen(kader, setBestanden);
  const verplicht = doelen.filter((d) => d.verplichteSet && !d.optioneel);

  it.runIf(allesGeladen)('zonder cursussen staat elk verplicht doel open; de rest telt als niet-verplicht', () => {
    const leeg = dekkingMinimumdoelen(doelen, [], []);
    const open = openVerplichteDoelen(leeg);
    expect(open).toHaveLength(verplicht.length);
    expect(open.length).toBeGreaterThan(50);
    expect(openNietVerplicht(leeg)).toBe(doelen.length - verplicht.length);
    expect(open.every((d) => d.tekst !== '')).toBe(true);
    expect(perSetTelling(open)).toEqual(perSetTelling(verplicht));
  });

  it.runIf(allesGeladen)('alle open doelen samen geven een nagekeken leerplan met precies die doelen, en een deelset blijft een deelset', () => {
    const open = openVerplichteDoelen(dekkingMinimumdoelen(doelen, [], []));
    const perSet = openPerSet(open);
    const selectie = selectieVanOpen(perSet, new Set(perSet.map((s) => s.set)));
    const r = leerplanVoorGaten({ info, kader, selectie, bestanden: setBestanden, curricula: [] });
    expect(r.soort).toBe('nieuw');
    if (r.soort !== 'nieuw') return;
    expect(r.leerplan.goals).toHaveLength(open.length);
    expect(new Set(sleutels(r.leerplan))).toEqual(new Set(open.map((d) => `${d.set}|${d.id}`)));
    expect(Object.keys(r.leerplan.doelgroep?.setAfdrukken ?? {})).toEqual(perSet.map((s) => s.set));
    expect(r.leerplan.title.length).toBeLessThanOrEqual(120);
    expect(r.leerplan.title).not.toMatch(/ODS_/);

    // Elke deelset van het kader geeft in het leerplan hoogstens de nummers van de koppeling, nooit de hele set.
    for (const k of kader.sets.filter((s) => !s.volledig && s.verplicht)) {
      const inLeerplan = r.leerplan.goals.filter((g) => g.refs?.[0].set === k.set.id).length;
      const verwacht = open.filter((d) => d.set === k.set.id).length;
      expect(inLeerplan, k.set.id).toBe(verwacht);
      expect(inLeerplan, k.set.id).toBeLessThanOrEqual(k.ids.length);
      expect(inLeerplan, k.set.id).toBeLessThan(k.set.aantal);
    }
  });

  it.runIf(allesGeladen)('een volledige set waarvan 3 verplichte doelen open staan, geeft 3 doelen in het leerplan en 3 codes voor een bestaande cursus', () => {
    const volledig = kader.sets.find((k) => k.volledig && k.verplicht && verplicht.filter((d) => d.set === k.set.id).length >= 6);
    expect(volledig, 'een volledige set met minstens 6 verplichte doelen').toBeDefined();
    const setId = volledig!.set.id;
    const bron = setBestanden.get(setId)!;
    const lp = leerplanVan({ bestand: bron, doelen: 'alle' });
    const eigen = verplicht.filter((d) => d.set === setId);
    const openIds = eigen.slice(-3).map((d) => d.id);
    const gedekt = lp.goals.filter((g) => !openIds.includes(g.refs?.[0].id as string)).map((g) => g.code);
    const cursus = cursusMet([{ titel: 'Alles behalve drie', codes: gedekt }], { curriculumId: lp.id });

    const dekking = dekkingMinimumdoelen(doelen, [{ course: cursus, leerplan: lp }], []);
    const open = openVerplichteDoelen(dekking).filter((d) => d.set === setId);
    expect(open.map((d) => d.id)).toEqual(openIds);
    expect(volledig!.set.aantal).toBeGreaterThan(3);

    const selectie = selectieVanOpen(openPerSet(open), new Set([setId]));
    const r = leerplanVoorGaten({ info, kader, selectie, bestanden: setBestanden, curricula: [] });
    expect(r.soort).toBe('nieuw');
    if (r.soort !== 'nieuw') return;
    expect(ids(r.leerplan)).toEqual(openIds);

    // Voor de bestaande cursus: dezelfde drie doelen worden drie lege secties met een code, en staan daarna op "gepland".
    const { codes } = codesVoorDoelen(lp, open);
    expect(codes).toHaveLength(3);
    const opslag = new NepOpslag();
    opslag.cursussen.set(cursus.id, cursus);
    const b = bewaarGatenOpCursus({ courseId: cursus.id, leerplan: lp, codes }, opslag);
    expect(b.ok && b.toegevoegd).toBe(3);
    const na = dekkingMinimumdoelen(doelen, [{ course: opslag.cursussen.get(cursus.id)!, leerplan: lp }], []);
    expect(na.rijen.filter((rij) => rij.status === 'gepland').map((rij) => rij.doel.id)).toEqual(openIds);
  });

  it('het geraamte van elk leerplan bevat elke code één keer', () => {
    // Controle op de echte rubrieken: geen verloren of dubbele codes in `geraamteHoofdstukken`.
    const sets = [...setBestanden.values()].slice(0, 6);
    if (sets.length === 0) return;
    const lp = leerplanVan(...sets.map((b) => ({ bestand: b, doelen: 'alle' as const })));
    const codes = lp.goals.map((g) => g.code);
    const geraamte = geraamteHoofdstukken(lp);
    const opSecties = geraamte.flatMap((h) => h.sections.flatMap((s) => s.goalCodes ?? []));
    expect(opSecties.slice().sort()).toEqual(codes.slice().sort());
  });
});

function perSetTelling(doelen: readonly { set: string }[]): Record<string, number> {
  const uit: Record<string, number> = {};
  for (const d of doelen) uit[d.set] = (uit[d.set] ?? 0) + 1;
  return uit;
}
