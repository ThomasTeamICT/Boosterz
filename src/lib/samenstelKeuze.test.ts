import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { leerplanUitSelectie, selectieVanLeerplan, telSelectie } from './doelenSamenstellen';
import type { Minimumdoel, MinimumdoelenIndex, MinimumdoelenSetBestand, MinimumdoelenSetKop } from './minimumdoelen';
import { zoekTermen } from './minimumdoelenBron';
import {
  MAX_GEKOZEN_SETS, aantalGekozen, beginUitSelectie, beginUitSets, bouwSetKeuzes, haalSetWeg, isDoelGekozen, isSetGekozen, kanSetToevoegen,
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
      naamsvermelding: 'Bron: Vlaamse overheid, Departement Onderwijs en Vorming (onderwijsdoelen.be)',
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
