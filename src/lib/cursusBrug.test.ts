// De logica van de brug van een doelenlijst naar een cursus (docs/LEERPLANNEN.md § 16.5, pakket S-B): een cursus voor een
// leerplan zonder studierichting (`cursusVoorRichting` met een optionele doelgroep), een bestaande cursus aan een leerplan
// hangen (`koppelCursusAanLeerplan`, met een nagebootste opslag zoals `GatenOpslag` in gatenCursus.test.ts) en de rijen van het
// venster "Gebruik deze doelen in een cursus" (`koppelRijen`).

import { describe, expect, it } from 'vitest';
import { createCourse, getCourse, saveCourseGuarded, type GuardedSaveResult } from './courses';
import type { Course } from './courseTypes';
import { createCurriculum } from './curriculum';
import type { Curriculum } from './curriculumTypes';
import type { Doelgroep } from './doelgroep';
import {
  cursusVoorRichting, koppelCursusAanLeerplan, koppelRijen, passendeCodes, type KoppelOpslag,
} from './richtingCursus';

// ── Een leerplan zoals "Stel je eigen doelenlijst samen" het bewaart: een hoofdstuk per set, een rubriek per thema ──

function leerplan(titel = 'Basisgeletterdheid · 1ste graad A-stroom', extra: Partial<Curriculum> = {}): Curriculum {
  return createCurriculum({
    title: titel, net: 'minimumdoelen', subject: '', level: '',
    goals: [
      { id: 'g1', code: 'BG01.01', text: 'De leerlingen lezen een tekst en halen de hoofdgedachte eruit.', theme: 'Nederlands › Lezen' },
      { id: 'g2', code: 'BG01.02', text: 'De leerlingen schrijven een korte tekst voor een lezer.', theme: 'Nederlands › Schrijven' },
      { id: 'g3', code: 'BG02.01', text: 'De leerlingen rekenen met procenten.', theme: 'Wiskunde › Getallen' },
      { id: 'g4', code: 'BG02.02', text: 'De leerlingen lezen een grafiek.', theme: 'Wiskunde › Getallen' },
      { id: 'g5', code: 'BG03.01', text: 'De leerlingen gebruiken een tekstverwerker.', theme: 'Digitaal' },
    ],
    ...extra,
  });
}

const codesOpSecties = (c: Course): string[] => c.chapters.flatMap((h) => h.sections.flatMap((s) => s.goalCodes ?? []));

