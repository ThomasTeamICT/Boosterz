// De teksten van de brug van een doelenlijst naar een cursus (docs/LEERPLANNEN.md § 16.4 en § 16.5). De letterlijke zin staat
// hier naast de functie, in enkelvoud en in meervoud, zodat een wijziging van de tekst ook hier opvalt. Nooit in deze teksten:
// een set-id, een groepnummer of een doelcode.

import { describe, expect, it } from 'vitest';
import * as T from './cursusBrugTeksten';
import { enkelOfMeer } from './dekkingWeergave';
import {
  FOUT_CURSUS_GEWIJZIGD, FOUT_CURSUS_VERWIJDERD, FOUT_LADEN_GATEN, FOUT_OPSLAG_VOL, cursusGemaaktToast, nogNodigTekst,
} from './gatenWeergave';

describe('na het bewaren (§ 16.4)', () => {
  it('de kop', () => {
    expect(T.NA_BEWAREN_KOP).toBe('Je lijst is bewaard');
  });

  it('de zin, meervoud, nagekeken', () => {
    expect(T.naBewarenZin('Basisgeletterdheid · 1ste graad A-stroom', 10, true)).toBe(
      '‘Basisgeletterdheid · 1ste graad A-stroom’ staat bij Leerplannen, met 10 doelen, nagekeken. '
      + 'Hang ze nu aan een cursus: dan zie je in de cursus welke doelen ze dekt.',
    );
  });

  it('de zin, enkelvoud, niet nagekeken: zonder ", nagekeken"', () => {
    const zin = T.naBewarenZin('Mijn lijst', 1, false);
    expect(zin).toBe(
      '‘Mijn lijst’ staat bij Leerplannen, met 1 doel. Hang ze nu aan een cursus: dan zie je in de cursus welke doelen ze dekt.',
    );
    expect(zin).not.toContain('nagekeken');
  });

  it('de knoppen en de links', () => {
    expect(T.KNOP_MAAK_CURSUS).toBe('Maak een cursus met deze doelen');
    expect(T.KNOP_GEBRUIK_IN_CURSUS).toBe('Gebruik ze in een cursus die je al hebt');
    expect(T.LINK_NAAR_LEERPLANNEN).toBe('Naar je leerplannen');
    expect(T.LINK_TERUG_NAAR_RICHTING).toBe('Terug naar de studierichting');
  });

  it('het pad naar het leerplan', () => {
    expect(T.leerplanPad('abc')).toBe('/leerplannen?open=abc');
    expect(T.leerplanPad('a b/c')).toBe('/leerplannen?open=a%20b%2Fc');
  });
});

describe('het blok op de pagina Leerplannen (§ 16.5)', () => {
  it('de kop en de zin', () => {
    expect(T.GEBRUIK_KOP).toBe('Gebruik in een cursus');
    expect(T.GEBRUIK_ZIN).toBe('Hang deze doelen aan een cursus: dan zie je in de cursus welke doelen ze dekt.');
  });

  it('de melding als een venster niet laadt is die van overal waar iets lui laadt', () => {
    expect(T.FOUT_LADEN_VENSTER).toBe('Dit kon niet geladen worden. Controleer je verbinding en probeer opnieuw.');
  });
});

