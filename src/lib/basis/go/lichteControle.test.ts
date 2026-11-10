// De lichte controle van de bestanden van het GO! in de app (lichteControle.ts). Alle echte bestanden in public/basis/go/
// moeten erdoor; kopieën waar iets aan stuk gemaakt is, worden geweigerd met één melding die zegt waar. Een onbekend
// optioneel veld komt er bewust door. De strenge validatie (valideer.ts) blijft voor de import en de uitrolpoort.

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lichtGoBijMinimumdoel, lichtGoIndex, lichtGoLeerplan, lichtGoLesplan } from './lichteControle';

const MAP = new URL('../../../../public/basis/go/', import.meta.url);
const lees = (pad: string): Record<string, unknown> => JSON.parse(readFileSync(new URL(pad, MAP), 'utf8')) as Record<string, unknown>;
const kopie = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const jsonIn = (map: string) => readdirSync(new URL(`${map}/`, MAP)).filter((n) => n.endsWith('.json')).sort();

type Obj = Record<string, unknown>;

/** Het eerste object in de boom waarvoor `past` waar is (diepte eerst, in volgorde). */
function zoek(v: unknown, past: (o: Obj) => boolean): Obj | undefined {
  if (Array.isArray(v)) {
    for (const x of v) {
      const r = zoek(x, past);
      if (r) return r;
    }
  } else if (typeof v === 'object' && v !== null) {
    const o = v as Obj;
    if (past(o)) return o;
    for (const x of Object.values(o)) {
      const r = zoek(x, past);
      if (r) return r;
    }
  }
  return undefined;
}

describe('de echte bestanden', () => {
  const leerplannen = jsonIn('leerplan');
  const lesplannen = jsonIn('lesplannen');
  const bij = jsonIn('bij-minimumdoel');

  it('alle 31 bestanden komen erdoor', () => {
    expect(1 + leerplannen.length + lesplannen.length + bij.length).toBe(31);
    expect(lichtGoIndex(lees('index.json'))).toEqual([]);
    for (const n of leerplannen) expect(lichtGoLeerplan(lees(`leerplan/${n}`)), n).toEqual([]);
    for (const n of lesplannen) expect(lichtGoLesplan(lees(`lesplannen/${n}`)), n).toEqual([]);
    for (const n of bij) expect(lichtGoBijMinimumdoel(lees(`bij-minimumdoel/${n}`)), n).toEqual([]);
  });

  it('een bestand van een ander soort komt niet door', () => {
    expect(lichtGoLeerplan(lees('index.json'))).toEqual(['geen bestand van het soort go-leerplan']);
    expect(lichtGoIndex(lees('lesplannen/LP0065.json'))).toEqual(['geen bestand van het soort go-index']);
    expect(lichtGoLesplan(lees('leerplan/WT.json'))).toEqual(['geen bestand van het soort go-lesplan']);
    expect(lichtGoBijMinimumdoel(lees('index.json'))).toEqual(['geen bestand van het soort go-bij-minimumdoel']);
    expect(lichtGoIndex({ ...lees('index.json'), app: 'iets anders' })).toEqual(['geen bestand van het soort go-index']);
  });
});

describe('de versie', () => {
  it('een andere v komt niet door (een nieuwe vorm: de pagina opnieuw laden)', () => {
    expect(lichtGoIndex({ ...lees('index.json'), v: 2 })).toEqual(['onbekende versie (2)']);
    expect(lichtGoLesplan({ ...lees('lesplannen/LP0065.json'), v: 2 })).toEqual(['onbekende versie (2)']);
    expect(lichtGoLeerplan({ ...lees('leerplan/SV.json'), v: '1' })).toEqual(['onbekende versie (1)']);
    const { v: _v, ...zonder } = lees('bij-minimumdoel/3.json');
    expect(lichtGoBijMinimumdoel(zonder)).toEqual(['onbekende versie (undefined)']);
  });
});

describe('een onbekend optioneel veld', () => {
  it('komt bewust door, op elk niveau', () => {
    expect(lichtGoIndex({ ...lees('index.json'), nieuwVeld: [1, 2] })).toEqual([]);
    const lp = kopie(lees('lesplannen/LP0065.json'));
    lp.nieuw = 'x';
    (lp.afgeleid as Obj).nieuw = { a: 1 };
    (zoek(lp.delen, (o) => o.soort === 'alinea') as Obj).nieuw = true;
    expect(lichtGoLesplan(lp)).toEqual([]);
    const wt = kopie(lees('leerplan/WT.json'));
    ((wt.doelen as Obj[])[0]).nieuw = 'x';
    expect(lichtGoLeerplan(wt)).toEqual([]);
  });
});

