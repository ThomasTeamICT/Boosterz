import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BK_BRON, splitsBk, valideerBkBestand, type BkBestand, type BkIndex, type Competentie, type KoppelingBestand } from './beroepskwalificaties';
import { cursusVoorBk } from './bkCursus';
import { leerplanUitBk, tekstVanCompetentie, type BkKeuze } from './bkLeerplan';
import { bkKaartMeta, bkLegende, bkSamenvatting, bkSetSamenvatting, bkToonCompetenties } from './bkWeergave';
import { createCourse } from './courses';
import type { Course, CourseSection } from './courseTypes';
import type { Curriculum } from './curriculumTypes';
import { aantalCompetentiesMetTekst, bkKaderDoelen, bkVerwijzingen, dekkingBk } from './dekkingBk';
import { dekkingMinimumdoelen, type CursusBijdrage, type KaderDoel, type MdDekking } from './dekkingMinimumdoelen';
import type { Doelgroep } from './doelgroep';
import { bkKader, type RichtingBk } from './richtingBk';
import { doelgroepVan, richtingInfo, type RichtingInfo } from './richtingKader';
import { sha256Hex } from './sha256';
import type { MatrixBestand } from './studierichtingen';
import type { Widget } from './types';

// ── Fixtures ────────────────────────────────────────────────────────────────

const HIER = fileURLToPath(new URL('.', import.meta.url));
const lees = (pad: string): unknown => JSON.parse(readFileSync(join(HIER, '../../tests/fixtures', pad), 'utf8'));

const VANDAAG = '2026-10-10';
const MATRIX = lees('structuur/uit/studierichtingen.json') as MatrixBestand;
const KOPPELING = lees('kwalificaties/uit/koppeling.json') as KoppelingBestand;
const INDEX = lees('kwalificaties/uit/index.json') as BkIndex;
const ONTHAAL = lees('kwalificaties/uit/bk/BK-0390-2.json') as BkBestand;
const RECREATIEF = lees('kwalificaties/uit/bk/BK-0464-1.json') as BkBestand;
const NAGEBOOTST_1 = lees('kwalificaties/uit/bk/BK-9999-1.json') as BkBestand;
const NAGEBOOTST_2 = lees('kwalificaties/uit/bk/BK-9999-2.json') as BkBestand;
const BESTANDEN: ReadonlyMap<string, BkBestand> = new Map([ONTHAAL, RECREATIEF, NAGEBOOTST_1, NAGEBOOTST_2].map((b) => [b.bk, b]));

function richting(groep: string, vandaag = VANDAAG): RichtingInfo {
  const i = richtingInfo(MATRIX, groep, vandaag);
  if (!i) throw new Error(`${groep} ontbreekt in de structuurfixtures`);
  return i;
}
const INFO_8 = richting('G-0008');
const DG: Doelgroep = doelgroepVan(INFO_8, { groep: 'G-0008', soort: 'so', jaar: 3 });
const DG_9: Doelgroep = doelgroepVan(richting('G-0009'), { groep: 'G-0009', soort: 'so', jaar: 3 });

const alleVan = (b: BkBestand): BkKeuze => ({ bestand: b, competenties: b.competenties.map((c) => c.id) });
const deelVan = (b: BkBestand, van: number, tot: number): BkKeuze => ({ bestand: b, competenties: b.competenties.slice(van, tot).map((c) => c.id) });
const merkVan = (b: BkBestand) => b.sha256.slice(0, 16);

function leerplanMet(keuzes: BkKeuze[], doelgroep: Doelgroep = DG): Curriculum {
  const merken = new Map(keuzes.map((k) => [k.bestand.bk, merkVan(k.bestand)] as const));
  const u = leerplanUitBk(keuzes, { doelgroep, merken });
  expect(u.bevestigd, u.waarschuwingen.join(' | ')).toBe(true);
  return u.leerplan;
}

/** Een eigen BK-bestand dat door de validator komt; `zonderTekst`: die plaatsen (0-based) krijgen een tekst die na de omzetting leeg is. */
function maakBk(bk: string, titel: string, aantal: number, zonderTekst: number[] = []): BkBestand {
  const delen = splitsBk(bk) as { nummer: string; versie: number };
  const competenties: Competentie[] = Array.from({ length: aantal }, (_, i) => ({
    id: `bkc9${delen.nummer.slice(3)}${String(i + 1).padStart(4, '0')}`,
    nr: i + 1,
    type: 'Vakspecifieke competentie',
    tekst: zonderTekst.includes(i) ? '<p>&nbsp;</p>' : `Competentie ${i + 1} van ${titel}`,
    kennis: [],
    vaardigheden: [],
  }));
  const b: BkBestand = {
    app: 'boosterz', kind: 'beroepskwalificatie', v: 1, bk, nummer: delen.nummer, versie: delen.versie, titel, status: 'ERKEND',
    bron: BK_BRON, api: `https://onderwijs.api.vlaanderen.be/kwalificaties-en-curriculum/beroepskwalificaties/v2/beroepskwalificatie/${bk}`,
    naamsvermelding: 'Bron: test', licentie: 'nog te bevestigen', opgehaald: '2026-10-10T00:00:00Z', aantal,
    sha256: sha256Hex(`${bk}|${titel}|${JSON.stringify(competenties)}`), competenties,
  };
  const fouten = valideerBkBestand(b, bk);
  if (fouten.length > 0) throw new Error(`maakBk: ${fouten.join(' ')}`);
  return b;
}

