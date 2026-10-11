import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  valideerBkBestand,
  type BkBestand,
  type BkIndex,
  type Competentie,
  type KoppelingBestand,
} from '../../../lib/beroepskwalificaties';
import { leerplanUitBk, selectieVanBkLeerplan, titelVoorBkLeerplan, vergelijkMetBk, type BkKeuze } from '../../../lib/bkLeerplan';
import { BK_NOG_NODIG_BESTAND, BK_ZONDER_BESTAND, bkNietNagekeken } from '../../../lib/bkWeergave';
import type { Curriculum } from '../../../lib/curriculumTypes';
import type { Doelgroep } from '../../../lib/doelgroep';
import { effectieveStatus } from '../../../lib/leerplanStatus';
import { bkKader } from '../../../lib/richtingBk';
import { doelgroepVan, richtingInfo, type RichtingInfo } from '../../../lib/richtingKader';
import { sha256Hex } from '../../../lib/sha256';
import type { MatrixBestand } from '../../../lib/studierichtingen';
import {
  BK_ALGEMENE_FOUT,
  BK_ANDERE_COMPETENTIES,
  BK_GEEN_KEUZE_MEER,
  BK_KOP_MIST,
  BK_NOG_NODIG_BEZIG,
  BK_NOG_NODIG_GEGEVENS,
  BK_NOG_NODIG_KEUZE,
  BK_NOG_NODIG_LADEN,
  BK_OPSLAG_MISLUKT,
  BK_TOAST_BESTAAT_AL,
  beschrijfMelding,
  bkHintKeuzeNieuweLijst,
  bkHintKeuzeNieuweVersie,
  bouwNieuwLeerplan,
  competentieIds,
  redenBewaar,
  redenCursus,
  redenMelding,
  selectieVan,
  stelSamen,
  titelToevoeging,
  uniekeTitel,
  versiesVoorDoel,
  type BewaarDoel,
  type BouwIn,
} from './bkSectieHulp';

// ── Fixtures ────────────────────────────────────────────────────────────────

const HIER = fileURLToPath(new URL('.', import.meta.url));
const lees = (pad: string): unknown => JSON.parse(readFileSync(join(HIER, '../../../../tests/fixtures', pad), 'utf8'));

const VANDAAG = '2026-10-11';
const MATRIX = lees('structuur/uit/studierichtingen.json') as MatrixBestand;
const KOPPELING = lees('kwalificaties/uit/koppeling.json') as KoppelingBestand;
const INDEX = lees('kwalificaties/uit/index.json') as BkIndex;
const ONTHAAL = lees('kwalificaties/uit/bk/BK-0390-2.json') as BkBestand;
const RECREATIEF = lees('kwalificaties/uit/bk/BK-0464-1.json') as BkBestand;
const NAGEBOOTST_1 = lees('kwalificaties/uit/bk/BK-9999-1.json') as BkBestand;
const NAGEBOOTST_2 = lees('kwalificaties/uit/bk/BK-9999-2.json') as BkBestand;

const MERKEN: ReadonlyMap<string, string> = new Map(INDEX.bks.filter((r) => r.sha256).map((r) => [r.bk, (r.sha256 as string).slice(0, 16)]));
const merkVan = (b: BkBestand) => b.sha256.slice(0, 16);

const INFO_8: RichtingInfo = (() => {
  const i = richtingInfo(MATRIX, 'G-0008', VANDAAG);
  if (!i) throw new Error('G-0008 ontbreekt in de structuurfixtures');
  return i;
})();
const DG: Doelgroep = doelgroepVan(INFO_8, { groep: 'G-0008', soort: 'so', jaar: 3 });
const KADER_8 = bkKader(KOPPELING, INDEX, INFO_8, { groep: 'G-0008', soort: 'so' }, VANDAAG);

const ids = (b: BkBestand) => b.competenties.map((c) => c.id);

