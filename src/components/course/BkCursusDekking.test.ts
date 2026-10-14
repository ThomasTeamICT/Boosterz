// De dekking op competenties in de cursuseditor (docs/STUDIERICHTINGEN.md § 24.6.1 en § 24.9, pakket 3b-S1): het laden van de
// gegevens (alleen de index en de bestanden die de index noemt, nooit de koppeling), de server-render van alle toestanden
// (samenvatting, paneel, zonder bestand, zonder index, laden en fout), wat "Zet ze in deze cursus" met de cursus doet, en de
// schakelaar van `GoalCoverage`.
//
// Een server-render kent geen klik en geen effecten. Daarom geeft `mock.stand` de uitkomst van `useLaadstand` (de hook zelf
// wordt apart getest) en vervangt `mock.wachtrij` de eerste `useState`-aanroepen van de render, in de volgorde waarin ze komen
// (zoals in MinimumdoelenDekking.test.ts): zo staat het paneel open.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { valideerBkBestand, type BkBestand, type BkIndex } from '../../lib/beroepskwalificaties';
import { FOUT_BK, wisBkCache } from '../../lib/beroepskwalificatiesBron';
import { bkGeraamte, cursusVoorBk } from '../../lib/bkCursus';
import { leerplanUitBk, type BkKeuze } from '../../lib/bkLeerplan';
import { BK_DEKKING_TITEL, BK_LADEN, BK_PLAN_TEKSTEN, BK_ZONDER_BESTAND } from '../../lib/bkWeergave';
import { computeCoverage } from '../../lib/coverage';
import type { Course } from '../../lib/courseTypes';
import type { Curriculum } from '../../lib/curriculumTypes';
import { bkKaderVanVersies, bkVerwijzingen, dekkingBk } from '../../lib/dekkingBk';
import { BK_DEKKING_LADEN, FOUT_LADEN_BK_DEKKING, bkWeergaveLabel } from '../../lib/dekkingWeergave';
import { doelgroepVan, richtingInfo } from '../../lib/richtingKader';
import type { MatrixBestand } from '../../lib/studierichtingen';
import { PLAN_BIJ_RICHTING_TEKST } from '../../lib/gatenWeergave';
import { BkCursusDekking, bkPlanSmaak, laadBkEditorGegevens, type BkEditorGegevens } from './BkCursusDekking';
import { GoalCoverage } from './GoalCoverage';

// ── Wat van buiten komt: de staat van een render en de hooks die het netwerk of de meldingen raken ──

type Staat = boolean | ReadonlySet<string> | undefined;

const mock = vi.hoisted(() => ({
  wachtrij: [] as Staat[],
  stand: { status: 'laden' } as { status: 'laden' } | { status: 'klaar'; waarde: unknown } | { status: 'fout'; fout: string },
  opnieuw: 0,
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
  useToast: () => () => {},
}));

vi.mock('../../lib/useLaadstand', () => ({
  useLaadstand: () => ({ stand: mock.stand, opnieuw: () => { mock.opnieuw += 1; } }),
}));

// ── De nagebootste beroepskwalificaties (tests/fixtures/kwalificaties/uit/) ─────────────────────

const HIER = fileURLToPath(new URL('.', import.meta.url));
const lees = (pad: string): unknown => JSON.parse(readFileSync(join(HIER, '../../../tests/fixtures', pad), 'utf8'));

const VANDAAG = '2026-10-14';
const MATRIX = lees('structuur/uit/studierichtingen.json') as MatrixBestand;
const INDEX = lees('kwalificaties/uit/index.json') as BkIndex;
const ONTHAAL = lees('kwalificaties/uit/bk/BK-0390-2.json') as BkBestand;
const RECREATIEF = lees('kwalificaties/uit/bk/BK-0464-1.json') as BkBestand;
const BESTANDEN: ReadonlyMap<string, BkBestand> = new Map([ONTHAAL, RECREATIEF].map((b) => [b.bk, b]));

const INFO_8 = richtingInfo(MATRIX, 'G-0008', VANDAAG);
if (!INFO_8) throw new Error('G-0008 ontbreekt in de structuurfixtures');
const DG = doelgroepVan(INFO_8, { groep: 'G-0008', soort: 'so', jaar: 3 });

const deel = (b: BkBestand, van: number, tot: number): BkKeuze => ({ bestand: b, competenties: b.competenties.slice(van, tot).map((c) => c.id) });
const alle = (b: BkBestand): BkKeuze => deel(b, 0, b.competenties.length);

function leerplanMet(keuzes: BkKeuze[]): Curriculum {
  const merken = new Map(keuzes.map((k) => [k.bestand.bk, k.bestand.sha256.slice(0, 16)] as const));
  const u = leerplanUitBk(keuzes, { doelgroep: { ...DG, jaar: undefined }, merken });
  expect(u.bevestigd, u.waarschuwingen.join(' | ')).toBe(true);
  return u.leerplan;
}

