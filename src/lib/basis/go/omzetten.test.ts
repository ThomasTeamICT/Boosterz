import { describe, expect, it } from 'vitest';
import { normaliseerDoeltekst } from '../../curriculum';
import type { MinimumdoelKandidaat, Opzoektabel } from './koppelen';
import {
  Afwijkingen,
  Bekende,
  controleerLesplanTegenLeerplan,
  controleerRuwDocx,
  controleerRuwXlsx,
  isZichtbaar,
  leesBekendeAfwijkingen,
  leesLeeftijden,
  maakBijMinimumdoel,
  maakIndex,
  normaliseer,
  shaVan,
  titelVorm,
  voegSamen,
  zetLeerplanOm,
  zetLesplanOm,
  type BekendeAfwijking,
  type RuwAlinea,
  type RuwBlok,
  type RuwCel,
  type RuwDocx,
  type RuwRij,
  type RuwRun,
  type RuwXlsx,
} from './omzetten';
import { rondgangLeerplan, rondgangLesplan } from './rondgang';
import { leerplanShaInvoer, lesplanShaInvoer, type GoLeerplanBestand, type GoMoment, type GoVak, type Regel, type TekstStuk } from './types';
import { valideerGoBijMinimumdoel, valideerGoIndex, valideerGoLeerplan, valideerGoLesplan } from './valideer';

// ══ Hulp: ruwe docx ══════════════════════════════════════════════════
type Opmaak = { b?: boolean; i?: boolean; u?: boolean; strike?: boolean };
const r = (tekst: string, o: Opmaak = {}): RuwRun => ({ t: 'tekst', tekst, ...o });
const B = { b: true };
const I = { i: true };
const p = (runs: RuwRun[], stijl: string | null = null): RuwAlinea => ({ t: 'p', stijl, stijlen_ruw: stijl ? [stijl] : [], num: null, runs });
const li = (runs: RuwRun[], numId = '1', fmt = 'bullet'): RuwAlinea => ({ t: 'p', stijl: 'ListParagraph', stijlen_ruw: ['ListParagraph'], num: { numId, ilvl: 0, fmt, start: 1 }, runs });
const h = (n: 1 | 2 | 3 | 4, tekst: string) => p([r(tekst)], `Heading${n}`);
const icoon = (naam: string): RuwRun => ({ t: 'beeld', bestand: `word/media/lesplan-${naam}.png`, sha1: `${'0'.repeat(39)}1`, breed: 133350, hoog: 133350 });
const pagina = (): RuwAlinea => p([{ t: 'br', soort: 'page' }]);
const cel = (blokken: RuwBlok[], o: Partial<RuwCel> = {}): RuwCel => ({ span: 1, vmerge: null, vulling: null, blokken, ...o });
const kopcel = (blokken: RuwBlok[]): RuwCel => cel(blokken, { vulling: 'F2F2F2' });
const tbl = (rijen: RuwCel[][]): RuwBlok => ({ t: 'tbl', rijen: rijen.map((cellen) => ({ cellen })) });
const watHoeKop = () => [kopcel([p([r('', B)], 'Strong')]), kopcel([p([r('Inhoud (Wat?)', B)], 'Strong')]), kopcel([p([r('Didactiek (Hoe?)', B)], 'Strong')])];

const STAPNAMEN = ['Verkennen', 'Voorkeursinstructie', 'Terugkoppelen', 'Begeleid inoefenen', 'Kleine lesafsluiting', 'Zelfstandige verwerking'];

interface LesplanOpties {
  stappen?: number;
  deel2?: RuwBlok[];
  lesdoel?: RuwBlok[];
  deel5?: RuwBlok[];
  extraDeel?: RuwBlok[];
  deel3vlag?: RuwBlok[];
  /** Na de tabel van deel 4 (zoals de mindmap in LP0014a en LP0014b). */
  deel4Extra?: RuwBlok[];
}

/** Een klein lesplan naar LP0065 (ingekort), als de ruwe JSON van lees_docx.py. */
function lesplanRuw(o: LesplanOpties = {}): RuwDocx {
  const stappen = o.stappen ?? 6;
  const leskern: RuwCel[][] = [];
  for (let s = 0; s < stappen; s++) {
    const naam = `${s + 1}. ${STAPNAMEN[s]}`;
    leskern.push([
      cel(s === 0 ? [p([r('Leskern', B)])] : [p([r('')])], { vmerge: s === 0 ? 'restart' : 'voort' }),
      cel([p([r(naam, B), r('')]), p([r(`Wat bij stap ${s + 1}.`)])]),
      cel([p([r(s === 1 ? '2. Voorkeursinstructie' : naam, B)]), p([r(`Hoe bij stap ${s + 1}.`)])]),
    ]);
  }
  const body: RuwBlok[] = [
    h(1, 'Lesplan LP0065 Dieren classificeren (2,5-4 jaar)'),
    p([r('Vakdiscipline:', B), r(' Wetenschap en techniek')]),
    p([r('Lessenlijn:', B), r(' Biologie van organismen')]),
    p([r('Lessenreeks:', B), r(' Fauna: classificeren')]),
    p([r('Lesplan:', B), r(' LP0065 Dieren classificeren')]),
    p([r('Didactische fiche:', B), r(' DFWT005 Kenmerken van de organismen: Taxonomie van de fauna (GO! Navigator > Basisonderwijs > …)')]),
    h(2, '1. Wat moet de leraar weten?'),
    tbl([
      watHoeKop(),
      [cel([p([r('Kennis', B)])]), cel([p([r('Dieren en planten', B), r('')]), p([r('Dieren en planten zijn levende organismen.')])]), cel([li([r('Vertrek vanuit concrete materialen.')])])],
      [cel([p([r('Misconcept', B)])]), cel([li([r('voeding: vb. "scherpe tanden = vleeseter"')])]), cel([p([r('')])])],
    ]),
    pagina(),
    h(2, '2. Wat moet de leerling kennen en kunnen?'),
    tbl([
      watHoeKop(),
      [
        cel([p([r('Leerplandoelen', B)])]),
        cel(
          o.deel2 ?? [
            p([r('WT.001', B), r(' [begrijpen]', I), r(' Herkennen het organisme dier. (2,5-4 jaar)')]),
            p([r('WT.008', B), r(' [begrijpen]', I), r(' Herkennen de belangrijkste voedingswijze van dieren. (2,5-4 jaar)')]),
            p([r('MIA', B), r(' — Dieren:')]),
            li([r('zoogdieren')]),
            li([r('vogels')]),
            p([r('WT.028', B), r(' [gebruiken]', I), r(' Onderscheiden dieren en planten. (2,5-4 jaar)')]),
          ],
        ),
        cel([li([r('Laat leerlingen dieren herkennen.')])]),
      ],
    ]),
    pagina(),
    h(2, '3. Samenhang'),
    h(3, 'Verticale samenhang'),
    p([r('Dit lesplan vormt een onderdeel van de lessenlijn '), r('Biologie van organismen', I), r('.')]),
    h(3, 'Horizontale samenhang binnen de vakdiscipline'),
    h(4, 'Vlaggen en schakels'),
    p([r('Er zijn geen expliciete schakels of vlaggen naar andere doelen binnen de vakdiscipline voor dit lesplan.')]),
    h(4, "Samenhang tussen diploma's en deelconcepten"),
    p([r('In een diploma wordt een selectie van leerplandoelen samengenomen.')]),
    tbl([
      [kopcel([p([icoon('diploma'), r('   '), r('Diploma', B)], 'Strong')]), kopcel([p([icoon('deelconcept'), r('   '), r('Deelconcepten', B)], 'Strong')])],
      [cel([p([r('De dierenkenner')])]), cel([li([r('Bouw en functies van planten, dieren, mens')])])],
    ]),
    h(4, 'Samenhang tussen deelconcepten en GO! concepten'),
    p([r('Deelconcepten vormen een onderdeel van grotere GO! concepten.')]),
    tbl([
      [kopcel([p([icoon('deelconcept'), r('   '), r('Deelconcepten', B)], 'Strong')]), kopcel([p([icoon('go-concept'), r('   '), r('GO! concepten', B)], 'Strong')])],
      [cel([p([r('Bouw en functies van planten, dieren, mens')])]), cel([li([r('Structuur en functie: de bouw hangt samen met de functie.')]), li([r('Ecologie: -')])])],
      [cel([p([r('Gezondheid, voeding, hygiëne')])]), cel([li([r('Cel als basiseenheid: -')])])],
    ]),
    h(3, 'Horizontale samenhang over de vakdisciplines heen'),
    h(4, 'Vlaggen en schakels'),
    p([r('Er zijn geen vlaggen of schakels naar doelen van andere vakdisciplines.')]),
    h(4, 'Denklenzen'),
    p([r('Denklenzen vormen een brug tussen basiskennis en diep begrip.')]),
    tbl([
      [kopcel([p([icoon('denklens'), r('   '), r('Denklenzen', B)], 'Strong')]), kopcel([p([r('Voorbeeldvragen binnen dit lesplan', B)], 'Strong')])],
      [cel([p([r('Lens Systemen en modellen - diepe denkvragen', B)])]), cel([li([r('Welke dingen horen samen?')])])],
    ]),
    h(4, 'Geïntegreerde samenhang met leren leren, ICT, sociale vaardigheden met dit lesplan'),
    p([r('De menu’s maken zichtbaar welke doelen geïntegreerd kunnen worden.')]),
    ...(o.deel3vlag ?? [p([icoon('vlag'), r('   '), r('LL.001', B), r(' Herkennen manieren om de impulsen te controleren. (2,5-4 jaar, 4-5 jaar, 5-6 jaar)')])]),
    pagina(),
    h(2, '4. Lesopbouw'),
    tbl([
      watHoeKop(),
      [cel([p([r('Voorkennis', B)])]), cel([p([r('')])]), cel([p([r('Startleeftijd: geen voorkennisdoelen.')])])],
      [cel([p([r('Doeloriëntatie / belang', B)])]), cel([p([r('Enthousiasmeren.')])]), cel([p([r('“Vandaag worden wij echte natuurkenners.”')])])],
      [
        cel([p([r('Lesdoel', B)])]),
        cel(
          o.lesdoel ?? [
            p([r('Leerdoelen op leerlingenniveau vanuit het diploma: De dierenkenner 2,5-4 jaar', B)]),
            p([r("(GO! Navigator > Basisonderwijs > Het nieuwe GO! Leerplan > Conceptkaarten > Diploma's)")]),
            p([r('WT.001', B), r(' [begrijpen]', I), r(' (2,5-4 jaar)')]),
            li([r('Ik herken dieren.', B)]),
            p([r('WT.008', B), r(' [begrijpen]', I), r(' (2,5-4 jaar)')]),
            li([r('Ik herken de voedingswijze van dieren.', B), r(' Ik weet wat dieren eten.')]),
          ],
        ),
        cel([li([r('Vertaal het lesdoel naar een kindvriendelijk ik-doel.')])]),
      ],
      ...leskern,
      [cel([p([r('Vastlegging', B)])]), cel([p([r('Het borgen van het concept.')])]), cel([p([r('W&T-hoek', B)])])],
    ]),
    ...(o.deel4Extra ?? []),
    pagina(),
    h(2, '5. Trainen'),
    p([r('Deze activiteiten geven richting over hoe je tot oefenen komt met de leerlingen. Beperk je niet tot deze activiteiten, maar gebruik ook jouw eigen creativiteit.', I)]),
    ...(o.deel5 ?? [
      p([r('Dierenmand en plantenmand', B), r('\nZet twee grote manden klaar.\nZe leggen elk voorwerp in de juiste mand.')]),
      p([r('Wie heeft honger?', B), r('\nZet enkele dierenknuffels op tafel.')]),
    ]),
    pagina(),
    h(2, '6. Didactisch materiaal bij dit lesplan'),
    p([r('Voorzie volgende didactische materialen:')]),
    li([r('2 hoepels')]),
    li([r('een kartonnen doos')]),
    ...(o.extraDeel ?? []),
  ];
  return { bestand: 'LP0065.docx', gemaakt: '2026-10-01T08:00:00Z', media: [], stijlen: {}, tellingen: { alineas: 1 }, body };
}

