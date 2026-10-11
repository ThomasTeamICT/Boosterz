import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { BkBestand, BkIndex } from './beroepskwalificaties';
import { BK_VENSTER_FOUT, BK_VENSTER_LADEN } from './bkWeergave';
import { leerplanUitBk } from './bkLeerplan';
import type { Doelgroep } from './doelgroep';
import { doelgroepVan, richtingInfo, type RichtingInfo } from './richtingKader';
import { MAX_DOELGROEP_VAK } from './doelgroep';
import {
  aantalOntbrekend,
  BK_PAGINA_HERLADEN,
  BK_VAK_MEER,
  beginFilter,
  bevestigRichting,
  bkBestandStanden,
  bkGekozen,
  bkVakVoorstel,
  bkVoorgevuldVak,
  FOUT_BK_KEUZE,
  huidigeEerst,
  inlezenLink,
  isOngewijzigd,
  kaderLeegTekst,
  ontbrekendeDoelenZin,
  setFoutTekst,
  setLabels,
  uniekeNamen,
  vakHint,
  voetTekst,
  voetTekstBk,
  voorstelZin,
  zonderSetId,
  type BkBestandUitkomst,
} from './richtingVenster';
import type { MatrixBestand, StudierichtingGroep, Structuuronderdeel } from './studierichtingen';

const VANDAAG = '2026-10-09';
const SHA = 'ab'.repeat(32);

// ── Nagemaakte gegevens ─────────────────────────────────────────────────────

