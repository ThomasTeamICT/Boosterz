// De gouden server-render van de weergave "Minimumdoelen" in de cursuseditor (docs/STUDIERICHTINGEN.md § 24.4 en § 24.9,
// pakket 3b-L1, invariant I3): `GatenSetsKeuze` en `PlanInCursus` renderen zonder `teksten` of `smaak` letterlijk zoals
// ze vóór het algemeen maken van de gaten renderden.
//
// De gouden strings in `GOUD` zijn gemaakt met de code van vóór 3b-L1 (commit 1d04db8: een kopie van dit bestand zoals het
// toen was, met alleen `export` voor `Plan`, `planVan` en `PlanInCursus`) en zijn daarna niet meer aangepast. Een wijziging
// in deze tekst betekent dus dat de minimumdoelen op het scherm veranderen. Elke string is de HTML van `renderToStaticMarkup`,
// in stukken geknipt tussen de tags; de stukken samen zijn byte voor byte de uitkomst.
//
// Een server-render kent geen klik. De staat van het paneel (open, uitgevinkt, uitgeklapt) wordt daarom van buiten
// opgegeven: `mock.wachtrij` vervangt de eerste `useState`-aanroepen van de render, in de volgorde waarin ze komen.
//
// De tests onder "smaak en teksten" horen bij de nieuwe parameters (`smaak`, `teksten`): zonder die parameters is de
// uitkomst gelijk aan de gouden strings hierboven.

import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Course } from '../../lib/courseTypes';
import type { Curriculum, CurriculumGoal } from '../../lib/curriculumTypes';
import { bkVerwijzingen, dekkingBk } from '../../lib/dekkingBk';
import { dekkingMinimumdoelen, setsAlsKader, type KaderDoel, type MdDekking } from '../../lib/dekkingMinimumdoelen';
import { voegGeplandeSectiesToe } from '../../lib/gatenCursus';
import { openPerSet } from '../../lib/gatenDichten';
import { FOUT_LADEN_GATEN, FOUT_ONVERWACHT_GATEN, MD_PLAN_TEKSTEN, type PlanTeksten } from '../../lib/gatenWeergave';
import type { Minimumdoel, MinimumdoelenSetBestand } from '../../lib/minimumdoelen';
import { GatenSetsKeuze, MD_PLAN, MinimumdoelenDekking, PlanInCursus, planVan, type Plan, type PlanSmaak } from './MinimumdoelenDekking';

// ── Wat van buiten komt: de staat van een render, de setbestanden en de hooks die het netwerk raken ──

/** Een plaats in `wachtrij`: `undefined` laat die `useState` zijn eigen beginwaarde houden. */
type Staat = boolean | ReadonlySet<string> | undefined;

const mock = vi.hoisted(() => ({
  wachtrij: [] as Staat[],
  bestanden: new Map<string, unknown>(),
  /** De meldingen die `useToast` kreeg: tekst en soort. */
  toasts: [] as [string, string | undefined][],
  /** De leerplannen in de opslag, zoals `getCurriculum` ze bij de klik leest (een ander tabblad kan ze intussen veranderen). */
  leerplannen: new Map<string, unknown>(),
}));

vi.mock('../../lib/curriculum', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/curriculum')>()),
  getCurriculum: (id: string) => mock.leerplannen.get(id),
}));

vi.mock('react', async (importOriginal) => {
  const echt = await importOriginal<typeof import('react')>();
  return {
    ...echt,
    useState: ((begin: unknown) => {
      if (mock.wachtrij.length > 0) {
        const staat = mock.wachtrij.shift();
        if (staat !== undefined) return [staat, () => {}];
      }
      return echt.useState(begin as never);
    }) as unknown as typeof echt.useState,
  };
});

vi.mock('../ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ui')>()),
  useToast: () => (tekst: string, soort?: string) => { mock.toasts.push([tekst, soort]); },
}));

vi.mock('../curriculum/samenstellen/useSetBestanden', () => ({
  useSetBestanden: () => ({
    stand: (id: string) => (mock.bestanden.has(id) ? { status: 'klaar', bestand: mock.bestanden.get(id) } : { status: 'laden' }),
    bestanden: mock.bestanden,
    opnieuw: () => {},
  }),
}));

vi.mock('../richting/useRichtingGegevens', () => ({
  useRichtingGegevens: () => { throw new Error('Zonder studierichting wordt de richting niet geladen.'); },
  useRichtingKader: () => { throw new Error('Zonder studierichting wordt de richting niet geladen.'); },
}));

/** Rendert op de server, met de opgegeven staat voor de eerste `useState`-aanroepen. */
function toon(element: Parameters<typeof renderToStaticMarkup>[0], wachtrij: Staat[] = []): string {
  mock.wachtrij = [...wachtrij];
  try {
    return renderToStaticMarkup(element);
  } finally {
    mock.wachtrij = [];
  }
}

// ── Nagemaakte sets, leerplan, cursus en dekking ────────────────────────────

function doel(id: string, code: string, tekst: string): Minimumdoel {
  return { id, code, tekst };
}

function maakBestand(id: string, naam: string, korteNaam: string, doelen: Minimumdoel[]): MinimumdoelenSetBestand {
  return {
    app: 'boosterz', kind: 'minimumdoelen', v: 1,
    set: {
      id, naam, korteNaam, versie: '1.0', geldigheid: 'Geldig', geldigVan: '2024-09-01', graad: '2de graad', sleutelcompetenties: [],
      bron: 'https://www.onderwijsdoelen.be/', api: 'https://onderwijs.api.vlaanderen.be/onderwijsdoelen',
      naamsvermelding: 'Bron: Vlaamse overheid, Onderwijs en Vorming (onderwijsdoelen.be)',
      licentie: 'nog te bevestigen', opgehaald: '2026-10-05T12:20:49Z', aantal: doelen.length, sha256: 'a'.repeat(64),
    },
    doelen,
  };
}

const reeks = (voorvoegsel: string, kode: string, n: number): Minimumdoel[] =>
  Array.from({ length: n }, (_, k) => doel(`${voorvoegsel}${k + 1}`, `${kode}${String(k + 1).padStart(2, '0')}`, `Doel ${k + 1} van ${kode}.`));

/** Biologie: 6 doelen, Chemie: 4. Het leerplan noemt B01 tot B04 en C01 en C02. */
const BIO = maakBestand('ODS_9101', 'Secundair onderwijs 2de graad -  Biologie - Cesuurdoelen', 'Biologie', reeks('b', 'B', 6));
const CHE = maakBestand('ODS_9102', 'Secundair onderwijs 2de graad -  Chemie - Cesuurdoelen', 'Chemie', reeks('c', 'C', 4));
mock.bestanden.set(BIO.set.id, BIO);
mock.bestanden.set(CHE.set.id, CHE);
const BESTANDEN = new Map([[BIO.set.id, BIO], [CHE.set.id, CHE]]);

function leerplanDoel(i: number, code: string, set: string, id: string): CurriculumGoal {
  return { id: `g${i}`, code, text: `Doel ${id.slice(1)} van ${code[0]}.`, refs: [{ set, id, code }] };
}

const LEERPLAN: Curriculum = {
  id: 'lp-goud', title: 'Leerplan voor de gouden render', net: 'minimumdoelen', subject: '', level: '', kind: 'leerplan', createdAt: 1, updatedAt: 1,
  minimumdoelenSets: ['ODS_9101', 'ODS_9102'],
  goals: [
    leerplanDoel(1, 'B01', 'ODS_9101', 'b1'), leerplanDoel(2, 'B02', 'ODS_9101', 'b2'),
    leerplanDoel(3, 'B03', 'ODS_9101', 'b3'), leerplanDoel(4, 'B04', 'ODS_9101', 'b4'),
    leerplanDoel(5, 'C01', 'ODS_9102', 'c1'), leerplanDoel(6, 'C02', 'ODS_9102', 'c2'),
  ],
} as Curriculum;

