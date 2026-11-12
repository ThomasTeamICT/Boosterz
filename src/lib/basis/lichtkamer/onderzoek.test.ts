import { describe, expect, it } from 'vitest';
import {
  STANDAARD_AFSTANDEN,
  STANDAARD_TOLERANTIE_CM,
  STREEP_CM,
  echteHoogtes,
  kijkOnderzoekNa,
  tolerantieVoor,
  type OnderzoekInvoer,
} from './onderzoek';
import { VOORWERPEN, type Voorwerp } from './schaduw';

/** Alle aflezingen op de streepjes van `stap` cm die binnen `tol` van `echt` liggen. */
function aflezingen(echt: number, tol: number, stap: number): number[] {
  const uit: number[] = [];
  const eerste = Math.floor((echt - tol) / stap) * stap;
  for (let v = eerste; v <= echt + tol + 1e-9; v += stap) {
    const w = Math.round(v / stap) * stap;
    if (w >= 0 && Math.abs(w - echt) <= tol) uit.push(Number(w.toFixed(6)));
  }
  return uit;
}

/** Het nakijken van het prototype, voor de vergelijking: tolerantie 0,75 en een strikt stijgende rij. */
function oudAfgekeurd(echt: Record<number, number>, m: Record<number, number>, afstanden: number[]): boolean {
  if (afstanden.some((cm) => Math.abs((m[cm] as number) - (echt[cm] as number)) > 0.75)) return true;
  const s = [...afstanden].sort((a, b) => a - b);
  return !s.every((cm, i) => i === 0 || (m[s[i - 1] as number] as number) > (m[cm] as number));
}

function alleCombinaties(lijsten: number[][]): number[][] {
  return lijsten.reduce<number[][]>((acc, l) => acc.flatMap((a) => l.map((x) => [...a, x])), [[]]);
}

function metInvoer(v: Voorwerp, afstanden: readonly number[], waarden: number[], extra: Partial<OnderzoekInvoer> = {}): OnderzoekInvoer {
  return {
    voorwerp: v,
    metingen: Object.fromEntries(afstanden.map((cm, i) => [cm, String(waarden[i])])),
    hypothese: 'groter',
    conclusie: 'dichter-groter',
    ...extra,
  };
}

describe('de afstanden', () => {
  it('standaard 30, 15 en 10 cm', () => {
    expect(STANDAARD_AFSTANDEN).toEqual([30, 15, 10]);
    expect(STANDAARD_TOLERANTIE_CM).toBe(0.75);
    expect(STREEP_CM).toBe(0.5);
  });

  it('echte hoogtes bij 30, 15 en 10 cm voor het boompje', () => {
    const e = echteHoogtes('boom');
    expect(e[30]).toBeCloseTo(35 / 3, 9);
    expect(e[15]).toBeCloseTo(40 / 3, 9);
    expect(e[10]).toBeCloseTo(15, 9);
  });

  it('de tolerantie blijft 0,75 cm bij de standaard afstanden en elk voorwerp', () => {
    for (const v of VOORWERPEN) expect(tolerantieVoor(v)).toBe(0.75);
  });

  it('de tolerantie krimpt als de afstanden te dicht bij elkaar liggen', () => {
    const t = tolerantieVoor('boom', { afstanden: [30, 28, 26] });
    expect(t).toBeLessThan(0.75);
    const e = echteHoogtes('boom', { afstanden: [30, 28, 26] });
    expect(2 * t).toBeLessThan((e[26] as number) - (e[28] as number));
  });

  it('weigert onzinnige afstanden', () => {
    expect(() => echteHoogtes('boom', { afstanden: [30] })).toThrow(RangeError);
    expect(() => echteHoogtes('boom', { afstanden: [30, 30] })).toThrow(RangeError);
    expect(() => echteHoogtes('boom', { afstanden: [30, 0] })).toThrow(RangeError);
    expect(() => echteHoogtes('boom', { afstanden: [30, -5] })).toThrow(RangeError);
    // Een lamp even hoog als de top of hoger geeft geen bruikbare hoogtes (en anders een negatieve tolerantie).
    expect(() => echteHoogtes('boom', { lampHoogte: 1.0 })).toThrow(RangeError);
    expect(() => echteHoogtes('boom', { lampHoogte: 1.2 })).toThrow(RangeError);
    expect(() => echteHoogtes('kind', { lampHoogte: 0.98 })).toThrow(RangeError);
  });
});

