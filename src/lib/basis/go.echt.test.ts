// De leerplandoelen en lesplannen van het GO!, getoetst aan de echte minimumdoelen (pakket G5 van
// docs/basisonderwijs/GO-LEERPLAN.md).
//
// Dit bestand legt de gegevens in public/basis/go naast de minimumdoelen van de overheid in
// public/leerplannen/minimumdoelen. De tekst van een minimumdoel staat nooit in public/basis/go: alleen de sleutel
// (set + vast nummer + code). Deze test bewaakt dat die sleutels nog bestaan, ook als de maandelijkse ophaling nieuwe
// minimumdoelen binnenhaalt.
//
// Drie afspraken, zoals in momentmodel.echt.test.ts:
// - Wacht. Ontbreken de gegevens van het basisonderwijs (de index van vóór PR #11), dan slaat alles over.
// - GEGEVENSRUN=1 slaat elke test in dit bestand over. De maandelijkse ophaling (.github/workflows/minimumdoelen.yml)
//   zet dat voor de gewone testrun. De deploy-workflow zet het niet en draait deze tests streng.
// - De aantallen zijn een momentopname van de index van 1 november 2026 (1096 sets) en van de import van 9 november
//   2026 (met het voorstel bij WI.706 van 11 november 2026). Groeit of krimpt de index, dan slaan alleen die aantallen
//   over; alle verbanden blijven gelden.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MinimumdoelenIndexSet, MinimumdoelenSetBestand } from '../minimumdoelen';
import { controleerTweelingen, maakOpzoektabel, vakVanCode, type Opzoektabel } from './go/koppelen';
import { EINDMOMENT_VAN_GO_MOMENT } from './go/leeftijden';
import { vormVanVoorstel } from './go/goModel';
import { bubaoSetVan } from './go/tweeling';
import type { GoIndex, GoLeerplanBestand, GoMinimumdoelRef } from './go/types';
import { splitsCodes } from './go/valideer';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const MINIMUMDOELEN_MAP = join(REPO, 'public', 'leerplannen', 'minimumdoelen');
const GO_MAP = join(REPO, 'public', 'basis', 'go');
const GEGEVENSRUN = process.env.GEGEVENSRUN === '1';

const index: MinimumdoelenIndexSet[] = (() => {
  const pad = join(MINIMUMDOELEN_MAP, 'index.json');
  if (GEGEVENSRUN || !existsSync(pad)) return [];
  return (JSON.parse(readFileSync(pad, 'utf8')) as { sets: MinimumdoelenIndexSet[] }).sets;
})();

const heeftBasis = index.some((s) => s.id === 'ODS_3395');
const heeftGo = !GEGEVENSRUN && existsSync(join(GO_MAP, 'index.json'));
const klaar = heeftBasis && heeftGo;
// De aantallen horen bij de index van 1 november 2026.
const momentopname = klaar && index.length === 1096;

const lees = <T>(pad: string): T => JSON.parse(readFileSync(pad, 'utf8')) as T;

const setCache = new Map<string, MinimumdoelenSetBestand | undefined>();
const laadSet = (s: MinimumdoelenIndexSet): MinimumdoelenSetBestand | undefined => {
  if (!setCache.has(s.id)) {
    const pad = join(MINIMUMDOELEN_MAP, s.bestand);
    setCache.set(s.id, /^[A-Za-z0-9_.-]+\.json$/.test(s.bestand) && existsSync(pad) ? lees<MinimumdoelenSetBestand>(pad) : undefined);
  }
  return setCache.get(s.id);
};

const go: GoIndex | undefined = klaar ? lees<GoIndex>(join(GO_MAP, 'index.json')) : undefined;
const leerplannen: GoLeerplanBestand[] = go ? go.leerplan.map((l) => lees<GoLeerplanBestand>(join(GO_MAP, l.bestand))) : [];

const opzoek: { tabel: Opzoektabel; meldingen: string[] } | undefined = klaar ? maakOpzoektabel(index, laadSet) : undefined;

