import { describe, expect, it } from 'vitest';
import {
  ANNULEREN_TEKST,
  CURSUS_LEGEND,
  DOELEN_HINT,
  DOELEN_LEGEND,
  FOUT_ANDER_LEERPLAN,
  FOUT_CURSUS_GEWIJZIGD,
  FOUT_CURSUS_VERWIJDERD,
  FOUT_LADEN_GATEN,
  FOUT_NIETS_TE_DOEN,
  FOUT_OPSLAG_VOL,
  FOUT_SETS_VERANDERD,
  GEEN_KANDIDAAT_HINT,
  GEEN_OPEN_TEKST,
  MAAK_CURSUS_TEKST,
  OF_KIES_NIEUW_TEKST,
  OPEN_LEERPLAN_TEKST,
  PANEEL_TITEL,
  PANEEL_UITLEG,
  PLAN_BIJ_RICHTING_TEKST,
  TITEL_HINT,
  TITEL_LABEL,
  TOON_DOELEN,
  VENSTER_HINT,
  VENSTER_INTRO,
  VENSTER_TITEL,
  WAAR_BESTAAND,
  WAAR_LEGEND,
  WAAR_NIEUW,
  andereOpenTekst,
  cursusGemaaktToast,
  cursusJaarTekst,
  doelRegelTekst,
  editorKnopTekst,
  editorRegel,
  foutBijBestaandeCursus,
  geplandInCursusToast,
  geplandInDezeCursusToast,
  nietNagekekenFout,
  nogNodigTekst,
  optioneleHintTekst,
  paneelZetTekst,
  passendTekst,
  planKnopTekst,
  setVakjeTekst,
  tellerTekst,
  telJaarTekst,
  voetNodigTekst,
  voorbeeldZin,
  zetKnopTekst,
  zonderPassendTekst,
} from './gatenWeergave';
import { zegOntbreekt } from './samenstelKeuze';

/** Geen enkele tekst van het scherm mag een set-id, een groepnummer of "structuuronderdeel" bevatten. */
function nooitIds(tekst: string): void {
  expect(tekst).not.toMatch(/ODS_\d|G-\d|structuuronderdeel/i);
}

describe('de knop op de richtingpagina', () => {
  it('meervoud en enkelvoud, letterlijk', () => {
    expect(planKnopTekst(37)).toBe('Plan de 37 doelen die nog nergens aan bod komen');
    expect(planKnopTekst(2)).toBe('Plan de 2 doelen die nog nergens aan bod komen');
    expect(planKnopTekst(1)).toBe('Plan het doel dat nog nergens aan bod komt');
  });

  it('de zin als er niets meer te plannen valt', () => {
    expect(GEEN_OPEN_TEKST).toBe('Er zijn geen verplichte minimumdoelen meer die nergens aan bod komen.');
  });
});

