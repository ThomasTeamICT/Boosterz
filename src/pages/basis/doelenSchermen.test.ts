// De schermen voor doelen per moment, een vak op een moment en de doelpagina (renderToStaticMarkup in een StaticRouter),
// met zelfgemaakte koppen en doelen en een schooljaar als parameter. De klok en de gegevensbestanden worden niet gelezen;
// de getallen op de echte gegevens staan in src/lib/basis/basisIngang.echt.test.ts.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import type { MinimumdoelenIndexSet } from '../../lib/minimumdoelen';
import { DoelKaart } from '../../components/basis/DoelKaart';
import { DoelRij, heeftTreffer, opsommingPunten } from '../../components/basis/DoelRij';
import { RubriekenLijst, onderwerpKopId } from '../../components/basis/RubriekenLijst';
import { doeltekstBlokken } from '../../lib/basis/doeltekst';
import { rubrieken, type DoelBasis } from '../../lib/basis/doelBasis';
import { basisSet, invoering, type BasisSet } from '../../lib/basis/moment';
import { DOEL_DELEN, DoelInhoud, DoelNietGevonden, type VakDoelen } from './DoelScherm';
import { MomentInhoud, zonderNieuweSetZin } from './MomentScherm';
import { VakInhoud, statusRegel, type VakSet } from './VakScherm';

