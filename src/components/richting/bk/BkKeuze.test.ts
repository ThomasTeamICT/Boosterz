import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BK_BRON, splitsBk, valideerBkBestand, type BkBestand, type Competentie } from '../../../lib/beroepskwalificaties';
import { FOUT_BK, wisBkCache } from '../../../lib/beroepskwalificatiesBron';
import { cursusVoorBk as cursusVoorBkBron } from '../../../lib/bkCursus';
import { tekstVanCompetentie } from '../../../lib/bkLeerplan';
import { BK_VENSTER_FOUT } from '../../../lib/bkWeergave';
import type { Curriculum } from '../../../lib/curriculumTypes';
import { aantalCompetentiesMetTekst } from '../../../lib/dekkingBk';
import type { Doelgroep } from '../../../lib/doelgroep';
import { effectieveStatus } from '../../../lib/leerplanStatus';
import { doelgroepVan, richtingInfo, type RichtingInfo } from '../../../lib/richtingKader';
import { sha256Hex } from '../../../lib/sha256';
import type { MatrixBestand } from '../../../lib/studierichtingen';
import {
  bkVersiesVan,
  competentieIds,
  competentieRijen,
  cursusVoorBk,
  laadBkGegevens,
  leerplanVoorKeuze,
  type BkGegevens,
} from './BkKeuze';

// ── Fixtures ────────────────────────────────────────────────────────────────

const FIXTURES = join(fileURLToPath(new URL('.', import.meta.url)), '../../../../tests/fixtures');
const lees = (pad: string): unknown => JSON.parse(readFileSync(join(FIXTURES, pad), 'utf8'));

const VANDAAG = '2026-10-10';
const MATRIX = lees('structuur/uit/studierichtingen.json') as MatrixBestand;
const ONTHAAL = lees('kwalificaties/uit/bk/BK-0390-2.json') as BkBestand;
const RECREATIEF = lees('kwalificaties/uit/bk/BK-0464-1.json') as BkBestand;
const NAGEBOOTST_1 = lees('kwalificaties/uit/bk/BK-9999-1.json') as BkBestand;

const INFO: RichtingInfo = (() => {
  const i = richtingInfo(MATRIX, 'G-0008', VANDAAG);
  if (!i) throw new Error('G-0008 ontbreekt in de structuurfixtures');
  return i;
})();
const DG: Doelgroep = doelgroepVan(INFO, { groep: 'G-0008', soort: 'so', jaar: 3 });

const ids = (b: BkBestand) => b.competenties.map((c) => c.id);

/** Een eigen BK-bestand dat door de validator komt; `teksten` zet de tekst van die plaatsen (0-based). */
function maakBk(bk: string, titel: string, aantal: number, teksten: Record<number, string> = {}): BkBestand {
  const delen = splitsBk(bk) as { nummer: string; versie: number };
  const competenties: Competentie[] = [];
  for (let i = 0; i < aantal; i++) {
    competenties.push({
      id: `bkc9${delen.nummer.slice(3)}${String(i + 1).padStart(4, '0')}`,
      nr: i + 1,
      type: 'Vakspecifieke competentie',
      tekst: teksten[i] ?? `Competentie ${i + 1} van ${titel}`,
      kennis: [],
      vaardigheden: [],
    });
  }
  const b: BkBestand = {
    app: 'boosterz', kind: 'beroepskwalificatie', v: 1, bk, nummer: delen.nummer, versie: delen.versie, titel, status: 'ERKEND',
    bron: BK_BRON, api: `https://onderwijs.api.vlaanderen.be/kwalificaties-en-curriculum/beroepskwalificaties/v2/beroepskwalificatie/${bk}`,
    naamsvermelding: 'Bron: test', licentie: 'nog te bevestigen', opgehaald: '2026-10-10T00:00:00Z', aantal,
    sha256: sha256Hex(`${bk}|${titel}|${JSON.stringify(competenties)}`), competenties,
  };
  const fouten = valideerBkBestand(b, bk);
  if (fouten.length > 0) throw new Error(`maakBk: ${fouten.join(' ')}`);
  return b;
}

function gegevensVan(...bestanden: BkBestand[]): BkGegevens {
  return {
    bestanden: new Map(bestanden.map((b) => [b.bk, b] as const)),
    merken: new Map(bestanden.map((b) => [b.bk, b.sha256.slice(0, 16)] as const)),
    ontbreekt: [],
  };
}