describe('het venster: vaste teksten', () => {
  it('titel, intro en hints letterlijk', () => {
    expect(VENSTER_TITEL).toBe('Plan wat nog nergens aan bod komt');
    expect(VENSTER_INTRO).toBe(
      'Boosterz zet de gekozen doelen als lege secties in een cursus, met de doelcodes erop. Zo staan ze gepland; daarna werk je ze zelf uit. Een AI-sleutel heb je niet nodig.',
    );
    expect(VENSTER_HINT).toBe('Doelen die al gepland staan of alleen in verdieping aan bod komen, blijven waar ze staan.');
    expect(DOELEN_LEGEND).toBe('Welke doelen?');
    expect(DOELEN_HINT).toBe('Vink uit wat in een andere cursus thuishoort.');
    expect(TOON_DOELEN).toBe('Toon de doelen');
    expect(WAAR_LEGEND).toBe('Waar komen ze?');
    expect(WAAR_NIEUW).toBe('In een nieuwe cursus');
    expect(WAAR_BESTAAND).toBe('In een cursus die je al hebt');
    expect(TITEL_LABEL).toBe('Titel van de cursus');
    expect(TITEL_HINT).toBe('Boosterz maakt er een nagekeken leerplan bij met precies deze doelen, of gebruikt het leerplan dat er al is.');
    expect(CURSUS_LEGEND).toBe('Welke cursus?');
    expect(GEEN_KANDIDAAT_HINT).toBe(
      'Geen cursus van deze richting heeft een van de gekozen doelen in haar leerplan. Maak er een nieuwe cursus voor, of pas eerst het leerplan van een cursus aan bij Leerplannen.',
    );
    expect(MAAK_CURSUS_TEKST).toBe('Maak de cursus');
    expect(ANNULEREN_TEKST).toBe('Annuleren');
    expect(OPEN_LEERPLAN_TEKST).toBe('Open het leerplan');
    expect(OF_KIES_NIEUW_TEKST).toBe('of kies ‘In een nieuwe cursus’.');
  });

  it('de hint over optionele doelen: enkelvoud, meervoud, en leeg bij 0', () => {
    expect(optioneleHintTekst(4)).toBe('De 4 optionele doelen en uitbreidingsdoelen die nog nergens aan bod komen, zitten er niet in.');
    expect(optioneleHintTekst(1)).toBe('Het optionele doel of uitbreidingsdoel dat nog nergens aan bod komt, zit er niet in.');
    expect(optioneleHintTekst(0)).toBe('');
  });

  it('"Tel mee: alleen het jaar"', () => {
    expect(telJaarTekst(4)).toBe('Je telt nu alleen de cursussen van het 4de jaar.');
    expect(telJaarTekst(1)).toBe('Je telt nu alleen de cursussen van het 1ste jaar.');
  });

  it('het vakje van een set: enkelvoud en meervoud', () => {
    expect(setVakjeTekst('Chemie', 9)).toBe('Chemie · 9 doelen');
    expect(setVakjeTekst('Chemie', 1)).toBe('Chemie · 1 doel');
  });

  it('een doel in de uitklapper: code en tekst, of een van beide', () => {
    expect(doelRegelTekst('09.01', 'De leerlingen verklaren iets.')).toBe('09.01 — De leerlingen verklaren iets.');
    expect(doelRegelTekst('', 'Alleen tekst')).toBe('Alleen tekst');
    expect(doelRegelTekst('09.01', '')).toBe('09.01');
    expect(doelRegelTekst('  ', '  ')).toBe('');
  });

  it('de teller: meervoud, enkelvoud en niets gekozen', () => {
    expect(tellerTekst(21, 3)).toBe('Je koos 21 doelen uit 3 sets.');
    expect(tellerTekst(9, 1)).toBe('Je koos 9 doelen uit 1 set.');
    expect(tellerTekst(1, 1)).toBe('Je koos 1 doel uit 1 set.');
    expect(tellerTekst(0, 0)).toBe('Je koos nog geen doelen.');
    expect(tellerTekst(0, 2)).toBe('Je koos nog geen doelen.');
  });
});

describe('de lijst met cursussen', () => {
  it('het jaar van een cursus, of de hele graad', () => {
    expect(cursusJaarTekst(4)).toBe('4de jaar');
    expect(cursusJaarTekst(undefined)).toBe('hele graad');
    expect(cursusJaarTekst(0)).toBe('hele graad');
  });

  it('hoeveel gekozen doelen in het leerplan staan: meervoud, enkelvoud en één gekozen doel', () => {
    expect(passendTekst(17, 21)).toBe('17 van de 21 gekozen doelen staan in haar leerplan');
    expect(passendTekst(21, 21)).toBe('21 van de 21 gekozen doelen staan in haar leerplan');
    expect(passendTekst(1, 21)).toBe('1 van de 21 gekozen doelen staat in haar leerplan');
    expect(passendTekst(1, 1)).toBe('Het gekozen doel staat in haar leerplan');
  });

  it('de cursussen zonder passend doel: meervoud, enkelvoud en leeg bij 0', () => {
    expect(zonderPassendTekst(3)).toBe('3 andere cursussen van deze richting hebben geen van deze doelen in hun leerplan.');
    expect(zonderPassendTekst(1)).toBe('1 andere cursus van deze richting heeft geen van deze doelen in haar leerplan.');
    expect(zonderPassendTekst(0)).toBe('');
  });
});

