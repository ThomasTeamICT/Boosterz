// De lijst "Cursussen voor deze richting" bij een richting met beroepskwalificaties (docs/STUDIERICHTINGEN.md § 23.7.4): welke
// cursus krijgt de zin "Volgt een beroepskwalificatie: zie ‘Competenties van de beroepskwalificaties’ hieronder."? Alleen een
// cursus die het blok daar ook meetelt: haar leerplan heeft competenties (`bkRefs`), en ze valt niet buiten "Tel mee". De test
// rendert de lijst op de server (zonder DOM), zoals `DekkingKort.test.ts`.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import { BK_CURSUS_VOLGT_BK } from '../../lib/bkWeergave';
import type { Course } from '../../lib/courseTypes';
import type { Curriculum, CurriculumMethode } from '../../lib/curriculumTypes';
import type { Doelgroep } from '../../lib/doelgroep';
import type { RichtingBk } from '../../lib/richtingBk';
import type { RichtingInfo, RichtingKader, RichtingKeuze } from '../../lib/richtingKader';
import { RichtingCursussen } from './RichtingCursussen';
import type { DekkingGegevens, CursusUitkomst, TelMee } from './useRichtingDekking';
import type { BkStand } from './useRichtingBk';

const info = { groep: { nummer: 'G-0008' } } as unknown as RichtingInfo;
const kader = { keuze: { soort: 'so' }, sets: [] } as unknown as RichtingKader;
const MET_BK: BkStand = {
  status: 'klaar',
  waarde: {
    herkomst: 'api', bekrachtigingen: [],
    bks: [{ bk: 'BK-0390-2', nummer: 'BK-0390', versie: 2, titel: 'Onthaalmedewerker', onderdelen: [1], alleOnderdelen: true }],
  } satisfies RichtingBk,
};
const ZONDER_BK: BkStand = { status: 'klaar', waarde: { herkomst: 'geen', bks: [], bekrachtigingen: [] } };

function leerplan(id: string, methode: CurriculumMethode, metRefs: boolean): Curriculum {
  const goal = { id: 'g1', code: 'BK-0390-2.01', text: 'Werkt in teamverband', ...(metRefs ? { bkRefs: [{ bk: 'BK-0390-2', id: 'bkc0045062' }] } : {}) };
  return {
    id, title: `Leerplan ${id}`, subject: 'Onthaal', level: '5de jaar', net: 'beroepskwalificaties', kind: 'officieel',
    goals: [goal], herkomst: { methode }, createdAt: 0, updatedAt: 0,
  } as unknown as Curriculum;
}

function cursus(id: string, titel: string, leerplanId: string, jaar?: number): Course {
  const doelgroep: Doelgroep = { groep: 'G-0008', titel: 'Onthaal en recreatie', soort: 'so', graad: 2, ...(jaar !== undefined ? { jaar } : {}) };
  return { id, title: titel, author: '', coverEmoji: '📘', code: 'ABC123', chapters: [], settings: {}, curriculumId: leerplanId, doelgroep, createdAt: 0, updatedAt: 0 } as unknown as Course;
}

const LEERPLANNEN = [
  leerplan('lp-bk', 'beroepskwalificatie', true),
  leerplan('lp-bk-zonder', 'beroepskwalificatie', false),
  leerplan('lp-net', 'pdf', false),
];

function toon(o: {
  bk?: BkStand; courses: Course[]; dekking?: DekkingGegevens; telMee?: TelMee; jaar?: number;
}): string {
  const keuze = { groep: 'G-0008', soort: 'so', ...(o.jaar !== undefined ? { jaar: o.jaar } : {}) } as unknown as RichtingKeuze;
  const props = {
    info, keuze, kader, indexSets: [], curricula: LEERPLANNEN, courses: o.courses, bk: o.bk ?? MET_BK,
    ...(o.dekking ? { dekking: o.dekking } : {}), ...(o.telMee ? { telMee: o.telMee } : {}),
  };
  return renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(RichtingCursussen, props as never)));
}

/** De dekking op minimumdoelen zoals `useRichtingDekking` ze geeft, met de cursussen die ze kent. */
function dekkingMet(uitkomsten: CursusUitkomst[], telJaar?: number): DekkingGegevens {
  return {
    dekking: {} as never, cursussen: new Map(uitkomsten.map((c) => [c.courseId, c])), namen: new Map(), bijdragen: [], bestanden: new Map(),
    kader, ...(telJaar !== undefined ? { telJaar } : {}),
  };
}
const nietMee = (courseId: string, titel: string, reden: 'geen-verwijzingen', volgtBk: boolean): CursusUitkomst =>
  ({ courseId, titel, telt: false, reden, draagtBij: 0, buitenKader: 0, ...(volgtBk ? { volgtBk: true } : {}) });

