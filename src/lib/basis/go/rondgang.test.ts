import { describe, expect, it } from 'vitest';
import type { RuwBlok, RuwDocx, RuwRij, RuwRun, RuwXlsx } from './omzetten';
import { RUW_BRON, XLSX_LEEG } from './testRuw';
import { docxRegels, lesplanRegels, rondgangLeerplan, rondgangLesplan } from './rondgang';
import type { Blok, GoLeerplanBestand, GoLeerplandoel, GoLesplanBestand } from './types';

// ══ docx ══════════════════════════════════════════════════════════════
const r = (tekst: string, o: { b?: boolean; i?: boolean; u?: boolean } = {}): RuwRun => ({ t: 'tekst', tekst, ...o });
const vlag: RuwRun = { t: 'beeld', bestand: 'word/media/lesplan-vlag.png', sha1: 'a'.repeat(40), breed: 1, hoog: 1 };
const beeld: RuwRun = { t: 'beeld', bestand: 'word/media/mindmap.png', sha1: 'b'.repeat(40), breed: 1, hoog: 1 };

function ruw(): RuwDocx {
  const body: RuwBlok[] = [
    { t: 'p', stijl: 'Heading1', stijlen_ruw: ['Heading1'], num: null, runs: [r('Lesplan LP0001 Titel (2,5-4 jaar)')] },
    { t: 'p', stijl: null, stijlen_ruw: [], num: null, runs: [r('Vakdiscipline:', { b: true }), r(' Wetenschap'), r(' en techniek')] },
    { t: 'p', stijl: null, stijlen_ruw: [], num: null, runs: [r(' ')] },
    { t: 'p', stijl: null, stijlen_ruw: [], num: null, runs: [{ t: 'br', soort: 'page' }] },
    { t: 'p', stijl: 'ListParagraph', stijlen_ruw: ['ListParagraph'], num: { numId: '1', ilvl: 0, fmt: 'bullet', start: 1 }, runs: [r('item een')] },
    { t: 'p', stijl: null, stijlen_ruw: [], num: null, runs: [vlag, r('   '), r('LL.001', { b: true }), r(' Tekst.\nTweede regel'), { t: 'br', soort: 'regel' }, r('derde', { i: true, u: true })] },
    {
      t: 'tbl',
      rijen: [
        { cellen: [{ span: 1, vmerge: 'restart', vulling: null, blokken: [{ t: 'p', stijl: null, stijlen_ruw: [], num: null, runs: [r('Leskern', { b: true })] }] }, { span: 1, vmerge: null, vulling: null, blokken: [{ t: 'p', stijl: null, stijlen_ruw: [], num: null, runs: [r('1. Verkennen', { b: true }), r('')] }] }] },
        { cellen: [{ span: 1, vmerge: 'voort', vulling: null, blokken: [{ t: 'p', stijl: null, stijlen_ruw: [], num: null, runs: [r('')] }] }, { span: 1, vmerge: null, vulling: null, blokken: [{ t: 'p', stijl: null, stijlen_ruw: [], num: null, runs: [r('2. Voorkeursinstructie', { b: true })] }] }] },
      ],
    },
    { t: 'p', stijl: null, stijlen_ruw: [], num: null, runs: [beeld] },
  ];
  return { bestand: 'LP0001.docx', bron: RUW_BRON, gemaakt: '2026-10-01T08:00:00Z', media: [], stijlen: {}, tellingen: {}, body };
}

/** Zo zet omzetten.ts het om (met de hand geschreven, als verwachting). */
function delen(): Pick<GoLesplanBestand, 'delen'> {
  const blokken: Blok[] = [
    { soort: 'kop', niveau: 1, tekst: [{ t: 'Lesplan LP0001 Titel (2,5-4 jaar)' }] },
    { soort: 'alinea', tekst: [{ t: 'Vakdiscipline:', b: true }, { t: ' Wetenschap en techniek' }] },
    { soort: 'lijst', genummerd: false, items: [[{ t: 'item een' }]] },
    { soort: 'alinea', tekst: [{ icoon: 'vlag' }, { t: '   ' }, { t: 'LL.001', b: true }, { t: ' Tekst.' }, { br: true }, { t: 'Tweede regel' }, { br: true }, { t: 'derde', i: true, u: true }] },
    {
      soort: 'tabel',
      rijen: [
        [
          { rol: 'rijkop', samengevoegd: 'begin', blokken: [{ soort: 'alinea', tekst: [{ t: 'Leskern', b: true }] }] },
          { rol: 'data', blokken: [{ soort: 'alinea', tekst: [{ t: '1. Verkennen', b: true }] }] },
        ],
        [
          { rol: 'rijkop', samengevoegd: 'vervolg', blokken: [] },
          { rol: 'data', blokken: [{ soort: 'alinea', tekst: [{ t: '2. Voorkeursinstructie', b: true }] }] },
        ],
      ],
    },
    { soort: 'beeld', bron: 'mindmap.png', breedte: 1, hoogte: 1, status: 'weggelaten', uitleg: 'Hier staat een mindmap.' },
  ];
  return { delen: [{ nr: 0, blokken }] };
}