// ── Cursussen en oefeningen ─────────────────────────────────────────────────

const tekstBlok = (id: string) => ({ id, type: 'text', markdown: 'Uitleg' }) as unknown as CourseSection['blocks'][number];

function sectieMet(c: Course, code: string): CourseSection {
  for (const h of c.chapters) {
    const s = h.sections.find((x) => x.goalCodes?.includes(code));
    if (s) return s;
  }
  throw new Error(`geen sectie met ${code}`);
}
/** De sectie krijgt echte inhoud: ze is dan uitgewerkt (gedekt) in plaats van gepland. */
function werkUit(c: Course, code: string): void {
  sectieMet(c, code).blocks.push(tekstBlok(`t-${c.id}-${code}`));
}
/** Een keuzesectie: alleen verdieping. */
function maakKeuze(c: Course, code: string): void {
  const s = sectieMet(c, code);
  s.optional = true;
  s.blocks.push(tekstBlok(`v-${c.id}-${code}`));
}
/** De cursus behandelt deze competenties niet (de sectie valt weg). */
function laatWeg(c: Course, ...codes: string[]): void {
  for (const h of c.chapters) h.sections = h.sections.filter((s) => !s.goalCodes?.some((g) => codes.includes(g)));
}

function nieuweCursus(id: string, titel: string, leerplan: Curriculum): Course {
  const c = cursusVoorBk({ titel, auteur: 'Juf An', doelgroep: DG, leerplan, bestanden: BESTANDEN, start: 'geraamte' });
  c.id = id;
  return c;
}

function widgetMet(id: string, codes: string[], curriculumId: string): Widget {
  return {
    id, type: 'quiz', title: `Oefening ${id}`, folderId: null, code: 'QQQ111', settings: {}, createdAt: 0, updatedAt: 0, curriculumId,
    config: { questions: codes.map((goalCode, i) => ({ id: `q${i}`, goalCode })) },
  } as unknown as Widget;
}

const statussen = (d: MdDekking) => Object.fromEntries(d.rijen.map((r) => [r.doel.code, r.status]));
const tellers = (d: MdDekking) => ({ totaal: d.totaal, gedekt: d.gedekt, gepland: d.gepland, verdieping: d.verdieping, open: d.open, percent: d.percent });

// ── bkKaderDoelen ───────────────────────────────────────────────────────────

