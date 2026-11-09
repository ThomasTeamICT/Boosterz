// De onderdelen van de lesplanpagina van het GO! (renderToStaticMarkup in een StaticRouter): opmaak van stukken en regels,
// pictogrammen met hun woord, tabellen, beelden, de bronvermelding en, op de echte lesplannen in public/basis/go/, dat de
// pagina alle tekst van het origineel toont, geen dubbele id's heeft en elke plek van 'In het kort' kan aanwijzen.
// vitest leest alleen src/**/*.test.ts, daarom staat dit in een .ts-bestand en bouwt het de elementen met createElement.

import { readFileSync, readdirSync } from 'node:fs';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import {
  GO_NAAMSVERMELDING,
  GO_STUDIO_URL,
  bronvermeldingLeerplan,
  bronvermeldingLesplan,
  type Blok,
  type Cel,
  type GoBeeld,
  type GoIndex,
  type GoLeerplanBestand,
  type GoLesplanBestand,
  type Regel,
} from '../../../lib/basis/go/types';
import {
  LesplanInhoud,
  aantalRegels,
  celVanWijzer,
  gaNaarLijst,
  maakDoelLink,
  stapWat,
  type Koppelingen,
} from '../../../pages/basis/LesplanScherm';
import { GoBronvermelding } from './GoBronvermelding';
import { GoBeeldWeergave, GoBlokken, GoRegel, GoTabel, GoTekstOptiesProvider, celTekst, regelTekst, rijenSamengevoegd, wijzerId } from './GoTekst';
import { GO_ICOON, GO_ICOON_WOORD, beginMetWoord, tekstNaIcoon } from './goIconen';

const toon = (el: ReactElement) => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, el));
const lees = (pad: string) => readFileSync(new URL(`../../../../public/basis/go/${pad}`, import.meta.url), 'utf8');