function onderdeel(nummer: number, groep: string, extra: Partial<Structuuronderdeel> = {}): Structuuronderdeel {
  return {
    nummer, groep, titel: `Onderdeel ${nummer}`, onderwijsvorm: 'ASO', begindatum: '2021-09-01',
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

const M = matrixVan(
  [
    groep('G-0100', 'Natuurwetenschappen', [1, 11]),
    groep('G-0200', 'Economie', [2], { graad: '3', finaliteit: 'DU' }),
    groep('G-0300', 'Animator', [4], { graad: '3', finaliteit: undefined, type7: 'BSO_TIJDELIJK' }),
    groep('G-0400', 'Assistent plantaardige productie', [6], { graad: undefined, opleidingsvorm: { omschrijving: 'Beroepsonderwijs' } }),
    groep('G-0500', 'Oude richting', [7], { graad: '2', finaliteit: 'A' }),
  ],
  [
    onderdeel(1, 'G-0100', { studiedomein: { omschrijving: 'DOMEINOVERSCHRIJDEND' }, ov4: true }),
    onderdeel(11, 'G-0100', { titel: 'Natuurwetenschappen, STEM' }),
    onderdeel(2, 'G-0200'),
    onderdeel(4, 'G-0300', { leerjaren: [{ code: '3' }] }),
    onderdeel(6, 'G-0400', { hoofdstructuren: ['321'] }),
    onderdeel(7, 'G-0500', { einddatum: '2024-08-31' }),
  ],
);

function info(nummer: string): RichtingInfo {
  const i = richtingInfo(M, nummer, VANDAAG);
  if (!i) throw new Error(`geen richting ${nummer}`);
  return i;
}

// ── Teksten ─────────────────────────────────────────────────────────────────

describe('zonderSetId', () => {
  it('haalt een set-id tussen haakjes weg, met de spatie ervoor', () => {
    expect(zonderSetId('Nederlands (ODS_3343): 3 doelen zijn overgeslagen.')).toBe('Nederlands: 3 doelen zijn overgeslagen.');
    expect(zonderSetId('Wiskunde (ODS_12) en Frans (ODS_3016) kloppen niet.')).toBe('Wiskunde en Frans kloppen niet.');
  });

  it('vervangt een los set-id door "de set"', () => {
    expect(zonderSetId('ODS_3343 kon niet geladen worden.')).toBe('de set kon niet geladen worden.');
    expect(zonderSetId('Zie "ODS_3343" en ODS_3283.')).toBe('Zie "de set" en de set.');
  });

  it('zegt nooit "de set de set": "set ODS_x" wordt gewoon "set"', () => {
    expect(zonderSetId('De set ODS_3343 bestaat niet (meer).')).toBe('De set bestaat niet (meer).');
    expect(zonderSetId('Bij de set ODS_12 klopt iets niet.')).toBe('Bij de set klopt iets niet.');
    expect(zonderSetId('De set ODS_3343 kon niet gelezen worden. Zie ODS_9.')).not.toMatch(/de set de set/i);
  });

  it('laat een tekst zonder set-id ongemoeid', () => {
    expect(zonderSetId('De set "Nederlands" kon niet geladen worden. Probeer opnieuw.')).toBe('De set "Nederlands" kon niet geladen worden. Probeer opnieuw.');
    expect(zonderSetId('')).toBe('');
  });

  it('laat geen set-id over', () => {
    const uit = zonderSetId('A (ODS_1), ODS_22, B (ODS_333) en ods_4 en ODS_.');
    expect(uit).not.toMatch(/ODS_\d/);
  });
});

describe('ontbrekendeDoelenZin en aantalOntbrekend', () => {
  it('meervoud en enkelvoud', () => {
    expect(ontbrekendeDoelenZin(3)).toBe('3 doelen uit de koppeling staan niet meer in de huidige versie van de set. De koppeling wordt elke maand bijgewerkt.');
    expect(ontbrekendeDoelenZin(1)).toBe('1 doel uit de koppeling staat niet meer in de huidige versie van de set. De koppeling wordt elke maand bijgewerkt.');
  });

  it('is leeg zonder ontbrekende doelen', () => {
    expect(ontbrekendeDoelenZin(0)).toBe('');
    expect(ontbrekendeDoelenZin(-2)).toBe('');
    expect(ontbrekendeDoelenZin(Number.NaN)).toBe('');
  });

  it('telt de ontbrekende nummers over alle sets', () => {
    expect(aantalOntbrekend([])).toBe(0);
    expect(aantalOntbrekend([{ ids: ['1', '2'] }, { ids: ['7'] }, { ids: [] }])).toBe(3);
  });
});

describe('uniekeNamen', () => {
  it('houdt de eerste schrijfwijze en de volgorde', () => {
    expect(uniekeNamen(['Wiskunde', 'Frans', 'wiskunde ', 'Frans', 'Nederlands'])).toEqual(['Wiskunde', 'Frans', 'Nederlands']);
    expect(uniekeNamen([])).toEqual([]);
  });
});

describe('setFoutTekst', () => {
  const GEEN_LIJST = /uit de lijst/i;

  it('een set die niet bestaat: de naam staat erin, het set-id niet, en er is geen lijst om uit te kiezen', () => {
    const tekst = setFoutTekst('Biologie', 'De set ODS_3343 bestaat niet (meer). Kies een set uit de lijst.');
    expect(tekst).toBe('De set ‘Biologie’ bestaat niet (meer). Kies andere sets of andere doelen.');
    expect(tekst).not.toMatch(GEEN_LIJST);
    expect(tekst).not.toMatch(/ODS_|de set de set/i);
  });

  it('een beschadigd bestand: geen "de set de set", geen set-id', () => {
    const tekst = setFoutTekst('Biologie', 'De set ODS_3343 kon niet gelezen worden: het bestand is beschadigd. Probeer het later opnieuw. (naam ontbreekt bij ODS_3343)');
    expect(tekst.startsWith('De set ‘Biologie’ kon niet gelezen worden: het bestand is beschadigd.')).toBe(true);
    expect(tekst).not.toMatch(/ODS_|de set de set/i);
  });

  it('een andere fout krijgt de naam ervoor', () => {
    expect(setFoutTekst('Frans', 'De sets konden niet geladen worden. Controleer je verbinding.')).toBe('Frans: De sets konden niet geladen worden. Controleer je verbinding.');
  });

  it('zonder naam blijft de tekst zoals ze is, zonder set-id', () => {
    expect(setFoutTekst(undefined, 'De set ODS_1 bestaat niet (meer). Kies een set uit de lijst.')).toBe('De set bestaat niet (meer). Kies andere sets of andere doelen.');
  });

  it('een naam met haakjes en een achtervoegsel blijft heel', () => {
    expect(setFoutTekst('Nederlands (Uitbreidingsdoelen)', 'De set ODS_2 bestaat niet (meer).')).toBe('De set ‘Nederlands (Uitbreidingsdoelen)’ bestaat niet (meer).');
  });
});

describe('setLabels', () => {
  const NAAM_1G = 'Secundair onderwijs 1ste graad A-stroom -  Competenties in het Nederlands - ';
  const set1g = (soort: string, korteNaam = 'Nederlands') => ({
    set: { naam: NAAM_1G + soort, korteNaam, graad: '1ste graad', stroom: 'A-stroom' },
    volledig: true,
  });
  const zin = (l: { naam: string; achtervoegsel: string }) => `${l.naam}${l.achtervoegsel}`;

  it('een unieke naam heeft geen achtervoegsel', () => {
    const uit = setLabels([
      { set: { naam: 'Wiskunde eindtermen', korteNaam: 'Wiskunde' }, volledig: true },
      { set: { naam: 'Frans eindtermen', korteNaam: 'Frans' }, volledig: false },
    ]);
    expect(uit).toEqual([{ naam: 'Wiskunde', achtervoegsel: '' }, { naam: 'Frans', achtervoegsel: '' }]);
  });

  it('de naam valt terug op de volledige naam zonder korte naam', () => {
    expect(setLabels([{ set: { naam: ' Muziek ' }, volledig: true }])).toEqual([{ naam: 'Muziek', achtervoegsel: '' }]);
  });

  it('een deel van een set en een volledige set met dezelfde naam: deel of volledig', () => {
    const uit = setLabels([
      { set: { naam: 'A - Wiskunde', korteNaam: 'Wiskunde' }, volledig: false },
      { set: { naam: 'B - Frans', korteNaam: 'Frans' }, volledig: true },
      { set: { naam: 'C - Wiskunde', korteNaam: 'wiskunde' }, volledig: true },
    ]);
    expect(uit.map((l) => l.achtervoegsel)).toEqual([' (een deel van de set)', '', ' (de volledige set)']);
  });

  it('de 1ste graad: drie volledige sets "Nederlands" blijven uit elkaar te houden', () => {
    const uit = setLabels([set1g('Eindtermen'), set1g('Eindtermen basisgeletterdheid'), set1g('Uitbreidingsdoelen')]);
    expect(uit.map((l) => l.achtervoegsel)).toEqual([
      ' (de volledige set)',
      ' (Eindtermen basisgeletterdheid)',
      ' (Uitbreidingsdoelen)',
    ]);
    expect(new Set(uit.map(zin)).size).toBe(3);
  });

  it('sets met dezelfde naam, hetzelfde soort doelen en een andere stroom: graad en stroom beslissen', () => {
    const b = { ...set1g('Eindtermen'), set: { ...set1g('Eindtermen').set, stroom: 'B-stroom' } };
    const uit = setLabels([set1g('Eindtermen'), b]);
    expect(uit.map((l) => l.achtervoegsel)).toEqual([
      ' (de volledige set, 1ste graad · A-stroom)',
      ' (de volledige set, 1ste graad · B-stroom)',
    ]);
  });

  it('twee echt gelijke sets krijgen een volgnummer', () => {
    const uit = setLabels([set1g('Eindtermen'), set1g('Eindtermen'), set1g('Eindtermen')]);
    expect(uit.map((l) => l.achtervoegsel)).toEqual([
      ' (de volledige set, 1ste graad · A-stroom, 1 van 3)',
      ' (de volledige set, 1ste graad · A-stroom, 2 van 3)',
      ' (de volledige set, 1ste graad · A-stroom, 3 van 3)',
    ]);
  });

  it('het achtervoegsel bevat nooit een set-id en de lijst is leeg zonder sets', () => {
    expect(setLabels([])).toEqual([]);
    const uit = setLabels([set1g('Eindtermen'), set1g('Eindtermen basisgeletterdheid')]);
    for (const l of uit) expect(zin(l)).not.toMatch(/ODS_/);
  });

  it('in de voorstelzin staat elke aangevinkte set apart, ook met dezelfde naam', () => {
    const uit = setLabels([set1g('Eindtermen'), set1g('Eindtermen basisgeletterdheid')]);
    expect(voorstelZin('Nederlands', uit.map(zin), false)).toBe(
      'Voorgesteld bij ‘Nederlands’: Nederlands (de volledige set), Nederlands (Eindtermen basisgeletterdheid).',
    );
  });
});

describe('voorstelZin', () => {
  it('is leeg zonder vak', () => {
    expect(voorstelZin('', ['Biologie'], true)).toBe('');
  });

  it('noemt elke naam één keer', () => {
    expect(voorstelZin('Wiskunde', ['Wiskunde', 'Wiskunde'], false)).toBe('Voorgesteld bij ‘Wiskunde’: Wiskunde.');
    expect(voorstelZin('Biologie', ['Biologie', 'Chemie'], false)).toBe('Voorgesteld bij ‘Biologie’: Biologie, Chemie.');
  });

  it('wijst op een STEM-set, met of zonder andere sets', () => {
    expect(voorstelZin('Biologie', ['Biologie'], true)).toBe('Voorgesteld bij ‘Biologie’: Biologie. Daarnaast past een STEM-set; lees de uitleg hieronder.');
    expect(voorstelZin('Biologie', [], true)).toBe('Bij ‘Biologie’ past alleen een STEM-set. Lees de uitleg hieronder.');
  });

  it('zegt dat er niets gevonden is', () => {
    expect(voorstelZin('Muziek', [], false)).toBe('Geen set gevonden bij ‘Muziek’. Kies zelf hieronder.');
  });
});

describe('vakHint', () => {
  it('met sets: Boosterz vinkt sets aan', () => {
    expect(vakHint(false)).toMatch(/vinkt de sets aan/);
  });

  it('zonder sets: niets om aan te vinken, het vak komt alleen op de cursus', () => {
    const tekst = vakHint(true);
    expect(tekst).not.toMatch(/vinkt|sets/i);
    expect(tekst).toMatch(/titel/);
  });
});

describe('voetTekst', () => {
  const titel = { tekst: 'een titel' };
  const set = { tekst: 'minstens één set' };

  it('is leeg als er niets ontbreekt en alles geladen is', () => {
    expect(voetTekst([], 0, 0)).toBe('');
  });

  it('"Nog nodig:" noemt alleen zaken', () => {
    expect(voetTekst([titel, set], 0, 0)).toBe('Nog nodig: een titel en minstens één set.');
  });

  it('laden en fouten zijn een eigen status, nooit een opdracht na "Nog nodig:"', () => {
    expect(voetTekst([], 2, 0)).toBe('De sets worden nog geladen.');
    expect(voetTekst([], 0, 1)).toBe('Een set kon niet geladen worden. Probeer opnieuw.');
    expect(voetTekst([titel], 1, 0)).toBe('Nog nodig: een titel. De sets worden nog geladen.');
    expect(voetTekst([], 1, 1)).toBe('De sets worden nog geladen. Een set kon niet geladen worden. Probeer opnieuw.');
    expect(voetTekst([titel], 1, 1)).not.toMatch(/Nog nodig:[^.]*(wacht|probeer)/i);
  });
});

describe('kaderLeegTekst', () => {
  it('geen koppeling en geen leerplan op het toestel: de tekst van het ontwerp', () => {
    expect(kaderLeegTekst('geen', false)).toBe(
      'Voor deze richting geeft de officiële bron geen minimumdoelen. Lees het leerplan van je net in of stel zelf een doelenlijst samen.',
    );
  });

  it('met een leerplan op het toestel verwijst ze naar de keuze die er echt staat', () => {
    const tekst = kaderLeegTekst('geen', true);
    expect(tekst).toBe('Voor deze richting geeft de officiële bron geen minimumdoelen. Kies hieronder een leerplan dat al op dit toestel staat.');
    expect(tekst).not.toMatch(/samenstellen/i);
  });

  it('noemt de oorzaak bij andere herkomsten', () => {
    expect(kaderLeegTekst('nog-niet-opgehaald', false)).toMatch(/^De doelen van deze richting zijn nog niet opgehaald\./);
    expect(kaderLeegTekst('api', true)).toMatch(/^Voor deze richting staan er geen sets om uit te kiezen\./);
  });

  it('noemt nooit een groepnummer of set-id', () => {
    for (const h of ['api', 'graad-en-stroom', 'geen', 'nog-niet-opgehaald'] as const) {
      for (const b of [true, false]) expect(kaderLeegTekst(h, b)).not.toMatch(/G-\d|ODS_|structuuronderdeel/i);
    }
  });

  it('zonder derde argument, of met false, blijft de tekst zoals voor de beroepskwalificaties', () => {
    for (const h of ['api', 'graad-en-stroom', 'geen', 'nog-niet-opgehaald'] as const) {
      for (const b of [true, false]) {
        expect(kaderLeegTekst(h, b, false)).toBe(kaderLeegTekst(h, b));
        expect(kaderLeegTekst(h, b)).not.toMatch(/beroepskwalificatie/i);
      }
    }
  });

  it('met beroepskwalificaties noemt ze die keuze, naast wat er al stond', () => {
    expect(kaderLeegTekst('geen', false, true)).toBe(
      'Voor deze richting geeft de officiële bron geen minimumdoelen. Kies hieronder de competenties van een beroepskwalificatie, lees het leerplan van je net in of stel zelf een doelenlijst samen.',
    );
    expect(kaderLeegTekst('geen', true, true)).toBe(
      'Voor deze richting geeft de officiële bron geen minimumdoelen. Kies hieronder de competenties van een beroepskwalificatie, of een leerplan dat al op dit toestel staat.',
    );
    expect(kaderLeegTekst('nog-niet-opgehaald', false, true)).toMatch(/^De doelen van deze richting zijn nog niet opgehaald\. Kies hieronder de competenties/);
  });

  it('met beroepskwalificaties noemt ze nooit een groepnummer, set-id of competentiecode', () => {
    for (const h of ['api', 'graad-en-stroom', 'geen', 'nog-niet-opgehaald'] as const) {
      for (const b of [true, false]) expect(kaderLeegTekst(h, b, true)).not.toMatch(/G-\d|ODS_|structuuronderdeel|bkc\d|BK-\d/i);
    }
  });
});

describe('voetTekstBk', () => {
  const alles = { titel: false, competenties: false, laden: false, mislukt: false };

  it('is leeg als er niets ontbreekt en alles geladen is', () => {
    expect(voetTekstBk(alles)).toBe('');
  });

  it('"Nog nodig:" noemt alleen zaken, zoals in het ontwerp', () => {
    expect(voetTekstBk({ ...alles, titel: true, competenties: true })).toBe('Nog nodig: een titel, minstens één competentie.');
    expect(voetTekstBk({ ...alles, titel: true })).toBe('Nog nodig: een titel.');
    expect(voetTekstBk({ ...alles, competenties: true })).toBe('Nog nodig: minstens één competentie.');
  });

  it('laden en fouten zijn een eigen status, met de zinnen van het ontwerp', () => {
    expect(voetTekstBk({ ...alles, laden: true })).toBe('De beroepskwalificaties worden geladen…');
    expect(voetTekstBk({ ...alles, mislukt: true })).toBe('Een beroepskwalificatie kon niet geladen worden. Probeer opnieuw.');
    expect(voetTekstBk({ ...alles, laden: true })).toBe(BK_VENSTER_LADEN);
    expect(voetTekstBk({ ...alles, mislukt: true })).toBe(BK_VENSTER_FOUT);
    expect(voetTekstBk({ ...alles, titel: true, laden: true })).toBe('Nog nodig: een titel. De beroepskwalificaties worden geladen…');
    expect(voetTekstBk({ ...alles, laden: true, mislukt: true })).toBe(`${BK_VENSTER_LADEN} ${BK_VENSTER_FOUT}`);
  });

  it('een keuze die zelf niet getoond kon worden heeft een eigen zin', () => {
    expect(voetTekstBk({ ...alles, keuzeFout: true })).toBe(FOUT_BK_KEUZE);
  });

  it('de melding bij een deel dat niet laadde wijst naar de pagina, niet naar het venster (een heropend venster helpt niet)', () => {
    // De browser onthoudt een mislukt deel tot de pagina herladen wordt: "sluit dit venster en open het opnieuw" bleef falen.
    expect(FOUT_BK_KEUZE).toMatch(/laad de pagina opnieuw/);
    expect(FOUT_BK_KEUZE).not.toMatch(/venster/);
    expect(BK_PAGINA_HERLADEN).toBe('Pagina herladen');
  });

  it('noemt nooit een competentiecode, groepnummer of set-id', () => {
    const alle = [true, false].flatMap((titel) => [true, false].flatMap((competenties) => [true, false].flatMap((laden) => [true, false].map((mislukt) => ({ titel, competenties, laden, mislukt })))));
    for (const o of alle) expect(voetTekstBk({ ...o, keuzeFout: true })).not.toMatch(/bkc\d|BK-\d|G-\d|ODS_/i);
  });
});

describe('bkVakVoorstel en BK_VAK_MEER', () => {
  it('geen titels: geen vak', () => {
    expect(bkVakVoorstel([])).toBe('');
    expect(bkVakVoorstel(['', '  '])).toBe('');
  });

  it('één titel: die titel (getrimd)', () => {
    expect(bkVakVoorstel(['Onthaalmedewerker'])).toBe('Onthaalmedewerker');
    expect(bkVakVoorstel(['  Onthaalmedewerker '])).toBe('Onthaalmedewerker');
  });

  it('dezelfde titel twee keer (twee versies) telt één keer, ook met andere hoofdletters', () => {
    expect(bkVakVoorstel(['Onthaalmedewerker', 'Onthaalmedewerker'])).toBe('Onthaalmedewerker');
    expect(bkVakVoorstel(['Onthaalmedewerker', ' onthaalmedewerker'])).toBe('Onthaalmedewerker');
  });

  it('meer titels: "Beroepsgerichte vorming"', () => {
    expect(bkVakVoorstel(['Onthaalmedewerker', 'Recreatief medewerker'])).toBe('Beroepsgerichte vorming');
    expect(bkVakVoorstel(['A', 'B', 'C'])).toBe(BK_VAK_MEER);
  });

  it('is hetzelfde vak als dat van een leerplan met meer beroepskwalificaties', () => {
    const lees = (pad: string): unknown => JSON.parse(readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), '../../tests/fixtures', pad), 'utf8'));
    const index = lees('kwalificaties/uit/index.json') as BkIndex;
    const onthaal = lees('kwalificaties/uit/bk/BK-0390-2.json') as BkBestand;
    const recreatief = lees('kwalificaties/uit/bk/BK-0464-1.json') as BkBestand;
    const merken = new Map(index.bks.filter((r) => r.sha256).map((r) => [r.bk, (r.sha256 as string).slice(0, 16)] as const));
    const doelgroep: Doelgroep = { groep: 'G-0008', titel: 'Assistent dierlijke productie', soort: 'so' };
    const u = leerplanUitBk(
      [{ bestand: onthaal, competenties: onthaal.competenties.map((c) => c.id) }, { bestand: recreatief, competenties: recreatief.competenties.map((c) => c.id) }],
      { doelgroep, merken },
    );
    expect(u.bevestigd, u.waarschuwingen.join(' | ')).toBe(true);
    expect(u.leerplan.subject).toBe(BK_VAK_MEER);
  });
});

