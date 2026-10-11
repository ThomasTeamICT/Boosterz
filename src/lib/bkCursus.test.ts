import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BK_BRON, doelcodesVanBestand, splitsBk, valideerBkBestand, type BkBestand, type BkTekst, type Competentie } from './beroepskwalificaties';
import { bkGeraamte, cursusVoorBk } from './bkCursus';
import { leerplanUitBk, type BkKeuze } from './bkLeerplan';
import { sanitizeCourse } from './courses';
import type { Course, CourseChapter } from './courseTypes';
import { computeCoverage, geplandeRijen } from './coverage';
import { createCurriculum, shortGoalText } from './curriculum';
import type { Curriculum } from './curriculumTypes';
import type { Doelgroep } from './doelgroep';
import { cursusVoorRichting } from './richtingCursus';
import { doelgroepVan, richtingInfo, type RichtingInfo } from './richtingKader';
import { sha256Hex } from './sha256';
import type { MatrixBestand } from './studierichtingen';

// ── Fixtures ────────────────────────────────────────────────────────────────

const HIER = fileURLToPath(new URL('.', import.meta.url));
const lees = (pad: string): unknown => JSON.parse(readFileSync(join(HIER, '../../tests/fixtures', pad), 'utf8'));

const VANDAAG = '2026-10-10';
const MATRIX = lees('structuur/uit/studierichtingen.json') as MatrixBestand;
const ONTHAAL = lees('kwalificaties/uit/bk/BK-0390-2.json') as BkBestand;
const RECREATIEF = lees('kwalificaties/uit/bk/BK-0464-1.json') as BkBestand;
const NAGEBOOTST_1 = lees('kwalificaties/uit/bk/BK-9999-1.json') as BkBestand;
const NAGEBOOTST_2 = lees('kwalificaties/uit/bk/BK-9999-2.json') as BkBestand;
const BESTANDEN: ReadonlyMap<string, BkBestand> = new Map([ONTHAAL, RECREATIEF, NAGEBOOTST_1, NAGEBOOTST_2].map((b) => [b.bk, b]));

const INFO_8: RichtingInfo = (() => {
  const i = richtingInfo(MATRIX, 'G-0008', VANDAAG);
  if (!i) throw new Error('G-0008 ontbreekt in de structuurfixtures');
  return i;
})();
const DG: Doelgroep = doelgroepVan(INFO_8, { groep: 'G-0008', soort: 'so', jaar: 3 });

const ids = (b: BkBestand) => b.competenties.map((c) => c.id);
const alleVan = (b: BkBestand): BkKeuze => ({ bestand: b, competenties: ids(b) });
const merkVan = (b: BkBestand) => b.sha256.slice(0, 16);

/** Een nagekeken BK-leerplan met de gegeven keuzes. */
function leerplanMet(keuzes: BkKeuze[]): Curriculum {
  const merken = new Map(keuzes.map((k) => [k.bestand.bk, merkVan(k.bestand)] as const));
  const u = leerplanUitBk(keuzes, { doelgroep: DG, merken });
  expect(u.bevestigd, u.waarschuwingen.join(' | ')).toBe(true);
  return u.leerplan;
}

/** Een eigen BK-bestand dat door de validator komt, met zelfgekozen kennis en vaardigheden per competentie. */
function maakBk(
  bk: string,
  titel: string,
  competenties: { tekst: string; kennis?: BkTekst[]; vaardigheden?: BkTekst[]; type?: string }[],
): BkBestand {
  const delen = splitsBk(bk) as { nummer: string; versie: number };
  const lijst: Competentie[] = competenties.map((c, i) => ({
    id: `bkc9${delen.nummer.slice(3)}${String(i + 1).padStart(4, '0')}`,
    nr: i + 1,
    type: c.type ?? 'Vakspecifieke competentie',
    tekst: c.tekst,
    kennis: c.kennis ?? [],
    vaardigheden: c.vaardigheden ?? [],
  }));
  const b: BkBestand = {
    app: 'boosterz', kind: 'beroepskwalificatie', v: 1, bk, nummer: delen.nummer, versie: delen.versie, titel, status: 'ERKEND',
    bron: BK_BRON, api: `https://onderwijs.api.vlaanderen.be/kwalificaties-en-curriculum/beroepskwalificaties/v2/beroepskwalificatie/${bk}`,
    naamsvermelding: 'Bron: test', licentie: 'nog te bevestigen', opgehaald: '2026-10-10T00:00:00Z', aantal: lijst.length,
    sha256: sha256Hex(`${bk}|${titel}|${JSON.stringify(lijst)}`), competenties: lijst,
  };
  const fouten = valideerBkBestand(b, bk);
  if (fouten.length > 0) throw new Error(`maakBk: ${fouten.join(' ')}`);
  return b;
}

