import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BK_BRON,
  doelcodesVanBestand,
  splitsBk,
  valideerBkBestand,
  type BkBestand,
  type BkIndex,
  type Competentie,
  type KoppelingBestand,
} from './beroepskwalificaties';
import {
  controleerBkLeerplan,
  leerplanUitBk,
  selectieVanBkLeerplan,
  tekstVanCompetentie,
  titelVoorBkLeerplan,
  vergelijkMetBk,
  vindBkLeerplan,
  type BkKeuze,
  type BkLeerplanOpties,
  type BkMelding,
} from './bkLeerplan';
import { createCourse } from './courses';
import type { Course } from './courseTypes';
import {
  doelenVingerafdruk,
  exportCurriculumJson,
  importCurriculumJson,
  maakEigenKopie,
  sanitizeCurriculum,
} from './curriculum';
import type { Curriculum } from './curriculumTypes';
import { dekkingMinimumdoelen, type KaderDoel } from './dekkingMinimumdoelen';
import { leerplanHeeftVerwijzingen } from './dekkingWeergave';
import { leerplanUitSelectie, selectieVanLeerplan } from './doelenSamenstellen';
import type { Doelgroep } from './doelgroep';
import { codesVoorDoelen, cursussenVoorGaten } from './gatenDichten';
import { effectieveStatus, isBkLeerplan, isSamengesteld, uitOfficieleBron } from './leerplanStatus';
import type { MinimumdoelenIndexSet, MinimumdoelenSetBestand } from './minimumdoelen';
import { NAGEKEKEN_DOOR_BRON } from './minimumdoelenLeerplan';
import { bkKader, type RichtingBk } from './richtingBk';
import { cursusVoorRichting, leerplannenBijRichting, vergelijkMetKader, vindLeerplanMetSelectie } from './richtingCursus';
import { doelgroepVan, richtingInfo, veranderdSindsLeerplan, type RichtingInfo, type RichtingKader } from './richtingKader';
import { beginUitBewaarde } from './richtingLink';
import { bijdragenVoorKader, mijnRichtingen } from './richtingOverzicht';
import { sha256Hex } from './sha256';
import type { MatrixBestand } from './studierichtingen';

// ── Fixtures ────────────────────────────────────────────────────────────────

const HIER = fileURLToPath(new URL('.', import.meta.url));
const lees = (pad: string): unknown => JSON.parse(readFileSync(join(HIER, '../../tests/fixtures', pad), 'utf8'));

const VANDAAG = '2026-10-10';
const MATRIX = lees('structuur/uit/studierichtingen.json') as MatrixBestand;
const KOPPELING = lees('kwalificaties/uit/koppeling.json') as KoppelingBestand;
const INDEX = lees('kwalificaties/uit/index.json') as BkIndex;
const ONTHAAL = lees('kwalificaties/uit/bk/BK-0390-2.json') as BkBestand;
const RECREATIEF = lees('kwalificaties/uit/bk/BK-0464-1.json') as BkBestand;
const NAGEBOOTST_1 = lees('kwalificaties/uit/bk/BK-9999-1.json') as BkBestand;
const NAGEBOOTST_2 = lees('kwalificaties/uit/bk/BK-9999-2.json') as BkBestand;

/** De versiemerken uit de index: bk → de eerste 16 tekens van de sha256. */
const MERKEN: ReadonlyMap<string, string> = new Map(INDEX.bks.filter((r) => r.sha256).map((r) => [r.bk, (r.sha256 as string).slice(0, 16)]));

function richting(groep: string): RichtingInfo {
  const i = richtingInfo(MATRIX, groep, VANDAAG);
  if (!i) throw new Error(`${groep} ontbreekt in de structuurfixtures`);
  return i;
}

const INFO_8 = richting('G-0008');
const DG: Doelgroep = doelgroepVan(INFO_8, { groep: 'G-0008', soort: 'so', jaar: 3 });

const ids = (b: BkBestand) => b.competenties.map((c) => c.id);

function maak(keuzes: BkKeuze[], extra: Partial<BkLeerplanOpties> = {}) {
  return leerplanUitBk(keuzes, { doelgroep: DG, merken: MERKEN, ...extra });
}

function alleVan(b: BkBestand): BkKeuze {
  return { bestand: b, competenties: ids(b) };
}

/** Een nagekeken leerplan met alle competenties van Onthaalmedewerker (of de gegeven keuzes). */
function nagekeken(keuzes: BkKeuze[] = [alleVan(ONTHAAL)], extra: Partial<BkLeerplanOpties> = {}): Curriculum {
  const u = maak(keuzes, extra);
  expect(u.bevestigd, u.waarschuwingen.join(' | ')).toBe(true);
  return u.leerplan;
}

/** Geen tekst voor het scherm mag een competentiecode, set-id, groepnummer of ADV-nummer bevatten. */
function schermVeilig(...teksten: (string | undefined)[]) {
  for (const t of teksten) if (t !== undefined) expect(t).not.toMatch(/bkc\d|ODS_|G-\d{4}|ADV-\d/i);
}

/** Een eigen BK-bestand dat door de validator komt. `zonderNr`: die plaatsen (0-based) krijgen geen nr (en staan achteraan). */
function maakBk(bk: string, titel: string, aantal: number, opties: { teksten?: Record<number, string>; ids?: Record<number, string>; zonderNr?: number[] } = {}): BkBestand {
  const delen = splitsBk(bk) as { nummer: string; versie: number };
  const competenties: Competentie[] = [];
  for (let i = 0; i < aantal; i++) {
    const c: Competentie = {
      id: opties.ids?.[i] ?? `bkc9${delen.nummer.slice(3)}${String(i + 1).padStart(4, '0')}`,
      type: 'Vakspecifieke competentie',
      tekst: opties.teksten?.[i] ?? `Competentie ${i + 1} van ${titel}`,
      kennis: [],
      vaardigheden: [],
    };
    if (!opties.zonderNr?.includes(i)) c.nr = i + 1;
    competenties.push(c);
  }
  competenties.sort((a, b) => (a.nr === undefined ? 1 : 0) - (b.nr === undefined ? 1 : 0));
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

/** Dezelfde versie met een andere inhoud (een maandelijkse update): een nieuwe sha256. */
function bijgewerkt(b: BkBestand, wijzig: (c: Competentie[]) => Competentie[]): BkBestand {
  const competenties = wijzig(structuredClone(b.competenties));
  const nieuw: BkBestand = { ...structuredClone(b), competenties, aantal: competenties.length, sha256: sha256Hex(`${b.sha256}|${JSON.stringify(competenties)}`) };
  const fouten = valideerBkBestand(nieuw, b.bk);
  if (fouten.length > 0) throw new Error(`bijgewerkt: ${fouten.join(' ')}`);
  return nieuw;
}

const merkVan = (b: BkBestand) => b.sha256.slice(0, 16);

function diepBevroren<T>(v: T): T {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v as Record<string, unknown>)) diepBevroren(x);
    Object.freeze(v);
  }
  return v;
}

describe('de fixtures en hulpbestanden', () => {
  it('zijn geldig, en de merken van de index horen bij de bestanden', () => {
    for (const b of [ONTHAAL, RECREATIEF, NAGEBOOTST_1, NAGEBOOTST_2]) {
      expect(valideerBkBestand(b, b.bk)).toEqual([]);
      expect(MERKEN.get(b.bk)).toBe(merkVan(b));
    }
    expect(ONTHAAL.competenties).toHaveLength(12);
  });
});

// ── tekstVanCompetentie ─────────────────────────────────────────────────────

describe('tekstVanCompetentie', () => {
  it('zet HTML om naar tekst en normaliseert witruimte zoals elke doeltekst', () => {
    expect(tekstVanCompetentie(NAGEBOOTST_1.competenties[0])).toBe('Werkt veilig met het materiaal');
    expect(tekstVanCompetentie({ ...ONTHAAL.competenties[0], tekst: 'Werkt  in\tteamverband' })).toBe('Werkt in teamverband');
    expect(tekstVanCompetentie({ ...ONTHAAL.competenties[0], tekst: 'Veilig &amp; netjes' })).toBe('Veilig & netjes');
    expect(tekstVanCompetentie({ ...ONTHAAL.competenties[0], tekst: '<p>Eerste.</p><p>Tweede.</p>' })).toBe('Eerste.\nTweede.');
  });

  it('een gewone tekst blijft letterlijk', () => {
    expect(tekstVanCompetentie(ONTHAAL.competenties[0])).toBe('Werkt in teamverband');
    expect(tekstVanCompetentie(NAGEBOOTST_1.competenties[2])).toBe('Overlegt met collega’s');
  });

  it('is idempotent en gooit nooit', () => {
    const een = tekstVanCompetentie(NAGEBOOTST_1.competenties[0]);
    expect(tekstVanCompetentie({ ...NAGEBOOTST_1.competenties[0], tekst: een })).toBe(een);
    expect(tekstVanCompetentie({} as Competentie)).toBe('');
    expect(tekstVanCompetentie(null as unknown as Competentie)).toBe('');
  });
});

// ── leerplanUitBk: het gewone pad ───────────────────────────────────────────

