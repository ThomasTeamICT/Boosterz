import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { leerplanUitSelectie, selectieVanLeerplan, telSelectie } from './doelenSamenstellen';
import type { Minimumdoel, MinimumdoelenIndex, MinimumdoelenSetBestand, MinimumdoelenSetKop } from './minimumdoelen';
import { filterSets, zoekTermen } from './minimumdoelenBron';
import { naarSetKeuzes } from './richtingKader';
import {
  GRAAD_MET_STROMEN, MAX_GEKOZEN_SETS, ZIN_A_EN_B, ZIN_GEWOON_EN_BUITENGEWOON, ZIN_LIJST_MENGT_STROMEN, ZIN_TWEELING_GEKOZEN, aantalPerSoort, beginLeerlingen,
  haalStroomWeg, haalTweelingenWeg, mengtGewoonEnBuitengewoon, mengtStromen, pasLeerlingenToe, setsMetTweeling, stromenIn, tweelingParen, zinNaWeghalen,
  zinTweelingenInLijst, zinVerborgenSets, type LeerlingenFilter, type SetVoorSturing,
  aantalGekozen, aantalGevraagdeSets, beginUitKeuze, beginUitSelectie, beginUitSets, bouwSetKeuzes, haalSetWeg, isDoelGekozen, isSetGekozen, kanSetToevoegen,
  kiesbareDoelen, leegKeuze, ontbreektInStap1, ontbreektInStap2, ontbreektInStap3, setKenmerken, setNaam, setsUitParam, telGekozen, telGevonden, toestandVanSet,
  vindDoelen, voegSetToe, wisselSet, zegOntbreekt, zetDoel, zetDoelen, zetGevonden, zetHeleSet, type KiesbaarDoel, type SamenstelKeuze,
} from './samenstelKeuze';

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
      naamsvermelding: 'Bron: Vlaamse overheid, Onderwijs en Vorming (onderwijsdoelen.be)',
      licentie: 'nog te bevestigen', opgehaald: '2026-10-05T12:20:49Z', aantal: doelen.length, sha256: 'a'.repeat(64),
      ...kop,
    },
    doelen,
  };
}

/** Een set met drie gewone doelen (ids `<prefix>1` tot `<prefix>3`). */
function drieDoelen(id: string, prefix: string, kop: Partial<MinimumdoelenSetKop> = {}): MinimumdoelenSetBestand {
  return maakSet(id, [
    doel(`${prefix}1`, '1.01', `Eerste doel van ${id}.`),
    doel(`${prefix}2`, '1.02', `Tweede doel van ${id}.`),
    doel(`${prefix}3`, '1.03', `Derde doel van ${id}.`),
  ], kop);
}

const A = drieDoelen('ODS_1', 'a');
const B = drieDoelen('ODS_2', 'b');
const C = drieDoelen('ODS_3', 'c');
const kiesA = kiesbareDoelen(A);
const kiesB = kiesbareDoelen(B);

const ids = (lijst: readonly KiesbaarDoel[]) => lijst.map((d) => d.id);
const gekozen = (k: SamenstelKeuze, setId: string, kiesbaar: readonly KiesbaarDoel[]) => kiesbaar.filter((d) => isDoelGekozen(k, setId, d.id)).map((d) => d.id);

// ── Beginstaat ──────────────────────────────────────────────────────────────

describe('beginstaat', () => {
  it('begint leeg', () => {
    const k = leegKeuze();
    expect(k.sets).toEqual([]);
    expect(k.selectie.size).toBe(0);
  });

  it('?sets=: alleen geldige ids, zonder dubbels, in volgorde', () => {
    expect(setsUitParam('ODS_3283,ODS_3343')).toEqual(['ODS_3283', 'ODS_3343']);
    expect(setsUitParam(' ODS_1 , foo,ODS_1,,ODS_2 ')).toEqual(['ODS_1', 'ODS_2']);
    expect(setsUitParam('../../etc/passwd,ODS_9')).toEqual(['ODS_9']);
    expect(setsUitParam('')).toEqual([]);
    expect(setsUitParam(null)).toEqual([]);
    expect(setsUitParam(undefined)).toEqual([]);
  });

  it('?sets=: hoogstens het maximum aantal sets', () => {
    const veel = Array.from({ length: MAX_GEKOZEN_SETS + 5 }, (_, i) => `ODS_${i + 1}`).join(',');
    expect(setsUitParam(veel)).toHaveLength(MAX_GEKOZEN_SETS);
  });

  it('uit sets: elke set helemaal gekozen, in volgorde, zonder dubbels', () => {
    const k = beginUitSets(['ODS_2', 'ODS_1', 'ODS_2']);
    expect(k.sets).toEqual(['ODS_2', 'ODS_1']);
    expect(k.selectie.get('ODS_2')).toBe('alle');
    expect(k.selectie.get('ODS_1')).toBe('alle');
  });

  it('uit sets met "leeg": elke set gekozen maar met niets aangevinkt, ook niet in het totaal', () => {
    const kiesbaar = new Map([['ODS_1', kiesA], ['ODS_2', kiesB]]);
    const k = beginUitSets(['ODS_2', 'ODS_1', 'ODS_2'], true);
    expect(k.sets).toEqual(['ODS_2', 'ODS_1']);
    expect(toestandVanSet(k, 'ODS_2', kiesB)).toBe('geen');
    expect(toestandVanSet(k, 'ODS_1', kiesA)).toBe('geen');
    expect(telGekozen(k, kiesbaar)).toEqual({ doelen: 0, sets: 0 });
    expect(bouwSetKeuzes(k, new Map([['ODS_1', A], ['ODS_2', B]]))).toEqual([]);
    // Een doel aanvinken werkt gewoon vanuit de lege staat.
    const een = zetDoel(k, 'ODS_2', 'b1', true, kiesB);
    expect(gekozen(een, 'ODS_2', kiesB)).toEqual(['b1']);
    expect(telGekozen(een, kiesbaar)).toEqual({ doelen: 1, sets: 1 });
  });

  it('uit sets zonder "leeg" blijft alles gekozen', () => {
    const k = beginUitSets(['ODS_1'], false);
    expect(toestandVanSet(k, 'ODS_1', kiesA)).toBe('alle');
  });

  it('aantal gevraagde sets in ?sets=: verschillende niet-lege delen, ook de ongeldige en die boven het maximum', () => {
    expect(aantalGevraagdeSets('ODS_3343,ODS_999999,foo')).toBe(3);
    expect(aantalGevraagdeSets('foo,bar')).toBe(2);
    expect(aantalGevraagdeSets(' ODS_1 , foo,ODS_1,,ODS_2 ')).toBe(3);
    expect(aantalGevraagdeSets('')).toBe(0);
    expect(aantalGevraagdeSets(',,')).toBe(0);
    expect(aantalGevraagdeSets(null)).toBe(0);
    expect(aantalGevraagdeSets(undefined)).toBe(0);
    const veel = Array.from({ length: MAX_GEKOZEN_SETS + 5 }, (_, i) => `ODS_${i + 1}`).join(',');
    expect(aantalGevraagdeSets(veel)).toBe(MAX_GEKOZEN_SETS + 5);
    expect(aantalGevraagdeSets(veel) - setsUitParam(veel).length).toBe(5);
  });

  it('uit een bewaarde lijst (selectieVanLeerplan): de sets en doelen van de lijst, in volgorde', () => {
    const r = leerplanUitSelectie([{ bestand: B, doelen: ['b1', 'b3'] }, { bestand: A, doelen: 'alle' }], { titel: 'Test' });
    const k = beginUitSelectie(selectieVanLeerplan(r.leerplan));
    expect(k.sets).toEqual(['ODS_2', 'ODS_1']);
    expect(gekozen(k, 'ODS_2', kiesB)).toEqual(['b1', 'b3']);
    expect(toestandVanSet(k, 'ODS_2', kiesB)).toBe('deel');
    expect(toestandVanSet(k, 'ODS_1', kiesA)).toBe('alle');
    // Terug naar dezelfde selectie, dus dezelfde doelen.
    const opnieuw = leerplanUitSelectie(bouwSetKeuzes(k, new Map([['ODS_1', A], ['ODS_2', B]])), { titel: 'Test', bestaand: r.leerplan });
    expect(opnieuw.leerplan.goals.map((g) => g.refs![0].id)).toEqual(r.leerplan.goals.map((g) => g.refs![0].id));
  });

  it('uit een bewaarde lijst: een set zonder doelen telt niet mee', () => {
    const k = beginUitSelectie(new Map([['ODS_1', ['a1']], ['ODS_2', []]]));
    expect(k.sets).toEqual(['ODS_1']);
  });

  it('uit een bewaarde lijst van een ander leerplan: leeg', () => {
    expect(beginUitSelectie(new Map()).sets).toEqual([]);
  });
});