describe('bkVoorgevuldVak', () => {
  it('zonder startkaart is er niets vooraf ingevuld, ook niet bij een keuze', () => {
    expect(bkVoorgevuldVak(undefined, [])).toBe('');
    expect(bkVoorgevuldVak(undefined, ['Onthaalmedewerker'])).toBe('');
  });

  it('met een startkaart en nog geen keuze is het vak de titel van die kaart (getrimd)', () => {
    expect(bkVoorgevuldVak('Onthaalmedewerker', [])).toBe('Onthaalmedewerker');
    expect(bkVoorgevuldVak('  Onthaalmedewerker ', [])).toBe('Onthaalmedewerker');
  });

  it('met alleen de startkaart gekozen blijft het die titel', () => {
    expect(bkVoorgevuldVak('Onthaalmedewerker', ['Onthaalmedewerker'])).toBe('Onthaalmedewerker');
  });

  it('beweegt mee: kiest de leerkracht er een tweede bij, dan wordt het "Beroepsgerichte vorming"', () => {
    expect(bkVoorgevuldVak('Onthaalmedewerker', ['Onthaalmedewerker', 'Recreatief medewerker'])).toBe(BK_VAK_MEER);
  });

  it('beweegt mee: kiest ze alleen een andere kaart, dan is dat haar titel', () => {
    expect(bkVoorgevuldVak('Onthaalmedewerker', ['Recreatief medewerker'])).toBe('Recreatief medewerker');
  });

  it('past in het veld voor het vak', () => {
    const lang = 'A'.repeat(MAX_DOELGROEP_VAK + 20);
    expect(bkVoorgevuldVak(lang, [])).toHaveLength(MAX_DOELGROEP_VAK);
    expect(bkVoorgevuldVak('Onthaalmedewerker', [lang, 'B'])).toBe(BK_VAK_MEER);
  });
});