describe('leerplanUitBk: alle competenties van één BK', () => {
  const u = maak([alleVan(ONTHAAL)]);
  const l = u.leerplan;

  it('is nagekeken door de officiële bron, zonder waarschuwingen', () => {
    expect(u.bevestigd).toBe(true);
    expect(u.waarschuwingen).toEqual([]);
    expect(u.rapport.kanBevestigen).toBe(true);
    expect(u.rapport.dekking).toEqual([]);
    expect(l.controle).toMatchObject({ status: 'gecontroleerd', door: NAGEKEKEN_DOOR_BRON });
    expect(l.controle?.samenvatting).toBe('Letterlijk overgenomen uit de beroepskwalificatie Onthaalmedewerker (12 competenties).');
    expect(effectieveStatus(l)).toBe('gecontroleerd');
  });

  it('een doel per competentie: code, letterlijke tekst, thema en één verwijzing; geen refs, geen toelichting', () => {
    expect(l.goals).toHaveLength(12);
    expect(l.goals.map((g) => g.code)).toEqual(Array.from({ length: 12 }, (_, i) => `BK-0390-2.${String(i + 1).padStart(2, '0')}`));
    l.goals.forEach((g, i) => {
      const c = ONTHAAL.competenties[i];
      expect(g.text).toBe(tekstVanCompetentie(c));
      expect(g.theme).toBe('Onthaalmedewerker › Vakspecifieke competentie');
      expect(g.bkRefs).toEqual([{ bk: 'BK-0390-2', id: c.id }]);
      expect(g.refs).toBeUndefined();
      expect(g.note).toBeUndefined();
    });
  });

  it('het leerplan: net, soort, methode, bron, vak, niveau, versiemerk met "alle", doelgroep zonder jaar', () => {
    expect(l).toMatchObject({
      net: 'beroepskwalificaties', kind: 'leerplan', subject: 'Onthaalmedewerker', level: '2de graad',
      source: 'Vlaamse kwalificatiestructuur: Onthaalmedewerker (BK-0390-2)',
      herkomst: { methode: 'beroepskwalificatie', bronUrl: BK_BRON },
      bkVersies: [{ bk: 'BK-0390-2', sha: merkVan(ONTHAAL), alle: true }],
    });
    expect(l.minimumdoelenSets).toBeUndefined();
    expect(l.doelgroep).toEqual({ groep: 'G-0008', titel: 'Assistent dierlijke productie', soort: 'so', graad: 2 });
    expect(l.title).toBe('Onthaalmedewerker · Assistent dierlijke productie · 2de graad');
  });

  it('een doelgroep met kadervelden: die vallen weg (een BK-leerplan volgt geen kader van minimumdoelen)', () => {
    const met = nagekeken([alleVan(ONTHAAL)], { doelgroep: { ...DG, kader: 'a'.repeat(64), kaderVolledig: 'b'.repeat(64), setAfdrukken: {}, volgtKader: true } });
    expect(met.doelgroep).toEqual({ groep: 'G-0008', titel: 'Assistent dierlijke productie', soort: 'so', graad: 2 });
  });

  it('de standaardtitel volgt de andere leerplannen van een richting: buitengewoon onderwijs krijgt dat erachter', () => {
    const info9 = richting('G-0009');
    const dg9 = doelgroepVan(info9, { groep: 'G-0009', soort: 'buso' });
    const l = nagekeken([alleVan(NAGEBOOTST_1)], { doelgroep: dg9 });
    expect(l.title).toBe('Nagebootste beroepskwalificatie · Assistent plantaardige productie · buitengewoon');
    expect(l.title).toBe(titelVoorBkLeerplan(info9, ['Nagebootste beroepskwalificatie']));
    expect(l.level).toBe('');
    // Een gewone richting in opleidingsvorm 4.
    const ov4 = nagekeken([alleVan(ONTHAAL)], { doelgroep: { ...DG, soort: 'buso' } });
    expect(ov4.title).toBe('Onthaalmedewerker · Assistent dierlijke productie · 2de graad · buitengewoon (OV4)');
  });

  it('titel en vak van de aanroeper', () => {
    const met = nagekeken([alleVan(ONTHAAL)], { titel: '  Mijn onthaal  ', vak: 'Onthaal' });
    expect(met.title).toBe('Mijn onthaal');
    expect(met.subject).toBe('Onthaal');
  });

  it('blijft nagekeken na saneren, exporteren en importeren (v2), en saneren verandert niets', () => {
    expect(sanitizeCurriculum(l)).toEqual(l);
    const terug = importCurriculumJson(exportCurriculumJson(l));
    expect(terug).not.toBeNull();
    expect(effectieveStatus(terug as Curriculum)).toBe('gecontroleerd');
    expect(terug?.goals.map((g) => g.bkRefs)).toEqual(l.goals.map((g) => g.bkRefs));
    expect(terug?.bkVersies).toEqual(l.bkVersies);
  });

  it('de poort keurt het opnieuw goed met hetzelfde bestand', () => {
    expect(controleerBkLeerplan(l, [ONTHAAL]).kanBevestigen).toBe(true);
    expect(controleerBkLeerplan(l, [ONTHAAL]).samenvatting).toBe('12 van 12 competenties letterlijk, 12 van 12 verwijzingen in orde, geen fouten.');
  });

  it('geen interne sleutel in een tekst voor het scherm', () => {
    schermVeilig(l.title, l.source, l.subject, l.controle?.samenvatting, u.rapport.samenvatting, ...l.goals.map((g) => g.theme), ...l.goals.map((g) => g.code));
  });
});

// ── De valkuil: een deel blijft een deel ────────────────────────────────────

describe('leerplanUitBk: een deelselectie (§ 9.5: nooit stil de hele BK)', () => {
  const vier = [ONTHAAL.competenties[10].id, ONTHAAL.competenties[1].id, ONTHAAL.competenties[6].id, ONTHAAL.competenties[4].id];

  it('4 van 12 competenties geeft precies 4 doelen, in de volgorde van het bestand, met hun eigen code', () => {
    const u = maak([{ bestand: ONTHAAL, competenties: vier }]);
    expect(u.bevestigd).toBe(true);
    expect(u.leerplan.goals).toHaveLength(4);
    expect(u.leerplan.goals.map((g) => g.code)).toEqual(['BK-0390-2.02', 'BK-0390-2.05', 'BK-0390-2.07', 'BK-0390-2.11']);
    expect(u.leerplan.bkVersies).toEqual([{ bk: 'BK-0390-2', sha: merkVan(ONTHAAL) }]);
    expect(u.leerplan.title).toBe('Onthaalmedewerker (4 van 12 competenties) · Assistent dierlijke productie · 2de graad');
    expect(u.leerplan.controle?.samenvatting).toBe('Letterlijk overgenomen uit de beroepskwalificatie Onthaalmedewerker (4 van 12 competenties).');
  });

  it('blijft 4 na saneren, exporteren en importeren, en de selectie van het leerplan is die 4', () => {
    const l = maak([{ bestand: ONTHAAL, competenties: vier }]).leerplan;
    const terug = importCurriculumJson(exportCurriculumJson(l)) as Curriculum;
    expect(terug.goals).toHaveLength(4);
    expect(effectieveStatus(terug)).toBe('gecontroleerd');
    expect(selectieVanBkLeerplan(terug)).toEqual(new Map([['BK-0390-2', [ONTHAAL.competenties[1].id, ONTHAAL.competenties[4].id, ONTHAAL.competenties[6].id, ONTHAAL.competenties[10].id]]]));
  });

  it('dubbels in de selectie tellen één keer; 1 competentie geeft 1 doel', () => {
    expect(maak([{ bestand: ONTHAAL, competenties: [...vier, ...vier] }]).leerplan.goals).toHaveLength(4);
    const een = maak([{ bestand: ONTHAAL, competenties: [ONTHAAL.competenties[2].id] }]);
    expect(een.leerplan.goals.map((g) => g.code)).toEqual(['BK-0390-2.03']);
    expect(een.leerplan.controle?.samenvatting).toBe('Letterlijk overgenomen uit de beroepskwalificatie Onthaalmedewerker (1 van 12 competenties).');
  });

  it('12 van 12 is alles: dan wel "alle"', () => {
    expect(maak([{ bestand: ONTHAAL, competenties: [...ids(ONTHAAL)].reverse() }]).leerplan.bkVersies).toEqual([{ bk: 'BK-0390-2', sha: merkVan(ONTHAAL), alle: true }]);
  });
});

// ── Vingerafdruk ────────────────────────────────────────────────────────────

describe('leerplanUitBk: dezelfde selectie geeft dezelfde vingerafdruk', () => {
  it('ook in een andere volgorde, met dubbels, of met twee keuzes voor dezelfde versie', () => {
    const vier = ids(ONTHAAL).slice(3, 7);
    const a = maak([{ bestand: ONTHAAL, competenties: vier }]).leerplan;
    const b = maak([{ bestand: ONTHAAL, competenties: [...vier].reverse().concat(vier[0]) }]).leerplan;
    const c = maak([{ bestand: ONTHAAL, competenties: vier.slice(0, 2) }, { bestand: ONTHAAL, competenties: vier.slice(2) }]).leerplan;
    expect(doelenVingerafdruk(b.goals)).toBe(doelenVingerafdruk(a.goals));
    expect(doelenVingerafdruk(c.goals)).toBe(doelenVingerafdruk(a.goals));
    expect(b.controle?.doelenSha256).toBe(a.controle?.doelenSha256);
    expect(c.controle?.doelenSha256).toBe(a.controle?.doelenSha256);
  });

  it('een andere selectie geeft een andere vingerafdruk', () => {
    const a = maak([{ bestand: ONTHAAL, competenties: ids(ONTHAAL).slice(0, 4) }]).leerplan;
    const b = maak([{ bestand: ONTHAAL, competenties: ids(ONTHAAL).slice(0, 5) }]).leerplan;
    expect(doelenVingerafdruk(b.goals)).not.toBe(doelenVingerafdruk(a.goals));
  });

  it('de BK\'s volgen de gekozen volgorde (dus een andere volgorde is een ander leerplan)', () => {
    const ab = maak([alleVan(ONTHAAL), alleVan(RECREATIEF)]).leerplan;
    const ba = maak([alleVan(RECREATIEF), alleVan(ONTHAAL)]).leerplan;
    expect(ab.goals[0].code).toBe('BK-0390-2.01');
    expect(ba.goals[0].code).toBe('BK-0464-1.01');
    expect(doelenVingerafdruk(ab.goals)).not.toBe(doelenVingerafdruk(ba.goals));
  });
});

// ── Meer BK's ───────────────────────────────────────────────────────────────