/** Een cursus met dit leerplan, zonder secties met doelcodes ("Met een lege cursus"). */
function leegMet(leerplan: Curriculum, bestanden: ReadonlyMap<string, BkBestand> = BESTANDEN): Course {
  return cursusVoorBk({ titel: 'Onthaal 5de jaar', auteur: 'Juf An', doelgroep: DG, leerplan, bestanden, start: 'leeg' });
}

/** De tekst die een leerkracht leest: zonder tags, met de entiteiten van de server-render terug naar gewone tekens. */
function tekstVan(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '’').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

const LP_ONTHAAL_8 = leerplanMet([deel(ONTHAAL, 0, 8)]);
const LP_ONTHAAL_12 = leerplanMet([alle(ONTHAAL)]);
const LP_TWEE = leerplanMet([deel(ONTHAAL, 0, 8), alle(RECREATIEF)]);

const GEGEVENS_ONTHAAL: BkEditorGegevens = { bestanden: new Map([[ONTHAAL.bk, ONTHAAL]]), titels: new Map() };
const GEGEVENS_BEIDE: BkEditorGegevens = { bestanden: new Map([[ONTHAAL.bk, ONTHAAL], [RECREATIEF.bk, RECREATIEF]]), titels: new Map() };

/** Rendert op de server, met de uitkomst van het laden en de staat voor de eerste `useState`-aanroepen. */
function toon(
  curriculum: Curriculum,
  gegevens: BkEditorGegevens | null,
  o: { onEdit?: boolean; course?: Course; wachtrij?: Staat[] } = {},
): string {
  mock.stand = gegevens ? { status: 'klaar', waarde: gegevens } : { status: 'laden' };
  mock.wachtrij = [...(o.wachtrij ?? [])];
  try {
    return renderToStaticMarkup(createElement(
      StaticRouter,
      { location: '/' },
      createElement(BkCursusDekking, {
        course: o.course ?? leegMet(curriculum), curriculum, widgets: [], ...(o.onEdit === false ? {} : { onEdit: () => {} }),
      }),
    ));
  } finally {
    mock.wachtrij = [];
  }
}

// ── Het laden: alleen de index en de bestanden die de index noemt ───────────

