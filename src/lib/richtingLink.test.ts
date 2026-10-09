import { describe, expect, it } from 'vitest';
import type { Curriculum, CurriculumGoal } from './curriculumTypes';
import { leerplanUitSelectie, selectieVanLeerplan } from './doelenSamenstellen';
import { sanitizeDoelgroep } from './doelgroep';
import { bouwOntwerp, legeKeuze, saneerOntwerp } from './leerplanInlezen';
import { GRAAD_OPTIES, STROOM_OPTIES } from './leerplanNiveau';
import type { Minimumdoel, MinimumdoelenIndexSet, MinimumdoelenSetBestand } from './minimumdoelen';
import { vergelijkMetKader } from './richtingCursus';
import {
  bouwKader,
  kaderVingerafdruk,
  naarSetKeuzes,
  richtingInfo,
  selectieVanKader,
  type RichtingInfo,
  type RichtingKader,
  type RichtingKeuze,
} from './richtingKader';
import {
  beginUitBewaarde,
  beginUitLink,
  doelgroepBijRichting,
  genegeerdZinnen,
  invulVoorInlezen,
  kaderStand,
  komtVanVerderZonderRichting,
  leesRichtingParams,
  richtingPad,
  richtingTekst,
  selectieUitLink,
  vandaag,
  VERDER_ZONDER_RICHTING,
} from './richtingLink';
import { beginUitSets, bouwSetKeuzes, isDoelGekozen, kiesbareDoelen, type SamenstelKeuze } from './samenstelKeuze';
import type {
  MatrixBestand,
  RichtingDoelenBestand,
  RichtingDoelenIndexRegel,
  RichtingDoelenSet,
  StudierichtingGroep,
  Structuuronderdeel,
} from './studierichtingen';

const VANDAAG = '2026-10-09';
const SHA = 'ab'.repeat(32);

// ── Nagemaakte gegevens ─────────────────────────────────────────────────────

function onderdeel(nummer: number, groepNummer: string, extra: Partial<Structuuronderdeel> = {}): Structuuronderdeel {
  return {
    nummer, groep: groepNummer, titel: `Onderdeel ${nummer}`, onderwijsvorm: 'ASO', begindatum: '2021-09-01',
    leerjaren: [{ code: '1' }, { code: '2' }], hoofdstructuren: ['311', '321'], ...extra,
  };
}

function groep(nummer: string, titel: string, onderdelen: number[], extra: Partial<StudierichtingGroep> = {}): StudierichtingGroep {
  return { nummer, titel, graad: '2', finaliteit: 'DO', onderdelen, ...extra };
}

function matrixVan(groepen: StudierichtingGroep[], onderdelen: Structuuronderdeel[]): MatrixBestand {
  return {
    app: 'boosterz', kind: 'studierichtingen', v: 1, bron: 'x', api: 'x', naamsvermelding: 'x', licentie: 'x',
    opgehaald: '2026-10-09T00:00:00Z', aantalGroepen: groepen.length, aantalOnderdelen: onderdelen.length, sha256: SHA, groepen, onderdelen,
  };
}

const MATRIX = matrixVan(
  [
    groep('G-0100', 'Natuurwetenschappen', [100], { finaliteit: 'DO' }),
    groep('G-0200', 'Eerste leerjaar A', [200], { graad: '1', finaliteit: undefined }),
    groep('G-0300', 'Tweede leerjaar B: Techniek', [300], { graad: '1', finaliteit: undefined }),
    groep('G-0400', 'Dubbele richting', [400], { graad: undefined, finaliteit: undefined, opleidingsvorm: { code: '4' } }),
  ],
  [
    onderdeel(100, 'G-0100', { ov4: true }),
    onderdeel(200, 'G-0200', { leerjaren: [{ code: '1' }] }),
    onderdeel(300, 'G-0300', { leerjaren: [{ code: '2' }] }),
    onderdeel(400, 'G-0400', { hoofdstructuren: ['321'], leerjaren: [] }),
  ],
);

function info(nummer: string): RichtingInfo {
  const i = richtingInfo(MATRIX, nummer, VANDAAG);
  if (!i) throw new Error(`geen richting ${nummer}`);
  return i;
}

function indexSet(id: string, vak: string, extra: Partial<MinimumdoelenIndexSet> = {}): MinimumdoelenIndexSet {
  return {
    id, naam: `Secundair onderwijs 2de graad -  ${vak} - Cesuurdoelen`, korteNaam: vak, geldigheid: 'Geldig', graad: '2de graad', aantal: 5,
    sha256: `${id.replace(/\D/g, '').padStart(2, '0')}${'cd'.repeat(31)}`.slice(0, 64), opgehaald: '2026-10-05T10:00:00Z', bestand: `${id}.json`, ...extra,
  };
}

function koppelSet(s: MinimumdoelenIndexSet, ids?: string[], extra: Partial<RichtingDoelenSet> = {}): RichtingDoelenSet {
  return {
    set: s.id, setSha: s.sha256.slice(0, 16), setAantal: s.aantal,
    ids: ids ?? Array.from({ length: s.aantal }, (_, i) => `${s.id.replace(/\D/g, '')}${i + 1}`), ...extra,
  };
}

