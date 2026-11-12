// Tests van het pakketmanifest en de doelsleutel (bouwpakket 3a, LK-2).
import { describe, expect, it } from 'vitest';
import { doelSleutelTekst, goDoel, minimumdoel, redenOngeldigeDoelSleutel, zelfdeDoelSleutel, type DoelSleutel } from './doelSleutel';
import {
  MAX_BEWIJZEN,
  MAX_FOUTPATRONEN,
  MAX_VERSIE,
  TELT,
  bewijsSleutel,
  controleerPakket,
  controleerVersieOvergang,
  maakBewijsIndex,
  nummerVanBewijs,
  nummerVanFoutpatroon,
  zoekBewijs,
  type BewijsDef,
  type PakketManifest,
  type PakketVersie,
} from './pakket';

const A = minimumdoel('ODS_3408', '92767');
const B = minimumdoel('ODS_3408', '92775');
const G = goDoel('WT.008');

const def = (id: string, soort: BewijsDef['soort'] = 'oefening', doelen: DoelSleutel[] = [A], fouten: string[] = []): BewijsDef => ({
  id,
  soort,
  doelen,
  foutpatronen: fouten.map((f) => ({ id: f, tekst: `tekst van ${f}` })),
});

const v1: PakketVersie = { versie: 1, bewijzen: [def('a', 'oefening', [A], ['f1', 'f2']), def('b', 'check', [A, B]), def('c', 'observatie', [G])] };
const manifest = (...versies: PakketVersie[]): PakketManifest => ({ pakket: 'TST', versies });
/** Een tweede versie: v1 plus wat erbij komt. */
const v2 = (...extra: BewijsDef[]): PakketVersie => ({ versie: 2, bewijzen: [...v1.bewijzen, ...extra] });

describe('doelsleutel', () => {
  it('aanvaardt een minimumdoel en een GO!-code', () => {
    expect(redenOngeldigeDoelSleutel(A)).toBeNull();
    expect(redenOngeldigeDoelSleutel(G)).toBeNull();
    expect(redenOngeldigeDoelSleutel(goDoel('NL.622'))).toBeNull();
  });

  it.each([
    [null, 'geen object'],
    ['md:92767', 'geen object'],
    [{ soort: 'minimumdoel', set: '3408', id: '92767' }, 'ODS_'],
    [{ soort: 'minimumdoel', set: 'ODS_3408', id: '0927' }, 'vast nummer'],
    [{ soort: 'minimumdoel', set: 'ODS_3408', id: 92767 }, 'vast nummer'],
    [{ soort: 'minimumdoel', set: 'ODS_3408', id: '3.5.4' }, 'vast nummer'],
    [{ soort: 'go', code: 'XX.001' }, '<vak>'],
    [{ soort: 'go', code: 'WT.08' }, '<vak>'],
    [{ soort: 'go', code: 'wt.008' }, '<vak>'],
    [{ soort: 'go', code: 'WT.000' }, '<vak>'],
    [{ soort: 'go' }, 'ontbreekt'],
    [{ soort: 'leerplan', code: 'WT.008' }, 'onbekende soort'],
  ])('weigert %j', (d, reden) => {
    expect(redenOngeldigeDoelSleutel(d)).toContain(reden);
  });

  it('een minimumdoel sleutelt op het vaste nummer, niet op de set en nooit op de code', () => {
    // 92767 staat in ODS_3408 (populatie) en in ODS_3469 (na te streven): hetzelfde doel.
    expect(doelSleutelTekst(minimumdoel('ODS_3469', '92767'))).toBe(doelSleutelTekst(A));
    expect(doelSleutelTekst(A)).toBe('md:92767');
    expect(zelfdeDoelSleutel(A, minimumdoel('ODS_3469', '92767'))).toBe(false);
    expect(zelfdeDoelSleutel(A, minimumdoel('ODS_3408', '92767'))).toBe(true);
  });

  it('een GO!-code botst niet met een minimumdoel', () => {
    expect(doelSleutelTekst(G)).toBe('go:WT.008');
    expect(doelSleutelTekst(goDoel('WT.408'))).not.toBe(doelSleutelTekst(minimumdoel('ODS_3408', '408')));
    expect(zelfdeDoelSleutel(G, goDoel('WT.008'))).toBe(true);
    expect(zelfdeDoelSleutel(G, A)).toBe(false);
  });
});

