// De brug van een doelenlijst naar een cursus op het scherm (docs/LEERPLANNEN.md § 16.4 en § 16.5, pakket S-B): het paneel
// `NaBewaren`, het blok `GebruikInCursus`, de twee knoppen `CursusBrugKnoppen` en de twee vensters `NieuweCursusMetLeerplan` en
// `KoppelAanCursus`. Een server-render kent geen klik en geen effecten. Daarom vervangt `mock.wachtrij` de eerste
// `useState`-aanroepen van de render, in de volgorde van het bestand (zoals in BkCursusDekking.test.ts): zo staat de titel leeg,
// is een cursus gekozen of staat een melding open. Het venster zelf (`Modal`, een portal) is een gewone div met de kop, de inhoud
// en de voet. Het bewaren en koppelen staan getest in `cursusBrug.test.ts`; hier staat wat het scherm zegt en wat het toegankelijk
// maakt.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCourse } from '../../../lib/courses';
import type { Course } from '../../../lib/courseTypes';
import { createCurriculum } from '../../../lib/curriculum';
import type { Curriculum } from '../../../lib/curriculumTypes';
import * as T from '../../../lib/cursusBrugTeksten';
import { cursusVoorRichting } from '../../../lib/richtingCursus';

// ── Wat van buiten komt: de staat van een render, de AI-sleutel, de opslag en de portal ──

const mock = vi.hoisted(() => ({
  /** De waarden voor de eerste `useState`-aanroepen van de render; `undefined` laat die aanroep echt lopen. */
  wachtrij: [] as unknown[],
  sleutel: false,
  cursussen: [] as unknown[],
  leerplannen: [] as unknown[],
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

vi.mock('../../../lib/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/ai')>()),
  hasAIKey: () => mock.sleutel,
}));

vi.mock('../../../lib/courses', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/courses')>()),
  getCourses: () => mock.cursussen,
}));

vi.mock('../../../lib/curriculum', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/curriculum')>()),
  getCurricula: () => mock.leerplannen,
}));

// Een portal bestaat niet op de server: het venster is hier een gewone div met de kop, de inhoud en de voet.
vi.mock('../../ui', async (importOriginal) => {
  const echt = await importOriginal<typeof import('../../ui')>();
  const { createElement: maak } = await import('react');
  return {
    ...echt,
    useToast: () => () => {},
    Modal: ({ title, children, footer }: { title: string; children: unknown; footer?: unknown }) =>
      maak('div', { role: 'dialog', 'aria-label': title }, maak('h2', null, title), children as never, footer as never),
  };
});

import { CursusBrugKnoppen } from './CursusBrugKnoppen';
import { GebruikInCursus, toonGebruikInCursus } from './GebruikInCursus';
import { KoppelAanCursus } from './KoppelAanCursus';
import { NaBewaren } from './NaBewaren';
import { NieuweCursusMetLeerplan } from './NieuweCursusMetLeerplan';

// ── Fixtures ────────────────────────────────────────────────────────────────

function lijst(titel = 'Basisgeletterdheid · 1ste graad A-stroom', n = 10, extra: Partial<Curriculum> = {}): Curriculum {
  return createCurriculum({
    title: titel, net: 'minimumdoelen', subject: '', level: '',
    goals: Array.from({ length: n }, (_, i) => ({
      id: `g${i}`, code: `BG01.${String(i + 1).padStart(2, '0')}`, text: `Doel ${i + 1}.`, theme: 'Nederlands › Lezen',
    })),
    ...extra,
  });
}

const LIJST = lijst();

function cursus(titel: string, lp: Curriculum | undefined, gemaakt: number): Course {
  const basis = lp
    ? cursusVoorRichting({ titel, auteur: '', leerplan: lp, start: 'geraamte' })
    : createCourse(titel);
  return { ...basis, createdAt: gemaakt, updatedAt: gemaakt };
}

function render(element: unknown, wachtrij: unknown[] = []): string {
  mock.wachtrij = wachtrij;
  try {
    return renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, element as never));
  } finally {
    mock.wachtrij = [];
  }
}

