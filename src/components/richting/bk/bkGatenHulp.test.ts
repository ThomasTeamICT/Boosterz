// Tests voor bkGatenHulp.ts (docs/STUDIERICHTINGEN.md § 24.4 onder "3b-L2", § 24.9 rij L2, invarianten I1 en I2,
// beslissingen F3b-B2, F3b-B3 en F3b-B5). Alle getallen, codes en titels hieronder zijn met de hand nagerekend op de
// fixtures van G-0008 "Assistent dierlijke productie" (2de graad): Onthaalmedewerker (BK-0390-2) heeft 12 competenties,
// Recreatief medewerker (BK-0464-1) 13, allemaal met een tekst en met `nr` 1 tot 12 en 1 tot 13.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BK_BRON,
  splitsBk,
  valideerBkBestand,
  type BkBestand,
  type BkIndex,
  type Competentie,
  type KoppelingBestand,
} from '../../../lib/beroepskwalificaties';
import { cursusVoorBk } from '../../../lib/bkCursus';
import { leerplanUitBk, selectieVanBkLeerplan, titelVoorBkLeerplan, type BkLeerplanUitkomst } from '../../../lib/bkLeerplan';
import { bkNietNagekeken } from '../../../lib/bkWeergave';
import type { Course } from '../../../lib/courseTypes';
import type { Curriculum } from '../../../lib/curriculumTypes';
import { bkKaderDoelen, dekkingBk } from '../../../lib/dekkingBk';
import type { Doelgroep } from '../../../lib/doelgroep';
import { openPerSet, openVerplichteDoelen, selectieVanOpen } from '../../../lib/gatenDichten';
import { effectieveStatus } from '../../../lib/leerplanStatus';
import { bkKader } from '../../../lib/richtingBk';
import { doelgroepVan, richtingInfo, type RichtingInfo, type RichtingKeuze } from '../../../lib/richtingKader';
import { bijdragenVoorKader } from '../../../lib/richtingOverzicht';
import { sha256Hex } from '../../../lib/sha256';
import type { MatrixBestand } from '../../../lib/studierichtingen';
import { BK_GATEN_NIET_PRECIES, leerplanVoorBkGaten, titelsVoorBkGaten, type BkGatenLeerplan, type BkGatenLeerplanIn } from './bkGatenHulp';
import { bouwNieuwLeerplan, leerplanPerKaart } from './bkSectieHulp';

// ── Een schakelaar rond `leerplanUitBk` ─────────────────────────────────────
// Standaard is het de echte functie. Een paar tests laten ze een leerplan teruggeven dat niet precies klopt, om na te gaan
// dat `leerplanVoorBkGaten` dat zelf opmerkt (stap 4) en niets doorlaat.

const nep = vi.hoisted(() => ({
  echt: undefined as undefined | ((...a: unknown[]) => unknown),
  leerplanUitBk: undefined as undefined | ((...a: unknown[]) => unknown),
}));

vi.mock('../../../lib/bkLeerplan', async (importOriginal) => {
  const echt = await importOriginal<typeof import('../../../lib/bkLeerplan')>();
  nep.echt = echt.leerplanUitBk as (...a: unknown[]) => unknown;
  return {
    ...echt,
    leerplanUitBk: (...a: Parameters<typeof echt.leerplanUitBk>) =>
      (nep.leerplanUitBk ? nep.leerplanUitBk(...a) : echt.leerplanUitBk(...a)) as BkLeerplanUitkomst,
  };
});

afterEach(() => {
  nep.leerplanUitBk = undefined;
});

const echteLeerplanUitBk = (...a: Parameters<typeof leerplanUitBk>): BkLeerplanUitkomst => (nep.echt as typeof leerplanUitBk)(...a);

// ── Fixtures ────────────────────────────────────────────────────────────────

const HIER = fileURLToPath(new URL('.', import.meta.url));
const lees = (pad: string): unknown => JSON.parse(readFileSync(join(HIER, '../../../../tests/fixtures', pad), 'utf8'));

const VANDAAG = '2026-10-14';
const MATRIX = lees('structuur/uit/studierichtingen.json') as MatrixBestand;
const KOPPELING = lees('kwalificaties/uit/koppeling.json') as KoppelingBestand;
const INDEX = lees('kwalificaties/uit/index.json') as BkIndex;
const ONTHAAL = lees('kwalificaties/uit/bk/BK-0390-2.json') as BkBestand;
const RECREATIEF = lees('kwalificaties/uit/bk/BK-0464-1.json') as BkBestand;

function infoVan(groep: string): RichtingInfo {
  const i = richtingInfo(MATRIX, groep, VANDAAG);
  if (!i) throw new Error(`${groep} ontbreekt in de structuurfixtures`);
  return i;
}

const INFO_8 = infoVan('G-0008');
const KEUZE_3: RichtingKeuze = { groep: 'G-0008', soort: 'so', jaar: 3 };
const KEUZE_GRAAD: RichtingKeuze = { groep: 'G-0008', soort: 'so' };
const DG: Doelgroep = doelgroepVan(INFO_8, KEUZE_3);
const KADER_8 = bkKader(KOPPELING, INDEX, INFO_8, { groep: 'G-0008', soort: 'so' }, VANDAAG);

/** De versiemerken uit de index, zoals `laadBkGegevens` ze geeft. Met de hand: de eerste 16 tekens van de sha256. */
const MERKEN: ReadonlyMap<string, string> = new Map([
  ['BK-0390-2', '75ed8f70bba4cc76'],
  ['BK-0464-1', '0952ac83fb3ee152'],
]);
const BESTANDEN: ReadonlyMap<string, BkBestand> = new Map([
  ['BK-0390-2', ONTHAAL],
  ['BK-0464-1', RECREATIEF],
]);

/** De competentiecodes in de volgorde van de bestanden (met de hand overgenomen uit de fixtures). */
const ONTHAAL_IDS = [
  'bkc0045062', 'bkc9039002', 'bkc9039003', 'bkc9039004', 'bkc9039005', 'bkc9039006',
  'bkc9039007', 'bkc9039008', 'bkc9039009', 'bkc9039010', 'bkc9039011', 'bkc9039012',
];
const RECREATIEF_IDS = [
  'bkc0040761', 'bkc9046402', 'bkc9046403', 'bkc9046404', 'bkc9046405', 'bkc9046406', 'bkc9046407',
  'bkc9046408', 'bkc9046409', 'bkc9046410', 'bkc9046411', 'bkc9046412', 'bkc9046413',
];

/** Nooit op het scherm (I7): een competentiecode, ADV-nummer, groepnummer of set-id. */
const CODE_OP_SCHERM = /bkc\d|ADV-|G-\d|ODS_/;

function gaten(selectie: ReadonlyMap<string, readonly string[]>, extra: Partial<BkGatenLeerplanIn> = {}): BkGatenLeerplan {
  return leerplanVoorBkGaten({
    info: INFO_8, keuze: KEUZE_3, selectie, gegevens: { bestanden: BESTANDEN, merken: MERKEN }, curricula: [], vandaag: VANDAAG, ...extra,
  });
}

function nieuwUit(r: BkGatenLeerplan): Curriculum {
  expect(r.soort, JSON.stringify(r).slice(0, 300)).toBe('nieuw');
  if (r.soort !== 'nieuw') throw new Error('geen nieuw leerplan');
  return r.leerplan;
}

const onthaal = (ids: readonly string[]) => new Map([['BK-0390-2', [...ids]]]);
const codesVan = (l: Curriculum) => l.goals.map((g) => g.code);
const refIdsVan = (l: Curriculum) => l.goals.map((g) => g.bkRefs?.[0]?.id);

/** Een nagekeken leerplan van een keuze, zoals een ander scherm het eerder bewaarde. */
function nagekeken(bestand: BkBestand, ids: readonly string[], merken: ReadonlyMap<string, string> = MERKEN, doelgroep: Doelgroep = DG, titel?: string): Curriculum {
  const u = leerplanUitBk([{ bestand, competenties: ids }], { doelgroep, merken, ...(titel !== undefined ? { titel } : {}) });
  expect(u.bevestigd, u.waarschuwingen.join(' | ')).toBe(true);
  return u.leerplan;
}