const BRON = { bytes: 1234, sha256: 'b'.repeat(64), ingelezen: '2026-11-09' };
const zetOm = (ruw: RuwDocx, bekende: BekendeAfwijking[] = []) => zetLesplanOm(ruw, { bekende: new Bekende(bekende), bron: BRON });
const nieuweSoorten = (a: Afwijkingen) => a.nieuwe.map((x) => x.soort);
const laatste = <T>(l: readonly T[] | undefined): T | undefined => (l ? l[l.length - 1] : undefined);

// ══ Hulp: ruwe xlsx ══════════════════════════════════════════════════
const KOP = ['TYPE', 'GO! NR.', 'INHOUD', 'KO nummer', 'KO minimumdoel', 'KO omschrijving', 'L4 nummer', 'L4 minimumdoel', 'L4 omschrijving', 'L6 nummer', 'L6 minimumdoel', 'L6 omschrijving', 'KENNISVERWERKING', '2,5-4', '4-5', '5-6', '6-7', '7-8', '8-9', '9-10', '10-11', '11-12', 'VLAGGEN', 'SCHAKELS'];
const NUL = ['0', '0', '0', '0', '0', '0', '0', '0', '0'];
interface RijOpties {
  code?: string;
  ko?: string;
  l4?: string;
  l6?: string;
  kv?: string;
  lft?: string[];
  vlaggen?: string;
  schakels?: string;
  koTekst?: string;
}
const LFT = ['2,5-4', '4-5', '5-6', '6-7', '7-8', '8-9', '9-10', '10-11', '11-12'];
function rij(nr: number, type: string, inhoud: string | null, o: RijOpties = {}): RuwRij {
  const leeftijden = o.lft ? LFT.map((l) => (o.lft?.includes(l) ? '1' : '0')) : NUL;
  return {
    r: nr,
    c: [type, o.code ?? null, inhoud, o.ko ?? null, o.koTekst ?? null, null, o.l4 ?? null, null, null, o.l6 ?? null, null, null, o.kv ?? null, ...leeftijden, o.vlaggen ?? null, o.schakels ?? null],
  };
}

/** Een kleine doelenset wetenschap en techniek (naar de echte, ingekort). */
function leerplanRuw(extra: RuwRij[] = [], vervang?: (rijen: RuwRij[]) => RuwRij[]): RuwXlsx {
  let rijen: RuwRij[] = [
    { r: 1, c: KOP },
    rij(2, 'onderwerp', 'Organismen'),
    rij(3, 'minimumdoel', null, { ko: '3.1.2', koTekst: 'De kleuters kunnen:' }),
    rij(4, 'subthema', 'Kenmerken van organismen'),
    rij(5, 'rubriek', 'Fauna'),
    rij(6, 'subrubriek', 'Kenmerken: bouw'),
    rij(7, 'doelzin', 'Herkennen het organisme dier.', { code: 'WT.001', ko: '3.1.2', kv: 'begrijpen', lft: ['2,5-4'], vlaggen: 'LL.001' }),
    rij(8, 'te hanteren begrippen', 'het dier', { lft: ['2,5-4'] }),
    rij(9, 'te hanteren begrippen', 'de alleseter'),
    rij(10, 'doelzin', 'Herkennen verschillende voedingswijzen van dieren.', { code: 'WT.002', kv: 'begrijpen', lft: ['2,5-4'] }),
    rij(11, 'MIA - titel', 'Dieren:'),
    rij(12, 'MIA - aanklikbaar', 'zoogdieren'),
    rij(13, 'MIA - aanklikbaar', 'vogels'),
    rij(14, 'voorbeelden - titel', 'Voedingswijze:'),
    rij(15, 'voorbeelden - bullet', 'Schapen eten gras.'),
    rij(16, 'rubriek', 'Flora'),
    rij(17, 'doelzin', 'Onderscheiden dieren en planten.', { code: 'WT.003', ko: '3.1.2', l6: '3.3.2', kv: 'gebruiken', lft: ['2,5-4', '4-5'], schakels: 'WT.001, WT.999' }),
    rij(18, 'MIA - titel', 'Aftrekken:', { l4: '3.1.4' }),
    rij(19, 'MIA - niet aanklikbaar', 'tot 10'),
    rij(20, 'asterisk', '* een voetnoot'),
    ...extra,
  ];
  if (vervang) rijen = vervang(rijen);
  return { bestand: 'wetenschap_techniek.xlsx', gewijzigd: '2026-09-03T09:39:57Z', bladnamen: [{ naam: 'Wetenschap en techniek', staat: 'zichtbaar' }], blad: 'Wetenschap en techniek', merged: [], tellingen: {}, rijen };
}

/** Een opzoektabel zonder setbestanden: (moment, code) → doel. */
function tabel(doelen: Record<string, MinimumdoelKandidaat>): Opzoektabel {
  return {
    zoek: (m: GoMoment, code: string) => (doelen[`${m} ${code}`] ? [doelen[`${m} ${code}`]] : []),
    alle: () => Object.values(doelen),
    sets: () => [],
    tweelingen: () => [],
  };
}
const TABEL = tabel({
  'KO 3.1.2': { set: 'ODS_3410', id: '92590', code: '3.1.2' },
  'KO 3.1.3': { set: 'ODS_3410', id: '92929', code: '3.1.3' },
  'L6 3.3.2': { set: 'ODS_3409', id: '92822', code: '3.3.2' },
  'L4 3.1.4': { set: 'ODS_3408', id: '93100', code: '3.1.4' },
  'KO 4.2.3': { set: 'ODS_3411', id: '92500', code: '4.2.3' },
});
const BRONXLSX = { naam: 'Doelenset BaO wetenschap en techniek.xlsx', bytes: 9, sha256: 'c'.repeat(64), datum: '2026-09-03T09:39:57Z' };
const KAPOT: BekendeAfwijking = { soort: 'verwijzing-kapot', doel: 'WT.003', kolom: 'SCHAKELS', waarde: 'WT.999', reden: 'Bestaat niet in de doelenset (voor de test).', datum: '2026-11-09' };
const leerplanOm = (ruw: RuwXlsx, bekende: BekendeAfwijking[] = [KAPOT], bestaat = (c: string) => /^WT\.00[1-3]$|^LL\.00\d$/.test(c)) =>
  zetLeerplanOm(ruw, { bekende: new Bekende(bekende), tabel: TABEL, bestaat, bronBestand: BRONXLSX, ingelezen: '2026-11-09' });

