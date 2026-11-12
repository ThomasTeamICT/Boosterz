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
import { KoppelingChips, KoppelingLijst, redenZin, twijfelZin, vakInZin, type MinimumdoelTeksten } from '../../components/basis/go/KoppelingLijst';
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
import { isZonderMinimumdoel } from '../../lib/basis/go/goModel';
import { basisSet } from '../../lib/basis/moment';
import type { MinimumdoelenIndexSet, MinimumdoelenSetBestand } from '../../lib/minimumdoelen';
import { GoInhoud } from './GoScherm';
import { LeerplandoelInhoud, tekstInLesplan, type LesplannenBijDoel } from './LeerplandoelScherm';
import { LeerplandoelenInhoud, aantalPerLeeftijd, blokkenVan, lesplanLinkTekst, lijstItems, onderwerpKeuzes } from './LeerplandoelenScherm';
import { LesplanInhoud } from './LesplanScherm';

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

  it('is met WI.706 (vorm B) een van de twee voorstellen van alle leerplandoelen', () => {
    const voorstellen = [...LEERPLAN.values()].flatMap((lp) =>
      lp.doelen.flatMap((d) => d.minimumdoelen.refs.filter((r) => r.status === 'voorstel').map(() => d.code)),
    );
    expect(voorstellen).toEqual(['MV.040', 'WI.706']);
  });

  it('vorm A blijft letterlijk zoals ze was: de kaart van 6.1.2 met badge en zin, zonder zin over een ander vak', () => {
    const kaart = html.slice(html.indexOf('href="/basis/doel/ODS_3417/92439"'));
    expect(kaart.slice(0, kaart.indexOf('</p>', kaart.indexOf('b-go-voorstel')) + 4)).toContain(
      `Minimumdoel 6.1.2</a><span class="badge badge-warn">${GO_VOORSTEL_LABEL}</span></p><p class="b-go-voorstel">In het leerplan staat “6.12”. Dat is geen geldig nummer; waarschijnlijk is 6.1.2 bedoeld.</p>`,
    );
    expect(t).not.toContain('Het GO! verwijst naar');
  });

  it('in de lijst staat het voorstel ook als voorstel, nooit als officieel', () => {
    const chips = toon(createElement(KoppelingChips, { doel }));
    expect(tekst(chips)).toContain(GO_VOORSTEL_LABEL);
    expect(tel(chips, /<li>/g)).toBe(6);
  });
});

