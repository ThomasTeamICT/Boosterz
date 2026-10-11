// De bedrading van de sectie "Beroepskwalificaties" (docs/STUDIERICHTINGEN.md § 23.7.2) die de pure functies niet dekken:
// de waarschuwing als een onderdeel van de richting niet meer in de bron staat (`RichtingBk.onderdeelNietMeerInBron`), en
// een melding waarvan het nieuwe leerplan er al is (`MeldingBlok` met `al`). De test rendert op de server (zonder DOM), zoals
// `RichtingCursussen.test.ts`; wat pas na het laden van de bestanden komt (de kaart na een update, de melding na de klik),
// bekijkt de rooktest (tests/smoke.mjs, 20g-2).

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { BkIndex, KoppelingBestand, OnderdeelKwalificaties } from '../../../lib/beroepskwalificaties';
import { BK_HINT_ANDERE_VERSIE, BK_INTRO_UITLEG, BK_KNOP_ANDERE_VERSIE, BK_KNOP_OPEN } from '../../../lib/bkWeergave';
import type { Curriculum } from '../../../lib/curriculumTypes';
import { bkKader } from '../../../lib/richtingBk';
import { richtingInfo, type RichtingInfo, type RichtingKader, type RichtingKeuze } from '../../../lib/richtingKader';
import type { MatrixBestand } from '../../../lib/studierichtingen';
import type { RichtingContext } from '../RichtingDoelen';
import { BkSectie, MeldingBlok } from './BkSectie';
import { bkAlLeerplanVanNu, bkOnderdeelNietMeerInBron } from './bkSectieHulp';

// ── Fixtures ────────────────────────────────────────────────────────────────

const HIER = fileURLToPath(new URL('.', import.meta.url));
const lees = (pad: string): unknown => JSON.parse(readFileSync(join(HIER, '../../../../tests/fixtures', pad), 'utf8'));

