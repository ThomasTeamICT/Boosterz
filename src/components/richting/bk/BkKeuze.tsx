// De keuze van de competenties in het venster "Nieuwe cursus" (docs/STUDIERICHTINGEN.md § 23.7.3): per beroepskwalificatie
// een fieldset met "Alle <n> competenties" en "Kies zelf de competenties (n van m)". Dit bestand zit in het lui chunk `bk`.
//
// Naast het scherm staan hier de functies waarmee het venster de competenties kiest en er een leerplan van maakt. Ze zitten
// hier en niet in het venster zelf, zodat de logica van de beroepskwalificaties (het BK-leerplan, de nakijkpoort, het
// geraamte) pas binnenkomt als de leerkracht die keuze maakt: het venster blijft klein, ook voor een richting zonder
// beroepskwalificaties. De functies zijn puur, op het laden van de bestanden na (`laadBkGegevens`).
//
// Elk aantal competenties dat hier op het scherm staat, komt uit `aantalCompetentiesMetTekst` (dekkingBk.ts): een
// competentie zonder tekst staat nergens in (§ 23.6.4). De keuze is altijd een lijst competentiecodes, nooit "alle": zo
// geeft één competentie uitvinken één doel minder (de valkuil van § 9.5). Een competentiecode staat nooit op het scherm.

import { useMemo } from 'react';
import { doelcodesVanBestand, type BkBestand } from '../../../lib/beroepskwalificaties';
import { laadBk, laadBkIndex } from '../../../lib/beroepskwalificatiesBron';
import { leerplanUitBk, selectieVanBkLeerplan, tekstVanCompetentie, titelVoorBkLeerplan, vindBkLeerplan, type BkKeuze as BkKeuzeBestand } from '../../../lib/bkLeerplan';
import { cursusVoorBk } from '../../../lib/bkCursus';
import { aantalCompetentiesMetTekst } from '../../../lib/dekkingBk';
import { BK_VENSTER_FOUT, BK_ZONDER_BESTAND, bkAlleCompetenties, bkKiesZelf, bkLegende, bkNietNagekeken } from '../../../lib/bkWeergave';
import type { Curriculum } from '../../../lib/curriculumTypes';
import type { Doelgroep } from '../../../lib/doelgroep';
import type { RichtingBk } from '../../../lib/richtingBk';
import type { RichtingInfo } from '../../../lib/richtingKader';

export { cursusVoorBk };

// ── Wat er in een bestand te kiezen valt ────────────────────────────────────

/** Een competentie die gekozen kan worden: haar code (nooit op het scherm) en haar tekst zoals ze in het leerplan komt. */
export interface CompetentieRij {
  id: string;
  tekst: string;
}

interface BestandInfo {
  rijen: CompetentieRij[];
  /** `aantalCompetentiesMetTekst`: het getal voor het scherm. */
  aantal: number;
}

// De validator loopt over het hele bestand: één keer per bestand, niet bij elke render.
const INFO = new WeakMap<BkBestand, BestandInfo>();

/**
 * De competenties met een tekst van een bestand, in de volgorde van het bestand: precies de lijst van het leerplan en van de
 * dekking (`bkKaderDoelen`). Een competentie zonder tekst, of die een tweede keer voorkomt, staat er niet in.
 */
function infoVan(bestand: BkBestand): BestandInfo {
  const bewaard = INFO.get(bestand);
  if (bewaard) return bewaard;
  const codes = doelcodesVanBestand(bestand);
  const gezien = new Set<string>();
  const rijen: CompetentieRij[] = [];
  for (const c of bestand.competenties) {
    if (gezien.has(c.id)) continue;
    gezien.add(c.id);
    const tekst = tekstVanCompetentie(c);
    if (tekst === '' || !codes.has(c.id)) continue;
    rijen.push({ id: c.id, tekst });
  }
  const info = { rijen, aantal: aantalCompetentiesMetTekst(bestand) };
  INFO.set(bestand, info);
  return info;
}

/** De competenties die gekozen kunnen worden, met hun tekst. */
export function competentieRijen(bestand: BkBestand): readonly CompetentieRij[] {
  return infoVan(bestand).rijen;
}

/** De codes van alle competenties met een tekst, in de volgorde van het bestand: "alle", als lijst. */
export function competentieIds(bestand: BkBestand): string[] {
  return infoVan(bestand).rijen.map((r) => r.id);
}

// ── Laden ───────────────────────────────────────────────────────────────────

/** De bestanden van de gekozen BK-versies en hun versiemerken uit de index. */
export interface BkGegevens {
  bestanden: Map<string, BkBestand>;
  /** BK-versie → de eerste 16 tekens van haar sha256 in de index (zoals `leerplanUitBk` en `vindBkLeerplan` ze vragen). */
  merken: Map<string, string>;
  /** Versies waarvan het bestand er niet is (404). */
  ontbreekt: string[];
}

