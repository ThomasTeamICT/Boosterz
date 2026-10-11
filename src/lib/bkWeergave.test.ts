import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { BkIndex, KoppelingBestand } from './beroepskwalificaties';
import * as W from './bkWeergave';
import {
  bkAlleCompetenties,
  bkAndereVersieTekst,
  bkBehaalbaarSamenvatting,
  bkBekrachtigingTekst,
  bkBronregel,
  bkCompetentieRegel,
  bkInleesTekst,
  bkIntroAantal,
  bkKaartMeta,
  bkKennisEnVaardigheden,
  bkKiesZelf,
  bkKnopSrTekst,
  bkKopRegel,
  bkLegende,
  bkMeldingTekst,
  bkNietMeerInBron,
  bkNietMeetellendeTekst,
  bkNietNagekeken,
  bkNogNodig,
  bkRedenTekst,
  bkSamenvatting,
  bkSetSamenvatting,
  bkSoortVoorvoegsel,
  bkStatusTekst,
  bkTeller,
  bkToastCursus,
  bkToekomstTekst,
  bkToonCompetenties,
  datumTekst,
} from './bkWeergave';
import type { BkMelding } from './bkLeerplan';
import { dekkingBk } from './dekkingBk';
import { statusTekst } from './dekkingWeergave';
import { bkKader } from './richtingBk';
import { richtingInfo } from './richtingKader';
import type { MatrixBestand } from './studierichtingen';

/**
 * Wat nooit op het scherm komt (§ 23.7): een competentiecode, een ADV-nummer, een onderdeelnummer, een groepnummer of een
 * set-id. Het woord "widget" hoort in de leerkrachtschil, niet in een tekst over cursussen.
 */
const VERBODEN = /bkc\d|ADV-\d|ODS_\d|\bG-\d{3,4}\b|onderdeel\s*\d|onderdeelnummer|groepnummer|set-id|widget/i;
/** Het BK-nummer (met of zonder versie) en een nummer van een deelkwalificatie. */
const BK_NUMMER = /BK-\d{3,6}(?:-\d{1,4})?(?:-DBK-\d{1,4})?/g;

/**
 * Een tekst voor het scherm: geen verboden aanduiding, en een BK-nummer alleen ná een naam (dus nooit vooraan en nooit als
 * de hele tekst).
 */
