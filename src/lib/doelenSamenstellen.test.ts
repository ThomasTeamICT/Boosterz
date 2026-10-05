import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MAX_DOELCODE, MAX_DOELEN, MAX_DOELTHEMA, MAX_SETS, controleStatus, doelenVingerafdruk, exportCurriculumJson, importCurriculumJson,
  normalizeGoalCode, sanitizeCurriculum,
} from './curriculum';
import { controleerLeerplan } from './curriculumCheck';
import type { Curriculum, CurriculumGoal } from './curriculumTypes';
import {
  bevestigSamengesteld, leerplanUitSelectie, selectieVanLeerplan, telSelectie, voorstelTitel, type SetKeuze,
} from './doelenSamenstellen';
import { effectieveStatus, isOfficieel, isSamengesteld, uitOfficieleBron } from './leerplanStatus';
import type { Minimumdoel, MinimumdoelenIndex, MinimumdoelenIndexSet, MinimumdoelenSetBestand, MinimumdoelenSetKop } from './minimumdoelen';
import { soortVanSet } from './minimumdoelenBron';
import { NAGEKEKEN_DOOR_BRON, leerplanUitSet } from './minimumdoelenLeerplan';

// ── Nagemaakte sets ─────────────────────────────────────────────────────────

function doel(id: string | undefined, code: string, tekst: string, extra?: Record<string, unknown>): Minimumdoel {
  return { ...(id === undefined ? {} : { id }), code, tekst, ...(extra ? { extra } : {}) };
}

function maakSet(id: string, doelen: Minimumdoel[], kop: Partial<MinimumdoelenSetKop> = {}): MinimumdoelenSetBestand {
  return {
    app: 'boosterz', kind: 'minimumdoelen', v: 1,
    set: {
      id, naam: 'Secundair onderwijs 1ste graad A-stroom - Vak - Testvak - Eindtermen', korteNaam: 'Testvak',
      versie: '1.0', geldigheid: 'Geldig', geldigVan: '2024-09-01', graad: '1ste graad', stroom: 'A-stroom', sleutelcompetenties: [],
      bron: 'https://www.onderwijsdoelen.be/', api: 'https://onderwijs.api.vlaanderen.be/onderwijsdoelen',
      naamsvermelding: 'Bron: Vlaamse overheid, Departement Onderwijs en Vorming (onderwijsdoelen.be)',
      licentie: 'nog te bevestigen', opgehaald: '2026-10-05T12:20:49Z', aantal: doelen.length, sha256: 'a'.repeat(64),
      ...kop,
    },
    doelen,
  };
}

/** Een set met drie gewone doelen 1.01, 1.02, 1.03 (ids `<prefix>1` …). */
function drieDoelen(id: string, prefix: string, kop: Partial<MinimumdoelenSetKop> = {}): MinimumdoelenSetBestand {
  return maakSet(id, [
    doel(`${prefix}1`, '1.01', `Eerste doel van ${id}.`),
    doel(`${prefix}2`, '1.02', `Tweede doel van ${id}.`),
    doel(`${prefix}3`, '1.03', `Derde doel van ${id}.`),
  ], kop);
}

const codes = (cur: Curriculum) => cur.goals.map((g) => g.code);
const refIds = (cur: Curriculum) => cur.goals.map((g) => `${g.refs![0].set}:${g.refs![0].id}`);
const fouten = (r: { bevindingen: { ernst: string; bericht: string }[] }) => r.bevindingen.filter((b) => b.ernst === 'fout').map((b) => b.bericht);
const laatste = (lijst: readonly string[]) => lijst[lijst.length - 1];

// ── Echte gegevens ──────────────────────────────────────────────────────────

const MAP = join(fileURLToPath(new URL('../../', import.meta.url)), 'public', 'leerplannen', 'minimumdoelen');
const ECHT = existsSync(join(MAP, 'index.json'));
const index = (): MinimumdoelenIndex => JSON.parse(readFileSync(join(MAP, 'index.json'), 'utf8')) as MinimumdoelenIndex;
const laad = (id: string): MinimumdoelenSetBestand => JSON.parse(readFileSync(join(MAP, `${id}.json`), 'utf8')) as MinimumdoelenSetBestand;

/** De geldige sets "Eindtermen basisgeletterdheid" van het gewoon secundair, 1ste graad, in deze stroom, in de volgorde Nederlands, STEM, digitaal. */
function basisgeletterdheid(stroom: 'A-stroom' | 'B-stroom'): MinimumdoelenIndexSet[] {
  const kandidaten = index().sets.filter((s) => s.geldigheid === 'Geldig' && soortVanSet(s.naam) === 'so' && s.graad === '1ste graad'
    && s.stroom === stroom && /Eindtermen basisgeletterdheid$/.test(s.naam.trim()));
  const vind = (re: RegExp) => kandidaten.filter((s) => re.test(s.korteNaam ?? ''));
  const gevonden = [vind(/^Nederlands$/), vind(/^Wiskunde/), vind(/^Digitale competenties$/)];
  for (const g of gevonden) expect(g).toHaveLength(1);
  return gevonden.map((g) => g[0]);
}

/** Doelen met vast nummer en tekst: zoveel neemt "alle" over. */
function kiesbaar(b: MinimumdoelenSetBestand): number {
  return b.doelen.filter((d) => typeof d.id === 'string' && d.id.trim() !== '' && d.tekst.replace(/<[^>]*>|&nbsp;|\s/g, '') !== '').length;
}

// ── Met echte gegevens ──────────────────────────────────────────────────────

describe.runIf(ECHT)('basisgeletterdheid 1ste graad A-stroom (echte sets)', () => {
  const sets = basisgeletterdheid('A-stroom');
  const bestanden = sets.map((s) => laad(s.id));
  const r = leerplanUitSelectie(bestanden.map((bestand) => ({ bestand, doelen: 'alle' as const })), { titel: '' });

  it('is nagekeken door de officiële bron, zonder waarschuwingen', () => {
    expect(r.waarschuwingen).toEqual([]);
    expect(r.bevestigd).toBe(true);
    expect(r.rapport.kanBevestigen).toBe(true);
    expect(controleStatus(r.leerplan)).toBe('gecontroleerd');
    expect(r.leerplan.controle).toMatchObject({ door: NAGEKEKEN_DOOR_BRON, doelenSha256: doelenVingerafdruk(r.leerplan.goals) });
    expect(r.leerplan.controle!.samenvatting).toBe(`Letterlijk overgenomen uit 3 officiële sets (${r.leerplan.goals.length} doelen), zelf gekozen.`);
  });

  it('neemt alle doelen over, in de volgorde van de sets, met unieke codes', () => {
    const totaal = bestanden.reduce((som, b) => som + kiesbaar(b), 0);
    expect(r.leerplan.goals).toHaveLength(totaal);
    expect(totaal).toBe(10);
    expect(telSelectie(bestanden.map((bestand) => ({ bestand, doelen: 'alle' as const })))).toBe(totaal);
    expect(r.leerplan.minimumdoelenSets).toEqual(sets.map((s) => s.id));
    expect(refIds(r.leerplan)).toEqual(bestanden.flatMap((b) => b.doelen.map((d) => `${b.set.id}:${d.id}`)));
    const genormaliseerd = codes(r.leerplan).map(normalizeGoalCode);
    expect(new Set(genormaliseerd).size).toBe(genormaliseerd.length);
    // Geen botsing: de codes zijn die van de sets zelf.
    expect(codes(r.leerplan)).toEqual(bestanden.flatMap((b) => b.doelen.map((d) => d.code)));
  });

  it('vult de kop in: titel, niveau, bron, herkomst', () => {
    const lp = r.leerplan;
    expect(lp.title).toBe('Basisgeletterdheid · 1ste graad A-stroom');
    expect(lp.net).toBe('minimumdoelen');
    expect(lp.subject).toBe('');
    expect(lp.level).toBe('1ste graad A-stroom');
    expect(lp.kind).toBe('leerplan');
    expect(lp.herkomst?.methode).toBe('samengesteld');
    expect(lp.herkomst?.geldigVanaf).toBeUndefined();
    expect(lp.source).toMatch(/^Samengesteld uit de officiële minimumdoelen: Nederlands \(ODS_\d+\), Wiskunde – natuurwetenschappen – technologie – STEM \(ODS_\d+\), Digitale competenties \(ODS_\d+\)\. Bron: Vlaamse overheid/);
    expect(lp.source).toMatch(/\(opgehaald \d+ \w+ \d{4}\)$/);
    expect(isSamengesteld(lp)).toBe(true);
    expect(uitOfficieleBron(lp)).toBe(true);
    expect(isOfficieel(lp)).toBe(false);
  });

  it('groepeert per set: de rubriek is de naam van de set', () => {
    expect([...new Set(r.leerplan.goals.map((g) => g.theme))]).toEqual(['Nederlands', 'Wiskunde – natuurwetenschappen – technologie – STEM', 'Digitale competenties']);
  });

  it('de dekking zegt hoeveel doelen er per set gekozen zijn, zonder fout over ontbrekende doelen', () => {
    const info = r.rapport.bevindingen.filter((b) => b.soort === 'dekking').map((b) => b.bericht);
    expect(info).toHaveLength(3);
    expect(info[0]).toMatch(/^Je koos alle 3 doelen van Nederlands \(ODS_\d+\)\.$/);
  });

  it('blijft nagekeken en samengesteld na exporteren en importeren, en is opnieuw samen te stellen', () => {
    const terug = importCurriculumJson(exportCurriculumJson(r.leerplan)) as Curriculum;
    expect(controleStatus(terug)).toBe('gecontroleerd');
    expect(effectieveStatus(terug)).toBe('gecontroleerd');
    expect(terug.herkomst?.methode).toBe('samengesteld');
    expect(doelenVingerafdruk(terug.goals)).toBe(doelenVingerafdruk(r.leerplan.goals));

    const selectie = selectieVanLeerplan(terug);
    expect([...selectie.keys()]).toEqual(sets.map((s) => s.id));
    expect([...selectie.values()].flat()).toEqual(r.leerplan.goals.map((g) => g.refs![0].id));

    const keuzes: SetKeuze[] = [...selectie].map(([id, doelen]) => ({ bestand: laad(id), doelen }));
    const opnieuw = leerplanUitSelectie(keuzes, { titel: terug.title, bestaand: terug });
    expect(opnieuw.bevestigd).toBe(true);
    expect(opnieuw.leerplan.id).toBe(terug.id);
    expect(opnieuw.leerplan.createdAt).toBe(terug.createdAt);
    expect(doelenVingerafdruk(opnieuw.leerplan.goals)).toBe(doelenVingerafdruk(terug.goals));
    expect(opnieuw.leerplan.title).toBe(terug.title);
  });
});