/** Een gesaneerd leerplan dat voor het venster klaarligt, zoals het uit de opslag zou komen. */
function leerplanMet(selectie: Map<string, string[]>, bestanden: BkBestand[], extra: { vak?: string; curricula?: Curriculum[] } = {}): Curriculum {
  const u = leerplanVoorKeuze({ info: INFO, doelgroep: DG, vak: extra.vak, selectie, gegevens: gegevensVan(...bestanden), curricula: extra.curricula ?? [] });
  if (u.soort !== 'nieuw') throw new Error(`verwacht een nieuw leerplan, kreeg ${u.soort}`);
  return u.leerplan;
}

// ── Wat er te kiezen valt ───────────────────────────────────────────────────

describe('competentieRijen en competentieIds', () => {
  it('geven de competenties in de volgorde van het bestand, met hun tekst zoals ze in het leerplan staat', () => {
    for (const b of [ONTHAAL, RECREATIEF, NAGEBOOTST_1]) {
      expect(competentieIds(b)).toEqual(ids(b));
      competentieRijen(b).forEach((r, i) => expect(r.tekst).toBe(tekstVanCompetentie(b.competenties[i])));
    }
  });

  it('het aantal op het scherm (aantalCompetentiesMetTekst) is het aantal rijen', () => {
    expect(competentieRijen(ONTHAAL)).toHaveLength(12);
    expect(competentieRijen(RECREATIEF)).toHaveLength(13);
    for (const b of [ONTHAAL, RECREATIEF, NAGEBOOTST_1]) expect(competentieRijen(b)).toHaveLength(aantalCompetentiesMetTekst(b));
  });

  it('een competentie zonder tekst staat er niet in, en het getal telt haar niet mee', () => {
    const b = maakBk('BK-0556-1', 'Half leeg beroep', 4, { 1: '<p>&nbsp;</p>', 3: '<p></p>' });
    expect(competentieRijen(b)).toHaveLength(2);
    expect(competentieIds(b)).toEqual([b.competenties[0].id, b.competenties[2].id]);
    expect(aantalCompetentiesMetTekst(b)).toBe(2);
    expect(b.aantal).toBe(4);
  });

  it('geeft dezelfde lijst terug bij een tweede oproep (één keer per bestand berekend)', () => {
    expect(competentieRijen(ONTHAAL)).toBe(competentieRijen(ONTHAAL));
  });
});

// ── Laden ───────────────────────────────────────────────────────────────────

