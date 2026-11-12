import { describe, expect, it } from 'vitest';
import { normaliseerDoeltekst } from '../../curriculum';
import type { MinimumdoelKandidaat, Opzoektabel } from './koppelen';
import {
  Afwijkingen,
  Bekende,
  controleerLesplanTegenLeerplan,
  controleerLessenlijnen,
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
  type RuwDocx,
  type RuwOpmaakRun,
  type RuwRun,
  type RuwXlsx,
} from './omzetten';
import { B, I, KOP, NUL, RUW_BRON, STAPNAMEN, XLSX_LEEG, cel, h, icoon, kopcel, leerplanRuw, lesplanRuw, li, llRuw, p, r, rij, tbl, wtRuw } from './testRuw';
import { rondgangLeerplan, rondgangLesplan } from './rondgang';
import { leerplanShaInvoer, lesplanShaInvoer, type GoLeerplanBestand, type GoMoment, type GoVak, type Regel, type TekstStuk } from './types';
import { valideerGoBijMinimumdoel, valideerGoIndex, valideerGoLeerplan, valideerGoLesplan } from './valideer';

const BRON = { bytes: 1234, sha256: 'b'.repeat(64), ingelezen: '2026-11-09' };
const zetOm = (ruw: RuwDocx, bekende: BekendeAfwijking[] = []) => zetLesplanOm(ruw, { bekende: new Bekende(bekende), bron: BRON });
const nieuweSoorten = (a: Afwijkingen) => a.nieuwe.map((x) => x.soort);
const laatste = <T>(l: readonly T[] | undefined): T | undefined => (l ? l[l.length - 1] : undefined);

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
  'KO 2.4.3': { set: 'ODS_3405', id: '93005', code: '2.4.3' },
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
    expect(controleerRuwDocx({ bestand: 'x', bron: RUW_BRON, gemaakt: null, body: [{ t: 'p', stijl: null, num: null, runs: [{ t: 'raar' }] }], media: [], tellingen: {} })).toEqual(['body[0].runs[0] heeft een onbekende soort']);
    expect(controleerRuwDocx(null)).toEqual(['de ruwe docx-JSON is geen object']);
    expect(controleerRuwXlsx({ bestand: 'x', ...XLSX_LEEG, blad: 'y', gewijzigd: null, bladnamen: [], rijen: [{ r: 2, c: [] }, { r: 1, c: [] }] })[0]).toMatch(/lopen niet op/);
    expect(controleerRuwXlsx({ bestand: 'x', ...XLSX_LEEG, blad: 'y', gewijzigd: null, bladnamen: [], rijen: [{ r: 1, c: [3] }] })[0]).toMatch(/geen tekst/);
  });

  it('eisen het veld bron: {bytes, sha256} van het gelezen bestand (IMP-2)', () => {
    const zonder = <T extends object>(o: T, k: string) => Object.fromEntries(Object.entries(o).filter(([x]) => x !== k));
    expect(controleerRuwDocx(zonder(lesplanRuw(), 'bron')).join()).toMatch(/"bron" ontbreekt/);
    expect(controleerRuwXlsx(zonder(leerplanRuw(), 'bron')).join()).toMatch(/"bron" ontbreekt/);
    for (const bron of [{ bytes: 1, sha256: 'A'.repeat(64) }, { bytes: -1, sha256: 'a'.repeat(64) }, { bytes: 1.5, sha256: 'a'.repeat(64) }, { bytes: 1, sha256: 'a'.repeat(63) }, { bytes: 1 }, 'x']) {
      expect(controleerRuwDocx({ ...lesplanRuw(), bron }).join(), JSON.stringify(bron)).toMatch(/"bron" ontbreekt of is ongeldig/);
    }
  });

  it('eisen de lijsten van vreemde cellen, verborgen rijen en kolommen, opmerkingen en beelden (IMP-4, BLP-4)', () => {
    for (const k of ['vreemde_cellen', 'verborgen_rijen', 'verborgen_kolommen', 'opmerkingen', 'beelden']) {
      const ruw = Object.fromEntries(Object.entries(leerplanRuw()).filter(([x]) => x !== k));
      expect(controleerRuwXlsx(ruw).join(), k).toMatch(new RegExp(`"${k}"`));
    }
    expect(controleerRuwXlsx({ ...leerplanRuw(), vreemde_cellen: [{ r: 1, k: 0, soort: 'n' }] }).join()).toMatch(/vreemde_cellen/);
    expect(controleerRuwXlsx({ ...leerplanRuw(), beelden: [[1]] }).join()).toMatch(/beelden/);
    expect(controleerRuwXlsx({ ...leerplanRuw(), verborgen_kolommen: [[1, -2]] }).join()).toMatch(/verborgen_kolommen/);
    expect(controleerRuwXlsx({ ...leerplanRuw(), opmerkingen: '0' }).join()).toMatch(/opmerkingen/);
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
    const opmaak = { soort: 'opmaak', vak: 'WI', rij: 3, kolom: 2, tekst: 'x', besluit: 'opmaak-weglaten', reden: 'Een reden van genoeg lengte.', datum: '2026-11-12' };
    expect(fouten(opmaak)).toEqual([]);
    for (const besluit of ['weglaten', 'opmaak-tonen', 'Opmaak-weglaten', '', 1, null]) expect(fouten({ ...opmaak, besluit }).join(), String(besluit)).toMatch(/"besluit" is 'opmaak-bewaren' of 'opmaak-weglaten'/);
    expect(fouten({ ...opmaak, besluit: undefined }).join()).toMatch(/veld "besluit" ontbreekt/);
    expect(fouten({ soort: 'lesplan-beeld', sha1: 'a', lesplannen: ['LP0001'], status: 'getoond', reden: 'Een reden van genoeg lengte.', datum: '2026-11-09' }).join()).toMatch(/"bestand" en "alt"/);
    expect(leesBekendeAfwijkingen({ lijst: [] }).fouten[0]).toMatch(/geen lijst "afwijkingen"/);
  });

  it('een getoond beeld mag een sha256 hebben, maar dan een echte (IMP-6); nieuwe soorten zijn streng', () => {
    const fouten = (a: unknown) => leesBekendeAfwijkingen({ afwijkingen: [a] }).fouten;
    const beeld = { soort: 'lesplan-beeld', sha1: 'a'.repeat(40), lesplannen: ['LP0014a'], status: 'getoond', bestand: 'beelden/a.webp', alt: 'Een beeld.', reden: 'Een reden van genoeg lengte.', datum: '2026-11-09' };
    expect(fouten(beeld)).toEqual([]);
    expect(fouten({ ...beeld, sha256: '9433715e48416f710a1c487879fdfd2be6ab4fa39426643bb6f770703591c2ce' })).toEqual([]);
    for (const sha256 of ['9433715E48416F710A1C487879FDFD2BE6AB4FA39426643BB6F770703591C2CE', 'abc', 65744, '']) expect(fouten({ ...beeld, sha256 }).join(), String(sha256)).toMatch(/sha256/);
    expect(fouten({ ...beeld, bytes: 65744 }).join()).toMatch(/onbekend veld "bytes"/);
    const basis = { reden: 'Een reden van genoeg lengte.', datum: '2026-11-09' };
    expect(fouten({ soort: 'xlsx-beeld', vak: 'WI', rij: 898, kolom: 2, ...basis })).toEqual([]);
    expect(fouten({ soort: 'xlsx-beeld', vak: 'WI', rij: '898', kolom: 2, ...basis }).join()).toMatch(/"rij" is geen geheel getal/);
    expect(fouten({ soort: 'lesplan-leeftijd', lesplan: 'LP0065', doel: 'WT.001', ...basis })).toEqual([]);
    expect(fouten({ soort: 'lesplan-leeftijd', lesplan: 'LP0065', ...basis }).join()).toMatch(/"doel" ontbreekt/);
    expect(fouten({ soort: 'lessenlijn-variant', lesplan: 'LP0060', veld: 'lessenlijn', naam: 'Biologie van Organismen', ...basis })).toEqual([]);
    expect(fouten({ soort: 'lessenlijn-variant', lesplan: 'LP0060', veld: 'lijn', naam: 'x', ...basis }).join()).toMatch(/lessenlijn of lessenreeks/);
  });

  it("koppeling-ander-vak mag een voorstel hebben (vorm B): een andere code van de vorm cijfer.cijfer.cijfer", () => {
    const fouten = (a: unknown) => leesBekendeAfwijkingen({ afwijkingen: [a] }).fouten;
    const regel = { soort: 'koppeling-ander-vak', doel: 'WI.706', moment: 'KO', code: '4.2.3', reden: 'Een reden van genoeg lengte.', datum: '2026-11-11' };
    expect(fouten(regel)).toEqual([]);
    expect(fouten({ ...regel, voorstel: '2.4.3' })).toEqual([]);
    for (const voorstel of ['2.43', '4.2.3', '', 243]) expect(fouten({ ...regel, voorstel }).join(), String(voorstel)).toMatch(/"voorstel" is een andere code/);
    // Alleen bij die soort: elders is het een onbekend veld.
    expect(fouten({ ...KAPOT, voorstel: '2.4.3' }).join()).toMatch(/onbekend veld "voorstel"/);
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

  describe("besluit 'opmaak-weglaten': alleen de doorhaling van een spatie of leesteken valt weg, de tekst blijft byte-gelijk", () => {
    const weglaten = (r: number, tekst: string): Extract<BekendeAfwijking, { soort: 'opmaak' }> => ({ soort: 'opmaak', vak: 'WT', rij: r, kolom: 2, tekst, besluit: 'opmaak-weglaten', reden: 'Een doorgehaalde spatie (test).', datum: '2026-11-12' });
    /** Een doelzin (rij 10, WT.002) met deze runs in INHOUD; de tekst van de cel is alle runs samen. */
    const doelzin = (runs: RuwOpmaakRun[]) => {
      const ruw = leerplanRuw();
      ruw.rijen[9] = { ...ruw.rijen[9], c: [...ruw.rijen[9].c], opmaak: { '2': runs } };
      ruw.rijen[9].c[2] = runs.map((x) => x.t).join('');
      return ruw;
    };
    /** Een voorbeeld (rij 21) onder WT.003 met deze runs. */
    const voorbeeld = (runs: RuwOpmaakRun[]) => {
      const ruw = leerplanRuw([rij(21, 'voorbeelden - bullet', runs.map((x) => x.t).join(''))]);
      ruw.rijen[20].opmaak = { '2': runs };
      return ruw;
    };
    const opmaakMeldingen = (a: Afwijkingen) => a.lijst.filter((x) => x.soort === 'opmaak');

    it('een doorgehaalde spatie tussen twee woorden (zoals WI.386): geen opmaak meer, dezelfde tekst, bekend met de melding', () => {
      const tekst = 'Tellen gerelateerde breuken op. ';
      const ruw = doelzin([{ t: 'Tellen gerelateerde' }, { t: ' ', strike: true }, { t: 'breuken op. ' }]);
      const u = leerplanOm(ruw, [KAPOT, weglaten(10, tekst)]);
      expect(nieuweSoorten(u.afwijkingen)).toEqual([]);
      const doel = u.bestand?.doelen[1];
      expect(doel?.tekst).toBe(tekst);
      expect(doel && 'opmaak' in doel).toBe(false);
      const m = opmaakMeldingen(u.afwijkingen);
      expect(m).toHaveLength(1);
      expect(m[0].bekend?.reden).toBe('Een doorgehaalde spatie (test).');
      expect(m[0].bericht).toContain('doorhaling weggelaten');
      expect(valideerGoLeerplan(JSON.parse(JSON.stringify(u.bestand)))).toEqual([]);
      expect(rondgangLeerplan(ruw, u.bestand as GoLeerplanBestand).gelijk).toBe(true);
    });

    it('een doorgehaalde punt (zoals WI.604) en een harde spatie, tab of regeleinde: ook weggelaten', () => {
      for (const weg of ['.', '\u00a0', '\t', '\n', ' . ', ',;:!?\u2026']) {
        const runs: RuwOpmaakRun[] = [{ t: 'Berekenen de omtrek van een grillige figuur.' }, { t: weg, strike: true }];
        const u = leerplanOm(doelzin(runs), [KAPOT, weglaten(10, runs.map((x) => x.t).join(''))]);
        expect(nieuweSoorten(u.afwijkingen), JSON.stringify(weg)).toEqual([]);
        expect(u.bestand?.doelen[1], JSON.stringify(weg)).toEqual(expect.objectContaining({ tekst: runs.map((x) => x.t).join('') }));
        expect(u.bestand?.doelen[1].opmaak, JSON.stringify(weg)).toBeUndefined();
      }
    });

    it('dubbele doorhaling telt als doorhaling; superschrift en cursief in dezelfde cel blijven staan', () => {
      const runs: RuwOpmaakRun[] = [{ t: '1 m' }, { t: '3', vertAlign: 'superscript' }, { t: ' ', dstrike: true }, { t: 'volume', i: true }, { t: '.', strike: true }];
      const u = leerplanOm(voorbeeld(runs), [KAPOT, weglaten(21, '1 m3 volume.')]);
      expect(nieuweSoorten(u.afwijkingen)).toEqual([]);
      expect(laatste(u.bestand?.doelen[2].inhoud)).toEqual({ soort: 'voorbeeld', tekst: '1 m3 volume.', opmaak: [{ t: '1 m' }, { t: '3', sup: true }, { t: ' ' }, { t: 'volume', i: true }, { t: '.' }], rij: 21 });
      expect(valideerGoLeerplan(JSON.parse(JSON.stringify(u.bestand)))).toEqual([]);
    });

    it('weigert een cel met doorgehaalde woorden: een nieuwe afwijking, en de doorhaling blijft staan (nooit stil als gewone tekst)', () => {
      const runs: RuwOpmaakRun[] = [{ t: 'De kleuters kunnen massa ' }, { t: '(‘gewicht’)', strike: true }, { t: ' ', strike: true }, { t: 'kwalitatief vergelijken.' }];
      const tekst = runs.map((x) => x.t).join('');
      const u = leerplanOm(doelzin(runs), [KAPOT, weglaten(10, tekst)]);
      expect(nieuweSoorten(u.afwijkingen)).toEqual(['opmaak']);
      expect(u.afwijkingen.nieuwe[0].bericht).toContain('hier is "(‘gewicht’)" doorgehaald');
      expect(u.bestand?.doelen[1]).toMatchObject({ tekst, opmaak: [{ t: 'De kleuters kunnen massa ' }, { t: '(‘gewicht’) ', s: true }, { t: 'kwalitatief vergelijken.' }] });
      // De bekende melding zegt niet dat de doorhaling wegviel.
      expect(opmaakMeldingen(u.afwijkingen).filter((x) => x.bekend).map((x) => x.bericht).join()).not.toContain('weggelaten');
    });

    it('weigert een doorgehaald cijfer, letter, haakje, aanhalingsteken, koppelteken, procent of wiskundig teken', () => {
      for (const weg of ['3', 'x', ' a ', '(', '"', '’', '-', '–', '%', '=', '≠', '<', '/', '\u200b']) {
        const runs: RuwOpmaakRun[] = [{ t: 'Tellen tot' }, { t: weg, strike: true }, { t: ' 20.' }];
        const u = leerplanOm(doelzin(runs), [KAPOT, weglaten(10, runs.map((x) => x.t).join(''))]);
        expect(nieuweSoorten(u.afwijkingen), JSON.stringify(weg)).toEqual(['opmaak']);
        expect(u.bestand?.doelen[1].opmaak?.some((x) => x.s), JSON.stringify(weg)).toBe(true);
      }
    });

    it('weigert als één van de doorgehaalde stukken echte tekst is, ook als de andere alleen spaties zijn', () => {
      const runs: RuwOpmaakRun[] = [{ t: 'a', strike: true }, { t: 'b' }, { t: ' ', strike: true }, { t: 'c' }];
      expect(nieuweSoorten(leerplanOm(doelzin(runs), [KAPOT, weglaten(10, 'ab c')]).afwijkingen)).toEqual(['opmaak']);
      // In omgekeerde volgorde ook.
      const omgekeerd: RuwOpmaakRun[] = [{ t: 'a' }, { t: ' ', strike: true }, { t: 'b' }, { t: 'c', strike: true }];
      expect(nieuweSoorten(leerplanOm(doelzin(omgekeerd), [KAPOT, weglaten(10, 'a bc')]).afwijkingen)).toEqual(['opmaak']);
    });

    it('weigert een doorhaling via de celstijl over de hele cel', () => {
      const runs: RuwOpmaakRun[] = [{ t: 'Doel 2.', strike: true, cel: true }];
      const u = leerplanOm(doelzin(runs), [KAPOT, weglaten(10, 'Doel 2.')]);
      expect(nieuweSoorten(u.afwijkingen)).toEqual(['opmaak']);
      expect(u.bestand?.doelen[1].opmaak).toEqual([{ t: 'Doel 2.', s: true }]);
    });

    it('weigert het besluit op een cel zonder doorhaling (alleen superschrift): het superschrift blijft', () => {
      const runs: RuwOpmaakRun[] = [{ t: '1cm' }, { t: '3', vertAlign: 'superscript' }];
      const u = leerplanOm(voorbeeld(runs), [KAPOT, weglaten(21, '1cm3')]);
      expect(nieuweSoorten(u.afwijkingen)).toEqual(['opmaak']);
      expect(u.afwijkingen.nieuwe[0].bericht).toMatch(/vindt geen doorgehaalde tekst/);
      expect(laatste(u.bestand?.doelen[2].inhoud)).toMatchObject({ tekst: '1cm3', opmaak: [{ t: '1cm' }, { t: '3', sup: true }] });
      // Een lege doorgehaalde run telt niet als doorhaling.
      const leeg: RuwOpmaakRun[] = [{ t: '1cm' }, { t: '', strike: true }, { t: '3', vertAlign: 'superscript' }];
      expect(nieuweSoorten(leerplanOm(voorbeeld(leeg), [KAPOT, weglaten(21, '1cm3')]).afwijkingen)).toEqual(['opmaak']);
    });

    it('een run zonder tekst (kapotte ruwe JSON) telt nooit als weglaatbaar', () => {
      const runs = [{ t: 'Doel 2.' }, { strike: true }] as unknown as RuwOpmaakRun[];
      const ruw = doelzin(runs);
      ruw.rijen[9].c[2] = 'Doel 2.';
      expect(nieuweSoorten(leerplanOm(ruw, [KAPOT, weglaten(10, 'Doel 2.')]).afwijkingen)).toContain('opmaak');
    });

    it('het besluit geldt alleen voor die tekst, dat vak, die rij en die kolom', () => {
      const tekst = 'Tellen gerelateerde breuken op. ';
      const ruw = doelzin([{ t: 'Tellen gerelateerde' }, { t: ' ', strike: true }, { t: 'breuken op. ' }]);
      const b = weglaten(10, tekst);
      for (const ander of [{ ...b, tekst: 'Tellen gerelateerde breuken op.' }, { ...b, rij: 11 }, { ...b, kolom: 3 }, { ...b, vak: 'LL' as GoVak }]) {
        const u = leerplanOm(ruw, [KAPOT, ander]);
        expect(nieuweSoorten(u.afwijkingen)).toEqual(['opmaak']);
        expect(u.bestand?.doelen[1].opmaak?.some((x) => x.s)).toBe(true);
      }
    });
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

  describe("vorm B: een voorstel naast de officiële koppeling met twijfel 'ander-vak' (zoals WI.706, 11 november 2026)", () => {
    const ruw = () => leerplanRuw([rij(21, 'doelzin', 'Tekst.', { code: 'WT.004', ko: '4.2.3', kv: 'begrijpen', lft: ['2,5-4'] })]);
    const regel = (voorstel: string, code = '4.2.3'): BekendeAfwijking => ({ soort: 'koppeling-ander-vak', doel: 'WT.004', moment: 'KO', code, voorstel, reden: 'Een code van aardrijkskunde (test).', datum: '2026-11-11' });

    it('de officiële koppeling blijft staan; het voorstel staat erna, met de officiële code als bronCode', () => {
      const u = leerplanOm(ruw(), [KAPOT, regel('3.1.2')]);
      expect(nieuweSoorten(u.afwijkingen)).toEqual([]);
      expect(u.bestand?.doelen[3].minimumdoelen).toEqual({
        bron: { KO: '4.2.3' },
        refs: [
          { set: 'ODS_3411', id: '92500', code: '4.2.3', moment: 'KO', status: 'officieel', twijfel: ['ander-vak'] },
          { set: 'ODS_3410', id: '92590', code: '3.1.2', moment: 'KO', status: 'voorstel', bronCode: '4.2.3' },
        ],
        problemen: [],
      });
      // Officieel blijft officieel: 1 van 1 code; het voorstel telt apart.
      expect(u.tellingen).toMatchObject({ doelzinCodes: 4, doelzinOfficieel: 4, doelzinVoorstel: 1, doelzinProblemen: 0, twijfelAnderVak: 1 });
      expect(u.afwijkingen.lijst.find((a) => a.soort === 'koppeling-ander-vak')?.bericht).toBe('KO 4.2.3 is een minimumdoel van vak 4, niet van een vak dat WT verwacht (voorstel 3.1.2, ODS_3410/92590)');
      expect(valideerGoLeerplan(JSON.parse(JSON.stringify(u.bestand)))).toEqual([]);
    });

    it('een voorstel dat geen doel vindt, stopt de import (een nieuwe afwijking)', () => {
      const u = leerplanOm(ruw(), [KAPOT, regel('3.9.9')]);
      expect(u.afwijkingen.nieuwe).toEqual([expect.objectContaining({ soort: 'koppeling-voorstel', bericht: 'het voorstel 3.9.9 voor KO "4.2.3" vindt geen doel' })]);
      expect(u.bestand?.doelen[3].minimumdoelen.refs.map((r) => r.status)).toEqual(['officieel']);
    });

    it('een voorstel naar een doel van een vak dat de vakdiscipline niet verwacht, stopt de import', () => {
      const u = leerplanOm(ruw(), [KAPOT, regel('2.4.3')]);
      expect(u.afwijkingen.nieuwe).toEqual([expect.objectContaining({ soort: 'koppeling-voorstel', bericht: 'het voorstel 2.4.3 voor KO 4.2.3 is een minimumdoel van vak 2, niet van een vak dat WT verwacht' })]);
    });

    it('zonder twijfel ander-vak wordt het voorstel nooit gebruikt: de regel is dan verouderd', () => {
      const bekende = new Bekende([KAPOT, regel('3.1.3', '3.1.2')]);
      const u = zetLeerplanOm(leerplanRuw([rij(21, 'doelzin', 'Tekst.', { code: 'WT.004', ko: '3.1.2', kv: 'begrijpen', lft: ['2,5-4'] })]), { bekende, tabel: TABEL, bestaat: (c) => /^WT\.00[1-3]$|^LL\.00\d$/.test(c), bronBestand: BRONXLSX, ingelezen: '2026-11-09' });
      expect(u.bestand?.doelen[3].minimumdoelen.refs.map((r) => `${r.code} ${r.status}`)).toEqual(['3.1.2 officieel']);
      expect(bekende.ongebruikt().map((a) => a.soort)).toEqual(['koppeling-ander-vak']);
    });

    it('de omgekeerde index: het leerplandoel staat als voorstel bij het voorgestelde doel, en de officiële koppeling noemt het voorstel', () => {
      const wt = leerplanOm(ruw(), [KAPOT, regel('3.1.2')]).bestand as GoLeerplanBestand;
      const bij = maakBijMinimumdoel([wt], []);
      expect(bij.map((b) => b.vak)).toEqual([3, 4]);
      for (const b of bij) expect(valideerGoBijMinimumdoel(JSON.parse(JSON.stringify(b)))).toEqual([]);
      const drie = bij[0].doelen['92590'];
      expect(drie.map((x) => [x.code, x.status, x.bronCode ?? null])).toEqual([
        ['WT.001', 'officieel', null],
        ['WT.003', 'officieel', null],
        ['WT.004', 'voorstel', '4.2.3'],
      ]);
      expect(drie.every((x) => x.voorstel === undefined)).toBe(true);
      expect(bij[1].doelen['92500']).toEqual([
        expect.objectContaining({ code: 'WT.004', moment: 'KO', status: 'officieel', twijfel: ['ander-vak'], voorstel: { set: 'ODS_3410', id: '92590', code: '3.1.2' } }),
      ]);
      expect(bij[1].doelen['92500'][0].bronCode).toBeUndefined();
    });
  });

  it('een tabblad dat geen vakdiscipline is: geen bestand', () => {
    expect(leerplanOm({ ...leerplanRuw(), blad: 'Blad1' }).bestand).toBeUndefined();
  });
});

// ══ Over lesplan en doelenset heen ════════════════════════════════════
describe('controleerLesplanTegenLeerplan', () => {
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

// ══ Wat een volgende reeks anders kan aanleveren (IMP-4, IMP-5, IMP-13, BLP-4, lessenlijnen) ══════════
describe('zetLesplanOm: onbekende opmaak en stijlen stoppen de import (IMP-5)', () => {
  it('een run-eigenschap buiten de gekende lijst: verborgen tekst, hoofdletters, een tekenstijl', () => {
    for (const k of ['rpr:vanish', 'rpr:caps', 'rpr:rStyle', 'rpr:smallCaps', 'rpr:noProof']) {
      const ruw = lesplanRuw();
      ruw.tellingen = { ...ruw.tellingen, [k]: 2 };
      expect(zetOm(ruw).afwijkingen.nieuwe, k).toContainEqual(expect.objectContaining({ soort: 'docx-opmaak', bericht: expect.stringContaining(`2 × ${k}`) as unknown }));
    }
  });

  it('de 11 gekende run-eigenschappen geven geen afwijking', () => {
    const ruw = lesplanRuw();
    for (const k of ['b', 'bCs', 'i', 'iCs', 'u', 'color', 'lang', 'rFonts', 'rtl', 'sz', 'szCs']) ruw.tellingen[`rpr:${k}`] = 5;
    expect(zetOm(ruw).afwijkingen.nieuwe).toEqual([]);
  });

  it('een alineastijl buiten de gekende lijst (bv. Heading5 of Normal)', () => {
    for (const stijl of ['Heading5', 'Title', 'Normal']) {
      const u = zetOm(lesplanRuw({ extraDeel: [p([r('Extra materiaal')], stijl)] }));
      expect(u.afwijkingen.nieuwe, stijl).toContainEqual(expect.objectContaining({ soort: 'docx-stijl', bericht: `de alineastijl ${stijl} is niet gekend` }));
    }
  });

  it('tekst in de stijl Strong zonder eigen vet; witruimte zonder vet en een pictogram mogen', () => {
    const u = zetOm(lesplanRuw({ extraDeel: [p([r('Belangrijk:', B), r(' was de handen.')], 'Strong')] }));
    expect(u.afwijkingen.nieuwe).toContainEqual(expect.objectContaining({ soort: 'docx-stijl', bericht: 'tekst in de stijl Strong zonder eigen vet' }));
    expect(zetOm(lesplanRuw({ extraDeel: [p([r('Belangrijk', B), r('   '), r(' alles vet', B)], 'Strong')] })).afwijkingen.nieuwe).toEqual([]);
  });
});

describe('zetLeerplanOm: wat de lezer zag maar niet als tekst overneemt (IMP-4, BLP-4)', () => {
  const nieuw = (ruw: RuwXlsx, bekende?: BekendeAfwijking[]) => leerplanOm(ruw, bekende).afwijkingen.nieuwe;

  it.each([
    ['n', '0.5', /een cel die geen tekst is \(n\): "0\.5"/],
    ['e', '#REF!', /een cel die geen tekst is \(e\): "#REF!"/],
    ['str', 'een formule', /\(str\)/],
    ['d', '2026-11-09', /\(d\)/],
    ['escape', 'Benoemen de delen_x000D_', /Excel-escape/],
  ])('een vreemde cel van de soort %s', (soort, waarde, bericht) => {
    const ruw = { ...leerplanRuw(), vreemde_cellen: [{ r: 11, k: 2, soort, waarde }] };
    expect(nieuw(ruw)).toContainEqual(expect.objectContaining({ soort: 'xlsx-cel', waar: 'rij 11, kolom 2', bericht: expect.stringMatching(bericht) as unknown }));
  });

  it('een verborgen rij of kolom en een opmerking stoppen altijd', () => {
    expect(nieuw({ ...leerplanRuw(), verborgen_rijen: [12] })).toContainEqual(expect.objectContaining({ soort: 'xlsx-verborgen', waar: 'rij 12' }));
    expect(nieuw({ ...leerplanRuw(), verborgen_kolommen: [[2, 2], [24, 30]] }).map((a) => a.waar)).toEqual(['kolom 2', 'kolom 24-30']);
    expect(nieuw({ ...leerplanRuw(), opmerkingen: 1 })).toContainEqual(expect.objectContaining({ soort: 'xlsx-opmerking' }));
  });

  it('een beeld op het blad: alleen als bekende afwijking voor dat vak, die rij en die kolom', () => {
    const ruw = { ...leerplanRuw(), beelden: [[14, 2]] as [number, number][] };
    expect(nieuw(ruw)).toContainEqual(expect.objectContaining({ soort: 'xlsx-beeld', waar: 'rij 14, kolom 2' }));
    const bekend: BekendeAfwijking = { soort: 'xlsx-beeld', vak: 'WT', rij: 14, kolom: 2, reden: 'Een restant van een breuk (test).', datum: '2026-11-09' };
    const u = leerplanOm(ruw, [KAPOT, bekend]);
    expect(u.afwijkingen.nieuwe).toEqual([]);
    expect(u.afwijkingen.lijst.filter((a) => a.bekend).map((a) => a.soort)).toContain('xlsx-beeld');
    expect(nieuw(ruw, [KAPOT, { ...bekend, kolom: 3 }]).map((a) => a.soort)).toContain('xlsx-beeld');
    expect(nieuw(ruw, [KAPOT, { ...bekend, vak: 'WI' }]).map((a) => a.soort)).toContain('xlsx-beeld');
    expect(nieuw({ ...leerplanRuw(), beelden: [[0, 0]] })).toContainEqual(expect.objectContaining({ soort: 'xlsx-beeld', waar: 'blad (zonder cel)' }));
  });
});

describe('controleerLesplanTegenLeerplan: de leeftijd van het lesplan (IMP-13)', () => {
  const leerplannen = () => {
    const m = new Map<GoVak, GoLeerplanBestand>();
    m.set('WT', leerplanOm(wtRuw(), [], () => true).bestand as GoLeerplanBestand);
    m.set('LL', leerplanOm(llRuw(), [], () => true).bestand as GoLeerplanBestand);
    return m;
  };
  const DOELTEKST: BekendeAfwijking = { soort: 'lesplan-doeltekst', lesplan: 'LP0065', doel: 'WT.008', tekst: 'Herkennen de belangrijkste voedingswijze van dieren.', reden: 'Het lesplan heeft een andere tekst (test).', datum: '2026-11-09' };
  const controleer = (ruw: RuwDocx, bekende: BekendeAfwijking[] = [DOELTEKST]) => {
    const u = zetOm(ruw);
    if (!u.bestand) throw new Error('geen bestand');
    const afw = new Afwijkingen(u.bestand.code);
    controleerLesplanTegenLeerplan(u.bestand, u.extra, leerplannen(), new Bekende(bekende), afw);
    return afw;
  };
  const metTitel = (titel: string) => {
    const ruw = lesplanRuw();
    ruw.body[0] = h(1, titel);
    return ruw;
  };

  it('een titel met een andere leeftijd dan de doelen en het diploma: een afwijking per doel en per diploma', () => {
    const afw = controleer(metTitel('Lesplan LP0065 Dieren classificeren (6-7 jaar)'));
    const lft = afw.nieuwe.filter((a) => a.soort === 'lesplan-leeftijd');
    expect(lft.map((a) => a.waar)).toEqual(['deel 2, WT.001', 'deel 2, WT.008', 'deel 2, WT.028', 'deel 4, diploma De dierenkenner']);
    expect(lft[0].bericht).toBe('het lesplan is voor 6-7 jaar (titel), het doel voor 2,5-4 jaar');
  });

  it('een diploma met een andere leeftijd', () => {
    const ruw = lesplanRuw({
      lesdoel: [
        p([r('Leerdoelen op leerlingenniveau vanuit het diploma: De dierenkenner 4-5 jaar', B)]),
        p([r("(GO! Navigator > Basisonderwijs > Het nieuwe GO! Leerplan > Conceptkaarten > Diploma's)")]),
        p([r('WT.001', B), r(' [begrijpen]', I), r(' (2,5-4 jaar)')]),
        li([r('Ik herken dieren.', B)]),
      ],
    });
    expect(controleer(ruw).nieuwe).toEqual([expect.objectContaining({ soort: 'lesplan-leeftijd', waar: 'deel 4, diploma De dierenkenner', bericht: 'het lesplan is voor 2,5-4 jaar (titel), het diploma voor 4-5 jaar' })]);
  });

  it('een doel van meer leeftijden mag, zolang de leeftijd van het lesplan erbij is; bewust anders kan via bekende-afwijkingen.json', () => {
    expect(controleer(lesplanRuw()).nieuwe).toEqual([]);
    const afw = controleer(metTitel('Lesplan LP0065 Dieren classificeren (4-5 jaar)'), [
      DOELTEKST,
      ...['WT.001', 'WT.008', 'WT.028'].map((doel): BekendeAfwijking => ({ soort: 'lesplan-leeftijd', lesplan: 'LP0065', doel, reden: 'Het GO! bedoelt het zo (test).', datum: '2026-11-09' })),
    ]);
    expect(afw.nieuwe.map((a) => a.waar)).toEqual(['deel 4, diploma De dierenkenner']);
  });
});

describe('controleerLessenlijnen: twee schrijfwijzen van dezelfde lessenlijn of lessenreeks (gat lessenlijnen)', () => {
  const lp = zetOm(lesplanRuw()).bestand;
  if (!lp) throw new Error('geen lesplan');
  const met = (code: string, lessenlijn: string, lessenreeks = 'Fauna: classificeren', vak: GoVak = 'WT') => ({ ...lp, code, afgeleid: { ...lp.afgeleid, vak, lessenlijn, lessenreeks } });

  it('gelijke namen: niets', () => {
    expect(controleerLessenlijnen([met('LP0065', 'Biologie van organismen'), met('LP0074', 'Biologie van organismen')], new Bekende([]))).toEqual([]);
  });

  it("'Biologie van organismen' en 'Biologie van Organismen': de minder gebruikte schrijfwijze is een afwijking", () => {
    const lijst = [met('LP0060', 'Biologie van Organismen'), met('LP0065', 'Biologie van organismen'), met('LP0074', 'Biologie van organismen')];
    const a = controleerLessenlijnen(lijst, new Bekende([]));
    expect(a).toEqual([
      {
        soort: 'lessenlijn-variant',
        bestand: 'LP0060',
        waar: 'deel 0, Lessenlijn',
        bericht: '"Biologie van Organismen" en "Biologie van organismen" (LP0065, LP0074) geven hetzelfde adres (biologie-van-organismen), maar zijn niet letterlijk gelijk: de app toont dan twee lessenlijnen',
      },
    ]);
  });

  it('ook witruimte, accenten en leestekens; bij gelijke stand wint het laagste lesplan', () => {
    expect(controleerLessenlijnen([met('LP0065', 'Biologie van organismen'), met('LP0074', 'Biologie  van  organismen')], new Bekende([])).map((a) => a.bestand)).toEqual(['LP0074']);
    expect(controleerLessenlijnen([met('LP0065', 'Fauna: één'), met('LP0074', 'Fauna - een')], new Bekende([])).map((a) => a.bestand)).toEqual(['LP0074']);
  });

  it('een andere lessenlijn of een ander vak telt niet; een lessenreeks binnen dezelfde lijn wel', () => {
    expect(controleerLessenlijnen([met('LP0065', 'Biologie van organismen'), met('LP0074', 'Biologie van planten'), met('LP0087', 'Biologie van Organismen', 'x', 'AA')], new Bekende([]))).toEqual([]);
    const a = controleerLessenlijnen([met('LP0065', 'Biologie van organismen', 'Fauna: classificeren'), met('LP0074', 'Biologie van organismen', 'Fauna: Classificeren'), met('LP0087', 'Biologie van planten', 'Fauna: Classificeren')], new Bekende([]));
    expect(a.map((x) => [x.bestand, x.waar])).toEqual([['LP0074', 'deel 0, Lessenreeks']]);
  });

  it('een bekende variant voor dat lesplan gaat door', () => {
    const lijst = [met('LP0060', 'Biologie van Organismen'), met('LP0065', 'Biologie van organismen'), met('LP0074', 'Biologie van organismen')];
    const bekend: BekendeAfwijking = { soort: 'lessenlijn-variant', lesplan: 'LP0060', veld: 'lessenlijn', naam: 'Biologie van Organismen', reden: 'Het GO! schrijft het zo (test).', datum: '2026-11-09' };
    const a = controleerLessenlijnen(lijst, new Bekende([bekend]));
    expect(a).toHaveLength(1);
    expect(a[0].bekend).toBeDefined();
    expect(controleerLessenlijnen(lijst, new Bekende([{ ...bekend, lesplan: 'LP0065' }]))[0].bekend).toBeUndefined();
  });
});

// ══ Elke controle van de import heeft een test (IMP-10) ══════════════════
// De 32 controles die bij de mutatietest van 9 november 2026 niet gevangen werden: per controle een kleine wijziging
// aan het voorbeeld en de afwijking die ze moet geven (soort en een stuk van het bericht).
type Lesplanwijziging = (ruw: RuwDocx) => void;
const tabelVan = (ruw: RuwDocx, n: number) => ruw.body.filter((b): b is Extract<RuwBlok, { t: 'tbl' }> => b.t === 'tbl')[n];
const regelVan = (ruw: RuwDocx, tekst: string) => ruw.body.findIndex((b) => b.t === 'p' && b.runs.some((x) => x.t === 'tekst' && x.tekst === tekst));
const deel2 = (regels: RuwBlok[]): Lesplanwijziging => (ruw) => {
  (tabelVan(ruw, 1).rijen[1].cellen[1] as { blokken: RuwBlok[] }).blokken = regels;
};
const doelregel = (code: string, codeOpmaak: { b?: boolean } = B, kvOpmaak: { i?: boolean } = I) => p([r(code, codeOpmaak), r(' [begrijpen]', kvOpmaak), r(' Herkennen het organisme dier. (2,5-4 jaar)')]);
const LESPLAN_MUTATIES: [string, Lesplanwijziging, string, RegExp][] = [
  ['docx: verboden elementen (bv. een hyperlink)', (x) => void (x.tellingen.hyperlinks = 1), 'docx-element', /1 × hyperlinks/],
  ['docx: bijgehouden wijzigingen, tekstvak, veld, commentaar', (x) => void Object.assign(x.tellingen, { ins: 1, del: 1, tekstvakken: 1, velden: 1, commentaar_ankers: 1 }), 'docx-element', /tekstvakken/],
  ['docx: een onbekend element in een run', (x) => void (x.tellingen['run_kind:footnoteReference'] = 1), 'docx-element', /run_kind:footnoteReference/],
  ['docx: nummering anders dan bullet of decimal', (x) => void x.body.push(li([r('a')], '7', 'lowerLetter')), 'docx-lijst', /nummering "lowerLetter"/],
  ['docx: een kop in een tabelcel', (x) => void tabelVan(x, 0).rijen[1].cellen[1].blokken.push(h(3, 'Kop')), 'docx-kop-in-cel', /een kop in een tabelcel/],
  ['docx: gridSpan', (x) => void (tabelVan(x, 0).rijen[1].cellen[1].span = 2), 'docx-tabel', /gridSpan 2/],
  ['docx: een tabel in een tabel', (x) => void tabelVan(x, 0).rijen[1].cellen[1].blokken.push(tbl([[cel([p([r('x')])])]])), 'docx-tabel', /een tabel in een tabel/],
  ['lesplan: de code in de titel is niet die van het bestand', (x) => void (x.bestand = 'LP0066.docx'), 'lesplan-titel', /de code in de titel \(LP0065\)/],
  ['lesplan: het aantal metaregels', (x) => void x.body.splice(6, 0, p([r('Nog een regel.')])), 'lesplan-metaregels', /6 regels onder de titel/],
  ["lesplan: 'Lesplan:' is niet code en titel", (x) => void (x.body[4] = p([r('Lesplan:', B), r(' LP0065 Dieren sorteren')])), 'lesplan-metaregels', /"Lesplan:" is niet gelijk/],
  ['lesplan: een fiche van een ander vak', (x) => void (x.body[5] = p([r('Didactische fiche:', B), r(' DFWI005 Getallen (GO! Navigator > Basisonderwijs > …)')])), 'lesplan-metaregels', /de fiche DFWI005 hoort niet bij WT/],
  ['lesplan: de kop van een deel wijkt af', (x) => void (x.body[regelVan(x, '1. Wat moet de leraar weten?')] = h(2, '1. Wat moet de leraar weten')), 'lesplan-delen', /de kop is "1\. Wat moet de leraar weten"/],
  ['lesplan: te weinig delen', (x) => void x.body.splice(regelVan(x, '6. Didactisch materiaal bij dit lesplan'), 1), 'lesplan-delen', /5 delen, verwacht 6/],
  ['lesplan: een kop van niveau 3 buiten deel 3', (x) => void x.body.push(h(3, 'Extra')), 'lesplan-koppen', /buiten deel 3/],
  ['lesplan: de tussenkoppen van deel 3', (x) => void (x.body[regelVan(x, 'Denklenzen')] = h(4, 'Denklens')), 'lesplan-koppen', /tussenkoppen van deel 3/],
  ['lesplan: het aantal tabellen per deel', (x) => void x.body.push(tbl([[cel([p([r('x')])])]])), 'lesplan-tabel', /1 tabellen, verwacht 0/],
  ['lesplan: het aantal kolommen', (x) => void tabelVan(x, 0).rijen[1].cellen.push(cel([p([r('x')])])), 'lesplan-tabel', /niet elke rij heeft 3 kolommen/],
  ['lesplan: een kolomkop', (x) => void (tabelVan(x, 0).rijen[0].cellen[1] = kopcel([p([r('Inhoud', B)], 'Strong')])), 'lesplan-tabel', /verwacht "Inhoud \(Wat\?\)", er staat "Inhoud"/],
  ['lesplan: de rijkoppen', (x) => void (tabelVan(x, 0).rijen[2].cellen[0] = cel([p([r('Misconcepten', B)])])), 'lesplan-tabel', /de rijkoppen zijn Kennis, Misconcepten/],
  ['lesplan: de code van een doel staat niet vet vooraan', deel2([doelregel('WT.001', {})]), 'lesplan-deel2', /WT\.001 staat niet vet vooraan/],
  ['lesplan: het niveau staat niet cursief', deel2([doelregel('WT.001', B, {})]), 'lesplan-deel2', /\[begrijpen\] staat niet cursief/],
  ['lesplan: een doel staat er twee keer', deel2([doelregel('WT.001'), doelregel('WT.001')]), 'lesplan-deel2', /WT\.001 staat er twee keer/],
  ['lesplan: een doel van een ander vak', deel2([doelregel('WI.001')]), 'lesplan-deel2', /WI\.001 hoort niet bij de vakdiscipline WT/],
  ['lesplan: een vlag buiten deel 3', (x) => void x.body.push(p([icoon('vlag'), r('   '), r('LL.001', B), r(' Herkennen. (2,5-4 jaar)')])), 'lesplan-deel3', /een vlag of schakel buiten deel 3/],
];

type Leerplanwijziging = (ruw: RuwXlsx) => void;
const LEERPLAN_MUTATIES: [string, Leerplanwijziging, string, RegExp][] = [
  ['xlsx: meer dan één tabblad', (x) => void x.bladnamen.push({ naam: 'Blad2', staat: 'hidden' }), 'xlsx-blad', /2 tabbladen \(verwacht één\)/],
  ['xlsx: samengevoegde cellen', (x) => void x.merged.push('A2:B2'), 'xlsx-blad', /1 samengevoegde cellen/],
  ['xlsx: meer dan 24 kolommen in de kop', (x) => void (x.rijen[0] = { r: 1, c: [...KOP, 'EXTRA'] }), 'xlsx-kop', /meer dan 24 kolommen/],
  ['xlsx: een waarde voorbij kolom 24', (x) => void x.rijen[7].c.push('x'), 'xlsx-rij', /een waarde voorbij kolom 24/],
  ['xlsx: opmaak buiten de kolom INHOUD', (x) => void (x.rijen[7].opmaak = { '3': [{ t: '3.1.2', strike: true }] }), 'opmaak', /opmaak buiten de kolom INHOUD/],
  ['xlsx: een rij zonder TYPE met inhoud', (x) => void x.rijen.splice(8, 0, { r: 8.5, c: ['', null, 'Wees.'] }), 'xlsx-rij', /een rij zonder TYPE met inhoud/],
  ['xlsx: een onbekende kennisverwerking', (x) => void (x.rijen[6] = rij(7, 'doelzin', 'Herkennen het organisme dier.', { code: 'WT.001', ko: '3.1.2', kv: 'toepassen', lft: ['2,5-4'], vlaggen: 'LL.001' })), 'xlsx-rij', /kennisverwerking "toepassen"/],
  // Een code die geen doel vindt, twee keer: zonder de controle op dezelfde letterlijke code zouden het twee problemen zijn.
  ['koppelen: dezelfde code twee keer in één kolom', (x) => void (x.rijen[6] = rij(7, 'doelzin', 'Herkennen het organisme dier.', { code: 'WT.001', ko: '3.1.2, 3.9.9, 3.9.9', kv: 'begrijpen', lft: ['2,5-4'], vlaggen: 'LL.001' })), 'koppeling-dubbel', /KO 3\.9\.9 staat twee keer/],
  ['koppelen: twee codes die hetzelfde doel vinden', (x) => void (x.rijen[6] = rij(7, 'doelzin', 'Herkennen het organisme dier.', { code: 'WT.001', ko: '3.1.2, 3.1.2', kv: 'begrijpen', lft: ['2,5-4'], vlaggen: 'LL.001' })), 'koppeling-dubbel', /KO 3\.1\.2 staat twee keer/],
];

describe('elke controle van de import heeft een test: een gewijzigd lesplan of doelenset geeft deze afwijking', () => {
  it('het voorbeeld zelf geeft geen enkele afwijking', () => {
    expect(zetOm(lesplanRuw()).afwijkingen.nieuwe).toEqual([]);
    expect(leerplanOm(leerplanRuw()).afwijkingen.nieuwe).toEqual([]);
  });

  it.each(LESPLAN_MUTATIES)('%s', (_naam, wijzig, soort, bericht) => {
    const ruw = lesplanRuw();
    wijzig(ruw);
    expect(zetOm(ruw).afwijkingen.nieuwe).toContainEqual(expect.objectContaining({ soort, bericht: expect.stringMatching(bericht) as unknown }));
  });

  it.each(LEERPLAN_MUTATIES)('%s', (_naam, wijzig, soort, bericht) => {
    const ruw = leerplanRuw();
    wijzig(ruw);
    expect(leerplanOm(ruw).afwijkingen.nieuwe).toContainEqual(expect.objectContaining({ soort, bericht: expect.stringMatching(bericht) as unknown }));
  });

  it('over lesplan en doelenset heen: een begrip dat niet bij het doel staat', () => {
    const m = new Map<GoVak, GoLeerplanBestand>();
    m.set('WT', leerplanOm(wtRuw(), [], () => true).bestand as GoLeerplanBestand);
    m.set('LL', leerplanOm(llRuw(), [], () => true).bestand as GoLeerplanBestand);
    const ruw = lesplanRuw();
    deel2([doelregel('WT.001'), p([r('Te hanteren begrippen:', B), r(' het dier, de vis')])])(ruw);
    const u = zetOm(ruw);
    if (!u.bestand) throw new Error('geen bestand');
    const afw = new Afwijkingen('LP0065');
    controleerLesplanTegenLeerplan(u.bestand, u.extra, m, new Bekende([]), afw);
    expect(afw.nieuwe).toContainEqual(expect.objectContaining({ soort: 'lesplan-begrip', bericht: 'het begrip "het dier" staat niet bij WT.001' }));
  });
});