// ── Beginnen met een keuze per set (een studierichting) ─────────────────────

describe('beginUitKeuze', () => {
  it('"alle" is een hele set, een lijst zijn precies die nummers; in de volgorde van de lijst', () => {
    const k = beginUitKeuze(new Map<string, 'alle' | readonly string[]>([['ODS_2', ['b1', 'b3']], ['ODS_1', 'alle']]));
    expect(k.sets).toEqual(['ODS_2', 'ODS_1']);
    expect(k.selectie.get('ODS_1')).toBe('alle');
    expect(gekozen(k, 'ODS_2', kiesB)).toEqual(['b1', 'b3']);
    expect(toestandVanSet(k, 'ODS_2', kiesB)).toBe('deel');
    expect(toestandVanSet(k, 'ODS_1', kiesA)).toBe('alle');
  });

  it('een lege lijst is een gekozen set waarvan niets aangevinkt staat (anders dan bij beginUitSelectie)', () => {
    const k = beginUitKeuze(new Map<string, 'alle' | readonly string[]>([['ODS_1', []], ['ODS_2', 'alle']]));
    expect(k.sets).toEqual(['ODS_1', 'ODS_2']);
    expect(isSetGekozen(k, 'ODS_1')).toBe(true);
    expect(toestandVanSet(k, 'ODS_1', kiesA)).toBe('geen');
    expect(aantalGekozen(k, 'ODS_1', kiesA)).toBe(0);
    // Nu kan de leerkracht er doelen bij aanvinken.
    const meer = zetDoel(k, 'ODS_1', 'a2', true, kiesA);
    expect(gekozen(meer, 'ODS_1', kiesA)).toEqual(['a2']);
    // beginUitSelectie laat zo'n set daarentegen weg.
    expect(beginUitSelectie(new Map([['ODS_1', []]])).sets).toEqual([]);
  });

  it('een lijst blijft een lijst, ook als ze toevallig alle doelen noemt', () => {
    const k = beginUitKeuze(new Map([['ODS_1', ['a1', 'a2', 'a3']]]));
    expect(k.selectie.get('ODS_1')).toBeInstanceOf(Set);
    expect(toestandVanSet(k, 'ODS_1', kiesA)).toBe('alle');
  });

  it('een set die twee keer voorkomt, een lege naam en een lijst met rommel tellen niet fout', () => {
    const k = beginUitKeuze(new Map<string, 'alle' | readonly string[]>([['ODS_1', ['a1', '', ' ', 5 as unknown as string]], ['', 'alle'], ['  ', 'alle']]));
    expect(k.sets).toEqual(['ODS_1']);
    expect([...(k.selectie.get('ODS_1') as ReadonlySet<string>)]).toEqual(['a1']);
  });

  it('hoogstens het maximum aantal sets', () => {
    const veel = new Map<string, 'alle'>(Array.from({ length: MAX_GEKOZEN_SETS + 3 }, (_, i) => [`ODS_${i + 1}`, 'alle'] as const));
    expect(beginUitKeuze(veel).sets).toHaveLength(MAX_GEKOZEN_SETS);
  });

  it('een lege selectie geeft een lege keuze', () => {
    expect(beginUitKeuze(new Map())).toEqual(leegKeuze());
  });
});

// ── Sets kiezen ─────────────────────────────────────────────────────────────

describe('sets toevoegen en weghalen', () => {
  it('een nieuwe set komt achteraan en staat helemaal aangevinkt', () => {
    let k = leegKeuze();
    k = voegSetToe(k, 'ODS_2');
    k = voegSetToe(k, 'ODS_1');
    expect(k.sets).toEqual(['ODS_2', 'ODS_1']);
    expect(isSetGekozen(k, 'ODS_1')).toBe(true);
    expect(toestandVanSet(k, 'ODS_1', kiesA)).toBe('alle');
    expect(aantalGekozen(k, 'ODS_1', kiesA)).toBe(3);
  });

  it('dezelfde set twee keer toevoegen verandert niets', () => {
    const k = voegSetToe(leegKeuze(), 'ODS_1');
    expect(voegSetToe(k, 'ODS_1')).toBe(k);
  });

  it('een set weghalen verliest zijn keuze; opnieuw toevoegen begint weer helemaal aangevinkt', () => {
    let k = voegSetToe(voegSetToe(leegKeuze(), 'ODS_1'), 'ODS_2');
    k = zetDoel(k, 'ODS_1', 'a2', false, kiesA);
    expect(toestandVanSet(k, 'ODS_1', kiesA)).toBe('deel');
    k = haalSetWeg(k, 'ODS_1');
    expect(k.sets).toEqual(['ODS_2']);
    expect(isSetGekozen(k, 'ODS_1')).toBe(false);
    expect(k.selectie.has('ODS_1')).toBe(false);
    k = voegSetToe(k, 'ODS_1');
    expect(k.sets).toEqual(['ODS_2', 'ODS_1']);
    expect(toestandVanSet(k, 'ODS_1', kiesA)).toBe('alle');
  });

  it('een set weghalen die er niet in zit, verandert niets', () => {
    const k = voegSetToe(leegKeuze(), 'ODS_1');
    expect(haalSetWeg(k, 'ODS_9')).toBe(k);
  });

  it('wisselen voegt toe of haalt weg', () => {
    let k = wisselSet(leegKeuze(), 'ODS_1');
    expect(k.sets).toEqual(['ODS_1']);
    k = wisselSet(k, 'ODS_1');
    expect(k.sets).toEqual([]);
  });

  it('de staat is onveranderlijk: de oude staat blijft zoals hij was', () => {
    const k1 = voegSetToe(leegKeuze(), 'ODS_1');
    const k2 = voegSetToe(k1, 'ODS_2');
    const k3 = zetDoel(k2, 'ODS_1', 'a1', false, kiesA);
    expect(k1.sets).toEqual(['ODS_1']);
    expect(k2.sets).toEqual(['ODS_1', 'ODS_2']);
    expect(k2.selectie.get('ODS_1')).toBe('alle');
    expect(k3.selectie.get('ODS_1')).not.toBe('alle');
  });

  it('er past een maximum aantal sets in', () => {
    let k = leegKeuze();
    for (let i = 1; i <= MAX_GEKOZEN_SETS; i++) k = voegSetToe(k, `ODS_${i}`);
    expect(kanSetToevoegen(k)).toBe(false);
    expect(voegSetToe(k, 'ODS_999')).toBe(k);
    expect(k.sets).toHaveLength(MAX_GEKOZEN_SETS);
    const kleiner = haalSetWeg(k, 'ODS_1');
    expect(kanSetToevoegen(kleiner)).toBe(true);
  });
});

describe('namen van sets', () => {
  it('de korte naam, of anders de naam', () => {
    expect(setNaam({ naam: 'Secundair onderwijs - Vak - Nederlands', korteNaam: 'Nederlands' })).toBe('Nederlands');
    expect(setNaam({ naam: ' Lange naam ' })).toBe('Lange naam');
    expect(setNaam({ naam: 'Lange naam', korteNaam: '  ' })).toBe('Lange naam');
  });

  it('kenmerken: soort (niet bij het gewone secundair), graad, stroom en context', () => {
    expect(setKenmerken({ naam: 'Secundair onderwijs 1ste graad A-stroom - Vak - Aardrijkskunde - Eindtermen', graad: '1ste graad', stroom: 'A-stroom' })).toBe('1ste graad · A-stroom');
    expect(setKenmerken({ naam: 'Buitengewoon Secundair onderwijs 1ste graad A-stroom Opleidingsvorm 4 -  Competenties in het Nederlands - Eindtermen basisgeletterdheid', graad: '1ste graad', stroom: 'A-stroom' }))
      .toMatch(/^Buitengewoon secundair onderwijs · 1ste graad · A-stroom · /);
    expect(setKenmerken({ naam: 'Iets anders' })).toMatch(/^Ander onderwijs/);
  });
});