/** "Bewaar als leerplan" op de kaart van Onthaalmedewerker (bkSectieHulp.ts), zonder iets te bewaren. */
function bewaarAlsLeerplan(curricula: Curriculum[] = []) {
  return bouwNieuwLeerplan({
    doel: { soort: 'kaart', versie: 'BK-0390-2' }, bestanden: BESTANDEN, info: INFO_8, doelgroep: DG, merken: MERKEN, curricula, vandaag: VANDAAG,
  });
}

/** Dezelfde versie met een andere inhoud (een maandelijkse update): een nieuwe sha256, door de validator. */
function bijgewerkt(b: BkBestand, wijzig: (c: Competentie[]) => Competentie[]): BkBestand {
  const competenties = wijzig(structuredClone(b.competenties));
  const nieuw: BkBestand = { ...structuredClone(b), competenties, aantal: competenties.length, sha256: sha256Hex(`${b.sha256}|${JSON.stringify(competenties)}`) };
  const fouten = valideerBkBestand(nieuw, b.bk);
  if (fouten.length > 0) throw new Error(`bijgewerkt: ${fouten.join(' ')}`);
  return nieuw;
}

/** Een eigen, geldig BK-bestand met `aantal` competenties. */
function maakBk(bk: string, titel: string, aantal: number): BkBestand {
  const delen = splitsBk(bk) as { nummer: string; versie: number };
  const competenties: Competentie[] = [];
  for (let i = 0; i < aantal; i++) {
    competenties.push({
      id: `bkc8${delen.nummer.slice(3)}${String(i + 1).padStart(3, '0')}`,
      nr: i + 1, type: 'Vakspecifieke competentie', tekst: `Competentie ${i + 1} van ${titel}`, kennis: [], vaardigheden: [],
    });
  }
  const b: BkBestand = {
    app: 'boosterz', kind: 'beroepskwalificatie', v: 1, bk, nummer: delen.nummer, versie: delen.versie, titel, status: 'ERKEND',
    bron: BK_BRON, api: `https://onderwijs.api.vlaanderen.be/kwalificaties-en-curriculum/beroepskwalificaties/v2/beroepskwalificatie/${bk}`,
    naamsvermelding: 'Bron: test', licentie: 'nog te bevestigen', opgehaald: '2026-10-10T00:00:00Z', aantal,
    sha256: sha256Hex(`${bk}|${titel}|${aantal}`), competenties,
  };
  const fouten = valideerBkBestand(b, bk);
  if (fouten.length > 0) throw new Error(`maakBk: ${fouten.join(' ')}`);
  return b;
}

function diepBevroren<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v as Record<string, unknown>)) diepBevroren(x);
  }
  return v;
}

// ── Vertrekpunt: de fixtures zoals de tests ze lezen ────────────────────────

describe('vertrekpunt (met de hand nagekeken op de fixtures)', () => {
  it('G-0008 heeft twee beroepskwalificaties: Onthaalmedewerker met 12 en Recreatief medewerker met 13 competenties', () => {
    expect(INFO_8.groep.titel).toBe('Assistent dierlijke productie');
    expect(INFO_8.graad).toBe(2);
    expect(KADER_8.herkomst).toBe('api');
    expect(KADER_8.bks.map((r) => [r.bk, r.titel])).toEqual([['BK-0390-2', 'Onthaalmedewerker'], ['BK-0464-1', 'Recreatief medewerker']]);
    expect(ONTHAAL.competenties.map((c) => c.id)).toEqual(ONTHAAL_IDS);
    expect(RECREATIEF.competenties.map((c) => c.id)).toEqual(RECREATIEF_IDS);
    expect(bkKaderDoelen(KADER_8, BESTANDEN)).toHaveLength(25);
  });

  it('de versiemerken zijn die van de index en van de bestanden', () => {
    for (const r of INDEX.bks.filter((x) => MERKEN.has(x.bk))) expect(MERKEN.get(r.bk)).toBe(r.sha256?.slice(0, 16));
    expect(ONTHAAL.sha256.slice(0, 16)).toBe(MERKEN.get('BK-0390-2'));
    expect(RECREATIEF.sha256.slice(0, 16)).toBe(MERKEN.get('BK-0464-1'));
  });
});

// ── Het scenario van § 24.9 (rooktest 20i, stap 1 tot 4) ────────────────────

describe('het scenario van § 24.9 op G-0008, met de hand nagerekend', () => {
  // Cursus A: een leerplan met 8 van de 12 competenties van Onthaalmedewerker (de laatste 4 uitgevinkt), met 8 lege secties.
  const LA = nagekeken(ONTHAAL, ONTHAAL_IDS.slice(0, 8));
  const A: Course = cursusVoorBk({ titel: 'Cursus A', auteur: 'Test', doelgroep: DG, leerplan: LA, bestanden: BESTANDEN, start: 'geraamte' });
  const dekkingVan = (courses: Course[], curricula: Curriculum[]) =>
    dekkingBk(bkKaderDoelen(KADER_8, BESTANDEN), bijdragenVoorKader({ courses, curricula, info: INFO_8, soort: 'so', matrix: MATRIX, vandaag: VANDAAG }), []);

  it('stap 3: 8 competenties staan gepland, 17 komen nog nergens aan bod (4 + 13)', () => {
    const d = dekkingVan([A], [LA]);
    expect(d.rijen).toHaveLength(25);
    expect(d.rijen.filter((r) => r.status === 'gepland').map((r) => r.doel.id)).toEqual(ONTHAAL_IDS.slice(0, 8));
    const open = openPerSet(openVerplichteDoelen(d));
    expect(open.map((s) => [s.set, s.setNaam, s.doelen.length])).toEqual([['BK-0390-2', 'Onthaalmedewerker', 4], ['BK-0464-1', 'Recreatief medewerker', 13]]);
    expect(selectieVanOpen(open, new Set(['BK-0390-2']))).toEqual(new Map([['BK-0390-2', ['bkc9039009', 'bkc9039010', 'bkc9039011', 'bkc9039012']]]));
  });

  it('stap 3: Recreatief medewerker uitgevinkt geeft een nagekeken leerplan met precies 4 doelen, zonder "alle" en zonder `refs`', () => {
    const open = openPerSet(openVerplichteDoelen(dekkingVan([A], [LA])));
    const l = nieuwUit(gaten(selectieVanOpen(open, new Set(['BK-0390-2'])), { curricula: [LA] }));
    expect(l.title).toBe('Aanvulling · Onthaalmedewerker (4 van 12 competenties) · Assistent dierlijke productie · 2de graad');
    expect(codesVan(l)).toEqual(['BK-0390-2.09', 'BK-0390-2.10', 'BK-0390-2.11', 'BK-0390-2.12']);
    expect(l.goals.map((g) => g.bkRefs)).toEqual([
      [{ bk: 'BK-0390-2', id: 'bkc9039009' }], [{ bk: 'BK-0390-2', id: 'bkc9039010' }],
      [{ bk: 'BK-0390-2', id: 'bkc9039011' }], [{ bk: 'BK-0390-2', id: 'bkc9039012' }],
    ]);
    expect(l.goals.every((g) => g.refs === undefined || g.refs.length === 0)).toBe(true);
    expect(l.minimumdoelenSets ?? []).toEqual([]);
    expect(l.bkVersies).toEqual([{ bk: 'BK-0390-2', sha: '75ed8f70bba4cc76' }]);
    expect(l.herkomst?.methode).toBe('beroepskwalificatie');
    expect(effectieveStatus(l)).toBe('gecontroleerd');
    // De doelgroep van de richting, zonder jaar: een leerplan geldt voor de hele graad.
    expect(l.doelgroep).toEqual({ groep: 'G-0008', titel: 'Assistent dierlijke productie', soort: 'so', graad: 2 });
    expect(l.subject).toBe('Onthaalmedewerker');
  });

  it('stap 3: de nieuwe cursus krijgt 4 secties met de doelcode en de kennis en vaardigheden; daarna staan alle 12 gepland', () => {
    const open = openPerSet(openVerplichteDoelen(dekkingVan([A], [LA])));
    const LB = nieuwUit(gaten(selectieVanOpen(open, new Set(['BK-0390-2'])), { curricula: [LA] }));
    const titels = titelsVoorBkGaten(INFO_8, KEUZE_3, ['Onthaalmedewerker'], { gekozen: 4, totaal: 12 });
    expect(titels).toEqual({
      cursus: 'Onthaalmedewerker · Assistent dierlijke productie · 3de jaar',
      leerplan: 'Aanvulling · Onthaalmedewerker (4 van 12 competenties) · Assistent dierlijke productie · 2de graad',
    });
    const B = cursusVoorBk({ titel: titels.cursus, auteur: 'Test', doelgroep: DG, leerplan: LB, bestanden: BESTANDEN, start: 'geraamte' });
    expect(B.chapters.map((h) => h.title)).toEqual(['Onthaalmedewerker']);
    expect(B.chapters[0].sections.map((s) => s.goalCodes)).toEqual([['BK-0390-2.09'], ['BK-0390-2.10'], ['BK-0390-2.11'], ['BK-0390-2.12']]);
    for (const s of B.chapters[0].sections) {
      expect(s.blocks.map((b) => (b.type === 'callout' ? b.title : b.type))).toEqual(['Doel in deze sectie', 'Kennis en vaardigheden uit de beroepskwalificatie']);
    }
    const na = dekkingVan([A, B], [LA, LB]);
    expect(na.rijen.filter((r) => r.doel.set === 'BK-0390-2').every((r) => r.status === 'gepland')).toBe(true);
    expect(openVerplichteDoelen(na).map((d) => d.id)).toEqual(RECREATIEF_IDS);
  });

  it('het leerplan van cursus A blijft ongewijzigd (I1)', () => {
    const voor = structuredClone(LA);
    const open = openPerSet(openVerplichteDoelen(dekkingVan([A], [LA])));
    gaten(selectieVanOpen(open, new Set(['BK-0390-2'])), { curricula: [LA] });
    expect(LA).toEqual(voor);
  });

  it('alle 25 open competenties van beide beroepskwalificaties: één leerplan met 25 doelen, per versie "alle"', () => {
    const open = openPerSet(openVerplichteDoelen(dekkingVan([], [])));
    const l = nieuwUit(gaten(selectieVanOpen(open, new Set(['BK-0390-2', 'BK-0464-1']))));
    expect(l.goals).toHaveLength(25);
    expect(l.bkVersies).toEqual([{ bk: 'BK-0390-2', sha: '75ed8f70bba4cc76', alle: true }, { bk: 'BK-0464-1', sha: '0952ac83fb3ee152', alle: true }]);
    expect(l.title).toBe('Aanvulling · Onthaalmedewerker en Recreatief medewerker · Assistent dierlijke productie · 2de graad');
    expect(l.subject).toBe('Beroepsgerichte vorming');
    expect(titelsVoorBkGaten(INFO_8, KEUZE_3, ['Onthaalmedewerker', 'Recreatief medewerker']).cursus).toBe('Aanvulling · Assistent dierlijke productie · 3de jaar');
  });
});