const toon = (el: ReactElement) => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, el));
const tekst = (html: string) => html.replace(/<span class="sr-only">[^<]*<\/span>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim();
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
const NL_K_POP = kop('ODS_3401', `Kleuteronderwijs -  Nederlands - ${POP}`, 'Nederlands', 1);
const NL_K_NA = kop('ODS_3397', `Kleuteronderwijs -  Nederlands - ${NASTREVEN}`, 'Nederlands', 1);
const ALLE = [WT_L4, WT_K3, WT_L6, WT_BU_L4, NL_K_POP, NL_K_NA];

function doel(setId: string, id: string, code: string, extra: Partial<DoelBasis> = {}): DoelBasis {
  const info = basisSet(ALLE.find((s) => s.id === setId) as MinimumdoelenIndexSet) as BasisSet;
  const nr = Number(code.split('.')[0]);
  return {
    setId, id, code,
    soort: info.soort,
    eind: info.eindmoment ?? 'L4',
    vak: nr,
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
const BU354 = doel('ODS_3469', '92767', '3.5.4', {
  subthema: 'Licht',
  doelzinHtml: '<p>De leerlingen kennen licht: rechtlijnige beweging.</p>',
  uitbreidingHtml: '<ul><li>lichtbron</li><li>lichtrichting</li><li>belichting</li></ul>',
});

// ─── DoelRij ─────────────────────────────────────────────────────────────────

describe('DoelRij', () => {
  it('toont de code en de letterlijke doelzin in een link naar de doelpagina', () => {
    const html = toon(createElement(DoelRij, { doel: D352 }));
    expect(html).toContain('href="/basis/doel/ODS_3408/92766"');
    expect(tekst(html)).toContain('3.5.2 De leerlingen onderzoeken schaduw.');
    expect(html).not.toContain('<details');
  });

  it('zet de uitbreiding ernaast in een details met het aantal punten, ingeklapt', () => {
    const html = toon(createElement(DoelRij, { doel: D354 }));
    expect(html).toMatch(/<details class="b-doelrij-deel"><summary>Toon de opsomming \(3 punten\)<\/summary>/);
    expect(html).toContain('lichtrichting');
    // het details staat naast de link, niet erin
    expect(html.indexOf('</a>')).toBeLessThan(html.indexOf('<details'));
  });

  it('noemt een uitbreiding zonder lijst een toelichting, en de woordenschat blijft bereikbaar', () => {
    const toelichting = doel('ODS_3408', '1', '3.5.9', { uitbreidingHtml: '<p>&lt; bv. een lamp &gt;</p>' });
    const a = toon(createElement(DoelRij, { doel: toelichting }));
    expect(a).toContain('Toon de toelichting');
    const b = toon(createElement(DoelRij, { doel: L6354 }));
    expect(b).toContain('Toon de richtinggevende woordenschat');
    expect(b).toContain('spiegel');
  });

  it('markeert dit doel met aria-current, een lampstreep en de tekst "dit doel"', () => {
    const html = toon(createElement(DoelRij, { doel: D354, dit: true }));
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('b-doelrij b-doelrij-dit');
    expect(tekst(html)).toContain('dit doel');
  });

  it('toont op verzoek het moment', () => {
    expect(tekst(toon(createElement(DoelRij, { doel: K354, metMoment: true })))).toContain('Einde kleuter 3.5.4');
    expect(tekst(toon(createElement(DoelRij, { doel: K354 })))).not.toContain('Einde kleuter');
  });

  it('zet een gevonden woord in <mark>; staat het alleen in de uitbreiding, dan staat die open met het woord gemarkeerd', () => {
    const inZin = toon(createElement(DoelRij, { doel: D352, markeer: ['schaduw'] }));
    expect(inZin).toContain('<mark>schaduw</mark>');
    expect(inZin).not.toContain('<details');

    const inUitbreiding = toon(createElement(DoelRij, { doel: D354, markeer: ['belichting'] }));
    expect(inUitbreiding).toMatch(/<details class="b-doelrij-deel" open="">/);
    expect(inUitbreiding).toContain('<mark>belichting</mark>');
    // de rest van de opsomming blijft staan
    expect(tekst(inUitbreiding)).toContain('lichtbron');

    const nergens = toon(createElement(DoelRij, { doel: D354, markeer: ['spiegel'] }));
    expect(nergens).not.toContain('<mark>');
    expect(nergens).not.toContain('open=""');
  });
});

describe('opsommingPunten en heeftTreffer', () => {
  it('telt de punten van de lijsten op het bovenste niveau', () => {
    expect(opsommingPunten(doeltekstBlokken('<ul><li>a</li><li>b<ul><li>c</li></ul></li></ul>'))).toBe(2);
    expect(opsommingPunten(doeltekstBlokken('<p>geen lijst</p>'))).toBe(0);
  });

  it('past op woordbegin, korte woorden alleen als heel woord, en negeert hoofdletters en accenten', () => {
    expect(heeftTreffer('De magneten trekken', ['magnet'])).toBe(true);
    expect(heeftTreffer('Weergeven van gegevens', ['weer'])).toBe(false);
    expect(heeftTreffer('het weer is mooi', ['weer'])).toBe(true);
    expect(heeftTreffer('Wereldoriëntatie', ['wereldorientatie'])).toBe(true);
    expect(heeftTreffer('toelichten', ['=licht'])).toBe(false);
    expect(heeftTreffer('tekst', undefined)).toBe(false);
  });
});

// ─── DoelKaart en RubriekenLijst ─────────────────────────────────────────────

describe('DoelKaart', () => {
  it('toont de volledige tekst open: doelzin, uitbreiding en woordenschat, met een link van "Open doel"', () => {
    const volledig = { ...D354, woordenschatHtml: '<p>schaduw</p>' };
    const html = toon(createElement('ol', null, createElement(DoelKaart, { doel: volledig })));
    expect(html).not.toContain('<details');
    expect(tekst(html)).toContain('De leerlingen kennen licht: rechtlijnige beweging.');
    expect(tekst(html)).toContain('lichtbron');
    expect(tekst(html)).toContain('Richtinggevende woordenschat');
    expect(html).toContain('href="/basis/doel/ODS_3408/92767"');
    expect(tekst(html)).toContain('Open doel 3.5.4');
  });

  it('toont het soort doel alleen als het vak er meer dan één heeft', () => {
    const zonder = toon(createElement('ol', null, createElement(DoelKaart, { doel: D354 })));
    const met = toon(createElement('ol', null, createElement(DoelKaart, { doel: D354, toonSoort: true })));
    expect(zonder).not.toContain('badge');
    expect(tekst(met)).toContain('Te bereiken op populatieniveau');
  });
});

describe('RubriekenLijst', () => {
  const onderwerpen = rubrieken([D352, D354, D361]);

  it('heeft een knop per onderwerp met het aantal', () => {
    const html = toon(createElement(RubriekenLijst, { onderwerpen }));
    expect(tel(html, /<button type="button"/g)).toBe(2);
    expect(tekst(html)).toContain('3.5 Natuurkundige verschijnselen (2)');
    expect(tekst(html)).toContain('3.6 Technische systemen (1)');
  });

  it('geeft niets bij geen onderwerpen, en de kop-id volgt het onderwerpnummer', () => {
    expect(toon(createElement(RubriekenLijst, { onderwerpen: [] }))).toBe('');
    expect(onderwerpKopId('3.5')).toBe('b-onderwerp-3-5');
  });
});

// ─── MomentInhoud ────────────────────────────────────────────────────────────

describe('MomentInhoud', () => {
  const html = toon(createElement(MomentInhoud, { alle: ALLE, soort: 'bao', eind: 'L4' }));

  it('zegt welke leerjaren naar het moment werken', () => {
    expect(tekst(html)).toContain('Het 1ste, 2de, 3de en 4de leerjaar werken hiernaartoe.');
    const kleuter = tekst(toon(createElement(MomentInhoud, { alle: ALLE, soort: 'bao', eind: 'K3' })));
    expect(kleuter).toContain('De 1ste, 2de en 3de kleuterklas werken hiernaartoe.');
  });

  it('heeft een kaart per vak met het aantal en de soort, zonder status of zekerheid', () => {
    expect(tel(html, /class="b-vakkaart"/g)).toBe(1);
    expect(html).toContain('href="/basis/vak/gewoon/einde-4de/wetenschap-en-techniek"');
    expect(tekst(html)).toContain('3 doelen · te bereiken (populatie)');
    expect(html).not.toContain('b-vakkaart-lamp');
    expect(html).not.toContain('badge');
  });

  it('heeft schakelaars voor het moment en voor gewoon of buitengewoon, met aria-current', () => {
    expect(html).toMatch(/<a class="b-pil-knop" aria-current="true" href="\/basis\/moment\/gewoon\/einde-4de">Einde 4de leerjaar<\/a>/);
    expect(html).toMatch(/aria-current="true" href="\/basis\/moment\/gewoon\/einde-4de">Gewoon onderwijs<\/a>/);
    expect(html).toContain('href="/basis/moment/buitengewoon/einde-4de"');
    expect(html).toContain('href="/basis/moment/gewoon/einde-kleuter"');
  });

  it('twee sets van één vak (kleuter-Nederlands) geven één kaart met beide soorten', () => {
    const k = tekst(toon(createElement(MomentInhoud, { alle: ALLE, soort: 'bao', eind: 'K3' })));
    expect(k).toContain('2 doelen: 1 te bereiken (populatie) · 1 na te streven');
  });

  it('zegt welke vakken geen nieuwe doelen hebben, alleen als dat zo is, en bevat geen kopjes', () => {
    expect(zonderNieuweSetZin(ALLE, 'bao', 'L4')).toMatch(/^Nederlands, .* en Frans hebben geen nieuwe doelen voor het einde van het 4de leerjaar\.$/);
    expect(tekst(html)).toContain('geen nieuwe doelen voor het einde van het 4de leerjaar.');
    expect(tel(html, /<h[1-6]/g)).toBe(0);
  });

  it('een eindmoment zonder nieuwe sets geeft een zin en geen lege lijst', () => {
    const leeg = toon(createElement(MomentInhoud, { alle: [], soort: 'bao', eind: 'L6' }));
    expect(leeg).not.toContain('<ul class="b-kaarten"');
    expect(tekst(leeg)).toContain('Voor dit eindmoment vinden we in de gegevens geen nieuwe doelen.');
  });
});

// ─── VakInhoud ───────────────────────────────────────────────────────────────

describe('VakInhoud', () => {
  const info = basisSet(WT_L4) as BasisSet;
  const sets: VakSet[] = [{ set: WT_L4, info }];
  const doelen = [D352, D354, D361];
  const vak = (extra: Record<string, unknown> = {}) =>
    toon(createElement(VakInhoud, { soort: 'bao', eind: 'L4', vak: 3, sets, doelen, schooljaar: 2026, ...extra }));

  it('heeft één h1 met de vaknaam, een h2 per onderwerp en een h3 alleen bij een subthema', () => {
    const html = vak();
    expect(tel(html, /<h1/g)).toBe(1);
    expect(html).toMatch(/<h1 class="b-vakkop">.*Wetenschap en techniek<\/span><\/h1>/);
    expect(tel(html, /<h2/g)).toBe(2);
    expect(html).toContain(`id="${onderwerpKopId('3.5')}" tabindex="-1"`);
    expect(tel(html, /<h3/g)).toBe(1);
    expect(html).toContain('<h3>Licht</h3>');
  });

  it('toont elk doel als kaart, op volgorde, met de volledige tekst', () => {
    const html = vak();
    expect(tel(html, /class="b-doelkaart"/g)).toBe(3);
    expect(html.indexOf('3.5.2')).toBeLessThan(html.indexOf('3.5.4'));
    expect(tekst(html)).toContain('De leerlingen kennen licht: rechtlijnige beweging.');
    expect(tekst(html)).toContain('lichtrichting');
    expect(html).toContain('href="/basis/doel/ODS_3408/92767"');
  });

  it('zegt in de onderregel het moment, het aantal en de soort', () => {
    expect(tekst(vak())).toContain('Doelen voor het einde van het 4de leerjaar · 3 doelen · te bereiken (populatie)');
  });

  it('zonder leerjaar staat het kruimelpad Doelen › Einde 4de leerjaar › vak', () => {
    const html = vak();
    expect(html).toContain('<a href="/basis/moment/gewoon/einde-4de">Doelen › Einde 4de leerjaar</a>');
    expect(html).toContain('aria-current="page">Wetenschap en techniek</li>');
    expect(html).not.toContain('b-statusregel');
  });

  it('met leerjaar staat de status voor dat leerjaar en loopt het kruimelpad via het leerjaar', () => {
    const html = vak({ leerjaar: 'L3' });
    expect(html).toContain('href="/basis/leerjaar/gewoon/L3"');
    expect(tekst(html)).toContain('Leerjaar: 3de leerjaar');
    expect(tekst(html)).toContain('Voor je 3de leerjaar: verplicht in 2026-2027');
    expect(tekst(html)).toContain('waarschijnlijk');
  });

  it('heeft de links naar de leerlijn en de officiële set, en de soortschakelaar', () => {
    const html = vak({ leerjaar: 'L3' });
    expect(html).toContain('href="/basis/leerlijn/gewoon/wetenschap-en-techniek?leerjaar=L3"');
    expect(html).toContain('href="/leerplannen/minimumdoelen/ODS_3408"');
    expect(html).toContain('href="/basis/vak/buitengewoon/einde-4de/wetenschap-en-techniek?leerjaar=L3"');
  });

  it('toont het soort per doel als het vak twee soorten heeft (kleuter-Nederlands)', () => {
    const nl = [basisSet(NL_K_NA) as BasisSet, basisSet(NL_K_POP) as BasisSet];
    const lijst: DoelBasis[] = [
      doel('ODS_3401', '10', '1.1.1', { onderwerpNr: '1.1', onderwerp: 'Luisteren' }),
      doel('ODS_3397', '11', '1.1.2', { onderwerpNr: '1.1', onderwerp: 'Luisteren' }),
    ];
    const html = toon(
      createElement(VakInhoud, {
        soort: 'bao', eind: 'K3', vak: 1, sets: [{ set: NL_K_NA, info: nl[0] }, { set: NL_K_POP, info: nl[1] }], doelen: lijst, schooljaar: 2026,
      }),
    );
    expect(tel(html, /badge badge-brand/g)).toBe(2);
    expect(tekst(html)).toContain('Te bereiken op populatieniveau');
    expect(tekst(html)).toContain('Na te streven');
    expect(tekst(html)).toContain('2 doelen: 1 te bereiken (populatie) · 1 na te streven');
  });

  it('een vak zonder set op dit moment geeft een zin en geen onderwerpen', () => {
    const html = toon(createElement(VakInhoud, { soort: 'bao', eind: 'L4', vak: 10, sets: [], doelen: [], schooljaar: 2026 }));
    expect(tekst(html)).toContain('Frans heeft geen nieuwe doelen voor het einde van het 4de leerjaar.');
    expect(tel(html, /<h2/g)).toBe(0);
    expect(tel(html, /<h1/g)).toBe(1);
  });
});

describe('statusRegel', () => {
  const info = basisSet(WT_L4) as BasisSet;
  it('zegt verplicht, mag al met het jaar waarin het verplicht wordt, en neemt de zekerheid mee', () => {
    const l3 = statusRegel('L3', [invoering(info, 'L3', 2026)!], 2026);
    expect(l3?.tekst).toBe('Voor je 3de leerjaar: verplicht in 2026-2027');
    expect(l3?.zekerheid).toBe('waarschijnlijk');
    const l4 = statusRegel('L4', [invoering(info, 'L4', 2026)!], 2026);
    expect(l4?.tekst).toBe('Voor je 4de leerjaar: mag al in 2026-2027, verplicht vanaf 2027-2028');
  });
  it('geeft niets zonder invoering', () => {
    expect(statusRegel('L3', [], 2026)).toBeUndefined();
  });
});

// ─── DoelInhoud ──────────────────────────────────────────────────────────────

describe('DoelInhoud', () => {
  const info = basisSet(WT_L4) as BasisSet;
  const vakDoelen = (extra: Partial<VakDoelen> = {}): VakDoelen => ({
    doelen: [D352, D354, D361, K354, L6354],
    momenten: new Set(['K3', 'L4', 'L6']),
    klaar: true,
    fouten: [],
    opnieuw: () => undefined,
    ...extra,
  });
  const pagina = (extra: Record<string, unknown> = {}) =>
    toon(createElement(DoelInhoud, { doel: D354, info, alle: ALLE, vak: vakDoelen(), tweeling: BU354, schooljaar: 2026, bron: 'Bron: Test · opgehaald op 1 november 2026', ...extra }));

  it('heeft één h1 "Minimumdoel 3.5.4" met de onderregel, de volledige tekst en de badges', () => {
    const html = pagina();
    expect(tel(html, /<h1/g)).toBe(1);
    expect(html).toContain('<h1>Minimumdoel 3.5.4</h1>');
    expect(tekst(html)).toContain('Einde 4de leerjaar · Wetenschap en techniek');
    expect(tekst(html)).toContain('3.5 Natuurkundige verschijnselen › Licht');
    expect(tekst(html)).toContain('De leerlingen kennen licht: rechtlijnige beweging.');
    expect(tekst(html)).toContain('lichtbron');
    expect(tekst(html)).toContain('Te bereiken op populatieniveau');
    expect(tekst(html)).toContain('Gewoon basisonderwijs');
    expect(html).toContain('b-doeltekst-groot');
  });

  it('heeft de voet met nummer, set en de links naar het vak en de officiële set', () => {
    const html = pagina();
    expect(tekst(html)).toContain('Nummer 92767 · set ODS_3408 · Alle doelen van dit vak · Officiële set');
    expect(html).toContain('href="/basis/vak/gewoon/einde-4de/wetenschap-en-techniek"');
    expect(html).toContain('href="/leerplannen/minimumdoelen/ODS_3408"');
  });

  it('linkt naar de tweeling en zegt alleen "hetzelfde doel" als de tekst gelijk is', () => {
    const gelijk = pagina();
    expect(gelijk).toContain('href="/basis/doel/ODS_3469/92767"');
    expect(tekst(gelijk)).toContain('Ook in het buitengewoon basisonderwijs: hetzelfde doel (nummer en tekst), daar na te streven.');
    const anders = pagina({ tweeling: { ...BU354, doelzinHtml: '<p>Een andere tekst.</p>' } });
    expect(tekst(anders)).toContain('maar de tekst is niet dezelfde');
    expect(tekst(anders)).not.toContain('hetzelfde doel (nummer en tekst)');
    expect(pagina({ tweeling: undefined })).not.toContain('b-tweeling');
  });

  it('draait om: vanuit het buitengewoon verwijst de tweeling naar het gewone doel', () => {
    const buInfo = basisSet(WT_BU_L4) as BasisSet;
    const html = toon(createElement(DoelInhoud, { doel: BU354, info: buInfo, alle: ALLE, vak: vakDoelen({ doelen: [BU354] }), tweeling: D354, schooljaar: 2026 }));
    expect(tekst(html)).toContain('Ook in het gewoon basisonderwijs: hetzelfde doel (nummer en tekst), daar te bereiken op populatieniveau.');
    expect(html).toContain('href="/basis/doel/ODS_3408/92767"');
    expect(tekst(html)).toContain('Na te streven');
  });

  it('heeft h2#b-wanneer-kop en geen #md-wanneer-kop, en de tweeling staat niet dubbel in WanneerGelden', () => {
    const html = pagina();
    expect(html).toContain('<h2 id="b-wanneer-kop">Wanneer gelden deze doelen?</h2>');
    expect(html).not.toContain('md-wanneer-kop');
    expect(html).not.toContain('md-wanneer-tweeling');
  });

  it('toont de leerlijn van de rubriek met "dit doel" en de aantallen per moment', () => {
    const html = pagina();
    expect(html).toContain('<h2 id="b-leerlijn-kop">De leerlijn in deze rubriek</h2>');
    expect(tekst(html)).toContain('Einde kleuter (1)');
    expect(tekst(html)).toContain('Einde 4de leerjaar (2)');
    expect(tekst(html)).toContain('Einde 6de leerjaar (1)');
    expect(tel(html, /aria-current="true"/g)).toBe(1);
    expect(tel(html, /b-doelrij-dit/g)).toBe(1);
    expect(html).toContain('href="/basis/doel/ODS_3420/92730"');
    expect(html).toContain('href="/basis/leerlijn/gewoon/wetenschap-en-techniek?onderwerp=3.5"');
    expect(tekst(html)).toContain('De codes lopen niet door, en de bron zegt niet welk doel uit welk ander volgt.');
  });

  it('zegt in een lege cel dat het doel op dat moment niet apart vermeld is, en bij een moment zonder set dat er geen doelen zijn', () => {
    const html = pagina({ vak: vakDoelen({ doelen: [D352, D354], momenten: new Set(['L4', 'L6']) }) });
    expect(tekst(html)).toContain('Geen doelen voor dit moment');
    expect(tekst(html)).toContain('Op dit moment niet apart vermeld');
  });

  it('laat de leerlijn laden en toont een fout met "Opnieuw proberen"', () => {
    const laden = pagina({ vak: vakDoelen({ klaar: false }) });
    expect(tekst(laden)).toContain('De doelen van dit vak worden geladen');
    const fout = pagina({ vak: vakDoelen({ klaar: false, fouten: [{ id: 'ODS_3420', fout: 'Mislukt' }] }) });
    expect(tekst(fout)).toContain('Opnieuw proberen');
  });

  it('toont de bronvermelding uit de index met een link naar Privacy en opslag', () => {
    const html = pagina();
    expect(tekst(html)).toContain('Bron: Test · opgehaald op 1 november 2026 · Privacy en opslag');
    expect(html).toContain('href="/privacy"');
    expect(pagina({ bron: undefined })).not.toContain('b-doelbron');
  });

  it('DOEL_DELEN heeft een vaste volgorde met unieke id\'s', () => {
    expect(DOEL_DELEN.map((d) => d.id)).toEqual(['wanneer', 'leerlijn']);
  });
});

describe('DoelNietGevonden', () => {
  it('heeft één h1, de zin met het set-id en links naar zoeken en het leerjaar', () => {
    const html = toon(createElement(DoelNietGevonden, { setId: 'ODS_9999', doelId: '92767' }));
    expect(tel(html, /<h1/g)).toBe(1);
    expect(html).toContain('<h1>Dit doel vonden we niet</h1>');
    expect(tekst(html)).toContain('Doel 92767 staat niet in set ODS_9999. Misschien kreeg de set een nieuw nummer.');
    expect(html).toContain('href="/basis/zoek?q=92767&amp;soort=gewoon&amp;bereik=alles"');
    expect(html).toContain('href="/basis"');
  });
});

// ─── Bronnen ─────────────────────────────────────────────────────────────────

describe('bronbestanden van de schermen', () => {
  const lees = (pad: string) => readFileSync(fileURLToPath(new URL(pad, import.meta.url)), 'utf8');
  const bestanden = [
    './MomentScherm.tsx', './VakScherm.tsx', './DoelScherm.tsx',
    '../../components/basis/DoelKaart.tsx', '../../components/basis/DoelRij.tsx', '../../components/basis/RubriekenLijst.tsx',
  ];

  it('gebruikt nergens dangerouslySetInnerHTML', () => {
    for (const b of bestanden) expect(lees(b), b).not.toContain('dangerouslySetInnerHTML');
  });

  it('leest de klok alleen in VakScherm (huidigSchooljaar)', () => {
    for (const b of bestanden.filter((x) => x !== './VakScherm.tsx')) expect(lees(b), b).not.toMatch(/new Date\(|Date\.now\(/);
  });

  it('de css van dit pakket begint elke selector met .b- of :root[data-deel=\'basis\']', () => {
    const css = lees('../../styles/basis-doelen.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const selectoren = [...css.matchAll(/(?:^|})\s*([^{}@]+)\{/g)].map((m) => m[1].trim()).filter((s) => !/^\d+%?$/.test(s));
    const fout = selectoren.flatMap((s) => s.split(',').map((x) => x.trim())).filter((x) => !(x.startsWith('.b-') || x.startsWith(":root[data-deel='basis']")));
    expect(fout).toEqual([]);
  });
});
