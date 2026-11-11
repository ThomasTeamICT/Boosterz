// De uitrolpoort voor de meegeleverde gegevens van het GO! in public/basis/go (pakket G5 van
// docs/basisonderwijs/GO-LEERPLAN.md).
//
// Deze test loopt altijd en hard: ontbreekt een bestand, dan faalt hij. Hij eist drie dingen:
// - valideer* geeft niets op elk bestand (dezelfde strikte validator als in de import; de app gebruikt een lichtere controle);
// - elke sha256 klopt (in het bestand zelf en in de index);
// - de bestanden passen bij elkaar (index, leerplannen, lesplannen, omgekeerde index en beelden).
// Aantallen staan hier niet vast: die horen bij de momentopname in src/lib/basis/go.echt.test.ts.
// De tekst van een minimumdoel staat in geen van deze bestanden: die komt altijd uit public/leerplannen/minimumdoelen.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normaliseerDoeltekst } from '../../curriculum';
import { GO_LEEFTIJDEN } from './leeftijden';
import { vakVanCode } from './koppelen';
import { shaVan } from './omzetten';
import {
  GO_VAK_CODES,
  bijMinimumdoelShaInvoer,
  leerplanShaInvoer,
  lesplanShaInvoer,
  type GoBijDoel,
  type GoBijMinimumdoelBestand,
  type GoIndex,
  type GoKoppeling,
  type GoMinimumdoelRef,
  type GoLeerplanBestand,
  type GoLesplanBestand,
} from './types';
import { voorstelNaast, vormVanVoorstel } from './goModel';
import {
  isZonderMinimumdoel,
  valideerGoBijMinimumdoel,
  valideerGoIndex,
  valideerGoLeerplan,
  valideerGoLesplan,
  zoekPersoonsgegevens,
} from './valideer';

const GO_MAP = join(fileURLToPath(new URL('../../../../', import.meta.url)), 'public', 'basis', 'go');
const BEKENDE_PAD = join(fileURLToPath(new URL('../../../../', import.meta.url)), 'tools', 'basis', 'go', 'bekende-afwijkingen.json');

const lees = <T>(rel: string): T => JSON.parse(readFileSync(join(GO_MAP, rel), 'utf8')) as T;
const SHA = /^[0-9a-f]{64}$/;

const index = lees<GoIndex>('index.json');
const leerplannen = new Map<string, GoLeerplanBestand>(index.leerplan.map((l) => [l.vak, lees<GoLeerplanBestand>(l.bestand)]));
const lesplannen = new Map<string, GoLesplanBestand>(index.lesplannen.map((l) => [l.code, lees<GoLesplanBestand>(l.bestand)]));
const bijBestanden = new Map<number, GoBijMinimumdoelBestand>(index.bijMinimumdoel.map((b) => [b.vak, lees<GoBijMinimumdoelBestand>(b.bestand)]));

/** De bestanden in een map van public/basis/go, als 'map/naam'. */
const bestandenIn = (map: string): string[] => readdirSync(join(GO_MAP, map)).map((n) => `${map}/${n}`).sort();