describe('laadBkEditorGegevens: de gegevens van de BK-versies van het leerplan', () => {
  const verzoeken: string[] = [];
  const echteFetch = globalThis.fetch;

  /** Zet `fetch` op de nagebootste map; wat er niet is (of niet in `bestanden` staat), is een 404. */
  function serveer(o: { index?: BkIndex | null; fout?: boolean } = {}) {
    const index = o.index === undefined ? INDEX : o.index;
    globalThis.fetch = (async (invoer: Parameters<typeof fetch>[0]) => {
      const rest = String(invoer).split('/leerplannen/kwalificaties/')[1] ?? '';
      verzoeken.push(rest);
      if (o.fout) throw new TypeError('Failed to fetch');
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
      if (rest === 'index.json') return index ? json(index) : new Response('niet gevonden', { status: 404 });
      const bk = /^bk\/(BK-\d+-\d+)\.json$/.exec(rest)?.[1];
      const bestand = bk ? BESTANDEN.get(bk) : undefined;
      return bestand ? json(bestand) : new Response('niet gevonden', { status: 404 });
    }) as typeof fetch;
  }

  beforeEach(() => {
    verzoeken.length = 0;
    wisBkCache();
  });
  afterEach(() => {
    globalThis.fetch = echteFetch;
    wisBkCache();
  });

  it('vraagt de index en de bestanden van de versies, en nooit de koppeling van een richting', async () => {
    serveer();
    const g = await laadBkEditorGegevens([ONTHAAL.bk, RECREATIEF.bk]);
    expect([...g.bestanden.keys()]).toEqual([ONTHAAL.bk, RECREATIEF.bk]);
    expect([...g.titels.entries()]).toEqual([[ONTHAAL.bk, 'Onthaalmedewerker'], [RECREATIEF.bk, 'Recreatief medewerker']]);
    expect([...verzoeken].sort()).toEqual(['bk/BK-0390-2.json', 'bk/BK-0464-1.json', 'index.json']);
    expect(verzoeken.some((v) => /koppeling/.test(v))).toBe(false);
  });

  it('vraagt alleen de versies van het leerplan, niet die van de hele index', async () => {
    serveer();
    const g = await laadBkEditorGegevens([ONTHAAL.bk]);
    expect([...g.bestanden.keys()]).toEqual([ONTHAAL.bk]);
    expect([...verzoeken].sort()).toEqual(['bk/BK-0390-2.json', 'index.json']);
  });

  it('een versie die de index zonder bestand noemt, wordt nooit gevraagd (een 404 is een consolefout) maar houdt haar titel', async () => {
    // Een versie zonder bestand heeft in de index geen bestand, sha256 en aantal, maar "nietGevonden" (zo valideert de index).
    const zonder: BkIndex = {
      ...INDEX,
      bks: INDEX.bks.map((r) => (r.bk === RECREATIEF.bk ? { ...r, bestand: undefined, sha256: undefined, aantal: undefined, nietGevonden: true as const } : r)),
    };
    serveer({ index: zonder });
    const g = await laadBkEditorGegevens([ONTHAAL.bk, RECREATIEF.bk]);
    expect([...g.bestanden.keys()]).toEqual([ONTHAAL.bk]);
    expect(g.titels.get(RECREATIEF.bk)).toBe('Recreatief medewerker');
    expect(verzoeken).not.toContain('bk/BK-0464-1.json');
  });

  it('een versie die de index niet kent, wordt niet gevraagd', async () => {
    serveer();
    const g = await laadBkEditorGegevens([ONTHAAL.bk, 'BK-0123-4']);
    expect([...g.bestanden.keys()]).toEqual([ONTHAAL.bk]);
    expect(verzoeken).not.toContain('bk/BK-0123-4.json');
  });

  it('zonder index (nog niet opgehaald) staan alle versies zonder bestand, en er gaat geen tweede verzoek uit', async () => {
    serveer({ index: null });
    const g = await laadBkEditorGegevens([ONTHAAL.bk, RECREATIEF.bk]);
    expect(g.bestanden.size).toBe(0);
    expect(verzoeken).toEqual(['index.json']);
  });

  it('een bestand dat er toch niet blijkt te zijn (404), staat zonder bestand', async () => {
    // BK-9999-1 staat met een bestand in de index, maar de server heeft het niet.
    serveer();
    const g = await laadBkEditorGegevens(['BK-9999-1']);
    expect(g.bestanden.size).toBe(0);
    expect(verzoeken).toEqual(['index.json', 'bk/BK-9999-1.json']);
  });

  it('een netwerkfout geeft de melding van de lader in gewone taal', async () => {
    serveer({ fout: true });
    await expect(laadBkEditorGegevens([ONTHAAL.bk])).rejects.toThrow(FOUT_BK);
  });
});

// ── De server-render ────────────────────────────────────────────────────────

describe('BkCursusDekking: laden en fout', () => {
  it('zolang het laadt: een statusregel met de zin van het laden en niets anders', () => {
    const html = toon(LP_ONTHAAL_8, null);
    expect(html).toContain('role="status"');
    expect(tekstVan(html)).toBe(BK_LADEN);
    expect(html).not.toContain('dk-samenvatting');
  });

  it('bij een fout: een melding (role="alert") met de tekst van de lader en "Opnieuw proberen"', () => {
    mock.stand = { status: 'fout', fout: FOUT_BK };
    const html = renderToStaticMarkup(createElement(
      StaticRouter,
      { location: '/' },
      createElement(BkCursusDekking, { course: leegMet(LP_ONTHAAL_8), curriculum: LP_ONTHAAL_8, widgets: [] }),
    ));
    expect(html).toContain('role="alert"');
    expect(tekstVan(html)).toBe(`${FOUT_BK} Opnieuw proberen`);
  });

  it('het blok is een groep met een naam en kan de focus krijgen (na "Opnieuw proberen" verdwijnt de knop)', () => {
    const html = toon(LP_ONTHAAL_8, null);
    expect(html).toContain(`role="group" aria-label="${BK_DEKKING_TITEL}" tabindex="-1"`);
  });
});