describe('bkKaderDoelen', () => {
  const kader8 = bkKader(KOPPELING, INDEX, INFO_8, { groep: 'G-0008', soort: 'so' }, VANDAAG);
  const doelen = bkKaderDoelen(kader8, BESTANDEN);

  it('het kader van G-0008: Onthaalmedewerker (12) en daarna Recreatief medewerker (13), in de volgorde van het bestand', () => {
    expect(kader8.bks.map((b) => b.bk)).toEqual(['BK-0390-2', 'BK-0464-1']);
    expect(doelen).toHaveLength(25);
    expect(doelen.slice(0, 12).every((d) => d.set === 'BK-0390-2')).toBe(true);
    expect(doelen.slice(12).every((d) => d.set === 'BK-0464-1')).toBe(true);
    expect(doelen.map((d) => d.code)).toEqual([
      ...Array.from({ length: 12 }, (_, i) => `BK-0390-2.${String(i + 1).padStart(2, '0')}`),
      ...Array.from({ length: 13 }, (_, i) => `BK-0464-1.${String(i + 1).padStart(2, '0')}`),
    ]);
  });

  it('elk doel: set = BK-versie, setNaam = titel, id = competentiecode, code = doelcode, tekst, rubriek = soort; altijd verplicht', () => {
    expect(doelen[0]).toEqual({
      set: 'BK-0390-2', setNaam: 'Onthaalmedewerker', id: 'bkc0045062', code: 'BK-0390-2.01', tekst: 'Werkt in teamverband',
      rubriek: 'Vakspecifieke competentie', optioneel: false, verplichteSet: true,
    });
    expect(doelen[24]).toEqual({
      set: 'BK-0464-1', setNaam: 'Recreatief medewerker', id: 'bkc9046413', code: 'BK-0464-1.13', tekst: 'Nagebootste competentie 13 van Recreatief medewerker',
      rubriek: 'Vakspecifieke competentie', optioneel: false, verplichteSet: true,
    });
    expect(doelen.every((d) => !d.optioneel && d.verplichteSet)).toBe(true);
  });

  it('de tekst is die van het leerplan (tekstVanCompetentie): HTML wordt tekst', () => {
    const k: RichtingBk = { herkomst: 'api', bks: [{ bk: 'BK-9999-1', nummer: 'BK-9999', versie: 1, titel: 'Nagebootste beroepskwalificatie', onderdelen: [10], alleOnderdelen: true }], bekrachtigingen: [] };
    const d = bkKaderDoelen(k, BESTANDEN);
    expect(d.map((x) => x.tekst)).toEqual(['Werkt veilig met het materiaal', 'Houdt de werkplek netjes', 'Overlegt met collega’s']);
    expect(d.map((x) => x.code)).toEqual(['BK-9999-1.01', 'BK-9999-1.02', 'BK-9999-1.03']);
    expect(d.map((x) => x.tekst)).toEqual(NAGEBOOTST_1.competenties.map(tekstVanCompetentie));
  });

  it('competenties zonder tekst vallen weg, zodat de dekking dezelfde lijst telt als het leerplan (§ 23.6.4)', () => {
    const leeg = maakBk('BK-5555-1', 'Met een lege', 3, [1]);
    expect(valideerBkBestand(leeg, leeg.bk)).toEqual([]);
    expect(tekstVanCompetentie(leeg.competenties[1])).toBe('');
    const k: RichtingBk = { herkomst: 'api', bks: [{ bk: leeg.bk, nummer: leeg.nummer, versie: 1, titel: leeg.titel, onderdelen: [1], alleOnderdelen: true }], bekrachtigingen: [] };
    const d = bkKaderDoelen(k, new Map([[leeg.bk, leeg]]));
    expect(d.map((x) => x.id)).toEqual([leeg.competenties[0].id, leeg.competenties[2].id]);
    expect(d.map((x) => x.code)).toEqual(['BK-5555-1.01', 'BK-5555-1.03']);
    // Hetzelfde als het leerplan met alle competenties: 2 doelen, dezelfde codes en dezelfde verwijzingen.
    const lp = leerplanMet([alleVan(leeg)]);
    expect(lp.goals.map((g) => g.code)).toEqual(d.map((x) => x.code));
    expect(lp.goals.map((g) => g.bkRefs?.[0].id)).toEqual(d.map((x) => x.id));
    expect(dekkingBk(d, [], []).totaal).toBe(2);
  });

  it('dezelfde lijst als het leerplan met alle competenties van beide beroepskwalificaties', () => {
    const lp = leerplanMet([alleVan(ONTHAAL), alleVan(RECREATIEF)]);
    expect(lp.goals.map((g) => g.code)).toEqual(doelen.map((d) => d.code));
    expect(lp.goals.map((g) => `${g.bkRefs?.[0].bk}|${g.bkRefs?.[0].id}`)).toEqual(doelen.map((d) => `${d.set}|${d.id}`));
  });

  it('een BK-versie zonder bruikbaar bestand levert niets: ontbreekt, van een andere versie, of kapot', () => {
    expect(bkKaderDoelen(kader8, new Map())).toEqual([]);
    expect(bkKaderDoelen(kader8, new Map([['BK-0390-2', RECREATIEF], ['BK-0464-1', RECREATIEF]])).map((d) => d.set)).toEqual(Array(13).fill('BK-0464-1'));
    const kapot = { ...ONTHAAL, aantal: 99 };
    expect(bkKaderDoelen(kader8, new Map([['BK-0390-2', kapot], ['BK-0464-1', RECREATIEF]]))).toHaveLength(13);
    expect(bkKaderDoelen(kader8, new Map([['BK-0390-2', ONTHAAL]]))).toHaveLength(12);
  });

  it('een kader zonder beroepskwalificaties, of rare invoer: een leeg kader, nooit een fout', () => {
    expect(bkKaderDoelen({ herkomst: 'geen', bks: [], bekrachtigingen: [] }, BESTANDEN)).toEqual([]);
    expect(bkKaderDoelen({ herkomst: 'nog-niet-opgehaald', bks: [], bekrachtigingen: [] }, BESTANDEN)).toEqual([]);
    expect(bkKaderDoelen(null as unknown as RichtingBk, BESTANDEN)).toEqual([]);
    expect(bkKaderDoelen(kader8, undefined as unknown as Map<string, BkBestand>)).toEqual([]);
    expect(bkKaderDoelen({ ...kader8, bks: [null, ...kader8.bks, kader8.bks[0]] as unknown as RichtingBk['bks'] }, BESTANDEN)).toHaveLength(25);
  });

  it('verandert de bestanden niet', () => {
    const voor = JSON.stringify([...BESTANDEN.values()]);
    bkKaderDoelen(kader8, BESTANDEN);
    expect(JSON.stringify([...BESTANDEN.values()])).toBe(voor);
  });
});

// ── aantalCompetentiesMetTekst ──────────────────────────────────────────────

