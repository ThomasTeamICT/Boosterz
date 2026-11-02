// Het momentmodel en de invoeringskalender, getoetst aan de echte gegevens (bouwstap 2b, pakket P3).
//
// Dit bestand legt de kalender (./kalender) en het model (./moment, ./momentTeksten) naast de meegeleverde index en
// de setbestanden in public/leerplannen/minimumdoelen. De tests met zelfgemaakte koppen staan in kalender.test.ts en
// moment.test.ts; hier gaat het om verbanden die alleen met de echte gegevens te controleren zijn.
//
// Drie afspraken:
// - Wacht. Ontbreken de gegevens van het basisonderwijs (de index van vóór PR #11), dan slaat alles over. Per setbestand
//   kijkt een test eerst met existsSync of het bestand er is.
// - GEGEVENSRUN=1 slaat elke test in dit bestand over. De maandelijkse ophaling (.github/workflows/minimumdoelen.yml)
//   zet dat voor de gewone testrun, zodat ze nooit door het momentmodel tegengehouden wordt. De deploy-workflow zet het
//   niet en draait deze tests streng.
// - MOMENTMODEL_RAPPORT=<pad> schrijft na afloop een kort Markdown-rapport naar dat pad: 'Geen afwijkingen.' of een
//   lijst afwijkingen (set-id, wat de kalender verwacht, wat de gegevens zeggen). Het rapport komt uit dezelfde
//   controles als de tests, maar wordt los van de uitkomst van de tests gemaakt, ook als er tests falen.
//
// De aantallen en de lijsten per set zijn een momentopname van de index van 1 november 2026 (1096 sets). Groeit of
// krimpt de index, dan slaan alleen die aantallen en lijsten over (momentopname); alle verbanden blijven gelden.
// Nergens in dit bestand telt de versie van een set (geen test eist versie 2.0): 'nieuw' volgt de naam.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { Minimumdoel, MinimumdoelenIndexSet } from '../minimumdoelen';
import {
  datumLeesbaar,
  geldigheidTekst,
  geldigheidVan,
  isBasisSoort,
  momentVanSet,
  soortVanSet,
  zonderAccenten,
  type MomentBasis,
} from '../minimumdoelenBron';
import {
  INVOERINGSKALENDER,
  LEERJAREN_BASIS,
  WERKT_NAAR,
  celVoor,
  controleerKalender,
  eindeOudVoor,
  laatsteVanaf,
  schooljaarVan,
  type Eindmoment,
  type Golf,
  type Invoeringskalender,
  type LeerjaarBasis,
  type Schooljaar,
  type SoortBasis,
  type Zekerheid,
} from './kalender';
import {
  basisSet,
  doelInfo,
  geldigheidTekstBasis,
  invoering,
  invoeringVanSet,
  kalenderTegenGegevens,
  kalenderVoorSet,
  setsDieGelden,
  soortDoelVan,
  tweelingSets,
  type BasisSet,
  type Invoering,
} from './moment';
import {
  BRON_HOE_LABEL,
  GOLF_TEKST,
  STATUS_LABEL,
  ZEKERHEID_UITLEG,
  statusDeel,
  vervallenTekst,
  vervangenTekst,
  voorWieTekst,
} from './momentTeksten';

// ─── Gegevens laden ─────────────────────────────────────────────────────────

const DATA_MAP = join(fileURLToPath(new URL('../../../', import.meta.url)), 'public', 'leerplannen', 'minimumdoelen');
const GEGEVENSRUN = process.env.GEGEVENSRUN === '1';
const RAPPORT_PAD = (process.env.MOMENTMODEL_RAPPORT ?? '').trim();

const index: MinimumdoelenIndexSet[] = (() => {
  const pad = join(DATA_MAP, 'index.json');
  if (GEGEVENSRUN || !existsSync(pad)) return [];
  return (JSON.parse(readFileSync(pad, 'utf8')) as { sets: MinimumdoelenIndexSet[] }).sets;
})();

// Met de gegevens van vóór PR #11 (alleen secundair en volwassenenonderwijs) zijn deze controles niet nodig.
const heeftBasis = index.some((s) => s.id === 'ODS_3395');
// De aantallen en lijsten van de acceptatie horen bij de index van 1 november 2026.
const momentopname = heeftBasis && index.length === 1096;

const bestandPad = (id: string): string | undefined => {
  const set = index.find((s) => s.id === id);
  return set ? join(DATA_MAP, set.bestand) : undefined;
};
/** Bestaan de setbestanden van deze sets? Zonder de gegevens is het antwoord altijd nee. */
const heeftBestand = (...ids: string[]): boolean =>
  heeftBasis &&
  ids.every((id) => {
    const pad = bestandPad(id);
    return pad !== undefined && existsSync(pad);
  });
const heeftIds = (...ids: string[]): boolean => heeftBasis && ids.every((id) => index.some((s) => s.id === id));
const heeftBasisBestanden =
  heeftBasis && index.filter((s) => isBasisSoort(soortVanSet(s.naam))).every((s) => existsSync(join(DATA_MAP, s.bestand)));

interface DoelRij {
  id?: string;
  code: string;
  tekst: string;
  type?: string;
}
type DoelenLezer = (set: { id: string }) => DoelRij[] | undefined;

const doelenCache = new Map<string, DoelRij[] | undefined>();
const doelenVan: DoelenLezer = (set) => {
  if (doelenCache.has(set.id)) return doelenCache.get(set.id);
  const pad = bestandPad(set.id);
  const doelen =
    pad !== undefined && existsSync(pad) ? (JSON.parse(readFileSync(pad, 'utf8')) as { doelen: Minimumdoel[] }).doelen : undefined;
  doelenCache.set(set.id, doelen);
  return doelen;
};

const setVan = (id: string): MinimumdoelenIndexSet => {
  const set = index.find((s) => s.id === id);
  if (!set) throw new Error(`De set ${id} staat niet in de index.`);
  return set;
};
const infoVan = (id: string): BasisSet => {
  const info = basisSet(setVan(id));
  if (!info) throw new Error(`Voor de set ${id} bestaat geen model.`);
  return info;
};

interface BasisRij {
  set: MinimumdoelenIndexSet;
  info: BasisSet;
}
const basisRijenVan = (alle: readonly MinimumdoelenIndexSet[], k: Invoeringskalender = INVOERINGSKALENDER): BasisRij[] =>
  alle.flatMap((set) => {
    const info = basisSet(set, k);
    return info ? [{ set, info }] : [];
  });

// ─── Controles die zowel de tests als het rapport gebruiken ─────────────────

interface Afwijking {
  /** Een set-id, of 'algemeen' bij een afwijking die niet bij één set hoort. */
  setId: string;
  verwacht: string;
  gegevens: string;
}
interface Controle {
  naam: string;
  gecontroleerd: number;
  afwijkingen: Afwijking[];
}

const ALGEMEEN = 'algemeen';
const nieuweControle = (naam: string): Controle => ({ naam, gecontroleerd: 0, afwijkingen: [] });
const regel = (a: Afwijking): string => `${a.setId}: de kalender verwacht ${a.verwacht}; de gegevens zeggen: ${a.gegevens.replace(/\.+$/, '')}.`;
const regelsVan = (c: Controle): string[] => c.afwijkingen.map(regel);

const SOORTEN: readonly SoortBasis[] = ['bao', 'bubao'];
const MOMENTEN: readonly MomentBasis[] = ['kleuter', 'lager'];
const GOLVEN: readonly Golf[] = [1, 2];
const SOORT_TEKST: Readonly<Record<SoortBasis, string>> = { bao: 'het basisonderwijs', bubao: 'het buitengewoon basisonderwijs' };
const ZEKERHEID_RANG: Readonly<Record<Zekerheid, number>> = { onzeker: 0, waarschijnlijk: 1, zeker: 2 };
const laagste = (a: Zekerheid, b: Zekerheid): Zekerheid => (ZEKERHEID_RANG[a] <= ZEKERHEID_RANG[b] ? a : b);

const dagVan = (tekst: string | undefined): string | undefined =>
  typeof tekst === 'string' && /^\d{4}-\d{2}-\d{2}/.test(tekst) ? tekst.slice(0, 10) : undefined;
const sleutelNaam = (korteNaam: string | undefined): string => zonderAccenten(korteNaam ?? '').replace(/\s+/g, ' ').trim();
const lijstTekst = (delen: readonly string[], leeg = 'niets'): string => (delen.length === 0 ? leeg : delen.join(', '));

/**
 * De einddata van de oude sets tegen de kalender: elke oude set met een einddatum in de tijd van de invoering heeft een
 * golf die uit die einddatum volgt, en voor elke soort, golf en moment eindigt minstens één oude set op de dag die de
 * kalender verwacht.
 */
function controleEinddata(alle: readonly MinimumdoelenIndexSet[], k: Invoeringskalender = INVOERINGSKALENDER): Controle {
  const c = nieuweControle('einddata van de oude sets');
  const einden = new Map<string, Set<string>>();
  for (const set of alle) {
    if (!isBasisSoort(soortVanSet(set.naam))) continue;
    c.gecontroleerd++;
    const info = basisSet(set, k);
    if (!info) {
      c.afwijkingen.push({
        setId: set.id,
        verwacht: "een naam die met 'Kleuteronderwijs' of 'Lager Onderwijs' begint, eventueel na 'Buitengewoon'",
        gegevens: `de naam is '${set.naam}'`,
      });
      continue;
    }
    if (info.generatie !== 'oud') continue;
    const tot = dagVan(set.geldigTot);
    if (tot !== undefined) {
      const sleutel = `${info.soort}|${info.moment}`;
      einden.set(sleutel, (einden.get(sleutel) ?? new Set<string>()).add(tot));
    }
    const mogelijk = GOLVEN.map((golf) => ({ golf, eind: eindeOudVoor(info.soort, golf, info.moment, k) }));
    const treffers = mogelijk.filter((m) => m.eind === tot);
    const verwachteGolf = treffers.length === 1 ? treffers[0].golf : undefined;
    if (info.golf !== verwachteGolf) {
      c.afwijkingen.push({
        setId: set.id,
        verwacht: `golf ${verwachteGolf ?? 'geen'} bij de einddatum ${tot ?? 'geen'}`,
        gegevens: `het model geeft golf ${info.golf ?? 'geen'}`,
      });
    }
    const sj = schooljaarVan(tot);
    if (sj !== undefined && sj >= k.vrijwilligVanaf && verwachteGolf === undefined) {
      c.afwijkingen.push({
        setId: set.id,
        verwacht: `een einddatum op ${mogelijk.map((m) => datumLeesbaar(m.eind)).join(' of ')}, of vóór de invoering`,
        gegevens: `de set eindigt op ${datumLeesbaar(tot)}`,
      });
    }
  }
  for (const soort of SOORTEN) {
    for (const moment of MOMENTEN) {
      const gezien = einden.get(`${soort}|${moment}`) ?? new Set<string>();
      for (const golf of GOLVEN) {
        const eind = eindeOudVoor(soort, golf, moment, k);
        if (gezien.has(eind)) continue;
        c.afwijkingen.push({
          setId: ALGEMEEN,
          verwacht: `voor ${SOORT_TEKST[soort]} (${moment}, golf ${golf}) oude sets die eindigen op ${datumLeesbaar(eind)}`,
          gegevens: `de oude sets van dit onderwijs en dit moment eindigen op ${lijstTekst([...gezien].sort().map((d) => datumLeesbaar(d)), 'geen enkele datum')}`,
        });
      }
    }
  }
  return c;
}