const kennis = (n: number, voorvoegsel = 'Kennis'): BkTekst[] => Array.from({ length: n }, (_, i) => ({ type: 'Kennis', tekst: `${voorvoegsel} ${i + 1}` }));
const vaardigheden = (n: number, voorvoegsel = 'Vaardigheid'): BkTekst[] => Array.from({ length: n }, (_, i) => ({ type: 'Cognitieve vaardigheden', tekst: `${voorvoegsel} ${i + 1}` }));

const sectiesVan = (ch: readonly CourseChapter[]) => ch.flatMap((c) => c.sections);
const codesVan = (ch: readonly CourseChapter[]) => sectiesVan(ch).flatMap((s) => s.goalCodes ?? []);
const blokTekst = (b: CourseChapter['sections'][number]['blocks'][number]) => (b.type === 'callout' ? b.text : '');

// ── bkGeraamte: één beroepskwalificatie ─────────────────────────────────────

describe('bkGeraamte: alle 12 competenties van Onthaalmedewerker', () => {
  const lp = leerplanMet([alleVan(ONTHAAL)]);
  const ch = bkGeraamte(lp, BESTANDEN);
  const codes = Array.from({ length: 12 }, (_, i) => `BK-0390-2.${String(i + 1).padStart(2, '0')}`);

  it('één hoofdstuk met de titel van de beroepskwalificatie en een sectie per competentie, in de volgorde van het bestand', () => {
    expect(ch).toHaveLength(1);
    expect(ch[0].title).toBe('Onthaalmedewerker');
    expect(ch[0].sections).toHaveLength(12);
    expect(ch[0].sections.map((s) => s.goalCodes)).toEqual(codes.map((c) => [c]));
    expect(ch[0].sections[0].title).toBe('Werkt in teamverband');
    expect(ch[0].sections[1].title).toBe('Nagebootste competentie 2 van Onthaalmedewerker');
    for (const s of ch[0].sections) expect(s.optional).toBeFalsy();
  });

  it('blok 1: een doelen-callout "Doel in deze sectie" met "<code> — <tekst>"', () => {
    const blok = ch[0].sections[0].blocks[0];
    expect(blok).toMatchObject({ type: 'callout', kind: 'goal', title: 'Doel in deze sectie', text: 'BK-0390-2.01 — Werkt in teamverband' });
    expect(blokTekst(ch[0].sections[11].blocks[0])).toBe('BK-0390-2.12 — Nagebootste competentie 12 van Onthaalmedewerker');
  });

  it('blok 2: kennis en vaardigheden letterlijk uit het bestand, kennis eerst', () => {
    expect(ch[0].sections[0].blocks).toHaveLength(2);
    expect(ch[0].sections[0].blocks[1]).toMatchObject({ type: 'callout', kind: 'goal', title: 'Kennis en vaardigheden uit de beroepskwalificatie' });
    expect(blokTekst(ch[0].sections[0].blocks[1])).toBe(
      'Kennis: Kennis van de bedrijfscultuur, procedures en regels in functie van de uitvoering van dit beroep\n'
      + 'Vaardigheid: Wisselt informatie uit met collega’s en eindverantwoordelijke',
    );
    expect(blokTekst(ch[0].sections[1].blocks[1])).toBe('Kennis: Nagebootste kennis bij competentie 2\nVaardigheid: Nagebootste vaardigheid bij competentie 2');
  });

  it('de codes zijn die van het leerplan, en elke code staat in precies één niet-optionele sectie (§ 12.2)', () => {
    expect(codesVan(ch)).toEqual(lp.goals.map((g) => g.code));
    expect(codesVan(ch)).toEqual(codes);
    expect(new Set(codesVan(ch)).size).toBe(12);
    expect(codesVan(ch)).toEqual([...doelcodesVanBestand(ONTHAAL).values()]);
  });

  it('beide blokken zijn doelen-callouts: elke sectie telt in de dekking als gepland, niet als gedekt', () => {
    const cursus = cursusVoorBk({ titel: 'Onthaal', auteur: 'Juf An', doelgroep: DG, leerplan: lp, bestanden: BESTANDEN, start: 'geraamte' });
    const dekking = computeCoverage(cursus, lp, []);
    expect(dekking.covered).toBe(12);
    expect(geplandeRijen(dekking, cursus)).toHaveLength(12);
  });

  it('id\'s zijn uniek binnen het geraamte', () => {
    const alle = ch.flatMap((c) => [c.id, ...c.sections.flatMap((s) => [s.id, ...s.blocks.map((b) => b.id)])]);
    expect(new Set(alle).size).toBe(alle.length);
  });

  it('verandert het leerplan en de bestanden niet', () => {
    const voor = JSON.stringify([lp, ONTHAAL]);
    bkGeraamte(lp, BESTANDEN);
    expect(JSON.stringify([lp, ONTHAAL])).toBe(voor);
  });
});