// ── I2: een deel blijft een deel ────────────────────────────────────────────

describe('I2: een deel blijft een deel (de valkuil van § 9.5)', () => {
  it('4 open van 12 geeft precies 4 doelen, zonder "alle"', () => {
    const l = nieuwUit(gaten(onthaal(ONTHAAL_IDS.slice(2, 6))));
    expect(l.goals).toHaveLength(4);
    expect(refIdsVan(l)).toEqual(['bkc9039003', 'bkc9039004', 'bkc9039005', 'bkc9039006']);
    expect(codesVan(l)).toEqual(['BK-0390-2.03', 'BK-0390-2.04', 'BK-0390-2.05', 'BK-0390-2.06']);
    expect(l.bkVersies).toHaveLength(1);
    expect('alle' in (l.bkVersies?.[0] ?? {})).toBe(false);
    expect(selectieVanBkLeerplan(l)).toEqual(onthaal(ONTHAAL_IDS.slice(2, 6)));
  });

  it('11 van 12 blijft een deel: 11 doelen, geen "alle", en niet het leerplan van "Bewaar als leerplan"', () => {
    const kaart = bewaarAlsLeerplan();
    if (kaart.soort !== 'nieuw') throw new Error('verwacht een nieuw leerplan');
    const l = nieuwUit(gaten(onthaal(ONTHAAL_IDS.slice(1)), { curricula: [kaart.uitkomst.leerplan] }));
    expect(l.goals).toHaveLength(11);
    expect(l.bkVersies?.[0].alle).toBeUndefined();
    expect(l.title).toBe('Aanvulling · Onthaalmedewerker (11 van 12 competenties) · Assistent dierlijke productie · 2de graad');
  });

  it('een deel van de ene en alles van de andere: per versie apart, "alle" alleen bij de volledige', () => {
    const l = nieuwUit(gaten(new Map([['BK-0390-2', ONTHAAL_IDS.slice(8)], ['BK-0464-1', RECREATIEF_IDS]])));
    expect(l.goals).toHaveLength(17);
    expect(l.bkVersies).toEqual([{ bk: 'BK-0390-2', sha: '75ed8f70bba4cc76' }, { bk: 'BK-0464-1', sha: '0952ac83fb3ee152', alle: true }]);
  });

  it('12 van 12 met "Bewaar als leerplan" op het toestel: dat leerplan, hetzelfde object (hergebruik)', () => {
    const kaart = bewaarAlsLeerplan();
    if (kaart.soort !== 'nieuw') throw new Error('verwacht een nieuw leerplan');
    const K = kaart.uitkomst.leerplan;
    expect(K.bkVersies).toEqual([{ bk: 'BK-0390-2', sha: '75ed8f70bba4cc76', alle: true }]);
    const r = gaten(onthaal(ONTHAAL_IDS), { curricula: [K] });
    expect(r.soort).toBe('hergebruik');
    if (r.soort === 'hergebruik') expect(r.leerplan).toBe(K);
  });

  it('12 van 12 zonder dat leerplan: een nieuw leerplan met "alle", dat "Bewaar als leerplan" daarna herkent', () => {
    const l = nieuwUit(gaten(onthaal(ONTHAAL_IDS)));
    expect(l.goals).toHaveLength(12);
    expect(l.bkVersies).toEqual([{ bk: 'BK-0390-2', sha: '75ed8f70bba4cc76', alle: true }]);
    expect(l.title).toBe('Aanvulling · Onthaalmedewerker · Assistent dierlijke productie · 2de graad');
    const kaart = bewaarAlsLeerplan([l]);
    expect(kaart.soort).toBe('bestaat');
    if (kaart.soort === 'bestaat') expect(kaart.leerplan).toBe(l);
    const perKaart = leerplanPerKaart({
      versies: ['BK-0390-2', 'BK-0464-1'], bestanden: BESTANDEN, curricula: [l], doelgroep: DG, merken: MERKEN, bewaard: new Map(),
    });
    expect(perKaart.get('BK-0390-2')).toBe(l);
    expect(perKaart.has('BK-0464-1')).toBe(false);
  });

  it('een leerplan met 4 van 12 wordt nooit hergebruikt voor 12 van 12, en omgekeerd', () => {
    const vier = nieuwUit(gaten(onthaal(ONTHAAL_IDS.slice(8))));
    expect(gaten(onthaal(ONTHAAL_IDS), { curricula: [vier] }).soort).toBe('nieuw');
    const alle = nieuwUit(gaten(onthaal(ONTHAAL_IDS)));
    expect(gaten(onthaal(ONTHAAL_IDS.slice(8)), { curricula: [alle] }).soort).toBe('nieuw');
  });
});

// ── Hergebruik ──────────────────────────────────────────────────────────────

