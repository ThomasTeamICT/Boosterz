// De lichte controle van de bestanden van het GO! in de browser (docs/basisonderwijs/GO-LEERPLAN.md, "Opslag").
//
// Streng valideren gebeurt bij de import (tools/basis/go/maak.ts) en in de uitrolpoort (goBestanden.test.ts, met de
// sha256 nagerekend), met valideer.ts. In de app volstaat deze controle; ze is veel kleiner en sneller. Ze kijkt na:
// - het soort bestand (app en kind) en de versie v: een onbekende v wordt geweigerd, want de vorm is dan veranderd
//   (afspraak in types.ts) en het scherm zegt 'Laad de pagina opnieuw';
// - elk veld dat een scherm leest, met zijn type (tekst, getal, lijst, object). Waar een onbekende waarde een scherm zou
//   laten vastlopen of tekst stil zou laten wegvallen, ook de toegelaten waarden: leeftijd, moment, vak, soort blok,
//   niveau van een kop, pictogram, soort inhoud en status van een beeld;
// - wat in een href of src komt (de link naar GO! studio, het pad van een beeld): het vaste patroon.
// Een onbekend optioneel veld laat ze bewust door: zo breekt een uitrol met een nieuw veld geen tabblad dat openstond.
// Ze gooit nooit. Een lege lijst betekent 'in orde'; anders één melding met de plaats, voor de console (niet het scherm).

import { GO_LEEFTIJDEN } from './leeftijden';
import { GO_ICONEN, GO_MOMENTEN, isGoVak } from './types';

type Obj = Record<string, unknown>;

/** Een fout in de vorm: stopt de controle van dit bestand. */
class VormFout extends Error {}

function fout(pad: string, wat: string): never {
  throw new VormFout(`${pad}: ${wat}`);
}

function obj(v: unknown, pad: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fout(pad, 'geen object');
  return v as Obj;
}

function lijst(v: unknown, pad: string): unknown[] {
  if (!Array.isArray(v)) fout(pad, 'geen lijst');
  return v;
}

function tekst(v: unknown, pad: string): string {
  if (typeof v !== 'string') fout(pad, 'geen tekst');
  return v;
}

function getal(v: unknown, pad: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fout(pad, 'geen getal');
  return v;
}

function eenVan(v: unknown, opties: readonly unknown[], pad: string): void {
  if (!opties.includes(v)) fout(pad, `onbekende waarde (${String(v).slice(0, 40)})`);
}

function vak(v: unknown, pad: string): void {
  if (!isGoVak(v)) fout(pad, `onbekend vak (${String(v).slice(0, 40)})`);
}

const teksten = (v: unknown, pad: string) => lijst(v, pad).forEach((x, n) => tekst(x, `${pad}[${n}]`));
const leeftijden = (v: unknown, pad: string) => lijst(v, pad).forEach((x, n) => eenVan(x, GO_LEEFTIJDEN, `${pad}[${n}]`));
const optioneel = (v: unknown, pad: string, controle: (v: unknown, pad: string) => unknown) => {
  if (v !== undefined) controle(v, pad);
};