// ── Doelen kiezen ───────────────────────────────────────────────────────────

describe('kiesbare doelen', () => {
  it('neemt doelen met vast nummer en tekst, in de volgorde van de set; de tekst is gewone tekst', () => {
    const b = maakSet('ODS_7', [
      doel('1', '1.01', '<p>Eerste &amp; <strong>beste</strong></p>', { optioneel: true, titels: { 1: { titel: 'Rubriek A' }, 2: { titel: 'Deel 1' } } }),
      doel(undefined, '1.02', 'Zonder vast nummer.'),
      doel('3', '1.03', '<p>&nbsp;</p>'),
      doel('4', '1.04', 'Een attitude.', { attitude: 1 }),
    ]);
    const lijst = kiesbareDoelen(b);
    expect(ids(lijst)).toEqual(['1', '4']);
    expect(lijst[0]).toMatchObject({ code: '1.01', tekst: 'Eerste & beste', rubriek: 'Rubriek A › Deel 1', optioneel: true, attitude: false });
    expect(lijst[1]).toMatchObject({ rubriek: undefined, optioneel: false, attitude: true });
  });

  it('een vast nummer dat twee keer voorkomt telt één keer', () => {
    const b = maakSet('ODS_7', [doel('1', '1.01', 'Eerste.'), doel('1', '1.02', 'Tweede.')]);
    expect(ids(kiesbareDoelen(b))).toEqual(['1']);
  });

  it('geeft per bestand steeds dezelfde lijst', () => {
    expect(kiesbareDoelen(A)).toBe(kiesbareDoelen(A));
  });
});

describe('doelen aan- en uitvinken', () => {
  const start = () => voegSetToe(voegSetToe(leegKeuze(), 'ODS_1'), 'ODS_2');

  it('één doel uitvinken laat de andere van de set aangevinkt, en geeft de toestand "deel"', () => {
    const k = zetDoel(start(), 'ODS_1', 'a2', false, kiesA);
    expect(gekozen(k, 'ODS_1', kiesA)).toEqual(['a1', 'a3']);
    expect(toestandVanSet(k, 'ODS_1', kiesA)).toBe('deel');
    expect(aantalGekozen(k, 'ODS_1', kiesA)).toBe(2);
    // De andere set blijft helemaal gekozen.
    expect(toestandVanSet(k, 'ODS_2', kiesB)).toBe('alle');
  });

  it('het laatste doel opnieuw aanvinken maakt er weer "alle" van', () => {
    let k = zetDoel(start(), 'ODS_1', 'a2', false, kiesA);
    k = zetDoel(k, 'ODS_1', 'a2', true, kiesA);
    expect(toestandVanSet(k, 'ODS_1', kiesA)).toBe('alle');
    expect(k.selectie.get('ODS_1')).toBe('alle');
  });

  it('alle doelen een voor een uitvinken geeft "geen", en weer aanvinken geeft "deel"', () => {
    let k = start();
    for (const d of kiesA) k = zetDoel(k, 'ODS_1', d.id, false, kiesA);
    expect(toestandVanSet(k, 'ODS_1', kiesA)).toBe('geen');
    expect(aantalGekozen(k, 'ODS_1', kiesA)).toBe(0);
    k = zetDoel(k, 'ODS_1', 'a3', true, kiesA);
    expect(toestandVanSet(k, 'ODS_1', kiesA)).toBe('deel');
    expect(gekozen(k, 'ODS_1', kiesA)).toEqual(['a3']);
  });

  it('een set die gekozen blijft zonder doelen, blijft in de lijst staan (met "geen")', () => {
    const k = zetHeleSet(start(), 'ODS_1', false);
    expect(k.sets).toEqual(['ODS_1', 'ODS_2']);
    expect(toestandVanSet(k, 'ODS_1', kiesA)).toBe('geen');
  });

  it('hele set: aan geeft "alle", uit geeft "geen", ook als er maar een deel gekozen was', () => {
    let k = zetDoel(start(), 'ODS_1', 'a1', false, kiesA);
    expect(toestandVanSet(k, 'ODS_1', kiesA)).toBe('deel');
    k = zetHeleSet(k, 'ODS_1', true);
    expect(toestandVanSet(k, 'ODS_1', kiesA)).toBe('alle');
    k = zetHeleSet(k, 'ODS_1', false);
    expect(toestandVanSet(k, 'ODS_1', kiesA)).toBe('geen');
    k = zetHeleSet(k, 'ODS_1', true);
    expect(gekozen(k, 'ODS_1', kiesA)).toEqual(['a1', 'a2', 'a3']);
  });

  it('een set die niet gekozen is, kan niet gewijzigd worden', () => {
    const k = start();
    expect(zetHeleSet(k, 'ODS_9', true)).toBe(k);
    expect(zetDoel(k, 'ODS_9', 'x', true, [])).toBe(k);
  });

  it('een set zonder kiesbare doelen heeft de toestand "geen"', () => {
    const k = voegSetToe(leegKeuze(), 'ODS_5');
    expect(toestandVanSet(k, 'ODS_5', [])).toBe('geen');
    expect(aantalGekozen(k, 'ODS_5', [])).toBe(0);
  });

  it('een gekozen nummer dat niet (meer) in de set staat, blijft staan maar telt niet mee', () => {
    const k = beginUitSelectie(new Map([['ODS_1', ['a1', 'weg']]]));
    expect(aantalGekozen(k, 'ODS_1', kiesA)).toBe(1);
    expect(toestandVanSet(k, 'ODS_1', kiesA)).toBe('deel');
    // Alle echte doelen aanvinken laat het onbekende nummer staan: het blijft een expliciete keuze (en een waarschuwing).
    const alles = zetDoelen(k, 'ODS_1', ['a2', 'a3'], true, kiesA);
    expect(alles.selectie.get('ODS_1')).not.toBe('alle');
    expect(toestandVanSet(alles, 'ODS_1', kiesA)).toBe('alle');
    const keuzes = bouwSetKeuzes(alles, new Map([['ODS_1', A]]));
    expect(keuzes[0].doelen).toEqual(expect.arrayContaining(['a1', 'a2', 'a3', 'weg']));
    const r = leerplanUitSelectie(keuzes, { titel: 'Test' });
    expect(r.leerplan.goals).toHaveLength(3);
    expect(r.waarschuwingen.join(' ')).toMatch(/1 gekozen doel staat niet \(meer\) in de set/);
    // De hele set aanvinken ruimt het onbekende nummer op.
    expect(zetHeleSet(alles, 'ODS_1', true).selectie.get('ODS_1')).toBe('alle');
  });
});

// ── Zoeken over alle gekozen sets ───────────────────────────────────────────