describe('hergebruik: geen dubbel leerplan, nooit over een andere groep', () => {
  it('dezelfde selectie twee keer geeft de tweede keer hetzelfde leerplan (ook in een andere volgorde)', () => {
    const eerste = nieuwUit(gaten(onthaal(ONTHAAL_IDS.slice(8))));
    const tweede = gaten(onthaal([...ONTHAAL_IDS.slice(8)].reverse()), { curricula: [eerste] });
    expect(tweede.soort).toBe('hergebruik');
    if (tweede.soort === 'hergebruik') expect(tweede.leerplan).toBe(eerste);
  });

  it('een ander jaar of zonder jaar van dezelfde richting: ook hergebruik (een leerplan geldt voor de hele graad)', () => {
    const eerste = nieuwUit(gaten(onthaal(ONTHAAL_IDS.slice(8))));
    for (const keuze of [KEUZE_GRAAD, { ...KEUZE_3, jaar: 4 }]) {
      expect(gaten(onthaal(ONTHAAL_IDS.slice(8)), { keuze, curricula: [eerste] }).soort).toBe('hergebruik');
    }
  });

  it('nooit over een andere groep: het leerplan van G-0008 telt niet voor G-0002, en omgekeerd', () => {
    const INFO_2 = infoVan('G-0002');
    const keuze2: RichtingKeuze = { groep: 'G-0002', soort: 'so' };
    const van8 = nieuwUit(gaten(onthaal(ONTHAAL_IDS.slice(8))));
    const van2 = nieuwUit(gaten(onthaal(ONTHAAL_IDS.slice(8)), { info: INFO_2, keuze: keuze2, curricula: [van8] }));
    expect(van2.doelgroep?.groep).toBe('G-0002');
    expect(van2.id).not.toBe(van8.id);
    const terug = gaten(onthaal(ONTHAAL_IDS.slice(8)), { curricula: [van2] });
    expect(terug.soort).toBe('nieuw');
  });

  it('geen hergebruik van een eigen kopie, een leerplan zonder nakijkstatus of een groter leerplan', () => {
    const vier = ONTHAAL_IDS.slice(8);
    const eigen: Curriculum = { ...nagekeken(ONTHAAL, vier), kind: 'eigen' };
    const zonderStatus: Curriculum = { ...nagekeken(ONTHAAL, vier) };
    delete zonderStatus.controle;
    expect(effectieveStatus(zonderStatus)).not.toBe('gecontroleerd');
    const groter = nagekeken(ONTHAAL, ONTHAAL_IDS.slice(7));
    const r = gaten(onthaal(vier), { curricula: [eigen, zonderStatus, groter] });
    const l = nieuwUit(r);
    expect(l.goals).toHaveLength(4);
  });

  it('na een update die een gekozen tekst veranderde: een nieuw leerplan, met een titel die het onderscheidt', () => {
    const vier = ONTHAAL_IDS.slice(8);
    const oud = nieuwUit(gaten(onthaal(vier)));
    const nieuwBestand = bijgewerkt(ONTHAAL, (cs) => cs.map((c, i) => (i === 9 ? { ...c, tekst: `${c.tekst} (verbeterd)` } : c)));
    const merken = new Map([...MERKEN, ['BK-0390-2', nieuwBestand.sha256.slice(0, 16)]]);
    const l = nieuwUit(gaten(onthaal(vier), { gegevens: { bestanden: new Map([['BK-0390-2', nieuwBestand]]), merken }, curricula: [oud] }));
    expect(l.title).toBe('Aanvulling · Onthaalmedewerker (4 van 12 competenties) · Assistent dierlijke productie · 2de graad · van 14 oktober 2026');
    expect(l.bkVersies).toEqual([{ bk: 'BK-0390-2', sha: nieuwBestand.sha256.slice(0, 16) }]);
  });

  it('na een update die de gekozen competenties niet raakte (alleen een andere): hergebruik', () => {
    const vier = ONTHAAL_IDS.slice(8);
    const oud = nieuwUit(gaten(onthaal(vier)));
    const nieuwBestand = bijgewerkt(ONTHAAL, (cs) => cs.map((c, i) => (i === 0 ? { ...c, tekst: `${c.tekst} (verbeterd)` } : c)));
    const merken = new Map([...MERKEN, ['BK-0390-2', nieuwBestand.sha256.slice(0, 16)]]);
    const r = gaten(onthaal(vier), { gegevens: { bestanden: new Map([['BK-0390-2', nieuwBestand]]), merken }, curricula: [oud] });
    expect(r.soort).toBe('hergebruik');
    if (r.soort === 'hergebruik') expect(r.leerplan).toBe(oud);
  });
});

// ── F3b-B5: strikt, er valt nooit iets stil weg ─────────────────────────────

describe('F3b-B5: strikt, er valt nooit iets stil weg (veranderd)', () => {
  const vier = ONTHAAL_IDS.slice(8);

  it('een gekozen versie zonder bestand: veranderd, ook als er een passend leerplan op het toestel staat', () => {
    const bestaand = nieuwUit(gaten(onthaal(vier)));
    expect(gaten(onthaal(vier), { gegevens: { bestanden: new Map([['BK-0464-1', RECREATIEF]]), merken: MERKEN }, curricula: [bestaand] }))
      .toEqual({ soort: 'veranderd' });
  });

  it('twee gekozen versies waarvan er één geen bestand heeft: veranderd, niet stil alleen de andere', () => {
    const r = gaten(new Map([['BK-0390-2', vier], ['BK-0464-1', RECREATIEF_IDS.slice(0, 2)]]), {
      gegevens: { bestanden: new Map([['BK-0390-2', ONTHAAL]]), merken: MERKEN },
    });
    expect(r).toEqual({ soort: 'veranderd' });
  });

  it('een gekozen versie zonder versiemerk (ontbreekt, leeg of alleen spaties): veranderd, ook als er een passend leerplan staat', () => {
    const bestaand = nieuwUit(gaten(onthaal(vier)));
    for (const merk of [undefined, '', '   ']) {
      const merken = new Map(MERKEN);
      if (merk === undefined) merken.delete('BK-0390-2');
      else merken.set('BK-0390-2', merk);
      expect(gaten(onthaal(vier), { gegevens: { bestanden: BESTANDEN, merken }, curricula: [bestaand] })).toEqual({ soort: 'veranderd' });
    }
  });

  it('een gekozen code die niet (meer) in het bestand staat: veranderd, nooit een leerplan met de rest', () => {
    expect(gaten(onthaal([...vier.slice(0, 3), 'bkc9039099']))).toEqual({ soort: 'veranderd' });
    // Een competentie die na een update wegviel.
    const zonder12 = bijgewerkt(ONTHAAL, (cs) => cs.slice(0, 11));
    const merken = new Map([...MERKEN, ['BK-0390-2', zonder12.sha256.slice(0, 16)]]);
    expect(gaten(onthaal(vier), { gegevens: { bestanden: new Map([['BK-0390-2', zonder12]]), merken } })).toEqual({ soort: 'veranderd' });
  });

  it('een gekozen code die in het bestand staat maar geen tekst (meer) heeft: veranderd', () => {
    const leeg = bijgewerkt(ONTHAAL, (cs) => cs.map((c, i) => (i === 9 ? { ...c, tekst: '<p>&nbsp;</p>' } : c)));
    const merken = new Map([...MERKEN, ['BK-0390-2', leeg.sha256.slice(0, 16)]]);
    const gegevens = { bestanden: new Map([['BK-0390-2', leeg]]), merken };
    expect(gaten(onthaal(vier), { gegevens })).toEqual({ soort: 'veranderd' });
    // Zonder die competentie gaat het wel: 3 van de 11 competenties met een tekst.
    const l = nieuwUit(gaten(onthaal([vier[0], vier[2], vier[3]]), { gegevens }));
    expect(l.goals).toHaveLength(3);
    expect(l.title).toContain('(3 van 11 competenties)');
  });

  it('het bestand onder die versie hoort bij een andere versie, of komt niet door de validator: veranderd', () => {
    expect(gaten(onthaal(vier), { gegevens: { bestanden: new Map([['BK-0390-2', RECREATIEF]]), merken: MERKEN } })).toEqual({ soort: 'veranderd' });
    expect(gaten(onthaal(RECREATIEF_IDS.slice(0, 2)), { gegevens: { bestanden: new Map([['BK-0390-2', RECREATIEF]]), merken: MERKEN } }))
      .toEqual({ soort: 'veranderd' });
    const kapot = { ...structuredClone(ONTHAAL), aantal: 99 };
    expect(gaten(onthaal(vier), { gegevens: { bestanden: new Map([['BK-0390-2', kapot]]), merken: MERKEN } })).toEqual({ soort: 'veranderd' });
  });

  it('rommel in de selectie (een lege code, geen tekst, geen lijst, een lege versie): veranderd', () => {
    const rommel: ReadonlyMap<string, readonly string[]>[] = [
      onthaal([...vier, '']),
      onthaal([...vier, '  ']),
      new Map([['BK-0390-2', [...vier, 42 as unknown as string]]]),
      new Map([['BK-0390-2', 'bkc9039009' as unknown as string[]]]),
      new Map([['', vier]]),
      new Map([['BK-0390-9', vier]]),
    ];
    for (const selectie of rommel) expect(gaten(selectie)).toEqual({ soort: 'veranderd' });
    expect(leerplanVoorBkGaten({ info: INFO_8, keuze: KEUZE_3, selectie: onthaal(vier), gegevens: null as never, curricula: [], vandaag: VANDAAG }))
      .toEqual({ soort: 'veranderd' });
  });

  it('spaties rond een code en een dubbele code zijn geen probleem: dezelfde 4 doelen, en het deel telt ze één keer', () => {
    const l = nieuwUit(gaten(onthaal([` ${vier[0]} `, vier[1], vier[1], vier[2], vier[3]])));
    expect(refIdsVan(l)).toEqual(vier);
    expect(l.title).toBe('Aanvulling · Onthaalmedewerker (4 van 12 competenties) · Assistent dierlijke productie · 2de graad');
  });

  it('alle 12 met een code twee keer: nog altijd alle 12, met "alle"', () => {
    const l = nieuwUit(gaten(onthaal([...ONTHAAL_IDS, ONTHAAL_IDS[3]])));
    expect(l.goals).toHaveLength(12);
    expect(l.bkVersies).toEqual([{ bk: 'BK-0390-2', sha: '75ed8f70bba4cc76', alle: true }]);
  });

  it('een versie met een lege lijst is niet gekozen: ze heeft geen bestand nodig en komt er niet in', () => {
    const l = nieuwUit(gaten(new Map([['BK-0390-2', vier], ['BK-0464-1', []]]), {
      gegevens: { bestanden: new Map([['BK-0390-2', ONTHAAL]]), merken: new Map([['BK-0390-2', '75ed8f70bba4cc76']]) },
    }));
    expect(l.bkVersies?.map((v) => v.bk)).toEqual(['BK-0390-2']);
    expect(l.goals).toHaveLength(4);
  });

  it('zonder keuze: niets maken, met de zin van het leerplan', () => {
    expect(gaten(new Map())).toEqual({ soort: 'niet-nagekeken', waarschuwing: 'Kies minstens één competentie' });
    expect(gaten(onthaal([]))).toEqual({ soort: 'niet-nagekeken', waarschuwing: 'Kies minstens één competentie' });
  });
});