/** B01 en B02 staan op een sectie met uitleg (gedekt), B03 op een sectie met alleen de callout (gepland); de rest staat open. */
const CURSUS: Course = {
  id: 'k1', title: 'Natuurwetenschappen 4de jaar', author: '', coverEmoji: '📘', code: 'ABC123', curriculumId: 'lp-goud',
  chapters: [{
    id: 'h1', title: 'Biologie',
    sections: [
      { id: 's1', title: 'De cel', goalCodes: ['B01', 'B02'], blocks: [{ id: 'b1', type: 'text', markdown: 'Uitleg over de cel.' }] },
      {
        id: 's2', title: 'Weefsels', goalCodes: ['B03'],
        blocks: [{ id: 'b2', type: 'callout', kind: 'goal', title: 'Doelen in deze sectie', text: 'B03 — Doel 3 van B.' }],
      },
    ],
  }],
  settings: { accentColor: '#4f46e5', requireName: false, showProgressToStudent: true },
  createdAt: 1, updatedAt: 500,
};

const DEKKING: MdDekking = dekkingMinimumdoelen(setsAlsKader(['ODS_9101', 'ODS_9102'], BESTANDEN), [{ course: CURSUS, leerplan: LEERPLAN }], []);
const NAMEN: ReadonlyMap<string, string> = new Map([['ODS_9101', 'Biologie'], ['ODS_9102', 'Chemie']]);

/** Drie open sets, de derde zonder naam in `NAMEN`: dan valt de weergave terug op de korte naam van de set. */
const DRIE_SETS = openPerSet([
  ...CHE.doelen.slice(0, 2).map((d) => ({ set: 'ODS_9102', setNaam: 'Chemie', id: d.id as string, code: d.code, tekst: d.tekst, optioneel: false, verplichteSet: true })),
  ...BIO.doelen.slice(3, 4).map((d) => ({ set: 'ODS_9101', setNaam: 'Biologie', id: d.id as string, code: d.code, tekst: d.tekst, optioneel: false, verplichteSet: true })),
  { set: 'ODS_9103', setNaam: 'Fysica (ODS_9103)', id: 'f1', code: 'F01', tekst: 'Een doel met een heel lange tekst. '.repeat(8), optioneel: false, verplichteSet: true },
]);

const PLAN_TWEE = planVan(DEKKING, LEERPLAN);
const PLAN_EEN = { perSet: PLAN_TWEE.perSet.slice(0, 1), aantal: PLAN_TWEE.perSet[0].doelen.length, buitenLeerplan: 0 };

function planInCursus(plan: typeof PLAN_TWEE, wachtrij: Staat[] = []): string {
  return toon(createElement(PlanInCursus, {
    plan, dekking: DEKKING, curriculum: LEERPLAN, namen: NAMEN, onEdit: () => {}, samenvattingRef: createRef<HTMLParagraphElement>(),
  }), wachtrij);
}

function setsKeuze(extra: Partial<Parameters<typeof GatenSetsKeuze>[0]>, wachtrij: Staat[] = []): string {
  return toon(createElement(GatenSetsKeuze, {
    sets: DRIE_SETS, namen: NAMEN, uit: new Set<string>(), onZet: () => {}, ...extra,
  }), wachtrij);
}

// ── De gouden strings ───────────────────────────────────────────────────────

// @@GOUD-BEGIN@@
/** Het icoon van "Plan ze in deze cursus" (`PlannedIcon`, 16 px): in elke knop hetzelfde. */
const PLAN_ICOON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-clock" aria-hidden="true"><path d="M16 14v2.2l1.6 1"></path><path d="M16 2v3"></path><path d="M21 7.338V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h2.338"></path><path d="M3 9h5.859"></path><path d="M8 2v3"></path><circle cx="16" cy="16" r="6"></circle></svg>';

