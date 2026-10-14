// Het blok "Competenties van de beroepskwalificaties" op de richtingpagina met de knop om te plannen en de cache voor "Mijn
// richtingen" en de klas (docs/STUDIERICHTINGEN.md § 24.4, § 24.6.2 en F3b-B7, pakket 3b-S2). Op de fixtures van G-0008
// "Assistent dierlijke productie": Onthaalmedewerker met 12 en Recreatief medewerker met 13 competenties.
//
// Een server-render kent geen effecten en geen klik. De knop en de zinnen worden dus op de server gerenderd, met het laden van de
// bestanden (`useLaadstand`) en de oefeningen van het toestel nagebootst. De regel voor de cache zit in `bewaarKortVanDetail`,
// die het effect van het blok aanroept: die wordt hier rechtstreeks getest, met de echte cache. Het venster zelf staat in
// `BkGatenVenster.test.ts`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BkBestand, BkIndex, KoppelingBestand } from '../../../lib/beroepskwalificaties';
import { cursusVoorBk } from '../../../lib/bkCursus';
import { leerplanUitBk } from '../../../lib/bkLeerplan';
import { BK_GEEN_OPEN, BK_LADEN } from '../../../lib/bkWeergave';
import type { Course } from '../../../lib/courseTypes';
import type { Curriculum } from '../../../lib/curriculumTypes';
import { dekkingBkVanRichting } from '../../../lib/dekkingBk';
import { bewaarDekkingKort, dekkingGeneratie, leesBkKort, leesDekkingKort } from '../../../lib/dekkingCache';
import type { Doelgroep } from '../../../lib/doelgroep';
import { bkKader, type RichtingBk } from '../../../lib/richtingBk';
import { doelgroepVan, kaderGroepSleutel, richtingInfo, type RichtingInfo, type RichtingKeuze } from '../../../lib/richtingKader';
import { bijdragenVoorKader, bkKortVan } from '../../../lib/richtingOverzicht';
import { notifyChange } from '../../../lib/storage';
import type { MatrixBestand } from '../../../lib/studierichtingen';

// ── Wat van buiten komt: het laden van de bestanden en de oefeningen ────────

const mock = vi.hoisted(() => ({
  stand: { status: 'laden' } as { status: 'laden' } | { status: 'fout'; fout: string } | { status: 'klaar'; waarde: unknown },
}));

vi.mock('../../../lib/useLaadstand', () => ({
  useLaadstand: () => ({ stand: mock.stand, opnieuw: () => {} }),
}));

vi.mock('../useRichtingDekking', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../useRichtingDekking')>()),
  useToestelWidgets: () => [],
}));

import { BkDekking, bewaarKortVanDetail, type BkDekkingProps } from './BkDekking';

// ── Fixtures ────────────────────────────────────────────────────────────────

const HIER = fileURLToPath(new URL('.', import.meta.url));
const lees = (pad: string): unknown => JSON.parse(readFileSync(join(HIER, '../../../../tests/fixtures', pad), 'utf8'));

const VANDAAG = '2026-10-14';
const MATRIX = lees('structuur/uit/studierichtingen.json') as MatrixBestand;
const KOPPELING = lees('kwalificaties/uit/koppeling.json') as KoppelingBestand;
const INDEX = lees('kwalificaties/uit/index.json') as BkIndex;
const ONTHAAL = lees('kwalificaties/uit/bk/BK-0390-2.json') as BkBestand;
const RECREATIEF = lees('kwalificaties/uit/bk/BK-0464-1.json') as BkBestand;

const INFO: RichtingInfo = (() => {
  const i = richtingInfo(MATRIX, 'G-0008', VANDAAG);
  if (!i) throw new Error('G-0008 ontbreekt in de structuurfixtures');
  return i;
})();
const KEUZE: RichtingKeuze = { groep: 'G-0008', soort: 'so' };
const DG: Doelgroep = doelgroepVan(INFO, KEUZE);
const KADER: RichtingBk = bkKader(KOPPELING, INDEX, INFO, KEUZE, VANDAAG);
const KADER_VARIANT: RichtingBk = bkKader(KOPPELING, INDEX, INFO, { ...KEUZE, onderdeel: 8 }, VANDAAG);