describe('controleerPakket: een versie op zich', () => {
  it('een goed manifest geeft geen fouten', () => {
    expect(controleerPakket(manifest(v1))).toEqual([]);
  });

  it('de regel per soort: eerste telt bij een check, laatste bij een oefening en een observatie', () => {
    expect(TELT).toEqual({ check: 'eerste', oefening: 'laatste', observatie: 'laatste' });
  });

  it.each(['tst', 'TS', 'TSTT', 'T-T', 'TSÉ', '', 42])('weigert pakketcode %j', (pakket) => {
    const f = controleerPakket({ ...manifest(v1), pakket } as unknown as PakketManifest);
    expect(f.join('\n')).toContain('pakketcode');
  });

  it('weigert een manifest zonder versies, en een versie die niet bij 1 begint of een gat laat', () => {
    expect(controleerPakket(manifest()).join('\n')).toContain('geen enkele versie');
    expect(controleerPakket(manifest({ ...v1, versie: 2 })).join('\n')).toContain('verwacht 1');
    expect(controleerPakket(manifest(v1, { ...v2(), versie: 3 })).join('\n')).toContain('verwacht 2');
  });

  it(`aanvaardt precies ${MAX_BEWIJZEN} bewijzen en weigert er ${MAX_BEWIJZEN + 1}`, () => {
    const lijst = (n: number) => Array.from({ length: n }, (_, i) => def(`b${i}`));
    expect(controleerPakket(manifest({ versie: 1, bewijzen: lijst(MAX_BEWIJZEN) }))).toEqual([]);
    expect(controleerPakket(manifest({ versie: 1, bewijzen: lijst(MAX_BEWIJZEN + 1) })).join('\n')).toContain(`hoogstens ${MAX_BEWIJZEN}`);
    expect(controleerPakket(manifest({ versie: 1, bewijzen: [] })).join('\n')).toContain('geen enkel bewijs');
  });

  it(`aanvaardt ${MAX_FOUTPATRONEN} foutpatronen en weigert er ${MAX_FOUTPATRONEN + 1}`, () => {
    const met = (n: number) => manifest({ versie: 1, bewijzen: [def('a', 'check', [A], Array.from({ length: n }, (_, i) => `f${i}`))] });
    expect(controleerPakket(met(MAX_FOUTPATRONEN))).toEqual([]);
    expect(controleerPakket(met(MAX_FOUTPATRONEN + 1)).join('\n')).toContain(`hoogstens ${MAX_FOUTPATRONEN}`);
  });

  it(`aanvaardt ${MAX_VERSIE} versies en weigert er ${MAX_VERSIE + 1}`, () => {
    const versies = (n: number) => Array.from({ length: n }, (_, i): PakketVersie => ({ versie: i + 1, bewijzen: v1.bewijzen }));
    expect(controleerPakket(manifest(...versies(MAX_VERSIE)))).toEqual([]);
    expect(controleerPakket(manifest(...versies(MAX_VERSIE + 1))).join('\n')).toContain(`hoogstens ${MAX_VERSIE}`);
  });

  it.each([
    ['een dubbel id', [def('a'), def('a')], 'twee keer'],
    ['een id met hoofdletters', [def('4C1')], 'kleine letters'],
    ['een id met een koppelteken vooraan', [def('-a')], 'kleine letters'],
    ['een id met een koppelteken achteraan', [def('a-')], 'kleine letters'],
    ['een id van 33 tekens', [def('a'.repeat(33))], 'kleine letters'],
    ['een onbekende soort', [{ ...def('a'), soort: 'toets' } as unknown as BewijsDef], 'onbekende soort'],
    ['geen doel', [def('a', 'oefening', [])], 'geen enkel doel'],
    ['een ongeldig doel', [def('a', 'oefening', [{ soort: 'minimumdoel', set: 'ODS_3408', id: '3.5.4' }])], 'ongeldig doel'],
    ['twee keer hetzelfde doel uit twee sets', [def('a', 'oefening', [A, minimumdoel('ODS_3469', '92767')])], 'twee keer'],
    ['een dubbel foutpatroon', [def('a', 'check', [A], ['f', 'f'])], 'twee keer'],
    ['geen lijst foutpatronen', [{ id: 'a', soort: 'check', doelen: [A] } as unknown as BewijsDef], 'foutpatronen ontbreekt'],
    ['een foutpatroon zonder tekst', [{ ...def('a'), foutpatronen: [{ id: 'f', tekst: ' ' }] }], 'leeg'],
    ['een foutpatroon met een spatie achteraan', [{ ...def('a'), foutpatronen: [{ id: 'f', tekst: 'iets ' }] }], 'spaties'],
  ])('weigert %s', (_naam, bewijzen, reden) => {
    expect(controleerPakket(manifest({ versie: 1, bewijzen })).join('\n')).toContain(reden);
  });

  it.each([null, 'LK4', 42, [], { pakket: 'TST' }, { pakket: 'TST', versies: 'v1' }, { pakket: 'TST', versies: [null] }, { pakket: 'TST', versies: [{ versie: 1, bewijzen: [null, 7] }] }])(
    'crasht niet op invoer van een vreemde vorm: %j',
    (x) => {
      const f = controleerPakket(x as unknown as PakketManifest);
      expect(f.length).toBeGreaterThan(0);
    },
  );
});