/** Dezelfde versie met een andere inhoud (een maandelijkse update): een nieuwe sha256. */
function bijgewerkt(b: BkBestand, wijzig: (c: Competentie[]) => Competentie[]): BkBestand {
  const competenties = wijzig(structuredClone(b.competenties));
  const nieuw: BkBestand = { ...structuredClone(b), competenties, aantal: competenties.length, sha256: sha256Hex(`${b.sha256}|${JSON.stringify(competenties)}`) };
  const fouten = valideerBkBestand(nieuw, b.bk);
  if (fouten.length > 0) throw new Error(`bijgewerkt: ${fouten.join(' ')}`);
  return nieuw;
}

/** Een nagekeken leerplan van de gegeven keuzes (zoals de sectie ze bewaart). */
function nagekeken(keuzes: BkKeuze[], merken: ReadonlyMap<string, string> = MERKEN, titel?: string): Curriculum {
  const u = leerplanUitBk(keuzes, { doelgroep: DG, merken, ...(titel !== undefined ? { titel } : {}) });
  expect(u.bevestigd, u.waarschuwingen.join(' | ')).toBe(true);
  return u.leerplan;
}

const bestanden = (...lijst: BkBestand[]) => new Map(lijst.map((b) => [b.bk, b] as const));
const metNieuw = (...lijst: BkBestand[]) => new Map([...MERKEN, ...lijst.map((b) => [b.bk, merkVan(b)] as const)]);

function bouw(doel: BewaarDoel, files: ReadonlyMap<string, BkBestand>, extra: Partial<BouwIn> = {}) {
  return bouwNieuwLeerplan({ doel, bestanden: files, info: INFO_8, doelgroep: DG, merken: MERKEN, curricula: [], vandaag: VANDAAG, ...extra });
}

/** Het nieuwe leerplan van een bouw, bevestigd. */
function nieuwUit(r: ReturnType<typeof bouw>): Curriculum {
  expect(r.soort).toBe('nieuw');
  if (r.soort !== 'nieuw') throw new Error('geen nieuw leerplan');
  expect(r.uitkomst.bevestigd, r.uitkomst.waarschuwingen.join(' | ')).toBe(true);
  return r.uitkomst.leerplan;
}

/** Geen zin voor het scherm mag een competentiecode, set-id, groepnummer, ADV-nummer of BK-nummer bevatten. */
function schermVeilig(...teksten: (string | undefined)[]) {
  for (const t of teksten) if (t !== undefined) expect(t).not.toMatch(/bkc\d|ODS_|G-\d{4}|ADV-\d|BK-\d/i);
}

// ── Het scenario van de tweede controle: een deel blijft een deel ───────────