describe.runIf(ECHT)('losse doelen uit de STEM-set ODS_3283 (echte set)', () => {
  const bestand = ECHT ? laad('ODS_3283') : maakSet('ODS_3283', []);
  const gekozen = bestand.doelen.filter((d) => d.code >= '06.24' && d.code <= '06.35');
  // In omgekeerde volgorde gekozen: de lijst volgt toch de volgorde van de set.
  const r = leerplanUitSelectie([{ bestand, doelen: gekozen.map((d) => d.id as string).reverse() }], { titel: 'Natuurwetenschappen', vak: 'Natuurwetenschappen' });

  it('neemt de 12 gekozen doelen over in de volgorde van de set, nagekeken', () => {
    expect(gekozen).toHaveLength(12);
    expect(r.bevestigd).toBe(true);
    expect(r.waarschuwingen).toEqual([]);
    expect(codes(r.leerplan)).toEqual(gekozen.map((d) => d.code));
    expect(r.leerplan.title).toBe('Natuurwetenschappen');
    expect(r.leerplan.subject).toBe('Natuurwetenschappen');
    expect(r.leerplan.controle!.samenvatting).toBe('Letterlijk overgenomen uit de officiële set ODS_3283 (12 doelen), zelf gekozen.');
  });

  it('heeft dezelfde teksten en codes als "Gebruik als leerplan"', () => {
    const geheel = leerplanUitSet(bestand).leerplan;
    const opId = new Map(geheel.goals.map((g) => [g.refs![0].id, g]));
    for (const g of r.leerplan.goals) {
      const zelfde = opId.get(g.refs![0].id)!;
      expect(g.text).toBe(zelfde.text);
      expect(g.code).toBe(zelfde.code);
    }
  });

  it('geeft geen waarschuwing over gaten in de nummering, en de dekking zegt "Je koos 12 van de 44 …"', () => {
    expect(r.rapport.bevindingen.filter((b) => b.ernst === 'waarschuwing')).toEqual([]);
    expect(r.rapport.bevindingen.some((b) => /ontbre/i.test(b.bericht))).toBe(false);
    const info = r.rapport.bevindingen.filter((b) => b.soort === 'dekking').map((b) => b.bericht);
    expect(info).toEqual(['Je koos 12 van de 44 doelen van Wiskunde – natuurwetenschappen – technologie – STEM (ODS_3283).']);
  });

  it('een gat in een officieel leerplan geeft wel nog een waarschuwing (gedrag van voorheen)', () => {
    const geheel = leerplanUitSet(bestand).leerplan;
    const metGat: Curriculum = { ...geheel, goals: geheel.goals.filter((g) => g.code !== '06.30') };
    const rapport = controleerLeerplan(metGat, { sets: [bestand] });
    expect(rapport.bevindingen.some((b) => b.ernst === 'waarschuwing' && b.soort === 'volledig')).toBe(true);
    expect(rapport.kanBevestigen).toBe(false); // een officieel leerplan bevat alle doelen van de set
  });
});

describe.runIf(ECHT)('basisgeletterdheid in de A- en de B-stroom samen (codes botsen)', () => {
  const a = basisgeletterdheid('A-stroom');
  const b = basisgeletterdheid('B-stroom');
  const keuzes: SetKeuze[] = [a[0], b[0]].map((s) => ({ bestand: laad(s.id), doelen: 'alle' }));
  const r = leerplanUitSelectie(keuzes, { titel: '' });

  it('maakt de codes uniek met de stroom erbij, en blijft nagekeken', () => {
    expect(r.bevestigd).toBe(true);
    expect(codes(r.leerplan)).toEqual(['BG02.01 (A)', 'BG02.02 (A)', 'BG02.03 (A)', 'BG02.01 (B)', 'BG02.02 (B)', 'BG02.03 (B)']);
    const genormaliseerd = codes(r.leerplan).map(normalizeGoalCode);
    expect(new Set(genormaliseerd).size).toBe(genormaliseerd.length);
    // De verwijzing houdt de code van de set.
    expect(r.leerplan.goals.map((g) => g.refs![0].code)).toEqual(['BG02.01', 'BG02.02', 'BG02.03', 'BG02.01', 'BG02.02', 'BG02.03']);
  });

  it('zet graad en stroom bij de naam van de set, en alleen de gedeelde graad in het niveau en de titel', () => {
    expect([...new Set(r.leerplan.goals.map((g) => g.theme))]).toEqual(['Nederlands · 1ste graad A-stroom', 'Nederlands · 1ste graad B-stroom']);
    expect(r.leerplan.level).toBe('1ste graad');
    expect(r.leerplan.title).toBe('Basisgeletterdheid Nederlands · 1ste graad');
    expect(voorstelTitel([a[0], a[1]])).toBe('Basisgeletterdheid · 1ste graad A-stroom');
  });

  it('de volgorde van de sets verandert de codes niet', () => {
    const omgekeerd = leerplanUitSelectie([...keuzes].reverse(), { titel: '' });
    expect(codes(omgekeerd.leerplan)).toEqual(['BG02.01 (B)', 'BG02.02 (B)', 'BG02.03 (B)', 'BG02.01 (A)', 'BG02.02 (A)', 'BG02.03 (A)']);
  });

  it('opnieuw samenstellen na exporteren en importeren geeft dezelfde vingerafdruk', () => {
    const terug = importCurriculumJson(exportCurriculumJson(r.leerplan)) as Curriculum;
    const opnieuw = leerplanUitSelectie([...selectieVanLeerplan(terug)].map(([id, doelen]) => ({ bestand: laad(id), doelen })), { titel: terug.title, bestaand: terug });
    expect(doelenVingerafdruk(opnieuw.leerplan.goals)).toBe(doelenVingerafdruk(terug.goals));
    expect(opnieuw.leerplan.id).toBe(terug.id);
  });
});

