// De leerlijn en het zoeken (renderToStaticMarkup in een StaticRouter), met zelfgemaakte koppen en doelen. De klok en de
// gegevensbestanden worden niet gelezen; de getallen op de echte gegevens staan in src/lib/basis/basisIngang.echt.test.ts.

import { readFileSync } from 'node:fs';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import { LeerlijnTabel } from '../../components/basis/LeerlijnTabel';
import { EERST_TONEN, ZoekResultaten, doelSleutel, markeerStammen } from '../../components/basis/ZoekResultaten';
import { ZoekVeld } from '../../components/basis/ZoekVeld';
import { leerlijnVanVak, type DoelBasis } from '../../lib/basis/doelBasis';
import type { Eindmoment } from '../../lib/basis/kalender';
import { basisSet, type BasisSet } from '../../lib/basis/moment';
import { leesVraag, zoekDoelen, zoekDoelVan, type Uitslag } from '../../lib/basis/zoekBasis';
import { ZOEKWOORDEN } from '../../lib/basis/zoekwoorden';
import type { MinimumdoelenIndexSet } from '../../lib/minimumdoelen';
import { LeerlijnInhoud, LeerlijnenInhoud, vakInZin } from './LeerlijnScherm';
import { alleenGoCodes, echtBereik, goCodesIn, heeftDoelenNodig, zoekSets } from './ZoekScherm';