const GOUD: Record<string, readonly string[]> = {
  geheel_alles_gedekt: [
    '<div class="dk"><p class="dk-samenvatting" aria-live="polite" tabindex="-1">',
    '<strong>Deze cursus dekt 6 van de 10 minimumdoelen van de sets van je leerplan. 0 doelen staan al gepland op een sectie die nog leeg is, 0 komen alleen in verdieping aan bod, 4 nog niet.</strong>',
    '</p><fieldset class="dk-fieldset"><legend>Toon</legend><div class="dk-radios"><label class="dk-keuze">',
    '<input type="radio" name=":R5:" checked=""/><span>Alle doelen</span></label><label class="dk-keuze">',
    '<input type="radio" name=":R5:"/><span>Nog niet gedekt</span></label></div></fieldset>',
    '<p class="dk-toon-zin" aria-live="polite"></p><div class="dk-sets"><details class="dk-set">',
    '<summary>Biologie: 4 van 6 gedekt</summary></details><details class="dk-set">',
    '<summary>Chemie: 2 van 4 gedekt</summary></details></div>',
    '<p class="gt-andere">4 andere doelen die deze cursus niet dekt, staan niet in haar leerplan.</p></div>',
  ],
  geheel_met_plan: [
    '<div class="dk"><p class="dk-samenvatting" aria-live="polite" tabindex="-1">',
    '<strong>Deze cursus dekt 2 van de 10 minimumdoelen van de sets van je leerplan. 1 doel staat al gepland op een sectie die nog leeg is, 0 komen alleen in verdieping aan bod, 7 nog niet.</strong>',
    '</p><div class="gt-editor">',
    '<p class="gt-editor-regel">3 doelen uit het leerplan van deze cursus staan nog op geen enkele sectie.</p>',
    '<button type="button" class="btn btn-sm btn-primary gt-editor-knop" aria-expanded="false">',
    PLAN_ICOON,
    ' Plan ze in deze cursus</button></div><fieldset class="dk-fieldset"><legend>Toon</legend>',
    '<div class="dk-radios"><label class="dk-keuze"><input type="radio" name=":R5:" checked=""/>',
    '<span>Alle doelen</span></label><label class="dk-keuze"><input type="radio" name=":R5:"/>',
    '<span>Nog niet gedekt</span></label></div></fieldset><p class="dk-toon-zin" aria-live="polite"></p>',
    '<div class="dk-sets"><details class="dk-set"><summary>Biologie: 2 van 6 gedekt</summary></details>',
    '<details class="dk-set"><summary>Chemie: 0 van 4 gedekt</summary></details></div>',
    '<p class="gt-andere">4 andere doelen die deze cursus niet dekt, staan niet in haar leerplan.</p></div>',
  ],
  geheel_zonder_plan: [
    '<div class="dk"><p class="dk-samenvatting" aria-live="polite" tabindex="-1">',
    '<strong>Deze cursus dekt 2 van de 10 minimumdoelen van de sets van je leerplan. 1 doel staat al gepland op een sectie die nog leeg is, 0 komen alleen in verdieping aan bod, 7 nog niet.</strong>',
    '</p><fieldset class="dk-fieldset"><legend>Toon</legend><div class="dk-radios"><label class="dk-keuze">',
    '<input type="radio" name=":R5:" checked=""/><span>Alle doelen</span></label><label class="dk-keuze">',
    '<input type="radio" name=":R5:"/><span>Nog niet gedekt</span></label></div></fieldset>',
    '<p class="dk-toon-zin" aria-live="polite"></p><div class="dk-sets"><details class="dk-set">',
    '<summary>Biologie: 2 van 6 gedekt</summary></details><details class="dk-set">',
    '<summary>Chemie: 0 van 4 gedekt</summary></details></div></div>',
  ],
  plan_dicht_een: [
    '<div class="gt-editor">',
    '<p class="gt-editor-regel">1 doel uit het leerplan van deze cursus staat nog op geen enkele sectie.</p>',
    '<button type="button" class="btn btn-sm btn-primary gt-editor-knop" aria-expanded="false">',
    PLAN_ICOON,
    ' Plan het in deze cursus</button></div>',
  ],
  plan_dicht_twee: [
    '<div class="gt-editor">',
    '<p class="gt-editor-regel">3 doelen uit het leerplan van deze cursus staan nog op geen enkele sectie.</p>',
    '<button type="button" class="btn btn-sm btn-primary gt-editor-knop" aria-expanded="false">',
    PLAN_ICOON,
    ' Plan ze in deze cursus</button></div>',
  ],
  plan_leeg: [],
  plan_open_alles_uit: [
    '<div class="gt-editor">',
    '<p class="gt-editor-regel">3 doelen uit het leerplan van deze cursus staan nog op geen enkele sectie.</p>',
    '<button type="button" class="btn btn-sm btn-primary gt-editor-knop" aria-expanded="true" aria-controls=":R0:-paneel">',
    PLAN_ICOON,
    ' Plan ze in deze cursus</button>',
    '<div id=":R0:-paneel" role="group" aria-labelledby=":R0:-kop" tabindex="-1" class="gt-paneel">',
    '<h3 id=":R0:-kop">Plan in deze cursus</h3>',
    '<p class="gt-uitleg">Boosterz zet ze als lege secties met de doelcodes erop achteraan in je cursus, of achteraan in een hoofdstuk met dezelfde naam. Wat al in de cursus staat, blijft zoals het is.</p>',
    '<fieldset class="gt-groep"><legend>Welke doelen?</legend>',
    '<p class="gt-uitleg">Vink uit wat in een andere cursus thuishoort.</p><ul class="gt-setlijst">',
    '<li class="gt-set"><label class="gt-vak"><input type="checkbox" id=":R0:-eerste"/>',
    '<span>Biologie · 1 doel</span></label><details class="gt-details">',
    '<summary>Toon de doelen<span class="sr-only"> van ‘Biologie’</span></summary></details></li>',
    '<li class="gt-set"><label class="gt-vak"><input type="checkbox"/><span>Chemie · 2 doelen</span></label>',
    '<details class="gt-details"><summary>Toon de doelen<span class="sr-only"> van ‘Chemie’</span></summary>',
    '</details></li></ul><p class="gt-teller" aria-live="polite" aria-atomic="true">Je koos nog geen doelen.</p>',
    '</fieldset><p id=":R0:-nodig" class="gt-paneel-nodig">Nog nodig: minstens één doel.</p>',
    '<div class="gt-paneel-knoppen">',
    '<button type="button" class="btn btn-sm btn-primary gt-knop" aria-disabled="true" aria-describedby=":R0:-nodig">Zet ze in deze cursus</button>',
    '<button type="button" class="btn btn-sm btn-ghost">Annuleren</button></div></div></div>',
  ],
  plan_open_een_set: [
    '<div class="gt-editor">',
    '<p class="gt-editor-regel">1 doel uit het leerplan van deze cursus staat nog op geen enkele sectie.</p>',
    '<button type="button" class="btn btn-sm btn-primary gt-editor-knop" aria-expanded="true" aria-controls=":R0:-paneel">',
    PLAN_ICOON,
    ' Plan het in deze cursus</button>',
    '<div id=":R0:-paneel" role="group" aria-labelledby=":R0:-kop" tabindex="-1" class="gt-paneel">',
    '<h3 id=":R0:-kop">Plan in deze cursus</h3>',
    '<p class="gt-uitleg">Boosterz zet ze als lege secties met de doelcodes erop achteraan in je cursus, of achteraan in een hoofdstuk met dezelfde naam. Wat al in de cursus staat, blijft zoals het is.</p>',
    '<p class="gt-eenset">Biologie · 1 doel</p><div class="gt-paneel-knoppen">',
    '<button type="button" class="btn btn-sm btn-primary gt-knop">Zet het in deze cursus</button>',
    '<button type="button" class="btn btn-sm btn-ghost">Annuleren</button></div></div></div>',
  ],
  plan_open_een_set_uit_genegeerd: [
    '<div class="gt-editor">',
    '<p class="gt-editor-regel">1 doel uit het leerplan van deze cursus staat nog op geen enkele sectie.</p>',
    '<button type="button" class="btn btn-sm btn-primary gt-editor-knop" aria-expanded="true" aria-controls=":R0:-paneel">',
    PLAN_ICOON,
    ' Plan het in deze cursus</button>',
    '<div id=":R0:-paneel" role="group" aria-labelledby=":R0:-kop" tabindex="-1" class="gt-paneel">',
    '<h3 id=":R0:-kop">Plan in deze cursus</h3>',
    '<p class="gt-uitleg">Boosterz zet ze als lege secties met de doelcodes erop achteraan in je cursus, of achteraan in een hoofdstuk met dezelfde naam. Wat al in de cursus staat, blijft zoals het is.</p>',
    '<p class="gt-eenset">Biologie · 1 doel</p><div class="gt-paneel-knoppen">',
    '<button type="button" class="btn btn-sm btn-primary gt-knop">Zet het in deze cursus</button>',
    '<button type="button" class="btn btn-sm btn-ghost">Annuleren</button></div></div></div>',
  ],
  plan_open_een_uit: [
    '<div class="gt-editor">',
    '<p class="gt-editor-regel">3 doelen uit het leerplan van deze cursus staan nog op geen enkele sectie.</p>',
    '<button type="button" class="btn btn-sm btn-primary gt-editor-knop" aria-expanded="true" aria-controls=":R0:-paneel">',
    PLAN_ICOON,
    ' Plan ze in deze cursus</button>',
    '<div id=":R0:-paneel" role="group" aria-labelledby=":R0:-kop" tabindex="-1" class="gt-paneel">',
    '<h3 id=":R0:-kop">Plan in deze cursus</h3>',
    '<p class="gt-uitleg">Boosterz zet ze als lege secties met de doelcodes erop achteraan in je cursus, of achteraan in een hoofdstuk met dezelfde naam. Wat al in de cursus staat, blijft zoals het is.</p>',
    '<fieldset class="gt-groep"><legend>Welke doelen?</legend>',
    '<p class="gt-uitleg">Vink uit wat in een andere cursus thuishoort.</p><ul class="gt-setlijst">',
    '<li class="gt-set"><label class="gt-vak"><input type="checkbox" id=":R0:-eerste" checked=""/>',
    '<span>Biologie · 1 doel</span></label><details class="gt-details">',
    '<summary>Toon de doelen<span class="sr-only"> van ‘Biologie’</span></summary></details></li>',
    '<li class="gt-set"><label class="gt-vak"><input type="checkbox"/><span>Chemie · 2 doelen</span></label>',
    '<details class="gt-details"><summary>Toon de doelen<span class="sr-only"> van ‘Chemie’</span></summary>',
    '</details></li></ul><p class="gt-teller" aria-live="polite" aria-atomic="true">Je koos 1 doel uit 1 set.</p>',
    '</fieldset><div class="gt-paneel-knoppen">',
    '<button type="button" class="btn btn-sm btn-primary gt-knop">Zet het in deze cursus</button>',
    '<button type="button" class="btn btn-sm btn-ghost">Annuleren</button></div></div></div>',
  ],
  plan_open_twee: [
    '<div class="gt-editor">',
    '<p class="gt-editor-regel">3 doelen uit het leerplan van deze cursus staan nog op geen enkele sectie.</p>',
    '<button type="button" class="btn btn-sm btn-primary gt-editor-knop" aria-expanded="true" aria-controls=":R0:-paneel">',
    PLAN_ICOON,
    ' Plan ze in deze cursus</button>',
    '<div id=":R0:-paneel" role="group" aria-labelledby=":R0:-kop" tabindex="-1" class="gt-paneel">',
    '<h3 id=":R0:-kop">Plan in deze cursus</h3>',
    '<p class="gt-uitleg">Boosterz zet ze als lege secties met de doelcodes erop achteraan in je cursus, of achteraan in een hoofdstuk met dezelfde naam. Wat al in de cursus staat, blijft zoals het is.</p>',
    '<fieldset class="gt-groep"><legend>Welke doelen?</legend>',
    '<p class="gt-uitleg">Vink uit wat in een andere cursus thuishoort.</p><ul class="gt-setlijst">',
    '<li class="gt-set"><label class="gt-vak"><input type="checkbox" id=":R0:-eerste" checked=""/>',
    '<span>Biologie · 1 doel</span></label><details class="gt-details">',
    '<summary>Toon de doelen<span class="sr-only"> van ‘Biologie’</span></summary></details></li>',
    '<li class="gt-set"><label class="gt-vak"><input type="checkbox" checked=""/><span>Chemie · 2 doelen</span>',
    '</label><details class="gt-details"><summary>Toon de doelen<span class="sr-only"> van ‘Chemie’</span>',
    '</summary></details></li></ul>',
    '<p class="gt-teller" aria-live="polite" aria-atomic="true">Je koos 3 doelen uit 2 sets.</p></fieldset>',
    '<div class="gt-paneel-knoppen">',
    '<button type="button" class="btn btn-sm btn-primary gt-knop">Zet ze in deze cursus</button>',
    '<button type="button" class="btn btn-sm btn-ghost">Annuleren</button></div></div></div>',
  ],
  plan_open_uitgeklapt: [
    '<div class="gt-editor">',
    '<p class="gt-editor-regel">3 doelen uit het leerplan van deze cursus staan nog op geen enkele sectie.</p>',
    '<button type="button" class="btn btn-sm btn-primary gt-editor-knop" aria-expanded="true" aria-controls=":R0:-paneel">',
    PLAN_ICOON,
    ' Plan ze in deze cursus</button>',
    '<div id=":R0:-paneel" role="group" aria-labelledby=":R0:-kop" tabindex="-1" class="gt-paneel">',
    '<h3 id=":R0:-kop">Plan in deze cursus</h3>',
    '<p class="gt-uitleg">Boosterz zet ze als lege secties met de doelcodes erop achteraan in je cursus, of achteraan in een hoofdstuk met dezelfde naam. Wat al in de cursus staat, blijft zoals het is.</p>',
    '<fieldset class="gt-groep"><legend>Welke doelen?</legend>',
    '<p class="gt-uitleg">Vink uit wat in een andere cursus thuishoort.</p><ul class="gt-setlijst">',
    '<li class="gt-set"><label class="gt-vak"><input type="checkbox" id=":R0:-eerste" checked=""/>',
    '<span>Biologie · 1 doel</span></label><details class="gt-details" open="">',
    '<summary>Toon de doelen<span class="sr-only"> van ‘Biologie’</span></summary><ul class="gt-doelen">',
    '<li class="gt-doel">B04 — Doel 4 van B.</li></ul></details></li><li class="gt-set"><label class="gt-vak">',
    '<input type="checkbox" checked=""/><span>Chemie · 2 doelen</span></label><details class="gt-details">',
    '<summary>Toon de doelen<span class="sr-only"> van ‘Chemie’</span></summary></details></li></ul>',
    '<p class="gt-teller" aria-live="polite" aria-atomic="true">Je koos 3 doelen uit 2 sets.</p></fieldset>',
    '<div class="gt-paneel-knoppen">',
    '<button type="button" class="btn btn-sm btn-primary gt-knop">Zet ze in deze cursus</button>',
    '<button type="button" class="btn btn-sm btn-ghost">Annuleren</button></div></div></div>',
  ],
  sets_alle_uit: [
    '<fieldset class="gt-groep"><legend>Welke doelen?</legend>',
    '<p class="gt-uitleg">Vink uit wat in een andere cursus thuishoort.</p><ul class="gt-setlijst">',
    '<li class="gt-set"><label class="gt-vak"><input type="checkbox"/><span>Chemie · 2 doelen</span></label>',
    '<details class="gt-details"><summary>Toon de doelen<span class="sr-only"> van ‘Chemie’</span></summary>',
    '</details></li><li class="gt-set"><label class="gt-vak"><input type="checkbox"/><span>Biologie · 1 doel</span>',
    '</label><details class="gt-details"><summary>Toon de doelen<span class="sr-only"> van ‘Biologie’</span>',
    '</summary></details></li><li class="gt-set"><label class="gt-vak"><input type="checkbox"/>',
    '<span>Fysica · 1 doel</span></label><details class="gt-details">',
    '<summary>Toon de doelen<span class="sr-only"> van ‘Fysica’</span></summary></details></li></ul>',
    '<p class="gt-teller" aria-live="polite" aria-atomic="true">Je koos nog geen doelen.</p></fieldset>',
  ],
  sets_drie: [
    '<fieldset class="gt-groep"><legend>Welke doelen?</legend>',
    '<p class="gt-uitleg">Vink uit wat in een andere cursus thuishoort.</p><ul class="gt-setlijst">',
    '<li class="gt-set"><label class="gt-vak"><input type="checkbox" id="eerste-vakje" checked=""/>',
    '<span>Chemie · 2 doelen</span></label><details class="gt-details">',
    '<summary>Toon de doelen<span class="sr-only"> van ‘Chemie’</span></summary></details></li><li class="gt-set">',
    '<label class="gt-vak"><input type="checkbox" checked=""/><span>Biologie · 1 doel</span></label>',
    '<details class="gt-details"><summary>Toon de doelen<span class="sr-only"> van ‘Biologie’</span></summary>',
    '</details></li><li class="gt-set"><label class="gt-vak"><input type="checkbox" checked=""/>',
    '<span>Fysica · 1 doel</span></label><details class="gt-details">',
    '<summary>Toon de doelen<span class="sr-only"> van ‘Fysica’</span></summary></details></li></ul>',
    '<p class="gt-teller" aria-live="polite" aria-atomic="true">Je koos 4 doelen uit 3 sets.</p></fieldset>',
  ],
  sets_een_als_tekst: [
    '<p class="gt-eenset">Chemie · 2 doelen</p>',
  ],
  sets_een_als_vakje: [
    '<fieldset class="gt-groep"><legend>Welke doelen?</legend>',
    '<p class="gt-uitleg">Vink uit wat in een andere cursus thuishoort.</p><ul class="gt-setlijst">',
    '<li class="gt-set"><label class="gt-vak"><input type="checkbox" checked=""/><span>Chemie · 2 doelen</span>',
    '</label><details class="gt-details"><summary>Toon de doelen<span class="sr-only"> van ‘Chemie’</span>',
    '</summary></details></li></ul>',
    '<p class="gt-teller" aria-live="polite" aria-atomic="true">Je koos 2 doelen uit 1 set.</p></fieldset>',
  ],
  sets_een_uit: [
    '<fieldset class="gt-groep"><legend>Welke doelen?</legend>',
    '<p class="gt-uitleg">Vink uit wat in een andere cursus thuishoort.</p><ul class="gt-setlijst">',
    '<li class="gt-set"><label class="gt-vak"><input type="checkbox"/><span>Chemie · 2 doelen</span></label>',
    '<details class="gt-details"><summary>Toon de doelen<span class="sr-only"> van ‘Chemie’</span></summary>',
    '</details></li><li class="gt-set"><label class="gt-vak"><input type="checkbox" checked=""/>',
    '<span>Biologie · 1 doel</span></label><details class="gt-details">',
    '<summary>Toon de doelen<span class="sr-only"> van ‘Biologie’</span></summary></details></li>',
    '<li class="gt-set"><label class="gt-vak"><input type="checkbox" checked=""/><span>Fysica · 1 doel</span>',
    '</label><details class="gt-details"><summary>Toon de doelen<span class="sr-only"> van ‘Fysica’</span>',
    '</summary></details></li></ul>',
    '<p class="gt-teller" aria-live="polite" aria-atomic="true">Je koos 2 doelen uit 2 sets.</p></fieldset>',
  ],
  sets_uitgeklapt: [
    '<fieldset class="gt-groep"><legend>Welke doelen?</legend>',
    '<p class="gt-uitleg">Vink uit wat in een andere cursus thuishoort.</p><ul class="gt-setlijst">',
    '<li class="gt-set"><label class="gt-vak"><input type="checkbox" checked=""/><span>Chemie · 2 doelen</span>',
    '</label><details class="gt-details" open=""><summary>Toon de doelen<span class="sr-only"> van ‘Chemie’</span>',
    '</summary><ul class="gt-doelen"><li class="gt-doel">C01 — Doel 1 van C.</li>',
    '<li class="gt-doel">C02 — Doel 2 van C.</li></ul></details></li><li class="gt-set"><label class="gt-vak">',
    '<input type="checkbox" checked=""/><span>Biologie · 1 doel</span></label><details class="gt-details">',
    '<summary>Toon de doelen<span class="sr-only"> van ‘Biologie’</span></summary></details></li>',
    '<li class="gt-set"><label class="gt-vak"><input type="checkbox" checked=""/><span>Fysica · 1 doel</span>',
    '</label><details class="gt-details" open=""><summary>Toon de doelen<span class="sr-only"> van ‘Fysica’</span>',
    '</summary><ul class="gt-doelen">',
    '<li class="gt-doel">F01 — Een doel met een heel lange tekst. Een doel met een heel lange tekst. Een doel met een heel lange tekst. Een doel met een heel lange tekst. Een doel met een…</li>',
    '</ul></details></li></ul>',
    '<p class="gt-teller" aria-live="polite" aria-atomic="true">Je koos 4 doelen uit 3 sets.</p></fieldset>',
  ],
};
// @@GOUD-END@@