describe('cursusVoorRichting zonder doelgroep', () => {
  const lp = leerplan();

  it('met een geraamte: gekoppeld aan het leerplan, met de codes van het leerplan op de secties', () => {
    const c = cursusVoorRichting({ titel: ' Basisgeletterdheid in de klas ', auteur: 'Juf An', leerplan: lp, start: 'geraamte' });
    expect(c.title).toBe('Basisgeletterdheid in de klas');
    expect(c.author).toBe('Juf An');
    expect(c.curriculumId).toBe(lp.id);
    expect(codesOpSecties(c)).toEqual(['BG01.01', 'BG01.02', 'BG02.01', 'BG02.02', 'BG03.01']);
    expect(c.chapters.map((h) => h.title)).toEqual(['Nederlands', 'Wiskunde', 'Digitaal']);
    expect(c.chapters[0].sections.map((s) => s.title)).toEqual(['Lezen', 'Schrijven']);
    expect(c.chapters[1].sections.map((s) => s.goalCodes)).toEqual([['BG02.01', 'BG02.02']]);
  });

  it('zonder doelgroep: de cursus krijgt geen doelgroep en geen ondertitel', () => {
    const c = cursusVoorRichting({ titel: 'X', auteur: '', leerplan: lp, start: 'geraamte' });
    expect(c.doelgroep).toBeUndefined();
    expect(c.subtitle).toBeUndefined();
    expect(c).not.toHaveProperty('doelgroep');
    expect(c).not.toHaveProperty('subtitle');
  });

  it('een ongeldige doelgroep telt als geen doelgroep', () => {
    const c = cursusVoorRichting({ titel: 'X', auteur: '', doelgroep: { groep: 'kapot' } as unknown as Doelgroep, leerplan: lp, start: 'geraamte' });
    expect(c.doelgroep).toBeUndefined();
    expect(c.subtitle).toBeUndefined();
    expect(c.curriculumId).toBe(lp.id);
  });

  it("'leeg': het ene lege hoofdstuk van createCourse, zonder doelcodes, maar wel aan het leerplan gekoppeld", () => {
    const c = cursusVoorRichting({ titel: 'Leeg', auteur: '', leerplan: lp, start: 'leeg' });
    expect(c.curriculumId).toBe(lp.id);
    expect(codesOpSecties(c)).toEqual([]);
    expect(c.chapters).toHaveLength(1);
    expect(c.chapters[0].title).toBe(createCourse('Leeg').chapters[0].title);
    expect(c.chapters[0].sections[0].goalCodes).toBeUndefined();
  });

  it('een leerplan zonder bruikbare codes geeft ook met een geraamte het lege hoofdstuk', () => {
    const leeg = createCurriculum({ title: 'Leeg', net: 'minimumdoelen', subject: '', level: '', goals: [{ id: 'a', code: '  ', text: 'Zonder code.' }] });
    const c = cursusVoorRichting({ titel: 'X', auteur: '', leerplan: leeg, start: 'geraamte' });
    expect(c.curriculumId).toBe(leeg.id);
    expect(c.chapters).toHaveLength(1);
    expect(codesOpSecties(c)).toEqual([]);
  });

  it('met de doelgroep van het leerplan (zonder jaar en zonder kader): ondertitel en doelgroep, geen kadervelden', () => {
    const doelgroep: Doelgroep = { groep: 'G-0100', titel: 'Testrichting', soort: 'so', graad: 2, kader: 'a'.repeat(64), volgtKader: true };
    const metRichting = leerplan('Met richting', { doelgroep });
    const c = cursusVoorRichting({ titel: 'X', auteur: '', doelgroep: metRichting.doelgroep, leerplan: metRichting, start: 'leeg' });
    expect(c.doelgroep).toEqual({ groep: 'G-0100', titel: 'Testrichting', soort: 'so', graad: 2 });
    expect(c.subtitle).toBe('Testrichting · 2de graad');
  });

  it('verandert het leerplan dat je meegeeft niet', () => {
    const voor = JSON.stringify(lp);
    cursusVoorRichting({ titel: 'X', auteur: '', leerplan: lp, start: 'geraamte' });
    expect(JSON.stringify(lp)).toBe(voor);
  });
});

// ── Een cursus aan een leerplan hangen ──────────────────────────────────────

/** Een nagebootste opslag voor `koppelCursusAanLeerplan`, zoals `NepOpslag` in gatenCursus.test.ts. */
class NepOpslag implements KoppelOpslag {
  cursussen = new Map<string, Course>();
  log: string[] = [];
  cursusVol = false;
  gooitBijLezen = false;
  gooitBijSchrijven = false;
  /** Draait vlak nadat de cursus gelezen is: een ander tabblad dat intussen iets verandert. */
  naLezen?: () => void;
  /** Dwingt het antwoord van `saveCourseGuarded` af. */
  guardedAntwoord?: GuardedSaveResult;

  getCourse(id: string): Course | undefined {
    if (this.gooitBijLezen) throw new Error('opslag geblokkeerd');
    const c = this.cursussen.get(id);
    const kopie = c ? (JSON.parse(JSON.stringify(c)) as Course) : undefined;
    this.naLezen?.();
    return kopie;
  }