describe('gevonden doelen aan- en uitvinken', () => {
  const kiesbaar = new Map([['ODS_1', kiesA], ['ODS_2', kiesB]]);
  const start = () => voegSetToe(voegSetToe(leegKeuze(), 'ODS_1'), 'ODS_2');

  it('zoekt in alle gekozen sets op code, tekst en rubriek, zonder accenten', () => {
    const c = maakSet('ODS_4', [
      doel('1', '4.01', 'De leerlingen gebruiken energie.', { titels: { 1: { titel: 'Énergie en materie' } } }),
      doel('2', '4.02', 'De leerlingen meten.'),
    ]);
    const kies = new Map([...kiesbaar, ['ODS_4', kiesbareDoelen(c)]]);
    expect(telGevonden(vindDoelen(kies, zoekTermen('energie')))).toBe(1);
    expect(telGevonden(vindDoelen(kies, zoekTermen('tweede')))).toBe(2);
    expect(telGevonden(vindDoelen(kies, zoekTermen('1.02')))).toBe(2);
    expect(telGevonden(vindDoelen(kies, zoekTermen('zzz')))).toBe(0);
    // Zonder zoekwoorden is alles "gevonden".
    expect(telGevonden(vindDoelen(kies, []))).toBe(8);
  });

  it('"vink de gevonden doelen uit" laat de rest aangevinkt, "aan" vinkt ze weer aan', () => {
    const gevonden = vindDoelen(kiesbaar, zoekTermen('tweede'));
    let k = zetGevonden(start(), gevonden, false, kiesbaar);
    expect(gekozen(k, 'ODS_1', kiesA)).toEqual(['a1', 'a3']);
    expect(gekozen(k, 'ODS_2', kiesB)).toEqual(['b1', 'b3']);
    expect(telGekozen(k, kiesbaar)).toEqual({ doelen: 4, sets: 2 });
    k = zetGevonden(k, gevonden, true, kiesbaar);
    expect(telGekozen(k, kiesbaar)).toEqual({ doelen: 6, sets: 2 });
    expect(toestandVanSet(k, 'ODS_1', kiesA)).toBe('alle');
  });

  it('eerst alles uit, dan de gevonden doelen aan: alleen die zijn gekozen', () => {
    let k = zetHeleSet(zetHeleSet(start(), 'ODS_1', false), 'ODS_2', false);
    expect(telGekozen(k, kiesbaar)).toEqual({ doelen: 0, sets: 0 });
    const gevonden = vindDoelen(kiesbaar, zoekTermen('derde ODS_2'));
    expect(telGevonden(gevonden)).toBe(1);
    k = zetGevonden(k, gevonden, true, kiesbaar);
    expect(gekozen(k, 'ODS_2', kiesB)).toEqual(['b3']);
    expect(telGekozen(k, kiesbaar)).toEqual({ doelen: 1, sets: 1 });
    expect(toestandVanSet(k, 'ODS_1', kiesA)).toBe('geen');
  });

  it('niets gevonden: niets verandert', () => {
    const k = start();
    expect(zetGevonden(k, vindDoelen(kiesbaar, zoekTermen('zzz')), false, kiesbaar)).toEqual(k);
  });

  it('een gevonden doel in een set die niet gekozen is, doet niets', () => {
    const k = voegSetToe(leegKeuze(), 'ODS_1');
    const gevonden = vindDoelen(kiesbaar, zoekTermen('ODS_2'));
    const na = zetGevonden(k, gevonden, true, kiesbaar);
    expect(na.sets).toEqual(['ODS_1']);
    expect(na.selectie.has('ODS_2')).toBe(false);
  });
});

// ── Totalen ─────────────────────────────────────────────────────────────────

describe('totalen', () => {
  const kiesbaar = new Map([['ODS_1', kiesA], ['ODS_2', kiesB]]);

  it('telt doelen en sets met minstens één gekozen doel', () => {
    let k = voegSetToe(voegSetToe(leegKeuze(), 'ODS_1'), 'ODS_2');
    expect(telGekozen(k, kiesbaar)).toEqual({ doelen: 6, sets: 2 });
    k = zetHeleSet(k, 'ODS_2', false);
    expect(telGekozen(k, kiesbaar)).toEqual({ doelen: 3, sets: 1 });
  });

  it('een set die nog niet geladen is, telt niet mee', () => {
    const k = voegSetToe(voegSetToe(leegKeuze(), 'ODS_1'), 'ODS_2');
    expect(telGekozen(k, new Map([['ODS_1', kiesA]]))).toEqual({ doelen: 3, sets: 1 });
  });
});

// ── De selectie voor leerplanUitSelectie ────────────────────────────────────

describe('bouwSetKeuzes', () => {
  const bestanden = new Map([['ODS_1', A], ['ODS_2', B], ['ODS_3', C]]);

  it('"alle" als alles gekozen is, in de volgorde van kiezen', () => {
    const k = voegSetToe(voegSetToe(leegKeuze(), 'ODS_2'), 'ODS_1');
    const keuzes = bouwSetKeuzes(k, bestanden);
    expect(keuzes.map((s) => s.bestand.set.id)).toEqual(['ODS_2', 'ODS_1']);
    expect(keuzes.map((s) => s.doelen)).toEqual(['alle', 'alle']);
  });

  it('de gekozen nummers als een deel gekozen is; "alle" zodra alles weer gekozen is', () => {
    let k = voegSetToe(leegKeuze(), 'ODS_1');
    k = zetDoel(k, 'ODS_1', 'a2', false, kiesA);
    expect(bouwSetKeuzes(k, bestanden)).toEqual([{ bestand: A, doelen: expect.arrayContaining(['a1', 'a3']) }]);
    expect((bouwSetKeuzes(k, bestanden)[0].doelen as string[])).toHaveLength(2);
    k = zetDoel(k, 'ODS_1', 'a2', true, kiesA);
    expect(bouwSetKeuzes(k, bestanden)[0].doelen).toBe('alle');
  });

  it('een expliciete keuze van alle doelen wordt ook "alle"', () => {
    const k = beginUitSelectie(new Map([['ODS_1', ['a3', 'a1', 'a2']]]));
    expect(bouwSetKeuzes(k, bestanden)[0].doelen).toBe('alle');
  });

  it('een set zonder gekozen doelen of zonder geladen bestand valt weg', () => {
    let k = voegSetToe(voegSetToe(voegSetToe(leegKeuze(), 'ODS_1'), 'ODS_2'), 'ODS_9');
    k = zetHeleSet(k, 'ODS_2', false);
    const keuzes = bouwSetKeuzes(k, bestanden);
    expect(keuzes.map((s) => s.bestand.set.id)).toEqual(['ODS_1']);
  });

  it('zonder één doel geeft leerplanUitSelectie geen lijst: dan niet bewaren', () => {
    let k = voegSetToe(leegKeuze(), 'ODS_1');
    k = zetHeleSet(k, 'ODS_1', false);
    const keuzes = bouwSetKeuzes(k, bestanden);
    expect(keuzes).toEqual([]);
    const r = leerplanUitSelectie(keuzes, { titel: 'Test' });
    expect(r.leerplan.goals).toHaveLength(0);
    expect(r.bevestigd).toBe(false);
  });

  it('het totaal van de pagina is het aantal doelen van de lijst', () => {
    let k = voegSetToe(voegSetToe(leegKeuze(), 'ODS_1'), 'ODS_2');
    k = zetDoel(k, 'ODS_1', 'a1', false, kiesA);
    k = zetDoel(k, 'ODS_2', 'b2', false, kiesB);
    const keuzes = bouwSetKeuzes(k, bestanden);
    const totaal = telGekozen(k, new Map([['ODS_1', kiesA], ['ODS_2', kiesB]]));
    expect(telSelectie(keuzes)).toBe(totaal.doelen);
    const r = leerplanUitSelectie(keuzes, { titel: 'Test' });
    expect(r.leerplan.goals).toHaveLength(totaal.doelen);
    expect(r.bevestigd).toBe(true);
  });
});

// ── Valkuil: een deelset blijft een deelset (docs/STUDIERICHTINGEN.md § 9.5) ─