/** Komt in een href (GoBronvermelding). */
const RE_STUDIO_URL = /^https:\/\/studio\.g-o\.be\/[^\s"'<>\\]*$/;
/** Komt in een src (GoBeeldWeergave), achter de map van het GO!. */
const RE_BEELDBESTAND = /^beelden\/[A-Za-z0-9][A-Za-z0-9_-]{0,199}\.(?:webp|png|jpg)$/;

const BLOK_SOORTEN = ['kop', 'alinea', 'lijst', 'tabel', 'beeld'];
const KOP_NIVEAUS = [1, 2, 3, 4];
const INHOUD_SOORTEN = ['mia-titel', 'mia', 'begrip', 'voorbeelden-titel', 'voorbeeld', 'voetnoot'];

/** Het soort bestand en de versie; daarna de inhoud. Elke fout wordt één melding. */
function controleer(json: unknown, kind: string, inhoud: (o: Obj) => void): string[] {
  try {
    if (typeof json !== 'object' || json === null || Array.isArray(json)) return ['geen object'];
    const o = json as Obj;
    if (o.app !== 'boosterz' || o.kind !== kind) return [`geen bestand van het soort ${kind}`];
    if (o.v !== 1) return [`onbekende versie (${String(o.v).slice(0, 20)})`];
    inhoud(o);
    return [];
  } catch (e) {
    return [e instanceof VormFout ? e.message : 'het bestand kon niet nagekeken worden'];
  }
}

// ── Tekst ───────────────────────────────────────────────────────────────────

/** Een letterlijke tekst uit een doelenset: tekst, en de opmaak als die er is (GoTekstWeergave). */
function goTekst(v: unknown, pad: string): Obj {
  const o = obj(v, pad);
  tekst(o.tekst, `${pad}.tekst`);
  optioneel(o.opmaak, `${pad}.opmaak`, (opmaak, p) => lijst(opmaak, p).forEach((s, n) => tekst(obj(s, `${p}[${n}]`).t, `${p}[${n}].t`)));
  return o;
}

/** Een regel van een lesplan, in de volgorde waarin GoRegel kijkt: regeleinde, pictogram, anders tekst. */
function regel(v: unknown, pad: string): void {
  lijst(v, pad).forEach((x, n) => {
    const p = `${pad}[${n}]`;
    const s = obj(x, p);
    if ('br' in s) return;
    if ('icoon' in s) eenVan(s.icoon, GO_ICONEN, `${p}.icoon`);
    else tekst(s.t, `${p}.t`);
  });
}

// ── Lesplan ─────────────────────────────────────────────────────────────────

function wijzer(v: unknown, pad: string): void {
  const w = obj(v, pad);
  getal(w.deel, `${pad}.deel`);
  getal(w.blok, `${pad}.blok`);
}

function beeld(b: Obj, pad: string): void {
  eenVan(b.status, ['getoond', 'weggelaten'], `${pad}.status`);
  if (b.status === 'weggelaten') {
    tekst(b.uitleg, `${pad}.uitleg`);
    return;
  }
  if (!RE_BEELDBESTAND.test(tekst(b.bestand, `${pad}.bestand`))) fout(`${pad}.bestand`, 'geen geldig pad van een beeld');
  tekst(b.alt, `${pad}.alt`);
  getal(b.breedte, `${pad}.breedte`);
  getal(b.hoogte, `${pad}.hoogte`);
  optioneel(b.uitleg, `${pad}.uitleg`, tekst);
}

function blok(v: unknown, pad: string): void {
  const b = obj(v, pad);
  eenVan(b.soort, BLOK_SOORTEN, `${pad}.soort`);
  switch (b.soort) {
    case 'kop':
      eenVan(b.niveau, KOP_NIVEAUS, `${pad}.niveau`);
      regel(b.tekst, `${pad}.tekst`);
      break;
    case 'alinea':
      regel(b.tekst, `${pad}.tekst`);
      break;
    case 'lijst':
      lijst(b.items, `${pad}.items`).forEach((r, n) => regel(r, `${pad}.items[${n}]`));
      break;
    case 'tabel':
      lijst(b.rijen, `${pad}.rijen`).forEach((rij, r) =>
        lijst(rij, `${pad}.rijen[${r}]`).forEach((c, k) => {
          const p = `${pad}.rijen[${r}][${k}]`;
          lijst(obj(c, p).blokken, `${p}.blokken`).forEach((x, g) => blok(x, `${p}.blokken[${g}]`));
        }),
      );
      break;
    default:
      beeld(b, pad);
  }
}

export function lichtGoLesplan(json: unknown): string[] {
  return controleer(json, 'go-lesplan', (o) => {
    tekst(o.code, 'code');
    tekst(o.titel, 'titel');
    eenVan(o.leeftijd, GO_LEEFTIJDEN, 'leeftijd');
    lijst(o.delen, 'delen').forEach((x, n) => {
      const p = `delen[${n}]`;
      const d = obj(x, p);
      getal(d.nr, `${p}.nr`);
      lijst(d.blokken, `${p}.blokken`).forEach((b, k) => blok(b, `${p}.blokken[${k}]`));
    });

    const a = obj(o.afgeleid, 'afgeleid');
    tekst(a.vakdiscipline, 'afgeleid.vakdiscipline');
    vak(a.vak, 'afgeleid.vak');
    tekst(a.lessenlijn, 'afgeleid.lessenlijn');
    tekst(a.lessenreeks, 'afgeleid.lessenreeks');
    for (const k of ['didactischeFiches', 'deelconcepten', 'goConcepten', 'vlaggen', 'schakels', 'trainen']) lijst(a[k], `afgeleid.${k}`);
    lijst(a.leerplandoelen, 'afgeleid.leerplandoelen').forEach((x, n) => {
      const p = `afgeleid.leerplandoelen[${n}]`;
      const d = obj(x, p);
      tekst(d.code, `${p}.code`);
      tekst(d.kennisverwerking, `${p}.kennisverwerking`);
      leeftijden(d.leeftijden, `${p}.leeftijden`);
      tekst(d.tekst, `${p}.tekst`);
      wijzer(d.waar, `${p}.waar`);
    });
    lijst(a.diplomas, 'afgeleid.diplomas').forEach((x, n) => {
      const p = `afgeleid.diplomas[${n}]`;
      const d = obj(x, p);
      tekst(d.naam, `${p}.naam`);
      eenVan(d.leeftijd, GO_LEEFTIJDEN, `${p}.leeftijd`);
      lijst(d.ikDoelen, `${p}.ikDoelen`).forEach((y, k) => {
        const q = `${p}.ikDoelen[${k}]`;
        const ik = obj(y, q);
        tekst(ik.code, `${q}.code`);
        teksten(ik.zinnen, `${q}.zinnen`);
      });
      wijzer(d.waar, `${p}.waar`);
    });
    lijst(a.stappen, 'afgeleid.stappen').forEach((x, n) => {
      const p = `afgeleid.stappen[${n}]`;
      const s = obj(x, p);
      getal(s.nr, `${p}.nr`);
      tekst(s.naam, `${p}.naam`);
      wijzer(s.wat, `${p}.wat`);
      wijzer(s.hoe, `${p}.hoe`);
    });
    wijzer(a.materiaal, 'afgeleid.materiaal');

    const bron = obj(o.bron, 'bron');
    if (!RE_STUDIO_URL.test(tekst(bron.url, 'bron.url'))) fout('bron.url', 'geen link naar GO! studio');
    tekst(bron.ingelezen, 'bron.ingelezen');
  });
}

// ── Leerplan ────────────────────────────────────────────────────────────────

function koppeling(v: unknown, pad: string): void {
  const k = obj(v, pad);
  for (const [m, t] of Object.entries(obj(k.bron, `${pad}.bron`))) tekst(t, `${pad}.bron.${m.slice(0, 10)}`);
  lijst(k.refs, `${pad}.refs`).forEach((x, n) => {
    const p = `${pad}.refs[${n}]`;
    const r = obj(x, p);
    tekst(r.set, `${p}.set`);
    tekst(r.id, `${p}.id`);
    tekst(r.code, `${p}.code`);
    eenVan(r.moment, GO_MOMENTEN, `${p}.moment`);
    tekst(r.status, `${p}.status`);
    optioneel(r.twijfel, `${p}.twijfel`, teksten);
    optioneel(r.bronCode, `${p}.bronCode`, tekst);
  });
  lijst(k.problemen, `${pad}.problemen`).forEach((x, n) => {
    const p = `${pad}.problemen[${n}]`;
    const pr = obj(x, p);
    eenVan(pr.moment, GO_MOMENTEN, `${p}.moment`);
    tekst(pr.bronCode, `${p}.bronCode`);
    tekst(pr.reden, `${p}.reden`);
  });
}

function verwijzingen(v: unknown, pad: string): void {
  const o = obj(v, pad);
  optioneel(o.bron, `${pad}.bron`, tekst);
  teksten(o.codes, `${pad}.codes`);
  teksten(o.kapot, `${pad}.kapot`);
}

function leerplandoel(v: unknown, pad: string): void {
  const d = goTekst(v, pad);
  const p = typeof d.code === 'string' ? `${pad} (${d.code.slice(0, 12)})` : pad;
  tekst(d.code, `${p}.code`);
  getal(d.rij, `${p}.rij`);
  tekst(d.kennisverwerking, `${p}.kennisverwerking`);
  leeftijden(d.leeftijden, `${p}.leeftijden`);
  tekst(d.rubriek, `${p}.rubriek`);
  lijst(d.inhoud, `${p}.inhoud`).forEach((x, n) => {
    const q = `${p}.inhoud[${n}]`;
    const i = goTekst(x, q);
    eenVan(i.soort, INHOUD_SOORTEN, `${q}.soort`);
    getal(i.rij, `${q}.rij`);
    if (i.soort === 'begrip') leeftijden(i.leeftijden, `${q}.leeftijden`);
    optioneel(i.koppeling, `${q}.koppeling`, koppeling);
  });
  koppeling(d.minimumdoelen, `${p}.minimumdoelen`);
  verwijzingen(d.vlaggen, `${p}.vlaggen`);
  verwijzingen(d.schakels, `${p}.schakels`);
}

export function lichtGoLeerplan(json: unknown): string[] {
  return controleer(json, 'go-leerplan', (o) => {
    vak(o.vak, 'vak');
    tekst(o.naam, 'naam');
    lijst(o.rubrieken, 'rubrieken').forEach((x, n) => {
      const p = `rubrieken[${n}]`;
      const r = goTekst(x, p);
      tekst(r.id, `${p}.id`);
      tekst(r.soort, `${p}.soort`);
      getal(r.rij, `${p}.rij`);
      optioneel(r.ouder, `${p}.ouder`, tekst);
    });
    lijst(o.doelen, 'doelen').forEach((x, n) => leerplandoel(x, `doelen[${n}]`));
    tekst(obj(o.bron, 'bron').ingelezen, 'bron.ingelezen');
  });
}

// ── Omgekeerd: per minimumdoel ──────────────────────────────────────────────

export function lichtGoBijMinimumdoel(json: unknown): string[] {
  return controleer(json, 'go-bij-minimumdoel', (o) => {
    getal(o.vak, 'vak');
    for (const [nummer, doelen] of Object.entries(obj(o.doelen, 'doelen'))) {
      const pad = `doelen.${nummer.slice(0, 12)}`;
      lijst(doelen, pad).forEach((x, n) => {
        const p = `${pad}[${n}]`;
        const d = goTekst(x, p);
        tekst(d.code, `${p}.code`);
        eenVan(d.moment, GO_MOMENTEN, `${p}.moment`);
        tekst(d.status, `${p}.status`);
        optioneel(d.twijfel, `${p}.twijfel`, teksten);
        optioneel(d.bronCode, `${p}.bronCode`, tekst);
        tekst(d.kennisverwerking, `${p}.kennisverwerking`);
        leeftijden(d.leeftijden, `${p}.leeftijden`);
        teksten(d.lesplannen, `${p}.lesplannen`);
        optioneel(d.via, `${p}.via`, (via, q) =>
          lijst(via, q).forEach((y, k) => {
            const w = goTekst(y, `${q}[${k}]`);
            tekst(w.soort, `${q}[${k}].soort`);
            getal(w.rij, `${q}[${k}].rij`);
          }),
        );
      });
    }
  });
}

// ── Index ───────────────────────────────────────────────────────────────────

export function lichtGoIndex(json: unknown): string[] {
  return controleer(json, 'go-index', (o) => {
    tekst(o.ingelezen, 'ingelezen');
    lijst(o.leerplan, 'leerplan').forEach((x, n) => {
      const p = `leerplan[${n}]`;
      const l = obj(x, p);
      vak(l.vak, `${p}.vak`);
      tekst(l.naam, `${p}.naam`);
      getal(l.aantal, `${p}.aantal`);
      getal(l.zonderMinimumdoel, `${p}.zonderMinimumdoel`);
      const per = obj(l.perLeeftijd, `${p}.perLeeftijd`);
      for (const leeftijd of GO_LEEFTIJDEN) getal(per[leeftijd], `${p}.perLeeftijd.${leeftijd}`);
    });
    lijst(o.bijMinimumdoel, 'bijMinimumdoel').forEach((x, n) => obj(x, `bijMinimumdoel[${n}]`));
    lijst(o.lesplannen, 'lesplannen').forEach((x, n) => {
      const p = `lesplannen[${n}]`;
      const l = obj(x, p);
      tekst(l.code, `${p}.code`);
      tekst(l.titel, `${p}.titel`);
      eenVan(l.leeftijd, GO_LEEFTIJDEN, `${p}.leeftijd`);
      vak(l.vak, `${p}.vak`);
      tekst(l.lessenlijn, `${p}.lessenlijn`);
      tekst(l.lessenreeks, `${p}.lessenreeks`);
      teksten(l.doelen, `${p}.doelen`);
    });
  });
}