// ── Niet nagekeken ──────────────────────────────────────────────────────────

describe('niet-nagekeken: niets bewaren, met een uitleg in gewone taal', () => {
  const vier = ONTHAAL_IDS.slice(8);

  it('een versiemerk dat niet bij het bestand past (index en bestand van een andere update)', () => {
    const merken = new Map([...MERKEN, ['BK-0390-2', '0123456789abcdef']]);
    const r = gaten(onthaal(vier), { gegevens: { bestanden: BESTANDEN, merken } });
    expect(r.soort).toBe('niet-nagekeken');
    if (r.soort !== 'niet-nagekeken') return;
    expect(r.waarschuwing).toBe('De gegevens van ‘Onthaalmedewerker’ (BK-0390-2) op dit toestel horen niet bij de laatste update. Laad de pagina opnieuw en probeer nog eens');
    expect(r.waarschuwing).not.toMatch(/[.\s]$/);
    expect(r.waarschuwing).not.toMatch(CODE_OP_SCHERM);
    expect(bkNietNagekeken(r.waarschuwing)).toBe(`Het leerplan kon niet als nagekeken bewaard worden: ${r.waarschuwing}. Er is niets bewaard.`);
  });

  it('meer dan 20 beroepskwalificaties: de grens van één leerplan', () => {
    const bestanden = new Map<string, BkBestand>();
    for (let i = 1; i <= 21; i++) {
      const b = maakBk(`BK-08${String(i).padStart(2, '0')}-1`, `Beroep ${i}`, 2);
      bestanden.set(b.bk, b);
    }
    const merken = new Map([...bestanden].map(([bk, b]) => [bk, b.sha256.slice(0, 16)] as const));
    const selectie = new Map([...bestanden].map(([bk, b]) => [bk, b.competenties.map((c) => c.id)] as const));
    const r = gaten(selectie, { gegevens: { bestanden, merken } });
    expect(r.soort).toBe('niet-nagekeken');
    if (r.soort === 'niet-nagekeken') expect(r.waarschuwing).toBe('Je koos competenties uit 21 beroepskwalificaties. Eén leerplan kan hoogstens 20 beroepskwalificaties bevatten: kies er minder');
  });

  // Stap 4: `leerplanUitBk` belooft precies de selectie; hier gaat na dat `leerplanVoorBkGaten` het toch nakijkt.
  function metLeerplan(wijzig: (u: BkLeerplanUitkomst) => BkLeerplanUitkomst) {
    nep.leerplanUitBk = (...a: unknown[]) => wijzig(echteLeerplanUitBk(...(a as Parameters<typeof leerplanUitBk>)));
  }
  const nietPrecies = { soort: 'niet-nagekeken', waarschuwing: BK_GATEN_NIET_PRECIES };

  it('stap 4: een bevestigd leerplan met een competentie te veel', () => {
    metLeerplan(() => echteLeerplanUitBk([{ bestand: ONTHAAL, competenties: ONTHAAL_IDS.slice(7) }], { doelgroep: DG, merken: MERKEN }));
    expect(gaten(onthaal(vier))).toEqual(nietPrecies);
  });

  it('stap 4: "alle" bij een deel (stil alle competenties)', () => {
    metLeerplan((u) => ({ ...u, leerplan: { ...u.leerplan, bkVersies: u.leerplan.bkVersies?.map((m) => ({ ...m, alle: true as const })) } }));
    expect(gaten(onthaal(vier))).toEqual(nietPrecies);
  });

  it('stap 4: geen "alle" terwijl alle competenties gekozen zijn', () => {
    metLeerplan((u) => ({ ...u, leerplan: { ...u.leerplan, bkVersies: u.leerplan.bkVersies?.map(({ bk, sha }) => ({ bk, sha })) } }));
    expect(gaten(onthaal(ONTHAAL_IDS))).toEqual(nietPrecies);
  });

  it('stap 4: een ander versiemerk dan dat van de index', () => {
    metLeerplan((u) => ({ ...u, leerplan: { ...u.leerplan, bkVersies: u.leerplan.bkVersies?.map((m) => ({ ...m, sha: 'ffffffffffffffff' })) } }));
    expect(gaten(onthaal(vier))).toEqual(nietPrecies);
  });

  it('stap 4: een versie te veel in de lijst beroepskwalificaties van het leerplan', () => {
    metLeerplan((u) => ({ ...u, leerplan: { ...u.leerplan, bkVersies: [...(u.leerplan.bkVersies ?? []), { bk: 'BK-0464-1', sha: '0952ac83fb3ee152' }] } }));
    expect(gaten(onthaal(vier))).toEqual(nietPrecies);
  });

  it('stap 4: niet bevestigd zonder waarschuwing: toch een uitleg', () => {
    metLeerplan((u) => ({ ...u, bevestigd: false, waarschuwingen: [] }));
    expect(gaten(onthaal(vier))).toEqual(nietPrecies);
  });

  it('stap 4: een bevestigd leerplan dat precies klopt, gaat door (de schakelaar zelf verandert niets)', () => {
    metLeerplan((u) => u);
    expect(nieuwUit(gaten(onthaal(vier))).goals).toHaveLength(4);
  });
});

// ── Index en bestand van een andere update (tweede ronde, punt 1) ───────────
// Het versiemerk van de index (N) en het bestand in het geheugen (O) horen bij een andere update, bv. een verouderde kopie
// uit de service worker. Dan nooit hergebruik: de cursus zou het geraamte (kennis en vaardigheden) uit het ene bestand
// bouwen en de doeltekst uit het andere. Dezelfde invoer geeft dezelfde uitkomst, wat er ook op het toestel staat.