/** De nieuwe sets: elke set heeft een vak dat in de kalender staat, een eindmoment, leerjaren en de golf van zijn vak. */
function controleNieuweSets(alle: readonly MinimumdoelenIndexSet[], k: Invoeringskalender = INVOERINGSKALENDER): Controle {
  const c = nieuweControle('vak, eindmoment en golf van de nieuwe sets');
  for (const { set, info } of basisRijenVan(alle, k)) {
    if (info.generatie !== 'nieuw') continue;
    c.gecontroleerd++;
    if (!info.vak) {
      c.afwijkingen.push({
        setId: set.id,
        verwacht: `dat het vak '${set.korteNaam ?? ''}' in de kalender staat (${k.vakken.map((v) => v.naam).join(', ')})`,
        gegevens: `de set heet '${set.korteNaam ?? ''}' en dat vak staat er niet in`,
      });
    } else if (info.golf !== info.vak.golf || info.golfUit !== 'vak') {
      c.afwijkingen.push({
        setId: set.id,
        verwacht: `golf ${info.vak.golf} uit het vak '${info.vak.naam}'`,
        gegevens: `het model geeft golf ${info.golf ?? 'geen'} (golfUit '${info.golfUit}')`,
      });
    }
    const bron = `${set.leerjaar ?? ''} ${set.naam}`;
    const verwachtEind: Eindmoment | undefined =
      info.moment === 'kleuter' ? 'K3' : /\b4de\s+leerjaar\b/i.test(bron) ? 'L4' : /\b6de\s+leerjaar\b/i.test(bron) ? 'L6' : undefined;
    const verwachteLeerjaren = verwachtEind ? LEERJAREN_BASIS.filter((lj) => WERKT_NAAR[lj] === verwachtEind) : [];
    if (info.eindmoment !== verwachtEind || info.leerjaren.join(' ') !== verwachteLeerjaren.join(' ') || verwachteLeerjaren.length === 0) {
      c.afwijkingen.push({
        setId: set.id,
        verwacht: `eindmoment ${verwachtEind ?? 'onbekend'} met de leerjaren ${lijstTekst(verwachteLeerjaren)}`,
        gegevens: `het model geeft eindmoment ${info.eindmoment ?? 'geen'} met de leerjaren ${lijstTekst(info.leerjaren)} (leerjaar '${set.leerjaar ?? ''}', naam '${set.naam}')`,
      });
    }
  }
  return c;
}

/**
 * De doelen van elke set van het basisonderwijs: de soort doelen uit het type van elk doel is die van de set, en bij een
 * nieuwe set is het eerste getal van elke code het vaknummer. Ook doelInfo moet dat zo zeggen.
 */
function controleDoelen(
  alle: readonly MinimumdoelenIndexSet[],
  k: Invoeringskalender = INVOERINGSKALENDER,
  doelen: DoelenLezer = doelenVan,
): Controle {
  const c = nieuweControle('codes en soorten van de doelen');
  for (const { set, info } of basisRijenVan(alle, k)) {
    const rijen = doelen(set);
    if (!rijen) continue;
    const slechtVak: string[] = [];
    const slechtSoort: string[] = [];
    const slechtInfo: string[] = [];
    for (const doel of rijen) {
      c.gecontroleerd++;
      const naam = `${doel.id ?? '(zonder id)'} (code ${doel.code}, type ${doel.type ?? 'geen'})`;
      if (soortDoelVan(doel.type) !== info.soortDoelen) slechtSoort.push(naam);
      if (info.generatie === 'nieuw' && info.vak && Number(String(doel.code).split('.')[0]) !== info.vak.nr) slechtVak.push(naam);
      // doelInfo leest het vak uit de code van het doel; de vergelijking met het vak van de kalender doet de controle hierboven.
      const di = doelInfo({ code: doel.code, type: doel.type }, info);
      const codeNr = /^\d+\.\d+\.\d+$/.test(String(doel.code)) ? Number(String(doel.code).split('.')[0]) : undefined;
      const verwachtVak = info.generatie === 'nieuw' && codeNr !== undefined && codeNr >= 1 && codeNr <= 10 ? codeNr : undefined;
      if (di.soortDoel !== info.soortDoelen || di.eindmoment !== info.eindmoment || di.vak !== verwachtVak) slechtInfo.push(naam);
    }
    const voorbeeld = (lijst: string[]) => `${lijst.length} doel(en), bv. ${lijst.slice(0, 3).join('; ')}`;
    if (slechtVak.length > 0) {
      c.afwijkingen.push({
        setId: set.id,
        verwacht: `dat elk doel een code heeft die met het vaknummer ${info.vak?.nr} (${info.vak?.naam}) begint`,
        gegevens: voorbeeld(slechtVak),
      });
    }
    if (slechtSoort.length > 0) {
      c.afwijkingen.push({
        setId: set.id,
        verwacht: `dat elk doel van soort '${info.soortDoelen ?? 'onbekend'}' is, zoals het laatste deel van de naam zegt`,
        gegevens: voorbeeld(slechtSoort),
      });
    }
    if (slechtInfo.length > 0) {
      c.afwijkingen.push({
        setId: set.id,
        verwacht: 'dat doelInfo bij elk doel het eindmoment van de set, het vak uit de code en de soort van de set geeft',
        gegevens: voorbeeld(slechtInfo),
      });
    }
  }
  return c;
}

/** Een set is leeg als hij een doel heeft en elk doel de code INFO draagt, en andersom. */
function controleLeeg(alle: readonly MinimumdoelenIndexSet[], k: Invoeringskalender = INVOERINGSKALENDER, doelen: DoelenLezer = doelenVan): Controle {
  const c = nieuweControle("lege sets en de code 'INFO'");
  for (const { set, info } of basisRijenVan(alle, k)) {
    const rijen = doelen(set);
    if (!rijen) continue;
    c.gecontroleerd++;
    const alleInfo = rijen.length > 0 && rijen.every((d) => d.code === 'INFO');
    if (info.leeg !== alleInfo) {
      c.afwijkingen.push({
        setId: set.id,
        verwacht: alleInfo ? "een lege set, want elk doel heeft de code 'INFO'" : "een set met doelen, want niet elk doel heeft de code 'INFO'",
        gegevens: `leeg is ${info.leeg ? 'waar' : 'onwaar'} (korteNaam '${set.korteNaam ?? ''}', ${set.aantal} doelen)`,
      });
    }
  }
  return c;
}

// De oude set van wetenschap en techniek heet in de gegevens 'Wetenschappen en techniek'.
const VAK_ALIAS: Readonly<Record<string, readonly string[]>> = { 'wetenschap en techniek': ['wetenschappen en techniek'] };

/**
 * De golf per vak (de zekerheid ervan). Een vak staat alleen op 'zeker' als de gegevens het zelf zeggen: een oude set van
 * het basisonderwijs met dezelfde naam eindigt op de einddatum van die golf. Of als een bron met hoe 'gelezen' het zegt.
 * En geen oude set met die naam spreekt de golf van het vak tegen.
 */
function controleGolfPerVak(alle: readonly MinimumdoelenIndexSet[], k: Invoeringskalender = INVOERINGSKALENDER): Controle {
  const c = nieuweControle('de golf per vak');
  const oud = basisRijenVan(alle, k).filter((x) => x.info.generatie === 'oud');
  for (const vak of k.vakken) {
    c.gecontroleerd++;
    const namen = [vak.sleutel, ...(VAK_ALIAS[vak.sleutel] ?? [])];
    const metNaam = oud.filter((x) => namen.includes(sleutelNaam(x.set.korteNaam)));
    const steun = metNaam.filter((x) => x.info.soort === 'bao' && x.info.golf === vak.golf);
    const tegen = metNaam.filter((x) => x.info.golf !== undefined && x.info.golf !== vak.golf);
    const gelezen = vak.bronnen.some((id) => k.bronnen.find((b) => b.id === id)?.hoe === 'gelezen');
    if (vak.zekerheid === 'zeker' && steun.length === 0 && !gelezen) {
      c.afwijkingen.push({
        setId: ALGEMEEN,
        verwacht: `dat het vak '${vak.naam}' (golf ${vak.golf}, zeker) steun heeft: een oude basisset met dezelfde naam die eindigt op de einddatum van golf ${vak.golf}, of een nagelezen bron`,
        gegevens: `er is geen oude basisset met die naam in golf ${vak.golf} (sets met die naam: ${lijstTekst(metNaam.map((x) => `${x.set.id} golf ${x.info.golf ?? 'geen'}`))})`,
      });
    }
    for (const x of tegen) {
      c.afwijkingen.push({
        setId: x.set.id,
        verwacht: `golf ${vak.golf} voor het vak '${vak.naam}'`,
        gegevens: `de oude set met dezelfde naam eindigt op ${datumLeesbaar(x.set.geldigTot)}, dat is golf ${x.info.golf}`,
      });
    }
  }
  return c;
}

/**
 * Per soort, golf, schooljaar en leerjaar geldt precies één van: een nieuwe set van die golf is verplicht, of een oude,
 * niet-lege set van die golf geldt nog. Zo is er nooit een gat en nooit een overlap.
 */