describe('laadBkGegevens', () => {
  function antwoord(body: unknown, status = 200) {
    return {
      ok: status >= 200 && status < 300, status,
      headers: { get: (naam: string) => (naam.toLowerCase() === 'content-type' ? 'application/json' : null) },
      json: async () => structuredClone(body),
    } as unknown as Response;
  }

  /** Serveert de fixtures van `kwalificaties/uit`; een bestand dat er niet is, geeft 404. */
  function stubFixtures(opties: { kapot?: boolean } = {}) {
    const verzoeken: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      const url = String(input);
      verzoeken.push(url);
      if (opties.kapot) throw new TypeError('Failed to fetch');
      const pad = url.split('/leerplannen/kwalificaties/')[1] ?? '';
      try {
        return antwoord(lees(`kwalificaties/uit/${pad}`));
      } catch {
        return antwoord({}, 404);
      }
    }));
    return verzoeken;
  }

  beforeEach(() => { wisBkCache(); });
  afterEach(() => { vi.unstubAllGlobals(); wisBkCache(); });

  it('haalt de bestanden en de versiemerken van de index op', async () => {
    stubFixtures();
    const g = await laadBkGegevens(['BK-0390-2', 'BK-0464-1']);
    expect([...g.bestanden.keys()]).toEqual(['BK-0390-2', 'BK-0464-1']);
    expect(g.bestanden.get('BK-0390-2')?.titel).toBe('Onthaalmedewerker');
    expect(g.ontbreekt).toEqual([]);
    expect(g.merken.get('BK-0390-2')).toBe(ONTHAAL.sha256.slice(0, 16));
    expect(g.merken.get('BK-0464-1')).toBe(RECREATIEF.sha256.slice(0, 16));
    for (const merk of g.merken.values()) expect(merk).toMatch(/^[0-9a-f]{16}$/);
  });

  it('een bestand dat er niet is staat in `ontbreekt`, de rest laadt gewoon', async () => {
    stubFixtures();
    const g = await laadBkGegevens(['BK-0390-2', 'BK-9999-3']);
    expect([...g.bestanden.keys()]).toEqual(['BK-0390-2']);
    expect(g.ontbreekt).toEqual(['BK-9999-3']);
  });

  it('zonder merken vraagt ze de index niet op', async () => {
    const verzoeken = stubFixtures();
    const g = await laadBkGegevens(['BK-0390-2'], false);
    expect(g.merken.size).toBe(0);
    expect(verzoeken.some((u) => u.endsWith('/index.json'))).toBe(false);
  });

  it('dezelfde versie twee keer vragen haalt haar één keer op', async () => {
    const verzoeken = stubFixtures();
    const g = await laadBkGegevens(['BK-0390-2', 'BK-0390-2'], false);
    expect(g.bestanden.size).toBe(1);
    expect(verzoeken.filter((u) => u.endsWith('/bk/BK-0390-2.json'))).toHaveLength(1);
  });

  it('een laadfout gooit (het venster bewaart dan niets)', async () => {
    stubFixtures({ kapot: true });
    await expect(laadBkGegevens(['BK-0390-2'])).rejects.toThrow(FOUT_BK);
  });

  it('een ongeldige versie gooit zonder verzoek', async () => {
    const verzoeken = stubFixtures();
    await expect(laadBkGegevens(['../../etc/passwd'], false)).rejects.toThrow();
    expect(verzoeken).toEqual([]);
  });
});

// ── Van een keuze naar een leerplan ─────────────────────────────────────────

