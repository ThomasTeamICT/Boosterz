// De eigen ingang van het basisonderwijs (#/basis), getoetst aan de echte gegevens (bouwstap 3, pakket P4).
//
// De modules van de ingang hebben eigen tests met zelfgemaakte gegevens (leerjaarOverzicht.test.ts, doelBasis.test.ts,
// doeltekst.test.ts, zoekBasis.test.ts). Hier gaat het om wat alleen met de echte index en de echte setbestanden in
// public/leerplannen/minimumdoelen te controleren is: wat een leerjaar te zien krijgt, de leerlijn, de doeltekst van
// alle doelen en de acceptatie van het zoeken. Dezelfde afspraken als in momentmodel.echt.test.ts (beslissing H4):
// - Wacht. Ontbreken de gegevens van het basisonderwijs (de index van vóór PR #11), of een setbestand, dan slaan de
//   tests met gegevens over.
// - GEGEVENSRUN=1 slaat elke test in dit bestand over. De maandelijkse ophaling zet dat voor de gewone testrun en draait
//   dit bestand daarna apart, zonder de run te laten falen.
// - Verbanden gelden altijd. Exacte aantallen en lijsten van id's staan achter de momentopname-wacht: de index van
//   1 november 2026 (1096 sets). Groeit of krimpt de index, dan slaan alleen die over.
// - Drempels voor de zoekkwaliteit (recall, P@3) staan niet hier maar in tools/basis/meet-zoeken.ts. Hier staan alleen
//   de acceptatie van H3 en verbanden die altijd moeten gelden.
//
// Is een test rood, dan is de code van de ingang fout of de gegevens zijn veranderd: pas de test dan niet aan om hem
// groen te krijgen, maar zoek het set-id of het doel op.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MinimumdoelenIndexSet, MinimumdoelenSetBestand } from '../minimumdoelen';
import { codeVergelijk, doelenVanSet, leerlijnVanVak, setsVanVak, zelfdeRubriek, type DoelBasis } from './doelBasis';
import { blokkenAlsTekst, doeltekstBlokken, type Blok, type Inline } from './doeltekst';
import { leerjaarOverzicht, leerjaarZinnen, oudeDoelenWoord, type LeerjaarOverzicht } from './leerjaarOverzicht';
import { EINDMOMENTEN } from './doelBasis';
import { INVOERINGSKALENDER, LEERJAREN_BASIS, WERKT_NAAR, type Eindmoment, type LeerjaarBasis, type Schooljaar, type SoortBasis } from './kalender';
import { basisSet } from './moment';
import { leesVraag, zoekDoelen, zoekDoelVan, normaal, type ZoekDoel, type Zoekwoorden } from './zoekBasis';
import { ZOEKWOORDEN } from './zoekwoorden';

// ─── Gegevens laden ─────────────────────────────────────────────────────────

const DATA_MAP = join(fileURLToPath(new URL('../../../', import.meta.url)), 'public', 'leerplannen', 'minimumdoelen');
const GEGEVENSRUN = process.env.GEGEVENSRUN === '1';

const index: MinimumdoelenIndexSet[] = (() => {
  const pad = join(DATA_MAP, 'index.json');
  if (GEGEVENSRUN || !existsSync(pad)) return [];
  return (JSON.parse(readFileSync(pad, 'utf8')) as { sets: MinimumdoelenIndexSet[] }).sets;
})();

const heeftBasis = index.some((s) => s.id === 'ODS_3395');
// De aantallen en lijsten van de acceptatie horen bij de index van 1 november 2026.
const momentopname = heeftBasis && index.length === 1096;

/** De nieuwe, niet-lege sets van het (buitengewoon) basisonderwijs: de doelen waar de ingang mee werkt. */
const nieuweSets = index.flatMap((set) => {
  const info = basisSet(set);
  return info && info.generatie === 'nieuw' && !info.leeg ? [{ set, info }] : [];
});
const heeftBestanden = heeftBasis && nieuweSets.length > 0 && nieuweSets.every(({ set }) => existsSync(join(DATA_MAP, set.bestand)));

const SOORTEN: readonly SoortBasis[] = ['bao', 'bubao'];
const doelen: Record<SoortBasis, DoelBasis[]> = { bao: [], bubao: [] };
if (heeftBestanden) {
  for (const { set, info } of nieuweSets) {
    const bestand = JSON.parse(readFileSync(join(DATA_MAP, set.bestand), 'utf8')) as MinimumdoelenSetBestand;
    doelen[info.soort].push(...doelenVanSet(bestand, info));
  }
}
const zoekdoelen: Record<SoortBasis, ZoekDoel[]> = { bao: doelen.bao.map(zoekDoelVan), bubao: doelen.bubao.map(zoekDoelVan) };

const overzicht = (soort: SoortBasis, leerjaar: LeerjaarBasis, schooljaar: Schooljaar): LeerjaarOverzicht =>
  leerjaarOverzicht(index, { soort, leerjaar }, schooljaar);
const idsVan = (lijst: readonly { set: { id: string } }[]): string[] => lijst.map((g) => g.set.id);
const vakNrs = (lijst: readonly { vak: { nr: number } }[]): number[] => lijst.map((r) => r.vak.nr);
/** De vakken zonder nieuwe set zijn KalenderVak-en zelf, met nr op het object. */
const nrsVan = (lijst: readonly { nr: number }[]): number[] => lijst.map((v) => v.nr);

const SCHOOLJAREN: readonly Schooljaar[] = [2025, 2026, 2027, 2028, 2029, 2030, 2031];

// ─── De tests ───────────────────────────────────────────────────────────────

