import { describe, expect, it } from 'vitest';
import {
  controleStatus, doelenVingerafdruk, maakEigenKopie, normalizeGoalCode,
} from './curriculum';
import type { Curriculum } from './curriculumTypes';
import { htmlNaarTekst, type Minimumdoel, type MinimumdoelenSetBestand } from './minimumdoelen';
import {
  NAGEKEKEN_DOOR_BRON, isAttitude, isOptioneel, leerplanUitSet, rubriekenVan, themaVanDoel, uniekeCodes, vindLeerplanVoorSet,
} from './minimumdoelenLeerplan';

// ── Een kleine, nagemaakte set ──────────────────────────────────────────────

const GELDIG = { type: 'Geldig', geldig_van_dt: '2024-09-01T00:00:00Z' };

/** Twee rubrieken die allebei een doel "1" hebben, een optioneel doel en een doel zonder id. */
function maakBestand(doelen?: Minimumdoel[]): MinimumdoelenSetBestand {
  const lijst: Minimumdoel[] = doelen ?? [
    {
      id: '100', code: '1', tekst: '<p>De leerlingen luisteren gericht &amp; beschrijven wat ze horen.</p>',
      extra: { titels: { '1': { titel: 'Muzikale opvoeding', nr: '1' }, '2': { titel: 'Waarnemen', nr: '1.1' } }, geldigheid: GELDIG, optioneel: false, attitude: 0 },
    },
    {
      id: '101', code: '1', tekst: '<p>De leerlingen kijken gericht.</p>',
      extra: { titels: { '1': { titel: 'Plastische opvoeding', nr: '2.' }, '2': { titel: 'Waarnemen', nr: '2.1' } }, geldigheid: GELDIG },
    },
    {
      id: '102', code: '2', tekst: '<ul><li>Eerste punt</li><li>Tweede punt</li></ul>',
      extra: { titels: { '1': { titel: 'Muzikale opvoeding', nr: '1' } }, optioneel: true, attitude: 1 },
    },
    { code: '3', tekst: 'Dit doel heeft geen vast nummer.' },
    { id: '104', code: '4', tekst: 'Een doel zonder rubriek.' },
  ];
  return {
    app: 'boosterz', kind: 'minimumdoelen', v: 1,
    set: {
      id: 'ODS_9001', naam: 'Secundair onderwijs 1ste graad A-stroom - Vak - Artistieke Opvoeding - Eindtermen',
      apiId: '9001', korteNaam: 'Artistieke Opvoeding', versie: '1.0', geldigheid: 'Geldig', geldigVan: '2024-09-01',
      graad: '1ste graad', stroom: 'A-stroom', sleutelcompetenties: [],
      bron: 'https://www.onderwijsdoelen.be/', api: 'https://onderwijs.api.vlaanderen.be/onderwijsdoelen',
      naamsvermelding: 'Bron: Vlaamse overheid, Departement Onderwijs en Vorming (onderwijsdoelen.be)',
      licentie: 'nog te bevestigen', opgehaald: '2026-10-05T12:20:49Z', aantal: lijst.length, sha256: 'a'.repeat(64),
    },
    doelen: lijst,
  };
}

// ── leerplanUitSet ──────────────────────────────────────────────────────────