describe('het venster "Nieuwe cursus met deze doelen" (§ 16.5)', () => {
  it('de titel, het veld, de groep en de knoppen', () => {
    expect(T.NIEUW_TITEL).toBe('Nieuwe cursus met deze doelen');
    expect(T.NIEUW_VELD_TITEL).toBe('Titel van de cursus');
    expect(T.NIEUW_HOE).toBe('Hoe begin je?');
    expect(T.KNOP_ANNULEREN).toBe('Annuleren');
    expect(T.KNOP_MAAK_DE_CURSUS).toBe('Maak de cursus');
  });

  it('"Nog nodig" zolang de titel leeg is, in de opmaak van de andere schermen', () => {
    expect(T.NOG_NODIG_TITEL).toBe('Nog nodig: een titel.');
    expect(T.NOG_NODIG_TITEL).toBe(nogNodigTekst(['een titel']));
  });

  it('de drie manieren om te beginnen', () => {
    expect(T.BEGIN_GERAAMTE_TITEL).toBe('Met een geraamte');
    expect(T.BEGIN_GERAAMTE_ZIN).toBe(
      'Een hoofdstuk per set en een sectie per rubriek, met de doelcodes al op de secties. Je vult ze daarna zelf in.',
    );
    expect(T.BEGIN_LEEG_TITEL).toBe('Met een lege cursus');
    expect(T.BEGIN_LEEG_ZIN).toBe('De cursus hangt aan je lijst. Je zet de doelcodes zelf op je secties.');
    expect(T.BEGIN_AI_TITEL).toBe('Laat de AI een eerste versie maken');
    expect(T.BEGIN_AI_ZIN).toBe('Met je eigen AI-sleutel.');
    expect(T.BEGIN_AI_GEEN_SLEUTEL).toBe('Nog geen AI-sleutel ingesteld.');
    expect(T.BEGIN_AI_LINK).toBe('AI-instellingen');
  });

  it('een volle opslag: er is niets bewaard', () => {
    expect(T.FOUT_CURSUS_NIET_BEWAARD).toBe('Er is niets bewaard: de opslag van dit toestel is vol of geblokkeerd.');
  });

  it('de toast bij een geraamte, meervoud en enkelvoud', () => {
    expect(T.toastCursusMetGeraamte(3, 21, 'Lijst')).toBe('Cursus gemaakt: 3 hoofdstukken, 21 doelcodes klaar op de secties.');
    expect(T.toastCursusMetGeraamte(1, 1, 'Lijst')).toBe('Cursus gemaakt: 1 hoofdstuk, 1 doelcode klaar op de secties.');
  });

  it('een geraamte zonder doelcodes geeft de zin van de lege cursus', () => {
    expect(T.toastCursusMetGeraamte(1, 0, 'Mijn lijst')).toBe(T.toastLegeCursus('Mijn lijst'));
  });

  it('de toast bij een lege cursus', () => {
    expect(T.toastLegeCursus('Basisgeletterdheid')).toBe('Cursus gemaakt. Ze hangt aan ‘Basisgeletterdheid’: zet de doelcodes op je secties.');
  });
});

describe('het venster "Gebruik deze doelen in een cursus" (§ 16.5)', () => {
  it('de titel, de groep, de knoppen en de lege toestand', () => {
    expect(T.KOPPEL_TITEL).toBe('Gebruik deze doelen in een cursus');
    expect(T.KOPPEL_WELKE).toBe('Welke cursus?');
    expect(T.KNOP_KOPPEL).toBe('Koppel aan deze cursus');
    expect(T.KNOP_OPEN_CURSUS).toBe('Open de cursus');
    expect(T.KOPPEL_GEEN_CURSUSSEN).toBe('Je hebt nog geen cursussen op dit toestel.');
  });

  it('"Nog nodig" zolang er geen cursus gekozen is', () => {
    expect(T.NOG_NODIG_CURSUS).toBe('Nog nodig: een cursus.');
    expect(T.NOG_NODIG_CURSUS).toBe(nogNodigTekst(['een cursus']));
  });

  it('waar een cursus aan hangt', () => {
    expect(T.hangtRegel({ dezeLijst: false })).toBe('Nog geen leerplan');
    expect(T.hangtRegel({ dezeLijst: false, oud: 'Oud leerplan' })).toBe('Hangt nu aan ‘Oud leerplan’');
    expect(T.hangtRegel({ dezeLijst: true })).toBe('Hangt al aan deze lijst');
    expect(T.hangtRegel({ dezeLijst: true, oud: 'Oud leerplan' })).toBe('Hangt al aan deze lijst');
  });

  it('hoeveel doelcodes in de lijst staan, in meervoud en in enkelvoud', () => {
    expect(T.codesRegel(3, 12)).toBe('3 van de 12 doelcodes in deze cursus staan in je lijst.');
    expect(T.codesRegel(0, 4)).toBe('0 van de 4 doelcodes in deze cursus staan in je lijst.');
    expect(T.codesRegel(12, 12)).toBe('12 van de 12 doelcodes in deze cursus staan in je lijst.');
    // Eén doelcode in de cursus, of één in de lijst: het werkwoord volgt het getal vooraan.
    expect(T.codesRegel(1, 1)).toBe('1 van de 1 doelcode in deze cursus staat in je lijst.');
    expect(T.codesRegel(0, 1)).toBe('0 van de 1 doelcode in deze cursus staan in je lijst.');
    expect(T.codesRegel(1, 3)).toBe('1 van de 3 doelcodes in deze cursus staat in je lijst.');
  });

  it('de melding bij een cursus van een ander leerplan', () => {
    expect(T.andereLijstMelding('Oud leerplan', 'Mijn lijst')).toBe(
      'Deze cursus hangt nu aan ‘Oud leerplan’. Kies je deze lijst, dan telt de doelendekking voortaan op ‘Mijn lijst’. '
      + 'Wat in de cursus staat, verandert niet; doelcodes die niet in je lijst staan, zie je in de doelendekking.',
    );
  });

  it('de toast na het koppelen', () => {
    expect(T.toastGekoppeld('Biologie 4de jaar', 'Mijn lijst')).toBe('‘Biologie 4de jaar’ hangt nu aan ‘Mijn lijst’.');
  });

  it('de fouten bij het koppelen zijn die van de rest van de app', () => {
    expect(T.koppelFout('gewijzigd')).toBe('Deze cursus werd intussen elders aangepast. Er is niets veranderd. Probeer opnieuw.');
    expect(T.koppelFout('verwijderd')).toBe('Deze cursus bestaat niet meer. Er is niets veranderd.');
    expect(T.koppelFout('mislukt')).toBe('Er is niets bewaard: de opslag van dit toestel is vol of geblokkeerd.');
  });
});