describe('het prototype keurde geldige aflezingen af bij 30, 20 en 10 cm', () => {
  const oud = [30, 20, 10];
  const aantal = (v: Voorwerp) => {
    const e = echteHoogtes(v, { afstanden: oud });
    const combos = alleCombinaties(oud.map((cm) => aflezingen(e[cm] as number, 0.75, 0.5)));
    return { totaal: combos.length, af: combos.filter((c) => oudAfgekeurd(e, Object.fromEntries(oud.map((cm, i) => [cm, c[i] as number])), oud)).length };
  };
  it('3 van de 27 bij het boompje', () => expect(aantal('boom')).toEqual({ totaal: 27, af: 3 }));
  it('9 van de 27 bij het kartonnen kind', () => expect(aantal('kind')).toEqual({ totaal: 27, af: 9 }));

  it('met tolerantieVast doet kijkOnderzoekNa hetzelfde als het prototype, aflezing voor aflezing', () => {
    for (const v of VOORWERPEN) {
      const e = echteHoogtes(v, { afstanden: oud });
      for (const c of alleCombinaties(oud.map((cm) => aflezingen(e[cm] as number, 0.75, 0.5)))) {
        const m = Object.fromEntries(oud.map((cm, i) => [cm, c[i] as number]));
        const u = kijkOnderzoekNa(metInvoer(v, oud, c), { afstanden: oud, tolerantieVast: true });
        expect(u.stap !== 'klaar', `${v} ${c.join('/')}`).toBe(oudAfgekeurd(e, m, oud));
      }
    }
  });

  it('zonder tolerantieVast (de standaard) keurt dezelfde code ze niet meer af', () => {
    for (const v of VOORWERPEN) {
      const e = echteHoogtes(v, { afstanden: oud });
      const tol = tolerantieVoor(v, { afstanden: oud });
      expect(tol).toBeLessThan(0.75);
      for (const c of alleCombinaties(oud.map((cm) => aflezingen(e[cm] as number, tol, 0.5)))) expect(kijkOnderzoekNa(metInvoer(v, oud, c), { afstanden: oud }).stap).toBe('klaar');
    }
  });
});

describe('bij 30, 15 en 10 cm wordt geen enkele geldige aflezing afgekeurd', () => {
  const lampen = [0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2];
  for (const v of VOORWERPEN) {
    for (const lampHoogte of lampen) {
      for (const stap of [0.5, 0.1]) {
        it(`${v}, lamp op ${lampHoogte * 10} cm, aflezing per ${stap} cm`, () => {
          const opties = { lampHoogte };
          const e = echteHoogtes(v, opties);
          const tol = tolerantieVoor(v, opties);
          // op de standaard lamphoogte verandert de tolerantie niet: precies het prototype
          if (lampHoogte === 0.5) expect(tol).toBe(0.75);
          const combos = alleCombinaties(STANDAARD_AFSTANDEN.map((cm) => aflezingen(e[cm] as number, tol, stap)));
          expect(combos.length).toBeGreaterThan(0);
          for (const c of combos) {
            const u = kijkOnderzoekNa(metInvoer(v, STANDAARD_AFSTANDEN, c), opties);
            expect(u.stap, `${v} ${lampHoogte} ${c.join('/')}`).toBe('klaar');
          }
        });
      }
    }
  }

  it('ook bij 30, 15 en 10 cm met de tolerantie van het prototype (0,75) wordt niets afgekeurd bij de standaard lamp', () => {
    for (const v of VOORWERPEN) {
      const e = echteHoogtes(v);
      const combos = alleCombinaties(STANDAARD_AFSTANDEN.map((cm) => aflezingen(e[cm] as number, 0.75, 0.5)));
      expect(combos).toHaveLength(27);
      expect(combos.filter((c) => oudAfgekeurd(e, Object.fromEntries(STANDAARD_AFSTANDEN.map((cm, i) => [cm, c[i] as number])), [...STANDAARD_AFSTANDEN]))).toHaveLength(0);
    }
  });

  it('ook bij afstanden die het prototype afkeurde, wordt niets afgekeurd als de tolerantie meegeeft', () => {
    for (const v of VOORWERPEN) {
      const afstanden = [30, 20, 10];
      const e = echteHoogtes(v, { afstanden });
      const tol = tolerantieVoor(v, { afstanden });
      for (const c of alleCombinaties(afstanden.map((cm) => aflezingen(e[cm] as number, tol, 0.5))))
        expect(kijkOnderzoekNa(metInvoer(v, afstanden, c), { afstanden }).stap).toBe('klaar');
    }
  });
});