describe('BkCursusDekking: de samenvatting en het plannen', () => {
  it('één BK: percentage, staart en de zin over de competenties die nog op geen enkele sectie staan (het scenario van § 24.1)', () => {
    const t = tekstVan(toon(LP_ONTHAAL_8, GEGEVENS_ONTHAAL));
    expect(t).toContain('Deze cursus dekt 0 van de 12 competenties van Onthaalmedewerker (0 %).');
    expect(t).toContain('0 competenties staan al gepland op een sectie die nog leeg is, 0 komen alleen in verdieping aan bod, 12 nog niet.');
    expect(t).toContain('8 competenties uit het leerplan van deze cursus staan nog op geen enkele sectie.');
    expect(t).toContain('Plan ze in deze cursus');
  });

  it('de samenvatting is een live-gebied dat de focus kan krijgen', () => {
    expect(toon(LP_ONTHAAL_8, GEGEVENS_ONTHAAL)).toContain('<p class="dk-samenvatting" aria-live="polite" tabindex="-1">');
  });

  it('de competenties die niet in het leerplan staan, en de link naar de richting met de zin over de studierichting', () => {
    const html = toon(LP_ONTHAAL_8, GEGEVENS_ONTHAAL);
    const t = tekstVan(html);
    expect(t).toContain('4 andere competenties die deze cursus niet dekt, staan niet in haar leerplan.');
    expect(t).toContain(PLAN_BIJ_RICHTING_TEKST);
    expect(t).toContain('Bekijk wat al je cursussen voor Assistent dierlijke productie samen dekken');
    expect(html).toContain('href="/cursussen/richtingen/G-0008?jaar=3"');
  });

  it('met het hele leerplan (12 van 12) staat er geen zin over andere competenties en geen zin over de studierichting', () => {
    const t = tekstVan(toon(LP_ONTHAAL_12, GEGEVENS_ONTHAAL));
    expect(t).toContain('12 competenties uit het leerplan van deze cursus staan nog op geen enkele sectie.');
    expect(t).not.toContain('andere competenties');
    expect(t).not.toContain(PLAN_BIJ_RICHTING_TEKST);
  });

  it('zonder onEdit (alleen kijken): geen regel, geen knop en geen zin over andere competenties, wel de samenvatting en de link', () => {
    const t = tekstVan(toon(LP_ONTHAAL_8, GEGEVENS_ONTHAAL, { onEdit: false }));
    expect(t).toContain('Deze cursus dekt 0 van de 12 competenties van Onthaalmedewerker (0 %).');
    expect(t).not.toContain('Plan ze in deze cursus');
    expect(t).not.toContain('geen enkele sectie');
    expect(t).not.toContain('andere competenties');
    expect(t).toContain('Bekijk wat al je cursussen voor Assistent dierlijke productie samen dekken');
  });

  it('per beroepskwalificatie een uitklapper met "5 van 12 gedekt"-zin, en de keuze "Toon" met de woorden van de competenties', () => {
    const t = tekstVan(toon(LP_ONTHAAL_8, GEGEVENS_ONTHAAL));
    expect(t).toContain('Toon Alle competenties Nog niet gedekt');
    expect(t).toContain('Onthaalmedewerker: 0 van 12 gedekt (0 %)');
  });

  it('twee BK\'s: een samenvatting zonder percentage, en "Toon" per beroepskwalificatie', () => {
    const t = tekstVan(toon(LP_TWEE, GEGEVENS_BEIDE));
    expect(t).toContain('Deze cursus dekt 0 van de 25 competenties van 2 beroepskwalificaties.');
    expect(t).not.toMatch(/van 2 beroepskwalificaties \(\d+ %\)/);
    expect(t).toContain('21 competenties uit het leerplan van deze cursus staan nog op geen enkele sectie.');
    expect(t).toContain('Onthaalmedewerker: 0 van 12 gedekt (0 %)');
    expect(t).toContain('Recreatief medewerker: 0 van 13 gedekt (0 %)');
    expect(t).toContain('4 andere competenties die deze cursus niet dekt, staan niet in haar leerplan.');
  });

  it('het paneel bij één BK: kop, uitleg, de regel "Onthaalmedewerker · 8 competenties" en de knoppen', () => {
    // wachtrij: de keuze "Toon" van de weergave (zijn eigen beginwaarde), dan het paneel van PlanInCursus open
    const html = toon(LP_ONTHAAL_8, GEGEVENS_ONTHAAL, { wachtrij: [undefined, true] });
    expect(html).toMatch(/<div id="[^"]*-paneel" role="group" aria-labelledby="[^"]*-kop" tabindex="-1" class="gt-paneel"><h3 id="[^"]*-kop">Plan in deze cursus<\/h3>/);
    const t = tekstVan(html);
    expect(t).toContain(BK_PLAN_TEKSTEN.uitleg);
    expect(t).toContain('Onthaalmedewerker · 8 competenties');
    expect(t).toContain('Zet ze in deze cursus');
    expect(t).toContain('Annuleren');
    expect(t).not.toContain('Nog nodig');
    expect(html).toContain('aria-expanded="true"');
  });

  it('het paneel bij twee BK\'s: een fieldset "Welke competenties?" met een vakje per BK en de teller', () => {
    const html = toon(LP_TWEE, GEGEVENS_BEIDE, { wachtrij: [undefined, true] });
    const t = tekstVan(html);
    expect(html).toContain('<fieldset class="gt-groep"><legend>Welke competenties?</legend>');
    expect(t).toContain('Vink uit wat in een andere cursus thuishoort.');
    expect(t).toContain('Onthaalmedewerker · 8 competenties');
    expect(t).toContain('Recreatief medewerker · 13 competenties');
    expect(t).toContain('Toon de competenties van ‘Onthaalmedewerker’');
    expect(t).toContain('Je koos 21 competenties uit 2 beroepskwalificaties.');
  });

  it('een uitgevinkte BK: de teller en de knop volgen, en zonder keuze staat er "Nog nodig: minstens één competentie."', () => {
    const uit = new Set([ONTHAAL.bk, RECREATIEF.bk]);
    // wachtrij: "Toon", dan open (true) en de uitgevinkte BK's
    const t = tekstVan(toon(LP_TWEE, GEGEVENS_BEIDE, { wachtrij: [undefined, true, uit] }));
    expect(t).toContain('Je koos nog geen competenties.');
    expect(t).toContain('Nog nodig: minstens één competentie.');
    const een = tekstVan(toon(LP_TWEE, GEGEVENS_BEIDE, { wachtrij: [undefined, true, new Set([ONTHAAL.bk])] }));
    expect(een).toContain('Je koos 13 competenties uit 1 beroepskwalificatie.');
    expect(een).toContain('Zet ze in deze cursus');
  });

  it('wat al gepland of gedekt is, staat niet meer in de regel (alleen open competenties van het leerplan)', () => {
    const gegevens = GEGEVENS_ONTHAAL;
    const lp = LP_ONTHAAL_8;
    const cursus = cursusVoorBk({ titel: 'X', auteur: 'Y', doelgroep: DG, leerplan: lp, bestanden: BESTANDEN, start: 'geraamte' });
    const t = tekstVan(toon(lp, gegevens, { course: cursus }));
    expect(t).toContain('Deze cursus dekt 0 van de 12 competenties van Onthaalmedewerker (0 %).');
    expect(t).toContain('8 competenties staan al gepland op een sectie die nog leeg is, 0 komen alleen in verdieping aan bod, 4 nog niet.');
    expect(t).not.toContain('geen enkele sectie');
    expect(t).not.toContain('Plan ze in deze cursus');
    expect(t).toContain('4 andere competenties die deze cursus niet dekt, staan niet in haar leerplan.');
  });
});