describe('leerplanUitSet', () => {
  const { leerplan, waarschuwingen } = leerplanUitSet(maakBestand());

  it('zet de kop van het leerplan uit de set', () => {
    expect(leerplan.title).toBe('Artistieke Opvoeding · 1ste graad A-stroom');
    expect(leerplan.net).toBe('minimumdoelen');
    expect(leerplan.subject).toBe('Artistieke Opvoeding');
    expect(leerplan.level).toBe('1ste graad A-stroom');
    expect(leerplan.kind).toBe('leerplan');
    expect(leerplan.minimumdoelenSets).toEqual(['ODS_9001']);
    expect(leerplan.source).toBe(
      'Secundair onderwijs 1ste graad A-stroom - Vak - Artistieke Opvoeding - Eindtermen. '
        + 'Bron: Vlaamse overheid, Departement Onderwijs en Vorming (onderwijsdoelen.be) (opgehaald 5 oktober 2026)',
    );
  });

  it('vult de herkomst in, zonder velden die ontbreken', () => {
    const h = leerplan.herkomst!;
    expect(h.methode).toBe('officieel');
    expect(h.versie).toBe('1.0');
    expect(h.geldigVanaf).toBe('2024-09-01');
    expect(h.bronUrl).toBe('https://www.onderwijsdoelen.be/');
    expect(h.bronNaam).toBe('ODS_9001');
    expect(h.bronSha256).toBe('a'.repeat(64));
    expect(Math.abs(h.ingelezenOp - Date.now())).toBeLessThan(10_000);

    const kaal = maakBestand();
    delete kaal.set.versie;
    delete kaal.set.geldigVan;
    kaal.set.sha256 = '';
    const zonder = leerplanUitSet(kaal).leerplan.herkomst!;
    expect(Object.keys(zonder).sort()).toEqual(['bronNaam', 'bronUrl', 'ingelezenOp', 'methode']);
  });

  it('laat graad en stroom weg uit titel en niveau als ze ontbreken, en valt terug op de volledige naam', () => {
    const b = maakBestand();
    delete b.set.graad;
    delete b.set.stroom;
    delete b.set.korteNaam;
    const l = leerplanUitSet(b).leerplan;
    expect(l.title).toBe(b.set.naam);
    expect(l.subject).toBe(b.set.naam);
    expect(l.level).toBe('');
  });

  it('neemt de doelen over in de volgorde van het bestand, en slaat een doel zonder id over', () => {
    expect(leerplan.goals.map((g) => g.refs![0].id)).toEqual(['100', '101', '102', '104']);
    expect(waarschuwingen).toEqual(['1 doel zonder vast nummer is overgeslagen.']);
  });

  it('maakt van HTML gewone tekst, nooit HTML', () => {
    expect(leerplan.goals[0].text).toBe('De leerlingen luisteren gericht & beschrijven wat ze horen.');
    expect(leerplan.goals[2].text).toBe('• Eerste punt\n• Tweede punt');
    for (const g of leerplan.goals) expect(g.text).not.toMatch(/<[a-z/]/i);
    expect(leerplan.goals[2].text).toBe(htmlNaarTekst('<ul><li>Eerste punt</li><li>Tweede punt</li></ul>'));
  });

  it('voegt de rubrieken samen tot het thema en laat het weg zonder rubrieken', () => {
    expect(leerplan.goals[0].theme).toBe('Muzikale opvoeding › Waarnemen');
    expect(leerplan.goals[1].theme).toBe('Plastische opvoeding › Waarnemen');
    expect(leerplan.goals[2].theme).toBe('Muzikale opvoeding');
    expect(leerplan.goals[3].theme).toBeUndefined();
    expect('theme' in leerplan.goals[3]).toBe(false);
  });

  it('verwijst elk doel naar zichzelf in de set', () => {
    expect(leerplan.goals[0].refs).toEqual([{ set: 'ODS_9001', id: '100', code: '1' }]);
    expect(leerplan.goals[3].refs).toEqual([{ set: 'ODS_9001', id: '104', code: '4' }]);
  });

  it('zet "Optioneel" als toelichting bij een optioneel doel, en nergens anders', () => {
    expect(leerplan.goals.map((g) => g.note)).toEqual([undefined, undefined, 'Optioneel', undefined]);
  });

  it('zet het rubrieknummer voor een code die in de set meer dan eens voorkomt', () => {
    expect(leerplan.goals.map((g) => g.code)).toEqual(['1.1', '2.1', '2', '4']);
    const genormaliseerd = leerplan.goals.map((g) => normalizeGoalCode(g.code));
    expect(new Set(genormaliseerd).size).toBe(genormaliseerd.length);
  });

  it('is nagekeken, door de officiële bron, met een vingerafdruk die klopt', () => {
    expect(controleStatus(leerplan)).toBe('gecontroleerd');
    expect(leerplan.controle!.door).toBe(NAGEKEKEN_DOOR_BRON);
    expect(leerplan.controle!.samenvatting).toBe('Letterlijk overgenomen uit de officiële set ODS_9001 (4 doelen).');
    expect(leerplan.controle!.doelenSha256).toBe(doelenVingerafdruk(leerplan.goals));
    expect(typeof leerplan.controle!.op).toBe('number');
  });

  it('geeft elk doel een eigen id', () => {
    const ids = leerplan.goals.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((i) => i.length > 0)).toBe(true);
    expect(leerplanUitSet(maakBestand()).leerplan.id).not.toBe(leerplan.id);
  });

  it('slaat een doel zonder leesbare tekst over en meldt het', () => {
    const b = maakBestand([
      { id: '1', code: '1', tekst: 'Eerste.' },
      { id: '2', code: '2', tekst: '<p>&nbsp;</p>' },
      { code: '3', tekst: 'Zonder id.' },
      { code: '4', tekst: 'Ook zonder id.' },
    ]);
    const r = leerplanUitSet(b);
    expect(r.leerplan.goals).toHaveLength(1);
    expect(r.waarschuwingen).toEqual(['2 doelen zonder vast nummer zijn overgeslagen.', '1 doel zonder tekst is overgeslagen.']);
    expect(r.leerplan.controle!.samenvatting).toContain('(1 doel)');
  });

  it('geeft geen waarschuwing als alles is overgenomen', () => {
    const b = maakBestand([{ id: '1', code: '1.1', tekst: 'Eerste.' }, { id: '2', code: '1.2', tekst: 'Tweede.' }]);
    expect(leerplanUitSet(b).waarschuwingen).toEqual([]);
  });
});