describe('aantalCompetentiesMetTekst: het getal op het scherm is de lijst van het leerplan en de dekking', () => {
  it('echte fixtures: 12 en 13, gelijk aan bkKaderDoelen per beroepskwalificatie', () => {
    expect(aantalCompetentiesMetTekst(ONTHAAL)).toBe(12);
    expect(aantalCompetentiesMetTekst(RECREATIEF)).toBe(13);
    expect(aantalCompetentiesMetTekst(NAGEBOOTST_1)).toBe(NAGEBOOTST_1.competenties.length);
    const kader8 = bkKader(KOPPELING, INDEX, INFO_8, { groep: 'G-0008', soort: 'so' }, VANDAAG);
    const doelen = bkKaderDoelen(kader8, BESTANDEN);
    for (const regel of kader8.bks) {
      expect(aantalCompetentiesMetTekst(BESTANDEN.get(regel.bk) as BkBestand), regel.bk).toBe(doelen.filter((d) => d.set === regel.bk).length);
    }
  });

  it('12 in de kop van het bestand, 11 met tekst: de kaart, de lijst, het leerplan en de dekking zeggen allemaal 11', () => {
    const b = maakBk('BK-5555-2', 'Met een lege', 12, [3]);
    expect(b.aantal).toBe(12);
    expect(aantalCompetentiesMetTekst(b)).toBe(11);
    const k: RichtingBk = { herkomst: 'api', bks: [{ bk: b.bk, nummer: b.nummer, versie: 2, titel: b.titel, vks: 3, aantal: b.aantal, onderdelen: [1], alleOnderdelen: true }], bekrachtigingen: [] };
    const doelen = bkKaderDoelen(k, new Map([[b.bk, b]]));
    const n = aantalCompetentiesMetTekst(b);
    expect(doelen).toHaveLength(n);
    expect(leerplanMet([alleVan(b)]).goals).toHaveLength(n);
    expect(dekkingBk(doelen, [], []).totaal).toBe(n);
    // De teksten van het scherm met dat getal.
    expect(bkKaartMeta({ bk: b.bk, vks: 3, aantal: n })).toBe('Niveau 3 · 11 competenties · officieel nummer BK-5555-2');
    expect(bkToonCompetenties(n)).toBe('Toon de 11 competenties');
    expect(bkLegende(b.titel, n)).toBe('Met een lege · 11 competenties');
    // Met het getal uit de kop of de index zou er 12 staan: dat is de fout waarvoor de hulp er is.
    expect(bkKaartMeta({ bk: b.bk, vks: 3, aantal: b.aantal })).toContain('12 competenties');
    expect(bkKaartMeta({ bk: b.bk, vks: 3, aantal: k.bks[0].aantal })).toContain('12 competenties');
  });

  it('grenzen: alles zonder tekst geeft 0, één met tekst geeft 1 (enkelvoud)', () => {
    expect(aantalCompetentiesMetTekst(maakBk('BK-5555-3', 'Alles leeg', 2, [0, 1]))).toBe(0);
    const een = maakBk('BK-5555-4', 'Eén', 2, [0]);
    expect(aantalCompetentiesMetTekst(een)).toBe(1);
    expect(bkKaartMeta({ bk: een.bk, aantal: aantalCompetentiesMetTekst(een) })).toBe('1 competentie · officieel nummer BK-5555-4');
  });

  it('een bestand dat niet door de validator komt, of rare invoer: 0, nooit een fout', () => {
    expect(aantalCompetentiesMetTekst({ ...ONTHAAL, aantal: 99 })).toBe(0);
    expect(aantalCompetentiesMetTekst(null as unknown as BkBestand)).toBe(0);
    expect(aantalCompetentiesMetTekst({} as BkBestand)).toBe(0);
  });

  it('verandert het bestand niet', () => {
    const voor = JSON.stringify(ONTHAAL);
    aantalCompetentiesMetTekst(ONTHAAL);
    expect(JSON.stringify(ONTHAAL)).toBe(voor);
  });
});

// ── bkVerwijzingen ──────────────────────────────────────────────────────────

describe('bkVerwijzingen', () => {
  const doel = (extra: Record<string, unknown>) => ({ id: 'g', code: 'X', text: 'Y', ...extra }) as never;

  it('bkRefs wordt { set: bk, id }', () => {
    expect(bkVerwijzingen(doel({ bkRefs: [{ bk: 'BK-0390-2', id: 'bkc0045062' }] }))).toEqual([{ set: 'BK-0390-2', id: 'bkc0045062' }]);
    expect(bkVerwijzingen(doel({ bkRefs: [{ bk: ' BK-0390-2 ', id: ' bkc1 ' }, { bk: 'BK-0464-1', id: 'bkc2' }] }))).toEqual([
      { set: 'BK-0390-2', id: 'bkc1' }, { set: 'BK-0464-1', id: 'bkc2' },
    ]);
  });

  it('refs naar minimumdoelen tellen hier niet; een doel zonder bkRefs, of met rare bkRefs, geeft niets', () => {
    expect(bkVerwijzingen(doel({ refs: [{ set: 'ODS_1', id: '1', code: '1' }] }))).toEqual([]);
    expect(bkVerwijzingen(doel({}))).toEqual([]);
    expect(bkVerwijzingen(doel({ bkRefs: 'kapot' }))).toEqual([]);
    expect(bkVerwijzingen(doel({ bkRefs: [null, 3, {}, { bk: 'BK-0390-2' }, { id: 'x' }, { bk: '', id: 'x' }, { bk: 'BK-0390-2', id: 5 }] }))).toEqual([]);
    expect(bkVerwijzingen(null as never)).toEqual([]);
    expect(bkVerwijzingen(undefined as never)).toEqual([]);
  });
});

// ── De dekking, met de hand nagerekend ──────────────────────────────────────