describe('controleerPakket: een nieuwe versie vult alleen achteraan aan', () => {
  it('achteraan een bewijs bijvoegen mag', () => {
    expect(controleerPakket(manifest(v1, v2(def('d', 'check'))))).toEqual([]);
  });

  it('een versie zonder wijziging mag', () => {
    expect(controleerPakket(manifest(v1, v2()))).toEqual([]);
  });

  it('een versie die herschikt, wordt geweigerd', () => {
    const [a, b, c] = v1.bewijzen;
    const f = controleerPakket(manifest(v1, { versie: 2, bewijzen: [b, a, c] }));
    expect(f.join('\n')).toContain("bewijs 0 was 'a' en is nu 'b'");
    expect(f.join('\n')).toContain('alleen achteraan');
  });

  it('een bewijs wissen wordt geweigerd, ook achteraan', () => {
    const [a, b] = v1.bewijzen;
    expect(controleerPakket(manifest(v1, { versie: 2, bewijzen: [a, b] })).join('\n')).toContain('wissen mag niet');
  });

  it('een bewijs vervangen op dezelfde plaats wordt geweigerd', () => {
    const [a, , c] = v1.bewijzen;
    expect(controleerPakket(manifest(v1, { versie: 2, bewijzen: [a, def('x', 'check', [A, B]), c] })).join('\n')).toContain("was 'b' en is nu 'x'");
  });

  it('een andere soort wordt geweigerd: dat zou de regel eerste of laatste telt omkeren', () => {
    const [a, b, c] = v1.bewijzen;
    expect(controleerPakket(manifest(v1, { versie: 2, bewijzen: [a, { ...b, soort: 'oefening' }, c] })).join('\n')).toContain('was een check en is nu een oefening');
  });

  it('een doel wegnemen, herschikken of van set veranderen wordt geweigerd; achteraan een doel bijvoegen mag', () => {
    const [a, b, c] = v1.bewijzen;
    const met = (b2: BewijsDef) => controleerPakket(manifest(v1, { versie: 2, bewijzen: [a, b2, c] })).join('\n');
    expect(met({ ...b, doelen: [A] })).toContain('verliest of herschikt een doel');
    expect(met({ ...b, doelen: [B, A] })).toContain('verliest of herschikt een doel');
    expect(met({ ...b, doelen: [minimumdoel('ODS_3469', '92767'), B] })).toContain('verliest of herschikt een doel');
    expect(met({ ...b, doelen: [A, B, goDoel('WT.408')] })).toBe('');
  });

  it('een foutpatroon wegnemen of herschikken wordt geweigerd; achteraan bijvoegen of de tekst beter verwoorden mag', () => {
    const [a, b, c] = v1.bewijzen;
    const met = (a2: BewijsDef) => controleerPakket(manifest(v1, { versie: 2, bewijzen: [a2, b, c] })).join('\n');
    expect(met(def('a', 'oefening', [A], ['f2', 'f1']))).toContain('verliest of herschikt een foutpatroon');
    expect(met(def('a', 'oefening', [A], ['f1']))).toContain('verliest of herschikt een foutpatroon');
    expect(met(def('a', 'oefening', [A], ['f1', 'f2', 'f3']))).toBe('');
    expect(met({ ...a, foutpatronen: [{ id: 'f1', tekst: 'beter verwoord' }, a.foutpatronen[1]] })).toBe('');
  });

  it('elke overgang telt, niet alleen de laatste', () => {
    const [a, b, c] = v1.bewijzen;
    const v3: PakketVersie = { versie: 3, bewijzen: [b, a, c] };
    expect(controleerPakket(manifest(v1, v2(), v3)).join('\n')).toContain('versie 3');
  });

  it('controleerVersieOvergang is ook los te gebruiken', () => {
    expect(controleerVersieOvergang('TST', v1, v2(def('d')))).toEqual([]);
    expect(controleerVersieOvergang('TST', v2(def('d')), { ...v1, versie: 3 })).toHaveLength(1);
  });
});

