// De kaart bij een matrix die nog niet in Boosterz staat (docs/STUDIERICHTINGEN.md § 22.5.4, "Matrix nog niet in Boosterz"):
// een rij zwijgt, want de lijst met richtingen toont dan zelf de melding `NogGeenData`; de klas heeft die melding niet en moet
// het dus zelf zeggen. De test rendert de kaart op de server (zonder DOM) met een nagebootste laadstand van de gegevens.
//
// Fase 3b (§ 24.6.4 en § 24.9, S3): de tweede regel over de competenties van de beroepskwalificaties. Op de server draaien geen
// effecten, dus de toestanden komen uit de caches van het geheugen (`bewaarDekkingKort`, `bewaarBkKort`) en uit de losse
// onderdelen: `BkRegel` (de zin en de knoppen per toestand), `berekenBk` (de berekening, met een nagebootst luie deel of de echte
// `bkKortVoorRichting` met nagebootste laders) en de vlaggen die `useBeurt` krijgt (wanneer vraagt een rij haar beurt?).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { BkBestand, BkIndex, KoppelingBestand } from '../../lib/beroepskwalificaties';
import { bkKaderDoelen, dekkingBk } from '../../lib/dekkingBk';
import { bewaarBkKort, bewaarDekkingKort, dekkingGeneratie, leesBkKort } from '../../lib/dekkingCache';
import type { Course } from '../../lib/courseTypes';
import type { Curriculum } from '../../lib/curriculumTypes';
import { bkKader } from '../../lib/richtingBk';
import { doelgroepVan, kaderGroepSleutel, richtingInfo, type RichtingInfo, type SoortKeuze } from '../../lib/richtingKader';
import {
  bijdragenVoorKader,
  bkKortVan,
  bkRijZin,
  kanBkHebben,
  type BkKort,
} from '../../lib/richtingOverzicht';
import { notifyChange } from '../../lib/storage';
import type { MatrixBestand } from '../../lib/studierichtingen';
import { FOUT_NOG_NIET_OPGEHAALD, FOUT_STUDIERICHTINGEN } from '../../lib/studierichtingenBron';
import { KlasRichting } from '../klas/KlasRichting';

const FIXTURES = join(fileURLToPath(new URL('.', import.meta.url)), '../../../tests/fixtures');
const lees = (pad: string): unknown => JSON.parse(readFileSync(join(FIXTURES, pad), 'utf8'));

const VANDAAG = '2026-10-10';
const MATRIX = lees('structuur/uit/studierichtingen.json') as MatrixBestand;
const KOPPELING = lees('kwalificaties/uit/koppeling.json') as KoppelingBestand;
const INDEX = lees('kwalificaties/uit/index.json') as BkIndex;
const ONTHAAL = lees('kwalificaties/uit/bk/BK-0390-2.json') as BkBestand;
const RECREATIEF = lees('kwalificaties/uit/bk/BK-0464-1.json') as BkBestand;

const mock = vi.hoisted(() => ({
  stand: { status: 'laden' } as { status: 'laden' } | { status: 'fout'; fout: string } | { status: 'klaar'; waarde: { matrix: unknown } },
  /** De vlaggen die `useBeurt` kreeg, in de volgorde van de aanroepen: per render eerst de regel van de minimumdoelen, dan die van de competenties. */
  wil: [] as boolean[],
  /** Is een rij aan de beurt zodra ze erom vraagt? */
  aanDeBeurt: false,
  /** Hoe vaak de opslag gelezen is: elke berekening die gemonteerd wordt, leest ze bij het begin (`leesOpslag`). */
  opslagGelezen: 0,
}));

vi.mock('./useRichtingGegevens', () => ({
  useRichtingGegevens: () => ({ stand: mock.stand, opnieuw: () => {} }),
  useRichtingKader: () => ({ stand: { status: 'laden' }, opnieuw: () => {} }),
}));

vi.mock('./rijWachtrij', () => ({
  useBeurt: (wil: boolean) => {
    mock.wil.push(wil);
    return { aanDeBeurt: wil && mock.aanDeBeurt, klaar: () => {} };
  },
}));

// Op de server draaien geen effecten, dus een berekening die gemonteerd wordt, is alleen te zien aan haar eerste handeling:
// ze leest de cursussen van dit toestel.
vi.mock('../../lib/courses', async (oorspronkelijk) => ({
  ...(await oorspronkelijk<object>()),
  getCourses: () => {
    mock.opslagGelezen += 1;
    return [];
  },
}));

// De klok staat vast: de fixtures hebben datums in de toekomst.
vi.mock('../../lib/richtingLink', async (oorspronkelijk) => ({ ...(await oorspronkelijk<object>()), vandaag: () => '2026-10-10' }));