describe.runIf(ECHT)('opnieuw samenstellen: bestaande codes blijven, oude codes gaan nooit naar een ander doel (echte sets)', () => {
  const alleVan = (sets: MinimumdoelenIndexSet[]): SetKeuze[] => sets.map((s) => ({ bestand: laad(s.id), doelen: 'alle' }));
  const bewaar = (cur: Curriculum) => importCurriculumJson(exportCurriculumJson(cur)) as Curriculum;
  const a = ECHT ? alleVan(basisgeletterdheid('A-stroom')) : [];
  const b = ECHT ? alleVan(basisgeletterdheid('B-stroom')) : [];
  const alleenA = bewaar(leerplanUitSelectie(a, { titel: 'Basisgeletterdheid' }).leerplan);
  const codeVan = (cur: Curriculum) => new Map(cur.goals.map((g) => [`${g.refs![0].set}:${g.refs![0].id}`, g.code]));
  const uniekEnGeldig = (cur: Curriculum) => {
    const cs = codes(cur);
    expect(new Set(cs.map(normalizeGoalCode)).size).toBe(cs.length);
    expect(cs.every((c) => c !== '' && c.length <= MAX_DOELCODE && c === normalizeGoalCode(c))).toBe(true);
  };

  it('(a) eerst A-stroom bewaard, dan B-stroom erbij: de A-codes blijven, de B-codes krijgen een onderscheid', () => {
    expect(codes(alleenA)).toEqual(a.flatMap((k) => k.bestand.doelen.map((d) => d.code)));
    for (const keuzes of [[...a, ...b], [...b, ...a]]) {
      const r = leerplanUitSelectie(keuzes, { titel: alleenA.title, bestaand: alleenA });
      expect(r.bevestigd).toBe(true);
      const nu = codeVan(r.leerplan);
      for (const [sleutel, code] of codeVan(alleenA)) expect(nu.get(sleutel)).toBe(code);
      const bCodes = b.flatMap((k) => k.bestand.doelen.map((d) => nu.get(`${k.bestand.set.id}:${d.id}`)));
      expect(bCodes).toEqual(b.flatMap((k) => k.bestand.doelen.map((d) => `${d.code} (B)`)));
      uniekEnGeldig(r.leerplan);
    }
    // Zonder `bestaand` blijft het zoals voorheen: beide stromen krijgen een onderscheid.
    expect(codes(leerplanUitSelectie([...a, ...b], { titel: '' }).leerplan)[0]).toBe('BG02.01 (A)');
  });

  it('(b) eerst A, dan A weg en B erbij: B krijgt nooit een oude A-code', () => {
    const r = leerplanUitSelectie(b, { titel: alleenA.title, bestaand: alleenA });
    expect(r.bevestigd).toBe(true);
    expect(r.leerplan.id).toBe(alleenA.id);
    const oud = new Set(codes(alleenA));
    expect(codes(r.leerplan).filter((c) => oud.has(c))).toEqual([]);
    expect(codes(r.leerplan)).toEqual(b.flatMap((k) => k.bestand.doelen.map((d) => `${d.code} (B)`)));
    uniekEnGeldig(r.leerplan);
    // Daarna A er weer bij: A krijgt zijn codes van de eerste keer niet terug van B, en B houdt de zijne.
    const weer = leerplanUitSelectie([...a, ...b], { titel: alleenA.title, bestaand: bewaar(r.leerplan) });
    expect(weer.bevestigd).toBe(true);
    const nu = codeVan(weer.leerplan);
    for (const [sleutel, code] of codeVan(r.leerplan)) expect(nu.get(sleutel)).toBe(code);
    uniekEnGeldig(weer.leerplan);
  });

  it('(c) dezelfde selectie opnieuw: dezelfde vingerafdruk, ook na een toegevoegde of weggelaten set', () => {
    const metB = bewaar(leerplanUitSelectie([...a, ...b], { titel: 'T', bestaand: alleenA }).leerplan);
    const zonderA = bewaar(leerplanUitSelectie(b, { titel: 'T', bestaand: alleenA }).leerplan);
    for (const bewaard of [alleenA, metB, zonderA]) {
      const keuzes = [...selectieVanLeerplan(bewaard)].map(([id, doelen]) => ({ bestand: laad(id), doelen }));
      const opnieuw = leerplanUitSelectie(keuzes, { titel: bewaard.title, bestaand: bewaard });
      expect(opnieuw.bevestigd).toBe(true);
      expect(doelenVingerafdruk(opnieuw.leerplan.goals)).toBe(doelenVingerafdruk(bewaard.goals));
    }
  });

  it('(d) een gewijzigde bewaarde lijst (dubbele code, te lange code, code van een ander doel): toch unieke, geldige codes', () => {
    const met = (aanpassen: (goals: CurriculumGoal[]) => void): Curriculum => {
      const goals = alleenA.goals.map((g) => ({ ...g }));
      aanpassen(goals);
      return { ...alleenA, goals };
    };
    const gevallen: [string, Curriculum, (r: Curriculum) => void][] = [
      ['dubbele code', met((g) => { g[1].code = g[0].code; }), (r) => {
        // De code hoort bij het eerste doel ermee (daar wees een koppeling naar); het tweede krijgt zijn eigen code.
        expect(codes(r).slice(0, 2)).toEqual(['BG02.01', 'BG02.02']);
      }],
      ['code van 61 tekens', met((g) => { g[0].code = 'X'.repeat(61); }), (r) => {
        expect(codes(r)[0]).toBe('BG02.01');
      }],
      ['code van een ander gekozen doel', met((g) => { g[1].code = g[3].code; }), (r) => {
        // BG06.01 hoorde eerst bij het doel van Nederlands (eerste met die code); het STEM-doel krijgt een onderscheid.
        const stem = alleenA.goals[3].code;
        expect(stem).toBe('BG06.01');
        expect(codes(r)[1]).toBe(stem);
        expect(codes(r)[3]).toBe(`${stem} (A)`);
      }],
      ['code in kleine letters', met((g) => { g[0].code = ' bg02.01 '; }), (r) => {
        expect(codes(r)[0]).toBe('BG02.01');
      }],
      ['doel zonder verwijzing', met((g) => { g[0].refs = undefined; }), (r) => {
        // Niemand is eigenaar van de code: ze gaat ook niet naar het doel dat nu gekozen wordt.
        expect(codes(r)[0]).toBe('BG02.01 (A)');
      }],
    ];
    for (const [naam, bestaand, extra] of gevallen) {
      const r = leerplanUitSelectie(a, { titel: 'T', bestaand });
      expect(r.bevestigd, naam).toBe(true);
      uniekEnGeldig(r.leerplan);
      extra(r.leerplan);
    }
  });
});