describe.skipIf(GEGEVENSRUN)('de eigen ingang van het basisonderwijs op de echte gegevens', () => {
  // ── Wat geldt voor mijn leerjaar ─────────────────────────────────────────

  describe('wat geldt voor mijn leerjaar', () => {
    it.runIf(heeftBasis)('elk leerjaar werkt naar zijn eindmoment: alle nieuwe sets in het overzicht hebben dat eindmoment en geen set staat in twee lijsten', () => {
      let gecontroleerd = 0;
      for (const soort of SOORTEN) {
        for (const lj of LEERJAREN_BASIS) {
          for (const sj of SCHOOLJAREN) {
            const o = overzicht(soort, lj, sj);
            const nieuw = [...o.verplicht, ...o.magAl].flatMap((r) => r.sets);
            expect(o.eindmoment, `${soort} ${lj}`).toBe(WERKT_NAAR[lj]);
            for (const g of nieuw) expect(g.info.eindmoment, `${soort} ${lj} ${sj}: ${g.set.id}`).toBe(WERKT_NAAR[lj]);
            const alle = [...idsVan(nieuw), ...idsVan(o.oud), ...o.leeg.map((s) => s.id)];
            expect(new Set(alle).size, `${soort} ${lj} ${sj}: een set in twee lijsten`).toBe(alle.length);
            expect(o.aantalDoelen, `${soort} ${lj} ${sj}`).toBe(nieuw.reduce((som, g) => som + g.set.aantal, 0));
            gecontroleerd++;
          }
        }
      }
      expect(gecontroleerd).toBe(2 * 9 * 7);
    });

    it.runIf(heeftBasis)('de invariant over 126 leerjaren: elk vak heeft één status en één verplichtVanaf, en het eindmoment is WERKT_NAAR', () => {
      let leerjaren = 0;
      const afwijkingen: string[] = [];
      for (const soort of SOORTEN) {
        for (const lj of LEERJAREN_BASIS) {
          for (const sj of SCHOOLJAREN) {
            leerjaren++;
            const o = overzicht(soort, lj, sj);
            const perVak = new Map<number, Set<string>>();
            for (const r of [...o.verplicht, ...o.magAl]) {
              for (const g of r.sets) {
                perVak.set(r.vak.nr, (perVak.get(r.vak.nr) ?? new Set<string>()).add(`${g.invoering.status}|${g.invoering.verplichtVanaf ?? ''}`));
              }
            }
            for (const [nr, s] of perVak) if (s.size > 1) afwijkingen.push(`${soort} ${lj} ${sj} vak ${nr}: ${[...s].join(' en ')}`);
            // een vak staat in precies één van verplicht en mag al
            const nrs = [...vakNrs(o.verplicht), ...vakNrs(o.magAl)];
            if (new Set(nrs).size !== nrs.length) afwijkingen.push(`${soort} ${lj} ${sj}: een vak staat in verplicht en in mag al`);
          }
        }
      }
      expect(leerjaren).toBe(126);
      expect(afwijkingen).toEqual([]);
    });

    it.runIf(heeftBasis)('elk leerjaar heeft in elk schooljaar vanaf de invoering iets dat geldt: nieuwe doelen of oude doelen die nog gelden', () => {
      for (const soort of SOORTEN) {
        for (const lj of LEERJAREN_BASIS) {
          for (const sj of SCHOOLJAREN) {
            const o = overzicht(soort, lj, sj);
            expect(o.verplicht.length + o.magAl.length + o.oud.length, `${soort} ${lj} ${sj}`).toBeGreaterThan(0);
          }
        }
      }
    });

    it.runIf(momentopname)('momentopname: gewoon, 3de leerjaar, 2026: 3 verplicht (NL 72, WI 122, W&T 44), 6 mag al vanaf 2027, Frans zonder set, 7 oude sets, 368 doelen in 9 vakken', () => {
      const o = overzicht('bao', 'L3', 2026);
      expect(o.eindmoment).toBe('L4');
      expect(o.verplicht.map((r) => [r.vak.nr, r.aantal, idsVan(r.sets)])).toEqual([
        [1, 72, ['ODS_3395']],
        [2, 122, ['ODS_3406']],
        [3, 44, ['ODS_3408']],
      ]);
      expect(o.verplicht.map((r) => r.zekerheid)).toEqual(['waarschijnlijk', 'waarschijnlijk', 'waarschijnlijk']);
      expect(o.magAl.map((r) => [r.vak.nr, r.aantal, r.verplichtVanaf, r.zekerheid])).toEqual([
        [4, 21, 2027, 'waarschijnlijk'],
        [5, 19, 2027, 'waarschijnlijk'],
        [6, 38, 2027, 'waarschijnlijk'],
        [7, 16, 2027, 'waarschijnlijk'],
        [8, 9, 2027, 'waarschijnlijk'],
        [9, 27, 2027, 'waarschijnlijk'],
      ]);
      expect(o.magAl.reduce((som, r) => som + r.aantal, 0)).toBe(130);
      expect(nrsVan(o.zonderNieuweSet)).toEqual([10]);
      expect(idsVan(o.oud)).toEqual(['ODS_2108', 'ODS_2109', 'ODS_2111', 'ODS_2114', 'ODS_2115', 'ODS_2116', 'ODS_2117']);
      expect(o.leeg).toEqual([]);
      expect([o.aantalDoelen, o.aantalVakken, o.zekerheid]).toEqual([368, 9, 'waarschijnlijk']);
      expect(o.tussenstappen).toBe(true);
      const z = leerjaarZinnen(o);
      expect(z.verplichtKop).toBe('Dit schooljaar verplicht');
      expect(z.zonderNieuweSetZin).toBe('Frans heeft geen nieuwe doelen voor het einde van het 4de leerjaar.');
      expect(z.tussenstappenZin).toMatch(/leerplan van je net/);
    });

    it.runIf(momentopname)('momentopname: gewoon, 2de kleuterklas, 2026: NL 7 + 35, wiskunde twee sets, MV en LO zeker, AK, GE en ATT waarschijnlijk, oud ODS_2102, ODS_2103 en ODS_2107', () => {
      const o = overzicht('bao', 'K2', 2026);
      expect(o.eindmoment).toBe('K3');
      const nl = o.verplicht.find((r) => r.vak.nr === 1);
      expect(nl?.aantal).toBe(42);
      expect(idsVan(nl?.sets ?? [])).toEqual(['ODS_3397', 'ODS_3401']);
      expect(nl?.perSoort).toEqual([
        { soort: 'populatie', aantal: 7 },
        { soort: 'nastreven', aantal: 35 },
      ]);
      expect(nl?.zekerheid).toBe('zeker');
      const wi = o.verplicht.find((r) => r.vak.nr === 2);
      expect([wi?.aantal, idsVan(wi?.sets ?? [])]).toEqual([59, ['ODS_3404', 'ODS_3405']]);
      expect(o.verplicht.find((r) => r.vak.nr === 3)?.aantal).toBe(21);
      expect(o.verplicht.every((r) => r.zekerheid === 'zeker')).toBe(true);
      const mag = (nr: number) => o.magAl.find((r) => r.vak.nr === nr);
      expect([mag(6)?.zekerheid, mag(7)?.zekerheid]).toEqual(['zeker', 'zeker']);
      expect([mag(4)?.zekerheid, mag(5)?.zekerheid, mag(9)?.zekerheid]).toEqual(['waarschijnlijk', 'waarschijnlijk', 'waarschijnlijk']);
      expect(idsVan(o.oud)).toEqual(['ODS_2102', 'ODS_2103', 'ODS_2107']);
      expect(oudeDoelenWoord(o.oud)).toBe('ontwikkelingsdoelen');
      expect(o.aantalDoelen).toBe(208);
      expect(nrsVan(o.zonderNieuweSet)).toEqual([8, 10]);
    });

    it.runIf(momentopname)('momentopname: gewoon, 5de leerjaar, 2026: niets verplicht, 10 oude sets die gelden (eindtermen), 10 vakken mogen al', () => {
      const o = overzicht('bao', 'L5', 2026);
      expect(o.verplicht).toEqual([]);
      expect(idsVan(o.oud)).toEqual(['ODS_2108', 'ODS_2109', 'ODS_2110', 'ODS_2111', 'ODS_2112', 'ODS_2113', 'ODS_2114', 'ODS_2115', 'ODS_2116', 'ODS_2117']);
      expect(oudeDoelenWoord(o.oud)).toBe('eindtermen');
      expect(o.magAl.map((r) => [r.vak.nr, r.verplichtVanaf])).toEqual([
        [1, 2027],
        [2, 2027],
        [3, 2027],
        [4, 2029],
        [5, 2029],
        [6, 2029],
        [7, 2029],
        [8, 2029],
        [9, 2029],
        [10, 2029],
      ]);
      expect(o.aantalDoelen).toBe(422);
      const z = leerjaarZinnen(o);
      expect(z.verplichtKop).toBe('Dit schooljaar zijn nog geen nieuwe doelen verplicht');
      expect(z.geenVerplichtZin).toBe('Voor dit leerjaar gelden dit schooljaar nog de oude eindtermen (hieronder).');
    });

    it.runIf(momentopname)('momentopname: buitengewoon, 3de leerjaar, 2026: onzeker, alles na te streven, ODS_3465, ODS_3467 en ODS_3469, de lege set ODS_2959', () => {
      const o = overzicht('bubao', 'L3', 2026);
      expect(o.zekerheid).toBe('onzeker');
      expect(o.alleNastreven).toBe(true);
      expect(o.verplicht.flatMap((r) => idsVan(r.sets))).toEqual(['ODS_3465', 'ODS_3467', 'ODS_3469']);
      expect(o.leeg.map((s) => s.id)).toEqual(['ODS_2959']);
      expect(o.oud.length).toBe(22);
      expect(o.aantalDoelen).toBe(368);
    });

    it.runIf(heeftBasis)('H6: het 4de leerjaar in 2026 toont de zin over het getuigschrift, gewoon en buitengewoon', () => {
      const o = overzicht('bao', 'L4', 2026);
      expect(o.opmerkingen.some((t) => /getuigschrift/.test(t))).toBe(true);
      // Het 4de leerjaar is het eindmoment zelf: geen tussenstappen.
      expect(o.tussenstappen).toBe(false);
      expect(leerjaarZinnen(o).tussenstappenZin).toBeUndefined();
      // Het buitengewoon volgt de kalender van het gewoon onderwijs, en dat zegt de opmerking.
      const b = overzicht('bubao', 'L3', 2026);
      expect(b.opmerkingen.some((t) => /kalender van het gewoon basisonderwijs/.test(t))).toBe(true);
    });

    it.runIf(heeftBasis)('H6: een leerjaar vóór zijn eindmoment zegt dat het leerplan van het net de tussenstappen vastlegt, en alleen dan', () => {
      for (const soort of SOORTEN) {
        for (const lj of LEERJAREN_BASIS) {
          const o = overzicht(soort, lj, 2026);
          expect(o.tussenstappen, `${soort} ${lj}`).toBe(lj !== WERKT_NAAR[lj]);
          expect(leerjaarZinnen(o).tussenstappenZin !== undefined, `${soort} ${lj}`).toBe(lj !== WERKT_NAAR[lj]);
        }
      }
    });

    it.runIf(heeftBasis)('H5: geen lege kopjes. De zinnen en kopjes volgen de lijsten, in elk schooljaar, soort en leerjaar', () => {
      for (const soort of SOORTEN) {
        for (const lj of LEERJAREN_BASIS) {
          for (const sj of SCHOOLJAREN) {
            const o = overzicht(soort, lj, sj);
            const z = leerjaarZinnen(o);
            const wie = `${soort} ${lj} ${sj}`;
            // 'Mag al' heeft een zin alleen met een lijst, en de zin over oude doelen alleen als die lijst bestaat.
            expect(z.magAlZin !== undefined, wie).toBe(o.magAl.length > 0 && o.oud.length > 0);
            expect(z.geenVerplichtZin !== undefined, wie).toBe(o.verplicht.length === 0 && o.oud.length > 0);
            // Is alles verplicht, dan staat dat er als zin in plaats van een lege kop.
            expect(z.alleVerplichtZin !== undefined, wie).toBe(o.verplicht.length > 0 && o.magAl.length === 0);
            expect(z.alleVerplichtZin === undefined || z.alleVerplichtZin === 'Alle vakken zijn dit schooljaar verplicht.', wie).toBe(true);
            expect(z.verplichtKop, wie).toBe(o.verplicht.length > 0 ? 'Dit schooljaar verplicht' : 'Dit schooljaar zijn nog geen nieuwe doelen verplicht');
          }
        }
      }
    });

    it.runIf(heeftBasis)('H5: in 2027, 2029 en 2031 zegt elk leerjaar waarvoor alles verplicht is dat in één zin, en het gewoon onderwijs heeft dan geen oude doelen meer', () => {
      let volledig = 0;
      for (const sj of [2027, 2029, 2031] as const) {
        for (const soort of SOORTEN) {
          for (const lj of LEERJAREN_BASIS) {
            const o = overzicht(soort, lj, sj);
            if (o.magAl.length > 0) continue;
            volledig++;
            // Het buitengewoon onderwijs houdt oude sets zonder einddatum: daar blijft de lijst met oude doelen bestaan.
            if (soort === 'bao') expect(o.oud, `${soort} ${lj} ${sj}`).toEqual([]);
            expect(leerjaarZinnen(o).alleVerplichtZin, `${soort} ${lj} ${sj}`).toBe('Alle vakken zijn dit schooljaar verplicht.');
          }
        }
      }
      expect(volledig).toBeGreaterThan(0);
    });

    it.runIf(momentopname)('momentopname H5: in 2027, 2029 en 2031 heeft het gewoon onderwijs voor de kleuterklas en de eerste leerjaren niets meer te laten zien dan wat verplicht is', () => {
      for (const sj of [2027, 2029, 2031] as const) {
        for (const lj of ['K1', 'K2', 'K3', 'L1', 'L2'] as const) {
          const o = overzicht('bao', lj, sj);
          expect([o.magAl.length, o.oud.length], `bao ${lj} ${sj}`).toEqual([0, 0]);
          expect(o.verplicht.length, `bao ${lj} ${sj}`).toBeGreaterThan(0);
        }
      }
      // 2031: alles is verplicht, voor elk leerjaar.
      for (const soort of SOORTEN) for (const lj of LEERJAREN_BASIS) expect(overzicht(soort, lj, 2031).magAl, `${soort} ${lj}`).toEqual([]);
    });

    it.runIf(heeftBasis)('H11: geen zin die het model niet staaft. Geen "tot dan gelden de oude eindtermen" en geen zin over Frans die in een vak vooruitloopt', () => {
      for (const soort of SOORTEN) {
        for (const lj of LEERJAREN_BASIS) {
          for (const sj of SCHOOLJAREN) {
            const z = leerjaarZinnen(overzicht(soort, lj, sj));
            const alle = Object.values(z).join(' ');
            expect(alle, `${soort} ${lj} ${sj}`).not.toMatch(/Tot dan gelden/);
            expect(alle, `${soort} ${lj} ${sj}`).not.toMatch(/alleen doelen voor het einde van het 6de leerjaar/);
          }
        }
      }
    });

    it.runIf(heeftBasis)('H10: het overzicht koppelt geen oude set aan een nieuwe: een oude set heeft geen vak en staat nooit in verplicht of mag al', () => {
      for (const soort of SOORTEN) {
        for (const lj of LEERJAREN_BASIS) {
          const o = overzicht(soort, lj, 2026);
          for (const g of o.oud) expect(g.info.generatie, g.set.id).toBe('oud');
          for (const g of [...o.verplicht, ...o.magAl].flatMap((r) => r.sets)) expect(g.info.generatie, g.set.id).toBe('nieuw');
        }
      }
    });
  });

  // ── De leerlijn ──────────────────────────────────────────────────────────

  describe('de leerlijn van een vak', () => {
    const perVak = (soort: SoortBasis): Map<number, DoelBasis[]> => {
      const uit = new Map<number, DoelBasis[]>();
      for (const d of doelen[soort]) uit.set(d.vak, [...(uit.get(d.vak) ?? []), d]);
      return uit;
    };

    it.runIf(heeftBestanden)('elk doel staat precies één keer in de leerlijn van zijn vak, in de cel van zijn eindmoment, subthema en onderwerp, en de cellen staan op code', () => {
      for (const soort of SOORTEN) {
        let gezien = 0;
        for (const [vak, lijst] of perVak(soort)) {
          const ids = new Set<string>();
          for (const o of leerlijnVanVak(lijst)) {
            expect(o.nr.startsWith(`${vak}.`), `${soort} ${o.nr}`).toBe(true);
            for (const m of EINDMOMENTEN) {
              const inRijen = o.rijen.reduce((som, r) => som + r.cellen[m].length, 0);
              expect(inRijen, `${soort} ${o.nr} ${m}`).toBe(o.aantal[m]);
            }
            for (const r of o.rijen) {
              for (const m of EINDMOMENTEN) {
                const cel = r.cellen[m];
                for (let i = 0; i < cel.length; i++) {
                  const d = cel[i];
                  gezien++;
                  expect(ids.has(`${d.setId}|${d.id}`), `${soort} ${d.id} komt twee keer voor`).toBe(false);
                  ids.add(`${d.setId}|${d.id}`);
                  expect([d.eind, d.onderwerpNr, d.subthema], d.id).toEqual([m, o.nr, r.subthema]);
                  if (i > 0) expect(codeVergelijk(cel[i - 1].code, d.code), `${soort} ${d.id}`).toBeLessThanOrEqual(0);
                }
              }
            }
          }
          expect(ids.size, `${soort} vak ${vak}`).toBe(lijst.length);
        }
        expect(gezien, soort).toBe(doelen[soort].length);
      }
    });

    it.runIf(heeftBestanden)('een onderwerp heeft overal dezelfde naam, en het gewoon en het buitengewoon hebben dezelfde onderwerpen en dezelfde doel-id\'s', () => {
      const namen = (soort: SoortBasis) => {
        const uit = new Map<string, Set<string>>();
        for (const d of doelen[soort]) uit.set(d.onderwerpNr, (uit.get(d.onderwerpNr) ?? new Set<string>()).add(d.onderwerp));
        return uit;
      };
      for (const soort of SOORTEN) {
        const conflicten = [...namen(soort)].filter(([, s]) => s.size > 1).map(([nr, s]) => `${nr}: ${[...s].join(' / ')}`);
        expect(conflicten, soort).toEqual([]);
      }
      expect([...namen('bubao').keys()].sort(), 'onderwerpen').toEqual([...namen('bao').keys()].sort());
      const ids = (soort: SoortBasis) => [...new Set(doelen[soort].map((d) => d.id))].sort();
      expect(ids('bubao')).toEqual(ids('bao'));
    });

    it.runIf(heeftBestanden)('de subthema\'s van een vak op één moment staan aaneengesloten als de doelen op code staan, en zijn per onderwerp één rij', () => {
      for (const soort of SOORTEN) {
        for (const [vak, lijst] of perVak(soort)) {
          for (const o of leerlijnVanVak(lijst)) {
            const namen = o.rijen.map((r) => r.subthema ?? '');
            expect(new Set(namen).size, `${soort} vak ${vak} onderwerp ${o.nr}: een subthema staat in twee rijen`).toBe(namen.length);
          }
        }
      }
    });

    it.runIf(heeftBestanden && momentopname)('momentopname: 998 id\'s, 48 onderwerpen, 124 rijen, 322 cellen waarvan 29 leeg, de grootste cel 15, voor gewoon en voor buitengewoon', () => {
      for (const soort of SOORTEN) {
        let onderwerpen = 0;
        let rijen = 0;
        let cellen = 0;
        let leeg = 0;
        let max = 0;
        for (const [vak, lijst] of perVak(soort)) {
          const momenten = Object.keys(setsVanVak(index, soort, vak)) as Eindmoment[];
          for (const o of leerlijnVanVak(lijst)) {
            onderwerpen++;
            for (const r of o.rijen) {
              rijen++;
              for (const m of momenten) {
                cellen++;
                if (r.cellen[m].length === 0) leeg++;
                max = Math.max(max, r.cellen[m].length);
              }
            }
          }
        }
        expect(new Set(doelen[soort].map((d) => d.id)).size, `${soort} id's`).toBe(998);
        expect([onderwerpen, rijen, cellen, leeg, max], soort).toEqual([48, 124, 322, 29, 15]);
      }
    });

    it.runIf(heeftBestanden && momentopname)('momentopname: de rubriek van doel 92767 (3.5.4) heeft 5 doelen bij het einde van de kleuterklas, 7 bij het 4de en 7 bij het 6de leerjaar', () => {
      const wt = doelen.bao.filter((d) => d.vak === 3);
      const doel = wt.find((d) => d.id === '92767' && d.setId === 'ODS_3408');
      expect(doel?.code).toBe('3.5.4');
      expect(doel?.eind).toBe('L4');
      const r = zelfdeRubriek(doel as DoelBasis, wt);
      expect(r.niveau).toBe('onderwerp');
      expect([r.per.K3.length, r.per.L4.length, r.per.L6.length]).toEqual([5, 7, 7]);
      expect(r.per.L4.some((d) => d.id === '92767')).toBe(true);
      const l = leerlijnVanVak(wt).find((o) => o.nr === '3.5');
      expect(l?.naam).toBe('Natuurkundige verschijnselen');
    });

    it.runIf(heeftBestanden && momentopname)('momentopname: wetenschap en techniek heeft 7 onderwerpen in de leerlijn van het gewoon onderwijs', () => {
      expect(leerlijnVanVak(doelen.bao.filter((d) => d.vak === 3))).toHaveLength(7);
    });
  });

  // ── De doeltekst van alle doelen ─────────────────────────────────────────

  describe('de doeltekst', () => {
    interface Telling {
      breuk: number;
      beeld: number;
      link: number;
      genest: number;
      kennis: number;
      haakjes: string[];
      tagResten: string[];
      zeroBreedte: string[];
      slechteLinks: string[];
    }
    function inline(kids: readonly Inline[], t: Telling): void {
      for (const x of kids) {
        if (x.t === 'breuk') t.breuk++;
        else if (x.t === 'beeld') t.beeld++;
        else if (x.t === 'kennis') t.kennis++;
        else if (x.t === 'link') {
          t.link++;
          if (x.href !== undefined && !x.href.startsWith('https:')) t.slechteLinks.push(x.href);
        }
        if ('kids' in x) inline(x.kids, t);
      }
    }
    function blokken(bs: readonly Blok[], diepte: number, t: Telling): number {
      let max = diepte;
      for (const b of bs) {
        if (b.t === 'lijst') for (const item of b.items) max = Math.max(max, blokken(item, diepte + 1, t));
        else inline(b.kids, t);
      }
      return max;
    }
    /** Telt de doeltekst van alle doelen. De doelzin en de uitbreiding samen, zoals de app ze toont. */
    function tel(lijst: readonly DoelBasis[], metWoordenschat: boolean): Telling & { genesteDoelen: string[] } {
      const t: Telling & { genesteDoelen: string[] } = { breuk: 0, beeld: 0, link: 0, genest: 0, kennis: 0, haakjes: [], tagResten: [], zeroBreedte: [], slechteLinks: [], genesteDoelen: [] };
      for (const d of lijst) {
        const delen = [d.doelzinHtml + (d.uitbreidingHtml ? `\n${d.uitbreidingHtml}` : ''), ...(metWoordenschat && d.woordenschatHtml ? [d.woordenschatHtml] : [])];
        for (const html of delen) {
          const bs = doeltekstBlokken(html);
          const tekst = blokkenAlsTekst(bs);
          if (/<\/?[a-z][a-z0-9]*[\s>/]/i.test(tekst)) t.tagResten.push(d.id);
          if (/[<>]/.test(tekst)) t.haakjes.push(d.id);
          if (/\u200B/.test(tekst)) t.zeroBreedte.push(d.id);
          if (blokken(bs, 0, t) >= 2) {
            t.genest++;
            t.genesteDoelen.push(d.id);
          }
        }
      }
      return t;
    }

    it.runIf(heeftBestanden)('geen doel houdt een tag, een onzichtbaar teken of een onveilige link over, voor gewoon en buitengewoon, met de woordenschat erbij', () => {
      for (const soort of SOORTEN) {
        const t = tel(doelen[soort], true);
        expect(t.tagResten, `${soort}: doelen met een overgebleven tag`).toEqual([]);
        expect(t.zeroBreedte, `${soort}: doelen met U+200B`).toEqual([]);
        expect(t.slechteLinks, `${soort}: links die niet met https: beginnen`).toEqual([]);
      }
    });

    it.runIf(heeftBestanden)('geen doel is leeg na het omzetten, en de doelzin blijft letterlijk: de platte tekst bevat de woorden van de bron', () => {
      for (const d of doelen.bao) {
        const tekst = blokkenAlsTekst(doeltekstBlokken(d.doelzinHtml));
        expect(tekst.trim().length, `${d.setId} ${d.id}`).toBeGreaterThan(0);
        // Elk woord van minstens 6 letters dat in de html van de doelzin staat (buiten tags), staat ook in de tekst.
        const kaal = d.doelzinHtml.replace(/<[^>]*>/g, ' ');
        const woorden = (kaal.match(/[A-Za-zÀ-ÿ]{6,}/g) ?? []).filter((w) => !/&/.test(w));
        for (const w of woorden) expect(tekst, `${d.setId} ${d.id}: ${w}`).toContain(w);
      }
    });

    it.runIf(heeftBestanden && momentopname)('momentopname: 998 doelen van het gewoon onderwijs met 55 breuken, 14 doelen met geneste lijsten, 3 beelden en 6 links, en alleen 93407 houdt < of >', () => {
      expect(doelen.bao).toHaveLength(998);
      const t = tel(doelen.bao, false);
      expect(t.breuk).toBe(55);
      expect(t.genest).toBe(14);
      expect(t.beeld).toBe(3);
      expect(t.link).toBe(6);
      expect(t.kennis).toBe(152);
      expect([...new Set(t.haakjes)]).toEqual(['93407']);
    });

    it.runIf(heeftBestanden && momentopname)('momentopname: doel 93177 heeft 1/10 en 1/100 als breuk en geen math-tag in de tekst', () => {
      const d = doelen.bao.find((x) => x.id === '93177');
      expect(d?.setId).toBe('ODS_3406');
      const tekst = blokkenAlsTekst(doeltekstBlokken(`${d?.doelzinHtml}${d?.uitbreidingHtml ? `\n${d.uitbreidingHtml}` : ''}`));
      expect(tekst).not.toMatch(/<math|mfrac/);
      const t = tel([d as DoelBasis], false);
      expect(t.breuk).toBe(2);
    });
  });

  // ── Zoeken ───────────────────────────────────────────────────────────────

  describe('zoeken', () => {
    const zoek = (q: string, soort: SoortBasis = 'bao', eind?: Eindmoment, woorden: Zoekwoorden = ZOEKWOORDEN) => {
      const v = leesVraag(q, woorden);
      if (eind && !v.eind) v.eind = [eind];
      return zoekDoelen(zoekdoelen[soort], v, eind ? { eigenEind: eind } : {});
    };
    const lijst = (u: ReturnType<typeof zoek>): string[] => [...u.treffers, ...u.deels].map((t) => t.doel.id);

    it.runIf(heeftBestanden)('H3: schaduw, schaduw onderzoeken, schaduw maken en licht en schaduw geven 92767 in de top 3 bij het einde van het 4de leerjaar', () => {
      for (const q of ['schaduw', 'schaduw onderzoeken', 'schaduw maken', 'licht en schaduw']) {
        const plek = lijst(zoek(q, 'bao', 'L4')).indexOf('92767') + 1;
        expect(plek, `${q}: 92767 staat op plaats ${plek || 'niet gevonden'}`).toBeGreaterThanOrEqual(1);
        expect(plek, `${q}: 92767 staat op plaats ${plek}`).toBeLessThanOrEqual(3);
      }
    });

    it.runIf(heeftBestanden)('H3: schaduw voor een 3de leerjaar geeft 92767 eerst, in de groep wetenschap en techniek met natuurkundige verschijnselen, met "Ook gezocht op"', () => {
      const u = zoek('schaduw', 'bao', 'L4');
      expect(u.treffers[0]?.doel.id).toBe('92767');
      expect(u.treffers[0]?.doel.code).toBe('3.5.4');
      expect(u.groepen[0]).toMatchObject({ vak: 3, onderwerp: 'Natuurkundige verschijnselen' });
      expect(u.groepen[0].treffers[0].doel.id).toBe('92767');
      expect(u.ookGezocht.length).toBeGreaterThan(0);
      // Een regel van de tabel is zichtbaar als 'Ook gezocht op', nooit stil.
      expect(u.treffers[0].viaTabel.length).toBeGreaterThan(0);
    });

    it.runIf(heeftBestanden)('H3: zoeken rangschikt. Doelen met alle woorden staan vóór doelen met een deel, en bij 5 of meer treffers volgt geen deel', () => {
      for (const q of ['schaduw onderzoeken', 'licht schaduw', 'breuken optellen', 'dieren planten', 'zingen dansen']) {
        const u = zoek(q);
        const n = u.vraag.termen.length;
        for (const t of u.treffers) expect(t.termen, q).toBe(n);
        for (const t of u.deels) expect(t.termen, q).toBeLessThan(n);
        if (u.treffers.length >= 5) expect(u.deels, q).toEqual([]);
        // best eerst: het aantal termen daalt niet, en bij gelijke termen daalt de score niet
        for (let i = 1; i < u.treffers.length; i++) expect(u.treffers[i - 1].score, `${q} plaats ${i}`).toBeGreaterThanOrEqual(u.treffers[i].score);
        for (let i = 1; i < u.deels.length; i++) expect(u.deels[i - 1].termen, `${q} deel ${i}`).toBeGreaterThanOrEqual(u.deels[i].termen);
      }
    });

    it.runIf(heeftBestanden)('zoekwoorden passen op woordbegin en nooit midden in een woord; woorden van 4 letters of minder alleen als heel woord (zonder de woordentabel)', () => {
      const tekstVan = (d: ZoekDoel): string => normaal([d.doelzin, d.onderwerp, d.subthema ?? '', d.uitbreiding ?? '', d.woordenschat ?? ''].join(' '));
      // 'weer' (4 letters) alleen als heel woord, met een buiging: niet weergeven. 'licht' (5 letters) op woordbegin: lichtbron wel, toelichten niet.
      const eisen: [string, RegExp][] = [
        ['weer', /(^| )weer(e|en|n|s|es)?( |$)/],
        ['licht', /(^| )licht/],
      ];
      for (const [woord, regel] of eisen) {
        const u = zoek(woord, 'bao', undefined, { ...ZOEKWOORDEN, ook: {} });
        expect(u.treffers.length, woord).toBeGreaterThan(0);
        for (const t of u.treffers) expect(regel.test(tekstVan(t.doel)), `${woord}: ${t.doel.id} bevat het woord niet zoals de regel eist`).toBe(true);
      }
    });

    it.runIf(heeftBestanden)('"wiskunde breuken" heeft de chip Wiskunde en alleen doelen van vak 2; "breuken 6de leerjaar" alleen doelen van het einde van het 6de leerjaar', () => {
      const w = zoek('wiskunde breuken');
      expect(w.vraag.vakken).toEqual([2]);
      expect(w.vraag.filters).toContain('wiskunde');
      expect(w.treffers.length).toBeGreaterThan(0);
      for (const t of w.treffers) expect(t.doel.vak, t.doel.id).toBe(2);
      const b = zoek('breuken 6de leerjaar');
      expect(b.vraag.eind).toEqual(['L6']);
      expect(b.treffers.length).toBeGreaterThan(0);
      for (const t of b.treffers) expect(t.doel.eind, t.doel.id).toBe('L6');
    });

    it.runIf(heeftBestanden)('een vakwoord alleen geeft de doelen van dat vak per moment, een doelnummer dat doel en een code die code op elk moment', () => {
      const taal = zoek('taal');
      expect(taal.alleenVak).toBe(true);
      expect(taal.vraag.vakken).toEqual([1]);
      expect(taal.treffers.every((t) => t.doel.vak === 1)).toBe(true);
      expect(new Set(taal.treffers.map((t) => t.doel.eind))).toEqual(new Set(EINDMOMENTEN));
      const id = zoek('92767');
      expect(id.treffers.map((t) => t.doel.id)).toEqual(['92767']);
      expect(id.treffers[0].doel.code).toBe('3.5.4');
      const code = zoek('3.5.4');
      expect(code.treffers.length).toBeGreaterThan(0);
      expect(code.treffers.every((t) => t.doel.code === '3.5.4' || t.doel.code.startsWith('3.5.4.'))).toBe(true);
      expect(code.treffers.some((t) => t.doel.id === '92767')).toBe(true);
      // een vraag met alleen stopwoorden geeft de hulpzin, geen treffers
      const stop = zoek('de kinderen van het');
      expect([stop.leeg, stop.treffers.length]).toEqual([true, 0]);
    });

    it.runIf(heeftBestanden)('H10: "wo" en "wereldoriëntatie" zijn geen vakwoord en worden niet aan een vak gekoppeld', () => {
      for (const q of ['wo', 'wereldorientatie', 'wereldoriëntatie']) expect(leesVraag(q, ZOEKWOORDEN).vakken, q).toBeUndefined();
    });

    it.runIf(heeftBestanden && momentopname)('momentopname: "wiskunde breuken" 29 treffers, "breuken 6de leerjaar" 19, "rijmen" 92930, 92959 en 92960, "weer" zonder 93039, "persoonsvorm" hoogstens 4', () => {
      expect(zoek('wiskunde breuken').treffers).toHaveLength(29);
      expect(zoek('breuken 6de leerjaar').treffers).toHaveLength(19);
      expect(zoek('rijmen').treffers.map((t) => t.doel.id).sort()).toEqual(['92930', '92959', '92960']);
      expect(lijst(zoek('weer'))).not.toContain('93039');
      expect(zoek('persoonsvorm').treffers.length).toBeLessThanOrEqual(4);
      expect(zoek('persoonsvorm').treffers.length).toBeGreaterThan(0);
    });

    it.runIf(heeftBestanden && momentopname)('momentopname: "schaduw" vindt 92767 ook zonder moment, en "licht" bij het einde van het 4de leerjaar zet 92767 eerst', () => {
      expect(lijst(zoek('schaduw')).includes('92767')).toBe(true);
      expect(zoek('licht', 'bao', 'L4').treffers[0].doel.id).toBe('92767');
    });

    it.runIf(heeftBestanden)('de bevroren toets: elk goud id staat in de doelen van het gewoon onderwijs, en elke vraag levert zonder fout een uitslag', () => {
      const toets = JSON.parse(readFileSync(new URL('./zoektoets.json', import.meta.url), 'utf8')) as { vragen: { q: string; goud: string[] }[] };
      const ids = new Set(doelen.bao.map((d) => d.id));
      expect(toets.vragen).toHaveLength(66);
      for (const v of toets.vragen) {
        for (const g of v.goud) expect(ids.has(g), `${v.q}: goud ${g}`).toBe(true);
        expect(() => zoek(v.q), v.q).not.toThrow();
      }
    });

    it.runIf(heeftBestanden)('het buitengewoon onderwijs vindt dezelfde doelen: 92767 staat ook daar bij schaduw in de top 3', () => {
      const plek = lijst(zoek('schaduw', 'bubao', 'L4')).indexOf('92767') + 1;
      expect(plek).toBeGreaterThanOrEqual(1);
      expect(plek).toBeLessThanOrEqual(3);
    });
  });

  // ── De kalender en de ingang ─────────────────────────────────────────────

  describe('de kalender en de ingang', () => {
    it.runIf(heeftBasis)('de tien vakken van de kalender hebben elk een nieuwe set, en bij elk eindmoment staan de vakken van de index in het overzicht van elk leerjaar dat ernaartoe werkt', () => {
      expect(INVOERINGSKALENDER.vakken).toHaveLength(10);
      for (const soort of SOORTEN) {
        const nrs = new Set(nieuweSets.filter((x) => x.info.soort === soort).map((x) => x.info.vak?.nr));
        for (const v of INVOERINGSKALENDER.vakken) expect(nrs.has(v.nr), `${soort} vak ${v.nr}`).toBe(true);
        for (const lj of LEERJAREN_BASIS) {
          const o = overzicht(soort, lj, 2031);
          const metSet = new Set(nieuweSets.filter((x) => x.info.soort === soort && x.info.eindmoment === WERKT_NAAR[lj]).map((x) => x.info.vak?.nr));
          expect(new Set([...vakNrs(o.verplicht), ...vakNrs(o.magAl), ...nrsVan(o.zonderNieuweSet)]), `${soort} ${lj}`).toEqual(new Set(INVOERINGSKALENDER.vakken.map((v) => v.nr)));
          expect(nrsVan(o.zonderNieuweSet).some((nr) => metSet.has(nr)), `${soort} ${lj}`).toBe(false);
        }
      }
    });

    it.runIf(momentopname)('momentopname: de vakken zonder nieuwe set zijn ICT en Frans bij het einde van de kleuterklas, Frans bij het einde van het 4de leerjaar en geen bij het einde van het 6de', () => {
      for (const soort of SOORTEN) {
        expect(nrsVan(overzicht(soort, 'K3', 2026).zonderNieuweSet), `${soort} K3`).toEqual([8, 10]);
        expect(nrsVan(overzicht(soort, 'L2', 2026).zonderNieuweSet), `${soort} L2`).toEqual([10]);
        expect(nrsVan(overzicht(soort, 'L6', 2026).zonderNieuweSet), `${soort} L6`).toEqual([]);
      }
    });

    it.runIf(heeftBasis)('het overzicht kijkt alleen naar de index: de eindmomenten van de leerjaren zijn K3, L4 en L6', () => {
      const eind = new Set<Eindmoment>(LEERJAREN_BASIS.map((lj) => WERKT_NAAR[lj]));
      expect(eind).toEqual(new Set(EINDMOMENTEN));
    });
  });
});