describe('leerplanUitBk: meer beroepskwalificaties', () => {
  it('twee BK\'s: 25 doelen, vak "Beroepsgerichte vorming", bron met beide, twee versiemerken', () => {
    const u = maak([alleVan(ONTHAAL), alleVan(RECREATIEF)]);
    expect(u.bevestigd).toBe(true);
    const l = u.leerplan;
    expect(l.goals).toHaveLength(25);
    expect(l.subject).toBe('Beroepsgerichte vorming');
    expect(l.source).toBe('Vlaamse kwalificatiestructuur: Onthaalmedewerker (BK-0390-2) · Recreatief medewerker (BK-0464-1)');
    expect(l.bkVersies).toEqual([
      { bk: 'BK-0390-2', sha: merkVan(ONTHAAL), alle: true },
      { bk: 'BK-0464-1', sha: merkVan(RECREATIEF), alle: true },
    ]);
    expect(l.title).toBe('Onthaalmedewerker en Recreatief medewerker · Assistent dierlijke productie · 2de graad');
    expect(l.controle?.samenvatting).toBe('Letterlijk overgenomen uit 2 beroepskwalificaties (25 competenties).');
    expect(new Set(l.goals.map((g) => g.theme))).toEqual(new Set(['Onthaalmedewerker › Vakspecifieke competentie', 'Recreatief medewerker › Vakspecifieke competentie']));
  });

  it('een versie zonder gekozen competenties valt weg', () => {
    const l = nagekeken([alleVan(ONTHAAL), { bestand: RECREATIEF, competenties: [] }]);
    expect(l.bkVersies?.map((m) => m.bk)).toEqual(['BK-0390-2']);
  });

  it('twee BK\'s met dezelfde titel krijgen het nummer in het thema', () => {
    const tweeling = maakBk('BK-0777-1', 'Nagebootste beroepskwalificatie', 2);
    const l = nagekeken([alleVan(NAGEBOOTST_1), alleVan(tweeling)], { merken: new Map([...MERKEN, ['BK-0777-1', merkVan(tweeling)]]) });
    expect(new Set(l.goals.map((g) => g.theme))).toEqual(new Set([
      'Nagebootste beroepskwalificatie (BK-9999) › Vakspecifieke competentie',
      'Nagebootste beroepskwalificatie (BK-0777) › Vakspecifieke competentie',
    ]));
  });

  it('een competentie zonder nr: de codes volgen de plaats; HTML wordt tekst', () => {
    const l = nagekeken([alleVan(NAGEBOOTST_1)]);
    expect(l.goals.map((g) => g.code)).toEqual(['BK-9999-1.01', 'BK-9999-1.02', 'BK-9999-1.03']);
    expect(l.goals[0].text).toBe('Werkt veilig met het materiaal');
  });

  it('een merk dat niet in de index staat (nog niet in de index), gebruikt dat van het bestand', () => {
    const l = nagekeken([alleVan(ONTHAAL)], { merken: new Map() });
    expect(l.bkVersies).toEqual([{ bk: 'BK-0390-2', sha: merkVan(ONTHAAL), alle: true }]);
  });
});

// ── Niet bevestigd: niets bewaren ───────────────────────────────────────────

describe('leerplanUitBk: niet bevestigd', () => {
  function nietBevestigd(u: ReturnType<typeof maak>, patroon: RegExp) {
    expect(u.bevestigd).toBe(false);
    expect(u.leerplan.controle).toBeUndefined();
    expect(u.waarschuwingen[0]).toMatch(patroon);
    schermVeilig(...u.waarschuwingen, ...u.rapport.bevindingen.map((b) => b.bericht));
  }

  it('geen enkele competentie', () => {
    const u = maak([{ bestand: ONTHAAL, competenties: [] }]);
    nietBevestigd(u, /^Kies minstens één competentie\.$/);
    expect(u.leerplan.goals).toEqual([]);
    nietBevestigd(maak([]), /^Kies minstens één competentie\.$/);
  });

  it('een gekozen code die niet (meer) in het bestand staat: niets, ook de rest niet', () => {
    const u = maak([{ bestand: ONTHAAL, competenties: [ONTHAAL.competenties[0].id, 'bkc0000000', '__proto__'] }]);
    nietBevestigd(u, /^2 gekozen competenties staan niet \(meer\) in ‘Onthaalmedewerker’ \(BK-0390-2\)/);
    expect(u.leerplan.goals).toEqual([]);
  });

  it('een bestand dat niet door de validator komt', () => {
    nietBevestigd(maak([{ bestand: { ...ONTHAAL, aantal: 99 }, competenties: ids(ONTHAAL) }]), /konden niet gelezen worden/);
    nietBevestigd(maak([alleVan(RECREATIEF), { bestand: null as unknown as BkBestand, competenties: [] }]), /konden niet gelezen worden/);
  });

  it('een versiemerk in de index dat niet bij het bestand past (index en bestand van een andere update)', () => {
    nietBevestigd(maak([alleVan(ONTHAAL)], { merken: new Map([['BK-0390-2', '0123456789abcdef']]) }), /horen niet bij de laatste update/);
  });

  it('meer dan 20 BK\'s', () => {
    const veel = Array.from({ length: 21 }, (_, i) => maakBk(`BK-${String(100 + i).padStart(4, '0')}-1`, `Beroep ${i + 1}`, 1));
    const u = maak(veel.map(alleVan), { merken: new Map() });
    nietBevestigd(u, /21 beroepskwalificaties\. Eén leerplan kan hoogstens 20/);
    expect(maak(veel.slice(0, 20).map(alleVan), { merken: new Map() }).bevestigd).toBe(true);
  });

  it('meer dan 5000 competenties', () => {
    const groot = maakBk('BK-0888-1', 'Groot beroep', 5001);
    nietBevestigd(maak([alleVan(groot)], { merken: new Map() }), /^Je koos 5001 competenties\. Eén leerplan kan hoogstens 5000 doelen bevatten/);
  });

  it('twee versies van hetzelfde nummer: de poort weigert', () => {
    const u = maak([alleVan(NAGEBOOTST_1), alleVan(NAGEBOOTST_2)]);
    nietBevestigd(u, /^Het leerplan kon niet als nagekeken bevestigd worden, want het nakijken vond een probleem: .*2 versies van dezelfde beroepskwalificatie \(BK-9999-1, BK-9999-2\)/);
  });

  it('een competentie waarvan de verwijzing bij het saneren wegvalt (code "constructor")', () => {
    const raar = maakBk('BK-0555-1', 'Raar beroep', 2, { ids: { 1: 'constructor' } });
    const u = maak([alleVan(raar)], { merken: new Map() });
    nietBevestigd(u, /^Niet alle gekozen competenties bleven ongewijzigd bij het bewaren/);
  });

  it('een tekst die langer is dan een doel mag zijn: ingekort bij het saneren, dus niet letterlijk', () => {
    const lang = maakBk('BK-0557-1', 'Lang beroep', 1, { teksten: { 0: `${'woord '.repeat(2000)}einde` } });
    nietBevestigd(maak([alleVan(lang)], { merken: new Map() }), /niet letterlijk/);
  });
});

// ── Een competentie zonder tekst (punt 2 van de tweede controle) ────────────