describe('BkCursusDekking: zonder bestand, zonder index en wat niet meer in de bron staat', () => {
  it('een BK zonder bestand: haar titel en de uitleg, en de dekking telt alleen de BK\'s met bestand', () => {
    const t = tekstVan(toon(LP_TWEE, { bestanden: GEGEVENS_ONTHAAL.bestanden, titels: new Map([[RECREATIEF.bk, 'Recreatief medewerker']]) }));
    expect(t).toContain(`Recreatief medewerker . ${BK_ZONDER_BESTAND}`);
    expect(t).toContain('Deze cursus dekt 0 van de 12 competenties van Onthaalmedewerker (0 %).');
    expect(t).not.toContain('Recreatief medewerker: ');
  });

  it('de titel van een BK zonder bestand komt, zonder index, uit het leerplan', () => {
    const t = tekstVan(toon(LP_TWEE, GEGEVENS_ONTHAAL));
    expect(t).toContain(`Recreatief medewerker . ${BK_ZONDER_BESTAND}`);
  });

  it('zonder index (alle BK\'s zonder bestand): alleen de uitleg per BK, geen samenvatting, geen knop en geen "Toon"', () => {
    const html = toon(LP_TWEE, { bestanden: new Map(), titels: new Map() });
    const t = tekstVan(html);
    expect(t).toContain(`Onthaalmedewerker . ${BK_ZONDER_BESTAND}`);
    expect(t).toContain(`Recreatief medewerker . ${BK_ZONDER_BESTAND}`);
    expect(html).not.toContain('dk-samenvatting');
    expect(t).not.toContain('Plan ze in deze cursus');
    expect(t).not.toContain('Toon');
    expect(t).not.toContain('Deze cursus dekt');
  });

  it('een bestand dat de overheid niet meer geeft: de bestaande zin met de datum (bij één BK zonder naam ervoor)', () => {
    const oud: BkBestand = { ...ONTHAAL, nietMeerInBron: '2026-12-03' };
    expect(valideerBkBestand(oud, oud.bk)).toEqual([]);
    const t = tekstVan(toon(LP_ONTHAAL_8, { bestanden: new Map([[oud.bk, oud]]), titels: new Map() }));
    expect(t).toContain('De Vlaamse overheid geeft deze versie sinds 3 december 2026 niet meer. Je ziet de laatst bekende competenties.');
    expect(t).not.toContain('Onthaalmedewerker . De Vlaamse overheid');
  });

  it('bij twee BK\'s noemt de zin over een bestand dat de overheid niet meer geeft, haar naam', () => {
    const oud: BkBestand = { ...ONTHAAL, nietMeerInBron: '2026-12-03' };
    const html = toon(LP_TWEE, { bestanden: new Map([[oud.bk, oud], [RECREATIEF.bk, RECREATIEF]]), titels: new Map() });
    expect(tekstVan(html)).toContain('Onthaalmedewerker . De Vlaamse overheid geeft deze versie sinds 3 december 2026 niet meer.');
    expect(html).toContain('role="note"');
  });

  it('competenties van het leerplan die niet meer in de officiële lijst staan, in enkelvoud en meervoud (alleen met alle bestanden)', () => {
    const korter = (n: number): BkBestand => ({ ...ONTHAAL, competenties: ONTHAAL.competenties.slice(0, n), aantal: n });
    expect(valideerBkBestand(korter(10), ONTHAAL.bk)).toEqual([]);
    const lijst = (b: BkBestand): BkEditorGegevens => ({ bestanden: new Map([[b.bk, b]]), titels: new Map() });
    // De cursus met het geraamte (elke competentie op een lege sectie); de lege cursus staat in de test hieronder.
    const metGeraamte = (lp: Curriculum) => cursusVoorBk({ titel: 'X', auteur: 'Y', doelgroep: DG, leerplan: lp, bestanden: BESTANDEN, start: 'geraamte' });
    expect(tekstVan(toon(LP_ONTHAAL_12, lijst(korter(10)), { course: metGeraamte(LP_ONTHAAL_12) }))).toContain(
      '2 competenties uit het leerplan van deze cursus staan niet meer in de officiële lijst van hun beroepskwalificatie. Bij de studierichting zie je wat er veranderde.',
    );
    expect(tekstVan(toon(LP_ONTHAAL_12, lijst(korter(11)), { course: metGeraamte(LP_ONTHAAL_12) }))).toContain(
      '1 competentie uit het leerplan van deze cursus staat niet meer in de officiële lijst van haar beroepskwalificatie. Bij de studierichting zie je wat er veranderde.',
    );
    expect(tekstVan(toon(LP_ONTHAAL_12, GEGEVENS_ONTHAAL, { course: metGeraamte(LP_ONTHAAL_12) }))).not.toContain('niet meer in de officiële lijst');
    // Zonder alle bestanden is het kader onvolledig: dan zegt de editor hier niets over.
    expect(tekstVan(toon(LP_TWEE, lijst(korter(10)), { course: metGeraamte(LP_TWEE) }))).not.toContain('niet meer in de officiële lijst');
  });

  it('competenties die niet meer in de officiële lijst staan, tellen ook mee als ze op geen enkele sectie staan', () => {
    const zonder = (...weg: number[]): BkBestand => {
      const competenties = ONTHAAL.competenties.filter((_, i) => !weg.includes(i));
      return { ...ONTHAAL, competenties, aantal: competenties.length };
    };
    const lijst = (b: BkBestand): BkEditorGegevens => ({ bestanden: new Map([[b.bk, b]]), titels: new Map() });
    expect(valideerBkBestand(zonder(4, 5, 6), ONTHAAL.bk)).toEqual([]);
    // Een lege cursus: geen enkele competentie staat op een sectie, toch staan er 3 van de 12 niet meer in de lijst.
    expect(tekstVan(toon(LP_ONTHAAL_12, lijst(zonder(4, 5, 6)), { course: leegMet(LP_ONTHAAL_12) }))).toContain(
      '3 competenties uit het leerplan van deze cursus staan niet meer in de officiële lijst van hun beroepskwalificatie.',
    );
    // 6 van de 8 op een sectie; weg zijn er twee op een sectie (4 en 5) en één zonder sectie (6): samen 3.
    const codes = LP_ONTHAAL_8.goals.slice(0, 6).map((g) => g.code);
    const zes = cursusVoorBk({ titel: 'X', auteur: 'Y', doelgroep: DG, leerplan: LP_ONTHAAL_8, bestanden: BESTANDEN, codes, start: 'geraamte' });
    const tekst = tekstVan(toon(LP_ONTHAAL_8, lijst(zonder(4, 5, 6)), { course: zes }));
    expect(tekst).toContain('3 competenties uit het leerplan van deze cursus staan niet meer in de officiële lijst van hun beroepskwalificatie.');
    // Een competentie die niet in de lijst staat, komt niet nog eens in "staan nog op geen enkele sectie": alleen 7 blijft over.
    expect(tekst).toContain('1 competentie uit het leerplan van deze cursus staat nog op geen enkele sectie');
  });

  it('nooit een competentiecode, ADV-nummer, groepnummer of BK-nummer in de tekst van het scherm', () => {
    const schermen = [
      toon(LP_ONTHAAL_8, GEGEVENS_ONTHAAL),
      toon(LP_ONTHAAL_8, GEGEVENS_ONTHAAL, { wachtrij: [undefined, true] }),
      toon(LP_TWEE, GEGEVENS_BEIDE, { wachtrij: [undefined, true] }),
      toon(LP_TWEE, GEGEVENS_ONTHAAL),
      toon(LP_TWEE, { bestanden: new Map(), titels: new Map() }),
    ];
    for (const html of schermen) expect(tekstVan(html)).not.toMatch(/bkc\d|ADV-|G-\d|ODS_|BK-\d/);
  });
});