function koppelBestand(nummer: string, sets: RichtingDoelenSet[]): RichtingDoelenBestand {
  return {
    app: 'boosterz', kind: 'richtingdoelen', v: 1, groep: nummer, titel: 'Titel', graad: '2', methode: 'api',
    filter: `structuuronderdeel_groep_nummer=${nummer}`, bron: 'x', api: 'x', naamsvermelding: 'x', licentie: 'x',
    opgehaald: '2026-10-09T00:00:00Z', aantal: sets.reduce((n, s) => n + s.ids.length, 0), sha256: SHA, sets,
  };
}

function regelVan(b: RichtingDoelenBestand): RichtingDoelenIndexRegel {
  return { groep: b.groep, status: 'gekoppeld', methode: b.methode, aantal: b.aantal, sha256: b.sha256, opgehaald: b.opgehaald, bestand: `${b.groep}.json`, sets: b.sets.length };
}

function kaderUit(
  index: MinimumdoelenIndexSet[],
  koppel: RichtingDoelenSet[],
  opties: { info?: RichtingInfo; keuze?: Partial<RichtingKeuze> } = {},
): RichtingKader {
  const i = opties.info ?? info('G-0100');
  const bestand = koppelBestand(i.groep.nummer, koppel);
  const keuze: RichtingKeuze = { groep: i.groep.nummer, soort: 'so', ...opties.keuze };
  return bouwKader(bestand, regelVan(bestand), index, keuze, i);
}

/** Een echte set met `n` doelen met nummers `<prefix>1` tot `<prefix>n`. */
function setBestand(s: MinimumdoelenIndexSet, n: number, prefix: string): MinimumdoelenSetBestand {
  const doelen: Minimumdoel[] = Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, code: `1.${String(i + 1).padStart(2, '0')}`, tekst: `Doel ${i + 1} van ${s.id}.` }));
  return {
    app: 'boosterz', kind: 'minimumdoelen', v: 1,
    set: {
      id: s.id, naam: s.naam, korteNaam: s.korteNaam, sleutelcompetenties: [], bron: 'x', api: 'x', naamsvermelding: 'x',
      licentie: 'x', opgehaald: '2026-10-05T10:00:00Z', aantal: n, sha256: SHA,
    },
    doelen,
  };
}

// Een volledige set (3 doelen), een deelset (4 van 13), een STEM-set (6) en een uitbreidingsset (2).
const HELE = indexSet('ODS_100', 'Wiskunde', { aantal: 3 });
const DEEL = indexSet('ODS_110', 'Biologie', { aantal: 13 });
const STEM = indexSet('ODS_130', 'STEM', { aantal: 6 });
const UITBREIDING = indexSet('ODS_120', 'Nederlands', { aantal: 2, naam: 'Secundair onderwijs 2de graad -  Competenties in het Nederlands - Uitbreidingsdoelen' });
const INDEX = [HELE, DEEL, STEM, UITBREIDING];
const DEEL_IDS = ['b2', 'b5', 'b7', 'b11'];
const KOPPEL = [koppelSet(HELE, ['w1', 'w2', 'w3']), koppelSet(DEEL, DEEL_IDS), koppelSet(STEM, ['s1', 's2', 's3', 's4', 's5', 's6']), koppelSet(UITBREIDING, ['n1', 'n2'])];
const BESTANDEN = new Map<string, MinimumdoelenSetBestand>([
  [HELE.id, setBestand(HELE, 3, 'w')],
  [DEEL.id, setBestand(DEEL, 13, 'b')],
  [STEM.id, setBestand(STEM, 6, 's')],
  [UITBREIDING.id, setBestand(UITBREIDING, 2, 'n')],
]);

const kader = () => kaderUit(INDEX, KOPPEL);
const setIds = (k: { sets: readonly string[] }) => [...k.sets];

// ── De link lezen ───────────────────────────────────────────────────────────

