import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sanitizeCourse, createCourse } from './courses';
import type { Course } from './courseTypes';
import { createCurriculum, maakEigenKopie, normalizeGoalCode } from './curriculum';
import type { Curriculum } from './curriculumTypes';
import { doelgroepTekst, zonderKaderVelden, type Doelgroep } from './doelgroep';
import { leerplanUitSelectie, selectieVanLeerplan } from './doelenSamenstellen';
import { effectieveStatus } from './leerplanStatus';
import type { Minimumdoel, MinimumdoelenIndex, MinimumdoelenIndexSet, MinimumdoelenSetBestand } from './minimumdoelen';
import { isStemSet } from './minimumdoelenBron';
import {
  afdrukkenPerSet,
  bouwKader,
  doelgroepVan,
  kaderAfdrukken,
  kaderVingerafdruk,
  naarSetKeuzes,
  richtingInfo,
  selectieVanKader,
  volledigeSetsVingerafdruk,
  type KaderSet,
  type RichtingInfo,
  type RichtingKader,
  type RichtingKeuze,
} from './richtingKader';
import {
  cursusVoorRichting,
  geraamteHoofdstukken,
  leerplanVoorRichting,
  leerplannenBijRichting,
  passendeCodes,
  selectieVanKeuzes,
  titelVoorRichtingLeerplan,
  vakVoorstel,
  vergelijkMetKader,
  vindLeerplanMetSelectie,
  voorstelCursusTitel,
} from './richtingCursus';
import { beginUitKeuze, bouwSetKeuzes, kiesbareDoelen } from './samenstelKeuze';
import { setNoemtVak } from './setKeuze';
import type {
  MatrixBestand,
  RichtingDoelenBestand,
  RichtingDoelenIndex,
  RichtingDoelenIndexRegel,
  StudierichtingGroep,
  Structuuronderdeel,
} from './studierichtingen';

const VANDAAG = '2026-10-09';
const SHA = 'ab'.repeat(32);

// ── Nagemaakte sets ─────────────────────────────────────────────────────────