// ── bkGeraamte: meer beroepskwalificaties en een deel ───────────────────────

describe('bkGeraamte: meer beroepskwalificaties en een deelselectie', () => {
  it('een hoofdstuk per BK-versie in de gekozen volgorde: 12 + 13 secties, 25 verschillende codes', () => {
    const lp = leerplanMet([alleVan(RECREATIEF), alleVan(ONTHAAL)]);
    const ch = bkGeraamte(lp, BESTANDEN);
    expect(ch.map((c) => c.title)).toEqual(['Recreatief medewerker', 'Onthaalmedewerker']);
    expect(ch.map((c) => c.sections.length)).toEqual([13, 12]);
    expect(codesVan(ch)).toHaveLength(25);
    expect(new Set(codesVan(ch)).size).toBe(25);
    expect(codesVan(ch)[0]).toBe('BK-0464-1.01');
    expect(codesVan(ch)[13]).toBe('BK-0390-2.01');
  });

  it('een deelselectie van 4 van 12 geeft precies 4 secties (de valkuil: nooit stil de hele beroepskwalificatie)', () => {
    const vier = ONTHAAL.competenties.slice(2, 6).map((c) => c.id);
    const lp = leerplanMet([{ bestand: ONTHAAL, competenties: vier }]);
    const ch = bkGeraamte(lp, BESTANDEN);
    expect(sectiesVan(ch)).toHaveLength(4);
    expect(codesVan(ch)).toEqual(['BK-0390-2.03', 'BK-0390-2.04', 'BK-0390-2.05', 'BK-0390-2.06']);
  });

  it('twee beroepskwalificaties met dezelfde titel krijgen elk een eigen hoofdstuk, met het nummer erachter', () => {
    const a = maakBk('BK-1111-1', 'Zelfde titel', [{ tekst: 'Eerste.' }]);
    const b = maakBk('BK-2222-1', 'Zelfde titel', [{ tekst: 'Tweede.' }]);
    const lp = leerplanMet([alleVan(a), alleVan(b)]);
    const ch = bkGeraamte(lp, new Map([[a.bk, a], [b.bk, b]]));
    expect(ch.map((c) => c.title)).toEqual(['Zelfde titel (BK-1111)', 'Zelfde titel (BK-2222)']);
    expect(codesVan(ch)).toEqual(['BK-1111-1.01', 'BK-2222-1.01']);
  });

  it('met codes: alleen die doelen, in de volgorde van het leerplan; kleine letters en witruimte tellen niet, onbekende codes doen niets', () => {
    const lp = leerplanMet([alleVan(ONTHAAL)]);
    const ch = bkGeraamte(lp, BESTANDEN, ['bk-0390-2.05', ' BK-0390-2.02 ', 'BK-0390-2.99', 'bestaat niet']);
    expect(codesVan(ch)).toEqual(['BK-0390-2.02', 'BK-0390-2.05']);
    expect(bkGeraamte(lp, BESTANDEN, [])).toEqual([]);
    expect(bkGeraamte(lp, BESTANDEN, ['bestaat niet'])).toEqual([]);
  });

  it('met codes uit twee beroepskwalificaties: een hoofdstuk zonder gekozen competenties komt er niet', () => {
    const lp = leerplanMet([alleVan(ONTHAAL), alleVan(RECREATIEF)]);
    const ch = bkGeraamte(lp, BESTANDEN, ['BK-0464-1.03']);
    expect(ch.map((c) => c.title)).toEqual(['Recreatief medewerker']);
    expect(codesVan(ch)).toEqual(['BK-0464-1.03']);
  });

  it('een leerplan zonder doelen geeft geen hoofdstukken', () => {
    const leeg = createCurriculum({ title: 'Leeg', net: 'beroepskwalificaties', subject: 'x', level: '', kind: 'leerplan', source: '', goals: [] });
    expect(bkGeraamte(leeg, BESTANDEN)).toEqual([]);
  });
});