function schermVeilig(...teksten: string[]): void {
  for (const t of teksten) {
    expect(t, t).not.toMatch(VERBODEN);
    for (const m of t.matchAll(BK_NUMMER)) {
      expect(m.index, `BK-nummer vooraan in: ${t}`).toBeGreaterThan(0);
      expect(t.slice(0, m.index).replace(/[\s(·:‘’]+$/g, ''), `BK-nummer zonder naam ervoor in: ${t}`).not.toBe('');
    }
  }
}

// ── Datums ──────────────────────────────────────────────────────────────────

describe('datumTekst', () => {
  it('een dag in gewone woorden, zonder voorloopnul; een tijdstip telt als zijn dag', () => {
    expect(datumTekst('2027-08-31')).toBe('31 augustus 2027');
    expect(datumTekst('2026-12-03')).toBe('3 december 2026');
    expect(datumTekst('2027-09-01')).toBe('1 september 2027');
    expect(datumTekst('2026-11-03T10:15:00Z')).toBe('3 november 2026');
  });

  it('iets dat geen dag is geeft niets', () => {
    for (const x of ['', 'morgen', '2026-13-01', '2026-00-10', '2026-10-00', '2026-10-32', '20261010', undefined]) expect(datumTekst(x as string | undefined)).toBe('');
    expect(datumTekst(5 as unknown as string)).toBe('');
  });
});

// ── Kopregel ────────────────────────────────────────────────────────────────

describe('bkKopRegel', () => {
  it('geen titels: geen regel', () => {
    expect(bkKopRegel([])).toBe('');
    expect(bkKopRegel(['', '  '])).toBe('');
  });

  it('een tot drie: met naam', () => {
    expect(bkKopRegel(['Onthaalmedewerker'])).toBe('Beroepskwalificaties: Onthaalmedewerker.');
    expect(bkKopRegel(['Onthaalmedewerker', 'Recreatief medewerker'])).toBe('Beroepskwalificaties: Onthaalmedewerker en Recreatief medewerker.');
    expect(bkKopRegel(['Onthaalmedewerker', 'Recreatief medewerker', 'Baliemedewerker'])).toBe('Beroepskwalificaties: Onthaalmedewerker, Recreatief medewerker en Baliemedewerker.');
  });

  it('meer dan drie: de eerste drie en het aantal andere (1 en 2)', () => {
    expect(bkKopRegel(['A', 'B', 'C', 'D'])).toBe('Beroepskwalificaties: A, B, C en 1 andere.');
    expect(bkKopRegel(['Onthaalmedewerker', 'Recreatief medewerker', 'Baliemedewerker', 'X', 'Y'])).toBe('Beroepskwalificaties: Onthaalmedewerker, Recreatief medewerker, Baliemedewerker en 2 andere.');
  });

  it('dubbele titels staan er één keer', () => {
    expect(bkKopRegel(['Onthaalmedewerker', 'Onthaalmedewerker', ' Onthaalmedewerker '])).toBe('Beroepskwalificaties: Onthaalmedewerker.');
  });
});

// ── Sectie ──────────────────────────────────────────────────────────────────

describe('de sectie bij de richting', () => {
  it('bkIntroAantal: 0, 1 en 2', () => {
    expect(bkIntroAantal(0)).toBe('Bij deze richting hoort geen beroepskwalificatie.');
    expect(bkIntroAantal(1)).toBe('Bij deze richting hoort 1 beroepskwalificatie.');
    expect(bkIntroAantal(2)).toBe('Bij deze richting horen 2 beroepskwalificaties.');
    expect(bkIntroAantal(12)).toBe('Bij deze richting horen 12 beroepskwalificaties.');
  });

  it('bkKaartMeta: niveau, aantal, officieel nummer', () => {
    expect(bkKaartMeta({ bk: 'BK-0390-2', vks: 3, aantal: 12 })).toBe('Niveau 3 · 12 competenties · officieel nummer BK-0390-2');
    expect(bkKaartMeta({ bk: 'BK-0464-1', vks: 4, aantal: 1 })).toBe('Niveau 4 · 1 competentie · officieel nummer BK-0464-1');
    expect(bkKaartMeta({ bk: 'BK-0464-1', vks: 4, aantal: 2 })).toBe('Niveau 4 · 2 competenties · officieel nummer BK-0464-1');
    expect(bkKaartMeta({ bk: 'BK-0464-1', vks: 4, aantal: 0 })).toBe('Niveau 4 · 0 competenties · officieel nummer BK-0464-1');
  });

  it('bkKaartMeta: zonder niveau valt dat deel weg, zonder aantal ook (geen bestand)', () => {
    expect(bkKaartMeta({ bk: 'BK-0390-2', aantal: 12 })).toBe('12 competenties · officieel nummer BK-0390-2');
    expect(bkKaartMeta({ bk: 'BK-0390-2', vks: 3 })).toBe('Niveau 3 · officieel nummer BK-0390-2');
    expect(bkKaartMeta({ bk: 'BK-0390-2' })).toBe('officieel nummer BK-0390-2');
    expect(bkKaartMeta({ bk: 'BK-0390-2', vks: 9, aantal: -1 })).toBe('officieel nummer BK-0390-2');
  });

  it('bkKaartMeta: alleen in een variant, of loopt af', () => {
    expect(bkKaartMeta({ bk: 'BK-0390-2', vks: 3, aantal: 12, alleenIn: ['duaal'] })).toBe('Niveau 3 · 12 competenties · officieel nummer BK-0390-2 · alleen in: duaal');
    expect(bkKaartMeta({ bk: 'BK-0390-2', vks: 3, aantal: 12, alleenIn: ['duaal', 'aanloop'] })).toBe('Niveau 3 · 12 competenties · officieel nummer BK-0390-2 · alleen in: duaal, aanloop');
    expect(bkKaartMeta({ bk: 'BK-0390-2', vks: 3, aantal: 12, totDatum: '2027-08-31' })).toBe('Niveau 3 · 12 competenties · officieel nummer BK-0390-2 · loopt af op 31 augustus 2027');
    expect(bkKaartMeta({ bk: 'BK-0390-2', vks: 3, aantal: 12, alleenIn: [], totDatum: 'morgen' })).toBe('Niveau 3 · 12 competenties · officieel nummer BK-0390-2');
  });

  it('bkKaartMeta: een nummer dat geen BK-versie is komt niet op het scherm', () => {
    expect(bkKaartMeta({ bk: 'ADV-1612', vks: 3, aantal: 12 })).toBe('Niveau 3 · 12 competenties');
    expect(bkKaartMeta({ bk: 'bkc0045062', aantal: 1 })).toBe('1 competentie');
  });

  it('bkToonCompetenties: 0, 1 en 2', () => {
    expect(bkToonCompetenties(0)).toBe('Geen competenties');
    expect(bkToonCompetenties(1)).toBe('Toon de competentie');
    expect(bkToonCompetenties(2)).toBe('Toon de 2 competenties');
    expect(bkToonCompetenties(12)).toBe('Toon de 12 competenties');
  });

  it('bkKennisEnVaardigheden: de aantallen naast elkaar', () => {
    expect(bkKennisEnVaardigheden(8, 5)).toBe('Kennis en vaardigheden (8 + 5)');
    expect(bkKennisEnVaardigheden(0, 1)).toBe('Kennis en vaardigheden (0 + 1)');
    expect(bkKennisEnVaardigheden(1, 0)).toBe('Kennis en vaardigheden (1 + 0)');
    expect(bkKennisEnVaardigheden(-1, 2)).toBe('Kennis en vaardigheden (0 + 2)');
  });

  it('bkSoortVoorvoegsel en bkKnopSrTekst', () => {
    expect(bkSoortVoorvoegsel('Vakspecifieke competentie')).toBe('(Vakspecifieke competentie) ');
    expect(bkSoortVoorvoegsel('')).toBe('');
    expect(bkSoortVoorvoegsel(undefined)).toBe('');
    expect(bkKnopSrTekst('Onthaalmedewerker')).toBe(' (Onthaalmedewerker)');
    expect(bkKnopSrTekst('  ')).toBe('');
  });

  it('bkNietMeerInBron: met en zonder dag', () => {
    expect(bkNietMeerInBron('2026-12-03')).toBe('De Vlaamse overheid geeft deze versie sinds 3 december 2026 niet meer. Je ziet de laatst bekende competenties.');
    expect(bkNietMeerInBron(undefined)).toBe('De Vlaamse overheid geeft deze versie niet meer. Je ziet de laatst bekende competenties.');
  });

  it('bkNietNagekeken: de eerste waarschuwing, zonder dubbele punt aan het eind', () => {
    expect(bkNietNagekeken('Kies minstens één competentie.')).toBe('Het leerplan kon niet als nagekeken bewaard worden: Kies minstens één competentie. Er is niets bewaard.');
    expect(bkNietNagekeken('')).toBe('Het leerplan kon niet als nagekeken bewaard worden. Er is niets bewaard.');
  });

  it('bkToekomstTekst: de dag en de titels (1 en 2)', () => {
    expect(bkToekomstTekst('2027-09-01', ['Onthaalmedewerker', 'Baliemedewerker'])).toBe('Vanaf 1 september 2027 hoort bij deze richting: Onthaalmedewerker en Baliemedewerker.');
    expect(bkToekomstTekst('2027-09-01', ['Onthaalmedewerker'])).toBe('Vanaf 1 september 2027 hoort bij deze richting: Onthaalmedewerker.');
    expect(bkToekomstTekst('2027-09-01', [])).toBe('');
    expect(bkToekomstTekst('ooit', ['A'])).toBe('');
  });

  it('bkBehaalbaarSamenvatting en bkBekrachtigingTekst', () => {
    expect(bkBehaalbaarSamenvatting(5)).toBe('Wat leerlingen in deze richting kunnen behalen (5)');
    expect(bkBehaalbaarSamenvatting(1)).toBe('Wat leerlingen in deze richting kunnen behalen (1)');
    expect(bkBehaalbaarSamenvatting(0)).toBe('Wat leerlingen in deze richting kunnen behalen (0)');
    expect(bkBekrachtigingTekst('Diploma van secundair onderwijs', 'onderwijskwalificatie')).toBe('Diploma van secundair onderwijs (onderwijskwalificatie)');
    expect(bkBekrachtigingTekst('Bewijs Onthaalmedewerker', 'beroepskwalificatie')).toBe('Bewijs Onthaalmedewerker (beroepskwalificatie)');
    expect(bkBekrachtigingTekst('Bewijs Onthaal', 'deelkwalificatie')).toBe('Bewijs Onthaal (deelkwalificatie)');
    expect(bkBekrachtigingTekst('Bewijs van slagen voor de basisvorming', 'ander')).toBe('Bewijs van slagen voor de basisvorming');
  });

  it('bkBekrachtigingTekst: noemt de naam haar soort al, dan staat die er niet nog eens achter', () => {
    expect(bkBekrachtigingTekst('Bewijs van beroepskwalificatie', 'beroepskwalificatie')).toBe('Bewijs van beroepskwalificatie');
    expect(bkBekrachtigingTekst('Bewijs van deelkwalificatie Onthaal (BK-0390-2-DBK-01)', 'deelkwalificatie')).toBe('Bewijs van deelkwalificatie Onthaal (BK-0390-2-DBK-01)');
    expect(bkBekrachtigingTekst('Diploma van secundair onderwijs, onderwijskwalificatie niveau 3', 'onderwijskwalificatie')).toBe('Diploma van secundair onderwijs, onderwijskwalificatie niveau 3');
    // Hoofdletters tellen niet, en de naam wordt getrimd.
    expect(bkBekrachtigingTekst('  Bewijs van Beroepskwalificatie X ', 'beroepskwalificatie')).toBe('Bewijs van Beroepskwalificatie X');
    // Een andere soort in de naam telt niet: een deelkwalificatie die de naam van een beroepskwalificatie draagt, krijgt haar soort wel.
    expect(bkBekrachtigingTekst('Bewijs van deelkwalificatie Onthaal', 'beroepskwalificatie')).toBe('Bewijs van deelkwalificatie Onthaal (beroepskwalificatie)');
    expect(bkBekrachtigingTekst('Diploma van secundair onderwijs', 'deelkwalificatie')).toBe('Diploma van secundair onderwijs (deelkwalificatie)');
    // ‘ander’ en rare invoer: alleen de naam.
    expect(bkBekrachtigingTekst('Bewijs van beroepskwalificatie X', 'ander')).toBe('Bewijs van beroepskwalificatie X');
    expect(bkBekrachtigingTekst('X', 'constructor' as unknown as 'ander')).toBe('X');
    expect(bkBekrachtigingTekst(undefined as unknown as string, 'ander')).toBe('');
  });

  it('bkBronregel: met en zonder dag van ophalen', () => {
    expect(bkBronregel('2026-11-03T10:00:00Z')).toBe(
      'Bron: Vlaamse overheid, Vlaamse kwalificatiestructuur (API Beroepskwalificaties) en API Structuuronderdelen, opgehaald op 3 november 2026. Boosterz toont de competenties letterlijk en verzint geen koppelingen.',
    );
    expect(bkBronregel()).toBe(
      'Bron: Vlaamse overheid, Vlaamse kwalificatiestructuur (API Beroepskwalificaties) en API Structuuronderdelen. Boosterz toont de competenties letterlijk en verzint geen koppelingen.',
    );
  });
});

// ── Meldingen na een update ─────────────────────────────────────────────────

describe('bkMeldingTekst', () => {
  const o = { bkTitel: 'Onthaalmedewerker', leerplanTitel: 'Mijn leerplan' };

  it('andere versie', () => {
    const m: BkMelding = { soort: 'andere-versie', bk: 'BK-0390-2', nu: 'BK-0390-3' };
    expect(bkMeldingTekst(m, o)).toBe('Je leerplan ‘Mijn leerplan’ volgt een vorige versie van ‘Onthaalmedewerker’. De richting verwijst nu naar een nieuwe versie. Boosterz past je leerplan niet zelf aan.');
  });

  it('tekst aangepast: 0, 1 en 2 competenties', () => {
    const m = (aantal: number): BkMelding => ({ soort: 'tekst-aangepast', bk: 'BK-0390-2', aantal });
    expect(bkMeldingTekst(m(1), o)).toBe('De officiële tekst van 1 competentie van ‘Onthaalmedewerker’ werd aangepast sinds je ‘Mijn leerplan’ maakte.');
    expect(bkMeldingTekst(m(2), o)).toBe('De officiële tekst van 2 competenties van ‘Onthaalmedewerker’ werd aangepast sinds je ‘Mijn leerplan’ maakte.');
    expect(bkMeldingTekst(m(0), o)).toBe('De officiële tekst van 0 competenties van ‘Onthaalmedewerker’ werd aangepast sinds je ‘Mijn leerplan’ maakte.');
  });

  it('lijst aangepast en niet meer bij de richting', () => {
    expect(bkMeldingTekst({ soort: 'lijst-aangepast', bk: 'BK-0390-2' }, o)).toBe('De officiële lijst competenties van ‘Onthaalmedewerker’ werd aangepast sinds je ‘Mijn leerplan’ maakte.');
    expect(bkMeldingTekst({ soort: 'niet-meer-bij-richting', bk: 'BK-0390-2' }, o)).toBe(
      'Je leerplan ‘Mijn leerplan’ volgt ‘Onthaalmedewerker’, maar die beroepskwalificatie hoort volgens de officiële bron niet meer bij deze richting. Je leerplan blijft werken.',
    );
  });

  it('het nummer van de versie komt in geen enkele melding', () => {
    const meldingen: BkMelding[] = [
      { soort: 'andere-versie', bk: 'BK-0390-2', nu: 'BK-0390-3' }, { soort: 'tekst-aangepast', bk: 'BK-0390-2', aantal: 2 },
      { soort: 'lijst-aangepast', bk: 'BK-0390-2' }, { soort: 'niet-meer-bij-richting', bk: 'BK-0390-2' },
    ];
    for (const m of meldingen) expect(bkMeldingTekst(m, o)).not.toMatch(/BK-\d/);
  });
});

// ── Het venster ─────────────────────────────────────────────────────────────

describe('het venster "Nieuwe cursus"', () => {
  it('bkLegende en bkAlleCompetenties: 0, 1 en 2', () => {
    expect(bkLegende('Onthaalmedewerker', 12)).toBe('Onthaalmedewerker · 12 competenties');
    expect(bkLegende('Onthaalmedewerker', 1)).toBe('Onthaalmedewerker · 1 competentie');
    expect(bkLegende('Onthaalmedewerker', 2)).toBe('Onthaalmedewerker · 2 competenties');
    expect(bkLegende('Onthaalmedewerker', 0)).toBe('Onthaalmedewerker · 0 competenties');
    expect(bkAlleCompetenties(12)).toBe('Alle 12 competenties');
    expect(bkAlleCompetenties(2)).toBe('Alle 2 competenties');
    expect(bkAlleCompetenties(1)).toBe('De enige competentie');
    expect(bkAlleCompetenties(0)).toBe('Geen competenties');
  });

  it('bkKiesZelf', () => {
    expect(bkKiesZelf(12, 12)).toBe('Kies zelf de competenties (12 van 12)');
    expect(bkKiesZelf(1, 2)).toBe('Kies zelf de competenties (1 van 2)');
    expect(bkKiesZelf(0, 1)).toBe('Kies zelf de competenties (0 van 1)');
  });

  it('bkTeller: de vier zinnen van de spec, en 0, 1 en 2', () => {
    expect(bkTeller(12, 1)).toBe('Je koos 12 competenties uit 1 beroepskwalificatie.');
    expect(bkTeller(25, 2)).toBe('Je koos 25 competenties uit 2 beroepskwalificaties.');
    expect(bkTeller(1, 1)).toBe('Je koos 1 competentie uit 1 beroepskwalificatie.');
    expect(bkTeller(0, 0)).toBe('Je koos nog geen competenties.');
    expect(bkTeller(0, 2)).toBe('Je koos nog geen competenties.');
    expect(bkTeller(2, 1)).toBe('Je koos 2 competenties uit 1 beroepskwalificatie.');
    expect(bkTeller(2, 0)).toBe('Je koos 2 competenties uit 1 beroepskwalificatie.');
  });

  it('bkNogNodig', () => {
    expect(bkNogNodig({ titel: true, competenties: true })).toBe('Nog nodig: een titel, minstens één competentie.');
    expect(bkNogNodig({ titel: true, competenties: false })).toBe('Nog nodig: een titel.');
    expect(bkNogNodig({ titel: false, competenties: true })).toBe('Nog nodig: minstens één competentie.');
    expect(bkNogNodig({ titel: false, competenties: false })).toBe('');
  });

  it('bkToastCursus: met een geraamte (1 en 2 hoofdstukken, 1 en 2 competenties)', () => {
    const basis = { start: 'geraamte' as const, titels: ['Onthaalmedewerker'] };
    expect(bkToastCursus({ ...basis, hoofdstukken: 1, competenties: 12 })).toBe('Cursus gemaakt: 1 hoofdstuk, 12 competenties klaar op de secties.');
    expect(bkToastCursus({ ...basis, hoofdstukken: 2, competenties: 25, titels: ['A', 'B'] })).toBe('Cursus gemaakt: 2 hoofdstukken, 25 competenties klaar op de secties.');
    expect(bkToastCursus({ ...basis, hoofdstukken: 1, competenties: 1 })).toBe('Cursus gemaakt: 1 hoofdstuk, 1 competentie klaar op de secties.');
    expect(bkToastCursus({ ...basis, hoofdstukken: 1, competenties: 2 })).toBe('Cursus gemaakt: 1 hoofdstuk, 2 competenties klaar op de secties.');
  });

  it('bkToastCursus: leeg (één beroepskwalificatie met naam, meer met een aantal) en bij hergebruik', () => {
    expect(bkToastCursus({ start: 'leeg', hoofdstukken: 1, competenties: 12, titels: ['Onthaalmedewerker'] })).toBe('Cursus gemaakt met 12 competenties van Onthaalmedewerker.');
    expect(bkToastCursus({ start: 'leeg', hoofdstukken: 1, competenties: 1, titels: ['Onthaalmedewerker'] })).toBe('Cursus gemaakt met 1 competentie van Onthaalmedewerker.');
    expect(bkToastCursus({ start: 'leeg', hoofdstukken: 1, competenties: 25, titels: ['A', 'B'] })).toBe('Cursus gemaakt met 25 competenties van 2 beroepskwalificaties.');
    expect(bkToastCursus({ start: 'geraamte', hoofdstukken: 1, competenties: 12, titels: ['A'], hergebruikt: true })).toBe(
      'Cursus gemaakt: 1 hoofdstuk, 12 competenties klaar op de secties. Er stond al een leerplan met precies deze competenties: de cursus hangt daaraan.',
    );
    expect(bkToastCursus({ start: 'leeg', hoofdstukken: 1, competenties: 12, titels: ['Onthaalmedewerker'], hergebruikt: true })).toBe(
      'Cursus gemaakt met 12 competenties van Onthaalmedewerker. Er stond al een leerplan met precies deze competenties: de cursus hangt daaraan.',
    );
  });
});

// ── De dekking ──────────────────────────────────────────────────────────────

describe('de dekking', () => {
  const telt = { telt: true };
  const telling = (o: Partial<Parameters<typeof bkSamenvatting>[0]> = {}) => ({ totaal: 25, gedekt: 9, gepland: 4, verdieping: 1, open: 11, cursussen: [telt], ...o });

  it('bkSamenvatting: de zinnen van de spec', () => {
    expect(bkSamenvatting(telling())).toBe(
      'Je cursussen dekken 9 van de 25 competenties. 4 competenties staan al gepland op een sectie die nog leeg is, 1 komt alleen in verdieping aan bod, 11 nog niet.',
    );
  });

  it('bkSamenvatting: enkelvoud en meervoud van gepland en verdieping (0, 1 en 2)', () => {
    expect(bkSamenvatting(telling({ gedekt: 22, gepland: 1, verdieping: 2, open: 0 }))).toBe(
      'Je cursussen dekken 22 van de 25 competenties. 1 competentie staat al gepland op een sectie die nog leeg is, 2 komen alleen in verdieping aan bod, 0 nog niet.',
    );
    expect(bkSamenvatting(telling({ gedekt: 22, gepland: 2, verdieping: 1, open: 0 }))).toBe(
      'Je cursussen dekken 22 van de 25 competenties. 2 competenties staan al gepland op een sectie die nog leeg is, 1 komt alleen in verdieping aan bod, 0 nog niet.',
    );
    expect(bkSamenvatting(telling({ gedekt: 22, gepland: 0, verdieping: 0, open: 3 }))).toBe(
      'Je cursussen dekken 22 van de 25 competenties. 0 competenties staan al gepland op een sectie die nog leeg is, 0 komen alleen in verdieping aan bod, 3 nog niet.',
    );
  });

  it('bkSamenvatting: alles gedekt is één zin; zonder competenties en zonder cursus met competenties', () => {
    expect(bkSamenvatting(telling({ gedekt: 25, gepland: 0, verdieping: 0, open: 0 }))).toBe('Je cursussen dekken 25 van de 25 competenties.');
    expect(bkSamenvatting(telling({ totaal: 0, gedekt: 0, gepland: 0, verdieping: 0, open: 0 }))).toBe('Er zijn geen competenties om te dekken.');
    expect(bkSamenvatting(telling({ gedekt: 0, gepland: 0, verdieping: 0, open: 25, cursussen: [] }))).toBe(
      'Nog geen cursus met competenties van deze beroepskwalificaties: de dekking is 0 van de 25 competenties.',
    );
    // Cursussen die niet meetellen (ze volgen geen beroepskwalificatie) maken van "nog geen cursus" niets anders.
    expect(bkSamenvatting(telling({ gedekt: 0, gepland: 0, verdieping: 0, open: 25, cursussen: [{ telt: false }, { telt: false }] }))).toBe(
      'Nog geen cursus met competenties van deze beroepskwalificaties: de dekking is 0 van de 25 competenties.',
    );
  });

  it('bkSamenvatting: één competentie in het kader', () => {
    expect(bkSamenvatting(telling({ totaal: 1, gedekt: 0, gepland: 1, verdieping: 0, open: 0 }))).toBe(
      'Je cursussen dekken 0 van de enige competentie. 1 competentie staat al gepland op een sectie die nog leeg is, 0 komen alleen in verdieping aan bod, 0 nog niet.',
    );
    expect(bkSamenvatting(telling({ totaal: 1, gedekt: 0, gepland: 0, verdieping: 0, open: 1, cursussen: [] }))).toBe(
      'Nog geen cursus met competenties van deze beroepskwalificaties: de dekking is 0 van de enige competentie.',
    );
  });

  it('bkSamenvatting werkt op een echte dekking', () => {
    expect(bkSamenvatting(dekkingBk([], [], []))).toBe('Er zijn geen competenties om te dekken.');
  });

  it('bkSetSamenvatting: het percentage is 99 en niet 100 zolang er een niet gedekt is', () => {
    expect(bkSetSamenvatting('Onthaalmedewerker', 5, 12)).toBe('Onthaalmedewerker: 5 van 12 gedekt (42 %)');
    expect(bkSetSamenvatting('Onthaalmedewerker', 12, 12)).toBe('Onthaalmedewerker: 12 van 12 gedekt (100 %)');
    expect(bkSetSamenvatting('Groot', 199, 200)).toBe('Groot: 199 van 200 gedekt (99 %)');
    expect(bkSetSamenvatting('Onthaalmedewerker', 0, 12)).toBe('Onthaalmedewerker: 0 van 12 gedekt (0 %)');
    expect(bkSetSamenvatting('Klein', 1, 1)).toBe('Klein: 1 van 1 gedekt (100 %)');
    expect(bkSetSamenvatting('Leeg', 0, 0)).toBe('Leeg: 0 van 0 gedekt (0 %)');
  });

  it('bkCompetentieRegel: "<doelcode> — <tekst>", lange tekst ingekort op een woordgrens', () => {
    expect(bkCompetentieRegel('BK-0390-2.03', 'Werkt in teamverband')).toBe('BK-0390-2.03 — Werkt in teamverband');
    const lang = 'woord '.repeat(60).trim();
    const regel = bkCompetentieRegel('BK-0390-2.03', lang);
    expect(regel.startsWith('BK-0390-2.03 — woord woord')).toBe(true);
    expect(regel.endsWith('woord…')).toBe(true);
    expect(regel.length).toBeLessThanOrEqual('BK-0390-2.03 — '.length + 201);
    expect(bkCompetentieRegel('BK-0390-2.03', 'Een\n  tekst')).toBe('BK-0390-2.03 — Een tekst');
  });

  it('bkStatusTekst: de vier zinnen, zonder de cursus te vergeten', () => {
    expect(bkStatusTekst).toBe(statusTekst);
    expect(bkStatusTekst({ status: 'gedekt', via: [{ courseTitle: 'Onthaal', status: 'gedekt' }] })).toBe('Gedekt in ‘Onthaal’');
    expect(bkStatusTekst({ status: 'gepland', via: [{ courseTitle: 'Onthaal', status: 'gepland' }] })).toBe('Gepland in ‘Onthaal’ (de sectie is nog leeg)');
    expect(bkStatusTekst({ status: 'verdieping', via: [{ courseTitle: 'Onthaal', status: 'verdieping' }] })).toBe('Alleen in verdieping (‘Onthaal’)');
    expect(bkStatusTekst({ status: 'open', via: [] })).toBe('Nog niet gedekt');
  });

  it('bkNietMeetellendeTekst: 0, 1 en 2', () => {
    expect(bkNietMeetellendeTekst(0)).toBe('');
    expect(bkNietMeetellendeTekst(1)).toBe('1 cursus van deze richting volgt geen beroepskwalificatie en telt hier niet mee.');
    expect(bkNietMeetellendeTekst(2)).toBe('2 cursussen van deze richting volgen geen beroepskwalificatie en tellen hier niet mee.');
    expect(bkNietMeetellendeTekst(4)).toBe('4 cursussen van deze richting volgen geen beroepskwalificatie en tellen hier niet mee.');
  });

  it('bkRedenTekst: de redenen waarom een cursus niet meetelt', () => {
    expect(bkRedenTekst('leerplan-ontbreekt')).toBe('Telt niet mee: het leerplan van deze cursus staat niet op dit toestel.');
    expect(bkRedenTekst('geen-leerplan')).toBe('Telt niet mee: deze cursus hangt aan geen leerplan. Kies er een in de instellingen van de cursus.');
    expect(bkRedenTekst('geen-verwijzingen')).toBe('Telt niet mee: het leerplan van deze cursus volgt geen beroepskwalificatie.');
    expect(bkRedenTekst('geen-verwijzingen', 'Biologie')).toBe('Telt niet mee: het leerplan ‘Biologie’ volgt geen beroepskwalificatie.');
  });

  it('bkAndereVersieTekst: 0, 1 en 3', () => {
    expect(bkAndereVersieTekst(0)).toBe('');
    expect(bkAndereVersieTekst(1)).toBe('1 competentie zou meetellen als je cursus de versie van nu volgde. Maak een leerplan met de versie van nu bij ‘Beroepskwalificaties’.');
    expect(bkAndereVersieTekst(2)).toBe('2 competenties zouden meetellen als je cursus de versie van nu volgde. Maak een leerplan met de versie van nu bij ‘Beroepskwalificaties’.');
    expect(bkAndereVersieTekst(3)).toBe('3 competenties zouden meetellen als je cursus de versie van nu volgde. Maak een leerplan met de versie van nu bij ‘Beroepskwalificaties’.');
  });

  it('de vaste zinnen bij een BK-cursus', () => {
    expect(W.BK_MD_REDEN_BK_CURSUS).toBe('Telt hier niet mee: deze cursus volgt een beroepskwalificatie (zie ‘Competenties van de beroepskwalificaties’).');
    expect(W.BK_CURSUS_VOLGT_BK).toBe('Volgt een beroepskwalificatie: zie ‘Competenties van de beroepskwalificaties’ hieronder.');
    expect(W.BK_DEKKING_TITEL).toBe('Competenties van de beroepskwalificaties');
    expect(W.BK_MD_TITEL).toBe('Minimumdoelen');
    expect(W.BK_TOON_ALLE).toBe('Alle competenties');
    expect(W.BK_TOON_OPEN).toBe('Nog niet gedekt');
  });
});

// ── Leerplanpagina en inleespagina ──────────────────────────────────────────

describe('de leerplanpagina', () => {
  it('de labels en de zin op de inleespagina', () => {
    expect(W.BK_LABEL_OFFICIEEL).toBe('Officiële beroepskwalificatie');
    expect(W.BK_LABEL_KOPIE).toBe('Kopie van een officiële beroepskwalificatie');
    expect(bkInleesTekst('Onthaalmedewerker · Onthaal en recreatie · 3de graad')).toBe(
      'Onthaalmedewerker · Onthaal en recreatie · 3de graad komt rechtstreeks uit een officiële beroepskwalificatie. Er valt niets in te lezen: de competenties staan letterlijk zoals in de officiële bron.',
    );
  });
});

// ── De vaste zinnen, letterlijk uit § 23.7 ──────────────────────────────────

describe('de vaste zinnen staan letterlijk zoals in het ontwerp', () => {
  it('sectie', () => {
    expect(W.BK_SECTIE_TITEL).toBe('Beroepskwalificaties');
    expect(W.BK_KOP_KNOP).toBe('Naar de beroepskwalificaties');
    expect(W.BK_LADEN).toBe('De beroepskwalificaties worden geladen…');
    expect(W.BK_NOG_NIET_OPGEHAALD).toBe('De beroepskwalificaties van deze richting zijn nog niet opgehaald. Boosterz haalt ze elke maand op bij de Vlaamse overheid.');
    expect(W.BK_GEEN).toBe('De officiële bron koppelt geen beroepskwalificatie aan deze richting. De beroepsgerichte doelen staan dan in het leerplan van je net.');
    expect(W.BK_NIVEAU_VRAAG).toBe('Wat betekent het niveau?');
    expect(W.BK_NIVEAU_UITLEG).toBe('Het niveau in de Vlaamse kwalificatiestructuur gaat van 1 tot 8. Hoe hoger, hoe zelfstandiger en complexer het werk.');
    expect(W.BK_DEFINITIE_VRAAG).toBe('Wat houdt dit beroep in?');
    expect(W.BK_KENNIS_KOP).toBe('Kennis');
    expect(W.BK_VAARDIGHEDEN_KOP).toBe('Vaardigheden');
    expect(W.BK_GEEN_KENNIS).toBe('De bron geeft bij deze competentie geen kennis of vaardigheden.');
    expect(W.BK_KNOP_CURSUS).toBe('Maak een cursus met deze competenties');
    expect(W.BK_KNOP_BEWAAR).toBe('Bewaar als leerplan');
    expect(W.BK_KNOP_OPEN).toBe('Open het leerplan');
    expect(W.BK_TOAST_BEWAARD).toBe('Leerplan bewaard en nagekeken.');
    expect(W.BK_TOAST_BIJGEWERKT).toBe('Leerplan bijgewerkt. De doelcodes in je cursussen blijven dezelfde.');
    expect(W.BK_NOG_NODIG_BESTAND).toBe('Nog nodig: de competenties van de beroepskwalificatie.');
    expect(W.BK_KNOP_ANDERE_VERSIE).toBe('Maak een leerplan met de versie van nu');
    expect(W.BK_KNOP_BIJWERKEN).toBe('Werk het leerplan bij');
    expect(W.BK_KNOP_NIEUWE_LIJST).toBe('Maak een nieuw leerplan met de lijst van nu');
    expect(W.BK_ZIN_RICHTING).toBe('De beroepsgerichte vorming staat in de beroepskwalificaties van deze richting, verderop op deze pagina.');
    expect(W.BK_ZIN_VENSTER).toBe('De beroepsgerichte vorming staat in de beroepskwalificaties van deze richting: kies daarvoor ‘De competenties van een beroepskwalificatie’.');
  });

  it('venster', () => {
    expect(W.BK_KEUZE_LABEL).toBe('De competenties van een beroepskwalificatie');
    expect(W.BK_KEUZE_TIP).toBe('Geef je een beroepsgericht vak? Kies dan de competenties van een beroepskwalificatie.');
    expect(W.BK_VENSTER_FOUT).toBe('Een beroepskwalificatie kon niet geladen worden. Probeer opnieuw.');
    expect(W.BK_VENSTER_LADEN).toBe('De beroepskwalificaties worden geladen…');
    expect(W.BK_KEUZE_HINT).toContain('Minimumdoelen en competenties komen in aparte leerplannen: een cursus volgt één leerplan.');
    expect(W.BK_GERAAMTE_HINT).toContain('Zolang een sectie leeg is, telt ze als ‘gepland’, nog niet als gedekt.');
  });
});

// ── Studiebekrachtigingen uit de echte fixtures: de soort staat er één keer ─

describe('bkBekrachtigingTekst op de fixtures van G-0008', () => {
  const HIER = fileURLToPath(new URL('.', import.meta.url));
  const lees = (pad: string): unknown => JSON.parse(readFileSync(join(HIER, '../../tests/fixtures', pad), 'utf8'));
  const MATRIX = lees('structuur/uit/studierichtingen.json') as MatrixBestand;
  const KOPPELING = lees('kwalificaties/uit/koppeling.json') as KoppelingBestand;
  const INDEX = lees('kwalificaties/uit/index.json') as BkIndex;
  const VANDAAG = '2026-10-10';
  const info = richtingInfo(MATRIX, 'G-0008', VANDAAG);
  const rijen = (info ? bkKader(KOPPELING, INDEX, info, { groep: 'G-0008', soort: 'so' }, VANDAAG).bekrachtigingen : []).map((b) => ({ ...b, tekst: bkBekrachtigingTekst(b.naam, b.soort) }));

  it('de fixture geeft vijf rijen: vier met een soort en één ander', () => {
    expect(info).toBeDefined();
    expect(rijen.map((r) => r.soort).sort()).toEqual(['ander', 'beroepskwalificatie', 'beroepskwalificatie', 'deelkwalificatie', 'onderwijskwalificatie']);
  });

  it('elke rij noemt haar soort precies één keer en heeft geen dubbele haakjes', () => {
    expect(rijen.map((r) => r.tekst).sort()).toEqual([
      'Bewijs van beroepskwalificatie Onthaalmedewerker (BK-0390-2)',
      'Bewijs van beroepskwalificatie Recreatief medewerker (BK-0464-1)',
      'Bewijs van deelkwalificatie Onthaal (BK-0390-2-DBK-01)',
      'Bewijs van slagen voor de basisvorming Assistent dierlijke productie',
      'Diploma van secundair onderwijs, onderwijskwalificatie niveau 3 Assistent dierlijke productie',
    ]);
    for (const r of rijen) {
      if (r.soort !== 'ander') expect(r.tekst.toLowerCase().split(r.soort).length - 1, r.tekst).toBe(1);
      expect(r.tekst, r.tekst).not.toMatch(/\)\s*\(/);
      schermVeilig(r.tekst);
    }
  });
});

// ── Veiligheid: nooit een interne aanduiding op het scherm ──────────────────

describe('geen competentiecode, ADV-nummer, onderdeelnummer, groepnummer of set-id; het BK-nummer alleen ná een naam', () => {
  it('geen enkele vaste tekst bevat een verboden aanduiding of een BK-nummer', () => {
    const vast = Object.entries(W as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string');
    expect(vast.length).toBeGreaterThan(40);
    for (const [naam, tekst] of vast) {
      expect(tekst, naam).not.toMatch(VERBODEN);
      expect(tekst, naam).not.toMatch(BK_NUMMER);
      expect(tekst, naam).not.toMatch(/structuuronderdeel/i);
    }
  });

  it('de zinnen met een getal, bij 0, 1 en 2, met namen als invoer', () => {
    const teksten: string[] = [];
    for (const n of [0, 1, 2, 3, 12]) {
      teksten.push(
        bkIntroAantal(n), bkToonCompetenties(n), bkKennisEnVaardigheden(n, n), bkBehaalbaarSamenvatting(n), bkLegende('Onthaalmedewerker', n),
        bkAlleCompetenties(n), bkKiesZelf(n, n), bkTeller(n, n), bkNietMeetellendeTekst(n), bkAndereVersieTekst(n),
        bkToastCursus({ start: 'geraamte', hoofdstukken: n, competenties: n, titels: ['Onthaalmedewerker'], hergebruikt: n === 1 }),
        bkToastCursus({ start: 'leeg', hoofdstukken: n, competenties: n, titels: ['Onthaalmedewerker', 'Recreatief medewerker'] }),
        bkSamenvatting({ totaal: n, gedekt: 0, gepland: n, verdieping: 0, open: 0, cursussen: [{ telt: true }] }),
        bkSetSamenvatting('Onthaalmedewerker', 0, n), bkMeldingTekst({ soort: 'tekst-aangepast', bk: 'BK-0390-2', aantal: n }, { bkTitel: 'Onthaalmedewerker', leerplanTitel: 'Mijn leerplan' }),
        bkKaartMeta({ bk: 'BK-0390-2', vks: 3, aantal: n }).replace(/ · officieel nummer BK-\d+-\d+/, ''),
      );
    }
    teksten.push(
      bkKopRegel(['A', 'B', 'C', 'D', 'E']), bkToekomstTekst('2027-09-01', ['Onthaalmedewerker']), bkNietMeerInBron('2026-12-03'), bkBronregel('2026-11-03T10:00:00Z').replace('API Structuuronderdelen', 'API'), bkBronregel(),
      bkNietNagekeken('Kies minstens één competentie.'), bkNogNodig({ titel: true, competenties: true }), bkInleesTekst('Onthaalmedewerker'),
      bkCompetentieRegel('BK-0390-2.03', 'Werkt in teamverband'), bkRedenTekst('geen-verwijzingen', 'Biologie'),
    );
    for (const m of ['andere-versie', 'lijst-aangepast', 'niet-meer-bij-richting'] as const) {
      teksten.push(bkMeldingTekst({ soort: m, bk: 'BK-0390-2', nu: 'BK-0390-3' } as BkMelding, { bkTitel: 'Onthaalmedewerker', leerplanTitel: 'Mijn leerplan' }));
    }
    // De doelcode ("BK-0390-2.03") is een code voor de leerkracht, geen BK-nummer: de regel van een competentie slaan we over.
    const zonderRegel = teksten.filter((t) => !t.startsWith('BK-0390-2.03 — '));
    schermVeilig(...zonderRegel);
  });

  it('alleen de bronregel noemt de API Structuuronderdelen, bij zijn officiële naam (zoals de bestaande bronregel van de richtingen)', () => {
    expect(bkBronregel('2026-11-03')).toMatch(/API Structuuronderdelen/);
    expect(bkBronregel('2026-11-03')).not.toMatch(VERBODEN);
    for (const t of [bkKopRegel(['A']), bkIntroAantal(2), bkToekomstTekst('2027-09-01', ['A']), bkNietMeerInBron('2026-12-03')]) expect(t).not.toMatch(/structuuronderdeel/i);
  });

  it('de meta van een kaart: het BK-nummer staat achteraan, na de rest (de titel staat erboven)', () => {
    const meta = bkKaartMeta({ bk: 'BK-0390-2', vks: 3, aantal: 12, alleenIn: ['duaal'], totDatum: '2027-08-31' });
    expect(meta.indexOf('BK-0390-2')).toBeGreaterThan(meta.indexOf('12 competenties'));
    expect(meta).not.toMatch(VERBODEN);
    expect(meta.startsWith('BK-')).toBe(false);
    expect(meta.match(BK_NUMMER)).toHaveLength(1);
  });

  it('het nummer van een BK-versie of van een deelkwalificatie in de naam van de bron blijft achter die naam staan', () => {
    const naam = 'Bewijs van beroepskwalificatie Onthaalmedewerker (BK-0390-2)';
    const t = bkBekrachtigingTekst(naam, 'beroepskwalificatie');
    schermVeilig(t);
    expect(t.indexOf('BK-0390-2')).toBeGreaterThan(naam.indexOf('Onthaalmedewerker'));
  });

  it('de hulp om te controleren werkt: een nummer vooraan of als enige naam wordt gevonden', () => {
    expect(() => schermVeilig('BK-0390-2 is een nummer')).toThrow();
    expect(() => schermVeilig('(BK-0390-2)')).toThrow();
    expect(() => schermVeilig('Onthaalmedewerker (BK-0390-2)')).not.toThrow();
    expect(() => schermVeilig('Zie bkc0045062')).toThrow();
    expect(() => schermVeilig('ADV-1612')).toThrow();
    expect(() => schermVeilig('Richting G-0393')).toThrow();
    expect(() => schermVeilig('Set ODS_3142')).toThrow();
    expect(() => schermVeilig('onderdeel 565')).toThrow();
  });
});