describe('een deelset van een studierichting blijft een deelset', () => {
  const NAAM = 'Secundair onderwijs 2de graad -  Biologie - Cesuurdoelen';
  const dertien = maakSet('ODS_13', Array.from({ length: 13 }, (_, i) => doel(`d${i + 1}`, `1.${String(i + 1).padStart(2, '0')}`, `Biologiedoel ${i + 1}.`)), { naam: NAAM, korteNaam: 'Biologie' });
  const vier = ['d3', 'd5', 'd8', 'd12'];
  const kiesDertien = kiesbareDoelen(dertien);
  const bestanden = new Map([['ODS_13', dertien], ['ODS_1', A]]);

  it('4 van 13 blijft 4 doelen na beginUitKeuze en bouwSetKeuzes', () => {
    const k = beginUitKeuze(new Map([['ODS_13', vier]]));
    expect(toestandVanSet(k, 'ODS_13', kiesDertien)).toBe('deel');
    expect(telGekozen(k, new Map([['ODS_13', kiesDertien]]))).toEqual({ doelen: 4, sets: 1 });
    const keuzes = bouwSetKeuzes(k, bestanden);
    expect(keuzes).toHaveLength(1);
    expect(keuzes[0].doelen).not.toBe('alle');
    expect(keuzes[0].doelen).toHaveLength(4);
    expect([...(keuzes[0].doelen as string[])].sort()).toEqual([...vier].sort());
    const r = leerplanUitSelectie(keuzes, { titel: 'Biologie' });
    expect(r.bevestigd).toBe(true);
    expect(r.leerplan.goals).toHaveLength(4);
    expect(telSelectie(keuzes)).toBe(4);
  });

  it('en ook na naarSetKeuzes: de selectie van het kader gaat via beginUitKeuze naar dezelfde 4 doelen', () => {
    const { keuzes: eerste } = naarSetKeuzes(new Map<string, 'alle' | readonly string[]>([['ODS_13', vier], ['ODS_1', 'alle']]), bestanden);
    expect(eerste.map((s) => s.doelen)).toEqual([vier, 'alle']);
    const k = beginUitKeuze(new Map<string, 'alle' | readonly string[]>([['ODS_13', vier], ['ODS_1', 'alle']]));
    const keuzes = bouwSetKeuzes(k, bestanden);
    expect(keuzes.map((s) => (s.doelen === 'alle' ? 'alle' : s.doelen.length))).toEqual([4, 'alle']);
    const r = leerplanUitSelectie(keuzes, { titel: 'Test' });
    expect(r.leerplan.goals).toHaveLength(4 + 3);
  });

  it('een doel erbij of eraf aanvinken in de wizard verandert niets aan de rest van de deelset', () => {
    let k = beginUitKeuze(new Map([['ODS_13', vier]]));
    k = zetDoel(k, 'ODS_13', 'd1', true, kiesDertien);
    expect(gekozen(k, 'ODS_13', kiesDertien).sort()).toEqual(['d1', 'd12', 'd3', 'd5', 'd8']);
    k = zetDoel(k, 'ODS_13', 'd3', false, kiesDertien);
    expect(bouwSetKeuzes(k, bestanden)[0].doelen).toHaveLength(4);
  });

  it('de valkuil zelf: een beperkte lijst "kiesbare" doelen maakt van 4 stilletjes alle 13 (daarom geeft geen scherm er een door)', () => {
    const beperkt = kiesDertien.filter((d) => vier.includes(d.id));
    let k = beginUitKeuze(new Map([['ODS_13', vier.slice(0, 3)]]));
    k = zetDoel(k, 'ODS_13', 'd12', true, beperkt);
    expect(k.selectie.get('ODS_13')).toBe('alle');
    expect(bouwSetKeuzes(k, bestanden)[0].doelen).toBe('alle');
    // Met de doelen van de hele set blijft het bij 4.
    let goed = beginUitKeuze(new Map([['ODS_13', vier.slice(0, 3)]]));
    goed = zetDoel(goed, 'ODS_13', 'd12', true, kiesDertien);
    expect(bouwSetKeuzes(goed, bestanden)[0].doelen).toHaveLength(4);
  });
});

// ── Wat ontbreekt ───────────────────────────────────────────────────────────

describe('wat ontbreekt', () => {
  it('stap 1: minstens één set', () => {
    expect(zegOntbreekt(ontbreektInStap1(leegKeuze()))).toBe('Nog nodig: kies minstens één set.');
    expect(ontbreektInStap1(voegSetToe(leegKeuze(), 'ODS_1'))).toEqual([]);
  });

  it('stap 2: wachten, mislukte sets, en minstens één doel', () => {
    expect(zegOntbreekt(ontbreektInStap2(1, 0, 0))).toBe('Nog nodig: wacht tot de sets geladen zijn.');
    expect(zegOntbreekt(ontbreektInStap2(0, 1, 5))).toBe('Nog nodig: probeer de sets die niet laadden opnieuw, of haal ze weg.');
    expect(zegOntbreekt(ontbreektInStap2(0, 0, 0))).toBe('Nog nodig: kies minstens één doel.');
    expect(ontbreektInStap2(0, 0, 3)).toEqual([]);
  });

  it('stap 3: een naam en minstens één doel', () => {
    expect(zegOntbreekt(ontbreektInStap3('  ', 0))).toBe('Nog nodig: geef de lijst een naam en kies minstens één doel.');
    expect(zegOntbreekt(ontbreektInStap3('Mijn lijst', 0))).toBe('Nog nodig: kies minstens één doel.');
    expect(zegOntbreekt(ontbreektInStap3('Mijn lijst', 0, true))).toBe('Nog nodig: los de melding hierboven op.');
    expect(ontbreektInStap3('Mijn lijst', 4)).toEqual([]);
  });

  it('zegOntbreekt voor een lijst van drie', () => {
    expect(zegOntbreekt([{ tekst: 'a' }, { tekst: 'b' }, { tekst: 'c' }])).toBe('Nog nodig: a, b en c.');
    expect(zegOntbreekt([])).toBe('');
  });
});

// ── Met echte gegevens ──────────────────────────────────────────────────────

const MAP = join(fileURLToPath(new URL('../../', import.meta.url)), 'public', 'leerplannen', 'minimumdoelen');
const ECHT = existsSync(join(MAP, 'index.json'));
const laad = (id: string): MinimumdoelenSetBestand => JSON.parse(readFileSync(join(MAP, `${id}.json`), 'utf8')) as MinimumdoelenSetBestand;

describe.runIf(ECHT)('echte sets', () => {
  it('basisgeletterdheid 1ste graad A-stroom: Nederlands, STEM en digitale competenties geven 10 doelen', () => {
    const index = JSON.parse(readFileSync(join(MAP, 'index.json'), 'utf8')) as MinimumdoelenIndex;
    const kandidaten = index.sets.filter((s) => s.geldigheid === 'Geldig' && s.graad === '1ste graad' && s.stroom === 'A-stroom'
      && /^Secundair onderwijs /.test(s.naam) && /Eindtermen basisgeletterdheid$/.test(s.naam.trim()));
    expect(kandidaten.map((s) => s.korteNaam).sort()).toEqual(['Digitale competenties', 'Nederlands', 'Wiskunde – natuurwetenschappen – technologie – STEM']);
    const bestanden = new Map(kandidaten.map((s) => [s.id, laad(s.id)] as const));
    let k = leegKeuze();
    for (const s of kandidaten) k = voegSetToe(k, s.id);
    const kiesbaar = new Map([...bestanden].map(([id, b]) => [id, kiesbareDoelen(b)] as const));
    expect(telGekozen(k, kiesbaar)).toEqual({ doelen: 10, sets: 3 });
    const keuzes = bouwSetKeuzes(k, bestanden);
    expect(keuzes.every((s) => s.doelen === 'alle')).toBe(true);
    const r = leerplanUitSelectie(keuzes, { titel: '' });
    expect(r.bevestigd).toBe(true);
    expect(r.leerplan.goals).toHaveLength(10);
  });

  it('de STEM-set ODS_3283: alles uit, zoeken op "energie", gevonden aan: precies die doelen', () => {
    const bestand = laad('ODS_3283');
    const kiesbaar = new Map([['ODS_3283', kiesbareDoelen(bestand)]]);
    let k = beginUitSets(['ODS_3283']);
    expect(telGekozen(k, kiesbaar).doelen).toBe(kiesbaar.get('ODS_3283')!.length);
    k = zetHeleSet(k, 'ODS_3283', false);
    expect(telGekozen(k, kiesbaar)).toEqual({ doelen: 0, sets: 0 });
    const gevonden = vindDoelen(kiesbaar, zoekTermen('energie'));
    const n = telGevonden(gevonden);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(kiesbaar.get('ODS_3283')!.length);
    k = zetGevonden(k, gevonden, true, kiesbaar);
    expect(telGekozen(k, kiesbaar)).toEqual({ doelen: n, sets: 1 });
    const r = leerplanUitSelectie(bouwSetKeuzes(k, new Map([['ODS_3283', bestand]])), { titel: 'NW uit STEM' });
    expect(r.bevestigd).toBe(true);
    expect(r.leerplan.goals).toHaveLength(n);
  });
});

