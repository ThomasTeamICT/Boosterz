// De pagina van een leerjaar (renderToStaticMarkup in een StaticRouter), met zelfgemaakte koppen en een schooljaar als
// parameter: 2026, 2027, 2029 en 2031 (geen lege kopjes, H5). De getallen op de echte gegevens staan in
// src/lib/basis/basisIngang.echt.test.ts; de test leest nergens de klok en geen gegevensbestand.

import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import type { MinimumdoelenIndexSet } from '../../lib/minimumdoelen';
import { LEERJAREN_BASIS, type LeerjaarBasis, type Schooljaar, type SoortBasis } from '../../lib/basis/kalender';
import { KlaarOmTeGeven } from '../../components/basis/PakketTegel';
import { LeerjaarInhoud } from './LeerjaarScherm';
import { StartInhoud } from './StartScherm';

function kop(id: string, naam: string, korteNaam: string, aantal: number, extra: Partial<MinimumdoelenIndexSet> = {}): MinimumdoelenIndexSet {
  return { id, naam, korteNaam, aantal, sha256: 'x', opgehaald: '2026-11-01T00:00:00Z', bestand: `${id}.json`, geldigheid: 'Geldig', ...extra };
}
const NIEUW = { versie: '2.0', geldigVan: '2025-09-01' };
const POP = 'Te bereiken minimumdoelen op populatieniveau';
const NASTREVEN = 'Na te streven minimumdoelen op populatieniveau';

const INDEX: MinimumdoelenIndexSet[] = [
  kop('L4_NL', `Lager Onderwijs 4de leerjaar -  Nederlands - ${POP}`, 'Nederlands', 72, NIEUW),
  kop('L4_WT', `Lager Onderwijs 4de leerjaar -  Wetenschap en techniek - ${POP}`, 'Wetenschap en techniek', 44, NIEUW),
  kop('L4_AK', `Lager Onderwijs 4de leerjaar -  Aardrijkskunde - ${POP}`, 'Aardrijkskunde', 21, NIEUW),
  kop('L4_MV', `Lager Onderwijs 4de leerjaar -  Muzische vorming - ${POP}`, 'Muzische vorming', 38, NIEUW),
  kop('L6_NL', `Lager Onderwijs 6de leerjaar -  Nederlands - ${POP}`, 'Nederlands', 57, NIEUW),
  kop('K_NL_POP', `Kleuteronderwijs -  Nederlands - ${POP}`, 'Nederlands', 7, NIEUW),
  kop('K_NL_NA', `Kleuteronderwijs -  Nederlands - ${NASTREVEN}`, 'Nederlands', 35, NIEUW),
  kop('K_MV', `Kleuteronderwijs -  Muzische vorming - ${NASTREVEN}`, 'Muzische vorming', 28, NIEUW),
  kop('BU_L4_NL', `Buitengewoon Lager Onderwijs 4de leerjaar -  Nederlands - ${NASTREVEN}`, 'Nederlands', 72, NIEUW),
  kop('BU_L4_WT', `Buitengewoon Lager Onderwijs 4de leerjaar -  Wetenschap en techniek - ${NASTREVEN}`, 'Wetenschap en techniek', 44, NIEUW),
  kop('OUD_LO', 'Lager Onderwijs - Leergebied - Lichamelijke Opvoeding - Eindtermen', 'Lichamelijke Opvoeding', 46, {
    versie: '1.0', geldigVan: '1998-09-01', geldigTot: '2030-08-31',
  }),
  kop('OUD_FR', 'Lager Onderwijs - Leergebied - Frans - Eindtermen', 'Frans', 27, { versie: '1.0', geldigVan: '2010-09-01', geldigTot: '2030-08-31' }),
  kop('OUD_K_MV', 'Kleuteronderwijs - Leergebied - Muzische Vorming - Ontwikkelingsdoelen', 'Muzische Vorming', 30, {
    versie: '1.0', geldigVan: '1998-09-01', geldigTot: '2027-08-31',
  }),
  kop('BU_OUD', 'Buitengewoon Lager Onderwijs Type 3 - Leergebied - Nederlands - Ontwikkelingsdoelen', 'Nederlands', 20, {
    versie: '1.0', geldigVan: '2018-09-01', geldigTot: '2030-08-31',
  }),
];