describe('rondgang docx', () => {
  it('de regels van de ruwe body: zichtbare alinea’s, pictogrammen, tabelstructuur, zonder witregels en paginabreuken', () => {
    const { regels, tellingen } = docxRegels(ruw());
    expect(regels).toEqual([
      'P Lesplan LP0001 Titel (2,5-4 jaar)',
      'P Vakdiscipline: Wetenschap en techniek',
      'P item een',
      'P ⟦vlag⟧   LL.001 Tekst.\nTweede regel\nderde',
      'T',
      'R',
      'C+',
      'P Leskern',
      'C',
      'P 1. Verkennen',
      'R',
      'C=',
      'C',
      'P 2. Voorkeursinstructie',
      '/T',
      'P ⟦beeld:mindmap.png⟧',
    ]);
    expect(tellingen).toMatchObject({ tabellen: 1, rijen: 2, cellen: 4, lijstitems: 1, beelden: 1, regels: 8 });
    expect(tellingen.vet).toBe('Vakdiscipline:'.length + 'LL.001'.length + 'Leskern'.length + '1. Verkennen'.length + '2. Voorkeursinstructie'.length);
    expect(tellingen.iconen.vlag).toBe(1);
  });

  it('gelijk voor een juiste omzetting', () => {
    expect(rondgangLesplan(ruw(), delen())).toEqual({ gelijk: true, verschil: undefined, tellingen: {}, aantalRegels: 16 });
    expect(lesplanRegels(delen()).regels).toEqual(docxRegels(ruw()).regels);
  });

  it('een weggevallen alinea wordt gevonden, op de plaats waar ze ontbreekt', () => {
    const d = delen();
    d.delen[0].blokken.splice(1, 1);
    const u = rondgangLesplan(ruw(), d);
    expect(u.gelijk).toBe(false);
    expect(u.verschil).toEqual({ plaats: 1, bron: 'P Vakdiscipline: Wetenschap en techniek', bestand: 'P item een' });
  });

  it('één teken anders, of een regeleinde minder', () => {
    const d = delen();
    const b = d.delen[0].blokken[3];
    if (b.soort !== 'alinea') throw new Error('geen alinea');
    b.tekst[3] = { t: ' Tekst!' };
    expect(rondgangLesplan(ruw(), d).gelijk).toBe(false);
    const d2 = delen();
    const b2 = d2.delen[0].blokken[3];
    if (b2.soort !== 'alinea') throw new Error('geen alinea');
    b2.tekst.splice(4, 1);
    expect(rondgangLesplan(ruw(), d2).verschil?.plaats).toBe(3);
  });

  it('dezelfde tekst met andere opmaak: de tellingen verschillen', () => {
    const d = delen();
    const b = d.delen[0].blokken[1];
    if (b.soort !== 'alinea') throw new Error('geen alinea');
    b.tekst = [{ t: 'Vakdiscipline: Wetenschap en techniek' }];
    const u = rondgangLesplan(ruw(), d);
    expect(u.verschil).toBeUndefined();
    expect(u.tellingen.vet).toEqual([expect.any(Number), expect.any(Number)]);
    expect(u.gelijk).toBe(false);
  });

  it('een verwisseld pictogram (vlag of schakel) valt op', () => {
    const d = delen();
    const b = d.delen[0].blokken[3];
    if (b.soort !== 'alinea') throw new Error('geen alinea');
    b.tekst[0] = { icoon: 'schakel' };
    const u = rondgangLesplan(ruw(), d);
    expect(u.gelijk).toBe(false);
    expect(u.tellingen['icoon vlag']).toEqual([1, 0]);
  });

  it('een cel in de verkeerde kolom, of een verloren samenvoeging', () => {
    const d = delen();
    const t = d.delen[0].blokken[4];
    if (t.soort !== 'tabel') throw new Error('geen tabel');
    [t.rijen[1][0].blokken, t.rijen[1][1].blokken] = [t.rijen[1][1].blokken, t.rijen[1][0].blokken];
    expect(rondgangLesplan(ruw(), d).gelijk).toBe(false);
    const d2 = delen();
    const t2 = d2.delen[0].blokken[4];
    if (t2.soort !== 'tabel') throw new Error('geen tabel');
    delete t2.rijen[0][0].samengevoegd;
    expect(rondgangLesplan(ruw(), d2).verschil).toEqual({ plaats: 6, bron: 'C+', bestand: 'C' });
  });

  it('een lijstitem dat een alinea werd, of een beeld dat verdween', () => {
    const d = delen();
    d.delen[0].blokken[2] = { soort: 'alinea', tekst: [{ t: 'item een' }] };
    expect(rondgangLesplan(ruw(), d).tellingen.lijstitems).toEqual([1, 0]);
    const d2 = delen();
    d2.delen[0].blokken.pop();
    expect(rondgangLesplan(ruw(), d2).gelijk).toBe(false);
  });
});