describe('index en bestand van een andere update: altijd niet-nagekeken, ook met een passend leerplan op het toestel', () => {
  const vier = ONTHAAL_IDS.slice(8);
  // Een update die de gekozen competenties niet raakte (alleen de eerste tekst): het merk van de index is dat van `nieuw`.
  const nieuw = bijgewerkt(ONTHAAL, (cs) => cs.map((c, i) => (i === 0 ? { ...c, tekst: `${c.tekst} (verbeterd)` } : c)));
  const N = nieuw.sha256.slice(0, 16);
  const O = ONTHAAL.sha256.slice(0, 16);
  const merkenN = new Map([...MERKEN, ['BK-0390-2', N]]);
  /** Index met merk N, maar in het geheugen het oude bestand (merk O). */
  const oudBestand = { bestanden: new Map([['BK-0390-2', ONTHAAL]]), merken: merkenN };
  const zin = 'De gegevens van ‘Onthaalmedewerker’ (BK-0390-2) op dit toestel horen niet bij de laatste update. Laad de pagina opnieuw en probeer nog eens';
  const andereUpdate = { soort: 'niet-nagekeken', waarschuwing: zin };

  it('vertrekpunt: N en O verschillen, en met de juiste bestanden is het leerplan met merk N wél hergebruik', () => {
    expect(N).not.toBe(O);
    expect(O).toBe('75ed8f70bba4cc76');
    const metN = nagekeken(nieuw, vier, merkenN);
    expect(metN.bkVersies).toEqual([{ bk: 'BK-0390-2', sha: N }]);
    const r = gaten(onthaal(vier), { gegevens: { bestanden: new Map([['BK-0390-2', nieuw]]), merken: merkenN }, curricula: [metN] });
    expect(r.soort).toBe('hergebruik');
  });

  it('de proef van de controleur: met of zonder leerplan met merk N en dezelfde selectie, dezelfde uitkomst en dezelfde zin', () => {
    const metN = nagekeken(nieuw, vier, merkenN);
    const zonder = gaten(onthaal(vier), { gegevens: oudBestand });
    const met = gaten(onthaal(vier), { gegevens: oudBestand, curricula: [metN] });
    expect(zonder).toEqual(andereUpdate);
    expect(met).toEqual(zonder);
    // Dezelfde zin als `leerplanUitBk` zelf geeft (zonder punt), en zonder code op het scherm.
    const echt = echteLeerplanUitBk([{ bestand: ONTHAAL, competenties: vier }], { doelgroep: DG, merken: merkenN });
    expect(echt.bevestigd).toBe(false);
    expect(echt.waarschuwingen[0]).toBe(`${zin}.`);
    expect(zin).not.toMatch(CODE_OP_SCHERM);
  });

  it('ook een leerplan met het merk van het oude bestand (O) en alle 12 van 12 met "Bewaar als leerplan": geen hergebruik', () => {
    const metO = nagekeken(ONTHAAL, vier);
    expect(gaten(onthaal(vier), { gegevens: oudBestand, curricula: [metO] })).toEqual(andereUpdate);
    const kaart = bewaarAlsLeerplan();
    if (kaart.soort !== 'nieuw') throw new Error('verwacht een nieuw leerplan');
    expect(gaten(onthaal(ONTHAAL_IDS), { gegevens: oudBestand, curricula: [kaart.uitkomst.leerplan] })).toEqual(andereUpdate);
  });

  it('omgekeerd: het nieuwe bestand in het geheugen en een oude index (merk O), met een leerplan met merk O', () => {
    const metO = nagekeken(ONTHAAL, vier);
    const r = gaten(onthaal(vier), { gegevens: { bestanden: new Map([['BK-0390-2', nieuw]]), merken: MERKEN }, curricula: [metO] });
    expect(r).toEqual(andereUpdate);
  });

  it('twee versies, alleen de tweede van een andere update: de zin noemt die tweede, ook met een passend leerplan', () => {
    const recreatiefNieuw = bijgewerkt(RECREATIEF, (cs) => cs.map((c, i) => (i === 0 ? { ...c, tekst: `${c.tekst} (verbeterd)` } : c)));
    const merken = new Map([...MERKEN, ['BK-0464-1', recreatiefNieuw.sha256.slice(0, 16)]]);
    const selectie = new Map([['BK-0390-2', vier], ['BK-0464-1', RECREATIEF_IDS]]);
    const u = echteLeerplanUitBk([{ bestand: ONTHAAL, competenties: vier }, { bestand: recreatiefNieuw, competenties: RECREATIEF_IDS }], { doelgroep: DG, merken });
    expect(u.bevestigd, u.waarschuwingen.join(' | ')).toBe(true);
    // Met de juiste bestanden: hergebruik. Met het oude bestand van Recreatief medewerker: niet-nagekeken.
    expect(gaten(selectie, { gegevens: { bestanden: new Map([['BK-0390-2', ONTHAAL], ['BK-0464-1', recreatiefNieuw]]), merken }, curricula: [u.leerplan] }).soort)
      .toBe('hergebruik');
    expect(gaten(selectie, { gegevens: { bestanden: BESTANDEN, merken }, curricula: [u.leerplan] })).toEqual({
      soort: 'niet-nagekeken',
      waarschuwing: 'De gegevens van ‘Recreatief medewerker’ (BK-0464-1) op dit toestel horen niet bij de laatste update. Laad de pagina opnieuw en probeer nog eens',
    });
  });

  it('een andere update bij de ene versie en geen bestand bij de andere: veranderd gaat voor', () => {
    const r = gaten(new Map([['BK-0390-2', vier], ['BK-0464-1', RECREATIEF_IDS.slice(0, 2)]]), {
      gegevens: { bestanden: new Map([['BK-0390-2', ONTHAAL]]), merken: merkenN },
    });
    expect(r).toEqual({ soort: 'veranderd' });
  });

  it('liever niets dan een leerplan: ook als `leerplanUitBk` het toch zou bevestigen (met of zonder zin), niet-nagekeken', () => {
    const metL = nagekeken(nieuw, vier, merkenN);
    for (const waarschuwingen of [[], ['Een zin die niet blokkeert.']]) {
      nep.leerplanUitBk = (...a: unknown[]) => ({ ...echteLeerplanUitBk(...(a as Parameters<typeof leerplanUitBk>)), bevestigd: true, waarschuwingen });
      expect(gaten(onthaal(vier), { gegevens: oudBestand, curricula: [metL] })).toEqual({ soort: 'niet-nagekeken', waarschuwing: BK_GATEN_NIET_PRECIES });
    }
  });
});

// ── Waarschuwingen die niet blokkeren (tweede ronde, punt 2) ────────────────
// De Vlaamse overheid geeft een kwalificatie niet meer (`nietMeerInBron` in het bestand). `leerplanUitBk` bevestigt het
// leerplan dan wel, met een waarschuwing. Die gaat mee in `waarschuwingen`, bij `nieuw` én bij `hergebruik`, zodat het
// venster ze kan tonen (zoals `leerplanVoorKeuze` in BkKeuze ze teruggeeft).

