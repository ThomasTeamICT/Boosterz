// Kleine ruwe lesplannen en doelensets, als de uitvoer van tools/basis/go/lees_docx.py en lees_xlsx.py, voor de tests
// van de import: omzetten.test.ts (de omzetting en de controles) en maak.script.test.ts (tools/basis/go/maak.ts als
// apart proces). Geen test op zich: vitest pikt alleen *.test.ts op, en de app importeert dit bestand nooit.
import type { RuwAlinea, RuwBlok, RuwBron, RuwCel, RuwDocx, RuwRij, RuwRun, RuwXlsx } from './omzetten';

/** Een bron die bij geen enkel echt bestand hoort: maak.script.test.ts zet de echte grootte en sha256. */
export const RUW_BRON: RuwBron = { bytes: 1234, sha256: 'a'.repeat(64) };

/** De velden van een ruwe doelenset zonder vreemde cellen, verborgen rijen of kolommen, opmerkingen of beelden. */
export const XLSX_LEEG: Pick<RuwXlsx, 'bron' | 'merged' | 'tellingen' | 'vreemde_cellen' | 'verborgen_rijen' | 'verborgen_kolommen' | 'opmerkingen' | 'beelden'> = {
  bron: RUW_BRON,
  merged: [],
  tellingen: {},
  vreemde_cellen: [],
  verborgen_rijen: [],
  verborgen_kolommen: [],
  opmerkingen: 0,
  beelden: [],
};

// ══ Hulp: ruwe docx ══════════════════════════════════════════════════
export type Opmaak = { b?: boolean; i?: boolean; u?: boolean; strike?: boolean };
export const r = (tekst: string, o: Opmaak = {}): RuwRun => ({ t: 'tekst', tekst, ...o });
export const B = { b: true };
export const I = { i: true };
export const p = (runs: RuwRun[], stijl: string | null = null): RuwAlinea => ({ t: 'p', stijl, stijlen_ruw: stijl ? [stijl] : [], num: null, runs });
export const li = (runs: RuwRun[], numId = '1', fmt = 'bullet'): RuwAlinea => ({ t: 'p', stijl: 'ListParagraph', stijlen_ruw: ['ListParagraph'], num: { numId, ilvl: 0, fmt, start: 1 }, runs });
export const h = (n: 1 | 2 | 3 | 4, tekst: string) => p([r(tekst)], `Heading${n}`);
export const icoon = (naam: string): RuwRun => ({ t: 'beeld', bestand: `word/media/lesplan-${naam}.png`, sha1: `${'0'.repeat(39)}1`, breed: 133350, hoog: 133350 });
export const pagina = (): RuwAlinea => p([{ t: 'br', soort: 'page' }]);
export const cel = (blokken: RuwBlok[], o: Partial<RuwCel> = {}): RuwCel => ({ span: 1, vmerge: null, vulling: null, blokken, ...o });
export const kopcel = (blokken: RuwBlok[]): RuwCel => cel(blokken, { vulling: 'F2F2F2' });
export const tbl = (rijen: RuwCel[][]): RuwBlok => ({ t: 'tbl', rijen: rijen.map((cellen) => ({ cellen })) });
export const watHoeKop = () => [kopcel([p([r('', B)], 'Strong')]), kopcel([p([r('Inhoud (Wat?)', B)], 'Strong')]), kopcel([p([r('Didactiek (Hoe?)', B)], 'Strong')])];

export const STAPNAMEN = ['Verkennen', 'Voorkeursinstructie', 'Terugkoppelen', 'Begeleid inoefenen', 'Kleine lesafsluiting', 'Zelfstandige verwerking'];

export interface LesplanOpties {
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
export function lesplanRuw(o: LesplanOpties = {}): RuwDocx {
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
  return { bestand: 'LP0065.docx', bron: RUW_BRON, gemaakt: '2026-10-01T08:00:00Z', media: [], stijlen: {}, tellingen: { alineas: 1 }, body };
}

// ══ Hulp: ruwe xlsx ══════════════════════════════════════════════════
export const KOP = ['TYPE', 'GO! NR.', 'INHOUD', 'KO nummer', 'KO minimumdoel', 'KO omschrijving', 'L4 nummer', 'L4 minimumdoel', 'L4 omschrijving', 'L6 nummer', 'L6 minimumdoel', 'L6 omschrijving', 'KENNISVERWERKING', '2,5-4', '4-5', '5-6', '6-7', '7-8', '8-9', '9-10', '10-11', '11-12', 'VLAGGEN', 'SCHAKELS'];
export const NUL = ['0', '0', '0', '0', '0', '0', '0', '0', '0'];
export interface RijOpties {
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
export const LFT = ['2,5-4', '4-5', '5-6', '6-7', '7-8', '8-9', '9-10', '10-11', '11-12'];
export function rij(nr: number, type: string, inhoud: string | null, o: RijOpties = {}): RuwRij {
  const leeftijden = o.lft ? LFT.map((l) => (o.lft?.includes(l) ? '1' : '0')) : NUL;
  return {
    r: nr,
    c: [type, o.code ?? null, inhoud, o.ko ?? null, o.koTekst ?? null, null, o.l4 ?? null, null, null, o.l6 ?? null, null, null, o.kv ?? null, ...leeftijden, o.vlaggen ?? null, o.schakels ?? null],
  };
}

/** Een kleine doelenset wetenschap en techniek (naar de echte, ingekort). */
export function leerplanRuw(extra: RuwRij[] = [], vervang?: (rijen: RuwRij[]) => RuwRij[]): RuwXlsx {
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
  return { bestand: 'wetenschap_techniek.xlsx', ...XLSX_LEEG, gewijzigd: '2026-09-03T09:39:57Z', bladnamen: [{ naam: 'Wetenschap en techniek', staat: 'zichtbaar' }], blad: 'Wetenschap en techniek', rijen };
}

/** Een doelenset met de doelen van het lesplan (WT.001, WT.008, WT.028); LL.001 (llRuw) voor de vlag. */
export const wtRuw = (): RuwXlsx => {
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
export const llRuw = (): RuwXlsx => ({
  ...leerplanRuw(),
  blad: 'Leren leren',
  rijen: [{ r: 1, c: KOP }, rij(2, 'subthema', 'Zelfregulatie'), rij(3, 'doelzin', 'Herkennen manieren om de impulsen te controleren.', { code: 'LL.001', kv: 'begrijpen', lft: ['2,5-4', '4-5', '5-6'] })],
});