describe('wat in een href of src komt', () => {
  it('bron.url moet een link naar GO! studio zijn', () => {
    for (const url of ['javascript:alert(1)', 'https://studio.g-o.be.boos.example/', 'http://studio.g-o.be/', 'https://studio.g-o.be/"onmouseover="x', 'https://studio.g-o.be/ x', 42]) {
      const lp = kopie(lees('lesplannen/LP0065.json'));
      (lp.bron as Obj).url = url;
      expect(lichtGoLesplan(lp), String(url)).toHaveLength(1);
      expect(lichtGoLesplan(lp)[0], String(url)).toMatch(/^bron\.url: /);
    }
  });

  it('het pad van een getoond beeld heeft het vaste patroon', () => {
    for (const bestand of ['../x.webp', 'beelden/../../x.webp', '/beelden/x.webp', 'https://boos.example/x.webp', 'beelden/x.svg', 'beelden/x.webp?y', 'javascript:alert(1)']) {
      const lp = kopie(lees('lesplannen/LP0014a.json'));
      const beeld = zoek(lp.delen, (o) => o.soort === 'beeld' && o.status === 'getoond');
      expect(beeld, 'LP0014a heeft een getoond beeld').toBeDefined();
      (beeld as Obj).bestand = bestand;
      const uit = lichtGoLesplan(lp);
      expect(uit, bestand).toHaveLength(1);
      expect(uit[0], bestand).toMatch(/\.bestand: geen geldig pad van een beeld$/);
    }
  });

  it('een beeld met een onbekende status komt niet door (anders kwam zijn pad ongecontroleerd in een src)', () => {
    const lp = kopie(lees('lesplannen/LP0014a.json'));
    const beeld = zoek(lp.delen, (o) => o.soort === 'beeld') as Obj;
    beeld.status = 'zichtbaar';
    beeld.bestand = '../x.webp';
    expect(lichtGoLesplan(lp)[0]).toMatch(/\.status: onbekende waarde \(zichtbaar\)$/);
  });
});