describe('leesRichtingParams', () => {
  const lees = (zoek: string) => leesRichtingParams(new URLSearchParams(zoek));

  it('zonder richting: niet aanwezig', () => {
    const r = lees('sets=ODS_1');
    expect(r.aanwezig).toBe(false);
    expect(r.link).toBeUndefined();
  });

  it('een geldige richting met jaar en soort', () => {
    expect(lees('richting=G-0193&jaar=4&soort=so').link).toEqual({ groep: 'G-0193', jaar: 4, soort: 'so' });
    expect(lees('richting=G-0193&soort=buso').link).toEqual({ groep: 'G-0193', soort: 'buso' });
    expect(lees('richting=%20G-0193%20&jaar=%207%20').link).toEqual({ groep: 'G-0193', jaar: 7, soort: 'so' });
  });

  it('een soort die we niet kennen, is gewoon onderwijs; een jaar buiten 1 tot 7 wordt genegeerd', () => {
    expect(lees('richting=G-0193&soort=vwo').link?.soort).toBe('so');
    for (const jaar of ['0', '8', 'x', '4.5', '', '-1', '10']) {
      expect(lees(`richting=G-0193&jaar=${encodeURIComponent(jaar)}`).link, jaar).toEqual({ groep: 'G-0193', soort: 'so' });
    }
  });

  it('een richting die geen groepnummer is: aanwezig, maar zonder bruikbare link', () => {
    for (const ruw of ['', 'g-0193', 'G-1', 'G-0193,G-0194', 'Natuurwetenschappen', 'G-01234567', '../G-0193']) {
      const r = lees(`richting=${encodeURIComponent(ruw)}`);
      expect(r.aanwezig, ruw).toBe(true);
      expect(r.link, ruw).toBeUndefined();
    }
  });

  it('een jaar of soort in de link dat niet bruikbaar is, wordt gemeld (genegeerd); een ontbrekende of lege parameter niet', () => {
    expect(lees('richting=G-0193&jaar=abc').genegeerd).toEqual(['jaar']);
    expect(lees('richting=G-0193&jaar=9').genegeerd).toEqual(['jaar']);
    expect(lees('richting=G-0193&jaar=0&soort=so').genegeerd).toEqual(['jaar']);
    expect(lees('richting=G-0193&soort=xyz').genegeerd).toEqual(['soort']);
    expect(lees('richting=G-0193&soort=vwo').genegeerd).toEqual(['soort']);
    expect(lees('richting=G-0193&jaar=x&soort=xyz').genegeerd).toEqual(['jaar', 'soort']);
    // Bruikbaar, ontbrekend of leeg: niets te melden.
    expect(lees('richting=G-0193').genegeerd).toEqual([]);
    expect(lees('richting=G-0193&jaar=4&soort=so').genegeerd).toEqual([]);
    expect(lees('richting=G-0193&jaar=7&soort=buso').genegeerd).toEqual([]);
    expect(lees('richting=G-0193&jaar=&soort=').genegeerd).toEqual([]);
    expect(lees('richting=G-0193&jaar=%20&soort=%20').genegeerd).toEqual([]);
    expect(lees('richting=%20G-0193%20&jaar=%204%20&soort=%20buso%20').genegeerd).toEqual([]);
  });

  it('zonder bruikbare richting is er niets te negeren: de hele link telt niet', () => {
    expect(lees('jaar=9&soort=xyz').genegeerd).toEqual([]);
    expect(lees('richting=abc&jaar=9&soort=xyz').genegeerd).toEqual([]);
    expect(lees('richting=&jaar=9').genegeerd).toEqual([]);
  });

  it('het genegeerde jaar of soort verandert niets aan de richting zelf', () => {
    expect(lees('richting=G-0193&jaar=9&soort=xyz').link).toEqual({ groep: 'G-0193', soort: 'so' });
  });

  it('de sleutel verandert met richting, jaar, soort en zelf', () => {
    const basis = lees('richting=G-0193&jaar=4&soort=so&zelf=ODS_1').sleutel;
    for (const andere of ['richting=G-0194&jaar=4&soort=so&zelf=ODS_1', 'richting=G-0193&jaar=3&soort=so&zelf=ODS_1', 'richting=G-0193&jaar=4&soort=buso&zelf=ODS_1', 'richting=G-0193&jaar=4&soort=so&zelf=ODS_2', 'richting=G-0193&jaar=4&soort=so']) {
      expect(lees(andere).sleutel, andere).not.toBe(basis);
    }
    expect(lees('richting=G-0193&jaar=4&soort=so&zelf=ODS_1').sleutel).toBe(basis);
  });

  it('vandaag is een datum JJJJ-MM-DD', () => {
    expect(vandaag()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('genegeerdZinnen', () => {
  it('één zin per genegeerd deel, eerst het jaar, dan het soort', () => {
    expect(genegeerdZinnen(['jaar'])).toEqual(['Het jaar in de link is niet bruikbaar en werd genegeerd.']);
    expect(genegeerdZinnen(['soort'])).toEqual(['Het soort onderwijs in de link is niet bekend; Boosterz gebruikt gewoon secundair onderwijs.']);
    expect(genegeerdZinnen(['soort', 'jaar'])).toEqual([
      'Het jaar in de link is niet bruikbaar en werd genegeerd.',
      'Het soort onderwijs in de link is niet bekend; Boosterz gebruikt gewoon secundair onderwijs.',
    ]);
    expect(genegeerdZinnen(['jaar', 'jaar'])).toHaveLength(1);
  });

  it('niets te melden: geen zinnen', () => {
    expect(genegeerdZinnen([])).toEqual([]);
  });

  it('zonder groepnummer of set-id in de tekst', () => {
    for (const zin of genegeerdZinnen(['jaar', 'soort'])) expect(zin).not.toMatch(/G-\d|ODS_|structuuronderdeel/i);
  });
});

describe('komtVanVerderZonderRichting', () => {
  it('alleen de state van de knop "Verder zonder studierichting"', () => {
    expect(komtVanVerderZonderRichting(VERDER_ZONDER_RICHTING)).toBe(true);
    for (const ander of [undefined, null, 'focusKop', 1, true, {}, { focusKop: 'ja' }, { focusKop: false }, []]) {
      expect(komtVanVerderZonderRichting(ander), JSON.stringify(ander)).toBe(false);
    }
  });
});

// ── Samenstellen: waar de wizard mee begint ─────────────────────────────────

describe('selectieUitLink', () => {
  it('zonder sets en zonder zelf: alle verplichte sets, een volledige set als "alle", een deel als nummers, zonder uitbreiding', () => {
    const s = selectieUitLink(kader(), { sets: null, zelf: [] });
    expect([...s.keys()]).toEqual(['ODS_100', 'ODS_110', 'ODS_130']);
    expect(s.get('ODS_100')).toBe('alle');
    expect(s.get('ODS_110')).toEqual(DEEL_IDS);
  });

  it('met sets: alleen die sets; een lege lijst geeft niets', () => {
    expect([...selectieUitLink(kader(), { sets: ['ODS_110'], zelf: [] }).keys()]).toEqual(['ODS_110']);
    expect([...selectieUitLink(kader(), { sets: [], zelf: [] }).keys()]).toEqual([]);
  });

  it('zelf: de set staat gekozen met niets aangevinkt, ook als ze ook in sets staat', () => {
    const s = selectieUitLink(kader(), { sets: ['ODS_100', 'ODS_130'], zelf: ['ODS_130'] });
    expect([...s.keys()]).toEqual(['ODS_100', 'ODS_130']);
    expect(s.get('ODS_100')).toBe('alle');
    expect(s.get('ODS_130')).toEqual([]);
  });

  it('zelf zonder sets: de verplichte sets plus de zelf-set, die leeg blijft', () => {
    const s = selectieUitLink(kader(), { sets: null, zelf: ['ODS_130'] });
    expect([...s.keys()]).toEqual(['ODS_100', 'ODS_110', 'ODS_130']);
    expect(s.get('ODS_130')).toEqual([]);
    expect(s.get('ODS_110')).toEqual(DEEL_IDS);
  });

  it('een uitbreidingsset komt er alleen in als de link ze noemt', () => {
    expect([...selectieUitLink(kader(), { sets: null, zelf: [] }).keys()]).not.toContain('ODS_120');
    expect([...selectieUitLink(kader(), { sets: ['ODS_100'], zelf: [] }).keys()]).toEqual(['ODS_100']);
    expect([...selectieUitLink(kader(), { sets: ['ODS_100', 'ODS_120'], zelf: [] }).keys()]).toEqual(['ODS_100', 'ODS_120']);
    expect([...selectieUitLink(kader(), { sets: null, zelf: ['ODS_120'] }).keys()]).toContain('ODS_120');
  });

  it('geeft hetzelfde als selectieVanKader zonder opties als er niets gevraagd is', () => {
    expect(selectieUitLink(kader(), { sets: null, zelf: [] })).toEqual(selectieVanKader(kader()));
  });
});

describe('beginUitLink', () => {
  it('begint met de koppeling: een deelset blijft een lijst nummers, een volledige set is helemaal gekozen', () => {
    const { keuze, overgeslagen } = beginUitLink(kader(), null, null);
    expect(setIds(keuze)).toEqual(['ODS_100', 'ODS_110', 'ODS_130']);
    expect(keuze.selectie.get('ODS_100')).toBe('alle');
    expect([...(keuze.selectie.get('ODS_110') as ReadonlySet<string>)]).toEqual(DEEL_IDS);
    expect(overgeslagen).toBe(0);
  });

  it('§ 9.5: een deelset van 4 van 13 blijft 4 doelen na beginUitLink en bouwSetKeuzes, en na leerplanUitSelectie', () => {
    const { keuze } = beginUitLink(kader(), 'ODS_110', null);
    // De wizard geeft de kiesbare doelen van de hele set door, nooit een beperkte lijst.
    expect(kiesbareDoelen(BESTANDEN.get('ODS_110')!)).toHaveLength(13);
    const keuzes = bouwSetKeuzes(keuze, BESTANDEN);
    expect(keuzes).toHaveLength(1);
    expect(keuzes[0].doelen).not.toBe('alle');
    expect(keuzes[0].doelen).toHaveLength(4);
    const r = leerplanUitSelectie(keuzes, { titel: 'Test' });
    expect(r.leerplan.goals).toHaveLength(4);
    expect(r.bevestigd).toBe(true);
    // Dezelfde uitkomst via naarSetKeuzes, zoals de cursushulp ze maakt.
    const { keuzes: vanKader } = naarSetKeuzes(selectieVanKader(kader(), { sets: ['ODS_110'] }), BESTANDEN);
    expect(leerplanUitSelectie(vanKader, { titel: 'Test' }).leerplan.goals).toHaveLength(4);
  });

  it('zelf: gekozen met niets aangevinkt, en die set telt niet mee in het leerplan', () => {
    const { keuze } = beginUitLink(kader(), 'ODS_100', 'ODS_130');
    expect(setIds(keuze)).toEqual(['ODS_100', 'ODS_130']);
    expect(isDoelGekozen(keuze, 'ODS_130', 's1')).toBe(false);
    expect(bouwSetKeuzes(keuze, BESTANDEN).map((k) => k.bestand.set.id)).toEqual(['ODS_100']);
  });

  it('telt de gevraagde sets die niet gekozen konden worden: onbekend, ongeldig, buiten het kader', () => {
    expect(beginUitLink(kader(), 'ODS_100,ODS_9999,geen-set', null).overgeslagen).toBe(2);
    expect(beginUitLink(kader(), 'ODS_100', 'ODS_9999').overgeslagen).toBe(1);
    // Dezelfde set in sets en zelf telt één keer.
    expect(beginUitLink(kader(), 'ODS_100,ODS_100', 'ODS_100').overgeslagen).toBe(0);
    expect(beginUitLink(kader(), null, null).overgeslagen).toBe(0);
  });

  it('een kader zonder sets geeft een lege keuze', () => {
    const leeg = kaderUit(INDEX, []);
    expect(beginUitLink(leeg, null, null).keuze.sets).toEqual([]);
  });
});

/** Een bewaarde lijst zonder doelgroep (en dus zonder vingerafdruk van het kader): alles wat het kader niet kent, vervalt. */
const ZONDER_KADER: Pick<Curriculum, 'kind' | 'doelgroep' | 'minimumdoelenSets'> = {};

// Een geschiedenisset die niet in het kader staat: de leerkracht koos ze zelf erbij.
const BUITEN = indexSet('ODS_140', 'Geschiedenis', { aantal: 3 });
const BESTANDEN_MET_BUITEN = new Map([...BESTANDEN, [BUITEN.id, setBestand(BUITEN, 3, 'g')] as const]);

/** Een bewaarde lijst zoals "Bewaar de lijst" ze met een richting maakt: de doelgroep draagt de vingerafdruk van het kader (`kader`) over de sets van de lijst. */
function bewaardeLijst(keuze: SamenstelKeuze, kader: RichtingKader | null): Curriculum {
  const keuzes = bouwSetKeuzes(keuze, BESTANDEN_MET_BUITEN);
  const ids = keuzes.map((k) => k.bestand.set.id);
  const r = leerplanUitSelectie(keuzes, { titel: 'Test', ...(kader ? { doelgroep: doelgroepBijRichting(info('G-0100'), kader, ids) } : {}) });
  expect(r.bevestigd).toBe(true);
  return r.leerplan;
}

describe('beginUitBewaarde', () => {
  it('laat de vervallen doelen weg: nummers die niet meer in de koppeling staan en sets die niet meer in het kader staan', () => {
    const bewaard = new Map<string, readonly string[]>([
      ['ODS_100', ['w1', 'w2', 'w3']],
      ['ODS_110', ['b2', 'b5', 'b9']],
      ['ODS_999', ['x1', 'x2']],
    ]);
    const { keuze, vervallen } = beginUitBewaarde(bewaard, kader(), ZONDER_KADER);
    expect(setIds(keuze)).toEqual(['ODS_100', 'ODS_110']);
    expect([...(keuze.selectie.get('ODS_100') as ReadonlySet<string>)]).toEqual(['w1', 'w2', 'w3']);
    expect([...(keuze.selectie.get('ODS_110') as ReadonlySet<string>)]).toEqual(['b2', 'b5']);
    expect(vervallen).toBe(3);
  });

  it('niets vervallen: de keuze blijft zoals ze was, en er komt niets bij', () => {
    const bewaard = new Map<string, readonly string[]>([['ODS_110', ['b2', 'b5']]]);
    const { keuze, vervallen } = beginUitBewaarde(bewaard, kader(), ZONDER_KADER);
    expect(vervallen).toBe(0);
    expect(setIds(keuze)).toEqual(['ODS_110']);
    expect([...(keuze.selectie.get('ODS_110') as ReadonlySet<string>)]).toEqual(['b2', 'b5']);
  });

  it('een volledige set met een andere versie dan bij de koppeling houdt al haar nummers', () => {
    const anders = kaderUit(INDEX, [koppelSet(HELE, ['w1', 'w2', 'w3'], { setSha: 'f'.repeat(16) })]);
    expect(anders.sets[0].versieGelijk).toBe(false);
    const { keuze, vervallen } = beginUitBewaarde(new Map([['ODS_100', ['w1', 'w2', 'w3', 'w4']]]), anders, ZONDER_KADER);
    expect(vervallen).toBe(0);
    expect([...(keuze.selectie.get('ODS_100') as ReadonlySet<string>)]).toEqual(['w1', 'w2', 'w3', 'w4']);
  });

  it('een set van het kader waarvan niets overblijft, blijft gekozen met niets aangevinkt', () => {
    const { keuze, vervallen } = beginUitBewaarde(new Map([['ODS_110', ['b1', 'b3']]]), kader(), ZONDER_KADER);
    expect(vervallen).toBe(2);
    expect(setIds(keuze)).toEqual(['ODS_110']);
    expect([...(keuze.selectie.get('ODS_110') as ReadonlySet<string>)]).toEqual([]);
  });
});

describe('beginUitBewaarde volgt vergelijkMetKader (§ 11.2)', () => {
  it('(a) een uitgebreide deelset en een eigen set buiten het kader, bij een kader dat niet veranderde: er vervalt niets en alles blijft', () => {
    const k = kader();
    // ODS_110: 13 doelen waarvan de koppeling er 4 noemt; de leerkracht koos "Hele set". ODS_140 staat niet in het kader.
    const lijst = bewaardeLijst(beginUitSets(['ODS_110', 'ODS_140']), k);
    expect(lijst.goals).toHaveLength(16);
    expect(lijst.doelgroep?.kader).toBe(kaderVingerafdruk(k, ['ODS_110', 'ODS_140']));
    const selectie = selectieVanLeerplan(lijst);
    const { keuze, vervallen } = beginUitBewaarde(selectie, k, lijst);
    expect(vervallen).toBe(0);
    expect(setIds(keuze)).toEqual(['ODS_110', 'ODS_140']);
    expect((keuze.selectie.get('ODS_110') as ReadonlySet<string>).size).toBe(13);
    expect((keuze.selectie.get('ODS_140') as ReadonlySet<string>).size).toBe(3);
    // Dezelfde uitkomst als de vergelijking op het scherm "Werk het leerplan bij".
    expect(vergelijkMetKader(lijst, k).vervallen).toBe(0);
  });

  it('(a) zonder de vingerafdruk van het kader (een lijst zonder doelgroep) is dezelfde lijst wél vervallen: 9 uit de deelset en 3 buiten het kader', () => {
    const k = kader();
    const lijst = bewaardeLijst(beginUitSets(['ODS_110', 'ODS_140']), null);
    const { keuze, vervallen } = beginUitBewaarde(selectieVanLeerplan(lijst), k, lijst);
    expect(vervallen).toBe(12);
    expect(vervallen).toBe(vergelijkMetKader(lijst, k).vervallen);
    expect(setIds(keuze)).toEqual(['ODS_110']);
    expect([...(keuze.selectie.get('ODS_110') as ReadonlySet<string>)]).toEqual(DEEL_IDS);
  });

  it('(b) vervallen is gelijk aan dat van vergelijkMetKader, in een paar gevallen', () => {
    const k = kader();
    const lijstMetKader = bewaardeLijst(beginUitLink(k, 'ODS_100,ODS_110', null).keuze, k);
    const lijstZonderKader = bewaardeLijst(beginUitSets(['ODS_100', 'ODS_110', 'ODS_140']), null);
    // De koppeling van ODS_110 verloor een nummer (b11) sinds het maken.
    const minderNummers = kaderUit(INDEX, [koppelSet(HELE, ['w1', 'w2', 'w3']), koppelSet(DEEL, ['b2', 'b5', 'b7'])]);
    // ODS_110 staat niet meer in het kader.
    const setWeg = kaderUit(INDEX, [koppelSet(HELE, ['w1', 'w2', 'w3']), koppelSet(STEM, ['s1', 's2', 's3', 's4', 's5', 's6'])]);
    // ODS_100 is een volledige set met een andere versie dan bij de koppeling: de nummers van de koppeling zijn niet exact bekend.
    const andereVersie = kaderUit(INDEX, [koppelSet(HELE, ['w1', 'w2', 'w3'], { setSha: 'f'.repeat(16) })]);
    // Een lijst met een nummer (w4) dat de koppeling van ODS_100 niet kent.
    const heleLijst = bewaardeLijst(beginUitSets(['ODS_100']), null);
    const metExtraNummer: Curriculum = {
      ...heleLijst,
      goals: [...heleLijst.goals, { id: 'extra', code: 'X 1', text: 'Een extra doel.', refs: [{ set: 'ODS_100', id: 'w4', code: '1.04' }] }],
    };
    // Het kader is nog niet opgehaald: er is niets te beoordelen.
    const nogNiet = bouwKader(null, undefined, INDEX, { groep: 'G-0100', soort: 'so' }, info('G-0100'));
    const eigen: Curriculum = { ...lijstZonderKader, kind: 'eigen' };

    const gevallen: { naam: string; lijst: Curriculum; kader: RichtingKader; verwacht: number }[] = [
      { naam: 'niets veranderd', lijst: lijstMetKader, kader: k, verwacht: 0 },
      { naam: 'de koppeling verloor een nummer', lijst: lijstMetKader, kader: minderNummers, verwacht: 1 },
      { naam: 'een set staat niet meer in het kader', lijst: lijstMetKader, kader: setWeg, verwacht: 4 },
      { naam: 'zonder vingerafdruk: deelset en set buiten het kader', lijst: lijstZonderKader, kader: k, verwacht: 12 },
      { naam: 'een volledige set met dezelfde versie kent w4 niet', lijst: metExtraNummer, kader: k, verwacht: 1 },
      { naam: 'een volledige set met een andere versie houdt al haar nummers', lijst: metExtraNummer, kader: andereVersie, verwacht: 0 },
      { naam: 'een eigen kopie volgt de koppeling niet', lijst: eigen, kader: k, verwacht: 0 },
      { naam: 'een kader dat nog niet opgehaald is', lijst: lijstZonderKader, kader: nogNiet, verwacht: 0 },
    ];
    for (const g of gevallen) {
      const { vervallen } = beginUitBewaarde(selectieVanLeerplan(g.lijst), g.kader, g.lijst);
      expect(vervallen, g.naam).toBe(vergelijkMetKader(g.lijst, g.kader).vervallen);
      expect(vervallen, g.naam).toBe(g.verwacht);
    }
  });

  it('er vervalt niets: de keuze is precies de bewaarde selectie, ook in de volgorde van de sets', () => {
    const k = kader();
    const lijst = bewaardeLijst(beginUitSets(['ODS_140', 'ODS_100']), k);
    const selectie = selectieVanLeerplan(lijst);
    const { keuze } = beginUitBewaarde(selectie, k, lijst);
    expect(setIds(keuze)).toEqual([...selectie.keys()]);
    for (const [set, ids] of selectie) expect([...(keuze.selectie.get(set) as ReadonlySet<string>)]).toEqual(ids);
  });
});

describe('kaderStand', () => {
  it('ok met sets; nog-niet-opgehaald zonder regel; geen als de bron niets koppelt', () => {
    expect(kaderStand(kader())).toBe('ok');
    const i = info('G-0100');
    expect(kaderStand(bouwKader(null, undefined, INDEX, { groep: 'G-0100', soort: 'so' }, i))).toBe('nog-niet-opgehaald');
    const zonder: RichtingDoelenIndexRegel = { groep: 'G-0100', status: 'geen', opgehaald: '2026-10-09T00:00:00Z' };
    expect(kaderStand(bouwKader(null, zonder, INDEX, { groep: 'G-0100', soort: 'so' }, i))).toBe('geen');
  });
});

// ── Bewaren ─────────────────────────────────────────────────────────────────

describe('doelgroepBijRichting', () => {
  it('de richting, de graad, het soort, het vak en de vingerafdruk van het kader over de gegeven sets; zonder volgtKader', () => {
    const k = kader();
    const d = doelgroepBijRichting(info('G-0100'), k, ['ODS_100', 'ODS_110'], '  Biologie ');
    expect(d).toMatchObject({ groep: 'G-0100', titel: 'Natuurwetenschappen', graad: 2, soort: 'so', vak: 'Biologie' });
    expect(d.kader).toBe(kaderVingerafdruk(k, ['ODS_100', 'ODS_110']));
    expect(d.kader).toMatch(/^[0-9a-f]{64}$/);
    expect(d.volgtKader).toBeUndefined();
    expect(sanitizeDoelgroep(d)).toEqual(d);
  });

  it('zonder vak staat er geen vak in', () => {
    expect(doelgroepBijRichting(info('G-0100'), kader(), ['ODS_100']).vak).toBeUndefined();
    expect(doelgroepBijRichting(info('G-0100'), kader(), ['ODS_100'], '   ').vak).toBeUndefined();
  });

  it('een leerplan met deze doelgroep heeft geen jaar en is voor vergelijkMetKader gelijk aan het kader', () => {
    const k = kaderUit(INDEX, KOPPEL, { keuze: { jaar: 3 } });
    const { keuze } = beginUitLink(k, 'ODS_100,ODS_110', null);
    const keuzes = bouwSetKeuzes(keuze, BESTANDEN);
    const ids = keuzes.map((x) => x.bestand.set.id);
    const r = leerplanUitSelectie(keuzes, { titel: 'Test', doelgroep: doelgroepBijRichting(info('G-0100'), k, ids) });
    expect(r.bevestigd).toBe(true);
    expect(r.leerplan.doelgroep?.groep).toBe('G-0100');
    expect(r.leerplan.doelgroep?.jaar).toBeUndefined();
    expect(r.leerplan.doelgroep?.kader).toBe(kaderVingerafdruk(k, r.leerplan.minimumdoelenSets));
    expect(vergelijkMetKader(r.leerplan, k)).toEqual({ nieuw: 0, vervallen: 0, setsNietMeerInKader: [] });
  });
});

describe('inlezen: het ontwerp bewaart de richting (StapNakijken geeft de doelgroep aan bouwOntwerp)', () => {
  const doel: CurriculumGoal = { id: 'doel-1', code: 'BIO 1', text: 'De leerlingen kunnen een cel beschrijven.', refs: [{ set: 'ODS_110', id: 'b2', code: '1.02' }] };
  const ontwerpMet = (doelgroep?: ReturnType<typeof doelgroepBijRichting>, bestaand?: Curriculum) => bouwOntwerp({
    ...(bestaand ? { bestaand } : {}),
    keuze: { ...legeKeuze(), vak: 'Biologie', graad: '2de graad', titel: 'Biologie 2de graad' },
    bron: { methode: 'tekst' }, goals: [doel], setIds: ['ODS_100', 'ODS_110'], ingelezenOp: 1_700_000_000_000, id: 'ontwerp-1',
    ...(doelgroep ? { doelgroep } : {}),
  });

  it('de richting zit in het ontwerp, zonder jaar, ook als het kader een jaar heeft, en blijft staan na saneren', () => {
    const k = kaderUit(INDEX, KOPPEL, { keuze: { jaar: 3 } });
    const dg = doelgroepBijRichting(info('G-0100'), k, ['ODS_100', 'ODS_110'], 'Biologie');
    expect(dg.jaar).toBe(3);
    const ontwerp = ontwerpMet(dg);
    expect(ontwerp.doelgroep).toMatchObject({ groep: 'G-0100', titel: 'Natuurwetenschappen', graad: 2, soort: 'so', vak: 'Biologie' });
    expect(ontwerp.doelgroep?.jaar).toBeUndefined();
    expect(ontwerp.doelgroep?.kader).toBe(kaderVingerafdruk(k, ['ODS_100', 'ODS_110']));
    expect(ontwerp.doelgroep?.volgtKader).toBeUndefined();
    const gesaneerd = saneerOntwerp(ontwerp);
    expect(gesaneerd?.doelgroep).toEqual(ontwerp.doelgroep);
    // De vingerafdruk hoort bij de sets van het leerplan: "Werk het leerplan bij" ziet niets veranderd.
    expect(vergelijkMetKader(gesaneerd as Curriculum, k)).toEqual({ nieuw: 0, vervallen: 0, setsNietMeerInKader: [] });
  });

  it('zonder doelgroep (inlezen zonder richting) heeft het ontwerp er geen', () => {
    expect(ontwerpMet().doelgroep).toBeUndefined();
  });

  it('een andere keuze van sets geeft een andere vingerafdruk (de pagina houdt de doelgroep bij de gekozen sets)', () => {
    const k = kader();
    const alle = doelgroepBijRichting(info('G-0100'), k, ['ODS_100', 'ODS_110']);
    const maar1 = doelgroepBijRichting(info('G-0100'), k, ['ODS_100']);
    expect(ontwerpMet(alle).doelgroep?.kader).not.toBe(ontwerpMet(maar1).doelgroep?.kader);
  });
});

describe('richtingPad', () => {
  it('met een jaar dat bij de graad past', () => {
    expect(richtingPad(info('G-0100'), kaderUit(INDEX, KOPPEL, { keuze: { jaar: 4 } }))).toBe('/cursussen/richtingen/G-0100?jaar=4&soort=so');
  });

  it('zonder jaar, of met een jaar dat niet bij de graad past: alleen het soort', () => {
    expect(richtingPad(info('G-0100'), kader())).toBe('/cursussen/richtingen/G-0100?soort=so');
    expect(richtingPad(info('G-0100'), kaderUit(INDEX, KOPPEL, { keuze: { jaar: 6 } }))).toBe('/cursussen/richtingen/G-0100?soort=so');
  });

  it('het soort is dat van het kader: een gewone richting zonder ov4 blijft gewoon, ook als buso gevraagd werd', () => {
    const zonderOv4 = matrixVan([groep('G-0500', 'Zonder', [500])], [onderdeel(500, 'G-0500')]);
    const i = richtingInfo(zonderOv4, 'G-0500', VANDAAG)!;
    expect(richtingPad(i, kaderUit(INDEX, KOPPEL, { info: i, keuze: { groep: 'G-0500', soort: 'buso' } }))).toBe('/cursussen/richtingen/G-0500?soort=so');
    expect(richtingPad(info('G-0100'), kaderUit(INDEX, KOPPEL, { keuze: { soort: 'buso' } }))).toBe('/cursussen/richtingen/G-0100?soort=buso');
  });
});

describe('richtingTekst', () => {
  it('de titel met de graad; buitengewoon onderwijs zonder graad krijgt een toelichting', () => {
    expect(richtingTekst(info('G-0100'))).toBe('Natuurwetenschappen (2de graad)');
    expect(richtingTekst(info('G-0200'))).toBe('Eerste leerjaar A (1ste graad)');
    expect(richtingTekst(info('G-0400'))).toBe('Dubbele richting (buitengewoon onderwijs)');
  });
});

// ── Inlezen ─────────────────────────────────────────────────────────────────

describe('invulVoorInlezen', () => {
  it('2de graad: graad en gewoon onderwijs, geen stroom', () => {
    expect(invulVoorInlezen(info('G-0100'), kader())).toEqual({ graad: '2de graad', stroom: '', onderwijs: 'so' });
  });

  it('1ste graad: ook de stroom, zoals de inleeswizard ze noemt', () => {
    expect(invulVoorInlezen(info('G-0200'), kaderUit(INDEX, KOPPEL, { info: info('G-0200') }))).toEqual({ graad: '1ste graad', stroom: 'A-stroom', onderwijs: 'so' });
    expect(invulVoorInlezen(info('G-0300'), kaderUit(INDEX, KOPPEL, { info: info('G-0300') })).stroom).toBe('B-stroom');
  });

  it('buitengewoon onderwijs zonder graad: geen graad, soort buso', () => {
    const i = info('G-0400');
    expect(invulVoorInlezen(i, kaderUit(INDEX, KOPPEL, { info: i }))).toEqual({ graad: '', stroom: '', onderwijs: 'buso' });
  });

  it('de waarden bestaan als keuze in stap 1 van de inleeswizard', () => {
    for (const nummer of ['G-0100', 'G-0200', 'G-0300']) {
      const v = invulVoorInlezen(info(nummer), kaderUit(INDEX, KOPPEL, { info: info(nummer) }));
      expect(GRAAD_OPTIES as readonly string[]).toContain(v.graad);
      if (v.stroom !== '') expect(STROOM_OPTIES as readonly string[]).toContain(v.stroom);
    }
  });
});
