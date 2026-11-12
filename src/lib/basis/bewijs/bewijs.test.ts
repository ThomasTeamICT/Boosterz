// Tests van de bewijsrecords, het samenvoegen, de regels per soort en de status per doel (bouwpakket 3b-3d, LK-2).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeCode } from '../../utils';
import { goDoel, minimumdoel, type DoelSleutel } from './doelSleutel';
import {
  BEWIJS_STATUSSEN,
  CODE_ALFABET,
  MAX_TIJD,
  MIN_TIJD,
  STATUS_TEKST,
  bewijsVan,
  foutpatroonVan,
  geldendeBewijzen,
  kindVan,
  ontdubbelSleutel,
  redenOngeldigRecord,
  samenvoegen,
  saneerRecord,
  statusVoor,
  tijdOpDeMinuut,
  type BewijsRecord,
  type BewijsStatus,
} from './bewijs';
import { maakBewijsIndex, type BewijsDef, type PakketManifest } from './pakket';

// ─── Vaste testgegevens ──────────────────────────────────────────────────────

const A = minimumdoel('ODS_3408', '92767');
const B = minimumdoel('ODS_3408', '92775');
const G = goDoel('WT.008');

const def = (id: string, soort: BewijsDef['soort'], doelen: DoelSleutel[], fouten: string[] = []): BewijsDef => ({
  id,
  soort,
  doelen,
  foutpatronen: fouten.map((f) => ({ id: f, tekst: `tekst ${f}` })),
});

const TST_V1 = [def('c1', 'check', [A], ['f1', 'f2']), def('c2', 'check', [A]), def('o1', 'oefening', [A, B], ['g1']), def('ob', 'observatie', [B])];
const TST: PakketManifest = {
  pakket: 'TST',
  versies: [
    { versie: 1, bewijzen: TST_V1 },
    { versie: 2, bewijzen: [...TST_V1, def('o2', 'oefening', [G])] },
  ],
};
const index = maakBewijsIndex([TST]);

/** Een minuut in 2026. */
const T0 = 29_500_000;
const TOESTEL_X = { soort: 'toestel', toestelId: 'XXXX', toestelnummer: 2 } as const;
const TOESTEL_Y = { soort: 'toestel', toestelId: 'YYYY', toestelnummer: 3 } as const;

const rec = (o: Partial<BewijsRecord> = {}): BewijsRecord => ({
  kindcode: 'AB',
  pakket: 'TST',
  versie: 1,
  bewijsnummer: 0,
  juist: true,
  tijd: T0,
  bron: TOESTEL_X,
  ...o,
});

/** Alle volgordes van een lijst. */
function volgordes<T>(lijst: readonly T[]): T[][] {
  if (lijst.length <= 1) return [lijst.slice()];
  return lijst.flatMap((x, i) => volgordes([...lijst.slice(0, i), ...lijst.slice(i + 1)]).map((rest) => [x, ...rest]));
}