function controleerGoud(naam: string, html: string): void {
  expect(html).toBe((GOUD[naam] ?? []).join(''));
}

// ── GatenSetsKeuze ──────────────────────────────────────────────────────────

describe('gouden render: GatenSetsKeuze zonder teksten', () => {
  it('drie sets, alle aangevinkt, met het id van het eerste vakje', () => {
    controleerGoud('sets_drie', setsKeuze({ eersteId: 'eerste-vakje' }));
  });

  it('een set uitgevinkt: de teller telt de rest', () => {
    controleerGoud('sets_een_uit', setsKeuze({ uit: new Set(['ODS_9102']) }));
  });

  it('alle sets uitgevinkt: "Je koos nog geen doelen."', () => {
    controleerGoud('sets_alle_uit', setsKeuze({ uit: new Set(['ODS_9102', 'ODS_9101', 'ODS_9103']) }));
  });

  it('uitgeklapte sets tonen hun doelen met code en korte tekst (een lange tekst wordt ingekort)', () => {
    controleerGoud('sets_uitgeklapt', setsKeuze({}, [true, false, true]));
  });

  it('een enkele set als gewone regel (alsTekstBijEenSet) of als vakje', () => {
    controleerGoud('sets_een_als_tekst', setsKeuze({ sets: DRIE_SETS.slice(0, 1), alsTekstBijEenSet: true }));
    controleerGoud('sets_een_als_vakje', setsKeuze({ sets: DRIE_SETS.slice(0, 1) }));
  });
});