describe.runIf(ECHT)('met veel echte sets', () => {
  const geldig = (graad: string) => index().sets.filter((s) => s.geldigheid === 'Geldig' && soortVanSet(s.naam) === 'so' && s.graad === graad);

  it('elke meegeleverde set apart, helemaal gekozen: nagekeken, met de teksten en codes van "Gebruik als leerplan"', () => {
    const problemen: string[] = [];
    for (const s of index().sets) {
      const bestand = laad(s.id);
      const r = leerplanUitSelectie([{ bestand, doelen: 'alle' }], { titel: 'x' });
      const geheel = leerplanUitSet(bestand).leerplan;
      if (!r.bevestigd) problemen.push(`${s.id}: niet nagekeken (${r.waarschuwingen.join(' | ')})`);
      else if (r.leerplan.goals.map((g) => `${g.code}|${g.text}`).join('\n') !== geheel.goals.map((g) => `${g.code}|${g.text}`).join('\n')) {
        problemen.push(`${s.id}: andere doelen dan "Gebruik als leerplan"`);
      }
    }
    expect(problemen).toEqual([]);
  });

  it('50 geldige sets van de 2de graad samen (veel botsende codes): nagekeken, codes uniek en hoogstens 60 tekens', () => {
    const sets = geldig('2de graad');
    expect(sets.length).toBeGreaterThan(MAX_SETS);
    const keuzes: SetKeuze[] = sets.slice(0, MAX_SETS).map((s) => ({ bestand: laad(s.id), doelen: 'alle' }));
    const r = leerplanUitSelectie(keuzes, { titel: '' });
    expect(r.bevestigd).toBe(true);
    expect(r.leerplan.goals).toHaveLength(telSelectie(keuzes));
    const genormaliseerd = codes(r.leerplan).map(normalizeGoalCode);
    expect(new Set(genormaliseerd).size).toBe(genormaliseerd.length);
    expect(Math.max(...codes(r.leerplan).map((c) => c.length))).toBeLessThanOrEqual(MAX_DOELCODE);
    expect(Math.max(...r.leerplan.goals.map((g) => g.theme?.length ?? 0))).toBeLessThanOrEqual(MAX_DOELTHEMA);
    // Botsende codes uit sets van dezelfde graad zonder stroom: het set-id onderscheidt ze.
    expect(codes(r.leerplan).some((c) => / \(ODS_\d+\)$/.test(c))).toBe(true);
    // De bron somt niet alle 50 sets op.
    expect(r.leerplan.source).toMatch(/\) en \d+ andere sets\. Bron: Vlaamse overheid/);
    expect(r.leerplan.source!.length).toBeLessThan(1300);
    const terug = importCurriculumJson(exportCurriculumJson(r.leerplan)) as Curriculum;
    expect(controleStatus(terug)).toBe('gecontroleerd');
    expect(terug.goals).toHaveLength(r.leerplan.goals.length);
  });

  it('meer dan 50 sets: geen lijst, met een waarschuwing', () => {
    const keuzes: SetKeuze[] = geldig('2de graad').slice(0, MAX_SETS + 1).map((s) => ({ bestand: laad(s.id), doelen: 'alle' }));
    const r = leerplanUitSelectie(keuzes, { titel: '' });
    expect(r.bevestigd).toBe(false);
    expect(r.leerplan.goals).toEqual([]);
    expect(laatste(r.waarschuwingen)).toBe(`Je koos doelen uit ${MAX_SETS + 1} sets. Eén lijst kan doelen uit hoogstens ${MAX_SETS} sets bevatten: kies minder sets.`);
  });

  it('een oude versie geeft een waarschuwing, maar wordt wel nagekeken', () => {
    const oud = index().sets.find((s) => s.geldigheid === 'Niet meer geldig' && /Eindtermen basisgeletterdheid$/.test(s.naam.trim()))!;
    const r = leerplanUitSelectie([{ bestand: laad(oud.id), doelen: 'alle' }], { titel: '' });
    expect(r.bevestigd).toBe(true);
    expect(r.waarschuwingen).toEqual([`${oud.korteNaam} (${oud.id}) geldt niet meer. Gebruik liever de minimumdoelen die nu gelden.`]);
  });
});

// ── Regels van leerplanUitSelectie (nagemaakte sets) ─────────────────────────

describe('leerplanUitSelectie: volgorde en keuze', () => {
  const s1 = drieDoelen('ODS_9001', 'a');
  const s2 = drieDoelen('ODS_9002', 'b', { korteNaam: 'Ander vak', naam: 'Secundair onderwijs 1ste graad A-stroom - Vak - Ander vak - Eindtermen' });

  it('volgt de volgorde van de sets in de keuzes en van de doelen in de set', () => {
    const r = leerplanUitSelectie([{ bestand: s2, doelen: ['b3', 'b1'] }, { bestand: s1, doelen: ['a2'] }], { titel: 'T' });
    expect(refIds(r.leerplan)).toEqual(['ODS_9002:b1', 'ODS_9002:b3', 'ODS_9001:a2']);
    expect(r.leerplan.minimumdoelenSets).toEqual(['ODS_9002', 'ODS_9001']);
    expect(r.bevestigd).toBe(true);
  });

  it('laat een set zonder gekozen doelen weg', () => {
    const r = leerplanUitSelectie([{ bestand: s1, doelen: [] }, { bestand: s2, doelen: ['b2'] }], { titel: 'T' });
    expect(r.leerplan.minimumdoelenSets).toEqual(['ODS_9002']);
    expect(r.rapport.bevindingen.filter((b) => b.soort === 'dekking')).toHaveLength(1);
    expect(r.leerplan.goals[0].theme).toBe('Ander vak');
  });

  it('telt een set die twee keer gekozen is één keer, met de keuzes samen', () => {
    const keuzes: SetKeuze[] = [{ bestand: s1, doelen: ['a3'] }, { bestand: s2, doelen: ['b1'] }, { bestand: s1, doelen: ['a1', 'a3'] }];
    const r = leerplanUitSelectie(keuzes, { titel: 'T' });
    expect(refIds(r.leerplan)).toEqual(['ODS_9001:a1', 'ODS_9001:a3', 'ODS_9002:b1']);
    expect(telSelectie(keuzes)).toBe(3);
    const metAlle = leerplanUitSelectie([{ bestand: s1, doelen: ['a3'] }, { bestand: s1, doelen: 'alle' }], { titel: 'T' });
    expect(metAlle.leerplan.goals).toHaveLength(3);
  });

  it('slaat doelen zonder vast nummer of tekst over, en meldt gekozen doelen die niet (meer) in de set staan', () => {
    const s = maakSet('ODS_9003', [
      doel('1', '1', 'Eerste.'), doel(undefined, '2', 'Zonder nummer.'), doel('3', '3', '<p>&nbsp;</p>'), doel('4', '4', 'Vierde.', { optioneel: true }),
    ]);
    const alle = leerplanUitSelectie([{ bestand: s, doelen: 'alle' }], { titel: 'T' });
    expect(refIds(alle.leerplan)).toEqual(['ODS_9003:1', 'ODS_9003:4']);
    expect(alle.waarschuwingen).toEqual(['Testvak (ODS_9003): 1 doel zonder vast nummer is overgeslagen.', 'Testvak (ODS_9003): 1 doel zonder tekst is overgeslagen.']);
    expect(alle.bevestigd).toBe(true);
    expect(alle.leerplan.goals.map((g) => g.note)).toEqual([undefined, 'Optioneel']);

    const los = leerplanUitSelectie([{ bestand: s, doelen: ['4', '3', 'weg', 'ook-weg', ' 1 '] }], { titel: 'T' });
    expect(refIds(los.leerplan)).toEqual(['ODS_9003:1', 'ODS_9003:4']);
    expect(los.waarschuwingen).toEqual([
      'Testvak (ODS_9003): 1 doel zonder tekst is overgeslagen.',
      'Testvak (ODS_9003): 2 gekozen doelen staan niet (meer) in de set en zijn weggelaten.',
    ]);
    expect(telSelectie([{ bestand: s, doelen: ['4', '3', 'weg', ' 1 '] }])).toBe(2);
  });

  it('zonder enig doel: een lege lijst, niet nagekeken, met "Kies minstens één doel."', () => {
    for (const keuzes of [[], [{ bestand: s1, doelen: [] }], [{ bestand: s1, doelen: ['bestaat-niet'] }]] as SetKeuze[][]) {
      const r = leerplanUitSelectie(keuzes, { titel: '' });
      expect(r.leerplan.goals).toEqual([]);
      expect(r.bevestigd).toBe(false);
      expect(r.leerplan.controle).toBeUndefined();
      expect(laatste(r.waarschuwingen)).toBe('Kies minstens één doel.');
      expect(r.rapport.kanBevestigen).toBe(false);
    }
  });

  it('meer dan het grootste aantal doelen: geen lijst, met een waarschuwing', () => {
    const veel = (id: string, n: number) => maakSet(id, Array.from({ length: n }, (_, i) => doel(`${id}-${i}`, `${i + 1}`, `Doel ${i + 1}.`)));
    const keuzes: SetKeuze[] = [{ bestand: veel('ODS_9101', 2600), doelen: 'alle' }, { bestand: veel('ODS_9102', 2401), doelen: 'alle' }];
    expect(telSelectie(keuzes)).toBe(MAX_DOELEN + 1);
    const r = leerplanUitSelectie(keuzes, { titel: '' });
    expect(r.bevestigd).toBe(false);
    expect(r.leerplan.goals).toEqual([]);
    expect(r.waarschuwingen).toEqual([`Je koos ${MAX_DOELEN + 1} doelen. Eén lijst kan hoogstens ${MAX_DOELEN} doelen bevatten: kies minder doelen.`]);
  });

  it('wat bij het bewaren zou veranderen (een set-id dat geen echt set-id is), wordt nooit als nagekeken bevestigd', () => {
    const vreemd = drieDoelen('SET_X', 'x');
    const r = leerplanUitSelectie([{ bestand: s1, doelen: 'alle' }, { bestand: vreemd, doelen: 'alle' }], { titel: 'T' });
    expect(r.bevestigd).toBe(false);
    expect(controleStatus(r.leerplan)).toBe('niet-gecontroleerd');
    expect(laatste(r.waarschuwingen)).toBe('Niet alle gekozen doelen bleven ongewijzigd bij het bewaren. De lijst kon niet als nagekeken bevestigd worden.');
  });

  it('negeert een kapotte keuze zonder te crashen', () => {
    const kapot = [null, { bestand: null, doelen: 'alle' }, { bestand: { set: {} }, doelen: 'alle' }, { bestand: s1, doelen: 'alle' }] as unknown as SetKeuze[];
    const r = leerplanUitSelectie(kapot, { titel: 'T' });
    expect(r.leerplan.goals).toHaveLength(3);
    expect(r.bevestigd).toBe(true);
  });
});