const VANDAAG = '2026-10-11';
const MATRIX = lees('structuur/uit/studierichtingen.json') as MatrixBestand;
const KOPPELING = lees('kwalificaties/uit/koppeling.json') as KoppelingBestand;
const INDEX = lees('kwalificaties/uit/index.json') as BkIndex;
const INFO_8: RichtingInfo = (() => {
  const i = richtingInfo(MATRIX, 'G-0008', VANDAAG);
  if (!i) throw new Error('G-0008 ontbreekt in de structuurfixtures');
  return i;
})();
const KEUZE_8: RichtingKeuze = { groep: 'G-0008', soort: 'so', jaar: 3 };
const regex = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** De koppeling, met onderdeel 8 (waar vandaag beide BK's van G-0008 uit komen) als 'niet-gevonden' met zijn laatst bekende record. */
function koppelingZonder8(nietMeerInBron: string): KoppelingBestand {
  const k = structuredClone(KOPPELING);
  k.onderdelen = k.onderdelen.map((r): OnderdeelKwalificaties => (r.onderdeel === 8 ? { ...r, status: 'niet-gevonden', nietMeerInBron } : r));
  return k;
}

/** De sectie op de server, met het BK-kader van G-0008 (3de jaar) uit deze koppeling. De bestanden laden pas in de browser. */
function toonSectie(koppeling: KoppelingBestand): string {
  const context: RichtingContext = {
    info: INFO_8,
    keuze: KEUZE_8,
    kader: { keuze: KEUZE_8, sets: [] } as unknown as RichtingKader,
    indexSets: [],
    curricula: [],
    bk: { status: 'klaar', waarde: bkKader(koppeling, INDEX, INFO_8, KEUZE_8, VANDAAG) },
  };
  return renderToStaticMarkup(
    createElement(StaticRouter, { location: '/cursussen/richtingen/G-0008' }, createElement(BkSectie, { context, courses: [], vandaag: VANDAAG, opnieuw: () => {} })),
  );
}

// ── Onderdeel niet meer in de bron ──────────────────────────────────────────

describe('BkSectie: de waarschuwing als een onderdeel niet meer in de bron staat (I4 data-2)', () => {
  const zin = bkOnderdeelNietMeerInBron('2026-10-05');

  it('vertrekpunt: het kader geeft onderdeelNietMeerInBron alleen met onderdeel 8 op niet-gevonden', () => {
    expect(bkKader(koppelingZonder8('2026-10-05'), INDEX, INFO_8, KEUZE_8, VANDAAG).onderdeelNietMeerInBron).toBe('2026-10-05');
    expect(bkKader(KOPPELING, INDEX, INFO_8, KEUZE_8, VANDAAG).onderdeelNietMeerInBron).toBeUndefined();
  });

  it('staat er als callout warn (role note), na "Bij deze richting horen 2 …" en vóór de uitleg, met de dag', () => {
    const html = toonSectie(koppelingZonder8('2026-10-05'));
    expect(zin).toBe('De Vlaamse overheid geeft sinds 5 oktober 2026 niet meer alle gegevens van deze richting. Je ziet de laatst bekende beroepskwalificaties.');
    expect(html).toContain(`<div class="callout warn bk-melding" role="note">`);
    const intro = html.indexOf('Bij deze richting horen 2 beroepskwalificaties.');
    const plek = html.indexOf(zin);
    const uitleg = html.indexOf(BK_INTRO_UITLEG);
    expect(intro).toBeGreaterThan(-1);
    expect(plek).toBeGreaterThan(intro);
    expect(uitleg).toBeGreaterThan(plek);
    // De zin staat alleen in de callout (met het icoon), en de twee kaarten blijven eronder staan (de laatst bekende).
    expect(html).toMatch(new RegExp(`<div class="callout warn bk-melding" role="note"><svg[^<]*>[^]*?</svg><div class="bk-melding-tekst"><p>${regex(zin)}</p></div></div>`));
    expect(html.split(zin)).toHaveLength(2);
    expect(html.match(/<article class="bk-kaart"/g)).toHaveLength(2);
    expect(html.indexOf('<article class="bk-kaart"')).toBeGreaterThan(plek);
  });

  it('staat er niet als alle onderdelen in de bron staan', () => {
    const html = toonSectie(KOPPELING);
    expect(html).toContain('Bij deze richting horen 2 beroepskwalificaties.');
    expect(html).not.toContain('niet meer alle gegevens van deze richting');
    expect(html).not.toContain('callout warn');
  });
});

// ── Een melding waarvan het nieuwe leerplan er al is ────────────────────────

describe('MeldingBlok: het nieuwe leerplan staat er al (I4 toegang-5)', () => {
  const nieuw = { id: 'lp/nieuw 1', title: 'Nagebootste beroepskwalificatie · Assistent plantaardige productie' } as unknown as Curriculum;
  const waarschuwing = 'Je leerplan ‘Oud’ volgt een vorige versie van ‘Nagebootste beroepskwalificatie’.';
  const toon = (props: Parameters<typeof MeldingBlok>[0]) =>
    renderToStaticMarkup(createElement(StaticRouter, { location: '/cursussen/richtingen/G-0009' }, createElement(MeldingBlok, props)));

  it('met al: de waarschuwing, de zin met de titel, de link "Open het leerplan" naar dat leerplan en de hint; geen knop', () => {
    const tekst = bkAlLeerplanVanNu('andere-versie', nieuw.title);
    const html = toon({ soort: 'warn', tekst: waarschuwing, hint: BK_HINT_ANDERE_VERSIE, al: { tekst, leerplan: nieuw } });
    expect(html).toContain(`<p>${waarschuwing}</p>`);
    expect(html).toContain(`<p>Je hebt al een leerplan met de versie van nu: ‘${nieuw.title}’.</p>`);
    expect(html).toContain(`href="/leerplannen?open=${encodeURIComponent(nieuw.id)}"`);
    expect(html).toMatch(new RegExp(`${regex(BK_KNOP_OPEN)}<span class="sr-only"> ${regex(`(${nieuw.title})`)}</span></a>`));
    expect(html).toContain(BK_HINT_ANDERE_VERSIE);
    expect(html).not.toContain('<button');
    // De zin staat vóór de link, de hint erna.
    expect(html.indexOf('Je hebt al een leerplan')).toBeLessThan(html.indexOf('<a '));
    expect(html.indexOf('<a ')).toBeLessThan(html.indexOf(BK_HINT_ANDERE_VERSIE));
  });

  it('zonder al: de uitleg en de knop, geen link', () => {
    const html = toon({
      soort: 'warn', tekst: waarschuwing, uitleg: 'Uitleg vooraf.', hint: BK_HINT_ANDERE_VERSIE,
      knop: { label: BK_KNOP_ANDERE_VERSIE, reden: undefined, onClick: () => {} },
    });
    expect(html).toContain('<p id=');
    expect(html).toContain('Uitleg vooraf.');
    expect(html).toContain(`>${BK_KNOP_ANDERE_VERSIE}</button>`);
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('Je hebt al een leerplan');
  });
});