// ══ xlsx ══════════════════════════════════════════════════════════════
const KOP = ['TYPE', 'GO! NR.', 'INHOUD', 'KO nummer', 'KO minimumdoel', 'KO omschrijving', 'L4 nummer', 'L4 minimumdoel', 'L4 omschrijving', 'L6 nummer', 'L6 minimumdoel', 'L6 omschrijving', 'KENNISVERWERKING', '2,5-4', '4-5', '5-6', '6-7', '7-8', '8-9', '9-10', '10-11', '11-12', 'VLAGGEN', 'SCHAKELS'];
const NUL = ['0', '0', '0', '0', '0', '0', '0', '0', '0'];
const c = (type: string, code: string | null, inhoud: string | null, ko: string | null, kv: string | null, lft: string[], vlaggen: string | null = null): (string | null)[] => [type, code, inhoud, ko, null, null, null, null, null, null, null, null, kv, ...lft, vlaggen, null];

function xlsx(): RuwXlsx {
  const rijen: RuwRij[] = [
    { r: 1, c: KOP },
    { r: 2, c: c('onderwerp', null, 'Organismen', null, null, NUL) },
    { r: 3, c: c('minimumdoel', null, null, '3.1.2', null, NUL) },
    { r: 4, c: c('doelzin', 'WT.001', 'Herkennen het organisme dier.', '3.1.2', 'begrijpen', ['1', '0', '0', '0', '0', '0', '0', '0', '0'], 'LL.001') },
    { r: 5, c: c('MIA - aanklikbaar', null, 'zoogdieren', ' ', null, NUL) },
    { r: 6, c: c('te hanteren begrippen', null, 'het dier', null, null, ['1', '1', '0', '0', '0', '0', '0', '0', '0']) },
    { r: 7, c: ['', null, null, null, null, null, null, null, null, null, null, null, null, ...NUL] },
  ];
  return { bestand: 'wt.xlsx', ...XLSX_LEEG, gewijzigd: null, bladnamen: [], blad: 'Wetenschap en techniek', rijen };
}

function leerplan(): Pick<GoLeerplanBestand, 'rubrieken' | 'doelen'> {
  const doel: GoLeerplandoel = {
    code: 'WT.001',
    rij: 4,
    tekst: 'Herkennen het organisme dier.',
    kennisverwerking: 'begrijpen',
    leeftijden: ['2,5-4'],
    rubriek: 'WT-r001',
    inhoud: [
      { soort: 'mia', tekst: 'zoogdieren', aanklikbaar: true, rij: 5 },
      { soort: 'begrip', tekst: 'het dier', leeftijden: ['2,5-4', '4-5'], rij: 6 },
    ],
    minimumdoelen: { bron: { KO: '3.1.2' }, refs: [{ set: 'ODS_3410', id: '92590', code: '3.1.2', moment: 'KO', status: 'officieel' }], problemen: [] },
    vlaggen: { bron: 'LL.001', codes: ['LL.001'], kapot: [] },
    schakels: { codes: [], kapot: [] },
  };
  return { rubrieken: [{ id: 'WT-r001', soort: 'onderwerp', tekst: 'Organismen', rij: 2 }], doelen: [doel] };
}