const MERKEN: ReadonlyMap<string, string> = new Map([['BK-0390-2', '75ed8f70bba4cc76'], ['BK-0464-1', '0952ac83fb3ee152']]);
const BESTANDEN: ReadonlyMap<string, BkBestand> = new Map([['BK-0390-2', ONTHAAL], ['BK-0464-1', RECREATIEF]]);
const ONTHAAL_IDS = ONTHAAL.competenties.map((c) => c.id);
const RECREATIEF_IDS = RECREATIEF.competenties.map((c) => c.id);

function cursusMet(bestand: BkBestand, ids: readonly string[], start: 'geraamte' | 'leeg', titel: string): { course: Course; leerplan: Curriculum } {
  const u = leerplanUitBk([{ bestand, competenties: ids }], { doelgroep: DG, merken: MERKEN });
  expect(u.bevestigd, u.waarschuwingen.join(' | ')).toBe(true);
  return { course: cursusVoorBk({ titel, auteur: '', doelgroep: DG, leerplan: u.leerplan, bestanden: BESTANDEN, start }), leerplan: u.leerplan };
}

function toonBlok(cursussen: { course: Course; leerplan: Curriculum }[], o: { kader?: RichtingBk; stand?: typeof mock.stand } = {}): string {
  mock.stand = o.stand ?? { status: 'klaar', waarde: new Map(BESTANDEN) };
  const props: BkDekkingProps = {
    info: INFO, keuze: KEUZE, bk: o.kader ?? KADER, courses: cursussen.map((c) => c.course), curricula: cursussen.map((c) => c.leerplan),
    matrix: MATRIX, vandaag: VANDAAG, telMee: 'alle',
  };
  return renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(BkDekking, props)));
}