function pagina(soort: SoortBasis, leerjaar: LeerjaarBasis, sj: Schooljaar, alle = INDEX): string {
  return renderToStaticMarkup(
    createElement(StaticRouter, { location: '/' }, createElement(LeerjaarInhoud, { alle, soort, leerjaar, schooljaar: sj })),
  );
}
const kopjes = (html: string) => [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
const tekst = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const tel = (html: string, patroon: RegExp) => (html.match(patroon) ?? []).length;

describe('LeerjaarInhoud 2026: het 3de leerjaar (gewoon)', () => {
  const html = pagina('bao', 'L3', 2026);

  it('zegt naar welk eindmoment het leerjaar werkt, met aantallen en het schooljaar', () => {
    expect(tekst(html)).toContain('Je leerjaar werkt naar de doelen van het einde van het 4de leerjaar: 175 doelen in 4 vakken.');
    expect(html).toContain('Schooljaar 2026-2027');
    expect(tekst(html)).toContain('Het leerplan van je net legt de tussenstappen vast.');
  });

  it('heeft de kopjes Dit schooljaar verplicht, Mag al en Oude doelen, in die volgorde', () => {
    expect(kopjes(html)).toEqual(['Dit schooljaar verplicht', 'Mag al', 'Oude doelen die dit schooljaar nog gelden']);
  });

  it('toont de verplichte vakken met lampstreep en de vakken die al mogen met het jaar waarin ze verplicht worden', () => {
    expect(tel(html, /b-vakkaart b-vakkaart-lamp/g)).toBe(2);
    expect(tel(html, /class="b-vakkaart"/g)).toBe(2);
    expect(tekst(html)).toContain('verplicht vanaf 2027-2028');
    expect(html).toContain('href="/basis/vak/gewoon/einde-4de/nederlands?leerjaar=L3"');
  });

  it('zet de oude doelen open in beeld, met naam, aantal, soort, link en de zin dat de bron ze niet koppelt', () => {
    expect(html).not.toMatch(/<details[^>]*>\s*<summary>Oude doelen/);
    expect(html).toContain('href="/leerplannen/minimumdoelen/OUD_LO"');
    expect(tekst(html)).toContain('Lager Onderwijs - Leergebied - Lichamelijke Opvoeding - Eindtermen');
    expect(tekst(html)).toContain('46 doelen · Eindtermen (oud)');
    expect(tekst(html)).toContain('De officiële gegevens koppelen de oude en de nieuwe doelen niet aan elkaar.');
  });

  it('zegt wat het model staaft en niets anders (H11)', () => {
    const t = tekst(html);
    expect(t).toContain('Tot dan mogen de oude doelen nog. Welke oude doelen nog gelden, staat hieronder.');
    expect(t).toContain('hebben geen nieuwe doelen voor het einde van het 4de leerjaar.');
    expect(t).not.toMatch(/Tot dan gelden voor deze vakken/);
    expect(t).not.toMatch(/alleen doelen voor het einde van het 6de leerjaar/);
  });

  it('heeft het zoekveld, de uitleg over de zekerheid en geen h1 (die staat in LeerjaarScherm)', () => {
    expect(html).toContain('role="search"');
    expect(html).toContain('Zoek in de doelen van het einde van het 4de leerjaar');
    expect(html).toContain('<summary>Hoe zeker is dit?</summary>');
    expect(tel(html, /<h1[\s>]/g)).toBe(0);
  });
});

describe('LeerjaarInhoud: de kleuterklas en het 5de leerjaar in 2026', () => {
  it('K2: twee soorten in één kaart', () => {
    const t = tekst(pagina('bao', 'K2', 2026));
    expect(t).toContain('Je kleuterklas werkt naar de doelen van het einde van de kleuterklas');
    expect(t).toContain('42 doelen: 7 te bereiken (populatie) · 35 na te streven');
    expect(t).toContain('Kleuteronderwijs - Leergebied - Muzische Vorming - Ontwikkelingsdoelen');
    expect(t).toContain('Ontwikkelingsdoelen (oud)');
  });

  it('L5: nog niets verplicht; de zin zegt dat de oude eindtermen gelden en de lijst staat open', () => {
    const html = pagina('bao', 'L5', 2026);
    expect(kopjes(html)).toEqual(['Dit schooljaar zijn nog geen nieuwe doelen verplicht', 'Mag al', 'Oude doelen die dit schooljaar nog gelden']);
    expect(tekst(html)).toContain('Voor dit leerjaar gelden dit schooljaar nog de oude eindtermen (hieronder).');
    expect(html).toContain('href="/leerplannen/minimumdoelen/OUD_FR"');
  });
});

describe('LeerjaarInhoud: het buitengewoon', () => {
  const html = pagina('bubao', 'L3', 2026);

  it('zegt dat alle doelen na te streven zijn en toont de zin over de oude doelen met een link, zonder lijst', () => {
    const t = tekst(html);
    expect(t).toContain('In het buitengewoon onderwijs zijn al deze doelen na te streven.');
    expect(t).toContain('Daarnaast gelden in het buitengewoon onderwijs nog oude ontwikkelingsdoelen');
    expect(html).toContain('href="/leerplannen/minimumdoelen"');
    expect(html).not.toContain('b-oudlijst');
    expect(html).not.toContain('BU_OUD');
  });

  it('toont de opmerking van de kalender (volgt het gewoon onderwijs) en de zekerheid', () => {
    const t = tekst(html);
    expect(t).toContain('Volgt de kalender van het gewoon basisonderwijs');
    expect(html).toContain('badge badge-warn');
    expect(t).toMatch(/nog onzeker|waarschijnlijk/);
  });
});

describe('LeerjaarInhoud: geen lege kopjes (H5)', () => {
  it('2027, 3de leerjaar: alles verplicht, dus geen Mag al, geen Oude doelen en wel de zin dat alles verplicht is', () => {
    const html = pagina('bao', 'L3', 2027);
    expect(kopjes(html)).toEqual(['Dit schooljaar verplicht']);
    expect(tekst(html)).toContain('Alle vakken zijn dit schooljaar verplicht.');
    expect(tekst(html)).not.toContain('Tot dan mogen');
    expect(html).not.toContain('Mag al');
  });

  it.each([2027, 2029, 2031])('in %i heeft elk leerjaar alleen kopjes met inhoud eronder', (sj) => {
    for (const soort of ['bao', 'bubao'] as const) {
      for (const lj of LEERJAREN_BASIS) {
        const html = pagina(soort, lj, sj);
        const secties = html.split('<section').slice(1);
        for (const s of secties) {
          const inhoud = s.replace(/<h2[^>]*>.*?<\/h2>/, '');
          expect(/<li[\s>]|<p[\s>]/.test(inhoud), `${soort} ${lj} ${sj}: lege sectie ${s.slice(0, 80)}`).toBe(true);
        }
        expect(tel(html, /<h1[\s>]/g)).toBe(0);
      }
    }
  });

  it('2029 en 2031: geen Mag al en geen Oude doelen voor het gewoon onderwijs', () => {
    for (const sj of [2029, 2031]) {
      const html = pagina('bao', 'L3', sj);
      expect(kopjes(html), `${sj}`).toEqual(['Dit schooljaar verplicht']);
    }
  });

  it('een index zonder enige set geeft een korte zin in plaats van lege kopjes', () => {
    const html = pagina('bao', 'L3', 2026, []);
    expect(kopjes(html)).toEqual([]);
    expect(tekst(html)).toContain('Voor dit leerjaar vinden we in de gegevens niets dat dit schooljaar geldt.');
    expect(tekst(html)).toContain('In de gegevens vinden we daar geen nieuwe doelen voor.');
  });
});

describe('LeerjaarInhoud: het blok "Van het GO!"', () => {
  const GO = createElement('section', { 'aria-labelledby': 'b-vango-kop' }, createElement('h2', { id: 'b-vango-kop' }, 'Van het GO!'));
  const metGo = (go?: ReactNode) =>
    renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(LeerjaarInhoud, { alle: INDEX, soort: 'bao', leerjaar: 'L3', schooljaar: 2026, go })));

  it('staat onder de doelen van de overheid en boven "Hoe zeker is dit?"', () => {
    const html = metGo(GO);
    expect(kopjes(html)).toContain('Van het GO!');
    expect(html.indexOf('Van het GO!')).toBeGreaterThan(html.indexOf('Dit schooljaar verplicht'));
    expect(html.indexOf('Van het GO!')).toBeLessThan(html.indexOf('Hoe zeker is dit?'));
  });

  it('zonder het blok verandert er niets aan de pagina', () => {
    expect(metGo(undefined)).toBe(pagina('bao', 'L3', 2026));
    expect(kopjes(metGo(undefined))).not.toContain('Van het GO!');
  });
});