const hoeveel = (html: string, tekst: string) => html.split(tekst).length - 1;
/** De rij (`li`) van de cursus met deze titel. */
function rij(html: string, titel: string): string {
  const stuk = html.split('<li class="ri-item">').find((s) => s.includes(`>${titel}</a>`));
  if (stuk === undefined) throw new Error(`geen rij voor ${titel}`);
  return stuk;
}
const ZIN = BK_CURSUS_VOLGT_BK;

describe('RichtingCursussen: de zin bij een cursus met competenties', () => {
  it('een cursus met competenties krijgt de zin, een cursus met een leerplan van een net niet', () => {
    const html = toon({ courses: [cursus('c1', 'Onthaal', 'lp-bk'), cursus('c2', 'Algemeen', 'lp-net')] });
    expect(hoeveel(html, ZIN)).toBe(1);
    expect(rij(html, 'Onthaal')).toContain(ZIN);
    expect(rij(html, 'Algemeen')).not.toContain(ZIN);
  });

  it('een BK-leerplan zonder competenties (oudere app, N7) krijgt de zin niet: het blok met competenties telt haar niet mee', () => {
    const html = toon({ courses: [cursus('c1', 'Zonder', 'lp-bk-zonder')] });
    expect(html).not.toContain(ZIN);
  });

  it('zonder de dekking op minimumdoelen blijft de zin voor een cursus met competenties staan', () => {
    expect(toon({ courses: [cursus('c1', 'Onthaal', 'lp-bk')] })).toContain(ZIN);
  });

  it('met de dekking: een BK-leerplan zonder competenties houdt de reden van de minimumdoelen', () => {
    const dekking = dekkingMet([nietMee('c1', 'Zonder', 'geen-verwijzingen', false)]);
    const html = toon({ courses: [cursus('c1', 'Zonder', 'lp-bk-zonder')], dekking });
    expect(html).not.toContain(ZIN);
    expect(html).toContain('verwijst niet naar minimumdoelen');
  });

  it('zonder beroepskwalificaties bij de richting verwijst niets naar het blok', () => {
    expect(toon({ bk: ZONDER_BK, courses: [cursus('c1', 'Onthaal', 'lp-bk')] })).not.toContain(ZIN);
    expect(toon({ bk: { status: 'niet-van-toepassing' }, courses: [cursus('c1', 'Onthaal', 'lp-bk')] })).not.toContain(ZIN);
  });
});

describe('RichtingCursussen: "Tel mee" voor het blok met competenties', () => {
  const c3 = cursus('c3', 'Derde jaar', 'lp-bk', 3);
  const c4 = cursus('c4', 'Vierde jaar', 'lp-bk', 4);
  const cHeel = cursus('c0', 'Hele graad', 'lp-bk');

  it('"Alleen het 3de jaar" en geen minimumdoelen (de dekking ontbreekt): alleen cursussen van dat jaar en zonder jaar krijgen de zin', () => {
    const html = toon({ courses: [c3, c4, cHeel], telMee: 'jaar', jaar: 3 });
    expect(hoeveel(html, ZIN)).toBe(2);
    expect(rij(html, 'Derde jaar')).toContain(ZIN);
    // De cursus van het 4de jaar telt in het blok met competenties niet mee, dus de lijst verwijst er niet voor naar dat blok.
    expect(rij(html, 'Vierde jaar')).not.toContain(ZIN);
    expect(rij(html, 'Hele graad')).toContain(ZIN);
  });

  it('"Alle jaren van de graad": elke cursus met competenties krijgt de zin', () => {
    expect(hoeveel(toon({ courses: [c3, c4, cHeel], telMee: 'alle', jaar: 3 }), ZIN)).toBe(3);
    expect(hoeveel(toon({ courses: [c3, c4, cHeel], jaar: 3 }), ZIN)).toBe(3);
  });

  it('"Alleen het ..de jaar" zonder gekozen jaar filtert niet', () => {
    expect(hoeveel(toon({ courses: [c3, c4], telMee: 'jaar' }), ZIN)).toBe(2);
  });

  it('met de dekking op minimumdoelen beslist haar jaar: de cursus van een ander jaar staat er niet in en krijgt de zin niet', () => {
    const dekking = dekkingMet([nietMee('c3', 'Derde jaar', 'geen-verwijzingen', true)], 3);
    const html = toon({ courses: [c3, c4], dekking, jaar: 3 });
    expect(hoeveel(html, ZIN)).toBe(1);
    expect(rij(html, 'Derde jaar')).toContain(ZIN);
    expect(rij(html, 'Vierde jaar')).not.toContain(ZIN);
  });
});