describe('"Maak een nieuw leerplan met de lijst van nu" houdt de keuze', () => {
  const acht = ids(ONTHAAL).slice(0, 8);
  const oud = nagekeken([{ bestand: ONTHAAL, competenties: acht }]);
  // Competentie 4 van de 8 verdwijnt uit de officiële lijst: 11 van de 12 blijven.
  const nieuwBestand = bijgewerkt(ONTHAAL, (cs) => cs.filter((_, i) => i !== 3));
  const merken = metNieuw(nieuwBestand);
  const doel: BewaarDoel = { soort: 'lijst-aangepast', leerplan: oud, bk: 'BK-0390-2' };

  it('vertrekpunt: het leerplan heeft 8 van de 12 en de vergelijking meldt "lijst-aangepast"', () => {
    expect(oud.goals).toHaveLength(8);
    expect(oud.bkVersies).toEqual([{ bk: 'BK-0390-2', sha: merkVan(ONTHAAL) }]);
    expect(vergelijkMetBk(oud, KADER_8, bestanden(nieuwBestand), merken)).toEqual([{ soort: 'lijst-aangepast', bk: 'BK-0390-2' }]);
  });

  it('7 van 11: de gekozen competenties die nog bestaan, niet alle 11, en nog steeds geen "alle"', () => {
    const l = nieuwUit(bouw(doel, bestanden(nieuwBestand), { merken, curricula: [oud] }));
    expect(l.goals).toHaveLength(7);
    const verwacht = acht.filter((id) => id !== ONTHAAL.competenties[3].id);
    expect(selectieVanBkLeerplan(l)).toEqual(new Map([['BK-0390-2', verwacht]]));
    expect(l.bkVersies).toEqual([{ bk: 'BK-0390-2', sha: merkVan(nieuwBestand) }]);
    expect(l.bkVersies?.[0].alle).toBeUndefined();
    expect(effectieveStatus(l)).toBe('gecontroleerd');
  });

  it('de titel krijgt het deel: "(7 van 11 competenties)", en verschilt dus van die van het oude leerplan', () => {
    const l = nieuwUit(bouw(doel, bestanden(nieuwBestand), { merken, curricula: [oud] }));
    expect(l.title).toBe('Onthaalmedewerker (7 van 11 competenties) · Assistent dierlijke productie · 2de graad');
    expect(l.title).toBe(titelVoorBkLeerplan(INFO_8, ['Onthaalmedewerker'], { gekozen: 7, totaal: 11 }));
    expect(oud.title).toBe('Onthaalmedewerker (8 van 12 competenties) · Assistent dierlijke productie · 2de graad');
    expect(l.title).not.toBe(oud.title);
  });

  it('de hint zegt vooraf wat er gebeurt, met enkelvoud en meervoud', () => {
    const uitleg = beschrijfMelding(doel, bestanden(nieuwBestand), 'Onthaalmedewerker');
    expect(uitleg.zonderKeuze).toBe(false);
    expect(uitleg.hint).toBe('Van ‘Onthaalmedewerker’ houdt het nieuwe leerplan de 7 competenties die je koos en die nog in de officiële lijst staan. 1 competentie die je koos, staat er niet meer in.');
    expect(bkHintKeuzeNieuweLijst({ bkTitel: 'Onthaalmedewerker', behouden: 1, weg: 2 }))
      .toBe('Van ‘Onthaalmedewerker’ houdt het nieuwe leerplan de ene competentie die je koos en die nog in de officiële lijst staat. 2 competenties die je koos, staan er niet meer in.');
    expect(bkHintKeuzeNieuweLijst({ bkTitel: 'Onthaalmedewerker', behouden: 0, weg: 3 }))
      .toBe('Van ‘Onthaalmedewerker’ blijft er niets over: geen enkele competentie die je koos, staat nog in de officiële lijst.');
    schermVeilig(uitleg.hint);
  });

  it('een tweede klik maakt geen tweede leerplan: het nieuwe staat er al', () => {
    const eerste = nieuwUit(bouw(doel, bestanden(nieuwBestand), { merken, curricula: [oud] }));
    const tweede = bouw(doel, bestanden(nieuwBestand), { merken, curricula: [eerste, oud] });
    expect(tweede.soort).toBe('bestaat');
    if (tweede.soort === 'bestaat') expect(tweede.leerplan.id).toBe(eerste.id);
  });

  it('alle competenties gekozen: wel opnieuw alle (met een competentie erbij), met "alle" en zonder deel', () => {
    const alle = nagekeken([{ bestand: ONTHAAL, competenties: ids(ONTHAAL) }]);
    const groter = bijgewerkt(ONTHAAL, (cs) => [...cs, { ...cs[0], id: 'bkc9039013', nr: 13, tekst: 'Een nieuwe competentie' }]);
    const l = nieuwUit(bouw({ soort: 'lijst-aangepast', leerplan: alle, bk: 'BK-0390-2' }, bestanden(groter), { merken: metNieuw(groter), curricula: [alle] }));
    expect(l.goals).toHaveLength(13);
    expect(l.bkVersies).toEqual([{ bk: 'BK-0390-2', sha: merkVan(groter), alle: true }]);
    expect(beschrijfMelding({ soort: 'lijst-aangepast', leerplan: alle, bk: 'BK-0390-2' }, bestanden(groter), 'Onthaalmedewerker').hint).toBeUndefined();
  });

  it('een leerplan met twee beroepskwalificaties verliest de andere niet', () => {
    const twee = nagekeken([
      { bestand: ONTHAAL, competenties: acht },
      { bestand: RECREATIEF, competenties: ids(RECREATIEF) },
    ]);
    expect(twee.goals).toHaveLength(8 + 13);
    const doelTwee: BewaarDoel = { soort: 'lijst-aangepast', leerplan: twee, bk: 'BK-0390-2' };
    expect(versiesVoorDoel(doelTwee)).toEqual(['BK-0390-2', 'BK-0464-1']);
    const l = nieuwUit(bouw(doelTwee, bestanden(nieuwBestand, RECREATIEF), { merken, curricula: [twee] }));
    expect(l.goals).toHaveLength(7 + 13);
    expect(l.bkVersies).toEqual([
      { bk: 'BK-0390-2', sha: merkVan(nieuwBestand) },
      { bk: 'BK-0464-1', sha: merkVan(RECREATIEF), alle: true },
    ]);
    // Het oude leerplan heet al zo: het nieuwe krijgt er een onderscheidend stuk bij, en blijft binnen 120 tekens.
    expect(twee.title).toBe('Onthaalmedewerker en Recreatief medewerker · Assistent dierlijke productie · 2de graad');
    expect(l.title).not.toBe(twee.title);
    expect(l.title.length).toBeLessThanOrEqual(120);
    expect(l.title.endsWith(' · nieuwe lijst van 11 oktober 2026')).toBe(true);
    expect(l.title).toContain('2de graad');
    // Zonder gelijke titel op het toestel blijft de gewone titel.
    expect(nieuwUit(bouw(doelTwee, bestanden(nieuwBestand, RECREATIEF), { merken })).title).toBe(twee.title);
  });

  it('blijft er niets over van wat je koos, dan komt er geen leerplan en kan de knop niet', () => {
    const twee = nagekeken([{ bestand: ONTHAAL, competenties: ids(ONTHAAL).slice(1, 3) }]);
    const zonder = bijgewerkt(ONTHAAL, (cs) => cs.filter((_, i) => i !== 1 && i !== 2));
    const doelLeeg: BewaarDoel = { soort: 'lijst-aangepast', leerplan: twee, bk: 'BK-0390-2' };
    const r = bouw(doelLeeg, bestanden(zonder), { merken: metNieuw(zonder), curricula: [twee] });
    expect(r).toEqual({ soort: 'fout', tekst: 'Het leerplan kon niet als nagekeken bewaard worden: geen enkele competentie die je koos, staat nog in de officiële lijst. Er is niets bewaard.' });
    const uitleg = beschrijfMelding(doelLeeg, bestanden(zonder), 'Onthaalmedewerker');
    expect(uitleg.zonderKeuze).toBe(true);
    expect(redenMelding({ kanBewaren: true, bezig: false, zonderKeuze: uitleg.zonderKeuze })).toBe(BK_NOG_NODIG_KEUZE);
  });

  it('een bestand dat ontbreekt: de tekst van de sectie, en niets gemaakt', () => {
    expect(bouw(doel, new Map(), { merken, curricula: [oud] })).toEqual({ soort: 'fout', tekst: BK_ZONDER_BESTAND });
    expect(stelSamen(doel, new Map())).toEqual({ ok: false, ontbreekt: 'BK-0390-2' });
  });
});