describe('LeerjaarInhoud: het blok "Klaar om te geven" (Lichtkamer)', () => {
  const KLAAR = createElement(KlaarOmTeGeven, { soort: 'bao', leerjaar: 'L3' });
  const metKlaar = (leerjaar: LeerjaarBasis, klaar?: ReactNode, soort: SoortBasis = 'bao') =>
    renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(LeerjaarInhoud, { alle: INDEX, soort, leerjaar, schooljaar: 2026, klaar })));

  it('staat na het zoekveld en vóór "Dit schooljaar verplicht", met de tegel naar de lespagina', () => {
    const html = metKlaar('L3', KLAAR);
    expect(kopjes(html)).toContain('Klaar om te geven');
    expect(html.indexOf('Klaar om te geven')).toBeGreaterThan(html.indexOf('role="search"'));
    expect(html.indexOf('Klaar om te geven')).toBeLessThan(html.indexOf('Dit schooljaar verplicht'));
    expect(html).toContain('href="/basis/pakket/lichtkamer/einde-4de"');
    expect(tekst(html)).toContain('Lichtkamer: schaduwtheater');
  });

  it('zonder het blok verandert er niets aan de pagina', () => {
    expect(metKlaar('L3', undefined)).toBe(pagina('bao', 'L3', 2026));
    expect(kopjes(metKlaar('L3'))).not.toContain('Klaar om te geven');
  });

  it('het blok toont zich alleen bij de leerjaren van het register (L3, L4) en in het gewoon onderwijs', () => {
    const toont = (soort: SoortBasis, lj: LeerjaarBasis) =>
      renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(KlaarOmTeGeven, { soort, leerjaar: lj }))).includes('Klaar om te geven');
    expect(toont('bao', 'L3')).toBe(true);
    expect(toont('bao', 'L4')).toBe(true);
    for (const lj of ['K1', 'K2', 'K3', 'L1', 'L2', 'L5', 'L6'] as const) expect(toont('bao', lj), lj).toBe(false);
    expect(toont('bubao', 'L3')).toBe(false);
    expect(renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(KlaarOmTeGeven, { soort: 'bubao', leerjaar: 'L3' })))).toBe('');
  });
});