import { berekenBk, BkRegel, DekkingKort, type BkOverzichtDeel, type DekkingKortProps } from './DekkingKort';

function toon(plaats: 'rij' | 'klas'): string {
  return renderToStaticMarkup(createElement(DekkingKort, { groep: 'G-0193', soort: 'so', plaats, titel: 'Natuurwetenschappen' }));
}

describe('DekkingKort: de matrix staat nog niet in Boosterz', () => {
  it('in de klas staat de melding, zonder knop, en ze wordt voorgelezen', () => {
    mock.stand = { status: 'fout', fout: FOUT_NOG_NIET_OPGEHAALD };
    const html = toon('klas');
    expect(html).toContain('De doelen van deze richting zijn nog niet opgehaald.');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('<button');
  });

  it('in een rij staat niets: de lijstpagina zegt het al', () => {
    mock.stand = { status: 'fout', fout: FOUT_NOG_NIET_OPGEHAALD };
    expect(toon('rij')).toBe('');
  });

  it('een andere fout blijft een fout met "Opnieuw proberen", in de klas en in een rij', () => {
    mock.stand = { status: 'fout', fout: FOUT_STUDIERICHTINGEN };
    for (const plaats of ['klas', 'rij'] as const) {
      const html = toon(plaats);
      expect(html).toContain('De dekking kon niet berekend worden.');
      expect(html).toContain('Opnieuw proberen');
      expect(html).toContain('(Natuurwetenschappen)');
      expect(html).not.toContain('nog niet opgehaald');
    }
  });

  it('tijdens het laden staat er "De dekking wordt berekend…"', () => {
    mock.stand = { status: 'laden' };
    for (const plaats of ['klas', 'rij'] as const) expect(toon(plaats)).toContain('De dekking wordt berekend…');
  });
});

// ── De regel over de competenties (§ 24.6.4) ────────────────────────────────

const infoVan = (groep: string): RichtingInfo => {
  const i = richtingInfo(MATRIX, groep, VANDAAG);
  if (!i) throw new Error(`${groep} ontbreekt in de structuurfixtures`);
  return i;
};
/** Praktijk (G-0008): finaliteit A, twee beroepskwalificaties. Natuurwetenschappen (G-0193): doorstroom, geen. */
const PRAKTIJK = infoVan('G-0008');
const DOORSTROOM = infoVan('G-0193');
const SLEUTEL_PRAKTIJK = kaderGroepSleutel(PRAKTIJK, 'so');
const SLEUTEL_DOORSTROOM = kaderGroepSleutel(DOORSTROOM, 'so');

const MD_KORT = { totaal: 20, gedekt: 5, gepland: 2, percent: 25, eersteGraad: false };
const EEN_BK: BkKort = { soort: 'getallen', bks: 1, titel: 'Onthaalmedewerker', totaal: 12, gedekt: 5, gepland: 3, percent: 42, zonderBestand: 0 };
const TWEE_BK: BkKort = { soort: 'getallen', bks: 2, totaal: 25, gedekt: 9, gepland: 4, zonderBestand: 0 };