function doel(id: string, code: string, tekst: string, rubrieken: string[] = []): Minimumdoel {
  const titels: Record<string, unknown> = {};
  rubrieken.forEach((titel, i) => { titels[String(i + 1)] = { titel }; });
  return { id, code, tekst, ...(rubrieken.length > 0 ? { extra: { titels } } : {}) };
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
function reeks(voorvoegsel: string, kode: string, n: number, rubriek: (i: number) => string[] = () => []): Minimumdoel[] {
  return Array.from({ length: n }, (_, k) => {
    const i = k + 1;
    return doel(`${voorvoegsel}${i}`, `${kode}${String(i).padStart(2, '0')}`, `Doel ${i} van ${kode}.`, rubriek(i));
  });
}

const NAAM_BEGIN = 'Secundair onderwijs 2de graad';
const NAAM_DOORSTROOM = `${NAAM_BEGIN} aso, kso, tso Finaliteit doorstroom`;

/** Biologie: 13 doelen, waarvan de koppeling er 4 noemt (b2, b5, b7, b11). */
const BIO = maakBestand('ODS_9101', `${NAAM_BEGIN} -  Biologie - Cesuurdoelen`, 'Biologie',
  reeks('b', 'B', 13, (i) => (i <= 6 ? ['Leven', 'Cel'] : ['Leven', 'Organisme'])));
const CHEMIE = maakBestand('ODS_9102', `${NAAM_BEGIN} -  Chemie - Cesuurdoelen`, 'Chemie', reeks('c', 'C', 5));
const STEM = maakBestand('ODS_9103', `${NAAM_DOORSTROOM} -  Competenties inzake wiskunde, exacte wetenschappen en technologie - Eindtermen`,
  'Wiskunde, exacte wetenschappen en technologie', reeks('s', 'S', 8, (i) => [i <= 4 ? 'Wiskunde' : 'Natuurwetenschappen']));
const NEDERLANDS = maakBestand('ODS_9104', `${NAAM_DOORSTROOM} -  Competenties in het Nederlands - Eindtermen`,
  'Competenties in het Nederlands', reeks('n', 'N', 6, (i) => [i <= 3 ? 'Lezen' : 'Schrijven']));
const UITBREIDING = maakBestand('ODS_9105', `${NAAM_DOORSTROOM} -  Competenties in het Nederlands - Uitbreidingsdoelen`,
  'Competenties in het Nederlands (uitbreiding)', reeks('u', 'U', 3));

const BIO_KOPPELING = ['b2', 'b5', 'b7', 'b11'];
const ALLE_BESTANDEN: MinimumdoelenSetBestand[] = [BIO, CHEMIE, STEM, NEDERLANDS, UITBREIDING];
const BESTANDEN = new Map(ALLE_BESTANDEN.map((b) => [b.set.id, b]));

function kaderSet(b: MinimumdoelenSetBestand, ids: 'alle' | string[], extra: { verplicht?: boolean; versieGelijk?: boolean } = {}): KaderSet {
  const index = indexVan(b);
  const lijst = ids === 'alle' ? b.doelen.map((d) => d.id as string) : ids;
  return { set: index, ids: lijst, volledig: lijst.length === index.aantal, verplicht: extra.verplicht ?? true, versieGelijk: extra.versieGelijk ?? true };
}

function maakKader(sets: KaderSet[], keuze: Partial<RichtingKeuze> = {}): RichtingKader {
  const som = (lijst: KaderSet[]) => lijst.reduce((n, k) => n + k.ids.length, 0);
  return {
    keuze: { groep: 'G-0100', soort: 'so', jaar: 4, ...keuze }, herkomst: 'api', opgehaald: '2026-10-09T00:00:00Z',
    sets, aantalDoelen: som(sets), aantalVerplicht: som(sets.filter((k) => k.verplicht)),
    nietVoorDitJaar: [], verborgenOud: 0, verborgenAndereSoort: 0, onbekend: [], teGroot: false,
  };
}

/** Het kader van de testrichting: Biologie (deel), Chemie, de STEM-set en Nederlands, plus een uitbreidingsset. */
function testKader(opties: { bioIds?: string[]; sets?: KaderSet[] } = {}): RichtingKader {
  return maakKader(opties.sets ?? [
    kaderSet(BIO, opties.bioIds ?? BIO_KOPPELING),
    kaderSet(CHEMIE, 'alle'),
    kaderSet(STEM, 'alle'),
    kaderSet(NEDERLANDS, 'alle'),
    kaderSet(UITBREIDING, 'alle', { verplicht: false }),
  ]);
}

// ── Nagemaakte matrix, voor RichtingInfo ────────────────────────────────────

function onderdeel(nummer: number, groep: string, extra: Partial<Structuuronderdeel> = {}): Structuuronderdeel {
  return {
    nummer, groep, titel: `Onderdeel ${nummer}`, onderwijsvorm: 'ASO', begindatum: '2021-09-01',
    leerjaren: [{ code: '1' }, { code: '2' }], hoofdstructuren: ['311', '321'], ...extra,
  };
}

function groepVan(nummer: string, titel: string, onderdelen: number[], extra: Partial<StudierichtingGroep> = {}): StudierichtingGroep {
  return { nummer, titel, graad: '2', finaliteit: 'DO', onderdelen, ...extra };
}

function matrixVan(groepen: StudierichtingGroep[], onderdelen: Structuuronderdeel[]): MatrixBestand {
  return {
    app: 'boosterz', kind: 'studierichtingen', v: 1, bron: 'x', api: 'x', naamsvermelding: 'x', licentie: 'x',
    opgehaald: '2026-10-09T00:00:00Z', aantalGroepen: groepen.length, aantalOnderdelen: onderdelen.length, sha256: SHA, groepen, onderdelen,
  };
}

const MATRIX = matrixVan(
  [
    groepVan('G-0100', 'Testrichting', [100]),
    groepVan('G-0300', 'Eerste leerjaar A', [300], { graad: '1', finaliteit: undefined }),
  ],
  [
    onderdeel(100, 'G-0100', { titel: 'Testrichting (variant)', ov4: true }),
    onderdeel(300, 'G-0300', { leerjaren: [{ code: '1' }] }),
  ],
);

const INFO = richtingInfo(MATRIX, 'G-0100', VANDAAG) as RichtingInfo;
const INFO_1A = richtingInfo(MATRIX, 'G-0300', VANDAAG) as RichtingInfo;
const DOELGROEP: Doelgroep = doelgroepVan(INFO, { groep: 'G-0100', soort: 'so', jaar: 4 }, { vak: 'Biologie' });

// ── Hulp ────────────────────────────────────────────────────────────────────

const laatste = <T>(lijst: readonly T[]): T => lijst[lijst.length - 1];
const refIds = (cur: Curriculum) => cur.goals.map((g) => g.refs?.[0].id);
const codesVan = (cur: Curriculum) => cur.goals.map((g) => g.code);
const setsVan = (cur: Curriculum) => cur.minimumdoelenSets ?? [];

/**
 * De afdrukken zoals een leerplan van een richting ze vóór fase 2 kreeg: `kader` en `kaderVolledig`, zonder
 * `setAfdrukken` (§ 22.3.8). Tests die de oude regel bedoelen, bouwen hun doelgroep hiermee en niet met
 * `kaderAfdrukken`, dat sinds fase 2 ook `setAfdrukken` geeft.
 */
function oudFormaat(kader: RichtingKader, sets: readonly string[]): { kader: string; kaderVolledig: string } {
  return { kader: kaderVingerafdruk(kader, sets), kaderVolledig: volledigeSetsVingerafdruk(kader, sets) };
}

/** Hetzelfde leerplan zoals de app het vóór fase 2 bewaarde: dezelfde doelgroep, met `oudFormaat` en zonder `setAfdrukken`. */
function inOudFormaat(leerplan: Curriculum, kader: RichtingKader): Curriculum {
  const dg = leerplan.doelgroep!;
  return {
    ...leerplan,
    doelgroep: { ...zonderKaderVelden(dg), ...oudFormaat(kader, setsVan(leerplan)), ...(dg.volgtKader ? { volgtKader: true as const } : {}) },
  };
}

function leerplanMet(goals: { code: string; text: string; theme?: string }[]): Curriculum {
  return createCurriculum({
    title: 'Testleerplan', net: 'minimumdoelen', subject: '', level: '',
    goals: goals.map((g, i) => ({ id: `g${i}`, ...g })),
  });
}

/** Alle codes van de secties van een geraamte, in volgorde. */
function sectieCodes(chapters: { sections: { goalCodes?: string[] }[] }[]): string[] {
  return chapters.flatMap((ch) => ch.sections.flatMap((s) => s.goalCodes ?? []));
}

// ── leerplanVoorRichting ────────────────────────────────────────────────────

describe('leerplanVoorRichting', () => {
  it('standaard alle verplichte sets: nagekeken, samengesteld, zonder de uitbreidingsset', () => {
    const r = leerplanVoorRichting(testKader(), BESTANDEN, DOELGROEP, { titel: 'Alles' });
    // Biologie 4 (deelset) + Chemie 5 + STEM 8 + Nederlands 6; de uitbreidingsset (3) niet.
    expect(r.leerplan.goals).toHaveLength(23);
    expect(r.bevestigd).toBe(true);
    expect(r.ontbrekend).toEqual([]);
    expect(r.leerplan.title).toBe('Alles');
    expect(r.leerplan.herkomst?.methode).toBe('samengesteld');
    expect(r.leerplan.kind).toBe('leerplan');
    expect(r.leerplan.controle?.status).toBe('gecontroleerd');
    expect(setsVan(r.leerplan)).toEqual(['ODS_9101', 'ODS_9102', 'ODS_9103', 'ODS_9104']);
  });

  it('een deelset geeft precies de nummers van de koppeling, nooit de hele set', () => {
    const r = leerplanVoorRichting(testKader(), BESTANDEN, DOELGROEP, { sets: ['ODS_9101'] });
    expect(r.bevestigd).toBe(true);
    expect(r.leerplan.goals).toHaveLength(4);
    expect(r.leerplan.goals).not.toHaveLength(13);
    expect(refIds(r.leerplan)).toEqual(BIO_KOPPELING);
    expect(selectieVanLeerplan(r.leerplan).get('ODS_9101')).toEqual(BIO_KOPPELING);
    expect(setsVan(r.leerplan)).toEqual(['ODS_9101']);
  });

  it('regressie van de valkuil (§ 9.5): een deelset van 4 van 13 blijft 4 doelen, ook via de keuzelogica van de wizard', () => {
    const kader = testKader();
    const selectie = selectieVanKader(kader, { sets: ['ODS_9101'] });
    const { keuzes } = naarSetKeuzes(selectie, BESTANDEN);
    // Dezelfde route als de samenstelwizard: beginUitKeuze en bouwSetKeuzes op de hele set.
    const viaWizard = bouwSetKeuzes(beginUitKeuze(selectie), BESTANDEN);
    for (const k of [keuzes, viaWizard]) {
      expect(k).toHaveLength(1);
      expect(k[0].doelen).toEqual(BIO_KOPPELING);
      const r = leerplanUitSelectie(k, { titel: 'Biologie' });
      expect(r.bevestigd).toBe(true);
      expect(r.leerplan.goals).toHaveLength(4);
    }
    expect(selectieVanKeuzes(keuzes).get('ODS_9101')).toEqual(BIO_KOPPELING);
    // En een deelset die toevallig alle bruikbare doelen noemt, blijft een lijst: nooit 'alle'.
    const alleDertien = BIO.doelen.map((d) => d.id as string);
    const kaderAlles = testKader({ bioIds: alleDertien.slice(0, 12) });
    const r = leerplanVoorRichting(kaderAlles, BESTANDEN, DOELGROEP, { sets: ['ODS_9101'] });
    expect(r.leerplan.goals).toHaveLength(12);
  });

  it('de doelgroep staat op het leerplan zonder jaar, met volgtKader en de vingerafdruk van de sets in het leerplan', () => {
    const kader = testKader();
    const oudeAfdrukken = { ODS_9101: '0'.repeat(16), ODS_9104: '1'.repeat(16) };
    const r = leerplanVoorRichting(kader, BESTANDEN, { ...DOELGROEP, kader: 'f'.repeat(64), setAfdrukken: oudeAfdrukken }, { sets: ['ODS_9101', 'ODS_9102'] });
    const dg = r.leerplan.doelgroep!;
    expect(DOELGROEP.jaar).toBe(4);
    expect(dg.jaar).toBeUndefined();
    expect(dg.groep).toBe('G-0100');
    expect(dg.graad).toBe(2);
    expect(dg.vak).toBe('Biologie');
    expect(dg.volgtKader).toBe(true);
    expect(dg.kader).toBe(kaderVingerafdruk(kader, ['ODS_9101', 'ODS_9102']));
    expect(dg.kader).not.toBe('f'.repeat(64));
    expect(dg.kaderVolledig).toBe(volledigeSetsVingerafdruk(kader, ['ODS_9101', 'ODS_9102']));
    // Sinds fase 2 ook een afdruk per set, voor precies de sets van het leerplan; wat de invoer meebracht, telt niet.
    expect(dg.setAfdrukken).toStrictEqual(afdrukkenPerSet(kader, ['ODS_9101', 'ODS_9102']));
    expect(Object.keys(dg.setAfdrukken!)).toEqual(['ODS_9101', 'ODS_9102']);
    // Het leerplan telt de nakijkstatus nog steeds: de doelgroep zit niet in de vingerafdruk van de doelen.
    expect(effectieveStatus(r.leerplan)).toBe('gecontroleerd');
  });

  it('de vingerafdruk gaat over de sets die echt in het leerplan zitten (niet over de uitbreidingsset, niet over een set zonder doelen)', () => {
    const kader = testKader();
    // Een deelset waarvan de nummers niet meer in het (wel geladen) bestand staan: de rest van het leerplan blijft bevestigd.
    const bioVerdwenen = testKader({ bioIds: ['b98', 'b99'] });
    const r = leerplanVoorRichting(bioVerdwenen, BESTANDEN, DOELGROEP);
    expect(r.bevestigd).toBe(true);
    expect(r.ontbrekendeSets).toEqual([]);
    expect(r.ontbrekend).toEqual([{ set: 'ODS_9101', ids: ['b98', 'b99'] }]);
    expect(setsVan(r.leerplan)).toEqual(['ODS_9102', 'ODS_9103', 'ODS_9104']);
    expect(r.leerplan.doelgroep?.kader).toBe(kaderVingerafdruk(bioVerdwenen, setsVan(r.leerplan)));
    // De afdrukken per set: precies de sets die echt in het leerplan zitten (Biologie leverde geen doel op).
    expect(Object.keys(r.leerplan.doelgroep?.setAfdrukken ?? {})).toEqual(['ODS_9102', 'ODS_9103', 'ODS_9104']);
    expect(r.leerplan.doelgroep?.setAfdrukken).toStrictEqual(afdrukkenPerSet(bioVerdwenen, setsVan(r.leerplan)));
    // Dus meteen na het maken is er niets veranderd.
    expect(vergelijkMetKader(r.leerplan, bioVerdwenen)).toEqual({ nieuw: 0, vervallen: 0, setsNietMeerInKader: [] });
    const gewoon = leerplanVoorRichting(kader, BESTANDEN, DOELGROEP);
    expect(vergelijkMetKader(gewoon.leerplan, kader)).toEqual({ nieuw: 0, vervallen: 0, setsNietMeerInKader: [] });
    const metUitbreiding = leerplanVoorRichting(kader, BESTANDEN, DOELGROEP, { ookUitbreiding: true });
    expect(setsVan(metUitbreiding.leerplan)).toContain('ODS_9105');
    expect(metUitbreiding.leerplan.goals).toHaveLength(26);
    expect(metUitbreiding.leerplan.doelgroep?.kader).toBe(kaderVingerafdruk(kader, setsVan(metUitbreiding.leerplan)));
    expect(Object.keys(metUitbreiding.leerplan.doelgroep?.setAfdrukken ?? {})).toEqual([...setsVan(metUitbreiding.leerplan)].sort());
    expect(Object.keys(metUitbreiding.leerplan.doelgroep?.setAfdrukken ?? {})).toContain('ODS_9105');
    expect(vergelijkMetKader(metUitbreiding.leerplan, kader)).toEqual({ nieuw: 0, vervallen: 0, setsNietMeerInKader: [] });
  });

  it('een uitbreidingsset komt er met ookUitbreiding in, of als ze uitdrukkelijk in sets staat; anders niet', () => {
    // Niet gevraagd: geen uitbreidingsset, en een kader met alleen een uitbreidingsset geeft dus geen leerplan.
    const alleenUitbreiding = maakKader([kaderSet(UITBREIDING, 'alle', { verplicht: false })]);
    const niet = leerplanVoorRichting(alleenUitbreiding, BESTANDEN, DOELGROEP);
    expect(niet.bevestigd).toBe(false);
    expect(niet.leerplan.goals).toHaveLength(0);
    expect(niet.waarschuwingen[0]).toBe('Kies minstens één doel.');
    expect(niet.ontbrekendeSets).toEqual([]);
    expect(setsVan(leerplanVoorRichting(testKader(), BESTANDEN, DOELGROEP).leerplan)).not.toContain('ODS_9105');
    // Met de vraag, of uitdrukkelijk in `sets`: de uitbreidingsset zit erin.
    for (const opties of [{ sets: ['ODS_9105'], ookUitbreiding: true }, { sets: ['ODS_9105'] }, { ookUitbreiding: true, sets: ['ODS_9105', 'ODS_9101'] }]) {
      const met = leerplanVoorRichting(testKader(), BESTANDEN, DOELGROEP, opties);
      expect(met.bevestigd).toBe(true);
      expect(setsVan(met.leerplan)).toContain('ODS_9105');
      expect(met.leerplan.goals.length).toBe(opties.sets.includes('ODS_9101') ? 7 : 3);
    }
  });

  it('sets blijft een beperking: een uitbreidingsset die niet in sets staat, komt er niet in, ook niet met ookUitbreiding', () => {
    const r = leerplanVoorRichting(testKader(), BESTANDEN, DOELGROEP, { sets: ['ODS_9101'], ookUitbreiding: true });
    expect(setsVan(r.leerplan)).toEqual(['ODS_9101']);
  });

  it('nummers uit de koppeling die niet meer in het bestand staan: ze gaan in ontbrekend en in een waarschuwing, de rest blijft', () => {
    const kader = testKader({ bioIds: ['b2', 'b5', 'b7', 'b99', 'b98'] });
    const r = leerplanVoorRichting(kader, BESTANDEN, DOELGROEP, { sets: ['ODS_9101'] });
    expect(r.bevestigd).toBe(true);
    expect(refIds(r.leerplan)).toEqual(['b2', 'b5', 'b7']);
    expect(r.ontbrekend).toEqual([{ set: 'ODS_9101', ids: ['b98', 'b99'] }]);
    expect(laatste(r.waarschuwingen)).toBe('2 doelen uit de koppeling staan niet meer in de huidige versie van de set. De koppeling wordt elke maand bijgewerkt.');
    const een = leerplanVoorRichting(testKader({ bioIds: ['b2', 'b99'] }), BESTANDEN, DOELGROEP, { sets: ['ODS_9101'] });
    expect(laatste(een.waarschuwingen)).toBe('1 doel uit de koppeling staat niet meer in de huidige versie van de set. De koppeling wordt elke maand bijgewerkt.');
  });

  describe('een gevraagde set zonder bruikbaar setbestand valt niet stil weg', () => {
    const zonder = (...ids: string[]) => {
      const m = new Map(BESTANDEN);
      for (const id of ids) m.delete(id);
      return m;
    };

    it('de set staat in ontbrekendeSets, de eerste waarschuwing noemt ze in gewone taal, en het leerplan is niet bevestigd', () => {
      const r = leerplanVoorRichting(testKader(), zonder('ODS_9102'), DOELGROEP);
      expect(r.ontbrekendeSets).toEqual(['ODS_9102']);
      expect(r.waarschuwingen[0]).toBe('De set "Chemie" kon niet geladen worden. Probeer opnieuw.');
      expect(r.waarschuwingen[0]).not.toMatch(/ODS_/);
      expect(r.bevestigd).toBe(false);
      // De rest van het leerplan is er wel, maar zonder nakijkstatus: een lijst zonder de set is niet wat gekozen werd.
      expect(r.leerplan.goals).toHaveLength(18);
      expect(setsVan(r.leerplan)).toEqual(['ODS_9101', 'ODS_9103', 'ODS_9104']);
      expect(effectieveStatus(r.leerplan)).not.toBe('gecontroleerd');
      expect(r.leerplan.controle).toBeUndefined();
    });

    it('met alle bestanden is ontbrekendeSets leeg en blijft het leerplan bevestigd', () => {
      const r = leerplanVoorRichting(testKader(), BESTANDEN, DOELGROEP);
      expect(r.ontbrekendeSets).toEqual([]);
      expect(r.bevestigd).toBe(true);
      expect(r.leerplan.controle?.status).toBe('gecontroleerd');
    });

    it('meer ontbrekende sets: een waarschuwing per set, vooraan, in de volgorde van het kader', () => {
      const r = leerplanVoorRichting(testKader(), zonder('ODS_9104', 'ODS_9101'), DOELGROEP);
      expect(r.ontbrekendeSets).toEqual(['ODS_9101', 'ODS_9104']);
      expect(r.waarschuwingen.slice(0, 2)).toEqual([
        'De set "Biologie" kon niet geladen worden. Probeer opnieuw.',
        'De set "Competenties in het Nederlands" kon niet geladen worden. Probeer opnieuw.',
      ]);
      expect(r.bevestigd).toBe(false);
    });

    it('zijn alle bestanden weg, dan staat de oorzaak vooraan en niet "Kies minstens één doel."', () => {
      const r = leerplanVoorRichting(testKader(), new Map(), DOELGROEP);
      expect(r.bevestigd).toBe(false);
      expect(r.leerplan.goals).toHaveLength(0);
      expect(r.ontbrekendeSets).toEqual(['ODS_9101', 'ODS_9102', 'ODS_9103', 'ODS_9104']);
      expect(r.waarschuwingen[0]).toBe('De set "Biologie" kon niet geladen worden. Probeer opnieuw.');
    });

    it('alleen sets die gevraagd zijn tellen: een ontbrekend bestand van een niet gekozen set, of van een uitbreidingsset zonder vraag, geeft niets', () => {
      expect(leerplanVoorRichting(testKader(), zonder('ODS_9102'), DOELGROEP, { sets: ['ODS_9101'] }).ontbrekendeSets).toEqual([]);
      const zonderUitbreiding = leerplanVoorRichting(testKader(), zonder('ODS_9105'), DOELGROEP);
      expect(zonderUitbreiding.ontbrekendeSets).toEqual([]);
      expect(zonderUitbreiding.bevestigd).toBe(true);
      const met = leerplanVoorRichting(testKader(), zonder('ODS_9105'), DOELGROEP, { ookUitbreiding: true });
      expect(met.ontbrekendeSets).toEqual(['ODS_9105']);
      expect(met.bevestigd).toBe(false);
    });

    it('een volledige set waarvan het bestand geen bruikbaar doel heeft, telt ook als niet geladen', () => {
      const leeg = maakBestand('ODS_9101', `${NAAM_BEGIN} -  Biologie - Cesuurdoelen`, 'Biologie', [doel('b1', 'B01', '   ')]);
      const r = leerplanVoorRichting(maakKader([kaderSet(BIO, 'alle'), kaderSet(CHEMIE, 'alle')]), new Map([['ODS_9101', leeg], ['ODS_9102', CHEMIE]]), DOELGROEP);
      expect(r.ontbrekendeSets).toEqual(['ODS_9101']);
      expect(r.bevestigd).toBe(false);
    });

    it('bij bijwerken blijft het bestaande leerplan onaangeroerd en is het resultaat niet bevestigd', () => {
      const eerste = leerplanVoorRichting(testKader(), BESTANDEN, DOELGROEP, { sets: ['ODS_9101', 'ODS_9102'] });
      const voor = JSON.stringify(eerste.leerplan);
      const nu = leerplanVoorRichting(testKader(), zonder('ODS_9102'), DOELGROEP, { sets: ['ODS_9101', 'ODS_9102'], bestaand: eerste.leerplan });
      expect(nu.bevestigd).toBe(false);
      expect(nu.ontbrekendeSets).toEqual(['ODS_9102']);
      expect(nu.waarschuwingen[0]).toBe('De set "Chemie" kon niet geladen worden. Probeer opnieuw.');
      expect(JSON.stringify(eerste.leerplan)).toBe(voor);
    });
  });

  it('titel, vak en oudeVersies gaan naar het leerplan', () => {
    const r = leerplanVoorRichting(testKader(), BESTANDEN, DOELGROEP, {
      sets: ['ODS_9102'], titel: 'Chemie voor de testrichting', vak: 'Chemie', oudeVersies: new Set(['ODS_9102']),
    });
    expect(r.leerplan.title).toBe('Chemie voor de testrichting');
    expect(r.leerplan.subject).toBe('Chemie');
    expect(r.waarschuwingen.some((w) => /oudere versie/.test(w))).toBe(true);
  });

  it('bijwerken met bestaand: zelfde id, de bestaande codes blijven en een nieuw doel krijgt een nieuwe code', () => {
    const eerste = leerplanVoorRichting(testKader(), BESTANDEN, DOELGROEP, { sets: ['ODS_9101'] });
    const kaderNu = testKader({ bioIds: [...BIO_KOPPELING, 'b12'] });
    const nu = leerplanVoorRichting(kaderNu, BESTANDEN, DOELGROEP, { sets: ['ODS_9101'], bestaand: eerste.leerplan });
    expect(nu.bevestigd).toBe(true);
    expect(nu.leerplan.id).toBe(eerste.leerplan.id);
    expect(nu.leerplan.createdAt).toBe(eerste.leerplan.createdAt);
    expect(nu.leerplan.goals).toHaveLength(5);
    expect(codesVan(nu.leerplan).slice(0, 4)).toEqual(codesVan(eerste.leerplan));
    expect(nu.leerplan.doelgroep?.kader).toBe(kaderVingerafdruk(kaderNu, ['ODS_9101']));
    expect(nu.leerplan.doelgroep?.kader).not.toBe(eerste.leerplan.doelgroep?.kader);
  });

  describe('bijwerken van een leerplan met een uitbreidingsset', () => {
    const UITBREIDING_2 = maakBestand('ODS_9106', `${NAAM_DOORSTROOM} -  Competenties in het Nederlands - Verdiepingsdoelen`,
      'Competenties in het Nederlands (verdieping)', reeks('v', 'V', 2));
    const ALLE = new Map([...BESTANDEN, ['ODS_9106', UITBREIDING_2]]);
    const kaderMet = (bioIds: string[]) => maakKader([
      kaderSet(BIO, bioIds), kaderSet(CHEMIE, 'alle'), kaderSet(STEM, 'alle'), kaderSet(NEDERLANDS, 'alle'),
      kaderSet(UITBREIDING, 'alle', { verplicht: false }), kaderSet(UITBREIDING_2, 'alle', { verplicht: false }),
    ]);
    const eerste = leerplanVoorRichting(kaderMet(BIO_KOPPELING), ALLE, DOELGROEP, { sets: ['ODS_9101', 'ODS_9105'] });
    const kaderNu = kaderMet([...BIO_KOPPELING, 'b12']);

    it('zonder sets of ookUitbreiding: de uitbreidingsset van het leerplan blijft, en de codes ook', () => {
      expect(setsVan(eerste.leerplan)).toEqual(['ODS_9101', 'ODS_9105']);
      const nu = leerplanVoorRichting(kaderNu, ALLE, DOELGROEP, { bestaand: eerste.leerplan });
      expect(nu.bevestigd).toBe(true);
      expect(nu.leerplan.id).toBe(eerste.leerplan.id);
      expect(setsVan(nu.leerplan)).toContain('ODS_9105');
      // De uitbreidingsset die het leerplan niet had, komt er niet ongevraagd bij.
      expect(setsVan(nu.leerplan)).not.toContain('ODS_9106');
      // Bio kreeg b12 erbij, Chemie, STEM en Nederlands zijn de verplichte sets die er nu ook bij komen.
      const code = (cur: Curriculum, set: string) => cur.goals.filter((g) => g.refs?.[0].set === set).map((g) => [g.refs?.[0].id, g.code]);
      expect(code(nu.leerplan, 'ODS_9105')).toEqual(code(eerste.leerplan, 'ODS_9105'));
      expect(code(nu.leerplan, 'ODS_9101').slice(0, 4)).toEqual(code(eerste.leerplan, 'ODS_9101'));
      expect(new Set(codesVan(nu.leerplan)).size).toBe(nu.leerplan.goals.length);
    });

    it('met de sets van het leerplan (zoals het scherm bijwerkt): de uitbreidingsset blijft, en de codes ook', () => {
      const nu = leerplanVoorRichting(kaderNu, ALLE, DOELGROEP, { bestaand: eerste.leerplan, sets: setsVan(eerste.leerplan) });
      expect(nu.bevestigd).toBe(true);
      expect(setsVan(nu.leerplan)).toEqual(['ODS_9101', 'ODS_9105']);
      expect(nu.leerplan.goals).toHaveLength(eerste.leerplan.goals.length + 1);
      const codesEerst = new Map(eerste.leerplan.goals.map((g) => [`${g.refs?.[0].set}|${g.refs?.[0].id}`, g.code]));
      for (const g of nu.leerplan.goals) {
        const vroeger = codesEerst.get(`${g.refs?.[0].set}|${g.refs?.[0].id}`);
        if (vroeger !== undefined) expect(g.code).toBe(vroeger);
      }
      expect(nu.leerplan.doelgroep?.kader).toBe(kaderVingerafdruk(kaderNu, ['ODS_9101', 'ODS_9105']));
    });

    it('bijwerken laat de uitbreidingsset alleen weg als de aanroeper ze uit sets laat', () => {
      const nu = leerplanVoorRichting(kaderNu, ALLE, DOELGROEP, { bestaand: eerste.leerplan, sets: ['ODS_9101'] });
      expect(setsVan(nu.leerplan)).toEqual(['ODS_9101']);
    });

    it('met ookUitbreiding komen alle uitbreidingssets mee, ook zonder bestaand', () => {
      expect(setsVan(leerplanVoorRichting(kaderNu, ALLE, DOELGROEP, { bestaand: eerste.leerplan, ookUitbreiding: true }).leerplan)).toContain('ODS_9106');
      expect(setsVan(leerplanVoorRichting(kaderNu, ALLE, DOELGROEP, { ookUitbreiding: true }).leerplan)).toEqual(expect.arrayContaining(['ODS_9105', 'ODS_9106']));
    });

    it('een leerplan zonder uitbreidingsset blijft er zonder, ook als het kader er een heeft', () => {
      const gewoon = leerplanVoorRichting(kaderMet(BIO_KOPPELING), ALLE, DOELGROEP, { sets: ['ODS_9101'] });
      const nu = leerplanVoorRichting(kaderNu, ALLE, DOELGROEP, { bestaand: gewoon.leerplan, sets: ['ODS_9101'] });
      expect(setsVan(nu.leerplan)).toEqual(['ODS_9101']);
    });
  });

  it('bijwerken van iets dat geen samengesteld leerplan is, gooit een fout', () => {
    const net = createCurriculum({
      title: 'Van een net', net: 'go', subject: 'Biologie', level: '',
      goals: [{ id: 'x', code: 'B1', text: 'Iets.' }], herkomst: { methode: 'pdf', ingelezenOp: 1 },
    });
    expect(() => leerplanVoorRichting(testKader(), BESTANDEN, DOELGROEP, { bestaand: net })).toThrow();
  });

  it('een ongeldige doelgroep geeft een leerplan zonder doelgroep, zonder fout', () => {
    const r = leerplanVoorRichting(testKader(), BESTANDEN, { groep: 'kapot' } as unknown as Doelgroep, { sets: ['ODS_9102'] });
    expect(r.bevestigd).toBe(true);
    expect(r.leerplan.doelgroep).toBeUndefined();
  });
});

// ── selectieVanKeuzes en vindLeerplanMetSelectie ────────────────────────────

describe('selectieVanKeuzes', () => {
  it("'alle' wordt de lijst van alle bruikbare doelen, een lijst blijft een lijst in de volgorde van de set", () => {
    const sel = selectieVanKeuzes([
      { bestand: BIO, doelen: ['b11', 'b2', 'onbekend', 'b5'] },
      { bestand: CHEMIE, doelen: 'alle' },
    ]);
    expect([...sel.keys()]).toEqual(['ODS_9101', 'ODS_9102']);
    expect(sel.get('ODS_9101')).toEqual(['b2', 'b5', 'b11']);
    expect(sel.get('ODS_9102')).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
  });

  it("dezelfde set twee keer telt één keer, 'alle' wint, en een set zonder doelen telt niet", () => {
    const sel = selectieVanKeuzes([
      { bestand: BIO, doelen: ['b1'] },
      { bestand: CHEMIE, doelen: [] },
      { bestand: BIO, doelen: 'alle' },
    ]);
    expect([...sel.keys()]).toEqual(['ODS_9101']);
    expect(sel.get('ODS_9101')).toHaveLength(13);
  });

  it('doelen zonder tekst of zonder vast nummer doen niet mee, net als in leerplanUitSelectie', () => {
    const b = maakBestand('ODS_9201', `${NAAM_BEGIN} -  Test - Cesuurdoelen`, 'Test', [
      doel('t1', 'T01', 'Eerste.'), doel('t2', 'T02', '   '), { code: 'T03', tekst: 'Zonder nummer.' }, doel('t4', 'T04', 'Vierde.'),
    ]);
    const sel = selectieVanKeuzes([{ bestand: b, doelen: 'alle' }]);
    expect(sel.get('ODS_9201')).toEqual(['t1', 't4']);
    const r = leerplanUitSelectie([{ bestand: b, doelen: 'alle' }], { titel: 'T' });
    expect(selectieVanLeerplan(r.leerplan).get('ODS_9201')).toEqual(['t1', 't4']);
  });

  it('is gelijk aan de selectie van het leerplan dat eruit volgt', () => {
    const { keuzes } = naarSetKeuzes(selectieVanKader(testKader()), BESTANDEN);
    const r = leerplanUitSelectie(keuzes, { titel: 'X' });
    expect(selectieVanKeuzes(keuzes)).toEqual(selectieVanLeerplan(r.leerplan));
  });
});

describe('vindLeerplanMetSelectie', () => {
  const kader = testKader();
  const maak = (opties: Parameters<typeof leerplanVoorRichting>[3] = {}) => leerplanVoorRichting(kader, BESTANDEN, DOELGROEP, opties).leerplan;
  const bio = maak({ sets: ['ODS_9101'] });
  const chemie = maak({ sets: ['ODS_9102'] });
  const beide = maak({ sets: ['ODS_9101', 'ODS_9102'] });
  const selectieBio = () => selectieVanKeuzes(naarSetKeuzes(selectieVanKader(kader, { sets: ['ODS_9101'] }), BESTANDEN).keuzes);

  it('vindt het leerplan met precies deze selectie', () => {
    expect(vindLeerplanMetSelectie([chemie, bio, beide], selectieBio())).toBe(bio);
  });

  it('let niet op de volgorde van de sets of van de nummers', () => {
    const omgekeerd = new Map<string, string[]>([
      ['ODS_9102', ['c5', 'c4', 'c3', 'c2', 'c1']],
      ['ODS_9101', ['b11', 'b7', 'b5', 'b2']],
    ]);
    expect(vindLeerplanMetSelectie([bio, chemie, beide], omgekeerd)).toBe(beide);
  });

  it('een selectie met meer of minder nummers geeft niets', () => {
    expect(vindLeerplanMetSelectie([bio], new Map([['ODS_9101', [...BIO_KOPPELING, 'b12']]]))).toBeUndefined();
    expect(vindLeerplanMetSelectie([bio], new Map([['ODS_9101', BIO_KOPPELING.slice(0, 3)]]))).toBeUndefined();
    expect(vindLeerplanMetSelectie([beide], selectieBio())).toBeUndefined();
    expect(vindLeerplanMetSelectie([bio], new Map([['ODS_9101', BIO_KOPPELING], ['ODS_9102', ['c1']]]))).toBeUndefined();
  });

  it('evenveel nummers maar andere nummers geeft niets (ook bij een andere set met evenveel)', () => {
    expect(BIO_KOPPELING).toHaveLength(4);
    expect(vindLeerplanMetSelectie([bio], new Map([['ODS_9101', ['b1', 'b3', 'b4', 'b6']]]))).toBeUndefined();
    // Eén nummer anders: nog altijd evenveel, maar niet hetzelfde leerplan.
    expect(vindLeerplanMetSelectie([bio], new Map([['ODS_9101', ['b2', 'b5', 'b7', 'b12']]]))).toBeUndefined();
    // Dezelfde nummers in een andere set.
    expect(vindLeerplanMetSelectie([bio], new Map([['ODS_9102', BIO_KOPPELING]]))).toBeUndefined();
    // En de juiste nummers vindt het wel.
    expect(vindLeerplanMetSelectie([bio], new Map([['ODS_9101', ['b11', 'b7', 'b5', 'b2']]]))).toBe(bio);
  });

  it('slaat een leerplan over dat niet nagekeken is: het volgende dat past, of niets', () => {
    const gewijzigd: Curriculum = { ...bio, goals: bio.goals.map((g, i) => (i === 0 ? { ...g, text: `${g.text} (aangepast)` } : g)) };
    expect(effectieveStatus(gewijzigd)).not.toBe('gecontroleerd');
    const zonderStatus: Curriculum = { ...bio, controle: undefined };
    expect(effectieveStatus(zonderStatus)).not.toBe('gecontroleerd');
    expect(vindLeerplanMetSelectie([gewijzigd], selectieBio())).toBeUndefined();
    expect(vindLeerplanMetSelectie([zonderStatus], selectieBio())).toBeUndefined();
    expect(vindLeerplanMetSelectie([gewijzigd, zonderStatus, bio], selectieBio())).toBe(bio);
    expect(effectieveStatus(bio)).toBe('gecontroleerd');
  });

  describe('met een doelgroep', () => {
    const andere: Doelgroep = { ...DOELGROEP, groep: 'G-0200', titel: 'Andere richting' };
    const vanAndere = leerplanVoorRichting(kader, BESTANDEN, andere, { sets: ['ODS_9101'] }).leerplan;
    const zonderGroep: Curriculum = { ...bio, doelgroep: undefined };

    it('slaat een leerplan van een andere groep over, ook als de selectie klopt', () => {
      expect(vanAndere.doelgroep?.groep).toBe('G-0200');
      expect(selectieVanLeerplan(vanAndere)).toEqual(selectieVanLeerplan(bio));
      expect(vindLeerplanMetSelectie([vanAndere], selectieBio(), DOELGROEP)).toBeUndefined();
      expect(vindLeerplanMetSelectie([vanAndere, bio], selectieBio(), DOELGROEP)).toBe(bio);
      expect(vindLeerplanMetSelectie([bio, vanAndere], selectieBio(), andere)).toBe(vanAndere);
    });

    it('hetzelfde leerplan van dezelfde groep wordt gevonden', () => {
      expect(vindLeerplanMetSelectie([bio], selectieBio(), DOELGROEP)).toBe(bio);
      expect(vindLeerplanMetSelectie([bio], selectieBio(), { ...DOELGROEP, jaar: 3, vak: 'Chemie' })).toBe(bio);
    });

    it('heeft het leerplan of de gevraagde doelgroep er geen, dan telt de groep niet', () => {
      expect(vindLeerplanMetSelectie([zonderGroep], selectieBio(), DOELGROEP)).toBe(zonderGroep);
      expect(vindLeerplanMetSelectie([vanAndere], selectieBio())).toBe(vanAndere);
      expect(vindLeerplanMetSelectie([vanAndere], selectieBio(), undefined)).toBe(vanAndere);
      expect(vindLeerplanMetSelectie([vanAndere], selectieBio(), { groep: 'kapot' } as unknown as Doelgroep)).toBe(vanAndere);
      const kapot = { ...bio, doelgroep: { groep: 'kapot' } } as unknown as Curriculum;
      expect(vindLeerplanMetSelectie([kapot], selectieBio(), DOELGROEP)).toBe(kapot);
    });
  });

  it('geeft nooit een eigen kopie terug, ook niet als de selectie klopt', () => {
    const kopie = maakEigenKopie(bio);
    expect(selectieVanLeerplan(kopie).get('ODS_9101')).toEqual(BIO_KOPPELING);
    expect(vindLeerplanMetSelectie([kopie], selectieBio())).toBeUndefined();
    expect(vindLeerplanMetSelectie([kopie, bio], selectieBio())).toBe(bio);
  });

  it('geeft geen leerplan dat niet samengesteld is', () => {
    const officieel: Curriculum = { ...bio, herkomst: { methode: 'officieel', ingelezenOp: 1 } };
    const pdf: Curriculum = { ...bio, herkomst: { methode: 'pdf', ingelezenOp: 1 } };
    const zonder: Curriculum = { ...bio, herkomst: undefined };
    expect(vindLeerplanMetSelectie([officieel, pdf, zonder], selectieBio())).toBeUndefined();
  });

  it('een lege selectie, of een selectie zonder nummers, geeft nooit een leerplan', () => {
    const leeg = createCurriculum({ title: 'Leeg', net: 'minimumdoelen', subject: '', level: '', goals: [], herkomst: { methode: 'samengesteld', ingelezenOp: 1 } });
    expect(vindLeerplanMetSelectie([leeg, bio], new Map())).toBeUndefined();
    expect(vindLeerplanMetSelectie([leeg, bio], new Map([['ODS_9101', []]]))).toBeUndefined();
  });

  it('bij dubbels de eerste, en een lege lijst met leerplannen geeft niets', () => {
    const dubbel = maak({ sets: ['ODS_9101'] });
    expect(vindLeerplanMetSelectie([dubbel, bio], selectieBio())).toBe(dubbel);
    expect(vindLeerplanMetSelectie([], selectieBio())).toBeUndefined();
  });
});

// ── vakVoorstel ─────────────────────────────────────────────────────────────

describe('vakVoorstel', () => {
  const kader = testKader();

  it("Biologie: de Biologie-set in 'sets', de STEM-set apart in 'stemSets'", () => {
    expect(vakVoorstel(kader, 'Biologie')).toEqual({ sets: ['ODS_9101'], stemSets: ['ODS_9103'] });
  });

  it('een STEM-set zit nooit in sets, ook niet voor een vak dat de STEM-set zelf noemt', () => {
    for (const vak of ['Biologie', 'Chemie', 'Fysica', 'Wiskunde', 'Natuurwetenschappen', 'STEM', 'Techniek']) {
      const v = vakVoorstel(kader, vak);
      expect(v.sets, vak).not.toContain('ODS_9103');
      expect(v.stemSets, vak).toEqual(['ODS_9103']);
    }
  });

  describe('de officiële STEM-sets heten "STEM" en vallen niet onder de sleutelcompetentie (isStemSet)', () => {
    const CESUUR = maakBestand('ODS_9301', `${NAAM_BEGIN} -  STEM - Cesuurdoelen`, 'STEM', reeks('t', 'T', 6));
    const EINDTERMEN = maakBestand('ODS_9302', 'Secundair onderwijs 3de graad -  STEM - Specifieke eindtermen', 'STEM', reeks('e', 'E', 4));
    const MET_ACCENT = maakBestand('ODS_9303', `${NAAM_BEGIN} -  Stém – natuur - Cesuurdoelen`, 'Stém', reeks('a', 'A', 3));
    const STEMVORMING = maakBestand('ODS_9304', `${NAAM_BEGIN} -  Stemvorming - Cesuurdoelen`, 'Stemvorming', reeks('m', 'M', 3));
    const SYSTEEM = maakBestand('ODS_9305', `${NAAM_BEGIN} -  Systeemdenken - Cesuurdoelen`, 'Systeemdenken', reeks('y', 'Y', 3));
    const kaderMetStem = maakKader([
      kaderSet(BIO, BIO_KOPPELING), kaderSet(CESUUR, ['t1', 't2']), kaderSet(EINDTERMEN, 'alle'), kaderSet(MET_ACCENT, 'alle'),
      kaderSet(STEMVORMING, 'alle'), kaderSet(SYSTEEM, 'alle'), kaderSet(STEM, 'alle'),
    ]);

    it('geen van de officiële sets wordt door isStemSet herkend: daarom herkent vakVoorstel ze zelf', () => {
      for (const b of [CESUUR, EINDTERMEN, MET_ACCENT]) expect(isStemSet(b.set)).toBe(false);
    });

    it('"STEM - Cesuurdoelen" en "STEM - Specifieke eindtermen" staan in stemSets en nooit in sets', () => {
      for (const vak of ['Biologie', 'Chemie', 'Fysica', 'Natuurwetenschappen', 'Techniek', 'Wiskunde']) {
        const v = vakVoorstel(kaderMetStem, vak);
        expect(v.stemSets, vak).toEqual(expect.arrayContaining(['ODS_9301', 'ODS_9302', 'ODS_9103']));
        expect(v.sets, vak).not.toContain('ODS_9301');
        expect(v.sets, vak).not.toContain('ODS_9302');
        expect(v.sets, vak).not.toContain('ODS_9103');
      }
    });

    it('het woord STEM telt als los woord, zonder accenten en zonder op hoofdletters te letten', () => {
      const v = vakVoorstel(kaderMetStem, 'STEM');
      expect(v.stemSets).toEqual(['ODS_9301', 'ODS_9302', 'ODS_9303', 'ODS_9103']);
      expect(v.sets).toEqual([]);
    });

    it('"Stemvorming" en "Systeemdenken" bevatten STEM niet als los woord: ze blijven gewone sets', () => {
      const v = vakVoorstel(kaderMetStem, 'Stemvorming');
      expect(v.sets).toEqual(['ODS_9304']);
      expect(v.stemSets).not.toContain('ODS_9304');
      expect(vakVoorstel(kaderMetStem, 'Systeemdenken')).toEqual({ sets: ['ODS_9305'], stemSets: [] });
    });

    it('een STEM-set die niet verplicht is, komt in geen van beide lijsten', () => {
      const uitbreiding = maakKader([kaderSet(BIO, BIO_KOPPELING), kaderSet(CESUUR, 'alle', { verplicht: false })]);
      expect(vakVoorstel(uitbreiding, 'Biologie')).toEqual({ sets: ['ODS_9101'], stemSets: [] });
    });
  });

  it('Chemie: de Chemie-set en de STEM-set; Nederlands: alleen de verplichte Nederlandse set, niet de uitbreidingsset', () => {
    expect(vakVoorstel(kader, 'chemie')).toEqual({ sets: ['ODS_9102'], stemSets: ['ODS_9103'] });
    expect(vakVoorstel(kader, 'Nederlands')).toEqual({ sets: ['ODS_9104'], stemSets: [] });
  });

  it('de volgorde is die van het kader, en de ids zijn sets uit het kader', () => {
    const omgekeerd = maakKader([kaderSet(NEDERLANDS, 'alle'), kaderSet(BIO, BIO_KOPPELING)]);
    expect(vakVoorstel(omgekeerd, 'Biologie nederlands').sets).toEqual(['ODS_9104', 'ODS_9101']);
  });

  it('zonder vak, met alleen spaties of met een vak dat niets vindt, is het voorstel leeg', () => {
    expect(vakVoorstel(kader, '')).toEqual({ sets: [], stemSets: [] });
    expect(vakVoorstel(kader, '   ')).toEqual({ sets: [], stemSets: [] });
    expect(vakVoorstel(kader, 'Muziek')).toEqual({ sets: [], stemSets: [] });
  });

  it('is een hulp bij het zoeken: het voorstel volgt setNoemtVak en verzint niets', () => {
    for (const k of kader.sets) {
      const v = vakVoorstel(kader, 'Biologie');
      const erin = v.sets.includes(k.set.id) || v.stemSets.includes(k.set.id);
      expect(erin).toBe(k.verplicht && setNoemtVak(k.set, 'Biologie'));
    }
  });
});

// ── Titels ──────────────────────────────────────────────────────────────────

describe('voorstelCursusTitel', () => {
  it('vak, richting en jaar', () => {
    expect(voorstelCursusTitel(DOELGROEP)).toBe('Biologie · Testrichting · 4de jaar');
    expect(voorstelCursusTitel({ ...DOELGROEP, vak: undefined })).toBe('Testrichting · 4de jaar');
    expect(voorstelCursusTitel({ ...DOELGROEP, vak: undefined, jaar: undefined })).toBe('Testrichting · 2de graad');
    expect(voorstelCursusTitel({ ...DOELGROEP, vak: undefined, soort: 'buso' })).toBe('Testrichting · 4de jaar · buitengewoon (OV4)');
  });

  it('in de 1ste graad staat het leerjaar al in de titel van de richting', () => {
    const d = doelgroepVan(INFO_1A, { groep: 'G-0300', soort: 'so', jaar: 1 }, { vak: 'Nederlands' });
    expect(voorstelCursusTitel(d)).toBe('Nederlands · Eerste leerjaar A');
  });

  it('is gelijk aan de ondertitel van doelgroepTekst, hoogstens 120 tekens, en leeg voor een ongeldige doelgroep', () => {
    expect(voorstelCursusTitel(DOELGROEP)).toBe(doelgroepTekst(DOELGROEP));
    const lang = voorstelCursusTitel({ ...DOELGROEP, titel: 'T'.repeat(160), vak: 'V'.repeat(80) });
    expect(lang.length).toBeLessThanOrEqual(120);
    expect(voorstelCursusTitel({ groep: 'kapot' } as unknown as Doelgroep)).toBe('');
  });
});

describe('titelVoorRichtingLeerplan', () => {
  const kader = testKader();

  it('alle sets: de richting en de graad', () => {
    expect(titelVoorRichtingLeerplan(INFO, kader)).toBe('Testrichting · 2de graad');
    expect(titelVoorRichtingLeerplan(INFO, kader, ['ODS_9101', 'ODS_9102', 'ODS_9103', 'ODS_9104'])).toBe('Testrichting · 2de graad');
  });

  it('met een vak, of met één set, komt de naam ervoor', () => {
    expect(titelVoorRichtingLeerplan(INFO, kader, undefined, 'Biologie')).toBe('Biologie · Testrichting · 2de graad');
    expect(titelVoorRichtingLeerplan(INFO, kader, ['ODS_9101', 'ODS_9102'], 'Natuur')).toBe('Natuur · Testrichting · 2de graad');
    expect(titelVoorRichtingLeerplan(INFO, kader, ['ODS_9101'])).toBe('Biologie · Testrichting · 2de graad');
    expect(titelVoorRichtingLeerplan(INFO, kader, ['ODS_9102'])).toBe('Chemie · Testrichting · 2de graad');
  });

  it('een deel van de sets: de eerste set van het kader en hoeveel andere', () => {
    expect(titelVoorRichtingLeerplan(INFO, kader, ['ODS_9104', 'ODS_9101', 'ODS_9102'])).toBe('Biologie en 2 andere · Testrichting · 2de graad');
    expect(titelVoorRichtingLeerplan(INFO, kader, ['ODS_9102', 'ODS_9103'])).toBe('Chemie en 1 andere · Testrichting · 2de graad');
  });

  it('een vak gaat voor op de sets, ook bij meer sets', () => {
    expect(titelVoorRichtingLeerplan(INFO, kader, ['ODS_9101', 'ODS_9102', 'ODS_9103'], '  Natuurwetenschappen  ')).toBe('Natuurwetenschappen · Testrichting · 2de graad');
  });

  it('een set die niet in het kader staat, telt niet', () => {
    expect(titelVoorRichtingLeerplan(INFO, kader, ['ODS_9101', 'ODS_0000'])).toBe('Biologie · Testrichting · 2de graad');
  });

  it('in de 1ste graad: de stroom en de graad, niet één leerjaar', () => {
    const kader1 = maakKader([kaderSet(NEDERLANDS, 'alle'), kaderSet(CHEMIE, 'alle')], { groep: 'G-0300', jaar: 1 });
    expect(titelVoorRichtingLeerplan(INFO_1A, kader1)).toBe('A-stroom · 1ste graad');
    expect(titelVoorRichtingLeerplan(INFO_1A, kader1, undefined, 'Nederlands')).toBe('Nederlands · A-stroom · 1ste graad');
    expect(titelVoorRichtingLeerplan(INFO_1A, kader1, ['ODS_9104'])).toBe('Competenties in het Nederlands · A-stroom · 1ste graad');
  });

  it('buitengewoon onderwijs krijgt een eigen titel, zodat het niet op het gewone leerplan lijkt', () => {
    const buso = maakKader(kader.sets, { soort: 'buso' });
    expect(titelVoorRichtingLeerplan(INFO, buso)).toBe('Testrichting · 2de graad · buitengewoon (OV4)');
    expect(titelVoorRichtingLeerplan(INFO, buso, undefined, 'Biologie')).toBe('Biologie · Testrichting · 2de graad · buitengewoon (OV4)');
  });

  it('een gekozen onderdeel geeft zijn titel', () => {
    expect(titelVoorRichtingLeerplan(INFO, maakKader(kader.sets, { onderdeel: 100 }))).toBe('Testrichting (variant) · 2de graad');
  });

  it('is hoogstens 120 tekens, ook met een lange richting, een lange setnaam of een lang vak', () => {
    const lang = richtingInfo(matrixVan([groepVan('G-0100', 'R'.repeat(160), [100])], [onderdeel(100, 'G-0100')]), 'G-0100', VANDAAG) as RichtingInfo;
    const titel = titelVoorRichtingLeerplan(lang, kader, undefined, 'V'.repeat(80));
    expect(titel.length).toBeLessThanOrEqual(120);
    expect(titel.endsWith(' · 2de graad')).toBe(true);
    expect(titel.startsWith('V')).toBe(true);
    const metSet = titelVoorRichtingLeerplan(lang, kader, ['ODS_9103']);
    expect(metSet.length).toBeLessThanOrEqual(120);
    expect(metSet.endsWith(' · 2de graad')).toBe(true);
  });
});

// ── leerplannenBijRichting ──────────────────────────────────────────────────

describe('leerplannenBijRichting', () => {
  const kader = testKader();
  const sleutels = new Set(kader.sets.flatMap((k) => k.ids.map((id) => `${k.set.id}|${id}`)));
  const metRefs = (id: string, titel: string, refs: [string, string][], doelgroep?: Doelgroep): Curriculum => createCurriculum({
    id, title: titel, net: 'minimumdoelen', subject: '', level: '',
    ...(doelgroep ? { doelgroep } : {}),
    goals: refs.map(([set, nr], i) => ({ id: `${id}${i}`, code: `${id}${i}`, text: 'Doel.', refs: [{ set, id: nr, code: nr }] })),
  });

  it('telt de verschillende doelen van het kader waarnaar het leerplan verwijst (set + vast nummer)', () => {
    const a = metRefs('a', 'A', [['ODS_9101', 'b2'], ['ODS_9101', 'b5'], ['ODS_9102', 'c1']]);
    const dubbel = metRefs('d', 'D', [['ODS_9101', 'b2'], ['ODS_9101', 'b2']]);
    const res = leerplannenBijRichting([a, dubbel], sleutels, 'G-0100');
    expect(res.map((r) => [r.curriculum.id, r.raakt, r.viaDoelgroep])).toEqual([['a', 3, false], ['d', 1, false]]);
  });

  it('een verwijzing met hetzelfde nummer in een andere set, of een nummer dat niet in het kader staat, telt niet', () => {
    const anders = metRefs('x', 'X', [['ODS_9999', 'b2'], ['ODS_9101', 'b1'], ['ODS_9101', 'b3']]);
    expect(leerplannenBijRichting([anders], sleutels, 'G-0100')).toEqual([]);
  });

  it('een leerplan met dezelfde doelgroep hoort erbij, ook zonder overlap; een andere groep zonder overlap niet', () => {
    const eigen = metRefs('e', 'E', [['ODS_9999', 'z1']], DOELGROEP);
    const andere = metRefs('f', 'F', [['ODS_9999', 'z1']], { ...DOELGROEP, groep: 'G-0200' });
    const zonder = metRefs('g', 'G', [['ODS_9999', 'z1']]);
    const res = leerplannenBijRichting([andere, eigen, zonder], sleutels, 'G-0100');
    expect(res).toEqual([{ curriculum: eigen, raakt: 0, viaDoelgroep: true }]);
  });

  it('sorteert op overlap, dan eerst wie bij de richting hoort, dan op titel', () => {
    const veel = metRefs('1', 'Veel', [['ODS_9101', 'b2'], ['ODS_9101', 'b5'], ['ODS_9102', 'c1'], ['ODS_9102', 'c2']]);
    const metGroep = metRefs('2', 'Zebra', [['ODS_9101', 'b2']], DOELGROEP);
    const zonderGroep = metRefs('3', 'Appel', [['ODS_9101', 'b5']]);
    const metGroepZonderOverlap = metRefs('4', 'Aap', [['ODS_9999', 'z']], DOELGROEP);
    const res = leerplannenBijRichting([zonderGroep, metGroepZonderOverlap, metGroep, veel], sleutels, 'G-0100');
    expect(res.map((r) => r.curriculum.id)).toEqual(['1', '2', '3', '4']);
  });

  it('een leerplan zonder verwijzingen of met een kapotte doelgroep geeft geen fout', () => {
    const kaal = createCurriculum({ title: 'Kaal', net: 'eigen', subject: '', level: '', goals: [{ id: '1', code: 'K1', text: 'Doel.' }] });
    const kapot = { ...kaal, doelgroep: { groep: 'kapot' } } as unknown as Curriculum;
    expect(leerplannenBijRichting([kaal, kapot], sleutels, 'G-0100')).toEqual([]);
  });

  it('werkt op leerplannen die echt uit het kader komen', () => {
    const lp = leerplanVoorRichting(kader, BESTANDEN, DOELGROEP, { sets: ['ODS_9101', 'ODS_9102'] }).leerplan;
    const res = leerplannenBijRichting([lp], sleutels, 'G-0100');
    expect(res).toEqual([{ curriculum: lp, raakt: 9, viaDoelgroep: true }]);
  });
});

// ── Het geraamte ────────────────────────────────────────────────────────────

describe('geraamteHoofdstukken', () => {
  it('een hoofdstuk per eerste deel van het thema (volgorde van het eerste voorkomen), een sectie per rubriek', () => {
    const lp = leerplanMet([
      { code: 'B1', text: 'Een.', theme: 'Biologie › Leven › Cel' },
      { code: 'C1', text: 'Twee.', theme: 'Chemie' },
      { code: 'B2', text: 'Drie.', theme: 'Biologie › Leven › Organisme' },
      { code: 'B3', text: 'Vier.', theme: 'Biologie › Leven › Cel' },
      { code: 'C2', text: 'Vijf.', theme: 'Chemie › Stoffen' },
    ]);
    const ch = geraamteHoofdstukken(lp);
    expect(ch.map((c) => c.title)).toEqual(['Biologie', 'Chemie']);
    expect(ch[0].sections.map((s) => s.title)).toEqual(['Leven › Cel', 'Leven › Organisme']);
    expect(ch[0].sections.map((s) => s.goalCodes)).toEqual([['B1', 'B3'], ['B2']]);
    expect(ch[1].sections.map((s) => s.title)).toEqual(['Doelen', 'Stoffen']);
    expect(ch[1].sections.map((s) => s.goalCodes)).toEqual([['C1'], ['C2']]);
  });

  it("terugval 'Doelen': zonder thema is het hoofdstuk en de sectie 'Doelen', en een thema zonder rubriek geeft de sectie 'Doelen'", () => {
    const lp = leerplanMet([
      { code: 'A1', text: 'Een.' },
      { code: 'A2', text: 'Twee.', theme: '   ' },
      { code: 'G1', text: 'Drie.', theme: 'Getallenleer' },
      { code: 'G2', text: 'Vier.', theme: 'Getallenleer › ' },
    ]);
    const ch = geraamteHoofdstukken(lp);
    expect(ch.map((c) => c.title)).toEqual(['Doelen', 'Getallenleer']);
    expect(ch[0].sections.map((s) => [s.title, s.goalCodes])).toEqual([['Doelen', ['A1', 'A2']]]);
    expect(ch[1].sections.map((s) => [s.title, s.goalCodes])).toEqual([['Doelen', ['G1', 'G2']]]);
  });

  it('een leerplan van een net groepeert op het eigen thema', () => {
    const lp = leerplanMet([
      { code: 'WIS 1.1', text: 'Tellen.', theme: 'Getallenleer' },
      { code: 'WIS 2.1', text: 'Meten.', theme: 'Meetkunde' },
      { code: 'WIS 1.2', text: 'Rekenen.', theme: 'Getallenleer' },
    ]);
    const ch = geraamteHoofdstukken(lp);
    expect(ch.map((c) => c.title)).toEqual(['Getallenleer', 'Meetkunde']);
    expect(ch[0].sections).toHaveLength(1);
    expect(ch[0].sections[0].goalCodes).toEqual(['WIS 1.1', 'WIS 1.2']);
  });

  it("elke sectie heeft één callout van het soort 'goal' met per regel '<code> — <korte tekst>', en is niet optioneel", () => {
    const lang = 'x'.repeat(200);
    const lp = leerplanMet([
      { code: 'B1', text: 'Eerste regel.\nTweede   regel.', theme: 'Biologie › Cel' },
      { code: 'B2', text: lang, theme: 'Biologie › Cel' },
    ]);
    const sectie = geraamteHoofdstukken(lp)[0].sections[0];
    expect(sectie.blocks).toHaveLength(1);
    const blok = sectie.blocks[0];
    expect(blok.type).toBe('callout');
    if (blok.type !== 'callout') return;
    expect(blok.kind).toBe('goal');
    expect(blok.title).toBe('Doelen in deze sectie');
    expect(blok.text.split('\n')).toEqual([`B1 — Eerste regel. Tweede regel.`, `B2 — ${'x'.repeat(89)}…`]);
    expect(sectie.optional).toBeFalsy();
  });

  it('elke gekozen code staat in precies één niet-optionele sectie', () => {
    const r = leerplanVoorRichting(testKader(), BESTANDEN, DOELGROEP);
    const ch = geraamteHoofdstukken(r.leerplan);
    const alle = sectieCodes(ch);
    expect(alle).toHaveLength(r.leerplan.goals.length);
    expect(new Set(alle).size).toBe(alle.length);
    expect([...alle].sort()).toEqual(codesVan(r.leerplan).map((c) => normalizeGoalCode(c)).sort());
    for (const c of ch) for (const s of c.sections) {
      expect(s.optional).toBeFalsy();
      expect(s.blocks.filter((b) => b.type === 'callout' && b.kind === 'goal')).toHaveLength(1);
      const callout = s.blocks[0];
      expect(callout.type === 'callout' && callout.text.split('\n').length).toBe(s.goalCodes?.length);
    }
  });

  it('bij een samengestelde lijst: een hoofdstuk per set in de volgorde van de sets, en de sectie is de rubriek', () => {
    const r = leerplanVoorRichting(testKader(), BESTANDEN, DOELGROEP);
    const ch = geraamteHoofdstukken(r.leerplan);
    expect(ch.map((c) => c.title)).toEqual(['Biologie', 'Chemie', 'Wiskunde, exacte wetenschappen en technologie', 'Competenties in het Nederlands']);
    expect(ch[0].sections.map((s) => s.title)).toEqual(['Leven › Cel', 'Leven › Organisme']);
    expect(ch[0].sections.map((s) => s.goalCodes?.length)).toEqual([2, 2]);
    expect(ch[1].sections.map((s) => s.title)).toEqual(['Doelen']);
    expect(ch[2].sections.map((s) => s.title)).toEqual(['Wiskunde', 'Natuurwetenschappen']);
    expect(ch[3].sections.map((s) => s.title)).toEqual(['Lezen', 'Schrijven']);
  });

  it('met codes: alleen die doelen, in de volgorde van het leerplan; codes mogen in kleine letters en onbekende codes doen niets', () => {
    const lp = leerplanMet([
      { code: 'B1', text: 'Een.', theme: 'Biologie › Cel' },
      { code: 'B2', text: 'Twee.', theme: 'Biologie › Cel' },
      { code: 'C1', text: 'Drie.', theme: 'Chemie' },
    ]);
    const ch = geraamteHoofdstukken(lp, ['c1', 'b1', '  b1 ', 'onbekend']);
    expect(ch.map((c) => c.title)).toEqual(['Biologie', 'Chemie']);
    expect(sectieCodes(ch)).toEqual(['B1', 'C1']);
    expect(geraamteHoofdstukken(lp, [])).toEqual([]);
    expect(geraamteHoofdstukken(lp, ['onbekend'])).toEqual([]);
  });

  it('een leerplan zonder doelen geeft geen hoofdstukken', () => {
    expect(geraamteHoofdstukken(leerplanMet([]))).toEqual([]);
  });

  it('een doel zonder bruikbare code, of met een dubbele code, komt er niet (dubbel) in', () => {
    const lp = leerplanMet([
      { code: 'B1', text: 'Een.', theme: 'Biologie' },
      { code: '…', text: 'Zonder code.', theme: 'Biologie' },
      { code: '', text: 'Leeg.', theme: 'Biologie' },
      { code: 'b1', text: 'Dubbel.', theme: 'Biologie' },
    ]);
    const ch = geraamteHoofdstukken(lp);
    expect(sectieCodes(ch)).toEqual(['B1']);
  });

  describe('de grens van 400 doelen', () => {
    const doelen = (n: number) => Array.from({ length: n }, (_, i) => ({ code: `C${i}`, text: `Doel ${i}.`, theme: `Set ${i % 3} › Rubriek ${i % 7}` }));

    it('tot en met 400 doelen: een sectie per rubriek', () => {
      const ch = geraamteHoofdstukken(leerplanMet(doelen(400)));
      expect(ch).toHaveLength(3);
      for (const c of ch) expect(c.sections).toHaveLength(7);
      expect(sectieCodes(ch)).toHaveLength(400);
    });

    it("bij meer dan 400 doelen: één sectie per hoofdstuk ('Doelen'), met nog altijd elke code één keer", () => {
      const ch = geraamteHoofdstukken(leerplanMet(doelen(401)));
      expect(ch.map((c) => c.title)).toEqual(['Set 0', 'Set 1', 'Set 2']);
      for (const c of ch) {
        expect(c.sections).toHaveLength(1);
        expect(c.sections[0].title).toBe('Doelen');
      }
      const alle = sectieCodes(ch);
      expect(alle).toHaveLength(401);
      expect(new Set(alle).size).toBe(401);
    });

    it('de grens telt de doelen die er echt in komen: met codes eronder is het weer per rubriek', () => {
      const lp = leerplanMet(doelen(500));
      const ch = geraamteHoofdstukken(lp, lp.goals.slice(0, 100).map((g) => g.code));
      expect(ch.some((c) => c.sections.length > 1)).toBe(true);
    });
  });

  it('titels van hoofdstukken en secties zijn hoogstens 120 tekens', () => {
    const lp = leerplanMet([{ code: 'L1', text: 'Een.', theme: `${'H'.repeat(300)} › ${'R'.repeat(300)}` }]);
    const ch = geraamteHoofdstukken(lp);
    expect(ch[0].title.length).toBeLessThanOrEqual(120);
    expect(ch[0].sections[0].title.length).toBeLessThanOrEqual(120);
    expect(ch[0].title.endsWith('…')).toBe(true);
    expect(ch[0].sections[0].goalCodes).toEqual(['L1']);
  });

  it('id\'s zijn uniek binnen het geraamte', () => {
    const r = leerplanVoorRichting(testKader(), BESTANDEN, DOELGROEP);
    const ch = geraamteHoofdstukken(r.leerplan);
    const ids = ch.flatMap((c) => [c.id, ...c.sections.flatMap((s) => [s.id, ...s.blocks.map((b) => b.id)])]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── cursusVoorRichting ──────────────────────────────────────────────────────

describe('cursusVoorRichting', () => {
  const lp = leerplanVoorRichting(testKader(), BESTANDEN, DOELGROEP, { sets: ['ODS_9101', 'ODS_9102'], vak: 'Natuur' }).leerplan;

  it('met een geraamte: leerplan, ondertitel, doelgroep zonder kader en volgtKader, en de secties met hun codes', () => {
    expect(lp.doelgroep?.kader).toMatch(/^[0-9a-f]{64}$/);
    expect(lp.doelgroep?.volgtKader).toBe(true);
    const c = cursusVoorRichting({
      titel: ' Biologie voor de testrichting ', auteur: 'Juf An',
      doelgroep: { ...DOELGROEP, kader: 'a'.repeat(64), kaderVolledig: 'b'.repeat(64), volgtKader: true }, leerplan: lp, start: 'geraamte',
    });
    expect(c.title).toBe('Biologie voor de testrichting');
    expect(c.author).toBe('Juf An');
    expect(c.curriculumId).toBe(lp.id);
    expect(c.subtitle).toBe('Biologie · Testrichting · 4de jaar');
    expect(c.doelgroep).toEqual({ groep: 'G-0100', titel: 'Testrichting', graad: 2, jaar: 4, soort: 'so', vak: 'Biologie' });
    expect(c.doelgroep).not.toHaveProperty('kader');
    expect(c.doelgroep).not.toHaveProperty('kaderVolledig');
    expect(c.doelgroep).not.toHaveProperty('volgtKader');
    expect(c.chapters.map((ch) => ch.title)).toEqual(['Biologie', 'Chemie']);
    expect(sectieCodes(c.chapters)).toEqual(codesVan(lp));
  });

  it('de ondertitel is doelgroepTekst van de doelgroep', () => {
    const d = { ...DOELGROEP, vak: undefined, jaar: 3 };
    const c = cursusVoorRichting({ titel: 'X', auteur: '', doelgroep: d, leerplan: lp, start: 'leeg' });
    expect(c.subtitle).toBe(doelgroepTekst(d));
    expect(c.subtitle).toBe('Testrichting · 3de jaar');
  });

  it("'leeg': het ene lege hoofdstuk van createCourse, maar wel gekoppeld aan het leerplan en de richting", () => {
    const c = cursusVoorRichting({ titel: 'Leeg', auteur: 'Juf An', doelgroep: DOELGROEP, leerplan: lp, start: 'leeg' });
    expect(c.chapters).toHaveLength(1);
    expect(c.chapters[0].sections).toHaveLength(1);
    expect(c.chapters[0].sections[0].blocks).toEqual([]);
    expect(c.chapters[0].sections[0].goalCodes).toBeUndefined();
    expect(c.curriculumId).toBe(lp.id);
    expect(c.doelgroep?.groep).toBe('G-0100');
    const basis = createCourse('Leeg', 'Juf An');
    expect(c.chapters[0].title).toBe(basis.chapters[0].title);
    expect(c.settings).toEqual(basis.settings);
  });

  it('met codes: alleen die doelen op de secties', () => {
    const codes = codesVan(lp).slice(0, 3);
    const c = cursusVoorRichting({ titel: 'Deel', auteur: '', doelgroep: DOELGROEP, leerplan: lp, codes, start: 'geraamte' });
    expect(sectieCodes(c.chapters)).toEqual(codes);
  });

  it('een leerplan zonder bruikbare doelen, of codes die nergens passen, laat het lege hoofdstuk staan', () => {
    const leeg = cursusVoorRichting({ titel: 'X', auteur: '', doelgroep: DOELGROEP, leerplan: leerplanMet([]), start: 'geraamte' });
    expect(leeg.chapters).toHaveLength(1);
    expect(leeg.chapters[0].sections[0].blocks).toEqual([]);
    const geen = cursusVoorRichting({ titel: 'X', auteur: '', doelgroep: DOELGROEP, leerplan: lp, codes: ['bestaat niet'], start: 'geraamte' });
    expect(geen.chapters).toHaveLength(1);
    expect(sectieCodes(geen.chapters)).toEqual([]);
  });

  it('een ongeldige doelgroep geeft een cursus zonder doelgroep en zonder ondertitel', () => {
    const c = cursusVoorRichting({ titel: 'X', auteur: '', doelgroep: { groep: 'kapot' } as unknown as Doelgroep, leerplan: lp, start: 'geraamte' });
    expect(c.doelgroep).toBeUndefined();
    expect(c.subtitle).toBeUndefined();
    expect(c.curriculumId).toBe(lp.id);
  });

  it('verandert de doelgroep en het leerplan die je meegeeft niet', () => {
    const d: Doelgroep = { ...DOELGROEP, kader: 'a'.repeat(64), volgtKader: true };
    const voor = JSON.stringify([d, lp]);
    cursusVoorRichting({ titel: 'X', auteur: '', doelgroep: d, leerplan: lp, start: 'geraamte' });
    expect(JSON.stringify([d, lp])).toBe(voor);
  });

  it('sanitizeCourse laat het geraamte en de richting staan (zoals bij bewaren, delen en importeren)', () => {
    const c = cursusVoorRichting({ titel: 'Cursus', auteur: 'Juf An', doelgroep: DOELGROEP, leerplan: lp, start: 'geraamte' });
    const gesaneerd = sanitizeCourse(JSON.parse(JSON.stringify(c))) as Course;
    expect(gesaneerd).not.toBeNull();
    expect(gesaneerd.chapters).toMatchObject(c.chapters);
    expect(gesaneerd.chapters).toHaveLength(c.chapters.length);
    for (const [i, ch] of gesaneerd.chapters.entries()) {
      expect(ch.sections).toHaveLength(c.chapters[i].sections.length);
      for (const [j, s] of ch.sections.entries()) {
        expect(s.goalCodes).toEqual(c.chapters[i].sections[j].goalCodes);
        expect(s.blocks).toEqual(c.chapters[i].sections[j].blocks);
        expect(s.optional).toBeFalsy();
      }
    }
    expect(gesaneerd.curriculumId).toBe(lp.id);
    expect(gesaneerd.subtitle).toBe(c.subtitle);
    expect(gesaneerd.doelgroep).toEqual(c.doelgroep);
  });

  it('sanitizeCourse laat ook een lege cursus voor een richting staan', () => {
    const c = cursusVoorRichting({ titel: 'Leeg', auteur: '', doelgroep: DOELGROEP, leerplan: lp, start: 'leeg' });
    const gesaneerd = sanitizeCourse(JSON.parse(JSON.stringify(c))) as Course;
    expect(gesaneerd.doelgroep).toEqual(c.doelgroep);
    expect(gesaneerd.curriculumId).toBe(lp.id);
    expect(gesaneerd.chapters).toHaveLength(1);
  });
});

// ── passendeCodes ───────────────────────────────────────────────────────────

describe('passendeCodes', () => {
  const lp = leerplanMet([
    { code: 'B1', text: 'Een.' }, { code: 'B 2', text: 'Twee.' }, { code: 'C1', text: 'Drie.' },
  ]);
  function cursusMet(...secties: string[][]): Course {
    const c = createCourse('Test');
    c.chapters = [{
      id: 'h1', title: 'H',
      sections: secties.map((goalCodes, i) => ({ id: `s${i}`, title: `S${i}`, blocks: [], goalCodes })),
    }];
    return c;
  }

  it('telt de verschillende codes van de cursus en hoeveel ervan in het leerplan staan', () => {
    expect(passendeCodes(cursusMet(['B1', 'C1'], ['B1', 'X9']), lp)).toEqual({ passend: 2, totaal: 3 });
  });

  it('let niet op hoofdletters of dubbele spaties', () => {
    expect(passendeCodes(cursusMet(['b1', 'b  2']), lp)).toEqual({ passend: 2, totaal: 2 });
  });

  it('een cursus zonder codes, of zonder passende codes', () => {
    expect(passendeCodes(cursusMet([]), lp)).toEqual({ passend: 0, totaal: 0 });
    expect(passendeCodes(createCourse('Leeg'), lp)).toEqual({ passend: 0, totaal: 0 });
    expect(passendeCodes(cursusMet(['Q1', 'Q2']), lp)).toEqual({ passend: 0, totaal: 2 });
  });

  it('een geraamte past helemaal bij zijn eigen leerplan, en niet bij een ander', () => {
    const eigen = leerplanVoorRichting(testKader(), BESTANDEN, DOELGROEP, { sets: ['ODS_9101', 'ODS_9102'] }).leerplan;
    const c = cursusVoorRichting({ titel: 'X', auteur: '', doelgroep: DOELGROEP, leerplan: eigen, start: 'geraamte' });
    expect(passendeCodes(c, eigen)).toEqual({ passend: 9, totaal: 9 });
    expect(passendeCodes(c, lp)).toEqual({ passend: 0, totaal: 9 });
  });
});

// ── vergelijkMetKader ───────────────────────────────────────────────────────

describe('vergelijkMetKader', () => {
  const GEEN = { nieuw: 0, vervallen: 0, setsNietMeerInKader: [] as string[] };
  const kader = testKader();
  const maak = (opties: Parameters<typeof leerplanVoorRichting>[3] = {}) => leerplanVoorRichting(kader, BESTANDEN, DOELGROEP, opties).leerplan;
  /** Zoals de app het leerplan sinds fase 2 bewaart (met `setAfdrukken`). */
  const leerplan = maak({ sets: ['ODS_9101', 'ODS_9102'] });
  /** Hetzelfde leerplan zoals de app het van oktober 2026 tot fase 2 bewaarde: `kader` en `kaderVolledig` (oude regel). */
  const oudLeerplan = inOudFormaat(leerplan, kader);

  it('niets veranderd: de vingerafdruk is gelijk, dus niets te melden', () => {
    expect(vergelijkMetKader(leerplan, kader)).toEqual(GEEN);
    expect(vergelijkMetKader(oudLeerplan, kader)).toEqual(GEEN);
  });

  it('vooraf: het nieuwe formaat heeft een afdruk per set van het leerplan, het oude niet', () => {
    expect(leerplan.doelgroep?.setAfdrukken).toStrictEqual(afdrukkenPerSet(kader, ['ODS_9101', 'ODS_9102']));
    expect(oudLeerplan.doelgroep).not.toHaveProperty('setAfdrukken');
    expect(oudLeerplan.doelgroep).toMatchObject({ ...oudFormaat(kader, setsVan(leerplan)), volgtKader: true });
    expect(oudLeerplan.doelgroep?.kader).toBe(leerplan.doelgroep?.kader);
    expect(oudLeerplan.doelgroep?.kaderVolledig).toBe(leerplan.doelgroep?.kaderVolledig);
  });

  it('in beide formaten dezelfde uitkomst voor een leerplan dat de koppeling volgt (§ 22.3.8)', () => {
    const kaders = [
      testKader({ bioIds: [...BIO_KOPPELING, 'b12', 'b13'] }),
      testKader({ bioIds: ['b2', 'b7', 'b11'] }),
      testKader({ bioIds: ['b2', 'b5', 'b7', 'b12'] }),
      maakKader([kaderSet(BIO, BIO_KOPPELING), kaderSet(STEM, 'alle')]),
      maakKader([kaderSet(STEM, 'alle')]),
      maakKader([kaderSet(BIO, 'alle'), kaderSet(CHEMIE, 'alle')]),
      maakKader([kaderSet(BIO, BIO_KOPPELING), { ...kaderSet(CHEMIE, 'alle'), ids: ['c1', 'c2', 'c3'], volledig: true }]),
      maakKader([]),
    ];
    for (const k of kaders) expect(vergelijkMetKader(leerplan, k)).toEqual(vergelijkMetKader(oudLeerplan, k));
  });

  it('een nieuw nummer in de koppeling van een deelset is nieuw', () => {
    const nu = testKader({ bioIds: [...BIO_KOPPELING, 'b12', 'b13'] });
    expect(vergelijkMetKader(leerplan, nu)).toEqual({ nieuw: 2, vervallen: 0, setsNietMeerInKader: [] });
  });

  it('een nummer dat uit de koppeling verdween, is vervallen', () => {
    const nu = testKader({ bioIds: ['b2', 'b7', 'b11'] });
    expect(vergelijkMetKader(leerplan, nu)).toEqual({ nieuw: 0, vervallen: 1, setsNietMeerInKader: [] });
  });

  it('nieuw en vervallen tegelijk', () => {
    const nu = testKader({ bioIds: ['b2', 'b5', 'b7', 'b12'] });
    expect(vergelijkMetKader(leerplan, nu)).toEqual({ nieuw: 1, vervallen: 1, setsNietMeerInKader: [] });
  });

  describe('een set die tijdelijk uit het leerplan viel (setkiezer) en terugkomt: de afdruk blijft (§ 22.3.5)', () => {
    /** Zoals de setkiezer van een bewerkbaar leerplan: alleen de lijst sets verandert, de doelgroep blijft. */
    const metSets = (lp: Curriculum, sets: string[]): Curriculum => ({ ...lp, minimumdoelenSets: sets });
    /** De leerkracht kiest de doelen van Biologie zelf (per doel, met de vaste nummers). */
    const metBio = (lp: Curriculum, ids: string[]): Curriculum => ({
      ...lp,
      goals: [
        ...lp.goals.filter((g) => g.refs?.[0]?.set !== BIO.set.id),
        ...ids.map((id, i) => ({ id: `bio-${i}`, code: `BIO ${i + 1}`, text: `Biologie ${id}`, refs: [{ set: BIO.set.id, id, code: `B.${i + 1}` }] })),
      ],
    });
    /** De maandelijkse update terwijl Biologie weg was: b11 valt weg, b12 komt erbij. */
    const nu = testKader({ bioIds: ['b2', 'b5', 'b7', 'b12'] });
    const later = testKader({ bioIds: ['b2', 'b12'] });
    const zonderBio = metSets(leerplan, [CHEMIE.set.id]);
    /** Biologie terug (in een andere volgorde), met de doelen volgens de koppeling van nu. */
    const terug = metBio(metSets(zonderBio, [CHEMIE.set.id, BIO.set.id]), ['b2', 'b5', 'b7', 'b12']);
    /** Ter vergelijking: Biologie viel nooit weg, en de leerkracht koos dezelfde doelen. */
    const nooitWeg = metBio(leerplan, ['b2', 'b5', 'b7', 'b12']);

    it('vooraf: de afdruk van Biologie blijft staan terwijl de set weg is', () => {
      expect(zonderBio.doelgroep?.setAfdrukken).toHaveProperty(BIO.set.id);
      expect(vergelijkMetKader(zonderBio, nu)).toEqual(GEEN);
    });

    it('doelen gekozen volgens de koppeling van nu: geen melding, net als bij een set die nooit wegviel', () => {
      expect(vergelijkMetKader(terug, nu)).toEqual(GEEN);
      expect(vergelijkMetKader(nooitWeg, nu)).toEqual(GEEN);
    });

    it('dezelfde uitkomst als een set die nooit wegviel, voor elk kader (de regel kan de twee niet onderscheiden)', () => {
      const kaders = [kader, nu, later, maakKader([kaderSet(CHEMIE, 'alle')]), testKader({ bioIds: ['b2', 'b5', 'b7', 'b12', 'b13'] })];
      for (const k of kaders) expect(vergelijkMetKader(terug, k)).toEqual(vergelijkMetKader(nooitWeg, k));
      // Koos ze maar een deel: wat er in de koppeling van nu nog bij hoort, telt in beide gevallen als nieuw (volgtKader).
      const deelTerug = metBio(terug, ['b2', 'b12']);
      const deelNooitWeg = metBio(nooitWeg, ['b2', 'b12']);
      expect(vergelijkMetKader(deelTerug, nu)).toEqual({ nieuw: 2, vervallen: 0, setsNietMeerInKader: [] });
      expect(vergelijkMetKader(deelNooitWeg, nu)).toEqual(vergelijkMetKader(deelTerug, nu));
    });

    it('snoeien zou een latere echte verandering stil maken: daarom blijft de afdruk', () => {
      expect(vergelijkMetKader(terug, later)).toEqual({ nieuw: 0, vervallen: 2, setsNietMeerInKader: [] });
      const afdrukken = { ...terug.doelgroep!.setAfdrukken! };
      delete afdrukken[BIO.set.id];
      const gesnoeid: Curriculum = { ...terug, doelgroep: { ...terug.doelgroep!, setAfdrukken: afdrukken } };
      expect(vergelijkMetKader(gesnoeid, later)).toEqual(GEEN);
    });
  });

  it('een set die niet meer in het kader staat (bv. een oude versie): al zijn verwijzingen zijn vervallen en de set wordt genoemd', () => {
    const nu = maakKader([kaderSet(BIO, BIO_KOPPELING), kaderSet(STEM, 'alle')]);
    expect(vergelijkMetKader(leerplan, nu)).toEqual({ nieuw: 0, vervallen: 5, setsNietMeerInKader: ['ODS_9102'] });
    const leeg = maakKader([kaderSet(STEM, 'alle')]);
    expect(vergelijkMetKader(leerplan, leeg)).toEqual({ nieuw: 0, vervallen: 9, setsNietMeerInKader: ['ODS_9101', 'ODS_9102'] });
  });

  it('de sets die niet meer in het kader staan komen in de volgorde van het leerplan', () => {
    const drie = maak({ sets: ['ODS_9104', 'ODS_9102', 'ODS_9101'] });
    expect(setsVan(drie)).toEqual(['ODS_9101', 'ODS_9102', 'ODS_9104']);
    const leeg = maakKader([kaderSet(STEM, 'alle')]);
    expect(vergelijkMetKader(drie, leeg).setsNietMeerInKader).toEqual(['ODS_9101', 'ODS_9102', 'ODS_9104']);
  });

  it('nieuw geldt alleen voor deelsets: een volledige set volgt zijn huidige inhoud vanzelf', () => {
    const chemieGroter = maakKader([kaderSet(BIO, BIO_KOPPELING), kaderSet(CHEMIE, ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'])]);
    // Chemie heeft 5 doelen in de index: zes nummers is dus geen volledige set, maar dan is c6 nieuw voor een deelset.
    expect(chemieGroter.sets[1].volledig).toBe(false);
    expect(vergelijkMetKader(leerplan, chemieGroter).nieuw).toBe(1);
    const chemieVolledig = maakKader([kaderSet(BIO, BIO_KOPPELING), kaderSet(CHEMIE, 'alle')]);
    expect(chemieVolledig.sets[1].volledig).toBe(true);
    const metOnbekendNummer = { ...chemieVolledig, sets: [chemieVolledig.sets[0], { ...chemieVolledig.sets[1], ids: ['c1', 'c2', 'c3', 'c4', 'c5'] }] };
    expect(vergelijkMetKader(leerplan, metOnbekendNummer)).toEqual(GEEN);
  });

  it('nieuw telt alleen deelsets die in het leerplan zitten', () => {
    const alleenChemie = maak({ sets: ['ODS_9102'] });
    const nu = testKader({ bioIds: [...BIO_KOPPELING, 'b12'] });
    expect(vergelijkMetKader(alleenChemie, nu)).toEqual({ nieuw: 0, vervallen: 0, setsNietMeerInKader: [] });
  });

  it('zonder volgtKader (per doel gekozen) komt er niets automatisch bij: nieuw is 0, vervallen telt wel', () => {
    const perDoel: Curriculum = { ...leerplan, doelgroep: { ...leerplan.doelgroep!, volgtKader: undefined } };
    const nu = testKader({ bioIds: ['b2', 'b5', 'b7', 'b12'] });
    expect(vergelijkMetKader(perDoel, nu)).toEqual({ nieuw: 0, vervallen: 1, setsNietMeerInKader: [] });
  });

  it("een eigen kopie volgt de koppeling niet meer: altijd niets, ook als ze nog volgtKader had", () => {
    const kopie = maakEigenKopie(leerplan);
    expect(kopie.kind).toBe('eigen');
    expect(kopie.doelgroep?.volgtKader).toBeUndefined();
    const nu = testKader({ bioIds: ['b2', 'b7', 'b12'] });
    expect(vergelijkMetKader(kopie, nu)).toEqual(GEEN);
    const eigenMetVolgt: Curriculum = { ...leerplan, kind: 'eigen' };
    expect(eigenMetVolgt.doelgroep?.volgtKader).toBe(true);
    expect(vergelijkMetKader(eigenMetVolgt, nu)).toEqual(GEEN);
  });

  it('een leerplan zonder opgeslagen vingerafdruk wordt wel vergeleken', () => {
    const zonderKader: Curriculum = { ...leerplan, doelgroep: { ...leerplan.doelgroep!, kader: undefined } };
    const nu = testKader({ bioIds: ['b2', 'b7', 'b11'] });
    expect(vergelijkMetKader(zonderKader, nu)).toEqual({ nieuw: 0, vervallen: 1, setsNietMeerInKader: [] });
    const zonderDoelgroep: Curriculum = { ...leerplan, doelgroep: undefined };
    expect(vergelijkMetKader(zonderDoelgroep, nu)).toEqual({ nieuw: 0, vervallen: 1, setsNietMeerInKader: [] });
  });

  it('veranderen alleen de nummers van een volledige set (zelfde versie), dan telt dat: kaderVolledig ziet het', () => {
    // `kader` telt een volledige set alleen als "set|*" en blijft gelijk; de afdruk van de volledige sets verandert wel.
    const chemieNu = kaderSet(CHEMIE, 'alle');
    const kleiner = maakKader([kaderSet(BIO, BIO_KOPPELING), { ...chemieNu, ids: ['c1', 'c2', 'c3'], volledig: true, versieGelijk: true }]);
    expect(kaderVingerafdruk(kleiner, setsVan(oudLeerplan))).toBe(oudLeerplan.doelgroep?.kader);
    expect(volledigeSetsVingerafdruk(kleiner, setsVan(oudLeerplan))).not.toBe(oudLeerplan.doelgroep?.kaderVolledig);
    expect(vergelijkMetKader(oudLeerplan, kleiner)).toEqual({ nieuw: 0, vervallen: 2, setsNietMeerInKader: [] });
    // Het nieuwe formaat ziet het aan de afdruk van Chemie: dezelfde uitkomst.
    expect(vergelijkMetKader(leerplan, kleiner)).toEqual({ nieuw: 0, vervallen: 2, setsNietMeerInKader: [] });
  });

  describe('een volledige set die groeit of krimpt bij een maandelijkse update (koppeling en set samen bijgewerkt)', () => {
    /** Chemie na de update: `ids` is de hele set (volledig), met het versiemerk van de index als `versieGelijk`. */
    const chemieNa = (ids: string[], versieGelijk = true): KaderSet => {
      const k = kaderSet(CHEMIE, 'alle', { versieGelijk });
      return { ...k, set: { ...k.set, aantal: ids.length }, ids, volledig: true };
    };
    const ZEVEN = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
    // De oude regel (vóór fase 2), expliciet in het oude formaat: `oudLeerplan` heeft `kader` en `kaderVolledig`, en
    // `alleenKader` is zoals de app het vóór `kaderVolledig` bewaarde. `leerplan` (met `setAfdrukken`) staat ernaast
    // waar het nieuwe formaat tot dezelfde uitkomst komt.
    /** Hetzelfde leerplan, zoals de app het vóór `kaderVolledig` bewaarde: alleen met `kader`. */
    const alleenKader: Curriculum = { ...oudLeerplan, doelgroep: { ...oudLeerplan.doelgroep!, kaderVolledig: undefined } };
    const beide = [oudLeerplan, alleenKader];

    it('vooraf: een leerplan van oktober 2026 draagt beide afdrukken, een ouder alleen kader (dezelfde)', () => {
      expect(oudLeerplan.doelgroep).toMatchObject(oudFormaat(kader, setsVan(oudLeerplan)));
      expect(alleenKader.doelgroep?.kader).toBe(oudLeerplan.doelgroep?.kader);
      expect(alleenKader.doelgroep?.kaderVolledig).toBeUndefined();
      for (const lp of beide) expect(lp.doelgroep).not.toHaveProperty('setAfdrukken');
      // Ongewijzigd kader: in elk formaat niets te melden.
      for (const lp of [...beide, leerplan]) expect(vergelijkMetKader(lp, kader)).toEqual(GEEN);
    });

    it('(a) 2 doelen erbij bij een gelijke versie: nieuw = 2; een oud leerplan (kader gelijk) meldt niets, zoals vroeger', () => {
      const groter = maakKader([kaderSet(BIO, BIO_KOPPELING), chemieNa(ZEVEN)]);
      expect(kaderVingerafdruk(groter, setsVan(oudLeerplan))).toBe(oudLeerplan.doelgroep?.kader);
      expect(vergelijkMetKader(oudLeerplan, groter)).toEqual({ nieuw: 2, vervallen: 0, setsNietMeerInKader: [] });
      expect(vergelijkMetKader(alleenKader, groter)).toEqual(GEEN);
      // Het nieuwe formaat ziet hetzelfde: alleen de afdruk van Chemie veranderde.
      expect(vergelijkMetKader(leerplan, groter)).toEqual({ nieuw: 2, vervallen: 0, setsNietMeerInKader: [] });
    });

    it('een volledige set die krimpt (gelijke versie): de nummers die wegvielen zijn vervallen; een oud leerplan meldt niets', () => {
      const kleiner = maakKader([kaderSet(BIO, BIO_KOPPELING), chemieNa(['c1', 'c2', 'c3'])]);
      expect(vergelijkMetKader(oudLeerplan, kleiner)).toEqual({ nieuw: 0, vervallen: 2, setsNietMeerInKader: [] });
      expect(vergelijkMetKader(alleenKader, kleiner)).toEqual(GEEN);
      expect(vergelijkMetKader(leerplan, kleiner)).toEqual({ nieuw: 0, vervallen: 2, setsNietMeerInKader: [] });
      // Wat erbij komt en wat wegvalt samen.
      const anders = maakKader([kaderSet(BIO, BIO_KOPPELING), chemieNa(['c1', 'c2', 'c3', 'c4', 'c6', 'c7'])]);
      expect(vergelijkMetKader(oudLeerplan, anders)).toEqual({ nieuw: 2, vervallen: 1, setsNietMeerInKader: [] });
      expect(vergelijkMetKader(alleenKader, anders)).toEqual(GEEN);
      expect(vergelijkMetKader(leerplan, anders)).toEqual({ nieuw: 2, vervallen: 1, setsNietMeerInKader: [] });
    });

    it('evenveel nummers erbij als eraf (gelijke versie): de nieuwe tellen ook, al heeft het leerplan evenveel nummers', () => {
      // 5 nummers voor en na: c4 en c5 vallen weg, c6 en c7 komen erbij.
      const geruild = maakKader([kaderSet(BIO, BIO_KOPPELING), chemieNa(['c1', 'c2', 'c3', 'c6', 'c7'])]);
      expect(vergelijkMetKader(oudLeerplan, geruild)).toEqual({ nieuw: 2, vervallen: 2, setsNietMeerInKader: [] });
      expect(vergelijkMetKader(alleenKader, geruild)).toEqual(GEEN);
      expect(vergelijkMetKader(leerplan, geruild)).toEqual({ nieuw: 2, vervallen: 2, setsNietMeerInKader: [] });
    });

    it('(c) een andere versie van een volledige set: de nummers zijn niet te vergelijken, dus 0 nieuw en 0 vervallen, in elk formaat', () => {
      const andereVersie = maakKader([kaderSet(BIO, BIO_KOPPELING), chemieNa(ZEVEN, false)]);
      const kleinerAndereVersie = maakKader([kaderSet(BIO, BIO_KOPPELING), chemieNa(['c1', 'c2'], false)]);
      for (const lp of [...beide, leerplan]) {
        expect(vergelijkMetKader(lp, andereVersie)).toEqual(GEEN);
        expect(vergelijkMetKader(lp, kleinerAndereVersie)).toEqual(GEEN);
      }
    });

    it('zonder volgtKader komt er ook bij een gegroeide volledige set niets automatisch bij', () => {
      const groter = maakKader([kaderSet(BIO, BIO_KOPPELING), chemieNa(ZEVEN)]);
      for (const lp of [...beide, leerplan]) {
        const perDoel: Curriculum = { ...lp, doelgroep: { ...lp.doelgroep!, volgtKader: undefined } };
        expect(vergelijkMetKader(perDoel, groter)).toEqual(GEEN);
      }
    });

    it('een veranderde deelset: kader verschilt, dus alles wordt vergeleken, zoals vroeger, in beide oude formaten', () => {
      const nu = maakKader([kaderSet(BIO, [...BIO_KOPPELING, 'b12']), chemieNa(ZEVEN)]);
      expect(kaderVingerafdruk(nu, setsVan(oudLeerplan))).not.toBe(oudLeerplan.doelgroep?.kader);
      for (const lp of beide) expect(vergelijkMetKader(lp, nu)).toEqual({ nieuw: 3, vervallen: 0, setsNietMeerInKader: [] });
      // Het nieuwe formaat vergelijkt Biologie en Chemie (beide afdrukken veranderden): dezelfde uitkomst.
      expect(vergelijkMetKader(leerplan, nu)).toEqual({ nieuw: 3, vervallen: 0, setsNietMeerInKader: [] });
    });

    it('(b) een deelset waarin de leerkracht meer koos dan de koppeling en een eigen set buiten het kader: niet vervallen als alleen een volledige set veranderde', () => {
      // Per doel gekozen met de richting (zonder volgtKader, zoals doelgroepBijRichting): de hele set Biologie (13 doelen,
      // de koppeling noemt er 4), Chemie (volledig) en de STEM-set, die niet in dit kader staat. Oud formaat: `oudFormaat`.
      const k = maakKader([kaderSet(BIO, BIO_KOPPELING), kaderSet(CHEMIE, 'alle')]);
      const SETS = ['ODS_9101', 'ODS_9102', 'ODS_9103'];
      const ruim = leerplanUitSelectie([{ bestand: BIO, doelen: 'alle' }, { bestand: CHEMIE, doelen: 'alle' }, { bestand: STEM, doelen: 'alle' }], {
        titel: 'T', doelgroep: { ...DOELGROEP, ...oudFormaat(k, SETS) },
      });
      expect(ruim.bevestigd).toBe(true);
      expect(ruim.leerplan.goals).toHaveLength(26);
      expect(ruim.leerplan.doelgroep).not.toHaveProperty('setAfdrukken');
      const ruimOud: Curriculum = { ...ruim.leerplan, doelgroep: { ...ruim.leerplan.doelgroep!, kaderVolledig: undefined } };
      // Chemie verliest c5 (een routine-update) of groeit.
      const kleiner = maakKader([kaderSet(BIO, BIO_KOPPELING), chemieNa(['c1', 'c2', 'c3', 'c4'])]);
      const groter = maakKader([kaderSet(BIO, BIO_KOPPELING), chemieNa(ZEVEN)]);
      for (const lp of [ruim.leerplan, ruimOud]) expect(vergelijkMetKader(lp, k)).toEqual(GEEN);
      // Alleen Chemie wordt vergeleken. Zonder kaderVolledig telden hier ook de 9 doelen van Biologie die de koppeling
      // niet noemt en de 8 van de eigen set als vervallen.
      expect(vergelijkMetKader(ruim.leerplan, kleiner)).toEqual({ nieuw: 0, vervallen: 1, setsNietMeerInKader: [] });
      // Chemie groeit: zonder volgtKader komt er niets bij.
      expect(vergelijkMetKader(ruim.leerplan, groter)).toEqual(GEEN);
      // Een oud leerplan (kader gelijk): niets te melden, zoals vroeger.
      expect(vergelijkMetKader(ruimOud, kleiner)).toEqual(GEEN);
      expect(vergelijkMetKader(ruimOud, groter)).toEqual(GEEN);
      // Zonder vingerafdruk wordt alles vergeleken: dan lijken de 9 doelen die de koppeling niet noemt en de eigen set vervallen.
      const zonderAfdruk: Curriculum = { ...ruim.leerplan, doelgroep: { ...ruim.leerplan.doelgroep!, kader: undefined, kaderVolledig: undefined } };
      expect(vergelijkMetKader(zonderAfdruk, k)).toEqual({ nieuw: 0, vervallen: 9 + 8, setsNietMeerInKader: ['ODS_9103'] });
    });

    it('(b) in het nieuwe formaat: dezelfde uitkomst, en ook bij een veranderde deelset vervalt de eigen set niet meer', () => {
      const k = maakKader([kaderSet(BIO, BIO_KOPPELING), kaderSet(CHEMIE, 'alle')]);
      const SETS = ['ODS_9101', 'ODS_9102', 'ODS_9103'];
      const ruim = leerplanUitSelectie([{ bestand: BIO, doelen: 'alle' }, { bestand: CHEMIE, doelen: 'alle' }, { bestand: STEM, doelen: 'alle' }], {
        titel: 'T', doelgroep: { ...DOELGROEP, ...kaderAfdrukken(k, SETS) },
      }).leerplan;
      // De STEM-set stond niet in het kader: ze heeft geen afdruk.
      expect(Object.keys(ruim.doelgroep?.setAfdrukken ?? {})).toEqual(['ODS_9101', 'ODS_9102']);
      const kleiner = maakKader([kaderSet(BIO, BIO_KOPPELING), chemieNa(['c1', 'c2', 'c3', 'c4'])]);
      expect(vergelijkMetKader(ruim, k)).toEqual(GEEN);
      expect(vergelijkMetKader(ruim, kleiner)).toEqual({ nieuw: 0, vervallen: 1, setsNietMeerInKader: [] });
      // Biologie verandert echt (b12 erbij): Biologie wordt vergeleken (de 9 eigen doelen daar tellen, zoals bij elke
      // echte verandering), maar de eigen STEM-set niet meer. De oude regel telde er ook die 8 bij.
      const anderBio = maakKader([kaderSet(BIO, [...BIO_KOPPELING, 'b12']), kaderSet(CHEMIE, 'alle')]);
      expect(vergelijkMetKader(ruim, anderBio)).toEqual({ nieuw: 0, vervallen: 8, setsNietMeerInKader: [] });
      expect(vergelijkMetKader(inOudFormaat(ruim, k), anderBio)).toEqual({ nieuw: 0, vervallen: 8 + 8, setsNietMeerInKader: ['ODS_9103'] });
    });

    it('een oud leerplan met volgtKader en een eigen keuze in een volledige set: "Werk het leerplan bij" verschijnt niet als alleen een volledige set veranderde', () => {
      // Zo bewaarde "Keuze aanpassen" het tot oktober 2026: c4 en c5 van Chemie uitgevinkt, maar volgtKader en kader bleven.
      const aangepast: Curriculum = { ...alleenKader, goals: alleenKader.goals.filter((g) => !['c4', 'c5'].includes(g.refs![0].id)) };
      expect(aangepast.doelgroep?.volgtKader).toBe(true);
      expect(aangepast.doelgroep).not.toHaveProperty('setAfdrukken');
      // Het kader is niet veranderd, of alleen Chemie groeide of kromp: niets te melden, dus ook geen knop die de keuze
      // overschrijft (zoals vóór oktober 2026). Telde de app hier, dan leken c4 en c5 nieuw.
      expect(vergelijkMetKader(aangepast, kader)).toEqual(GEEN);
      expect(vergelijkMetKader(aangepast, maakKader([kaderSet(BIO, BIO_KOPPELING), chemieNa(ZEVEN)]))).toEqual(GEEN);
      expect(vergelijkMetKader(aangepast, maakKader([kaderSet(BIO, BIO_KOPPELING), chemieNa(['c1', 'c2', 'c4'])]))).toEqual(GEEN);
      // Veranderde een deelset, dan wordt alles vergeleken, zoals vroeger (ook toen telden c4 en c5 dan als nieuw).
      expect(vergelijkMetKader(aangepast, maakKader([kaderSet(BIO, [...BIO_KOPPELING, 'b12']), chemieNa(ZEVEN)])).nieuw).toBe(1 + 4);
    });

    it('"Werk het leerplan bij" op een oud leerplan geeft alle afdrukken; daarna ziet de app een volledige set die groeit', () => {
      // Een deelset veranderde: het oude leerplan krijgt de knop en wordt bijgewerkt (zelfde id, met `bestaand`).
      const nu = maakKader([kaderSet(BIO, [...BIO_KOPPELING, 'b12']), kaderSet(CHEMIE, 'alle')]);
      expect(vergelijkMetKader(alleenKader, nu).nieuw).toBe(1);
      const r = leerplanVoorRichting(nu, BESTANDEN, alleenKader.doelgroep!, { bestaand: alleenKader, titel: alleenKader.title });
      expect(r.bevestigd).toBe(true);
      expect(r.leerplan.id).toBe(alleenKader.id);
      expect(r.leerplan.doelgroep).toMatchObject({ ...kaderAfdrukken(nu, setsVan(r.leerplan)), volgtKader: true });
      // Een bewuste herbasering: het bijgewerkte leerplan staat nu in het nieuwe formaat.
      expect(r.leerplan.doelgroep?.setAfdrukken).toStrictEqual(afdrukkenPerSet(nu, setsVan(r.leerplan)));
      expect(vergelijkMetKader(r.leerplan, nu)).toEqual(GEEN);
      // Groeit Chemie daarna (gelijke versie), dan telt dat nu wel.
      const groter = maakKader([kaderSet(BIO, [...BIO_KOPPELING, 'b12']), chemieNa(ZEVEN)]);
      expect(vergelijkMetKader(r.leerplan, groter)).toEqual({ nieuw: 2, vervallen: 0, setsNietMeerInKader: [] });
    });
  });

  it('een volledige set met een andere versie: de nummers van de koppeling zijn dan niet meer te vergelijken, dus niet vervallen', () => {
    // Biologie verandert ook, zodat het kader wel anders is en er gerekend wordt.
    const bioNu = kaderSet(BIO, ['b2', 'b7', 'b11']);
    const chemie = kaderSet(CHEMIE, 'alle');
    const nieuweVersie = maakKader([bioNu, { ...chemie, ids: ['c1', 'c2', 'c3'], volledig: true, versieGelijk: false }]);
    expect(vergelijkMetKader(leerplan, nieuweVersie)).toEqual({ nieuw: 0, vervallen: 1, setsNietMeerInKader: [] });
    // Bij een gelijk versiemerk is de koppeling wél de waarheid over de set: c4 en c5 bestaan niet meer.
    const zelfdeVersie = maakKader([bioNu, { ...chemie, ids: ['c1', 'c2', 'c3'], volledig: true, versieGelijk: true }]);
    expect(vergelijkMetKader(leerplan, zelfdeVersie)).toEqual({ nieuw: 0, vervallen: 3, setsNietMeerInKader: [] });
  });

  it('een kader dat nog niet is opgehaald, of dat zonder sets "geen" is, is niet te beoordelen: niets te melden', () => {
    const leegKader = (herkomst: RichtingKader['herkomst']): RichtingKader => ({ ...maakKader([]), herkomst });
    // Zonder deze uitzondering zou elke verwijzing van het leerplan "vervallen" lijken.
    const zonderUitzondering = vergelijkMetKader(leerplan, maakKader([]));
    expect(zonderUitzondering.vervallen).toBe(9);
    expect(vergelijkMetKader(leerplan, leegKader('nog-niet-opgehaald'))).toEqual(GEEN);
    expect(vergelijkMetKader(leerplan, leegKader('geen'))).toEqual(GEEN);
    // Ook 'nog-niet-opgehaald' met sets is niet te beoordelen, en 'geen' met een laatst bekend bestand wel.
    const metSets = (herkomst: RichtingKader['herkomst']): RichtingKader => ({ ...testKader({ bioIds: ['b2', 'b7'] }), herkomst });
    expect(vergelijkMetKader(leerplan, metSets('nog-niet-opgehaald'))).toEqual(GEEN);
    expect(vergelijkMetKader(leerplan, metSets('geen')).vervallen).toBe(2);
    expect(vergelijkMetKader(leerplan, metSets('api')).vervallen).toBe(2);
    expect(vergelijkMetKader(leerplan, metSets('graad-en-stroom')).vervallen).toBe(2);
  });

  it('een deelset in het leerplan die in het nieuwe kader volledig werd, geeft de nummers die erbij komen als nieuw', () => {
    // Het leerplan heeft 4 van de 13 doelen van Biologie; het kader noemt nu alle 13.
    const nu = maakKader([kaderSet(BIO, 'alle'), kaderSet(CHEMIE, 'alle')]);
    expect(nu.sets[0].volledig).toBe(true);
    expect(leerplan.doelgroep?.kader).not.toBe(kaderVingerafdruk(nu, setsVan(leerplan)));
    expect(vergelijkMetKader(leerplan, nu)).toEqual({ nieuw: 9, vervallen: 0, setsNietMeerInKader: [] });
    // Ook als ze de enige set van het leerplan is.
    const alleenBio = maak({ sets: ['ODS_9101'] });
    expect(vergelijkMetKader(alleenBio, nu)).toEqual({ nieuw: 9, vervallen: 0, setsNietMeerInKader: [] });
  });

  it('die nieuwe nummers van een volledig geworden set tellen alleen bij volgtKader en een gelijke versie', () => {
    const nu = maakKader([kaderSet(BIO, 'alle'), kaderSet(CHEMIE, 'alle')]);
    const perDoel: Curriculum = { ...leerplan, doelgroep: { ...leerplan.doelgroep!, volgtKader: undefined } };
    expect(vergelijkMetKader(perDoel, nu)).toEqual(GEEN);
    const andereVersie = maakKader([kaderSet(BIO, 'alle', { versieGelijk: false }), kaderSet(CHEMIE, 'alle')]);
    expect(andereVersie.sets[0].volledig).toBe(true);
    expect(vergelijkMetKader(leerplan, andereVersie)).toEqual(GEEN);
    // Een volledige set waarvan het leerplan al evenveel nummers heeft (Chemie: 5 van 5), geeft niets nieuws.
    const bioKleiner = maakKader([kaderSet(BIO, ['b2', 'b5', 'b7']), kaderSet(CHEMIE, 'alle')]);
    expect(vergelijkMetKader(leerplan, bioKleiner)).toEqual({ nieuw: 0, vervallen: 1, setsNietMeerInKader: [] });
  });

  it('een volledige kaderset met een nummer dat niet in het leerplan staat is niet nieuw zonder volgtKader of een gelijke versie', () => {
    // Biologie (deelset) krijgt b12 erbij, zodat het kader verschilt van de vingerafdruk van het leerplan. Chemie is in
    // het leerplan en in het kader volledig, maar het kader noemt ook c6: een nummer dat het leerplan niet heeft.
    const kaderMetC6 = (versieGelijk: boolean) => {
      const chemie = kaderSet(CHEMIE, 'alle', { versieGelijk });
      return maakKader([kaderSet(BIO, ['b2', 'b5', 'b7', 'b11', 'b12']), { ...chemie, ids: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'], volledig: true }]);
    };
    const perDoel: Curriculum = { ...leerplan, doelgroep: { ...leerplan.doelgroep!, volgtKader: undefined } };
    // Zonder volgtKader komt er niets automatisch bij: ook c6 niet.
    expect(vergelijkMetKader(perDoel, kaderMetC6(true)).nieuw).toBe(0);
    // Met een andere versie zijn de nummers van de koppeling niet te vergelijken: alleen b12 (deelset) is nieuw.
    expect(vergelijkMetKader(leerplan, kaderMetC6(false)).nieuw).toBe(1);
    // Met volgtKader en een gelijke versie is c6 ook nieuw.
    expect(vergelijkMetKader(leerplan, kaderMetC6(true))).toEqual({ nieuw: 2, vervallen: 0, setsNietMeerInKader: [] });
  });

  it('een volledige kaderset waarvan het leerplan evenveel nummers heeft als het kader: een nummer dat het leerplan niet heeft, is toch nieuw', () => {
    // Het leerplan heeft 5 nummers van Chemie en het kader noemt er 5 (c5 is vervangen door c9): c5 vervalt, c9 is nieuw
    // (naast b12 van Biologie). Vroeger telde alleen "minder nummers" en bleef c9 onvermeld.
    const chemie = kaderSet(CHEMIE, 'alle');
    const kader5 = maakKader([kaderSet(BIO, ['b2', 'b5', 'b7', 'b11', 'b12']), { ...chemie, ids: ['c1', 'c2', 'c3', 'c4', 'c9'], volledig: true }]);
    expect(vergelijkMetKader(leerplan, kader5)).toEqual({ nieuw: 2, vervallen: 1, setsNietMeerInKader: [] });
  });

  it('een leerplan met doelen die niet meer in het bestand staan, geeft meteen na het maken niets te melden', () => {
    // De koppeling noemt b98 en b99, die niet (meer) in het bestand staan: ze zitten niet in het leerplan, wel in het kader.
    const kaderMetWeg = testKader({ bioIds: ['b2', 'b5', 'b98', 'b99'] });
    const r = leerplanVoorRichting(kaderMetWeg, BESTANDEN, DOELGROEP, { sets: ['ODS_9101', 'ODS_9102'] });
    expect(r.ontbrekend).toEqual([{ set: 'ODS_9101', ids: ['b98', 'b99'] }]);
    expect(refIds(r.leerplan).filter((id) => id?.startsWith('b'))).toEqual(['b2', 'b5']);
    expect(vergelijkMetKader(r.leerplan, kaderMetWeg)).toEqual(GEEN);
    expect(r.leerplan.doelgroep?.kader).toBe(kaderVingerafdruk(kaderMetWeg, ['ODS_9101', 'ODS_9102']));
  });

  it('een kapot leerplan zonder doelen of sets geeft geen fout', () => {
    const kaal = createCurriculum({ title: 'Kaal', net: 'eigen', subject: '', level: '', goals: [] });
    expect(vergelijkMetKader(kaal, kader)).toEqual(GEEN);
  });
});

// ── Op de fixtures (nagebootste API) en de echte sets ───────────────────────

const WORTEL = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURES = join(WORTEL, 'tests', 'fixtures', 'structuur', 'uit');
const INDEX_BESTAND = join(WORTEL, 'public', 'leerplannen', 'minimumdoelen', 'index.json');
const MINIMUMDOELEN_MAP = join(WORTEL, 'public', 'leerplannen', 'minimumdoelen');

function leesJson<T>(pad: string): T {
  return JSON.parse(readFileSync(pad, 'utf8')) as T;
}

/**
 * De fixtures van de nagebootste API (matrix en koppeling) met de echte index en de echte setbestanden. De setbestanden
 * worden elke maand bijgewerkt (docs/STUDIERICHTINGEN.md § 7): wat van een versiemerk of een aantal in de levende sets
 * afhangt, loopt alleen bij een gelijk versiemerk. De rest leidt zijn verwachting af uit de huidige bestanden.
 */
function laadEcht() {
  try {
    if (!existsSync(join(FIXTURES, 'studierichtingen.json')) || !existsSync(join(FIXTURES, 'richtingdoelen', 'index.json')) || !existsSync(INDEX_BESTAND)) return undefined;
    const matrix = leesJson<MatrixBestand>(join(FIXTURES, 'studierichtingen.json'));
    const koppeling = leesJson<RichtingDoelenIndex>(join(FIXTURES, 'richtingdoelen', 'index.json'));
    const index = leesJson<MinimumdoelenIndex>(INDEX_BESTAND).sets;
    const kaderVan = (nr: string, k: Partial<RichtingKeuze> = {}) => {
      const info = richtingInfo(matrix, nr, VANDAAG) as RichtingInfo;
      const regel: RichtingDoelenIndexRegel | undefined = koppeling.groepen.find((r) => r.groep === nr);
      const pad = regel?.bestand ? join(FIXTURES, 'richtingdoelen', regel.bestand) : undefined;
      const bestand = pad && existsSync(pad) ? leesJson<RichtingDoelenBestand>(pad) : null;
      const keuze: RichtingKeuze = { groep: nr, soort: 'so', ...k };
      return { info, keuze, kader: bouwKader(bestand, regel, index, keuze, info) };
    };
    /** De setbestanden van het kader; `undefined` als er een ontbreekt. */
    const bestandenVan = (kader: RichtingKader): Map<string, MinimumdoelenSetBestand> | undefined => {
      const uit = new Map<string, MinimumdoelenSetBestand>();
      for (const k of kader.sets) {
        const pad = join(MINIMUMDOELEN_MAP, k.set.bestand);
        if (!existsSync(pad)) return undefined;
        uit.set(k.set.id, leesJson<MinimumdoelenSetBestand>(pad));
      }
      return uit;
    };
    return { kaderVan, bestandenVan };
  } catch {
    return undefined;
  }
}

const ECHT = laadEcht();
/** De officiële "STEM - Cesuurdoelen" van de 2de graad (korte naam "STEM"), in het kader van G-0193. */
const STEM_CESUUR = 'ODS_3142';
const G193 = ECHT?.kaderVan('G-0193', { jaar: 4 });
const G193_BESTANDEN = G193 ? ECHT?.bestandenVan(G193.kader) : undefined;
const HEEFT_G193 = G193 !== undefined && G193_BESTANDEN !== undefined && G193.kader.sets.length > 0;
const G193_BUSO = ECHT?.kaderVan('G-0193', { jaar: 4, soort: 'buso' });
const G193_BUSO_BESTANDEN = G193_BUSO ? ECHT?.bestandenVan(G193_BUSO.kader) : undefined;
const HEEFT_G193_BUSO = HEEFT_G193 && G193_BUSO !== undefined && G193_BUSO_BESTANDEN !== undefined && G193_BUSO.kader.sets.length > 0;

/**
 * Hoeveel doelen het leerplan van het kader nu telt, afgeleid uit de huidige bestanden (de verplichte sets, of ook de
 * uitbreidingssets met `ookUitbreiding`): een volledige set geeft al zijn bruikbare doelen, een deelset die uit de
 * koppeling die nog bestaan.
 */
function verwachtAantal(
  kader: RichtingKader,
  bestanden: ReadonlyMap<string, MinimumdoelenSetBestand>,
  opties: { sets?: readonly string[]; ookUitbreiding?: boolean } = {},
): number {
  let n = 0;
  for (const k of kader.sets) {
    if ((!k.verplicht && !opties.ookUitbreiding) || (opties.sets && !opties.sets.includes(k.set.id))) continue;
    const bruikbaar = kiesbareDoelen(bestanden.get(k.set.id) as MinimumdoelenSetBestand);
    n += k.volledig ? bruikbaar.length : bruikbaar.filter((d) => k.ids.includes(d.id)).length;
  }
  return n;
}

/** De sets van het kader die nu minstens één doel opleveren, in de volgorde van het kader. */
function verwachteSets(kader: RichtingKader, bestanden: ReadonlyMap<string, MinimumdoelenSetBestand>, ookUitbreiding = false): string[] {
  return kader.sets
    .filter((k) => verwachtAantal(kader, bestanden, { sets: [k.set.id], ookUitbreiding }) > 0)
    .map((k) => k.set.id)
    .filter((id) => ookUitbreiding || kader.sets.find((k) => k.set.id === id)?.verplicht);
}

describe.runIf(HEEFT_G193)('G-0193 (Natuurwetenschappen, 2de graad) op de fixtures en de echte sets', () => {
  const { info, keuze, kader } = G193 as NonNullable<typeof G193>;
  const bestanden = G193_BESTANDEN as ReadonlyMap<string, MinimumdoelenSetBestand>;
  const doelgroep = doelgroepVan(info, keuze, { vak: 'Biologie' });
  const BIOLOGIE = 'ODS_3132';
  const bio = kader.sets.find((k) => k.set.id === BIOLOGIE);
  const bioNu = bio ? bestanden.get(BIOLOGIE) : undefined;
  const bioIdsNu = new Set((bioNu?.doelen ?? []).map((d) => d.id));
  const bioBlijft = bio ? bio.ids.filter((id) => bioIdsNu.has(id)) : [];
  const bioGelijk = bio !== undefined && bio.versieGelijk;

  it('het leerplan van de hele richting is bevestigd, heeft de doelgroep zonder jaar en telt de huidige doelen van de kadersets', () => {
    const r = leerplanVoorRichting(kader, bestanden, doelgroep, { titel: titelVoorRichtingLeerplan(info, kader) });
    expect(r.bevestigd).toBe(true);
    expect(r.leerplan.title).toBe('Natuurwetenschappen · 2de graad');
    expect(r.leerplan.goals).toHaveLength(verwachtAantal(kader, bestanden));
    expect(r.leerplan.goals.length).toBeGreaterThan(0);
    expect(r.leerplan.doelgroep).toMatchObject({ groep: 'G-0193', graad: 2, soort: 'so', volgtKader: true });
    expect(r.leerplan.doelgroep?.jaar).toBeUndefined();
    expect(r.leerplan.doelgroep?.kader).toBe(kaderVingerafdruk(kader, setsVan(r.leerplan)));
    expect(setsVan(r.leerplan)).toEqual(verwachteSets(kader, bestanden));
    expect(effectieveStatus(r.leerplan)).toBe('gecontroleerd');
    expect(vergelijkMetKader(r.leerplan, kader)).toEqual({ nieuw: 0, vervallen: 0, setsNietMeerInKader: [] });
  });

  it.runIf(bio !== undefined && !bio.volledig)('een deelset blijft een deelset tot in het leerplan: nooit meer dan wat de koppeling noemt', () => {
    const r = leerplanVoorRichting(kader, bestanden, doelgroep, { sets: [BIOLOGIE] });
    expect(r.bevestigd).toBe(true);
    // Wat de koppeling noemt en nog in het bestand staat, en niets anders: nooit de hele set.
    expect([...refIds(r.leerplan)].sort()).toEqual([...bioBlijft].sort());
    expect(r.leerplan.goals.length).toBeLessThanOrEqual(bio?.ids.length ?? 0);
    if ((bioNu?.doelen.length ?? 0) > (bio?.ids.length ?? 0)) {
      expect(r.leerplan.goals.length).toBeLessThan(bioNu?.doelen.length ?? 0);
    }
    const weg = (bio?.ids ?? []).filter((id) => !bioIdsNu.has(id));
    expect(r.ontbrekend).toEqual(weg.length > 0 ? [{ set: BIOLOGIE, ids: [...weg].sort() }] : []);
  });

  it.runIf(bioGelijk)('bij een gelijk versiemerk van Biologie: precies de 4 nummers van de koppeling, niet de 13 van de set', () => {
    expect(bioNu?.doelen).toHaveLength(13);
    const r = leerplanVoorRichting(kader, bestanden, doelgroep, { sets: [BIOLOGIE] });
    expect(bio?.ids).toHaveLength(4);
    expect(r.leerplan.goals).toHaveLength(4);
    expect(r.ontbrekend).toEqual([]);
    expect(refIds(r.leerplan)).toEqual(bioNu?.doelen.map((d) => d.id).filter((id) => bio?.ids.includes(id as string)));
    // En via de keuzelogica van de wizard blijft het er ook 4.
    const viaWizard = bouwSetKeuzes(beginUitKeuze(selectieVanKader(kader, { sets: [BIOLOGIE] })), bestanden);
    expect(viaWizard[0].doelen).toHaveLength(4);
    expect(leerplanUitSelectie(viaWizard, { titel: 'Biologie' }).leerplan.goals).toHaveLength(4);
  });

  it('het geraamte: elke code één keer, een hoofdstuk per set, en sanitizeCourse laat het staan', () => {
    const r = leerplanVoorRichting(kader, bestanden, doelgroep);
    const c = cursusVoorRichting({ titel: voorstelCursusTitel(doelgroep), auteur: 'Test', doelgroep, leerplan: r.leerplan, start: 'geraamte' });
    const alle = sectieCodes(c.chapters);
    expect(alle).toHaveLength(r.leerplan.goals.length);
    expect(new Set(alle).size).toBe(alle.length);
    // Elke set krijgt een eigen naam in het thema, dus een eigen hoofdstuk.
    expect(c.chapters).toHaveLength(setsVan(r.leerplan).length);
    for (const ch of c.chapters) {
      expect(ch.title.length).toBeLessThanOrEqual(120);
      for (const s of ch.sections) {
        expect(s.title.length).toBeLessThanOrEqual(120);
        expect(s.optional).toBeFalsy();
        expect(s.blocks).toHaveLength(1);
      }
    }
    const gesaneerd = sanitizeCourse(JSON.parse(JSON.stringify(c))) as Course;
    expect(gesaneerd.chapters).toMatchObject(c.chapters);
    expect(sectieCodes(gesaneerd.chapters)).toEqual(alle);
    expect(gesaneerd.doelgroep).toEqual(c.doelgroep);
    expect(passendeCodes(c, r.leerplan)).toEqual({ passend: alle.length, totaal: alle.length });
  });

  it('hergebruik: het leerplan van de richting wordt gevonden met zijn eigen selectie, en een eigen kopie niet', () => {
    const r = leerplanVoorRichting(kader, bestanden, doelgroep);
    const selectie = selectieVanKeuzes(naarSetKeuzes(selectieVanKader(kader), bestanden).keuzes);
    expect(vindLeerplanMetSelectie([r.leerplan], selectie)).toBe(r.leerplan);
    expect(vindLeerplanMetSelectie([maakEigenKopie(r.leerplan)], selectie)).toBeUndefined();
    const sleutels = new Set(kader.sets.flatMap((k) => k.ids.map((id) => `${k.set.id}|${id}`)));
    const bij = leerplannenBijRichting([r.leerplan], sleutels, 'G-0193');
    expect(bij).toHaveLength(1);
    expect(bij[0].viaDoelgroep).toBe(true);
    expect(bij[0].raakt).toBeGreaterThan(0);
  });

  it.runIf(bio !== undefined)('het vakvoorstel voor Biologie: de Biologie-set in sets, en de STEM-sets apart', () => {
    const v = vakVoorstel(kader, 'Biologie');
    expect(v.sets).toContain(BIOLOGIE);
    expect(v.sets.filter((id) => v.stemSets.includes(id))).toEqual([]);
    // De sleutelcompetentie (ODS_3020, een volledige set) is een STEM-set, net als de officiële "STEM - Cesuurdoelen".
    for (const id of v.stemSets) expect(kader.sets.find((k) => k.set.id === id)?.verplicht).toBe(true);
  });

  it.runIf(kader.sets.some((k) => k.set.id === STEM_CESUUR))(
    'de officiële "STEM - Cesuurdoelen" (ODS_3142) staat in stemSets en nooit in sets, voor elk vak dat ze noemt',
    () => {
      const set = kader.sets.find((k) => k.set.id === STEM_CESUUR)!.set;
      // Dit is een set die isStemSet niet herkent: zonder eigen herkenning zou ze vooraf aangevinkt worden.
      expect(isStemSet(set)).toBe(false);
      expect(set.korteNaam).toBe('STEM');
      for (const vak of ['Biologie', 'Chemie', 'Fysica', 'Natuurwetenschappen', 'Techniek', 'Wiskunde']) {
        const v = vakVoorstel(kader, vak);
        expect(v.stemSets, vak).toContain(STEM_CESUUR);
        expect(v.sets, vak).not.toContain(STEM_CESUUR);
      }
    },
  );

  it.runIf(bio !== undefined)('een titel met een vak, en één met een deel van de sets', () => {
    expect(titelVoorRichtingLeerplan(info, kader, [BIOLOGIE])).toBe('Biologie · Natuurwetenschappen · 2de graad');
    expect(titelVoorRichtingLeerplan(info, kader, undefined, 'Biologie')).toBe('Biologie · Natuurwetenschappen · 2de graad');
    const twee = kader.sets.slice(0, 3).map((k) => k.set.id);
    expect(titelVoorRichtingLeerplan(info, kader, twee)).toMatch(/ en 2 andere · Natuurwetenschappen · 2de graad$/);
  });

  it.runIf(HEEFT_G193_BUSO)('het buitengewoon onderwijs (OV4) geeft een eigen leerplan met een eigen titel', () => {
    const buso = G193_BUSO as NonNullable<typeof G193_BUSO>;
    const busoBestanden = G193_BUSO_BESTANDEN as ReadonlyMap<string, MinimumdoelenSetBestand>;
    const d = doelgroepVan(buso.info, buso.keuze);
    expect(d.soort).toBe('buso');
    const r = leerplanVoorRichting(buso.kader, busoBestanden, d, { titel: titelVoorRichtingLeerplan(buso.info, buso.kader) });
    expect(r.bevestigd).toBe(true);
    expect(r.leerplan.title).toBe('Natuurwetenschappen · 2de graad · buitengewoon (OV4)');
    expect(r.leerplan.doelgroep?.soort).toBe('buso');
    expect(r.leerplan.doelgroep?.kader).not.toBe(leerplanVoorRichting(kader, bestanden, doelgroep).leerplan.doelgroep?.kader);
  });
});

/** De sets uit de echte index met korte naam "STEM": "STEM - Cesuurdoelen" (2de graad) en "STEM - Specifieke eindtermen" (3de graad). */
const OFFICIELE_STEM: MinimumdoelenIndexSet[] = (() => {
  try {
    return existsSync(INDEX_BESTAND) ? leesJson<MinimumdoelenIndex>(INDEX_BESTAND).sets.filter((s) => s.korteNaam === 'STEM') : [];
  } catch {
    return [];
  }
})();

describe.runIf(OFFICIELE_STEM.length > 0)('de officiële STEM-sets uit de echte index (2de en 3de graad, gewoon en buitengewoon)', () => {
  const kaderVanSet = (s: MinimumdoelenIndexSet) => maakKader([{ set: s, ids: ['x'], volledig: false, verplicht: true, versieGelijk: true }]);

  it('staan in stemSets en nooit in sets, voor Biologie, Chemie, Fysica, Natuurwetenschappen, Techniek en Wiskunde', () => {
    for (const s of OFFICIELE_STEM) {
      // Ze heten "STEM", maar zijn niet de sleutelcompetentie waar isStemSet naar zoekt.
      expect(isStemSet(s), s.id).toBe(false);
      for (const vak of ['Biologie', 'Chemie', 'Fysica', 'Natuurwetenschappen', 'Techniek', 'Wiskunde']) {
        const v = vakVoorstel(kaderVanSet(s), vak);
        expect(v, `${s.id} ${vak}`).toEqual({ sets: [], stemSets: [s.id] });
      }
    }
  });

  it('de sets van de 3de graad zijn erbij (STEM - Specifieke eindtermen)', () => {
    expect(OFFICIELE_STEM.filter((s) => /Specifieke eindtermen/.test(s.naam)).length).toBeGreaterThan(0);
    expect(OFFICIELE_STEM.filter((s) => /Cesuurdoelen/.test(s.naam)).length).toBeGreaterThan(0);
  });
});

const G307 = ECHT?.kaderVan('G-0307', { jaar: 1 });
const G307_BESTANDEN = G307 ? ECHT?.bestandenVan(G307.kader) : undefined;
const HEEFT_G307 = G307 !== undefined && G307_BESTANDEN !== undefined && G307.kader.sets.length > 0;

describe.runIf(HEEFT_G307)('G-0307 (Eerste leerjaar A, 1ste graad) op de fixtures en de echte sets', () => {
  const { info, keuze, kader } = G307 as NonNullable<typeof G307>;
  const bestanden = G307_BESTANDEN as ReadonlyMap<string, MinimumdoelenSetBestand>;
  const doelgroep = doelgroepVan(info, keuze, { vak: 'Nederlands' });

  it('de titel noemt de stroom en de graad, niet het leerjaar', () => {
    expect(info.stroom).toBe('A');
    expect(titelVoorRichtingLeerplan(info, kader)).toBe('A-stroom · 1ste graad');
    expect(titelVoorRichtingLeerplan(info, kader, undefined, 'Nederlands')).toBe('Nederlands · A-stroom · 1ste graad');
  });

  it('het leerplan van de stroom is bevestigd; de uitbreidingssets komen er alleen op vraag in', () => {
    const r = leerplanVoorRichting(kader, bestanden, doelgroep);
    expect(r.bevestigd).toBe(true);
    expect(r.leerplan.goals).toHaveLength(verwachtAantal(kader, bestanden));
    expect(setsVan(r.leerplan)).toEqual(verwachteSets(kader, bestanden));
    const uitbreiding = kader.sets.filter((k) => !k.verplicht).map((k) => k.set.id);
    for (const id of uitbreiding) expect(setsVan(r.leerplan)).not.toContain(id);
    const met = leerplanVoorRichting(kader, bestanden, doelgroep, { ookUitbreiding: true });
    expect(met.bevestigd).toBe(true);
    expect(setsVan(met.leerplan)).toEqual(verwachteSets(kader, bestanden, true));
    expect(met.leerplan.goals).toHaveLength(verwachtAantal(kader, bestanden, { ookUitbreiding: true }));
    expect(met.leerplan.goals.length).toBeGreaterThanOrEqual(r.leerplan.goals.length);
    expect(vergelijkMetKader(met.leerplan, kader)).toEqual({ nieuw: 0, vervallen: 0, setsNietMeerInKader: [] });
  });

  it('het vakvoorstel voor Nederlands kiest geen uitbreidingsset; voor Wiskunde komt de STEM-set apart', () => {
    const nl = vakVoorstel(kader, 'Nederlands');
    expect(nl.sets.length).toBeGreaterThan(0);
    for (const id of nl.sets) expect(kader.sets.find((k) => k.set.id === id)?.verplicht).toBe(true);
    const wis = vakVoorstel(kader, 'Wiskunde');
    expect(wis.stemSets.length).toBeGreaterThan(0);
    for (const id of wis.stemSets) expect(wis.sets).not.toContain(id);
  });
});