function controleXor(alle: readonly MinimumdoelenIndexSet[], k: Invoeringskalender = INVOERINGSKALENDER): Controle {
  const c = nieuweControle('nieuw of oud, nooit allebei en nooit geen van beide');
  const rijen = basisRijenVan(alle, k);
  for (const soort of SOORTEN) {
    for (const golf of GOLVEN) {
      const fout: string[] = [];
      for (let sj = 2024; sj <= 2031; sj++) {
        for (const lj of LEERJAREN_BASIS) {
          c.gecontroleerd++;
          const status = (x: BasisRij) => invoering(x.info, lj, sj, k)?.status;
          const nieuwVerplicht = rijen.some((x) => x.info.soort === soort && x.info.generatie === 'nieuw' && x.info.golf === golf && status(x) === 'verplicht');
          const oudGeldt = rijen.some((x) => x.info.soort === soort && x.info.generatie === 'oud' && !x.info.leeg && x.info.golf === golf && status(x) === 'geldt');
          if (nieuwVerplicht === oudGeldt) fout.push(`${sj}-${sj + 1} ${lj} (nieuwe set verplicht: ${nieuwVerplicht ? 'ja' : 'nee'}; oude set geldt nog: ${oudGeldt ? 'ja' : 'nee'})`);
        }
      }
      if (fout.length > 0) {
        c.afwijkingen.push({
          setId: ALGEMEEN,
          verwacht: `voor ${SOORT_TEKST[soort]}, golf ${golf}, in elk schooljaar en leerjaar precies één van: een nieuwe set is verplicht, een oude set geldt nog`,
          gegevens: `dat klopt niet voor ${fout.length} van de 72 combinaties van schooljaar en leerjaar, bv. ${fout.slice(0, 3).join('; ')}`,
        });
      }
    }
  }
  return c;
}

/**
 * De tweelingen: elk doel van een nieuwe set staat in precies één set van tweelingSets, met dezelfde code en tekst, en aan de
 * kant van het buitengewoon basisonderwijs is het een na te streven doel.
 */
function controleTweelingen(
  soort: SoortBasis,
  alle: readonly MinimumdoelenIndexSet[],
  k: Invoeringskalender = INVOERINGSKALENDER,
  doelen: DoelenLezer = doelenVan,
): Controle {
  const c = nieuweControle(`tweelingen vanuit ${SOORT_TEKST[soort]}`);
  for (const { set, info } of basisRijenVan(alle, k).filter((x) => x.info.generatie === 'nieuw' && x.info.soort === soort)) {
    const eigen = doelen(set);
    if (!eigen) continue;
    const tweelingen = tweelingSets(info, alle, k).map((t) => {
      const rijen = doelen(t) ?? [];
      return { set: t, info: basisSet(t, k), perId: new Map(rijen.flatMap((d) => (d.id === undefined ? [] : [[d.id, d] as const]))) };
    });
    const nietGevonden: string[] = [];
    const verschil: string[] = [];
    const nietNastreven: string[] = [];
    for (const doel of eigen) {
      c.gecontroleerd++;
      const wat = `${doel.id ?? '(zonder id)'} (code ${doel.code})`;
      const treffers = tweelingen.filter((t) => doel.id !== undefined && t.perId.has(doel.id));
      if (treffers.length !== 1 || doel.id === undefined) {
        nietGevonden.push(`${wat}: ${treffers.length} keer`);
        continue;
      }
      const tweeling = treffers[0];
      const tweelingDoel = tweeling.perId.get(doel.id) as DoelRij;
      if (tweelingDoel.code !== doel.code || tweelingDoel.tekst !== doel.tekst) verschil.push(`${wat} in ${tweeling.set.id}`);
      const kantBubao = soort === 'bubao' ? { info, doel } : { info: tweeling.info, doel: tweelingDoel };
      const soortDoel = kantBubao.info ? doelInfo({ code: kantBubao.doel.code, type: kantBubao.doel.type }, kantBubao.info).soortDoel : undefined;
      if (soortDoel !== 'nastreven') nietNastreven.push(`${wat}: ${soortDoel ?? 'onbekend'}`);
    }
    const voorbeeld = (lijst: string[]) => `${lijst.length} doel(en), bv. ${lijst.slice(0, 3).join('; ')}`;
    if (nietGevonden.length > 0) {
      c.afwijkingen.push({
        setId: set.id,
        verwacht: 'dat elk doel in precies één set uit tweelingSets staat',
        gegevens: `${voorbeeld(nietGevonden)} (tweelingen: ${lijstTekst(tweelingen.map((t) => t.set.id), 'geen')})`,
      });
    }
    if (verschil.length > 0) {
      c.afwijkingen.push({ setId: set.id, verwacht: 'dat elk doel in zijn tweeling dezelfde code en tekst heeft', gegevens: voorbeeld(verschil) });
    }
    if (nietNastreven.length > 0) {
      c.afwijkingen.push({
        setId: set.id,
        verwacht: 'dat elk doel aan de kant van het buitengewoon basisonderwijs een na te streven doel is',
        gegevens: voorbeeld(nietNastreven),
      });
    }
  }
  return c;
}

/** Alle controles op de gegevens, in dezelfde volgorde als in het rapport. */
function alleControles(
  alle: readonly MinimumdoelenIndexSet[],
  k: Invoeringskalender = INVOERINGSKALENDER,
  doelen: DoelenLezer = doelenVan,
): Controle[] {
  return [
    controleEinddata(alle, k),
    controleNieuweSets(alle, k),
    controleGolfPerVak(alle, k),
    controleDoelen(alle, k, doelen),
    controleLeeg(alle, k, doelen),
    controleXor(alle, k),
    controleTweelingen('bao', alle, k, doelen),
    controleTweelingen('bubao', alle, k, doelen),
  ];
}

/**
 * Alle afwijkingen. kalenderTegenGegevens van het model hoort hetzelfde te zien als de eigen controles hierboven: meldt hij
 * iets over een set of iets algemeens dat de eigen controles niet zagen, dan komt zijn melding er letterlijk bij.
 */
function verzamelAfwijkingen(
  alle: readonly MinimumdoelenIndexSet[],
  k: Invoeringskalender = INVOERINGSKALENDER,
  doelen: DoelenLezer = doelenVan,
): Afwijking[] {
  const lijst = alleControles(alle, k, doelen).flatMap((c) => c.afwijkingen);
  for (const tekst of kalenderTegenGegevens(alle, k)) {
    const setId = /\bODS_\d+\b/.exec(tekst)?.[0] ?? ALGEMEEN;
    if (lijst.some((a) => a.setId === setId)) continue;
    lijst.push({ setId, verwacht: 'een kalender die bij de gegevens past', gegevens: tekst });
  }
  return lijst;
}

const MAX_REGELS_IN_RAPPORT = 60;

/** Het rapport: 'Geen afwijkingen.' of een lijst. Zonder kop: de workflow zet er zelf een kop boven. */
function rapportTekst(afwijkingen: readonly Afwijking[]): string {
  if (afwijkingen.length === 0) return 'Geen afwijkingen.\n';
  const kop = afwijkingen.length === 1 ? 'Er is 1 afwijking van de kalender tegen de gegevens:' : `Er zijn ${afwijkingen.length} afwijkingen van de kalender tegen de gegevens:`;
  const lijst = afwijkingen.slice(0, MAX_REGELS_IN_RAPPORT).map((a) => `- ${regel(a)}`);
  const rest = afwijkingen.length > MAX_REGELS_IN_RAPPORT ? [`- … en nog ${afwijkingen.length - MAX_REGELS_IN_RAPPORT} afwijkingen.`] : [];
  return [kop, '', ...lijst, ...rest, ''].join('\n');
}

function schrijfRapport(): void {
  if (RAPPORT_PAD === '') return;
  let tekst: string;
  try {
    tekst = heeftBasis ? rapportTekst(verzamelAfwijkingen(index)) : 'Niet gecontroleerd: de gegevens van het basisonderwijs ontbreken.\n';
  } catch (fout) {
    tekst = `De controle kon niet worden afgerond: ${fout instanceof Error ? fout.message : String(fout)}\n`;
  }
  mkdirSync(dirname(RAPPORT_PAD), { recursive: true });
  writeFileSync(RAPPORT_PAD, tekst, 'utf8');
}