describe('leerplanUitSelectie: kop van de lijst', () => {
  const s1 = drieDoelen('ODS_9001', 'a');

  it('trimt de titel en stelt er een voor als ze leeg is', () => {
    expect(leerplanUitSelectie([{ bestand: s1, doelen: 'alle' }], { titel: '  Mijn lijst  ' }).leerplan.title).toBe('Mijn lijst');
    expect(leerplanUitSelectie([{ bestand: s1, doelen: 'alle' }], { titel: '   ' }).leerplan.title).toBe('Testvak (eigen selectie) · 1ste graad A-stroom');
  });

  it('herkomst "samengesteld" zonder "geldig vanaf", en een bron met naamsvermelding en datum', () => {
    const lp = leerplanUitSelectie([{ bestand: s1, doelen: 'alle' }], { titel: 'T', vak: ' Wiskunde ' }).leerplan;
    expect(Object.keys(lp.herkomst!).sort()).toEqual(['ingelezenOp', 'methode']);
    expect(lp.herkomst!.methode).toBe('samengesteld');
    expect(Math.abs(lp.herkomst!.ingelezenOp - Date.now())).toBeLessThan(10_000);
    expect(lp.subject).toBe('Wiskunde');
    expect(lp.source).toBe(
      'Samengesteld uit de officiële minimumdoelen: Testvak (ODS_9001). Bron: Vlaamse overheid, Departement Onderwijs en Vorming (onderwijsdoelen.be) (opgehaald 5 oktober 2026)',
    );
  });

  it('noemt een tijdvak als de sets op verschillende dagen opgehaald zijn', () => {
    const s2 = drieDoelen('ODS_9002', 'b', { korteNaam: 'Ander', opgehaald: '2026-11-02T08:00:00Z' });
    const lp = leerplanUitSelectie([{ bestand: s2, doelen: 'alle' }, { bestand: s1, doelen: 'alle' }], { titel: 'T' }).leerplan;
    expect(lp.source).toMatch(/: Ander \(ODS_9002\), Testvak \(ODS_9001\)\. Bron: .* \(opgehaald tussen 5 oktober 2026 en 2 november 2026\)$/);
  });

  it('niveau: graad en stroom als alle sets ze delen, anders wat ze delen', () => {
    const b = drieDoelen('ODS_9002', 'b', { stroom: 'B-stroom' });
    const tweede = drieDoelen('ODS_9003', 'c', { graad: '2de graad', stroom: undefined });
    expect(leerplanUitSelectie([{ bestand: s1, doelen: 'alle' }], { titel: 'T' }).leerplan.level).toBe('1ste graad A-stroom');
    expect(leerplanUitSelectie([{ bestand: s1, doelen: 'alle' }, { bestand: b, doelen: 'alle' }], { titel: 'T' }).leerplan.level).toBe('1ste graad');
    expect(leerplanUitSelectie([{ bestand: s1, doelen: 'alle' }, { bestand: tweede, doelen: 'alle' }], { titel: 'T' }).leerplan.level).toBe('');
  });

  it('opnieuw samenstellen met `bestaand`: zelfde id en aanmaakdatum, nieuwe updatedAt, geen voorbeeld', () => {
    const eerst = leerplanUitSelectie([{ bestand: s1, doelen: ['a1'] }], { titel: 'T' }).leerplan;
    const bewaard: Curriculum = { ...eerst, example: true, createdAt: 1000, updatedAt: 2000 };
    const r = leerplanUitSelectie([{ bestand: s1, doelen: ['a1', 'a2'] }], { titel: 'T2', bestaand: bewaard });
    expect(r.leerplan.id).toBe(eerst.id);
    expect(r.leerplan.createdAt).toBe(1000);
    expect(r.leerplan.updatedAt).toBeGreaterThan(2000);
    expect(r.leerplan.example).toBeUndefined();
    expect(r.leerplan.goals).toHaveLength(2);
    expect(r.bevestigd).toBe(true);
    // Ook een lege selectie houdt het id (het scherm beslist of het bewaart).
    expect(leerplanUitSelectie([], { titel: '', bestaand: bewaard }).leerplan.id).toBe(eerst.id);
  });

  it('weigert om een ander soort leerplan opnieuw samen te stellen', () => {
    const officieel = leerplanUitSet(s1).leerplan;
    expect(() => leerplanUitSelectie([{ bestand: s1, doelen: 'alle' }], { titel: 'T', bestaand: officieel })).toThrow(/samengesteld/);
  });

  it('de oude versies uit `oudeVersies` geven een waarschuwing', () => {
    const r = leerplanUitSelectie([{ bestand: s1, doelen: 'alle' }], { titel: 'T', oudeVersies: new Set(['ODS_9001']) });
    expect(r.waarschuwingen).toEqual(['Testvak (ODS_9001) is een oudere versie. Gebruik liever de versie die nu geldt.']);
    expect(r.bevestigd).toBe(true);
  });
});

describe('leerplanUitSelectie: rubrieken', () => {
  it('de naam van de set, gevolgd door de rubriek van het doel', () => {
    const s = maakSet('ODS_9001', [
      doel('1', '1', 'Eerste.', { titels: { '1': { titel: 'Muzikale opvoeding', nr: '1' }, '2': { titel: 'Waarnemen' } } }),
      doel('2', '2', 'Tweede.'),
    ]);
    const r = leerplanUitSelectie([{ bestand: s, doelen: 'alle' }], { titel: 'T' });
    expect(r.leerplan.goals.map((g) => g.theme)).toEqual(['Testvak › Muzikale opvoeding › Waarnemen', 'Testvak']);
  });

  it('dezelfde korte naam: de context van de set erbij als die verschilt, anders het set-id', () => {
    const gewoon = drieDoelen('ODS_9001', 'a');
    const specifiek = drieDoelen('ODS_9002', 'b', { naam: 'Secundair onderwijs 1ste graad A-stroom - Vak - Testvak - Specifieke eindtermen' });
    const r = leerplanUitSelectie([{ bestand: gewoon, doelen: ['a1'] }, { bestand: specifiek, doelen: ['b1'] }], { titel: 'T' });
    expect(r.leerplan.goals.map((g) => g.theme)).toEqual(['Testvak', 'Testvak · Specifieke eindtermen']);

    const tweeVersies = drieDoelen('ODS_9003', 'c');
    const r2 = leerplanUitSelectie([{ bestand: gewoon, doelen: ['a1'] }, { bestand: tweeVersies, doelen: ['c1'] }], { titel: 'T' });
    expect(r2.leerplan.goals.map((g) => g.theme)).toEqual(['Testvak (ODS_9001)', 'Testvak (ODS_9003)']);
  });

  it('blijft binnen de grens van 500 tekens, ook met een lange rubriek', () => {
    const s = maakSet('ODS_9001', [doel('1', '1', 'Eerste.', { titels: { '1': { titel: 'R'.repeat(495) } } })]);
    const r = leerplanUitSelectie([{ bestand: s, doelen: 'alle' }], { titel: 'T' });
    const thema = r.leerplan.goals[0].theme!;
    expect(thema.length).toBe(MAX_DOELTHEMA);
    expect(thema.startsWith('Testvak › RRR')).toBe(true);
    expect(thema.endsWith('…')).toBe(true);
    expect(r.bevestigd).toBe(true);
    expect(sanitizeCurriculum(r.leerplan)!.goals[0].theme).toBe(thema); // saneren verandert niets meer
  });
});

