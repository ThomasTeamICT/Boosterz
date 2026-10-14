import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { BkIndex, KoppelingBestand } from './beroepskwalificaties';
import * as W from './bkWeergave';
import {
  bkAlleCompetenties,
  bkAndereOpenTekst,
  bkAndereVersieTekst,
  bkBehaalbaarSamenvatting,
  bkBekrachtigingTekst,
  bkBronregel,
  bkBuitenKaderTekst,
  bkCompetentieRegel,
  bkCursusSamenvatting,
  bkEditorRegel,
  bkFoutBijBestaandeCursus,
  bkGeplandInCursusToast,
  bkGeplandInDezeCursusToast,
  bkInleesTekst,
  bkIntroAantal,
  bkKaartFout,
  bkKaartLaden,
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
  bkPassendTekst,
  bkPlanKnopTekst,
  bkPlanZonderBestandTekst,
  bkRedenTekst,
  bkSamenvatting,
  bkSetSamenvatting,
  bkSoortVoorvoegsel,
  bkStaartTekst,
  bkStatusTekst,
  bkTeller,
  bkToastCursus,
  bkToekomstTekst,
  bkToonCompetenties,
  bkVoetNodigTekst,
  bkVoorbeeldZin,
  bkZetKnopTekst,
  bkZonderPassendTekst,
  datumTekst,
} from './bkWeergave';
import * as L from './bkLabels';
import type { BkMelding } from './bkLeerplan';
import { dekkingBk } from './dekkingBk';
import { statusTekst } from './dekkingWeergave';
import { FOUT_ANDER_LEERPLAN, FOUT_CURSUS_GEWIJZIGD, FOUT_CURSUS_VERWIJDERD, FOUT_OPSLAG_VOL, foutBijBestaandeCursus, nogNodigTekst } from './gatenWeergave';
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
      'Bron: Vlaamse overheid, Onderwijs en Vorming, Vlaamse kwalificatiestructuur (API Beroepskwalificaties) en API Structuuronderdelen, opgehaald op 3 november 2026. Boosterz toont de competenties letterlijk en verzint geen koppelingen.',
    );
    expect(bkBronregel()).toBe(
      'Bron: Vlaamse overheid, Onderwijs en Vorming, Vlaamse kwalificatiestructuur (API Beroepskwalificaties) en API Structuuronderdelen. Boosterz toont de competenties letterlijk en verzint geen koppelingen.',
    );
  });
});

// ── Meldingen na een update ─────────────────────────────────────────────────

describe('de laad- en foutmelding van één kaart', () => {
  it('bkKaartLaden noemt de beroepskwalificatie bij haar naam, in het enkelvoud van één kaart', () => {
    expect(bkKaartLaden('Onthaalmedewerker')).toBe('De competenties van ‘Onthaalmedewerker’ worden geladen…');
    expect(bkKaartLaden('  Onthaalmedewerker ')).toBe('De competenties van ‘Onthaalmedewerker’ worden geladen…');
    // Niet de algemene zin van de sectie, die over alle beroepskwalificaties gaat.
    expect(bkKaartLaden('Onthaalmedewerker')).not.toBe(W.BK_LADEN);
  });

  it('bkKaartFout: kon de verbinding niet maken, of zijn de gegevens beschadigd', () => {
    expect(bkKaartFout('Onthaalmedewerker')).toBe('De competenties van ‘Onthaalmedewerker’ konden niet geladen worden. Controleer je verbinding en probeer opnieuw.');
    expect(bkKaartFout('Onthaalmedewerker', false)).toBe(bkKaartFout('Onthaalmedewerker'));
    expect(bkKaartFout('Onthaalmedewerker', true)).toBe('De competenties van ‘Onthaalmedewerker’ zijn beschadigd en konden niet gelezen worden. Probeer het later opnieuw.');
  });

  it('twee kaarten krijgen twee verschillende meldingen', () => {
    expect(bkKaartLaden('Onthaalmedewerker')).not.toBe(bkKaartLaden('Recreatief medewerker'));
    expect(bkKaartFout('Onthaalmedewerker')).not.toBe(bkKaartFout('Recreatief medewerker'));
    expect(bkKaartFout('Onthaalmedewerker', true)).not.toBe(bkKaartFout('Recreatief medewerker', true));
  });

  it('een lege titel geeft "deze beroepskwalificatie" in plaats van lege aanhalingstekens', () => {
    for (const leeg of ['', '   ', undefined as unknown as string]) {
      expect(bkKaartLaden(leeg)).toBe('De competenties van deze beroepskwalificatie worden geladen…');
      expect(bkKaartFout(leeg)).toBe('De competenties van deze beroepskwalificatie konden niet geladen worden. Controleer je verbinding en probeer opnieuw.');
      expect(bkKaartFout(leeg, true)).toBe('De competenties van deze beroepskwalificatie zijn beschadigd en konden niet gelezen worden. Probeer het later opnieuw.');
    }
  });
});

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

// ── Plannen (§ 24): elke zin van § 24.6, enkelvoud en meervoud ──────────────