describe('bkGekozen', () => {
  const A = ['a1', 'a2', 'a3'];
  const B = ['b1', 'b2'];
  const alleenB = new Map([['BK-2-1', B]]);
  const beide = new Map([['BK-1-1', A], ['BK-2-1', B]]);

  it('zonder aangeraakte keuze en zonder standaard is er niets gekozen', () => {
    expect(bkGekozen(beide, null, [])).toEqual(new Map());
  });

  it('de standaard vinkt die beroepskwalificatie helemaal aan, in de volgorde van het bestand', () => {
    expect(bkGekozen(beide, null, ['BK-1-1'])).toEqual(new Map([['BK-1-1', A]]));
    expect(bkGekozen(beide, null, ['BK-1-1', 'BK-2-1'])).toEqual(beide);
  });

  it('een aangeraakte beroepskwalificatie wint van de standaard, ook als alles uit staat', () => {
    expect(bkGekozen(beide, new Map([['BK-1-1', ['a2']]]), ['BK-1-1'])).toEqual(new Map([['BK-1-1', ['a2']]]));
    expect(bkGekozen(beide, new Map([['BK-1-1', []]]), ['BK-1-1'])).toEqual(new Map());
  });

  it('wat niet aangeraakt is, houdt de standaard', () => {
    const uit = bkGekozen(beide, new Map([['BK-2-1', ['b2']]]), ['BK-1-1']);
    expect(uit).toEqual(new Map([['BK-1-1', A], ['BK-2-1', ['b2']]]));
    expect([...uit.keys()]).toEqual(['BK-1-1', 'BK-2-1']);
  });

  it('de proef van de fout: klikt de leerkracht in een andere beroepskwalificatie terwijl het bestand van de startkaart nog laadt, dan blijft haar standaard', () => {
    // Het bestand van BK-1-1 (de startkaart) is er nog niet; het venster onthoudt alleen wat de leerkracht in BK-2-1 aanraakte.
    const eigen = new Map([['BK-2-1', ['b1']]]);
    expect(bkGekozen(alleenB, eigen, ['BK-1-1'])).toEqual(new Map([['BK-2-1', ['b1']]]));
    // Het bestand komt binnen: de startkaart staat helemaal aan, naast wat de leerkracht koos.
    expect(bkGekozen(beide, eigen, ['BK-1-1'])).toEqual(new Map([['BK-1-1', A], ['BK-2-1', ['b1']]]));
  });

  it('negeert codes die niet (meer) in het bestand staan en houdt de volgorde van het bestand', () => {
    expect(bkGekozen(beide, new Map([['BK-1-1', ['a3', 'weg', 'a1']]]), [])).toEqual(new Map([['BK-1-1', ['a1', 'a3']]]));
  });

  it('een versie waarvan het bestand er niet is, staat er niet in', () => {
    expect(bkGekozen(alleenB, new Map([['BK-1-1', ['a1']]]), ['BK-1-1'])).toEqual(new Map());
  });
});