/** Alle regels `mr-tekst` van de kaart, met hun tekst. */
function regels(html: string): string[] {
  return [...html.matchAll(/<p [^>]*class="mr-tekst[^"]*"[^>]*>([^<]*)<\/p>/g)].map((m) => m[1]);
}
function toonRichting(groep: string, plaats: 'rij' | 'klas', soort: SoortKeuze = 'so'): string {
  mock.wil = [];
  return renderToStaticMarkup(createElement(DekkingKort, { groep, soort, plaats, titel: 'Onthaal en recreatie' }));
}

describe('DekkingKort: de regel over de competenties', () => {
  beforeEach(() => {
    mock.stand = { status: 'klaar', waarde: { matrix: MATRIX } };
    mock.wil = [];
    mock.aanDeBeurt = false;
    mock.opslagGelezen = 0;
    // Elke test begint met lege caches: een wijziging in de opslag maakt ze leeg.
    dekkingGeneratie();
    notifyChange();
  });

  it('de fixtures zijn wat de tests verwachten: Praktijk kan beroepskwalificaties hebben, Natuurwetenschappen niet', () => {
    expect(kanBkHebben(PRAKTIJK)).toBe(true);
    expect(kanBkHebben(DOORSTROOM)).toBe(false);
  });

  it('een richting met doorstroomfinaliteit: één regel en geen beurt voor de competenties, ook als de minimumdoelen er zijn', () => {
    for (const plaats of ['rij', 'klas'] as const) {
      bewaarDekkingKort(SLEUTEL_DOORSTROOM, MD_KORT);
      const html = toonRichting('G-0193', plaats);
      expect(regels(html)).toHaveLength(1);
      expect(html).not.toContain('competenties');
      expect(mock.wil).toEqual([false, false]);
    }
  });

  it('een rij vraagt voor de competenties pas een beurt als haar regel over de minimumdoelen er is (F3b-B8)', () => {
    // Nog niets: alleen de minimumdoelen vragen een beurt, de competenties staan er nog niet (ook niet als "bezig").
    let html = toonRichting('G-0008', 'rij');
    expect(mock.wil).toEqual([true, false]);
    expect(regels(html)).toHaveLength(1);
    expect(html).not.toContain('competenties');

    // De minimumdoelen zijn er: nu de competenties, en ze zeggen dat ze bezig zijn.
    bewaarDekkingKort(SLEUTEL_PRAKTIJK, MD_KORT);
    html = toonRichting('G-0008', 'rij');
    expect(mock.wil).toEqual([false, true]);
    expect(regels(html)).toEqual([
      'Je cursussen dekken 5 van de 20 minimumdoelen (25 %). 2 staan gepland.',
      'De dekking op de competenties wordt berekend…',
    ]);

    // Beide zijn er: geen enkele beurt meer nodig.
    bewaarBkKort(SLEUTEL_PRAKTIJK, EEN_BK);
    toonRichting('G-0008', 'rij');
    expect(mock.wil).toEqual([false, false]);
  });

  it('de rij toont de zin van bkRijZin, zonder knop: één beroepskwalificatie met percentage, meer zonder', () => {
    bewaarDekkingKort(SLEUTEL_PRAKTIJK, MD_KORT);
    bewaarBkKort(SLEUTEL_PRAKTIJK, EEN_BK);
    let html = toonRichting('G-0008', 'rij');
    expect(regels(html)[1]).toBe('Je cursussen dekken 5 van de 12 competenties van Onthaalmedewerker (42 %). 3 staan gepland.');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('aria-live');

    notifyChange();
    bewaarDekkingKort(SLEUTEL_PRAKTIJK, MD_KORT);
    bewaarBkKort(SLEUTEL_PRAKTIJK, TWEE_BK);
    html = toonRichting('G-0008', 'rij');
    expect(regels(html)[1]).toBe('Je cursussen dekken 9 van de 25 competenties van 2 beroepskwalificaties. 4 staan gepland.');
    expect(regels(html)[1]).not.toContain('%');
  });

  it('geen enkele cursus telt mee, en beroepskwalificaties zonder bestand', () => {
    bewaarDekkingKort(SLEUTEL_PRAKTIJK, MD_KORT);
    bewaarBkKort(SLEUTEL_PRAKTIJK, { soort: 'zonder-cursus', bks: 1, titel: 'Onthaalmedewerker' });
    expect(regels(toonRichting('G-0008', 'rij'))[1]).toBe('Nog geen cursus met de competenties van Onthaalmedewerker.');

    notifyChange();
    bewaarDekkingKort(SLEUTEL_PRAKTIJK, MD_KORT);
    bewaarBkKort(SLEUTEL_PRAKTIJK, { soort: 'zonder-cursus', bks: 2 });
    expect(regels(toonRichting('G-0008', 'rij'))[1]).toBe('Nog geen cursus met de competenties van de 2 beroepskwalificaties.');

    notifyChange();
    bewaarDekkingKort(SLEUTEL_PRAKTIJK, MD_KORT);
    bewaarBkKort(SLEUTEL_PRAKTIJK, { ...TWEE_BK, zonderBestand: 1 });
    expect(regels(toonRichting('G-0008', 'rij'))[1]).toBe(
      'Je cursussen dekken 9 van de 25 competenties van 2 beroepskwalificaties. 4 staan gepland. Van 1 beroepskwalificatie staan de competenties nog niet in Boosterz.',
    );
  });

  it('geen competenties om te dekken (totaal 0): geen tweede regel', () => {
    bewaarDekkingKort(SLEUTEL_PRAKTIJK, MD_KORT);
    bewaarBkKort(SLEUTEL_PRAKTIJK, { soort: 'getallen', bks: 1, titel: 'Onthaalmedewerker', totaal: 0, gedekt: 0, gepland: 0, percent: 0, zonderBestand: 0 });
    const html = toonRichting('G-0008', 'rij');
    expect(regels(html)).toHaveLength(1);
    expect(html).not.toContain('competenties');
  });

  it('de berekening van de competenties start in de klas meteen en in een rij pas aan de beurt', () => {
    // Alleen de regel over de competenties moet nog rekenen: de minimumdoelen staan in de cache.
    bewaarDekkingKort(SLEUTEL_PRAKTIJK, MD_KORT);
    toonRichting('G-0008', 'klas');
    expect(mock.opslagGelezen).toBe(1);

    mock.opslagGelezen = 0;
    toonRichting('G-0008', 'rij');
    expect(mock.opslagGelezen).toBe(0);

    mock.aanDeBeurt = true;
    toonRichting('G-0008', 'rij');
    expect(mock.opslagGelezen).toBe(1);

    // Staat de uitkomst er al, dan rekent niemand meer.
    mock.opslagGelezen = 0;
    bewaarBkKort(SLEUTEL_PRAKTIJK, EEN_BK);
    toonRichting('G-0008', 'klas');
    toonRichting('G-0008', 'rij');
    expect(mock.opslagGelezen).toBe(0);
  });

  it('een rij die aan de beurt is maar de minimumdoelen nog niet heeft, rekent die eerst; de competenties wachten', () => {
    mock.aanDeBeurt = true;
    toonRichting('G-0008', 'rij');
    // Alleen de berekening van de minimumdoelen is gemonteerd (de beurt van de competenties werd niet gevraagd).
    expect(mock.wil).toEqual([true, false]);
    expect(mock.opslagGelezen).toBe(1);
  });

  it('de klas toont dezelfde zin, onder de aria-live van de kaart, en rekent zonder beurt', () => {
    bewaarDekkingKort(SLEUTEL_PRAKTIJK, MD_KORT);
    bewaarBkKort(SLEUTEL_PRAKTIJK, EEN_BK);
    const html = toonRichting('G-0008', 'klas');
    expect(mock.wil).toEqual([false, false]);
    const [md, bk] = regels(html);
    expect(md).toMatch(/^Je cursussen voor .+ dekken 5 van de 20 minimumdoelen/);
    expect(bk).toBe(bkRijZin(EEN_BK));
    expect(html.indexOf('aria-live="polite"')).toBeGreaterThan(-1);
    expect(html.indexOf('aria-live="polite"')).toBeLessThan(html.indexOf('mr-tekst-bk'));
    expect(html.match(/aria-live/g)).toHaveLength(1);
  });

  it('de klas rekent de competenties meteen, maar toont de regel pas als die over de minimumdoelen er is (§ 24.6.4)', () => {
    // Niets is er nog: één regel ("wordt berekend…"), en beide berekeningen zijn al gemonteerd (elk leest de opslag).
    let html = toonRichting('G-0008', 'klas');
    expect(regels(html)).toEqual(['De dekking wordt berekend…']);
    expect(html).not.toContain('competenties');
    expect(mock.wil).toEqual([false, false]);
    expect(mock.opslagGelezen).toBe(2);

    // De competenties zijn er al (uit de cache) maar de minimumdoelen nog niet: de regel wacht.
    notifyChange();
    bewaarBkKort(SLEUTEL_PRAKTIJK, EEN_BK);
    mock.opslagGelezen = 0;
    html = toonRichting('G-0008', 'klas');
    expect(regels(html)).toEqual(['De dekking wordt berekend…']);
    expect(html).not.toContain('competenties');
    expect(mock.opslagGelezen).toBe(1);

    // Zodra de minimumdoelen er zijn, staat ook de regel over de competenties er, en tijdens het rekenen zegt ze dat ze bezig is.
    bewaarDekkingKort(SLEUTEL_PRAKTIJK, MD_KORT);
    expect(regels(toonRichting('G-0008', 'klas'))[1]).toBe(bkRijZin(EEN_BK));
    notifyChange();
    bewaarDekkingKort(SLEUTEL_PRAKTIJK, MD_KORT);
    expect(regels(toonRichting('G-0008', 'klas'))).toEqual([
      expect.stringMatching(/^Je cursussen voor .+ dekken 5 van de 20 minimumdoelen/),
      'De dekking op de competenties wordt berekend…',
    ]);
  });

  it('een rij met de competenties al in de cache maar zonder regel over de minimumdoelen (nog niet gerekend, of "geen" is niet bewaard): één regel', () => {
    const sleutelBuso = kaderGroepSleutel(infoVan('G-0009'), 'buso');
    bewaarBkKort(sleutelBuso, { soort: 'zonder-cursus', bks: 2 });
    bewaarBkKort(SLEUTEL_PRAKTIJK, EEN_BK);
    for (const [groep, soort] of [['G-0009', 'buso'], ['G-0008', 'so']] as const) {
      const html = toonRichting(groep, 'rij', soort);
      expect(regels(html)).toEqual(['De dekking wordt berekend…']);
      expect(html).not.toContain('competenties');
    }
    // De minimumdoelen komen: nu staat de bewaarde regel er meteen.
    bewaarDekkingKort(sleutelBuso, MD_KORT);
    expect(regels(toonRichting('G-0009', 'rij', 'buso'))[1]).toBe('Nog geen cursus met de competenties van de 2 beroepskwalificaties.');
  });

  it('"er valt niets te zeggen" staat in de cache: geen regel, geen "wordt berekend…" en geen beurt, in een rij en in de klas', () => {
    bewaarDekkingKort(SLEUTEL_PRAKTIJK, MD_KORT);
    bewaarBkKort(SLEUTEL_PRAKTIJK, { soort: 'zonder-cursus', bks: 0 });
    for (const plaats of ['rij', 'klas'] as const) {
      mock.opslagGelezen = 0;
      const html = toonRichting('G-0008', plaats);
      expect(regels(html)).toHaveLength(1);
      expect(html).not.toContain('competenties');
      expect(mock.wil).toEqual([false, false]);
      expect(mock.opslagGelezen).toBe(0);
    }
  });

  it('een uitkomst voor een andere richting staat er niet (de sleutel is die van de richting)', () => {
    bewaarDekkingKort(SLEUTEL_PRAKTIJK, MD_KORT);
    bewaarBkKort(SLEUTEL_DOORSTROOM, EEN_BK);
    expect(regels(toonRichting('G-0008', 'rij'))[1]).toBe('De dekking op de competenties wordt berekend…');
  });

  it('de sleutel is die van het kader (het soort onderwijs dat echt geldt), zoals bij de minimumdoelen en het detail', () => {
    // G-0009 is een richting van het buitengewoon onderwijs: ze rekent altijd als "buso", ook als de rij "so" meegeeft.
    const buso = infoVan('G-0009');
    expect(kanBkHebben(buso)).toBe(true);
    expect(buso.soort).toBe('buso');
    const sleutel = kaderGroepSleutel(buso, 'buso');
    expect(sleutel).not.toBe(kaderGroepSleutel(buso, 'so'));
    bewaarDekkingKort(sleutel, MD_KORT);
    bewaarBkKort(sleutel, EEN_BK);
    expect(regels(toonRichting('G-0009', 'rij', 'so'))[1]).toBe(bkRijZin(EEN_BK));
    expect(mock.wil).toEqual([false, false]);
  });

  it('de props van DekkingKort blijven gelijk', () => {
    expectTypeOf<DekkingKortProps>().toEqualTypeOf<{ groep: string; soort: SoortKeuze; plaats: 'rij' | 'klas'; titel: string }>();
  });
});

describe('BkRegel: de fouten', () => {
  const ref = { current: null };
  const toonRegel = (toestand: Parameters<typeof BkRegel>[0]['toestand']) =>
    renderToStaticMarkup(createElement(BkRegel, { toestand, titel: 'Onthaal en recreatie', tekstRef: ref, onOpnieuw: () => {} }));

  it('een fout bij het rekenen: de zin en "Opnieuw proberen" met de richting voor de schermlezer', () => {
    const html = toonRegel({ soort: 'fout', chunk: false });
    expect(html).toContain('De dekking op de competenties kon niet berekend worden.');
    expect(html).toContain('Opnieuw proberen<span class="sr-only"> (competenties van Onthaal en recreatie)</span>');
    expect(html).not.toContain('Herlaad de pagina');
  });

  it('het luie deel laadt niet: dezelfde zin met "Herlaad de pagina", want opnieuw klikken helpt niet', () => {
    const html = toonRegel({ soort: 'fout', chunk: true });
    expect(html).toContain('De dekking op de competenties kon niet berekend worden.');
    expect(html).toContain('Herlaad de pagina');
    expect(html).not.toContain('Opnieuw proberen');
  });

  it('elke foutknop heeft een eigen naam voor de schermlezer, ook "Herlaad de pagina": de zichtbare tekst staat voorop', () => {
    // De toegankelijke naam is de tekst van de knop zonder het icoon: de zichtbare tekst eerst, dan de sr-only-context.
    const naam = (html: string) => /<button[^>]*>(.*)<\/button>/.exec(html)?.[1].replace(/<svg.*?<\/svg>/, '').replace(/<[^>]+>/g, '').trim();
    for (const [chunk, zichtbaar] of [[true, 'Herlaad de pagina'], [false, 'Opnieuw proberen']] as const) {
      expect(naam(toonRegel({ soort: 'fout', chunk }))).toBe(`${zichtbaar} (competenties van Onthaal en recreatie)`);
      const andere = renderToStaticMarkup(createElement(BkRegel, { toestand: { soort: 'fout', chunk }, titel: 'Mode', tekstRef: ref, onOpnieuw: () => {} }));
      expect(naam(andere)).toBe(`${zichtbaar} (competenties van Mode)`);
    }
    expect(toonRegel({ soort: 'fout', chunk: true })).toContain('Herlaad de pagina<span class="sr-only"> (competenties van Onthaal en recreatie)</span>');
  });

  it('bezig en getallen hebben geen knop; een lege zin geeft geen regel', () => {
    expect(toonRegel({ soort: 'bezig' })).not.toContain('<button');
    expect(toonRegel({ soort: 'kort', kort: EEN_BK })).not.toContain('<button');
    expect(toonRegel({ soort: 'kort', kort: { ...EEN_BK, totaal: 0 } })).toBe('');
    expect(toonRegel({ soort: 'kort', kort: { soort: 'zonder-cursus', bks: 0 } })).toBe('');
  });

  it('nooit een code, ADV-nummer of groepnummer', () => {
    const alles = [
      toonRegel({ soort: 'bezig' }), toonRegel({ soort: 'fout', chunk: true }), toonRegel({ soort: 'fout', chunk: false }),
      toonRegel({ soort: 'kort', kort: EEN_BK }), toonRegel({ soort: 'kort', kort: TWEE_BK }),
    ].join(' ');
    expect(alles).not.toMatch(/bkc\d|ADV-|G-\d|ODS_/);
  });
});

// ── De berekening ───────────────────────────────────────────────────────────

describe('berekenBk', () => {
  const opslag = (gen = dekkingGeneratie()) => ({ gen, courses: [], curricula: [] });
  const invoer = (o: Partial<Parameters<typeof berekenBk>[0]> = {}) => ({
    info: PRAKTIJK, soort: 'so' as const, sleutel: SLEUTEL_PRAKTIJK, matrix: MATRIX, nu: VANDAAG, opslag: opslag(), widgets: [], ...o,
  });
  const deelMet = (f: BkOverzichtDeel['bkKortVoorRichting']): (() => Promise<BkOverzichtDeel>) => async () => ({ bkKortVoorRichting: f });

  beforeEach(() => {
    dekkingGeneratie();
    notifyChange();
  });

  it('rekent met het luie deel, bewaart de korte regel in de cache van het geheugen en geeft haar terug', async () => {
    const kort: BkKort = { soort: 'zonder-cursus', bks: 2 };
    const f = vi.fn().mockResolvedValue({ soort: 'kort', kort });
    const uit = await berekenBk(invoer(), deelMet(f));
    expect(uit).toEqual({ soort: 'kort', kort });
    expect(leesBkKort(SLEUTEL_PRAKTIJK)).toEqual(kort);
    expect(f).toHaveBeenCalledTimes(1);
    const arg = f.mock.calls[0][0];
    expect(arg).toMatchObject({ soort: 'so', vandaag: VANDAAG, courses: [], curricula: [], widgets: [] });
    expect(arg.info).toBe(PRAKTIJK);
  });

  it('een uitkomst van vóór een wijziging in de opslag wordt niet bewaard', async () => {
    const oud = opslag();
    notifyChange();
    const f = vi.fn().mockResolvedValue({ soort: 'kort', kort: { soort: 'zonder-cursus', bks: 2 } });
    await berekenBk(invoer({ opslag: oud }), deelMet(f));
    expect(leesBkKort(SLEUTEL_PRAKTIJK)).toBeUndefined();
  });

  it('"geen" bewaart een kort zonder beroepskwalificaties: een tweede bezoek rekent niet opnieuw en toont geen regel', async () => {
    const f = vi.fn().mockResolvedValue({ soort: 'geen' });
    expect(await berekenBk(invoer(), deelMet(f))).toEqual({ soort: 'geen' });
    const bewaard = leesBkKort(SLEUTEL_PRAKTIJK);
    expect(bewaard).toEqual({ soort: 'zonder-cursus', bks: 0 });
    expect(bkRijZin(bewaard as BkKort)).toBe('');
  });

  it('"geen" van vóór een wijziging in de opslag wordt niet bewaard', async () => {
    const oud = opslag();
    notifyChange();
    const f = vi.fn().mockResolvedValue({ soort: 'geen' });
    expect(await berekenBk(invoer({ opslag: oud }), deelMet(f))).toEqual({ soort: 'geen' });
    expect(leesBkKort(SLEUTEL_PRAKTIJK)).toBeUndefined();
  });

  it('het luie deel laadt niet: een fout met chunk, en er wordt niet gerekend', async () => {
    const f = vi.fn();
    const uit = await berekenBk(invoer(), async () => { throw new TypeError('Failed to fetch dynamically imported module'); });
    expect(uit).toEqual({ soort: 'fout', chunk: true });
    expect(f).not.toHaveBeenCalled();
    expect(leesBkKort(SLEUTEL_PRAKTIJK)).toBeUndefined();
  });

  it('een bestand dat niet laadt: een fout zonder chunk (opnieuw proberen helpt), niets bewaard', async () => {
    const f = vi.fn().mockRejectedValue(new Error('De beroepskwalificatie kon niet geladen worden.'));
    expect(await berekenBk(invoer(), deelMet(f))).toEqual({ soort: 'fout', chunk: false });
    expect(leesBkKort(SLEUTEL_PRAKTIJK)).toBeUndefined();
  });

  describe('met de echte pijplijn (bkKortVoorRichting) en nagebootste laders', () => {
    function laders() {
      const aanroepen = { koppeling: 0, index: 0, bk: [] as string[] };
      const bestanden = new Map([[ONTHAAL.bk, ONTHAAL], [RECREATIEF.bk, RECREATIEF]]);
      return {
        aanroepen,
        laders: {
          koppeling: async () => { aanroepen.koppeling += 1; return KOPPELING; },
          index: async () => { aanroepen.index += 1; return INDEX; },
          bk: async (versie: string) => { aanroepen.bk.push(versie); return bestanden.get(versie) ?? null; },
        },
      };
    }
    const metLaders = (l: ReturnType<typeof laders>['laders']) => async (): Promise<BkOverzichtDeel> => {
      const echt = await import('../../lib/bkOverzicht');
      return { bkKortVoorRichting: (o) => echt.bkKortVoorRichting(o, l) };
    };

    it('een richting zonder beroepskwalificaties vraagt niets, ook niet de koppeling', async () => {
      const { aanroepen, laders: l } = laders();
      const uit = await berekenBk(invoer({ info: DOORSTROOM, sleutel: SLEUTEL_DOORSTROOM }), metLaders(l));
      expect(uit).toEqual({ soort: 'geen' });
      expect(aanroepen).toEqual({ koppeling: 0, index: 0, bk: [] });
      expect(leesBkKort(SLEUTEL_DOORSTROOM)).toEqual({ soort: 'zonder-cursus', bks: 0 });
    });

    it('een richting die beroepskwalificaties kan hebben maar waarvoor de koppeling er geen kent: "geen", en dat blijft onthouden', async () => {
      const animator = infoVan('G-0429');
      expect(kanBkHebben(animator)).toBe(true);
      const sleutel = kaderGroepSleutel(animator, 'so');
      const { aanroepen, laders: l } = laders();
      const uit = await berekenBk(invoer({ info: animator, sleutel }), metLaders(l));
      expect(uit).toEqual({ soort: 'geen' });
      expect(aanroepen.bk).toEqual([]);
      const bewaard = leesBkKort(sleutel);
      expect(bewaard).toEqual({ soort: 'zonder-cursus', bks: 0 });
      expect(bkRijZin(bewaard as BkKort)).toBe('');
    });

    it('zonder BK-cursus: alleen de koppeling en de index, geen enkel BK-bestand', async () => {
      const { aanroepen, laders: l } = laders();
      const uit = await berekenBk(invoer(), metLaders(l));
      expect(uit).toEqual({ soort: 'kort', kort: { soort: 'zonder-cursus', bks: 2 } });
      expect(aanroepen).toEqual({ koppeling: 1, index: 1, bk: [] });
      expect(bkRijZin(leesBkKort(SLEUTEL_PRAKTIJK) as BkKort)).toBe('Nog geen cursus met de competenties van de 2 beroepskwalificaties.');
    });

    it('met een cursus met 8 van de 12 competenties: dezelfde getallen als het detail bij "Alle jaren" (I4)', async () => {
      const { leerplanVoorKeuze, cursusVoorBk } = await import('./bk/BkKeuze');
      const dg = doelgroepVan(PRAKTIJK, { groep: 'G-0008', soort: 'so', jaar: 3 });
      const gegevens = {
        bestanden: new Map([[ONTHAAL.bk, ONTHAAL], [RECREATIEF.bk, RECREATIEF]]),
        merken: new Map([[ONTHAAL.bk, ONTHAAL.sha256.slice(0, 16)], [RECREATIEF.bk, RECREATIEF.sha256.slice(0, 16)]]),
        ontbreekt: [],
      };
      const keuze = leerplanVoorKeuze({
        info: PRAKTIJK, doelgroep: dg, vak: undefined, selectie: new Map([[ONTHAAL.bk, ONTHAAL.competenties.slice(0, 8).map((c) => c.id)]]),
        gegevens, curricula: [],
      });
      if (keuze.soort !== 'nieuw') throw new Error(`verwacht een nieuw leerplan, kreeg ${keuze.soort}`);
      const cursus: Course = cursusVoorBk({ titel: 'Praktijk', auteur: 'T', doelgroep: dg, leerplan: keuze.leerplan, bestanden: gegevens.bestanden, start: 'geraamte' });
      const curricula: Curriculum[] = [keuze.leerplan];

      const { laders: l } = laders();
      const uit = await berekenBk(invoer({ opslag: { gen: dekkingGeneratie(), courses: [cursus], curricula } }), metLaders(l));

      // De berekening van het detail bij "Alle jaren" (BkDekking): kader, bijdragen zonder jaar, dekking en dan de korte regel.
      const kader = bkKader(KOPPELING, INDEX, PRAKTIJK, { groep: 'G-0008', soort: 'so' }, VANDAAG);
      const bijdragen = bijdragenVoorKader({ courses: [cursus], curricula, info: PRAKTIJK, soort: 'so', matrix: MATRIX, vandaag: VANDAAG });
      const bestanden = new Map([[ONTHAAL.bk, ONTHAAL], [RECREATIEF.bk, RECREATIEF]]);
      const detail = bkKortVan(dekkingBk(bkKaderDoelen(kader, bestanden), bijdragen, []), kader, bestanden);

      expect(uit).toEqual({ soort: 'kort', kort: detail });
      expect(detail).toMatchObject({ soort: 'getallen', bks: 2, totaal: 25, gedekt: 0, gepland: 8, zonderBestand: 0 });
      expect(bkRijZin(detail)).toBe('Je cursussen dekken 0 van de 25 competenties van 2 beroepskwalificaties. 8 staan gepland.');
      expect(leesBkKort(SLEUTEL_PRAKTIJK)).toEqual(detail);
    });
  });
});

// ── De klas: de meta van een cursus (§ 24.6.4) ──────────────────────────────

describe('KlasRichting: de beroepskwalificaties in de meta van een cursus', () => {
  const DG = doelgroepVan(PRAKTIJK, { groep: 'G-0008', soort: 'so', jaar: 3 });
  const gegevens = {
    bestanden: new Map([[ONTHAAL.bk, ONTHAAL], [RECREATIEF.bk, RECREATIEF]]),
    merken: new Map([[ONTHAAL.bk, ONTHAAL.sha256.slice(0, 16)], [RECREATIEF.bk, RECREATIEF.sha256.slice(0, 16)]]),
    ontbreekt: [],
  };

  async function bkCursus(titel: string, selectie: Map<string, string[]>): Promise<{ cursus: Course; leerplan: Curriculum }> {
    const { leerplanVoorKeuze, cursusVoorBk } = await import('./bk/BkKeuze');
    const k = leerplanVoorKeuze({ info: PRAKTIJK, doelgroep: DG, vak: undefined, selectie, gegevens, curricula: [] });
    if (k.soort !== 'nieuw') throw new Error(`verwacht een nieuw leerplan, kreeg ${k.soort}`);
    return { cursus: cursusVoorBk({ titel, auteur: 'T', doelgroep: DG, leerplan: k.leerplan, bestanden: gegevens.bestanden, start: 'geraamte' }), leerplan: k.leerplan };
  }

  const toonKlas = (courses: Course[], curricula: Curriculum[], doelgroep = DG): string =>
    renderToStaticMarkup(createElement(
      StaticRouter,
      { location: '/' },
      createElement(KlasRichting, { doelgroep, courses, curricula, inKlas: new Set<string>(), onToewijzen: () => {} }),
    ));
  const metas = (html: string): string[] => [...html.matchAll(/<span class="kr-meta">([^<]*)<\/span>/g)].map((m) => m[1]);

  it('één beroepskwalificatie: "3de jaar · beroepskwalificatie Onthaalmedewerker"', async () => {
    const { cursus, leerplan } = await bkCursus('Onthaal', new Map([[ONTHAAL.bk, ONTHAAL.competenties.slice(0, 8).map((c) => c.id)]]));
    expect(metas(toonKlas([cursus], [leerplan]))).toEqual(['3de jaar · beroepskwalificatie Onthaalmedewerker']);
  });

  it('twee beroepskwalificaties, en een gewone cursus houdt alleen haar jaar', async () => {
    const { cursus, leerplan } = await bkCursus('Beide', new Map([
      [ONTHAAL.bk, ONTHAAL.competenties.slice(0, 3).map((c) => c.id)],
      [RECREATIEF.bk, RECREATIEF.competenties.slice(0, 3).map((c) => c.id)],
    ]));
    const gewoon = { id: 'gewoon', title: 'Gewone cursus', doelgroep: DG } as unknown as Course;
    const zonderJaar = { id: 'zonderjaar', title: 'Hele graad', doelgroep: { ...DG, jaar: undefined } } as unknown as Course;
    const html = toonKlas([cursus, gewoon, zonderJaar], [leerplan]);
    expect(metas(html)).toEqual([
      '3de jaar · beroepskwalificaties Onthaalmedewerker en Recreatief medewerker',
      '3de jaar',
      'hele graad',
    ]);
    // De zichtbare tekst, niet de link: die heeft het groepnummer wel in haar pad.
    expect(html.replace(/<[^>]*>/g, ' ')).not.toMatch(/bkc\d|ADV-|G-\d|ODS_/);
  });
});