const ENTITEITEN: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'" };
/** De zichtbare tekst van de opmaak: blokken scheiden met een spatie, inline opmaak er geen spatie in. */
function tekstVan(html: string): string {
  return html
    .replace(/<span class="sr-only">[^<]*<\/span>/g, '')
    .replace(/<span class="b-lp-label"[^>]*>[^<]*<\/span>/g, '')
    .replace(/<figure[\s\S]*?<\/figure>/g, ' ')
    .replace(/<\/?(?:p|li|h[1-6]|td|th|tr|ul|ol|table|thead|tbody|div|figure|figcaption|details|summary|br|section|nav)\b[^>]*>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:amp|lt|gt|quot|#x27);/g, (m) => ENTITEITEN[m])
    .replace(/\s+/g, ' ')
    .trim();
}
const ids = (html: string) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

// ── Wijzers en tekst ─────────────────────────────────────────────────────────

describe('wijzerId', () => {
  it('bouwt de id uit deel, blok, rij, kolom, regel en item', () => {
    expect(wijzerId({ deel: 2, blok: 1 })).toBe('lp-d2-b1');
    expect(wijzerId({ deel: 2, blok: 1, rij: 1, kolom: 1, regel: 0 })).toBe('lp-d2-b1-r1-k1-g0');
    expect(wijzerId({ deel: 5, blok: 3, item: 2 })).toBe('lp-d5-b3-i2');
    expect(wijzerId({ deel: 5, blok: 3, rij: 1, kolom: 2, regel: 4, item: 0 })).toBe('lp-d5-b3-r1-k2-g4-i0');
  });
});

describe('regelTekst en celTekst', () => {
  it('geeft de platte tekst, een regeleinde als spatie en niets voor een icoon', () => {
    const r: Regel = [{ t: 'Een ', b: true }, { icoon: 'vlag' }, { br: true }, { t: 'twee' }];
    expect(regelTekst(r)).toBe('Een  twee');
  });
  it('voegt de alinea’s en lijstitems van een cel samen', () => {
    const cel: Cel = {
      rol: 'data',
      blokken: [
        { soort: 'alinea', tekst: [{ t: 'Kop' }] },
        { soort: 'lijst', genummerd: false, items: [[{ t: 'a' }], [{ t: 'b' }]] },
      ],
    };
    expect(celTekst(cel)).toBe('Kop a b');
  });
});

// ── Stukken en regels ────────────────────────────────────────────────────────

describe('GoRegel', () => {
  it('maakt de opmaak van de bron: vet, cursief, onderlijnd, doorgehaald en superschrift', () => {
    const html = toon(
      createElement(GoRegel, {
        regel: [{ t: 'vet', b: true }, { t: 'schuin', i: true }, { t: 'streep', u: true }, { t: 'weg', s: true }, { t: '3', sup: true }, { t: 'alles', b: true, i: true }],
      }),
    );
    expect(html).toContain('<strong>vet</strong>');
    expect(html).toContain('<em>schuin</em>');
    expect(html).toContain('<u>streep</u>');
    expect(html).toContain('<s>weg</s>');
    expect(html).toContain('<sup>3</sup>');
    expect(html).toContain('<strong><em>alles</em></strong>');
  });

  it('zet een regeleinde om in br en laat de tekst letterlijk staan (ook met speciale tekens)', () => {
    const html = toon(createElement(GoRegel, { regel: [{ t: 'a < b & "c"' }, { br: true }, { t: 'd' }] }));
    expect(html).toContain('<br/>');
    expect(tekstVan(html)).toBe('a < b & "c" d');
  });

  it('zet bij een vlag en een schakel altijd een zichtbaar woord, en geen alt-tekst op het icoon', () => {
    for (const icoon of ['vlag', 'schakel'] as const) {
      const html = toon(createElement(GoRegel, { regel: [{ icoon }, { t: '  ' }, { t: 'LL.001', b: true }] }));
      expect(html).toContain(`<span class="b-lp-icoonwoord">${icoon}</span>`);
      expect(html).toContain('aria-hidden="true"');
      expect(html).not.toMatch(/<svg[^>]*\balt=/);
      expect(html).not.toMatch(/<title>/);
    }
  });

  it('zet geen tweede woord als de tekst al met het woord begint ("Diploma")', () => {
    const html = toon(createElement(GoRegel, { regel: [{ icoon: 'diploma' }, { t: '   ' }, { t: 'Diploma', b: true }] }));
    expect(html).not.toContain('b-lp-icoonwoord');
    // Zonder witruimte-stuk ertussen ook.
    const direct = toon(createElement(GoRegel, { regel: [{ icoon: 'denklens' }, { t: 'Denklenzen', b: true }] }));
    expect(direct).not.toContain('b-lp-icoonwoord');
  });

  it('beginMetWoord kijkt naar het begin van het volgende stuk, zonder hoofdletters en voorafgaande witruimte', () => {
    expect(beginMetWoord('diploma', 'Diploma')).toBe(true);
    expect(beginMetWoord('deelconcept', '  Deelconcepten')).toBe(true);
    expect(beginMetWoord('go-concept', 'GO! concepten')).toBe(true);
    expect(beginMetWoord('denklens', 'Denklenzen')).toBe(true);
    expect(beginMetWoord('vlag', 'LL.001')).toBe(false);
    expect(beginMetWoord('vlag', undefined)).toBe(false);
  });

  it('elk van de zes pictogrammen heeft een Lucide-icoon en een woord', () => {
    for (const k of ['vlag', 'schakel', 'diploma', 'deelconcept', 'go-concept', 'denklens'] as const) {
      expect(GO_ICOON[k], k).toBeTruthy();
      expect(GO_ICOON_WOORD[k], k).toMatch(/\S/);
    }
  });

  it('maakt van een vette code van een bestaand leerplandoel een link, en laat de tekst gelijk', () => {
    const regel: Regel = [{ t: 'WT.229', b: true }, { t: ' Herkennen de vijf zintuigen.' }];
    const zonder = toon(createElement(GoRegel, { regel }));
    expect(zonder).not.toContain('<a ');
    const met = toon(
      createElement(GoTekstOptiesProvider, {
        opties: { doelLink: (c: string) => (c === 'WT.229' ? '/basis/leerplandoel/WT.229' : undefined) },
        children: createElement(GoRegel, { regel }),
      }),
    );
    expect(met).toContain('<strong><a class="b-lp-doelcode" href="/basis/leerplandoel/WT.229">WT.229</a></strong>');
    expect(tekstVan(met)).toBe(tekstVan(zonder));
  });

  it('linkt een code niet als ze niet vet is of niet bestaat', () => {
    const opties = { doelLink: (c: string) => (c === 'WT.229' ? '/x' : undefined) };
    const html = toon(
      createElement(GoTekstOptiesProvider, { opties, children: createElement(GoRegel, { regel: [{ t: 'WT.229' }, { t: 'NL.9999', b: true }] }) }),
    );
    expect(html).not.toContain('<a ');
  });
});

// ── Beeld ────────────────────────────────────────────────────────────────────

describe('GoBeeldWeergave', () => {
  const basis = { soort: 'beeld', bron: 'x.png', breedte: 400, hoogte: 400 } as const;

  it('toont een vrijgegeven beeld met zijn alt-tekst en de beschrijving in een details-blok', () => {
    const b: GoBeeld = { ...basis, status: 'getoond', bestand: 'beelden/x.webp', alt: 'Mindmap Mijn lichaam met de lichaamsdelen', uitleg: 'HOOFD: het oor.' };
    const html = toon(createElement(GoBeeldWeergave, { beeld: b, id: 'lp-d4-b2' }));
    expect(html).toMatch(/<img src="[^"]*basis\/go\/beelden\/x\.webp" alt="Mindmap Mijn lichaam met de lichaamsdelen"/);
    expect(html).toContain('<details');
    expect(html).toContain('HOOFD: het oor.');
    expect(html).toContain('id="lp-d4-b2"');
  });

  it('toont een beeld zonder beschrijving zonder details-blok', () => {
    const b: GoBeeld = { ...basis, status: 'getoond', bestand: 'beelden/x.webp', alt: 'Een beeld' };
    expect(toon(createElement(GoBeeldWeergave, { beeld: b }))).not.toContain('<details');
  });

  it('zet voor een weggelaten beeld de zin zichtbaar op zijn plaats, zonder img', () => {
    const b: GoBeeld = { ...basis, status: 'weggelaten', uitleg: 'Dit beeld staat niet in Boosterz.' };
    const html = toon(createElement(GoBeeldWeergave, { beeld: b }));
    expect(html).not.toContain('<img');
    expect(html).toContain('Dit beeld staat niet in Boosterz.');
  });
});

// ── Tabel ────────────────────────────────────────────────────────────────────

function cel(rol: Cel['rol'], tekst: string | null, samengevoegd?: Cel['samengevoegd']): Cel {
  return { rol, ...(samengevoegd ? { samengevoegd } : {}), blokken: tekst === null ? [] : [{ soort: 'alinea', tekst: [{ t: tekst }] }] };
}
const TABEL: Cel[][] = [
  [cel('kolomkop', null), cel('kolomkop', 'Inhoud (Wat?)'), cel('kolomkop', 'Didactiek (Hoe?)')],
  [cel('rijkop', 'Kennis'), cel('data', 'a'), cel('data', 'b')],
  [cel('rijkop', 'Leskern', 'begin'), cel('data', '1. Verkennen'), cel('data', 'x')],
  [cel('rijkop', null, 'vervolg'), cel('data', '2. Instructie'), cel('data', 'y')],
  [cel('rijkop', null, 'vervolg'), cel('data', '3. Terugkoppelen'), cel('data', null)],
];

describe('GoTabel', () => {
  const html = toon(createElement(GoTabel, { rijen: TABEL, pad: { deel: 4, blok: 1 } }));

  it('is een echte tabel met koprij, kolomkoppen met scope=col en rijkoppen met scope=row', () => {
    expect(html).toContain('<table');
    expect(html).toContain('<thead>');
    expect(html.match(/<th [^>]*scope="col"/g)).toHaveLength(3);
    expect(html.match(/<th [^>]*scope="row"/g)).toHaveLength(2);
    expect(html.match(/<td /g)).toHaveLength(8);
  });

  it('geeft een lege kop van de eerste kolom een woord voor de schermlezer', () => {
    expect(html).toContain('<span class="sr-only">Onderdeel</span>');
  });

  it('laat een cel over meerdere rijen lopen en slaat de vervolgcellen over', () => {
    expect(rijenSamengevoegd(TABEL, 2, 0)).toBe(3);
    expect(rijenSamengevoegd(TABEL, 1, 0)).toBe(1);
    expect(html).toContain('rowspan="3"');
    // Rij 3 en 4 hebben alleen nog twee cellen.
    expect(html.match(/<tr [^>]*id="lp-d4-b1-r3"[^>]*>(.*?)<\/tr>/)?.[1].match(/<t[dh] /g)).toHaveLength(2);
  });

  it('zet de rollen erbij en geeft elke gegevenscel de kolomkop als label voor de kaartweergave', () => {
    expect(html).toContain('role="table"');
    expect(html).toContain('role="row"');
    expect(html).toContain('role="columnheader"');
    expect(html).toContain('role="rowheader"');
    expect(html).toContain('role="cell"');
    expect(html).toContain('<span class="b-lp-label" aria-hidden="true">Inhoud (Wat?)</span>');
    expect(html).toContain('<span class="b-lp-label" aria-hidden="true">Didactiek (Hoe?)</span>');
  });

  it('geeft elke plek een id volgens de wijzer', () => {
    const lijst = ids(html);
    expect(lijst).toContain('lp-d4-b1');
    expect(lijst).toContain('lp-d4-b1-r2-k1');
    expect(lijst).toContain('lp-d4-b1-r2-k1-g0');
    expect(new Set(lijst).size).toBe(lijst.length);
  });

  it('geeft een tabel met rijkoppen een smalle eerste kolom en laat een lege cel in de kaart weg', () => {
    expect(html).toContain('class="b-lp-tabel b-lp-tabel-rijkop"');
    expect(html.match(/b-lp-cel-leeg/g)).toHaveLength(1);
    expect(html.match(/class="b-lp-label"/g)).toHaveLength(7);
    const tweeKolommen = toon(createElement(GoTabel, { rijen: [[cel('kolomkop', 'A'), cel('kolomkop', 'B')], [cel('data', 'a'), cel('data', 'b')]], pad: { deel: 3, blok: 2 } }));
    expect(tweeKolommen).toContain('class="b-lp-tabel"');
    expect(tweeKolommen).not.toContain('b-lp-tabel-rijkop');
  });

  it('een tabel zonder koprij heeft geen thead', () => {
    const zonder = toon(createElement(GoTabel, { rijen: TABEL.slice(1), pad: { deel: 1, blok: 1 } }));
    expect(zonder).not.toContain('<thead>');
  });
});

describe('GoBlokken', () => {
  it('maakt koppen van het juiste niveau, lijsten (ook genummerd met een start) en alinea’s met een id per blok', () => {
    const blokken: Blok[] = [
      { soort: 'kop', niveau: 2, tekst: [{ t: '2. Doelen' }] },
      { soort: 'kop', niveau: 3, tekst: [{ t: 'Drie' }] },
      { soort: 'kop', niveau: 4, tekst: [{ t: 'Vier' }] },
      { soort: 'alinea', tekst: [{ t: 'Tekst' }] },
      { soort: 'lijst', genummerd: false, items: [[{ t: 'een' }], [{ t: 'twee' }]] },
      { soort: 'lijst', genummerd: true, start: 3, items: [[{ t: 'drie' }]] },
    ];
    const html = toon(createElement(GoBlokken, { blokken, deel: 2 }));
    expect(html).toContain('<h2 id="lp-d2-b0">');
    expect(html).toContain('<h3 id="lp-d2-b1">');
    expect(html).toContain('<h4 id="lp-d2-b2">');
    expect(html).toContain('<p id="lp-d2-b3">');
    expect(html).toContain('<ul id="lp-d2-b4">');
    expect(html).toContain('<li id="lp-d2-b4-i1">');
    expect(html).toContain('<ol id="lp-d2-b5" start="3">');
  });
});

// ── Bronvermelding ───────────────────────────────────────────────────────────

describe('GoBronvermelding', () => {
  it('geeft bij een lesplan de zin van de eigenaar, met GO! studio als link naar studio.g-o.be', () => {
    const html = toon(createElement(GoBronvermelding, { soort: 'lesplan', code: 'LP0065' }));
    expect(tekstVan(html)).toBe(bronvermeldingLesplan('LP0065'));
    expect(tekstVan(html)).toBe(`Bron: ${GO_NAAMSVERMELDING}, lesplan LP0065 (GO! studio). Letterlijk overgenomen met toestemming.`);
    expect(html).toContain(`<a href="${GO_STUDIO_URL}" target="_blank" rel="noopener noreferrer">GO! studio`);
    expect(GO_STUDIO_URL).toBe('https://studio.g-o.be/');
  });

  it('zet de datum van de import erachter, als die er is', () => {
    const html = toon(createElement(GoBronvermelding, { soort: 'lesplan', code: 'LP0065', ingelezen: '2026-11-09' }));
    expect(tekstVan(html)).toBe(`${bronvermeldingLesplan('LP0065')} Ingelezen op 9 november 2026.`);
  });

  it('linkt niet naar een adres dat geen web-adres is', () => {
    const html = toon(createElement(GoBronvermelding, { soort: 'lesplan', code: 'LP0065', url: 'javascript:alert(1)' }));
    expect(html).not.toContain('<a ');
    expect(tekstVan(html)).toBe(bronvermeldingLesplan('LP0065'));
  });

  it('geeft bij een leerplandoel de zin van de doelenset, zonder link', () => {
    const html = toon(createElement(GoBronvermelding, { soort: 'leerplan', vak: 'WT' }));
    expect(tekstVan(html)).toBe(
      `Bron: ${GO_NAAMSVERMELDING}, het nieuwe GO! leerplan basisonderwijs, doelenset wetenschap en techniek. Letterlijk overgenomen met toestemming.`,
    );
    expect(tekstVan(html)).toBe(bronvermeldingLeerplan('WT'));
    expect(html).not.toContain('<a ');
  });
});

// ── De echte lesplannen ──────────────────────────────────────────────────────

const INDEX = JSON.parse(lees('index.json')) as GoIndex;
const WT = JSON.parse(lees('leerplan/WT.json')) as GoLeerplanBestand;
const CODES = readdirSync(new URL('../../../../public/basis/go/lesplannen/', import.meta.url))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();
const lesplan = (code: string) => JSON.parse(lees(`lesplannen/${code}.json`)) as GoLesplanBestand;
const KLAAR: Koppelingen = { status: 'klaar', perCode: new Map(WT.doelen.map((d) => [d.code, d])) };

/** Wat de pagina aan letterlijke tekst moet tonen, in volgorde: de stukken van elk blok, een icoon als zijn woord. */
function verwacht(lp: GoLesplanBestand): string {
  const regel = (r: Regel) =>
    r
      .map((s, n) => {
        if ('t' in s) return s.t;
        if ('br' in s) return ' ';
        return beginMetWoord(s.icoon, tekstNaIcoon(r, n)) ? '' : GO_ICOON_WOORD[s.icoon];
      })
      .join('');
  const blok = (b: Blok | Cel['blokken'][number]): string[] => {
    switch (b.soort) {
      case 'kop':
      case 'alinea':
        return [regel(b.tekst)];
      case 'lijst':
        return b.items.map(regel);
      case 'tabel':
        return b.rijen.flatMap((r) => r.flatMap((c) => (c.samengevoegd === 'vervolg' ? [] : c.blokken.flatMap(blok))));
      case 'beeld':
        return [];
    }
  };
  // De Heading1 staat als h1 boven de pagina, niet in de tekst eronder.
  return lp.delen
    .flatMap((d) => (d.nr === 0 ? d.blokken.slice(1) : d.blokken).flatMap(blok))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('de lesplannen in public/basis/go/', () => {
  it('zijn er (de 8 lesplannen van de eerste reeks)', () => {
    expect(CODES.length).toBeGreaterThanOrEqual(8);
  });

  describe.each(CODES)('%s', (code) => {
    const lp = lesplan(code);
    const html = toon(createElement(LesplanInhoud, { lesplan: lp, index: INDEX, koppelingen: KLAAR }));
    const koppen = (n: number) => html.match(new RegExp(`<h${n}[ >]`, 'g')) ?? [];

    it('heeft precies één h1, de letterlijke Heading1', () => {
      expect(koppen(1)).toHaveLength(1);
      const kop = lp.delen[0].blokken[0];
      expect(kop.soort).toBe('kop');
      const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '';
      expect(tekstVan(h1)).toBe(regelTekst((kop as Extract<Blok, { soort: 'kop' }>).tekst));
      expect(tekstVan(h1)).toMatch(new RegExp(`^Lesplan ${code} .+ \\(\\d.* jaar\\)$`));
    });

    it('heeft een kop h2 voor elk deel en voor "In het kort"', () => {
      expect(koppen(2)).toHaveLength(lp.delen.length - 1 + 1);
      expect(html).toContain('<h2 id="lp-kort-kop">In het kort</h2>');
    });

    it('toont alle tekst van het lesplan letterlijk, in de volgorde van de bron', () => {
      const tekst = /<div class="b-lp-tekst">([\s\S]*)<\/div><\/div>$/.exec(html)?.[1] ?? '';
      expect(tekst.length).toBeGreaterThan(1000);
      expect(tekstVan(tekst)).toBe(verwacht(lp));
    });

    it('heeft nergens dubbele id’s', () => {
      const lijst = ids(html);
      expect(new Set(lijst).size, lijst.filter((x, n) => lijst.indexOf(x) !== n).join(', ')).toBe(lijst.length);
    });

    it('wijst elke plek van "In het kort" en elk onderdeel van "Ga naar" aan met een bestaande id', () => {
      const bestaand = new Set(ids(html));
      const a = lp.afgeleid;
      const wijzers = [
        ...a.leerplandoelen.map((d) => d.waar),
        ...a.diplomas.map((d) => d.waar),
        ...a.stappen.flatMap((s) => [s.wat, s.hoe]),
        ...a.trainen.flatMap((t) => [t.vanaf, t.tot]),
        a.materiaal,
      ];
      for (const w of wijzers) expect(bestaand.has(wijzerId(w)), wijzerId(w)).toBe(true);
      for (const g of gaNaarLijst(lp)) expect(bestaand.has(g.id), g.id).toBe(true);
    });

    it('toont de bronvermelding en de onderregel met de leeftijd van het GO! en "waarschijnlijk"', () => {
      expect(tekstVan(html)).toContain(bronvermeldingLesplan(code));
      expect(html).toContain('<nav class="b-lp-ganaar" aria-label="Ga naar">');
      const onder = /<p class="b-onderregel">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '';
      expect(tekstVan(onder)).toContain(`${lp.leeftijd} jaar (meestal `);
      expect(tekstVan(onder)).toContain('waarschijnlijk');
    });

    it('toont bij elk leerplandoel de chips met de minimumdoelen of "zonder minimumdoel"', () => {
      const kort = /<section class="b-lp-kort"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
      for (const d of lp.afgeleid.leerplandoelen) {
        const doel = WT.doelen.find((x) => x.code === d.code);
        expect(doel, d.code).toBeTruthy();
        for (const r of doel?.minimumdoelen.refs ?? []) {
          expect(kort, `${d.code} ${r.code}`).toContain(`href="/basis/doel/${r.set}/${r.id}"`);
        }
        if ((doel?.minimumdoelen.refs ?? []).length === 0) expect(kort).toContain('zonder minimumdoel');
      }
    });

    it('heeft geen afbeelding zonder alt-tekst en geen link buiten de app behalve de bron', () => {
      for (const m of html.matchAll(/<img\b[^>]*>/g)) expect(m[0]).toMatch(/\salt="[^"]+"/);
      const extern = [...html.matchAll(/<a [^>]*href="(https?:[^"]+)"/g)].map((m) => m[1]);
      expect(extern).toEqual([GO_STUDIO_URL]);
    });
  });

  it('LP0014a en LP0014b tonen de mindmap met een beschrijvende alt-tekst en de beschrijving in woorden', () => {
    for (const code of ['LP0014a', 'LP0014b']) {
      const html = toon(createElement(LesplanInhoud, { lesplan: lesplan(code), index: INDEX, koppelingen: KLAAR }));
      const img = /<img\b[^>]*>/.exec(html)?.[0] ?? '';
      expect(img, code).toMatch(/src="[^"]*basis\/go\/beelden\/e11d61d723cc34e449f987f8bb06b5eb44de2082\.webp"/);
      const alt = /\salt="([^"]+)"/.exec(img)?.[1] ?? '';
      expect(alt.length, code).toBeGreaterThan(60);
      expect(alt, code).toMatch(/lichaam/i);
      expect(html, code).toContain('<details class="b-lp-beeld-uitleg">');
      expect(html, code).not.toContain('b-lp-beeld-weg');
    }
  });

  it('zet bij elk pictogram precies één zichtbaar woord: bij een vlag en een schakel het icoonwoord, bij de rest de kop zelf', () => {
    const tel = { vlag: 0, schakel: 0, anders: 0 };
    const verwachtTelling = { vlag: 0, schakel: 0, anders: 0 };
    const bekijk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(bekijk);
      else if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        if (typeof o.icoon === 'string') verwachtTelling[o.icoon === 'vlag' || o.icoon === 'schakel' ? o.icoon : 'anders']++;
        Object.values(o).forEach(bekijk);
      }
    };
    for (const code of CODES) {
      const lp = lesplan(code);
      bekijk(lp.delen);
      const html = toon(createElement(LesplanInhoud, { lesplan: lp, index: INDEX, koppelingen: KLAAR }));
      tel.vlag += (html.match(/<span class="b-lp-icoonwoord">vlag<\/span>/g) ?? []).length;
      tel.schakel += (html.match(/<span class="b-lp-icoonwoord">schakel<\/span>/g) ?? []).length;
      tel.anders += (html.match(/<span class="b-lp-icoonwoord">(?!vlag<|schakel<)[^<]*<\/span>/g) ?? []).length;
    }
    expect(verwachtTelling.vlag + verwachtTelling.schakel).toBeGreaterThan(0);
    expect(tel.vlag).toBe(verwachtTelling.vlag);
    expect(tel.schakel).toBe(verwachtTelling.schakel);
    expect(tel.anders).toBe(0);
  });

  it('de ankers van "In het kort" werken ook als de index of de minimumdoelen nog niet geladen zijn', () => {
    const lp = lesplan('LP0065');
    const laden = toon(createElement(LesplanInhoud, { lesplan: lp, koppelingen: { status: 'laden' } }));
    expect(laden).toContain('De minimumdoelen worden geladen');
    expect(laden).not.toContain('class="b-lp-doelcode"');
    const fout = toon(createElement(LesplanInhoud, { lesplan: lp, index: INDEX, koppelingen: { status: 'fout', fout: 'Mislukt', opnieuw: () => undefined } }));
    expect(fout).toContain('Mislukt');
    expect(fout).toContain('Opnieuw proberen');
  });
});