describe('StartInhoud', () => {
  const html = renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(StartInhoud, { alle: INDEX })));

  it('heeft één h1, de kiezer, het zoekveld en de tegels met aantallen uit de index', () => {
    expect(tel(html, /<h1[\s>]/g)).toBe(1);
    expect(html).toContain('<h1>Welk leerjaar geef je?</h1>');
    expect(html).toContain('role="search"');
    expect(tekst(html)).toContain('Einde kleuter 70 doelen');
    expect(tekst(html)).toContain('Einde 4de leerjaar 175 doelen');
    expect(tekst(html)).toContain('Einde 6de leerjaar 57 doelen');
    expect(html).toContain('href="/basis/leerlijn/gewoon"');
    expect(html).toContain('Leerlijnen per vak');
  });

  it('heeft een tegel naar het leerplan en de lesplannen van het GO!, ook zonder index', () => {
    expect(html).toContain('href="/basis/go"');
    expect(tekst(html)).toContain('Leerplan en lesplannen van het GO!');
    const zonder = renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(StartInhoud, {})));
    expect(zonder).toContain('href="/basis/go"');
  });

  it('toont de tegels ook zonder index, zonder aantallen', () => {
    const zonder = renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(StartInhoud, {})));
    expect(zonder).toContain('href="/basis/moment/gewoon/einde-4de"');
    expect(tekst(zonder)).not.toMatch(/\d+ doelen/);
  });
});