// ── Een nieuwe versie ───────────────────────────────────────────────────────

describe('"Maak een leerplan met de versie van nu"', () => {
  const alleEen = nagekeken([{ bestand: NAGEBOOTST_1, competenties: ids(NAGEBOOTST_1) }]);
  const deelEen = nagekeken([{ bestand: NAGEBOOTST_1, competenties: ids(NAGEBOOTST_1).slice(0, 2) }]);
  const doelAlle: BewaarDoel = { soort: 'andere-versie', leerplan: alleEen, oud: 'BK-9999-1', nu: 'BK-9999-2' };
  const doelDeel: BewaarDoel = { soort: 'andere-versie', leerplan: deelEen, oud: 'BK-9999-1', nu: 'BK-9999-2' };

  it('een nieuwe versie heeft andere competenties: het nieuwe leerplan krijgt ze allemaal, met "alle"', () => {
    const l = nieuwUit(bouw(doelDeel, bestanden(NAGEBOOTST_2), { curricula: [deelEen] }));
    expect(l.goals).toHaveLength(2);
    expect(l.goals.map((g) => g.bkRefs?.[0].id)).toEqual(ids(NAGEBOOTST_2));
    expect(l.bkVersies).toEqual([{ bk: 'BK-9999-2', sha: merkVan(NAGEBOOTST_2), alle: true }]);
  });

  it('de melding zegt vooraf dat het alle competenties zijn, als het oude leerplan er maar een deel van had', () => {
    expect(beschrijfMelding(doelDeel, bestanden(NAGEBOOTST_2), 'Nagebootste beroepskwalificatie').hint).toBe(bkHintKeuzeNieuweVersie(2));
    expect(bkHintKeuzeNieuweVersie(2)).toBe('Het nieuwe leerplan krijgt alle competenties van de nieuwe versie, niet alleen de 2 competenties die je koos: Boosterz kan je keuze niet overzetten naar een andere versie.');
    expect(bkHintKeuzeNieuweVersie(1)).toContain('niet alleen de competentie die je koos:');
    schermVeilig(bkHintKeuzeNieuweVersie(2), bkHintKeuzeNieuweVersie(1));
  });

  it('had het oude leerplan alle competenties, dan is er niets te melden', () => {
    expect(beschrijfMelding(doelAlle, bestanden(NAGEBOOTST_2), 'Nagebootste beroepskwalificatie')).toEqual({ zonderKeuze: false });
  });

  it('bij twee beroepskwalificaties wordt alleen de oude versie vervangen, op haar plaats', () => {
    const twee = nagekeken([{ bestand: NAGEBOOTST_1, competenties: ids(NAGEBOOTST_1) }, { bestand: ONTHAAL, competenties: ids(ONTHAAL).slice(0, 5) }]);
    const doelTwee: BewaarDoel = { soort: 'andere-versie', leerplan: twee, oud: 'BK-9999-1', nu: 'BK-9999-2' };
    expect(versiesVoorDoel(doelTwee)).toEqual(['BK-9999-2', 'BK-0390-2']);
    const l = nieuwUit(bouw(doelTwee, bestanden(NAGEBOOTST_2, ONTHAAL), { curricula: [twee] }));
    expect(l.goals).toHaveLength(2 + 5);
    expect(l.bkVersies?.map((m) => m.bk)).toEqual(['BK-9999-2', 'BK-0390-2']);
  });

  it('het nieuwe leerplan krijgt een andere titel dan het oude, dat er nog staat', () => {
    const l = nieuwUit(bouw(doelAlle, bestanden(NAGEBOOTST_2), { curricula: [alleEen] }));
    // Het oude leerplan heette "Nagebootste beroepskwalificatie · …": dezelfde naam, dus een onderscheidend stuk erachter.
    expect(alleEen.title).toBe('Nagebootste beroepskwalificatie · Assistent dierlijke productie · 2de graad');
    expect(l.title).toBe('Nagebootste beroepskwalificatie · Assistent dierlijke productie · 2de graad · nieuwe versie van 11 oktober 2026');
    expect(l.title).not.toBe(alleEen.title);
    expect(l.title.length).toBeLessThanOrEqual(120);
  });
});