describe('LP0065 (de proef)', () => {
  const lp = lesplan('LP0065');
  const html = toon(createElement(LesplanInhoud, { lesplan: lp, index: INDEX, koppelingen: KLAAR }));

  it('toont de leerplandoelen met kennisverwerking, tekst, leeftijden en minimumdoelen', () => {
    const kort = /<section class="b-lp-kort"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
    expect(tekstVan(kort)).toContain('WT.001 begrijpen Herkennen het organisme dier. (2,5-4 jaar)');
    expect(kort).toContain('Einde kleuter 3.1.2');
    // WT.008 en WT.057 zijn eigen doelen van het GO!: geen minimumdoel.
    expect(tekstVan(kort)).toMatch(/WT\.008 begrijpen .*zonder minimumdoel/);
  });

  it('zet de vlaggen van deel 3 als link naar hun leerplandoel, met het woord "vlag"', () => {
    expect(html).toContain('href="/basis/leerplandoel/LL.001"');
    expect(html).toContain('href="/basis/leerplandoel/LL.096"');
    expect(html).toContain('<span class="b-lp-icoonwoord">vlag</span>');
  });

  it('toont het lesverloop met de zes stappen en een link naar elke stap', () => {
    const kort = /<section class="b-lp-kort"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
    for (const s of lp.afgeleid.stappen) expect(tekstVan(kort)).toContain(`${s.nr}. ${s.naam}`);
    expect(lp.afgeleid.stappen).toHaveLength(6);
  });

  it('heeft de onderdelen van "Ga naar"', () => {
    expect(gaNaarLijst(lp).map((g) => g.label)).toEqual(['Wat moet de leraar weten', 'Doelen', 'Samenhang', 'Lesopbouw', 'Trainen', 'Materiaal']);
    expect(gaNaarLijst(lesplan('LP0014a')).map((g) => g.label).pop()).toBe('Bijlagen');
  });
});

