// "Wat je cursussen samen dekken" bij een richting met beroepskwalificaties (docs/STUDIERICHTINGEN.md § 23.7.4): het blok
// "Minimumdoelen" zegt bij een cursus met competenties "zie ‘Competenties van de beroepskwalificaties’". Die verwijzing moet
// kloppen: het andere blok heeft die cursus, en de kop waarnaar de zin wijst staat er ook als het luie deel nog laadt of niet
// geladen kon worden. De test rendert de sectie op de server (zonder DOM), met een nagebootst luie deel.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BK_DEKKING_TITEL, BK_LADEN, BK_MD_REDEN_BK_CURSUS } from '../../lib/bkWeergave';
import type { Course } from '../../lib/courseTypes';
import type { Curriculum } from '../../lib/curriculumTypes';
import { dekkingMinimumdoelen, type CursusBijdrage } from '../../lib/dekkingMinimumdoelen';
import type { RichtingBk } from '../../lib/richtingBk';
import type { RichtingInfo, RichtingKader, RichtingKeuze } from '../../lib/richtingKader';
import type { MatrixBestand } from '../../lib/studierichtingen';

// Het luie deel dat `useLuiDeel` geeft: nog niet geladen (undefined), mislukt ('fout') of geladen (een module met `BkDekking`).
const mock = vi.hoisted(() => ({ deel: undefined as unknown }));
vi.mock('./useRichtingBk', async (orig) => {
  const echt = await orig<typeof import('./useRichtingBk')>();
  return { ...echt, useLuiDeel: () => mock.deel };
});

import { BkDekkingPlaats, RichtingDekking } from './RichtingDekking';
import { cursussenUitkomst, type DekkingStand } from './useRichtingDekking';
import type { BkStand } from './useRichtingBk';

const info = { groep: { nummer: 'G-0008' }, graad: 2, jaren: [3, 4] } as unknown as RichtingInfo;
const keuze = { groep: 'G-0008', soort: 'so' } as unknown as RichtingKeuze;
const kader = { keuze: { soort: 'so' }, sets: [] } as unknown as RichtingKader;
const MET_BK: BkStand = {
  status: 'klaar',
  waarde: {
    herkomst: 'api', bekrachtigingen: [],
    bks: [{ bk: 'BK-0390-2', nummer: 'BK-0390', versie: 2, titel: 'Onthaalmedewerker', onderdelen: [1], alleOnderdelen: true }],
  } satisfies RichtingBk,
};
const ZONDER_BK: BkStand = { status: 'klaar', waarde: { herkomst: 'geen', bks: [], bekrachtigingen: [] } };

function leerplan(id: string, methode: 'beroepskwalificatie' | 'pdf', metRefs: boolean): Curriculum {
  const goal = { id: 'g1', code: 'BK-0390-2.01', text: 'Werkt in teamverband', ...(metRefs ? { bkRefs: [{ bk: 'BK-0390-2', id: 'bkc0045062' }] } : {}) };
  return {
    id, title: `Leerplan ${id}`, subject: 'Onthaal', level: '5de jaar', net: 'beroepskwalificaties', kind: 'officieel',
    goals: [goal], herkomst: { methode }, createdAt: 0, updatedAt: 0,
  } as unknown as Curriculum;
}
function cursus(id: string, titel: string, leerplanId: string): Course {
  return { id, title: titel, author: '', chapters: [], settings: {}, curriculumId: leerplanId, createdAt: 0, updatedAt: 0 } as unknown as Course;
}

const LP_BK = leerplan('lp-bk', 'beroepskwalificatie', true);
const LP_BK_ZONDER = leerplan('lp-bk-zonder', 'beroepskwalificatie', false);
const LP_NET = leerplan('lp-net', 'pdf', false);
const CURSUSSEN = [cursus('c1', 'Met competenties', LP_BK.id), cursus('c2', 'Zonder competenties', LP_BK_ZONDER.id), cursus('c3', 'Van een net', LP_NET.id)];
const BIJDRAGEN: CursusBijdrage[] = [
  { course: CURSUSSEN[0], leerplan: LP_BK }, { course: CURSUSSEN[1], leerplan: LP_BK_ZONDER }, { course: CURSUSSEN[2], leerplan: LP_NET },
];

/** De dekking op minimumdoelen van een richting met minstens één doel, zoals `useRichtingDekking` ze geeft. */
function stand(): DekkingStand {
  const dekking = dekkingMinimumdoelen(
    [{ set: 'ODS_1', setNaam: 'Set', id: '1', code: '01', tekst: 'Doel', rubriek: 'Rubriek', optioneel: false, verplichteSet: true }],
    BIJDRAGEN,
    [],
  );
  return {
    status: 'klaar',
    waarde: { dekking, cursussen: cursussenUitkomst(dekking, BIJDRAGEN), namen: new Map(), bijdragen: BIJDRAGEN, bestanden: new Map(), kader },
  };
}

function toon(bk: BkStand, s: DekkingStand = stand()): string {
  const props = {
    info, keuze, stand: s, telMee: 'alle', onTelMee: () => {},
    bk: { stand: bk, courses: CURSUSSEN, curricula: [LP_BK, LP_BK_ZONDER, LP_NET], matrix: {} as MatrixBestand, vandaag: '2026-10-11' },
  };
  return renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(RichtingDekking, props as never)));
}

