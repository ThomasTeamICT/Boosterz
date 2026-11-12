import { describe, expect, it } from 'vitest';
import { STANDAARD_AFSTANDEN, echteHoogtes } from '../onderzoek';
import {
  MAX_METING_TEKENS,
  beginOnderzoekLes,
  onderzoekBewijzen,
  onderzoekReducer,
  onderzoekScene,
  staatOp,
  type OnderzoekLesActie,
  type OnderzoekLesToestand,
} from './onderzoekLes';

const speel = (acties: OnderzoekLesActie[], begin: OnderzoekLesToestand = beginOnderzoekLes()) => acties.reduce(onderzoekReducer, begin);
const echt = echteHoogtes('boom');
const tekst = (cm: number, komma = false) => {
  const s = (Math.round((echt[cm] as number) * 2) / 2).toString();
  return komma ? s.replace('.', ',') : s;
};
const metingen = (komma = false): OnderzoekLesActie[] => STANDAARD_AFSTANDEN.map((cm) => ({ type: 'meting', cm, tekst: tekst(cm, komma) }));

describe('Onderzoek (lesmachine)', () => {
  it('begint op 30 cm met lege velden en zonder bewijs', () => {
    const t = beginOnderzoekLes();
    expect(t.afstandCm).toBe(30);
    expect(t.hypothese).toBeNull();
    expect(Object.values(t.metingen)).toEqual(['', '', '']);
    expect(onderzoekBewijzen(t)).toEqual([]);
    expect(onderzoekScene(t)).toEqual({ scene: 'onderzoek', afstandCm: 30 });
  });

  it('een hele oefening met alleen acties: hypothese, de lamp op 30, 15 en 10 cm, metingen met komma, conclusie, nakijken', () => {
    let t = speel([{ type: 'hypothese', hypothese: 'groter' }]);
    for (const cm of STANDAARD_AFSTANDEN) {
      t = speel([{ type: 'afstand', cm }], t);
      expect(staatOp(t, cm)).toBe(true);
      t = speel([{ type: 'meting', cm, tekst: tekst(cm, true) }], t);
    }
    t = speel([{ type: 'conclusie', conclusie: 'dichter-groter' }, { type: 'nakijken' }], t);
    expect(t.uitkomst?.stap).toBe('klaar');
    expect(t.uitkomst?.klaar).toBe(true);
    expect(onderzoekBewijzen(t)).toEqual([
      { id: '4-meten', juist: true, fout: null },
      { id: '4-besluit', juist: true, fout: null },
    ]);
  });

  it("een getypte '12,5' en '12.5' lezen allebei als 12,5 (de metingen worden aanvaard)", () => {
    for (const komma of [true, false]) {
      let t = speel([{ type: 'hypothese', hypothese: 'groter' }, ...metingen(komma), { type: 'conclusie', conclusie: 'dichter-groter' }, { type: 'nakijken' }]);
      expect(t.uitkomst?.klaar, String(komma)).toBe(true);
      t = speel([{ type: 'meting', cm: 10, tekst: `${tekst(10, komma)} cm` }, { type: 'nakijken' }], t);
      expect(t.uitkomst?.klaar).toBe(true);
    }
  });

  it('de pijltjes zetten de lamp op de volgende meetafstand, en blijven aan de rand staan', () => {
    let t = beginOnderzoekLes();
    t = speel([{ type: 'stap', richting: 'dichter' }], t);
    expect(t.afstandCm).toBe(15);
    t = speel([{ type: 'stap', richting: 'dichter' }], t);
    expect(t.afstandCm).toBe(10);
    expect(onderzoekReducer(t, { type: 'stap', richting: 'dichter' })).toBe(t);
    t = speel([{ type: 'stap', richting: 'verder' }, { type: 'stap', richting: 'verder' }], t);
    expect(t.afstandCm).toBe(30);
    expect(onderzoekReducer(t, { type: 'stap', richting: 'verder' })).toBe(t);
  });

  it('een afstand van de kijkdoos (slepen) wordt in het bereik gehouden; rommel doet niets', () => {
    const t = beginOnderzoekLes();
    expect(speel([{ type: 'afstand', cm: 17.3 }]).afstandCm).toBe(17.3);
    expect(speel([{ type: 'afstand', cm: 99 }]).afstandCm).toBe(30);
    expect(speel([{ type: 'afstand', cm: -4 }]).afstandCm).toBe(10);
    expect(onderzoekReducer(t, { type: 'afstand', cm: NaN })).toBe(t);
    expect(onderzoekReducer(t, { type: 'afstand', cm: 'x' as never })).toBe(t);
  });

  it('nakijken zonder hypothese vraagt eerst de hypothese, zonder bewijs', () => {
    const t = speel([...metingen(), { type: 'nakijken' }]);
    expect(t.uitkomst?.stap).toBe('hypothese');
    expect(onderzoekBewijzen(t)).toEqual([]);
  });

  it('nakijken zonder alle metingen noemt welke afstanden ontbreken, zonder bewijs', () => {
    const t = speel([{ type: 'hypothese', hypothese: 'kleiner' }, { type: 'meting', cm: 30, tekst: tekst(30) }, { type: 'nakijken' }]);
    expect(t.uitkomst?.stap).toBe('leeg');
    expect(t.uitkomst?.afstanden).toEqual([15, 10]);
    expect(t.uitkomst?.titel).toBe('Vul de meting bij 15 en 10 cm nog in.');
    expect(onderzoekBewijzen(t)).toEqual([]);
  });

  it('een lege meting telt als niet ingevuld; een onleesbare krijgt een eigen melding', () => {
    for (const slecht of ['', '   ']) {
      const t = speel([{ type: 'hypothese', hypothese: 'groter' }, ...metingen(), { type: 'meting', cm: 15, tekst: slecht }, { type: 'nakijken' }]);
      expect(t.uitkomst?.stap, JSON.stringify(slecht)).toBe('leeg');
      expect(t.uitkomst?.afstanden).toEqual([15]);
    }
    for (const slecht of ['abc', 'twaalf', '1,2,3', '12,,5', '-4', '12e1', '1 2']) {
      const t = speel([{ type: 'hypothese', hypothese: 'groter' }, ...metingen(), { type: 'meting', cm: 15, tekst: slecht }, { type: 'nakijken' }]);
      expect(t.uitkomst?.stap, JSON.stringify(slecht)).toBe('onleesbaar');
      expect(t.uitkomst?.titel).toBe('Typ bij 15 cm alleen een getal, zoals 12 of 12,5.');
      expect(t.uitkomst?.afstanden).toEqual([15]);
      expect(onderzoekBewijzen(t)).toEqual([]);
    }
  });

  it('een meting die er ver naast zit geeft het foutpatroon van de meetlat; daarna telt de nieuwe, juiste meting (het laatste telt)', () => {
    let t = speel([{ type: 'hypothese', hypothese: 'groter' }, ...metingen(), { type: 'meting', cm: 30, tekst: '3' }, { type: 'nakijken' }]);
    expect(t.uitkomst?.stap).toBe('fout');
    expect(onderzoekBewijzen(t)).toEqual([{ id: '4-meten', juist: false, fout: 'leest de meetlat niet nauwkeurig af' }]);
    t = speel([{ type: 'meting', cm: 30, tekst: tekst(30) }, { type: 'nakijken' }], t);
    expect(t.uitkomst?.stap).toBe('conclusie');
    expect(onderzoekBewijzen(t)).toEqual([{ id: '4-meten', juist: true, fout: null }]);
  });

  it('een conclusie die niet bij de metingen past: 4-besluit niet juist', () => {
    const t = speel([{ type: 'hypothese', hypothese: 'gelijk' }, ...metingen(), { type: 'conclusie', conclusie: 'dichter-kleiner' }, { type: 'nakijken' }]);
    expect(t.uitkomst?.stap).toBe('besluit-fout');
    expect(onderzoekBewijzen(t)).toEqual([
      { id: '4-meten', juist: true, fout: null },
      { id: '4-besluit', juist: false, fout: 'conclusie past niet bij de metingen' },
    ]);
  });

  it('een geldige meting wordt nooit afgekeurd, voor alle drie de voorwerpen', () => {
    for (const voorwerp of ['boom', 'huis', 'kind'] as const) {
      const e = echteHoogtes(voorwerp);
      let t = beginOnderzoekLes(voorwerp);
      t = speel([{ type: 'hypothese', hypothese: 'groter' }, { type: 'conclusie', conclusie: 'dichter-groter' }], t);
      for (const cm of STANDAARD_AFSTANDEN) t = speel([{ type: 'meting', cm, tekst: String(Math.round((e[cm] as number) * 2) / 2).replace('.', ',') }], t);
      t = speel([{ type: 'nakijken' }], t);
      expect(t.uitkomst?.klaar, voorwerp).toBe(true);
    }
  });

  it('dubbel tikken op nakijken geeft hetzelfde bewijs, en een wijziging wist de oude terugkoppeling maar niet het bewijs', () => {
    let t = speel([{ type: 'hypothese', hypothese: 'groter' }, ...metingen(), { type: 'conclusie', conclusie: 'dichter-groter' }, { type: 'nakijken' }, { type: 'nakijken' }]);
    expect(onderzoekBewijzen(t)).toHaveLength(2);
    expect(t.uitkomst?.klaar).toBe(true);
    t = speel([{ type: 'meting', cm: 30, tekst: '1' }], t);
    expect(t.uitkomst).toBeNull();
    expect(onderzoekBewijzen(t)).toHaveLength(2);
  });

  it('rommel doet niets: een onbekende afstand, hypothese of conclusie, en een te lange meting wordt ingekort', () => {
    const t = beginOnderzoekLes();
    expect(onderzoekReducer(t, { type: 'meting', cm: 20, tekst: '12' })).toBe(t);
    expect(onderzoekReducer(t, { type: 'meting', cm: 30, tekst: 12 as never })).toBe(t);
    expect(onderzoekReducer(t, { type: 'hypothese', hypothese: 'wie weet' as never })).toBe(t);
    expect(onderzoekReducer(t, { type: 'conclusie', conclusie: 'misschien' as never })).toBe(t);
    expect(speel([{ type: 'meting', cm: 30, tekst: '1'.repeat(50) }]).metingen[30]).toHaveLength(MAX_METING_TEKENS);
    // dezelfde tekst nog eens typen is dezelfde toestand
    const een = speel([{ type: 'meting', cm: 30, tekst: '11' }]);
    expect(onderzoekReducer(een, { type: 'meting', cm: 30, tekst: '11' })).toBe(een);
  });

  it("'opnieuw' begint weer met lege velden", () => {
    expect(speel([{ type: 'hypothese', hypothese: 'groter' }, ...metingen(), { type: 'opnieuw' }])).toEqual(beginOnderzoekLes());
  });
});