/** Een compacte tekst van een invoering, om lijsten in één keer te vergelijken. */
function vorm(i: Invoering): string {
  return [
    i.leerjaar,
    i.status,
    i.zekerheid,
    i.verplichtVanaf !== undefined ? `vanaf ${i.verplichtVanaf}` : '',
    i.laatsteSchooljaar !== undefined ? `laatste ${i.laatsteSchooljaar}` : '',
    i.reden ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}
const ids = (lijst: readonly { set: { id: string } }[]): string[] => lijst.map((g) => g.set.id);
const idsVan = (lijst: readonly { id: string }[]): string[] => lijst.map((s) => s.id);

// ─── De tests ───────────────────────────────────────────────────────────────

describe.skipIf(GEGEVENSRUN)('het momentmodel op de echte gegevens', () => {
  afterAll(schrijfRapport);

  // ── De kalender zelf en tegen de einddata ──────────────────────────────

  describe('de kalender tegen de gegevens', () => {
    it.runIf(heeftBasis)('controleerKalender(INVOERINGSKALENDER) geeft geen fouten', () => {
      expect(controleerKalender(INVOERINGSKALENDER)).toEqual([]);
    });

    it.runIf(heeftBasis)('kalenderTegenGegevens(index) geeft geen afwijkingen', () => {
      expect(kalenderTegenGegevens(index)).toEqual([]);
    });

    it.runIf(heeftBasis)('elke oude set met een einddatum in de tijd van de invoering heeft de golf die uit die einddatum volgt', () => {
      const c = controleEinddata(index);
      expect(c.gecontroleerd).toBeGreaterThan(0);
      expect(regelsVan(c)).toEqual([]);
    });

    it.runIf(heeftBasis)('voor elke soort, golf en moment eindigt een oude set op de dag die de kalender verwacht', () => {
      const gezien = new Map<string, Set<string>>();
      for (const { set, info } of basisRijenVan(index).filter((x) => x.info.generatie === 'oud')) {
        const tot = dagVan(set.geldigTot);
        if (tot !== undefined) gezien.set(`${info.soort}|${info.moment}`, (gezien.get(`${info.soort}|${info.moment}`) ?? new Set<string>()).add(tot));
      }
      for (const soort of SOORTEN) {
        for (const moment of MOMENTEN) {
          for (const golf of GOLVEN) {
            const eind = eindeOudVoor(soort, golf, moment);
            expect(gezien.get(`${soort}|${moment}`)?.has(eind), `${soort} ${moment} golf ${golf}: ${eind}`).toBe(true);
          }
        }
      }
    });

    it.runIf(heeftBasis)('de einddata zijn die van de kalender: 2026-08-31, 2027-08-31, 2028-08-31 en 2030-08-31', () => {
      for (const soort of SOORTEN) {
        expect([eindeOudVoor(soort, 1, 'kleuter'), eindeOudVoor(soort, 2, 'kleuter')]).toEqual(['2026-08-31', '2027-08-31']);
        expect([eindeOudVoor(soort, 1, 'lager'), eindeOudVoor(soort, 2, 'lager')]).toEqual(['2028-08-31', '2030-08-31']);
        expect([laatsteVanaf(soort, 1, 'kleuter'), laatsteVanaf(soort, 2, 'kleuter'), laatsteVanaf(soort, 1, 'lager'), laatsteVanaf(soort, 2, 'lager')]).toEqual([2026, 2027, 2028, 2030]);
      }
    });

    it.runIf(heeftBasis)('een oude set zonder einddatum of met een einddatum vóór de invoering heeft geen golf, en geen enkele andere', () => {
      for (const { set, info } of basisRijenVan(index).filter((x) => x.info.generatie === 'oud')) {
        const sj = schooljaarVan(set.geldigTot);
        if (info.golf === undefined) {
          expect(sj === undefined || sj < INVOERINGSKALENDER.vrijwilligVanaf, `${set.id} eindigt op ${set.geldigTot ?? 'nooit'} en heeft toch geen golf`).toBe(true);
          expect(info.golfUit, set.id).toBe('geen');
        } else {
          expect(info.golfUit, set.id).toBe('einddatum');
        }
      }
    });

    it.runIf(momentopname)('momentopname: de golf van de oude sets uit hun einddatum', () => {
      const oud = basisRijenVan(index).filter((x) => x.info.generatie === 'oud');
      const tel = (soort: SoortBasis, moment: MomentBasis, golf: Golf | undefined) =>
        oud.filter((x) => x.info.soort === soort && x.info.moment === moment && x.info.golf === golf).length;
      expect([tel('bao', 'kleuter', 1), tel('bao', 'kleuter', 2), tel('bao', 'lager', 1), tel('bao', 'lager', 2)]).toEqual([3, 3, 3, 7]);
      expect([tel('bubao', 'kleuter', 1), tel('bubao', 'kleuter', 2), tel('bubao', 'lager', 1), tel('bubao', 'lager', 2)]).toEqual([5, 12, 8, 21]);
      const zonderGolf = oud.filter((x) => x.info.golf === undefined);
      // De 22 sets van het buitengewoon onderwijs die eindigen op 2020-08-31 en de 4 sets zonder einde.
      expect(zonderGolf.filter((x) => x.set.geldigTot === '2020-08-31' && x.info.soort === 'bubao')).toHaveLength(22);
      expect(idsVan(zonderGolf.filter((x) => x.set.geldigTot === undefined).map((x) => x.set))).toEqual(['ODS_2306', 'ODS_2308', 'ODS_2331', 'ODS_2354']);
      expect(zonderGolf).toHaveLength(26);
      // Type 2 Wereldoriëntatie zit in golf 2.
      expect(infoVan('ODS_2302').golf).toBe(2);
      expect(infoVan('ODS_2327').golf).toBe(2);
      // Voorbeelden uit de acceptatie.
      expect(infoVan('ODS_2110').golf).toBe(1);
      expect(infoVan('ODS_2108').golf).toBe(2);
    });
  });

  // ── De golf per vak (B2) ────────────────────────────────────────────────

  describe('de golf per vak', () => {
    it.runIf(heeftBasis)('een vak staat alleen op zeker met steun uit de gegevens, en geen oude set spreekt de golf van een vak tegen', () => {
      const c = controleGolfPerVak(index);
      expect(c.gecontroleerd).toBe(INVOERINGSKALENDER.vakken.length);
      expect(regelsVan(c)).toEqual([]);
    });

    it.runIf(momentopname)('momentopname: zeker zijn de vakken met een oude basisset van dezelfde naam, waarschijnlijk aardrijkskunde, geschiedenis en attitudes', () => {
      const perNr = (nr: number) => INVOERINGSKALENDER.vakken.find((v) => v.nr === nr);
      for (const nr of [1, 2, 3, 6, 7, 8, 10]) expect(perNr(nr)?.zekerheid, `vak ${nr}`).toBe('zeker');
      for (const nr of [4, 5, 9]) expect(perNr(nr)?.zekerheid, `vak ${nr}`).toBe('waarschijnlijk');
      // Voor aardrijkskunde, geschiedenis en attitudes bestaat geen enkele oude basisset met die naam: de golf steunt daar op het decreet alleen.
      const oudeNamen = new Set(basisRijenVan(index).filter((x) => x.info.generatie === 'oud').map((x) => sleutelNaam(x.set.korteNaam)));
      for (const nr of [4, 5, 9]) expect(oudeNamen.has(perNr(nr)?.sleutel ?? ''), `vak ${nr}`).toBe(false);
      for (const nr of [1, 2, 3, 6, 7, 8, 10]) {
        const sleutel = perNr(nr)?.sleutel ?? '';
        expect([sleutel, ...(VAK_ALIAS[sleutel] ?? [])].some((n) => oudeNamen.has(n)), `vak ${nr}`).toBe(true);
      }
    });

    it.runIf(heeftBasis)('de zekerheid van een nieuwe invoering is de laagste van die van de cel en die van de golf van het vak', () => {
      let gecontroleerd = 0;
      for (const { set, info } of basisRijenVan(index).filter((x) => x.info.generatie === 'nieuw')) {
        const vak = info.vak;
        const golf = info.golf;
        if (!vak || golf === undefined) continue;
        for (let sj = 2025; sj <= 2031; sj++) {
          for (const lj of info.leerjaren) {
            const cel = celVoor(info.soort, golf, lj);
            if (!cel) continue;
            const celZekerheid: Zekerheid = sj >= laatsteVanaf(info.soort, golf, info.moment) ? 'zeker' : cel.zekerheid;
            const verwacht = laagste(celZekerheid, vak.zekerheid);
            const i = invoering(info, lj, sj);
            expect(i?.zekerheid, `${set.id} ${lj} in ${sj}`).toBe(verwacht);
            expect(i?.status, `${set.id} ${lj} in ${sj}`).toBe(sj >= cel.vanaf ? 'verplicht' : 'mag');
            gecontroleerd++;
          }
        }
      }
      expect(gecontroleerd).toBeGreaterThan(0);
    });

    it.runIf(heeftBasis)('de zekerheid van een oude invoering volgt de cel van zijn golf, met de ophoging vanaf het laatste schooljaar van de golf', () => {
      let gecontroleerd = 0;
      for (const { set, info } of basisRijenVan(index).filter((x) => x.info.generatie === 'oud' && x.info.golf !== undefined)) {
        const golf = info.golf as Golf;
        for (let sj = info.geldigVanaf ?? 2025; sj <= (info.geldigTotEnMet ?? 2031); sj++) {
          for (const lj of info.leerjaren) {
            const cel = celVoor(info.soort, golf, lj);
            if (!cel) continue;
            const i = invoering(info, lj, sj);
            expect(i?.zekerheid, `${set.id} ${lj} in ${sj}`).toBe(sj >= laatsteVanaf(info.soort, golf, info.moment) ? 'zeker' : cel.zekerheid);
            gecontroleerd++;
          }
        }
      }
      expect(gecontroleerd).toBeGreaterThan(0);
    });
  });

  // ── basisSet over de hele index ─────────────────────────────────────────

  describe('basisSet over de hele index', () => {
    it.runIf(heeftBasis)('basisSet bestaat precies voor de sets met isBasisSoort(soortVanSet(naam)) en een moment', () => {
      for (const s of index) {
        const verwacht = isBasisSoort(soortVanSet(s.naam)) && momentVanSet(s.naam) !== undefined;
        expect(basisSet(s) !== undefined, `${s.id}: ${s.naam}`).toBe(verwacht);
      }
      // Elke set van het basisonderwijs heeft een moment in de naam.
      expect(idsVan(index.filter((s) => isBasisSoort(soortVanSet(s.naam)) && momentVanSet(s.naam) === undefined))).toEqual([]);
    });

    it.runIf(heeftBasis)('soort, moment en id van het model zijn die van de naam', () => {
      for (const { set, info } of basisRijenVan(index)) {
        expect(info.id).toBe(set.id);
        expect(info.soort, set.id).toBe(soortVanSet(set.naam));
        expect(info.moment, set.id).toBe(momentVanSet(set.naam));
      }
    });

    it.runIf(momentopname)('momentopname: 144 sets (45 en 99), 56 nieuw (29 en 27), 88 oud, en 952 sets buiten het model', () => {
      const rijen = basisRijenVan(index);
      const tel = (soort: SoortBasis, generatie: 'nieuw' | 'oud') => rijen.filter((x) => x.info.soort === soort && x.info.generatie === generatie).length;
      expect(rijen).toHaveLength(144);
      expect(rijen.filter((x) => x.info.soort === 'bao')).toHaveLength(45);
      expect(rijen.filter((x) => x.info.soort === 'bubao')).toHaveLength(99);
      expect([tel('bao', 'nieuw'), tel('bubao', 'nieuw')]).toEqual([29, 27]);
      expect(rijen.filter((x) => x.info.generatie === 'oud')).toHaveLength(88);
      expect(index.filter((s) => basisSet(s) === undefined)).toHaveLength(952);
    });

    it.runIf(heeftBasis)('generatie volgt de naam: nieuw is het laatste naamdeel met minimumdoelen, nooit de versie', () => {
      for (const { set, info } of basisRijenVan(index)) {
        const delen = set.naam.split(/\s+-\s+/).map((d) => d.trim());
        expect(info.generatie, set.id).toBe(/minimumdoelen/i.test(delen[delen.length - 1]) ? 'nieuw' : 'oud');
        // Een andere versie verandert niets aan het model.
        const andereVersie: MinimumdoelenIndexSet = { ...set, versie: '9.9' };
        expect(basisSet(andereVersie), set.id).toEqual(info);
        const zonderVersie: MinimumdoelenIndexSet = { ...set, versie: undefined };
        expect(basisSet(zonderVersie), set.id).toEqual(info);
        // Een nieuwe set mocht al op de eerste dag van de invoering; een oude set bestond daarvoor.
        if (info.generatie === 'nieuw') expect(info.geldigVanaf, set.id).toBeGreaterThanOrEqual(INVOERINGSKALENDER.vrijwilligVanaf);
        else expect(info.geldigVanaf ?? 0, set.id).toBeLessThan(INVOERINGSKALENDER.vrijwilligVanaf);
      }
    });

    it.runIf(heeftBasis)('elke nieuwe set heeft een vak, een eindmoment, leerjaren en de golf van zijn vak', () => {
      const c = controleNieuweSets(index);
      expect(c.gecontroleerd).toBeGreaterThan(0);
      expect(regelsVan(c)).toEqual([]);
    });

    it.runIf(momentopname)('momentopname: alle tien de vakken komen voor in de 56 nieuwe sets, en elke nieuwe set heeft een vak, eindmoment en golf', () => {
      const nieuw = basisRijenVan(index).filter((x) => x.info.generatie === 'nieuw');
      expect(nieuw).toHaveLength(56);
      expect([...new Set(nieuw.map((x) => x.info.vak?.nr))].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      for (const { set, info } of nieuw) {
        expect(info.vak, set.id).toBeDefined();
        expect(info.eindmoment, set.id).toBeDefined();
        expect(info.golf, set.id).toBeDefined();
      }
    });
  });

  // ── De doelen ───────────────────────────────────────────────────────────

  describe('de doelen van de sets', () => {
    it.runIf(heeftBasisBestanden)('in elke nieuwe set is het eerste getal van de code gelijk aan het vaknummer, en bij elke set past de soort doelen bij het type van het doel', () => {
      const c = controleDoelen(index);
      expect(c.gecontroleerd).toBeGreaterThan(0);
      expect(regelsVan(c)).toEqual([]);
    });

    it.runIf(heeftBasisBestanden && momentopname)('momentopname: 1996 nieuwe doelrijen en 6554 doelen in de 144 sets, zonder afwijking', () => {
      const rijen = basisRijenVan(index);
      const aantal = (filter: (x: BasisRij) => boolean) => rijen.filter(filter).reduce((som, x) => som + (doelenVan(x.set)?.length ?? 0), 0);
      expect(aantal((x) => x.info.generatie === 'nieuw')).toBe(1996);
      expect(aantal(() => true)).toBe(6554);
      expect(controleDoelen(index).gecontroleerd).toBe(6554);
    });

    it.runIf(heeftBasisBestanden)('leeg valt samen met: de set heeft een doel en elk doel heeft de code INFO', () => {
      const c = controleLeeg(index);
      expect(c.gecontroleerd).toBeGreaterThan(0);
      expect(regelsVan(c)).toEqual([]);
    });

    it.runIf(heeftBasisBestanden && momentopname)('momentopname: leeg is waar voor precies ODS_2958 en ODS_2959, de enige sets met de doelen 90245 en 90246', () => {
      const rijen = basisRijenVan(index);
      expect(idsVan(rijen.filter((x) => x.info.leeg).map((x) => x.set))).toEqual(['ODS_2958', 'ODS_2959']);
      const metInfo = rijen.filter((x) => (doelenVan(x.set) ?? []).some((d) => d.code === 'INFO'));
      expect(idsVan(metInfo.map((x) => x.set))).toEqual(['ODS_2958', 'ODS_2959']);
      expect((doelenVan(setVan('ODS_2958')) ?? []).map((d) => d.id)).toEqual(['90245']);
      expect((doelenVan(setVan('ODS_2959')) ?? []).map((d) => d.id)).toEqual(['90246']);
    });

    it.runIf(heeftBestand('ODS_3408', 'ODS_3469', 'ODS_3409', 'ODS_3410', 'ODS_3470'))('de Lichtkamer-doelen: de soort doel hoort bij (doel, set), nooit bij het id alleen', () => {
      const doel = (setId: string, doelId: string) => {
        const d = (doelenVan(setVan(setId)) ?? []).find((x) => x.id === doelId);
        if (!d) throw new Error(`Doel ${doelId} staat niet in ${setId}.`);
        return d;
      };
      // 92729: einde kleuteronderwijs, wetenschap en techniek (vak 3), na te streven.
      expect(doelInfo(doel('ODS_3410', '92729'), infoVan('ODS_3410'))).toEqual({ eindmoment: 'K3', vak: 3, soortDoel: 'nastreven' });
      // 92767: einde 4de leerjaar; te bereiken op populatieniveau in het gewoon, na te streven in het buitengewoon basisonderwijs.
      expect(doelInfo(doel('ODS_3408', '92767'), infoVan('ODS_3408'))).toEqual({ eindmoment: 'L4', vak: 3, soortDoel: 'populatie' });
      expect(doelInfo(doel('ODS_3469', '92767'), infoVan('ODS_3469'))).toEqual({ eindmoment: 'L4', vak: 3, soortDoel: 'nastreven' });
      // 92833: einde 6de leerjaar.
      expect(doelInfo(doel('ODS_3409', '92833'), infoVan('ODS_3409'))).toEqual({ eindmoment: 'L6', vak: 3, soortDoel: 'populatie' });
      expect(doelInfo(doel('ODS_3470', '92833'), infoVan('ODS_3470'))).toEqual({ eindmoment: 'L6', vak: 3, soortDoel: 'nastreven' });
    });
  });

  // ── Tweelingen en de xor-regel ──────────────────────────────────────────

  describe('tweelingen en de xor-regel', () => {
    it.runIf(heeftBasisBestanden)('elk doel van een nieuwe set van het basisonderwijs staat in precies één tweeling, met dezelfde code en tekst, en is daar of hier na te streven', () => {
      for (const soort of SOORTEN) {
        const c = controleTweelingen(soort, index);
        expect(c.gecontroleerd, soort).toBeGreaterThan(0);
        expect(regelsVan(c), soort).toEqual([]);
      }
    });

    it.runIf(heeftBasisBestanden && momentopname)('momentopname: alle 998 doel-id\'s van de nieuwe sets van het basisonderwijs staan in hun tweeling', () => {
      const c = controleTweelingen('bao', index);
      expect(c.gecontroleerd).toBe(998);
      expect(regelsVan(c)).toEqual([]);
      // Omgekeerd, vanuit het buitengewoon basisonderwijs, zijn het er evenveel.
      expect(controleTweelingen('bubao', index).gecontroleerd).toBe(998);
      // De doel-id's van de nieuwe sets van het gewoon basisonderwijs zijn uniek over die sets heen, per tweeling.
      const alleIds = basisRijenVan(index)
        .filter((x) => x.info.generatie === 'nieuw' && x.info.soort === 'bao')
        .flatMap((x) => (doelenVan(x.set) ?? []).map((d) => d.id));
      expect(new Set(alleIds).size).toBe(998);
    });

    it.runIf(heeftBasis)('tweelingSets noemt alleen nieuwe sets van de andere soort met hetzelfde vak en eindmoment, en geen voor een oude set', () => {
      for (const { set, info } of basisRijenVan(index)) {
        const tweelingen = tweelingSets(info, index);
        if (info.generatie === 'oud') {
          expect(tweelingen, set.id).toEqual([]);
          continue;
        }
        expect(tweelingen.length, set.id).toBeGreaterThan(0);
        for (const t of tweelingen) {
          const ti = infoVan(t.id);
          expect(ti.generatie, t.id).toBe('nieuw');
          expect(ti.soort, t.id).not.toBe(info.soort);
          expect(ti.vak?.nr, t.id).toBe(info.vak?.nr);
          expect(ti.eindmoment, t.id).toBe(info.eindmoment);
        }
        // En de tweeling van de tweeling is de set zelf.
        for (const t of tweelingen) expect(idsVan(tweelingSets(infoVan(t.id), index)), t.id).toContain(set.id);
      }
    });

    it.runIf(momentopname)('momentopname: de tweelingen van de acceptatie', () => {
      const van = (id: string) => idsVan(tweelingSets(infoVan(id), index));
      expect(van('ODS_3408')).toEqual(['ODS_3469']);
      expect(van('ODS_3485')).toEqual(['ODS_3397', 'ODS_3401']);
      expect(van('ODS_3484')).toEqual(['ODS_3404', 'ODS_3405']);
      expect(van('ODS_3428')).toEqual(['ODS_3483']);
      expect(van('ODS_2110')).toEqual([]);
    });

    it.runIf(heeftBasis)('xor: per soort, golf, schooljaar en leerjaar is precies één van "een nieuwe set van die golf is verplicht" of "een oude, niet-lege set van die golf geldt nog" waar', () => {
      const c = controleXor(index);
      // 2 soorten x 8 schooljaren (2024 tot 2031) x 9 leerjaren x 2 golven.
      expect(c.gecontroleerd).toBe(288);
      expect(regelsVan(c)).toEqual([]);
    });
  });

  // ── Voorbeelden per set-id ──────────────────────────────────────────────

  describe('invoeringVanSet en kalenderVoorSet per set', () => {
    const rij = (id: string, sj: Schooljaar) => invoeringVanSet(infoVan(id), sj).map(vorm);

    it.runIf(heeftIds('ODS_3395'))('ODS_3395 (4de leerjaar, Nederlands): in 2026 verplicht voor het 1ste tot 3de, mag voor het 4de; in 2028 verplicht en zeker; in 2024 nog niet', () => {
      expect(rij('ODS_3395', 2026)).toEqual([
        'L1 verplicht waarschijnlijk vanaf 2026',
        'L2 verplicht waarschijnlijk vanaf 2026',
        'L3 verplicht waarschijnlijk vanaf 2026',
        'L4 mag waarschijnlijk vanaf 2027',
      ]);
      expect(rij('ODS_3395', 2028)).toEqual([
        'L1 verplicht zeker vanaf 2026',
        'L2 verplicht zeker vanaf 2026',
        'L3 verplicht zeker vanaf 2026',
        'L4 verplicht zeker vanaf 2027',
      ]);
      expect(invoeringVanSet(infoVan('ODS_3395'), 2024).map((i) => i.status)).toEqual(['nog-niet', 'nog-niet', 'nog-niet', 'nog-niet']);
      // Het 5de leerjaar hoort niet bij deze set.
      expect(invoering(infoVan('ODS_3395'), 'L5', 2026)).toBeUndefined();
    });

    it.runIf(heeftIds('ODS_2110'))('ODS_2110 (oude eindtermen Nederlands): in 2026 vervangen voor het 1ste tot 3de, geldt voor het 4de en 5de tot en met 2026, voor het 6de tot en met 2027', () => {
      expect(rij('ODS_2110', 2026)).toEqual([
        'L1 vervangen waarschijnlijk laatste 2025',
        'L2 vervangen waarschijnlijk laatste 2025',
        'L3 vervangen waarschijnlijk laatste 2025',
        'L4 geldt waarschijnlijk laatste 2026',
        'L5 geldt waarschijnlijk laatste 2026',
        'L6 geldt waarschijnlijk laatste 2027',
      ]);
      // In 2027 geldt de set enkel nog voor het 6de leerjaar; de einddatum is 31 augustus 2028, dus in 2028 geldt ze niet meer.
      expect(invoeringVanSet(infoVan('ODS_2110'), 2027).map((i) => i.status)).toEqual(['vervangen', 'vervangen', 'vervangen', 'vervangen', 'vervangen', 'geldt']);
      expect(invoeringVanSet(infoVan('ODS_2110'), 2028).map((i) => i.status)).toEqual(['vervallen', 'vervallen', 'vervallen', 'vervallen', 'vervallen', 'vervallen']);
    });

    it.runIf(heeftIds('ODS_2104'))('ODS_2104 (oude kleuterdoelen Nederlands): in 2026 voor het hele kleuteronderwijs vervallen, en zeker', () => {
      expect(rij('ODS_2104', 2026)).toEqual(['K1 vervallen zeker', 'K2 vervallen zeker', 'K3 vervallen zeker']);
      expect(rij('ODS_2104', 2025)).toEqual(['K1 geldt zeker laatste 2025', 'K2 geldt zeker laatste 2025', 'K3 geldt zeker laatste 2025']);
    });

    it.runIf(heeftIds('ODS_3411'))('ODS_3411 (aardrijkskunde, kleuters): in 2026 mag het al, verplicht vanaf 2027; waarschijnlijk, want de golf van dit vak steunt alleen op het decreet', () => {
      expect(rij('ODS_3411', 2026)).toEqual([
        'K1 mag waarschijnlijk vanaf 2027',
        'K2 mag waarschijnlijk vanaf 2027',
        'K3 mag waarschijnlijk vanaf 2027',
      ]);
      // Vanaf 2027 verplicht; de kleuterklassen zijn dan zeker, maar de golf van het vak blijft waarschijnlijk.
      expect(invoeringVanSet(infoVan('ODS_3411'), 2027).map((i) => `${i.status} ${i.zekerheid}`)).toEqual([
        'verplicht waarschijnlijk',
        'verplicht waarschijnlijk',
        'verplicht waarschijnlijk',
      ]);
    });

    it.runIf(heeftIds('ODS_3417'))('ODS_3417 (muzische vorming, kleuters): zeker, want de oude muzische vorming eindigt in de gegevens op 2027-08-31', () => {
      expect(rij('ODS_3417', 2026)).toEqual(['K1 mag zeker vanaf 2027', 'K2 mag zeker vanaf 2027', 'K3 mag zeker vanaf 2027']);
    });

    it.runIf(heeftIds('ODS_3401', 'ODS_3485'))('ODS_3401 en ODS_3485 (kleuters, golf 1): in 2026 verplicht en zeker', () => {
      expect(rij('ODS_3401', 2026)).toEqual(['K1 verplicht zeker vanaf 2026', 'K2 verplicht zeker vanaf 2026', 'K3 verplicht zeker vanaf 2026']);
      expect(rij('ODS_3485', 2026)).toEqual(['K1 verplicht zeker vanaf 2026', 'K2 verplicht zeker vanaf 2026', 'K3 verplicht zeker vanaf 2026']);
    });

    it.runIf(heeftIds('ODS_3469'))('ODS_3469 (buitengewoon lager, wetenschap en techniek): in 2026 verplicht voor het 1ste tot 3de leerjaar, maar nog onzeker', () => {
      expect(rij('ODS_3469', 2026)).toEqual([
        'L1 verplicht onzeker vanaf 2026',
        'L2 verplicht onzeker vanaf 2026',
        'L3 verplicht onzeker vanaf 2026',
        'L4 mag onzeker vanaf 2027',
      ]);
    });

    it.runIf(heeftIds('ODS_2306'))('ODS_2306 (oude set zonder einddatum): geldt, zeker, met de reden geen-einddatum', () => {
      expect(rij('ODS_2306', 2026)).toEqual(['K1 geldt zeker geen-einddatum', 'K2 geldt zeker geen-einddatum', 'K3 geldt zeker geen-einddatum']);
      expect(rij('ODS_2306', 2040)).toEqual(['K1 geldt zeker geen-einddatum', 'K2 geldt zeker geen-einddatum', 'K3 geldt zeker geen-einddatum']);
    });

    it.runIf(heeftIds('ODS_2959'))('ODS_2959 (lege set): is leeg en heeft geen kalenderregels', () => {
      expect(infoVan('ODS_2959').leeg).toBe(true);
      expect(kalenderVoorSet(infoVan('ODS_2959'))).toEqual([]);
    });

    it.runIf(heeftIds('ODS_3408'))('kalenderVoorSet ODS_3408: het 1ste tot 3de leerjaar in 2026, het 4de in 2027 met de opmerking over het getuigschrift', () => {
      const regels = kalenderVoorSet(infoVan('ODS_3408'));
      expect(regels.map((r) => ({ lj: r.leerjaren, soort: r.soort, jaar: r.jaar, zekerheid: r.zekerheid }))).toEqual([
        { lj: ['L1', 'L2', 'L3'], soort: 'verplicht-vanaf', jaar: 2026, zekerheid: 'waarschijnlijk' },
        { lj: ['L4'], soort: 'verplicht-vanaf', jaar: 2027, zekerheid: 'waarschijnlijk' },
      ]);
      expect(regels[0].opmerking).toBeUndefined();
      expect(regels[1].opmerking).toBe(celVoor('bao', 1, 'L4')?.opmerking);
      expect(regels[1].opmerking).toContain('getuigschrift');
    });

    it.runIf(heeftIds('ODS_3409'))('kalenderVoorSet ODS_3409: het 5de leerjaar in 2027, het 6de in 2028', () => {
      const regels = kalenderVoorSet(infoVan('ODS_3409'));
      expect(regels.map((r) => [r.leerjaren, r.jaar])).toEqual([
        [['L5'], 2027],
        [['L6'], 2028],
      ]);
    });

    it.runIf(heeftIds('ODS_2112', 'ODS_2110'))('kalenderVoorSet ODS_2112 en ODS_2110: het 1ste tot 3de leerjaar laatste schooljaar 2025, het 4de en 5de 2026, het 6de 2027', () => {
      for (const id of ['ODS_2112', 'ODS_2110']) {
        expect(kalenderVoorSet(infoVan(id)).map((r) => [r.leerjaren, r.soort, r.jaar]), id).toEqual([
          [['L1', 'L2', 'L3'], 'laatste-schooljaar', 2025],
          [['L4', 'L5'], 'laatste-schooljaar', 2026],
          [['L6'], 'laatste-schooljaar', 2027],
        ]);
      }
    });

    it.runIf(heeftIds('ODS_3401', 'ODS_2306'))('kalenderVoorSet ODS_3401 en ODS_2306 (kleuters): één regel voor de drie kleuterklassen', () => {
      expect(kalenderVoorSet(infoVan('ODS_3401')).map((r) => [r.leerjaren, r.soort, r.jaar, r.zekerheid])).toEqual([[['K1', 'K2', 'K3'], 'verplicht-vanaf', 2026, 'zeker']]);
      expect(kalenderVoorSet(infoVan('ODS_2306')).map((r) => [r.leerjaren, r.soort, r.jaar, r.zekerheid])).toEqual([[['K1', 'K2', 'K3'], 'geen-einde', undefined, 'zeker']]);
    });
  });

  describe('setsDieGelden', () => {
    const gelden = (soort: SoortBasis, leerjaar: LeerjaarBasis, schooljaar: Schooljaar) => setsDieGelden(index, { soort, leerjaar, schooljaar });

    it.runIf(momentopname)('bao 3de leerjaar (L3) in 2026', () => {
      const g = gelden('bao', 'L3', 2026);
      expect(ids(g.verplicht)).toEqual(['ODS_3395', 'ODS_3406', 'ODS_3408']);
      expect(ids(g.geldtNog)).toEqual(['ODS_2108', 'ODS_2109', 'ODS_2111', 'ODS_2114', 'ODS_2115', 'ODS_2116', 'ODS_2117']);
      expect(ids(g.magAl)).toEqual(['ODS_3412', 'ODS_3415', 'ODS_3418', 'ODS_3421', 'ODS_3423', 'ODS_3426']);
      expect(g.leeg).toEqual([]);
      expect(g.zekerheid).toBe('waarschijnlijk');
    });

    it.runIf(momentopname)('bao 2de kleuterklas (K2) in 2026', () => {
      const g = gelden('bao', 'K2', 2026);
      expect(ids(g.verplicht)).toEqual(['ODS_3397', 'ODS_3401', 'ODS_3404', 'ODS_3405', 'ODS_3410']);
      expect(ids(g.geldtNog)).toEqual(['ODS_2102', 'ODS_2103', 'ODS_2107']);
      expect(ids(g.magAl)).toEqual(['ODS_3411', 'ODS_3414', 'ODS_3417', 'ODS_3420', 'ODS_3425']);
      expect(g.leeg).toEqual([]);
    });

    it.runIf(momentopname)('bao 4de leerjaar (L4) in 2026: niets verplicht, 10 oude sets gelden nog, 9 nieuwe mogen al', () => {
      const g = gelden('bao', 'L4', 2026);
      expect(g.verplicht).toEqual([]);
      expect(ids(g.geldtNog)).toEqual(['ODS_2108', 'ODS_2109', 'ODS_2110', 'ODS_2111', 'ODS_2112', 'ODS_2113', 'ODS_2114', 'ODS_2115', 'ODS_2116', 'ODS_2117']);
      expect(g.magAl).toHaveLength(9);
      expect(ids(g.magAl)).toEqual(['ODS_3395', 'ODS_3406', 'ODS_3408', 'ODS_3412', 'ODS_3415', 'ODS_3418', 'ODS_3421', 'ODS_3423', 'ODS_3426']);
    });

    it.runIf(momentopname)('bao 6de leerjaar (L6) in 2030: tien nieuwe sets verplicht, geen oude set meer', () => {
      const g = gelden('bao', 'L6', 2030);
      expect(ids(g.verplicht)).toEqual(['ODS_3396', 'ODS_3407', 'ODS_3409', 'ODS_3413', 'ODS_3416', 'ODS_3419', 'ODS_3422', 'ODS_3424', 'ODS_3427', 'ODS_3428']);
      expect(g.geldtNog).toEqual([]);
      expect(g.magAl).toEqual([]);
    });

    it.runIf(momentopname)('bubao 3de leerjaar (L3) in 2026: drie nieuwe sets verplicht, 22 oude sets gelden nog, ODS_2959 is leeg, alles nog onzeker', () => {
      const g = gelden('bubao', 'L3', 2026);
      expect(ids(g.verplicht)).toEqual(['ODS_3465', 'ODS_3467', 'ODS_3469']);
      expect(g.geldtNog).toHaveLength(22);
      expect(idsVan(g.leeg)).toEqual(['ODS_2959']);
      expect(g.zekerheid).toBe('onzeker');
    });

    it.runIf(heeftBasis)('setsDieGelden volgt de volgorde van de index, houdt de soorten gescheiden en laat een lege set alleen in leeg', () => {
      const orde = new Map(index.map((s, i) => [s.id, i]));
      for (const soort of SOORTEN) {
        for (const lj of LEERJAREN_BASIS) {
          for (const sj of [2025, 2026, 2027, 2029, 2031]) {
            const g = gelden(soort, lj, sj);
            for (const lijst of [g.verplicht, g.geldtNog, g.magAl]) {
              const posities = lijst.map((x) => orde.get(x.set.id) ?? -1);
              expect(posities, `${soort} ${lj} ${sj}`).toEqual([...posities].sort((a, b) => a - b));
              for (const x of lijst) {
                expect(x.info.soort).toBe(soort);
                expect(x.info.leeg, x.set.id).toBe(false);
                expect(x.info.leerjaren).toContain(lj);
              }
            }
            expect(g.verplicht.every((x) => x.invoering.status === 'verplicht'), `${soort} ${lj} ${sj}`).toBe(true);
            expect(g.geldtNog.every((x) => x.invoering.status === 'geldt'), `${soort} ${lj} ${sj}`).toBe(true);
            expect(g.magAl.every((x) => x.invoering.status === 'mag'), `${soort} ${lj} ${sj}`).toBe(true);
            // Een set staat nooit in twee lijsten.
            const alle = [...ids(g.verplicht), ...ids(g.geldtNog), ...ids(g.magAl), ...idsVan(g.leeg)];
            expect(new Set(alle).size, `${soort} ${lj} ${sj}`).toBe(alle.length);
          }
        }
      }
    });
  });

  // ── De einddatum en de grens van 1 september ────────────────────────────

  describe('de einddatum van een oude set', () => {
    it.runIf(heeftBasis)('tot en met het schooljaar van de einddatum is de oude set niet vervallen, het schooljaar erna voor alle leerjaren wel (de grens van 1 september)', () => {
      let gecontroleerd = 0;
      for (const { set, info } of basisRijenVan(index).filter((x) => x.info.generatie === 'oud' && x.info.geldigTotEnMet !== undefined)) {
        const laatste = info.geldigTotEnMet as Schooljaar;
        const dag = dagVan(set.geldigTot) as string;
        // Een einddatum op 31 augustus hoort bij het schooljaar dat die dag eindigt.
        expect(schooljaarVan(dag), set.id).toBe(laatste);
        expect(invoeringVanSet(info, laatste).every((i) => i.status !== 'vervallen'), `${set.id} in ${laatste}`).toBe(true);
        expect(invoeringVanSet(info, laatste + 1).every((i) => i.status === 'vervallen'), `${set.id} in ${laatste + 1}`).toBe(true);
        gecontroleerd++;
      }
      expect(gecontroleerd).toBeGreaterThan(0);
    });

    it.runIf(heeftBasis)('het label "Geldig" speelt geen rol: de sets met het label "Geldig" en een einddatum vervallen op die datum, ook al zegt het label nog "Geldig"', () => {
      const geldigMetEinde = basisRijenVan(index).filter((x) => geldigheidVan(x.set) === 'G' && x.info.geldigTotEnMet !== undefined);
      expect(geldigMetEinde.length).toBeGreaterThan(0);
      for (const { set, info } of geldigMetEinde) {
        const laatste = info.geldigTotEnMet as Schooljaar;
        expect(invoeringVanSet(info, laatste + 1).every((i) => i.status === 'vervallen'), `${set.id} (${set.geldigheid})`).toBe(true);
      }
    });

    it.runIf(heeftIds('ODS_2102'))('ODS_2102 (oude kleuterdoelen lichamelijke opvoeding) staat nog als "Geldig" maar vervalt op 1 september 2027', () => {
      const set = setVan('ODS_2102');
      expect(set.geldigheid).toBe('Geldig');
      expect(set.geldigTot).toBe('2027-08-31');
      expect(invoeringVanSet(infoVan('ODS_2102'), 2026).map((i) => i.status)).toEqual(['geldt', 'geldt', 'geldt']);
      expect(invoeringVanSet(infoVan('ODS_2102'), 2027).map((i) => i.status)).toEqual(['vervallen', 'vervallen', 'vervallen']);
    });
  });

  // ── Teksten ─────────────────────────────────────────────────────────────

  describe('de teksten bij een oude set', () => {
    it.runIf(heeftBasis)('de tekst bij een oude set volgt de soort doelen (eindtermen of ontwikkelingsdoelen), niet het moment', () => {
      let eindtermen = 0;
      let ontwikkelingsdoelen = 0;
      for (const { set, info } of basisRijenVan(index).filter((x) => x.info.generatie === 'oud')) {
        const wat = info.soortDoelen;
        expect(wat === 'eindtermen' || wat === 'ontwikkelingsdoelen', `${set.id}: ${set.naam}`).toBe(true);
        const hele = info.moment === 'kleuter' ? 'kleuteronderwijs' : 'lager onderwijs';
        expect(voorWieTekst(info), set.id).toBe(`Oude ${wat} voor het hele ${hele}.`);
        if (wat === 'eindtermen') eindtermen++;
        else ontwikkelingsdoelen++;
      }
      expect(eindtermen + ontwikkelingsdoelen).toBe(basisRijenVan(index).filter((x) => x.info.generatie === 'oud').length);
    });

    it.runIf(heeftIds('ODS_2108', 'ODS_2104', 'ODS_2959'))('de oude lagere sets van het gewoon onderwijs zijn eindtermen, die van het buitengewoon onderwijs ontwikkelingsdoelen', () => {
      expect(voorWieTekst(infoVan('ODS_2108'))).toBe('Oude eindtermen voor het hele lager onderwijs.');
      expect(voorWieTekst(infoVan('ODS_2959'))).toBe('Oude ontwikkelingsdoelen voor het hele lager onderwijs.');
      expect(voorWieTekst(infoVan('ODS_2104'))).toBe('Oude ontwikkelingsdoelen voor het hele kleuteronderwijs.');
    });

    it.runIf(momentopname)('momentopname: 10 oude lagere sets van het gewoon onderwijs zijn eindtermen, 53 van het buitengewoon onderwijs ontwikkelingsdoelen', () => {
      const oud = basisRijenVan(index).filter((x) => x.info.generatie === 'oud');
      const tel = (soort: SoortBasis, moment: MomentBasis, wat: string) => oud.filter((x) => x.info.soort === soort && x.info.moment === moment && x.info.soortDoelen === wat).length;
      expect(tel('bao', 'lager', 'eindtermen')).toBe(10);
      expect(tel('bubao', 'lager', 'ontwikkelingsdoelen')).toBe(53);
      expect(tel('bao', 'kleuter', 'ontwikkelingsdoelen')).toBe(6);
      expect(tel('bubao', 'kleuter', 'ontwikkelingsdoelen')).toBe(19);
      expect(oud.filter((x) => x.info.soort === 'bubao' && x.info.moment === 'lager').some((x) => /eindtermen/i.test(voorWieTekst(x.info)))).toBe(false);
    });

    it.runIf(heeftIds('ODS_2115', 'ODS_2116', 'ODS_2110'))('een oude set zonder nieuwe tegenhanger (Leren leren, Sociale vaardigheden): "Niet meer verplicht", zonder een nieuwe set te noemen', () => {
      for (const id of ['ODS_2115', 'ODS_2116']) {
        const info = infoVan(id);
        expect(info.generatie, id).toBe('oud');
        expect(tweelingSets(info, index), id).toEqual([]);
        // Beide horen bij de tweede golf: pas in 2027 zijn de nieuwe minimumdoelen verplicht voor het 1ste tot 3de leerjaar.
        expect(invoeringVanSet(info, 2026).filter((i) => i.status === 'vervangen'), id).toEqual([]);
        const vervangen = invoeringVanSet(info, 2027).filter((i) => i.status === 'vervangen').map((i) => i.leerjaar);
        expect(vervangen, id).toEqual(['L1', 'L2', 'L3']);
        const tekst = vervangenTekst(vervangen);
        expect(tekst).toBe('Niet meer verplicht voor het 1ste, 2de en 3de leerjaar: daar gelden de nieuwe minimumdoelen.');
        expect(tekst).not.toMatch(/ODS_\d+/);
        expect(statusDeel('vervangen', vervangen)).not.toMatch(/ODS_\d+|vervangen door/);
      }
      expect(STATUS_LABEL.vervangen).not.toMatch(/vervangen door/);
    });

    it.runIf(heeftBasis)('geen enkele tekst van het model beweert een koppeling van een oude op een nieuwe set, noemt een set of zegt nagekeken', () => {
      const teksten: string[] = [
        ...Object.values(STATUS_LABEL),
        ...Object.values(ZEKERHEID_UITLEG),
        ...Object.values(GOLF_TEKST),
        ...Object.values(BRON_HOE_LABEL),
      ];
      for (const { info } of basisRijenVan(index)) {
        teksten.push(voorWieTekst(info));
        for (let sj = 2025; sj <= 2031; sj++) {
          for (const status of new Set(invoeringVanSet(info, sj).map((i) => i.status))) {
            teksten.push(statusDeel(status, invoeringVanSet(info, sj).filter((i) => i.status === status).map((i) => i.leerjaar)));
          }
        }
      }
      for (const tekst of new Set(teksten)) {
        expect(tekst, tekst).not.toMatch(/vervangen door|nagekeken|widget|ODS_\d+/i);
      }
    });

    it.runIf(heeftBasis)('een set die helemaal vervallen is, zegt "Deze doelen gelden niet meer sinds 1 september <jaar>."', () => {
      let gecontroleerd = 0;
      for (const { set, info } of basisRijenVan(index).filter((x) => x.info.generatie === 'oud' && x.info.geldigTotEnMet !== undefined)) {
        const laatste = info.geldigTotEnMet as Schooljaar;
        expect(invoeringVanSet(info, laatste + 1).every((i) => i.status === 'vervallen'), set.id).toBe(true);
        const jaar = Number((dagVan(set.geldigTot) as string).slice(0, 4));
        expect(vervallenTekst(laatste), set.id).toBe(`Deze doelen gelden niet meer sinds 1 september ${jaar}.`);
        gecontroleerd++;
      }
      expect(gecontroleerd).toBeGreaterThan(0);
    });

    it.runIf(heeftIds('ODS_2104'))('ODS_2104: in 2026 helemaal vervallen sinds 1 september 2026', () => {
      const info = infoVan('ODS_2104');
      expect(invoeringVanSet(info, 2026).every((i) => i.status === 'vervallen')).toBe(true);
      expect(info.geldigTotEnMet).toBe(2025);
      expect(vervallenTekst(info.geldigTotEnMet as Schooljaar)).toBe('Deze doelen gelden niet meer sinds 1 september 2026.');
    });
  });

  // ── geldigheidTekstBasis ────────────────────────────────────────────────

  describe('geldigheidTekstBasis', () => {
    const VANDAAG = '2026-11-02';

    it.runIf(heeftBasis)('een set van het basisonderwijs met het label "Geldig" en een einddatum toont "Geldig tot <datum>", elke andere set precies geldigheidTekst', () => {
      for (const s of index) {
        const basis = isBasisSoort(soortVanSet(s.naam));
        const verwacht = basis && geldigheidVan(s) === 'G' && dagVan(s.geldigTot) !== undefined ? `Geldig tot ${datumLeesbaar(s.geldigTot)}` : geldigheidTekst(s);
        expect(geldigheidTekstBasis(s.naam, s, VANDAAG), s.id).toBe(verwacht);
      }
    });

    it.runIf(momentopname)('momentopname: precies 54 sets krijgen "Geldig tot ..." (13 gewoon en 41 buitengewoon basisonderwijs)', () => {
      const veranderd = index.filter((s) => geldigheidTekstBasis(s.naam, s, VANDAAG) !== geldigheidTekst(s));
      expect(veranderd).toHaveLength(54);
      expect(veranderd.filter((s) => soortVanSet(s.naam) === 'bao')).toHaveLength(13);
      expect(veranderd.filter((s) => soortVanSet(s.naam) === 'bubao')).toHaveLength(41);
      for (const s of veranderd) expect(geldigheidTekstBasis(s.naam, s, VANDAAG), s.id).toMatch(/^Geldig tot \d{1,2} \p{L}+ \d{4}$/u);
    });

    it.runIf(heeftIds('ODS_2110', 'ODS_2102', 'ODS_3395', 'ODS_2104'))('de voorbeelden uit de acceptatie', () => {
      const tekst = (id: string, vandaag = VANDAAG) => geldigheidTekstBasis(setVan(id).naam, setVan(id), vandaag);
      expect(tekst('ODS_2110')).toBe('Geldig tot 31 augustus 2028');
      expect(tekst('ODS_2102')).toBe('Geldig tot 31 augustus 2027');
      expect(tekst('ODS_3395')).toBe('Geldig sinds 2025');
      expect(tekst('ODS_2104')).toBe('Niet meer geldig (1998–2026)');
    });

    it.runIf(heeftIds('ODS_2110', 'ODS_2102'))('op en voor de einddatum "Geldig tot", erna "Gold tot", ook als het label nog "Geldig" zegt', () => {
      const tekst = (id: string, vandaag: string) => geldigheidTekstBasis(setVan(id).naam, setVan(id), vandaag);
      expect(tekst('ODS_2110', '2026-11-02')).toBe('Geldig tot 31 augustus 2028');
      expect(tekst('ODS_2110', '2028-08-31')).toBe('Geldig tot 31 augustus 2028');
      expect(tekst('ODS_2110', '2028-09-01')).toBe('Gold tot 31 augustus 2028');
      expect(tekst('ODS_2102', '2027-08-31')).toBe('Geldig tot 31 augustus 2027');
      expect(tekst('ODS_2102', '2027-09-01')).toBe('Gold tot 31 augustus 2027');
      expect(setVan('ODS_2102').geldigheid).toBe('Geldig');
    });

    it.runIf(heeftBasis)('vandaag verandert niets voor een set buiten het basisonderwijs of met het label "Niet meer geldig"', () => {
      for (const vandaag of ['2020-01-01', '2026-11-02', '2035-09-01']) {
        for (const s of index.filter((x) => !isBasisSoort(soortVanSet(x.naam)) || geldigheidVan(x) !== 'G')) {
          expect(geldigheidTekstBasis(s.naam, s, vandaag), `${s.id} op ${vandaag}`).toBe(geldigheidTekst(s));
        }
      }
    });
  });

  // ── Het secundair blijft ongewijzigd ────────────────────────────────────

  describe('het secundair en de rest blijven ongewijzigd', () => {
    it.runIf(heeftBasis)('voor elke set waarvoor isBasisSoort onwaar is, geeft basisSet undefined en is geldigheidTekstBasis gelijk aan geldigheidTekst', () => {
      const buiten = index.filter((s) => !isBasisSoort(soortVanSet(s.naam)));
      expect(buiten.length).toBeGreaterThan(0);
      for (const s of buiten) {
        expect(basisSet(s), s.id).toBeUndefined();
        expect(geldigheidTekstBasis(s.naam, s, '2026-11-02'), s.id).toBe(geldigheidTekst(s));
      }
    });

    it.runIf(momentopname)('momentopname: 952 sets buiten het model, ook de lerarenopleiding voor kleuter- en lager onderwijs (ODS_2842 en ODS_2843)', () => {
      const buiten = index.filter((s) => !isBasisSoort(soortVanSet(s.naam)));
      expect(buiten).toHaveLength(952);
      for (const id of ['ODS_2842', 'ODS_2843', 'ODS_3287', 'ODS_3361']) expect(basisSet(setVan(id)), id).toBeUndefined();
    });

    it.runIf(heeftIds('ODS_3287', 'ODS_3361'))('een set van het secundair met "Geldig" en een einddatum, of zonder, krijgt nooit "Geldig tot"', () => {
      for (const id of ['ODS_3287', 'ODS_3361']) {
        const s = setVan(id);
        expect(geldigheidTekstBasis(s.naam, s, '2026-11-02')).toBe(geldigheidTekst(s));
        expect(geldigheidTekstBasis(s.naam, { ...s, geldigTot: '2030-08-31' }, '2026-11-02')).toBe(geldigheidTekst({ ...s, geldigTot: '2030-08-31' }));
      }
    });
  });

  // ── De controles en het rapport slaan aan bij afwijkingen ───────────────

  describe('de controles en het rapport zien een afwijking', () => {
    it.runIf(heeftBasis)('een oude set met een verschoven einddatum valt op, in de controle, in kalenderTegenGegevens en in het rapport', () => {
      const gewijzigd = index.map((s) => (s.id === 'ODS_2110' ? { ...s, geldigTot: '2029-08-31' } : s));
      const c = controleEinddata(gewijzigd);
      expect(c.afwijkingen.map((a) => a.setId)).toContain('ODS_2110');
      expect(kalenderTegenGegevens(gewijzigd).join('\n')).toContain('ODS_2110');
      const rapport = rapportTekst(verzamelAfwijkingen(gewijzigd));
      expect(rapport).toContain('ODS_2110');
      expect(rapport).toContain('31 augustus 2029');
      expect(rapport).toContain('de kalender verwacht');
      expect(rapport).toContain('de gegevens zeggen');
    });

    it.runIf(heeftBasis)('een nieuwe set met een vak dat niet in de kalender staat valt op', () => {
      const basis = setVan('ODS_3395');
      const nieuw: MinimumdoelenIndexSet = { ...basis, id: 'ODS_9999', korteNaam: 'Burgerschap', naam: basis.naam.replace('Nederlands', 'Burgerschap') };
      const gewijzigd = [...index, nieuw];
      expect(controleNieuweSets(gewijzigd).afwijkingen.map((a) => a.setId)).toEqual(['ODS_9999']);
      expect(kalenderTegenGegevens(gewijzigd).join('\n')).toContain('ODS_9999');
      expect(rapportTekst(verzamelAfwijkingen(gewijzigd))).toContain('Burgerschap');
    });

    it.runIf(heeftBasis)('als de oude sets van golf 2 een jaar eerder eindigen, valt dat op in de einddata en in de xor-regel', () => {
      const gewijzigd = index.map((s) => (/^Lager Onderwijs - /.test(s.naam) && s.geldigTot === '2030-08-31' ? { ...s, geldigTot: '2029-08-31' } : s));
      expect(controleEinddata(gewijzigd).afwijkingen.length).toBeGreaterThan(0);
      expect(controleXor(gewijzigd).afwijkingen.length).toBeGreaterThan(0);
      expect(kalenderTegenGegevens(gewijzigd).length).toBeGreaterThan(0);
    });

    it.runIf(heeftBestand('ODS_3395', 'ODS_3406'))('een doel met een code van een ander vak, of van een andere soort, valt op', () => {
      const lezer: DoelenLezer = (set) => {
        const rijen = doelenVan(set);
        if (!rijen || set.id !== 'ODS_3395') return rijen;
        return rijen.map((d, i) => (i === 0 ? { ...d, code: '5.1.1', type: 'Na te streven minimumdoelen op populatieniveau' } : d));
      };
      const c = controleDoelen(index, INVOERINGSKALENDER, lezer);
      expect(c.afwijkingen.map((a) => a.setId)).toEqual(['ODS_3395', 'ODS_3395', 'ODS_3395']);
      expect(c.afwijkingen[0].gegevens).toContain('code 5.1.1');
      const tweeling = controleTweelingen('bao', index, INVOERINGSKALENDER, lezer);
      expect(tweeling.afwijkingen.length).toBeGreaterThan(0);
    });

    it('het rapport zegt "Geen afwijkingen." zonder afwijkingen, en anders een lijst met set-id, verwachting en gegevens', () => {
      expect(rapportTekst([])).toBe('Geen afwijkingen.\n');
      const een = rapportTekst([{ setId: 'ODS_2110', verwacht: 'golf 1', gegevens: 'geen golf' }]);
      expect(een).toBe('Er is 1 afwijking van de kalender tegen de gegevens:\n\n- ODS_2110: de kalender verwacht golf 1; de gegevens zeggen: geen golf.\n');
      const veel = rapportTekst(Array.from({ length: MAX_REGELS_IN_RAPPORT + 5 }, (_, i) => ({ setId: `ODS_${i}`, verwacht: 'a', gegevens: 'b' })));
      expect(veel.split('\n').filter((r) => r.startsWith('- '))).toHaveLength(MAX_REGELS_IN_RAPPORT + 1);
      expect(veel).toContain('en nog 5 afwijkingen');
      expect(een).not.toMatch(/^#/m);
    });

    it.runIf(heeftBasisBestanden)('de echte gegevens geven geen enkele afwijking in het rapport', () => {
      expect(rapportTekst(verzamelAfwijkingen(index))).toBe('Geen afwijkingen.\n');
    });
  });
});