  saveCourseGuarded(c: Course, verwacht: number): GuardedSaveResult {
    this.log.push(`guarded:${c.id}:${verwacht}`);
    if (this.gooitBijSchrijven) throw new Error('opslag geblokkeerd');
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

/** Een cursus met een geraamte voor `lp`, zoals de brug ze maakt, met een vaste updatedAt. */
function cursusVoor(lp: Curriculum | undefined, titel = 'Nederlands 1A'): Course {
  const basis = lp
    ? cursusVoorRichting({ titel, auteur: 'Juf An', leerplan: lp, start: 'geraamte' })
    : createCourse(titel, 'Juf An');
  return { ...basis, updatedAt: 5000 };
}

describe('KoppelOpslag', () => {
  it('past op de echte functies van de opslag (type-controle)', () => {
    const echt: KoppelOpslag = { getCourse, saveCourseGuarded };
    expect(Object.keys(echt)).toHaveLength(2);
  });
});

describe('koppelCursusAanLeerplan', () => {
  const nieuw = leerplan('Nieuwe lijst');
  const oud = leerplan('Oud leerplan');

  it('zet alleen curriculumId en updatedAt: de rest van de cursus is diep gelijk', () => {
    const opslag = new NepOpslag();
    const cursus = cursusVoor(oud);
    opslag.cursussen.set(cursus.id, cursus);
    const r = koppelCursusAanLeerplan({ courseId: cursus.id, leerplanId: nieuw.id }, opslag);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const bewaard = opslag.cursussen.get(cursus.id)!;
    expect(bewaard.curriculumId).toBe(nieuw.id);
    expect(bewaard.updatedAt).toBe(5001);
    const { curriculumId: _a, updatedAt: _b, ...restNa } = bewaard;
    const { curriculumId: _c, updatedAt: _d, ...restVoor } = cursus;
    void _a; void _b; void _c; void _d;
    expect(restNa).toEqual(restVoor);
    // De doelcodes op de secties blijven, ook al staan ze niet in de nieuwe lijst.
    expect(codesOpSecties(bewaard)).toEqual(codesOpSecties(cursus));
    // Het resultaat is de bewaarde cursus, met de nieuwe versie.
    expect(r.course).toEqual(bewaard);
  });

  it('bewaakt het bewaren met de versie die ze net las', () => {
    const opslag = new NepOpslag();
    const cursus = cursusVoor(undefined);
    opslag.cursussen.set(cursus.id, cursus);
    koppelCursusAanLeerplan({ courseId: cursus.id, leerplanId: nieuw.id }, opslag);
    expect(opslag.log).toEqual([`guarded:${cursus.id}:5000`]);
  });

  it('een cursus zonder leerplan wordt gekoppeld', () => {
    const opslag = new NepOpslag();
    const cursus = cursusVoor(undefined);
    expect(cursus.curriculumId).toBeUndefined();
    opslag.cursussen.set(cursus.id, cursus);
    const r = koppelCursusAanLeerplan({ courseId: cursus.id, leerplanId: nieuw.id }, opslag);
    expect(r).toMatchObject({ ok: true });
    expect(opslag.cursussen.get(cursus.id)?.curriculumId).toBe(nieuw.id);
  });

  it('leest de cursus opnieuw: wat elders veranderde vóór het lezen, blijft staan', () => {
    const opslag = new NepOpslag();
    const cursus = cursusVoor(oud);
    opslag.cursussen.set(cursus.id, cursus);
    // Het venster ging open met `cursus`; intussen kreeg de cursus elders een nieuwe titel.
    opslag.cursussen.set(cursus.id, { ...cursus, title: 'Nieuwe titel van elders', updatedAt: 6000 });
    const r = koppelCursusAanLeerplan({ courseId: cursus.id, leerplanId: nieuw.id }, opslag);
    expect(r.ok).toBe(true);
    const bewaard = opslag.cursussen.get(cursus.id)!;
    expect(bewaard.title).toBe('Nieuwe titel van elders');
    expect(bewaard.curriculumId).toBe(nieuw.id);
    expect(opslag.log).toEqual([`guarded:${cursus.id}:6000`]);
  });

  it('hangt de cursus al aan deze lijst, dan wordt er niets geschreven', () => {
    const opslag = new NepOpslag();
    const cursus = cursusVoor(nieuw);
    opslag.cursussen.set(cursus.id, cursus);
    const r = koppelCursusAanLeerplan({ courseId: cursus.id, leerplanId: nieuw.id }, opslag);
    expect(r).toEqual({ ok: true, course: cursus });
    expect(opslag.log).toEqual([]);
    expect(opslag.cursussen.get(cursus.id)).toEqual(cursus);
  });

  it('een cursus die niet meer bestaat: verwijderd, niets geschreven', () => {
    const opslag = new NepOpslag();
    expect(koppelCursusAanLeerplan({ courseId: 'weg', leerplanId: nieuw.id }, opslag)).toEqual({ ok: false, reden: 'verwijderd' });
    expect(opslag.log).toEqual([]);
  });

  it('een cursus die tussen lezen en bewaren elders veranderde: gewijzigd, niets overschreven', () => {
    const opslag = new NepOpslag();
    const cursus = cursusVoor(oud);
    opslag.cursussen.set(cursus.id, cursus);
    opslag.naLezen = () => {
      opslag.cursussen.set(cursus.id, { ...cursus, title: 'Elders aangepast', updatedAt: 9000 });
      opslag.naLezen = undefined;
    };
    expect(koppelCursusAanLeerplan({ courseId: cursus.id, leerplanId: nieuw.id }, opslag)).toEqual({ ok: false, reden: 'gewijzigd' });
    expect(opslag.cursussen.get(cursus.id)).toMatchObject({ title: 'Elders aangepast', curriculumId: oud.id, updatedAt: 9000 });
  });

  it('een cursus die tussen lezen en bewaren verdween: verwijderd', () => {
    const opslag = new NepOpslag();
    const cursus = cursusVoor(oud);
    opslag.cursussen.set(cursus.id, cursus);
    opslag.naLezen = () => { opslag.cursussen.delete(cursus.id); };
    expect(koppelCursusAanLeerplan({ courseId: cursus.id, leerplanId: nieuw.id }, opslag)).toEqual({ ok: false, reden: 'verwijderd' });
  });

  it('een volle of geblokkeerde opslag: mislukt, de cursus blijft zoals ze was', () => {
    const vol = new NepOpslag();
    const cursus = cursusVoor(oud);
    vol.cursussen.set(cursus.id, cursus);
    vol.cursusVol = true;
    expect(koppelCursusAanLeerplan({ courseId: cursus.id, leerplanId: nieuw.id }, vol)).toEqual({ ok: false, reden: 'mislukt' });
    expect(vol.cursussen.get(cursus.id)).toEqual(cursus);

    const gooitLezen = new NepOpslag();
    gooitLezen.cursussen.set(cursus.id, cursus);
    gooitLezen.gooitBijLezen = true;
    expect(koppelCursusAanLeerplan({ courseId: cursus.id, leerplanId: nieuw.id }, gooitLezen)).toEqual({ ok: false, reden: 'mislukt' });

    const gooitSchrijven = new NepOpslag();
    gooitSchrijven.cursussen.set(cursus.id, cursus);
    gooitSchrijven.gooitBijSchrijven = true;
    expect(koppelCursusAanLeerplan({ courseId: cursus.id, leerplanId: nieuw.id }, gooitSchrijven)).toEqual({ ok: false, reden: 'mislukt' });
    expect(gooitSchrijven.cursussen.get(cursus.id)).toEqual(cursus);
  });

  it('geeft de reden van de bewaakte opslag door', () => {
    const opslag = new NepOpslag();
    const cursus = cursusVoor(oud);
    opslag.cursussen.set(cursus.id, cursus);
    opslag.guardedAntwoord = { ok: false, reason: 'gewijzigd', stored: cursus };
    expect(koppelCursusAanLeerplan({ courseId: cursus.id, leerplanId: nieuw.id }, opslag)).toEqual({ ok: false, reden: 'gewijzigd' });
    opslag.guardedAntwoord = { ok: false, reason: 'verwijderd' };
    expect(koppelCursusAanLeerplan({ courseId: cursus.id, leerplanId: nieuw.id }, opslag)).toEqual({ ok: false, reden: 'verwijderd' });
  });

  it('verandert de gelezen cursus niet in de opslag zelf', () => {
    const opslag = new NepOpslag();
    const cursus = cursusVoor(oud);
    opslag.cursussen.set(cursus.id, cursus);
    const voor = JSON.stringify(cursus);
    koppelCursusAanLeerplan({ courseId: cursus.id, leerplanId: nieuw.id }, opslag);
    expect(JSON.stringify(cursus)).toBe(voor);
  });
});

// ── De rijen van het venster ────────────────────────────────────────────────

describe('koppelRijen', () => {
  const lijst = leerplan('Mijn lijst');
  const ander = leerplan('Een ander leerplan');

  function cursus(titel: string, lp: Curriculum | undefined, gemaakt: number, extra: Partial<Course> = {}): Course {
    return { ...cursusVoor(lp, titel), createdAt: gemaakt, updatedAt: gemaakt, ...extra };
  }

  it('geeft de cursussen nieuwste eerst', () => {
    const rijen = koppelRijen([cursus('Oud', undefined, 100), cursus('Nieuw', undefined, 300), cursus('Midden', undefined, 200)], [], lijst);
    expect(rijen.map((r) => r.course.title)).toEqual(['Nieuw', 'Midden', 'Oud']);
  });

  it('bij gelijke datum: laatste wijziging eerst, dan op titel', () => {
    const a = cursus('Beta', undefined, 100, { updatedAt: 100 });
    const b = cursus('Alfa', undefined, 100, { updatedAt: 100 });
    const c = cursus('Gamma', undefined, 100, { updatedAt: 500 });
    expect(koppelRijen([a, b, c], [], lijst).map((r) => r.course.title)).toEqual(['Gamma', 'Alfa', 'Beta']);
  });

  it('zegt waar een cursus aan hangt: niets, een ander leerplan, of deze lijst', () => {
    const zonder = cursus('Zonder', undefined, 1);
    const metAnder = cursus('Met ander', ander, 2);
    const metDeze = cursus('Met deze', lijst, 3);
    const rijen = koppelRijen([zonder, metAnder, metDeze], [lijst, ander], lijst);
    const perTitel = new Map(rijen.map((r) => [r.course.title, r] as const));
    expect(perTitel.get('Zonder')).toMatchObject({ dezeLijst: false });
    expect(perTitel.get('Zonder')?.oud).toBeUndefined();
    expect(perTitel.get('Met ander')).toMatchObject({ dezeLijst: false, oud: 'Een ander leerplan' });
    expect(perTitel.get('Met deze')).toMatchObject({ dezeLijst: true });
    expect(perTitel.get('Met deze')?.oud).toBeUndefined();
  });

  it('een leerplan dat niet meer op dit toestel staat, telt als geen leerplan', () => {
    const [rij] = koppelRijen([cursus('Weeskind', ander, 1)], [lijst], lijst);
    expect(rij.dezeLijst).toBe(false);
    expect(rij.oud).toBeUndefined();
  });

  it('telt de doelcodes van de cursus die in de lijst staan, alleen als de cursus er heeft', () => {
    const leeg = cursus('Zonder codes', ander, 1, { chapters: createCourse('x').chapters });
    const gedeeltelijk = cursus('Gedeeltelijk', ander, 2, { chapters: createCourse('x').chapters });
    gedeeltelijk.chapters[0].sections[0].goalCodes = ['bg01.01', 'XX.99'];
    const rijen = koppelRijen([leeg, gedeeltelijk], [lijst, ander], lijst);
    const perTitel = new Map(rijen.map((r) => [r.course.title, r] as const));
    expect(perTitel.get('Zonder codes')?.codes).toBeUndefined();
    expect(perTitel.get('Gedeeltelijk')?.codes).toEqual({ passend: 1, totaal: 2 });
    expect(perTitel.get('Gedeeltelijk')?.codes).toEqual(passendeCodes(gedeeltelijk, lijst));
  });

  it('verandert de invoer niet en geeft bij geen cursussen een lege lijst', () => {
    const invoer = [cursus('B', undefined, 1), cursus('A', undefined, 2)];
    const voor = invoer.map((c) => c.title);
    koppelRijen(invoer, [], lijst);
    expect(invoer.map((c) => c.title)).toEqual(voor);
    expect(koppelRijen([], [lijst], lijst)).toEqual([]);
  });
});