describe('bkBestandStanden', () => {
  const bestand = (naam: string) => ({ naam }) as unknown as BkBestand;
  const A = bestand('A');
  const klaar = (poging: number, b: BkBestand): BkBestandUitkomst => ({ poging, stand: 'klaar', bestand: b });
  const fout = (poging: number): BkBestandUitkomst => ({ poging, stand: 'fout' });

  it('zonder uitkomst laadt elke versie', () => {
    const { stand, bestanden } = bkBestandStanden(['BK-1-1', 'BK-2-1'], new Map(), 0);
    expect([...stand]).toEqual([['BK-1-1', 'laden'], ['BK-2-1', 'laden']]);
    expect(bestanden.size).toBe(0);
  });

  it('een uitkomst van de huidige poging geldt', () => {
    const uitkomsten = new Map<string, BkBestandUitkomst>([['BK-1-1', klaar(0, A)], ['BK-2-1', fout(0)], ['BK-3-1', { poging: 0, stand: 'ontbreekt' }]]);
    const { stand, bestanden } = bkBestandStanden(['BK-1-1', 'BK-2-1', 'BK-3-1'], uitkomsten, 0);
    expect([...stand]).toEqual([['BK-1-1', 'klaar'], ['BK-2-1', 'fout'], ['BK-3-1', 'ontbreekt']]);
    expect([...bestanden]).toEqual([['BK-1-1', A]]);
  });

  it('de proef van de fout: bij "Opnieuw proberen" blijft een versie die klaar was klaar, alleen de mislukte laadt opnieuw', () => {
    const uitkomsten = new Map<string, BkBestandUitkomst>([['BK-1-1', klaar(0, A)], ['BK-2-1', fout(0)], ['BK-3-1', { poging: 0, stand: 'ontbreekt' }]]);
    const { stand, bestanden } = bkBestandStanden(['BK-1-1', 'BK-2-1', 'BK-3-1'], uitkomsten, 1);
    expect([...stand]).toEqual([['BK-1-1', 'klaar'], ['BK-2-1', 'laden'], ['BK-3-1', 'ontbreekt']]);
    expect(bestanden.get('BK-1-1')).toBe(A);
  });

  it('een fout van de nieuwe poging geldt weer', () => {
    const uitkomsten = new Map<string, BkBestandUitkomst>([['BK-2-1', fout(1)]]);
    expect(bkBestandStanden(['BK-2-1'], uitkomsten, 1).stand.get('BK-2-1')).toBe('fout');
  });

  it('telt alleen de gevraagde versies', () => {
    const uitkomsten = new Map<string, BkBestandUitkomst>([['BK-1-1', klaar(0, A)], ['BK-9-9', klaar(0, A)]]);
    const { stand, bestanden } = bkBestandStanden(['BK-1-1'], uitkomsten, 0);
    expect([...stand.keys()]).toEqual(['BK-1-1']);
    expect([...bestanden.keys()]).toEqual(['BK-1-1']);
  });
});