// ── Zet ze in deze cursus ───────────────────────────────────────────────────

describe('bkPlanSmaak: wat "Zet ze in deze cursus" met de cursus doet', () => {
  const smaak = bkPlanSmaak(BESTANDEN);

  it('de zinnen van de competenties en de bkRefs als verwijzingen', () => {
    expect(smaak.teksten).toBe(BK_PLAN_TEKSTEN);
    expect(smaak.verwijzingen).toBe(bkVerwijzingen);
  });

  it('een sectie per competentie met precies één doelcode, de callout met kennis en vaardigheden, in het hoofdstuk van de BK; het leerplan blijft', async () => {
    const voegToe = await smaak.laadVoegToe();
    const cursus = leegMet(LP_ONTHAAL_8);
    const leerplanVoor = JSON.stringify(LP_ONTHAAL_8);
    const codes = LP_ONTHAAL_8.goals.map((g) => g.code);
    const r = voegToe(cursus, LP_ONTHAAL_8, codes);
    expect(r.toegevoegd).toHaveLength(8);
    const secties = r.course.chapters.flatMap((h) => h.sections).filter((s) => (s.goalCodes ?? []).length > 0);
    expect(secties).toHaveLength(8);
    expect(secties.every((s) => s.goalCodes?.length === 1 && /^BK-0390-2\.\d{2}$/.test(s.goalCodes[0]))).toBe(true);
    expect(secties.some((s) => s.blocks.some((b) => b.type === 'callout' && b.title === 'Kennis en vaardigheden uit de beroepskwalificatie'))).toBe(true);
    expect(r.course.chapters.map((h) => h.title)).toContain('Onthaalmedewerker');
    expect(JSON.stringify(LP_ONTHAAL_8)).toBe(leerplanVoor);
  });

  it('daarna staan de 8 competenties als "gepland" in de dekking en de regel en de knop zijn weg', async () => {
    const voegToe = await smaak.laadVoegToe();
    const cursus = voegToe(leegMet(LP_ONTHAAL_8), LP_ONTHAAL_8, LP_ONTHAAL_8.goals.map((g) => g.code)).course;
    const d = dekkingBk(bkKaderVanVersies([ONTHAAL.bk], BESTANDEN), [{ course: cursus, leerplan: LP_ONTHAAL_8 }], []);
    expect(d.gepland).toBe(8);
    expect(d.gedekt).toBe(0);
    expect(d.open).toBe(4);
    const t = tekstVan(toon(LP_ONTHAAL_8, GEGEVENS_ONTHAAL, { course: cursus }));
    expect(t).toContain('8 competenties staan al gepland op een sectie die nog leeg is');
    expect(t).not.toContain('Plan ze in deze cursus');
  });

  it('twee keer dezelfde competenties zetten verandert niets de tweede keer (nooit dubbel)', async () => {
    const voegToe = await smaak.laadVoegToe();
    const codes = LP_ONTHAAL_8.goals.map((g) => g.code);
    const eerst = voegToe(leegMet(LP_ONTHAAL_8), LP_ONTHAAL_8, codes);
    const tweede = voegToe(eerst.course, LP_ONTHAAL_8, codes);
    expect(tweede.toegevoegd).toHaveLength(0);
    expect(tweede.course.chapters.flatMap((h) => h.sections).length).toBe(eerst.course.chapters.flatMap((h) => h.sections).length);
  });

  it('gelijk aan bkGeraamte met dezelfde bestanden (de secties van het geraamte van een nieuwe cursus)', async () => {
    const voegToe = await smaak.laadVoegToe();
    const codes = LP_TWEE.goals.map((g) => g.code);
    const r = voegToe(leegMet(LP_TWEE), LP_TWEE, codes);
    const verwacht = bkGeraamte(LP_TWEE, BESTANDEN, codes);
    const titels = (c: Course) => c.chapters.flatMap((h) => h.sections.map((s) => `${h.title}|${s.title}|${s.goalCodes?.join(',') ?? ''}`));
    const geplaatst = titels(r.course).filter((t) => /\|BK-/.test(t));
    expect(geplaatst).toEqual(verwacht.flatMap((h) => h.sections.map((s) => `${h.title}|${s.title}|${s.goalCodes?.join(',')}`)));
  });
});