// ── Sturen: voor welke leerlingen is de lijst? (LEERPLANNEN.md § 16.2 en § 16.3) ──

/** Een nagemaakte indexregel; de naam bepaalt soort onderwijs en tweeling. */
function sturingSet(naam: string, extra: Partial<SetVoorSturing> = {}): SetVoorSturing {
  return { naam, versie: '2.1', graad: '1ste graad', ...extra };
}

const NL_SO_A = 'Secundair onderwijs 1ste graad A-stroom -  Competenties in het Nederlands - Eindtermen basisgeletterdheid';
const NL_BUSO_A = 'Buitengewoon Secundair onderwijs 1ste graad A-stroom Opleidingsvorm 4 -  Competenties in het Nederlands - Eindtermen basisgeletterdheid';
const FR_SO_A = 'Secundair onderwijs 1ste graad A-stroom - Vak - Frans - Eindtermen';
const FR_BUSO_A = 'Buitengewoon Secundair onderwijs 1ste graad A-stroom Opleidingsvorm 4 - Vak - Frans - Eindtermen';
const NL_SO_B = NL_SO_A.replace('A-stroom', 'B-stroom');
const NL_BUSO_B = NL_BUSO_A.replace('A-stroom', 'B-stroom');
const CHEMIE_SO = 'Secundair onderwijs 2de graad aso - Vak - Chemie - Eindtermen';
const CHEMIE_BUSO = 'Buitengewoon Secundair onderwijs 2de graad aso Opleidingsvorm 4 - Vak - Chemie - Eindtermen';
const ICT_VWO = 'Secundair Volwassenenonderwijs Aanvullende Algemene Vorming Minimum - Vak - Ict - Eindtermen';
const DOMEIN_BUSO3 = 'Buitengewoon Secundair onderwijs Opleidingsvorm 3 - Domein - Burgerzin - Ontwikkelingsdoelen';

const STUUR = new Map<string, SetVoorSturing>([
  ['so_a', sturingSet(NL_SO_A, { stroom: 'A-stroom' })],
  ['buso_a', sturingSet(NL_BUSO_A, { stroom: 'A-stroom' })],
  ['so_b', sturingSet(NL_SO_B, { stroom: 'B-stroom' })],
  ['buso_b', sturingSet(NL_BUSO_B, { stroom: 'B-stroom' })],
  ['fr_so', sturingSet(FR_SO_A, { stroom: 'A-stroom' })],
  ['fr_buso', sturingSet(FR_BUSO_A, { stroom: 'A-stroom' })],
  ['chemie_so', sturingSet(CHEMIE_SO, { graad: '2de graad' })],
  ['chemie_buso', sturingSet(CHEMIE_BUSO, { graad: '2de graad' })],
  ['ict_vwo', sturingSet(ICT_VWO, { graad: '3de graad' })],
  ['domein_buso', sturingSet(DOMEIN_BUSO3, { graad: undefined })],
]);

describe('sturen: de beginwaarden van het blok "Voor welke leerlingen"', () => {
  it('een nieuwe lijst zonder sets: gewoon secundair onderwijs, alle graden, beide stromen', () => {
    expect(beginLeerlingen([], STUUR)).toEqual({ soort: 'so', graad: '', stroom: '' });
  });

  it('sets die de index niet kent, tellen niet mee: dan is het een nieuwe lijst', () => {
    expect(beginLeerlingen(['bestaat_niet', 'ook_niet'], STUUR)).toEqual({ soort: 'so', graad: '', stroom: '' });
    expect(beginLeerlingen(['bestaat_niet', 'buso_a'], STUUR)).toEqual({ soort: 'buso', graad: '1ste graad', stroom: 'A-stroom' });
  });

  it('allemaal BuSO: buitengewoon, met de gemeenschappelijke graad en stroom', () => {
    expect(beginLeerlingen(['buso_a', 'fr_buso'], STUUR)).toEqual({ soort: 'buso', graad: '1ste graad', stroom: 'A-stroom' });
    expect(beginLeerlingen(['chemie_buso'], STUUR)).toEqual({ soort: 'buso', graad: '2de graad', stroom: '' });
  });

  it('allemaal SO: gewoon, met de gemeenschappelijke graad en stroom', () => {
    expect(beginLeerlingen(['so_a', 'fr_so'], STUUR)).toEqual({ soort: 'so', graad: '1ste graad', stroom: 'A-stroom' });
    expect(beginLeerlingen(['so_b'], STUUR)).toEqual({ soort: 'so', graad: '1ste graad', stroom: 'B-stroom' });
  });

  it('gemengd gewoon en buitengewoon: alle sets', () => {
    expect(beginLeerlingen(['so_a', 'buso_a'], STUUR)).toEqual({ soort: 'alle', graad: '1ste graad', stroom: 'A-stroom' });
  });

  it('volwassenenonderwijs: dat onderwijs; gemengd met iets anders: alle sets', () => {
    expect(beginLeerlingen(['ict_vwo'], STUUR)).toEqual({ soort: 'vwo', graad: '3de graad', stroom: '' });
    expect(beginLeerlingen(['ict_vwo', 'chemie_so'], STUUR).soort).toBe('alle');
  });

  it('verschillende graden: geen graad en dus ook geen stroom', () => {
    expect(beginLeerlingen(['so_a', 'chemie_so'], STUUR)).toEqual({ soort: 'so', graad: '', stroom: '' });
  });

  it('A- en B-stroom samen: beide stromen', () => {
    expect(beginLeerlingen(['so_a', 'so_b'], STUUR)).toEqual({ soort: 'so', graad: '1ste graad', stroom: '' });
  });

  it('een stroom bestaat alleen in de 1ste graad', () => {
    expect(beginLeerlingen(['chemie_so'], new Map([['chemie_so', sturingSet(CHEMIE_SO, { graad: '2de graad', stroom: 'A-stroom' })]])).stroom).toBe('');
  });

  it('een set zonder stroom in de 1ste graad laat de stroom van de andere sets gelden', () => {
    const sets = new Map<string, SetVoorSturing>([['a', sturingSet(NL_SO_A, { stroom: 'A-stroom' })], ['z', sturingSet(FR_SO_A)]]);
    expect(beginLeerlingen(['a', 'z'], sets)).toEqual({ soort: 'so', graad: '1ste graad', stroom: 'A-stroom' });
  });

  it('een set zonder graad: geen gemeenschappelijke graad', () => {
    expect(beginLeerlingen(['so_a', 'domein_buso'], STUUR).graad).toBe('');
  });
});

describe('sturen: wijzigingen in het blok', () => {
  type Staat = LeerlingenFilter & { zoek: string; toonOud: boolean };
  const begin: Staat = { soort: 'so', graad: GRAAD_MET_STROMEN, stroom: 'A-stroom', zoek: 'x', toonOud: false };

  it('een stroom kiezen in de 1ste graad blijft staan', () => {
    expect(pasLeerlingenToe<Staat>({ ...begin, stroom: '' }, { stroom: 'B-stroom' }).stroom).toBe('B-stroom');
  });

  it('een andere graad zet de stroom terug op "allebei"; de rest blijft', () => {
    expect(pasLeerlingenToe(begin, { graad: '2de graad' })).toEqual({ ...begin, graad: '2de graad', stroom: '' });
    expect(pasLeerlingenToe(begin, { graad: '' })).toEqual({ ...begin, graad: '', stroom: '' });
  });

  it('dezelfde graad kiezen laat de stroom staan; terug naar de 1ste graad geeft "allebei"', () => {
    expect(pasLeerlingenToe(begin, { graad: GRAAD_MET_STROMEN }).stroom).toBe('A-stroom');
    const andere = pasLeerlingenToe(begin, { graad: '2de graad' });
    expect(pasLeerlingenToe(andere, { graad: GRAAD_MET_STROMEN }).stroom).toBe('');
  });

  it('een stroom buiten de 1ste graad kan niet', () => {
    expect(pasLeerlingenToe<Staat>({ ...begin, graad: '', stroom: '' }, { stroom: 'A-stroom' }).stroom).toBe('');
  });

  it('verandert de oude staat niet', () => {
    const kopie = { ...begin };
    pasLeerlingenToe(begin, { graad: '2de graad' });
    expect(begin).toEqual(kopie);
  });
});