/** Elke ref in de leerplannen: bij de doelzin en bij MIA- en voorbeeldrijen, met het doel waar ze staan. */
interface RefMetDoel {
  doel: string;
  ref: GoMinimumdoelRef;
}
const alleRefs: RefMetDoel[] = leerplannen.flatMap((l) =>
  l.doelen.flatMap((d) => [
    ...d.minimumdoelen.refs.map((ref) => ({ doel: d.code, ref })),
    ...d.inhoud.flatMap((i) => ('koppeling' in i && i.koppeling ? i.koppeling.refs.map((ref) => ({ doel: `${d.code} (${i.soort})`, ref })) : [])),
  ]),
);

describe.skipIf(GEGEVENSRUN)('het GO! leerplan op de echte minimumdoelen', () => {
  it.runIf(klaar)('de minimumdoelen van het basisonderwijs zijn volledig aanwezig', () => {
    expect(opzoek?.meldingen).toEqual([]);
  });

  it.runIf(klaar)('er zijn refs om te controleren', () => {
    expect(alleRefs.length).toBeGreaterThan(0);
  });

  it.runIf(klaar)('elke ref bestaat nog in public/leerplannen/minimumdoelen, met dezelfde code', () => {
    const slecht: string[] = [];
    for (const { doel, ref } of alleRefs) {
      const kop = index.find((s) => s.id === ref.set);
      const set = kop ? laadSet(kop) : undefined;
      const gevonden = set?.doelen.find((d) => String(d.id).trim() === ref.id);
      if (!gevonden) slecht.push(`${doel}: ${ref.set}/${ref.id} bestaat niet meer`);
      else if (String(gevonden.code).trim() !== ref.code) slecht.push(`${doel}: ${ref.set}/${ref.id} heeft nu code ${String(gevonden.code)}, niet ${ref.code}`);
    }
    expect(slecht).toEqual([]);
  });

  it.runIf(klaar)('elke ref staat in een nieuwe gewone set van het juiste vak en eindmoment', () => {
    const tabel = (opzoek as { tabel: Opzoektabel }).tabel;
    const slecht: string[] = [];
    for (const { doel, ref } of alleRefs) {
      const vak = vakVanCode(ref.code);
      const eind = EINDMOMENT_VAN_GO_MOMENT[ref.moment];
      const sets = tabel.sets().find((s) => s.vak === vak && s.eind === eind)?.sets ?? [];
      if (!sets.includes(ref.set)) slecht.push(`${doel}: ${ref.set} is geen nieuwe gewone set van vak ${String(vak)} bij ${eind}`);
      // En de code vindt op dat moment precies dit doel.
      if (!tabel.zoek(ref.moment, ref.code).some((k) => k.set === ref.set && k.id === ref.id)) slecht.push(`${doel}: ${ref.moment} ${ref.code} vindt ${ref.set}/${ref.id} niet`);
    }
    expect(slecht).toEqual([]);
  });

  it.runIf(klaar)('elke officiële ref is eenduidig: op dat moment vindt de code precies één doel', () => {
    const tabel = (opzoek as { tabel: Opzoektabel }).tabel;
    const slecht = alleRefs.filter(({ ref }) => ref.status === 'officieel' && tabel.zoek(ref.moment, ref.code).length !== 1).map(({ doel, ref }) => `${doel}: ${ref.moment} ${ref.code}`);
    expect(slecht).toEqual([]);
  });

  it.runIf(momentopname)('29 gewone sets hebben precies één tweeling in het buitengewoon (ODS_3408 → ODS_3469, ODS_3410 → ODS_3460)', () => {
    const kaart = bubaoSetVan(index);
    expect(kaart.size).toBe(29);
    expect(kaart.get('ODS_3408')).toBe('ODS_3469');
    expect(kaart.get('ODS_3410')).toBe('ODS_3460');
  });

  it.runIf(klaar)('elke tweeling in het buitengewoon onderwijs heeft hetzelfde nummer en dezelfde code', () => {
    const tabel = (opzoek as { tabel: Opzoektabel }).tabel;
    expect(controleerTweelingen(alleRefs.filter((r) => r.ref.status === 'officieel').map((r) => r.ref), tabel)).toEqual([]);
  });

  it.runIf(klaar)('de tweelingen bestaan echt: minstens één ref heeft een tweeling in het buitengewoon onderwijs', () => {
    const tabel = (opzoek as { tabel: Opzoektabel }).tabel;
    expect(alleRefs.some(({ ref }) => tabel.tweelingen(ref.set).length > 0)).toBe(true);
  });

  it.runIf(klaar)('een voorstel wijst naar een doel dat bestaat; alleen MV.040 (vorm A) en WI.706 (vorm B) hebben er een (momentopname van de import)', () => {
    const voorstellen = alleRefs.filter(({ ref }) => ref.status === 'voorstel');
    for (const { ref } of voorstellen) expect(ref.bronCode, ref.code).toBeDefined();
    if (momentopname) expect(voorstellen.map((v) => v.doel)).toEqual(['MV.040', 'WI.706']);
  });

  it.runIf(momentopname)('momentopname: MV.040 "6.12" → 6.1.2 bij een kapot nummer, WI.706 4.2.3 → 2.4.3 naast de officiële koppeling', () => {
    const doel = (code: string) => leerplannen.flatMap((l) => l.doelen).find((d) => d.code === code);
    const mv = doel('MV.040')?.minimumdoelen;
    const wi = doel('WI.706')?.minimumdoelen;
    if (!mv || !wi) throw new Error('MV.040 of WI.706 ontbreekt');
    const mvVoorstel = mv.refs.find((r) => r.status === 'voorstel');
    expect(mvVoorstel).toMatchObject({ set: 'ODS_3417', id: '92439', code: '6.1.2', moment: 'KO', bronCode: '6.12' });
    expect(mvVoorstel && vormVanVoorstel(mv, mvVoorstel)?.vorm).toBe('kapot');
    // De officiële koppeling met 4.2.3 blijft staan, zoals in de bron; het voorstel staat erna.
    expect(wi).toEqual({
      bron: { KO: '4.2.3' },
      refs: [
        { set: 'ODS_3411', id: '92500', code: '4.2.3', moment: 'KO', status: 'officieel', twijfel: ['ander-vak'] },
        { set: 'ODS_3405', id: '93005', code: '2.4.3', moment: 'KO', status: 'voorstel', bronCode: '4.2.3' },
      ],
      problemen: [],
    });
    expect(vormVanVoorstel(wi, wi.refs[1])?.vorm).toBe('ander-vak');
  });

  it.runIf(momentopname)('momentopname: op de doelzinnen vinden 4972 van de 4973 codes precies één doel; 2 voorstellen en 1 kapot nummer', () => {
    const doelzinnen = leerplannen.flatMap((l) => l.doelen.map((d) => d.minimumdoelen));
    const codes = doelzinnen.reduce((n, k) => n + Object.values(k.bron).reduce((m, t) => m + splitsCodes(t ?? '').length, 0), 0);
    const refs = doelzinnen.flatMap((k) => k.refs);
    expect(codes).toBe(4973);
    expect(refs.filter((r) => r.status === 'officieel')).toHaveLength(4972);
    expect(refs.filter((r) => r.status === 'voorstel')).toHaveLength(2);
    expect(doelzinnen.flatMap((k) => k.problemen)).toEqual([{ moment: 'KO', bronCode: '6.12', reden: 'onleesbaar' }]);
  });

  it.runIf(momentopname)('momentopname: 12 doelensets met 3490 leerplandoelen, 465 echt zonder koppeling, 8 lesplannen', () => {
    const doelen = leerplannen.reduce((n, l) => n + l.doelen.length, 0);
    expect(leerplannen).toHaveLength(12);
    expect(doelen).toBe(3490);
    // 'Zonder minimumdoel' telt alleen als ook geen MIA- of voorbeeldrij een koppeling heeft (rechtzetting 2).
    expect(go?.leerplan.reduce((n, l) => n + l.zonderMinimumdoel, 0)).toBe(465);
    expect(go?.lesplannen).toHaveLength(8);
  });

  it.runIf(momentopname)('momentopname: alle 998 minimumdoelen van het gewone basisonderwijs worden door het leerplan genoemd', () => {
    const tabel = (opzoek as { tabel: Opzoektabel }).tabel;
    const genoemd = new Set(alleRefs.filter((r) => r.ref.status === 'officieel').map(({ ref }) => `${ref.set}/${ref.id}`));
    const alle = tabel.alle();
    expect(alle).toHaveLength(998);
    expect(alle.filter((k) => !genoemd.has(`${k.set}/${k.id}`)).map((k) => `${k.set}/${k.id} ${k.code}`)).toEqual([]);
  });
});