const hoeveel = (html: string, tekst: string) => html.split(tekst).length - 1;
const KOP = `>${BK_DEKKING_TITEL}</h3>`;
const FOUT = 'konden niet getoond worden';
/** De rij (`li`) van de cursus met deze titel, in de lijst "Cursussen die niet meetellen". */
function rij(html: string, titel: string): string {
  const stuk = html.split('<li class="dk-cursus">').find((s) => s.includes(`>${titel}</a>`));
  if (stuk === undefined) throw new Error(`geen rij voor ${titel}`);
  return stuk;
}

describe('cursussenUitkomst: wanneer volgt een cursus een beroepskwalificatie', () => {
  it('alleen met een BK-leerplan dat competenties heeft (`bkRefs`)', () => {
    const dekking = dekkingMinimumdoelen([], BIJDRAGEN, []);
    const uit = cursussenUitkomst(dekking, BIJDRAGEN);
    expect(uit.get('c1')?.volgtBk).toBe(true);
    // Een BK-leerplan zonder `bkRefs` (bewaard door een oudere app, N7): het blok met competenties telt haar niet mee.
    expect(uit.get('c2')?.volgtBk).toBeUndefined();
    expect(uit.get('c3')?.volgtBk).toBeUndefined();
    expect(uit.get('c2')?.leerplanTitel).toBe('Leerplan lp-bk-zonder');
  });
});

describe('RichtingDekking: de verwijzing naar het blok met competenties', () => {
  it('het blok "Minimumdoelen" verwijst voor een cursus met competenties, en niet voor een BK-leerplan zonder', () => {
    mock.deel = { BkDekking: () => createElement('div', { id: 'bk-stub' }) };
    const html = toon(MET_BK);
    expect(html).toContain('id="bk-stub"');
    expect(rij(html, 'Met competenties')).toContain(BK_MD_REDEN_BK_CURSUS);
    expect(rij(html, 'Zonder competenties')).not.toContain(BK_MD_REDEN_BK_CURSUS);
    expect(rij(html, 'Zonder competenties')).toContain('verwijst niet naar minimumdoelen');
    expect(rij(html, 'Van een net')).not.toContain(BK_MD_REDEN_BK_CURSUS);
  });

  it('zonder beroepskwalificaties bij de richting is de sectie zoals ze was: geen kop, geen verwijzing', () => {
    mock.deel = undefined;
    const html = toon(ZONDER_BK);
    expect(html).not.toContain(BK_DEKKING_TITEL);
    expect(html).not.toContain(BK_MD_REDEN_BK_CURSUS);
    expect(html).not.toContain(BK_LADEN);
  });

  it('het luie deel laadt nog: de kop waarnaar de zin wijst staat er al, met de laadregel', () => {
    mock.deel = undefined;
    const html = toon(MET_BK);
    expect(hoeveel(html, KOP)).toBe(1);
    expect(html).toContain(BK_LADEN);
    expect(rij(html, 'Met competenties')).toContain(BK_MD_REDEN_BK_CURSUS);
  });

  it('het luie deel kon niet laden: de kop staat er, met de foutmelding eronder, en de verwijzing wijst ernaar', () => {
    mock.deel = 'fout';
    const html = toon(MET_BK);
    expect(hoeveel(html, KOP)).toBe(1);
    expect(hoeveel(html, FOUT)).toBe(1);
    expect(html.indexOf(FOUT)).toBeGreaterThan(html.indexOf(KOP));
    expect(html).toContain('role="alert"');
    expect(rij(html, 'Met competenties')).toContain(BK_MD_REDEN_BK_CURSUS);
  });

  it('het luie deel geladen: de plaats met de kop maakt plaats voor het blok zelf, één blok', () => {
    mock.deel = { BkDekking: () => createElement('h3', null, BK_DEKKING_TITEL) };
    const html = toon(MET_BK);
    expect(hoeveel(html, KOP)).toBe(1);
    expect(html).not.toContain(FOUT);
    expect(html).not.toContain(BK_LADEN);
  });

  it('zonder minimumdoelen (stand "geen") staat de plaats van het blok er ook, onder de kop "Minimumdoelen"', () => {
    mock.deel = 'fout';
    const html = toon(MET_BK, { status: 'geen', herkomst: 'geen' });
    expect(hoeveel(html, KOP)).toBe(1);
    expect(html.indexOf('>Minimumdoelen</h3>')).toBeLessThan(html.indexOf(KOP));
  });
});

describe('BkDekkingPlaats', () => {
  it('heeft een kop en benoemt haar groep, met de laadregel of de foutmelding', () => {
    const laden = renderToStaticMarkup(createElement(BkDekkingPlaats, { fout: false }));
    expect(laden).toContain(KOP);
    expect(laden).toContain('role="group"');
    expect(laden).toContain(BK_LADEN);
    expect(laden).not.toContain('role="alert"');
    const fout = renderToStaticMarkup(createElement(BkDekkingPlaats, { fout: true }));
    expect(fout).toContain(KOP);
    expect(fout).toContain('role="alert"');
    expect(fout).toContain(FOUT);
    expect(fout).not.toContain(BK_LADEN);
  });
});