// ══ Kleine hulpfuncties ═══════════════════════════════════════════════
describe('kleine hulpfuncties', () => {
  it('voegSamen: aangrenzende stukken met dezelfde opmaak worden één, lege stukken vallen weg', () => {
    expect(voegSamen([{ t: 'a', b: true }, { t: '' }, { t: 'b', b: true }, { t: 'c' }, { br: true }, { t: 'd' }, { t: 'e' }])).toEqual([{ t: 'ab', b: true }, { t: 'c' }, { br: true }, { t: 'de' }]);
  });

  it('isZichtbaar: een harde spatie of alleen een regeleinde is niet zichtbaar, een pictogram wel', () => {
    expect(isZichtbaar([{ t: '  ' }, { br: true }])).toBe(false);
    expect(isZichtbaar([{ icoon: 'vlag' }])).toBe(true);
    expect(isZichtbaar([{ t: ' x ' }])).toBe(true);
  });

  it('normaliseer is gelijk aan normaliseerDoeltekst (src/lib/curriculum.ts)', () => {
    for (const s of ['  Herkennen  de dieren. ', 'a\r\nb\n\n c ', 'de  mond', '', '\n\n']) expect(normaliseer(s)).toBe(normaliseerDoeltekst(s));
  });

  it('leesLeeftijden: alleen geldige groepen, oplopend en zonder dubbels', () => {
    expect(leesLeeftijden('2,5-4 jaar, 4-5 jaar')).toEqual(['2,5-4', '4-5']);
    expect(leesLeeftijden('4-5 jaar, 2,5-4 jaar')).toBeUndefined();
    expect(leesLeeftijden('3-4 jaar')).toBeUndefined();
    expect(leesLeeftijden('2,5-4')).toBeUndefined();
  });
});

describe('controleerRuwDocx en controleerRuwXlsx', () => {
  it('aanvaarden de uitvoer van de lezers', () => {
    expect(controleerRuwDocx(lesplanRuw())).toEqual([]);
    expect(controleerRuwXlsx(leerplanRuw())).toEqual([]);
  });
  it('weigeren een ongeldige vorm', () => {
    expect(controleerRuwDocx({ bestand: 'x', gemaakt: null, body: [{ t: 'p', stijl: null, num: null, runs: [{ t: 'raar' }] }], media: [], tellingen: {} })).toEqual(['body[0].runs[0] heeft een onbekende soort']);
    expect(controleerRuwDocx(null)).toEqual(['de ruwe docx-JSON is geen object']);
    expect(controleerRuwXlsx({ bestand: 'x', blad: 'y', gewijzigd: null, bladnamen: [], merged: [], rijen: [{ r: 2, c: [] }, { r: 1, c: [] }] })[0]).toMatch(/lopen niet op/);
    expect(controleerRuwXlsx({ bestand: 'x', blad: 'y', gewijzigd: null, bladnamen: [], merged: [], rijen: [{ r: 1, c: [3] }] })[0]).toMatch(/geen tekst/);
  });
});

// ══ Bekende afwijkingen ═══════════════════════════════════════════════
describe('leesBekendeAfwijkingen', () => {
  it('aanvaardt een geldige lijst', () => {
    const { afwijkingen, fouten } = leesBekendeAfwijkingen({ uitleg: 'x', afwijkingen: [KAPOT, { soort: 'opmaak', vak: 'WI', rij: 3, kolom: 2, tekst: 'x', besluit: 'opmaak-bewaren', reden: 'Een reden van genoeg lengte.', datum: '2026-11-09' }] });
    expect(fouten).toEqual([]);
    expect(afwijkingen).toHaveLength(2);
  });

  it('is streng: onbekende soort, onbekend veld, geen reden, geen datum, verkeerd type', () => {
    const fouten = (a: unknown) => leesBekendeAfwijkingen({ afwijkingen: [a] }).fouten;
    expect(fouten({ ...KAPOT, soort: 'iets' })[0]).toMatch(/onbekende soort/);
    expect(fouten({ ...KAPOT, extra: 1 }).join()).toMatch(/onbekend veld "extra"/);
    expect(fouten({ ...KAPOT, reden: 'kort' }).join()).toMatch(/reden/);
    expect(fouten({ ...KAPOT, datum: '9/11/2026' }).join()).toMatch(/datum/);
    expect(fouten({ ...KAPOT, kolom: 'ANDERS' }).join()).toMatch(/VLAGGEN of SCHAKELS/);
    expect(fouten({ soort: 'opmaak', vak: 'WI', rij: '3', kolom: 2, tekst: 'x', besluit: 'opmaak-bewaren', reden: 'Een reden van genoeg lengte.', datum: '2026-11-09' }).join()).toMatch(/"rij" is geen geheel getal/);
    expect(fouten({ soort: 'lesplan-beeld', sha1: 'a', lesplannen: ['LP0001'], status: 'getoond', reden: 'Een reden van genoeg lengte.', datum: '2026-11-09' }).join()).toMatch(/"bestand" en "alt"/);
    expect(leesBekendeAfwijkingen({ lijst: [] }).fouten[0]).toMatch(/geen lijst "afwijkingen"/);
  });

  it('Bekende houdt bij welke regels gebruikt zijn', () => {
    const b = new Bekende([KAPOT]);
    expect(b.ongebruikt()).toHaveLength(1);
    expect(b.zoek('verwijzing-kapot', (a) => a.waarde === 'WT.999')).toBe(KAPOT);
    expect(b.ongebruikt()).toEqual([]);
    expect(b.zoek('verwijzing-kapot', (a) => a.waarde === 'iets')).toBeUndefined();
  });
});