describe('inlezenLink', () => {
  it('heeft de richting en het soort, en het jaar als er een is', () => {
    expect(inlezenLink('G-0100', 'so')).toBe('/leerplannen/inlezen?richting=G-0100&soort=so');
    expect(inlezenLink('G-0100', 'buso', 4)).toBe('/leerplannen/inlezen?richting=G-0100&soort=buso&jaar=4');
  });
});

// ── De richtingkiezer ───────────────────────────────────────────────────────

describe('bevestigRichting', () => {
  const nw = info('G-0100');
  const huidig: Doelgroep = doelgroepVan(nw, { groep: 'G-0100', jaar: 3, soort: 'so', onderdeel: 11 }, { vak: 'Biologie' });

  it('de proef: de huidige doelgroep heeft een onderdeel, een vak en een jaar', () => {
    expect(huidig).toMatchObject({ groep: 'G-0100', jaar: 3, onderdeel: 11, vak: 'Biologie', titel: 'Natuurwetenschappen, STEM' });
  });

  it('dezelfde richting zonder wijziging: huidig komt onveranderd terug', () => {
    const met: Doelgroep = { ...huidig, kader: 'abcd', volgtKader: true };
    expect(bevestigRichting(nw, { groep: 'G-0100', jaar: 3, soort: 'so' }, huidig)).toBe(huidig);
    expect(bevestigRichting(nw, { groep: 'G-0100', jaar: 3, soort: 'so' }, met)).toBe(met);
  });

  it('alleen het jaar wijzigt: onderdeel, titel en vak blijven', () => {
    const uit = bevestigRichting(nw, { groep: 'G-0100', jaar: 4, soort: 'so' }, huidig);
    expect(uit).not.toBe(huidig);
    expect(uit).toMatchObject({ groep: 'G-0100', jaar: 4, onderdeel: 11, vak: 'Biologie', titel: 'Natuurwetenschappen, STEM', soort: 'so' });
  });

  it('het jaar weghalen (de hele graad) behoudt het onderdeel ook', () => {
    const uit = bevestigRichting(nw, { groep: 'G-0100', jaar: undefined, soort: 'so' }, huidig);
    expect(uit.jaar).toBeUndefined();
    expect(uit.onderdeel).toBe(11);
  });

  it('het soort onderwijs wijzigt: onderdeel en vak blijven', () => {
    const uit = bevestigRichting(nw, { groep: 'G-0100', jaar: 3, soort: 'buso' }, huidig);
    expect(uit).toMatchObject({ soort: 'buso', onderdeel: 11, vak: 'Biologie', jaar: 3 });
  });

  it('een andere richting: het onderdeel valt weg, het vak gaat mee', () => {
    const economie = info('G-0200');
    const uit = bevestigRichting(economie, { groep: 'G-0200', jaar: 5, soort: 'so' }, huidig);
    expect(uit).toMatchObject({ groep: 'G-0200', jaar: 5, vak: 'Biologie', titel: 'Economie' });
    expect(uit.onderdeel).toBeUndefined();
  });

  it('een onderdeel dat niet bij de richting hoort, valt vanzelf weg', () => {
    const vreemd: Doelgroep = { ...huidig, groep: 'G-0200', onderdeel: 11 };
    const uit = bevestigRichting(info('G-0200'), { groep: 'G-0200', jaar: 6, soort: 'so' }, vreemd);
    expect(uit.onderdeel).toBeUndefined();
    expect(uit.titel).toBe('Economie');
  });

  it('zonder huidige doelgroep: gewoon de keuze', () => {
    const uit = bevestigRichting(nw, { groep: 'G-0100', jaar: 3, soort: 'so' }, undefined);
    expect(uit).toEqual(doelgroepVan(nw, { groep: 'G-0100', jaar: 3, soort: 'so' }));
    expect(uit.vak).toBeUndefined();
    expect(uit.onderdeel).toBeUndefined();
  });
});

