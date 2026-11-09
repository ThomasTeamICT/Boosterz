// De schermen van het leerplan van het GO! (renderToStaticMarkup in een StaticRouter): het overzicht, de leerplandoelen van
// een vak, één leerplandoel, de koppeling aan de minimumdoelen in haar standen, de inhoud (MIA, begrippen, voorbeelden),
// de leeftijdskiezer en de iconen. De gegevens zijn de echte bestanden in public/basis/go/ en public/leerplannen/minimumdoelen/;
// de teksten van de minimumdoelen komen uit de officiële sets, zoals de app ze via laadSet haalt.
// vitest leest alleen src/**/*.test.ts, daarom staat dit in een .ts-bestand en bouwt het de elementen met createElement.

import { readFileSync } from 'node:fs';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import { KoppelingChips, KoppelingLijst, redenZin, twijfelZin, type MinimumdoelTeksten } from '../../components/basis/go/KoppelingLijst';
import { LeeftijdKiezer } from '../../components/basis/go/LeeftijdKiezer';
import { MiaBlok, groepeerInhoud } from '../../components/basis/go/MiaBlok';
import { GO_VAK_ICONEN, GO_VAK_TINTEN, VAK_ICONEN, VAK_TINTEN, goVakIcoon, goVakTint } from '../../components/basis/vakIconen';
import { contrastRatio, oklchToHex } from '../../lib/color';
import { doelenVanSet, type DoelBasis } from '../../lib/basis/doelBasis';
import { GO_LEEFTIJDEN } from '../../lib/basis/go/leeftijden';
import {
  GO_VAK_CODES,
  GO_VOORSTEL_LABEL,
  type GoIndex,
  type GoLeerplandoel,
  type GoLeerplanBestand,
  type GoLesplanBestand,
  type GoVak,
} from '../../lib/basis/go/types';
import { isZonderMinimumdoel } from '../../lib/basis/go/valideer';
import { basisSet } from '../../lib/basis/moment';
import type { MinimumdoelenIndexSet, MinimumdoelenSetBestand } from '../../lib/minimumdoelen';
import { GoInhoud } from './GoScherm';
import { LeerplandoelInhoud, tekstInLesplan, type LesplannenBijDoel } from './LeerplandoelScherm';
import { LeerplandoelenInhoud, aantalPerLeeftijd, blokkenVan, lijstItems, onderwerpKeuzes } from './LeerplandoelenScherm';

