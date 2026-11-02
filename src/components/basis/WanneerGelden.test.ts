// Het blok "Wanneer gelden deze doelen?" (docs/basisonderwijs/MOMENTMODEL.md): de component rendert op de server
// (zonder DOM, binnen een StaticRouter voor de links naar de tweelingsets), met zelfgemaakte koppen in de echte
// naamvorm (met de dubbele spatie van de bron). Het schooljaar is altijd een parameter: de test leest nergens de klok.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import type { MinimumdoelenIndexSet } from '../../lib/minimumdoelen';
import { INVOERINGSKALENDER, type Invoeringskalender } from '../../lib/basis/kalender';
import { basisSet, type SetKopBasis } from '../../lib/basis/moment';
import { WanneerGelden } from './WanneerGelden';

// ─── Koppen ──────────────────────────────────────────────────────────────────

type Kop = SetKopBasis & { versie?: string };
const NIEUW = { versie: '2.0', geldigheid: 'Geldig', geldigVan: '2025-09-01' };
const OUD = { versie: '1.0', geldigheid: 'Geldig', geldigVan: '2010-09-01' };
const kop = (id: string, naam: string, extra: Partial<Kop> = {}): Kop => ({ id, naam, ...extra });

const L4_NL = kop('N_L4_NL', 'Lager Onderwijs 4de leerjaar -  Nederlands - Te bereiken minimumdoelen op populatieniveau', {
  ...NIEUW, korteNaam: 'Nederlands', leerjaar: '4de leerjaar', aantal: 72,
});
const L4_WT = kop('N_L4_WT', 'Lager Onderwijs 4de leerjaar -  Wetenschap en techniek - Te bereiken minimumdoelen op populatieniveau', {
  ...NIEUW, korteNaam: 'Wetenschap en techniek', leerjaar: '4de leerjaar', aantal: 44,
});
const BU_L4_WT = kop('N_BU_L4_WT', 'Buitengewoon Lager Onderwijs 4de leerjaar -  Wetenschap en techniek - Na te streven minimumdoelen op populatieniveau', {
  ...NIEUW, korteNaam: 'Wetenschap en techniek', leerjaar: '4de leerjaar', aantal: 44,
});
const L4_AK = kop('N_L4_AK', 'Lager Onderwijs 4de leerjaar -  Aardrijkskunde - Te bereiken minimumdoelen op populatieniveau', {
  ...NIEUW, korteNaam: 'Aardrijkskunde', leerjaar: '4de leerjaar', aantal: 20,
});
const L4_BURGER = kop('N_L4_BU', 'Lager Onderwijs 4de leerjaar -  Burgerschap - Te bereiken minimumdoelen op populatieniveau', {
  ...NIEUW, korteNaam: 'Burgerschap', leerjaar: '4de leerjaar', aantal: 9,
});
const K_MV = kop('N_K_MV', 'Kleuteronderwijs -  Muzische vorming - Na te streven minimumdoelen op populatieniveau', {
  ...NIEUW, korteNaam: 'Muzische vorming', aantal: 17,
});
const BU_K_NL = kop('N_BU_K_NL', 'Buitengewoon Kleuteronderwijs -  Nederlands - Na te streven minimumdoelen op populatieniveau', {
  ...NIEUW, korteNaam: 'Nederlands', aantal: 35,
});
const BU_L4_NL = kop('N_BU_L4_NL', 'Buitengewoon Lager Onderwijs 4de leerjaar -  Nederlands - Na te streven minimumdoelen op populatieniveau', {
  ...NIEUW, korteNaam: 'Nederlands', leerjaar: '4de leerjaar', aantal: 72,
});