describe('isOngewijzigd', () => {
  const nw = info('G-0100');
  const huidig: Doelgroep = doelgroepVan(nw, { groep: 'G-0100', jaar: 3, soort: 'so', onderdeel: 11 }, { vak: 'Biologie' });

  it('dezelfde richting, jaar en soort: niets gewijzigd', () => {
    expect(isOngewijzigd(huidig, { groep: 'G-0100', jaar: 3, buso: false })).toBe(true);
  });

  it('een ander jaar, een andere richting of een ander soort onderwijs is wel een wijziging', () => {
    expect(isOngewijzigd(huidig, { groep: 'G-0100', jaar: 4, buso: false })).toBe(false);
    expect(isOngewijzigd(huidig, { groep: 'G-0100', jaar: undefined, buso: false })).toBe(false);
    expect(isOngewijzigd(huidig, { groep: 'G-0200', jaar: 3, buso: false })).toBe(false);
    expect(isOngewijzigd(huidig, { groep: 'G-0100', jaar: 3, buso: true })).toBe(false);
    expect(isOngewijzigd(huidig, { groep: null, jaar: 3, buso: false })).toBe(false);
  });

  it('buitengewoon onderwijs blijft gelijk als het vinkje aan blijft', () => {
    const buso: Doelgroep = { ...huidig, soort: 'buso' };
    expect(isOngewijzigd(buso, { groep: 'G-0100', jaar: 3, buso: true })).toBe(true);
    expect(isOngewijzigd(buso, { groep: 'G-0100', jaar: 3, buso: false })).toBe(false);
  });

  it('een doelgroep zonder jaar voor een richting met één jaar: de kiezer vult dat jaar zelf in, maar huidig blijft', () => {
    const animator = info('G-0300');
    expect(animator.jaren).toHaveLength(1);
    const zonderJaar: Doelgroep = doelgroepVan(animator, { groep: 'G-0300', soort: 'so' });
    expect(zonderJaar.jaar).toBeUndefined();
    // Het jaar dat de kiezer er zelf bij zou zetten, maakt van de keuze een nieuwe doelgroep; zonder wijziging mag dat niet.
    const alsKeuze = bevestigRichting(animator, { groep: 'G-0300', jaar: animator.jaren[0], soort: 'so' }, zonderJaar);
    expect(alsKeuze).not.toBe(zonderJaar);
    expect(isOngewijzigd(zonderJaar, { groep: 'G-0300', jaar: undefined, buso: false })).toBe(true);
  });

  it('zonder huidige doelgroep is er niets om ongewijzigd te laten', () => {
    expect(isOngewijzigd(undefined, { groep: 'G-0100', jaar: 3, buso: false })).toBe(false);
  });
});