describe('public/basis/go: de bestanden zijn er en zijn geldig', () => {
  it('de index bestaat en is geldig', () => {
    expect(valideerGoIndex(index)).toEqual([]);
  });

  it('de index noemt elk bestand in leerplan/, bij-minimumdoel/ en lesplannen/, en niets anders staat er', () => {
    expect(bestandenIn('leerplan')).toEqual(index.leerplan.map((l) => l.bestand).sort());
    expect(bestandenIn('bij-minimumdoel')).toEqual(index.bijMinimumdoel.map((b) => b.bestand).sort());
    expect(bestandenIn('lesplannen')).toEqual(index.lesplannen.map((l) => l.bestand).sort());
  });

  it('alle twaalf vakken hebben een doelenset', () => {
    expect(index.leerplan.map((l) => l.vak)).toEqual([...GO_VAK_CODES]);
  });

  for (const [vak, b] of leerplannen) {
    it(`leerplan/${vak}.json is geldig`, () => {
      expect(valideerGoLeerplan(b)).toEqual([]);
    });
  }
  for (const [code, b] of lesplannen) {
    it(`lesplannen/${code}.json is geldig`, () => {
      expect(valideerGoLesplan(b)).toEqual([]);
    });
  }
  for (const [vak, b] of bijBestanden) {
    it(`bij-minimumdoel/${vak}.json is geldig`, () => {
      expect(valideerGoBijMinimumdoel(b)).toEqual([]);
    });
  }

  it('in geen enkel bestand staat een e-mailadres of telefoonnummer', () => {
    const treffers: string[] = [];
    const kijk = (naam: string, json: unknown) => {
      for (const t of zoekPersoonsgegevens(json)) treffers.push(`${naam} ${t.pad} (${t.soort})`);
    };
    kijk('index.json', index);
    for (const [v, b] of leerplannen) kijk(`leerplan/${v}.json`, b);
    for (const [c, b] of lesplannen) kijk(`lesplannen/${c}.json`, b);
    for (const [v, b] of bijBestanden) kijk(`bij-minimumdoel/${v}.json`, b);
    expect(treffers).toEqual([]);
  });
});

describe('public/basis/go: de sha256 klopt', () => {
  it('elk leerplan: de sha256 in het bestand klopt en staat gelijk in de index', () => {
    for (const l of index.leerplan) {
      const b = leerplannen.get(l.vak) as GoLeerplanBestand;
      expect(b.sha256, `leerplan/${l.vak}.json`).toMatch(SHA);
      expect(shaVan(leerplanShaInvoer(b)), `leerplan/${l.vak}.json`).toBe(b.sha256);
      expect(l.sha256, `index, leerplan ${l.vak}`).toBe(b.sha256);
    }
  });

  it('elk lesplan: de sha256 in het bestand klopt en staat gelijk in de index', () => {
    for (const l of index.lesplannen) {
      const b = lesplannen.get(l.code) as GoLesplanBestand;
      expect(b.sha256, `lesplannen/${l.code}.json`).toMatch(SHA);
      expect(shaVan(lesplanShaInvoer(b)), `lesplannen/${l.code}.json`).toBe(b.sha256);
      expect(l.sha256, `index, lesplan ${l.code}`).toBe(b.sha256);
    }
  });

  it('elke omgekeerde index: de sha256 in het bestand klopt en staat gelijk in de index', () => {
    for (const l of index.bijMinimumdoel) {
      const b = bijBestanden.get(l.vak) as GoBijMinimumdoelBestand;
      expect(b.sha256, `bij-minimumdoel/${l.vak}.json`).toMatch(SHA);
      expect(shaVan(bijMinimumdoelShaInvoer(b)), `bij-minimumdoel/${l.vak}.json`).toBe(b.sha256);
      expect(l.sha256, `index, bij-minimumdoel ${l.vak}`).toBe(b.sha256);
    }
  });

  it('de sha256 van de bronbestanden is een geldige hex-waarde', () => {
    for (const b of leerplannen.values()) expect(b.bron.bestand.sha256).toMatch(SHA);
    for (const b of lesplannen.values()) expect(b.bron.bestand.sha256).toMatch(SHA);
  });
});