// ── PlanInCursus ────────────────────────────────────────────────────────────

describe('gouden render: PlanInCursus zonder smaak', () => {
  it('dicht: de regel en de knop, bij meer en bij één doel', () => {
    controleerGoud('plan_dicht_twee', planInCursus(PLAN_TWEE));
    controleerGoud('plan_dicht_een', planInCursus({ perSet: PLAN_EEN.perSet, aantal: 1, buitenLeerplan: 0 }));
  });

  it('niets te plannen: er staat niets', () => {
    controleerGoud('plan_leeg', planInCursus({ perSet: [], aantal: 0, buitenLeerplan: 2 }));
  });

  it('open met twee sets: de uitleg, de keuze van de sets en de knoppen', () => {
    controleerGoud('plan_open_twee', planInCursus(PLAN_TWEE, [true]));
  });

  it('open met twee sets en een uitgeklapte set', () => {
    controleerGoud('plan_open_uitgeklapt', planInCursus(PLAN_TWEE, [true, undefined, undefined, true]));
  });

  it('open met een uitgevinkte set: de knop telt de gekozen doelen', () => {
    controleerGoud('plan_open_een_uit', planInCursus(PLAN_TWEE, [true, new Set(['ODS_9102'])]));
  });

  it('open met alle sets uitgevinkt: "Nog nodig: minstens één doel." en een knop op aria-disabled', () => {
    controleerGoud('plan_open_alles_uit', planInCursus(PLAN_TWEE, [true, new Set(['ODS_9101', 'ODS_9102'])]));
  });

  it('open met één set: een gewone regel, ook als die set eerder was uitgevinkt', () => {
    controleerGoud('plan_open_een_set', planInCursus({ perSet: PLAN_EEN.perSet, aantal: PLAN_EEN.aantal, buitenLeerplan: 0 }, [true]));
    controleerGoud('plan_open_een_set_uit_genegeerd', planInCursus({ perSet: PLAN_EEN.perSet, aantal: PLAN_EEN.aantal, buitenLeerplan: 0 }, [true, new Set(['ODS_9101'])]));
  });
});

// ── De hele weergave ────────────────────────────────────────────────────────

describe('gouden render: MinimumdoelenDekking (cursus zonder studierichting, gemeten tegen de sets van haar leerplan)', () => {
  it('met "Plan ze in deze cursus" (met onEdit): samenvatting, plan, keuze "Toon", de sets en de zin over de andere doelen', () => {
    controleerGoud('geheel_met_plan', toon(createElement(MinimumdoelenDekking, { course: CURSUS, curriculum: LEERPLAN, widgets: [], onEdit: () => {} })));
  });

  it('zonder onEdit (alleen kijken): geen plan en geen zin over de andere doelen', () => {
    controleerGoud('geheel_zonder_plan', toon(createElement(MinimumdoelenDekking, { course: CURSUS, curriculum: LEERPLAN, widgets: [] })));
  });

  it('een cursus die alles al plant: geen plan, ook niet met onEdit', () => {
    const alles: Course = {
      ...CURSUS,
      chapters: [{
        id: 'h1', title: 'Alles',
        sections: LEERPLAN.goals.map((g, i) => ({
          id: `s${i}`, title: g.code, goalCodes: [g.code],
          blocks: [{ id: `b${i}`, type: 'text' as const, markdown: `Uitleg ${g.code}.` }],
        })),
      }],
    };
    const html = toon(createElement(MinimumdoelenDekking, { course: alles, curriculum: LEERPLAN, widgets: [], onEdit: () => {} }));
    expect(html).not.toContain('gt-editor');
    controleerGoud('geheel_alles_gedekt', html);
  });
});