/**
 * Haalt de bestanden van deze BK-versies op (uit het geheugen als ze er al zijn), en met `metMerken` de versiemerken uit de
 * index. Gooit als iets niet geladen kan worden (de fout van de lader); een bestand dat er niet is, staat in `ontbreekt`.
 */
export async function laadBkGegevens(versies: readonly string[], metMerken = true): Promise<BkGegevens> {
  const lijst = [...new Set(versies)];
  const [bestanden, index] = await Promise.all([
    Promise.all(lijst.map((v) => laadBk(v))),
    metMerken ? laadBkIndex() : Promise.resolve(null),
  ]);
  const uit: BkGegevens = { bestanden: new Map(), merken: new Map(), ontbreekt: [] };
  lijst.forEach((v, i) => {
    const b = bestanden[i];
    if (b) uit.bestanden.set(v, b);
    else uit.ontbreekt.push(v);
  });
  for (const r of index?.bks ?? []) {
    if (typeof r.sha256 === 'string' && r.sha256.length >= 16) uit.merken.set(r.bk, r.sha256.slice(0, 16));
  }
  return uit;
}

/** De BK-versies van een BK-leerplan, voor het laden van hun bestanden (het geraamte heeft de kennis en vaardigheden nodig). */
export function bkVersiesVan(leerplan: Curriculum): string[] {
  return [...selectieVanBkLeerplan(leerplan).keys()];
}

// ── Van een keuze naar een leerplan ─────────────────────────────────────────

/** Wat "Maak de cursus" met een keuze doet vóór het de cursus maakt. */
export type KeuzeUitkomst =
  /** Niet nagekeken (of niet te maken): niets bewaren, `tekst` is de volledige melding. */
  | { soort: 'probleem'; tekst: string }
  /** Er staat al een nagekeken leerplan met precies deze competenties op dit toestel. */
  | { soort: 'hergebruik'; leerplan: Curriculum }
  /** Een nieuw, nagekeken leerplan, nog niet bewaard. `waarschuwingen` zijn dingen die de leerkracht moet lezen. */
  | { soort: 'nieuw'; leerplan: Curriculum; waarschuwingen: string[] };

/**
 * Het leerplan voor een keuze competenties (§ 23.7.3): een bestaand nagekeken leerplan met precies deze competenties en
 * hetzelfde versiemerk (`vindBkLeerplan`), anders een nieuw leerplan (`leerplanUitBk`). Niet nagekeken: niets bewaren, de
 * melding staat in `tekst`. De keuze is een lijst codes per BK-versie; wat niet in het bestand staat of geen tekst heeft,
 * valt weg. Bewaren doet de aanroeper.
 */
export function leerplanVoorKeuze(o: {
  info: RichtingInfo;
  doelgroep: Doelgroep;
  /** Het vak dat de leerkracht typte; leeg: de titel van de beroepskwalificatie (bij meer "Beroepsgerichte vorming"). */
  vak?: string;
  selectie: ReadonlyMap<string, readonly string[]>;
  gegevens: Pick<BkGegevens, 'bestanden' | 'merken'>;
  curricula: readonly Curriculum[];
}): KeuzeUitkomst {
  const keuzes: BkKeuzeBestand[] = [];
  for (const [bk, ids] of o.selectie) {
    const bestand = o.gegevens.bestanden.get(bk);
    if (!bestand) return { soort: 'probleem', tekst: BK_VENSTER_FOUT };
    const mogelijk = new Set(competentieIds(bestand));
    const competenties = ids.filter((id) => mogelijk.has(id));
    if (competenties.length > 0) keuzes.push({ bestand, competenties });
  }
  if (keuzes.length === 0) return { soort: 'probleem', tekst: 'Kies minstens één competentie.' };

  const selectie = new Map(keuzes.map((k) => [k.bestand.bk, k.competenties] as const));
  const bestaand = vindBkLeerplan(o.curricula, selectie, o.doelgroep, o.gegevens.merken);
  if (bestaand) return { soort: 'hergebruik', leerplan: bestaand };

  const titels = keuzes.map((k) => k.bestand.titel.trim());
  const deel = keuzes.length === 1 && keuzes[0].competenties.length < infoVan(keuzes[0].bestand).aantal
    ? { gekozen: keuzes[0].competenties.length, totaal: infoVan(keuzes[0].bestand).aantal }
    : undefined;
  const u = leerplanUitBk(keuzes, {
    doelgroep: o.doelgroep,
    merken: o.gegevens.merken,
    titel: titelVoorBkLeerplan(o.info, titels, deel),
    vak: o.vak || undefined,
  });
  if (!u.bevestigd) return { soort: 'probleem', tekst: bkNietNagekeken(u.waarschuwingen[0] ?? '') };
  return { soort: 'nieuw', leerplan: u.leerplan, waarschuwingen: u.waarschuwingen };
}

// ── Het scherm ──────────────────────────────────────────────────────────────