describe('een waarschuwing die niet blokkeert, gaat niet verloren (nieuw en hergebruik)', () => {
  const vier = ONTHAAL_IDS.slice(8);
  const nietMeer = (b: BkBestand, sinds: string): BkBestand => {
    const uit: BkBestand = { ...structuredClone(b), nietMeerInBron: sinds };
    expect(valideerBkBestand(uit, b.bk)).toEqual([]);
    return uit;
  };
  const onthaalWeg = nietMeer(ONTHAAL, '2026-09-01');
  const recreatiefWeg = nietMeer(RECREATIEF, '2026-09-15');
  const zinOnthaal = 'De Vlaamse overheid geeft ‘Onthaalmedewerker’ (BK-0390-2) niet meer. Het leerplan gebruikt de laatst bekende competenties.';
  const zinRecreatief = 'De Vlaamse overheid geeft ‘Recreatief medewerker’ (BK-0464-1) niet meer. Het leerplan gebruikt de laatst bekende competenties.';
  const gegevens = { bestanden: new Map([['BK-0390-2', onthaalWeg], ['BK-0464-1', RECREATIEF]]), merken: MERKEN };

  function waarschuwingenVan(r: BkGatenLeerplan): readonly string[] | undefined {
    if (r.soort !== 'nieuw' && r.soort !== 'hergebruik') throw new Error(`verwacht nieuw of hergebruik, niet ${r.soort}`);
    return r.waarschuwingen;
  }

  it('nieuw: het leerplan is nagekeken, en de zin van `leerplanUitBk` komt letterlijk mee', () => {
    const r = gaten(onthaal(vier), { gegevens });
    const l = nieuwUit(r);
    expect(effectieveStatus(l)).toBe('gecontroleerd');
    expect(waarschuwingenVan(r)).toEqual([zinOnthaal]);
    expect(echteLeerplanUitBk([{ bestand: onthaalWeg, competenties: vier }], { doelgroep: DG, merken: MERKEN }).waarschuwingen).toEqual([zinOnthaal]);
    expect(zinOnthaal).not.toMatch(CODE_OP_SCHERM);
  });

  it('hergebruik: dezelfde zin, ook voor een leerplan dat gemaakt werd toen de kwalificatie nog gegeven werd', () => {
    const l = nieuwUit(gaten(onthaal(vier), { gegevens }));
    const r = gaten(onthaal(vier), { gegevens, curricula: [l] });
    expect(r.soort).toBe('hergebruik');
    if (r.soort === 'hergebruik') expect(r.leerplan).toBe(l);
    expect(waarschuwingenVan(r)).toEqual([zinOnthaal]);
    const vroeger = nagekeken(ONTHAAL, vier);
    const r2 = gaten(onthaal(vier), { gegevens, curricula: [vroeger] });
    expect(r2.soort).toBe('hergebruik');
    if (r2.soort === 'hergebruik') expect(r2.leerplan).toBe(vroeger);
    expect(waarschuwingenVan(r2)).toEqual([zinOnthaal]);
  });

  it('twee versies die niet meer gegeven worden: één zin per versie, in de volgorde van de keuze, gelijk bij nieuw en hergebruik', () => {
    const beide = { bestanden: new Map([['BK-0390-2', onthaalWeg], ['BK-0464-1', recreatiefWeg]]), merken: MERKEN };
    const selectie = new Map([['BK-0464-1', RECREATIEF_IDS.slice(0, 3)], ['BK-0390-2', vier]]);
    const eerst = gaten(selectie, { gegevens: beide });
    expect(eerst.soort).toBe('nieuw');
    expect(waarschuwingenVan(eerst)).toEqual([zinRecreatief, zinOnthaal]);
    const l = nieuwUit(eerst);
    const daarna = gaten(selectie, { gegevens: beide, curricula: [l] });
    expect(daarna.soort).toBe('hergebruik');
    expect(waarschuwingenVan(daarna)).toEqual(waarschuwingenVan(eerst));
  });

  it('alleen de versies van de keuze tellen: een andere versie die niet meer gegeven wordt, geeft geen zin', () => {
    const anders = { bestanden: new Map([['BK-0390-2', ONTHAAL], ['BK-0464-1', recreatiefWeg]]), merken: MERKEN };
    const r = gaten(onthaal(vier), { gegevens: anders });
    expect(waarschuwingenVan(r)).toEqual([]);
    expect(waarschuwingenVan(gaten(onthaal(vier), { gegevens: anders, curricula: [nieuwUit(r)] }))).toEqual([]);
  });

  it('zonder "niet meer": een lege lijst bij nieuw en bij hergebruik', () => {
    const r = gaten(onthaal(vier));
    expect(waarschuwingenVan(r)).toEqual([]);
    expect(waarschuwingenVan(gaten(onthaal(vier), { curricula: [nieuwUit(r)] }))).toEqual([]);
  });

  it('de lijst is van de uitkomst zelf: ze aanpassen verandert een volgende uitkomst niet', () => {
    const eerst = gaten(onthaal(vier), { gegevens });
    const lijst = waarschuwingenVan(eerst) as string[];
    lijst.push('iets anders');
    expect(waarschuwingenVan(gaten(onthaal(vier), { gegevens }))).toEqual([zinOnthaal]);
  });
});

// ── I1: niets verandert stil ────────────────────────────────────────────────