const OUD_NL = kop('O_NL', 'Lager Onderwijs - Leergebied - Nederlands - Eindtermen', {
  ...OUD, korteNaam: 'Nederlands', geldigTot: '2028-08-31', aantal: 47,
});
const OUD_LEREN_LEREN = kop('O_LL', 'Lager Onderwijs - Leergebied - Leren Leren - Eindtermen', {
  ...OUD, korteNaam: 'Leren Leren', geldigTot: '2030-08-31', aantal: 12,
});
const OUD_BU_SOCIAAL = kop('O_BU_SV', 'Buitengewoon Lager Onderwijs Type 2 - Leergebied - Sociale Vaardigheden - Ontwikkelingsdoelen', {
  ...OUD, korteNaam: 'Sociale Vaardigheden', geldigTot: '2030-08-31', aantal: 14,
});
const OUD_BU_NL = kop('O_BU_NL', 'Buitengewoon Lager Onderwijs Type 2 - Leergebied - Nederlands - Ontwikkelingsdoelen', {
  ...OUD, korteNaam: 'Nederlands', geldigTot: '2028-08-31', aantal: 20,
});
const OUD_K_NL = kop('O_K_NL', 'Kleuteronderwijs - Leergebied - Nederlands - Ontwikkelingsdoelen', {
  ...OUD, geldigheid: 'Niet meer geldig', korteNaam: 'Nederlands', geldigTot: '2026-08-31', aantal: 31,
});
const OUD_K_ZONDER_EINDE = kop('O_K_ZE', 'Buitengewoon Kleuteronderwijs Type 7 - Leergebied - Wereldoriëntatie: dovencultuur - Aanvullende - Ontwikkelingsdoelen', {
  ...OUD, korteNaam: 'Wereldoriëntatie: dovencultuur', aantal: 15,
});
const LEEG = kop('O_LEEG', 'Buitengewoon Lager Onderwijs Type 3 - Leergebied - Alle leergebieden - Ontwikkelingsdoelen', {
  ...OUD, korteNaam: 'Alle leergebieden', geldigTot: '2030-08-31', aantal: 1,
});

// ─── Hulpfuncties ────────────────────────────────────────────────────────────

const index = (...koppen: Kop[]): MinimumdoelenIndexSet[] => koppen.map((k) => ({ aantal: 1, sha256: '', opgehaald: '', bestand: `${k.id}.json`, ...k }) as MinimumdoelenIndexSet);
const ALLE = index(L4_NL, L4_WT, BU_L4_WT, L4_AK, BU_L4_NL, BU_K_NL, K_MV, OUD_NL, OUD_LEREN_LEREN, OUD_BU_SOCIAAL, OUD_BU_NL, OUD_K_NL);

function toon(k: Kop, schooljaar = 2026, opties: { alle?: MinimumdoelenIndexSet[]; kalender?: Invoeringskalender } = {}): string {
  const info = basisSet(k, opties.kalender ?? INVOERINGSKALENDER);
  if (!info) throw new Error(`geen basisset voor ${k.id}`);
  const props = { set: info, alleSets: opties.alle ?? ALLE, schooljaar, ...(opties.kalender ? { kalender: opties.kalender } : {}) };
  return renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(WanneerGelden, props)));
}