describe('sturen: tweelingen en stromen in een keuze', () => {
  it('een SO-set en zijn BuSO-tweeling vormen een paar; de volgorde van kiezen maakt niet uit', () => {
    expect(tweelingParen(['so_a', 'buso_a'], STUUR)).toEqual([{ so: 'so_a', buso: 'buso_a' }]);
    expect(tweelingParen(['buso_a', 'so_a'], STUUR)).toEqual([{ so: 'so_a', buso: 'buso_a' }]);
  });

  it('A- en B-stroom, of een andere set, zijn geen paar; een set zonder tweeling ook niet', () => {
    expect(tweelingParen(['so_a', 'buso_b'], STUUR)).toEqual([]);
    expect(tweelingParen(['so_a', 'fr_buso'], STUUR)).toEqual([]);
    expect(tweelingParen(['so_a', 'domein_buso', 'ict_vwo'], STUUR)).toEqual([]);
    expect(tweelingParen(['so_a', 'so_b'], STUUR)).toEqual([]);
    expect(tweelingParen([], STUUR)).toEqual([]);
  });

  it('een set die de index niet kent, telt niet mee', () => {
    expect(tweelingParen(['so_a', 'bestaat_niet', 'buso_a'], STUUR)).toEqual([{ so: 'so_a', buso: 'buso_a' }]);
  });

  it('meer paren: de sets in een paar, en hoeveel sets van elk', () => {
    const paren = tweelingParen(['so_a', 'fr_so', 'buso_a', 'fr_buso', 'chemie_so'], STUUR);
    expect(paren).toEqual([{ so: 'so_a', buso: 'buso_a' }, { so: 'fr_so', buso: 'fr_buso' }]);
    expect(setsMetTweeling(paren)).toEqual(new Set(['so_a', 'buso_a', 'fr_so', 'fr_buso']));
    expect(aantalPerSoort(paren)).toBe(2);
    expect(aantalPerSoort([])).toBe(0);
  });

  it('gewoon en buitengewoon gemengd: ook zonder tweeling', () => {
    expect(mengtGewoonEnBuitengewoon(['so_a', 'buso_a'], STUUR)).toBe(true);
    expect(mengtGewoonEnBuitengewoon(['so_a', 'domein_buso'], STUUR)).toBe(true);
    expect(mengtGewoonEnBuitengewoon(['so_a', 'so_b', 'chemie_so'], STUUR)).toBe(false);
    expect(mengtGewoonEnBuitengewoon(['buso_a', 'buso_b'], STUUR)).toBe(false);
    expect(mengtGewoonEnBuitengewoon(['so_a', 'ict_vwo'], STUUR)).toBe(false);
    expect(mengtGewoonEnBuitengewoon([], STUUR)).toBe(false);
  });

  it('A- en B-stroom gemengd; een set zonder stroom telt niet mee', () => {
    expect(stromenIn(['so_a', 'chemie_so'], STUUR)).toEqual(new Set(['A-stroom']));
    expect(mengtStromen(['so_a', 'buso_b'], STUUR)).toBe(true);
    expect(mengtStromen(['so_a', 'buso_a', 'fr_so'], STUUR)).toBe(false);
    expect(mengtStromen(['so_a', 'chemie_so', 'ict_vwo'], STUUR)).toBe(false);
    expect(mengtStromen([], STUUR)).toBe(false);
  });
});

describe('sturen: één klik om sets van de andere groep weg te halen', () => {
  const alles = beginUitSets(['so_a', 'buso_a', 'so_b', 'buso_b', 'chemie_so', 'domein_buso']);

  it('"Gewoon secundair onderwijs": de BuSO-sets met een tweeling gaan weg; een BuSO-set zonder tweeling en sets zonder paar blijven', () => {
    const k = haalTweelingenWeg(alles, STUUR, 'so');
    expect(k.sets).toEqual(['so_a', 'so_b', 'chemie_so', 'domein_buso']);
    expect([...k.selectie.keys()]).toEqual(k.sets);
  });

  it('"Buitengewoon secundair onderwijs": de SO-sets met een tweeling gaan weg; de rest blijft', () => {
    const k = haalTweelingenWeg(alles, STUUR, 'buso');
    expect(k.sets).toEqual(['buso_a', 'buso_b', 'chemie_so', 'domein_buso']);
  });

  it('met `binnen` (de sets van de lijst): een set blijft als haar tweeling geen enkel gekozen doel heeft', () => {
    // buso_a staat in de keuze, maar zonder één gekozen doel: de melding telde dat paar niet, dus so_a blijft.
    let k = beginUitSets(['so_a', 'buso_a', 'so_b', 'buso_b']);
    k = { sets: k.sets, selectie: new Map(k.selectie).set('buso_a', new Set<string>()) };
    const na = haalTweelingenWeg(k, STUUR, 'buso', ['so_a', 'so_b', 'buso_b']);
    expect(na.sets).toEqual(['so_a', 'buso_a', 'buso_b']);
    // Zonder `binnen` telt de hele keuze, zoals vroeger.
    expect(haalTweelingenWeg(k, STUUR, 'buso').sets).toEqual(['buso_a', 'buso_b']);
  });

  it('de keuze van doelen van de sets die blijven, verandert niet; de oude staat blijft zoals ze was', () => {
    let k = beginUitSets(['so_a', 'buso_a']);
    k = { sets: k.sets, selectie: new Map(k.selectie).set('so_a', new Set(['x1', 'x2'])) };
    const na = haalTweelingenWeg(k, STUUR, 'so');
    expect(na.sets).toEqual(['so_a']);
    expect(na.selectie.get('so_a')).toEqual(new Set(['x1', 'x2']));
    expect(k.sets).toEqual(['so_a', 'buso_a']);
  });

  it('zonder tweelingen verandert er niets', () => {
    const k = beginUitSets(['so_a', 'fr_buso', 'chemie_so']);
    expect(haalTweelingenWeg(k, STUUR, 'so').sets).toEqual(k.sets);
    expect(haalTweelingenWeg(k, STUUR, 'buso').sets).toEqual(k.sets);
  });

  it('"A-stroom": de sets van de B-stroom gaan weg; sets zonder stroom blijven', () => {
    const k = haalStroomWeg(alles, STUUR, 'A-stroom');
    expect(k.sets).toEqual(['so_a', 'buso_a', 'chemie_so', 'domein_buso']);
  });

  it('"B-stroom": de sets van de A-stroom gaan weg; sets zonder stroom blijven', () => {
    const k = haalStroomWeg(alles, STUUR, 'B-stroom');
    expect(k.sets).toEqual(['so_b', 'buso_b', 'chemie_so', 'domein_buso']);
  });

  it('beide acties na elkaar geven één groep', () => {
    const k = haalStroomWeg(haalTweelingenWeg(alles, STUUR, 'so'), STUUR, 'A-stroom');
    expect(k.sets).toEqual(['so_a', 'chemie_so', 'domein_buso']);
  });
});