export interface BkKeuzeProps {
  /** Het BK-kader van de richting (met minstens één BK). */
  bk: RichtingBk;
  /** De geladen bestanden, per BK-versie. Een BK zonder bestand is niet te kiezen. */
  bestanden: ReadonlyMap<string, BkBestand>;
  /** Per BK-versie de gekozen competentiecodes, altijd als lijst (nooit "alle"). Een BK zonder keuze staat er niet in. */
  keuze: ReadonlyMap<string, readonly string[]>;
  /**
   * De leerkracht wijzigde de keuze van één BK-versie: `ids` zijn haar nieuwe gekozen competentiecodes (leeg: alles uit). Het
   * venster onthoudt alleen wat ze aanraakte, zodat een standaard van een BK die nog laadt, niet verloren gaat.
   */
  onKeuze: (versie: string, ids: string[]) => void;
  /**
   * Hoe het met het bestand van een BK-versie staat. Een versie die laadt of niet laadde, toont het venster zelf (met
   * "Opnieuw proberen"); een versie waarvan het bestand er niet is, krijgt hier haar uitleg.
   */
  stand?: ReadonlyMap<string, 'laden' | 'klaar' | 'ontbreekt' | 'fout'>;
  /** Het `id` van het eerste vakje: daar gaat de focus naartoe als er nog competenties nodig zijn. */
  eersteId?: string;
}

function BkGroep({ titel, bestand, gekozen, onWijzig, eersteId }: {
  titel: string;
  bestand: BkBestand;
  gekozen: readonly string[];
  onWijzig: (ids: string[]) => void;
  eersteId?: string;
}) {
  const { rijen, aantal } = infoVan(bestand);
  const gekozenSet = new Set(gekozen);
  const aan = rijen.filter((r) => gekozenSet.has(r.id)).length;
  const alles = aan > 0 && aan === rijen.length;
  const deel = aan > 0 && !alles;
  // De volgorde van het bestand: dezelfde als het leerplan.
  const zet = (set: ReadonlySet<string>) => onWijzig(rijen.filter((r) => set.has(r.id)).map((r) => r.id));
  const wissel = (id: string) => {
    const nieuw = new Set(gekozenSet);
    if (nieuw.has(id)) nieuw.delete(id);
    else nieuw.add(id);
    zet(nieuw);
  };
  return (
    <fieldset className="rc-bk-groep">
      <legend>{titel}</legend>
      <label className="rc-bk-rij rc-bk-alle">
        <input
          type="checkbox" id={eersteId} checked={alles}
          ref={(el) => { if (el) el.indeterminate = deel; }}
          onChange={() => zet(alles ? new Set() : new Set(rijen.map((r) => r.id)))}
        />
        <span>{bkAlleCompetenties(aantal)}</span>
      </label>
      <details className="rc-bk-details">
        <summary>{bkKiesZelf(aan, aantal)}</summary>
        <ul className="rc-bk-lijst">
          {rijen.map((r) => (
            <li key={r.id}>
              <label className="rc-bk-rij">
                <input type="checkbox" checked={gekozenSet.has(r.id)} onChange={() => wissel(r.id)} />
                <span>{r.tekst}</span>
              </label>
            </li>
          ))}
        </ul>
      </details>
    </fieldset>
  );
}

/**
 * Per beroepskwalificatie van het kader een fieldset met de vakjes. Een beroepskwalificatie waarvan het bestand er niet is,
 * krijgt haar uitleg; eentje die nog laadt of niet laadde, blijft weg (het venster zegt dat zelf). Twee versies met dezelfde
 * titel krijgen er het officiële nummer bij, ná de titel, zodat een schermlezer ze uit elkaar houdt.
 */
export function BkKeuze({ bk, bestanden, keuze, onKeuze, stand, eersteId }: BkKeuzeProps) {
  const dubbel = useMemo(() => {
    const telling = new Map<string, number>();
    for (const r of bk.bks) telling.set(r.titel, (telling.get(r.titel) ?? 0) + 1);
    return new Set([...telling].filter(([, n]) => n > 1).map(([titel]) => titel));
  }, [bk.bks]);
  let eerste = true;
  return (
    <div className="rc-bk">
      {bk.bks.map((regel) => {
        const bestand = bestanden.get(regel.bk);
        const naam = dubbel.has(regel.titel) ? `${regel.titel} (officieel nummer ${regel.bk})` : regel.titel;
        if (!bestand) {
          const status = stand?.get(regel.bk);
          if (status === 'laden' || status === 'fout') return null;
          return (
            <fieldset key={regel.bk} className="rc-bk-groep">
              <legend>{naam}</legend>
              <p className="rc-bk-zin">{BK_ZONDER_BESTAND}</p>
            </fieldset>
          );
        }
        const id = eerste ? eersteId : undefined;
        eerste = false;
        return (
          <BkGroep
            key={regel.bk}
            titel={bkLegende(naam, infoVan(bestand).aantal)}
            bestand={bestand}
            gekozen={keuze.get(regel.bk) ?? []}
            eersteId={id}
            onWijzig={(ids) => onKeuze(regel.bk, ids)}
          />
        );
      })}
    </div>
  );
}