// ── bkGeraamte: ontbrekende bestanden ───────────────────────────────────────

describe('bkGeraamte: een ontbrekend bestand geeft geen blok 2', () => {
  const lp = leerplanMet([alleVan(ONTHAAL), alleVan(RECREATIEF)]);

  it('zonder bestand: nog altijd een sectie per competentie met blok 1, maar nergens blok 2', () => {
    const ch = bkGeraamte(lp, new Map());
    expect(sectiesVan(ch)).toHaveLength(25);
    for (const s of sectiesVan(ch)) {
      expect(s.blocks).toHaveLength(1);
      expect(s.blocks[0]).toMatchObject({ type: 'callout', kind: 'goal', title: 'Doel in deze sectie' });
    }
    expect(ch.map((c) => c.title)).toEqual(['Onthaalmedewerker', 'Recreatief medewerker']);
  });

  it('het bestand van één beroepskwalificatie ontbreekt: alleen de andere heeft blok 2', () => {
    const ch = bkGeraamte(lp, new Map([[RECREATIEF.bk, RECREATIEF]]));
    expect(ch[0].sections.every((s) => s.blocks.length === 1)).toBe(true);
    expect(ch[1].sections.every((s) => s.blocks.length === 2)).toBe(true);
  });

  it('een bestand van een andere versie (of een kapotte lijst) telt niet', () => {
    const verkeerd = new Map<string, BkBestand>([[ONTHAAL.bk, NAGEBOOTST_1], [RECREATIEF.bk, { ...RECREATIEF, competenties: 'kapot' as unknown as Competentie[] }]]);
    const ch = bkGeraamte(lp, verkeerd);
    expect(sectiesVan(ch).every((s) => s.blocks.length === 1)).toBe(true);
    expect(codesVan(ch)).toHaveLength(25);
  });

  it('ook een bestand van een andere versie met dezelfde competentiecodes telt niet: de kennis kan in die versie anders zijn', () => {
    const volgende: BkBestand = { ...ONTHAAL, bk: 'BK-0390-3', versie: 3 };
    const ch = bkGeraamte(leerplanMet([alleVan(ONTHAAL)]), new Map([[ONTHAAL.bk, volgende]]));
    expect(sectiesVan(ch)).toHaveLength(12);
    expect(sectiesVan(ch).every((s) => s.blocks.length === 1)).toBe(true);
    expect(sectiesVan(bkGeraamte(leerplanMet([alleVan(ONTHAAL)]), new Map([[ONTHAAL.bk, ONTHAAL]]))).every((s) => s.blocks.length === 2)).toBe(true);
  });

  it('een competentie die niet (meer) in het bestand staat, of zonder kennis en zonder vaardigheden: geen blok 2', () => {
    const kaal = maakBk('BK-0390-2', 'Onthaalmedewerker', ONTHAAL.competenties.map((c) => ({ tekst: c.tekst })));
    const ch = bkGeraamte(leerplanMet([alleVan(ONTHAAL)]), new Map([[kaal.bk, kaal]]));
    expect(sectiesVan(ch).every((s) => s.blocks.length === 1)).toBe(true);
    const anderId = maakBk('BK-0390-2', 'Onthaalmedewerker', [{ tekst: 'Werkt in teamverband', kennis: kennis(1) }]);
    const chAnders = bkGeraamte(leerplanMet([alleVan(ONTHAAL)]), new Map([[anderId.bk, anderId]]));
    expect(sectiesVan(chAnders).every((s) => s.blocks.length === 1)).toBe(true);
  });

  it('tolerant: geen Map, rare invoer, goederen zonder verwijzing', () => {
    expect(() => bkGeraamte(lp, undefined as unknown as Map<string, BkBestand>)).not.toThrow();
    expect(() => bkGeraamte(null as unknown as Curriculum, BESTANDEN)).not.toThrow();
    expect(bkGeraamte(null as unknown as Curriculum, BESTANDEN)).toEqual([]);
    const rommel = { ...lp, goals: [null, 'x', { id: 'a', code: '', text: 'Zonder code' }, { id: 'b', code: 'BK-0390-2.01', text: 'Een.', bkRefs: [null] }] } as unknown as Curriculum;
    const ch = bkGeraamte(rommel, BESTANDEN);
    expect(codesVan(ch)).toEqual(['BK-0390-2.01']);
  });
});

