import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DoelBasis } from './doelBasis';
import { leesVraag, normaal, varianten, zoekDoelen, zoekDoelVan, type ZoekDoel, type Zoekwoorden } from './zoekBasis';
import { ZOEKWOORDEN } from './zoekwoorden';

const W: Zoekwoorden = ZOEKWOORDEN;
const LEEG: Zoekwoorden = { ...ZOEKWOORDEN, ook: {} };

let teller = 0;
function doel(o: Partial<ZoekDoel> & { doelzin: string }): ZoekDoel {
  teller++;
  return { id: String(90000 + teller), code: `3.1.${teller}`, setId: 'ODS_1', eind: 'L4', vak: 3, onderwerpNr: '3.1', onderwerp: 'Natuur', ...o };
}
const ids = (l: { doel: ZoekDoel }[]): string[] => l.map((t) => t.doel.id);

describe('normaal en varianten', () => {
  it('haalt accenten, onzichtbare tekens en leestekens weg', () => {
    expect(normaal('Wereldoriënta​tie, W&T!')).toBe('wereldorientatie w en t');
  });
  it('stamt meervoud, verkleinwoord en verdubbeling', () => {
    expect(varianten('magneten')).toEqual(expect.arrayContaining(['magneten', 'magnet', 'magneet']));
    expect(varianten('liedjes')).toEqual(expect.arrayContaining(['lied']));
    expect(varianten('zwemmen')).toEqual(expect.arrayContaining(['zwem']));
  });
  it('houdt een kort woord zelf altijd', () => {
    expect(varianten('ei')).toEqual(['ei']);
  });
});

describe('leesVraag: filters', () => {
  it('3de leerjaar is einde 4de leerjaar, 2de kleuterklas is K3', () => {
    expect(leesVraag('magneten 3de leerjaar', W).eind).toEqual(['L4']);
    expect(leesVraag('2de kleuterklas', W).eind).toEqual(['K3']);
    expect(leesVraag('kleuters kleuren', W).eind).toEqual(['K3']);
    expect(leesVraag('breuken einde 6de leerjaar', W).eind).toEqual(['L6']);
    expect(leesVraag('breuken 5de leerjaar', W).termen.map((t) => t.eigen)).toEqual(['breuken']);
  });
  it('W&T is vak 3 en muzische vorming vak 6, ook als de woordgroep langer is', () => {
    expect(leesVraag('W&T', W).vakken).toEqual([3]);
    expect(leesVraag('w en t licht', W).vakken).toEqual([3]);
    expect(leesVraag('muzische vorming', W).vakken).toEqual([6]);
    expect(leesVraag('muzische vorming dansen', W).termen.map((t) => t.eigen)).toEqual(['dansen']);
  });
  it('wo is geen vakwoord: oude en nieuwe vakken worden niet gekoppeld', () => {
    const v = leesVraag('WO planten', W);
    expect(v.vakken).toBeUndefined();
    expect(v.termen.map((t) => t.eigen)).toEqual(['wo', 'planten']);
  });
  it('lager is alleen een moment in "lager onderwijs" of als enig woord', () => {
    expect(leesVraag('lager', W).eind).toEqual(['L4', 'L6']);
    expect(leesVraag('lager onderwijs', W).eind).toEqual(['L4', 'L6']);
    const v = leesVraag('lager schaduw', W);
    expect(v.eind).toBeUndefined();
    expect(v.termen.map((t) => t.eigen)).toEqual(['lager', 'schaduw']);
  });
  it('stopwoorden vallen weg', () => {
    expect(leesVraag('de kinderen van het', W).termen).toEqual([]);
  });
  it('een vraag van 5 cijfers is een id en 3.5 of 3.5.4 een code', () => {
    expect(leesVraag('92767', W).id).toBe('92767');
    expect(leesVraag(' 3.5.4 ', W).code).toBe('3.5.4');
    expect(leesVraag('3.5', W).code).toBe('3.5');
    expect(leesVraag('12', W).id).toBeUndefined();
  });
  it('zet de tabel naast het woord, gestamd', () => {
    const t = leesVraag('schaduw', W).termen[0];
    expect(t.alts).toContain('schaduw');
    expect(t.tabel).toEqual(['lichtbron', 'lichtrichting', 'belichting', '=licht']);
    expect(leesVraag('schaduw', LEEG).termen[0].tabel).toEqual([]);
  });
});