describe('de voorbeeldzin bij een gekozen cursus', () => {
  it('alle gekozen doelen staan in het leerplan', () => {
    expect(voorbeeldZin('Biologie 4de jaar', 21, 21)).toEqual({
      tekst: 'Alle 21 gekozen doelen staan in het leerplan van ‘Biologie 4de jaar’. Ze komen er als lege secties bij; wat al in de cursus staat, blijft zoals het is.',
      metLink: false,
    });
  });

  it('één gekozen doel: enkelvoud', () => {
    expect(voorbeeldZin('Biologie 4de jaar', 1, 1)).toEqual({
      tekst: 'Het gekozen doel staat in het leerplan van ‘Biologie 4de jaar’. Het komt er als lege sectie bij; wat al in de cursus staat, blijft zoals het is.',
      metLink: false,
    });
  });

  it('een deel staat niet in het leerplan: meervoud en enkelvoud, met de link', () => {
    expect(voorbeeldZin('Biologie 4de jaar', 4, 21)).toEqual({
      tekst: '17 gekozen doelen staan niet in het leerplan van ‘Biologie 4de jaar’ en komen er niet bij: Boosterz past een leerplan nooit zelf aan.',
      metLink: true,
    });
    expect(voorbeeldZin('Biologie 4de jaar', 20, 21)).toEqual({
      tekst: '1 gekozen doel staat niet in het leerplan van ‘Biologie 4de jaar’ en komt er niet bij: Boosterz past een leerplan nooit zelf aan.',
      metLink: true,
    });
  });
});

describe('de knoppen en de voet', () => {
  it('de knop bij een bestaande cursus', () => {
    expect(zetKnopTekst(21, 21)).toBe('Zet ze in deze cursus');
    expect(zetKnopTekst(4, 21)).toBe('Zet de 4 doelen in deze cursus');
    expect(zetKnopTekst(1, 21)).toBe('Zet het doel in deze cursus');
    // Nog geen cursus gekozen: de gewone tekst.
    expect(zetKnopTekst(21, 21)).toBe('Zet ze in deze cursus');
    expect(zetKnopTekst(0, 21)).toBe('Zet ze in deze cursus');
  });

  it('bij één gekozen doel past de knop bij "Het gekozen doel staat in het leerplan van …"', () => {
    expect(zetKnopTekst(1, 1)).toBe('Zet het in deze cursus');
    // Ook zolang er nog geen cursus gekozen is.
    expect(zetKnopTekst(0, 1)).toBe('Zet het in deze cursus');
    // Bij meer dan één gekozen doel blijft het meervoud, en nul gekozen doelen geven de gewone tekst.
    expect(zetKnopTekst(2, 2)).toBe('Zet ze in deze cursus');
    expect(zetKnopTekst(0, 0)).toBe('Zet ze in deze cursus');
    expect(voorbeeldZin('Biologie 4de jaar', 1, 1).tekst).toMatch(/^Het gekozen doel staat in het leerplan van/);
  });

  it('wat er nog nodig is: de tweede waarde hangt van de keuze af', () => {
    expect(voetNodigTekst({ doelen: 0, waar: 'nieuw', titel: '', cursusGekozen: false })).toBe('Nog nodig: minstens één doel en een titel.');
    expect(voetNodigTekst({ doelen: 0, waar: 'bestaand', titel: 'x', cursusGekozen: false })).toBe('Nog nodig: minstens één doel en een cursus.');
    expect(voetNodigTekst({ doelen: 3, waar: 'nieuw', titel: '   ', cursusGekozen: false })).toBe('Nog nodig: een titel.');
    expect(voetNodigTekst({ doelen: 3, waar: 'bestaand', titel: '', cursusGekozen: false })).toBe('Nog nodig: een cursus.');
    expect(voetNodigTekst({ doelen: 3, waar: 'nieuw', titel: 'Een titel', cursusGekozen: false })).toBe('');
    expect(voetNodigTekst({ doelen: 3, waar: 'bestaand', titel: '', cursusGekozen: true })).toBe('');
  });

  it('"Nog nodig" loopt gelijk met zegOntbreekt van de samenstelwizard', () => {
    for (const delen of [[], ['a'], ['a', 'b'], ['a', 'b', 'c']]) {
      expect(nogNodigTekst(delen)).toBe(zegOntbreekt(delen.map((tekst) => ({ tekst }))));
    }
  });
});