describe('dekkingBk: G-0008, 25 competenties, met de hand nagerekend', () => {
  const kader = bkKaderDoelen(bkKader(KOPPELING, INDEX, INFO_8, { groep: 'G-0008', soort: 'so' }, VANDAAG), BESTANDEN);

  // Cursus A: alle 12 competenties van Onthaalmedewerker.
  //   01 tot 04 uitgewerkt: gedekt. 05 en 06 alleen het geraamte: gepland. 07 in een keuzesectie: verdieping.
  //   08 alleen via een oefening in een gewone sectie: gedekt. 09 tot 12 behandelt de cursus niet.
  const LP_A = leerplanMet([alleVan(ONTHAAL)]);
  const C_A = nieuweCursus('c-a', 'Onthaal', LP_A);
  for (const n of ['01', '02', '03', '04']) werkUit(C_A, `BK-0390-2.${n}`);
  maakKeuze(C_A, 'BK-0390-2.07');
  laatWeg(C_A, 'BK-0390-2.08', 'BK-0390-2.09', 'BK-0390-2.10', 'BK-0390-2.11', 'BK-0390-2.12');
  C_A.chapters[0].sections.push({ id: 's-oef', title: 'Oefeningen', blocks: [{ id: 'b-oef', type: 'widget', widgetId: 'w-08' } as unknown as CourseSection['blocks'][number]] });
  const W_08 = widgetMet('w-08', ['BK-0390-2.08'], LP_A.id);

  // Cursus B: de eerste 5 van 13 competenties van Recreatief medewerker (een deel blijft een deel).
  //   01 en 04 uitgewerkt: gedekt. 02 alleen het geraamte: gepland. 03 in een keuzesectie: verdieping. 05 behandelt de cursus niet.
  const LP_B = leerplanMet([deelVan(RECREATIEF, 0, 5)]);
  const C_B = nieuweCursus('c-b', 'Recreatie', LP_B);
  werkUit(C_B, 'BK-0464-1.01');
  werkUit(C_B, 'BK-0464-1.04');
  maakKeuze(C_B, 'BK-0464-1.03');
  laatWeg(C_B, 'BK-0464-1.05');

  // Cursus F: 05 en 09 van Onthaalmedewerker. 05 uitgewerkt (gedekt; in A staat 05 alleen gepland), 09 alleen gepland.
  const LP_F = leerplanMet([{ bestand: ONTHAAL, competenties: [ONTHAAL.competenties[4].id, ONTHAAL.competenties[8].id] }]);
  const C_F = nieuweCursus('c-f', 'Teamwerk', LP_F);
  werkUit(C_F, 'BK-0390-2.05');

  // Cursussen die niet meetellen.
  const MD_LEERPLAN: Curriculum = {
    id: 'lp-md', title: 'Minimumdoelen', net: 'eigen', subject: 'x', level: '', createdAt: 0, updatedAt: 0,
    goals: [{ id: 'g1', code: 'MD1', text: 'Doel', refs: [{ set: 'ODS_1', id: '1', code: '1' }] }],
  };
  const C_MD = { ...createCourse('Minimumdoelen', ''), id: 'c-md', curriculumId: 'lp-md' };
  const C_GEEN = { ...createCourse('Zonder leerplan', ''), id: 'c-geen' };
  const C_WEG = { ...createCourse('Leerplan van een ander toestel', ''), id: 'c-weg', curriculumId: 'lp-weg' };

  const BIJDRAGEN: CursusBijdrage[] = [
    { course: C_A, leerplan: LP_A },
    { course: C_B, leerplan: LP_B },
    { course: C_F, leerplan: LP_F },
    { course: C_MD, leerplan: MD_LEERPLAN },
    { course: C_GEEN },
    { course: C_WEG },
  ];
  const d = dekkingBk(kader, BIJDRAGEN, [W_08]);

  it('status per competentie: gedekt, gepland, verdieping of open; over de cursussen heen wint de beste', () => {
    expect(statussen(d)).toEqual({
      'BK-0390-2.01': 'gedekt', 'BK-0390-2.02': 'gedekt', 'BK-0390-2.03': 'gedekt', 'BK-0390-2.04': 'gedekt',
      'BK-0390-2.05': 'gedekt', // gepland in A, gedekt in F
      'BK-0390-2.06': 'gepland',
      'BK-0390-2.07': 'verdieping',
      'BK-0390-2.08': 'gedekt', // alleen via een oefening in een gewone sectie
      'BK-0390-2.09': 'gepland', // alleen in F, op een sectie die nog leeg is
      'BK-0390-2.10': 'open', 'BK-0390-2.11': 'open', 'BK-0390-2.12': 'open',
      'BK-0464-1.01': 'gedekt', 'BK-0464-1.02': 'gepland', 'BK-0464-1.03': 'verdieping', 'BK-0464-1.04': 'gedekt',
      'BK-0464-1.05': 'open', // de cursus behandelt ze niet, hoewel ze in het kader staat
      'BK-0464-1.06': 'open', 'BK-0464-1.07': 'open', 'BK-0464-1.08': 'open', 'BK-0464-1.09': 'open',
      'BK-0464-1.10': 'open', 'BK-0464-1.11': 'open', 'BK-0464-1.12': 'open', 'BK-0464-1.13': 'open',
    });
  });

  it('de getallen: van de 25 zijn er 8 gedekt, 3 gepland, 2 in verdieping en 12 open = 32 %', () => {
    // BK-0390-2: 6 gedekt (01 tot 05 en 08), 2 gepland (06, 09), 1 verdieping (07), 3 open (10 tot 12).
    // BK-0464-1: 2 gedekt (01, 04), 1 gepland (02), 1 verdieping (03), 9 open.
    expect(tellers(d)).toEqual({ totaal: 25, gedekt: 8, gepland: 3, verdieping: 2, open: 12, percent: 32 });
    expect(d.optioneel).toEqual({ totaal: 0, gedekt: 0 });
  });

  it('perSet is per BK-versie, in de volgorde van het kader', () => {
    expect(d.perSet).toEqual([
      { set: 'BK-0390-2', setNaam: 'Onthaalmedewerker', totaal: 12, gedekt: 6, gepland: 2, verdieping: 1 },
      { set: 'BK-0464-1', setNaam: 'Recreatief medewerker', totaal: 13, gedekt: 2, gepland: 1, verdieping: 1 },
    ]);
    // 6 van 12 = 50 %, 2 van 13 = 15 %; nooit 100 zolang er een niet gedekt is.
    expect(bkSetSamenvatting('Onthaalmedewerker', 6, 12)).toBe('Onthaalmedewerker: 6 van 12 gedekt (50 %)');
    expect(bkSetSamenvatting('Recreatief medewerker', 2, 13)).toBe('Recreatief medewerker: 2 van 13 gedekt (15 %)');
  });

  it('via: beste status eerst, met de cursus en de doelcode', () => {
    const rij05 = d.rijen.find((r) => r.doel.code === 'BK-0390-2.05')!;
    expect(rij05.via).toEqual([
      { courseId: 'c-f', courseTitle: 'Teamwerk', code: 'BK-0390-2.05', status: 'gedekt' },
      { courseId: 'c-a', courseTitle: 'Onthaal', code: 'BK-0390-2.05', status: 'gepland' },
    ]);
    expect(d.rijen.find((r) => r.doel.code === 'BK-0390-2.08')!.via).toEqual([
      { courseId: 'c-a', courseTitle: 'Onthaal', code: 'BK-0390-2.08', status: 'gedekt' },
    ]);
    expect(d.rijen.find((r) => r.doel.code === 'BK-0390-2.07')!.via).toEqual([
      { courseId: 'c-a', courseTitle: 'Onthaal', code: 'BK-0390-2.07', status: 'verdieping' },
    ]);
    expect(d.rijen.find((r) => r.doel.code === 'BK-0390-2.10')!.via).toEqual([]);
  });

  it('per cursus: telt mee of niet, met de reden en hoeveel competenties ze draagt', () => {
    expect(d.cursussen).toEqual([
      { courseId: 'c-a', titel: 'Onthaal', telt: true, draagtBij: 8, buitenKader: 0 },
      { courseId: 'c-b', titel: 'Recreatie', telt: true, draagtBij: 4, buitenKader: 0 },
      { courseId: 'c-f', titel: 'Teamwerk', telt: true, draagtBij: 2, buitenKader: 0 },
      { courseId: 'c-md', titel: 'Minimumdoelen', telt: false, reden: 'geen-verwijzingen', draagtBij: 0, buitenKader: 0 },
      { courseId: 'c-geen', titel: 'Zonder leerplan', telt: false, reden: 'geen-leerplan', draagtBij: 0, buitenKader: 0 },
      { courseId: 'c-weg', titel: 'Leerplan van een ander toestel', telt: false, reden: 'leerplan-ontbreekt', draagtBij: 0, buitenKader: 0 },
    ]);
    expect(d.zelfdeNummerAndereSet).toBe(0);
  });

  it('de zinnen voor het scherm', () => {
    expect(bkSamenvatting(d)).toBe(
      'Je cursussen dekken 8 van de 25 competenties. 3 competenties staan al gepland op een sectie die nog leeg is, 2 komen alleen in verdieping aan bod, 12 nog niet.',
    );
  });

  it('is precies dekkingMinimumdoelen met bkVerwijzingen; dezelfde invoer geeft hetzelfde resultaat', () => {
    expect(d).toEqual(dekkingMinimumdoelen(kader, BIJDRAGEN, [W_08], { verwijzingen: bkVerwijzingen }));
    expect(dekkingBk(kader, BIJDRAGEN, [W_08])).toEqual(d);
  });

  it('zonder de oefening telt 08 niet: de cursus heeft dan geen sectie die er iets over zegt', () => {
    const zonder = dekkingBk(kader, BIJDRAGEN, []);
    expect(statussen(zonder)['BK-0390-2.08']).toBe('open');
    expect(tellers(zonder)).toEqual({ totaal: 25, gedekt: 7, gepland: 3, verdieping: 2, open: 13, percent: 28 });
  });

  it('een vers geraamte: 0 % gedekt, alles wat in het leerplan staat is gepland', () => {
    const vers = dekkingBk(kader, [{ course: nieuweCursus('c-vers', 'Vers', LP_A), leerplan: LP_A }], []);
    expect(tellers(vers)).toEqual({ totaal: 25, gedekt: 0, gepland: 12, verdieping: 0, open: 13, percent: 0 });
    expect(bkSamenvatting(vers)).toBe('Je cursussen dekken 0 van de 25 competenties. 12 competenties staan al gepland op een sectie die nog leeg is, 0 komen alleen in verdieping aan bod, 13 nog niet.');
  });

  it('zonder cursussen: alles open, en de zin zegt het eerlijk', () => {
    const niets = dekkingBk(kader, [], []);
    expect(tellers(niets)).toEqual({ totaal: 25, gedekt: 0, gepland: 0, verdieping: 0, open: 25, percent: 0 });
    expect(bkSamenvatting(niets)).toBe('Nog geen cursus met competenties van deze beroepskwalificaties: de dekking is 0 van de 25 competenties.');
  });

  it('volledig gedekt is 100 %, en 24 van 25 is 96 %', () => {
    const lp = leerplanMet([alleVan(ONTHAAL), alleVan(RECREATIEF)]);
    const alles = nieuweCursus('c-alles', 'Alles', lp);
    for (const h of alles.chapters) for (const s of h.sections) s.blocks.push(tekstBlok(`t-${s.id}`));
    const vol = dekkingBk(kader, [{ course: alles, leerplan: lp }], []);
    expect(tellers(vol)).toEqual({ totaal: 25, gedekt: 25, gepland: 0, verdieping: 0, open: 0, percent: 100 });
    laatWeg(alles, 'BK-0464-1.13');
    const bijna = dekkingBk(kader, [{ course: alles, leerplan: lp }], []);
    expect(tellers(bijna)).toEqual({ totaal: 25, gedekt: 24, gepland: 0, verdieping: 0, open: 1, percent: 96 });
  });

  it('een kader zonder competenties: 0 van 0, 0 %', () => {
    const leeg = dekkingBk([], BIJDRAGEN, [W_08]);
    expect(tellers(leeg)).toEqual({ totaal: 0, gedekt: 0, gepland: 0, verdieping: 0, open: 0, percent: 0 });
    expect(leeg.rijen).toEqual([]);
  });
});