describe('zoekDoelen: passen', () => {
  const weergeven = doel({ doelzin: 'De leerlingen kunnen een gegeven weergeven.' });
  const weer = doel({ doelzin: 'De leerlingen onderzoeken het weer.' });
  const toelichten = doel({ doelzin: 'De leerlingen kunnen iets toelichten.' });
  const licht = doel({ doelzin: 'De leerlingen kennen licht en schaduw.' });
  const persoonsvorm = doel({ doelzin: 'De leerlingen herkennen de persoonsvorm.' });
  const rubriek = doel({ doelzin: 'De leerlingen schrijven een tekst.', onderwerp: 'Persoonsvormende zinnen' });
  const alle = [weergeven, weer, toelichten, licht, persoonsvorm, rubriek];

  it('weer past niet op weergeven', () => {
    expect(ids(zoekDoelen(alle, leesVraag('weer', W)).treffers)).toEqual([weer.id]);
  });
  it('licht past niet op toelichten', () => {
    expect(ids(zoekDoelen(alle, leesVraag('licht', LEEG)).treffers)).toEqual([licht.id]);
  });
  it('persoonsvorm past niet op de rubriek Persoonsvormende', () => {
    expect(ids(zoekDoelen(alle, leesVraag('persoonsvorm', W)).treffers)).toEqual([persoonsvorm.id]);
  });
  it('een rubriek telt als heel woord', () => {
    const r = doel({ doelzin: 'De leerlingen tekenen.', onderwerp: 'Persoonsvorm', subthema: 'Werkwoord' });
    const u = zoekDoelen([r], leesVraag('werkwoord', W));
    expect(u.treffers[0].score).toBe(2);
  });
  it('een woordgroep past als woordgroep', () => {
    const d = doel({ doelzin: 'De leerlingen leren de maal tafels.' });
    const e = doel({ doelzin: 'De leerlingen tafels maal.' });
    const ook: Zoekwoorden = { ...W, ook: { vermenigvuldigen: ['maal tafels'] } };
    expect(ids(zoekDoelen([d, e], leesVraag('vermenigvuldigen', ook)).treffers)).toEqual([d.id]);
  });
  it('past niet op het laatste deel van een samenstelling', () => {
    const d = doel({ doelzin: 'De leerlingen spelen met een aardappel.' });
    expect(zoekDoelen([d], leesVraag('appel', W)).treffers).toEqual([]);
  });
});