describe('leerplanUitBk: een competentie zonder tekst wordt overgeslagen, met een waarschuwing', () => {
  // Competentie 2 van 3 heeft een tekst die na de omzetting leeg is. De validator van K1 laat ze door (de bron is niet
  // leeg), maar een doel zonder tekst valt weg bij het saneren: ze kan nooit een doel worden.
  const LEEG = maakBk('BK-0556-1', 'Leeg beroep', 3, { teksten: { 1: '<p>&nbsp;</p>' } });
  const LEEG_ID = LEEG.competenties[1].id;
  const metTekst = [LEEG.competenties[0].id, LEEG.competenties[2].id];
  const geenMerken = new Map<string, string>();

  it('de bron is geldig, en de tekst na de omzetting is leeg', () => {
    expect(valideerBkBestand(LEEG, LEEG.bk)).toEqual([]);
    expect(tekstVanCompetentie(LEEG.competenties[1])).toBe('');
  });

  it('alle competenties gekozen: nagekeken met de 2 competenties met tekst, en de waarschuwing zegt waarom er één ontbreekt', () => {
    const u = maak([alleVan(LEEG)], { merken: geenMerken });
    expect(u.bevestigd, u.waarschuwingen.join(' | ')).toBe(true);
    expect(u.waarschuwingen).toEqual(['1 gekozen competentie van ‘Leeg beroep’ (BK-0556-1) heeft geen tekst in de officiële bron. Ze werd overgeslagen.']);
    expect(u.waarschuwingen.join(' ')).not.toMatch(/viel weg bij het bewaren/);
    schermVeilig(...u.waarschuwingen);
    expect(u.leerplan.goals.map((g) => g.bkRefs?.[0].id)).toEqual(metTekst);
    expect(u.leerplan.goals.map((g) => g.code)).toEqual(['BK-0556-1.01', 'BK-0556-1.03']);
    // "Alle" telt de competenties met tekst: geen deel in titel of samenvatting.
    expect(u.leerplan.bkVersies).toEqual([{ bk: 'BK-0556-1', sha: merkVan(LEEG), alle: true }]);
    expect(u.leerplan.title).not.toMatch(/ van /);
    expect(u.leerplan.controle?.samenvatting).toBe('Letterlijk overgenomen uit de beroepskwalificatie Leeg beroep (2 competenties).');
    const terug = importCurriculumJson(exportCurriculumJson(u.leerplan)) as Curriculum;
    expect(terug.goals).toHaveLength(2);
    expect(effectieveStatus(terug)).toBe('gecontroleerd');
  });

  it('zonder die competentie: hetzelfde leerplan (zelfde doelen en vingerafdruk), zonder waarschuwing', () => {
    const met = maak([alleVan(LEEG)], { merken: geenMerken });
    const zonder = maak([{ bestand: LEEG, competenties: metTekst }], { merken: geenMerken });
    expect(zonder.bevestigd).toBe(true);
    expect(zonder.waarschuwingen).toEqual([]);
    expect(zonder.leerplan.bkVersies).toEqual(met.leerplan.bkVersies);
    expect(zonder.rapport.doelenSha256).toBe(met.rapport.doelenSha256);
    expect(zonder.rapport.doelenSha256).toBe(doelenVingerafdruk(met.leerplan.goals));
    expect(selectieVanBkLeerplan(zonder.leerplan)).toEqual(selectieVanBkLeerplan(met.leerplan));
  });

  it('een deel: het telt alleen de competenties met tekst ("1 van 2")', () => {
    const u = maak([{ bestand: LEEG, competenties: [LEEG.competenties[2].id, LEEG_ID] }], { merken: geenMerken });
    expect(u.bevestigd).toBe(true);
    expect(u.leerplan.goals).toHaveLength(1);
    expect(u.leerplan.bkVersies?.[0].alle).toBeUndefined();
    expect(u.leerplan.title).toContain('(1 van 2 competenties)');
    expect(u.waarschuwingen).toHaveLength(1);
  });

  it('meer competenties zonder tekst: de waarschuwing in het meervoud', () => {
    const twee = maakBk('BK-0558-1', 'Half leeg beroep', 3, { teksten: { 0: '<p></p>', 2: '&nbsp; <br>' } });
    const u = maak([alleVan(twee)], { merken: geenMerken });
    expect(u.bevestigd).toBe(true);
    expect(u.leerplan.goals).toHaveLength(1);
    expect(u.waarschuwingen).toEqual(['2 gekozen competenties van ‘Half leeg beroep’ (BK-0558-1) hebben geen tekst in de officiële bron. Ze werden overgeslagen.']);
  });

  it('alleen competenties zonder tekst gekozen: niets bevestigd; eerst "kies minstens één", dan waarom', () => {
    const u = maak([{ bestand: LEEG, competenties: [LEEG_ID] }], { merken: geenMerken });
    expect(u.bevestigd).toBe(false);
    expect(u.leerplan.goals).toEqual([]);
    expect(u.leerplan.controle).toBeUndefined();
    expect(u.waarschuwingen).toEqual(['Kies minstens één competentie.', '1 gekozen competentie van ‘Leeg beroep’ (BK-0556-1) heeft geen tekst in de officiële bron. Ze werd overgeslagen.']);
  });

  it('een code die niet in het bestand staat, blokkeert nog altijd (ook naast een competentie zonder tekst)', () => {
    const u = maak([{ bestand: LEEG, competenties: [...metTekst, LEEG_ID, 'bkc0000000'] }], { merken: geenMerken });
    expect(u.bevestigd).toBe(false);
    expect(u.waarschuwingen[0]).toMatch(/^1 gekozen competentie staat niet \(meer\) in ‘Leeg beroep’/);
  });

  it('"Werk het leerplan bij" met de hele lijst (ook de competentie zonder tekst): dezelfde selectie, dus toegelaten', () => {
    const oud = nagekeken([alleVan(LEEG)], { merken: geenMerken });
    const nieuw = bijgewerkt(LEEG, (cs) => cs.map((c, i) => (i === 0 ? { ...c, tekst: 'Een verbeterde tekst' } : c)));
    const u = maak([alleVan(nieuw)], { bestaand: oud, merken: geenMerken });
    expect(u.bevestigd, u.waarschuwingen.join(' | ')).toBe(true);
    expect(u.leerplan.id).toBe(oud.id);
    expect(u.leerplan.goals.map((g) => g.text)).toEqual(['Een verbeterde tekst', 'Competentie 3 van Leeg beroep']);
  });

  it('de poort: een doel naar een competentie zonder tekst is een fout, ook met een lege doeltekst', () => {
    const goed = nagekeken([alleVan(LEEG)], { merken: geenMerken });
    const c = structuredClone(goed);
    delete c.controle;
    c.goals.push({ id: 'leegdoel', code: 'BK-0556-1.02', text: '', bkRefs: [{ bk: LEEG.bk, id: LEEG_ID }] });
    const r = controleerBkLeerplan(c, [LEEG]);
    expect(r.kanBevestigen).toBe(false);
    expect(r.bevindingen.map((b) => b.bericht)).toEqual(['Doel BK-0556-1.02: de competentie in ‘Leeg beroep’ (BK-0556-1) heeft geen tekst.']);
    expect(r.perDoel.leegdoel).toMatchObject({ verwijzingen: 'ok', letterlijk: 'nee' });
    expect(r.tellers).toMatchObject({ doelen: 3, letterlijk: 2, nietLetterlijk: 1 });
    schermVeilig(...r.bevindingen.map((b) => b.bericht));
  });

  it('vergelijkMetBk: een nieuwe competentie zonder tekst is geen nieuwe competentie; een gekozen die haar tekst verloor wel', () => {
    const alleLeeg = nagekeken([alleVan(LEEG)], { merken: geenMerken });
    const kaderLeeg: RichtingBk = { herkomst: 'nog-niet-opgehaald', bks: [], bekrachtigingen: [] };
    const merkNu = (b: BkBestand) => new Map([[b.bk, merkVan(b)]]);
    const extraLeeg = bijgewerkt(LEEG, (cs) => [...cs, { ...cs[0], id: 'bkc9055600009', nr: 4, tekst: '<p> </p>' }]);
    expect(vergelijkMetBk(alleLeeg, kaderLeeg, new Map([[LEEG.bk, extraLeeg]]), merkNu(extraLeeg))).toEqual([]);
    const tekstWeg = bijgewerkt(LEEG, (cs) => cs.map((c, i) => (i === 0 ? { ...c, tekst: '<br>' } : c)));
    expect(vergelijkMetBk(alleLeeg, kaderLeeg, new Map([[LEEG.bk, tekstWeg]]), merkNu(tekstWeg))).toEqual([{ soort: 'lijst-aangepast', bk: 'BK-0556-1' }]);
    // De competentie zonder tekst krijgt er een: bij "alle" is dat een nieuwe competentie.
    const tekstErbij = bijgewerkt(LEEG, (cs) => cs.map((c, i) => (i === 1 ? { ...c, tekst: 'Nu met tekst' } : c)));
    expect(vergelijkMetBk(alleLeeg, kaderLeeg, new Map([[LEEG.bk, tekstErbij]]), merkNu(tekstErbij))).toEqual([{ soort: 'lijst-aangepast', bk: 'BK-0556-1' }]);
  });
});

// ── Bijwerken: zelfde versie, tekstcorrectie ────────────────────────────────

describe('leerplanUitBk met bestaand ("Werk het leerplan bij")', () => {
  // Een update van dezelfde versie: competentie 2 krijgt een andere tekst en verliest haar nr (ze staat dan achteraan),
  // zodat `doelcodesVanBestand` nu andere codes zou geven (de plaats).
  const nieuw = bijgewerkt(ONTHAAL, (cs) => {
    const tweede = { ...cs[1], tekst: 'Nagebootste competentie 2, met een verbeterde tekst' };
    delete tweede.nr;
    return [cs[0], ...cs.slice(2), tweede];
  });
  const nieuweMerken = new Map([...MERKEN, ['BK-0390-2', merkVan(nieuw)]]);

  it('houdt id, createdAt, titel en de code per competentie; neemt de nieuwe teksten en het nieuwe merk', () => {
    const oud = nagekeken([alleVan(ONTHAAL)], { titel: 'Mijn titel' });
    const u = maak([{ bestand: nieuw, competenties: ids(nieuw) }], { bestaand: oud, merken: nieuweMerken });
    expect(u.bevestigd, u.waarschuwingen.join(' | ')).toBe(true);
    const l = u.leerplan;
    expect(l.id).toBe(oud.id);
    expect(l.createdAt).toBe(oud.createdAt);
    expect(l.title).toBe('Mijn titel');
    const codeVan = (c: Curriculum) => new Map(c.goals.map((g) => [g.bkRefs?.[0].id, g.code]));
    expect(codeVan(l)).toEqual(codeVan(oud));
    expect(doelcodesVanBestand(nieuw).get(ONTHAAL.competenties[1].id)).toBe('BK-0390-2.12'); // wat een nieuw leerplan zou krijgen
    expect(l.goals.find((g) => g.bkRefs?.[0].id === ONTHAAL.competenties[1].id)?.text).toBe('Nagebootste competentie 2, met een verbeterde tekst');
    expect(l.bkVersies).toEqual([{ bk: 'BK-0390-2', sha: merkVan(nieuw), alle: true }]);
    expect(effectieveStatus(l)).toBe('gecontroleerd');
  });

  it('een deelselectie blijft een deel', () => {
    const oud = nagekeken([{ bestand: ONTHAAL, competenties: ids(ONTHAAL).slice(0, 3) }]);
    const l = maak([{ bestand: nieuw, competenties: ids(ONTHAAL).slice(0, 3) }], { bestaand: oud, merken: nieuweMerken }).leerplan;
    // De volgorde is die van het nieuwe bestand (competentie 2 staat er nu achteraan), de codes blijven die van toen.
    expect(l.goals.map((g) => g.code)).toEqual(['BK-0390-2.01', 'BK-0390-2.03', 'BK-0390-2.02']);
    expect(l.goals.map((g) => g.bkRefs?.[0].id)).toEqual([ids(ONTHAAL)[0], ids(ONTHAAL)[2], ids(ONTHAAL)[1]]);
    expect(l.bkVersies?.[0].alle).toBeUndefined();
  });

  it('gooit bij een andere selectie, of als een gekozen competentie niet meer in het bestand staat', () => {
    const oud = nagekeken([alleVan(ONTHAAL)]);
    expect(() => maak([{ bestand: nieuw, competenties: ids(nieuw).slice(1) }], { bestaand: oud, merken: nieuweMerken })).toThrow(/lijst competenties is veranderd/);
    const zonder = bijgewerkt(ONTHAAL, (cs) => cs.slice(0, 11));
    expect(() => maak([alleVan(ONTHAAL)].map((k) => ({ ...k, bestand: zonder })), { bestaand: oud, merken: new Map() })).toThrow(/lijst competenties is veranderd/);
    expect(() => maak([alleVan(ONTHAAL), alleVan(RECREATIEF)], { bestaand: oud })).toThrow(/lijst competenties is veranderd/);
  });

  it('gooit voor een ander leerplan of een eigen kopie', () => {
    const samengesteld = { ...nagekeken(), herkomst: { methode: 'samengesteld' as const, ingelezenOp: 1 } };
    expect(() => maak([alleVan(ONTHAAL)], { bestaand: samengesteld })).toThrow(/Alleen een nagekeken leerplan met de competenties/);
    expect(() => maak([alleVan(ONTHAAL)], { bestaand: maakEigenKopie(nagekeken()) })).toThrow(/Alleen een nagekeken leerplan met de competenties/);
  });

  it('een bestand dat niet gelezen kon worden, is geen andere lijst: niet bevestigd, zonder fout', () => {
    const oud = nagekeken([alleVan(ONTHAAL)]);
    const u = maak([{ bestand: { ...ONTHAAL, aantal: 1 }, competenties: ids(ONTHAAL) }], { bestaand: oud });
    expect(u.bevestigd).toBe(false);
    expect(u.waarschuwingen[0]).toMatch(/konden niet gelezen worden/);
  });
});