const toon = (el: ReactElement) => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, el));
const ENTITEITEN: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'" };
/** De zichtbare tekst van een stuk html, met één spatie tussen de woorden. */
const tekst = (html: string) =>
  html
    .replace(/<span class="sr-only">[^<]*<\/span>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#x27);/g, (m) => ENTITEITEN[m])
    .replace(/\s+/g, ' ')
    .replace(/ ([.:])/g, '$1')
    .trim();
const tel = (html: string, patroon: RegExp) => (html.match(patroon) ?? []).length;

const GO_MAP = new URL('../../../public/basis/go/', import.meta.url);
const MIN_MAP = new URL('../../../public/leerplannen/minimumdoelen/', import.meta.url);
const leesGo = <T>(pad: string): T => JSON.parse(readFileSync(new URL(pad, GO_MAP), 'utf8')) as T;

const INDEX = leesGo<GoIndex>('index.json');
const LEERPLAN = new Map(GO_VAK_CODES.map((v) => [v, leesGo<GoLeerplanBestand>(`leerplan/${v}.json`)] as const));
const doelVan = (code: string): GoLeerplandoel => {
  const d = LEERPLAN.get(code.slice(0, 2) as GoVak)?.doelen.find((x) => x.code === code);
  if (!d) throw new Error(`Leerplandoel ${code} niet gevonden`);
  return d;
};
const lesplanVan = (code: string) => leesGo<GoLesplanBestand>(`lesplannen/${code}.json`);

// De officiële teksten, zoals de app ze via laadSet en doelenVanSet haalt.
const MIN_INDEX = (JSON.parse(readFileSync(new URL('index.json', MIN_MAP), 'utf8')) as { sets: MinimumdoelenIndexSet[] }).sets;
const sets = new Map<string, Map<string, DoelBasis>>();
function officieel(setId: string): Map<string, DoelBasis> {
  let m = sets.get(setId);
  if (!m) {
    const kop = MIN_INDEX.find((s) => s.id === setId);
    const info = kop ? basisSet(kop) : undefined;
    const bestand = JSON.parse(readFileSync(new URL(`${setId}.json`, MIN_MAP), 'utf8')) as MinimumdoelenSetBestand;
    m = new Map(info ? doelenVanSet(bestand, info).map((d) => [d.id, d] as const) : []);
    sets.set(setId, m);
  }
  return m;
}
const KLAAR: MinimumdoelTeksten = { status: 'klaar', vind: (r) => officieel(r.set).get(r.id) };
const LEEG: MinimumdoelTeksten = { status: 'klaar', vind: () => undefined };
const LADEN: MinimumdoelTeksten = { status: 'laden' };

const koppeling = (doel: GoLeerplandoel, teksten: MinimumdoelTeksten = KLAAR) => toon(createElement(KoppelingLijst, { doel, teksten }));

// ── Iconen en tinten ─────────────────────────────────────────────────────────

describe('iconen en tinten van de twaalf vakken van het GO!', () => {
  it('elk vak heeft een icoon en een tint', () => {
    expect(Object.keys(GO_VAK_ICONEN).sort()).toEqual([...GO_VAK_CODES]);
    expect(Object.keys(GO_VAK_TINTEN).sort()).toEqual([...GO_VAK_CODES]);
    for (const v of GO_VAK_CODES) {
      expect(goVakIcoon(v), v).toBe(GO_VAK_ICONEN[v]);
      expect(goVakTint(v), v).toBe(GO_VAK_TINTEN[v]);
    }
  });

  it('BU, LL en SV hebben een eigen icoon en een eigen tint; alle twaalf zijn verschillend', () => {
    expect(new Set(Object.values(GO_VAK_ICONEN)).size).toBe(12);
    expect(new Set(Object.values(GO_VAK_TINTEN)).size).toBe(12);
    const tienIconen = new Set(Object.values(VAK_ICONEN));
    for (const v of ['BU', 'LL', 'SV'] as const) expect(tienIconen.has(GO_VAK_ICONEN[v]), v).toBe(false);
  });

  it('de tien vakken van het minimumdoel houden hun icoon en tint; de tabellen blijven tien vakken groot', () => {
    expect(GO_VAK_ICONEN.WT).toBe(VAK_ICONEN[3]);
    expect(GO_VAK_ICONEN.NL).toBe(VAK_ICONEN[1]);
    expect(GO_VAK_ICONEN.AA).toBe(VAK_ICONEN[4]);
    expect(GO_VAK_TINTEN.WI).toBe(VAK_TINTEN[2]);
    expect(Object.keys(VAK_ICONEN)).toHaveLength(10);
    expect(Object.keys(VAK_TINTEN)).toHaveLength(10);
  });

  it('de nieuwe tinten halen hetzelfde contrast als de oude, licht en donker', () => {
    const css = readFileSync(new URL('../../styles/basis.css', import.meta.url), 'utf8');
    const tokens = (selector: string): Record<string, string> => {
      const start = css.indexOf(`${selector} {`);
      const body = css.slice(start, css.indexOf('}', start));
      return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
    };
    const licht = tokens(":root[data-deel='basis']");
    const donker = { ...licht, ...tokens(":root[data-deel='basis'][data-theme='dark']") };
    for (const [naam, tk] of Object.entries({ licht, donker })) {
      for (const v of ['BU', 'LL', 'SV'] as const) {
        const tegel = oklchToHex(Number(tk['tile-l']), Number(tk['tile-c']), GO_VAK_TINTEN[v]);
        const icoon = oklchToHex(Number(tk['icon-l']), Number(tk['icon-c']), GO_VAK_TINTEN[v]);
        expect(contrastRatio(tegel, icoon), `${naam}: icoon ${v}`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(tegel, tk.text), `${naam}: tekst ${v}`).toBeGreaterThanOrEqual(7);
      }
    }
  });
});

// ── De inhoud: MIA, begrippen, voorbeelden ───────────────────────────────────

describe('MiaBlok en groepeerInhoud', () => {
  it('groepeert WT.086: een MIA-blok met titel en twee items, en de begrippen met hun leeftijden', () => {
    const g = groepeerInhoud(doelVan('WT.086').inhoud);
    expect(g.map((x) => x.soort)).toEqual(['mia', 'begrippen']);
    const html = toon(createElement(MiaBlok, { inhoud: doelVan('WT.086').inhoud }));
    expect(tekst(html)).toContain('Leven geven: De baby groeit eerst in de buik van de mama.');
    expect(tekst(html)).toContain('Te hanteren begrippen de baby (2,5-4 jaar, 4-5 jaar)');
    expect(html).not.toMatch(/\bMIA\b/);
  });

  it('toont voorbeelden onder één kop, met hun titel', () => {
    const html = toon(createElement(MiaBlok, { inhoud: doelVan('WT.008').inhoud }));
    expect(tel(html, /<h3>Voorbeelden<\/h3>/g)).toBe(1);
    expect(tekst(html)).toContain('Voedingswijze: Schapen eten gras, kikkers eten insecten.');
    expect(html).not.toMatch(/aanklikbaar/i);
  });

  it('zonder inhoud rendert niets, en een voetnoot is gewone tekst', () => {
    expect(toon(createElement(MiaBlok, { inhoud: [] }))).toBe('');
    const html = toon(createElement(MiaBlok, { inhoud: doelVan('NL.044').inhoud }));
    expect(tekst(html)).toContain('* in een variatie aan teksten');
  });

  it('er gaat niets verloren: elke rij van elk doel zit in precies één groep, in bronvolgorde', () => {
    let rijen = 0;
    for (const lp of LEERPLAN.values()) {
      for (const d of lp.doelen) {
        const g = groepeerInhoud(d.inhoud);
        const uit = g.flatMap((x) => [...('titel' in x && x.titel ? [x.titel.tekst] : []), ...x.items.map((i) => i.tekst)]);
        expect(uit, d.code).toEqual(d.inhoud.map((i) => i.tekst));
        rijen += uit.length;
      }
    }
    expect(rijen).toBeGreaterThan(10000);
  });
});

// ── De koppeling in haar standen ─────────────────────────────────────────────

describe('KoppelingLijst: officieel, met de tekst van het minimumdoel uit de API', () => {
  const html = koppeling(doelVan('WT.086'));

  it('toont het moment, het nummer en de volledige tekst uit de officiële set, met een link naar de doelpagina', () => {
    const api = officieel('ODS_3410').get('92929');
    expect(api, 'doel 92929 in ODS_3410').toBeDefined();
    const doelzin = tekst(api?.doelzinHtml ?? '');
    expect(doelzin.length).toBeGreaterThan(10);
    expect(tekst(html)).toContain(doelzin);
    expect(tekst(html)).toContain('Einde kleuter Minimumdoel 3.1.3');
    expect(tekst(html)).toContain('Einde kleuter Minimumdoel 3.1.4');
    expect(html).toContain('href="/basis/doel/ODS_3410/92929"');
    expect(html).toContain('href="/basis/doel/ODS_3410/93034"');
    expect(tekst(html)).toContain('Volgens het leerplan van het GO! hoort dit leerplandoel bij');
  });

  it('toont de bron letterlijk in een details-blok', () => {
    expect(tekst(html)).toContain('Zo staat het in het leerplan KO 3.1.3, 3.1.4');
  });

  it('heeft h2 Minimumdoelen en geen andere koppen dan die', () => {
    expect(tel(html, /<h2[ >]/g)).toBe(1);
    expect(tel(html, /<h[13-6][ >]/g)).toBe(0);
  });

  it('zegt nooit dat er geen minimumdoel is', () => {
    expect(tekst(html)).not.toContain('geen enkel minimumdoel');
  });

  it('een doel dat er niet meer staat in de officiële gegevens krijgt een rustige zin, zonder fout', () => {
    const h = koppeling(doelVan('WT.086'), LEEG);
    expect(tekst(h)).toContain('Dit minimumdoel staat niet meer in de officiële gegevens.');
    expect(h).not.toContain('role="alert"');
  });

  it('tijdens het laden staan de links er al, met een laadregel; bij een fout een melding met opnieuw proberen', () => {
    const laden = koppeling(doelVan('WT.086'), LADEN);
    expect(laden).toContain('href="/basis/doel/ODS_3410/92929"');
    expect(tekst(laden)).toContain('Minimumdoel 3.1.3 wordt geladen');
    const fout = koppeling(doelVan('WT.086'), { status: 'fout', fout: 'Het lukte niet.', opnieuw: () => undefined });
    expect(fout).toContain('role="alert"');
    expect(tekst(fout)).toContain('Opnieuw proberen');
  });
});

describe('KoppelingLijst: zonder minimumdoel', () => {
  it('WT.008 is een eigen doel van het GO!: het leerplan koppelt het aan geen enkel minimumdoel', () => {
    const html = koppeling(doelVan('WT.008'));
    expect(tekst(html)).toContain('Het leerplan van het GO! koppelt dit doel aan geen enkel minimumdoel.');
    expect(html).not.toContain('/basis/doel/');
  });

  it('die zin staat er voor een doel als het klopt en alleen dan: bij alle 3490 doelen', () => {
    let zonder = 0;
    for (const lp of LEERPLAN.values()) {
      for (const d of lp.doelen) {
        const heeft = tekst(koppeling(d, LADEN)).includes('koppelt dit doel aan geen enkel minimumdoel');
        const chips = tekst(toon(createElement(KoppelingChips, { doel: d }))).includes('koppelt dit doel aan geen enkel minimumdoel');
        expect(heeft, d.code).toBe(isZonderMinimumdoel(d));
        expect(chips, d.code).toBe(isZonderMinimumdoel(d));
        if (heeft) zonder++;
      }
    }
    // Rechtzetting 2 van de rechter: 468 doelen zonder koppeling op de doelzin, 3 daarvan hebben er een via een MIA.
    expect(zonder).toBe(INDEX.leerplan.reduce((som, l) => som + l.zonderMinimumdoel, 0));
    expect(zonder).toBe(465);
  });
});

describe('KoppelingLijst: de koppeling via een onderdeel (MIA)', () => {
  it('WI.408 koppelt alleen via de MIA “Aftrekken:” aan L6 2.2.7, en zegt niet dat er geen minimumdoel is', () => {
    const html = koppeling(doelVan('WI.408'));
    const t = tekst(html);
    expect(t).toContain('Het leerplan koppelt een onderdeel van dit doel (MIA “Aftrekken:”) aan:');
    expect(t).toContain('Einde 6de leerjaar Minimumdoel 2.2.7');
    expect(html).toContain('href="/basis/doel/ODS_3407/93310"');
    expect(t).not.toContain('geen enkel minimumdoel');
    expect(t).toContain('Zo staat het in het leerplan MIA “Aftrekken:”: L6 2.2.7');
  });

  it('in de lijst staat zo een doel met chips en de woorden “via een onderdeel”', () => {
    const t = tekst(toon(createElement(KoppelingChips, { doel: doelVan('WI.408') })));
    expect(t).toContain('via een onderdeel van dit doel');
    expect(t).toContain('Einde 6de leerjaar 2.2.7');
    expect(t).not.toContain('geen enkel minimumdoel');
  });
});

describe('KoppelingLijst: voorstel voor MV.040', () => {
  const doel = doelVan('MV.040');
  const html = koppeling(doel);
  const t = tekst(html);

  it('toont het voorstel met de badge en de zin over “6.12”', () => {
    expect(t).toContain(GO_VOORSTEL_LABEL);
    expect(t).toContain('In het leerplan staat “6.12”. Dat is geen geldig nummer; waarschijnlijk is 6.1.2 bedoeld.');
    expect(html).toContain('href="/basis/doel/ODS_3417/92439"');
  });

  it('toont het voorstel met de tekst van minimumdoel 6.1.2 uit de API, en de officiële zonder badge', () => {
    expect(t).toContain(tekst(officieel('ODS_3417').get('92439')?.doelzinHtml ?? 'ontbreekt'));
    expect(tel(html, new RegExp(GO_VOORSTEL_LABEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toBe(1);
    expect(t).toContain('Zo staat het in het leerplan KO 6.1.1, 6.12 · L4 6.1.3, 6.1.4 · L6 6.1.3, 6.1.4');
  });

  it('is het enige voorstel van alle leerplandoelen', () => {
    const voorstellen = [...LEERPLAN.values()].flatMap((lp) =>
      lp.doelen.flatMap((d) => d.minimumdoelen.refs.filter((r) => r.status === 'voorstel').map(() => d.code)),
    );
    expect(voorstellen).toEqual(['MV.040']);
  });

  it('in de lijst staat het voorstel ook als voorstel, nooit als officieel', () => {
    const chips = toon(createElement(KoppelingChips, { doel }));
    expect(tekst(chips)).toContain(GO_VOORSTEL_LABEL);
    expect(tel(chips, /<li>/g)).toBe(6);
  });
});

describe('KoppelingLijst: twijfel en kapotte nummers', () => {
  it('WT.235 koppelt ook aan L6 3.3.2 voor leeftijden die er niet bij passen: onder “Hoe zeker is dit?” staat waarom', () => {
    const doel = doelVan('WT.235');
    const t = tekst(koppeling(doel));
    expect(t).toContain('Hoe zeker is dit?');
    expect(t).toContain('het leerplan koppelt het ook aan een doel voor het einde van het 6de leerjaar (3.3.2)');
    expect(t).toContain('Dit doel is voor 2,5-4 jaar');
  });

  it('twijfelZin noemt bij een ander vak het vak van het minimumdoel als dat bekend is', () => {
    const r = { set: 'ODS_3411', id: '92500', code: '4.2.3', moment: 'KO' as const, status: 'officieel' as const };
    expect(twijfelZin('ander-vak', r, { code: 'WI.706', leeftijden: ['4-5'] }, 'Aardrijkskunde')).toContain('het vak Aardrijkskunde');
    expect(twijfelZin('ander-vak', r, { code: 'WI.706', leeftijden: ['4-5'] })).toContain('een ander vak');
  });

  it('een kapot nummer zonder voorstel krijgt geen link maar een zin', () => {
    const basis = doelVan('WT.086');
    const kapot: GoLeerplandoel = {
      ...basis,
      minimumdoelen: { bron: { L4: '3.9.9' }, refs: [], problemen: [{ moment: 'L4', bronCode: '3.9.9', reden: 'bestaat-niet' }] },
    };
    const html = koppeling(kapot);
    expect(tekst(html)).toContain('In het leerplan staat ook “3.9.9” bij einde 4de leerjaar. Dat nummer bestaat niet in de officiële minimumdoelen.');
    expect(html).not.toContain('/basis/doel/');
    expect(tekst(html)).not.toContain('geen enkel minimumdoel');
    expect(redenZin('onleesbaar')).toBe('Dat is geen geldig nummer');
  });
});

// ── De leeftijdskiezer ───────────────────────────────────────────────────────

describe('LeeftijdKiezer', () => {
  const kies = (waarde: (typeof GO_LEEFTIJDEN)[number] | undefined) => toon(createElement(LeeftijdKiezer, { waarde, onKies: () => undefined }));

  it('heeft negen leeftijden en “Alle leeftijden”, precies één ingedrukt', () => {
    const html = kies('4-5');
    expect(tel(html, /<button /g)).toBe(10);
    expect(tel(html, /aria-pressed="true"/g)).toBe(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>4-5 jaar/);
    expect(tel(kies(undefined), /aria-pressed="true"/g)).toBe(1);
    expect(kies(undefined)).toMatch(/aria-pressed="true"[^>]*>Alle leeftijden/);
  });

  it('zegt eerst de leeftijd en dan “meestal …”, met de badge waarschijnlijk en de uitleg', () => {
    const t = tekst(kies('2,5-4'));
    expect(t).toContain('2,5-4 jaar: meestal instapklas en 1ste kleuterklas waarschijnlijk');
    expect(t).toContain('Hoe zeker is dit?');
    expect(t).toContain('Het GO! deelt zijn leerplan in per leeftijd.');
  });

  it('zonder keuze staat er geen “meestal”', () => {
    expect(tekst(kies(undefined))).not.toContain('meestal');
  });

  it('toont de aantallen tussen haakjes', () => {
    const html = toon(createElement(LeeftijdKiezer, { waarde: undefined, onKies: () => undefined, aantallen: { '2,5-4': 48 } }));
    expect(tekst(html)).toContain('2,5-4 jaar (48)');
  });
});

// ── Het overzicht ────────────────────────────────────────────────────────────

describe('GoInhoud (#/basis/go)', () => {
  const html = toon(createElement(GoInhoud, { index: INDEX }));

  it('heeft één h1 en geen main (die staat in BasisSchil)', () => {
    expect(tel(html, /<h1[ >]/g)).toBe(1);
    expect(tekst(html)).toContain('Leerplan en lesplannen van het GO!');
    expect(html).not.toContain('<main');
  });

  it('toont twaalf vaktegels met hun aantal doelen en een link naar het vak', () => {
    for (const l of INDEX.leerplan) {
      expect(html, l.vak).toContain(`href="/basis/leerplandoelen/${l.vak.toLowerCase()}"`);
    }
    expect(tel(html, /class="b-vaktegel"/g)).toBe(12);
    const t = tekst(html);
    expect(t).toContain('528 leerplandoelen');
    expect(t).toContain('3490 leerplandoelen in 12 vakken');
    expect(t).toContain('Burgerschap');
    expect(t).toContain('Leren leren');
    expect(t).toContain('Sociale vaardigheden');
  });

  it('toont de lesplannen onder hun leeftijd, met eerst de leeftijd en dan het meestal', () => {
    const t = tekst(html);
    expect(t).toContain('2,5-4 jaar (8 lesplannen)');
    expect(t).toContain('meestal instapklas en 1ste kleuterklas waarschijnlijk');
    for (const l of INDEX.lesplannen) expect(html, l.code).toContain(`href="/basis/lesplan/${l.code}"`);
    expect(tel(html, /<h3[ >]/g)).toBe(1);
  });

  it('heeft een bronvermelding met de naamsvermelding van het GO! en een link naar GO! studio', () => {
    expect(tekst(html)).toContain('Bron: GO! onderwijs van de Vlaamse Gemeenschap, het nieuwe GO! leerplan basisonderwijs en de lesplannen uit GO! studio. Letterlijk overgenomen met toestemming.');
    expect(html).toContain('href="https://studio.g-o.be/"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('de inleiding beweert niet dat elk leerplandoel bij een minimumdoel hoort (465 van de 3490 hebben er geen)', () => {
    const t = tekst(html);
    expect(t).not.toContain('Elk leerplandoel');
    expect(t).toContain('De meeste leerplandoelen van het GO! horen bij een of meer minimumdoelen van de overheid, een aantal heeft er geen.');
    expect(INDEX.leerplan.reduce((som, l) => som + l.zonderMinimumdoel, 0)).toBeGreaterThan(0);
  });

  it('zonder lesplannen is er geen deel Lesplannen', () => {
    const zonder = toon(createElement(GoInhoud, { index: { ...INDEX, lesplannen: [] } }));
    expect(tekst(zonder)).not.toContain('Lesplannen per leeftijd');
    expect(tel(zonder, /<h1[ >]/g)).toBe(1);
  });
});

// ── De leerplandoelen van een vak ────────────────────────────────────────────

describe('lijstItems', () => {
  const wt = LEERPLAN.get('WT') as GoLeerplanBestand;

  it('zonder filter alle doelen, in bronvolgorde, elk één keer', () => {
    for (const [vak, lp] of LEERPLAN) {
      const { items, aantal } = lijstItems(lp, {});
      const doelen = items.flatMap((i) => (i.soort === 'doel' ? [i.doel.code] : []));
      expect(aantal, vak).toBe(lp.doelen.length);
      expect(doelen, vak).toEqual(lp.doelen.map((d) => d.code));
    }
  });

  it('per leeftijd klopt het aantal met de index, voor alle vakken en leeftijden', () => {
    for (const l of INDEX.leerplan) {
      const lp = LEERPLAN.get(l.vak) as GoLeerplanBestand;
      expect(aantalPerLeeftijd(lp), l.vak).toEqual(l.perLeeftijd);
      for (const leeftijd of GO_LEEFTIJDEN) expect(lijstItems(lp, { leeftijd }).aantal, `${l.vak} ${leeftijd}`).toBe(l.perLeeftijd[leeftijd]);
    }
    expect(lijstItems(wt, { leeftijd: '2,5-4' }).aantal).toBe(48);
  });

  it('“zonder minimumdoel” geeft precies het aantal van de index', () => {
    for (const l of INDEX.leerplan) {
      expect(lijstItems(LEERPLAN.get(l.vak) as GoLeerplanBestand, { zonderMinimumdoel: true }).aantal, l.vak).toBe(l.zonderMinimumdoel);
    }
    expect(lijstItems(wt, { zonderMinimumdoel: true }).items.every((i) => i.soort === 'kop' || isZonderMinimumdoel(i.doel))).toBe(true);
  });

  it('elke kop heeft minstens één doel eronder, en een kop slaat nooit een niveau over', () => {
    for (const [vak, lp] of LEERPLAN) {
      for (const filter of [{}, { leeftijd: '5-6' as const }, { zonderMinimumdoel: true }]) {
        const { items } = lijstItems(lp, filter);
        let vorigNiveau = 1;
        items.forEach((it, n) => {
          if (it.soort !== 'kop') return;
          if (it.niveau > 0) {
            expect(it.niveau, `${vak} ${it.rubriek.id}`).toBeLessThanOrEqual(vorigNiveau + 1);
            vorigNiveau = it.niveau;
          }
          expect(items.slice(n + 1).some((x) => x.soort === 'doel'), `${vak} ${it.rubriek.id}`).toBe(true);
          expect(items[n + 1], `${vak} ${it.rubriek.id}`).toBeDefined();
        });
      }
    }
  });

  it('een subrubriek is een tussenregel (niveau 0), nooit een kop', () => {
    const niveaus = new Set(lijstItems(LEERPLAN.get('WI') as GoLeerplanBestand, {}).items.flatMap((i) => (i.soort === 'kop' ? [i.niveau] : [])));
    expect(niveaus.has(0)).toBe(true);
    expect([...niveaus].every((n) => [0, 2, 3, 4].includes(n))).toBe(true);
  });

  it('een rubriek houdt alleen de doelen eronder, met de koppen erboven', () => {
    const onderwerp = wt.rubrieken.find((r) => r.ouder === undefined) as GoLeerplanBestand['rubrieken'][number];
    const { items, aantal } = lijstItems(wt, { rubriek: onderwerp.id });
    expect(aantal).toBeGreaterThan(0);
    expect(aantal).toBeLessThan(wt.doelen.length);
    expect(items[0]).toMatchObject({ soort: 'kop', rubriek: { id: onderwerp.id } });
    expect(lijstItems(wt, { rubriek: 'WT-r999' }).aantal).toBe(wt.doelen.length);
  });

  it('onderwerpKeuzes telt na de andere filters en samen alle doelen', () => {
    const keuzes = onderwerpKeuzes(wt, {});
    expect(keuzes.reduce((s, k) => s + k.aantal, 0)).toBe(wt.doelen.length);
    expect(onderwerpKeuzes(wt, { leeftijd: '2,5-4' }).reduce((s, k) => s + k.aantal, 0)).toBe(48);
  });

  it('blokkenVan zet aangrenzende doelen in één lijst', () => {
    const blokken = blokkenVan(lijstItems(wt, { leeftijd: '2,5-4' }).items);
    expect(blokken.filter((b) => b.soort === 'doelen').reduce((s, b) => s + (b.soort === 'doelen' ? b.doelen.length : 0), 0)).toBe(48);
    for (let n = 1; n < blokken.length; n++) expect(blokken[n].soort === 'doelen' && blokken[n - 1].soort === 'doelen').toBe(false);
  });
});

describe('LeerplandoelenInhoud (WT, 2,5-4 jaar)', () => {
  const wt = LEERPLAN.get('WT') as GoLeerplanBestand;
  const maak = (filter: Parameters<typeof LeerplandoelenInhoud>[0]['filter']) =>
    toon(
      createElement(LeerplandoelenInhoud, {
        leerplan: wt,
        index: INDEX,
        filter,
        onLeeftijd: () => undefined,
        onZonder: () => undefined,
        rubriekPad: (r) => `/basis/leerplandoelen/wt${r ? `?rubriek=${r}` : ''}`,
      }),
    );
  const html = maak({ leeftijd: '2,5-4' });

  it('heeft één h1, geen h5 en geen overgeslagen koppen', () => {
    expect(tel(html, /<h1[ >]/g)).toBe(1);
    expect(tekst(html)).toContain('Leerplan van het GO!: wetenschap en techniek');
    expect(tel(html, /<h5[ >]/g)).toBe(0);
    expect(tel(html, /<h2[ >]/g)).toBeGreaterThan(0);
    const niveaus = [...html.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
    for (let n = 1; n < niveaus.length; n++) expect(niveaus[n]).toBeLessThanOrEqual(niveaus[n - 1] + 1);
  });

  it('toont de 48 doelen van 2,5-4 jaar met code, kennisverwerking, tekst en minimumdoelen', () => {
    expect(tel(html, /class="b-go-doel"/g)).toBe(48);
    expect(tekst(html)).toContain('48 van de 528 leerplandoelen voor 2,5-4 jaar.');
    expect(tekst(html)).toContain('WT.086 begrijpen Herkennen dat mensen leven geven aan nieuwe mensen. (2,5-4 jaar, 4-5 jaar)');
    expect(html).toContain('<span class="sr-only">Kennisverwerking: </span>begrijpen');
    expect(html).toContain('href="/basis/leerplandoel/WT.086"');
    expect(html).toContain('href="/basis/doel/ODS_3410/92929"');
    expect(tekst(html)).toContain('Lesplan: LP0001');
  });

  it('toont de kiezer met 2,5-4 jaar ingedrukt en het filter zonder minimumdoel', () => {
    expect(html).toMatch(/aria-pressed="true"[^>]*>2,5-4 jaar/);
    expect(html).toContain('type="checkbox"');
    expect(tekst(html)).toContain('Alleen doelen zonder minimumdoel (106 in dit vak)');
    expect(html).not.toContain('checked');
  });

  it('met het filter zonder minimumdoel staan alleen die doelen er, en WT.008 hoort erbij', () => {
    const z = maak({ leeftijd: '2,5-4', zonderMinimumdoel: true });
    expect(z).toContain('checked');
    expect(tekst(z)).toContain('WT.008');
    expect(tekst(z)).not.toContain('WT.086');
    expect(tekst(z)).toContain('koppelt dit doel aan geen enkel minimumdoel');
  });

  it('zonder leeftijd staan alle 528 doelen er; zonder uitkomst staat er een zin', () => {
    const alles = maak({});
    expect(tel(alles, /class="b-go-doel"/g)).toBe(528);
    expect(tekst(alles)).toContain('528 van de 528 leerplandoelen.');
    const leeg = maak({ leeftijd: '11-12', zonderMinimumdoel: true, rubriek: wt.rubrieken[wt.rubrieken.length - 1]?.id });
    expect(tekst(leeg).includes('Geen leerplandoelen voor deze keuze.') || tel(leeg, /class="b-go-doel"/g) > 0).toBe(true);
  });

  it('een gekozen onderwerp krijgt aria-current en een link om het hele vak te tonen', () => {
    const onderwerp = wt.rubrieken.find((r) => r.ouder === undefined) as GoLeerplanBestand['rubrieken'][number];
    const h = maak({ leeftijd: '2,5-4', rubriek: onderwerp.id });
    expect(h).toContain('aria-current="true"');
    expect(tekst(h)).toContain('Toon het hele vak');
  });

  it('heeft de bronvermelding van de doelenset', () => {
    expect(tekst(html)).toContain('Bron: GO! onderwijs van de Vlaamse Gemeenschap, het nieuwe GO! leerplan basisonderwijs, doelenset wetenschap en techniek. Letterlijk overgenomen met toestemming.');
  });

  it('elk vak toont zijn eigen leerplan met één h1', () => {
    for (const [vak, lp] of LEERPLAN) {
      const h = toon(
        createElement(LeerplandoelenInhoud, { leerplan: lp, index: INDEX, filter: { leeftijd: '9-10' }, onLeeftijd: () => undefined, onZonder: () => undefined, rubriekPad: () => '/' }),
      );
      expect(tel(h, /<h1[ >]/g), vak).toBe(1);
      expect(tel(h, /class="b-go-doel"/g), vak).toBe(INDEX.leerplan.find((l) => l.vak === vak)?.perLeeftijd['9-10']);
    }
  });
});

// ── Eén leerplandoel ─────────────────────────────────────────────────────────

describe('LeerplandoelInhoud', () => {
  const klaar = (codes: string[]): LesplannenBijDoel => ({ status: 'klaar', lesplannen: codes.map(lesplanVan) });
  const pagina = (code: string, teksten: MinimumdoelTeksten = KLAAR, lesplannen: LesplannenBijDoel = klaar(INDEX.lesplannen.filter((l) => l.doelen.includes(code)).map((l) => l.code))) =>
    toon(createElement(LeerplandoelInhoud, { doel: doelVan(code), leerplan: LEERPLAN.get(code.slice(0, 2) as GoVak) as GoLeerplanBestand, index: INDEX, minimumdoelen: teksten, lesplannen }));

  describe('WT.086', () => {
    const html = pagina('WT.086');
    const t = tekst(html);

    it('heeft één h1 en de letterlijke tekst, kennisverwerking en leeftijden', () => {
      expect(tel(html, /<h1[ >]/g)).toBe(1);
      expect(t).toContain('Leerplandoel WT.086');
      expect(t).toContain('Herkennen dat mensen leven geven aan nieuwe mensen.');
      expect(html).toContain('<span class="sr-only">Kennisverwerking: </span>begrijpen');
      expect(html).toContain('href="/basis/leerplandoelen/wt?leerjaar=K1"');
      expect(html).toContain('href="/basis/leerplandoelen/wt?leerjaar=K2"');
    });

    it('zegt eerst de leeftijd, dan pas “meestal”, met de badge waarschijnlijk en de uitleg', () => {
      expect(t).toContain('Leeftijd: 2,5-4 jaar 4-5 jaar waarschijnlijk');
      expect(t.indexOf('2,5-4 jaar')).toBeLessThan(t.indexOf('meestal'));
      expect(t).toContain('2,5-4 jaar: meestal instapklas en 1ste kleuterklas');
      expect(t).toContain('4-5 jaar: meestal 2de kleuterklas');
      expect(t).toContain('Het GO! deelt zijn leerplan in per leeftijd.');
    });

    it('toont de inhoud, het rubriekpad, de koppeling met de tekst uit de API en de lesplannen met hun ik-doelen', () => {
      expect(t).toContain('Inhoud');
      expect(t).toContain('Leven geven: De baby groeit eerst in de buik van de mama.');
      expect(t).toContain(tekst(officieel('ODS_3410').get('92929')?.doelzinHtml ?? 'ontbreekt'));
      expect(t).toContain('Lesplannen met dit doel');
      expect(t).toContain('Lesplan LP0001');
      expect(html).toContain('href="/basis/lesplan/LP0001"');
      expect(t).toContain('De groeigoeroe mens (2,5-4 jaar): Ik herken zwangere vrouwen.');
      expect(html).toContain('class="b-kruimel"');
      expect(html).toContain('aria-label="Kruimelpad"');
    });

    it('heeft de bronvermelding en links terug naar het vak en het overzicht', () => {
      expect(t).toContain('Bron: GO! onderwijs van de Vlaamse Gemeenschap, het nieuwe GO! leerplan basisonderwijs, doelenset wetenschap en techniek. Letterlijk overgenomen met toestemming.');
      expect(html).toContain('href="/basis/go"');
    });

    it('heeft geen deel zonder inhoud: geen vlaggen en schakels, want dit doel heeft er geen', () => {
      expect(t).not.toContain('Vlaggen en schakels');
    });
  });

  describe('WT.008 (een eigen doel van het GO!)', () => {
    const html = pagina('WT.008');
    const t = tekst(html);

    it('zegt dat het leerplan het doel aan geen enkel minimumdoel koppelt', () => {
      expect(t).toContain('Het leerplan van het GO! koppelt dit doel aan geen enkel minimumdoel.');
      expect(html).not.toContain('/basis/doel/');
    });

    it('toont de tekst van de Excel en wat lesplan LP0065 zelf schrijft', () => {
      expect(t).toContain('Herkennen verschillende voedingswijzen van dieren.');
      expect(t).toContain('In lesplan LP0065 staat: “Herkennen de belangrijkste voedingswijze van dieren.”');
      expect(tekstInLesplan(lesplanVan('LP0065'), doelVan('WT.008'))).toBe('Herkennen de belangrijkste voedingswijze van dieren.');
      expect(tekstInLesplan(lesplanVan('LP0065'), doelVan('WT.001'))).toBeUndefined();
      // Alleen een spatie achteraan in de Excel: geen afwijking van het GO!.
      expect(doelVan('WT.039').tekst).not.toBe(lesplanVan('LP0074').afgeleid.leerplandoelen.find((d) => d.code === 'WT.039')?.tekst);
      expect(tekstInLesplan(lesplanVan('LP0074'), doelVan('WT.039'))).toBeUndefined();
    });

    it('toont de voorbeelden met hun titel', () => {
      expect(t).toContain('Voedingswijze: Schapen eten gras, kikkers eten insecten.');
    });
  });

  describe('MV.040', () => {
    const html = pagina('MV.040');
    const t = tekst(html);

    it('toont het voorstel, gemarkeerd, en een vlag naar LL.106', () => {
      expect(t).toContain(GO_VOORSTEL_LABEL);
      expect(t).toContain('waarschijnlijk is 6.1.2 bedoeld');
      expect(t).toContain('Vlaggen en schakels');
      expect(html).toContain('href="/basis/leerplandoel/LL.106"');
    });

    it('toont alle negen leeftijden', () => {
      for (const l of GO_LEEFTIJDEN) expect(t).toContain(`${l} jaar`);
    });
  });

  describe('kapotte vlaggen en schakels', () => {
    it('NL.096 toont de kapotte vlag letterlijk, zonder link', () => {
      const html = pagina('NL.096');
      expect(tekst(html)).toContain('“NL.3441 BU.146”');
      // Geen link: de tekst staat er wel, maar niet in een href.
      expect(html).not.toMatch(/href="[^"]*NL\.3441/);
    });
  });

  it('de lijst van lesplannen komt uit de index; een doel zonder lesplannen heeft geen deel Lesplannen', () => {
    expect(tekst(pagina('WT.086', KLAAR, { status: 'klaar', lesplannen: [] }))).toContain('Lesplannen met dit doel');
    expect(tekst(pagina('WT.200'))).not.toContain('Lesplannen met dit doel');
  });

  it('elke pagina heeft precies één h1, voor alle 3490 doelen', () => {
    for (const lp of LEERPLAN.values()) {
      for (const d of lp.doelen) {
        const h = toon(createElement(LeerplandoelInhoud, { doel: d, leerplan: lp, index: INDEX, minimumdoelen: LADEN, lesplannen: { status: 'klaar', lesplannen: [] } }));
        expect(tel(h, /<h1[ >]/g), d.code).toBe(1);
        expect(tel(h, /<h[56][ >]/g), d.code).toBe(0);
      }
    }
  });
});