describe('zoekDoelen: score, volgorde en groepen', () => {
  it('doelzin 3, rubriek 2, uitbreiding of woordenschat 1', () => {
    const a = doel({ doelzin: 'De leerlingen kennen magneten.' });
    const b = doel({ doelzin: 'Iets anders.', onderwerp: 'Magneten' });
    const c = doel({ doelzin: 'Iets anders.', uitbreiding: 'zoals magneten' });
    const d = doel({ doelzin: 'Iets anders.', woordenschat: 'magneet' });
    const u = zoekDoelen([d, c, b, a], leesVraag('magneten', W));
    expect(u.treffers.map((t) => t.score)).toEqual([3, 2, 1, 1]);
    expect(ids(u.treffers).slice(0, 2)).toEqual([a.id, b.id]);
  });
  it('doelen met alle woorden staan eerst; daarna het eigen eindmoment, de kortste doelzin en de code', () => {
    const lang = doel({ doelzin: 'De leerlingen onderzoeken een lange en uitgebreide beschrijving van water.', eind: 'L6', code: '3.1.1' });
    const kort = doel({ doelzin: 'Water onderzoeken.', eind: 'L6', code: '3.1.2' });
    const eigen = doel({ doelzin: 'Water onderzoeken, lang genoeg.', eind: 'L4', code: '3.1.9' });
    const u = zoekDoelen([lang, kort, eigen], leesVraag('water onderzoeken', W), { eigenEind: 'L4' });
    expect(ids(u.treffers)).toEqual([eigen.id, kort.id, lang.id]);
  });
  it('codes lopen numeriek: 3.1.4 voor 3.1.28', () => {
    const a = doel({ doelzin: 'Water.', code: '3.1.28' });
    const b = doel({ doelzin: 'Water.', code: '3.1.4' });
    expect(ids(zoekDoelen([a, b], leesVraag('water', W)).treffers)).toEqual([b.id, a.id]);
  });
  it('groepeert per vak en onderwerp, in de volgorde van de beste treffer', () => {
    const a = doel({ doelzin: 'Water.', onderwerpNr: '3.1', onderwerp: 'Natuur' });
    const b = doel({ doelzin: 'Een heel lang verhaal over water in de zee.', onderwerpNr: '4.2', onderwerp: 'Aarde', vak: 4 });
    const c = doel({ doelzin: 'Water ook.', onderwerpNr: '4.2', onderwerp: 'Aarde', vak: 4 });
    const u = zoekDoelen([b, a, c], leesVraag('water', W));
    expect(u.groepen.map((g) => g.sleutel)).toEqual(['3|3.1', '4|4.2']);
    expect(u.groepen[1].treffers).toHaveLength(2);
    expect(u.groepen[1].onderwerp).toBe('Aarde');
  });
  it('filtert op vak en moment', () => {
    const a = doel({ doelzin: 'Water.', vak: 3, eind: 'L4' });
    const b = doel({ doelzin: 'Water.', vak: 4, eind: 'L4' });
    const c = doel({ doelzin: 'Water.', vak: 3, eind: 'L6' });
    expect(ids(zoekDoelen([a, b, c], leesVraag('water w en t', W)).treffers)).toEqual([a.id, c.id]);
    expect(ids(zoekDoelen([a, b, c], leesVraag('water 3de leerjaar', W)).treffers)).toEqual([a.id, b.id]);
  });
});

describe('zoekDoelen: een deel van de woorden', () => {
  const a = doel({ doelzin: 'Water en lucht.' });
  const b = doel({ doelzin: 'Alleen water.' });
  const c = doel({ doelzin: 'Alleen lucht.' });
  it('met minder dan 5 treffers volgen de deeltreffers apart', () => {
    const u = zoekDoelen([a, b, c], leesVraag('water lucht', W));
    expect(ids(u.treffers)).toEqual([a.id]);
    expect(ids(u.deels).sort()).toEqual([b.id, c.id].sort());
    expect(u.versoepeld).toBe(true);
    expect(u.deelsGroepen.length).toBeGreaterThan(0);
  });
  it('met 0 treffers volstaat een deel van de woorden', () => {
    const u = zoekDoelen([b, c], leesVraag('water lucht', W));
    expect(u.treffers).toEqual([]);
    expect(u.deels).toHaveLength(2);
    expect(u.versoepeld).toBe(true);
  });
  it('met 5 of meer treffers komt er geen deellijst', () => {
    const vijf = [1, 2, 3, 4, 5].map(() => doel({ doelzin: 'Water en lucht.' }));
    const u = zoekDoelen([...vijf, b], leesVraag('water lucht', W));
    expect(u.treffers).toHaveLength(5);
    expect(u.deels).toEqual([]);
    expect(u.versoepeld).toBe(false);
  });
  it('een vraag met één woord is nooit versoepeld', () => {
    const u = zoekDoelen([a, b], leesVraag('wolken', W));
    expect(u.treffers).toEqual([]);
    expect(u.deels).toEqual([]);
    expect(u.versoepeld).toBe(false);
  });
  it('een tabelwoord dat alleen in een voorbeeld staat, telt bij meer woorden niet als gevonden en zakt', () => {
    const tabel: Zoekwoorden = { ...ZOEKWOORDEN, ook: { schaduw: ['=licht'] } };
    const zwak = doel({ doelzin: 'De kleuters kunnen gebeurtenissen beschrijven door gebruik te maken van begrippen.', uitbreiding: '(bv. ik steek nooit over bij een rood licht)' });
    const sterk = doel({ doelzin: 'De leerlingen kennen licht: rechtlijnige beweging.' });
    // zoals in de echte doelen: 'maken' staat in veel doelen, 'licht' in weinig
    const vulling = [1, 2, 3, 4, 5, 6].map((i) => doel({ doelzin: `De leerlingen kunnen een tekening ${i} maken.` }));
    const u = zoekDoelen([zwak, sterk, ...vulling], leesVraag('schaduw maken', tabel));
    expect(u.treffers).toEqual([]);
    expect(ids(u.deels).slice(0, 2)).toEqual([sterk.id, zwak.id]);
    // met één woord blijft het zoals het was: het voorbeeld telt mee
    expect(ids(zoekDoelen([zwak, sterk], leesVraag('schaduw', tabel)).treffers)).toEqual([sterk.id, zwak.id]);
  });
});