// ── Hulpfuncties ────────────────────────────────────────────────────────────

describe('rubrieken en vlaggen', () => {
  it('rubriekenVan sorteert op sleutel (ook "10" na "2") en laat lege titels weg', () => {
    const doel: Minimumdoel = {
      id: '1', code: '1', tekst: 'x',
      extra: { titels: { '10': { titel: 'Tiende' }, '2': { titel: 'Tweede' }, '1': { titel: 'Eerste &amp; Beste' }, '3': { titel: '  ' } } },
    };
    expect(rubriekenVan(doel)).toEqual(['Eerste & Beste', 'Tweede', 'Tiende']);
    expect(themaVanDoel(doel)).toBe('Eerste & Beste › Tweede › Tiende');
  });

  it('is tolerant voor rubrieken die geen object zijn', () => {
    expect(themaVanDoel({ id: '1', code: '1', tekst: 'x', extra: { titels: [] } })).toBeUndefined();
    expect(themaVanDoel({ id: '1', code: '1', tekst: 'x', extra: { titels: { '1': 'Gewoon een tekst' } } })).toBe('Gewoon een tekst');
    expect(themaVanDoel({ id: '1', code: '1', tekst: 'x' })).toBeUndefined();
  });

  it('isAttitude en isOptioneel lezen de vlaggen van de API', () => {
    expect(isAttitude({ id: '1', code: '1', tekst: 'x', extra: { attitude: 1 } })).toBe(true);
    expect(isAttitude({ id: '1', code: '1', tekst: 'x', extra: { attitude: true } })).toBe(true);
    expect(isAttitude({ id: '1', code: '1', tekst: 'x', extra: { attitude: 0 } })).toBe(false);
    expect(isAttitude({ id: '1', code: '1', tekst: 'x' })).toBe(false);
    expect(isOptioneel({ id: '1', code: '1', tekst: 'x', extra: { optioneel: true } })).toBe(true);
    expect(isOptioneel({ id: '1', code: '1', tekst: 'x', extra: { optioneel: false } })).toBe(false);
  });
});