/** Een vaste rij toevalsgetallen (mulberry32), zodat elke testrun dezelfde gevallen ziet. */
function toeval(zaad: number): () => number {
  let a = zaad >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function geschud<T>(lijst: readonly T[], r: () => number): T[] {
  const a = lijst.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DOELEN = [A, B, G];

function statussen(records: readonly BewijsRecord[]): Record<string, BewijsStatus> {
  const g = geldendeBewijzen(records, index);
  const uit: Record<string, BewijsStatus> = {};
  for (const kind of ['AB', 'AC', 'AD', 'AE']) for (const d of DOELEN) uit[`${kind} ${d.soort === 'go' ? d.code : d.id}`] = statusVoor(d, g.perKind.get(kind), index);
  return uit;
}

// ─── Records ─────────────────────────────────────────────────────────────────

describe('het record', () => {
  it('het alfabet van de kindcode is dat van makeCode: 32 tekens, zonder 0, O, 1 en I', () => {
    expect(new Set(CODE_ALFABET).size).toBe(32);
    expect(CODE_ALFABET).not.toMatch(/[0O1I]/);
    const gezien = new Set<string>();
    for (let i = 0; i < 4000; i++) for (const t of makeCode()) gezien.add(t);
    expect([...gezien].sort().join('')).toBe([...CODE_ALFABET].sort().join(''));
  });

  it('de grenzen van de tijd zijn 1 januari 2025 en 1 januari 2100, in minuten', () => {
    expect(MIN_TIJD).toBe(Date.UTC(2025, 0, 1) / 60_000);
    expect(MAX_TIJD).toBe(Date.UTC(2100, 0, 1) / 60_000);
    expect(tijdOpDeMinuut(Date.UTC(2026, 10, 12, 10, 42, 59, 999))).toBe(Date.UTC(2026, 10, 12, 10, 42) / 60_000);
  });

  it('saneert elke soort bron', () => {
    for (const bron of [TOESTEL_X, { soort: 'eigen', toestelId: 'ABCD' }, { soort: 'eigen', toestelId: 'ABCD', toestelnummer: 1 }, { soort: 'bord' }, { soort: 'observatie' }] as const) {
      expect(saneerRecord(rec({ bron }))).toEqual(rec({ bron }));
    }
  });

  it('bewaart nooit een naam: onbekende velden vallen weg, en de velden staan in een vaste volgorde', () => {
    const ruw = { naam: 'Amira', studentName: 'Amira', ...rec({ juist: false, foutpatroon: 1, duoMet: 'AC', naar: 'AD', naarTijd: T0 + 5 }), bron: { ...TOESTEL_X, naam: 'Toestel van Bram' } };
    const r = saneerRecord(ruw);
    expect(r).not.toBeNull();
    expect(JSON.stringify(r)).not.toContain('Amira');
    expect(JSON.stringify(r)).not.toContain('Bram');
    expect(Object.keys(r as object)).toEqual(['kindcode', 'pakket', 'versie', 'bewijsnummer', 'juist', 'foutpatroon', 'tijd', 'bron', 'duoMet', 'naar', 'naarTijd']);
    expect(Object.keys((r as BewijsRecord).bron)).toEqual(['soort', 'toestelId', 'toestelnummer']);
  });

  it.each([
    ['geen object', null, 'geen object'],
    ['een kindcode van 1 teken', rec({ kindcode: 'A' }), 'kindcode'],
    ['een kindcode met een O', rec({ kindcode: 'AO' }), 'kindcode'],
    ['een kindcode in kleine letters', rec({ kindcode: 'ab' }), 'kindcode'],
    ['een naam als kindcode', rec({ kindcode: 'Amira' }), 'kindcode'],
    ['een pakketcode van 4 tekens', rec({ pakket: 'TSTT' }), 'pakketcode'],
    ['versie 0', rec({ versie: 0 }), 'versie'],
    ['versie 33', rec({ versie: 33 }), 'versie'],
    ['een halve versie', rec({ versie: 1.5 }), 'versie'],
    ['bewijsnummer 32', rec({ bewijsnummer: 32 }), 'bewijsnummer'],
    ['een negatief bewijsnummer', rec({ bewijsnummer: -1 }), 'bewijsnummer'],
    ['juist als tekst', { ...rec(), juist: 'ja' }, 'juist'],
    ['een juist record met een foutpatroon', rec({ juist: true, foutpatroon: 0 }), 'juist record'],
    ['foutpatroon 8', rec({ juist: false, foutpatroon: 8 }), 'foutpatroon'],
    ['de tijd in milliseconden', rec({ tijd: Date.UTC(2026, 10, 12) }), 'tijd'],
    ['de tijd in seconden', rec({ tijd: Date.UTC(2026, 10, 12) / 1000 }), 'tijd'],
    ['een tijd met seconden erin', rec({ tijd: T0 + 0.5 }), 'tijd'],
    ['een tijd vóór 2025', rec({ tijd: MIN_TIJD - 1 }), 'tijd'],
    ['een tijd als tekst', { ...rec(), tijd: String(T0) }, 'tijd'],
    ['geen bron', { ...rec(), bron: undefined }, 'bron'],
    ['een onbekende bron', { ...rec(), bron: { soort: 'gsm' } }, 'onbekende bron'],
    ['een gedeeld toestel zonder nummer', { ...rec(), bron: { soort: 'toestel', toestelId: 'XXXX' } }, 'toestelnummer'],
    ['een gedeeld toestel met nummer 0', { ...rec(), bron: { soort: 'toestel', toestelId: 'XXXX', toestelnummer: 0 } }, 'toestelnummer'],
    ['een toestel-id van 3 tekens', { ...rec(), bron: { soort: 'eigen', toestelId: 'XXX' } }, 'toestel-id'],
    ['een eigen toestel met nummer 99', { ...rec(), bron: { soort: 'eigen', toestelId: 'ABCD', toestelnummer: 99 } }, 'toestelnummer'],
    ['een bord met een toestel', { ...rec(), bron: { soort: 'bord', toestelId: 'XXXX' } }, 'geen toestel'],
    ['een duo met zichzelf', rec({ duoMet: 'AB' }), 'zichzelf'],
    ['een duo met een naam', rec({ duoMet: 'Bram' }), 'duoMet'],
    ['naar zonder naarTijd', rec({ naar: 'AC' }), 'samen'],
    ['naarTijd zonder naar', rec({ naarTijd: T0 }), 'samen'],
    ['naar met een naam', rec({ naar: 'Bram', naarTijd: T0 }), 'naar'],
  ])('weigert %s', (_naam, x, reden) => {
    expect(redenOngeldigRecord(x)).toContain(reden);
    expect(saneerRecord(x)).toBeNull();
  });
});

// ─── Samenvoegen ─────────────────────────────────────────────────────────────

describe('samenvoegen', () => {
  it('de ontdubbelsleutel: kindcode + pakket@versie + bewijs + tijd + toestel + uitkomst', () => {
    expect(ontdubbelSleutel(rec())).toBe(`AB|TST@1|0|${T0}|TXXXX|J`);
    expect(ontdubbelSleutel(rec({ juist: false, foutpatroon: 1, bron: { soort: 'eigen', toestelId: 'ABCD' } }))).toBe(`AB|TST@1|0|${T0}|EABCD|F1`);
    expect(ontdubbelSleutel(rec({ juist: false, bron: { soort: 'bord' } }))).toBe(`AB|TST@1|0|${T0}|B|N`);
    expect(ontdubbelSleutel(rec({ bron: { soort: 'observatie' } }))).toBe(`AB|TST@1|0|${T0}|O|J`);
    // geen deel van de sleutel: het maatje, een verplaatsing en het toestelnummer
    expect(ontdubbelSleutel(rec({ duoMet: 'AC', naar: 'AD', naarTijd: T0 + 1 }))).toBe(ontdubbelSleutel(rec()));
  });

  it('dezelfde code twee keer geeft één record', () => {
    expect(samenvoegen([rec(), rec()], [rec()])).toEqual([rec()]);
  });

  it('een ander uur, een ander toestel, een andere versie of een andere uitkomst zijn andere records', () => {
    const lijst = [rec(), rec({ tijd: T0 + 1 }), rec({ bron: TOESTEL_Y }), rec({ versie: 2 }), rec({ juist: false }), rec({ juist: false, foutpatroon: 0 })];
    expect(samenvoegen(lijst)).toHaveLength(6);
  });

  it('twee pogingen in dezelfde minuut op hetzelfde toestel vallen niet stil weg', () => {
    const fout = rec({ bewijsnummer: 2, juist: false, foutpatroon: 0 });
    const juist = rec({ bewijsnummer: 2, juist: true });
    expect(samenvoegen([fout], [juist])).toEqual(samenvoegen([juist, fout]));
    expect(samenvoegen([fout], [juist])).toHaveLength(2);
  });

  it('samenvoegen in elke volgorde, en twee keer, geeft dezelfde records en dezelfde status', () => {
    const lijsten: BewijsRecord[][] = [
      [rec({ juist: false, foutpatroon: 1, tijd: T0 + 3 }), rec({ bewijsnummer: 2, tijd: T0 + 1 })],
      [rec({ tijd: T0 + 1, bron: TOESTEL_Y }), rec({ kindcode: 'AC', bewijsnummer: 3, juist: false, bron: { soort: 'observatie' } })],
      [rec({ bewijsnummer: 2, juist: false, tijd: T0 + 4, bron: { soort: 'eigen', toestelId: 'EEEE' } }), rec({ juist: false, foutpatroon: 1, tijd: T0 + 3 })],
      [rec({ kindcode: 'AC', versie: 2, bewijsnummer: 4 }), rec({ kindcode: 'AC', bewijsnummer: 1, naar: 'AD', naarTijd: T0 + 9 })],
    ];
    const verwacht = samenvoegen(...lijsten);
    const verwachtStatus = statussen(verwacht);
    for (const v of volgordes(lijsten)) {
      const s = samenvoegen(...v.map((l) => l.slice().reverse()));
      expect(s).toEqual(verwacht);
      expect(samenvoegen(s, s)).toEqual(verwacht);
      expect(samenvoegen(s, ...v)).toEqual(verwacht);
      expect(statussen(s)).toEqual(verwachtStatus);
      expect(statussen(v.flat())).toEqual(verwachtStatus);
    }
    expect(verwachtStatus['AB 92767']).toBe('nog-wankel');
  });

  it('op willekeurige gevallen: commutatief, associatief en idempotent', () => {
    const KINDEREN = ['AB', 'AC', 'AD'];
    const BRONNEN = [TOESTEL_X, TOESTEL_Y, { soort: 'eigen', toestelId: 'EEEE' }, { soort: 'bord' }, { soort: 'observatie' }] as const;
    for (let zaad = 1; zaad <= 300; zaad++) {
      const r = toeval(zaad);
      const kies = <T>(l: readonly T[]): T => l[Math.floor(r() * l.length)];
      const records: BewijsRecord[] = [];
      for (let i = 0; i < 14; i++) {
        const bewijsnummer = Math.floor(r() * 5);
        const juist = r() < 0.5;
        const x = rec({
          kindcode: kies(KINDEREN),
          versie: bewijsnummer === 4 ? 2 : kies([1, 2]),
          bewijsnummer,
          juist,
          tijd: T0 + Math.floor(r() * 4),
          bron: kies(BRONNEN),
          ...(!juist && r() < 0.5 ? { foutpatroon: 0 } : {}),
          ...(r() < 0.2 ? { duoMet: 'AE' } : {}),
        });
        records.push(x);
        // dezelfde gebeurtenis nog eens: dubbel, of verplaatst (soms twee keer, naar verschillende kinderen)
        if (r() < 0.3) records.push({ ...x });
        if (r() < 0.25) records.push({ ...x, naar: kies(KINDEREN), naarTijd: T0 + 10 + Math.floor(r() * 2) });
      }
      const verwacht = samenvoegen(records);
      const verwachtStatus = statussen(records);
      const knip = 1 + Math.floor(r() * (records.length - 2));
      const knip2 = knip + Math.floor(r() * (records.length - knip));
      const delen = [records.slice(0, knip), records.slice(knip, knip2), records.slice(knip2)];
      for (const v of volgordes(delen)) {
        const deelVoorDeel = samenvoegen(samenvoegen(v[0], v[1]), v[2]);
        expect(deelVoorDeel).toEqual(verwacht);
        expect(samenvoegen(...v.map((d) => geschud(d, r)))).toEqual(verwacht);
      }
      expect(samenvoegen(verwacht, geschud(records, r))).toEqual(verwacht);
      expect(statussen(geschud(records, r))).toEqual(verwachtStatus);
      expect(statussen(verwacht)).toEqual(verwachtStatus);
    }
  });

  it('een ongeldig record geeft een fout, geen stille keuze', () => {
    expect(() => samenvoegen([rec(), rec({ tijd: Date.UTC(2026, 0, 1) })])).toThrow(/Ongeldig bewijsrecord/);
    expect(() => geldendeBewijzen([rec({ kindcode: 'Amira' })], index)).toThrow(/Ongeldig bewijsrecord/);
  });

  it('een verplaatst bewijs blijft verplaatst als dezelfde code later nog eens binnenkomt', () => {
    const origineel = rec({ kindcode: 'AB' });
    const verplaatst = { ...origineel, naar: 'AC', naarTijd: T0 + 30 };
    expect(samenvoegen([verplaatst], [origineel])).toEqual([verplaatst]);
    expect(samenvoegen([origineel], [verplaatst], [origineel])).toEqual([verplaatst]);
    const g = geldendeBewijzen([origineel, verplaatst, origineel], index);
    expect(g.perKind.has('AB')).toBe(false);
    expect(g.perKind.get('AC')?.get('TST/c1')).toEqual(verplaatst);
  });

  it('de laatste verplaatsing wint op het uur, niet op de volgorde van het alfabet', () => {
    // AZ is alfabetisch het laatst: een keuze op de tekst zou telkens fout uitvallen
    const origineel = rec({ kindcode: 'AZ' });
    const naarAC = { ...origineel, naar: 'AC', naarTijd: T0 + 30 };
    const naarAD = { ...origineel, naar: 'AD', naarTijd: T0 + 40 };
    const terugNaarAZ = { ...origineel, naar: 'AZ', naarTijd: T0 + 50 };
    for (const v of volgordes([[origineel], [naarAC], [naarAD]])) expect(samenvoegen(...v)).toEqual([naarAD]);
    for (const v of volgordes([[naarAC], [naarAD], [terugNaarAZ], [origineel]])) {
      expect(samenvoegen(...v)).toEqual([terugNaarAZ]);
      expect([...geldendeBewijzen(v.flat(), index).perKind.keys()]).toEqual(['AZ']);
    }
  });

  it('de laatste verplaatsing wint, ook terug naar het eerste kind', () => {
    const origineel = rec({ kindcode: 'AB' });
    const naarAC = { ...origineel, naar: 'AC', naarTijd: T0 + 30 };
    const terug = { ...origineel, naar: 'AB', naarTijd: T0 + 40 };
    for (const v of volgordes([[origineel], [naarAC], [terug]])) {
      expect(samenvoegen(...v)).toEqual([terug]);
      expect(kindVan(samenvoegen(...v)[0])).toBe('AB');
    }
  });
});

// ─── Welk record telt ────────────────────────────────────────────────────────

describe('welk record telt', () => {
  it('een check op twee toestellen: het vroegste uur telt, in welke volgorde ook', () => {
    const laat = rec({ bewijsnummer: 0, juist: true, tijd: T0 + 50, bron: TOESTEL_X });
    const vroeg = rec({ bewijsnummer: 0, juist: false, foutpatroon: 1, tijd: T0 + 2, bron: TOESTEL_Y });
    for (const lijst of [[laat, vroeg], [vroeg, laat]]) {
      expect(geldendeBewijzen(lijst, index).perKind.get('AB')?.get('TST/c1')).toEqual(vroeg);
    }
    // c1 en c2 tellen voor A; alleen c1 is er, en dat is fout
    expect(statusVoor(A, geldendeBewijzen([laat, vroeg], index).perKind.get('AB'), index)).toBe('nog-niet');
  });

  it('een check over pakketversies heen: het vroegste uur telt, ook als het record van een oudere versie is', () => {
    const v1 = rec({ versie: 1, bewijsnummer: 1, juist: true, tijd: T0 });
    const v2 = rec({ versie: 2, bewijsnummer: 1, juist: false, tijd: T0 + 5 });
    expect(geldendeBewijzen([v2, v1], index).perKind.get('AB')?.get('TST/c2')).toEqual(v1);
  });

  it('een oefening en een observatie: het laatste uur telt', () => {
    const o1 = [rec({ bewijsnummer: 2, juist: false, tijd: T0 + 9, bron: TOESTEL_Y }), rec({ bewijsnummer: 2, juist: true, tijd: T0 + 1 })];
    expect(geldendeBewijzen(o1, index).perKind.get('AB')?.get('TST/o1')?.juist).toBe(false);
    const ob = [rec({ bewijsnummer: 3, juist: true, tijd: T0 + 20, bron: { soort: 'observatie' } }), rec({ bewijsnummer: 3, juist: false, tijd: T0 + 10, bron: { soort: 'observatie' } })];
    expect(geldendeBewijzen(ob, index).perKind.get('AB')?.get('TST/ob')?.juist).toBe(true);
  });

  it('in dezelfde minuut: bij een check telt het voorzichtigste antwoord, bij een oefening de juiste poging', () => {
    const check = [rec({ bewijsnummer: 0, juist: true }), rec({ bewijsnummer: 0, juist: false, bron: TOESTEL_Y })];
    const oef = [rec({ bewijsnummer: 2, juist: false }), rec({ bewijsnummer: 2, juist: true, bron: TOESTEL_Y })];
    for (const v of [check, check.slice().reverse()]) expect(geldendeBewijzen(v, index).perKind.get('AB')?.get('TST/c1')?.juist).toBe(false);
    for (const v of [oef, oef.slice().reverse()]) expect(geldendeBewijzen(v, index).perKind.get('AB')?.get('TST/o1')?.juist).toBe(true);
  });

  it('duowerk: elk kind heeft een eigen record; het maatje telt niet mee door duoMet', () => {
    const g = geldendeBewijzen([rec({ kindcode: 'AB', duoMet: 'AC' })], index);
    expect([...g.perKind.keys()]).toEqual(['AB']);
  });

  it('een record van een onbekende versie, een onbekend nummer of een onbekend pakket telt niet en gaat niet verloren', () => {
    const nieuwer = rec({ versie: 3 });
    const teHoog = rec({ versie: 1, bewijsnummer: 4 }); // o2 bestaat pas in versie 2
    const vreemd = rec({ pakket: 'XYZ' });
    const g = geldendeBewijzen([nieuwer, teHoog, vreemd, nieuwer], index);
    expect(g.perKind.size).toBe(0);
    expect(g.onbekend).toEqual(samenvoegen([nieuwer, teHoog, vreemd]));
    for (const d of DOELEN) expect(statusVoor(d, g.perKind.get('AB'), index)).toBe('nog-geen-bewijs');
  });

  it('bewijsVan en foutpatroonVan lezen het bewijs in de versie van het record', () => {
    expect(bewijsVan(rec({ versie: 2, bewijsnummer: 4 }), index)?.id).toBe('o2');
    expect(bewijsVan(rec({ versie: 1, bewijsnummer: 4 }), index)).toBeUndefined();
    expect(foutpatroonVan(rec({ juist: false, foutpatroon: 1 }), index)?.id).toBe('f2');
    expect(foutpatroonVan(rec({ juist: false, foutpatroon: 5 }), index)).toBeUndefined();
    expect(foutpatroonVan(rec({ juist: false }), index)).toBeUndefined();
    expect(foutpatroonVan(rec(), index)).toBeUndefined();
  });
});

// ─── Status per doel ─────────────────────────────────────────────────────────

describe('de status per doel', () => {
  const st = (records: BewijsRecord[], doel: DoelSleutel, kind = 'AB') => statusVoor(doel, geldendeBewijzen(records, index).perKind.get(kind), index);

  it("'nog geen bewijs' is iets anders dan 'nog niet'", () => {
    expect(st([], A)).toBe('nog-geen-bewijs');
    expect(st([rec({ kindcode: 'AC' })], A)).toBe('nog-geen-bewijs'); // bewijs van een ander kind
    expect(st([rec({ juist: false })], A)).toBe('nog-niet');
    expect(statusVoor(A, undefined, index)).toBe('nog-geen-bewijs');
    expect(STATUS_TEKST['nog-geen-bewijs']).not.toBe(STATUS_TEKST['nog-niet']);
  });

  it('toont het: alles juist en minstens twee bewijzen, of het enige bewijs van het doel', () => {
    // A heeft drie bewijzen (c1, c2, o1): één juist is nog wankel, twee juist toont het
    expect(st([rec({ bewijsnummer: 0 })], A)).toBe('nog-wankel');
    expect(st([rec({ bewijsnummer: 0 }), rec({ bewijsnummer: 2 })], A)).toBe('toont-het');
    expect(st([rec({ bewijsnummer: 0 }), rec({ bewijsnummer: 2 }), rec({ bewijsnummer: 1, juist: false })], A)).toBe('nog-wankel');
    // G heeft één bewijs (o2): één juist toont het
    expect(st([rec({ versie: 2, bewijsnummer: 4 })], G)).toBe('toont-het');
    expect(st([rec({ versie: 2, bewijsnummer: 4, juist: false })], G)).toBe('nog-niet');
  });

  it('een onbekend doel heeft nog geen bewijs', () => {
    expect(st([rec()], minimumdoel('ODS_3408', '99999'))).toBe('nog-geen-bewijs');
  });

  it('een GO!-sleutel: bewijs op WT.008 (zonder minimumdoel) staat los van de minimumdoelen', () => {
    const records = [rec({ versie: 2, bewijsnummer: 4, juist: true, bron: { soort: 'bord' } })];
    expect(st(records, goDoel('WT.008'))).toBe('toont-het');
    expect(st(records, A)).toBe('nog-geen-bewijs');
    expect(st(records, B)).toBe('nog-geen-bewijs');
    expect(st(records, goDoel('WT.408'))).toBe('nog-geen-bewijs');
  });

  it('een eigen map met wat telt werkt ook (het kindscherm zonder kindcode)', () => {
    const geldend = new Map([
      ['TST/c1', { juist: true }],
      ['TST/o1', { juist: true }],
    ]);
    expect(statusVoor(A, geldend, index)).toBe('toont-het');
    expect(statusVoor(B, geldend, index)).toBe('nog-wankel'); // B: o1 en ob; alleen o1, en dat is één van twee
  });

  it('de woorden zijn die van het prototype', () => {
    expect(BEWIJS_STATUSSEN.map((s) => STATUS_TEKST[s])).toEqual(['toont het', 'nog wankel', 'nog niet', 'nog geen bewijs']);
  });
});

// ─── Zuiver ──────────────────────────────────────────────────────────────────

describe('zuiver: niets bewaard, geen klok, geen toeval', () => {
  it.each(['bewijs.ts', 'pakket.ts', 'doelSleutel.ts', 'lichtkamerManifest.ts'])('%s', (bestand) => {
    const bron = readFileSync(new URL(`./${bestand}`, import.meta.url), 'utf8');
    for (const verboden of ['localStorage', 'sessionStorage', 'indexedDB', 'Date.now', 'new Date', 'Math.random', 'document.', 'window.', 'fetch(', 'navigator.', 'localeCompare']) {
      expect(bron, `${bestand} gebruikt ${verboden}`).not.toContain(verboden);
    }
  });
});