describe('leerplanUitSelectie: codes', () => {
  it('binnen een set dezelfde codes als "Gebruik als leerplan", ook bij een deel van de set', () => {
    const s = maakSet('ODS_9001', [
      doel('1', '1', 'a', { titels: { '1': { titel: 'Getallen' } } }),
      doel('2', '1', 'b', { titels: { '1': { titel: 'Meetkunde' } } }),
      doel('3', '2', 'c', { titels: { '1': { titel: 'Getallen' } } }),
    ]);
    expect(codes(leerplanUitSet(s).leerplan)).toEqual(['1.1', '2.1', '2']);
    expect(codes(leerplanUitSelectie([{ bestand: s, doelen: 'alle' }], { titel: 'T' }).leerplan)).toEqual(['1.1', '2.1', '2']);
    expect(codes(leerplanUitSelectie([{ bestand: s, doelen: ['2'] }], { titel: 'T' }).leerplan)).toEqual(['2.1']);
  });

  it('een botsing krijgt de stroom, de graad, graad en stroom, of het set-id erbij', () => {
    const a = drieDoelen('ODS_9001', 'a');
    const b = drieDoelen('ODS_9002', 'b', { stroom: 'B-stroom' });
    const tweedeA = drieDoelen('ODS_9003', 'c', { graad: '2de graad' });
    const ookA = drieDoelen('ODS_9004', 'd');
    const zonder = drieDoelen('ODS_9005', 'e', { stroom: undefined, graad: undefined });
    const kies = (...sets: MinimumdoelenSetBestand[]) => codes(leerplanUitSelectie(sets.map((bestand) => ({ bestand, doelen: ['a1', 'b1', 'c1', 'd1', 'e1'] })), { titel: 'T' }).leerplan);

    expect(kies(a, b)).toEqual(['1.01 (A)', '1.01 (B)']);
    expect(kies(a, tweedeA)).toEqual(['1.01 (1STE GRAAD)', '1.01 (2DE GRAAD)']);
    expect(kies(a, b, tweedeA)).toEqual(['1.01 (1STE GRAAD A)', '1.01 (1STE GRAAD B)', '1.01 (2DE GRAAD A)']);
    expect(kies(a, ookA)).toEqual(['1.01 (ODS_9001)', '1.01 (ODS_9004)']);
    expect(kies(a, zonder)).toEqual(['1.01 (ODS_9001)', '1.01 (ODS_9005)']);
  });

  it('alleen de codes die botsen krijgen een onderscheid', () => {
    const a = drieDoelen('ODS_9001', 'a');
    const b = maakSet('ODS_9002', [doel('b1', '1.01', 'Een.'), doel('b2', '9.99', 'Ander.')], { stroom: 'B-stroom' });
    const r = leerplanUitSelectie([{ bestand: a, doelen: 'alle' }, { bestand: b, doelen: 'alle' }], { titel: 'T' });
    expect(codes(r.leerplan)).toEqual(['1.01 (A)', '1.02', '1.03', '1.01 (B)', '9.99']);
    expect(r.bevestigd).toBe(true);
  });

  it('blijft uniek na normalizeGoalCode en hoogstens 60 tekens, ook met lange codes en codes die op een onderscheid lijken', () => {
    // Een code van 40 tekens (de langste die een verwijzing mag hebben) die in de set dubbel is, krijgt het lange nummer
    // van haar rubriek ervoor; met het onderscheid erbij zou ze langer worden dan 60 tekens.
    const z = 'Z'.repeat(40);
    const rubriek = (nr: string) => ({ titels: { '1': { titel: `Rubriek ${nr}`, nr } } });
    const doelenMet = (p: string): Minimumdoel[] => [doel(`${p}1`, z, 'Een.', rubriek('1'.repeat(17))), doel(`${p}2`, z, 'Twee.', rubriek('2'.repeat(17)))];
    const a = maakSet('ODS_9001', [...doelenMet('a'), doel('a3', 'k 1', 'Drie.'), doel('a4', '1.01', 'Vier.')]);
    const b = maakSet('ODS_9002', [...doelenMet('b'), doel('b3', 'K  1', 'Drie.'), doel('b4', '1.01', 'Vier.')], { stroom: 'B-stroom' });
    const c = maakSet('ODS_9003', [doel('c1', '1.01 (A)', 'Vijf.')], {
      korteNaam: 'Ander', naam: 'Secundair onderwijs 2de graad - Vak - Ander - Eindtermen', graad: '2de graad', stroom: undefined,
    });
    const r = leerplanUitSelectie([a, b, c].map((bestand) => ({ bestand, doelen: 'alle' as const })), { titel: 'T' });
    const cs = codes(r.leerplan);
    expect(cs).toHaveLength(9);
    expect(cs.every((x) => x.length <= MAX_DOELCODE)).toBe(true);
    expect(new Set(cs.map(normalizeGoalCode)).size).toBe(cs.length);
    const lang = (nr: string, x: string) => `${nr.repeat(17)}.${'Z'.repeat(MAX_DOELCODE - 17 - 1 - x.length - 3)} (${x})`;
    expect(cs).toEqual([
      lang('1', 'A'), lang('2', 'A'), 'K 1 (A)', '1.01 (A)',
      lang('1', 'B'), lang('2', 'B'), 'K 1 (B)', '1.01 (B)',
      // "1.01 (A)" is in set c een eigen code: het onderscheid van set a neemt ze niet over, maar ze wordt toch uniek.
      '1.01 (A)-2',
    ]);
    expect(cs[0]).toHaveLength(MAX_DOELCODE);
    expect(r.bevestigd).toBe(true);
    // De verwijzing houdt de code van de set.
    expect(r.leerplan.goals[0].refs![0].code).toBe(z);
  });

  it('codes die pas na het inkorten tot 60 tekens gelijk worden, blijven uniek (zo’n lijst wordt niet nagekeken)', () => {
    const s = maakSet('ODS_9001', [doel('1', `${'Y'.repeat(70)}1`, 'Een.'), doel('2', `${'Y'.repeat(70)}2`, 'Twee.')]);
    const r = leerplanUitSelectie([{ bestand: s, doelen: 'alle' }], { titel: 'T' });
    expect(codes(r.leerplan)).toEqual(['Y'.repeat(60), `${'Y'.repeat(58)}-2`]);
    expect(r.leerplan.goals).toHaveLength(2);
    // Een code van meer dan 40 tekens is geen geldige verwijzing: de poort kan niets nakijken.
    expect(r.bevestigd).toBe(false);
  });

  it('een doel dat een te lange code in de set heeft, wordt niet stil nagekeken (de verwijzing valt weg bij het bewaren)', () => {
    const s = maakSet('ODS_9001', [doel('1', 'C'.repeat(41), 'Eerste.'), doel('2', '2', 'Tweede.')]);
    const r = leerplanUitSelectie([{ bestand: s, doelen: 'alle' }], { titel: 'T' });
    expect(r.bevestigd).toBe(false);
    expect(controleStatus(r.leerplan)).toBe('niet-gecontroleerd');
    expect(laatste(r.waarschuwingen)).toMatch(/kon niet als nagekeken bevestigd worden/);
  });
});

// ── De nakijkpoort voor een samengestelde lijst ──────────────────────────────