// ── De nakijkpoort: elke fout ───────────────────────────────────────────────

describe('controleerBkLeerplan: elke poortfout', () => {
  const goed = nagekeken([alleVan(ONTHAAL), alleVan(RECREATIEF)]);
  const BESTANDEN = [ONTHAAL, RECREATIEF];

  function poort(wijzig: (c: Curriculum) => void, bestanden: BkBestand[] = BESTANDEN) {
    const c = structuredClone(goed);
    delete c.controle;
    wijzig(c);
    const r = controleerBkLeerplan(c, bestanden);
    expect(r.kanBevestigen).toBe(false);
    schermVeilig(r.samenvatting, ...r.bevindingen.map((b) => b.bericht));
    return r.bevindingen.map((b) => b.bericht).join('\n');
  }

  it('het goede leerplan gaat erdoor', () => {
    const r = controleerBkLeerplan(goed, BESTANDEN);
    expect(r.kanBevestigen).toBe(true);
    expect(r.tellers).toEqual({ doelen: 25, letterlijk: 25, nietLetterlijk: 0, verwijzingen: 25, verwijzingenOk: 25 });
    expect(r.doelenSha256).toBe(doelenVingerafdruk(goed.goals));
    expect(Object.keys(r.perDoel)).toHaveLength(25);
  });

  it('1: een andere methode, een doel met refs, of sets minimumdoelen', () => {
    expect(poort((c) => { c.herkomst = { methode: 'samengesteld', ingelezenOp: 1 }; })).toMatch(/komt niet uit een beroepskwalificatie/);
    expect(poort((c) => { delete c.herkomst; })).toMatch(/komt niet uit een beroepskwalificatie/);
    expect(poort((c) => { c.goals[3].refs = [{ set: 'ODS_1', id: '1', code: '01.01' }]; })).toMatch(/Doel BK-0390-2\.04 verwijst naar minimumdoelen/);
    expect(poort((c) => { c.minimumdoelenSets = ['ODS_1']; })).toMatch(/noemt geen sets minimumdoelen/);
    // Lege lijsten zijn geen verwijzingen.
    const c = structuredClone(goed);
    c.goals[0].refs = [];
    c.minimumdoelenSets = [];
    expect(controleerBkLeerplan(c, BESTANDEN).kanBevestigen).toBe(true);
  });

  it('2: geen of twee verwijzingen, een versie buiten bkVersies, een bestand dat niet meegegeven is', () => {
    expect(poort((c) => { delete c.goals[0].bkRefs; })).toMatch(/Doel BK-0390-2\.01 verwijst naar geen enkele competentie/);
    expect(poort((c) => { c.goals[0].bkRefs = [...(c.goals[0].bkRefs ?? []), { bk: 'BK-0390-2', id: ONTHAAL.competenties[5].id }]; })).toMatch(/verwijst naar 2 competenties/);
    expect(poort((c) => { c.bkVersies = c.bkVersies?.filter((m) => m.bk !== 'BK-0464-1'); })).toMatch(/niet in de lijst beroepskwalificaties van het leerplan/);
    // Zonder bestand geen titel: een neutrale naam met het nummer erachter, nooit het nummer alleen (§ 23.7).
    const zonderBestand = poort(() => undefined, [ONTHAAL]);
    expect(zonderBestand).toMatch(/De competenties van een beroepskwalificatie \(BK-0464-1\) zijn niet geladen/);
    expect(zonderBestand).not.toMatch(/(^|van |naar )BK-0464-1/m);
    expect(poort(() => undefined, [ONTHAAL, { ...RECREATIEF, aantal: 3 }])).toMatch(/niet geladen/);
    expect(poort((c) => { c.goals[0].bkRefs = [{ bk: 'geen-bk', id: 'x' }]; })).toMatch(/zonder geldig nummer/);
  });

  it('2: het versiemerk hoort niet bij het meegegeven bestand, of een versie zonder doel', () => {
    expect(poort((c) => { (c.bkVersies ?? [])[0].sha = '0123456789abcdef'; })).toMatch(/andere versie van de gegevens van ‘Onthaalmedewerker’/);
    const derde = maakBk('BK-0777-1', 'Derde beroep', 1);
    expect(poort((c) => { c.bkVersies?.push({ bk: 'BK-0777-1', sha: merkVan(derde) }); }, [...BESTANDEN, derde])).toMatch(/‘Derde beroep’ \(BK-0777-1\) staat in de lijst .* geen enkel doel komt eruit/);
  });

  it('3: een competentie die niet in het bestand staat, of een tekst die niet letterlijk is', () => {
    expect(poort((c) => { (c.goals[1].bkRefs ?? [])[0].id = 'bkc0000001'; })).toMatch(/Doel BK-0390-2\.02 verwijst naar een competentie die niet in ‘Onthaalmedewerker’ \(BK-0390-2\) staat/);
    expect(poort((c) => { c.goals[2].text = `${c.goals[2].text}.`; })).toMatch(/Doel BK-0390-2\.03: de tekst is niet letterlijk/);
    // Eén teken verschil telt, ook hoofdletters.
    expect(poort((c) => { c.goals[0].text = c.goals[0].text.toLowerCase(); })).toMatch(/niet letterlijk/);
  });

  it('4: een competentie twee keer, een versie twee keer, of twee versies van hetzelfde nummer', () => {
    expect(poort((c) => { c.goals[1].bkRefs = structuredClone(c.goals[0].bkRefs); c.goals[1].text = c.goals[0].text; })).toMatch(/deze competentie van ‘Onthaalmedewerker’ \(BK-0390-2\) staat er meer dan één keer in/);
    expect(poort((c) => { c.bkVersies?.push({ ...(c.bkVersies ?? [])[0] }); })).toMatch(/staat twee keer in de lijst beroepskwalificaties/);
    const twee = nagekeken([alleVan(NAGEBOOTST_1)]);
    const c = structuredClone(twee);
    const extra = nagekeken([alleVan(NAGEBOOTST_2)]);
    c.goals.push(...extra.goals);
    c.bkVersies?.push(...(extra.bkVersies ?? []));
    const r = controleerBkLeerplan(c, [NAGEBOOTST_1, NAGEBOOTST_2]);
    expect(r.kanBevestigen).toBe(false);
    expect(r.bevindingen.map((b) => b.bericht).join('\n')).toMatch(/2 versies van dezelfde beroepskwalificatie \(BK-9999-1, BK-9999-2\)/);
  });

  it('5: een code die niet uniek is (ook na normaliseren), te lang, of met het verkeerde voorvoegsel', () => {
    expect(poort((c) => { c.goals[1].code = c.goals[0].code.toLowerCase(); })).toMatch(/De code BK-0390-2\.01 staat er meer dan één keer in/);
    expect(poort((c) => { c.goals[1].code = `BK-0390-2.${'9'.repeat(60)}`; })).toMatch(/code van meer dan 60 tekens/);
    expect(poort((c) => { c.goals[1].code = 'BK-0464-1.99'; })).toMatch(/de code begint niet met het nummer van de eigen beroepskwalificatie \(BK-0390-2\)/);
    expect(poort((c) => { c.goals[1].code = 'BK-0390-20.02'; })).toMatch(/begint niet met/);
    expect(poort((c) => { c.goals[1].code = 'BK-0390-2.'; })).toMatch(/begint niet met/);
    expect(poort((c) => { c.goals[1].code = 'WIS 2.3'; })).toMatch(/begint niet met/);
    expect(poort((c) => { c.goals[1].code = ''; })).toMatch(/heeft geen code/);
  });

  it('5: de code hoeft niet gelijk te zijn aan wat doelcodesVanBestand nu zou geven (bijwerken houdt oude codes)', () => {
    const c = structuredClone(goed);
    c.goals[0].code = 'BK-0390-2.900';
    expect(controleerBkLeerplan(c, BESTANDEN).kanBevestigen).toBe(true);
  });

  it('6: geen enkel doel, meer dan 20 BK\'s, meer dan 5000 doelen', () => {
    expect(poort((c) => { c.goals = []; })).toMatch(/heeft geen doelen/);
    const veel = Array.from({ length: 21 }, (_, i) => maakBk(`BK-${String(100 + i).padStart(4, '0')}-1`, `Beroep ${i + 1}`, 1));
    const twintig = nagekeken(veel.slice(0, 20).map(alleVan), { merken: new Map() });
    const extra = nagekeken([alleVan(veel[20])], { merken: new Map() });
    const c = structuredClone(twintig);
    c.goals.push(...extra.goals);
    c.bkVersies?.push(...(extra.bkVersies ?? []));
    const r = controleerBkLeerplan(c, veel);
    expect(r.kanBevestigen).toBe(false);
    expect(r.bevindingen.map((b) => b.bericht)).toEqual([expect.stringMatching(/noemt 21 beroepskwalificaties\. Eén leerplan kan hoogstens 20/)]);

    const groot = maakBk('BK-0888-1', 'Groot beroep', 5001);
    const codes = doelcodesVanBestand(groot);
    const vol: Curriculum = {
      ...structuredClone(goed),
      bkVersies: [{ bk: groot.bk, sha: merkVan(groot), alle: true }],
      goals: groot.competenties.map((comp, i) => ({ id: `d${i}`, code: codes.get(comp.id) as string, text: tekstVanCompetentie(comp), bkRefs: [{ bk: groot.bk, id: comp.id }] })),
    };
    const r2 = controleerBkLeerplan(vol, [groot]);
    expect(r2.bevindingen.map((b) => b.bericht)).toEqual(['Het leerplan heeft 5001 doelen. Eén leerplan kan hoogstens 5000 doelen bevatten.']);
  });

  it('gooit nooit, ook niet op rommel', () => {
    for (const rommel of [null, {}, { goals: 'x' }, { goals: [null, 3, { code: 'x' }] }, { herkomst: { methode: 'beroepskwalificatie' }, goals: [{ bkRefs: 'x' }], bkVersies: [null, { bk: 3 }] }]) {
      const r = controleerBkLeerplan(rommel as unknown as Curriculum, [ONTHAAL, null as unknown as BkBestand]);
      expect(r.kanBevestigen).toBe(false);
    }
  });

  it('bevestigLeerplan weigert een rapport van andere doelen (de vingerafdruk)', () => {
    const r = controleerBkLeerplan(goed, BESTANDEN);
    expect(r.doelenSha256).toBe(goed.controle?.doelenSha256);
  });
});