// ── Smaak en teksten: de nieuwe parameters van 3b-L1 ────────────────────────

/** Eigen zinnen met herkenbare woorden, om te zien dat alles uit `teksten` komt en niets uit de vaste teksten van de minimumdoelen. */
const EIGEN_TEKSTEN: PlanTeksten = {
  legend: 'Welke vaardigheden?',
  hint: 'Vink uit wat elders hoort.',
  toon: 'Toon de vaardigheden',
  vakje: (naam, n) => `${naam} · ${n} vaardigheden`,
  teller: (n, groepen) => `Je koos ${n} vaardigheden uit ${groepen} groepen.`,
  regel: (n) => `${n} vaardigheden staan nog nergens.`,
  knop: (n) => `Plan de ${n} vaardigheden`,
  uitleg: 'Eigen uitleg bij het paneel.',
  zet: (n) => `Zet de ${n} vaardigheden`,
  toast: (n) => `${n} vaardigheden staan nu klaar.`,
  nodig: 'minstens één vaardigheid',
  nietsTeDoen: 'Alle vaardigheden stonden al klaar.',
  leerplanWeg: 'Het leerplan met de vaardigheden is weg.',
  nietMeerInLeerplan: 'Geen gekozen vaardigheid staat nog in het leerplan.',
};

describe('smaak en teksten: GatenSetsKeuze en PlanInCursus met eigen zinnen', () => {
  const zonderTags = (html: string) => html.replace(/<[^>]+>/g, ' ');

  it('GatenSetsKeuze neemt legend, hint, uitklapper, vakjes en teller uit `teksten`', () => {
    const html = setsKeuze({ teksten: EIGEN_TEKSTEN }, [true, false, false]);
    expect(html).toContain('<legend>Welke vaardigheden?</legend>');
    expect(html).toContain('<p class="gt-uitleg">Vink uit wat elders hoort.</p>');
    expect(html).toContain('Chemie · 2 vaardigheden');
    expect(html).toContain('Toon de vaardigheden<span class="sr-only"> van ‘Chemie’</span>');
    expect(html).toContain('Je koos 4 vaardigheden uit 3 groepen.');
    // Niets van de vaste zinnen van de minimumdoelen blijft staan; de doelen zelf (code en tekst) zijn dezelfde.
    expect(zonderTags(html)).not.toMatch(/Welke doelen|Vink uit wat in een andere|Toon de doelen|Je koos .* doel/);
    expect(html).toContain('C01 — Doel 1 van C.');
  });

  it('GatenSetsKeuze met één set als gewone regel gebruikt `vakje`', () => {
    expect(setsKeuze({ sets: DRIE_SETS.slice(0, 1), alsTekstBijEenSet: true, teksten: EIGEN_TEKSTEN })).toBe('<p class="gt-eenset">Chemie · 2 vaardigheden</p>');
  });

  it('PlanInCursus dicht: de regel en de knop komen uit `smaak.teksten`', () => {
    const html = toon(createElement(PlanInCursus, {
      plan: PLAN_TWEE, dekking: DEKKING, curriculum: LEERPLAN, namen: NAMEN, onEdit: () => {}, samenvattingRef: createRef<HTMLParagraphElement>(),
      smaak: { teksten: EIGEN_TEKSTEN, laadVoegToe: async () => (c) => ({ course: c, toegevoegd: [] }) },
    }));
    expect(html).toContain('<p class="gt-editor-regel">3 vaardigheden staan nog nergens.</p>');
    expect(html).toContain('Plan de 3 vaardigheden</button>');
    expect(html).not.toContain('Plan ze in deze cursus');
  });

  it('PlanInCursus open: titel van het paneel blijft, uitleg, keuze, knop en voet komen uit `smaak.teksten`', () => {
    const smaak: PlanSmaak = { teksten: EIGEN_TEKSTEN, laadVoegToe: async () => (c) => ({ course: c, toegevoegd: [] }) };
    const props = { plan: PLAN_TWEE, dekking: DEKKING, curriculum: LEERPLAN, namen: NAMEN, onEdit: () => {}, samenvattingRef: createRef<HTMLParagraphElement>(), smaak };
    const open = toon(createElement(PlanInCursus, props), [true]);
    expect(open).toContain('>Plan in deze cursus</h3>');
    expect(open).toContain('<p class="gt-uitleg">Eigen uitleg bij het paneel.</p>');
    expect(open).toContain('<legend>Welke vaardigheden?</legend>');
    expect(open).toContain('>Zet de 3 vaardigheden</button>');
    expect(open).not.toContain('Nog nodig');
    // Alles uitgevinkt: de voet noemt wat nodig is, in de eigen woorden.
    const leeg = toon(createElement(PlanInCursus, props), [true, new Set(['ODS_9101', 'ODS_9102'])]);
    expect(leeg).toContain('>Nog nodig: minstens één vaardigheid.</p>');
    expect(leeg).toContain('Je koos 0 vaardigheden uit 0 groepen.');
    expect(leeg).toContain('aria-disabled="true"');
    // Een enkele set staat als gewone regel met `vakje`.
    const een = toon(createElement(PlanInCursus, { ...props, plan: { perSet: PLAN_EEN.perSet, aantal: PLAN_EEN.aantal, buitenLeerplan: 0 } }), [true]);
    expect(een).toContain('<p class="gt-eenset">Biologie · 1 vaardigheden</p>');
  });
});

describe('smaak en teksten: MD_PLAN en planVan', () => {
  it('MD_PLAN is de smaak van de minimumdoelen: haar zinnen, de refs (geen eigen functie) en gatenCursus', async () => {
    expect(MD_PLAN.teksten).toBe(MD_PLAN_TEKSTEN);
    expect(MD_PLAN.verwijzingen).toBeUndefined();
    expect(await MD_PLAN.laadVoegToe()).toBe(voegGeplandeSectiesToe);
  });

  it('planVan zonder en met `(g) => g.refs` geeft hetzelfde plan', () => {
    expect(planVan(DEKKING, LEERPLAN, (g) => g.refs ?? [])).toEqual(PLAN_TWEE);
    expect(PLAN_TWEE.aantal).toBe(3);
    expect(PLAN_TWEE.buitenLeerplan).toBe(4);
    expect(PLAN_TWEE.perSet.map((s) => [s.set, s.doelen.map((d) => d.code)])).toEqual([['ODS_9101', ['B04']], ['ODS_9102', ['C01', 'C02']]]);
  });
});

// ── Een BK-leerplan met `bkVerwijzingen`, en de klik op "Zet ze in deze cursus" ──

const BK_KADER: KaderDoel[] = [1, 2, 3, 4].map((n) => ({
  set: 'BK-0001-1', setNaam: 'Onthaalmedewerker', id: `bkc000000${n}`, code: `BK-0001-1.0${n}`, tekst: `Competentie ${n}`, optioneel: false, verplichteSet: true,
}));

const BK_LEERPLAN: Curriculum = {
  ...LEERPLAN,
  id: 'lp-bk',
  minimumdoelenSets: undefined,
  goals: [1, 2, 3].map((n) => ({
    id: `g${n}`, code: `BK-0001-1.0${n}`, text: `Competentie ${n}`, theme: 'Onthaalmedewerker › Vakspecifiek', bkRefs: [{ bk: 'BK-0001-1', id: `bkc000000${n}` }],
  })),
};