function tekstVan(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

const CODE_OP_SCHERM = /bkc\d|ADV-|G-\d|ODS_/;

// ── De knop onder de samenvatting ───────────────────────────────────────────

describe('de knop "Plan de … competenties die nog nergens aan bod komen"', () => {
  it('geen enkele cursus: alles staat open, de knop noemt alle 25', () => {
    const html = toonBlok([]);
    expect(tekstVan(html)).toContain('Plan de 25 competenties die nog nergens aan bod komen');
    expect(html).toMatch(/<button type="button" class="btn btn-primary gt-plan-knop"><svg[^>]*aria-hidden="true"[^>]*>.*<\/svg> Plan de 25 competenties die nog nergens aan bod komen<\/button>/);
    expect(html).not.toContain('aria-busy');
    expect(html).not.toContain('role="dialog"');
  });

  it('de knop staat onder de samenvatting en vóór de keuze "Toon"', () => {
    const html = toonBlok([]);
    const samenvatting = html.indexOf('class="dk-samenvatting"');
    const knop = html.indexOf('gt-plan-knop');
    const toon = html.indexOf('<legend>Toon</legend>');
    expect(samenvatting).toBeGreaterThan(0);
    expect(knop).toBeGreaterThan(samenvatting);
    expect(toon).toBeGreaterThan(knop);
  });

  it('een deel gepland: de knop noemt alleen wat nog open staat (13 van de 25)', () => {
    const a = cursusMet(ONTHAAL, ONTHAAL_IDS, 'geraamte', 'Onthaal');
    const html = toonBlok([a]);
    expect(tekstVan(html)).toContain('Plan de 13 competenties die nog nergens aan bod komen');
    expect(tekstVan(html)).toContain('12 competenties staan al gepland');
  });

  it('één open competentie: enkelvoud "Plan de competentie die nog nergens aan bod komt"', () => {
    const a = cursusMet(ONTHAAL, ONTHAAL_IDS, 'geraamte', 'Onthaal');
    const b = cursusMet(RECREATIEF, RECREATIEF_IDS.slice(0, 12), 'geraamte', 'Recreatie');
    const html = toonBlok([a, b]);
    expect(tekstVan(html)).toContain('Plan de competentie die nog nergens aan bod komt');
    expect(html).toContain('gt-plan-knop');
  });

  it('niets meer open: "Er zijn geen competenties meer die nergens aan bod komen." in plaats van de knop', () => {
    const a = cursusMet(ONTHAAL, ONTHAAL_IDS, 'geraamte', 'Onthaal');
    const b = cursusMet(RECREATIEF, RECREATIEF_IDS, 'geraamte', 'Recreatie');
    const html = toonBlok([a, b]);
    expect(html).toContain(`<p class="gt-geen">${BK_GEEN_OPEN}</p>`);
    expect(BK_GEEN_OPEN).toBe('Er zijn geen competenties meer die nergens aan bod komen.');
    expect(html).not.toContain('gt-plan-knop');
  });

  it('een lege cursus telt als open: de competenties van haar leerplan staan nog open', () => {
    const a = cursusMet(ONTHAAL, ONTHAAL_IDS, 'leeg', 'Onthaal leeg');
    expect(tekstVan(toonBlok([a]))).toContain('Plan de 25 competenties die nog nergens aan bod komen');
  });

  it('zolang de bestanden laden is er geen knop, en bij een fout ook niet', () => {
    const laden = toonBlok([], { stand: { status: 'laden' } });
    expect(laden).not.toContain('gt-plan-knop');
    expect(tekstVan(laden)).toContain(BK_LADEN);
    const fout = toonBlok([], { stand: { status: 'fout', fout: 'De beroepskwalificaties konden niet geladen worden.' } });
    expect(fout).not.toContain('gt-plan-knop');
    expect(fout).not.toContain('gt-geen');
  });

  it('geen enkele competentie in de dekking (geen bestand): geen knop en geen "geen competenties meer"', () => {
    const html = toonBlok([], { stand: { status: 'klaar', waarde: new Map() } });
    expect(html).not.toContain('gt-plan-knop');
    expect(html).not.toContain('gt-geen');
  });

  it('de zinnen van het blok zijn niet veranderd en noemen geen code of nummer', () => {
    const html = toonBlok([]);
    const t = tekstVan(html);
    expect(t).toContain('Nog geen cursus met competenties van deze beroepskwalificaties: de dekking is 0 van de 25 competenties.');
    expect(t).not.toMatch(CODE_OP_SCHERM);
  });
});

// ── De bron: het venster laadt pas bij de klik ──────────────────────────────

describe('het venster zit in een lui chunk', () => {
  const bron = readFileSync(join(HIER, 'BkDekking.tsx'), 'utf8');

  it('BkDekking importeert BkGatenVenster alleen als type en met een dynamische import', () => {
    expect(bron).toMatch(/import type \{ BkGatenVensterProps \} from '\.\/BkGatenVenster';/);
    expect(bron).toContain("import('./BkGatenVenster')");
    expect(bron.match(/^import .* from '\.\/BkGatenVenster';$/gm)).toHaveLength(1);
  });

  it('de lijst van het blok komt nog uit BkLijst en de bestanden uit bkVersiesOmTeLaden', () => {
    expect(bron).toContain("from './BkLijst'");
    expect(bron).toContain('bkVersiesOmTeLaden(bk)');
    expect(bron).toContain('dekkingBkVanRichting(');
  });
});

// ── De cache voor "Mijn richtingen" en de klas ──────────────────────────────

describe('bewaarKortVanDetail: de cache alleen bij "Alle jaren" en zonder variant (F3b-B7)', () => {
  const bijdragen = (() => {
    const a = cursusMet(ONTHAAL, ONTHAAL_IDS, 'geraamte', 'Onthaal');
    return bijdragenVoorKader({ courses: [a.course], curricula: [a.leerplan], info: INFO, soort: 'so', matrix: MATRIX, vandaag: VANDAAG });
  })();
  const dekking = dekkingBkVanRichting({ kader: KADER, bestanden: BESTANDEN, bijdragen, widgets: [] });
  const sleutel = kaderGroepSleutel(INFO, 'so');
  const basis = { info: INFO, soort: 'so' as const, telMee: 'alle' as const, bk: KADER, dekking, bestanden: BESTANDEN };

  // Een wijziging in de opslag maakt de cache leeg: elke test begint met een lege cache.
  beforeEach(() => { notifyChange(); });

  it('"Alle jaren", zonder variant: de korte regel komt in de cache, met dezelfde getallen als `bkKortVan` (I4)', () => {
    expect(leesBkKort(sleutel)).toBeUndefined();
    expect(bewaarKortVanDetail({ ...basis, generatie: dekkingGeneratie() })).toBe(true);
    const kort = leesBkKort(sleutel);
    expect(kort).toEqual(bkKortVan(dekking, KADER, BESTANDEN));
    expect(kort).toMatchObject({ soort: 'getallen', bks: 2, totaal: 25, gedekt: 0, gepland: 12, zonderBestand: 0 });
    // Twee beroepskwalificaties: nooit een samengeteld percentage (F3b-B9).
    expect(kort).not.toHaveProperty('percent');
  });

  it('"Alleen het jaar": niets in de cache', () => {
    expect(bewaarKortVanDetail({ ...basis, telMee: 'jaar', generatie: dekkingGeneratie() })).toBe(false);
    expect(leesBkKort(sleutel)).toBeUndefined();
  });

  it('met een variant (het kader heeft een onderdeel): niets in de cache', () => {
    expect(KADER_VARIANT.onderdeel).toBe(8);
    expect(bewaarKortVanDetail({ ...basis, bk: KADER_VARIANT, generatie: dekkingGeneratie() })).toBe(false);
    expect(leesBkKort(sleutel)).toBeUndefined();
  });

  it('een berekening die begon vóór een wijziging in de opslag, wordt niet meer bewaard', () => {
    const generatie = dekkingGeneratie();
    notifyChange();
    bewaarKortVanDetail({ ...basis, generatie });
    expect(leesBkKort(sleutel)).toBeUndefined();
    bewaarKortVanDetail({ ...basis, generatie: dekkingGeneratie() });
    expect(leesBkKort(sleutel)).toBeDefined();
  });

  it('de sleutel is die van het kader (de richting en het soort onderwijs), en een ander soort raakt hem niet', () => {
    bewaarKortVanDetail({ ...basis, soort: 'buso', generatie: dekkingGeneratie() });
    expect(leesBkKort(kaderGroepSleutel(INFO, 'buso'))).toBeDefined();
    expect(leesBkKort(sleutel)).toBeUndefined();
  });

  it('een BK-ingang raakt de ingang van de minimumdoelen niet (I3)', () => {
    bewaarDekkingKort(sleutel, { totaal: 10, gedekt: 4, gepland: 2, percent: 40, eersteGraad: false });
    bewaarKortVanDetail({ ...basis, generatie: dekkingGeneratie() });
    expect(leesDekkingKort(sleutel)).toEqual({ totaal: 10, gedekt: 4, gepland: 2, percent: 40, eersteGraad: false });
    expect(leesBkKort(sleutel)).toBeDefined();
  });

  it('zonder cursus die meetelt: de korte regel is "zonder-cursus" (de rij vraagt dan geen bestanden)', () => {
    const leeg = dekkingBkVanRichting({ kader: KADER, bestanden: BESTANDEN, bijdragen: [], widgets: [] });
    bewaarKortVanDetail({ ...basis, dekking: leeg, generatie: dekkingGeneratie() });
    expect(leesBkKort(sleutel)).toEqual({ soort: 'zonder-cursus', bks: 2 });
  });
});