// ── De selectie van een bewaard leerplan ────────────────────────────────────

describe('selectieVanBkLeerplan', () => {
  it('in de volgorde van bkVersies en de doelen, zonder dubbels; leeg voor een ander leerplan', () => {
    const l = nagekeken([{ bestand: RECREATIEF, competenties: ids(RECREATIEF).slice(0, 2) }, { bestand: ONTHAAL, competenties: ids(ONTHAAL).slice(0, 1) }]);
    expect([...selectieVanBkLeerplan(l)]).toEqual([['BK-0464-1', ids(RECREATIEF).slice(0, 2)], ['BK-0390-2', ids(ONTHAAL).slice(0, 1)]]);
    expect(selectieVanBkLeerplan({ ...l, herkomst: { methode: 'samengesteld', ingelezenOp: 1 } }).size).toBe(0);
    expect(selectieVanBkLeerplan(null as unknown as Curriculum).size).toBe(0);
  });

  it('een verwijzing naar een versie die niet in bkVersies staat, valt niet stil weg', () => {
    const l = structuredClone(nagekeken([{ bestand: ONTHAAL, competenties: ids(ONTHAAL).slice(0, 1) }]));
    l.goals.push({ ...l.goals[0], id: 'x', code: 'BK-0464-1.01', bkRefs: [{ bk: 'BK-0464-1', id: RECREATIEF.competenties[0].id }] });
    expect([...selectieVanBkLeerplan(l).keys()]).toEqual(['BK-0390-2', 'BK-0464-1']);
  });
});

// ── Hergebruik ──────────────────────────────────────────────────────────────

describe('vindBkLeerplan: hergebruik alleen bij gelijke selectie én gelijk versiemerk', () => {
  const vier = ids(ONTHAAL).slice(2, 6);
  const l = nagekeken([{ bestand: ONTHAAL, competenties: vier }]);
  const sel = (lijst: readonly string[], bk = 'BK-0390-2') => new Map([[bk, lijst]]);

  it('dezelfde selectie en hetzelfde merk: gevonden, ook in een andere volgorde', () => {
    expect(vindBkLeerplan([l], sel(vier), DG, MERKEN)).toBe(l);
    expect(vindBkLeerplan([l], sel([...vier].reverse()), DG, MERKEN)).toBe(l);
  });

  it('een andere selectie (minder, meer, of een andere BK): niet', () => {
    expect(vindBkLeerplan([l], sel(vier.slice(1)), DG, MERKEN)).toBeUndefined();
    expect(vindBkLeerplan([l], sel([...vier, ids(ONTHAAL)[0]]), DG, MERKEN)).toBeUndefined();
    expect(vindBkLeerplan([l], new Map([['BK-0390-2', vier], ['BK-0464-1', ids(RECREATIEF)]]), DG, MERKEN)).toBeUndefined();
    expect(vindBkLeerplan([l], new Map(), DG, MERKEN)).toBeUndefined();
    expect(vindBkLeerplan([l], sel([]), DG, MERKEN)).toBeUndefined();
  });

  it('dezelfde selectie, maar een ander merk in de index (de versie veranderde): niet', () => {
    expect(vindBkLeerplan([l], sel(vier), DG, new Map([['BK-0390-2', '0123456789abcdef']]))).toBeUndefined();
    expect(vindBkLeerplan([l], sel(vier), DG, new Map())).toBeUndefined();
  });

  it('een eigen kopie, een gewijzigd leerplan of een ander soort leerplan: niet', () => {
    expect(vindBkLeerplan([maakEigenKopie(l)], sel(vier), DG, MERKEN)).toBeUndefined();
    const gewijzigd = structuredClone(l);
    gewijzigd.goals[0].text = 'Iets anders';
    expect(effectieveStatus(gewijzigd)).toBe('gewijzigd');
    expect(vindBkLeerplan([gewijzigd], sel(vier), DG, MERKEN)).toBeUndefined();
    expect(vindBkLeerplan([{ ...l, herkomst: { methode: 'samengesteld', ingelezenOp: 1 } }], sel(vier), DG, MERKEN)).toBeUndefined();
  });

  it('een andere richting: niet; zonder doelgroep (op het leerplan of gevraagd): wel', () => {
    expect(vindBkLeerplan([l], sel(vier), { ...DG, groep: 'G-0009' }, MERKEN)).toBeUndefined();
    const zonder = structuredClone(l);
    delete zonder.doelgroep;
    expect(vindBkLeerplan([zonder], sel(vier), DG, MERKEN)).toBe(zonder);
    expect(vindBkLeerplan([l], sel(vier), undefined as unknown as Doelgroep, MERKEN)).toBe(l);
  });

  it('de eerste die past (de nieuwste); rommel in de lijst gooit niet', () => {
    const tweede = nagekeken([{ bestand: ONTHAAL, competenties: vier }]);
    expect(vindBkLeerplan([null as unknown as Curriculum, tweede, l], sel(vier), DG, MERKEN)).toBe(tweede);
  });
});

// ── Titel ───────────────────────────────────────────────────────────────────

describe('titelVoorBkLeerplan', () => {
  const info393 = { ...INFO_8, groep: { ...INFO_8.groep, titel: 'Onthaal en recreatie' }, graad: 3 as const };

  it('één BK, twee BK\'s, en een deel', () => {
    expect(titelVoorBkLeerplan(info393, ['Onthaalmedewerker'])).toBe('Onthaalmedewerker · Onthaal en recreatie · 3de graad');
    expect(titelVoorBkLeerplan(info393, ['Onthaalmedewerker', 'Recreatief medewerker'])).toBe('Onthaalmedewerker en Recreatief medewerker · Onthaal en recreatie · 3de graad');
    expect(titelVoorBkLeerplan(info393, ['Onthaalmedewerker'], { gekozen: 8, totaal: 12 })).toBe('Onthaalmedewerker (8 van 12 competenties) · Onthaal en recreatie · 3de graad');
    expect(titelVoorBkLeerplan(info393, ['Onthaalmedewerker'], { gekozen: 12, totaal: 12 })).toBe('Onthaalmedewerker · Onthaal en recreatie · 3de graad');
  });

  it('buitengewoon onderwijs zonder graad', () => {
    expect(titelVoorBkLeerplan(richting('G-0009'), ['Nagebootste beroepskwalificatie'])).toBe('Nagebootste beroepskwalificatie · Assistent plantaardige productie · buitengewoon');
  });

  it('hoogstens 120 tekens, en het deel blijft leesbaar staan', () => {
    const lang = 'Medewerker '.repeat(20).trim();
    const t = titelVoorBkLeerplan(info393, [lang], { gekozen: 3, totaal: 12 });
    expect(t.length).toBeLessThanOrEqual(120);
    expect(t).toContain('(3 van 12 competenties)');
    expect(t).toContain('3de graad');
    expect(titelVoorBkLeerplan(info393, [lang, lang, 'Ander']).length).toBeLessThanOrEqual(120);
  });

  it('nooit een groepnummer', () => {
    schermVeilig(titelVoorBkLeerplan(richting('G-0009'), []), titelVoorBkLeerplan(info393, ['A'], { gekozen: 1, totaal: 2 }));
  });
});

// ── vergelijkMetBk: elk geval van § 23.6.6 ──────────────────────────────────

