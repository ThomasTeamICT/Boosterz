// De les van het schaduwtheater (LK-6) als statische opmaak: renderToStaticMarkup, zonder jsdom. Effecten draaien niet, dus de
// kijkdoos opent niet; wat hier telt is wat op het scherm komt te staan: namen van knoppen, labels van velden, de koppen,
// het bord zonder naamveld of opslagknop, en 'Wat ik al kan' met een woord per doel.

import { readFileSync, readdirSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STATUS_TEKST } from '../../../lib/basis/bewijs/bewijs';
import { LEGE_STAND, beginCheckLes, checkReducer, type BewijsStand } from '../../../lib/basis/lichtkamer/les';
import { CHECKS_4, juisteIndex } from '../../../lib/basis/lichtkamer';
import { CheckPaneel } from './CheckPaneel';
import { LichtkamerLes, type LesScherm, type LesStand } from './LichtkamerLes';
import { SESSIE_SLEUTEL, leesSessie, schrijfSessie } from './useKindBewijs';
import { WatIkKan } from './WatIkKan';

const toon = (stand: LesStand, beginScherm?: LesScherm) => renderToStaticMarkup(createElement(LichtkamerLes, { stand, bewijs: null, beginScherm }));
const ENTITEITEN: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'" };
const tekstVan = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#x27);/g, (m) => ENTITEITEN[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim();

/** Alle knoppen van een stuk html: de attributen en de binnenste tekst. */
function knoppen(html: string): { attr: string; tekst: string }[] {
  // Wat aria-hidden is, hoort niet bij de toegankelijke naam.
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({
    attr: m[1] as string,
    tekst: tekstVan((m[2] as string).replace(/<(span|svg)[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/\1>/g, '')),
  }));
}
const naam = (k: { attr: string; tekst: string }) => (/aria-label="([^"]*)"/.exec(k.attr)?.[1] ?? k.tekst).trim();

const ALLE: [LesStand, LesScherm][] = [
  ['kind', 'keuze'],
  ['kind', 'waar-valt-de-schaduw'],
  ['kind', 'drie-kaartjes'],
  ['kind', 'onderzoek-schaduw'],
  ['kind', 'check'],
  ['kind', 'kan'],
  ['bord', 'waar-valt-de-schaduw'],
  ['bord', 'drie-kaartjes'],
  ['bord', 'onderzoek-schaduw'],
  ['uitproberen', 'keuze'],
  ['uitproberen', 'check'],
];