// ── Dezelfde competentie via een andere versie ──────────────────────────────

describe('dekkingBk: dezelfde competentie via een andere versie (zelfdeNummerAndereSet)', () => {
  // BK-9999-1 en BK-9999-2 delen één competentiecode: bkc9999101 ("Werkt veilig met het materiaal").
  const regel = (bk: string, onderdelen: number[]) => ({ bk, nummer: 'BK-9999', versie: Number(bk.slice(-1)), titel: 'Nagebootste beroepskwalificatie', onderdelen, alleOnderdelen: true });

  // De richting verwijst nu naar versie 2 (twee competenties: bkc9999101 en bkc9999201).
  const KADER_V2: RichtingBk = { herkomst: 'api', bks: [regel('BK-9999-2', [10])], bekrachtigingen: [] };
  const doelenV2 = bkKaderDoelen(KADER_V2, BESTANDEN);

  // Een oude cursus volgt versie 1 (drie competenties), alles uitgewerkt.
  const LP_V1 = leerplanMet([alleVan(NAGEBOOTST_1)], DG_9);
  const C_V1 = nieuweCursus('c-v1', 'Oude versie', LP_V1);
  for (const s of C_V1.chapters.flatMap((h) => h.sections)) s.blocks.push(tekstBlok(`t-${s.id}`));

  it('het kader van versie 2: 2 competenties, met de eerste ook in versie 1', () => {
    expect(doelenV2.map((d) => [d.set, d.id, d.code])).toEqual([
      ['BK-9999-2', 'bkc9999101', 'BK-9999-2.01'],
      ['BK-9999-2', 'bkc9999201', 'BK-9999-2.02'],
    ]);
  });

  it('een cursus op versie 1 dekt niets van versie 2, maar 1 competentie zou meetellen; de andere twee van versie 1 bestaan niet in versie 2', () => {
    const d = dekkingBk(doelenV2, [{ course: C_V1, leerplan: LP_V1 }], []);
    expect(tellers(d)).toEqual({ totaal: 2, gedekt: 0, gepland: 0, verdieping: 0, open: 2, percent: 0 });
    expect(d.zelfdeNummerAndereSet).toBe(1);
    expect(d.cursussen).toEqual([{ courseId: 'c-v1', titel: 'Oude versie', telt: true, draagtBij: 0, buitenKader: 3 }]);
  });

  it('andersom: de richting verwijst nog naar versie 1 en de cursus volgt versie 2: ook 1 competentie', () => {
    const kaderV1: RichtingBk = { herkomst: 'api', bks: [regel('BK-9999-1', [10])], bekrachtigingen: [] };
    const doelenV1 = bkKaderDoelen(kaderV1, BESTANDEN);
    expect(doelenV1).toHaveLength(3);
    const lp = leerplanMet([alleVan(NAGEBOOTST_2)], DG_9);
    const c = nieuweCursus('c-v2', 'Nieuwe versie', lp);
    for (const s of c.chapters.flatMap((h) => h.sections)) s.blocks.push(tekstBlok(`t-${s.id}`));
    const d = dekkingBk(doelenV1, [{ course: c, leerplan: lp }], []);
    expect(tellers(d)).toEqual({ totaal: 3, gedekt: 0, gepland: 0, verdieping: 0, open: 3, percent: 0 });
    expect(d.zelfdeNummerAndereSet).toBe(1);
    expect(d.cursussen[0]).toMatchObject({ draagtBij: 0, buitenKader: 2 });
  });

  it('volgt een andere cursus wel de versie van nu en dekt ze de competentie, dan telt die niet meer als "zou meetellen"', () => {
    const lp2 = leerplanMet([deelVan(NAGEBOOTST_2, 0, 1)], DG_9);
    const c2 = nieuweCursus('c-v2', 'Nieuwe versie', lp2);
    werkUit(c2, 'BK-9999-2.01');
    const d = dekkingBk(doelenV2, [{ course: C_V1, leerplan: LP_V1 }, { course: c2, leerplan: lp2 }], []);
    expect(tellers(d)).toEqual({ totaal: 2, gedekt: 1, gepland: 0, verdieping: 0, open: 1, percent: 50 });
    expect(d.zelfdeNummerAndereSet).toBe(0);
    expect(d.rijen[0].via).toEqual([{ courseId: 'c-v2', courseTitle: 'Nieuwe versie', code: 'BK-9999-2.01', status: 'gedekt' }]);
  });

  it('het kader van G-0009 vandaag (versie 1; de versie zonder bestand levert niets): een cursus op versie 2 laat 1 competentie zien', () => {
    const kaderVandaag = bkKader(KOPPELING, INDEX, richting('G-0009'), { groep: 'G-0009', soort: 'so' }, VANDAAG);
    expect(kaderVandaag.bks.map((b) => b.bk)).toEqual(['BK-9999-1', 'BK-9999-3'].sort());
    const doelen = bkKaderDoelen(kaderVandaag, BESTANDEN);
    expect(doelen).toHaveLength(3);
    const lp = leerplanMet([alleVan(NAGEBOOTST_2)], DG_9);
    const c = nieuweCursus('c-v2', 'Nieuwe versie', lp);
    const d = dekkingBk(doelen, [{ course: c, leerplan: lp }], []);
    expect(d.zelfdeNummerAndereSet).toBe(1);
    expect(d.totaal).toBe(3);
    expect(d.gepland).toBe(0);
  });
});