// ── De schakelaar van GoalCoverage ──────────────────────────────────────────

describe('GoalCoverage: de schakelaar "Leerplan / Beroepskwalificatie"', () => {
  const MD_LEERPLAN: Curriculum = {
    id: 'lp-md', title: 'Leerplan met minimumdoelen', net: 'minimumdoelen', subject: '', level: '', kind: 'leerplan', createdAt: 1, updatedAt: 1,
    minimumdoelenSets: ['ODS_9101'],
    goals: [{ id: 'g1', code: 'B01', text: 'Doel 1.', refs: [{ set: 'ODS_9101', id: 'b1', code: 'B01' }] }],
  } as Curriculum;
  const VRIJ_LEERPLAN: Curriculum = {
    id: 'lp-vrij', title: 'Een eigen leerplan', net: 'eigen', subject: '', level: '', kind: 'leerplan', createdAt: 1, updatedAt: 1,
    goals: [{ id: 'g1', code: 'A01', text: 'Eigen doel.' }],
  } as Curriculum;

  function schakelaar(curriculum: Curriculum): string {
    mock.wachtrij = [];
    const html = renderToStaticMarkup(createElement(
      StaticRouter,
      { location: '/' },
      createElement(GoalCoverage, { course: leegMet(LP_ONTHAAL_8), curriculum, widgets: [] }),
    ));
    const m = /<div class="dk-schakelaar"[^>]*>(.*?)<\/div>/.exec(html);
    return m ? tekstVan(m[1]) : '';
  }

  it('bij een BK-leerplan: "Leerplan" (aangezet) en "Beroepskwalificatie", en geen "Minimumdoelen"', () => {
    expect(schakelaar(LP_ONTHAAL_8)).toBe('Leerplan Beroepskwalificatie');
  });

  it('bij een BK-leerplan met twee beroepskwalificaties: "Beroepskwalificaties"', () => {
    expect(LP_TWEE.bkVersies).toHaveLength(2);
    expect(schakelaar(LP_TWEE)).toBe('Leerplan Beroepskwalificaties');
    expect(bkWeergaveLabel(2)).toBe('Beroepskwalificaties');
  });

  it('hoogstens één knop erbij: een BK-leerplan met ook verwijzingen naar minimumdoelen krijgt "Beroepskwalificatie", niet "Minimumdoelen"', () => {
    const [eerste, ...rest] = LP_ONTHAAL_8.goals;
    const beide: Curriculum = {
      ...LP_ONTHAAL_8,
      minimumdoelenSets: ['ODS_9101'],
      goals: [{ ...eerste, refs: [{ set: 'ODS_9101', id: 'b1', code: 'B01' }] }, ...rest],
    };
    expect(schakelaar(beide)).toBe('Leerplan Beroepskwalificatie');
  });

  it('bij een leerplan met verwijzingen naar minimumdoelen verandert er niets: "Leerplan" en "Minimumdoelen"', () => {
    expect(schakelaar(MD_LEERPLAN)).toBe('Leerplan Minimumdoelen');
  });

  it('bij een leerplan zonder verwijzingen is er geen schakelaar', () => {
    expect(schakelaar(VRIJ_LEERPLAN)).toBe('');
  });

  it('de schakelaar is een groep met knoppen met aria-pressed; "Leerplan" staat aan', () => {
    mock.wachtrij = [];
    const html = renderToStaticMarkup(createElement(
      StaticRouter,
      { location: '/' },
      createElement(GoalCoverage, { course: leegMet(LP_ONTHAAL_8), curriculum: LP_ONTHAAL_8, widgets: [] }),
    ));
    expect(html).toContain('<div class="dk-schakelaar" role="group" aria-label="Weergave van de dekking">');
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*Leerplan<\/button><button[^>]*aria-pressed="false"[^>]*> Beroepskwalificatie<\/button>/);
  });

  it('de weergave "Leerplan" van een BK-leerplan is die van elk leerplan (de matrix op doelen)', () => {
    const cursus = leegMet(LP_ONTHAAL_8);
    const r = computeCoverage(cursus, LP_ONTHAAL_8, []);
    mock.wachtrij = [];
    const html = renderToStaticMarkup(createElement(
      StaticRouter,
      { location: '/' },
      createElement(GoalCoverage, { course: cursus, curriculum: LP_ONTHAAL_8, widgets: [] }),
    ));
    expect(tekstVan(html)).toContain(r.summary);
  });

  it('de zinnen van het laden en van de fout voor de competenties', () => {
    expect(BK_DEKKING_LADEN).toBe('De dekking op de competenties wordt geladen…');
    expect(FOUT_LADEN_BK_DEKKING).toBe('De dekking op de competenties kon niet geladen worden. Controleer je verbinding en herlaad de pagina.');
  });
});