describe('hulpfuncties van LesplanScherm', () => {
  const lp = lesplan('LP0065');

  it('maakDoelLink geeft alleen een adres voor een code die in de index bestaat', () => {
    const link = maakDoelLink(INDEX);
    expect(link?.('WT.086')).toBe('/basis/leerplandoel/WT.086');
    expect(link?.('WT.528')).toBe('/basis/leerplandoel/WT.528');
    expect(link?.('WT.529')).toBeUndefined();
    expect(link?.('WT.000')).toBeUndefined();
    expect(link?.('XX.001')).toBeUndefined();
    expect(link?.('NL.3441')).toBeUndefined();
    expect(maakDoelLink(undefined)).toBeUndefined();
  });

  it('celVanWijzer en stapWat geven de cel en de tekst van de kolom Wat? zonder de kop van de stap', () => {
    const s = lp.afgeleid.stappen[0];
    const c = celVanWijzer(lp, s.wat);
    expect(c && celTekst(c)).toMatch(/^1\. Verkennen /);
    const wat = stapWat(lp, s.wat, 1);
    expect(wat.length).toBeGreaterThan(0);
    expect(regelTekst(wat[0])).not.toMatch(/^1\. Verkennen$/);
    expect(celVanWijzer(lp, { deel: 1, blok: 0 })).toBeUndefined();
    expect(stapWat(lp, { deel: 99, blok: 0 }, 1)).toEqual([]);
  });

  it('aantalRegels telt de items van een lijst', () => {
    expect(aantalRegels(lp, lp.afgeleid.materiaal)).toBeGreaterThan(1);
    expect(aantalRegels(lp, { deel: 99, blok: 0 })).toBe(0);
  });
});