describe('public/basis/go: de bestanden passen bij elkaar', () => {
  it('de index klopt met de leerplannen: naam, aantal, zonder minimumdoel, per leeftijd en bronDatum', () => {
    for (const l of index.leerplan) {
      const b = leerplannen.get(l.vak) as GoLeerplanBestand;
      expect(b.vak, l.bestand).toBe(l.vak);
      expect(b.naam, l.bestand).toBe(l.naam);
      expect(l.aantal, `${l.vak} aantal`).toBe(b.doelen.length);
      expect(l.zonderMinimumdoel, `${l.vak} zonderMinimumdoel`).toBe(b.doelen.filter(isZonderMinimumdoel).length);
      for (const lft of GO_LEEFTIJDEN) {
        expect(l.perLeeftijd[lft], `${l.vak} ${lft}`).toBe(b.doelen.filter((d) => d.leeftijden.includes(lft)).length);
      }
      expect(l.bronDatum, `${l.vak} bronDatum`).toBe(b.bron.bestand.datum);
    }
  });

  it('elk leerplandoel heeft de code van zijn vak en alle codes lopen van 001 tot N', () => {
    for (const [vak, b] of leerplannen) {
      b.doelen.forEach((d, i) => {
        expect(d.code, `${vak} doel ${i + 1}`).toBe(`${vak}.${String(i + 1).padStart(3, '0')}`);
      });
    }
  });

  it('elke rubriek van een doel bestaat in zijn eigen leerplan', () => {
    for (const [vak, b] of leerplannen) {
      const ids = new Set(b.rubrieken.map((r) => r.id));
      expect(ids.size, `${vak} rubrieken`).toBe(b.rubrieken.length);
      for (const d of b.doelen) expect(ids.has(d.rubriek), `${d.code} rubriek ${d.rubriek}`).toBe(true);
    }
  });

  it('elke code in vlaggen en schakels is een doel dat bestaat; wat niet bestaat staat bij kapot', () => {
    const bestaat = (code: string) => {
      const m = /^([A-Z]{2})\.(\d{3})$/.exec(code);
      const b = m ? leerplannen.get(m[1]) : undefined;
      return b !== undefined && Number(m?.[2]) >= 1 && Number(m?.[2]) <= b.doelen.length;
    };
    const slecht: string[] = [];
    for (const b of leerplannen.values()) {
      for (const d of b.doelen) {
        for (const v of [d.vlaggen, d.schakels]) for (const c of v.codes) if (!bestaat(c)) slecht.push(`${d.code} → ${c}`);
      }
    }
    expect(slecht).toEqual([]);
  });

  it('de index klopt met de lesplannen: titel, leeftijd, vak, lessenlijn, lessenreeks en doelen', () => {
    for (const l of index.lesplannen) {
      const b = lesplannen.get(l.code) as GoLesplanBestand;
      expect(b.code, l.bestand).toBe(l.code);
      expect(b.titel, l.code).toBe(l.titel);
      expect(b.leeftijd, l.code).toBe(l.leeftijd);
      expect(b.afgeleid.vak, l.code).toBe(l.vak);
      expect(b.afgeleid.lessenlijn, l.code).toBe(l.lessenlijn);
      expect(b.afgeleid.lessenreeks, l.code).toBe(l.lessenreeks);
      expect(b.afgeleid.leerplandoelen.map((d) => d.code), l.code).toEqual(l.doelen);
    }
  });

  it('elk leerplandoel in een lesplan bestaat in de doelenset, met dezelfde kennisverwerking en leeftijden en dezelfde tekst', () => {
    const bekend = new Set<string>(
      (JSON.parse(readFileSync(BEKENDE_PAD, 'utf8')) as { afwijkingen: { soort: string; lesplan?: string; doel?: string }[] }).afwijkingen
        .filter((a) => a.soort === 'lesplan-doeltekst')
        .map((a) => `${a.lesplan}|${a.doel}`),
    );
    for (const lp of lesplannen.values()) {
      for (const d of lp.afgeleid.leerplandoelen) {
        const vak = d.code.slice(0, 2);
        const doel = leerplannen.get(vak)?.doelen.find((x) => x.code === d.code);
        expect(doel, `${lp.code} ${d.code}`).toBeDefined();
        if (!doel) continue;
        expect(d.kennisverwerking, `${lp.code} ${d.code} kennisverwerking`).toBe(doel.kennisverwerking);
        expect(d.leeftijden, `${lp.code} ${d.code} leeftijden`).toEqual(doel.leeftijden);
        if (!bekend.has(`${lp.code}|${d.code}`)) {
          expect(normaliseerDoeltekst(d.tekst), `${lp.code} ${d.code} tekst`).toBe(normaliseerDoeltekst(doel.tekst));
        }
      }
    }
  });

  it('vlaggen en schakels van een lesplan zijn de vlaggen en schakels van zijn doelen, en de lesplancode van een leerplandoel verwijst terug', () => {
    for (const lp of lesplannen.values()) {
      const vlaggen = new Set<string>();
      const schakels = new Set<string>();
      for (const d of lp.afgeleid.leerplandoelen) {
        const doel = leerplannen.get(d.code.slice(0, 2))?.doelen.find((x) => x.code === d.code);
        for (const c of doel?.vlaggen.codes ?? []) vlaggen.add(c);
        for (const c of doel?.schakels.codes ?? []) schakels.add(c);
      }
      expect(new Set(lp.afgeleid.vlaggen), `${lp.code} vlaggen`).toEqual(vlaggen);
      expect(new Set(lp.afgeleid.schakels), `${lp.code} schakels`).toEqual(schakels);
    }
  });

  it('de omgekeerde index: elke ref van elk leerplandoel (doelzin of MIA) staat erin, en elke vermelding komt uit een ref', () => {
    // Verwacht: vak → id → code → { moment, status, bronCode?, voorstel?, via? }
    type Verwacht = { moment: string; status: string; bronCode?: string; voorstel?: { set: string; id: string; code: string }; direct: boolean; via: number };
    const verwacht = new Map<string, Verwacht>();
    const van = (r: GoMinimumdoelRef, k: GoKoppeling, direct: boolean): Verwacht & { code: string } => {
      const naast = voorstelNaast(k, r);
      return { moment: r.moment, status: r.status, bronCode: r.bronCode, voorstel: naast && { set: naast.set, id: naast.id, code: naast.code }, direct, via: direct ? 0 : 1, code: r.code };
    };
    for (const b of leerplannen.values()) {
      for (const d of b.doelen) {
        const dezeDoel = new Map<string, Verwacht & { code: string }>();
        for (const r of d.minimumdoelen.refs) dezeDoel.set(r.id, van(r, d.minimumdoelen, true));
        for (const i of d.inhoud) {
          if (!('koppeling' in i) || !i.koppeling) continue;
          for (const r of i.koppeling.refs) {
            const al = dezeDoel.get(r.id);
            if (!al) dezeDoel.set(r.id, van(r, i.koppeling, false));
            else if (!al.direct) al.via += 1;
          }
        }
        for (const [id, w] of dezeDoel) {
          const vak = vakVanCode(w.code);
          verwacht.set(`${vak}|${id}|${d.code}`, w);
        }
      }
    }
    const gevonden = new Map<string, GoBijDoel>();
    for (const [vak, b] of bijBestanden) {
      for (const [id, lijst] of Object.entries(b.doelen)) for (const e of lijst) gevonden.set(`${vak}|${id}|${e.code}`, e);
    }
    expect([...gevonden.keys()].sort()).toEqual([...verwacht.keys()].sort());
    for (const [sleutel, e] of gevonden) {
      const w = verwacht.get(sleutel);
      expect(e.moment, sleutel).toBe(w?.moment);
      expect(e.status, sleutel).toBe(w?.status);
      expect(e.bronCode, `${sleutel} bronCode`).toBe(w?.bronCode);
      // Vorm B: de officiële koppeling met twijfel 'ander-vak' noemt het voorgestelde doel, en alleen die.
      expect(e.voorstel, `${sleutel} voorstel`).toEqual(w?.voorstel);
      // 'via' staat er alleen als de doelzin zelf niet naar dit minimumdoel verwijst (rechtzetting 2).
      expect(e.via !== undefined, `${sleutel} via`).toBe(w?.direct === false);
      if (e.via) expect(e.via.length, `${sleutel} via aantal`).toBe(w?.via);
    }
  });

  it('de omgekeerde index: tekst, leeftijden en kennisverwerking zijn die van het leerplandoel; lesplannen zijn die uit deel 2', () => {
    for (const b of bijBestanden.values()) {
      for (const [id, lijst] of Object.entries(b.doelen)) {
        for (const e of lijst) {
          const doel = leerplannen.get(e.code.slice(0, 2))?.doelen.find((x) => x.code === e.code);
          expect(doel, `${id} ${e.code}`).toBeDefined();
          if (!doel) continue;
          expect(e.tekst, `${id} ${e.code} tekst`).toBe(doel.tekst);
          expect(e.leeftijden, `${id} ${e.code} leeftijden`).toEqual(doel.leeftijden);
          expect(e.kennisverwerking, `${id} ${e.code} kennisverwerking`).toBe(doel.kennisverwerking);
          const uitLesplannen = [...lesplannen.values()]
            .filter((lp) => lp.afgeleid.leerplandoelen.some((d) => d.code === e.code))
            .map((lp) => lp.code)
            .sort();
          expect(e.lesplannen, `${id} ${e.code} lesplannen`).toEqual(uitLesplannen);
        }
      }
    }
  });

  it('elke code van een lesplan in de omgekeerde index bestaat als lesplan', () => {
    for (const b of bijBestanden.values()) {
      for (const lijst of Object.values(b.doelen)) for (const e of lijst) for (const c of e.lesplannen) expect(lesplannen.has(c), c).toBe(true);
    }
  });

  it("een voorstel hoort bij een probleem met dezelfde letterlijke bronCode (vorm A) of naast een officiële koppeling met twijfel 'ander-vak' op die code (vorm B)", () => {
    const vormen: string[] = [];
    for (const b of leerplannen.values()) {
      for (const d of b.doelen) {
        const koppelingen = [d.minimumdoelen, ...d.inhoud.flatMap((i) => ('koppeling' in i && i.koppeling ? [i.koppeling] : []))];
        for (const k of koppelingen) {
          for (const r of k.refs.filter((x) => x.status === 'voorstel')) {
            const vorm = vormVanVoorstel(k, r);
            expect(vorm, `${d.code} ${r.moment} ${r.bronCode}`).toBeDefined();
            vormen.push(`${d.code} ${vorm?.vorm ?? '?'}`);
          }
        }
      }
    }
    // Aantallen horen bij de momentopname (go.echt.test.ts); hier alleen: er is minstens één voorstel om na te kijken.
    expect(vormen.length).toBeGreaterThan(0);
  });

  it('een getoond beeld bestaat in beelden/ en niets in beelden/ is zonder lesplan', () => {
    const gebruikt = new Set<string>();
    for (const lp of lesplannen.values()) {
      const zoek = (blokken: readonly { soort: string; status?: string; bestand?: string; rijen?: { blokken: unknown[] }[][] }[]) => {
        for (const bl of blokken) {
          if (bl.soort === 'beeld' && bl.status === 'getoond' && bl.bestand) gebruikt.add(bl.bestand);
          if (bl.soort === 'tabel') for (const rij of bl.rijen ?? []) for (const cel of rij) zoek(cel.blokken as never);
        }
      };
      for (const deel of lp.delen) zoek(deel.blokken as never);
    }
    for (const bestand of gebruikt) {
      expect(bestand, bestand).toMatch(/^beelden\/[0-9a-f]{40}\.(webp|png|jpg)$/);
      expect(existsSync(join(GO_MAP, bestand)), bestand).toBe(true);
    }
    expect(bestandenIn('beelden').sort()).toEqual([...gebruikt].sort());
  });

  it('elk bestand in beelden/ is byte-gelijk aan het vrijgegeven beeld: de sha256 van zijn regel in bekende-afwijkingen.json (IMP-6)', () => {
    const regels = (JSON.parse(readFileSync(BEKENDE_PAD, 'utf8')) as { afwijkingen: { soort: string; bestand?: string; sha256?: string }[] }).afwijkingen.filter((a) => a.soort === 'lesplan-beeld');
    const beelden = bestandenIn('beelden');
    expect(beelden.length).toBeGreaterThan(0);
    for (const bestand of beelden) {
      const regel = regels.find((a) => a.bestand === bestand);
      expect(regel, `${bestand}: geen regel 'lesplan-beeld' met dit bestand`).toBeDefined();
      // Een png met de sha1 van het origineel als naam is daarmee al vastgelegd; elk ander bestand heeft een sha256.
      if (/^beelden\/[0-9a-f]{40}\.png$/.test(bestand)) continue;
      expect(regel?.sha256, `${bestand}: de regel heeft geen sha256`).toMatch(SHA);
      expect(createHash('sha256').update(readFileSync(join(GO_MAP, bestand))).digest('hex'), bestand).toBe(regel?.sha256);
    }
  });
});