describe('fouten en toasts', () => {
  it('het leerplan kon niet nagekeken worden, zonder dubbele punt aan het eind', () => {
    expect(nietNagekekenFout('Meer dan 50 sets')).toBe('Het leerplan kon niet als nagekeken bewaard worden: Meer dan 50 sets. Er is niets bewaard.');
    expect(nietNagekekenFout('Meer dan 50 sets. ')).toBe('Het leerplan kon niet als nagekeken bewaard worden: Meer dan 50 sets. Er is niets bewaard.');
  });

  it('de vaste foutteksten, letterlijk', () => {
    expect(FOUT_SETS_VERANDERD).toBe('De sets zijn intussen veranderd. Sluit dit venster en probeer opnieuw. Er is niets bewaard.');
    expect(FOUT_OPSLAG_VOL).toBe('Er is niets bewaard: de opslag van dit toestel is vol of geblokkeerd.');
    expect(FOUT_CURSUS_GEWIJZIGD).toBe('Deze cursus werd intussen elders aangepast. Er is niets veranderd. Probeer opnieuw.');
    expect(FOUT_CURSUS_VERWIJDERD).toBe('Deze cursus bestaat niet meer. Er is niets veranderd.');
    expect(FOUT_ANDER_LEERPLAN).toBe('Deze cursus hangt intussen aan een ander leerplan. Er is niets veranderd. Probeer opnieuw.');
    expect(FOUT_LADEN_GATEN).toBe('Dit kon niet geladen worden. Controleer je verbinding en probeer opnieuw.');
  });

  it('elke reden van bewaarGatenOpCursus heeft een eigen tekst', () => {
    expect(foutBijBestaandeCursus('gewijzigd')).toBe(FOUT_CURSUS_GEWIJZIGD);
    expect(foutBijBestaandeCursus('verwijderd')).toBe(FOUT_CURSUS_VERWIJDERD);
    expect(foutBijBestaandeCursus('ander-leerplan')).toBe(FOUT_ANDER_LEERPLAN);
    expect(foutBijBestaandeCursus('niets-te-doen')).toBe(FOUT_NIETS_TE_DOEN);
    expect(foutBijBestaandeCursus('mislukt')).toBe(FOUT_OPSLAG_VOL);
  });

  it('de toast na een nieuwe cursus: meervoud, enkelvoud en met hergebruik', () => {
    expect(cursusGemaaktToast(3, 21, false)).toBe('Cursus gemaakt: 3 hoofdstukken, 21 doelcodes klaar op de secties.');
    expect(cursusGemaaktToast(1, 1, false)).toBe('Cursus gemaakt: 1 hoofdstuk, 1 doelcode klaar op de secties.');
    expect(cursusGemaaktToast(3, 21, true)).toBe(
      'Cursus gemaakt: 3 hoofdstukken, 21 doelcodes klaar op de secties. Er stond al een leerplan met precies deze doelen: de cursus hangt daaraan.',
    );
  });

  it('de toast na doelen in een bestaande cursus: meervoud en enkelvoud', () => {
    expect(geplandInCursusToast(21, 'Biologie 4de jaar')).toBe('21 doelen staan nu gepland in ‘Biologie 4de jaar’.');
    expect(geplandInCursusToast(1, 'Biologie 4de jaar')).toBe('1 doel staat nu gepland in ‘Biologie 4de jaar’.');
  });
});

describe('de cursuseditor', () => {
  it('de regel en de knop: meervoud en enkelvoud', () => {
    expect(editorRegel(3)).toBe('3 doelen uit het leerplan van deze cursus staan nog op geen enkele sectie.');
    expect(editorRegel(1)).toBe('1 doel uit het leerplan van deze cursus staat nog op geen enkele sectie.');
    expect(editorKnopTekst(3)).toBe('Plan ze in deze cursus');
    expect(editorKnopTekst(1)).toBe('Plan het in deze cursus');
  });

  it('het paneel, letterlijk', () => {
    expect(PANEEL_TITEL).toBe('Plan in deze cursus');
    expect(PANEEL_UITLEG).toBe(
      'Boosterz zet ze als lege secties met de doelcodes erop achteraan in je cursus, of achteraan in een hoofdstuk met dezelfde naam. Wat al in de cursus staat, blijft zoals het is.',
    );
  });

  it('de knop in het paneel zet alle gekozen doelen: meervoud, enkelvoud en nog geen doel gekozen', () => {
    expect(paneelZetTekst(3)).toBe('Zet ze in deze cursus');
    expect(paneelZetTekst(1)).toBe('Zet het in deze cursus');
    expect(paneelZetTekst(0)).toBe('Zet ze in deze cursus');
  });

  it('de andere open doelen: meervoud, enkelvoud en leeg bij 0', () => {
    expect(andereOpenTekst(12)).toBe('12 andere doelen die deze cursus niet dekt, staan niet in haar leerplan.');
    expect(andereOpenTekst(1)).toBe('1 ander doel dat deze cursus niet dekt, staat niet in haar leerplan.');
    expect(andereOpenTekst(0)).toBe('');
    expect(PLAN_BIJ_RICHTING_TEKST).toBe('Wat geen enkele cursus behandelt, plan je bij de studierichting.');
  });

  it('de toast in de editor: meervoud en enkelvoud', () => {
    expect(geplandInDezeCursusToast(3)).toBe('3 doelen staan nu gepland in deze cursus.');
    expect(geplandInDezeCursusToast(1)).toBe('1 doel staat nu gepland in deze cursus.');
  });
});