describe('leerplanUitSelectie: codes bij opnieuw samenstellen (nagemaakte sets)', () => {
  const zonder = drieDoelen('ODS_9001', 'a', { stroom: undefined, graad: undefined });
  const ander = drieDoelen('ODS_9002', 'b', { stroom: undefined, graad: undefined, korteNaam: 'Ander' });

  it('een oude code van een weggelaten doel: het set-id als onderscheid als er geen stroom of graad is', () => {
    const eerst = leerplanUitSelectie([{ bestand: zonder, doelen: ['a1'] }], { titel: 'T' }).leerplan;
    const r = leerplanUitSelectie([{ bestand: ander, doelen: ['b1', 'b2'] }], { titel: 'T', bestaand: eerst });
    expect(codes(r.leerplan)).toEqual(['1.01 (ODS_9002)', '1.02']);
    expect(r.bevestigd).toBe(true);
  });

  it('is ook het onderscheid al een oude code van een ander doel, dan komt er "-2" achter', () => {
    const b = drieDoelen('ODS_9003', 'c', { stroom: 'B-stroom' });
    const eerst = leerplanUitSelectie([{ bestand: zonder, doelen: ['a1', 'a2'] }], { titel: 'T' }).leerplan;
    const bestaand: Curriculum = { ...eerst, goals: eerst.goals.map((g, i) => (i === 1 ? { ...g, code: '1.01 (B)' } : g)) };
    const r = leerplanUitSelectie([{ bestand: b, doelen: ['c1'] }], { titel: 'T', bestaand });
    expect(codes(r.leerplan)).toEqual(['1.01 (B)-2']);
    expect(r.bevestigd).toBe(true);
  });

  it('een doel dat blijft, houdt zijn code ook als die er nu een onderscheid zou krijgen', () => {
    const a = drieDoelen('ODS_9004', 'd');
    const b = drieDoelen('ODS_9005', 'e', { stroom: 'B-stroom' });
    const samen = leerplanUitSelectie([{ bestand: a, doelen: 'alle' }, { bestand: b, doelen: 'alle' }], { titel: 'T' }).leerplan;
    expect(codes(samen)).toEqual(['1.01 (A)', '1.02 (A)', '1.03 (A)', '1.01 (B)', '1.02 (B)', '1.03 (B)']);
    // B weg: A houdt "(A)"; de vrijgekomen gewone code "1.01" mag A niet aannemen (dat zou de code veranderen).
    const zonderB = leerplanUitSelectie([{ bestand: a, doelen: 'alle' }], { titel: 'T', bestaand: samen }).leerplan;
    expect(codes(zonderB)).toEqual(['1.01 (A)', '1.02 (A)', '1.03 (A)']);
  });
});

describe('controleerLeerplan en bevestigSamengesteld: een geknoeide lijst', () => {
  const s1 = drieDoelen('ODS_9001', 'a');
  const s2 = drieDoelen('ODS_9002', 'b', { stroom: 'B-stroom' });
  const { leerplan } = leerplanUitSelectie([{ bestand: s1, doelen: ['a1', 'a3'] }, { bestand: s2, doelen: 'alle' }], { titel: 'T' });
  const metDoelen = (goals: CurriculumGoal[], extra: Partial<Curriculum> = {}): Curriculum => ({ ...leerplan, ...extra, goals });

  it('de verse lijst is nagekeken; zonder bron en zonder fout over ontbrekende doelen', () => {
    expect(controleStatus(leerplan)).toBe('gecontroleerd');
    const r = controleerLeerplan(leerplan, { sets: [s1, s2] });
    expect(r.kanBevestigen).toBe(true);
    expect(r.samenvatting).toBe('5 van 5 doelen letterlijk, 5 van 5 verwijzingen in orde, geen fouten of waarschuwingen.');
    expect(r.bevindingen.map((b) => b.bericht)).toEqual(['Je koos 2 van de 3 doelen van Testvak (ODS_9001).', 'Je koos alle 3 doelen van Testvak (ODS_9002).']);
  });

  it('een gewijzigde tekst: niet nagekeken, en het bewaarde leerplan wordt "gewijzigd"', () => {
    const anders = metDoelen(leerplan.goals.map((g, i) => (i === 0 ? { ...g, text: 'Een verzonnen doel.' } : g)));
    expect(effectieveStatus(anders)).toBe('gewijzigd');
    const r = bevestigSamengesteld(anders, [s1, s2]);
    expect(r.bevestigd).toBe(false);
    expect(r.leerplan.controle).toBeUndefined();
    expect(fouten(r.rapport)[0]).toMatch(/^1\.01 \(A\) is niet gelijk aan de officiële tekst van minimumdoel 1\.01 \(ODS_9001\)\./);
  });

  it('twee keer hetzelfde minimumdoel: een fout', () => {
    const dubbel = metDoelen([...leerplan.goals, { ...leerplan.goals[0], id: 'kopie', code: 'EXTRA' }]);
    const r = controleerLeerplan(dubbel, { sets: [s1, s2] });
    expect(r.kanBevestigen).toBe(false);
    expect(fouten(r)).toEqual(['EXTRA en 1.01 (A) zijn hetzelfde minimumdoel 1.01 (Testvak, ODS_9001): dat doel staat twee keer in de lijst. Laat er één weg.']);
  });

  it('een set die niet meegegeven is: een fout', () => {
    const r = bevestigSamengesteld(leerplan, [s1]);
    expect(r.bevestigd).toBe(false);
    expect(fouten(r.rapport).some((f) => f.includes('zit niet in de meegegeven sets'))).toBe(true);
  });

  it('een verwijzing naar een set buiten `minimumdoelenSets`: een fout, ook als de set meegegeven is', () => {
    const buiten = metDoelen(leerplan.goals, { minimumdoelenSets: ['ODS_9001'] });
    const r = controleerLeerplan(buiten, { sets: [s1, s2] });
    expect(r.kanBevestigen).toBe(false);
    expect(fouten(r)).toContain('1.01 (B) verwijst naar 1.01 (ODS_9002), maar die set hoort niet bij deze lijst. Stel de lijst opnieuw samen.');
    // bevestigSamengesteld gebruikt alleen de sets van de lijst: ook zo geen goedkeuring.
    expect(bevestigSamengesteld(buiten, [s1, s2]).bevestigd).toBe(false);
  });

  it('een doel met twee verwijzingen: een fout', () => {
    const tekst = 'Zelfde tekst.';
    const a = maakSet('ODS_9001', [doel('1', '1', tekst)]);
    const b = maakSet('ODS_9002', [doel('2', '1', tekst)], { stroom: 'B-stroom' });
    const lp = leerplanUitSelectie([{ bestand: a, doelen: 'alle' }], { titel: 'T' }).leerplan;
    const twee = { ...lp, minimumdoelenSets: ['ODS_9001', 'ODS_9002'], goals: [{ ...lp.goals[0], refs: [{ set: 'ODS_9001', id: '1', code: '1' }, { set: 'ODS_9002', id: '2', code: '1' }] }] };
    const r = controleerLeerplan(twee, { sets: [a, b] });
    expect(fouten(r)).toEqual(['1 verwijst naar meer dan één minimumdoel. In een samengestelde lijst is elk doel precies één officieel minimumdoel. Stel de lijst opnieuw samen.']);
  });

  it('een doel zonder verwijzing: een fout', () => {
    const zonder = metDoelen(leerplan.goals.map((g, i) => (i === 1 ? { ...g, refs: undefined } : g)));
    expect(fouten(controleerLeerplan(zonder, { sets: [s1, s2] }))[0]).toMatch(/verwijst niet naar een officieel minimumdoel/);
  });

  it('bevestigSamengesteld weigert een ander soort leerplan, en negeert sets die niet bij de lijst horen', () => {
    expect(() => bevestigSamengesteld(leerplanUitSet(s1).leerplan, [s1])).toThrow(/samengesteld/);
    const r = bevestigSamengesteld(leerplan, [s1, s2, drieDoelen('ODS_9999', 'z'), s1]);
    expect(r.bevestigd).toBe(true);
    expect(r.rapport.dekking.map((d) => d.set)).toEqual(['ODS_9001', 'ODS_9002']);
    expect(r.leerplan.controle).toMatchObject({ status: 'gecontroleerd', door: NAGEKEKEN_DOOR_BRON });
    expect(bevestigSamengesteld(leerplan, [s1, s2], { door: 'Juf Ann', op: 5 }).leerplan.controle).toMatchObject({ door: 'Juf Ann', op: 5 });
    expect(bevestigSamengesteld(leerplan, [s1, s2], { door: '  ' }).leerplan.controle).toMatchObject({ door: NAGEKEKEN_DOOR_BRON });
  });
});