describe('beginFilter', () => {
  const alles = (f: ReturnType<typeof beginFilter>) => [f.graad, f.ookMeer, f.afgebouwd];

  it('zonder huidige richting: gewoon de graad', () => {
    expect(alles(beginFilter(M, undefined, undefined, VANDAAG))).toEqual([undefined, false, false]);
    expect(alles(beginFilter(M, undefined, 2, VANDAAG))).toEqual([2, false, false]);
  });

  it('een gewone richting in haar eigen graad: niets extra', () => {
    expect(alles(beginFilter(M, 'G-0100', 2, VANDAAG))).toEqual([2, false, false]);
  });

  it('een zevende jaar of buitengewoon onderwijs zet "toon ook meer" aan', () => {
    expect(alles(beginFilter(M, 'G-0300', 3, VANDAAG))).toEqual([3, true, false]);
  });

  it('een afgebouwde richting zet "toon ook afgebouwde richtingen" aan', () => {
    expect(alles(beginFilter(M, 'G-0500', 2, VANDAAG))).toEqual([2, false, true]);
  });

  it('een richting zonder graad verschijnt alleen zonder graadfilter', () => {
    expect(alles(beginFilter(M, 'G-0400', 2, VANDAAG))).toEqual([undefined, true, false]);
  });

  it('een richting in een andere graad dan het filter: zonder graadfilter', () => {
    expect(alles(beginFilter(M, 'G-0200', 2, VANDAAG))).toEqual([undefined, false, false]);
  });

  it('een richting die niet in de matrix staat: de gewone lijst', () => {
    expect(alles(beginFilter(M, 'G-9999', 2, VANDAAG))).toEqual([2, false, false]);
  });
});

describe('huidigeEerst', () => {
  const lijst = [{ groep: { nummer: 'A' } }, { groep: { nummer: 'B' } }, { groep: { nummer: 'C' } }, { groep: { nummer: 'D' } }];
  const nrs = (l: typeof lijst) => l.map((r) => r.groep.nummer).join('');

  it('zet de huidige richting vooraan en laat de rest in volgorde', () => {
    expect(nrs(huidigeEerst(lijst, 'C'))).toBe('CABD');
    expect(nrs(huidigeEerst(lijst, 'D'))).toBe('DABC');
  });

  it('laat de lijst zoals ze is als de richting al vooraan staat, ontbreekt of er geen is', () => {
    expect(nrs(huidigeEerst(lijst, 'A'))).toBe('ABCD');
    expect(nrs(huidigeEerst(lijst, 'Z'))).toBe('ABCD');
    expect(nrs(huidigeEerst(lijst, undefined))).toBe('ABCD');
  });

  it('wijzigt de oorspronkelijke lijst niet', () => {
    const kopie = [...lijst];
    huidigeEerst(lijst, 'C');
    expect(lijst).toEqual(kopie);
  });
});