describe('juiste en foute metingen', () => {
  const e = echteHoogtes('boom');
  const juist = [11.5, 13.5, 15];

  it('komma en punt, in elke vorm, geven hetzelfde nakijken (nooit 125)', () => {
    const komma = metInvoer('boom', STANDAARD_AFSTANDEN, [0, 0, 0], { metingen: { 30: '11,5', 15: '13,5', 10: '15' } });
    const punt = metInvoer('boom', STANDAARD_AFSTANDEN, [0, 0, 0], { metingen: { 30: '11.5', 15: '13.5', 10: '15.0' } });
    expect(kijkOnderzoekNa(komma).stap).toBe('klaar');
    expect(kijkOnderzoekNa(punt)).toEqual(kijkOnderzoekNa(komma));
  });

  it('12,5 bij 15 cm voor het kartonnen kind (echt 13) is binnen de tolerantie; 125 niet', () => {
    expect(kijkOnderzoekNa({ voorwerp: 'kind', metingen: { 30: '11,5', 15: '12,5', 10: '14,5' }, hypothese: 'groter', conclusie: 'dichter-groter' }).stap).toBe('klaar');
    const u = kijkOnderzoekNa({ voorwerp: 'kind', metingen: { 30: '11,5', 15: '125', 10: '14,5' }, hypothese: 'groter', conclusie: 'dichter-groter' });
    expect(u.stap).toBe('fout');
    expect(u.afstanden).toEqual([15]);
  });

  it('eerst de hypothese, zonder bewijs', () => {
    const u = kijkOnderzoekNa(metInvoer('boom', STANDAARD_AFSTANDEN, juist, { hypothese: null }));
    expect(u).toMatchObject({ stap: 'hypothese', soort: 'warn', titel: 'Kies eerst je hypothese.', bewijzen: [] });
  });

  it('een lege of onleesbare meting: zonder bewijs, met de afstanden', () => {
    const u = kijkOnderzoekNa({ voorwerp: 'boom', metingen: { 30: '11,5', 15: '', 10: 'veel' }, hypothese: 'groter', conclusie: null });
    expect(u).toMatchObject({ stap: 'leeg', titel: 'Vul de meting bij 15 cm nog in.', afstanden: [15], bewijzen: [] });
    const w = kijkOnderzoekNa({ voorwerp: 'boom', metingen: { 30: '', 15: '   ', 10: undefined }, hypothese: 'groter', conclusie: null });
    expect(w).toMatchObject({ stap: 'leeg', titel: 'Vul de meting bij 30 en 15 en 10 cm nog in.', afstanden: [30, 15, 10] });
    const v = kijkOnderzoekNa({ voorwerp: 'boom', metingen: { 30: '11,5', 15: '13,5' }, hypothese: 'groter', conclusie: null });
    expect(v.afstanden).toEqual([10]);
  });

  it('een onleesbare meting (iets getypt, maar geen getal) krijgt een eigen melding, zonder bewijs', () => {
    for (const x of ['-4', '12,,5', 'twaalf', '1,2,3', '12e1']) {
      const u = kijkOnderzoekNa({ voorwerp: 'boom', metingen: { 30: x, 15: '13,5', 10: '15' }, hypothese: 'groter', conclusie: null });
      expect(u, x).toMatchObject({ stap: 'onleesbaar', soort: 'warn', titel: 'Typ bij 30 cm alleen een getal, zoals 12 of 12,5.', afstanden: [30], bewijzen: [], klaar: false });
    }
    const twee = kijkOnderzoekNa({ voorwerp: 'boom', metingen: { 30: 'a', 15: 'b', 10: '15' }, hypothese: 'groter', conclusie: null });
    expect(twee.titel).toBe('Typ bij 30 en 15 cm alleen een getal, zoals 12 of 12,5.');
    // leeg gaat voor onleesbaar: eerst wat nog ontbreekt
    const mix = kijkOnderzoekNa({ voorwerp: 'boom', metingen: { 30: 'a', 15: '', 10: '15' }, hypothese: 'groter', conclusie: null });
    expect(mix.stap).toBe('leeg');
    expect(mix.afstanden).toEqual([15]);
  });

  it('een foute meting: bewijs 4-meten fout, met de afstanden', () => {
    const u = kijkOnderzoekNa(metInvoer('boom', STANDAARD_AFSTANDEN, [11.5, 16, 15]));
    expect(u).toMatchObject({
      stap: 'fout',
      titel: 'Kijk de meting bij 15 cm nog eens na.',
      afstanden: [15],
      bewijzen: [{ id: '4-meten', juist: false, fout: 'leest de meetlat niet nauwkeurig af' }],
    });
    expect(u.klaar).toBe(false);
  });

  it('exact op de rand van de tolerantie wordt nog aanvaard, net erover niet', () => {
    expect(kijkOnderzoekNa(metInvoer('boom', STANDAARD_AFSTANDEN, [(e[30] as number) - 0.75, e[15] as number, e[10] as number])).stap).toBe('klaar');
    expect(kijkOnderzoekNa(metInvoer('boom', STANDAARD_AFSTANDEN, [(e[30] as number) - 0.76, e[15] as number, e[10] as number])).stap).toBe('fout');
  });

  it('juiste metingen zonder conclusie: bewijs 4-meten juist', () => {
    const u = kijkOnderzoekNa(metInvoer('boom', STANDAARD_AFSTANDEN, juist, { conclusie: null }));
    expect(u).toMatchObject({ stap: 'conclusie', soort: 'info', titel: 'Je metingen kloppen. Kies nu je conclusie.', klaar: false });
    expect(u.bewijzen).toEqual([{ id: '4-meten', juist: true, fout: null }]);
  });

  it('een foute conclusie', () => {
    for (const concl of ['dichter-kleiner', 'geen'] as const) {
      const u = kijkOnderzoekNa(metInvoer('boom', STANDAARD_AFSTANDEN, juist, { conclusie: concl }));
      expect(u).toMatchObject({ stap: 'besluit-fout', soort: 'warn', titel: 'Kijk naar je metingen.', klaar: false });
      expect(u.uitleg).toBe('Bij 10 cm meet je de grootste schaduw. Welke conclusie past daarbij?');
      expect(u.bewijzen).toEqual([
        { id: '4-meten', juist: true, fout: null },
        { id: '4-besluit', juist: false, fout: 'conclusie past niet bij de metingen' },
      ]);
    }
  });

  it('een juiste conclusie: het onderzoek is af, met een zin over de hypothese', () => {
    const goed = kijkOnderzoekNa(metInvoer('boom', STANDAARD_AFSTANDEN, juist));
    expect(goed).toMatchObject({ stap: 'klaar', soort: 'ok', titel: 'Je onderzoek is af.', klaar: true });
    expect(goed.uitleg).toBe('Je metingen tonen het: bij 10 cm is de schaduw het grootst. Je hypothese klopte.');
    expect(goed.bewijzen).toEqual([
      { id: '4-meten', juist: true, fout: null },
      { id: '4-besluit', juist: true, fout: null },
    ]);
    const mis = kijkOnderzoekNa(metInvoer('boom', STANDAARD_AFSTANDEN, juist, { hypothese: 'kleiner' }));
    expect(mis.uitleg).toContain('Je hypothese klopte niet, en dat is ook een uitkomst.');
  });

  it('metingen die niet bij elkaar passen, ook al liggen ze elk binnen de tolerantie (afstanden dicht bij elkaar)', () => {
    const afstanden = [30, 28, 26];
    const e2 = echteHoogtes('boom', { afstanden });
    // met een ruime tolerantie van de leerkracht: alleen de omgekeerde volgorde komt in 'volgorde' terecht
    const u = kijkOnderzoekNa(
      { voorwerp: 'boom', metingen: { 30: String((e2[30] as number) + 0.3), 28: String(e2[28] as number), 26: String((e2[26] as number) - 0.3) }, hypothese: 'groter', conclusie: 'dichter-groter' },
      { afstanden, tolerantieCm: 5, tolerantieVast: true },
    );
    expect(u.stap).toBe('volgorde');
    expect(u.bewijzen).toEqual([{ id: '4-meten', juist: false, fout: 'metingen passen niet bij elkaar' }]);
  });

  it('metingen buiten de meetlat of negatief worden afgekeurd, nooit aanvaard', () => {
    for (const x of ['-12', '125', '1000', '0']) {
      const u = kijkOnderzoekNa({ voorwerp: 'boom', metingen: { 30: x, 15: '13,5', 10: '15' }, hypothese: 'groter', conclusie: 'dichter-groter' });
      expect(['fout', 'leeg', 'onleesbaar']).toContain(u.stap);
      expect(u.klaar).toBe(false);
    }
  });

  it('werkt met andere afstanden en noemt het dichtstbijzijnde punt in de zinnen', () => {
    const afstanden = [30, 20, 5];
    const e3 = echteHoogtes('huis', { afstanden });
    const u = kijkOnderzoekNa(metInvoer('huis', afstanden, afstanden.map((cm) => Math.round((e3[cm] as number) * 2) / 2)), { afstanden });
    expect(u.stap).toBe('klaar');
    expect(u.uitleg).toContain('bij 5 cm');
  });
});