/** Zonder tags en met één spatie tussen woorden, om een zin terug te vinden. */
const platte = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

/** Het openingstag van het eerste element dat deze tekst bevat. */
function knop(html: string, tekst: string): string {
  const m = new RegExp(`<button[^>]*>(?:(?!</button>).)*${tekst.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 's').exec(html);
  if (!m) throw new Error(`knop "${tekst}" niet gevonden`);
  return m[0];
}

beforeEach(() => {
  mock.wachtrij = [];
  mock.sleutel = false;
  mock.cursussen = [];
  mock.leerplannen = [];
});

// ── NaBewaren (§ 16.4) ──────────────────────────────────────────────────────

describe('NaBewaren', () => {
  const html = render(createElement(NaBewaren, { leerplan: LIJST, nagekeken: true }));

  it('heeft een h2 "Je lijst is bewaard" met focus-mogelijkheid, en geen h1 of main', () => {
    expect(html).toMatch(/<h2 id="cb-kop" class="cb-kop" tabindex="-1">Je lijst is bewaard<\/h2>/);
    expect(html).toContain('aria-labelledby="cb-kop"');
    expect(html).not.toContain('<h1');
    expect(html).not.toContain('<main');
    expect((html.match(/<h2/g) ?? []).length).toBe(1);
  });

  it('zegt dat de lijst bij Leerplannen staat, met het aantal doelen en "nagekeken"', () => {
    expect(platte(html)).toContain(
      '‘Basisgeletterdheid · 1ste graad A-stroom’ staat bij Leerplannen, met 10 doelen, nagekeken. '
      + 'Hang ze nu aan een cursus: dan zie je in de cursus welke doelen ze dekt.',
    );
  });

  it('heeft de twee knoppen, de eerste primair, en geen disabled', () => {
    expect(knop(html, 'Maak een cursus met deze doelen')).toContain('btn btn-primary');
    expect(knop(html, 'Gebruik ze in een cursus die je al hebt')).toContain('btn btn-ghost');
    expect(html).not.toContain('disabled');
  });

  it('heeft de link "Naar je leerplannen" naar het leerplan, en zonder richting geen weg terug', () => {
    expect(html).toContain(`<a href="/leerplannen?open=${LIJST.id}">Naar je leerplannen</a>`);
    expect(html).not.toContain('Terug naar de studierichting');
  });

  it('met een richting staat "Terug naar de studierichting" erbij, naar het pad van de richting', () => {
    const metRichting = render(createElement(NaBewaren, {
      leerplan: LIJST, nagekeken: true, richtingPad: '/cursussen/richtingen/G-0193?jaar=4',
    }));
    expect(metRichting).toContain('<a href="/cursussen/richtingen/G-0193?jaar=4">Terug naar de studierichting</a>');
    expect(metRichting).toContain('Naar je leerplannen');
  });

  it('enkelvoud, en zonder ", nagekeken" als de lijst niet nagekeken is', () => {
    const een = platte(render(createElement(NaBewaren, { leerplan: lijst('Mijn lijst', 1), nagekeken: false })));
    expect(een).toContain('‘Mijn lijst’ staat bij Leerplannen, met 1 doel. Hang ze nu aan een cursus');
    expect(een).not.toContain('nagekeken');
  });

  it('zet een titel met speciale tekens veilig op het scherm', () => {
    const html2 = render(createElement(NaBewaren, { leerplan: lijst('<b>Fout</b> & "klaar"', 2), nagekeken: true }));
    expect(html2).not.toContain('<b>Fout</b>');
    expect(html2).toContain('&lt;b&gt;Fout&lt;/b&gt; &amp; &quot;klaar&quot;');
  });

  it('noemt nergens een set-id (het pad van de richting zelf mag een groepnummer bevatten)', () => {
    expect(render(createElement(NaBewaren, { leerplan: LIJST, nagekeken: true }))).not.toMatch(/ODS_\d|G-\d/);
  });
});

// ── GebruikInCursus (§ 16.5, pagina Leerplannen) ────────────────────────────

describe('GebruikInCursus', () => {
  const html = render(createElement(GebruikInCursus, { leerplan: LIJST }));

  it('heeft een h3 "Gebruik in een cursus", de zin en dezelfde twee knoppen', () => {
    expect(html).toMatch(/<h3[^>]*>Gebruik in een cursus<\/h3>/);
    expect(platte(html)).toContain('Hang deze doelen aan een cursus: dan zie je in de cursus welke doelen ze dekt.');
    expect(knop(html, 'Maak een cursus met deze doelen')).toContain('btn-primary');
    expect(knop(html, 'Gebruik ze in een cursus die je al hebt')).toContain('btn-ghost');
  });

  it('is een groep met een naam (aria-labelledby wijst naar de kop)', () => {
    const kopId = /<h3 id="([^"]+)"/.exec(html)?.[1];
    expect(kopId).toBeTruthy();
    expect(html).toContain(`aria-labelledby="${kopId}"`);
  });

  it('staat er bij een leerplan met minstens één doel, niet bij een leerplan zonder doelen', () => {
    expect(toonGebruikInCursus(lijst('Met doelen', 1))).toBe(true);
    expect(toonGebruikInCursus(lijst('Zonder doelen', 0))).toBe(false);
  });

  it('staat er niet bij een leerplan met de competenties van een beroepskwalificatie', () => {
    const bk = lijst('Competenties', 3, { herkomst: { methode: 'beroepskwalificatie' } as Curriculum['herkomst'] });
    expect(toonGebruikInCursus(bk)).toBe(false);
  });
});

// ── CursusBrugKnoppen ───────────────────────────────────────────────────────

describe('CursusBrugKnoppen', () => {
  it('toont twee knoppen van type button en geen melding of venster', () => {
    const html = render(createElement(CursusBrugKnoppen, { leerplan: LIJST }));
    expect((html.match(/<button/g) ?? []).length).toBe(2);
    expect(html.match(/<button[^>]*>/g)?.every((b) => b.includes('type="button"'))).toBe(true);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('aria-busy');
  });

  it('als het laden mislukt: de melding (role="alert") met een knop om de pagina te herladen', () => {
    const html = render(createElement(CursusBrugKnoppen, { leerplan: LIJST }), [null, null, true]);
    expect(html).toContain('role="alert"');
    expect(platte(html)).toContain('Dit kon niet geladen worden. Controleer je verbinding en probeer opnieuw.');
    expect(platte(html)).toContain('Herlaad de pagina');
    // De twee knoppen blijven staan.
    expect(html).toContain('Maak een cursus met deze doelen');
    expect(html).toContain('Gebruik ze in een cursus die je al hebt');
  });

  it('terwijl een venster laadt, zegt alleen die knop aria-busy', () => {
    const html = render(createElement(CursusBrugKnoppen, { leerplan: LIJST }), [null, 'koppel']);
    expect(knop(html, 'Maak een cursus met deze doelen')).not.toContain('aria-busy');
    expect(knop(html, 'Gebruik ze in een cursus die je al hebt')).toContain('aria-busy="true"');
  });
});

// ── NieuweCursusMetLeerplan (§ 16.5) ────────────────────────────────────────

describe('NieuweCursusMetLeerplan', () => {
  const props = { leerplan: LIJST, onClose: () => {} };

  it('heeft de titel van het venster als h2 en de titel van de lijst vooraf ingevuld', () => {
    const html = render(createElement(NieuweCursusMetLeerplan, props));
    expect(html).toContain('<h2>Nieuwe cursus met deze doelen</h2>');
    expect(html).toContain('aria-label="Nieuwe cursus met deze doelen"');
    expect(html).toMatch(/<label for="cb-nieuw-titel">Titel van de cursus<\/label>/);
    expect(html).toContain('value="Basisgeletterdheid · 1ste graad A-stroom"');
    expect(html).toContain('aria-required="true"');
    expect(html).not.toContain('<h1');
  });

  it('heeft een groep "Hoe begin je?" met drie keuzerondjes in de stijl van het venster van de richting', () => {
    const html = render(createElement(NieuweCursusMetLeerplan, props));
    expect(html).toMatch(/<legend>Hoe begin je\?<\/legend>/);
    expect((html.match(/type="radio"/g) ?? []).length).toBe(3);
    expect((html.match(/class="rc-keuze"/g) ?? []).length).toBe(3);
    for (const t of ['Met een geraamte', 'Met een lege cursus', 'Laat de AI een eerste versie maken']) expect(html).toContain(t);
    const platteHtml = platte(html);
    expect(platteHtml).toContain('Een hoofdstuk per set en een sectie per rubriek, met de doelcodes al op de secties. Je vult ze daarna zelf in.');
    expect(platteHtml).toContain('De cursus hangt aan je lijst. Je zet de doelcodes zelf op je secties.');
  });

  it('"Met een geraamte" staat standaard aan', () => {
    const html = render(createElement(NieuweCursusMetLeerplan, props));
    const radios = html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(3);
    expect(radios[0]).toContain('checked');
    expect(radios[1]).not.toContain('checked');
    expect(radios[2]).not.toContain('checked');
  });

  it('zonder AI-sleutel: de AI-keuze is aria-disabled (niet disabled), met de uitleg en een link naar de AI-instellingen', () => {
    mock.sleutel = false;
    const html = render(createElement(NieuweCursusMetLeerplan, props));
    const radios = html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
    expect(radios[2]).toContain('aria-disabled="true"');
    expect(radios[2]).not.toMatch(/\sdisabled/);
    expect(platte(html)).toContain('Nog geen AI-sleutel ingesteld.');
    expect(html).toContain('<a href="/ai-instellingen">AI-instellingen</a>');
    expect(platte(html)).not.toContain('Met je eigen AI-sleutel.');
  });

  it('met een AI-sleutel: de AI-keuze kan, met "Met je eigen AI-sleutel."', () => {
    mock.sleutel = true;
    const html = render(createElement(NieuweCursusMetLeerplan, props));
    const radios = html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
    expect(radios[2]).not.toContain('aria-disabled');
    expect(platte(html)).toContain('Met je eigen AI-sleutel.');
    expect(html).not.toContain('/ai-instellingen');
  });

  it('de voet heeft "Annuleren" en "Maak de cursus", en met een titel staat er niets geblokkeerd', () => {
    const html = render(createElement(NieuweCursusMetLeerplan, props));
    expect(knop(html, 'Annuleren')).toContain('btn-ghost');
    expect(knop(html, 'Maak de cursus')).toContain('btn-primary');
    expect(knop(html, 'Maak de cursus')).not.toContain('aria-disabled');
    expect(html).not.toContain('Nog nodig');
  });

  it('zolang de titel leeg is: "Maak de cursus" is aria-disabled en wijst naar "Nog nodig: een titel."', () => {
    const html = render(createElement(NieuweCursusMetLeerplan, props), ['  ']);
    const k = knop(html, 'Maak de cursus');
    expect(k).toContain('aria-disabled="true"');
    expect(k).toContain('aria-describedby="cb-nieuw-nodig"');
    expect(k).not.toMatch(/\sdisabled/);
    expect(html).toMatch(/<p id="cb-nieuw-nodig" class="rc-nodig">Nog nodig: een titel\.<\/p>/);
  });

  it('een probleem staat in een melding met role="alert" en kan de focus krijgen', () => {
    const html = render(createElement(NieuweCursusMetLeerplan, props), [undefined, undefined, T.FOUT_CURSUS_NIET_BEWAARD]);
    expect(html).toMatch(/<div class="callout err rc-melding" role="alert" tabindex="-1">/);
    expect(platte(html)).toContain('Er is niets bewaard: de opslag van dit toestel is vol of geblokkeerd.');
  });

  it('als de cursus klaar is, is de knop geblokkeerd tegen een tweede klik', () => {
    const html = render(createElement(NieuweCursusMetLeerplan, props), [undefined, undefined, undefined, true]);
    expect(knop(html, 'Maak de cursus')).toContain('aria-disabled="true"');
  });

  it('noemt nergens een set-id of groepnummer', () => {
    expect(render(createElement(NieuweCursusMetLeerplan, props))).not.toMatch(/ODS_\d|G-\d/);
  });
});

// ── KoppelAanCursus (§ 16.5) ────────────────────────────────────────────────

describe('KoppelAanCursus', () => {
  const ANDER = lijst('Een ander leerplan', 4);
  const props = { leerplan: LIJST, onClose: () => {}, onMaakCursus: () => {} };

  function met(cursussen: Course[], leerplannen: Curriculum[] = [LIJST, ANDER]) {
    mock.cursussen = cursussen;
    mock.leerplannen = leerplannen;
  }

  it('zonder cursussen: de zin en de knop "Maak een cursus met deze doelen", en geen "Koppel"-knop', () => {
    met([]);
    const html = render(createElement(KoppelAanCursus, props));
    expect(html).toContain('<h2>Gebruik deze doelen in een cursus</h2>');
    expect(platte(html)).toContain('Je hebt nog geen cursussen op dit toestel.');
    expect(knop(html, 'Maak een cursus met deze doelen')).toContain('btn-primary');
    expect(html).not.toContain('Koppel aan deze cursus');
    expect(html).not.toContain('<fieldset');
    expect(html).toContain('Annuleren');
  });

  it('met cursussen: een fieldset "Welke cursus?" met een keuzerondje per cursus, nieuwste eerst', () => {
    met([cursus('Oudste', undefined, 100), cursus('Nieuwste', undefined, 300), cursus('Midden', undefined, 200)]);
    const html = render(createElement(KoppelAanCursus, props));
    expect(html).toMatch(/<legend>Welke cursus\?<\/legend>/);
    expect((html.match(/type="radio"/g) ?? []).length).toBe(3);
    const titels = [...html.matchAll(/cb-cursus-titel">([^<]+)</g)].map((m) => m[1]);
    expect(titels).toEqual(['Nieuwste', 'Midden', 'Oudste']);
  });

  it('zegt onder elke cursus waar ze aan hangt, en hoeveel doelcodes in de lijst staan', () => {
    const zonder = cursus('Zonder leerplan', undefined, 100);
    const metAnder = cursus('Met ander leerplan', ANDER, 200);
    const metDeze = cursus('Met deze lijst', LIJST, 300);
    // Van de doelcodes van "Met ander leerplan" (BG01.01 tot BG01.04) staan alle vier in de lijst van tien.
    met([zonder, metAnder, metDeze]);
    const platteHtml = platte(render(createElement(KoppelAanCursus, props)));
    expect(platteHtml).toContain('Nog geen leerplan');
    expect(platteHtml).toContain('Hangt nu aan ‘Een ander leerplan’');
    expect(platteHtml).toContain('Hangt al aan deze lijst');
    expect(platteHtml).toContain('4 van de 4 doelcodes in deze cursus staan in je lijst.');
    expect(platteHtml).toContain('10 van de 10 doelcodes in deze cursus staan in je lijst.');
    // De cursus zonder doelcodes krijgt de regel niet.
    expect((platteHtml.match(/doelcodes? in deze cursus/g) ?? []).length).toBe(2);
  });

  it('zonder keuze: "Koppel aan deze cursus" is aria-disabled en wijst naar "Nog nodig: een cursus."', () => {
    met([cursus('Eén', undefined, 100)]);
    const html = render(createElement(KoppelAanCursus, props));
    const k = knop(html, 'Koppel aan deze cursus');
    expect(k).toContain('aria-disabled="true"');
    expect(k).toContain('aria-describedby="cb-koppel-nodig"');
    expect(k).not.toMatch(/\sdisabled/);
    expect(html).toMatch(/<p id="cb-koppel-nodig" class="rc-nodig">Nog nodig: een cursus\.<\/p>/);
    expect(html).not.toContain('Deze cursus hangt nu aan');
  });

  it('met een gekozen cursus zonder leerplan: geen melding en de knop is bruikbaar', () => {
    const c = cursus('Eén', undefined, 100);
    met([c]);
    const html = render(createElement(KoppelAanCursus, props), [undefined, c.id]);
    expect(knop(html, 'Koppel aan deze cursus')).not.toContain('aria-disabled');
    expect(html).not.toContain('Nog nodig');
    expect(html).not.toContain('Deze cursus hangt nu aan');
    expect(html).toMatch(/<input[^>]*checked[^>]*>|<input[^>]*type="radio"[^>]*checked/);
  });

  it('met een gekozen cursus van een ander leerplan: de melding onder die cursus, in een plek die voorgelezen wordt', () => {
    const c = cursus('Biologie 4de jaar', ANDER, 100);
    met([c]);
    const html = render(createElement(KoppelAanCursus, props), [undefined, c.id]);
    expect(html).toMatch(/<\/label><div class="cb-melding-rij" aria-live="polite" aria-atomic="true"><div class="callout warn rc-melding">/);
    expect((html.match(/callout warn/g) ?? []).length).toBe(1);
    expect(platte(html)).toContain(
      'Deze cursus hangt nu aan ‘Een ander leerplan’. Kies je deze lijst, dan telt de doelendekking voortaan op '
      + '‘Basisgeletterdheid · 1ste graad A-stroom’. Wat in de cursus staat, verandert niet; doelcodes die niet in je lijst staan, '
      + 'zie je in de doelendekking.',
    );
    expect(knop(html, 'Koppel aan deze cursus')).not.toContain('aria-disabled');
  });

  it('de plek voor de melding staat onder elke cursus, ook zonder melding (zodat ze voorgelezen wordt zodra ze verschijnt)', () => {
    met([cursus('Eén', undefined, 100), cursus('Twee', ANDER, 200)]);
    const html = render(createElement(KoppelAanCursus, props));
    expect(html.match(/<div class="cb-melding-rij" aria-live="polite" aria-atomic="true"><\/div>/g)).toHaveLength(2);
  });

  it('de melding staat alleen onder de gekozen cursus, niet onder een andere cursus van een ander leerplan', () => {
    const a = cursus('Eerste', ANDER, 200);
    const b = cursus('Tweede', ANDER, 100);
    met([a, b]);
    const html = render(createElement(KoppelAanCursus, props), [undefined, b.id]);
    expect((html.match(/callout warn/g) ?? []).length).toBe(1);
    const naTweede = html.slice(html.indexOf('Tweede'));
    expect(naTweede).toContain('callout warn');
    expect(html.slice(0, html.indexOf('Tweede'))).not.toContain('callout warn');
  });

  it('hangt de gekozen cursus al aan deze lijst, dan heet de knop "Open de cursus"', () => {
    const c = cursus('Al gekoppeld', LIJST, 100);
    met([c]);
    const html = render(createElement(KoppelAanCursus, props), [undefined, c.id]);
    expect(html).toContain('Open de cursus');
    expect(html).not.toContain('Koppel aan deze cursus');
    expect(html).not.toContain('Deze cursus hangt nu aan');
  });

  it('een fout bij het koppelen staat in een melding met role="alert"', () => {
    const c = cursus('Eén', ANDER, 100);
    met([c]);
    const html = render(createElement(KoppelAanCursus, props), [undefined, c.id, T.koppelFout('gewijzigd')]);
    expect(html).toMatch(/<div class="callout err rc-melding" role="alert" tabindex="-1">/);
    expect(platte(html)).toContain('Deze cursus werd intussen elders aangepast. Er is niets veranderd. Probeer opnieuw.');
  });

  it('een cursus met een gevaarlijke titel wordt veilig getoond', () => {
    met([cursus('<img src=x onerror=alert(1)>', undefined, 100)]);
    const html = render(createElement(KoppelAanCursus, props));
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('noemt nergens een set-id of groepnummer', () => {
    met([cursus('Eén', ANDER, 100)]);
    expect(render(createElement(KoppelAanCursus, props))).not.toMatch(/ODS_\d|G-\d/);
  });
});