// ── De minimumdoelen en de competenties raken elkaar niet (N5) ──────────────

describe('dekkingBk en de dekking op minimumdoelen raken elkaar niet', () => {
  const kaderMd: KaderDoel[] = [
    { set: 'ODS_1', setNaam: 'Test', id: '1', code: '01.01', tekst: 'Eerste doel.', optioneel: false, verplichteSet: true },
  ];
  const lpBk = leerplanMet([alleVan(ONTHAAL)]);
  const cBk = nieuweCursus('c-bk', 'Onthaal', lpBk);
  const lpMd: Curriculum = {
    id: 'lp-md', title: 'MD', net: 'eigen', subject: 'x', level: '', createdAt: 0, updatedAt: 0,
    goals: [{ id: 'g1', code: 'MD1', text: 'Doel', refs: [{ set: 'ODS_1', id: '1', code: '1' }] }],
  };
  const cMd: Course = { ...createCourse('MD', ''), id: 'c-md', curriculumId: 'lp-md', chapters: [{ id: 'h', title: 'H', sections: [{ id: 's', title: 'S', blocks: [tekstBlok('t')], goalCodes: ['MD1'] }] }] };

  it('een BK-cursus telt niet mee op de minimumdoelen, en een cursus op minimumdoelen niet bij de competenties', () => {
    const md = dekkingMinimumdoelen(kaderMd, [{ course: cBk, leerplan: lpBk }, { course: cMd, leerplan: lpMd }], []);
    expect(md.cursussen.map((c) => [c.courseId, c.telt])).toEqual([['c-bk', false], ['c-md', true]]);
    expect(md.cursussen[0].reden).toBe('geen-verwijzingen');
    expect(md.gedekt).toBe(1);
    const kader = bkKaderDoelen(bkKader(KOPPELING, INDEX, INFO_8, { groep: 'G-0008', soort: 'so' }, VANDAAG), BESTANDEN);
    const bk = dekkingBk(kader, [{ course: cBk, leerplan: lpBk }, { course: cMd, leerplan: lpMd }], []);
    expect(bk.cursussen.map((c) => [c.courseId, c.telt])).toEqual([['c-bk', true], ['c-md', false]]);
    expect(bk.cursussen[1].reden).toBe('geen-verwijzingen');
    expect(bk.gepland).toBe(12);
  });

  it('een leerplan met beide soorten verwijzingen telt in beide blokken, elk met zijn eigen verwijzingen', () => {
    const gemengd: Curriculum = {
      ...lpBk, id: 'lp-gemengd',
      goals: [
        { ...lpBk.goals[0], refs: [{ set: 'ODS_1', id: '1', code: '1' }] },
        ...lpBk.goals.slice(1),
      ],
    };
    const c = nieuweCursus('c-gemengd', 'Gemengd', gemengd);
    const md = dekkingMinimumdoelen(kaderMd, [{ course: c, leerplan: gemengd }], []);
    expect(md.gepland).toBe(1);
    expect(md.cursussen[0]).toMatchObject({ telt: true, draagtBij: 1 });
    const bk = dekkingBk(bkKaderDoelen(bkKader(KOPPELING, INDEX, INFO_8, { groep: 'G-0008', soort: 'so' }, VANDAAG), BESTANDEN), [{ course: c, leerplan: gemengd }], []);
    expect(bk.gepland).toBe(12);
    expect(bk.cursussen[0]).toMatchObject({ telt: true, draagtBij: 12 });
  });
});