describe('maakBewijsIndex', () => {
  it('leidt per doel de bewijzen af uit de nieuwste versie (BEWIJS_PER_DOEL)', () => {
    const index = maakBewijsIndex([manifest(v1, v2(def('d', 'check', [B, G])))]);
    expect(Object.fromEntries(index.perDoel)).toEqual({
      'md:92767': ['TST/a', 'TST/b'],
      'md:92775': ['TST/b', 'TST/d'],
      'go:WT.008': ['TST/c', 'TST/d'],
    });
    expect(index.doelen.get('go:WT.008')).toEqual(G);
  });

  it('telt een doel over pakketten heen, en een doel uit een tweelingset als hetzelfde doel', () => {
    const ander: PakketManifest = { pakket: 'AND', versies: [{ versie: 1, bewijzen: [def('z', 'oefening', [minimumdoel('ODS_3469', '92767')])] }] };
    const index = maakBewijsIndex([manifest(v1), ander]);
    expect(index.perDoel.get('md:92767')).toEqual(['TST/a', 'TST/b', 'AND/z']);
  });

  it('weigert een fout manifest en een dubbele pakketcode, met alle fouten', () => {
    expect(() => maakBewijsIndex([manifest(v1, { versie: 2, bewijzen: [v1.bewijzen[1]] })])).toThrow(/wissen mag niet/);
    expect(() => maakBewijsIndex([manifest(v1), manifest(v1)])).toThrow(/twee keer voor/);
  });

  it('een latere wijziging aan het manifest verandert de index niet', () => {
    const m = JSON.parse(JSON.stringify(manifest(v1))) as PakketManifest;
    const index = maakBewijsIndex([m]);
    (m.versies[0].bewijzen as BewijsDef[]).reverse();
    (m.versies[0].bewijzen[0].doelen as DoelSleutel[]).push(B);
    expect(zoekBewijs(index, 'TST', 1, 0)?.id).toBe('a');
    expect(index.perDoel.get('md:92767')).toEqual(['TST/a', 'TST/b']);
    expect(Object.isFrozen(index.pakketten.get('TST')?.versies[0].bewijzen)).toBe(true);
  });

  it('zoekBewijs leest oude versies en geeft niets voor wat niet gekend is', () => {
    const index = maakBewijsIndex([manifest(v1, v2(def('d')))]);
    expect(zoekBewijs(index, 'TST', 1, 2)?.id).toBe('c');
    expect(zoekBewijs(index, 'TST', 2, 2)?.id).toBe('c');
    expect(zoekBewijs(index, 'TST', 2, 3)?.id).toBe('d');
    expect(zoekBewijs(index, 'TST', 1, 3)).toBeUndefined(); // bestond nog niet in versie 1
    expect(zoekBewijs(index, 'TST', 3, 0)).toBeUndefined(); // een nieuwere versie dan gekend
    expect(zoekBewijs(index, 'TST', 0, 0)).toBeUndefined();
    expect(zoekBewijs(index, 'TST', 1, -1)).toBeUndefined();
    expect(zoekBewijs(index, 'TST', 1.5, 0)).toBeUndefined();
    expect(zoekBewijs(index, 'XYZ', 1, 0)).toBeUndefined();
  });

  it('nummerVanBewijs en nummerVanFoutpatroon geven de nummers voor een nieuw record', () => {
    const index = maakBewijsIndex([manifest(v1, v2(def('d')))]);
    expect(nummerVanBewijs(index, 'TST', 'd')).toMatchObject({ versie: 2, nummer: 3 });
    expect(nummerVanBewijs(index, 'TST', 'a')).toMatchObject({ versie: 2, nummer: 0 });
    expect(nummerVanBewijs(index, 'TST', 'x')).toBeUndefined();
    expect(nummerVanBewijs(index, 'XYZ', 'a')).toBeUndefined();
    const a = zoekBewijs(index, 'TST', 1, 0) as BewijsDef;
    expect(nummerVanFoutpatroon(a, 'f2')).toBe(1);
    expect(nummerVanFoutpatroon(a, 'f9')).toBeUndefined();
  });

  it('bewijsSleutel', () => {
    expect(bewijsSleutel('LK4', '4c1')).toBe('LK4/4c1');
  });
});