describe('sturen: de zinnen op het scherm', () => {
  it('onder de resultaten: enkelvoud en meervoud', () => {
    expect(zinVerborgenSets(1)).toBe('1 set voor andere leerlingen staat niet in de lijst.');
    expect(zinVerborgenSets(2)).toBe('2 sets voor andere leerlingen staan niet in de lijst.');
    expect(zinVerborgenSets(9)).toBe('9 sets voor andere leerlingen staan niet in de lijst.');
  });

  it('de melding bij tweelingen in stap 3: 1 set en 6 sets van elk', () => {
    expect(zinTweelingenInLijst(1)).toBe('Je koos dezelfde doelen twee keer: voor het gewoon en voor het buitengewoon secundair onderwijs (1 set van elk). Een lijst is meestal voor één groep leerlingen. Voor wie is deze lijst?');
    expect(zinTweelingenInLijst(6)).toBe('Je koos dezelfde doelen twee keer: voor het gewoon en voor het buitengewoon secundair onderwijs (6 sets van elk). Een lijst is meestal voor één groep leerlingen. Voor wie is deze lijst?');
  });

  it('de statusregel na het weghalen, voor elke soort en elke stroom; 1 doel in het enkelvoud', () => {
    expect(zinNaWeghalen('so', 18)).toBe('De sets voor het buitengewoon onderwijs zijn weggehaald. Je lijst telt nu 18 doelen.');
    expect(zinNaWeghalen('buso', 18)).toBe('De sets voor het gewoon onderwijs zijn weggehaald. Je lijst telt nu 18 doelen.');
    expect(zinNaWeghalen('A-stroom', 10)).toBe('De sets voor de B-stroom zijn weggehaald. Je lijst telt nu 10 doelen.');
    expect(zinNaWeghalen('B-stroom', 10)).toBe('De sets voor de A-stroom zijn weggehaald. Je lijst telt nu 10 doelen.');
    expect(zinNaWeghalen('so', 1)).toBe('De sets voor het buitengewoon onderwijs zijn weggehaald. Je lijst telt nu 1 doel.');
  });

  it('de vaste zinnen letterlijk zoals in het ontwerp', () => {
    expect(ZIN_TWEELING_GEKOZEN).toBe('Dezelfde doelen als een andere set die je koos. Je hebt er maar één nodig.');
    expect(ZIN_GEWOON_EN_BUITENGEWOON).toBe('Je koos sets voor het gewoon én het buitengewoon onderwijs. Een lijst is meestal voor één groep leerlingen.');
    expect(ZIN_A_EN_B).toBe('Je koos sets voor de A-stroom én de B-stroom. Een lijst is meestal voor één stroom.');
    expect(ZIN_LIJST_MENGT_STROMEN).toBe('Je lijst mengt sets voor de A-stroom en de B-stroom. Voor welke stroom is ze?');
  });

  it('geen enkele zin noemt een set-id', () => {
    const zinnen = [ZIN_TWEELING_GEKOZEN, ZIN_GEWOON_EN_BUITENGEWOON, ZIN_A_EN_B, ZIN_LIJST_MENGT_STROMEN, zinVerborgenSets(3), zinTweelingenInLijst(2), zinNaWeghalen('so', 4)];
    for (const z of zinnen) expect(z).not.toMatch(/ODS_|G-\d/);
  });
});

describe.runIf(ECHT)('sturen met echte sets: basisgeletterdheid in de 1ste graad', () => {
  const index = JSON.parse(readFileSync(join(MAP, 'index.json'), 'utf8')) as MinimumdoelenIndex;
  const perId = new Map(index.sets.map((s) => [s.id, s] as const));
  // SO A, BuSO A, SO B, BuSO B: drie sets elk (Nederlands, STEM, digitale competenties).
  const SO_A = ['ODS_3343', 'ODS_3344', 'ODS_3345'];
  const BUSO_A = ['ODS_3346', 'ODS_3347', 'ODS_3350'];
  const SO_B = ['ODS_3351', 'ODS_3353', 'ODS_3355'];
  const BUSO_B = ['ODS_3352', 'ODS_3354', 'ODS_3356'];
  const twaalf = beginUitSets([...SO_A, ...BUSO_A, ...SO_B, ...BUSO_B]);

  it('de twaalf sets zijn 3 + 3 + 3 + 3', () => {
    expect([...SO_A, ...SO_B].every((id) => /^Secundair onderwijs/.test(perId.get(id)!.naam))).toBe(true);
    expect([...BUSO_A, ...BUSO_B].every((id) => /^Buitengewoon/.test(perId.get(id)!.naam))).toBe(true);
    expect([...SO_A, ...BUSO_A].every((id) => perId.get(id)!.stroom === 'A-stroom')).toBe(true);
    expect([...SO_B, ...BUSO_B].every((id) => perId.get(id)!.stroom === 'B-stroom')).toBe(true);
  });

  it('de twaalf sets geven zes paren (elke SO-set met zijn BuSO-tweeling van dezelfde stroom en dezelfde korte naam)', () => {
    const paren = tweelingParen(twaalf.sets, perId);
    expect(paren).toHaveLength(6);
    expect(aantalPerSoort(paren)).toBe(6);
    for (const p of paren) {
      expect(perId.get(p.buso)!.korteNaam).toBe(perId.get(p.so)!.korteNaam);
      expect(perId.get(p.buso)!.stroom).toBe(perId.get(p.so)!.stroom);
    }
    expect(mengtGewoonEnBuitengewoon(twaalf.sets, perId)).toBe(true);
    expect(mengtStromen(twaalf.sets, perId)).toBe(true);
  });

  it('"Gewoon secundair onderwijs": de zes BuSO-sets gaan weg, de zes SO-sets blijven', () => {
    expect(haalTweelingenWeg(twaalf, perId, 'so').sets).toEqual([...SO_A, ...SO_B]);
  });

  it('"Buitengewoon secundair onderwijs": de zes SO-sets gaan weg, de zes BuSO-sets blijven', () => {
    expect(haalTweelingenWeg(twaalf, perId, 'buso').sets).toEqual([...BUSO_A, ...BUSO_B]);
  });

  it('daarna "A-stroom": drie sets over, en geen paar of menging meer', () => {
    const k = haalStroomWeg(haalTweelingenWeg(twaalf, perId, 'so'), perId, 'A-stroom');
    expect(k.sets).toEqual(SO_A);
    expect(tweelingParen(k.sets, perId)).toEqual([]);
    expect(mengtGewoonEnBuitengewoon(k.sets, perId)).toBe(false);
    expect(mengtStromen(k.sets, perId)).toBe(false);
  });

  it('na "Gewoon …" geeft de lijst 20 doelen (A en B), zonder dubbele minimumdoelen', () => {
    const k = haalTweelingenWeg(twaalf, perId, 'so');
    const bestanden = new Map(k.sets.map((id) => [id, laad(id)] as const));
    const r = leerplanUitSelectie(bouwSetKeuzes(k, bestanden), { titel: '' });
    expect(r.bevestigd).toBe(true);
    expect(r.leerplan.goals).toHaveLength(20);
    expect(r.waarschuwingen).toEqual([]);
  });

  it('de beginwaarden van elke groep sets houden elke set in beeld', () => {
    const groepen = [SO_A, BUSO_A, SO_B, BUSO_B, [...SO_A, ...BUSO_A], [...SO_A, ...SO_B], [...BUSO_A, ...BUSO_B], twaalf.sets, ['ODS_3343', 'ODS_3283', 'ODS_3300']];
    for (const ids of groepen) {
      const w = beginLeerlingen(ids, perId);
      const zichtbaar = new Set(filterSets(index.sets, { zoek: '', geldigheid: 'alle', graad: w.graad, soort: w.soort, stroom: w.stroom }).map((s) => s.id));
      for (const id of ids) expect(zichtbaar.has(id), `${id} bij ${JSON.stringify(w)}`).toBe(true);
    }
    expect(beginLeerlingen(BUSO_B, perId)).toEqual({ soort: 'buso', graad: '1ste graad', stroom: 'B-stroom' });
    expect(beginLeerlingen(twaalf.sets, perId)).toEqual({ soort: 'alle', graad: '1ste graad', stroom: '' });
    expect(beginLeerlingen([], perId)).toEqual({ soort: 'so', graad: '', stroom: '' });
  });

  it('het nieuwe blok verbergt van de twaalf sets alleen wat niet bij de leerlingen hoort', () => {
    const zoek = (soort: 'so' | 'buso' | 'alle', stroom: '' | 'A-stroom' | 'B-stroom') => filterSets(index.sets, { zoek: 'basisgeletterdheid', geldigheid: 'actueel', graad: '1ste graad', soort, stroom }).map((s) => s.id);
    expect(zoek('so', '')).toEqual([...SO_A, ...SO_B].sort());
    expect(zoek('so', 'A-stroom')).toEqual(SO_A);
    expect(zoek('buso', 'B-stroom')).toEqual([...BUSO_B].sort());
    expect(zoek('alle', '')).toHaveLength(12);
  });
});