describe('vergelijkMetBk', () => {
  const kader8 = bkKader(KOPPELING, INDEX, INFO_8, { groep: 'G-0008', soort: 'so' }, VANDAAG);
  const alle = nagekeken([alleVan(ONTHAAL)]);
  const deel = nagekeken([{ bestand: ONTHAAL, competenties: ids(ONTHAAL).slice(0, 4) }]);
  const metNieuw = (b: BkBestand) => new Map([...MERKEN, [b.bk, merkVan(b)]]);
  const bestanden = (...lijst: BkBestand[]) => new Map(lijst.map((b) => [b.bk, b]));
  const geenKader: RichtingBk = { herkomst: 'nog-niet-opgehaald', bks: [], bekrachtigingen: [] };

  it('gelijk versiemerk: niets', () => {
    expect(kader8.herkomst).toBe('api');
    expect(vergelijkMetBk(alle, kader8, bestanden(ONTHAAL), MERKEN)).toEqual([]);
  });

  it('tekstcorrectie (zelfde lijst): tekst-aangepast met het aantal', () => {
    const nieuw = bijgewerkt(ONTHAAL, (cs) => cs.map((c, i) => (i === 2 || i === 7 ? { ...c, tekst: `${c.tekst} (verbeterd)` } : c)));
    expect(vergelijkMetBk(alle, kader8, bestanden(nieuw), metNieuw(nieuw))).toEqual([{ soort: 'tekst-aangepast', bk: 'BK-0390-2', aantal: 2 }]);
    // Een deel ziet alleen zijn eigen competenties: competentie 8 hoort er niet bij.
    expect(vergelijkMetBk(deel, kader8, bestanden(nieuw), metNieuw(nieuw))).toEqual([{ soort: 'tekst-aangepast', bk: 'BK-0390-2', aantal: 1 }]);
  });

  it('alleen HTML of witruimte anders (zelfde tekst na omzetting): niets', () => {
    const nieuw = bijgewerkt(ONTHAAL, (cs) => cs.map((c, i) => (i === 0 ? { ...c, tekst: 'Werkt <b>in</b> teamverband' } : c)));
    expect(vergelijkMetBk(alle, kader8, bestanden(nieuw), metNieuw(nieuw))).toEqual([]);
  });

  it('een competentie weg: lijst-aangepast (ook bij een deel dat ze bevatte)', () => {
    const nieuw = bijgewerkt(ONTHAAL, (cs) => cs.filter((_, i) => i !== 1));
    expect(vergelijkMetBk(alle, kader8, bestanden(nieuw), metNieuw(nieuw))).toEqual([{ soort: 'lijst-aangepast', bk: 'BK-0390-2' }]);
    expect(vergelijkMetBk(deel, kader8, bestanden(nieuw), metNieuw(nieuw))).toEqual([{ soort: 'lijst-aangepast', bk: 'BK-0390-2' }]);
  });

  it('een competentie erbij: lijst-aangepast bij "alle", niets bij een deel (nooit stil de hele BK)', () => {
    const nieuw = bijgewerkt(ONTHAAL, (cs) => [...cs, { ...cs[0], id: 'bkc9039013', nr: 13, tekst: 'Een nieuwe competentie' }]);
    expect(vergelijkMetBk(alle, kader8, bestanden(nieuw), metNieuw(nieuw))).toEqual([{ soort: 'lijst-aangepast', bk: 'BK-0390-2' }]);
    expect(vergelijkMetBk(deel, kader8, bestanden(nieuw), metNieuw(nieuw))).toEqual([]);
  });

  it('weg en tegelijk een andere tekst: één melding, de lijst', () => {
    const nieuw = bijgewerkt(ONTHAAL, (cs) => cs.filter((_, i) => i !== 1).map((c, i) => (i === 0 ? { ...c, tekst: 'Anders' } : c)));
    expect(vergelijkMetBk(alle, kader8, bestanden(nieuw), metNieuw(nieuw))).toEqual([{ soort: 'lijst-aangepast', bk: 'BK-0390-2' }]);
  });

  it('ander merk, maar alleen kennis of context veranderde: niets', () => {
    const nieuw = bijgewerkt(ONTHAAL, (cs) => cs.map((c) => ({ ...c, kennis: [{ tekst: 'Nieuwe kennis' }] })));
    expect(vergelijkMetBk(alle, kader8, bestanden(nieuw), metNieuw(nieuw))).toEqual([]);
  });

  it('liever geen melding dan een valse: geen bestand, een bestand van een andere versie, of geen merk in de index', () => {
    const nieuw = bijgewerkt(ONTHAAL, (cs) => cs.filter((_, i) => i !== 1));
    expect(vergelijkMetBk(alle, kader8, new Map(), metNieuw(nieuw))).toEqual([]);
    expect(vergelijkMetBk(alle, kader8, new Map([['BK-0390-2', RECREATIEF]]), metNieuw(nieuw))).toEqual([]);
    expect(vergelijkMetBk(alle, kader8, bestanden(nieuw), new Map())).toEqual([]);
  });

  it('liever geen melding dan een valse: een bestand dat niet bij het merk in de index hoort, of onbruikbaar is', () => {
    const weg = bijgewerkt(ONTHAAL, (cs) => cs.filter((_, i) => i !== 1));
    const anders = bijgewerkt(ONTHAAL, (cs) => cs.map((c, i) => (i === 0 ? { ...c, tekst: 'Anders' } : c)));
    // De index noemt al een nieuwer merk, maar het bestand in het geheugen is nog een ander (oud uit de cache, of van een
    // andere update): niets zeggen, ook niet als dat bestand een competentie mist of een andere tekst heeft.
    expect(vergelijkMetBk(alle, kader8, bestanden(weg), metNieuw(anders))).toEqual([]);
    expect(vergelijkMetBk(alle, kader8, bestanden(anders), metNieuw(weg))).toEqual([]);
    // Een bestand dat niet door de validator komt (hier: een fout aantal), telt als onbruikbaar.
    expect(vergelijkMetBk(alle, kader8, bestanden({ ...weg, aantal: 99 }), metNieuw(weg))).toEqual([]);
    // Met het juiste bestand komt de melding wel.
    expect(vergelijkMetBk(alle, kader8, bestanden(weg), metNieuw(weg))).toEqual([{ soort: 'lijst-aangepast', bk: 'BK-0390-2' }]);
  });

  it('het kader van één variant kan een BK missen die in een andere variant hoort: dan geen versiemelding', () => {
    // De aanloopvariant (565) heeft alleen Recreatief medewerker. Het kader van die variant onthoudt dat het voor één
    // onderdeel gemaakt is, zodat een leerplan voor Onthaalmedewerker niet vals "niet meer bij de richting" meldt.
    const variant = bkKader(KOPPELING, INDEX, INFO_8, { groep: 'G-0008', soort: 'so', onderdeel: 565 }, VANDAAG);
    expect(variant).toMatchObject({ herkomst: 'api', onderdeel: 565 });
    expect(variant.bks.map((b) => b.bk)).toEqual(['BK-0464-1']);
    expect(vergelijkMetBk(alle, variant, bestanden(ONTHAAL), MERKEN)).toEqual([]);
    expect(vergelijkMetBk(alle, kader8, bestanden(ONTHAAL), MERKEN)).toEqual([]);
    // Ook geen "andere versie" op een variantkader; met hetzelfde kader voor de hele richting wel.
    const l = nagekeken([alleVan(NAGEBOOTST_1)]);
    const anders: RichtingBk = {
      herkomst: 'api', bekrachtigingen: [],
      bks: [{ bk: 'BK-9999-2', nummer: 'BK-9999', versie: 2, titel: 'Nagebootste beroepskwalificatie', onderdelen: [10], alleOnderdelen: true }],
    };
    expect(vergelijkMetBk(l, { ...anders, onderdeel: 10 }, bestanden(NAGEBOOTST_1), MERKEN)).toEqual([]);
    expect(vergelijkMetBk(l, anders, bestanden(NAGEBOOTST_1), MERKEN)).toEqual([{ soort: 'andere-versie', bk: 'BK-9999-1', nu: 'BK-9999-2' }]);
    // Wat niet van het kader afhangt (teksten, de lijst), komt wel met een variantkader.
    const nieuw = bijgewerkt(ONTHAAL, (cs) => cs.map((c, i) => (i === 0 ? { ...c, tekst: 'Anders' } : c)));
    expect(vergelijkMetBk(alle, variant, bestanden(nieuw), metNieuw(nieuw))).toEqual([{ soort: 'tekst-aangepast', bk: 'BK-0390-2', aantal: 1 }]);
  });

  it('de richting verwijst nu naar een andere versie: andere-versie (de hoogste), voor elke andere melding', () => {
    const l = nagekeken([alleVan(NAGEBOOTST_1)]);
    const kader: RichtingBk = {
      herkomst: 'api', bekrachtigingen: [],
      bks: [
        { bk: 'BK-9999-2', nummer: 'BK-9999', versie: 2, titel: 'Nagebootste beroepskwalificatie', onderdelen: [10], alleOnderdelen: true },
        { bk: 'BK-9999-3', nummer: 'BK-9999', versie: 3, titel: 'Nagebootste beroepskwalificatie', onderdelen: [12], alleOnderdelen: true },
      ],
    };
    const nieuw = bijgewerkt(NAGEBOOTST_1, (cs) => cs.slice(1));
    expect(vergelijkMetBk(l, kader, bestanden(nieuw), metNieuw(nieuw))).toEqual([{ soort: 'andere-versie', bk: 'BK-9999-1', nu: 'BK-9999-3' }]);
  });

  it('dezelfde versie staat nog in het kader (naast een nieuwere): geen andere-versie', () => {
    const l = nagekeken([alleVan(NAGEBOOTST_1)]);
    const k = bkKader(KOPPELING, INDEX, richting('G-0009'), { groep: 'G-0009', soort: 'so' }, '2027-09-01');
    expect(k.bks.map((b) => b.bk)).toContain('BK-9999-2');
    expect(vergelijkMetBk(l, k, bestanden(NAGEBOOTST_1), MERKEN)).toEqual([]);
  });

  it('geen versie van het nummer meer bij de richting (herkomst api): niet-meer-bij-richting', () => {
    const l = nagekeken([alleVan(ONTHAAL), alleVan(RECREATIEF)]);
    const zonderOnthaal: RichtingBk = { ...kader8, bks: kader8.bks.filter((b) => b.bk !== 'BK-0390-2') };
    expect(vergelijkMetBk(l, zonderOnthaal, bestanden(ONTHAAL, RECREATIEF), MERKEN)).toEqual([{ soort: 'niet-meer-bij-richting', bk: 'BK-0390-2' }]);
  });

  it('zonder officiële lijst (geen of nog niet opgehaald): nooit "niet meer bij de richting"; teksten wel', () => {
    const l = nagekeken([alleVan(ONTHAAL)]);
    expect(vergelijkMetBk(l, geenKader, bestanden(ONTHAAL), MERKEN)).toEqual([]);
    expect(vergelijkMetBk(l, { ...geenKader, herkomst: 'geen' }, bestanden(ONTHAAL), MERKEN)).toEqual([]);
    const nieuw = bijgewerkt(ONTHAAL, (cs) => cs.map((c, i) => (i === 0 ? { ...c, tekst: 'Anders' } : c)));
    expect(vergelijkMetBk(l, geenKader, bestanden(nieuw), metNieuw(nieuw))).toEqual([{ soort: 'tekst-aangepast', bk: 'BK-0390-2', aantal: 1 }]);
  });

  it('meer BK\'s: een melding per versie, in de volgorde van het leerplan', () => {
    const l = nagekeken([alleVan(RECREATIEF), alleVan(ONTHAAL)]);
    const o = bijgewerkt(ONTHAAL, (cs) => cs.map((c, i) => (i === 0 ? { ...c, tekst: 'Anders' } : c)));
    const r = bijgewerkt(RECREATIEF, (cs) => cs.slice(1));
    const meldingen: BkMelding[] = vergelijkMetBk(l, kader8, bestanden(o, r), new Map([...MERKEN, [o.bk, merkVan(o)], [r.bk, merkVan(r)]]));
    expect(meldingen).toEqual([{ soort: 'lijst-aangepast', bk: 'BK-0464-1' }, { soort: 'tekst-aangepast', bk: 'BK-0390-2', aantal: 1 }]);
  });

  it('een eigen kopie of een ander leerplan: niets', () => {
    const nieuw = bijgewerkt(ONTHAAL, (cs) => cs.slice(1));
    expect(vergelijkMetBk(maakEigenKopie(alle), kader8, bestanden(nieuw), metNieuw(nieuw))).toEqual([]);
    expect(vergelijkMetBk({ ...alle, herkomst: { methode: 'samengesteld', ingelezenOp: 1 } }, kader8, bestanden(nieuw), metNieuw(nieuw))).toEqual([]);
    expect(vergelijkMetBk(null as unknown as Curriculum, kader8, bestanden(nieuw), metNieuw(nieuw))).toEqual([]);
  });

  it('verandert nooit iets: niet het leerplan, niet de bestanden (nooit stil een nieuwe versie)', () => {
    const l = diepBevroren(structuredClone(alle));
    const nieuw = diepBevroren(bijgewerkt(ONTHAAL, (cs) => cs.slice(1)));
    expect(() => vergelijkMetBk(l, diepBevroren(structuredClone(kader8)), bestanden(nieuw), metNieuw(nieuw))).not.toThrow();
    expect(l).toEqual(alle);
    expect(effectieveStatus(l)).toBe('gecontroleerd');
  });
});