describe('rondgang xlsx', () => {
  it('gelijk: elke niet-lege cel van een inhoudsrij komt terug; een cel met alleen witruimte telt niet', () => {
    expect(rondgangLeerplan(xlsx(), leerplan())).toEqual({ gelijk: true, verschillen: [], rijen: 4, cellen: 15, minimumdoelRijen: 1 });
  });

  it('een tekst die niet letterlijk die van de bron is (ook geen witruimte meer of minder)', () => {
    const l = leerplan();
    l.doelen[0].tekst = 'Herkennen het organisme dier. ';
    expect(rondgangLeerplan(xlsx(), l).verschillen).toEqual(['rij 4: de tekst is niet letterlijk die van de bron']);
  });

  it('een codekolom die niet letterlijk in de koppeling staat, of een koppeling die niet in de bron staat', () => {
    const l = leerplan();
    l.doelen[0].minimumdoelen.bron = { KO: '3.1.2 ' };
    expect(rondgangLeerplan(xlsx(), l).verschillen[0]).toMatch(/codekolom KO/);
    const l2 = leerplan();
    l2.doelen[0].inhoud[0] = { soort: 'mia', tekst: 'zoogdieren', aanklikbaar: true, rij: 5, koppeling: { bron: { L4: '3.1.4' }, refs: [], problemen: [] } };
    expect(rondgangLeerplan(xlsx(), l2).verschillen[0]).toMatch(/koppeling L4 die niet in de bron staat/);
  });

  it('een rij uit de bron die ontbreekt, of een rij in het bestand die geen inhoudsrij is', () => {
    const l = leerplan();
    l.doelen[0].inhoud.pop();
    expect(rondgangLeerplan(xlsx(), l).verschillen).toEqual(['rij 6 (te hanteren begrippen) komt niet terug in het bestand']);
    const l2 = leerplan();
    l2.doelen[0].inhoud.push({ soort: 'voetnoot', tekst: 'verzonnen', rij: 9 });
    expect(rondgangLeerplan(xlsx(), l2).verschillen).toEqual(['rij 9 staat in het bestand, maar is geen inhoudsrij van de bron']);
  });

  it('een ander TYPE (aanklikbaar of niet), andere leeftijden of andere vlaggen', () => {
    const l = leerplan();
    l.doelen[0].inhoud[0] = { soort: 'mia', tekst: 'zoogdieren', aanklikbaar: false, rij: 5 };
    expect(rondgangLeerplan(xlsx(), l).verschillen[0]).toMatch(/TYPE "MIA - aanklikbaar" in de bron, "MIA - niet aanklikbaar"/);
    const l2 = leerplan();
    l2.doelen[0].inhoud[1] = { soort: 'begrip', tekst: 'het dier', leeftijden: ['2,5-4'], rij: 6 };
    expect(rondgangLeerplan(xlsx(), l2).verschillen).toEqual(['rij 6: de leeftijden zijn niet die van de bron']);
    const l3 = leerplan();
    l3.doelen[0].vlaggen = { bron: 'LL.001,', codes: ['LL.001'], kapot: [] };
    expect(rondgangLeerplan(xlsx(), l3).verschillen[0]).toMatch(/VLAGGEN/);
  });

  it('een waarde in een kolom die niets betekent voor die rij, komt niet terug', () => {
    const x = xlsx();
    x.rijen[3].c[4] = 'tekst van een minimumdoel';
    expect(rondgangLeerplan(x, leerplan()).verschillen).toEqual(['rij 4, kolom 4: de waarde "tekst van een minimumdoel" komt niet terug in het bestand']);
  });

  it('een leeftijdscel met een andere waarde dan 0 of 1 is niet verantwoord', () => {
    const x = xlsx();
    x.rijen[3].c[15] = 'ja';
    expect(rondgangLeerplan(x, leerplan()).verschillen).toEqual(['rij 4, kolom 15: de waarde "ja" komt niet terug in het bestand']);
  });

  it('een leeftijd op een rubriek: alleen met een bekende uitzondering', () => {
    const x = xlsx();
    x.rijen[1].c[14] = '1';
    expect(rondgangLeerplan(x, leerplan()).gelijk).toBe(false);
    expect(rondgangLeerplan(x, leerplan(), { leeftijdGenegeerd: (r) => r === 2 }).gelijk).toBe(true);
  });

  it('een minimumdoel-rij die als inhoud geldt (bekende afwijking), komt als dat TYPE terug', () => {
    const x = xlsx();
    x.rijen[4].c[0] = 'minimumdoel';
    x.rijen[4].c[3] = null;
    expect(rondgangLeerplan(x, leerplan()).gelijk).toBe(false);
    expect(rondgangLeerplan(x, leerplan(), { typeVan: (r) => (r === 5 ? 'MIA - aanklikbaar' : undefined) }).gelijk).toBe(true);
  });
});