// ── bkGeraamte: de grenzen van blok 2 ───────────────────────────────────────

describe('bkGeraamte: de grenzen van blok 2 (hoogstens 12 regels, elk hoogstens 300 tekens, dan één zin)', () => {
  function blok2(c: { kennis?: BkTekst[]; vaardigheden?: BkTekst[] }): string[] {
    const b = maakBk('BK-3333-1', 'Grenzen', [{ tekst: 'Doet iets.', ...c }]);
    const ch = bkGeraamte(leerplanMet([alleVan(b)]), new Map([[b.bk, b]]));
    const blokken = ch[0].sections[0].blocks;
    return blokken.length === 2 ? blokTekst(blokken[1]).split('\n') : [];
  }
  const rest = (n: number) => `… en nog ${n}: zie ‘Beroepskwalificaties’ bij de studierichting.`;

  it('precies 12 regels: allemaal, geen extra zin', () => {
    const regels = blok2({ kennis: kennis(7), vaardigheden: vaardigheden(5) });
    expect(regels).toHaveLength(12);
    expect(regels[0]).toBe('Kennis: Kennis 1');
    expect(regels[6]).toBe('Kennis: Kennis 7');
    expect(regels[7]).toBe('Vaardigheid: Vaardigheid 1');
    expect(regels[11]).toBe('Vaardigheid: Vaardigheid 5');
    expect(regels.join('\n')).not.toContain('… en nog');
  });

  it('13 regels: de eerste 12 en daarna "… en nog 1: zie ‘Beroepskwalificaties’ bij de studierichting."', () => {
    const regels = blok2({ kennis: kennis(8), vaardigheden: vaardigheden(5) });
    expect(regels).toHaveLength(13);
    expect(regels[11]).toBe('Vaardigheid: Vaardigheid 4');
    expect(regels[12]).toBe(rest(1));
  });

  it('20 regels: 12 en "… en nog 8: …"; bij veel kennis komen de vaardigheden pas na de kennis (en dus mogelijk niet meer)', () => {
    const regels = blok2({ kennis: kennis(14), vaardigheden: vaardigheden(6) });
    expect(regels).toHaveLength(13);
    expect(regels.slice(0, 12).every((r) => r.startsWith('Kennis: '))).toBe(true);
    expect(regels[12]).toBe(rest(8));
  });

  it('elke regel hoogstens 300 tekens, met het voorvoegsel erbij, ingekort met een beletselteken', () => {
    const lang = 'woord '.repeat(100).trim();
    const regels = blok2({ kennis: [{ tekst: lang }], vaardigheden: [{ tekst: lang }] });
    expect(regels).toHaveLength(2);
    expect(regels[0]).toBe(shortGoalText(`Kennis: ${lang}`, 300));
    expect(regels[1]).toBe(shortGoalText(`Vaardigheid: ${lang}`, 300));
    for (const r of regels) {
      expect(r.length).toBe(300);
      expect(r.endsWith('…')).toBe(true);
    }
  });

  it('een kennistekst die precies op de grens past, blijft heel', () => {
    const tekst = 'x'.repeat(300 - 'Kennis: '.length);
    const regels = blok2({ kennis: [{ tekst }] });
    expect(regels).toEqual([`Kennis: ${tekst}`]);
  });

  it('HTML en regeleinden in de bron worden gewone tekst op één regel', () => {
    const regels = blok2({ kennis: [{ tekst: '<p>Kennis van <b>veilig</b></p><p>werken &amp; netheid</p>' }], vaardigheden: [{ tekst: 'Eerste\n  tweede' }] });
    expect(regels).toEqual(['Kennis: Kennis van veilig werken & netheid', 'Vaardigheid: Eerste tweede']);
  });

  it('zonder kennis en zonder vaardigheden: geen blok 2', () => {
    expect(blok2({})).toEqual([]);
    expect(blok2({ kennis: [{ tekst: '<p>&nbsp;</p>' }], vaardigheden: [{ tekst: '<br>&nbsp;' }] })).toEqual([]);
  });

  it('alleen vaardigheden, of alleen kennis: wel blok 2', () => {
    expect(blok2({ vaardigheden: vaardigheden(2) })).toEqual(['Vaardigheid: Vaardigheid 1', 'Vaardigheid: Vaardigheid 2']);
    expect(blok2({ kennis: kennis(1) })).toEqual(['Kennis: Kennis 1']);
  });

  it('de titels: hoofdstuk en sectie hoogstens 120 tekens; de sectietitel is het begin van de competentie (110 tekens)', () => {
    const lang = 'Competentie '.repeat(40).trim();
    const b = maakBk('BK-4444-1', 'T'.repeat(300), [{ tekst: lang }]);
    const lp = leerplanMet([alleVan(b)]);
    const ch = bkGeraamte(lp, new Map([[b.bk, b]]));
    expect(ch[0].title.length).toBeLessThanOrEqual(120);
    expect(ch[0].title.endsWith('…')).toBe(true);
    expect(ch[0].sections[0].title).toBe(shortGoalText(lang, 110));
    expect(ch[0].sections[0].title.length).toBe(110);
    expect(ch[0].sections[0].goalCodes).toEqual(['BK-4444-1.01']);
  });
});