describe('zoekDoelen: bijzondere vragen', () => {
  const a = doel({ doelzin: 'A.', vak: 3, eind: 'L6', code: '3.5.4', id: '92767' });
  const b = doel({ doelzin: 'B.', vak: 3, eind: 'L4', code: '3.5.4', id: '92800' });
  const c = doel({ doelzin: 'C.', vak: 3, eind: 'L4', code: '3.5.10', id: '92801' });
  const d = doel({ doelzin: 'D.', vak: 4, eind: 'K3', code: '4.1.1', id: '92802' });
  const alle = [a, b, c, d];
  it('alleen een vak: alleenVak met alle doelen van het vak', () => {
    const u = zoekDoelen(alle, leesVraag('W&T', W));
    expect(u.alleenVak).toBe(true);
    expect(ids(u.treffers)).toEqual([b.id, c.id, a.id]);
  });
  it('alleen een moment: alleenMoment', () => {
    const u = zoekDoelen(alle, leesVraag('kleuters', W));
    expect(u.alleenMoment).toBe(true);
    expect(u.alleenVak).toBe(false);
    expect(ids(u.treffers)).toEqual([d.id]);
  });
  it('een vraag zonder bruikbaar woord geeft leeg', () => {
    for (const q of ['', '   ', 'de van het', 'kinderen']) {
      const u = zoekDoelen(alle, leesVraag(q, W));
      expect(u.leeg).toBe(true);
      expect(u.treffers).toEqual([]);
    }
  });
  it('een id vindt dat doel', () => {
    expect(ids(zoekDoelen(alle, leesVraag('92767', W)).treffers)).toEqual([a.id]);
    expect(zoekDoelen(alle, leesVraag('99999', W)).treffers).toEqual([]);
  });
  it('een code vindt die code op elk moment, en 3.5 het hele onderwerp', () => {
    expect(ids(zoekDoelen(alle, leesVraag('3.5.4', W)).treffers)).toEqual([b.id, a.id]);
    expect(ids(zoekDoelen(alle, leesVraag('3.5', W)).treffers)).toEqual([b.id, c.id, a.id]);
    expect(ids(zoekDoelen(alle, leesVraag('3.5.1', W)).treffers)).toEqual([]);
  });
});

describe('zoekDoelen: de tabel', () => {
  const licht = doel({ doelzin: 'De leerlingen kennen licht: rechtlijnige beweging.', id: '92767' });
  const schaduwZelf = doel({ doelzin: 'De leerlingen tekenen een schaduw.' });
  const toelichten = doel({ doelzin: 'De leerlingen kunnen iets toelichten.' });
  it('schaduw vindt het lichtdoel, maar licht past niet op toelichten', () => {
    const u = zoekDoelen([toelichten, schaduwZelf, licht], leesVraag('schaduw', W));
    expect(ids(u.treffers)).toEqual(expect.arrayContaining([licht.id, schaduwZelf.id]));
    expect(ids(u.treffers)).not.toContain(toelichten.id);
  });
  it('zonder tabel vindt schaduw het lichtdoel niet', () => {
    expect(ids(zoekDoelen([toelichten, schaduwZelf, licht], leesVraag('schaduw', LEEG)).treffers)).toEqual([schaduwZelf.id]);
  });
  it('geeft aan waarop meegezocht werd', () => {
    const u = zoekDoelen([licht], leesVraag('schaduw', W));
    expect(u.treffers[0].viaTabel).toEqual(['=licht']);
    expect(u.ookGezocht).toEqual(['licht']);
    expect(zoekDoelen([schaduwZelf], leesVraag('schaduw', W)).ookGezocht).toEqual([]);
  });
});