describe('uniekeCodes', () => {
  const doel = (id: string, code: string, titel1?: string, nr?: string): Minimumdoel => ({
    id, code, tekst: 't', ...(titel1 ? { extra: { titels: { '1': nr ? { titel: titel1, nr } : { titel: titel1 } } } } : {}),
  });

  it('laat een unieke code ongemoeid', () => {
    expect(uniekeCodes([doel('1', '09.01'), doel('2', '09.02')])).toEqual(['09.01', '09.02']);
  });

  it('gebruikt het volgnummer van de rubriek als er geen nummer is', () => {
    const codes = uniekeCodes([doel('1', '1', 'Getallen'), doel('2', '1', 'Meetkunde'), doel('3', '2', 'Getallen')]);
    // "2" is uniek en blijft; de twee keer "1" krijgen het volgnummer van hun rubriek.
    expect(codes).toEqual(['1.1', '2.1', '2']);
  });

  it('voegt -2 en -3 toe als de code nog dubbel is', () => {
    const codes = uniekeCodes([doel('1', '1', 'Getallen'), doel('2', '1', 'Getallen'), doel('3', '1', 'Getallen'), doel('4', '1')]);
    expect(codes).toEqual(['1.1', '1.1-2', '1.1-3', '1']);
  });

  it('laat een suffix nooit een bestaande code overnemen', () => {
    const codes = uniekeCodes([doel('1', '1'), doel('2', '1'), doel('3', '1-2')]);
    expect(codes).toEqual(['1', '1-3', '1-2']);
  });

  it('vergelijkt na normalisatie (hoofdletters en spaties)', () => {
    const codes = uniekeCodes([doel('1', 'ab 1'), doel('2', 'AB  1')]);
    expect(new Set(codes.map(normalizeGoalCode)).size).toBe(2);
  });

  it('geeft een lijst zonder dubbels voor een echte rubriekenset', () => {
    const bestand = maakBestand([
      { id: '1', code: '1', tekst: 'a', extra: { titels: { '1': { titel: 'Getallen' }, '2': { titel: 'Basis' } } } },
      { id: '2', code: '1', tekst: 'b', extra: { titels: { '1': { titel: 'Getallen' }, '2': { titel: 'Basis' } } } },
      { id: '3', code: '2', tekst: 'c', extra: { titels: { '1': { titel: 'Getallen' }, '2': { titel: 'Regel van drie' } } } },
      { id: '4', code: '2', tekst: 'd', extra: { titels: { '1': { titel: 'Meetkunde' } } } },
    ]);
    const codes = leerplanUitSet(bestand).leerplan.goals.map((g) => normalizeGoalCode(g.code));
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual(['1.1', '1.1-2', '1.2', '2.2']);
  });
});

// ── vindLeerplanVoorSet ─────────────────────────────────────────────────────

describe('vindLeerplanVoorSet', () => {
  const bestand = maakBestand();
  const { leerplan } = leerplanUitSet(bestand);
  const anders: Curriculum = { id: 'x', title: 'Eigen', net: 'eigen', subject: '', level: '', goals: [], createdAt: 1, updatedAt: 1 };

  it('vindt het leerplan van dezelfde set met dezelfde vingerafdruk', () => {
    expect(vindLeerplanVoorSet([anders, leerplan], bestand)).toBe(leerplan);
  });

  it('vindt niets bij een andere set, een nieuwere versie of een ander soort leerplan', () => {
    expect(vindLeerplanVoorSet([], bestand)).toBeUndefined();
    expect(vindLeerplanVoorSet([anders], bestand)).toBeUndefined();

    const andereSet = maakBestand();
    andereSet.set.id = 'ODS_9002';
    expect(vindLeerplanVoorSet([leerplan], andereSet)).toBeUndefined();

    const nieuwer = maakBestand();
    nieuwer.set.sha256 = 'b'.repeat(64);
    expect(vindLeerplanVoorSet([leerplan], nieuwer)).toBeUndefined();

    const uitPdf: Curriculum = { ...leerplan, herkomst: { ...leerplan.herkomst!, methode: 'pdf' } };
    expect(vindLeerplanVoorSet([uitPdf], bestand)).toBeUndefined();
  });

  it('slaat een eigen kopie en een gewijzigd leerplan over', () => {
    const kopie = maakEigenKopie(leerplan);
    expect(kopie.herkomst?.bronNaam).toBe('ODS_9001');
    expect(vindLeerplanVoorSet([kopie], bestand)).toBeUndefined();

    const gewijzigd: Curriculum = { ...leerplan, goals: leerplan.goals.map((g, i) => (i === 0 ? { ...g, text: 'Aangepast.' } : g)) };
    expect(vindLeerplanVoorSet([gewijzigd], bestand)).toBeUndefined();
    const gemarkeerd: Curriculum = { ...leerplan, controle: { ...leerplan.controle!, status: 'gewijzigd' } };
    expect(vindLeerplanVoorSet([gemarkeerd], bestand)).toBeUndefined();
    // Het ongewijzigde origineel wordt wel gevonden, ook als er een gewijzigde bij staat.
    expect(vindLeerplanVoorSet([gewijzigd, leerplan], bestand)).toBe(leerplan);
  });
});