// ── bkGeraamte: een leerplan dat geen BK-leerplan is ────────────────────────

describe('bkGeraamte: doelen zonder verwijzing naar een competentie', () => {
  it('krijgen toch een sectie (elke code in precies één sectie), per eerste deel van hun thema, zonder blok 2', () => {
    const lp = createCurriculum({
      title: 'Eigen', net: 'eigen', subject: 'x', level: '', kind: 'leerplan', source: '',
      goals: [
        { id: 'a', code: 'A1', text: 'Eerste.', theme: 'Thema A › Deel' },
        { id: 'b', code: 'B1', text: 'Tweede.', theme: 'Thema B' },
        { id: 'c', code: 'A2', text: 'Derde.', theme: 'Thema A › Ander deel' },
        { id: 'd', code: 'Z1', text: 'Vierde.' },
      ],
    });
    const ch = bkGeraamte(lp, BESTANDEN);
    expect(ch.map((c) => c.title)).toEqual(['Thema A', 'Thema B', 'Competenties']);
    expect(ch.map((c) => c.sections.map((s) => s.goalCodes))).toEqual([[['A1'], ['A2']], [['B1']], [['Z1']]]);
    expect(sectiesVan(ch).every((s) => s.blocks.length === 1)).toBe(true);
  });

  it('een code die twee keer voorkomt (ook in andere hoofdletters), komt in precies één sectie: de eerste', () => {
    const lp = createCurriculum({
      title: 'Dubbel', net: 'eigen', subject: 'x', level: '', kind: 'leerplan', source: '',
      goals: [
        { id: 'a', code: 'BK-0390-2.01', text: 'Eerste.', bkRefs: [{ bk: 'BK-0390-2', id: 'bkc0045062' }] },
        { id: 'b', code: 'bk-0390-2.01', text: 'Dubbel.', bkRefs: [{ bk: 'BK-0390-2', id: 'bkc9039002' }] },
        { id: 'c', code: 'BK-0390-2.02', text: 'Tweede.', bkRefs: [{ bk: 'BK-0390-2', id: 'bkc9039002' }] },
      ],
    });
    const ch = bkGeraamte(lp, BESTANDEN);
    expect(codesVan(ch)).toEqual(['BK-0390-2.01', 'BK-0390-2.02']);
    expect(sectiesVan(ch).map((s) => s.title)).toEqual(['Eerste.', 'Tweede.']);
  });
});

// ── cursusVoorBk ────────────────────────────────────────────────────────────