describe('LichtkamerLes: toegankelijkheid van de opmaak', () => {
  it.each(ALLE)('%s, %s: elke knop heeft een toegankelijke naam', (stand, scherm) => {
    const lijst = knoppen(toon(stand, scherm));
    expect(lijst.length).toBeGreaterThan(0);
    for (const k of lijst) expect(naam(k), k.attr).not.toBe('');
  });

  it.each(ALLE)('%s, %s: elk invoerveld heeft een label dat naar zijn id verwijst', (stand, scherm) => {
    const html = toon(stand, scherm);
    for (const m of html.matchAll(/<input\b([^>]*)>/g)) {
      const id = /\bid="([^"]+)"/.exec(m[1] as string)?.[1];
      expect(id, m[0]).toBeDefined();
      expect(html, `label voor ${id}`).toMatch(new RegExp(`<label[^>]*for="${id}"[^>]*>[^<]+`));
    }
  });

  it.each(ALLE)('%s, %s: geen eigen main of h1 (dat doet het scherm), hoogstens één h2 per oefening', (stand, scherm) => {
    const html = toon(stand, scherm);
    expect(html).not.toMatch(/<main\b/);
    expect(html).not.toMatch(/<h1\b/);
    expect((html.match(/<h2\b/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it('elke oefening heeft een h2 met haar titel', () => {
    expect(tekstVan(toon('kind', 'waar-valt-de-schaduw').match(/<h2\b[^>]*>[\s\S]*?<\/h2>/)?.[0] ?? '')).toBe('Waar valt de schaduw?');
    expect(tekstVan(toon('kind', 'drie-kaartjes').match(/<h2\b[^>]*>[\s\S]*?<\/h2>/)?.[0] ?? '')).toBe('Drie kaartjes met een gaatje');
    expect(tekstVan(toon('kind', 'onderzoek-schaduw').match(/<h2\b[^>]*>[\s\S]*?<\/h2>/)?.[0] ?? '')).toBe('Onderzoek: lamp dichterbij, schaduw groter?');
  });

  it('geen emoji en geen woord widget', () => {
    for (const [stand, scherm] of ALLE) {
      const t = tekstVan(toon(stand, scherm));
      expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(t).not.toMatch(/widget/i);
    }
  });
});

describe('LichtkamerLes: het kindscherm', () => {
  it('toont grote tegels voor de drie oefeningen en de check', () => {
    const html = toon('kind', 'keuze');
    const tegels = knoppen(html).filter((k) => /b-lk-tegel"/.test(k.attr));
    expect(tegels.map((t) => /^(.*?)(?: Verzet| Meet| Voorspel| Drie vragen|$)/.exec(t.tekst)?.[1])).toEqual(['Drie kaartjes', 'Onderzoek', 'Waar valt de schaduw?', 'De check']);
    expect(html).toMatch(/<h2\b[^>]*>Kies een oefening<\/h2>/);
  });

  it('heeft Prikkelarm met aria-pressed, en geen naamveld of opslagknop', () => {
    const html = toon('kind', 'keuze');
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>[\s\S]*?Prikkelarm/);
    expect(html).not.toMatch(/<input/);
    expect(tekstVan(html)).not.toMatch(/\b(naam|bewaar|opslaan|inloggen)\b/i);
  });

  it('zonder speechSynthesis (zoals hier) verdwijnen Voorlezen en Hoor het nog eens', () => {
    const t = tekstVan(toon('kind', 'keuze'));
    expect(t).not.toContain('Voorlezen');
    expect(t).not.toContain('Hoor het nog eens');
  });

  it('de kijkdoos-balk heeft de zichtknoppen, en Lichtstralen tonen met aria-pressed (niet bij de voorspelling)', () => {
    for (const scherm of ['drie-kaartjes', 'onderzoek-schaduw'] as const) {
      const html = toon('kind', scherm);
      for (const z of ['Van voor', 'Schuin', 'Van opzij', 'Van boven']) expect(knoppen(html).some((k) => k.tekst === z), z).toBe(true);
      const stralen = knoppen(html).find((k) => k.tekst === 'Lichtstralen tonen');
      expect(stralen?.attr).toContain('aria-pressed="false"');
    }
    expect(knoppen(toon('kind', 'waar-valt-de-schaduw')).some((k) => k.tekst === 'Lichtstralen tonen')).toBe(false);
  });

  it('Drie kaartjes: elk gaatje heeft hoger en lager, en de lamp ook', () => {
    const lijst = knoppen(toon('kind', 'drie-kaartjes')).map(naam);
    for (const n of ['1 (bij de lamp)', '2', '3 (bij het scherm)']) {
      expect(lijst).toContain(`Gaatje ${n} hoger`);
      expect(lijst).toContain(`Gaatje ${n} lager`);
    }
    expect(lijst).toContain('Lamp hoger');
    expect(lijst).toContain('Lamp lager');
  });

  it('Onderzoek: drie tekstvelden met inputmode decimal en een zichtbaar label per afstand (30, 15, 10 cm)', () => {
    const html = toon('kind', 'onderzoek-schaduw');
    const velden = [...html.matchAll(/<input\b([^>]*)>/g)].map((m) => m[1] as string);
    expect(velden).toHaveLength(3);
    for (const v of velden) {
      expect(v).toContain('type="text"');
      expect(v).toContain('inputMode="decimal"');
    }
    for (const cm of [30, 15, 10]) expect(html).toMatch(new RegExp(`<label[^>]*for="lk-meting-${cm}"[^>]*>Hoogte van de schaduw bij ${cm} cm`));
    expect(html).not.toMatch(/type="number"/);
    expect(knoppen(html).map(naam)).toEqual(expect.arrayContaining(['Mijn onderzoek nakijken', 'Zet de lamp op 30 cm', 'Zet de lamp op 15 cm', 'Zet de lamp op 10 cm']));
  });

  it('Waar valt de schaduw?: de letters en ronde 1 van 3, zonder uitkomst of klasvraag', () => {
    const html = toon('kind', 'waar-valt-de-schaduw');
    expect(tekstVan(html)).toContain('Ronde 1 van 3');
    expect(knoppen(html).filter((k) => /b-lk-opt"/.test(k.attr))).toHaveLength(3);
    expect(tekstVan(html)).not.toContain('Toon de uitkomst');
    expect(tekstVan(html)).not.toContain('Klasvraag');
    expect(html).not.toContain('role="dialog"');
  });

  it('de check toont vraag 1 van 3 met drie prenten en een label per antwoord', () => {
    const html = toon('kind', 'check');
    expect(tekstVan(html)).toContain('Vraag 1 van 3');
    expect(html.match(/class="b-lk-prent"/g)).toHaveLength(3);
    const opties = knoppen(html).filter((k) => /b-lk-opt /.test(k.attr));
    expect(opties.map(naam)).toEqual(CHECKS_4[0]!.opties.map((o) => o.label));
  });
});

describe('LichtkamerLes: het bord', () => {
  it('begint met Waar valt de schaduw?, met Toon de uitkomst en Klasvraag, en met grote knoppen', () => {
    const html = toon('bord');
    expect(html).toContain('data-stand="bord"');
    expect(tekstVan(html.match(/<h2\b[^>]*>[\s\S]*?<\/h2>/)?.[0] ?? '')).toBe('Waar valt de schaduw?');
    const lijst = knoppen(html);
    expect(lijst.some((k) => k.tekst === 'Toon de uitkomst')).toBe(true);
    expect(lijst.some((k) => /Klasvraag/.test(k.tekst) && k.attr.includes('aria-haspopup="dialog"') && k.attr.includes('aria-expanded="false"'))).toBe(true);
    expect(lijst.filter((k) => /b-lk-groot/.test(k.attr)).length).toBeGreaterThanOrEqual(3);
  });

  it('heeft geen naamveld, geen invoerveld en geen opslagknop, en toont de oefeningen als keuze met aria-current', () => {
    const html = toon('bord');
    expect(html).not.toMatch(/<input|<textarea|<select/);
    expect(tekstVan(html)).not.toMatch(/\b(naam|bewaar|opslaan|inloggen|voornaam)\b/i);
    expect(html).toMatch(/<nav[^>]*aria-label="Oefeningen"/);
    expect(html).toMatch(/aria-current="true"[^>]*>Waar valt de schaduw\?/);
  });

  it('het onderzoek op het bord heeft geen klasvraag (die heeft alleen de voorspelling en de kaartjes)', () => {
    expect(tekstVan(toon('bord', 'onderzoek-schaduw'))).not.toContain('Klasvraag');
    expect(tekstVan(toon('bord', 'drie-kaartjes'))).toContain('Klasvraag');
  });

  it('de klasvraag en Toon de uitkomst staan niet op het kindscherm en niet bij uitproberen', () => {
    for (const stand of ['kind', 'uitproberen'] as const) {
      const t = tekstVan(toon(stand, 'waar-valt-de-schaduw'));
      expect(t).not.toContain('Klasvraag');
      expect(t).not.toContain('Toon de uitkomst');
    }
  });
});

describe("'Wat ik al kan'", () => {
  const rijen = (stand: BewijsStand) => [...toonKan(stand).matchAll(/<li\b[^>]*data-doel="(\d+)"[^>]*>([\s\S]*?)<\/li>/g)];
  const toonKan = (stand: BewijsStand) => renderToStaticMarkup(createElement(WatIkKan, { stand }));

  it('toont per doel een woord uit STATUS_TEKST, met een vormklasse', () => {
    const r = rijen(LEGE_STAND);
    expect(r.map((m) => m[1])).toEqual(['92767', '92775', '92777']);
    for (const m of r) {
      expect(m[2]).toContain(`>${STATUS_TEKST['nog-geen-bewijs']}<`);
      expect(m[2]).toContain('b-lk-st-leeg');
    }
  });

  it('elke stand heeft zijn eigen woord en vorm', () => {
    const j = (juist: boolean) => ({ juist, fout: null });
    const html = toonKan({ '4c1': j(true), '4c2': j(true), '4-meten': j(true), '4-besluit': j(false) });
    const per = Object.fromEntries(rijen({ '4c1': j(true), '4c2': j(true), '4-meten': j(true), '4-besluit': j(false) }).map((m) => [m[1], m[2]]));
    expect(per['92767']).toContain(`>${STATUS_TEKST['toont-het']}<`);
    expect(per['92767']).toContain('b-lk-st-toont');
    expect(per['92775']).toContain('b-lk-st-toont');
    expect(per['92777']).toContain(`>${STATUS_TEKST['nog-wankel']}<`);
    expect(per['92777']).toContain('b-lk-st-wankel');
    expect(html).toMatch(/<h2\b[^>]*>Wat ik al kan<\/h2>/);
    expect(rijen({ '4-besluit': j(false), '4-meten': j(false) }).map((m) => m[2]).join(' ')).toContain('b-lk-st-niet');
  });

  it('de kindzinnen staan er, geen jargon', () => {
    const t = tekstVan(toonKan(LEGE_STAND));
    expect(t).toContain('Ik weet dat licht in een rechte lijn gaat.');
  });
});

describe('de check: het eerste antwoord telt', () => {
  it("na het eerste antwoord staan de keuzes vast en komt 'Volgende vraag'", () => {
    const t = checkReducer(beginCheckLes(), { type: 'kies', keuze: 0 });
    const html = renderToStaticMarkup(createElement(CheckPaneel, { t, dispatch: () => undefined, naarWatIkKan: () => undefined }));
    expect(knoppen(html).filter((k) => /b-lk-opt /.test(k.attr)).every((k) => k.attr.includes('disabled'))).toBe(true);
    expect(tekstVan(html)).toContain('Volgende vraag');
    expect(tekstVan(html)).toContain('Nog niet.');
    expect(tekstVan(html)).toContain('Het juiste antwoord is C: de schaduw valt rechts op het scherm.');
    expect(html).toContain('b-lk-juist');
    expect(tekstVan(html)).toMatch(/juist.*niet juist|niet juist.*juist/);
  });

  it('de laatste vraag eindigt op Klaar; na de check staat Probeer de check nog eens klaar', () => {
    let t = beginCheckLes();
    for (const v of CHECKS_4) t = checkReducer(checkReducer(t, { type: 'kies', keuze: juisteIndex(v) }), { type: 'volgende' });
    const html = renderToStaticMarkup(createElement(CheckPaneel, { t, dispatch: () => undefined, naarWatIkKan: () => undefined }));
    expect(tekstVan(html)).toContain('Klaar met de check.');
    expect(knoppen(html).map(naam)).toEqual(['Wat ik al kan', 'Probeer de check nog eens']);
  });
});

describe('opslag: alleen de sessionStorage van het tabblad, en nooit de localStorage', () => {
  afterEach(() => vi.unstubAllGlobals());
  const opslag = () => {
    const data = new Map<string, string>();
    return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };
  const verboden = new Proxy({}, { get: () => { throw new Error('localStorage aangeraakt'); } });

  it('schrijft en leest onder één sleutel', () => {
    const s = opslag();
    vi.stubGlobal('window', { sessionStorage: s, localStorage: verboden });
    vi.stubGlobal('localStorage', verboden);
    schrijfSessie({ '4c1': { juist: true, fout: null } });
    expect([...s.data.keys()]).toEqual([SESSIE_SLEUTEL]);
    expect(leesSessie()).toEqual({ '4c1': { juist: true, fout: null } });
  });

  it('een kapotte of geblokkeerde opslag geeft een lege stand en breekt niets', () => {
    expect(leesSessie()).toEqual({});
    expect(() => schrijfSessie({})).not.toThrow();
    const kapot = { getItem: () => { throw new Error('geblokkeerd'); }, setItem: () => { throw new Error('vol'); } };
    vi.stubGlobal('window', { sessionStorage: kapot });
    expect(leesSessie()).toEqual({});
    expect(() => schrijfSessie({ '4c1': { juist: true, fout: null } })).not.toThrow();
    const s = opslag();
    s.setItem(SESSIE_SLEUTEL, 'geen json');
    vi.stubGlobal('window', { sessionStorage: s });
    expect(leesSessie()).toEqual({});
  });

  it('geen enkel bestand van het onderdeel noemt localStorage; alleen useKindBewijs noemt sessionStorage', () => {
    const map = new URL('.', import.meta.url);
    for (const f of readdirSync(map).filter((n) => /\.tsx?$/.test(n) && !/\.test\./.test(n))) {
      const code = readFileSync(new URL(f, map), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
      expect(code, f).not.toMatch(/\blocalStorage\b/);
      if (f !== 'useKindBewijs.ts') expect(code, f).not.toMatch(/\bsessionStorage\b/);
    }
  });
});

describe('herstelronde LK-6: teksten en namen', () => {
  it('de checkknoppen hebben geen aria-label (dat verving het woord juist of niet juist) maar een verborgen tekst', () => {
    const html = toon('kind', 'check');
    const opties = knoppen(html).filter((k) => /b-lk-opt /.test(k.attr));
    expect(opties).toHaveLength(3);
    for (const k of opties) expect(k.attr).not.toContain('aria-label');
    expect(html).toContain('<span class="sr-only">A: de schaduw valt links op het scherm</span>');
    const t = checkReducer(beginCheckLes(), { type: 'kies', keuze: 0 });
    const na = renderToStaticMarkup(createElement(CheckPaneel, { t, dispatch: () => undefined, naarWatIkKan: () => undefined }));
    const eerste = knoppen(na).find((k) => /b-lk-fout/.test(k.attr));
    expect(eerste?.tekst).toBe('A: de schaduw valt links op het scherm niet juist');
  });

  it("'Waar valt de schaduw?' zegt per stand de juiste zin: het kind tikt op een letter, het bord toont de uitkomst", () => {
    const kind = tekstVan(toon('kind', 'waar-valt-de-schaduw'));
    expect(kind).toContain('Voorspel eerst, kijk daarna');
    expect(kind).toContain('Tik op een letter. Dan zie je de schaduw en de lichtstralen. Klopte je voorspelling?');
    expect(kind).not.toContain('Toon de schaduw');
    const bord = tekstVan(toon('bord', 'waar-valt-de-schaduw'));
    expect(bord).toContain('Voorspel eerst, toon daarna');
    expect(bord).toContain('Toon de schaduw en de lichtstralen. Klopte je voorspelling?');
  });

  it('Drie kaartjes: stap 3 vraagt hoe de lamp, de gaatjes en het scherm moeten staan', () => {
    expect(tekstVan(toon('kind', 'drie-kaartjes'))).toContain('Hoe moeten de lamp, de gaatjes en het scherm staan, zodat er licht op het scherm komt?');
  });

  it('de koppen van het onderzoek vragen in kindertaal, met hypothese en conclusie tussen haakjes', () => {
    const t = tekstVan(toon('kind', 'onderzoek-schaduw'));
    expect(t).toContain('1. Wat denk ik dat er gebeurt? (mijn hypothese)');
    expect(t).toContain('3. Wat heb ik ontdekt? (mijn conclusie)');
  });

  it('de pijltjesknoppen van de kaartjes zijn de enige zonder binnenmarge (alleen een icoon)', () => {
    const lijst = knoppen(toon('kind', 'drie-kaartjes'));
    expect(lijst.filter((k) => k.attr.includes('b-lk-pijl'))).toHaveLength(6);
  });

  it("na het herladen: de tegel 'De check' is gedaan en de check begint als oefenronde", () => {
    const stand = { '4c1': { juist: true, fout: null }, '4c2': { juist: true, fout: null }, '4c3': { juist: false, fout: 'verwacht dat licht een bocht maakt' } };
    const ontvanger = { geef: () => undefined, stand: () => stand };
    const keuze = renderToStaticMarkup(createElement(LichtkamerLes, { stand: 'kind', bewijs: ontvanger, beginScherm: 'keuze' }));
    expect(/b-lk-tegel"[^>]*>(?:(?!<\/button>)[\s\S])*De check(?:(?!<\/button>)[\s\S])*gedaan/.test(keuze)).toBe(true);
    const check = tekstVan(renderToStaticMarkup(createElement(LichtkamerLes, { stand: 'kind', bewijs: ontvanger, beginScherm: 'check' })));
    expect(check).toContain('(oefenen: je eerste antwoord telt)');
  });
});