describe('leerplanVoorKeuze', () => {
  const kies = (b: BkBestand, van: number, tot: number) => b.competenties.slice(van, tot).map((c) => c.id);

  it('4 van 12 competenties geeft precies 4 doelen (de valkuil van § 9.5), nagekeken', () => {
    const gekozen = kies(ONTHAAL, 2, 6);
    const l = leerplanMet(new Map([['BK-0390-2', gekozen]]), [ONTHAAL]);
    expect(l.goals).toHaveLength(4);
    expect(l.goals.map((g) => g.bkRefs?.[0].id)).toEqual(gekozen);
    expect(effectieveStatus(l)).toBe('gecontroleerd');
    expect(l.bkVersies?.[0].alle).toBeUndefined();
    expect(l.title).toContain('(4 van 12 competenties)');
  });

  it('één competentie uitvinken geeft één doel minder: nooit stil de hele beroepskwalificatie', () => {
    const l = leerplanMet(new Map([['BK-0390-2', ids(ONTHAAL).slice(1)]]), [ONTHAAL]);
    expect(l.goals).toHaveLength(11);
    expect(l.goals.some((g) => g.bkRefs?.[0].id === ids(ONTHAAL)[0])).toBe(false);
    expect(l.bkVersies?.[0].alle).toBeUndefined();
  });

  it('alle competenties: 12 doelen, en het leerplan weet dat alles gekozen was', () => {
    const l = leerplanMet(new Map([['BK-0390-2', ids(ONTHAAL)]]), [ONTHAAL]);
    expect(l.goals).toHaveLength(12);
    expect(l.bkVersies?.[0].alle).toBe(true);
    expect(l.title).not.toContain(' van 12 competenties');
  });

  it('de doelen staan in de volgorde van het bestand, ook als de keuze in een andere volgorde binnenkomt', () => {
    const omgekeerd = ids(ONTHAAL).slice(0, 5).reverse();
    const l = leerplanMet(new Map([['BK-0390-2', omgekeerd]]), [ONTHAAL]);
    expect(l.goals.map((g) => g.bkRefs?.[0].id)).toEqual(ids(ONTHAAL).slice(0, 5));
  });

  it('twee beroepskwalificaties geven één leerplan met samen 25 doelen en het vak "Beroepsgerichte vorming"', () => {
    const l = leerplanMet(new Map([['BK-0390-2', ids(ONTHAAL)], ['BK-0464-1', ids(RECREATIEF)]]), [ONTHAAL, RECREATIEF]);
    expect(l.goals).toHaveLength(25);
    expect(l.subject).toBe('Beroepsgerichte vorming');
    expect(l.bkVersies?.map((v) => v.bk)).toEqual(['BK-0390-2', 'BK-0464-1']);
  });

  it('het vak dat de leerkracht typte, wordt het vak van het leerplan; zonder vak is het de titel', () => {
    expect(leerplanMet(new Map([['BK-0390-2', ids(ONTHAAL)]]), [ONTHAAL]).subject).toBe('Onthaalmedewerker');
    expect(leerplanMet(new Map([['BK-0390-2', ids(ONTHAAL)]]), [ONTHAAL], { vak: 'Praktijk onthaal' }).subject).toBe('Praktijk onthaal');
  });

  it('zonder keuze: niets bewaren en zeggen wat er nodig is', () => {
    const u = leerplanVoorKeuze({ info: INFO, doelgroep: DG, selectie: new Map(), gegevens: gegevensVan(ONTHAAL), curricula: [] });
    expect(u).toEqual({ soort: 'probleem', tekst: 'Kies minstens één competentie.' });
    const leeg = leerplanVoorKeuze({ info: INFO, doelgroep: DG, selectie: new Map([['BK-0390-2', []]]), gegevens: gegevensVan(ONTHAAL), curricula: [] });
    expect(leeg.soort).toBe('probleem');
  });

  it('een keuze zonder bestand van die versie is een laadprobleem, geen leerplan', () => {
    const u = leerplanVoorKeuze({ info: INFO, doelgroep: DG, selectie: new Map([['BK-0464-1', ids(RECREATIEF)]]), gegevens: gegevensVan(ONTHAAL), curricula: [] });
    expect(u).toEqual({ soort: 'probleem', tekst: BK_VENSTER_FOUT });
  });

  it('een code die niet in het bestand staat of geen tekst heeft, valt weg en komt nooit in het leerplan', () => {
    const leeg = maakBk('BK-0556-1', 'Half leeg beroep', 3, { 1: '<p>&nbsp;</p>' });
    const l = leerplanMet(new Map([['BK-0556-1', [...ids(leeg), 'bkc9nietbestaand']]]), [leeg]);
    expect(l.goals).toHaveLength(2);
    expect(l.goals.map((g) => g.bkRefs?.[0].id)).toEqual([leeg.competenties[0].id, leeg.competenties[2].id]);
  });

  it('hergebruikt een nagekeken leerplan met precies deze competenties (de volgorde telt niet)', () => {
    const gekozen = kies(ONTHAAL, 0, 7);
    const bestaand = leerplanMet(new Map([['BK-0390-2', gekozen]]), [ONTHAAL]);
    const u = leerplanVoorKeuze({
      info: INFO, doelgroep: DG, selectie: new Map([['BK-0390-2', [...gekozen].reverse()]]), gegevens: gegevensVan(ONTHAAL), curricula: [bestaand],
    });
    expect(u.soort).toBe('hergebruik');
    if (u.soort === 'hergebruik') expect(u.leerplan.id).toBe(bestaand.id);
  });

  it('hergebruikt niet bij een andere keuze, ook niet bij één competentie meer of minder', () => {
    const bestaand = leerplanMet(new Map([['BK-0390-2', kies(ONTHAAL, 0, 7)]]), [ONTHAAL]);
    for (const [van, tot] of [[0, 6], [0, 8], [1, 7]] as const) {
      const u = leerplanVoorKeuze({
        info: INFO, doelgroep: DG, selectie: new Map([['BK-0390-2', kies(ONTHAAL, van, tot)]]), gegevens: gegevensVan(ONTHAAL), curricula: [bestaand],
      });
      expect(u.soort).toBe('nieuw');
    }
  });

  it('hergebruikt niet als het versiemerk sindsdien veranderde (een nieuwe update van de index)', () => {
    const gekozen = kies(ONTHAAL, 0, 7);
    const bestaand = leerplanMet(new Map([['BK-0390-2', gekozen]]), [ONTHAAL]);
    const bijgewerkt: BkBestand = { ...structuredClone(ONTHAAL), sha256: sha256Hex('andere inhoud') };
    const u = leerplanVoorKeuze({
      info: INFO, doelgroep: DG, selectie: new Map([['BK-0390-2', gekozen]]), gegevens: gegevensVan(bijgewerkt), curricula: [bestaand],
    });
    expect(u.soort).toBe('nieuw');
  });

  it('hergebruikt niet als het versiemerk in de index ontbreekt: dezelfde versie is dan niet aan te tonen', () => {
    const gekozen = kies(ONTHAAL, 0, 7);
    const bestaand = leerplanMet(new Map([['BK-0390-2', gekozen]]), [ONTHAAL]);
    const g = gegevensVan(ONTHAAL);
    g.merken.clear();
    const u = leerplanVoorKeuze({ info: INFO, doelgroep: DG, selectie: new Map([['BK-0390-2', gekozen]]), gegevens: g, curricula: [bestaand] });
    expect(u.soort).toBe('nieuw');
  });

  it('niet nagekeken: niets bewaren, met een melding in gewone taal en zonder competentiecode', () => {
    const fout = gegevensVan(ONTHAAL);
    fout.merken.set('BK-0390-2', '0123456789abcdef');
    const u = leerplanVoorKeuze({ info: INFO, doelgroep: DG, selectie: new Map([['BK-0390-2', ids(ONTHAAL)]]), gegevens: fout, curricula: [] });
    expect(u.soort).toBe('probleem');
    if (u.soort !== 'probleem') return;
    expect(u.tekst).toMatch(/^Het leerplan kon niet als nagekeken bewaard worden: .+\. Er is niets bewaard\.$/);
    expect(u.tekst).not.toMatch(/bkc\d|ODS_|G-\d{4}/);
  });

  it('geeft de waarschuwingen van een nagekeken leerplan door, zodat de leerkracht ze leest', () => {
    const weg: BkBestand = { ...structuredClone(ONTHAAL), nietMeerInBron: '2026-12-03' };
    const u = leerplanVoorKeuze({ info: INFO, doelgroep: DG, selectie: new Map([['BK-0390-2', ids(ONTHAAL)]]), gegevens: gegevensVan(weg), curricula: [] });
    expect(u.soort).toBe('nieuw');
    if (u.soort === 'nieuw') expect(u.waarschuwingen.join(' ')).toMatch(/niet meer/);
  });

  it('wijzigt de invoer niet', () => {
    const selectie = new Map([['BK-0390-2', kies(ONTHAAL, 0, 4)]]);
    const voor = JSON.stringify([...selectie]);
    leerplanVoorKeuze({ info: INFO, doelgroep: DG, selectie, gegevens: gegevensVan(ONTHAAL), curricula: [] });
    expect(JSON.stringify([...selectie])).toBe(voor);
  });
});