// ── "Bewaar als leerplan" ───────────────────────────────────────────────────

describe('"Bewaar als leerplan" (de kaart)', () => {
  const doel: BewaarDoel = { soort: 'kaart', versie: 'BK-0390-2' };

  it('alle competenties, met "alle" en de gewone titel (zoals voor deze wijziging)', () => {
    const l = nieuwUit(bouw(doel, bestanden(ONTHAAL)));
    expect(l.goals).toHaveLength(12);
    expect(l.bkVersies).toEqual([{ bk: 'BK-0390-2', sha: merkVan(ONTHAAL), alle: true }]);
    expect(l.title).toBe('Onthaalmedewerker · Assistent dierlijke productie · 2de graad');
    expect(l.title).toBe(titelVoorBkLeerplan(INFO_8, ['Onthaalmedewerker']));
    expect(l.doelgroep).toEqual({ groep: 'G-0008', titel: 'Assistent dierlijke productie', soort: 'so', graad: 2 });
  });

  it('staat het leerplan er al, dan komt er geen tweede', () => {
    const l = nieuwUit(bouw(doel, bestanden(ONTHAAL)));
    const opnieuw = bouw(doel, bestanden(ONTHAAL), { curricula: [l] });
    expect(opnieuw.soort).toBe('bestaat');
  });

  it('een leerplan met dezelfde naam maar van een oudere versie van de gegevens: de titel onderscheidt ze', () => {
    const oudBestand = bijgewerkt(ONTHAAL, (cs) => cs.map((c, i) => (i === 0 ? { ...c, tekst: 'Oude tekst' } : c)));
    const oud = nagekeken([{ bestand: oudBestand, competenties: ids(oudBestand) }], metNieuw(oudBestand));
    const l = nieuwUit(bouw(doel, bestanden(ONTHAAL), { curricula: [oud] }));
    expect(oud.title).toBe('Onthaalmedewerker · Assistent dierlijke productie · 2de graad');
    expect(l.title).toBe('Onthaalmedewerker · Assistent dierlijke productie · 2de graad · van 11 oktober 2026');
  });

  it('een competentie zonder tekst telt niet mee', () => {
    const leeg = bijgewerkt(ONTHAAL, (cs) => cs.map((c, i) => (i === 2 ? { ...c, tekst: '<p>&nbsp;</p>' } : c)));
    expect(competentieIds('BK-0390-2', leeg)).toEqual(ids(leeg).filter((_, i) => i !== 2));
    expect(competentieIds('BK-0390-2', ONTHAAL)).toEqual(ids(ONTHAAL));
  });

  it('de selectie van een samenstelling is die van vindBkLeerplan', () => {
    const s = stelSamen(doel, bestanden(ONTHAAL));
    expect(s.ok).toBe(true);
    if (s.ok) expect(selectieVan(s.keuzes)).toEqual(new Map([['BK-0390-2', ids(ONTHAAL)]]));
  });
});