describe('controleerLeerplan: twee keer hetzelfde minimumdoel bij andere herkomsten', () => {
  const s = drieDoelen('ODS_9001', 'a');

  it('officieel: ook een fout', () => {
    const { leerplan } = leerplanUitSet(s);
    const dubbel: Curriculum = { ...leerplan, goals: [...leerplan.goals, { ...leerplan.goals[2], id: 'kopie', code: '1.04' }] };
    expect(fouten(controleerLeerplan(dubbel, { sets: [s] }))).toEqual([
      '1.04 en 1.03 zijn hetzelfde minimumdoel 1.03 (Testvak, ODS_9001): dat doel staat twee keer in de lijst. Laat er één weg.',
    ]);
  });

  it('een leerplan van een net: meer doelen mogen naar hetzelfde minimumdoel verwijzen', () => {
    const ref = { set: 'ODS_9001', id: 'a1', code: '1.01' };
    const cur: Curriculum = {
      id: 'x', title: 'Net', net: 'kov', subject: 'Vak', level: '', createdAt: 1, updatedAt: 1,
      herkomst: { methode: 'pdf', ingelezenOp: 1, bronSha256: 'b'.repeat(64), leerplancode: 'X' },
      goals: [{ id: 'g1', code: 'LPD 1', text: 'Eerste doel.', refs: [ref] }, { id: 'g2', code: 'LPD 2', text: 'Tweede doel.', refs: [ref] }],
    };
    const r = controleerLeerplan(cur, { sets: [s], bronTekst: 'LPD 1 Eerste doel.\nLPD 2 Tweede doel.' });
    expect(r.bevindingen.some((b) => b.bericht.includes('twee keer'))).toBe(false);
    expect(r.kanBevestigen).toBe(true);
  });
});

// ── selectieVanLeerplan, voorstelTitel, telSelectie ──────────────────────────

describe('selectieVanLeerplan', () => {
  const s1 = drieDoelen('ODS_9001', 'a');
  const s2 = drieDoelen('ODS_9002', 'b', { korteNaam: 'Ander' });

  it('geeft per set de gekozen vaste nummers, in de volgorde van `minimumdoelenSets`', () => {
    const { leerplan } = leerplanUitSelectie([{ bestand: s2, doelen: ['b2'] }, { bestand: s1, doelen: ['a3', 'a1'] }], { titel: 'T' });
    expect([...selectieVanLeerplan(leerplan)]).toEqual([['ODS_9002', ['b2']], ['ODS_9001', ['a1', 'a3']]]);
  });

  it('is leeg voor een ander leerplan', () => {
    expect(selectieVanLeerplan(leerplanUitSet(s1).leerplan).size).toBe(0);
    const eigen: Curriculum = { id: 'x', title: 'E', net: 'eigen', subject: '', level: '', goals: [], createdAt: 1, updatedAt: 1 };
    expect(selectieVanLeerplan(eigen).size).toBe(0);
  });

  it('verliest geen verwijzing naar een set buiten `minimumdoelenSets`, en noemt een doel maar één keer', () => {
    const { leerplan } = leerplanUitSelectie([{ bestand: s1, doelen: ['a1'] }, { bestand: s2, doelen: ['b1'] }], { titel: 'T' });
    const geknoeid: Curriculum = { ...leerplan, minimumdoelenSets: ['ODS_9002'], goals: [...leerplan.goals, { ...leerplan.goals[0], id: 'k', code: 'K' }] };
    expect([...selectieVanLeerplan(geknoeid)]).toEqual([['ODS_9002', ['b1']], ['ODS_9001', ['a1']]]);
  });
});

describe('voorstelTitel', () => {
  const bg = (korteNaam: string, stroom = 'A-stroom') => ({
    naam: `Secundair onderwijs 1ste graad ${stroom} -  Competenties - Eindtermen basisgeletterdheid`, korteNaam, graad: '1ste graad', stroom,
  });

  it('basisgeletterdheid', () => {
    expect(voorstelTitel([bg('Nederlands'), bg('STEM'), bg('Digitale competenties')])).toBe('Basisgeletterdheid · 1ste graad A-stroom');
    expect(voorstelTitel([bg('Nederlands'), bg('Nederlands', 'B-stroom')])).toBe('Basisgeletterdheid Nederlands · 1ste graad');
    expect(voorstelTitel([bg('Nederlands'), bg('STEM', 'B-stroom')])).toBe('Basisgeletterdheid · 1ste graad');
    expect(voorstelTitel([bg('Nederlands')])).toBe('Basisgeletterdheid Nederlands · 1ste graad A-stroom');
  });

  it('één set, meer sets, geen sets', () => {
    const stem = { naam: 'Secundair onderwijs 1ste graad A-stroom - STEM - Eindtermen', korteNaam: 'STEM', graad: '1ste graad', stroom: 'A-stroom' };
    expect(voorstelTitel([stem])).toBe('STEM (eigen selectie) · 1ste graad A-stroom');
    expect(voorstelTitel([stem, bg('Nederlands')])).toBe('Eigen selectie minimumdoelen · 1ste graad A-stroom');
    expect(voorstelTitel([{ naam: 'Basisonderwijs - Vak - X' }, { naam: 'Y' }])).toBe('Eigen selectie minimumdoelen');
    expect(voorstelTitel([])).toBe('Eigen selectie minimumdoelen');
    expect(voorstelTitel([{ naam: 'Lange naam zonder korte naam' }])).toBe('Lange naam zonder korte naam (eigen selectie)');
  });
});

describe('telSelectie', () => {
  it('telt wat de lijst zal bevatten', () => {
    const s = maakSet('ODS_9001', [doel('1', '1', 'Een.'), doel(undefined, '2', 'Zonder nummer.'), doel('3', '3', ' '), doel('4', '4', 'Vier.')]);
    const t = drieDoelen('ODS_9002', 'b');
    expect(telSelectie([])).toBe(0);
    expect(telSelectie([{ bestand: s, doelen: 'alle' }])).toBe(2);
    expect(telSelectie([{ bestand: s, doelen: ['1', '3', 'x', '1'] }, { bestand: t, doelen: 'alle' }])).toBe(4);
    const keuzes: SetKeuze[] = [{ bestand: t, doelen: ['b2'] }, { bestand: s, doelen: 'alle' }];
    expect(telSelectie(keuzes)).toBe(leerplanUitSelectie(keuzes, { titel: 'T' }).leerplan.goals.length);
  });
});

describe('leerplanStatus: samengesteld', () => {
  it('isSamengesteld en uitOfficieleBron', () => {
    const s = drieDoelen('ODS_9001', 'a');
    const officieel = leerplanUitSet(s).leerplan;
    const samengesteld = leerplanUitSelectie([{ bestand: s, doelen: 'alle' }], { titel: 'T' }).leerplan;
    const eigen: Curriculum = { id: 'x', title: 'E', net: 'eigen', subject: '', level: '', goals: [], createdAt: 1, updatedAt: 1 };
    expect([isOfficieel(officieel), isSamengesteld(officieel), uitOfficieleBron(officieel)]).toEqual([true, false, true]);
    expect([isOfficieel(samengesteld), isSamengesteld(samengesteld), uitOfficieleBron(samengesteld)]).toEqual([false, true, true]);
    expect([isOfficieel(eigen), isSamengesteld(eigen), uitOfficieleBron(eigen)]).toEqual([false, false, false]);
  });

  it('de sanering behoudt de herkomst "samengesteld"', () => {
    const lp = leerplanUitSelectie([{ bestand: drieDoelen('ODS_9001', 'a'), doelen: 'alle' }], { titel: 'T' }).leerplan;
    expect(sanitizeCurriculum(lp)!.herkomst!.methode).toBe('samengesteld');
    expect(sanitizeCurriculum({ ...lp, herkomst: { methode: 'verzonnen', ingelezenOp: 1 } })!.herkomst).toBeUndefined();
  });
});