const toon = (el: ReactElement) => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, el));
const tekst = (html: string) => html.replace(/<span class="sr-only">[^<]*<\/span>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const tel = (html: string, patroon: RegExp) => (html.match(patroon) ?? []).length;

// ─── Koppen en doelen ────────────────────────────────────────────────────────

function kop(id: string, naam: string, korteNaam: string, aantal: number): MinimumdoelenIndexSet {
  return { id, naam, korteNaam, aantal, sha256: 'x', opgehaald: '2026-11-01T00:00:00Z', bestand: `${id}.json`, versie: '2.0', geldigVan: '2025-09-01', geldigheid: 'Geldig' };
}
const POP = 'Te bereiken minimumdoelen op populatieniveau';
const NASTREVEN = 'Na te streven minimumdoelen op populatieniveau';
const WT_L4 = kop('ODS_3408', `Lager Onderwijs 4de leerjaar -  Wetenschap en techniek - ${POP}`, 'Wetenschap en techniek', 3);
const WT_K3 = kop('ODS_3420', `Kleuteronderwijs -  Wetenschap en techniek - ${NASTREVEN}`, 'Wetenschap en techniek', 1);
const WT_L6 = kop('ODS_3430', `Lager Onderwijs 6de leerjaar -  Wetenschap en techniek - ${POP}`, 'Wetenschap en techniek', 1);
const WT_BU_L4 = kop('ODS_3469', `Buitengewoon Lager Onderwijs 4de leerjaar -  Wetenschap en techniek - ${NASTREVEN}`, 'Wetenschap en techniek', 3);
const NL_L4 = kop('ODS_3395', `Lager Onderwijs 4de leerjaar -  Nederlands - ${POP}`, 'Nederlands', 2);
const ALLE = [WT_L4, WT_K3, WT_L6, WT_BU_L4, NL_L4];

function doel(setId: string, id: string, code: string, extra: Partial<DoelBasis> = {}): DoelBasis {
  const info = basisSet(ALLE.find((s) => s.id === setId) as MinimumdoelenIndexSet) as BasisSet;
  return {
    setId, id, code,
    soort: info.soort,
    eind: info.eindmoment ?? 'L4',
    vak: Number(code.split('.')[0]),
    onderwerpNr: code.split('.').slice(0, 2).join('.'),
    onderwerp: 'Natuurkundige verschijnselen',
    soortDoel: info.soortDoelen,
    doelzinHtml: `<p>Doelzin van ${code}.</p>`,
    ...extra,
  };
}

const D352 = doel('ODS_3408', '92766', '3.5.2', { subthema: 'Licht', doelzinHtml: '<p>De leerlingen onderzoeken schaduw.</p>' });
const D354 = doel('ODS_3408', '92767', '3.5.4', {
  subthema: 'Licht',
  doelzinHtml: '<p>De leerlingen kennen licht: rechtlijnige beweging.</p>',
  uitbreidingHtml: '<ul><li>lichtbron</li><li>lichtrichting</li><li>belichting</li></ul>',
});
const D361 = doel('ODS_3408', '92800', '3.6.1', { onderwerpNr: '3.6', onderwerp: 'Technische systemen', doelzinHtml: '<p>Een doel <strong>zonder</strong> subthema.</p>' });
const K354 = doel('ODS_3420', '92730', '3.5.4', { subthema: 'Licht', doelzinHtml: '<p>De kleuters kennen licht.</p>' });
const L6354 = doel('ODS_3430', '92833', '3.5.4', { subthema: 'Licht', doelzinHtml: '<p>De leerlingen kennen licht en lichtbronnen.</p>', woordenschatHtml: '<p>schaduw, spiegel</p>' });
const N111 = doel('ODS_3395', '90100', '1.1.1', { onderwerpNr: '1.1', onderwerp: 'Luisteren', doelzinHtml: '<p>De leerlingen luisteren naar een verhaal.</p>' });
const WT = [D352, D354, D361, K354, L6354];
const MOMENTEN = new Set(['K3', 'L4', 'L6'] as const);

// ─── LeerlijnTabel ───────────────────────────────────────────────────────────

describe('LeerlijnTabel', () => {
  const lijn = leerlijnVanVak(WT);
  const o35 = lijn.find((o) => o.nr === '3.5');
  const o36 = lijn.find((o) => o.nr === '3.6');
  if (!o35 || !o36) throw new Error('fixture');

  it('is een echte tabel met caption, scope=col en scope=row', () => {
    const html = toon(createElement(LeerlijnTabel, { onderwerp: o35, eigen: 'L4', momenten: MOMENTEN, smal: false }));
    expect(tel(html, /<table/g)).toBe(1);
    expect(html).toMatch(/<caption[^>]*>[^<]*3\.5 Natuurkundige verschijnselen/);
    expect(tel(html, /<th scope="col"/g)).toBe(4);
    expect(html).toMatch(/<th scope="row"[^>]*>Licht<\/th>/);
    expect(tekst(html)).toContain('Einde kleuter');
    expect(tekst(html)).toContain('Einde 6de leerjaar');
  });

  it('zegt (je leerjaar) bij het moment van het leerjaar en nergens anders', () => {
    const html = toon(createElement(LeerlijnTabel, { onderwerp: o35, eigen: 'L4', momenten: MOMENTEN, smal: false }));
    expect(tel(html, /\(je leerjaar\)/g)).toBe(1);
    expect(html).toMatch(/class="b-kolom-eigen">Einde 4de leerjaar<span class="b-kolom-noot"> \(je leerjaar\)/);
    expect(html).not.toContain('(je klas)');
    expect(toon(createElement(LeerlijnTabel, { onderwerp: o35, momenten: MOMENTEN, smal: false }))).not.toContain('(je leerjaar)');
  });

  it('toont de code en de letterlijke doelzin per cel, en de uitbreiding in een details naast de link', () => {
    const html = toon(createElement(LeerlijnTabel, { onderwerp: o35, eigen: 'L4', momenten: MOMENTEN, smal: false }));
    expect(tekst(html)).toContain('3.5.4 De leerlingen kennen licht: rechtlijnige beweging.');
    expect(tekst(html)).toContain('Toon de opsomming (3 punten)');
    expect(html).toContain('href="/basis/doel/ODS_3408/92767"');
    expect(tekst(html)).not.toContain('→');
  });

  it('schrijft in een lege cel waarom ze leeg is', () => {
    // 3.6 heeft alleen een doel op einde 4de: de kleuter- en 6de-cel zijn leeg. Het vak heeft op die momenten wel een set.
    const html = toon(createElement(LeerlijnTabel, { onderwerp: o36, eigen: 'L4', momenten: MOMENTEN, smal: false }));
    expect(tel(html, /Op dit moment niet apart vermeld/g)).toBe(2);
    expect(tekst(html)).toContain('Zonder subthema');
    // Een vak zonder set op een moment.
    const zonder = toon(createElement(LeerlijnTabel, { onderwerp: o36, momenten: new Set(['L4'] as const), smal: false }));
    expect(tel(zonder, /Geen doelen voor dit moment/g)).toBe(2);
    expect(zonder).not.toContain('Op dit moment niet apart vermeld');
  });

  it('wordt op een smal scherm een kaart: het moment van het leerjaar open, de andere dicht met hun aantal', () => {
    const html = toon(createElement(LeerlijnTabel, { onderwerp: o35, eigen: 'L4', momenten: MOMENTEN, smal: true }));
    expect(html).toContain('b-tabel-kaarten');
    expect(tel(html, /<details class="b-cel-details" open=""/g)).toBe(1);
    expect(tel(html, /<details class="b-cel-details"/g)).toBe(3);
    expect(tekst(html)).toContain('Einde 4de leerjaar (je leerjaar) (2 doelen)');
    expect(tekst(html)).toContain('Einde kleuter (1 doel)');
    // Een lege cel is één regel met het moment ervoor.
    const leeg = toon(createElement(LeerlijnTabel, { onderwerp: o36, eigen: 'L4', momenten: MOMENTEN, smal: true }));
    expect(tekst(leeg)).toContain('Einde kleuter: Op dit moment niet apart vermeld');
  });

  it('zonder matchMedia (server, test) is het een gewone tabel', () => {
    expect(toon(createElement(LeerlijnTabel, { onderwerp: o35, momenten: MOMENTEN }))).not.toContain('b-tabel-kaarten');
  });
});

// ─── LeerlijnInhoud ──────────────────────────────────────────────────────────

describe('LeerlijnInhoud en LeerlijnenInhoud', () => {
  const props = { soort: 'bao' as const, vak: 3, doelen: WT, momenten: MOMENTEN, smal: false };

  it('heeft één h1 met de vaknaam, de uitlegzin en een tabel per onderwerp', () => {
    const html = toon(createElement(LeerlijnInhoud, props));
    expect(tel(html, /<h1/g)).toBe(1);
    expect(html).toMatch(/<h1[^>]*>.*Leerlijn wetenschap en techniek<\/span><\/h1>/);
    expect(tekst(html)).toContain('Per onderwerp staan de doelen van de drie momenten naast elkaar. De codes lopen niet door, en de bron zegt niet welk doel uit welk ander volgt.');
    expect(tel(html, /<table/g)).toBe(2);
    expect(tel(html, /<h2/g)).toBe(2);
  });

  it('markeert de kolom van het leerjaar en noemt het leerjaar', () => {
    const html = toon(createElement(LeerlijnInhoud, { ...props, leerjaar: 'L3' as const }));
    expect(tekst(html)).toContain('Je 3de leerjaar werkt naar einde 4de leerjaar');
    expect(tel(html, /\(je leerjaar\)/g)).toBeGreaterThanOrEqual(2);
    expect(html).toContain('?leerjaar=L3');
  });

  it('linkt naar het leerplan van het GO! voor dit vak, met het leerjaar', () => {
    const html = toon(createElement(LeerlijnInhoud, { ...props, leerjaar: 'K1' as const }));
    expect(html).toContain('href="/basis/leerplandoelen/wt?leerjaar=K1"');
    expect(tekst(html)).toContain('Leerplan van het GO!: wetenschap en techniek');
  });

  it('laat gewoon en buitengewoon wisselen met dezelfde pagina', () => {
    const html = toon(createElement(LeerlijnInhoud, props));
    expect(html).toContain('href="/basis/leerlijn/buitengewoon/wetenschap-en-techniek"');
    expect(html).toContain('aria-current="true"');
  });

  it('zegt het als het vak geen nieuwe doelen heeft', () => {
    const html = toon(createElement(LeerlijnInhoud, { ...props, doelen: [], momenten: new Set<Eindmoment>() }));
    expect(tekst(html)).toContain('geen nieuwe doelen in de gegevens');
    expect(html).not.toContain('<table');
  });

  it('schrijft de vaknaam in een zin met kleine letter, behalve Nederlands, Frans en ICT', () => {
    expect(vakInZin('Wetenschap en techniek')).toBe('wetenschap en techniek');
    expect(vakInZin('Nederlands')).toBe('Nederlands');
    expect(vakInZin('Frans')).toBe('Frans');
    expect(vakInZin('ICT')).toBe('ICT');
    expect(toon(createElement(LeerlijnInhoud, { ...props, vak: 1, doelen: [N111], momenten: new Set(['L4'] as const) }))).toContain('Leerlijn Nederlands');
  });

  it('LeerlijnenInhoud: tien vaktegels naar de leerlijn, met het leerjaar', () => {
    const html = toon(createElement(LeerlijnenInhoud, { soort: 'bao', leerjaar: 'L3', alle: ALLE }));
    expect(tel(html, /class="b-vakkaart"/g)).toBe(10);
    expect(html).toContain('href="/basis/leerlijn/gewoon/wetenschap-en-techniek?leerjaar=L3"');
    expect(tekst(html)).toContain('Wetenschap en techniek Einde kleuter · Einde 4de leerjaar · Einde 6de leerjaar');
    expect(tekst(html)).toContain('Frans Geen nieuwe doelen in de gegevens');
  });
});

// ─── Zoeken ──────────────────────────────────────────────────────────────────

const ALLE_DOELEN = [D352, D354, D361, K354, L6354, N111];
const DOELMAP = new Map(ALLE_DOELEN.map((d) => [doelSleutel(d.setId, d.id), d]));
const ZOEKLIJST = ALLE_DOELEN.map(zoekDoelVan);

function zoek(q: string, opties: { eigenEind?: 'K3' | 'L4' | 'L6' } = {}): Uitslag {
  return zoekDoelen(ZOEKLIJST, leesVraag(q, ZOEKWOORDEN), opties);
}
function resultaten(q: string, extra: Partial<Parameters<typeof ZoekResultaten>[0]> = {}): string {
  return toon(createElement(ZoekResultaten, { uitslag: zoek(q, { eigenEind: 'L4' }), vraagTekst: q, doelen: DOELMAP, soort: 'bao', bereik: 'alles', alle: ALLE, ...extra }));
}

describe('ZoekVeld', () => {
  it('is een form role=search met een label voor schermlezers, een invoer en de knop Zoek', () => {
    const html = toon(createElement(ZoekVeld, { vraag: 'schaduw', label: 'Zoek in alle doelen', onZoek: () => undefined }));
    expect(html).toContain('<form class="b-zoekrij" role="search"');
    expect(html).toMatch(/<label for="b-zoek-invoer" class="sr-only">Zoek in alle doelen<\/label>/);
    expect(html).toContain('id="b-zoek-invoer"');
    expect(html).toContain('value="schaduw"');
    expect(html).toContain('>Zoek</button>');
  });
});

describe('ZoekResultaten', () => {
  it('groepeert de treffers per vak en onderwerp en toont het aantal', () => {
    const html = resultaten('schaduw');
    expect(html).toMatch(/<h2>Wetenschap en techniek › Natuurkundige verschijnselen <span[^>]*>\(\d\)<\/span><\/h2>/);
    expect(tekst(html)).toContain('doelen gevonden voor "schaduw" in alle vakken en momenten.');
    expect(html).toMatch(/<p class="b-zoekstatus" role="status">/);
  });

  it('zet het doel van de eigen klas voor de rest en geeft 92767 via de woordentabel', () => {
    const u = zoek('schaduw', { eigenEind: 'L4' });
    expect(u.treffers.map((t) => t.doel.id)).toContain('92767');
    expect(u.treffers[0].doel.eind).toBe('L4');
    const html = resultaten('schaduw');
    expect(tekst(html)).toContain('Ook gezocht op: ');
    expect(tekst(html)).toContain('lichtbron');
  });

  it('zet het gevonden woord in <mark> in de doelzin', () => {
    const html = resultaten('schaduw');
    expect(html).toMatch(/<mark>schaduw<\/mark>/);
  });

  it('opent een treffer die alleen in de uitbreiding staat, met het woord in <mark>', () => {
    const html = resultaten('lichtrichting');
    expect(html).toMatch(/<details class="b-doelrij-deel" open="">/);
    expect(html).toMatch(/<mark>lichtrichting<\/mark>/);
    expect(tekst(html)).toContain('Toon de opsomming (3 punten)');
  });

  it('laat een treffer zonder gevonden woord in de uitbreiding ingeklapt', () => {
    const html = resultaten('rechtlijnige');
    expect(html).toContain('<details class="b-doelrij-deel">');
    expect(html).not.toContain('open=""');
  });

  it('versoepelt bij weinig treffers met "Ook met een deel van je woorden:"', () => {
    // 'licht' staat in D354, 'kleuters' is een moment; 'schaduw onderzoeken': D352 heeft allebei, andere hebben er één.
    const html = resultaten('schaduw onderzoeken');
    expect(html).toContain('<h2>Ook met een deel van je woorden:</h2>');
    expect(tekst(html)).toContain('Er zijn weinig doelen met al je woorden');
    expect(html).toMatch(/<h3>Wetenschap en techniek › Natuurkundige verschijnselen/);
  });

  it('zonder treffers met alle woorden maar met een deel zegt de statusregel dat', () => {
    const html = resultaten('schaduw spiegel verhaal');
    expect(tekst(html)).toMatch(/Geen doelen met al je woorden in alle vakken en momenten, wel \d+ met een deel ervan\./);
    expect(html).toContain('Ook met een deel van je woorden:');
  });

  it('toont chips voor het herkende moment en vak, met de volledige vaknaam', () => {
    const html = resultaten('schaduw 3de leerjaar wetenschap');
    expect(html).toMatch(/<ul class="b-chips" aria-label="Herkende filters">/);
    expect(tekst(html)).toContain('3de leerjaar');
    expect(tekst(html)).toContain('Wetenschap en techniek');
  });

  it('geeft hulp bij een lege vraag, zonder 0 treffers te melden', () => {
    for (const q of ['', 'de', 'kinderen']) {
      const html = resultaten(q);
      expect(tekst(html)).toContain('Typ een woord om te zoeken.');
      expect(tekst(html)).not.toContain('Geen doelen gevonden');
      expect(tel(html, /b-doelrij/g)).toBe(0);
    }
  });

  it('geeft bij alleen een vakwoord links naar dat vak per moment, zonder lijst', () => {
    const html = resultaten('wetenschap');
    expect(html).toContain('href="/basis/vak/gewoon/einde-kleuter/wetenschap-en-techniek"');
    expect(html).toContain('href="/basis/vak/gewoon/einde-4de/wetenschap-en-techniek"');
    expect(html).toContain('href="/basis/vak/gewoon/einde-6de/wetenschap-en-techniek"');
    expect(html).toContain('href="/basis/leerlijn/gewoon/wetenschap-en-techniek"');
    expect(tel(html, /b-doelrij/g)).toBe(0);
  });

  it('geeft bij alleen een moment een link naar dat moment, ook voor "lager"', () => {
    const html = resultaten('kleuters');
    expect(html).toContain('href="/basis/moment/gewoon/einde-kleuter"');
    const lager = resultaten('lager');
    expect(lager).toContain('href="/basis/moment/gewoon/einde-4de"');
    expect(lager).toContain('href="/basis/moment/gewoon/einde-6de"');
  });

  it('vindt een doelnummer en een code', () => {
    const nr = resultaten('92767');
    expect(tekst(nr)).toContain('1 doel gevonden voor nummer 92767.');
    expect(nr).toContain('href="/basis/doel/ODS_3408/92767"');
    const code = resultaten('3.5.4');
    expect(tekst(code)).toContain('3 doelen gevonden voor code 3.5.4.');
    expect(tel(code, /class="b-doelrij"/g)).toBe(3);
    expect(tekst(resultaten('99999'))).toContain('Geen doel gevonden voor nummer 99999.');
  });

  it('geeft bij 0 treffers tips en de tien vaktegels', () => {
    const html = resultaten('zzzzzz');
    expect(tekst(html)).toContain('Geen doelen gevonden voor "zzzzzz" in alle vakken en momenten.');
    expect(html).toContain('class="b-tips"');
    expect(tel(html, /class="b-vakkaart"/g)).toBe(10);
  });

  it('biedt met een leerjaar de knop om overal te zoeken, en omgekeerd', () => {
    const klas = resultaten('schaduw', { leerjaar: 'L3', bereik: 'leerjaar' });
    expect(tekst(klas)).toContain('in de doelen van het einde van het 4de leerjaar.');
    expect(klas).toContain('Zoek in alle vakken en momenten');
    expect(klas).toContain('bereik=alles');
    const alles = resultaten('schaduw', { leerjaar: 'L3', bereik: 'alles' });
    expect(alles).toContain('Zoek alleen in je leerjaar');
    expect(alles).toContain('bereik=leerjaar');
    expect(resultaten('schaduw')).not.toContain('class="b-knop"');
  });

  it('toont eerst een deel van een lange lijst en dan een knop om alles te tonen', () => {
    const veel: DoelBasis[] = Array.from({ length: EERST_TONEN + 5 }, (_, i) => doel('ODS_3408', String(91000 + i), `3.5.${i + 10}`, { subthema: 'Licht', doelzinHtml: '<p>Een doel over zonlicht.</p>' }));
    const uitslag = zoekDoelen(veel.map(zoekDoelVan), leesVraag('zonlicht', ZOEKWOORDEN));
    const map = new Map(veel.map((d) => [doelSleutel(d.setId, d.id), d]));
    const html = toon(createElement(ZoekResultaten, { uitslag, vraagTekst: 'zonlicht', doelen: map, soort: 'bao', bereik: 'alles', alle: ALLE }));
    expect(tel(html, /class="b-doelrij"/g)).toBe(EERST_TONEN);
    expect(tekst(html)).toContain(`${EERST_TONEN + 5} doelen gevonden`);
    expect(tekst(html)).toContain(`Toon alle ${EERST_TONEN + 5} doelen`);
    expect(html).toContain(`(${EERST_TONEN + 5})`);
  });

  it('markeert met de woorden van de vraag en van de tabel', () => {
    expect(markeerStammen(zoek('schaduw'))).toEqual(expect.arrayContaining(['schaduw', 'lichtbron', '=licht']));
  });
});

describe('zoekSets en echtBereik', () => {
  const v = (q: string) => leesVraag(q, ZOEKWOORDEN);

  it('laadt niets voor een lege vraag, een vak of een moment', () => {
    for (const q of ['', 'de', 'wetenschap', 'kleuters', 'lager']) {
      expect(heeftDoelenNodig(v(q)), q).toBe(false);
      expect(zoekSets(ALLE, 'bao', v(q), 'L3', 'leerjaar')).toEqual([]);
    }
    expect(heeftDoelenNodig(v('schaduw'))).toBe(true);
    expect(heeftDoelenNodig(v('92767'))).toBe(true);
    expect(heeftDoelenNodig(v('3.5'))).toBe(true);
  });

  it('beperkt bereik leerjaar tot het eindmoment van het leerjaar', () => {
    const ids = (q: string, lj: 'L3' | 'K2' | undefined, b: 'leerjaar' | 'alles') => zoekSets(ALLE, 'bao', v(q), lj, b).map((s) => s.set.id).sort();
    expect(ids('schaduw', 'L3', 'leerjaar')).toEqual(['ODS_3395', 'ODS_3408']);
    expect(ids('schaduw', 'K2', 'leerjaar')).toEqual(['ODS_3420']);
    expect(ids('schaduw', 'L3', 'alles')).toEqual(['ODS_3395', 'ODS_3408', 'ODS_3420', 'ODS_3430']);
    expect(ids('schaduw', undefined, 'alles')).toEqual(['ODS_3395', 'ODS_3408', 'ODS_3420', 'ODS_3430']);
  });

  it('laat een moment in de vraag voorgaan en zoekt een nummer of code overal', () => {
    expect(zoekSets(ALLE, 'bao', v('schaduw kleuters'), 'L3', 'leerjaar').map((s) => s.set.id)).toEqual(['ODS_3420']);
    expect(zoekSets(ALLE, 'bao', v('92767'), 'L3', 'leerjaar')).toHaveLength(4);
    expect(echtBereik(v('schaduw kleuters'), 'leerjaar', 'L3')).toBe('alles');
    expect(echtBereik(v('92767'), 'leerjaar', 'L3')).toBe('alles');
    expect(echtBereik(v('schaduw'), 'leerjaar', 'L3')).toBe('leerjaar');
    expect(echtBereik(v('schaduw'), 'leerjaar', undefined)).toBe('alles');
  });

  it('zoekt in de sets van de gekozen soort', () => {
    expect(zoekSets(ALLE, 'bubao', v('schaduw'), undefined, 'alles').map((s) => s.set.id)).toEqual(['ODS_3469']);
  });
});

describe('de bronnen van leerlijn en zoeken', () => {
  const lees = (pad: string) => readFileSync(new URL(pad, import.meta.url), 'utf8');
  const bestanden = ['../../components/basis/LeerlijnTabel.tsx', './LeerlijnScherm.tsx', '../../components/basis/ZoekVeld.tsx', '../../components/basis/ZoekResultaten.tsx', './ZoekScherm.tsx'];

  it('gebruiken nooit dangerouslySetInnerHTML en bewaren nergens iets', () => {
    for (const b of bestanden) {
      const bron = lees(b);
      expect(bron, b).not.toContain('dangerouslySetInnerHTML');
      expect(bron, b).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    }
  });

  it('ZoekScherm zet de codes van het GO! in een statusregel die er altijd staat (TOE-1: een schermlezer hoort het resultaat)', () => {
    const bron = lees('./ZoekScherm.tsx');
    const blok = /<div role="status" className="b-zoek-go-status">([\s\S]*?)<\/div>/.exec(bron)?.[1] ?? '';
    expect(blok).toContain('<GoCodeLinks codes={goCodes} />');
    // De statusregel zelf hangt niet aan een voorwaarde: de voorwaarde staat binnenin.
    expect(bron).not.toMatch(/\{goCodes\.length > 0 && \(\s*<div role="status"/);
    expect(bron.match(/<GoCodeLinks /g)).toHaveLength(1);
  });

  it('zeggen "leerjaar" en nergens "(je klas)"', () => {
    for (const b of bestanden) expect(lees(b), b).not.toContain('(je klas)');
  });

  it('hebben een css met alleen .b- of :root[data-deel] selectors', () => {
    for (const css of ['../../styles/basis-leerlijn.css', '../../styles/basis-zoek.css']) {
      const bron = lees(css).replace(/\/\*[\s\S]*?\*\//g, '');
      const selectors = [...bron.matchAll(/(^|\})\s*([^{}@]+)\{/g)].flatMap((m) => m[2].split(','));
      expect(selectors.length).toBeGreaterThan(5);
      for (const s of selectors) expect(s.trim(), `${css}: ${s}`).toMatch(/^(\.b-|:root\[data-deel='basis'\])/);
    }
  });
});


describe('codes van het GO! in de zoekvraag', () => {
  it('herkent een leerplandoel (WT.086) en een lesplan (LP0065, LP0014a), in elke schrijfwijze', () => {
    expect(goCodesIn('WT.086')).toEqual([{ soort: 'leerplandoel', code: 'WT.086' }]);
    expect(goCodesIn('wt.086')).toEqual([{ soort: 'leerplandoel', code: 'WT.086' }]);
    expect(goCodesIn('LP0065')).toEqual([{ soort: 'lesplan', code: 'LP0065' }]);
    expect(goCodesIn('lp0014A')).toEqual([{ soort: 'lesplan', code: 'LP0014a' }]);
    expect(goCodesIn('  WT.086, LP0065. ')).toEqual([
      { soort: 'leerplandoel', code: 'WT.086' },
      { soort: 'lesplan', code: 'LP0065' },
    ]);
  });

  it('herkent niets in gewone woorden, doelnummers of codes van de overheid, en geen onbekend vak', () => {
    for (const vraag of ['', 'schaduw', '92767', '3.5.4', '3.5', 'licht en schaduw', 'XX.086', 'WT.08', 'WT.12345', 'LP65', 'LP00651', 'WT086']) {
      expect(goCodesIn(vraag), vraag).toEqual([]);
    }
  });

  it('geeft hoogstens drie codes, elke code één keer', () => {
    expect(goCodesIn('WT.001 WT.001 WT.002 WT.003 WT.004')).toEqual([
      { soort: 'leerplandoel', code: 'WT.001' },
      { soort: 'leerplandoel', code: 'WT.002' },
      { soort: 'leerplandoel', code: 'WT.003' },
    ]);
  });

  it('haalt haakjes en aanhalingstekens rond een code weg', () => {
    expect(goCodesIn('(WT.086)')).toEqual([{ soort: 'leerplandoel', code: 'WT.086' }]);
    expect(goCodesIn('"LP0065",')).toEqual([{ soort: 'lesplan', code: 'LP0065' }]);
    expect(goCodesIn('[wt.086]')).toEqual([{ soort: 'leerplandoel', code: 'WT.086' }]);
  });

  it('alleenGoCodes: waar als elk woord een code is, anders niet', () => {
    expect(alleenGoCodes('WT.086')).toBe(true);
    expect(alleenGoCodes('(WT.086) lp0065')).toBe(true);
    expect(alleenGoCodes('WT.086 schaduw')).toBe(false);
    expect(alleenGoCodes('')).toBe(false);
    expect(alleenGoCodes('   ')).toBe(false);
    expect(alleenGoCodes('3.5.4')).toBe(false);
  });
});