describe('zoekDoelVan', () => {
  const basis: DoelBasis = {
    setId: 'ODS_1',
    id: '1',
    code: '2.1.1',
    soort: 'bao',
    eind: 'L4',
    vak: 2,
    onderwerpNr: '2.1',
    onderwerp: 'Getallen',
    subthema: 'Breuken',
    doelzinHtml: '<p>De leerlingen kennen <math><mfrac><mn>1</mn><mn>10</mn></mfrac></math>.​</p>',
    uitbreidingHtml: '<ul><li>de helft</li><li>een kwart</li></ul>',
    woordenschatHtml: '<p>teller</p>',
  };
  it('maakt platte tekst uit de blokken, geen html', () => {
    const z = zoekDoelVan(basis);
    expect(z.doelzin).toContain('1/10');
    expect(z.doelzin).not.toMatch(/[<>]/);
    expect(z.uitbreiding).toContain('de helft');
    expect(z.woordenschat).toBe('teller');
    expect(z.subthema).toBe('Breuken');
    expect(z.setId).toBe('ODS_1');
  });
  it('zoekt in uitbreiding en woordenschat met score 1', () => {
    const z = zoekDoelVan(basis);
    expect(zoekDoelen([z], leesVraag('kwart', W)).treffers[0].score).toBe(1);
    expect(zoekDoelen([z], leesVraag('teller', W)).treffers[0].score).toBe(1);
    expect(zoekDoelen([z], leesVraag('breuken', W)).treffers[0].score).toBe(2);
  });
});

describe('zoekwoorden en toets', () => {
  it('de sleutels van ook zijn gestamd en de bronwoorden hebben minstens 4 letters zonder =', () => {
    for (const [sleutel, lijst] of Object.entries(ZOEKWOORDEN.ook)) {
      expect(varianten(sleutel)[0]).toBe(sleutel);
      expect(normaal(sleutel)).toBe(sleutel);
      for (const w of lijst) expect(w.replace(/^=/, '').length).toBeGreaterThanOrEqual(4);
    }
  });
  it('de lijsten zijn genormaliseerd en koppelen geen oude aan nieuwe vakken (H10)', () => {
    for (const s of [...ZOEKWOORDEN.stop, ...Object.keys(ZOEKWOORDEN.vak)]) expect(normaal(s)).toBe(s);
    for (const nr of Object.values(ZOEKWOORDEN.vak).flat()) expect(nr >= 1 && nr <= 10).toBe(true);
    for (const w of ['wo', 'wereldorientatie', 'wereldoriëntatie']) expect(ZOEKWOORDEN.vak[w]).toBeUndefined();
    for (const nrs of Object.values(ZOEKWOORDEN.vak)) expect(nrs).toHaveLength(1);
  });
  it('zoektoets.json is bevroren: sha256 4671c4c7…', () => {
    const bytes = readFileSync(new URL('./zoektoets.json', import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('4671c4c7c4ec40bf72c7b32362733afd59018d616197dae9fc20abed7327cb6f');
    const toets = JSON.parse(bytes.toString('utf8')) as { vragen: { q: string; goud: string[] }[] };
    expect(toets.vragen).toHaveLength(66);
  });
  it('geen regel in ook is een vraag uit de toets', () => {
    const toets = JSON.parse(readFileSync(new URL('./zoektoets.json', import.meta.url), 'utf8')) as { vragen: { q: string }[] };
    const vragen = new Set(toets.vragen.map((v) => normaal(v.q)));
    for (const sleutel of Object.keys(ZOEKWOORDEN.ook)) expect(vragen.has(sleutel)).toBe(false);
  });
});