// ── Rond het leerplan ───────────────────────────────────────────────────────

describe('bkVersiesVan en cursusVoorBk', () => {
  it('bkVersiesVan geeft de versies van een BK-leerplan in de volgorde van het leerplan, en niets voor een ander leerplan', () => {
    const l = leerplanMet(new Map([['BK-0390-2', ids(ONTHAAL)], ['BK-0464-1', ids(RECREATIEF)]]), [ONTHAAL, RECREATIEF]);
    expect(bkVersiesVan(l)).toEqual(['BK-0390-2', 'BK-0464-1']);
    expect(bkVersiesVan({ ...l, herkomst: { methode: 'officieel', bronUrl: 'x', ingelezenOp: 1 } })).toEqual([]);
  });

  it('cursusVoorBk is die van de bibliotheek: een hoofdstuk per beroepskwalificatie en een sectie per competentie', () => {
    expect(cursusVoorBk).toBe(cursusVoorBkBron);
    const l = leerplanMet(new Map([['BK-0390-2', kies12()], ['BK-0464-1', ids(RECREATIEF).slice(0, 3)]]), [ONTHAAL, RECREATIEF]);
    const c = cursusVoorBk({
      titel: 'Praktijk', auteur: 'T', doelgroep: DG, leerplan: l, bestanden: gegevensVan(ONTHAAL, RECREATIEF).bestanden, start: 'geraamte',
    });
    expect(c.chapters).toHaveLength(2);
    expect(c.chapters.map((h) => h.sections.length)).toEqual([12, 3]);
    expect(c.curriculumId).toBe(l.id);
  });

  function kies12() { return ids(ONTHAAL); }
});
