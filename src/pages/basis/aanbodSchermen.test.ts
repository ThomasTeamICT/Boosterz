// Het aanbod op de lesplanpagina ('Aanbod in Boosterz' in 'In het kort') en de nep-oefening van het scherm 'Op het bord'.
// renderToStaticMarkup op het echte lesplan LP0065 en het echte manifest.

import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { GoAanbodBestand, GoAanbodBordles } from '../../lib/basis/go/aanbod';
import type { GoIndex, GoLesplanBestand } from '../../lib/basis/go/types';
import { aanbodWidget } from './AanbodScherm';
import { LesplanInhoud, type AanbodStand, type Koppelingen } from './LesplanScherm';

const lees = (pad: string): unknown => JSON.parse(readFileSync(new URL(`../../../public/basis/${pad}`, import.meta.url), 'utf8'));
const LP0065 = lees('go/lesplannen/LP0065.json') as GoLesplanBestand;
const INDEX = lees('go/index.json') as GoIndex;
const AANBOD = lees('aanbod/LP0065.json') as GoAanbodBestand;
const KLAAR: Koppelingen = { status: 'klaar', perCode: new Map() };

function toon(aanbod?: AanbodStand, lesplan: GoLesplanBestand = LP0065): string {
  const spion = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    return renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(LesplanInhoud, { lesplan, index: INDEX, koppelingen: KLAAR, aanbod })));
  } finally {
    spion.mockRestore();
  }
}

/** Het stuk van de sectie, van het kopje tot het einde van 'In het kort'. */
function sectie(html: string): string {
  const begin = html.indexOf('<div class="b-lp-aanbod">');
  if (begin < 0) return '';
  return html.slice(begin, html.indexOf('</section>', begin));
}

const tekst = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

