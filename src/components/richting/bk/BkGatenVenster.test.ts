// Het venster "Plan de competenties die nog nergens aan bod komen" (docs/STUDIERICHTINGEN.md § 24.6.3, pakket 3b-S2): wat het
// toont in elke toestand, op de fixtures van G-0008 "Assistent dierlijke productie" (Onthaalmedewerker met 12 en Recreatief
// medewerker met 13 competenties). Een server-render kent geen klik: de staat van het venster (uitgevinkt, waar, titel,
// gekozen cursus, probleem, klaar) wordt van buiten opgegeven, zoals in `MinimumdoelenDekking.test.ts`: `mock.wachtrij` vervangt
// de eerste `useState`-aanroepen van de render, in de volgorde van het bestand. Het laden van de bestanden (`useLaadstand`) en
// het venster zelf (`Modal`, een portal) zijn nagebootst. Het bewaren, de keuze van het leerplan en de secties staan getest in
// `bkGatenHulp.test.ts` en `gatenCursus.test.ts`; hier staat dat het venster ze enkel via de vaste functies aanroept.
//
// Wat het scherm zegt, is `BK_PLAN_TEKSTEN` en de zinnen van § 24.6.3 uit `bkWeergave.ts`: de tests hieronder zetten de
// letterlijke zin ernaast, zodat een wijziging van de tekst ook hier opvalt. Nooit op het scherm (I7): een competentiecode,
// een ADV-nummer, een groepnummer of een set-id.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { BkBestand, BkIndex, KoppelingBestand } from '../../../lib/beroepskwalificaties';
import { FOUT_BK, FOUT_BK_BESCHADIGD } from '../../../lib/beroepskwalificatiesBron';
import { cursusVoorBk } from '../../../lib/bkCursus';
import { leerplanUitBk } from '../../../lib/bkLeerplan';
import { BK_FOUT_VERANDERD, BK_GEEN_KANDIDAAT_HINT } from '../../../lib/bkWeergave';
import type { Course } from '../../../lib/courseTypes';
import type { Curriculum } from '../../../lib/curriculumTypes';
import { dekkingBkVanRichting } from '../../../lib/dekkingBk';
import { uniekeSetNamen } from '../../../lib/dekkingWeergave';
import type { Doelgroep } from '../../../lib/doelgroep';
import type { RichtingBk, RichtingBkRegel } from '../../../lib/richtingBk';
import { bkKader } from '../../../lib/richtingBk';
import { doelgroepVan, richtingInfo, type RichtingInfo, type RichtingKeuze } from '../../../lib/richtingKader';
import { bijdragenVoorKader } from '../../../lib/richtingOverzicht';
import type { MatrixBestand } from '../../../lib/studierichtingen';
import type { BkGegevens } from './BkKeuze';
import { BK_NOG_NODIG_GEGEVENS } from './bkSectieHulp';
import { titelsVoorBkGaten } from './bkGatenHulp';

// ── Wat van buiten komt: de staat van een render, de laadstand en de portal ─

type Staat = boolean | string | ReadonlySet<string> | { tekst: string } | { bewaard: string; waarschuwing: string; cursusId: string } | undefined;