/** De zichtbare tekst: de tags eraf, de entiteiten terug. */
function tekst(html: string): string {
  return html
    .replace(/<span class="sr-only">[^<]*<\/span>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
const hoeveel = (html: string, deel: string) => html.split(deel).length - 1;
/** Het stuk markup van één element met deze klasse, tot en met zijn sluitende tag. */
function stuk(html: string, klasse: string, tag: string): string {
  const begin = html.indexOf(`<${tag} class="${klasse}"`);
  if (begin < 0) return '';
  const eind = html.indexOf(`</${tag}>`, begin);
  return html.slice(begin, eind);
}

// ─── Een nieuwe set van het lager ────────────────────────────────────────────

describe('WanneerGelden: een nieuwe set van het lager (Nederlands, 4de leerjaar)', () => {
  const html = toon(L4_NL);
  const t = tekst(html);

  it('heeft één h3 met de vaste kop, gekoppeld aan de sectie', () => {
    expect(hoeveel(html, '<h3')).toBe(1);
    expect(html).toContain('<section class="md-wanneer" aria-labelledby="md-wanneer-kop">');
    expect(html).toContain('<h3 id="md-wanneer-kop">Wanneer gelden deze doelen?</h3>');
    expect(hoeveel(html, '<h1')).toBe(0);
    expect(hoeveel(html, '<h2')).toBe(0);
  });

  it('zegt voor wie de doelen zijn', () => {
    expect(t).toContain('Doelen voor het einde van het 4de leerjaar. Het 1ste, 2de en 3de leerjaar werken ernaartoe; het leerplan van je net legt de tussenstappen vast.');
  });

  it('heeft de lijn "Dit schooljaar" met een badge', () => {
    const nu = tekst(stuk(html, 'md-wanneer-nu', 'p'));
    expect(nu).toContain('Dit schooljaar (2026-2027): verplicht in het 1ste, 2de en 3de leerjaar · mag al in het 4de leerjaar');
    expect(nu).toContain('waarschijnlijk');
  });

  it('toont de tijdloze kalender: twee regels, elk met de badge "waarschijnlijk" als tekst', () => {
    const lijst = stuk(html, 'md-wanneer-lijst', 'ul');
    expect(hoeveel(lijst, '<li')).toBe(2);
    expect(tekst(lijst)).toContain('1ste, 2de en 3de leerjaar: verplicht vanaf 2026-2027 waarschijnlijk');
    expect(tekst(lijst)).toContain('4de leerjaar: verplicht vanaf 2027-2028 waarschijnlijk');
    expect(hoeveel(lijst, '<span class="badge badge-warn">waarschijnlijk</span>')).toBe(2);
  });

  it('zegt "Mag al sinds 2025-2026." en toont de opmerking over het getuigschrift één keer', () => {
    expect(hoeveel(t, 'Mag al sinds 2025-2026.')).toBe(1);
    expect(hoeveel(html, 'class="md-wanneer-noot"')).toBe(1);
    expect(hoeveel(t, 'Deze leerlingen halen hun getuigschrift (2028-2029) wel op de nieuwe minimumdoelen')).toBe(1);
  });

  it('geeft één uitlegzin voor "waarschijnlijk", ook al staat de badge twee keer in de kalender', () => {
    expect(hoeveel(t, 'Waarschijnlijk: afgeleid uit het decreet zoals Klasse en de Codex het citeren.')).toBe(1);
  });

  it('zegt bij welke golf het vak hoort, zonder badge voor een vak waarvan de golf vaststaat', () => {
    const golf = tekst(stuk(html, 'md-wanneer-golf', 'p'));
    expect(golf).toBe('Dit vak hoort bij de eerste golf (Nederlands, wiskunde, wetenschap en techniek).');
  });

  it('noemt de kalender "samengesteld" en zegt dat de officiële tekst nog niet nagelezen is, nergens "nagekeken"', () => {
    expect(t).toContain('Kalender samengesteld op 2 november 2026 uit de einddata in de officiële gegevens en uit zoekresultaten. De officiële tekst is nog niet nagelezen.');
    expect(html).not.toMatch(/nagekeken/i);
    expect(html).not.toMatch(/widget/i);
  });
});

describe('WanneerGelden: de golf van een vak waarvan de indeling niet vaststaat', () => {
  it('Aardrijkskunde: de zin over de tweede golf, met de badge en de uitleg, en het decreet onder "Waarop steunt dit?"', () => {
    const html = toon(L4_AK);
    const golf = stuk(html, 'md-wanneer-golf', 'p');
    expect(tekst(golf)).toBe('Dit vak hoort bij de tweede golf (de andere vakken). waarschijnlijk');
    expect(tekst(html)).toContain('Waarschijnlijk: er bestaat geen oude set met dezelfde naam in de gegevens om dit mee na te rekenen.');
    const bronnen = tekst(stuk(html, 'md-wanneer-bronnen', 'details'));
    expect(bronnen).toContain('Decreet van 18 juli 2025 over de minimumdoelen (Edulex) — zoekresultaat (niet geopend)');
    expect(bronnen).toContain('KennisWest: inwerkingtreding van de minimumdoelen — zoekresultaat (niet geopend)');
  });

  it('Nederlands: de bronnen van de golfindeling staan er ook, met de officiële gegevens als eerste', () => {
    const bronnen = tekst(stuk(toon(L4_NL), 'md-wanneer-bronnen', 'details'));
    expect(bronnen).toContain('Decreet van 18 juli 2025 over de minimumdoelen (Edulex)');
    expect(bronnen).toContain('Onderwijsdoelen-API: einddata van de oude sets (opgehaald op 1 november 2026) — officiële gegevens');
  });
});

// ─── Een nieuwe set van de kleuterklas ───────────────────────────────────────

describe('WanneerGelden: de kleuterset van golf 2 (Muzische vorming)', () => {
  const html = toon(K_MV);

  it('heeft geen enkele badge: de kleutercellen staan vast in de gegevens', () => {
    expect(html).not.toContain('badge');
    expect(html).not.toContain('md-wanneer-uitleg');
  });

  it('zegt wat dit schooljaar geldt en wanneer het verplicht wordt', () => {
    const t = tekst(html);
    expect(t).toContain('Doelen voor het einde van het kleuteronderwijs. De 1ste en 2de kleuterklas werken ernaartoe;');
    expect(t).toContain('Dit schooljaar (2026-2027): mag al in de 1ste, 2de en 3de kleuterklas');
    expect(t).toContain('1ste, 2de en 3de kleuterklas: verplicht vanaf 2027-2028');
  });

  it('heeft geen bron die nog te lezen is: er is niets onzeker', () => {
    expect(tekst(html)).not.toContain('nog te lezen');
    expect(tekst(html)).toContain('zoekresultaat (niet geopend)');
  });
});

describe('WanneerGelden: de zekerheid verandert met het schooljaar', () => {
  it('in 2028 is het hele traject verplicht en zeker: de lijn heeft geen badge meer', () => {
    const t = tekst(stuk(toon(L4_NL, 2028), 'md-wanneer-nu', 'p'));
    expect(t).toBe('Dit schooljaar (2028-2029): verplicht in het 1ste, 2de, 3de en 4de leerjaar');
  });

  it('vóór de start van de set: "nog niet"', () => {
    expect(tekst(stuk(toon(L4_NL, 2024), 'md-wanneer-nu', 'p'))).toBe('Dit schooljaar (2024-2025): nog niet in het 1ste, 2de, 3de en 4de leerjaar');
  });
});

// ─── Een oude set ────────────────────────────────────────────────────────────

describe('WanneerGelden: een oude set die nog geldt', () => {
  const html = toon(OUD_NL);
  const t = tekst(html);

  it('zegt dat het oude eindtermen zijn voor het hele lager onderwijs', () => {
    expect(t).toContain('Oude eindtermen voor het hele lager onderwijs.');
  });

  it('toont de kalender met de laatste schooljaren per groep leerjaren', () => {
    const lijst = tekst(stuk(html, 'md-wanneer-lijst', 'ul'));
    expect(lijst).toContain('1ste, 2de en 3de leerjaar: geldt tot en met 2025-2026');
    expect(lijst).toContain('4de en 5de leerjaar: geldt tot en met 2026-2027');
    expect(lijst).toContain('6de leerjaar: geldt tot en met 2027-2028');
  });

  it('zegt in de lijn "Dit schooljaar" wat nog geldt en wat niet meer verplicht is', () => {
    const nu = tekst(stuk(html, 'md-wanneer-nu', 'p'));
    expect(nu).toContain('Dit schooljaar (2026-2027): geldt nog in het 4de, 5de en 6de leerjaar · niet meer verplicht in het 1ste, 2de en 3de leerjaar');
  });

  it('zegt "Niet meer verplicht voor …: daar gelden de nieuwe minimumdoelen" zonder een set te noemen of te koppelen', () => {
    expect(t).toContain('Niet meer verplicht voor het 1ste, 2de en 3de leerjaar: daar gelden de nieuwe minimumdoelen.');
    expect(html).not.toMatch(/vervangen door/i);
    expect(html).not.toContain('href="/leerplannen/minimumdoelen/');
    expect(t).not.toContain('Mag al sinds');
  });

  it('heeft geen golfzin: die is er alleen voor een nieuwe set', () => {
    expect(html).not.toContain('md-wanneer-golf');
  });

  it('zet het label van de onzekerheid ook achter de zin "Niet meer verplicht voor …"', () => {
    const vervangen = tekst(stuk(html, 'md-wanneer-vervangen', 'p'));
    expect(vervangen).toContain('Niet meer verplicht voor het 1ste, 2de en 3de leerjaar: daar gelden de nieuwe minimumdoelen.');
    expect(vervangen).toContain('waarschijnlijk');
    // Een oude set van het buitengewoon lager (einde in een golf, nog onzeker): daar staat 'nog onzeker'.
    expect(tekst(stuk(toon(OUD_BU_NL), 'md-wanneer-vervangen', 'p'))).toContain('nog onzeker');
  });
});

describe('WanneerGelden: oude sets zonder nieuwe tegenhanger', () => {
  it('Leren leren: geen verwijzing naar een nieuwe set, ook al staan er nieuwe sets in de index', () => {
    const html = toon(OUD_LEREN_LEREN, 2028);
    expect(tekst(html)).toContain('Oude eindtermen voor het hele lager onderwijs.');
    expect(tekst(html)).toContain('Niet meer verplicht voor het 1ste, 2de, 3de en 4de leerjaar: daar gelden de nieuwe minimumdoelen.');
    expect(html).not.toContain('/leerplannen/minimumdoelen/');
    expect(html).not.toMatch(/vervangen door|opvolger/i);
  });

  it('Sociale vaardigheden (buitengewoon): de tekst volgt de soort doelen, dus "ontwikkelingsdoelen"', () => {
    const t = tekst(toon(OUD_BU_SOCIAAL));
    expect(t).toContain('Oude ontwikkelingsdoelen voor het hele lager onderwijs.');
    expect(t).not.toMatch(/eindtermen/i);
  });

  it('de oude set van het buitengewoon lager met een einde in een golf: ook "ontwikkelingsdoelen", met de badge "nog onzeker"', () => {
    const html = toon(OUD_BU_NL);
    const t = tekst(html);
    expect(t).toContain('Oude ontwikkelingsdoelen voor het hele lager onderwijs.');
    expect(t).not.toMatch(/eindtermen/i);
    expect(tekst(stuk(html, 'md-wanneer-nu', 'p'))).toContain('nog onzeker');
  });

  it('de oude kleuterset zonder einddatum: "geldt; de bron geeft geen einddatum", zonder badge', () => {
    const html = toon(OUD_K_ZONDER_EINDE);
    expect(tekst(html)).toContain('1ste, 2de en 3de kleuterklas: geldt; de bron geeft geen einddatum');
    expect(tekst(html)).toContain('Oude ontwikkelingsdoelen voor het hele kleuteronderwijs.');
    expect(html).not.toContain('badge');
  });
});

describe('WanneerGelden: een set die helemaal vervallen is, een lege set en een onbekend vak', () => {
  it('een vervallen set krijgt het blok met de datum, ook als het label uit de gegevens nog "Geldig" zegt', () => {
    const html = toon({ ...OUD_K_NL, geldigheid: 'Geldig' });
    const t = tekst(html);
    expect(t).toContain('Wanneer gelden deze doelen?');
    expect(t).toContain('Deze doelen gelden niet meer sinds 1 september 2026.');
    expect(html).not.toContain('md-wanneer-lijst');
    expect(html).not.toContain('Dit schooljaar');
    expect(html).not.toContain('md-wanneer-bronnen');
  });

  it('een set die in 2027 vervalt, geldt nog in 2026 en niet meer in 2028', () => {
    expect(tekst(toon(OUD_NL, 2028))).toContain('Deze doelen gelden niet meer sinds 1 september 2028.');
    expect(tekst(toon(OUD_NL, 2027))).toContain('Dit schooljaar (2027-2028):');
  });

  it('een lege set heeft alleen de melding', () => {
    const html = toon(LEEG);
    expect(tekst(html)).toBe('Wanneer gelden deze doelen? De bron legt voor deze groep geen specifieke ontwikkelingsdoelen vast.');
    expect(html).not.toContain('md-wanneer-lijst');
    expect(html).not.toContain('md-wanneer-bronnen');
  });

  it('een nieuw vak dat de kalender niet kent: "nog onzeker", de uitleg, en nooit "verplicht"', () => {
    const html = toon(L4_BURGER, 2035);
    const t = tekst(html);
    expect(t).toContain('nog onzeker');
    expect(t).toContain('Nog onzeker: dit vak staat nog niet in de kalender van de app.');
    expect(t).toContain('4de leerjaar: nog niet in de kalender van de app');
    expect(t).not.toContain('verplicht');
    expect(html).not.toContain('md-wanneer-golf');
  });
});

// ─── Het buitengewoon basisonderwijs ─────────────────────────────────────────

describe('WanneerGelden: het buitengewoon basisonderwijs', () => {
  it('het lager is "nog onzeker", met de opmerking en de uitleg', () => {
    const html = toon(BU_L4_NL);
    const t = tekst(html);
    expect(tekst(stuk(html, 'md-wanneer-nu', 'p'))).toContain('nog onzeker');
    expect(t).toContain('Volgt de kalender van het gewoon basisonderwijs: de oude doelen eindigen op dezelfde dagen.');
    expect(t).toContain('Nog onzeker: de oude doelen eindigen op dezelfde dagen als in het gewoon basisonderwijs');
  });

  it('de kleuterset staat vast: geen badge', () => {
    expect(toon(BU_K_NL)).not.toContain('badge');
  });
});

// ─── De tweelingsets ─────────────────────────────────────────────────────────

describe('WanneerGelden: dezelfde doelen in de andere basissoort', () => {
  it('bij het basisonderwijs: een link naar de set van het buitengewoon basisonderwijs', () => {
    const html = toon(L4_WT);
    const tweeling = stuk(html, 'md-wanneer-tweeling', 'div');
    expect(tekst(tweeling)).toContain('Dezelfde doelen (zelfde nummers) staan ook in het buitengewoon basisonderwijs, daar na te streven:');
    expect(tweeling).toContain('<a href="/leerplannen/minimumdoelen/N_BU_L4_WT">‘Wetenschap en techniek’ (N_BU_L4_WT)</a>');
    expect(hoeveel(tweeling, '<a ')).toBe(1);
  });

  it('bij het buitengewoon basisonderwijs: de tekst verwijst naar het basisonderwijs', () => {
    const html = toon(BU_L4_WT);
    const tweeling = tekst(stuk(html, 'md-wanneer-tweeling', 'div'));
    expect(tweeling).toContain('Dezelfde doelen (zelfde nummers) staan ook in het basisonderwijs:');
    expect(html).toContain('href="/leerplannen/minimumdoelen/N_L4_WT"');
  });

  it('een set zonder tweeling in de index heeft het blok niet, en een oude set nooit', () => {
    expect(toon(L4_AK)).not.toContain('md-wanneer-tweeling');
    expect(toon(OUD_NL)).not.toContain('md-wanneer-tweeling');
  });
});

// ─── Bronnen en links ────────────────────────────────────────────────────────

describe('WanneerGelden: "Waarop steunt dit?"', () => {
  const html = toon(L4_NL);
  const details = stuk(html, 'md-wanneer-bronnen', 'details');

  it('is een details met een summary, en elke bron zegt hoe ze gekend is', () => {
    expect(details).toContain('<summary>Waarop steunt dit?</summary>');
    const t = tekst(details);
    expect(t).toContain('zoekresultaat (niet geopend)');
    expect(t).toContain('officiële gegevens');
    expect(t).toContain('afgeleid');
  });

  it('toont de bronnen die nog te lezen zijn zodra iets niet zeker is', () => {
    const t = tekst(details);
    expect(t).toContain('Vlaamse overheid: nieuwe minimumdoelen in het basisonderwijs — nog te lezen');
    expect(t).toContain('Vlaamse overheid: vraag en antwoord nieuwe minimumdoelen (pdf) — nog te lezen');
  });

  it('elke externe link heeft target _blank, rel noopener noreferrer en de sr-only tekst, en geen enkele linktekst begint met http', () => {
    const links = [...html.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].filter((m) => /href="https?:\/\//.test(m[1]));
    expect(links.length).toBeGreaterThan(5);
    for (const [, attrs, binnen] of links) {
      expect(attrs).toContain('target="_blank"');
      expect(attrs).toContain('rel="noopener noreferrer"');
      expect(binnen).toContain('<span class="sr-only"> (opent in een nieuw tabblad)</span>');
      expect(tekst(binnen).startsWith('http')).toBe(false);
    }
    expect(hoeveel(html, 'sr-only')).toBe(links.length);
  });

  it('toont nooit een kale url als tekst', () => {
    expect(tekst(html)).not.toMatch(/https?:\/\//);
  });

  it('een bron zonder url (afgeleid) is gewone tekst, zonder link', () => {
    const li = details.split('<li>').find((s) => s.includes('Afgeleid: het getuigschriftjaar'));
    expect(li).toBeDefined();
    expect(li).not.toContain('<a ');
  });
});

describe('WanneerGelden: met een nagebootste kalender', () => {
  it('de jaren komen uit de kalender die de component meekrijgt', () => {
    const k: Invoeringskalender = structuredClone(INVOERINGSKALENDER);
    k.cellen = k.cellen.map((c) => (c.soort === 'bao' && c.golf === 1 && c.leerjaar === 'L4' ? { ...c, vanaf: 2040 } : c));
    const t = tekst(toon(L4_NL, 2030, { kalender: k }));
    expect(t).toContain('4de leerjaar: verplicht vanaf 2040-2041');
    expect(t).toContain('mag al in het 4de leerjaar');
  });

  it('zodra een bron "gelezen" is, staat dat onderaan met de datum', () => {
    const nagebootst: Invoeringskalender = structuredClone(INVOERINGSKALENDER);
    nagebootst.bronnen = nagebootst.bronnen.map((b) => (b.id === 'vlaanderen-tabel' ? { ...b, hoe: 'gelezen' as const, gevondenOp: '2026-12-03' } : b));
    nagebootst.cellen = nagebootst.cellen.map((c) => ({ ...c, bronnen: [...c.bronnen, 'vlaanderen-tabel'] }));
    const t = tekst(toon(L4_NL, 2026, { kalender: nagebootst }));
    expect(t).toContain('en nagelezen in de officiële tekst op 3 december 2026.');
    expect(t).not.toContain('De officiële tekst is nog niet nagelezen.');
    expect(t).toContain('Vlaamse overheid: nieuwe minimumdoelen in het basisonderwijs — nagelezen');
  });
});

// ─── De klok ─────────────────────────────────────────────────────────────────

describe('WanneerGelden: leest nergens de klok', () => {
  it('het bronbestand roept geen new Date() of Date.now() aan', () => {
    const bron = readFileSync(fileURLToPath(new URL('./WanneerGelden.tsx', import.meta.url)), 'utf8');
    expect(bron).not.toMatch(/new Date\(/);
    expect(bron).not.toMatch(/Date\.now\(/);
  });
});