describe('de velden die de schermen lezen', () => {
  it('een doel zonder inhoud, met een onbekende leeftijd of een kapotte koppeling komt niet door', () => {
    const zonderInhoud = kopie(lees('leerplan/WT.json'));
    delete (zonderInhoud.doelen as Obj[])[85].inhoud;
    expect(lichtGoLeerplan(zonderInhoud)).toEqual(['doelen[85] (WT.086).inhoud: geen lijst']);

    const leeftijd = kopie(lees('leerplan/WT.json'));
    (leeftijd.doelen as Obj[])[0].leeftijden = ['3-4'];
    expect(lichtGoLeerplan(leeftijd)).toEqual(['doelen[0] (WT.001).leeftijden[0]: onbekende waarde (3-4)']);

    const moment = kopie(lees('leerplan/WT.json'));
    const ref = zoek(moment.doelen, (o) => typeof o.moment === 'string' && typeof o.set === 'string') as Obj;
    ref.moment = 'L5';
    expect(lichtGoLeerplan(moment)[0]).toMatch(/\.minimumdoelen\.refs\[0\]\.moment: onbekende waarde \(L5\)$/);

    const refs = kopie(lees('leerplan/WT.json'));
    ((refs.doelen as Obj[])[0].minimumdoelen as Obj).refs = {};
    expect(lichtGoLeerplan(refs)).toEqual(['doelen[0] (WT.001).minimumdoelen.refs: geen lijst']);
  });

  it('een onbekende soort inhoud komt niet door (die zou stil wegvallen)', () => {
    const wt = kopie(lees('leerplan/WT.json'));
    const doel = (wt.doelen as Obj[])[85];
    ((doel.inhoud as Obj[])[0]).soort = 'uitleg';
    expect(lichtGoLeerplan(wt)).toEqual(['doelen[85] (WT.086).inhoud[0].soort: onbekende waarde (uitleg)']);
  });

  it('een rubriek zonder tekst en een leerplan van een onbekend vak komen niet door', () => {
    const r = kopie(lees('leerplan/SV.json'));
    delete (r.rubrieken as Obj[])[0].tekst;
    expect(lichtGoLeerplan(r)).toEqual(['rubrieken[0].tekst: geen tekst']);
    expect(lichtGoLeerplan({ ...lees('leerplan/SV.json'), vak: 'XX' })).toEqual(['vak: onbekend vak (XX)']);
  });

  it('in een lesplan: een onbekende soort blok, een kop van niveau 5, een onbekend pictogram of een tekst zonder t komt niet door', () => {
    const blokSoort = kopie(lees('lesplannen/LP0065.json'));
    (zoek(blokSoort.delen, (o) => o.soort === 'alinea') as Obj).soort = 'kader';
    expect(lichtGoLesplan(blokSoort)[0]).toMatch(/^delen\[\d+\]\.blokken\[\d+\]\.soort: onbekende waarde \(kader\)$/);

    const niveau = kopie(lees('lesplannen/LP0065.json'));
    (zoek(niveau.delen, (o) => o.soort === 'kop') as Obj).niveau = 5;
    expect(lichtGoLesplan(niveau)[0]).toMatch(/\.niveau: onbekende waarde \(5\)$/);

    const icoon = kopie(lees('lesplannen/LP0065.json'));
    const metIcoon = zoek(icoon.delen, (o) => typeof o.icoon === 'string');
    expect(metIcoon, 'LP0065 heeft een pictogram').toBeDefined();
    (metIcoon as Obj).icoon = 'ster';
    expect(lichtGoLesplan(icoon)[0]).toMatch(/\.icoon: onbekende waarde \(ster\)$/);

    const t = kopie(lees('lesplannen/LP0065.json'));
    const stuk = zoek(t.delen, (o) => typeof o.t === 'string') as Obj;
    stuk.t = 7;
    expect(lichtGoLesplan(t)[0]).toMatch(/\.t: geen tekst$/);
  });

  it('in een lesplan: afgeleide lijsten en wijzers die het scherm leest', () => {
    const lijst = kopie(lees('lesplannen/LP0065.json'));
    (lijst.afgeleid as Obj).trainen = null;
    expect(lichtGoLesplan(lijst)).toEqual(['afgeleid.trainen: geen lijst']);

    const waar = kopie(lees('lesplannen/LP0065.json'));
    delete ((waar.afgeleid as Obj).leerplandoelen as Obj[])[0].waar;
    expect(lichtGoLesplan(waar)).toEqual(['afgeleid.leerplandoelen[0].waar: geen object']);

    const materiaal = kopie(lees('lesplannen/LP0065.json'));
    (materiaal.afgeleid as Obj).materiaal = { deel: '6', blok: 1 };
    expect(lichtGoLesplan(materiaal)).toEqual(['afgeleid.materiaal.deel: geen getal']);

    const leeftijd = kopie(lees('lesplannen/LP0065.json'));
    leeftijd.leeftijd = '2-4';
    expect(lichtGoLesplan(leeftijd)).toEqual(['leeftijd: onbekende waarde (2-4)']);
  });

  it('in de index: een lesplan met een onbekend vak of zonder lijst van doelen komt niet door', () => {
    const vak = kopie(lees('index.json'));
    (vak.lesplannen as Obj[])[0].vak = 'ZZ';
    expect(lichtGoIndex(vak)).toEqual(['lesplannen[0].vak: onbekend vak (ZZ)']);
    const doelen = kopie(lees('index.json'));
    (doelen.lesplannen as Obj[])[2].doelen = 'WT.086';
    expect(lichtGoIndex(doelen)).toEqual(['lesplannen[2].doelen: geen lijst']);
    const per = kopie(lees('index.json'));
    delete ((per.leerplan as Obj[])[0].perLeeftijd as Obj)['4-5'];
    expect(lichtGoIndex(per)).toEqual(['leerplan[0].perLeeftijd.4-5: geen getal']);
  });

  it('bij een minimumdoel: een lijst die geen lijst is of een doel zonder lesplannen komt niet door', () => {
    const b = kopie(lees('bij-minimumdoel/3.json'));
    const [sleutel] = Object.keys(b.doelen as Obj);
    (b.doelen as Obj)[sleutel] = { code: 'WT.086' };
    expect(lichtGoBijMinimumdoel(b)).toEqual([`doelen.${sleutel}: geen lijst`]);
    const c = kopie(lees('bij-minimumdoel/3.json'));
    delete (((c.doelen as Obj)[sleutel] as Obj[])[0]).lesplannen;
    expect(lichtGoBijMinimumdoel(c)).toEqual([`doelen.${sleutel}[0].lesplannen: geen lijst`]);
  });
});

describe('gooit nooit', () => {
  it('ook niet op iets dat geen bestand is', () => {
    for (const x of [null, undefined, 42, 'tekst', [], [1], true]) {
      for (const f of [lichtGoIndex, lichtGoLeerplan, lichtGoLesplan, lichtGoBijMinimumdoel]) expect(f(x), `${f.name}(${JSON.stringify(x)})`).toEqual(['geen object']);
    }
    expect(lichtGoLesplan({ app: 'boosterz', kind: 'go-lesplan', v: 1 })).toEqual(['code: geen tekst']);
    expect(lichtGoIndex({ app: 'boosterz', kind: 'go-index', v: 1, ingelezen: '2026-11-09' })).toEqual(['leerplan: geen lijst']);
  });
});