describe('Aanbod in Boosterz op de lesplanpagina', () => {
  it('toont het onderdeel: titel, soort in gewone taal, de stappen met naam, de doelcodes en de link Op het bord', () => {
    const html = toon({ status: 'klaar', aanbod: AANBOD });
    const s = sectie(html);
    expect(s).toContain('<h3>Aanbod in Boosterz</h3>');
    expect(tekst(s)).toContain('Dier of plant? En wat eet het?');
    expect(tekst(s)).toContain('Uitleg op het bord');
    expect(tekst(s)).toContain('Bij stap 2 (Voorkeursinstructie), stap 3 (Terugkoppelen) en stap 5 (Kleine lesafsluiting)');
    expect(s).toContain('href="/basis/lesplan/LP0065?stap=2"');
    for (const d of ['WT.001', 'WT.008', 'WT.028']) expect(s).toContain(`href="/basis/leerplandoel/${d}"`);
    expect(s).toContain('href="/basis/aanbod/LP0065/dier-of-plant"');
    expect(s).toMatch(/<a class="b-knop b-lp-aanbod-bord" aria-label="Op het bord: Dier of plant\? En wat eet het\?" href="\/basis\/aanbod\/LP0065\/dier-of-plant">Op het bord<\/a>/);
    expect(tekst(s)).toContain('Alle 3 leerplandoelen van dit lesplan komen aan bod.');
    expect(tekst(s)).not.toContain('Na te kijken');
  });

  it('staat in "In het kort", na de twee kolommen, en de pagina houdt één h1', () => {
    const html = toon({ status: 'klaar', aanbod: AANBOD });
    const kort = html.indexOf('id="lp-kort-kop"');
    const aanbod = html.indexOf('Aanbod in Boosterz');
    expect(kort).toBeGreaterThan(0);
    expect(aanbod).toBeGreaterThan(kort);
    expect(aanbod).toBeLessThan(html.indexOf('b-lp-grens'));
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  });

  it('zonder aanbod (of nog aan het laden) staat er niets: geen leeg kopje', () => {
    for (const html of [toon({ status: 'geen' }), toon(undefined)]) {
      expect(html).not.toContain('Aanbod in Boosterz');
      expect(html).not.toContain('b-lp-aanbod');
    }
  });

  it('wat niet gedekt is, staat er altijd', () => {
    const half: GoAanbodBestand = { ...AANBOD, onderdelen: [{ ...AANBOD.onderdelen[0], doelen: ['WT.001'] }] };
    expect(tekst(sectie(toon({ status: 'klaar', aanbod: half })))).toContain('Nog niet gedekt: WT.008, WT.028.');
    const leeg: GoAanbodBestand = { ...AANBOD, onderdelen: [] };
    expect(tekst(sectie(toon({ status: 'klaar', aanbod: leeg })))).toContain('Nog niet gedekt: WT.001, WT.008, WT.028.');
  });

  it('een veranderd lesplan: duidelijke melding "na te kijken"', () => {
    const oud: GoAanbodBestand = { ...AANBOD, lesplan: { ...AANBOD.lesplan, sha256: '0'.repeat(64) } };
    expect(tekst(sectie(toon({ status: 'klaar', aanbod: oud })))).toContain('Na te kijken: het lesplan is veranderd sinds dit aanbod gemaakt werd.');
  });

  it('een verwijzing die niet (meer) in het lesplan staat: melding, en de stap zonder link', () => {
    const kapot: GoAanbodBestand = { ...AANBOD, onderdelen: [{ ...AANBOD.onderdelen[0], steunt: { stappen: [2, 7 as 6] } }] };
    const s = sectie(toon({ status: 'klaar', aanbod: kapot }));
    expect(tekst(s)).toContain('verwijst naar iets wat niet (meer) in dit lesplan staat');
    expect(tekst(s)).toContain('stap 7');
    expect(s).not.toContain('stap=7');
  });

  it('een activiteit van Trainen en de vastlegging', () => {
    const met: GoAanbodBestand = {
      ...AANBOD,
      onderdelen: [{ id: 'honger', soort: 'oefening', titel: 'Wie heeft honger?', steunt: { trainen: ['Wie heeft honger?'], vastlegging: true }, doelen: ['WT.008'], widget: { type: 'memory', bestand: 'honger.json' } }],
    };
    const s = sectie(toon({ status: 'klaar', aanbod: met }));
    expect(tekst(s)).toContain('Bij de activiteit ‘Wie heeft honger?’ uit Trainen en de vastlegging');
    expect(tekst(s)).toContain('Oefening');
    expect(s).not.toContain('/basis/aanbod/');
  });

  it('geen verbinding: een rustige zin met opnieuw proberen, zonder kopje; een andere fout: een foutmelding', () => {
    const stil = toon({ status: 'fout', fout: 'x', offline: true, opnieuw: () => {} });
    expect(stil).not.toContain('Aanbod in Boosterz</h3>');
    expect(tekst(stil)).toContain('Of er bij dit lesplan aanbod in Boosterz is, konden we niet nagaan: er is geen verbinding.');
    const fout = toon({ status: 'fout', fout: 'Het aanbod kon niet gelezen worden.', offline: false, opnieuw: () => {} });
    expect(fout).toContain('role="alert"');
    expect(tekst(fout)).toContain('Het aanbod kon niet gelezen worden.');
  });
});

describe('aanbodWidget', () => {
  it('een nep-oefening die nergens bewaard wordt, met de config van de bordles', () => {
    const les: GoAanbodBordles = { soort: 'bordles', titel: 'Dier of plant?', config: { fases: [] } };
    const w = aanbodWidget('LP0065', AANBOD.onderdelen[0], les);
    expect(w).toMatchObject({ id: 'aanbod-LP0065-dier-of-plant', type: 'bordles', title: 'Dier of plant?', code: '', folderId: null, createdAt: 0, updatedAt: 0 });
    expect(w.config).toBe(les.config);
    expect(w.settings.accentColor).toBeTruthy();
  });
});