/** Competentie 1 staat uitgewerkt op een sectie; 2 en 3 staan open en in het leerplan, 4 staat open en niet in het leerplan. */
const BK_CURSUS: Course = {
  ...CURSUS,
  id: 'bk1',
  curriculumId: 'lp-bk',
  chapters: [{ id: 'h1', title: 'Onthaalmedewerker', sections: [{ id: 's1', title: 'Eerste', goalCodes: ['BK-0001-1.01'], blocks: [{ id: 'b1', type: 'text', markdown: 'Uitleg.' }] }] }],
};

const BK_DEKKING: MdDekking = dekkingBk(BK_KADER, [{ course: BK_CURSUS, leerplan: BK_LEERPLAN }], []);

describe('planVan met `bkVerwijzingen`', () => {
  it('plant de open competenties uit het leerplan van de cursus; de vierde staat erbuiten', () => {
    const plan = planVan(BK_DEKKING, BK_LEERPLAN, bkVerwijzingen);
    expect(plan.aantal).toBe(2);
    expect(plan.buitenLeerplan).toBe(1);
    expect(plan.perSet.map((s) => [s.set, s.doelen.map((d) => d.code)])).toEqual([['BK-0001-1', ['BK-0001-1.02', 'BK-0001-1.03']]]);
  });

  it('zonder `bkVerwijzingen` ziet een BK-leerplan niets: alles staat buiten het leerplan (I6)', () => {
    expect(planVan(BK_DEKKING, BK_LEERPLAN)).toMatchObject({ perSet: [], aantal: 0, buitenLeerplan: 3 });
  });

  it('en een leerplan van minimumdoelen ziet met `bkVerwijzingen` niets', () => {
    expect(planVan(DEKKING, LEERPLAN, bkVerwijzingen)).toMatchObject({ perSet: [], aantal: 0, buitenLeerplan: 7 });
  });
});

interface Klik {
  toasts: [string, string | undefined][];
  /** De cursus zoals `onEdit` hem kreeg te zien na de bewerking, of `undefined` als `onEdit` niet werd aangeroepen. */
  bewerkt: Course | undefined;
  /** Klikt nog eens op dezelfde knop (dezelfde render, dus hetzelfde `bezig`) en wacht tot er een nieuwe melding is; stopt na ongeveer een seconde. */
  opnieuw: () => Promise<void>;
}

/** Zoekt in een React-boom het eerste element dat aan de test voldoet (op de server bestaat van een knop alleen de `onClick`-prop). */
function vind(node: unknown, test: (el: { type: unknown; props: Record<string, unknown> }) => boolean): { type: unknown; props: Record<string, unknown> } | undefined {
  if (Array.isArray(node)) {
    for (const kind of node) {
      const r = vind(kind, test);
      if (r) return r;
    }
    return undefined;
  }
  if (!node || typeof node !== 'object' || !('props' in node)) return undefined;
  const el = node as { type: unknown; props: Record<string, unknown> };
  return test(el) ? el : vind(el.props.children, test);
}

async function wacht(klaar: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !klaar(); i++) await new Promise((r) => setTimeout(r, 5));
}

/**
 * Rendert `PlanInCursus` met het paneel open op de server, klikt op "Zet ze …" en wacht tot het resultaat gemeld is. `course` is de
 * cursus waarop `onEdit` zijn bewerking loslaat, zoals de editor dat doet.
 */
async function klikOpZet(o: {
  plan: Plan; dekking: MdDekking; curriculum: Curriculum; course: Course; smaak?: PlanSmaak; uit?: ReadonlySet<string>;
  /** Het leerplan in de opslag bij de klik; zonder deze optie is dat `curriculum`, met `null` is het weg. */
  inOpslag?: Curriculum | null;
}): Promise<Klik> {
  mock.toasts = [];
  mock.leerplannen = new Map();
  const inOpslag = o.inOpslag === undefined ? o.curriculum : o.inOpslag;
  if (inOpslag) mock.leerplannen.set(o.curriculum.id, inOpslag);
  const uit: Klik = { toasts: mock.toasts, bewerkt: undefined, opnieuw: async () => {} };
  let boom: unknown;
  // De aanroep gebeurt binnen de render van `Houder`: de hooks van `PlanInCursus` horen dan bij die render.
  const Houder = () => {
    boom = PlanInCursus({
      plan: o.plan, dekking: o.dekking, curriculum: o.curriculum, namen: NAMEN, samenvattingRef: createRef<HTMLParagraphElement>(), smaak: o.smaak,
      onEdit: (volgende) => { uit.bewerkt = volgende(o.course); },
    });
    return null;
  };
  toon(createElement(Houder), [true, o.uit]);
  const knop = vind(boom, (el) => el.type === 'button' && String(el.props.className).includes('gt-knop'));
  expect(knop, 'de knop "Zet ze …"').toBeDefined();
  (knop!.props.onClick as () => void)();
  await wacht(() => mock.toasts.length > 0);
  uit.opnieuw = async () => {
    const eerder = mock.toasts.length;
    (knop!.props.onClick as () => void)();
    await wacht(() => mock.toasts.length > eerder);
  };
  return uit;
}