describe('cursusVoorBk', () => {
  const lp = leerplanMet([alleVan(ONTHAAL), alleVan(RECREATIEF)]);
  const invoer = { titel: ' Onthaal en recreatie ', auteur: 'Juf An', doelgroep: { ...DG, kader: 'a'.repeat(64), volgtKader: true as const }, leerplan: lp, bestanden: BESTANDEN };

  it('met een geraamte: het geraamte van bkGeraamte, het leerplan, de ondertitel en de doelgroep zonder kadervelden', () => {
    const c = cursusVoorBk({ ...invoer, start: 'geraamte' });
    expect(c.title).toBe('Onthaal en recreatie');
    expect(c.author).toBe('Juf An');
    expect(c.curriculumId).toBe(lp.id);
    expect(c.chapters.map((h) => h.title)).toEqual(['Onthaalmedewerker', 'Recreatief medewerker']);
    expect(codesVan(c.chapters)).toEqual(lp.goals.map((g) => g.code));
    expect(c.doelgroep).toMatchObject({ groep: 'G-0008', soort: 'so', jaar: 3 });
    expect(c.doelgroep).not.toHaveProperty('kader');
    expect(c.doelgroep).not.toHaveProperty('volgtKader');
    expect(c.subtitle).toBeTruthy();
    // Niet het geraamte van de minimumdoelen, dat alle competenties in één sectie "Vakspecifieke competentie" zet.
    const gewoon = cursusVoorRichting({ titel: 'x', auteur: '', doelgroep: DG, leerplan: lp, start: 'geraamte' });
    expect(c.chapters).not.toEqual(gewoon.chapters);
    expect(gewoon.chapters.flatMap((h) => h.sections).length).toBeLessThan(sectiesVan(c.chapters).length);
  });

  it('met codes: alleen die competenties op de secties', () => {
    const c = cursusVoorBk({ ...invoer, codes: ['BK-0464-1.02', 'BK-0390-2.01'], start: 'geraamte' });
    expect(codesVan(c.chapters)).toEqual(['BK-0390-2.01', 'BK-0464-1.02']);
  });

  it("'leeg': het ene lege hoofdstuk van createCourse, wel gekoppeld aan het leerplan en de richting", () => {
    const c = cursusVoorBk({ ...invoer, start: 'leeg' });
    expect(c.chapters).toHaveLength(1);
    expect(c.chapters[0].sections).toHaveLength(1);
    expect(c.chapters[0].sections[0].blocks).toEqual([]);
    expect(c.chapters[0].sections[0].goalCodes).toBeUndefined();
    expect(c.curriculumId).toBe(lp.id);
    expect(c.doelgroep?.groep).toBe('G-0008');
  });

  it('geen bruikbare doelen (codes die nergens passen): het lege hoofdstuk, geen terugval op het geraamte van de minimumdoelen', () => {
    const c = cursusVoorBk({ ...invoer, codes: ['bestaat niet'], start: 'geraamte' });
    expect(c.chapters).toHaveLength(1);
    expect(codesVan(c.chapters)).toEqual([]);
    expect(c.chapters[0].sections[0].blocks).toEqual([]);
  });

  it('sanitizeCourse laat het geraamte staan: hoofdstukken, secties, codes, blokken en niet-optioneel (zoals bij bewaren, delen en importeren)', () => {
    const c = cursusVoorBk({ ...invoer, start: 'geraamte' });
    const gesaneerd = sanitizeCourse(JSON.parse(JSON.stringify(c))) as Course;
    expect(gesaneerd).not.toBeNull();
    expect(gesaneerd.chapters).toHaveLength(c.chapters.length);
    for (const [i, ch] of gesaneerd.chapters.entries()) {
      expect(ch.title).toBe(c.chapters[i].title);
      expect(ch.sections).toHaveLength(c.chapters[i].sections.length);
      for (const [j, s] of ch.sections.entries()) {
        expect(s.title).toBe(c.chapters[i].sections[j].title);
        expect(s.goalCodes).toEqual(c.chapters[i].sections[j].goalCodes);
        expect(s.blocks).toEqual(c.chapters[i].sections[j].blocks);
        expect(s.optional).toBeFalsy();
      }
    }
    expect(codesVan(gesaneerd.chapters)).toEqual(codesVan(c.chapters));
    expect(gesaneerd.curriculumId).toBe(lp.id);
    expect(gesaneerd.doelgroep).toEqual(c.doelgroep);
  });

  it('elke code van het leerplan komt in precies één sectie (de dekking vindt ze allemaal terug)', () => {
    const c = cursusVoorBk({ ...invoer, start: 'geraamte' });
    const dekking = computeCoverage(c, lp, []);
    expect(dekking.rows).toHaveLength(25);
    expect(dekking.rows.every((r) => r.status === 'covered' && r.sections.length === 1)).toBe(true);
    expect(dekking.unknownCodes ?? []).toEqual([]);
  });

  it('verandert de doelgroep en het leerplan die je meegeeft niet', () => {
    const voor = JSON.stringify([invoer.doelgroep, lp]);
    cursusVoorBk({ ...invoer, start: 'geraamte' });
    expect(JSON.stringify([invoer.doelgroep, lp])).toBe(voor);
  });
});