describe('I1: niets verandert stil', () => {
  const vier = ONTHAAL_IDS.slice(8);

  it('de invoer blijft ongewijzigd, ook bevroren (nieuw, hergebruik en veranderd)', () => {
    const bestaand = diepBevroren(nieuwUit(gaten(onthaal(vier))));
    const bestanden = new Map([['BK-0390-2', diepBevroren(structuredClone(ONTHAAL))], ['BK-0464-1', diepBevroren(structuredClone(RECREATIEF))]]);
    const merken = new Map(MERKEN);
    const curricula = diepBevroren([bestaand]);
    const selecties = [onthaal(vier), onthaal(ONTHAAL_IDS), onthaal([...vier, 'bkc9039099'])];
    const foto = JSON.stringify({ c: curricula, b: [...bestanden], m: [...merken], s: selecties.map((s) => [...s]) });
    const soorten = selecties.map((selectie) => gaten(selectie, { gegevens: { bestanden, merken }, curricula }).soort);
    expect(soorten).toEqual(['hergebruik', 'nieuw', 'veranderd']);
    expect(JSON.stringify({ c: curricula, b: [...bestanden], m: [...merken], s: selecties.map((s) => [...s]) })).toBe(foto);
  });

  it('een nieuw leerplan staat nog niet op het toestel: het venster bewaart het (of niet)', () => {
    const curricula = [nagekeken(ONTHAAL, ONTHAAL_IDS.slice(0, 8))];
    const l = nieuwUit(gaten(onthaal(vier), { curricula }));
    expect(curricula).toHaveLength(1);
    expect(curricula.some((c) => c.id === l.id)).toBe(false);
  });

  it('de module bewaart niets en vraagt niets op: geen opslag, geen netwerk, geen bewaarfunctie', () => {
    const bron = readFileSync(join(HIER, 'bkGatenHulp.ts'), 'utf8');
    const code = bron.split('\n').filter((r) => !r.trim().startsWith('//') && !r.trim().startsWith('*') && !r.trim().startsWith('/**')).join('\n');
    const imports = [...code.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const pad of imports) expect(pad).not.toMatch(/courses|\/curriculum$|storage|idb|Bron$|classes|React|react/);
    expect(code).not.toMatch(/localStorage|indexedDB|fetch\(|save[A-Z]|bewaar[A-Z]/);
  });
});

// ── De titels ───────────────────────────────────────────────────────────────

describe('titelsVoorBkGaten', () => {
  it('één beroepskwalificatie: de titel als vak van de cursus, met het jaar; het leerplan met "Aanvulling" en het deel', () => {
    expect(titelsVoorBkGaten(INFO_8, KEUZE_3, ['Onthaalmedewerker'], { gekozen: 4, totaal: 12 })).toEqual({
      cursus: 'Onthaalmedewerker · Assistent dierlijke productie · 3de jaar',
      leerplan: 'Aanvulling · Onthaalmedewerker (4 van 12 competenties) · Assistent dierlijke productie · 2de graad',
    });
    expect(titelsVoorBkGaten(INFO_8, KEUZE_GRAAD, ['Onthaalmedewerker'], { gekozen: 1, totaal: 12 })).toEqual({
      cursus: 'Onthaalmedewerker · Assistent dierlijke productie · 2de graad',
      leerplan: 'Aanvulling · Onthaalmedewerker (1 van 12 competenties) · Assistent dierlijke productie · 2de graad',
    });
  });

  it('alle competenties: geen deel in de titel', () => {
    expect(titelsVoorBkGaten(INFO_8, KEUZE_3, ['Onthaalmedewerker'], { gekozen: 12, totaal: 12 }).leerplan)
      .toBe('Aanvulling · Onthaalmedewerker · Assistent dierlijke productie · 2de graad');
  });

  it('meer beroepskwalificaties: "Aanvulling" als vak; het leerplan noemt ze allemaal', () => {
    expect(titelsVoorBkGaten(INFO_8, KEUZE_3, ['Onthaalmedewerker', 'Recreatief medewerker'])).toEqual({
      cursus: 'Aanvulling · Assistent dierlijke productie · 3de jaar',
      leerplan: 'Aanvulling · Onthaalmedewerker en Recreatief medewerker · Assistent dierlijke productie · 2de graad',
    });
  });

  it('zonder titel: "Aanvulling" als vak, nooit een leeg vak', () => {
    expect(titelsVoorBkGaten(INFO_8, KEUZE_3, []).cursus).toBe('Aanvulling · Assistent dierlijke productie · 3de jaar');
    expect(titelsVoorBkGaten(INFO_8, KEUZE_3, ['   ']).cursus).toBe('Aanvulling · Assistent dierlijke productie · 3de jaar');
    expect(titelsVoorBkGaten(INFO_8, KEUZE_3, ['  Onthaalmedewerker  ']).cursus).toBe('Onthaalmedewerker · Assistent dierlijke productie · 3de jaar');
  });

  it('het leerplan is precies "Aanvulling · " + titelVoorBkLeerplan zolang dat past', () => {
    const gevallen: [string[], { gekozen: number; totaal: number } | undefined][] = [
      [['Onthaalmedewerker'], { gekozen: 4, totaal: 12 }],
      [['Onthaalmedewerker'], undefined],
      [['Onthaalmedewerker', 'Recreatief medewerker'], undefined],
      [['Recreatief medewerker'], { gekozen: 0, totaal: 13 }],
    ];
    for (const [titels, deel] of gevallen) {
      expect(titelsVoorBkGaten(INFO_8, KEUZE_3, titels, deel).leerplan).toBe(`Aanvulling · ${titelVoorBkLeerplan(INFO_8, titels, deel)}`);
    }
  });

  it('te lang: hoogstens 120 tekens; "Aanvulling", het deel en de graad blijven staan', () => {
    const lang = `Medewerker ${'zeer lange omschrijving '.repeat(8).trim()}`;
    const t = titelsVoorBkGaten(INFO_8, KEUZE_3, [lang], { gekozen: 4, totaal: 12 });
    expect(t.leerplan.length).toBeLessThanOrEqual(120);
    expect(t.leerplan).toMatch(/^Aanvulling · Medewerker zeer.*… \(4 van 12 competenties\) · Assistent dierlijke productie · 2de graad$/);
    expect(t.cursus.length).toBeLessThanOrEqual(120);
    expect(t.cursus).toMatch(/^Medewerker zeer /);
  });

  it('een lange richting van het buitengewoon onderwijs: "buitengewoon" en het deel blijven staan', () => {
    const info: RichtingInfo = { ...INFO_8, soort: 'buso', groep: { ...INFO_8.groep, titel: `Richting ${'met een heel lange naam '.repeat(7).trim()}` } };
    const t = titelsVoorBkGaten(info, KEUZE_3, ['Onthaalmedewerker'], { gekozen: 4, totaal: 12 }).leerplan;
    expect(t.length).toBeLessThanOrEqual(120);
    expect(t).toMatch(/^Aanvulling · Onthaalmedewerker \(4 van 12 competenties\) · Richting met.*… · 2de graad · buitengewoon$/);
  });

  it('nooit een competentiecode, ADV-nummer, groepnummer of set-id (I7)', () => {
    for (const titels of [['Onthaalmedewerker'], ['Onthaalmedewerker', 'Recreatief medewerker'], []]) {
      const t = titelsVoorBkGaten(INFO_8, KEUZE_3, titels, { gekozen: 4, totaal: 12 });
      expect(t.cursus).not.toMatch(CODE_OP_SCHERM);
      expect(t.leerplan).not.toMatch(CODE_OP_SCHERM);
    }
  });
});

describe('de titel van een nieuw leerplan is uniek op het toestel', () => {
  const vier = ONTHAAL_IDS.slice(8);
  const basis = 'Aanvulling · Onthaalmedewerker (4 van 12 competenties) · Assistent dierlijke productie · 2de graad';
  /** Een leerplan met die titel dat niet hergebruikt kan worden (een andere keuze). */
  const metTitel = (titel: string) => nagekeken(ONTHAAL, ONTHAAL_IDS.slice(0, 2), MERKEN, DG, titel);

  it('bestaat de titel al (hoofdletters en witruimte tellen niet), dan komt de dag erachter, en daarna een nummer', () => {
    const een = nieuwUit(gaten(onthaal(vier), { curricula: [metTitel(`  ${basis.toUpperCase().replace(/ · /g, '  ·  ')} `)] }));
    expect(een.title).toBe(`${basis} · van 14 oktober 2026`);
    const twee = nieuwUit(gaten(onthaal(vier), { curricula: [metTitel(basis), metTitel(`${basis} · van 14 oktober 2026`)] }));
    // 98 + 22 + 4 = 124 tekens: het langste stuk dat mag (de richting, 29 tekens) wordt 4 tekens korter.
    expect(basis.length).toBe(98);
    expect(twee.title).toBe('Aanvulling · Onthaalmedewerker (4 van 12 competenties) · Assistent dierlijke prod… · 2de graad · van 14 oktober 2026 (2)');
    expect(twee.title.length).toBe(120);
  });

  it('zonder geldige dag: "nieuw" als onderscheidend stuk', () => {
    expect(nieuwUit(gaten(onthaal(vier), { curricula: [metTitel(basis)], vandaag: 'gisteren' })).title).toBe(`${basis} · nieuw`);
  });

  it('het onderscheidende stuk wordt nooit ingekort, ook niet als het het langste stuk is', () => {
    // Met de hand: "Beroep met 20 tekens" en "Richting met 20 tkns" zijn elk 20 tekens, "van 30 september 2026" 21.
    const bestand = bijgewerkt(ONTHAAL, (cs) => cs);
    bestand.titel = 'Beroep met 20 tekens';
    bestand.sha256 = sha256Hex(`${ONTHAAL.sha256}|kort`);
    expect(valideerBkBestand(bestand, 'BK-0390-2')).toEqual([]);
    const gegevens = { bestanden: new Map([['BK-0390-2', bestand]]), merken: new Map([['BK-0390-2', bestand.sha256.slice(0, 16)]]) };
    const info: RichtingInfo = { ...INFO_8, soort: 'buso', groep: { ...INFO_8.groep, titel: 'Richting met 20 tkns' } };
    const basis2 = 'Aanvulling · Beroep met 20 tekens (4 van 12 competenties) · Richting met 20 tkns · 2de graad · buitengewoon';
    expect(basis2.length).toBe(107);
    const plan = (curricula: Curriculum[]) => nieuwUit(gaten(onthaal(vier), { info, gegevens, curricula, vandaag: '2026-09-30' }));
    const andere = (titel: string) => nagekeken(bestand, ONTHAAL_IDS.slice(0, 2), gegevens.merken, DG, titel);
    expect(plan([]).title).toBe(basis2);
    // 107 + 24 = 131: de naam (het eerste van de twee langste stukken) wordt 11 tekens korter.
    const eerste = plan([andere(basis2)]).title;
    expect(eerste).toBe('Aanvulling · Beroep m… (4 van 12 competenties) · Richting met 20 tkns · 2de graad · buitengewoon · van 30 september 2026');
    expect(eerste.length).toBe(120);
    // 107 + 28 = 135: "van 30 september 2026 (2)" (25) is nu het langste stuk, maar blijft staan; de naam wordt 15 tekens korter.
    const tweede = plan([andere(basis2), andere(eerste)]).title;
    expect(tweede).toBe('Aanvulling · Bero… (4 van 12 competenties) · Richting met 20 tkns · 2de graad · buitengewoon · van 30 september 2026 (2)');
    expect(tweede.length).toBe(120);
  });

  it('lang én al op het toestel: hoogstens 120 tekens, met "Aanvulling", het deel en de dag', () => {
    const langeTitel = `Medewerker ${'zeer lange omschrijving '.repeat(8).trim()}`;
    const lang = bijgewerkt(ONTHAAL, (cs) => cs);
    lang.titel = langeTitel;
    const sha = sha256Hex(`${lang.sha256}|titel`);
    lang.sha256 = sha;
    expect(valideerBkBestand(lang, 'BK-0390-2')).toEqual([]);
    const gegevens = { bestanden: new Map([['BK-0390-2', lang]]), merken: new Map([['BK-0390-2', sha.slice(0, 16)]]) };
    const eerste = nieuwUit(gaten(onthaal(vier), { gegevens }));
    expect(eerste.title.length).toBeLessThanOrEqual(120);
    expect(eerste.title).toMatch(/^Aanvulling · Medewerker .*… \(4 van 12 competenties\) · Assistent dierlijke productie · 2de graad$/);
    // Een tweede met die titel (een andere keuze): de dag blijft staan, net als "Aanvulling" en het deel.
    const anders = nagekeken(lang, ONTHAAL_IDS.slice(0, 2), gegevens.merken, DG, eerste.title);
    const tweede = nieuwUit(gaten(onthaal(vier), { gegevens, curricula: [anders] }));
    expect(tweede.title.length).toBeLessThanOrEqual(120);
    expect(tweede.title).toMatch(/^Aanvulling · Medewerker .*… \(4 van 12 competenties\) · Assistent dierlijke productie · 2de graad · van 14 oktober 2026$/);
    expect(tweede.title).not.toBe(eerste.title);
    const derde = nieuwUit(gaten(onthaal(vier), { gegevens, curricula: [anders, { ...anders, id: 'x', title: tweede.title }] }));
    expect(derde.title).toMatch(/ · van 14 oktober 2026 \(2\)$/);
    expect(derde.title.length).toBeLessThanOrEqual(120);
    for (const t of [eerste.title, tweede.title, derde.title]) expect(t).not.toMatch(CODE_OP_SCHERM);
  });
});