describe('plannen (§ 24.6)', () => {
  /** De regex van invariant I7 (§ 24.5): nooit een competentiecode, ADV-nummer, groepnummer of set-id op het scherm. */
  const I7 = /bkc\d|ADV-|G-\d|ODS_/;
  const stand = (o: Partial<Parameters<typeof bkCursusSamenvatting>[0]> = {}) => ({ totaal: 12, gedekt: 5, gepland: 3, verdieping: 1, open: 4, ...o });

  describe('bkCursusSamenvatting (de editor)', () => {
    it('één beroepskwalificatie: met een percentage en de staart van bkSamenvatting', () => {
      expect(bkCursusSamenvatting(stand(), { aantal: 1, titel: 'Onthaalmedewerker' })).toBe(
        'Deze cursus dekt 5 van de 12 competenties van Onthaalmedewerker (42 %). 3 competenties staan al gepland op een sectie die nog leeg is, 1 komt alleen in verdieping aan bod, 4 nog niet.',
      );
    });

    it('het scenario: 0 van de 12 (0 %)', () => {
      expect(bkCursusSamenvatting(stand({ gedekt: 0, gepland: 0, verdieping: 0, open: 12 }), { aantal: 1, titel: 'Onthaalmedewerker' })).toMatch(
        /^Deze cursus dekt 0 van de 12 competenties van Onthaalmedewerker \(0 %\)\./,
      );
    });

    it('meer beroepskwalificaties: een aantal en geen percentage (F3b-B9)', () => {
      const zin = bkCursusSamenvatting(stand({ totaal: 25, gedekt: 9, gepland: 4, verdieping: 1, open: 11 }), { aantal: 2 });
      expect(zin).toBe(
        'Deze cursus dekt 9 van de 25 competenties van 2 beroepskwalificaties. 4 competenties staan al gepland op een sectie die nog leeg is, 1 komt alleen in verdieping aan bod, 11 nog niet.',
      );
      expect(zin).not.toMatch(/%/);
      expect(bkCursusSamenvatting(stand({ totaal: 25, gedekt: 9 }), { aantal: 3, titel: 'Wordt genegeerd' })).toMatch(/^Deze cursus dekt 9 van de 25 competenties van 3 beroepskwalificaties\. /);
      expect(bkCursusSamenvatting(stand({ totaal: 25, gedekt: 9 }), { aantal: 3, titel: 'Wordt genegeerd' })).not.toMatch(/Wordt genegeerd|%/);
    });

    it('alles gedekt: één zin, zonder staart', () => {
      expect(bkCursusSamenvatting(stand({ gedekt: 12, gepland: 0, verdieping: 0, open: 0 }), { aantal: 1, titel: 'Onthaalmedewerker' })).toBe(
        'Deze cursus dekt 12 van de 12 competenties van Onthaalmedewerker (100 %).',
      );
      expect(bkCursusSamenvatting(stand({ totaal: 25, gedekt: 25, gepland: 0, verdieping: 0, open: 0 }), { aantal: 2 })).toBe(
        'Deze cursus dekt 25 van de 25 competenties van 2 beroepskwalificaties.',
      );
    });

    it('het percentage is 99 en niet 100 zolang er een competentie niet gedekt is', () => {
      expect(bkCursusSamenvatting(stand({ totaal: 200, gedekt: 199, gepland: 0, verdieping: 0, open: 1 }), { aantal: 1, titel: 'Groot' })).toMatch(/\(99 %\)\./);
    });

    it('de staart: enkelvoud en meervoud van gepland en verdieping (0, 1 en 2)', () => {
      const s = (gepland: number, verdieping: number) => bkCursusSamenvatting(stand({ gedekt: 5, gepland, verdieping, open: 0 }), { aantal: 1, titel: 'X' });
      expect(s(1, 2)).toMatch(/ 1 competentie staat al gepland op een sectie die nog leeg is, 2 komen alleen in verdieping aan bod, 0 nog niet\.$/);
      expect(s(2, 1)).toMatch(/ 2 competenties staan al gepland op een sectie die nog leeg is, 1 komt alleen in verdieping aan bod, 0 nog niet\.$/);
      expect(s(0, 0)).toMatch(/ 0 competenties staan al gepland op een sectie die nog leeg is, 0 komen alleen in verdieping aan bod, 0 nog niet\.$/);
    });

    it('de staart is gelijk aan die van bkSamenvatting (één gedeelde hulp)', () => {
      for (const [gepland, verdieping, open] of [[4, 1, 11], [1, 2, 0], [2, 1, 0], [0, 0, 3]] as const) {
        const d = { totaal: 25, gedekt: 22, gepland, verdieping, open, cursussen: [{ telt: true }] };
        const staart = bkStaartTekst(d);
        expect(bkSamenvatting(d).endsWith(` ${staart}`)).toBe(true);
        expect(bkCursusSamenvatting(d, { aantal: 2 }).endsWith(` ${staart}`)).toBe(true);
      }
    });

    it('één competentie in het kader', () => {
      expect(bkCursusSamenvatting(stand({ totaal: 1, gedekt: 1, gepland: 0, verdieping: 0, open: 0 }), { aantal: 1, titel: 'Klein' })).toBe('Deze cursus dekt de enige competentie van Klein (100 %).');
      expect(bkCursusSamenvatting(stand({ totaal: 1, gedekt: 0, gepland: 1, verdieping: 0, open: 0 }), { aantal: 1, titel: 'Klein' })).toBe(
        'Deze cursus dekt de enige competentie van Klein nog niet (0 %). 1 competentie staat al gepland op een sectie die nog leeg is, 0 komen alleen in verdieping aan bod, 0 nog niet.',
      );
    });

    it('zonder competenties, zonder naam en met rare aantallen', () => {
      expect(bkCursusSamenvatting(stand({ totaal: 0, gedekt: 0, gepland: 0, verdieping: 0, open: 0 }), { aantal: 1, titel: 'X' })).toBe('Er zijn geen competenties om te dekken.');
      expect(bkCursusSamenvatting(stand({ totaal: Number.NaN }), { aantal: 1, titel: 'X' })).toBe('Er zijn geen competenties om te dekken.');
      expect(bkCursusSamenvatting(stand(), { aantal: 1 })).toMatch(/^Deze cursus dekt 5 van de 12 competenties van deze beroepskwalificatie \(42 %\)\./);
      expect(bkCursusSamenvatting(stand(), { aantal: 0, titel: '  ' })).toMatch(/van deze beroepskwalificatie \(42 %\)\./);
      expect(bkCursusSamenvatting(stand({ gedekt: 20 }), { aantal: 1, titel: 'X' })).toMatch(/^Deze cursus dekt 12 van de 12 competenties/);
      expect(bkCursusSamenvatting(stand({ gedekt: -3 }), { aantal: 1, titel: 'X' })).toMatch(/^Deze cursus dekt 0 van de 12 competenties/);
    });

    it('bkSamenvatting zelf is niet veranderd (de bestaande tests staan ongewijzigd hierboven)', () => {
      expect(bkSamenvatting({ totaal: 25, gedekt: 9, gepland: 4, verdieping: 1, open: 11, cursussen: [{ telt: true }] })).toBe(
        'Je cursussen dekken 9 van de 25 competenties. 4 competenties staan al gepland op een sectie die nog leeg is, 1 komt alleen in verdieping aan bod, 11 nog niet.',
      );
    });
  });

  describe('de editor: regel, tekst en toast', () => {
    it('bkBuitenKaderTekst: 0, 1 en 2 (haar en hun)', () => {
      expect(bkBuitenKaderTekst(0)).toBe('');
      expect(bkBuitenKaderTekst(-1)).toBe('');
      expect(bkBuitenKaderTekst(Number.NaN)).toBe('');
      expect(bkBuitenKaderTekst(1)).toBe(
        '1 competentie uit het leerplan van deze cursus staat niet meer in de officiële lijst van haar beroepskwalificatie. Bij de studierichting zie je wat er veranderde.',
      );
      expect(bkBuitenKaderTekst(2)).toBe(
        '2 competenties uit het leerplan van deze cursus staan niet meer in de officiële lijst van hun beroepskwalificatie. Bij de studierichting zie je wat er veranderde.',
      );
    });

    it('bkEditorRegel: 0, 1 en 2', () => {
      expect(bkEditorRegel(8)).toBe('8 competenties uit het leerplan van deze cursus staan nog op geen enkele sectie.');
      expect(bkEditorRegel(2)).toBe('2 competenties uit het leerplan van deze cursus staan nog op geen enkele sectie.');
      expect(bkEditorRegel(1)).toBe('1 competentie uit het leerplan van deze cursus staat nog op geen enkele sectie.');
      expect(bkEditorRegel(0)).toBe('0 competenties uit het leerplan van deze cursus staan nog op geen enkele sectie.');
      expect(bkEditorRegel(-4)).toBe('0 competenties uit het leerplan van deze cursus staan nog op geen enkele sectie.');
    });

    it('de knop en het paneel: "ze", ook bij één', () => {
      expect(W.BK_EDITOR_KNOP).toBe('Plan ze in deze cursus');
      expect(W.BK_PANEEL_UITLEG).toBe(
        'Boosterz zet ze als lege secties met de doelcode en de kennis en vaardigheden erop achteraan in je cursus, of achteraan in het hoofdstuk van hun beroepskwalificatie. Wat al in de cursus staat, blijft zoals het is.',
      );
      expect(W.BK_PLAN_LEGEND).toBe('Welke competenties?');
      expect(W.BK_PLAN_HINT).toBe('Vink uit wat in een andere cursus thuishoort.');
      expect(W.BK_PLAN_TOON).toBe('Toon de competenties');
      expect(W.BK_PLAN_NODIG).toBe('minstens één competentie');
      expect(bkZetKnopTekst(1, 1)).toBe('Zet ze in deze cursus');
      expect(bkZetKnopTekst(8, 8)).toBe('Zet ze in deze cursus');
    });

    it('het vakje, de teller en de regel van een competentie komen van de bestaande hulpen', () => {
      expect(bkLegende('Onthaalmedewerker', 8)).toBe('Onthaalmedewerker · 8 competenties');
      expect(bkLegende('Onthaalmedewerker', 1)).toBe('Onthaalmedewerker · 1 competentie');
      expect(bkTeller(4, 1)).toBe('Je koos 4 competenties uit 1 beroepskwalificatie.');
      expect(bkCompetentieRegel('BK-0390-2.03', 'Werkt in teamverband')).toBe('BK-0390-2.03 — Werkt in teamverband');
    });

    it('bkAndereOpenTekst: 0, 1 en 2', () => {
      expect(bkAndereOpenTekst(0)).toBe('');
      expect(bkAndereOpenTekst(Number.NaN)).toBe('');
      expect(bkAndereOpenTekst(1)).toBe('1 andere competentie die deze cursus niet dekt, staat niet in haar leerplan.');
      expect(bkAndereOpenTekst(2)).toBe('2 andere competenties die deze cursus niet dekt, staan niet in haar leerplan.');
      expect(bkAndereOpenTekst(4)).toBe('4 andere competenties die deze cursus niet dekt, staan niet in haar leerplan.');
    });

    it('bkGeplandInDezeCursusToast: 0, 1 en 2', () => {
      expect(bkGeplandInDezeCursusToast(8)).toBe('8 competenties staan nu gepland in deze cursus.');
      expect(bkGeplandInDezeCursusToast(2)).toBe('2 competenties staan nu gepland in deze cursus.');
      expect(bkGeplandInDezeCursusToast(1)).toBe('1 competentie staat nu gepland in deze cursus.');
      expect(bkGeplandInDezeCursusToast(0)).toBe('0 competenties staan nu gepland in deze cursus.');
    });

    it('bkVoetNodigTekst: "Nog nodig: minstens één competentie en een titel." en de rest', () => {
      const basis = { competenties: 0, waar: 'nieuw' as const, titel: '', cursusGekozen: false };
      expect(bkVoetNodigTekst(basis)).toBe('Nog nodig: minstens één competentie en een titel.');
      expect(bkVoetNodigTekst({ ...basis, waar: 'bestaand' })).toBe('Nog nodig: minstens één competentie en een cursus.');
      expect(bkVoetNodigTekst({ ...basis, competenties: 1, titel: '  ' })).toBe('Nog nodig: een titel.');
      expect(bkVoetNodigTekst({ ...basis, waar: 'bestaand', competenties: 3 })).toBe('Nog nodig: een cursus.');
      expect(bkVoetNodigTekst({ ...basis, competenties: 2, titel: 'Mijn cursus' })).toBe('');
      expect(bkVoetNodigTekst({ ...basis, waar: 'bestaand', competenties: 2, cursusGekozen: true })).toBe('');
      expect(bkVoetNodigTekst({ ...basis, waar: 'bestaand', titel: 'telt niet mee', cursusGekozen: true })).toBe('Nog nodig: minstens één competentie.');
    });

    it('bkVoetNodigTekst: de opmaak is die van nogNodigTekst (gatenWeergave), voor elke combinatie van 0, 1 en 2 ontbrekende delen', () => {
      for (const competenties of [0, 1, 5]) {
        for (const waar of ['nieuw', 'bestaand'] as const) {
          for (const titel of ['', '   ', 'Mijn cursus']) {
            for (const cursusGekozen of [false, true]) {
              const delen: string[] = [];
              if (competenties < 1) delen.push('minstens één competentie');
              if (waar === 'nieuw' && titel.trim() === '') delen.push('een titel');
              if (waar === 'bestaand' && !cursusGekozen) delen.push('een cursus');
              expect(bkVoetNodigTekst({ competenties, waar, titel, cursusGekozen }), `${competenties} ${waar} "${titel}" ${cursusGekozen}`).toBe(nogNodigTekst(delen));
            }
          }
        }
      }
    });
  });

  describe('de richtingpagina: de knop', () => {
    it('bkPlanKnopTekst: 0, 1 en 2', () => {
      expect(bkPlanKnopTekst(17)).toBe('Plan de 17 competenties die nog nergens aan bod komen');
      expect(bkPlanKnopTekst(2)).toBe('Plan de 2 competenties die nog nergens aan bod komen');
      expect(bkPlanKnopTekst(1)).toBe('Plan de competentie die nog nergens aan bod komt');
      expect(bkPlanKnopTekst(0)).toBe('Plan de 0 competenties die nog nergens aan bod komen');
      expect(bkPlanKnopTekst(-2)).toBe('Plan de 0 competenties die nog nergens aan bod komen');
    });

    it('als er niets meer te plannen valt', () => {
      expect(W.BK_GEEN_OPEN).toBe('Er zijn geen competenties meer die nergens aan bod komen.');
    });
  });

  describe('het venster', () => {
    it('de vaste zinnen staan letterlijk zoals in het ontwerp', () => {
      expect(W.BK_PLAN_VENSTER_TITEL).toBe('Plan de competenties die nog nergens aan bod komen');
      expect(W.BK_PLAN_VENSTER_INTRO).toBe(
        'Boosterz zet de gekozen competenties als lege secties in een cursus, met de doelcode en de kennis en vaardigheden erop. Zo staan ze gepland; daarna werk je ze zelf uit. Een AI-sleutel heb je niet nodig.',
      );
      expect(W.BK_PLAN_VENSTER_HINT).toBe('Competenties die al gepland staan of alleen in verdieping aan bod komen, blijven waar ze staan.');
      expect(W.BK_GEEN_KANDIDAAT_HINT).toBe('Geen cursus van deze richting heeft een van de gekozen competenties in haar leerplan. Maak er een nieuwe cursus voor.');
      expect(W.BK_PLAN_TITEL_HINT).toBe('Boosterz maakt er een nagekeken leerplan bij met precies deze competenties, of gebruikt het leerplan dat er al is.');
      expect(W.BK_FOUT_NIETS_TE_DOEN).toBe('Deze competenties staan al op een sectie van deze cursus. Er is niets veranderd.');
      expect(W.BK_FOUT_VERANDERD).toBe('De beroepskwalificaties zijn intussen veranderd. Sluit dit venster en probeer opnieuw. Er is niets bewaard.');
    });

    it('bkPlanZonderBestandTekst: 0, 1 en 2', () => {
      expect(bkPlanZonderBestandTekst(0)).toBe('');
      expect(bkPlanZonderBestandTekst(Number.NaN)).toBe('');
      expect(bkPlanZonderBestandTekst(1)).toBe('Van 1 beroepskwalificatie staan de competenties nog niet in Boosterz: die kan je nog niet plannen.');
      expect(bkPlanZonderBestandTekst(2)).toBe('Van 2 beroepskwalificaties staan de competenties nog niet in Boosterz: die kan je nog niet plannen.');
    });

    it('bkPassendTekst: meervoud, enkelvoud, één gekozen en de grenzen', () => {
      expect(bkPassendTekst(3, 4)).toBe('3 van de 4 gekozen competenties staan in haar leerplan');
      expect(bkPassendTekst(2, 4)).toBe('2 van de 4 gekozen competenties staan in haar leerplan');
      expect(bkPassendTekst(4, 4)).toBe('4 van de 4 gekozen competenties staan in haar leerplan');
      expect(bkPassendTekst(1, 4)).toBe('1 van de 4 gekozen competenties staat in haar leerplan');
      expect(bkPassendTekst(1, 2)).toBe('1 van de 2 gekozen competenties staat in haar leerplan');
      expect(bkPassendTekst(1, 1)).toBe('De gekozen competentie staat in haar leerplan');
      expect(bkPassendTekst(0, 1)).toBe('De gekozen competentie staat niet in haar leerplan');
      expect(bkPassendTekst(0, 4)).toBe('0 van de 4 gekozen competenties staan in haar leerplan');
      expect(bkPassendTekst(9, 4)).toBe('4 van de 4 gekozen competenties staan in haar leerplan');
      expect(bkPassendTekst(-1, 4)).toBe('0 van de 4 gekozen competenties staan in haar leerplan');
      expect(bkPassendTekst(0, 0)).toBe('');
      expect(bkPassendTekst(1, Number.NaN)).toBe('');
    });

    it('bkZonderPassendTekst: 0, 1, 2 en 3', () => {
      expect(bkZonderPassendTekst(0)).toBe('');
      expect(bkZonderPassendTekst(-1)).toBe('');
      expect(bkZonderPassendTekst(1)).toBe('1 andere cursus van deze richting volgt geen beroepskwalificatie of heeft geen van deze competenties in haar leerplan.');
      expect(bkZonderPassendTekst(2)).toBe('2 andere cursussen van deze richting volgen geen beroepskwalificatie of hebben geen van deze competenties in hun leerplan.');
      expect(bkZonderPassendTekst(3)).toBe('3 andere cursussen van deze richting volgen geen beroepskwalificatie of hebben geen van deze competenties in hun leerplan.');
    });

    it('bkVoorbeeldZin: alle gekozen competenties staan in het leerplan (k = n)', () => {
      const titel = 'Onthaalmedewerker · 5de jaar';
      expect(bkVoorbeeldZin(titel, 4, 4)).toBe(
        'Alle 4 gekozen competenties staan in het leerplan van ‘Onthaalmedewerker · 5de jaar’. Ze komen er als lege secties bij, met de kennis en vaardigheden; wat al in de cursus staat, blijft zoals het is.',
      );
      expect(bkVoorbeeldZin(titel, 2, 2)).toMatch(/^Alle 2 gekozen competenties staan in het leerplan van ‘/);
      expect(bkVoorbeeldZin(titel, 13, 13)).toMatch(/^Alle 13 gekozen competenties staan/);
      expect(bkVoorbeeldZin(titel, 1, 1)).toBe(
        'De gekozen competentie staat in het leerplan van ‘Onthaalmedewerker · 5de jaar’. Ze komt er als lege sectie bij, met de kennis en vaardigheden; wat al in de cursus staat, blijft zoals het is.',
      );
    });

    it('bkVoorbeeldZin: niet alle (k < n), zonder link, met "Zet ze"', () => {
      const titel = 'Onthaalmedewerker · 5de jaar';
      expect(bkVoorbeeldZin(titel, 1, 4)).toBe(
        '3 gekozen competenties staan niet in het leerplan van ‘Onthaalmedewerker · 5de jaar’ en komen er niet bij: Boosterz past een leerplan nooit zelf aan. Zet ze in een nieuwe cursus.',
      );
      expect(bkVoorbeeldZin(titel, 3, 4)).toBe(
        '1 gekozen competentie staat niet in het leerplan van ‘Onthaalmedewerker · 5de jaar’ en komt er niet bij: Boosterz past een leerplan nooit zelf aan. Zet ze in een nieuwe cursus.',
      );
      expect(bkVoorbeeldZin(titel, 2, 4)).toMatch(/^2 gekozen competenties staan niet in het leerplan van/);
      expect(bkVoorbeeldZin(titel, 0, 2)).toMatch(/^2 gekozen competenties staan niet in het leerplan van/);
      expect(bkVoorbeeldZin(titel, 3, 4)).not.toMatch(/Open het leerplan|Leerplannen/);
    });

    it('bkVoorbeeldZin: de grenzen', () => {
      expect(bkVoorbeeldZin('X', 1, 0)).toBe('');
      expect(bkVoorbeeldZin('X', 1, Number.NaN)).toBe('');
      expect(bkVoorbeeldZin('X', 9, 4)).toMatch(/^Alle 4 gekozen competenties/);
      expect(bkVoorbeeldZin('X', -2, 4)).toMatch(/^4 gekozen competenties staan niet/);
    });

    it('bkZetKnopTekst: "Zet ze" bij alle, anders het aantal (0, 1 en 3)', () => {
      expect(bkZetKnopTekst(4, 4)).toBe('Zet ze in deze cursus');
      expect(bkZetKnopTekst(1, 1)).toBe('Zet ze in deze cursus');
      expect(bkZetKnopTekst(3, 4)).toBe('Zet de 3 competenties in deze cursus');
      expect(bkZetKnopTekst(2, 4)).toBe('Zet de 2 competenties in deze cursus');
      expect(bkZetKnopTekst(1, 4)).toBe('Zet de competentie in deze cursus');
      expect(bkZetKnopTekst(0, 4)).toBe('Zet ze in deze cursus');
      expect(bkZetKnopTekst(0, 0)).toBe('Zet ze in deze cursus');
    });

    it('bkGeplandInCursusToast: 0, 1 en 2', () => {
      expect(bkGeplandInCursusToast(4, 'Onthaalmedewerker · 5de jaar')).toBe('4 competenties staan nu gepland in ‘Onthaalmedewerker · 5de jaar’.');
      expect(bkGeplandInCursusToast(2, 'X')).toBe('2 competenties staan nu gepland in ‘X’.');
      expect(bkGeplandInCursusToast(1, 'X')).toBe('1 competentie staat nu gepland in ‘X’.');
      expect(bkGeplandInCursusToast(0, 'X')).toBe('0 competenties staan nu gepland in ‘X’.');
    });

    it('bkFoutBijBestaandeCursus: dezelfde meldingen als bij de minimumdoelen, behalve "niets te doen"', () => {
      for (const reden of ['gewijzigd', 'verwijderd', 'mislukt', 'ander-leerplan'] as const) expect(bkFoutBijBestaandeCursus(reden)).toBe(foutBijBestaandeCursus(reden));
      expect(bkFoutBijBestaandeCursus('niets-te-doen')).toBe(W.BK_FOUT_NIETS_TE_DOEN);
      expect(bkFoutBijBestaandeCursus('niets-te-doen')).not.toBe(foutBijBestaandeCursus('niets-te-doen'));
      expect(bkFoutBijBestaandeCursus('mislukt')).toBe('Er is niets bewaard: de opslag van dit toestel is vol of geblokkeerd.');
    });

    it('bkFoutBijBestaandeCursus: elke reden geeft letterlijk de zin van gatenWeergave (de zinnen staan hier los van die module)', () => {
      type Reden = Parameters<typeof foutBijBestaandeCursus>[0];
      // Komt er in `foutBijBestaandeCursus` een reden bij, dan compileert deze lijst niet meer: dan hoort er hier een regel bij.
      const verwacht: Record<Reden, string> = {
        gewijzigd: FOUT_CURSUS_GEWIJZIGD,
        verwijderd: FOUT_CURSUS_VERWIJDERD,
        mislukt: FOUT_OPSLAG_VOL,
        'ander-leerplan': FOUT_ANDER_LEERPLAN,
        'niets-te-doen': W.BK_FOUT_NIETS_TE_DOEN,
      };
      for (const reden of Object.keys(verwacht) as Reden[]) expect(bkFoutBijBestaandeCursus(reden), reden).toBe(verwacht[reden]);
    });
  });

  describe('de taal en de veiligheid', () => {
    const titel = 'Onthaalmedewerker · 5de jaar';

    /** Elke zin van § 24.6 met een getal, bij 0, 1, 2, 3 en grotere aantallen, met namen als invoer. */
    function alleZinnen(): string[] {
      const zinnen: string[] = [];
      for (const n of [0, 1, 2, 3, 12, 25]) {
        zinnen.push(
          bkCursusSamenvatting({ totaal: n, gedekt: Math.floor(n / 2), gepland: n, verdieping: 1, open: n }, { aantal: 1, titel: 'Onthaalmedewerker' }),
          bkCursusSamenvatting({ totaal: n, gedekt: Math.floor(n / 2), gepland: n, verdieping: 1, open: n }, { aantal: 2 }),
          bkBuitenKaderTekst(n), bkEditorRegel(n), bkAndereOpenTekst(n), bkGeplandInDezeCursusToast(n), bkPlanKnopTekst(n),
          bkPlanZonderBestandTekst(n), bkZonderPassendTekst(n), bkGeplandInCursusToast(n, titel), bkStaartTekst({ gepland: n, verdieping: n, open: n }),
        );
        for (const k of [0, 1, 2, n]) zinnen.push(bkPassendTekst(k, n), bkVoorbeeldZin(titel, k, n), bkZetKnopTekst(k, n));
        for (const waar of ['nieuw', 'bestaand'] as const) zinnen.push(bkVoetNodigTekst({ competenties: n, waar, titel: n > 1 ? 'Titel' : '', cursusGekozen: n > 1 }));
      }
      for (const reden of ['gewijzigd', 'verwijderd', 'mislukt', 'ander-leerplan', 'niets-te-doen'] as const) zinnen.push(bkFoutBijBestaandeCursus(reden));
      return zinnen;
    }

    it('geen competentiecode, ADV-nummer, onderdeelnummer, groepnummer of set-id, en geen BK-nummer (I7)', () => {
      const zinnen = alleZinnen();
      expect(zinnen.length).toBeGreaterThan(100);
      for (const z of zinnen) {
        expect(z, z).not.toMatch(I7);
        schermVeilig(z);
      }
    });

    it('een competentie is een de-woord: nooit "Plan het" of "Zet het"', () => {
      for (const z of alleZinnen()) expect(z, z).not.toMatch(/\b[Pp]lan (?:ze )?het\b|\b[Zz]et het\b/);
      for (const n of [0, 1, 2, 3]) for (const k of [0, 1, 2, 3]) expect(bkZetKnopTekst(k, n), `${k} van ${n}`).not.toMatch(/\bhet\b/);
    });

    it('een percentage staat alleen in de samenvatting van één beroepskwalificatie (F3b-B9)', () => {
      const metPercent = alleZinnen().filter((z) => z.includes('%'));
      expect(metPercent.length).toBeGreaterThan(0);
      for (const z of metPercent) {
        expect(z, z).toMatch(/^Deze cursus dekt /);
        expect(z.split('%')[0], z).not.toMatch(/\d+ beroepskwalificaties/);
        expect(z.match(/%/g), z).toHaveLength(1);
      }
      expect(bkCursusSamenvatting({ totaal: 25, gedekt: 9, gepland: 4, verdieping: 1, open: 11 }, { aantal: 2 })).not.toContain('%');
    });

    it('de vaste teksten van dit onderdeel bestaan als tekst, zonder verboden aanduiding of dubbele spaties', () => {
      const namen = [
        'BK_EDITOR_KNOP', 'BK_FOUT_NIETS_TE_DOEN', 'BK_FOUT_VERANDERD', 'BK_GEEN_KANDIDAAT_HINT', 'BK_GEEN_OPEN', 'BK_PANEEL_UITLEG', 'BK_PLAN_HINT',
        'BK_PLAN_LEGEND', 'BK_PLAN_NODIG', 'BK_PLAN_TITEL_HINT', 'BK_PLAN_TOON', 'BK_PLAN_VENSTER_HINT', 'BK_PLAN_VENSTER_INTRO', 'BK_PLAN_VENSTER_TITEL',
      ];
      for (const naam of namen) {
        const tekst = (W as Record<string, unknown>)[naam];
        expect(typeof tekst, naam).toBe('string');
        expect(tekst as string, naam).not.toMatch(I7);
        schermVeilig(tekst as string);
        expect(tekst as string, naam).not.toMatch(/\.\.|\s{2,}|\s$|^\s/);
      }
    });

    it('geen dubbele punten, dubbele spaties of spatie voor een leesteken', () => {
      for (const z of alleZinnen()) {
        if (z === '') continue;
        expect(z, z).not.toMatch(/\.\.|\s{2,}|\s$|^\s|\s[.,;:]/);
      }
    });
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

describe('bkLabels: wat de leerplanpagina en de inleespagina nodig hebben, zonder de rest mee te trekken', () => {
  const HIER = fileURLToPath(new URL('.', import.meta.url));
  const bron = (pad: string): string => readFileSync(join(HIER, pad), 'utf8');
  /** De bronregels zonder commentaar. */
  const code = (tekst: string): string => tekst.split('\n').filter((r) => !/^\s*(\/\/|\*|\/\*)/.test(r)).join('\n');

  it('bkWeergave voert dezelfde namen opnieuw uit, met dezelfde waarden', () => {
    expect(Object.keys(L).sort()).toEqual(['BK_EDITOR_GEWIJZIGD', 'BK_EDITOR_NAAR_RICHTING', 'BK_EDITOR_NIET_NAGEKEKEN', 'BK_LABEL_KOPIE', 'BK_LABEL_OFFICIEEL', 'bkInleesTekst']);
    expect(W.BK_LABEL_OFFICIEEL).toBe(L.BK_LABEL_OFFICIEEL);
    expect(W.BK_LABEL_KOPIE).toBe(L.BK_LABEL_KOPIE);
    expect(W.bkInleesTekst).toBe(L.bkInleesTekst);
    expect(W.BK_EDITOR_NIET_NAGEKEKEN).toBe(L.BK_EDITOR_NIET_NAGEKEKEN);
    expect(W.BK_EDITOR_GEWIJZIGD).toBe(L.BK_EDITOR_GEWIJZIGD);
    expect(W.BK_EDITOR_NAAR_RICHTING).toBe(L.BK_EDITOR_NAAR_RICHTING);
  });

  it('de zinnen in de leerplaneditor bij een BK-leerplan: letterlijk, zonder interne sleutels, en de editor gebruikt ze', () => {
    expect(L.BK_EDITOR_NIET_NAGEKEKEN).toBe(
      'Dit leerplan volgt de competenties van een beroepskwalificatie, maar telt niet als nagekeken. Maak het leerplan opnieuw bij ‘Beroepskwalificaties’ bij de studierichting: het wordt dan meteen nagekeken bewaard.',
    );
    expect(L.BK_EDITOR_GEWIJZIGD).toBe(
      ' Wil je weer de officiële competenties? Maak het leerplan opnieuw bij ‘Beroepskwalificaties’ bij de studierichting, of maak er bewust een eigen leerplan van.',
    );
    expect(L.BK_EDITOR_NAAR_RICHTING).toBe('Studierichting openen');
    for (const t of [L.BK_EDITOR_NIET_NAGEKEKEN, L.BK_EDITOR_GEWIJZIGD, L.BK_EDITOR_NAAR_RICHTING]) {
      expect(t).not.toMatch(/bkc\d|ADV-\d|ODS_|G-\d{3,4}|widget|structuuronderdeel/i);
    }
    // De editor haalt ze uit bkLabels (licht), met de juiste keuzes erbij.
    const editor = bron('../pages/CurriculaPage.tsx');
    expect(editor).toMatch(/from '\.\.\/lib\/bkLabels'/);
    for (const naam of ['BK_EDITOR_NIET_NAGEKEKEN', 'BK_EDITOR_GEWIJZIGD', 'BK_EDITOR_NAAR_RICHTING']) expect(editor).toContain(naam);
    expect(editor).not.toMatch(/from '\.\.\/lib\/bkWeergave'/);
  });

  it('bkLabels.ts heeft geen enkele import (anders komt er weer een heel bestand mee op de leerplanpagina)', () => {
    const tekst = code(bron('bkLabels.ts'));
    expect(tekst).not.toMatch(/^\s*import\s/m);
    expect(tekst).not.toMatch(/\brequire\(|\bimport\(/);
  });

  it('de leerplanpagina en de inleespagina halen de labels uit bkLabels en niet uit bkWeergave', () => {
    for (const pad of ['../components/curriculum/ControleLabel.tsx', '../pages/LeerplanInlezenPage.tsx']) {
      const tekst = bron(pad);
      expect(tekst, pad).toMatch(/from '(\.\.\/)+lib\/bkLabels'/);
      expect(tekst, pad).not.toMatch(/from '(\.\.\/)+lib\/bkWeergave'/);
    }
  });
});

describe('bkWeergave blijft los van gatenWeergave (bundel, § 24.8 en F3b-B10)', () => {
  const HIER = fileURLToPath(new URL('.', import.meta.url));

  /**
   * De importregels (`import … from '…'`, ook over meer regels, en `export … from '…'`) van een bron die iets als waarde uit
   * `module` halen. Een `import type` telt niet: die verdwijnt bij het bouwen en trekt niets mee.
   */
  function waardeImportsUit(tekst: string, module: string): string[] {
    const regels = tekst.match(/^(?:import|export)\s[^;]*?\sfrom\s+'[^']+';/gm) ?? [];
    return regels.filter((r) => r.includes(`'${module}'`) && !/^(?:import|export)\s+type\b/.test(r));
  }

  it('de hulp om te controleren werkt: een waarde-import wordt gevonden, een type-import niet', () => {
    const m = './gatenWeergave';
    expect(waardeImportsUit(`import { a } from '${m}';`, m)).toHaveLength(1);
    expect(waardeImportsUit(`import {\n  a,\n  b,\n} from '${m}';`, m)).toHaveLength(1);
    expect(waardeImportsUit(`import { type A, b } from '${m}';`, m)).toHaveLength(1);
    expect(waardeImportsUit(`export { a } from '${m}';`, m)).toHaveLength(1);
    expect(waardeImportsUit(`import type { a } from '${m}';`, m)).toHaveLength(0);
    expect(waardeImportsUit(`import { a } from './andere';`, m)).toHaveLength(0);
    expect(waardeImportsUit(`// import { a } from '${m}';`, m)).toHaveLength(0);
  });

  it('bkWeergave.ts haalt niets als waarde uit gatenWeergave.ts: anders krijgt richtingVenster een extra chunk van 5,7 kB', () => {
    // De klas en de cursuseditor laden `richtingVenster` zonder `MinimumdoelenDekking`, het chunk waar `gatenWeergave.ts` nu in zit.
    // Een waarde-import splitst het eruit: één aanvraag extra, en de preloadlijst in de hoofdbundel groeit.
    const bron = readFileSync(join(HIER, 'bkWeergave.ts'), 'utf8');
    expect(waardeImportsUit(bron, './gatenWeergave')).toEqual([]);
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
      bkKaartLaden('Onthaalmedewerker'), bkKaartFout('Onthaalmedewerker'), bkKaartFout('Onthaalmedewerker', true),
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

describe('BK_PLAN_TEKSTEN: de teksten van de gedeelde schermdelen voor competenties (3b-I1)', () => {
  it('vult elk veld van PlanTeksten met de zinnen van § 24.6, in het enkelvoud en het meervoud', () => {
    const t = W.BK_PLAN_TEKSTEN;
    expect(t.legend).toBe('Welke competenties?');
    expect(t.hint).toBe('Vink uit wat in een andere cursus thuishoort.');
    expect(t.toon).toBe('Toon de competenties');
    expect(t.vakje('Onthaalmedewerker', 12)).toBe('Onthaalmedewerker · 12 competenties');
    expect(t.vakje('Onthaalmedewerker', 1)).toBe('Onthaalmedewerker · 1 competentie');
    expect(t.teller(12, 1)).toBe('Je koos 12 competenties uit 1 beroepskwalificatie.');
    expect(t.teller(0, 0)).toBe('Je koos nog geen competenties.');
    expect(t.regel(1)).toBe(W.bkEditorRegel(1));
    expect(t.regel(8)).toBe(W.bkEditorRegel(8));
    // Een de-woord: ook bij één competentie "Plan ze" en "Zet ze".
    expect(t.knop(1)).toBe('Plan ze in deze cursus');
    expect(t.knop(8)).toBe('Plan ze in deze cursus');
    expect(t.zet(1)).toBe('Zet ze in deze cursus');
    expect(t.zet(8)).toBe('Zet ze in deze cursus');
    expect(t.toast(1)).toBe(W.bkGeplandInDezeCursusToast(1));
    expect(t.toast(3)).toBe(W.bkGeplandInDezeCursusToast(3));
    expect(t.uitleg).toBe(W.BK_PANEEL_UITLEG);
    expect(t.nodig).toBe('minstens één competentie');
    expect(t.nietsTeDoen).toBe('Deze competenties staan al op een sectie van deze cursus. Er is niets veranderd.');
  });

  it('heeft dezelfde velden als MD_PLAN_TEKSTEN, en geen interne sleutels in de teksten', async () => {
    const { MD_PLAN_TEKSTEN } = await import('./gatenWeergave');
    expect(Object.keys(W.BK_PLAN_TEKSTEN).sort()).toEqual(Object.keys(MD_PLAN_TEKSTEN).sort());
    const t = W.BK_PLAN_TEKSTEN;
    const zinnen = [t.legend, t.hint, t.toon, t.uitleg, t.nodig, t.nietsTeDoen, t.vakje('X', 2), t.teller(2, 1), t.regel(2), t.knop(2), t.zet(2), t.toast(2)];
    for (const z of zinnen) expect(z).not.toMatch(/bkc\d|ADV-\d|ODS_|G-\d{3,4}|widget|structuuronderdeel|\bdoel(en)?\b/i);
  });
});