// ── § 23.6.5: wat de bestaande paden met een BK-leerplan doen ───────────────

describe('§ 23.6.5: de bestaande paden met een BK-leerplan', () => {
  const bk = nagekeken([alleVan(ONTHAAL)]);

  // Een kleine set minimumdoelen en een samengesteld leerplan ernaast, om te tonen dat de getallen niet veranderen.
  const mdSet: MinimumdoelenSetBestand = {
    app: 'boosterz', kind: 'minimumdoelen', v: 1,
    set: {
      id: 'ODS_1', naam: 'Secundair onderwijs 2de graad - Test - Eindtermen', korteNaam: 'Test', sleutelcompetenties: [], bron: 'https://www.onderwijsdoelen.be/',
      api: 'x', naamsvermelding: 'Bron: test', licentie: 'test', opgehaald: '2026-10-05T10:00:00Z', aantal: 2, sha256: 'ab'.repeat(32),
    },
    doelen: [{ id: '1', code: '01.01', tekst: 'Eerste doel.' }, { id: '2', code: '01.02', tekst: 'Tweede doel.' }],
  };
  const md = leerplanUitSelectie([{ bestand: mdSet, doelen: 'alle' }], { titel: 'MD', doelgroep: DG }).leerplan;
  const indexSet: MinimumdoelenIndexSet = { id: 'ODS_1', naam: mdSet.set.naam, aantal: 2, sha256: 'ab'.repeat(32), opgehaald: '2026-10-05T10:00:00Z', bestand: 'ODS_1.json' };
  const mdKader: RichtingKader = {
    keuze: { groep: 'G-0008', soort: 'so' }, herkomst: 'api',
    sets: [{ set: indexSet, ids: ['1', '2'], volledig: true, verplicht: true, versieGelijk: true }],
    aantalDoelen: 2, aantalVerplicht: 2, nietVoorDitJaar: [], verborgenOud: 0, verborgenAndereSoort: 0, onbekend: [], teGroot: false,
  };
  const kaderDoelen: KaderDoel[] = [
    { set: 'ODS_1', setNaam: 'Test', id: '1', code: '01.01', tekst: 'Eerste doel.', optioneel: false, verplichteSet: true },
    { set: 'ODS_1', setNaam: 'Test', id: '2', code: '01.02', tekst: 'Tweede doel.', optioneel: false, verplichteSet: true },
  ];
  const cursus = (leerplan: Curriculum, titel: string): Course => cursusVoorRichting({ titel, auteur: 'Test', doelgroep: DG, leerplan, start: 'geraamte' });
  const bkCursus = cursus(bk, 'Onthaal');
  const mdCursus = cursus(md, 'Minimumdoelen');

  it('het BK-leerplan is een eigen soort uit de officiële bron, geen samengestelde lijst', () => {
    expect(md.herkomst?.methode).toBe('samengesteld');
    expect(isBkLeerplan(bk)).toBe(true);
    expect(isSamengesteld(bk)).toBe(false);
    expect(uitOfficieleBron(bk)).toBe(true);
  });

  it('leerplanUitSelectie met een BK-leerplan als bestaand: gooit', () => {
    expect(() => leerplanUitSelectie([{ bestand: mdSet, doelen: 'alle' }], { titel: 'x', bestaand: bk })).toThrow(/Alleen een lijst die uit de officiële minimumdoelen samengesteld is/);
  });

  it('SamenstellenPage /:id: "niet-samengesteld" (de pagina kijkt met isSamengesteld)', () => {
    expect(isSamengesteld(bk)).toBe(false);
  });

  it('vindLeerplanMetSelectie en useBestaandLeerplan: een BK-leerplan past nooit (selectie leeg, methode niet samengesteld)', () => {
    // useBestaandLeerplan (RichtingDoelen.tsx) slaat elk leerplan over met een andere methode dan 'samengesteld', en
    // vergelijkt daarna de sets minimumdoelen: een BK-leerplan heeft een andere methode en geen sets.
    expect(bk.herkomst?.methode).toBe('beroepskwalificatie');
    expect(bk.minimumdoelenSets).toBeUndefined();
    expect(selectieVanLeerplan(bk).size).toBe(0);
    const alsSets = new Map([['BK-0390-2', ids(ONTHAAL)]]);
    expect(vindLeerplanMetSelectie([bk], alsSets, DG)).toBeUndefined();
    expect(vindLeerplanMetSelectie([bk, md], new Map([['ODS_1', ['1', '2']]]), DG)).toBe(md);
  });

  it('vergelijkMetKader: niets nieuw, niets vervallen; veranderdSindsLeerplan en beginUitBewaarde schuiven niets', () => {
    expect(vergelijkMetKader(bk, mdKader)).toEqual({ nieuw: 0, vervallen: 0, setsNietMeerInKader: [] });
    // Zonder kadervelden valt het BK-leerplan onder de oude regel ('alles'), maar het heeft geen verwijzingen naar minimumdoelen:
    // er vervalt niets en er komt niets bij. RichtingLeerplannen roept vergelijkMetKader bovendien alleen op voor een samengestelde lijst.
    expect(veranderdSindsLeerplan(bk, mdKader)).toBe('alles');
    expect(beginUitBewaarde(selectieVanLeerplan(bk), mdKader, bk).vervallen).toBe(0);
  });

  it('dekkingMinimumdoelen zonder optie: de BK-cursus krijgt "geen-verwijzingen" en de getallen veranderen niet', () => {
    const zonder = dekkingMinimumdoelen(kaderDoelen, [{ course: mdCursus, leerplan: md }], []);
    const met = dekkingMinimumdoelen(kaderDoelen, [{ course: mdCursus, leerplan: md }, { course: bkCursus, leerplan: bk }], []);
    expect(met.cursussen.find((c) => c.courseId === bkCursus.id)).toMatchObject({ telt: false, reden: 'geen-verwijzingen', draagtBij: 0, buitenKader: 0 });
    const { cursussen: _a, samenvatting: _b, ...getallenMet } = met;
    const { cursussen: _c, samenvatting: _d, ...getallenZonder } = zonder;
    void _a; void _b; void _c; void _d;
    expect(getallenMet).toEqual(getallenZonder);
    expect(met.gepland).toBe(2);
  });

  it('gaten dichten: 0 passende doelen, de BK-cursus telt in zonderPassend', () => {
    const doelen = [{ set: 'ODS_1', id: '1' }, { set: 'ODS_1', id: '2' }];
    expect(codesVoorDoelen(bk, doelen)).toEqual({ codes: [], inLeerplan: [], nietInLeerplan: doelen });
    const r = cursussenVoorGaten(doelen, [{ course: bkCursus, leerplan: bk }, { course: mdCursus, leerplan: md }]);
    expect(r.zonderPassend).toBe(1);
    expect(r.kandidaten.map((k) => k.course.id)).toEqual([mdCursus.id]);
  });

  it('leerplannenBijRichting: het BK-leerplan staat erbij via de doelgroep', () => {
    expect(leerplannenBijRichting([bk], new Set(['ODS_1|1']), 'G-0008')).toEqual([{ curriculum: bk, raakt: 0, viaDoelgroep: true }]);
    expect(leerplannenBijRichting([bk], new Set(), 'G-0009')).toEqual([]);
  });

  it('mijn richtingen en een klas met richting: de BK-cursus telt als cursus van de richting', () => {
    const rijen = mijnRichtingen({ courses: [bkCursus], curricula: [bk], klassen: [{ doelgroep: { groep: 'G-0008', titel: 'Assistent dierlijke productie', soort: 'so', graad: 2 } }] });
    expect(rijen).toHaveLength(1);
    expect(rijen[0]).toMatchObject({ groep: 'G-0008', soort: 'so', cursussen: 1, klassen: 1 });
    const bijdragen = bijdragenVoorKader({ courses: [bkCursus, mdCursus], curricula: [bk, md], info: INFO_8, soort: 'so', matrix: MATRIX, vandaag: VANDAAG });
    expect(bijdragen.map((b) => b.course.id)).toEqual([bkCursus.id, mdCursus.id]);
    // ... en telt niet mee in de getallen van de minimumdoelen (zie hierboven).
    expect(dekkingMinimumdoelen(kaderDoelen, bijdragen, []).cursussen.map((c) => c.telt)).toEqual([false, true]);
  });

  it('GoalCoverage in de editor: geen schakelaar "Minimumdoelen" (geen verwijzingen naar minimumdoelen)', () => {
    expect(leerplanHeeftVerwijzingen(bk)).toBe(false);
    expect(leerplanHeeftVerwijzingen(md)).toBe(true);
  });

  it('een eigen kopie houdt zijn verwijzingen naar competenties, maar wordt nooit hergebruikt of vergeleken', () => {
    const kopie = maakEigenKopie(bk);
    expect(kopie.goals[0].bkRefs).toEqual(bk.goals[0].bkRefs);
    expect(kopie.bkVersies).toEqual(bk.bkVersies);
    expect(isBkLeerplan(kopie)).toBe(true);
    expect(sanitizeCurriculum(kopie)?.goals[0].bkRefs).toEqual(bk.goals[0].bkRefs);
  });

  it('createCourse blijft het lege begin (geen geraamte zonder vraag)', () => {
    expect(createCourse('x').chapters).toHaveLength(1);
  });
});