describe('de klik op "Zet ze in deze cursus"', () => {
  it('zonder smaak: de minimumdoelen komen als lege secties in de cursus, met de zin van de minimumdoelen', async () => {
    const klik = await klikOpZet({ plan: PLAN_TWEE, dekking: DEKKING, curriculum: LEERPLAN, course: CURSUS });
    expect(klik.toasts).toEqual([['3 doelen staan nu gepland in deze cursus.', 'ok']]);
    const codes = klik.bewerkt!.chapters.flatMap((h) => h.sections.flatMap((s) => s.goalCodes ?? []));
    expect(codes).toEqual(['B01', 'B02', 'B03', 'B04', 'C01', 'C02']);
    // De bestaande secties blijven zoals ze waren.
    expect(klik.bewerkt!.chapters[0].sections.slice(0, 2)).toEqual(CURSUS.chapters[0].sections);
  });

  it('zonder smaak, met een set uitgevinkt: alleen de gekozen doelen', async () => {
    const klik = await klikOpZet({ plan: PLAN_TWEE, dekking: DEKKING, curriculum: LEERPLAN, course: CURSUS, uit: new Set(['ODS_9101']) });
    expect(klik.toasts).toEqual([['2 doelen staan nu gepland in deze cursus.', 'ok']]);
    expect(klik.bewerkt!.chapters.flatMap((h) => h.sections.flatMap((s) => s.goalCodes ?? [])).slice(-2)).toEqual(['C01', 'C02']);
  });

  it('met een eigen smaak: de verwijzingen bepalen de codes, de lader het zetten en `teksten` de melding', async () => {
    const aanroepen: { codes: readonly string[]; leerplan: string }[] = [];
    const smaak: PlanSmaak = {
      teksten: EIGEN_TEKSTEN,
      verwijzingen: bkVerwijzingen,
      laadVoegToe: async () => (c, l, codes) => {
        aanroepen.push({ codes, leerplan: l.id });
        return { course: { ...c, title: 'Bewerkt door de eigen lader' }, toegevoegd: codes };
      },
    };
    const plan = planVan(BK_DEKKING, BK_LEERPLAN, bkVerwijzingen);
    const klik = await klikOpZet({ plan, dekking: BK_DEKKING, curriculum: BK_LEERPLAN, course: BK_CURSUS, smaak });
    expect(aanroepen).toEqual([{ codes: ['BK-0001-1.02', 'BK-0001-1.03'], leerplan: 'lp-bk' }]);
    expect(klik.toasts).toEqual([['2 vaardigheden staan nu klaar.', 'ok']]);
    expect(klik.bewerkt?.title).toBe('Bewerkt door de eigen lader');
  });

  it('met een eigen smaak maar zonder haar verwijzingen vindt het geen enkele code: `refs` zien een BK-leerplan niet', async () => {
    const aanroepen: (readonly string[])[] = [];
    const smaak: PlanSmaak = {
      teksten: EIGEN_TEKSTEN,
      laadVoegToe: async () => (c, _l, codes) => { aanroepen.push(codes); return { course: c, toegevoegd: [] }; },
    };
    const plan = planVan(BK_DEKKING, BK_LEERPLAN, bkVerwijzingen);
    const klik = await klikOpZet({ plan, dekking: BK_DEKKING, curriculum: BK_LEERPLAN, course: BK_CURSUS, smaak });
    // Zonder codes wordt er niets gezet: de melding zegt dat geen gekozen doel in het leerplan staat.
    expect(aanroepen).toEqual([]);
    expect(klik.toasts).toEqual([['Geen gekozen vaardigheid staat nog in het leerplan.', 'err']]);
    expect(klik.bewerkt).toBeUndefined();
  });

  it('leest het leerplan bij de klik opnieuw: een doel dat een ander tabblad weghaalde, komt er niet bij', async () => {
    // Open zijn B04, C01 en C02; het andere tabblad haalt B04 uit het leerplan.
    const vers: Curriculum = { ...LEERPLAN, goals: LEERPLAN.goals.filter((g) => g.code !== 'B04'), updatedAt: LEERPLAN.updatedAt + 1 };
    const klik = await klikOpZet({ plan: PLAN_TWEE, dekking: DEKKING, curriculum: LEERPLAN, course: CURSUS, inOpslag: vers });
    const codes = klik.bewerkt!.chapters.flatMap((h) => h.sections.flatMap((s) => s.goalCodes ?? []));
    expect(codes).toEqual(['B01', 'B02', 'B03', 'C01', 'C02']);
    expect(klik.toasts).toEqual([['2 doelen staan nu gepland in deze cursus.', 'ok']]);
  });

  it('is het leerplan intussen weg, dan verandert er niets en zegt de melding dat', async () => {
    const md = await klikOpZet({ plan: PLAN_TWEE, dekking: DEKKING, curriculum: LEERPLAN, course: CURSUS, inOpslag: null });
    expect(md.toasts).toEqual([['Het leerplan van deze cursus bestaat niet meer. Er is niets veranderd.', 'err']]);
    expect(md.bewerkt).toBeUndefined();
    const smaak: PlanSmaak = { teksten: EIGEN_TEKSTEN, laadVoegToe: async () => (c) => ({ course: c, toegevoegd: ['X'] }) };
    const eigen = await klikOpZet({ plan: PLAN_TWEE, dekking: DEKKING, curriculum: LEERPLAN, course: CURSUS, smaak, inOpslag: null });
    expect(eigen.toasts).toEqual([['Het leerplan met de vaardigheden is weg.', 'err']]);
    expect(eigen.bewerkt).toBeUndefined();
  });

  it('bevat het leerplan intussen geen gekozen doel meer, dan verandert er niets en zegt de melding dat', async () => {
    const leeg: Curriculum = { ...LEERPLAN, goals: LEERPLAN.goals.filter((g) => !(g.refs ?? []).length), updatedAt: LEERPLAN.updatedAt + 1 };
    const klik = await klikOpZet({ plan: PLAN_TWEE, dekking: DEKKING, curriculum: LEERPLAN, course: CURSUS, inOpslag: leeg });
    expect(klik.toasts).toEqual([['De gekozen doelen staan intussen niet meer in het leerplan van deze cursus. Er is niets veranderd.', 'err']]);
    expect(klik.bewerkt).toBeUndefined();
  });

  it('is er niets toegevoegd, dan zegt de smaak dat zonder "gepland" te melden', async () => {
    const smaak: PlanSmaak = { teksten: EIGEN_TEKSTEN, verwijzingen: bkVerwijzingen, laadVoegToe: async () => (c) => ({ course: c, toegevoegd: [] }) };
    const plan = planVan(BK_DEKKING, BK_LEERPLAN, bkVerwijzingen);
    const klik = await klikOpZet({ plan, dekking: BK_DEKKING, curriculum: BK_LEERPLAN, course: BK_CURSUS, smaak });
    expect(klik.toasts).toEqual([['Alle vaardigheden stonden al klaar.', undefined]]);
  });

  it('laadt de lader niet, dan meldt de editor dat het niet geladen kon worden', async () => {
    const smaak: PlanSmaak = { teksten: EIGEN_TEKSTEN, laadVoegToe: () => Promise.reject(new Error('geen verbinding')) };
    const klik = await klikOpZet({ plan: PLAN_TWEE, dekking: DEKKING, curriculum: LEERPLAN, course: CURSUS, smaak });
    expect(klik.toasts).toEqual([[FOUT_LADEN_GATEN, 'err']]);
    expect(klik.bewerkt).toBeUndefined();
  });

  it('gooit `voegToe`, dan meldt de editor dat er iets misging, verandert de cursus niet en werkt een tweede klik weer', async () => {
    let aanroepen = 0;
    const smaak: PlanSmaak = {
      teksten: MD_PLAN_TEKSTEN,
      laadVoegToe: async () => (c, _l, codes) => {
        aanroepen++;
        if (aanroepen === 1) throw new Error('voegToe viel om');
        return { course: { ...c, title: 'Tweede poging' }, toegevoegd: codes };
      },
    };
    const klik = await klikOpZet({ plan: PLAN_TWEE, dekking: DEKKING, curriculum: LEERPLAN, course: CURSUS, smaak });
    expect(klik.toasts).toEqual([[FOUT_ONVERWACHT_GATEN, 'err']]);
    expect(FOUT_ONVERWACHT_GATEN).toBe('Er ging iets mis. Er is niets veranderd.');
    expect(klik.bewerkt).toBeUndefined();
    expect(aanroepen).toBe(1);
    // `bezig` is weer vrij: de tweede klik loopt tot het einde en zet de doelen.
    await klik.opnieuw();
    expect(aanroepen).toBe(2);
    expect(klik.toasts).toEqual([[FOUT_ONVERWACHT_GATEN, 'err'], ['3 doelen staan nu gepland in deze cursus.', 'ok']]);
    expect(klik.bewerkt?.title).toBe('Tweede poging');
  });

  it('gooit de verwijzing van de smaak, dan gaat het net zo: melding, geen bewerking en de knop reageert nog', async () => {
    let aanroepen = 0;
    const smaak: PlanSmaak = {
      teksten: MD_PLAN_TEKSTEN,
      verwijzingen: () => { aanroepen++; throw new Error('verwijzing viel om'); },
      laadVoegToe: async () => (c) => ({ course: c, toegevoegd: ['X'] }),
    };
    const klik = await klikOpZet({ plan: PLAN_TWEE, dekking: DEKKING, curriculum: LEERPLAN, course: CURSUS, smaak });
    expect(klik.toasts).toEqual([[FOUT_ONVERWACHT_GATEN, 'err']]);
    expect(klik.bewerkt).toBeUndefined();
    const eerder = aanroepen;
    await klik.opnieuw();
    expect(aanroepen).toBeGreaterThan(eerder);
    expect(klik.toasts).toEqual([[FOUT_ONVERWACHT_GATEN, 'err'], [FOUT_ONVERWACHT_GATEN, 'err']]);
  });
});