// ── De titel ────────────────────────────────────────────────────────────────

describe('uniekeTitel en titelToevoeging', () => {
  it('een titel die nog niet bestaat blijft zoals ze is (hoofdletters en witruimte tellen niet)', () => {
    expect(uniekeTitel('Onthaalmedewerker', [], 'nieuw')).toBe('Onthaalmedewerker');
    expect(uniekeTitel('Onthaalmedewerker', ['Andere titel'], 'nieuw')).toBe('Onthaalmedewerker');
    expect(uniekeTitel('Onthaalmedewerker', ['  onthaalmedewerker  '], 'nieuw')).toBe('Onthaalmedewerker · nieuw');
  });

  it('bij nog een gelijke titel komt er een nummer', () => {
    const een = uniekeTitel('Titel', ['Titel'], 'nieuw');
    const twee = uniekeTitel('Titel', ['Titel', een], 'nieuw');
    const drie = uniekeTitel('Titel', ['Titel', een, twee], 'nieuw');
    expect([een, twee, drie]).toEqual(['Titel · nieuw', 'Titel · nieuw (2)', 'Titel · nieuw (3)']);
  });

  it('hoogstens 120 tekens: het langste deel wordt ingekort, het onderscheidende stuk blijft staan', () => {
    const basis = 'Onthaalmedewerker, Recreatief medewerker en Baliemedewerker en Receptionist · Assistent dierlijke productie · 2de graad';
    expect(basis.length).toBeLessThanOrEqual(120);
    const t = uniekeTitel(basis, [basis], 'nieuwe versie van 11 oktober 2026');
    expect(t.length).toBeLessThanOrEqual(120);
    expect(t.endsWith(' · Assistent dierlijke productie · 2de graad · nieuwe versie van 11 oktober 2026')).toBe(true);
    expect(t).toContain('…');
    expect(uniekeTitel(basis, [], 'x', 40).length).toBeLessThanOrEqual(40);
  });

  it('het deel "(7 van 11 competenties)" blijft staan; de naam wordt ingekort', () => {
    const basis = 'Een beroepskwalificatie met een erg lange naam van bijna zestig tekens (7 van 11 competenties) · Assistent dierlijke productie · 2de graad';
    expect(basis.length).toBeGreaterThan(120);
    const kort = 'Een beroepskwalificatie met een erg lange naam (7 van 11 competenties) · Assistent dierlijke productie · 2de graad';
    expect(kort.length).toBeLessThanOrEqual(120);
    const t = uniekeTitel(kort, [kort], 'nieuwe lijst van 11 oktober 2026');
    expect(t.length).toBeLessThanOrEqual(120);
    expect(t).toContain(' (7 van 11 competenties) · ');
    expect(t.endsWith(' · nieuwe lijst van 11 oktober 2026')).toBe(true);
  });

  it('een basis die al te lang is, wordt ingekort tot 120 tekens', () => {
    const lang = 'A'.repeat(150);
    const t = uniekeTitel(lang, [], 'nieuw');
    expect(t.length).toBeLessThanOrEqual(120);
    expect(t.endsWith('…')).toBe(true);
  });

  it('het onderscheidende stuk per soort, met en zonder geldige dag', () => {
    expect(titelToevoeging('andere-versie', '2026-10-11')).toBe('nieuwe versie van 11 oktober 2026');
    expect(titelToevoeging('lijst-aangepast', '2026-10-11')).toBe('nieuwe lijst van 11 oktober 2026');
    expect(titelToevoeging('kaart', '2026-10-11')).toBe('van 11 oktober 2026');
    expect(titelToevoeging('andere-versie', 'morgen')).toBe('nieuwe versie');
    expect(titelToevoeging('lijst-aangepast', '')).toBe('nieuwe lijst');
    expect(titelToevoeging('kaart', '2026-13-40')).toBe('nieuw');
  });
});