describe('geen set-id, groepnummer of structuuronderdeel op het scherm', () => {
  it('in geen enkele tekst, in enkelvoud of meervoud', () => {
    const teksten: string[] = [
      planKnopTekst(1), planKnopTekst(37), GEEN_OPEN_TEKST, VENSTER_TITEL, VENSTER_INTRO, VENSTER_HINT,
      optioneleHintTekst(1), optioneleHintTekst(4), telJaarTekst(4), DOELEN_LEGEND, DOELEN_HINT, TOON_DOELEN,
      setVakjeTekst('Chemie', 1), setVakjeTekst('Chemie', 9), tellerTekst(0, 0), tellerTekst(1, 1), tellerTekst(21, 3),
      WAAR_LEGEND, WAAR_NIEUW, WAAR_BESTAAND, GEEN_KANDIDAAT_HINT, TITEL_LABEL, TITEL_HINT, CURSUS_LEGEND,
      cursusJaarTekst(4), cursusJaarTekst(undefined), passendTekst(1, 1), passendTekst(1, 5), passendTekst(4, 5),
      zonderPassendTekst(1), zonderPassendTekst(3), voorbeeldZin('X', 1, 1).tekst, voorbeeldZin('X', 5, 5).tekst,
      voorbeeldZin('X', 1, 2).tekst, voorbeeldZin('X', 1, 5).tekst, OF_KIES_NIEUW_TEKST, OPEN_LEERPLAN_TEKST,
      zetKnopTekst(5, 5), zetKnopTekst(1, 1), zetKnopTekst(1, 5), zetKnopTekst(4, 5), MAAK_CURSUS_TEKST, ANNULEREN_TEKST,
      voetNodigTekst({ doelen: 0, waar: 'nieuw', titel: '', cursusGekozen: false }),
      voetNodigTekst({ doelen: 0, waar: 'bestaand', titel: '', cursusGekozen: false }),
      nietNagekekenFout('Een waarschuwing'), FOUT_SETS_VERANDERD, FOUT_OPSLAG_VOL, FOUT_CURSUS_GEWIJZIGD,
      FOUT_CURSUS_VERWIJDERD, FOUT_ANDER_LEERPLAN, FOUT_NIETS_TE_DOEN, FOUT_LADEN_GATEN,
      cursusGemaaktToast(1, 1, true), cursusGemaaktToast(3, 21, false), geplandInCursusToast(1, 'X'), geplandInCursusToast(5, 'X'),
      editorRegel(1), editorRegel(3), editorKnopTekst(1), editorKnopTekst(3), PANEEL_TITEL, PANEEL_UITLEG, paneelZetTekst(1), paneelZetTekst(3),
      andereOpenTekst(1), andereOpenTekst(12), PLAN_BIJ_RICHTING_TEKST, geplandInDezeCursusToast(1), geplandInDezeCursusToast(3),
    ];
    for (const tekst of teksten) nooitIds(tekst);
  });

  it('geen enkele tekst bevat een leeg getal of "undefined"', () => {
    for (const tekst of [planKnopTekst(2), tellerTekst(2, 2), passendTekst(2, 3), voorbeeldZin('X', 2, 3).tekst, zetKnopTekst(2, 3)]) {
      expect(tekst).not.toMatch(/undefined|NaN|\[object/);
    }
  });
});