// ══ Lesplan ═══════════════════════════════════════════════════════════
describe('zetLesplanOm: een volledig lesplan', () => {
  const { bestand, extra, afwijkingen } = zetOm(lesplanRuw());

  it('zonder nieuwe afwijkingen, in orde volgens de validator, met de juiste sha256', () => {
    expect(afwijkingen.nieuwe).toEqual([]);
    expect(bestand).toBeDefined();
    if (!bestand) return;
    expect(valideerGoLesplan(JSON.parse(JSON.stringify(bestand)))).toEqual([]);
    expect(bestand.sha256).toBe(shaVan(lesplanShaInvoer(bestand)));
    expect(bestand.bron).toEqual({
      net: 'GO!',
      naamsvermelding: 'GO! onderwijs van de Vlaamse Gemeenschap',
      waar: 'GO! studio',
      url: 'https://studio.g-o.be/',
      bestand: { naam: 'LP0065.docx', bytes: 1234, sha256: 'b'.repeat(64), datum: '2026-10-01T08:00:00Z' },
      ingelezen: '2026-11-09',
    });
  });

  it('de rondgang is gelijk: alle tekst komt exact terug', () => {
    if (!bestand) throw new Error('geen bestand');
    expect(rondgangLesplan(lesplanRuw(), bestand)).toMatchObject({ gelijk: true });
  });

  it('kop en metaregels', () => {
    if (!bestand) throw new Error('geen bestand');
    expect(bestand.code).toBe('LP0065');
    expect(bestand.titel).toBe('Dieren classificeren');
    expect(bestand.leeftijd).toBe('2,5-4');
    expect(bestand.delen.map((d) => d.nr)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const a = bestand.afgeleid;
    expect([a.vak, a.vakdiscipline, a.lessenlijn, a.lessenreeks]).toEqual(['WT', 'Wetenschap en techniek', 'Biologie van organismen', 'Fauna: classificeren']);
    expect(a.didactischeFiches).toEqual([{ code: 'DFWT005', titel: 'Kenmerken van de organismen: Taxonomie van de fauna' }]);
  });

  it('runs met dezelfde opmaak samengevoegd, lege runs weg, een lege cel heeft geen blokken', () => {
    if (!bestand) throw new Error('geen bestand');
    const t1 = bestand.delen[1].blokken[1];
    if (t1.soort !== 'tabel') throw new Error('geen tabel');
    expect(t1.rijen[0][0]).toEqual({ rol: 'kolomkop', blokken: [] });
    expect(t1.rijen[1][0]).toEqual({ rol: 'rijkop', blokken: [{ soort: 'alinea', tekst: [{ t: 'Kennis', b: true }] }] });
    expect(t1.rijen[1][1].blokken[0]).toEqual({ soort: 'alinea', tekst: [{ t: 'Dieren en planten', b: true }] });
  });

  it('leerplandoelen, MIA en begrippen uit deel 2, met een wijzer naar de doelregel', () => {
    if (!bestand) throw new Error('geen bestand');
    const d = bestand.afgeleid.leerplandoelen;
    expect(d.map((x) => [x.code, x.kennisverwerking, x.leeftijden, x.tekst])).toEqual([
      ['WT.001', 'begrijpen', ['2,5-4'], 'Herkennen het organisme dier.'],
      ['WT.008', 'begrijpen', ['2,5-4'], 'Herkennen de belangrijkste voedingswijze van dieren.'],
      ['WT.028', 'gebruiken', ['2,5-4'], 'Onderscheiden dieren en planten.'],
    ]);
    expect(d[2].waar).toEqual({ deel: 2, blok: 1, rij: 1, kolom: 1, regel: 4 });
    expect(extra.mia).toEqual([{ doel: 'WT.008', titel: 'Dieren:', items: ['zoogdieren', 'vogels'], waar: 'deel 2, regel 2' }]);
  });

  it("diploma's met ik-doelen, deelconcepten en GO! concepten (een '-' hoort er niet bij)", () => {
    if (!bestand) throw new Error('geen bestand');
    const a = bestand.afgeleid;
    expect(a.diplomas).toEqual([
      {
        naam: 'De dierenkenner',
        leeftijd: '2,5-4',
        ikDoelen: [
          { code: 'WT.001', zinnen: ['Ik herken dieren.'] },
          { code: 'WT.008', zinnen: ['Ik herken de voedingswijze van dieren. Ik weet wat dieren eten.'] },
        ],
        waar: { deel: 4, blok: 1, rij: 3, kolom: 1 },
      },
    ]);
    expect(a.deelconcepten).toEqual(['Bouw en functies van planten, dieren, mens']);
    expect(a.goConcepten).toEqual(['Structuur en functie']);
    expect(a.vlaggen).toEqual(['LL.001']);
    expect(a.schakels).toEqual([]);
  });

  it('de stappen van de leskern (een harde spatie telt als spatie), het materiaal en Trainen', () => {
    if (!bestand) throw new Error('geen bestand');
    const a = bestand.afgeleid;
    expect(a.stappen.map((s) => s.naam)).toEqual(STAPNAMEN);
    expect(a.stappen[1]).toEqual({ nr: 2, naam: 'Voorkeursinstructie', wat: { deel: 4, blok: 1, rij: 5, kolom: 1 }, hoe: { deel: 4, blok: 1, rij: 5, kolom: 2 } });
    expect(a.materiaal).toEqual({ deel: 6, blok: 2 });
    expect(a.trainen).toEqual([
      { titel: 'Dierenmand en plantenmand', vanaf: { deel: 5, blok: 2 }, tot: { deel: 5, blok: 2 } },
      { titel: 'Wie heeft honger?', vanaf: { deel: 5, blok: 3 }, tot: { deel: 5, blok: 3 } },
    ]);
    expect(extra.trainenVorm).toBe('vet-regeleinde');
  });

  it('een regeleinde in w:t wordt {br}; een paginabreuk valt weg', () => {
    if (!bestand) throw new Error('geen bestand');
    const b = bestand.delen[5].blokken[2];
    expect(b).toEqual({ soort: 'alinea', tekst: [{ t: 'Dierenmand en plantenmand', b: true }, { br: true }, { t: 'Zet twee grote manden klaar.' }, { br: true }, { t: 'Ze leggen elk voorwerp in de juiste mand.' }] });
    expect(extra.tellingen.paginabreuken).toBe(5);
  });
});

describe('zetLesplanOm: lijsten', () => {
  it('een alinea met alleen een harde spatie valt weg en onderbreekt de lijst', () => {
    const { bestand, afwijkingen } = zetOm(lesplanRuw({ deel5: [li([r('Spel A', B), r(' ')]), li([r('uitleg')]), p([r(' ')]), li([r('Spel B', B)])] }));
    expect(afwijkingen.nieuwe).toEqual([]);
    const d5 = bestand?.delen[5].blokken ?? [];
    expect(d5.slice(2).map((b) => (b.soort === 'lijst' ? b.items.length : b.soort))).toEqual([2, 1]);
    expect(bestand?.afgeleid.trainen).toEqual([
      { titel: 'Spel A', vanaf: { deel: 5, blok: 2, item: 0 }, tot: { deel: 5, blok: 2, item: 1 } },
      { titel: 'Spel B', vanaf: { deel: 5, blok: 3, item: 0 }, tot: { deel: 5, blok: 3, item: 0 } },
    ]);
  });

  it('een onderbroken genummerde lijst krijgt een start; een opsomming niet', () => {
    const { bestand } = zetOm(lesplanRuw({ deel5: [li([r('Spel', B)]), li([r('een')], '2', 'decimal'), li([r('twee')], '2', 'decimal'), p([r('tussendoor')]), li([r('drie')], '2', 'decimal')] }));
    const lijsten = (bestand?.delen[5].blokken ?? []).filter((b) => b.soort === 'lijst');
    expect(lijsten.map((l) => (l.soort === 'lijst' ? [l.genummerd, l.start] : []))).toEqual([
      [false, undefined],
      [true, undefined],
      [true, 3],
    ]);
  });

  it('een lijstniveau 1 of een onbekende nummering is een afwijking', () => {
    const ruw = lesplanRuw();
    const x = li([r('niveau 1')]);
    if (x.num) x.num.ilvl = 1;
    ruw.body.push(x);
    expect(nieuweSoorten(zetOm(ruw).afwijkingen)).toContain('docx-lijst');
  });
});

describe('zetLesplanOm: afwijkingen geven exit 3', () => {
  it('een tab, doorgehaalde tekst of een onbekende breuk', () => {
    const ruw = lesplanRuw({ extraDeel: [p([r('a'), { t: 'tab' }, r('b', { strike: true }), { t: 'br', soort: 'column' }])] });
    expect(nieuweSoorten(zetOm(ruw).afwijkingen)).toEqual(expect.arrayContaining(['docx-tab', 'docx-opmaak', 'docx-breuk']));
  });

  it('een beeld dat geen pictogram is: alleen via bekende-afwijkingen.json, en nooit midden in tekst', () => {
    const beeld: RuwRun = { t: 'beeld', bestand: 'word/media/abc.png', sha1: 'f'.repeat(40), breed: 952500, hoog: 952500 };
    expect(nieuweSoorten(zetOm(lesplanRuw({ deel4Extra: [p([beeld])] })).afwijkingen)).toContain('docx-beeld');
    const getoond: BekendeAfwijking = { soort: 'lesplan-beeld', sha1: 'f'.repeat(40), lesplannen: ['LP0065'], status: 'getoond', bestand: 'beelden/abc.webp', alt: 'Een beeld.', reden: 'Vrijgegeven door de eigenaar (test).', datum: '2026-11-09' };
    const u = zetOm(lesplanRuw({ deel4Extra: [p([beeld])] }), [getoond]);
    expect(u.afwijkingen.nieuwe).toEqual([]);
    expect(laatste(u.bestand?.delen[4].blokken)).toEqual({ soort: 'beeld', bron: 'abc.png', breedte: 100, hoogte: 100, status: 'getoond', bestand: 'beelden/abc.webp', alt: 'Een beeld.' });
    expect(u.bestand && valideerGoLesplan(JSON.parse(JSON.stringify(u.bestand)))).toEqual([]);
    expect(u.bestand && rondgangLesplan(lesplanRuw({ deel4Extra: [p([beeld])] }), u.bestand).gelijk).toBe(true);
    const weg: BekendeAfwijking = { ...getoond, status: 'weggelaten', uitleg: 'Hier staat een beeld.' };
    delete (weg as { bestand?: string }).bestand;
    delete (weg as { alt?: string }).alt;
    expect(laatste(zetOm(lesplanRuw({ deel4Extra: [p([beeld])] }), [weg]).bestand?.delen[4].blokken)).toMatchObject({ status: 'weggelaten', uitleg: 'Hier staat een beeld.' });
    expect(nieuweSoorten(zetOm(lesplanRuw({ deel4Extra: [p([r('tekst'), beeld])] }), [getoond]).afwijkingen)).toContain('docx-beeld');
    // Een beeld in deel 6 (het materiaal) is geen gekende vorm.
    expect(nieuweSoorten(zetOm(lesplanRuw({ extraDeel: [p([beeld])] }), [getoond]).afwijkingen)).toContain('lesplan-materiaal');
    // Een bekend beeld van een ander lesplan geldt hier niet.
    expect(nieuweSoorten(zetOm(lesplanRuw({ deel4Extra: [p([beeld])] }), [{ ...getoond, lesplannen: ['LP0001'] }]).afwijkingen)).toContain('docx-beeld');
  });

  it('een bestand in word/media dat geen gekend pictogram is', () => {
    const ruw = lesplanRuw();
    ruw.media = [{ naam: 'word/media/onbekend.png', bytes: 5, sha1: 'e'.repeat(40) }];
    expect(nieuweSoorten(zetOm(ruw).afwijkingen)).toContain('docx-media');
  });

  it('een deel 7 alleen via bekende-afwijkingen.json', () => {
    const extraDeel = [h(2, '7. Bijlagen'), li([r('bijlage.png')])];
    expect(nieuweSoorten(zetOm(lesplanRuw({ extraDeel })).afwijkingen)).toContain('lesplan-delen');
    const bekend: BekendeAfwijking = { soort: 'lesplan-deel', lesplan: 'LP0065', kop: '7. Bijlagen', reden: 'Alleen dit lesplan heeft bijlagen (test).', datum: '2026-11-09' };
    const u = zetOm(lesplanRuw({ extraDeel }), [bekend]);
    expect(u.afwijkingen.nieuwe).toEqual([]);
    expect(u.bestand?.delen).toHaveLength(8);
  });

  it('een stap met een andere naam, of te weinig stappen', () => {
    const ruw = lesplanRuw();
    const t4 = ruw.body.find((b) => b.t === 'tbl' && b.rijen.length > 8) as Extract<RuwBlok, { t: 'tbl' }>;
    (t4.rijen[4].cellen[1].blokken[0] as RuwAlinea).runs = [r('1. Ontdekken', B)];
    expect(nieuweSoorten(zetOm(ruw).afwijkingen)).toContain('lesplan-stappen');
    expect(nieuweSoorten(zetOm(lesplanRuw({ stappen: 5 })).afwijkingen)).toEqual([]);
    expect(nieuweSoorten(zetOm(lesplanRuw({ stappen: 4 })).afwijkingen)).toContain('lesplan-deel4');
  });

  it('een doelregel zonder vette code, of een onbekende regel bij de leerplandoelen', () => {
    expect(nieuweSoorten(zetOm(lesplanRuw({ deel2: [p([r('WT.001 [begrijpen] Herkennen het organisme dier. (2,5-4 jaar)')])] })).afwijkingen)).toContain('lesplan-deel2');
    expect(nieuweSoorten(zetOm(lesplanRuw({ deel2: [p([r('WT.001', B), r(' [begrijpen]', I), r(' Tekst. (2,5-4 jaar)')]), p([r('Iets anders')])] })).afwijkingen)).toContain('lesplan-deel2');
  });

  it('een onbekende regel in de rij Lesdoel; de regel met de begrippen mag', () => {
    const lesdoel = (extra: RuwBlok[]) => [
      p([r('Leerdoelen op leerlingenniveau vanuit het diploma: De dierenkenner 2,5-4 jaar', B)]),
      p([r("(GO! Navigator > Basisonderwijs > Het nieuwe GO! Leerplan > Conceptkaarten > Diploma's)")]),
      p([r('WT.001', B), r(' [begrijpen]', I), r(' (2,5-4 jaar)')]),
      li([r('Ik herken dieren.', B)]),
      ...extra,
    ];
    expect(nieuweSoorten(zetOm(lesplanRuw({ lesdoel: lesdoel([p([r('Als ik vertel / iets uitleg, gebruik ik volgende begrippen:', B)]), p([r('de baby')])]) })).afwijkingen)).toEqual([]);
    expect(nieuweSoorten(zetOm(lesplanRuw({ lesdoel: lesdoel([p([r('Iets anders')])]) })).afwijkingen)).toContain('lesplan-diploma');
  });

  it('een kolomkop die niet grijs is, of een grijze cel buiten de koprij', () => {
    const ruw = lesplanRuw();
    const t1 = ruw.body[7] as Extract<RuwBlok, { t: 'tbl' }>;
    t1.rijen[0].cellen[1].vulling = null;
    t1.rijen[1].cellen[2].vulling = 'F2F2F2';
    expect(zetOm(ruw).afwijkingen.nieuwe.filter((a) => a.soort === 'docx-tabel')).toHaveLength(2);
  });

  it('een bestandsnaam die geen lesplancode is, of een titel van een andere vorm', () => {
    expect(zetOm({ ...lesplanRuw(), bestand: 'iets.docx' })).toMatchObject({ bestand: undefined });
    const ruw = lesplanRuw();
    ruw.body[0] = h(1, 'Een titel');
    expect(nieuweSoorten(zetOm(ruw).afwijkingen)).toContain('lesplan-titel');
  });

  it('geen titels in Trainen en ook geen enkele lijst: een onbekende vorm', () => {
    expect(nieuweSoorten(zetOm(lesplanRuw({ deel5: [p([r('Een activiteit zonder titel.')])] })).afwijkingen)).toContain('lesplan-trainen');
  });

  it('titels in twee vormen: een afwijking', () => {
    expect(nieuweSoorten(zetOm(lesplanRuw({ deel5: [p([r('Titel', B)]), p([r('Tekst.')]), li([r('Ander spel', B)])] })).afwijkingen)).toContain('lesplan-trainen');
  });
});

describe('titelVorm: de vijf vormen van een activiteit van Trainen', () => {
  const v = (s: Regel, lijst = false) => titelVorm(s, lijst);
  const t = (x: string, o: Omit<TekstStuk, 't'> = {}): TekstStuk => ({ t: x, ...o });
  it('lijst-vet: een lijstitem dat helemaal vet is (witruimte achteraan mag)', () => {
    expect(v([t('Spiegelspel', { b: true }), t(' ')], true)).toBe('lijst-vet');
    expect(v([t('Spiegel', { b: true }), t('spel ', { b: true }), t('  ')], true)).toBe('lijst-vet');
    expect(v([t('een gewoon item')], true)).toBeUndefined();
  });
  it('een lijstitem dat vet begint en als zin doorloopt, is geen titel (LP0014a, 1a-G6-2)', () => {
    expect(v([t('De verzorgende routines', { b: true }), t(' zoals toiletbezoek …')], true)).toBeUndefined();
    expect(v([t('Spel', { b: true }), { br: true }, t('Uitleg.')], true)).toBeUndefined();
    expect(v([t('Spel', { b: true }), { br: true }], true)).toBeUndefined();
    expect(v([t('  ')], true)).toBeUndefined();
  });
  it('alinea-vet: een alinea die helemaal vet is', () => {
    expect(v([t('Zaadje of geen zaadje?', { b: true })])).toBe('alinea-vet');
  });
  it("opsomteken-vet: '•' en een spatie, daarna alleen vet", () => {
    expect(v([t('• '), t('Waar hoort de baby?', { b: true })])).toBe('opsomteken-vet');
    expect(v([t('• '), t('Waar', { b: true }), t(' niet vet')])).toBe('onbekend');
  });
  it('vet-regeleinde: vet, dan een regeleinde en tekst in dezelfde alinea', () => {
    expect(v([t('Wie heeft honger?', { b: true }), { br: true }, t('Zet enkele knuffels klaar.')])).toBe('vet-regeleinde');
  });
  it('geen titel: een alinea die niet vet begint; onbekend: vet begin zonder gekende vorm', () => {
    expect(v([t('De verzorgende '), t('routines', { b: true }), t(' zoals …')])).toBeUndefined();
    expect(v([t('Vet', { b: true }), t(' en dan gewone tekst')])).toBe('onbekend');
  });
});

describe('zetLesplanOm: Trainen', () => {
  it('tekst tussen de inleiding en de eerste titel is één activiteit zonder titel', () => {
    const { bestand, afwijkingen } = zetOm(lesplanRuw({ deel5: [p([r('De verzorgende '), r('routines', B), r(' lenen zich ertoe.')]), p([r('Luisterspel', B)]), p([r('Doel: auditieve discriminatie')])] }));
    expect(afwijkingen.nieuwe).toEqual([]);
    expect(bestand?.afgeleid.trainen).toEqual([
      { vanaf: { deel: 5, blok: 2 }, tot: { deel: 5, blok: 2 } },
      { titel: 'Luisterspel', vanaf: { deel: 5, blok: 3 }, tot: { deel: 5, blok: 4 } },
    ]);
  });

  it('geen titels: één lijst, elk item een activiteit zonder titel', () => {
    const { bestand, extra } = zetOm(lesplanRuw({ deel5: [li([r('Sorteren in de winkelhoek.')]), li([r('Een kringspel.')])] }));
    expect(extra.trainenVorm).toBe('geen-titel');
    expect(bestand?.afgeleid.trainen).toEqual([
      { vanaf: { deel: 5, blok: 2, item: 0 }, tot: { deel: 5, blok: 2, item: 0 } },
      { vanaf: { deel: 5, blok: 2, item: 1 }, tot: { deel: 5, blok: 2, item: 1 } },
    ]);
  });

  it('een titel met een opsommingsteken wordt het vette deel, zonder het teken', () => {
    const { bestand } = zetOm(lesplanRuw({ deel5: [p([r('• '), r('Waar hoort de baby?', B)]), p([r('Uitleg.')])] }));
    expect(bestand?.afgeleid.trainen[0]).toEqual({ titel: 'Waar hoort de baby?', vanaf: { deel: 5, blok: 2 }, tot: { deel: 5, blok: 3 } });
    expect(bestand && valideerGoLesplan(JSON.parse(JSON.stringify(bestand)))).toEqual([]);
  });

  it('een lijstitem dat alleen vet begint, is een activiteit zonder titel vóór de eerste echte titel (LP0014a)', () => {
    const { bestand, extra, afwijkingen } = zetOm(
      lesplanRuw({ deel5: [li([r('De verzorgende routines', B), r(' zoals toiletbezoek lenen zich ertoe.')]), li([r('Spiegelspel', B), r(' ')]), li([r('Doe na wat ik doe.')])] }),
    );
    expect(afwijkingen.nieuwe).toEqual([]);
    expect(extra.trainenVorm).toBe('lijst-vet');
    expect(bestand?.afgeleid.trainen).toEqual([
      { vanaf: { deel: 5, blok: 2, item: 0 }, tot: { deel: 5, blok: 2, item: 0 } },
      { titel: 'Spiegelspel', vanaf: { deel: 5, blok: 2, item: 1 }, tot: { deel: 5, blok: 2, item: 2 } },
    ]);
  });
});

// ══ Doelenset ═════════════════════════════════════════════════════════
describe('zetLeerplanOm: een kleine doelenset', () => {
  const u = leerplanOm(leerplanRuw());
  const b = u.bestand as GoLeerplanBestand;

  it('zonder nieuwe afwijkingen, in orde volgens de validator, rondgang gelijk', () => {
    expect(u.afwijkingen.nieuwe).toEqual([]);
    expect(valideerGoLeerplan(JSON.parse(JSON.stringify(b)))).toEqual([]);
    expect(b.sha256).toBe(shaVan(leerplanShaInvoer(b)));
    expect(rondgangLeerplan(leerplanRuw(), b)).toMatchObject({ gelijk: true, minimumdoelRijen: 1 });
  });

  it('rubrieken met een volgnummer en de dichtstbijzijnde ouder van een hoger niveau', () => {
    expect(b.rubrieken.map((x) => [x.id, x.soort, x.tekst, x.ouder])).toEqual([
      ['WT-r001', 'onderwerp', 'Organismen', undefined],
      ['WT-r002', 'subthema', 'Kenmerken van organismen', 'WT-r001'],
      ['WT-r003', 'rubriek', 'Fauna', 'WT-r002'],
      ['WT-r004', 'subrubriek', 'Kenmerken: bouw', 'WT-r003'],
      ['WT-r005', 'rubriek', 'Flora', 'WT-r002'],
    ]);
    expect(b.doelen.map((d) => d.rubriek)).toEqual(['WT-r004', 'WT-r004', 'WT-r005']);
  });

  it('de officiële koppeling, met twijfel als het moment niet bij de leeftijden past', () => {
    expect(b.doelen[0].minimumdoelen).toEqual({ bron: { KO: '3.1.2' }, refs: [{ set: 'ODS_3410', id: '92590', code: '3.1.2', moment: 'KO', status: 'officieel' }], problemen: [] });
    expect(b.doelen[2].minimumdoelen.refs[1]).toEqual({ set: 'ODS_3409', id: '92822', code: '3.3.2', moment: 'L6', status: 'officieel', twijfel: ['moment-buiten-leeftijden'] });
    expect(u.tellingen).toMatchObject({ doelzinCodes: 3, doelzinOfficieel: 3, doelzinProblemen: 0, twijfelLeeftijd: 1, inhoudCodes: 1, inhoudOfficieel: 1 });
  });

  it('inhoud: MIA, begrippen (leeg mag), voorbeelden, voetnoot; een MIA met een eigen code', () => {
    expect(b.doelen[0].inhoud).toEqual([
      { soort: 'begrip', tekst: 'het dier', leeftijden: ['2,5-4'], rij: 8 },
      { soort: 'begrip', tekst: 'de alleseter', leeftijden: [], rij: 9 },
    ]);
    expect(b.doelen[1].inhoud.map((i) => i.soort)).toEqual(['mia-titel', 'mia', 'mia', 'voorbeelden-titel', 'voorbeeld']);
    expect(b.doelen[2].inhoud[0]).toMatchObject({ soort: 'mia-titel', tekst: 'Aftrekken:', koppeling: { bron: { L4: '3.1.4' } } });
    expect(b.doelen[2].inhoud[2]).toEqual({ soort: 'voetnoot', tekst: '* een voetnoot', rij: 20 });
    expect(u.tellingen.begrippenZonderLeeftijd).toBe(1);
  });

  it('vlaggen en schakels: een bestaande code, en een kapotte waarde die letterlijk blijft (bekend)', () => {
    expect(b.doelen[0].vlaggen).toEqual({ bron: 'LL.001', codes: ['LL.001'], kapot: [] });
    expect(b.doelen[2].schakels).toEqual({ bron: 'WT.001, WT.999', codes: ['WT.001'], kapot: ['WT.999'] });
    expect(u.afwijkingen.lijst.filter((a) => a.bekend).map((a) => a.soort)).toEqual(['verwijzing-kapot']);
  });

  it('de minimumdoel-rijen gaan alleen naar het rapport', () => {
    expect(u.minimumdoelRijen).toEqual([{ rij: 3, moment: 'KO', nummer: '3.1.2', tekst: 'De kleuters kunnen:', status: 'gevonden', set: 'ODS_3410', id: '92590' }]);
    expect(JSON.stringify(b)).not.toContain('De kleuters kunnen');
  });
});

describe('zetLeerplanOm: afwijkingen geven exit 3', () => {
  const soorten = (ruw: RuwXlsx, bekende?: BekendeAfwijking[]) => nieuweSoorten(leerplanOm(ruw, bekende).afwijkingen);

  it('een kapotte verwijzing die niet bekend is', () => {
    expect(soorten(leerplanRuw(), [])).toEqual(['verwijzing-kapot']);
  });

  it('een gat in de nummering, een onbekend TYPE, geen leeftijd, een verkeerde leeftijdswaarde', () => {
    expect(soorten(leerplanRuw([rij(21, 'doelzin', 'Tekst.', { code: 'WT.005', kv: 'begrijpen', lft: ['4-5'] })]))).toContain('xlsx-code');
    expect(soorten(leerplanRuw([rij(21, 'MIA-titel', 'x')]))).toContain('xlsx-type');
    expect(soorten(leerplanRuw([rij(21, 'doelzin', 'Tekst.', { code: 'WT.004', kv: 'begrijpen' })]))).toContain('xlsx-leeftijd');
    const raar = rij(21, 'te hanteren begrippen', 'x', { lft: ['4-5'] });
    raar.c[14] = '2';
    expect(soorten(leerplanRuw([raar]))).toContain('xlsx-leeftijd');
    expect(soorten(leerplanRuw([rij(21, 'MIA - titel', 'Een leeftijd:', { lft: ['4-5'] })]))).toContain('xlsx-leeftijd');
  });

  it('inhoud die niet onder een doel staat, of na een minimumdoel-rij', () => {
    expect(soorten(leerplanRuw([rij(21, 'rubriek', 'Nieuw'), rij(22, 'MIA - titel', 'Wees:')]))).toContain('xlsx-rij');
    expect(soorten(leerplanRuw([rij(21, 'minimumdoel', null, { ko: '3.1.3' }), rij(22, 'MIA - titel', 'Erna:')]))).toContain('xlsx-volgorde');
  });

  it('inhoud na de lege rijen onderaan', () => {
    expect(soorten(leerplanRuw([{ r: 21, c: ['', null, null, null, null, null, null, null, null, null, null, null, null, ...NUL] }, rij(22, 'te hanteren begrippen', 'laat')]))).toContain('xlsx-rij');
  });

  it('een waarde in een kolom die bij die rij niet hoort', () => {
    const x = rij(21, 'te hanteren begrippen', 'x', { lft: ['2,5-4'] });
    x.c[3] = '3.1.2';
    expect(soorten(leerplanRuw([x]))).toContain('xlsx-rij');
  });

  it('een kolomkop die afwijkt; de lege kop van kolom M in wiskunde alleen als bekende afwijking', () => {
    const kopLeeg = (ruw: RuwXlsx) => {
      ruw.rijen[0] = { r: 1, c: KOP.map((k, i) => (i === 12 ? '' : k)) };
      return ruw;
    };
    expect(soorten(kopLeeg(leerplanRuw()))).toContain('xlsx-kop');
    expect(soorten(kopLeeg(leerplanRuw()), [KAPOT, { soort: 'xlsx-kop', vak: 'WT', kolom: 12, waarde: '', reden: 'De kop is leeg in de bron (test).', datum: '2026-11-09' }])).toEqual([]);
  });

  it('een rubriek met een leeftijd: alleen bekend, en de rondgang laat die ene waarde dan toe', () => {
    const ruw = leerplanRuw([rij(21, 'rubriek', 'Met leeftijd', { lft: ['10-11'] })]);
    expect(soorten(ruw)).toContain('rubriek-met-leeftijd');
    const bekend: BekendeAfwijking = { soort: 'rubriek-met-leeftijd', vak: 'WT', rij: 21, tekst: 'Met leeftijd', reden: 'Een rubriek heeft geen leeftijd (test).', datum: '2026-11-09' };
    const u = leerplanOm(ruw, [KAPOT, bekend]);
    expect(nieuweSoorten(u.afwijkingen)).toEqual([]);
    expect(rondgangLeerplan(ruw, u.bestand as GoLeerplanBestand).gelijk).toBe(false);
    expect(rondgangLeerplan(ruw, u.bestand as GoLeerplanBestand, { leeftijdGenegeerd: (x) => x === 21 }).gelijk).toBe(true);
  });

  it('opgemaakte tekst: alleen met een besluit; dan letterlijk met de opmaak, en tekst blijft volledig', () => {
    const ruw = leerplanRuw();
    ruw.rijen[9] = { ...ruw.rijen[9], opmaak: { '2': [{ t: 'Herkennen verschillende' }, { t: ' ', strike: true }, { t: 'voedingswijzen van dieren.' }] } };
    ruw.rijen[9].c[2] = 'Herkennen verschillende voedingswijzen van dieren.';
    expect(soorten(ruw)).toContain('opmaak');
    const besluit: BekendeAfwijking = { soort: 'opmaak', vak: 'WT', rij: 10, kolom: 2, tekst: 'Herkennen verschillende voedingswijzen van dieren.', besluit: 'opmaak-bewaren', reden: 'Een doorgehaalde spatie (test).', datum: '2026-11-09' };
    const u = leerplanOm(ruw, [KAPOT, besluit]);
    expect(nieuweSoorten(u.afwijkingen)).toEqual([]);
    expect(u.bestand?.doelen[1]).toMatchObject({ tekst: 'Herkennen verschillende voedingswijzen van dieren.', opmaak: [{ t: 'Herkennen verschillende' }, { t: ' ', s: true }, { t: 'voedingswijzen van dieren.' }] });
    expect(valideerGoLeerplan(JSON.parse(JSON.stringify(u.bestand)))).toEqual([]);
    // Een besluit voor een andere tekst geldt niet.
    expect(soorten(ruw, [KAPOT, { ...besluit, tekst: 'iets anders' }])).toContain('opmaak');
  });

  it('superschrift wordt een eigen stuk; subschrift wordt niet ondersteund', () => {
    const ruw = leerplanRuw([rij(21, 'te hanteren begrippen', '1cm3', { lft: ['2,5-4'] })]);
    ruw.rijen[20].opmaak = { '2': [{ t: '1cm' }, { t: '3', vertAlign: 'superscript' }] };
    const besluit: BekendeAfwijking = { soort: 'opmaak', vak: 'WT', rij: 21, kolom: 2, tekst: '1cm3', besluit: 'opmaak-bewaren', reden: 'Superschrift (test).', datum: '2026-11-09' };
    const u = leerplanOm(ruw, [KAPOT, besluit]);
    expect(laatste(u.bestand?.doelen[2].inhoud)).toMatchObject({ tekst: '1cm3', opmaak: [{ t: '1cm' }, { t: '3', sup: true }] });
    ruw.rijen[20].opmaak = { '2': [{ t: 'H' }, { t: '2', vertAlign: 'subscript' }, { t: 'O' }] };
    ruw.rijen[20].c[2] = 'H2O';
    expect(soorten(ruw, [KAPOT, { ...besluit, tekst: 'H2O' }])).toContain('opmaak');
  });

  it('cursief uit een run wordt zonder melding bewaard (de tekst verandert niet); rondgang en validator in orde', () => {
    const tekst = 'Seppe bouwt een toren (algoritmisch denken; decompositie)';
    const ruw = leerplanRuw([rij(21, 'voorbeelden - bullet', tekst)]);
    ruw.rijen[20].opmaak = { '2': [{ t: 'Seppe bouwt een toren (' }, { t: 'algoritmisch denken; decompositie', i: true }, { t: ')' }] };
    const u = leerplanOm(ruw);
    expect(u.afwijkingen.nieuwe).toEqual([]);
    expect(u.afwijkingen.lijst.map((a) => a.soort)).not.toContain('opmaak');
    expect(laatste(u.bestand?.doelen[2].inhoud)).toEqual({
      soort: 'voorbeeld',
      tekst,
      opmaak: [{ t: 'Seppe bouwt een toren (' }, { t: 'algoritmisch denken; decompositie', i: true }, { t: ')' }],
      rij: 21,
    });
    expect(valideerGoLeerplan(JSON.parse(JSON.stringify(u.bestand)))).toEqual([]);
    expect(rondgangLeerplan(ruw, u.bestand as GoLeerplanBestand).gelijk).toBe(true);
  });

  it('cursief samen met doorhaling: de doorhaling vraagt nog altijd een besluit; daarna beide bewaard', () => {
    const ruw = leerplanRuw([rij(21, 'voorbeelden - bullet', 'ab c')]);
    ruw.rijen[20].opmaak = { '2': [{ t: 'a', i: true }, { t: 'b', strike: true }, { t: ' c' }] };
    expect(soorten(ruw)).toContain('opmaak');
    const besluit: BekendeAfwijking = { soort: 'opmaak', vak: 'WT', rij: 21, kolom: 2, tekst: 'ab c', besluit: 'opmaak-bewaren', reden: 'Doorhaling en cursief (test).', datum: '2026-11-09' };
    const u = leerplanOm(ruw, [KAPOT, besluit]);
    expect(nieuweSoorten(u.afwijkingen)).toEqual([]);
    expect(laatste(u.bestand?.doelen[2].inhoud)).toMatchObject({ tekst: 'ab c', opmaak: [{ t: 'a', i: true }, { t: 'b', s: true }, { t: ' c' }] });
  });

  it('een run zonder cursief, doorhaling of superschrift geeft geen opmaak', () => {
    const ruw = leerplanRuw([rij(21, 'voorbeelden - bullet', 'gewoon')]);
    ruw.rijen[20].opmaak = { '2': [{ t: 'gew' }, { t: 'oon', i: false }] };
    const u = leerplanOm(ruw);
    expect(u.afwijkingen.nieuwe).toEqual([]);
    expect(laatste(u.bestand?.doelen[2].inhoud)).toEqual({ soort: 'voorbeeld', tekst: 'gewoon', rij: 21 });
  });

  it('een minimumdoel-rij met tekst: een afwijking, of als bekende afwijking een MIA-item van het doel erboven', () => {
    const ruw = leerplanRuw([rij(21, 'minimumdoel', '0 tot en met 100')]);
    expect(soorten(ruw)).toContain('minimumdoelrij');
    const bekend: BekendeAfwijking = { soort: 'minimumdoelrij-is-inhoud', vak: 'WT', rij: 21, doel: 'WT.003', als: 'MIA - niet aanklikbaar', tekst: '0 tot en met 100', reden: 'Een MIA-item met het verkeerde TYPE (test).', datum: '2026-11-09' };
    const u = leerplanOm(ruw, [KAPOT, bekend]);
    expect(nieuweSoorten(u.afwijkingen)).toEqual([]);
    expect(laatste(u.bestand?.doelen[2].inhoud)).toEqual({ soort: 'mia', tekst: '0 tot en met 100', aanklikbaar: false, rij: 21 });
    expect(rondgangLeerplan(ruw, u.bestand as GoLeerplanBestand, { typeVan: (x) => (x === 21 ? 'MIA - niet aanklikbaar' : undefined) }).gelijk).toBe(true);
    expect(soorten(ruw, [KAPOT, { ...bekend, doel: 'WT.001' }])).toContain('minimumdoelrij');
  });

  it('een code die geen doel vindt: een probleem; een voorstel alleen als bekende afwijking', () => {
    const ruw = leerplanRuw([rij(21, 'doelzin', 'Tekst.', { code: 'WT.004', ko: '3.1.2, 3.13', kv: 'begrijpen', lft: ['2,5-4'] })]);
    const u0 = leerplanOm(ruw);
    expect(nieuweSoorten(u0.afwijkingen)).toEqual(['koppeling-probleem']);
    expect(u0.bestand?.doelen[3].minimumdoelen.problemen).toEqual([{ moment: 'KO', bronCode: '3.13', reden: 'onleesbaar' }]);
    const voorstel: BekendeAfwijking = { soort: 'koppeling-voorstel', doel: 'WT.004', moment: 'KO', bronCode: '3.13', voorstel: '3.1.3', reden: 'Tikfout in de bron (test).', datum: '2026-11-09' };
    const u = leerplanOm(ruw, [KAPOT, voorstel]);
    expect(nieuweSoorten(u.afwijkingen)).toEqual([]);
    expect(u.bestand?.doelen[3].minimumdoelen.refs[1]).toEqual({ set: 'ODS_3410', id: '92929', code: '3.1.3', moment: 'KO', status: 'voorstel', bronCode: '3.13' });
    expect(u.tellingen).toMatchObject({ doelzinCodes: 5, doelzinOfficieel: 4, doelzinVoorstel: 1, doelzinProblemen: 1 });
    expect(valideerGoLeerplan(JSON.parse(JSON.stringify(u.bestand)))).toEqual([]);
  });

  it('een code van een vak dat de vakdiscipline niet verwacht: een afwijking, of bekend met twijfel ander-vak', () => {
    const ruw = leerplanRuw([rij(21, 'doelzin', 'Tekst.', { code: 'WT.004', ko: '4.2.3', kv: 'begrijpen', lft: ['2,5-4'] })]);
    expect(soorten(ruw)).toEqual(['koppeling-ander-vak']);
    const bekend: BekendeAfwijking = { soort: 'koppeling-ander-vak', doel: 'WT.004', moment: 'KO', code: '4.2.3', reden: 'Een code van aardrijkskunde (test).', datum: '2026-11-09' };
    const u = leerplanOm(ruw, [KAPOT, bekend]);
    expect(u.bestand?.doelen[3].minimumdoelen.refs[0]).toMatchObject({ code: '4.2.3', status: 'officieel', twijfel: ['ander-vak'] });
    expect(u.tellingen.twijfelAnderVak).toBe(1);
  });

  it('een tabblad dat geen vakdiscipline is: geen bestand', () => {
    expect(leerplanOm({ ...leerplanRuw(), blad: 'Blad1' }).bestand).toBeUndefined();
  });
});

// ══ Over lesplan en doelenset heen ════════════════════════════════════
describe('controleerLesplanTegenLeerplan', () => {
  // Een doelenset met de doelen van het lesplan (WT.001, WT.008, WT.028) en LL.001 voor de vlag.
  const wtRuw = () => {
    const rijen: RuwRij[] = [{ r: 1, c: KOP }, rij(2, 'onderwerp', 'Organismen')];
    let nr = 3;
    for (let n = 1; n <= 28; n++) {
      const code = `WT.${String(n).padStart(3, '0')}`;
      const tekst = n === 1 ? 'Herkennen het organisme dier.' : n === 8 ? 'Herkennen verschillende voedingswijzen van dieren.' : n === 28 ? 'Onderscheiden dieren en planten.' : `Doel ${n}.`;
      rijen.push(rij(nr++, 'doelzin', tekst, { code, kv: n === 28 ? 'gebruiken' : 'begrijpen', lft: ['2,5-4'], vlaggen: n === 1 ? 'LL.001' : undefined }));
      if (n === 8) rijen.push(rij(nr++, 'MIA - titel', 'Dieren:'), rij(nr++, 'MIA - aanklikbaar', 'zoogdieren'), rij(nr++, 'MIA - aanklikbaar', 'vogels'));
    }
    return { ...leerplanRuw(), rijen };
  };
  const llRuw = (): RuwXlsx => ({
    ...leerplanRuw(),
    blad: 'Leren leren',
    rijen: [{ r: 1, c: KOP }, rij(2, 'subthema', 'Zelfregulatie'), rij(3, 'doelzin', 'Herkennen manieren om de impulsen te controleren.', { code: 'LL.001', kv: 'begrijpen', lft: ['2,5-4', '4-5', '5-6'] })],
  });
  const leerplannen = () => {
    const m = new Map<GoVak, GoLeerplanBestand>();
    m.set('WT', leerplanOm(wtRuw(), [], () => true).bestand as GoLeerplanBestand);
    m.set('LL', leerplanOm(llRuw(), [], () => true).bestand as GoLeerplanBestand);
    return m;
  };
  const DOELTEKST: BekendeAfwijking = { soort: 'lesplan-doeltekst', lesplan: 'LP0065', doel: 'WT.008', tekst: 'Herkennen de belangrijkste voedingswijze van dieren.', reden: 'Het lesplan heeft een andere tekst (test).', datum: '2026-11-09' };
  const controleer = (ruw: RuwDocx, bekende: BekendeAfwijking[] = [DOELTEKST]) => {
    const u = zetOm(ruw);
    const afw = new Afwijkingen('LP0065');
    if (!u.bestand) throw new Error('geen bestand');
    controleerLesplanTegenLeerplan(u.bestand, u.extra, leerplannen(), new Bekende(bekende), afw);
    return afw;
  };

  it('in orde, met de bekende afwijking voor de tekst van WT.008', () => {
    const afw = controleer(lesplanRuw());
    expect(afw.nieuwe).toEqual([]);
    expect(afw.lijst.map((a) => a.soort)).toEqual(['lesplan-doeltekst']);
  });

  it('een andere tekst zonder bekende afwijking', () => {
    expect(nieuweSoorten(controleer(lesplanRuw(), []))).toEqual(['lesplan-doeltekst']);
  });

  it('een andere kennisverwerking of andere leeftijden, of een doel dat niet bestaat', () => {
    const deel2 = (regel: RuwRun[]) => [regel.length ? p(regel) : p([r('x')])];
    expect(nieuweSoorten(controleer(lesplanRuw({ deel2: deel2([r('WT.001', B), r(' [gebruiken]', I), r(' Herkennen het organisme dier. (2,5-4 jaar)')]) })))).toContain('lesplan-doel');
    expect(nieuweSoorten(controleer(lesplanRuw({ deel2: deel2([r('WT.001', B), r(' [begrijpen]', I), r(' Herkennen het organisme dier. (2,5-4 jaar, 4-5 jaar)')]) })))).toContain('lesplan-doel');
    expect(nieuweSoorten(controleer(lesplanRuw({ deel2: deel2([r('WT.099', B), r(' [begrijpen]', I), r(' Bestaat niet. (2,5-4 jaar)')]) })))).toContain('lesplan-doel');
  });

  it('MIA-items die niet die van het doel zijn', () => {
    const deel2 = [
      p([r('WT.008', B), r(' [begrijpen]', I), r(' Herkennen de belangrijkste voedingswijze van dieren. (2,5-4 jaar)')]),
      p([r('MIA', B), r(' — Dieren:')]),
      li([r('zoogdieren')]),
      li([r('vissen')]),
    ];
    expect(nieuweSoorten(controleer(lesplanRuw({ deel2 })))).toContain('lesplan-mia');
  });

  it('vlaggen die niet de unie van de kolom VLAGGEN zijn, of een vlagregel met een andere tekst', () => {
    expect(nieuweSoorten(controleer(lesplanRuw({ deel3vlag: [p([icoon('vlag'), r('   '), r('WT.002', B), r(' Doel 2. (2,5-4 jaar)')])] })))).toContain('lesplan-vlaggen');
    expect(nieuweSoorten(controleer(lesplanRuw({ deel3vlag: [p([icoon('vlag'), r('   '), r('LL.001', B), r(' Een andere tekst. (2,5-4 jaar, 4-5 jaar, 5-6 jaar)')])] })))).toContain('lesplan-vlaggen');
  });
});

// ══ Omgekeerde index en index ═════════════════════════════════════════
describe('maakBijMinimumdoel en maakIndex', () => {
  const wt = leerplanOm(leerplanRuw()).bestand as GoLeerplanBestand;
  const lp = zetOm(lesplanRuw()).bestand;
  if (!lp) throw new Error('geen lesplan');
  // Het lesplan noemt WT.001 en WT.003 niet: maak een variant met WT.001 en WT.003 in deel 2.
  const lesplan = { ...lp, afgeleid: { ...lp.afgeleid, leerplandoelen: lp.afgeleid.leerplandoelen.map((d, i) => ({ ...d, code: i === 1 ? 'WT.003' : d.code })) } };
  const bij = maakBijMinimumdoel([wt], [lesplan]);

  it('per vak van het minimumdoel een bestand, in orde volgens de validator', () => {
    expect(bij.map((b) => b.vak)).toEqual([3]);
    for (const b of bij) expect(valideerGoBijMinimumdoel(JSON.parse(JSON.stringify(b)))).toEqual([]);
  });

  it('per vast nummer de leerplandoelen, oplopend op code, met hun lesplannen', () => {
    const d = bij[0].doelen;
    expect(Object.keys(d).sort()).toEqual(['92590', '92822', '93100']);
    expect(d['92590'].map((x) => [x.code, x.moment, x.lesplannen])).toEqual([
      ['WT.001', 'KO', ['LP0065']],
      ['WT.003', 'KO', ['LP0065']],
    ]);
    expect(d['92822'][0]).toMatchObject({ code: 'WT.003', moment: 'L6', twijfel: ['moment-buiten-leeftijden'] });
  });

  it('een koppeling alleen via een MIA-rij krijgt "via", met de letterlijke tekst van die rij', () => {
    expect(bij[0].doelen['93100']).toEqual([
      {
        code: 'WT.003',
        moment: 'L4',
        status: 'officieel',
        twijfel: ['moment-buiten-leeftijden'],
        tekst: 'Onderscheiden dieren en planten.',
        kennisverwerking: 'gebruiken',
        leeftijden: ['2,5-4', '4-5'],
        lesplannen: ['LP0065'],
        via: [{ soort: 'mia-titel', tekst: 'Aftrekken:', rij: 18 }],
      },
    ]);
  });

  it('de index past bij de bestanden en is in orde volgens de validator', () => {
    const index = maakIndex([wt], bij, [lp], '2026-11-09');
    expect(valideerGoIndex(JSON.parse(JSON.stringify(index)))).toEqual([]);
    expect(index.leerplan[0]).toMatchObject({ vak: 'WT', aantal: 3, zonderMinimumdoel: 1, perLeeftijd: { '2,5-4': 3, '4-5': 1, '5-6': 0 }, bronDatum: '2026-09-03T09:39:57Z', sha256: wt.sha256 });
    expect(index.lesplannen[0]).toMatchObject({ code: 'LP0065', vak: 'WT', doelen: ['WT.001', 'WT.008', 'WT.028'], bestand: 'lesplannen/LP0065.json', sha256: lp.sha256 });
    expect(index.bijMinimumdoel).toEqual([{ vak: 3, bestand: 'bij-minimumdoel/3.json', sha256: bij[0].sha256 }]);
  });
});