describe('KoppelingLijst: voorstel naast een koppeling met een ander vak (WI.706, vorm B, 11 november 2026)', () => {
  const doel = doelVan('WI.706');
  const html = koppeling(doel);
  const t = tekst(html);

  it('de officiële koppeling met 4.2.3 blijft staan, met de tekst van het minimumdoel en zonder badge', () => {
    expect(html).toContain('href="/basis/doel/ODS_3411/92500"');
    // De tekst komt uit de officiële set (ODS_3411/92500), niet uit de Excel van het GO!.
    expect(officieel('ODS_3411').get('92500')?.doelzinHtml).toContain('De kleuters kennen de volgende begrippen met betrekking tot infrastructuur');
    expect(t).toContain('Einde kleuter Minimumdoel 4.2.3 De kleuters kennen de volgende begrippen met betrekking tot infrastructuur');
    expect(t).toContain('Volgens het leerplan van het GO! hoort dit leerplandoel bij:');
    expect(t).toContain('Zo staat het in het leerplan KO 4.2.3');
  });

  it('daarna 2.4.3 als voorstel, met de badge, de zin van Boosterz en de tekst van het minimumdoel', () => {
    expect(html.indexOf('ODS_3411/92500')).toBeLessThan(html.indexOf('ODS_3405/93005'));
    expect(html).toContain('href="/basis/doel/ODS_3405/93005"');
    expect(tel(html, new RegExp(GO_VOORSTEL_LABEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toBe(1);
    expect(t).toContain(`Minimumdoel 2.4.3 ${GO_VOORSTEL_LABEL} Het GO! verwijst naar 4.2.3, een minimumdoel van aardrijkskunde. Waarschijnlijk is 2.4.3 bedoeld.`);
    expect(t).toContain(tekst(officieel('ODS_3405').get('93005')?.doelzinHtml ?? 'ontbreekt'));
  });

  it('onder "Hoe zeker is dit?" staat de twijfel bij 4.2.3; geen zin over een kapot nummer', () => {
    expect(t).toContain('Hoe zeker is dit? Het leerplan koppelt WI.706 aan minimumdoel 4.2.3, een doel van een ander vak (Aardrijkskunde) dan dat van dit leerplandoel.');
    expect(t).not.toMatch(/In het leerplan staat|geen geldig nummer|bestaat niet in de officiële/);
  });

  it('in de lijst: de chip 4.2.3 met de twijfel en de chip 2.4.3 met het voorstel-label', () => {
    const chips = toon(createElement(KoppelingChips, { doel }));
    expect(tel(chips, /<li>/g)).toBe(2);
    expect(tekst(chips)).toBe(
      `Minimumdoelen: Einde kleuter 4.2.3 let op: dit minimumdoel hoort bij een ander vak Einde kleuter 2.4.3 ${GO_VOORSTEL_LABEL} Open het leerplandoel voor wat er niet past.`,
    );
  });

  it('vakInZin: de naam van het vak zoals midden in een zin', () => {
    expect([4, 3, 1, 8, 10, 99].map(vakInZin)).toEqual(['aardrijkskunde', 'wetenschap en techniek', 'Nederlands', 'ICT', 'Frans', undefined]);
  });
});

describe('KoppelingLijst: twijfel en kapotte nummers', () => {
  it('WT.235 koppelt ook aan L6 3.3.2 voor leeftijden die er niet bij passen: onder “Hoe zeker is dit?” staat waarom', () => {
    const doel = doelVan('WT.235');
    const t = tekst(koppeling(doel));
    expect(t).toContain('Hoe zeker is dit?');
    expect(t).toContain('Dit leerplandoel is voor 2,5-4 jaar, 4-5 jaar');
    expect(t).toContain('maar het leerplan van het GO! koppelt het aan minimumdoel 3.3.2, een doel voor het einde van het 6de leerjaar. Zo staat het in het leerplan.');
    expect(t).not.toContain(' ook aan een doel');
  });

  it('twijfelZin noemt bij een ander vak het vak van het minimumdoel als dat bekend is', () => {
    const r = { set: 'ODS_3411', id: '92500', code: '4.2.3', moment: 'KO' as const, status: 'officieel' as const };
    expect(twijfelZin('ander-vak', r, { code: 'WI.706', leeftijden: ['4-5'] }, 'Aardrijkskunde')).toBe(
      'Het leerplan koppelt WI.706 aan minimumdoel 4.2.3, een doel van een ander vak (Aardrijkskunde) dan dat van dit leerplandoel.',
    );
    expect(twijfelZin('ander-vak', r, { code: 'WI.706', leeftijden: ['4-5'] })).toBe(
      'Het leerplan koppelt WI.706 aan minimumdoel 4.2.3, een doel van een ander vak dan dat van dit leerplandoel.',
    );
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
    expect(t).toContain('Het GO! deelt zijn leerplan in per leeftijd, niet per leerjaar.');
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

  it('een subrubriek is een kop, één niveau onder haar ouder, en de niveaus zitten tussen 2 en 5', () => {
    const wi = LEERPLAN.get('WI') as GoLeerplanBestand;
    const items = lijstItems(wi, {}).items;
    const niveaus = new Set(items.flatMap((i) => (i.soort === 'kop' ? [i.niveau] : [])));
    expect([...niveaus].every((n) => [2, 3, 4, 5].includes(n))).toBe(true);
    const subs = items.flatMap((i) => (i.soort === 'kop' && i.rubriek.soort === 'subrubriek' ? [i] : []));
    expect(subs.length).toBeGreaterThan(0);
    const perId = new Map(items.flatMap((i) => (i.soort === 'kop' ? [[i.rubriek.id, i.niveau] as const] : [])));
    for (const s of subs) {
      const ouder = s.rubriek.ouder === undefined ? undefined : perId.get(s.rubriek.ouder);
      if (ouder !== undefined) expect(s.niveau, s.rubriek.id).toBe(Math.min(ouder + 1, 5));
    }
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

  it('heeft één h1 en geen overgeslagen koppen', () => {
    expect(tel(html, /<h1[ >]/g)).toBe(1);
    expect(tekst(html)).toContain('Leerplan van het GO!: wetenschap en techniek');
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

  it('toont een lesplanlink met de code en de titel uit de index, en alleen de code zonder index', () => {
    const l = INDEX.lesplannen.find((x) => x.doelen.includes('WT.001'));
    expect(l).toBeDefined();
    expect(lesplanLinkTekst({ code: 'LP0065', titel: 'Dieren classificeren' })).toBe('LP0065 Dieren classificeren');
    expect(lesplanLinkTekst({ code: 'LP0065' })).toBe('LP0065');
    expect(html).toContain(`href="/basis/lesplan/${l?.code}"`);
    expect(tekst(html)).toContain(`${l?.code} ${l?.titel}`);
    const zonderIndex = toon(
      createElement(LeerplandoelenInhoud, { leerplan: wt, filter: { leeftijd: '2,5-4' }, onLeeftijd: () => undefined, onZonder: () => undefined, rubriekPad: () => '/' }),
    );
    expect(zonderIndex).not.toContain('/basis/lesplan/');
  });

  it('houdt de omhulsels van de drie kolommen en de oude klasse van het doel (de tellingen hierboven en GoBijDoel lezen die)', () => {
    expect(tel(html, /class="b-go-doelmidden"/g)).toBe(48);
    expect(tel(html, /class="b-go-doelzij"/g)).toBe(48);
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
      expect(t).toContain('Kennisverwerking: begrijpen');
      expect(html).toContain('href="/basis/leerplandoelen/wt?leerjaar=K1"');
      expect(html).toContain('href="/basis/leerplandoelen/wt?leerjaar=K2"');
    });

    it('zegt eerst de leeftijd, dan pas “meestal”, met de badge waarschijnlijk en de uitleg', () => {
      expect(t).toContain('Leeftijd: 2,5-4 jaar 4-5 jaar');
      expect(t).not.toMatch(/4-5 jaar\s*waarschijnlijk/);
      expect(t).toContain('Welk leerjaar is dat meestal?');
      expect(t.indexOf('2,5-4 jaar')).toBeLessThan(t.indexOf('meestal'));
      expect(t).toContain('2,5-4 jaar: meestal instapklas en 1ste kleuterklas');
      expect(t).toContain('4-5 jaar: meestal 2de kleuterklas');
      expect(t).toContain('Het GO! deelt zijn leerplan in per leeftijd, niet per leerjaar.');
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

    it('zet de ik-zinnen per diploma als lijst, onder het woord Diploma met de naam van het diploma', () => {
      expect(html).toContain('Diploma <strong>De groeigoeroe mens</strong>');
      expect(html).toContain('<ul class="b-go-ikzinnen"><li>Ik herken zwangere vrouwen.</li><li>Ik weet dat een baby in de buik van mama groeit.</li>');
    });

    it('geeft WT.229 vijf aparte items (LP0014b) en zet een regeleinde in een zin als <br/> (WT.021, LP0087)', () => {
      const zinnen = (h: string) => /<ul class="b-go-ikzinnen">(.*?)<\/ul>/.exec(h)?.[1] ?? '';
      expect(zinnen(pagina('WT.229')).match(/<li>/g)).toHaveLength(5);
      expect(zinnen(pagina('WT.021'))).toContain('zoogdieren.<br/>vb. ');
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

  describe('WI.706 (vorm B: voorstel naast een koppeling met een ander vak)', () => {
    const html = pagina('WI.706');
    const t = tekst(html);

    it('toont de officiële koppeling met 4.2.3 en het voorstel 2.4.3, gemarkeerd, met de zin van Boosterz', () => {
      expect(tel(html, /<h1[ >]/g)).toBe(1);
      expect(html).toContain('href="/basis/doel/ODS_3411/92500"');
      expect(html).toContain('href="/basis/doel/ODS_3405/93005"');
      expect(t).toContain(GO_VOORSTEL_LABEL);
      expect(t).toContain('Het GO! verwijst naar 4.2.3, een minimumdoel van aardrijkskunde. Waarschijnlijk is 2.4.3 bedoeld.');
      expect(t).toContain('Hoe zeker is dit?');
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

// ── De index laadt niet (CT-8) ───────────────────────────────────────────────
// Dan ontbreken de lesplannen bij een doel en de links in een lesplan. De pagina zegt dat, met 'Opnieuw proberen', in plaats
// van stil onvolledig te lijken.

describe('als de index niet laadt', () => {
  const FOUT = 'De gegevens van het GO! konden niet geladen worden. Kijk je internetverbinding na en probeer opnieuw.';
  const indexFout = { fout: FOUT, opnieuw: () => undefined };
  const geenLesplannen: LesplannenBijDoel = { status: 'klaar', lesplannen: [] };
  const leerplandoel = (code: string, fout?: typeof indexFout) =>
    toon(
      createElement(LeerplandoelInhoud, {
        doel: doelVan(code),
        leerplan: LEERPLAN.get(code.slice(0, 2) as GoVak) as GoLeerplanBestand,
        minimumdoelen: KLAAR,
        lesplannen: geenLesplannen,
        indexFout: fout,
      }),
    );

  it('de leerplandoelpagina toont het deel “Lesplannen met dit doel” met de melding en “Opnieuw proberen”', () => {
    for (const code of ['WT.086', 'WT.200']) {
      const html = leerplandoel(code, indexFout);
      const t = tekst(html);
      expect(t, code).toContain(`Lesplannen met dit doel ${FOUT} Opnieuw proberen`);
      expect(html, code).toContain('role="alert"');
      expect(html, code).toContain('<span class="sr-only"> (lesplannen met dit doel)</span>');
      expect(tel(html, /<h2[ >][^<]*Lesplannen met dit doel/g), code).toBe(1);
    }
  });

  it('zolang de index laadt, staat het deel er niet en is er geen melding', () => {
    const html = leerplandoel('WT.086');
    expect(tekst(html)).not.toContain('Lesplannen met dit doel');
    expect(html).not.toContain('role="alert"');
  });

  it('het lesplan zegt onder “Leerplandoelen” dat de links ontbreken, met “Opnieuw proberen”', () => {
    const html = toon(createElement(LesplanInhoud, { lesplan: lesplanVan('LP0065'), koppelingen: { status: 'laden' }, indexFout }));
    const kop = html.indexOf('<h3>Leerplandoelen</h3>');
    const melding = html.indexOf(FOUT);
    expect(kop).toBeGreaterThan(-1);
    expect(melding).toBeGreaterThan(kop);
    expect(melding).toBeLessThan(html.indexOf('class="b-lp-doel"'));
    expect(html).toContain('<span class="sr-only"> (links naar de leerplandoelen)</span>');
    expect(tel(html, /Opnieuw proberen/g)).toBe(1);
    expect(html).not.toContain('href="/basis/leerplandoel/');
  });

  it('het lesplan met twee fouten (leerplan en index) heeft twee meldingen die een schermlezer uit elkaar houdt', () => {
    const html = toon(
      createElement(LesplanInhoud, { lesplan: lesplanVan('LP0065'), koppelingen: { status: 'fout', fout: FOUT, opnieuw: () => undefined }, indexFout }),
    );
    expect(tel(html, /Opnieuw proberen/g)).toBe(2);
    expect(html).toContain('<span class="sr-only"> (minimumdoelen)</span>');
    expect(html).toContain('<span class="sr-only"> (links naar de leerplandoelen)</span>');
  });

  it('de lijst van een vak toont boven de doelen de melding met “Opnieuw proberen”', () => {
    const html = toon(
      createElement(LeerplandoelenInhoud, {
        leerplan: LEERPLAN.get('WT') as GoLeerplanBestand,
        filter: { leeftijd: '2,5-4' },
        onLeeftijd: () => undefined,
        onZonder: () => undefined,
        rubriekPad: () => '/',
        indexFout,
      }),
    );
    const melding = html.indexOf(FOUT);
    expect(melding).toBeGreaterThan(-1);
    expect(melding).toBeLessThan(html.indexOf('class="b-go-doel"'));
    expect(html).toContain('<span class="sr-only"> (lesplannen bij de doelen)</span>');
    expect(tekst(html)).not.toContain('Lesplan: LP0001');
  });
});

// ── Pakket D: de koppeling op één plek, één keer, en op de goede plaats ──────────────────────────────────────

const ALLE_DOELEN = [...LEERPLAN.values()].flatMap((lp) => lp.doelen);
/** Elke verwijzing van een doel (doelzin en onderdelen) als [set, id]. */
const refsVan = (d: GoLeerplandoel) => [d.minimumdoelen, ...d.inhoud.flatMap((i) => ('koppeling' in i && i.koppeling ? [i.koppeling] : []))].flatMap((k) => k.refs);
const hrefs = (html: string) => [...html.matchAll(/href="(\/basis\/doel\/[^"]+)"/g)].map((m) => m[1]);

describe('twijfelZin: past niet bij de leeftijd (TU-5)', () => {
  it('zegt “leerplandoel”, niet “ook”, en dat het zo in het leerplan staat; BU.009 heeft maar één koppeling', () => {
    const doel = doelVan('BU.009');
    expect(refsVan(doel)).toHaveLength(1);
    const t = tekst(koppeling(doel));
    expect(t).toContain('Hoe zeker is dit?');
    expect(t).toMatch(/Dit leerplandoel is voor 10-11 jaar, maar het leerplan van het GO! koppelt het aan minimumdoel 5\.3\.1, een doel voor het einde van het 4de leerjaar\. Zo staat het in het leerplan\./);
    expect(t).not.toMatch(/koppelt het ook aan/);
  });

  it('de twijfelzin bevat nooit “ook”, voor geen enkel doel met twijfel', () => {
    const r = { set: 'ODS_3410', id: '92590', code: '3.1.2', moment: 'L4' as const, status: 'officieel' as const };
    for (const d of ALLE_DOELEN.filter((x) => refsVan(x).some((y) => (y.twijfel ?? []).length > 0))) {
      expect(twijfelZin('moment-buiten-leeftijden', r, d)).not.toMatch(/ ook /);
    }
  });
});

describe('KoppelingChips en KoppelingLijst: de twijfel staat bij de chip waar ze over gaat', () => {
  it('WT.235: de chip van 3.3.2 krijgt zijn eigen vermelding, die van 3.3.1 niet', () => {
    const html = toon(createElement(KoppelingChips, { doel: doelVan('WT.235') }));
    const chips = html.split('<li>').slice(1);
    expect(chips).toHaveLength(2);
    expect(tekst(chips[0])).not.toContain('let op');
    expect(tekst(chips[1])).toContain('3.3.2');
    expect(tekst(chips[1])).toContain('let op: dit moment past niet bij de leeftijd van dit leerplandoel');
  });
});

describe('ontdubbelen (CT-5)', () => {
  it('BU.106 toont minimumdoel 9.1.9 één keer als kaart en noemt de herhaling van de onderdelen in één korte regel', () => {
    const doel = doelVan('BU.106');
    const html = koppeling(doel);
    const kaarten = html.match(/<li class="b-go-ref">/g) ?? [];
    const unieke = new Set(refsVan(doel).map((r) => `${r.set}-${r.id}-${r.moment}`));
    expect(kaarten).toHaveLength(unieke.size);
    expect(tel(html, /href="\/basis\/doel\/ODS_3427\/92664"/g)).toBe(1);
    expect(tekst(html)).toMatch(/Het leerplan koppelt ook een onderdeel van dit doel \(.+\) aan minimumdoel 9\.1\.9, hierboven\./);
    // De bron blijft volledig: elk onderdeel met een eigen koppeling staat nog onder “Zo staat het in het leerplan”.
    expect(tekst(html)).toContain('Zo staat het in het leerplan');
  });

  it('in de lijst staat BU.106 met elk minimumdoel één keer als chip', () => {
    const doel = doelVan('BU.106');
    const links = hrefs(toon(createElement(KoppelingChips, { doel })));
    expect(new Set(links).size).toBe(links.length);
  });

  it('WI.663: de twijfelzin onder “Hoe zeker is dit?” staat er één keer, en de kaart van 2.3.32 ook', () => {
    const html = koppeling(doelVan('WI.663'));
    expect(tel(tekst(html), /Dit leerplandoel is voor/g)).toBe(1);
    expect(tel(html, /<li class="b-go-ref">/g)).toBe(1);
  });

  it('over alle doelen: in KoppelingChips en KoppelingLijst staat geen link dubbel en geen enkele unieke verwijzing ontbreekt', () => {
    for (const d of ALLE_DOELEN) {
      const unieke = new Set(refsVan(d).map((r) => `/basis/doel/${r.set}/${r.id}`));
      for (const html of [toon(createElement(KoppelingChips, { doel: d })), koppeling(d, LEEG)]) {
        const links = hrefs(html);
        // Eén minimumdoel kan op twee momenten staan; dan is het twee kaarten met dezelfde link. Tel per set, id en moment.
        expect(new Set(links), d.code).toEqual(unieke);
      }
      const chips = hrefs(toon(createElement(KoppelingChips, { doel: d })));
      const perMoment = new Set(refsVan(d).map((r) => `${r.set}-${r.id}-${r.moment}`));
      expect(chips.length, d.code).toBe(perMoment.size);
    }
  });
});

describe('de link naar een minimumdoel voor wie buitengewoon koos (SB-SB-2)', () => {
  it('KoppelingChips gebruikt de doorgegeven functie voor het adres', () => {
    const doel = doelVan('WT.006');
    const standaard = hrefs(toon(createElement(KoppelingChips, { doel })));
    expect(standaard.some((h) => h.startsWith('/basis/doel/ODS_3408/'))).toBe(true);
    const naarBuso = (r: { set: string; id: string }) => `/basis/doel/${r.set === 'ODS_3408' ? 'ODS_3469' : r.set}/${r.id}`;
    const html = toon(createElement(KoppelingChips, { doel, doelPad: naarBuso }));
    expect(hrefs(html)[0]).toBe('/basis/doel/ODS_3469/92738');
    expect(html).not.toContain('/basis/doel/ODS_3408/');
  });

  it('KoppelingLijst gebruikt dezelfde functie voor de kaarten', () => {
    const doel = doelVan('WT.006');
    const html = toon(createElement(KoppelingLijst, { doel, teksten: LEEG, doelPad: (r: { set: string; id: string }) => `/basis/doel/ODS_9999/${r.id}` }));
    expect(hrefs(html).length).toBeGreaterThan(0);
    for (const h of hrefs(html)) expect(h).toMatch(/^\/basis\/doel\/ODS_9999\//);
  });
});

describe('LeerplandoelInhoud: de kruimel blijft in je leerjaar (CT-3)', () => {
  const pagina = (code: string, bewaard?: 'K1' | 'K2' | 'K3' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6') =>
    toon(
      createElement(LeerplandoelInhoud, {
        doel: doelVan(code),
        leerplan: LEERPLAN.get(code.slice(0, 2) as GoVak) as GoLeerplanBestand,
        index: INDEX,
        minimumdoelen: KLAAR,
        lesplannen: { status: 'klaar', lesplannen: [] },
        bewaard,
      }),
    );

  it('WT.005 (6-7 en 7-8 jaar) met bewaard L2: de kruimel en de voetlink gaan naar L2', () => {
    const html = pagina('WT.005', 'L2');
    const kruimel = /<nav class="b-kruimel"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';
    const voet = /<p class="b-go-voet">[\s\S]*?<\/p>/.exec(html)?.[0] ?? '';
    expect(kruimel).toContain('href="/basis/leerplandoelen/wt?leerjaar=L2"');
    expect(kruimel).not.toContain('leerjaar=L1');
    expect(voet).toContain('href="/basis/leerplandoelen/wt?leerjaar=L2"');
  });

  it('met een bewaard leerjaar dat niet bij het doel past, of zonder, geldt de eerste leeftijd (L1)', () => {
    for (const html of [pagina('WT.005', 'L5'), pagina('WT.005')]) {
      const kruimel = /<nav class="b-kruimel"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';
      expect(kruimel).toContain('href="/basis/leerplandoelen/wt?leerjaar=L1"');
      expect(kruimel).not.toContain('leerjaar=L5');
    }
  });

  it('de rubriek-kruimel toont de hele rubriek over alle leeftijden (WT.086 in WT-r019, ook met bewaard L2)', () => {
    for (const html of [pagina('WT.086', 'L2'), pagina('WT.086')]) {
      const kruimel = /<nav class="b-kruimel"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';
      const rubriek = /<a[^>]*class="b-go-kruimel-rubriek"[^>]*>/g;
      const hrefs = [...kruimel.matchAll(rubriek)].map((m) => /href="([^"]*)"/.exec(m[0])?.[1] ?? '');
      expect(hrefs.length).toBeGreaterThan(0);
      expect(hrefs[hrefs.length - 1]).toMatch(/leerjaar=alle&amp;rubriek=WT-r019$/i);
      for (const h of hrefs) expect(h).toContain('leerjaar=alle');
    }
  });
});

describe('woorden van het GO! met uitleg (TU-7)', () => {
  it('op de doelpagina staat “Kennisverwerking:” zichtbaar, niet alleen voor schermlezers', () => {
    const html = toon(
      createElement(LeerplandoelInhoud, {
        doel: doelVan('WI.408'),
        leerplan: LEERPLAN.get('WI') as GoLeerplanBestand,
        index: INDEX,
        minimumdoelen: KLAAR,
        lesplannen: { status: 'klaar', lesplannen: [] },
      }),
    );
    expect(tekst(html)).toContain('Kennisverwerking: gebruiken');
    expect(html).not.toContain('<span class="sr-only">Kennisverwerking: </span>');
    expect(tekst(html)).toContain('Hier verwijst het leerplan naar andere leerplandoelen. In de lesplannen staan vlaggen en schakels onder ‘Horizontale samenhang’.');
  });

  it('de lijst van een vak legt de kennisverwerking uit', () => {
    const lp = LEERPLAN.get('WT') as GoLeerplanBestand;
    const html = toon(createElement(LeerplandoelenInhoud, { leerplan: lp, index: INDEX, filter: { leeftijd: '9-10' }, onLeeftijd: () => undefined, onZonder: () => undefined, rubriekPad: () => '/' }));
    expect(tekst(html)).toContain('Bij elk doel staat de kennisverwerking volgens het GO!: begrijpen, gebruiken of engageren.');
  });
});

describe('afdrukken en uitklappers in de css (BLP-3, GE-02)', () => {
  const css = readFileSync(new URL('../../styles/basis-go.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('de letterlijke tekst houdt spaties vast (pre-wrap), zodat rekenschema’s uitgelijnd blijven', () => {
    const blok = /\.b-go-tekst\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(blok).toMatch(/white-space:\s*pre-wrap/);
    expect(blok).toMatch(/tab-size:\s*4/);
  });

  it('“Toon de andere” heeft hetzelfde pijltje en dezelfde kleur als de andere uitklappers, en verdwijnt op papier', () => {
    expect(css).toMatch(/\.b-go-uitleg summary,\s*\.b-go-meer summary\s*\{[^}]*color:\s*var\(--brand\)/);
    expect(css).toMatch(/\.b-go-meer > summary\s*\{\s*display:\s*none/);
  });
});

describe('LeerplandoelenInhoud: koppen, lege keuzes en spaties (pakket E2)', () => {
  const maakVak = (vak: GoVak, filter: Parameters<typeof LeerplandoelenInhoud>[0]['filter']) =>
    toon(
      createElement(LeerplandoelenInhoud, {
        leerplan: LEERPLAN.get(vak) as GoLeerplanBestand,
        index: INDEX,
        filter,
        onLeeftijd: () => undefined,
        onZonder: () => undefined,
        rubriekPad: (r) => `/basis/leerplandoelen/${vak.toLowerCase()}${r ? `?rubriek=${r}` : ''}`,
      }),
    );

  it('een subrubriek is een kop (h4 of h5) met de klasse voor de vormgeving, nooit een vette alinea; geen kopsprong', () => {
    const html = maakVak('WI', {});
    const subs = [...html.matchAll(/<(h[2-6])[^>]*class="[^"]*b-go-subrubriek[^"]*"/g)].map((m) => m[1]);
    expect(subs.length).toBeGreaterThan(40);
    expect(subs.every((h) => h === 'h4' || h === 'h5')).toBe(true);
    expect(html).not.toMatch(/<p class="b-go-subrubriek/);
    const niveaus = [...html.matchAll(/<h([1-6])[ >]/g)].map((m) => Number(m[1]));
    for (let n = 1; n < niveaus.length; n++) expect(niveaus[n]).toBeLessThanOrEqual(niveaus[n - 1] + 1);
  });

  it('Frans voor 8-9 jaar: een zin die zegt waar het vak wel doelen heeft, met een knop per leeftijd', () => {
    const html = maakVak('FR', { leeftijd: '8-9' });
    const t = tekst(html);
    expect(t).toContain('Frans heeft geen leerplandoelen voor 8-9 jaar. Wel voor:');
    expect(html).toContain('role="status"');
    expect(t).toContain('10-11 jaar (104)');
    expect(t).toContain('11-12 jaar (103)');
    const groep = html.match(/aria-label="Leeftijden met leerplandoelen">(.*?)<\/div>/)?.[1] ?? '';
    expect(tel(groep, /<button /g)).toBe(2);
    expect(tekst(groep)).toBe('10-11 jaar (104) 11-12 jaar (103)');
    expect(t).not.toContain('Geen leerplandoelen voor deze keuze.');
  });

  it('met een ander filter blijft de gewone zin staan, en met doelen in de leeftijd verschijnt de uitleg niet', () => {
    expect(tekst(maakVak('FR', { leeftijd: '8-9', zonderMinimumdoel: true }))).toContain('Geen leerplandoelen voor deze keuze.');
    expect(tekst(maakVak('WT', { leeftijd: '2,5-4' }))).not.toContain('Wel voor:');
  });

  it('de aantallen in de pillen zijn los van het woord: een spatie voor de tekst van het aantal', () => {
    expect(maakVak('WT', {})).toContain('<span class="b-go-pil-aantal"> (');
  });

  it('bij een leerplandoel met twee lesplannen staat de komma achter het eerste en niet voor het tweede', () => {
    const html = maakVak('WT', {});
    const alinea = html.match(/<p class="b-go-koppeling">(?:(?!<\/p>).)*Lesplannen \(2\)(?:(?!<\/p>).)*<\/p>/)?.[0] ?? '';
    expect(alinea).not.toBe('');
    expect(alinea).not.toMatch(/<span>, /);
    expect(alinea).toMatch(/<\/a>,<\/span>/);
  });
});

// ── CT-9: de opmaak van de leerplantekst komt op de pagina (de tekst van het GO! staat er letterlijk, de app maakt er alleen opmaak van) ──

describe('de opmaak van de leerplantekst op de doelpagina (CT-9)', () => {
  const pagina = (code: string) =>
    toon(
      createElement(LeerplandoelInhoud, {
        doel: doelVan(code),
        leerplan: LEERPLAN.get(code.slice(0, 2) as GoVak) as GoLeerplanBestand,
        index: INDEX,
        minimumdoelen: KLAAR,
        lesplannen: { status: 'klaar', lesplannen: [] },
      }),
    );

  // De doorgehaalde spatie of punt in deze doelzinnen staat niet doorgehaald in de pdf van de doelenset (besluit
  // 'opmaak-weglaten', 12 november 2026): de tekens blijven letterlijk staan, zonder <s>.
  it('WI.604: de tweede punt (doorgehaald in de Excel) staat er letterlijk, zonder doorhaling', () => {
    const doel = doelVan('WI.604');
    expect(doel.tekst).toBe('Berekenen de omtrek van een grillige figuur..');
    expect(doel.opmaak).toBeUndefined();
    const html = pagina('WI.604');
    expect(html).not.toContain('<s>');
    expect(html).toContain('Berekenen de omtrek van een grillige figuur..');
  });

  it('WI.386 en WI.476: de spatie tussen twee woorden is een gewone spatie, zonder streepje (<s>) en zonder dat de woorden aan elkaar plakken', () => {
    for (const [code, zin] of [
      ['WI.386', 'Tellen gerelateerde breuken op. '],
      ['WI.476', 'Vergelijken indirect de oppervlakte van twee objecten.'],
    ] as const) {
      const doel = doelVan(code);
      expect(doel.tekst, code).toBe(zin);
      expect(doel.opmaak, code).toBeUndefined();
      const html = pagina(code);
      expect(html, code).not.toContain('<s>');
      expect(html, code).toContain(zin.trim());
    }
  });

  it('een doorgehaald stuk in de doelzin wordt <s> op de pagina (kleine fixture: de gepubliceerde gegevens hebben er nu geen)', () => {
    const doel: GoLeerplandoel = { ...doelVan('WI.604'), opmaak: [{ t: 'Berekenen de omtrek van een grillige figuur.' }, { t: 'weg', s: true }], tekst: 'Berekenen de omtrek van een grillige figuur.weg' };
    const html = toon(
      createElement(LeerplandoelInhoud, {
        doel,
        leerplan: LEERPLAN.get('WI') as GoLeerplanBestand,
        index: INDEX,
        minimumdoelen: KLAAR,
        lesplannen: { status: 'klaar', lesplannen: [] },
      }),
    );
    expect(html).toContain('Berekenen de omtrek van een grillige figuur.<s>weg</s>');
  });

  it('WI.546 heeft superschrift in de onderdelen (cm3, dm3, m3) en de pagina maakt er <sup> van', () => {
    const doel = doelVan('WI.546');
    expect(doel.inhoud.some((i) => 'opmaak' in i && i.opmaak?.some((s) => 'sup' in s && s.sup))).toBe(true);
    const html = pagina('WI.546');
    expect(html).toContain('1cm<sup>3</sup>: volume van een kubus met een ribbe van 1 cm');
    expect(html).toContain('cm<sup>3</sup>, dm<sup>3</sup>, m<sup>3</sup>');
  });

  it('elk onderdeel met opmaak in de gegevens krijgt die opmaak in MiaBlok: doorgehaald, cursief en superschrift, voor alle doelen', () => {
    const soorten = { s: '<s>', i: '<em>', sup: '<sup>' } as const;
    const gezien = { s: 0, i: 0, sup: 0 };
    for (const d of ALLE_DOELEN) {
      const nodig = new Set<keyof typeof soorten>();
      for (const item of d.inhoud) for (const stuk of ('opmaak' in item && item.opmaak) || []) for (const k of Object.keys(soorten) as (keyof typeof soorten)[]) if (k in stuk && (stuk as unknown as Record<string, unknown>)[k]) nodig.add(k);
      if (nodig.size === 0) continue;
      const html = toon(createElement(MiaBlok, { inhoud: d.inhoud }));
      for (const k of nodig) {
        expect(html, `${d.code} ${k}`).toContain(soorten[k]);
        gezien[k]++;
      }
    }
    // Doorgehaald komt in de gepubliceerde onderdelen niet meer voor (besluit 'opmaak-weglaten'); de fixture hieronder toetst het.
    expect(gezien.i).toBeGreaterThan(0);
    expect(gezien.sup).toBeGreaterThan(0);
  });

  it('een doorgehaald stuk in een onderdeel wordt <s> in MiaBlok, superschrift en cursief ernaast blijven (kleine fixture)', () => {
    const html = toon(
      createElement(MiaBlok, {
        inhoud: [
          { soort: 'mia-titel', tekst: 'Vergelijken:', rij: 1 },
          { soort: 'mia', tekst: 'land of regio ', opmaak: [{ t: 'land of regio' }, { t: ' ', s: true }], aanklikbaar: true, rij: 2 },
          { soort: 'voorbeeld', tekst: '1 m3 weg', opmaak: [{ t: '1 m' }, { t: '3', sup: true }, { t: ' ' }, { t: 'weg', s: true, i: true }], rij: 3 },
        ],
      }),
    );
    expect(html).toContain('land of regio<s> </s>');
    expect(html).toContain('1 m<sup>3</sup> ');
    expect(html).toMatch(/<s><em>weg<\/em><\/s>|<em><s>weg<\/s><\/em>/);
  });
});