// Dit bestand heeft geen imports (de pagina's laden het mee); wat het uit `gatenWeergave.ts` en `dekkingWeergave.ts` herhaalt, is
// hier gelijk aan de bron.
describe('gelijk aan de gedeelde zinnen', () => {
  it('de fouten, "Nog nodig" en de laadfout zijn die van gatenWeergave', () => {
    expect(T.FOUT_LADEN_VENSTER).toBe(FOUT_LADEN_GATEN);
    expect(T.FOUT_CURSUS_NIET_BEWAARD).toBe(FOUT_OPSLAG_VOL);
    expect(T.koppelFout('gewijzigd')).toBe(FOUT_CURSUS_GEWIJZIGD);
    expect(T.koppelFout('verwijderd')).toBe(FOUT_CURSUS_VERWIJDERD);
    expect(T.koppelFout('mislukt')).toBe(FOUT_OPSLAG_VOL);
    expect(T.NOG_NODIG_TITEL).toBe(nogNodigTekst(['een titel']));
    expect(T.NOG_NODIG_CURSUS).toBe(nogNodigTekst(['een cursus']));
  });

  it('de toast bij een geraamte is die van gatenWeergave, voor elk getal', () => {
    for (const [h, c] of [[1, 1], [1, 7], [3, 21], [12, 1]] as const) {
      expect(T.toastCursusMetGeraamte(h, c, 'Lijst')).toBe(cursusGemaaktToast(h, c, false));
    }
  });

  it('de telling in enkelvoud en meervoud volgt enkelOfMeer', () => {
    for (const n of [0, 1, 2, 10]) {
      expect(T.naBewarenZin('L', n, false)).toContain(`met ${enkelOfMeer(n, 'doel', 'doelen')}.`);
    }
  });
});

describe('taal', () => {
  it('geen set-id, groepnummer of "widget" in de teksten', () => {
    const teksten = (Object.values(T) as unknown[]).filter((v): v is string => typeof v === 'string');
    teksten.push(
      T.naBewarenZin('Lijst', 2, true), T.toastCursusMetGeraamte(2, 5, 'Lijst'), T.toastLegeCursus('Lijst'), T.codesRegel(1, 2),
      T.andereLijstMelding('Oud', 'Nieuw'), T.toastGekoppeld('Cursus', 'Lijst'), T.hangtRegel({ dezeLijst: false }),
    );
    for (const t of teksten) {
      expect(t).not.toMatch(/ODS_\d|G-\d|structuuronderdeel|widget/i);
    }
  });
});