const mock = vi.hoisted(() => ({
  /** De waarden voor de eerste `useState`-aanroepen: uit, waar, titelEigen, cursusId, probleem, klaar, uitslag. */
  wachtrij: [] as unknown[],
  stand: { status: 'laden' } as { status: 'laden' } | { status: 'fout'; fout: string } | { status: 'klaar'; waarde: unknown },
  toasts: [] as [string, string | undefined][],
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

// Een portal bestaat niet op de server: het venster is hier een gewone div met de kop, de inhoud en de voet.
vi.mock('../../ui', async (importOriginal) => {
  const echt = await importOriginal<typeof import('../../ui')>();
  const { createElement: maak } = await import('react');
  return {
    ...echt,
    useToast: () => (tekst: string, soort?: string) => { mock.toasts.push([tekst, soort]); },
    Modal: ({ title, children, footer }: { title: string; children: unknown; footer?: unknown }) =>
      maak('div', { role: 'dialog', 'aria-label': title }, maak('h2', null, title), children as never, footer as never),
  };
});

vi.mock('../../../lib/useLaadstand', () => ({
  useLaadstand: () => ({ stand: mock.stand, opnieuw: () => {} }),
}));

import { BkGatenVenster, type BkGatenVensterProps } from './BkGatenVenster';

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
const KEUZE_3: RichtingKeuze = { groep: 'G-0008', soort: 'so', jaar: 3 };
const KEUZE_GRAAD: RichtingKeuze = { groep: 'G-0008', soort: 'so' };
const DG_3: Doelgroep = doelgroepVan(INFO, KEUZE_3);
const DG_GRAAD: Doelgroep = doelgroepVan(INFO, KEUZE_GRAAD);
const KADER: RichtingBk = bkKader(KOPPELING, INDEX, INFO, { groep: 'G-0008', soort: 'so' }, VANDAAG);

const MERKEN: ReadonlyMap<string, string> = new Map([['BK-0390-2', '75ed8f70bba4cc76'], ['BK-0464-1', '0952ac83fb3ee152']]);
const BESTANDEN: ReadonlyMap<string, BkBestand> = new Map([['BK-0390-2', ONTHAAL], ['BK-0464-1', RECREATIEF]]);
const ONTHAAL_IDS = ONTHAAL.competenties.map((c) => c.id);
const RECREATIEF_IDS = RECREATIEF.competenties.map((c) => c.id);

/** Een nagekeken leerplan met deze competenties van één beroepskwalificatie. */
function leerplan(bestand: BkBestand, ids: readonly string[], doelgroep: Doelgroep): Curriculum {
  const u = leerplanUitBk([{ bestand, competenties: ids }], { doelgroep, merken: MERKEN });
  expect(u.bevestigd, u.waarschuwingen.join(' | ')).toBe(true);
  return u.leerplan;
}

/** Een cursus voor dat leerplan: met een geraamte (de competenties staan gepland) of leeg (ze staan nog open). */
function cursus(titel: string, lp: Curriculum, doelgroep: Doelgroep, start: 'geraamte' | 'leeg'): Course {
  return cursusVoorBk({ titel, auteur: '', doelgroep, leerplan: lp, bestanden: BESTANDEN, start });
}

/** De momentopname van het blok voor deze cursussen en leerplannen, zoals `BkDekking` ze geeft. */
function gegevensVoor(courses: Course[], curricula: Curriculum[], extra: Partial<BkGatenVensterProps['gegevens']> = {}): BkGatenVensterProps['gegevens'] {
  const bijdragen = bijdragenVoorKader({ courses, curricula, info: INFO, soort: 'so', matrix: MATRIX, vandaag: VANDAAG });
  const dekking = dekkingBkVanRichting({ kader: KADER, bestanden: BESTANDEN, bijdragen, widgets: [] });
  return { kader: KADER, dekking, bijdragen, bestanden: BESTANDEN, namen: uniekeSetNamen(dekking.perSet, (set) => set), ...extra };
}

const GELADEN: BkGegevens = { bestanden: new Map(BESTANDEN), merken: new Map(MERKEN), ontbreekt: [] };

interface Opties {
  stand?: typeof mock.stand;
  wachtrij?: Staat[];
  keuze?: RichtingKeuze;
}

/** Rendert het venster op de server. De standaardstand is "geladen". */
function toon(gegevens: BkGatenVensterProps['gegevens'], o: Opties = {}): string {
  mock.stand = o.stand ?? { status: 'klaar', waarde: GELADEN };
  mock.wachtrij = [...(o.wachtrij ?? [])];
  try {
    const props: BkGatenVensterProps = { info: INFO, keuze: o.keuze ?? KEUZE_3, gegevens, onClose: () => {}, onGepland: () => {} };
    return renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(BkGatenVenster, props)));
  } finally {
    mock.wachtrij = [];
  }
}

/** De zichtbare tekst: zonder tags, met witruimte als één spatie en zonder HTML-escapes. */
function tekstVan(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nooit op het scherm (I7): een competentiecode, een ADV-nummer, een groepnummer of een set-id. */
const CODE_OP_SCHERM = /bkc\d|ADV-|G-\d|ODS_/;

/** De primaire knop in de voet van het venster: zijn tekst en of hij `aria-disabled` is. */
function primaireKnop(html: string): { tekst: string; uit: boolean; beschrijft: string | null } {
  const m = /<button type="button" class="btn btn-primary gt-knop"([^>]*)>([^<]*)<\/button>/.exec(html);
  if (!m) throw new Error('Geen primaire knop in het venster');
  return { tekst: m[2], uit: /aria-disabled="true"/.test(m[1]), beschrijft: /aria-describedby="([^"]+)"/.exec(m[1])?.[1] ?? null };
}

// ── Het venster zonder cursussen: alles staat open ──────────────────────────

describe('het venster zonder cursussen (25 open competenties)', () => {
  const gegevens = gegevensVoor([], []);

  it('de kop is een h2, met de intro en de hint letterlijk', () => {
    const html = toon(gegevens);
    expect(html).toContain('<h2>Plan de competenties die nog nergens aan bod komen</h2>');
    const t = tekstVan(html);
    expect(t).toContain('Boosterz zet de gekozen competenties als lege secties in een cursus, met de doelcode en de kennis en vaardigheden erop. Zo staan ze gepland; daarna werk je ze zelf uit. Een AI-sleutel heb je niet nodig.');
    expect(t).toContain('Competenties die al gepland staan of alleen in verdieping aan bod komen, blijven waar ze staan.');
  });

  it('de fieldset: legend, hint, een vakje per beroepskwalificatie met haar aantal, "Toon de competenties" en de teller', () => {
    const html = toon(gegevens);
    expect(html).toContain('<legend>Welke competenties?</legend>');
    const t = tekstVan(html);
    expect(t).toContain('Vink uit wat in een andere cursus thuishoort.');
    expect(t).toContain('Onthaalmedewerker · 12 competenties');
    expect(t).toContain('Recreatief medewerker · 13 competenties');
    expect(t.match(/Toon de competenties/g)).toHaveLength(2);
    expect(t).toContain('Je koos 25 competenties uit 2 beroepskwalificaties.');
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(2);
    expect((html.match(/type="checkbox"[^>]*checked/g) ?? []).length).toBe(2);
  });

  it('de keuze "Waar komen ze?": een nieuwe cursus (standaard) en een cursus die je al hebt, die nog niet kan', () => {
    const html = toon(gegevens);
    expect(html).toContain('<legend>Waar komen ze?</legend>');
    const t = tekstVan(html);
    expect(t).toContain('In een nieuwe cursus');
    expect(t).toContain('In een cursus die je al hebt');
    expect(/type="radio"[^>]*checked[^>]*>\s*<span class="gt-keuze-titel">In een nieuwe cursus/.test(html)).toBe(true);
    // Geen kandidaat: aria-disabled, met de uitleg eronder en erbij verwezen.
    const radio = /<input type="radio" name="[^"]*"[^>]*aria-disabled="true"[^>]*aria-describedby="([^"]+)"[^>]*>/.exec(html);
    expect(radio).not.toBeNull();
    expect(html).toContain(`<p id="${radio?.[1]}" class="gt-keuze-zin">${BK_GEEN_KANDIDAAT_HINT}</p>`);
    expect(BK_GEEN_KANDIDAAT_HINT).toBe('Geen cursus van deze richting heeft een van de gekozen competenties in haar leerplan. Maak er een nieuwe cursus voor.');
  });

  it('de nieuwe cursus: het veld "Titel van de cursus" met het voorstel van `titelsVoorBkGaten` en de hint', () => {
    const html = toon(gegevens);
    const voorstel = titelsVoorBkGaten(INFO, KEUZE_3, ['Onthaalmedewerker', 'Recreatief medewerker']).cursus;
    expect(voorstel).toMatch(/^Aanvulling/);
    expect(html).toContain('>Titel van de cursus</label>');
    expect(html).toContain(`value="${voorstel}"`);
    expect(html).toContain('maxLength="120"');
    expect(tekstVan(html)).toContain('Boosterz maakt er een nagekeken leerplan bij met precies deze competenties, of gebruikt het leerplan dat er al is.');
  });

  it('de knoppen: "Annuleren" en "Maak de cursus", die kan zodra de gegevens er zijn; geen voet "Nog nodig"', () => {
    const html = toon(gegevens);
    expect(html).toContain('>Annuleren</button>');
    expect(primaireKnop(html)).toEqual({ tekst: 'Maak de cursus', uit: false, beschrijft: null });
    expect(html).not.toContain('Nog nodig');
  });

  it('geen competentiecode, ADV-nummer, groepnummer of set-id op het scherm', () => {
    expect(tekstVan(toon(gegevens))).not.toMatch(CODE_OP_SCHERM);
    expect(tekstVan(toon(gegevens, { wachtrij: [new Set(['BK-0464-1'])] }))).not.toMatch(CODE_OP_SCHERM);
  });
});

// ── De bestanden laden ──────────────────────────────────────────────────────

describe('zolang de bestanden laden of mislukken, kan de primaire knop niet', () => {
  const gegevens = gegevensVoor([], []);

  it('laden: de knop staat op aria-disabled en de voet zegt BK_NOG_NODIG_GEGEVENS', () => {
    const html = toon(gegevens, { stand: { status: 'laden' } });
    const knop = primaireKnop(html);
    expect(knop.uit).toBe(true);
    expect(knop.beschrijft).not.toBeNull();
    expect(html).toContain(`<p id="${knop.beschrijft}" class="gt-nodig">${BK_NOG_NODIG_GEGEVENS}</p>`);
    expect(BK_NOG_NODIG_GEGEVENS).toBe('Nog nodig: even wachten tot Boosterz de laatste gegevens geladen heeft.');
    expect(html).not.toContain('Opnieuw proberen');
  });

  it('mislukt: FOUT_BK met "Opnieuw proberen", en de knop kan nog steeds niet', () => {
    const html = toon(gegevens, { stand: { status: 'fout', fout: FOUT_BK } });
    expect(html).toContain('role="alert"');
    expect(tekstVan(html)).toContain(FOUT_BK);
    expect(tekstVan(html)).toContain('Opnieuw proberen');
    expect(primaireKnop(html).uit).toBe(true);
  });

  it('beschadigde bestanden: de zin van de lader, want opnieuw proberen helpt dan niet', () => {
    const html = toon(gegevens, { stand: { status: 'fout', fout: FOUT_BK_BESCHADIGD } });
    expect(tekstVan(html)).toContain(FOUT_BK_BESCHADIGD);
    expect(tekstVan(html)).not.toContain(FOUT_BK);
  });

  it('een andere fout van de lader toont de standaardzin FOUT_BK', () => {
    const html = toon(gegevens, { stand: { status: 'fout', fout: 'iets onverwachts' } });
    expect(tekstVan(html)).toContain(FOUT_BK);
    expect(tekstVan(html)).not.toContain('iets onverwachts');
  });
});

// ── Wat de leerkracht uitvinkt ──────────────────────────────────────────────

describe('een beroepskwalificatie uitvinken', () => {
  const gegevens = gegevensVoor([], []);

  it('de teller en de titel volgen de keuze: nog één beroepskwalificatie en haar titel als vak', () => {
    const html = toon(gegevens, { wachtrij: [new Set(['BK-0464-1'])] });
    const t = tekstVan(html);
    expect(t).toContain('Je koos 12 competenties uit 1 beroepskwalificatie.');
    expect((html.match(/type="checkbox"[^>]*checked/g) ?? []).length).toBe(1);
    expect(html).toContain(`value="${titelsVoorBkGaten(INFO, KEUZE_3, ['Onthaalmedewerker']).cursus}"`);
    expect(html).toContain('value="Onthaalmedewerker');
  });

  it('niets gekozen: "Je koos nog geen competenties." en de voet "Nog nodig: minstens één competentie."', () => {
    const html = toon(gegevens, { wachtrij: [new Set(['BK-0390-2', 'BK-0464-1'])] });
    expect(tekstVan(html)).toContain('Je koos nog geen competenties.');
    const knop = primaireKnop(html);
    expect(knop.uit).toBe(true);
    expect(html).toContain(`<p id="${knop.beschrijft}" class="gt-nodig">Nog nodig: minstens één competentie.</p>`);
  });

  it('een eigen titel die leeg is: "Nog nodig: een titel."', () => {
    const html = toon(gegevens, { wachtrij: [undefined, undefined, '  '] });
    const knop = primaireKnop(html);
    expect(knop.uit).toBe(true);
    expect(html).toContain('class="gt-nodig">Nog nodig: een titel.</p>');
  });
});

// ── Een cursus die je al hebt ───────────────────────────────────────────────

describe('"In een cursus die je al hebt"', () => {
  // Cursus X: leerplan met 8 van de 12 competenties van Onthaalmedewerker, nog geen sectie (alles staat open), hele graad.
  const lpX = leerplan(ONTHAAL, ONTHAAL_IDS.slice(0, 8), DG_GRAAD);
  const cursusX = cursus('Onthaal in de graad', lpX, DG_GRAAD, 'leeg');
  // Cursus Y: Recreatief medewerker, alle 13 op een sectie: niets daarvan staat nog open, dus geen kandidaat.
  const lpY = leerplan(RECREATIEF, RECREATIEF_IDS, DG_3);
  const cursusY = cursus('Recreatie 3de jaar', lpY, DG_3, 'geraamte');
  const gegevens = gegevensVoor([cursusX, cursusY], [lpX, lpY]);

  it('de vertrekpunten kloppen: 25 - 13 = 12 competenties staan nog open, in cursus X staan er 8', () => {
    expect(gegevens.dekking.rijen.filter((r) => r.status === 'open')).toHaveLength(12);
    expect(gegevens.dekking.rijen.filter((r) => r.status === 'gepland')).toHaveLength(13);
  });

  it('de cursus met passende competenties staat in de lijst, met haar jaar en hoeveel er in haar leerplan staan', () => {
    const html = toon(gegevens, { wachtrij: [undefined, 'bestaand', undefined, cursusX.id] });
    const t = tekstVan(html);
    expect(t).toContain('Welke cursus?');
    expect(t).toContain('Onthaal in de graad hele graad · 8 van de 12 gekozen competenties staan in haar leerplan');
    expect(html).not.toContain('Recreatie 3de jaar');
    // De andere cursus (Recreatief, alles gepland) heeft geen van de gekozen competenties in haar leerplan.
    expect(t).toContain('1 andere cursus van deze richting volgt geen beroepskwalificatie of heeft geen van deze competenties in haar leerplan.');
  });

  it('niet alle gekozen competenties staan in het leerplan: de voorbeeldzin zonder link, en de knop zet er maar 8', () => {
    const html = toon(gegevens, { wachtrij: [undefined, 'bestaand', undefined, cursusX.id] });
    const t = tekstVan(html);
    expect(t).toContain('4 gekozen competenties staan niet in het leerplan van ‘Onthaal in de graad’ en komen er niet bij: Boosterz past een leerplan nooit zelf aan. Zet ze in een nieuwe cursus.');
    expect(html).not.toContain('<a ');
    expect(primaireKnop(html)).toEqual({ tekst: 'Zet de 8 competenties in deze cursus', uit: false, beschrijft: null });
    // Het voorbeeld staat in een live-gebied.
    expect(html).toContain('class="gt-voorbeeld" aria-live="polite" aria-atomic="true"');
  });

  it('zonder gekozen cursus: de knop "Zet ze in deze cursus" staat op aria-disabled met "Nog nodig: een cursus."', () => {
    const html = toon(gegevens, { wachtrij: [undefined, 'bestaand'] });
    const knop = primaireKnop(html);
    expect(knop).toMatchObject({ tekst: 'Zet ze in deze cursus', uit: true });
    expect(html).toContain(`<p id="${knop.beschrijft}" class="gt-nodig">Nog nodig: een cursus.</p>`);
    expect(tekstVan(html)).not.toContain('staan niet in het leerplan');
  });

  it('alle gekozen competenties staan in het leerplan: "Alle 4 gekozen competenties staan in het leerplan van …" en de knop "Zet ze in deze cursus"', () => {
    // Cursus Z: leerplan met precies de laatste 4 van Onthaalmedewerker; alleen die 4 zijn gekozen.
    const lpZ = leerplan(ONTHAAL, ONTHAAL_IDS.slice(8), DG_3);
    const cursusZ = cursus('Het laatste stukje', lpZ, DG_3, 'leeg');
    const g = gegevensVoor([cursusX, cursusY, cursusZ], [lpX, lpY, lpZ]);
    // Wat nog open staat: Onthaalmedewerker 12 - 0 (X en Z hebben geen secties) = 12. Kies alleen Onthaalmedewerker: 12 gekozen.
    const html = toon(g, { wachtrij: [new Set(['BK-0464-1']), 'bestaand', undefined, cursusZ.id] });
    const t = tekstVan(html);
    expect(t).toContain('Het laatste stukje 3de jaar · 4 van de 12 gekozen competenties staan in haar leerplan');
    expect(t).toContain('8 gekozen competenties staan niet in het leerplan van ‘Het laatste stukje’');
    expect(primaireKnop(html).tekst).toBe('Zet de 4 competenties in deze cursus');
  });

  it('één gekozen competentie die in het leerplan staat: enkelvoud', () => {
    const lpE = leerplan(ONTHAAL, ONTHAAL_IDS.slice(0, 1), DG_3);
    const cursusE = cursus('Eén competentie', lpE, DG_3, 'leeg');
    // Alleen Onthaalmedewerker's eerste competentie staat open (de rest staat gepland door cursus V).
    const lpV = leerplan(ONTHAAL, ONTHAAL_IDS.slice(1), DG_3);
    const cursusV = cursus('De rest', lpV, DG_3, 'geraamte');
    const g = gegevensVoor([cursusE, cursusV, cursusY], [lpE, lpV, lpY]);
    expect(g.dekking.rijen.filter((r) => r.status === 'open')).toHaveLength(1);
    const html = toon(g, { wachtrij: [undefined, 'bestaand', undefined, cursusE.id] });
    const t = tekstVan(html);
    expect(t).toContain('Je koos 1 competentie uit 1 beroepskwalificatie.');
    expect(t).toContain('Onthaalmedewerker · 1 competentie');
    expect(t).toContain('3de jaar · De gekozen competentie staat in haar leerplan');
    expect(t).toContain('De gekozen competentie staat in het leerplan van ‘Eén competentie’. Ze komt er als lege sectie bij, met de kennis en vaardigheden; wat al in de cursus staat, blijft zoals het is.');
    expect(primaireKnop(html).tekst).toBe('Zet ze in deze cursus');
  });

  it('een cursus met minimumdoelen is nooit kandidaat (I6): ze telt bij "andere cursussen"', () => {
    const lpMd = {
      id: 'lp-md', title: 'Leerplan met minimumdoelen', net: 'minimumdoelen', subject: '', level: '', kind: 'leerplan', createdAt: 1, updatedAt: 1,
      goals: [{ id: 'g1', code: 'B01', text: 'Een doel', refs: [{ set: 'ODS_9101', id: 'b1', code: 'B01' }] }],
    } as unknown as Curriculum;
    const cursusMd = cursus('Een cursus met minimumdoelen', lpMd, DG_3, 'leeg');
    const g = gegevensVoor([cursusX, cursusMd], [lpX, lpMd]);
    const html = toon(g, { wachtrij: [undefined, 'bestaand', undefined, cursusX.id] });
    const t = tekstVan(html);
    expect(t).not.toContain('Een cursus met minimumdoelen hele graad');
    expect(t).not.toContain('Een cursus met minimumdoelen 3de jaar');
    expect(t).toContain('1 andere cursus van deze richting volgt geen beroepskwalificatie of heeft geen van deze competenties in haar leerplan.');
  });

  it('geen competentiecode, ADV-nummer, groepnummer of set-id', () => {
    const html = toon(gegevens, { wachtrij: [undefined, 'bestaand', undefined, cursusX.id] });
    expect(tekstVan(html)).not.toMatch(CODE_OP_SCHERM);
  });
});

// ── Wat het venster nog meer zegt ───────────────────────────────────────────

describe('hints, fouten en de voet', () => {
  const basis = gegevensVoor([], []);

  it('"Tel mee: alleen het jaar": de zin over het jaar', () => {
    expect(tekstVan(toon({ ...basis, telJaar: 3 }))).toContain('Je telt nu alleen de cursussen van het 3de jaar.');
    expect(tekstVan(toon(basis))).not.toContain('Je telt nu alleen');
  });

  it('competenties die meetellen met de versie van nu: de zin van `bkAndereVersieTekst`', () => {
    const t = tekstVan(toon({ ...basis, dekking: { ...basis.dekking, zelfdeNummerAndereSet: 3 } }));
    expect(t).toContain('3 competenties zouden meetellen als je cursus de versie van nu volgde. Maak een leerplan met de versie van nu bij ‘Beroepskwalificaties’.');
    expect(tekstVan(toon(basis))).not.toContain('zouden meetellen');
  });

  it('beroepskwalificaties zonder bestand: "Van 1 beroepskwalificatie staan de competenties nog niet in Boosterz: …"', () => {
    const extra = { bk: 'BK-9999-1', nummer: 'BK-9999', versie: 1, titel: 'Zonder bestand', onderdelen: [1], alleOnderdelen: true, zonderBestand: true } as RichtingBkRegel;
    const kader: RichtingBk = { ...KADER, bks: [...KADER.bks, extra] };
    const t = tekstVan(toon({ ...basis, kader }));
    expect(t).toContain('Van 1 beroepskwalificatie staan de competenties nog niet in Boosterz: die kan je nog niet plannen.');
    expect(tekstVan(toon(basis))).not.toContain('staan de competenties nog niet in Boosterz');
  });

  it('een probleem staat in een callout met role="alert", focusbaar, en met zijn tekst', () => {
    const html = toon(basis, { wachtrij: [undefined, undefined, undefined, undefined, { tekst: BK_FOUT_VERANDERD }] });
    expect(html).toContain('<div class="callout err gt-melding" role="alert" tabindex="-1">');
    expect(tekstVan(html)).toContain('De beroepskwalificaties zijn intussen veranderd. Sluit dit venster en probeer opnieuw. Er is niets bewaard.');
    expect(tekstVan(toon(basis))).not.toContain('Er is niets bewaard');
  });

  it('na een geslaagde nieuwe cursus: "De cursus wordt geopend…" en de knop kan niet meer', () => {
    const html = toon(basis, { wachtrij: [undefined, undefined, undefined, undefined, undefined, true] });
    expect(html).toContain('<p class="gt-nodig" role="status">De cursus wordt geopend…</p>');
    expect(primaireKnop(html).uit).toBe(true);
  });

  // Geeft de Vlaamse overheid een gekozen beroepskwalificatie niet meer, dan geeft `leerplanVoorBkGaten` een zin mee in
  // `waarschuwingen` (getest in `bkGatenHulp.test.ts`). De cursus is dan al bewaard, maar opent pas als de leerkracht doorklikt.
  describe('na een nieuwe cursus met een waarschuwing', () => {
    const zin = 'De Vlaamse overheid geeft ‘Onthaalmedewerker’ (BK-0390-2) niet meer. Het leerplan gebruikt de laatst bekende competenties.';
    const gemaakt = 'Cursus gemaakt: 1 hoofdstuk, 25 competenties klaar op de secties.';
    const uitslag = { bewaard: gemaakt, waarschuwing: zin, cursusId: 'c-nieuw' };
    const leeg = [undefined, undefined, undefined, undefined, undefined, undefined];

    it('de melding staat in een callout met role="status", focusbaar, met de zin van het gelukken en de waarschuwing', () => {
      const html = toon(basis, { wachtrij: [...leeg, uitslag] });
      expect(html).toContain('<div class="callout warn gt-melding" role="status" tabindex="-1">');
      const t = tekstVan(html);
      expect(t).toContain(`${gemaakt} ${zin}`);
      expect(t).not.toMatch(/bkc\d|ADV-|G-\d|ODS_/);
    });

    it('het formulier is verborgen en de voet heeft "Nu niet" en "Open de cursus", zonder "Annuleren" en "Maak de cursus"', () => {
      const html = toon(basis, { wachtrij: [...leeg, uitslag] });
      expect(html).toContain('<div hidden="">');
      expect(html).toContain('>Nu niet</button>');
      expect(html).not.toContain('>Annuleren</button>');
      expect(html).not.toContain('Maak de cursus');
      expect(html).not.toContain('Nog nodig');
      expect(primaireKnop(html)).toEqual({ tekst: 'Open de cursus', uit: false, beschrijft: null });
    });

    it('zodra de cursus opent: "De cursus wordt geopend…" en de knop kan niet meer', () => {
      const html = toon(basis, { wachtrij: [undefined, undefined, undefined, undefined, undefined, true, uitslag] });
      expect(html).toContain('<p class="gt-nodig" role="status">De cursus wordt geopend…</p>');
      expect(primaireKnop(html)).toMatchObject({ tekst: 'Open de cursus', uit: true });
    });

    it('zonder waarschuwing is er niets van dit alles: geen melding, geen verborgen formulier', () => {
      const html = toon(basis);
      expect(html).not.toContain('callout warn');
      expect(html).not.toContain('hidden=""');
      expect(html).not.toContain('Open de cursus');
      expect(primaireKnop(html).tekst).toBe('Maak de cursus');
    });
  });
});

// ── Wat het venster wel en niet mag doen (bron) ─────────────────────────────

describe('het venster bewaart alleen via de vaste functies (I1) en laat GatenVenster ongemoeid', () => {
  const bron = readFileSync(join(HIER, 'BkGatenVenster.tsx'), 'utf8');
  // Zonder commentaar: wat er in staat, telt.
  const code = bron.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('bewaren gaat via bewaarNieuweGatenCursus en bewaarGatenOpCursus, met de opslag als argument', () => {
    expect(code).toContain('bewaarNieuweGatenCursus(');
    expect(code).toContain('bewaarGatenOpCursus(');
    expect(code).toMatch(/const OPSLAG: GatenOpslag = \{ saveCurriculum, deleteCurriculum, saveCourse, getCourse, saveCourseGuarded \};/);
  });

  it('geen rechtstreekse schrijfactie: geen aanroep van saveCurriculum, saveCourse, saveCourseGuarded of deleteCurriculum', () => {
    expect(code).not.toMatch(/\b(saveCurriculum|saveCourse|saveCourseGuarded|deleteCurriculum)\(/);
  });

  it('een leerplan wordt nooit aangepast: de enige weg naar een leerplan is leerplanVoorBkGaten', () => {
    expect(code).toContain('leerplanVoorBkGaten(');
    expect(code).not.toMatch(/leerplanUitBk|vindBkLeerplan|selectieVanBkLeerplan|\.goals\s*=|goals\.push/);
  });

  it('de cursus opent op één plek (`openCursus`); een waarschuwing van het leerplan stopt dat tot de leerkracht doorklikt', () => {
    expect(code.match(/\bnavigate\(/g)).toHaveLength(1);
    expect(code).toContain("const waarschuwing = (r.waarschuwingen ?? []).join(' ').trim();");
    expect(code).toContain('setUitslag({ bewaard: gemaakt, waarschuwing, cursusId: cursus.id });');
    expect(code).toContain('onClose={uitslag ? onGepland : onClose}');
  });

  it('"Opnieuw proberen" zet de focus eerst op het eerste vakje, want de foutmelding en haar knop verdwijnen', () => {
    expect(code).toMatch(/const opnieuwProberen = \(\) => \{\s*document\.getElementById\(idEersteSet\)\?\.focus\(\);\s*laadOpnieuw\(\);\s*\};/);
    expect(code).toContain('onOpnieuw={opnieuwProberen}');
    expect(code).not.toContain('onOpnieuw={laadOpnieuw}');
  });

  it('de competenties komen via bkGeraamte en bkVerwijzingen, nooit via geraamteHoofdstukken of de refs van minimumdoelen', () => {
    expect(code).toContain('bkGeraamte(');
    expect(code).toContain('bkVerwijzingen');
    expect(code).not.toContain('geraamteHoofdstukken');
    expect(code).not.toMatch(/from '\.\.\/GatenVenster'|from '\.\.\/\.\.\/richting\/GatenVenster'/);
  });
});