// ── Waarom een knop nog niet kan ────────────────────────────────────────────

describe('"Nog nodig: …": elke toestand zijn eigen reden', () => {
  it('"Maak een cursus": pas als het bestand er is', () => {
    expect(redenCursus({ laden: true, heeftBestand: false })).toBe(BK_NOG_NODIG_LADEN);
    expect(redenCursus({ laden: false, heeftBestand: false })).toBe(BK_NOG_NODIG_BESTAND);
    expect(redenCursus({ laden: false, heeftBestand: true })).toBeUndefined();
  });

  it('"Bewaar als leerplan": het bestand, dan de gegevens van de update, dan geen andere bewaaractie', () => {
    const basis = { laden: false, heeftBestand: true, kanBewaren: true, bezig: false };
    expect(redenBewaar({ ...basis, laden: true, heeftBestand: false })).toBe(BK_NOG_NODIG_LADEN);
    expect(redenBewaar({ ...basis, heeftBestand: false })).toBe(BK_NOG_NODIG_BESTAND);
    expect(redenBewaar({ ...basis, kanBewaren: false })).toBe(BK_NOG_NODIG_GEGEVENS);
    expect(redenBewaar({ ...basis, bezig: true })).toBe(BK_NOG_NODIG_BEZIG);
    expect(redenBewaar({ ...basis, kanBewaren: false, bezig: true })).toBe(BK_NOG_NODIG_GEGEVENS);
    expect(redenBewaar(basis)).toBeUndefined();
  });

  it('een knop bij een melding noemt nooit de competenties van de beroepskwalificatie als reden', () => {
    expect(redenMelding({ kanBewaren: false, bezig: false })).toBe(BK_NOG_NODIG_GEGEVENS);
    expect(redenMelding({ kanBewaren: true, bezig: true })).toBe(BK_NOG_NODIG_BEZIG);
    expect(redenMelding({ kanBewaren: true, bezig: false, zonderKeuze: true })).toBe(BK_NOG_NODIG_KEUZE);
    expect(redenMelding({ kanBewaren: true, bezig: false })).toBeUndefined();
    for (const r of [redenMelding({ kanBewaren: false, bezig: false }), redenMelding({ kanBewaren: true, bezig: true }), redenMelding({ kanBewaren: true, bezig: false, zonderKeuze: true })]) {
      expect(r).not.toBe(BK_NOG_NODIG_BESTAND);
    }
  });

  it('elke reden begint met "Nog nodig: " en eindigt op een punt', () => {
    for (const r of [BK_NOG_NODIG_LADEN, BK_NOG_NODIG_GEGEVENS, BK_NOG_NODIG_BEZIG, BK_NOG_NODIG_KEUZE]) {
      expect(r).toMatch(/^Nog nodig: .+\.$/);
    }
  });
});

// ── De zinnen ───────────────────────────────────────────────────────────────

describe('de zinnen van de sectie', () => {
  it('staan vast, in gewone taal', () => {
    expect(BK_KOP_MIST).toBe('De sectie staat er nog niet: de minimumdoelen van deze richting zijn nog niet geladen. Lukt dat niet, kies dan bij de minimumdoelen ‘Opnieuw proberen’.');
    expect(BK_TOAST_BESTAAT_AL).toBe('Dit leerplan staat al op dit toestel.');
    expect(BK_ANDERE_COMPETENTIES).toBe('Andere competenties');
    expect(BK_NOG_NODIG_LADEN).toBe('Nog nodig: even wachten tot de competenties van de beroepskwalificatie geladen zijn.');
    expect(BK_NOG_NODIG_GEGEVENS).toBe('Nog nodig: even wachten tot Boosterz de laatste gegevens geladen heeft.');
    expect(BK_NOG_NODIG_BEZIG).toBe('Nog nodig: even wachten tot het leerplan bewaard is.');
    expect(BK_NOG_NODIG_KEUZE).toBe('Nog nodig: minstens één competentie die je koos en die nog in de officiële lijst staat.');
  });

  it('de kopregel belooft niet dat de sectie vanzelf komt (bij een fout komt ze pas na "Opnieuw proberen")', () => {
    expect(BK_KOP_MIST).not.toMatch(/zodra|verschijnt/i);
    expect(BK_KOP_MIST).toContain('Opnieuw proberen');
  });

  it('de foutzinnen van het bewaren zijn volledige zinnen, met "Er is niets bewaard."', () => {
    expect(bkNietNagekeken(BK_OPSLAG_MISLUKT)).toBe('Het leerplan kon niet als nagekeken bewaard worden: het bewaren op dit toestel is niet gelukt. Er is niets bewaard.');
    expect(bkNietNagekeken(BK_ALGEMENE_FOUT)).toBe('Het leerplan kon niet als nagekeken bewaard worden: er ging iets mis bij het maken ervan. Er is niets bewaard.');
    expect(bkNietNagekeken(BK_GEEN_KEUZE_MEER)).toBe('Het leerplan kon niet als nagekeken bewaard worden: geen enkele competentie die je koos, staat nog in de officiële lijst. Er is niets bewaard.');
  });

  it('geen interne sleutel op het scherm', () => {
    schermVeilig(
      BK_KOP_MIST, BK_TOAST_BESTAAT_AL, BK_ANDERE_COMPETENTIES, BK_NOG_NODIG_LADEN, BK_NOG_NODIG_GEGEVENS, BK_NOG_NODIG_BEZIG, BK_NOG_NODIG_KEUZE,
      bkNietNagekeken(BK_OPSLAG_MISLUKT), bkNietNagekeken(BK_ALGEMENE_FOUT), bkNietNagekeken(BK_GEEN_KEUZE_MEER),
    );
  });
});
