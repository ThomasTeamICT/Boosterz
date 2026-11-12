// Het pakketmanifest van het bewijsmodel (bouwpakket 3a van docs/basisonderwijs/AANMELDEN-BOUWPAKKETTEN.md).
//
// Een pakket (bv. de Lichtkamer, einde 4de leerjaar) heeft een code van 3 tekens en een of meer versies. Elke versie is
// een vaste lijst van hoogstens 32 bewijzen. Een bewijs is één ding dat een kind toont: een checkvraag, een oefening of
// een observatie van de leerkracht. Het telt voor een of meer doelen en kent zijn foutpatronen vooraf.
//
// Het bewijsnummer is de plaats in de lijst (0 tot 31). Dat nummer reist in de bewijscode (WB1, bouwpakket 5) en staat
// in de bewijsopslag van de leerkracht. Daarom geldt de harde regel 'een pakket nummert zijn bewijzen nooit opnieuw':
// een nieuwe versie begint met precies de bewijzen van de vorige versie, in dezelfde volgorde, met hetzelfde id en
// dezelfde soort, en mag alleen achteraan aanvullen. Hetzelfde geldt binnen een bewijs voor de doelen en de
// foutpatronen (ook die laatste hebben een nummer in de code). Zo wijst nummer n in elke versie naar hetzelfde bewijs,
// en kan het toestel van de leerkracht oude versies blijven lezen. controleerPakket bewaakt dat.
//
// De grenzen komen uit de bewijscode: één teken voor de versie en voor het bewijsnummer (32 tekens in het alfabet van
// makeCode), en één teken voor de uitkomst ('J', 'N' of '2' tot '9' voor een foutpatroon, dus hoogstens 8).
//
// Zuiver: geen opslag, geen klok, geen netwerk. Niets in een manifest is een naam van een kind.

import { doelSleutelTekst, redenOngeldigeDoelSleutel, zelfdeDoelSleutel, type DoelSleutel } from './doelSleutel';

export type BewijsSoort = 'check' | 'oefening' | 'observatie';

export const BEWIJS_SOORTEN: readonly BewijsSoort[] = ['check', 'oefening', 'observatie'];

/**
 * Welk record telt als een kind een bewijs meer dan eens toont: bij een checkvraag het vroegste (het eerste antwoord
 * telt), bij een oefening en een observatie het laatste (de laatste poging, de laatste vaststelling).
 */
export const TELT: Readonly<Record<BewijsSoort, 'eerste' | 'laatste'>> = { check: 'eerste', oefening: 'laatste', observatie: 'laatste' };

export const MAX_BEWIJZEN = 32;
export const MAX_FOUTPATRONEN = 8;
export const MAX_VERSIE = 32;
export const MAX_DOELEN_PER_BEWIJS = 8;

export interface Foutpatroon {
  /** Vast id, bv. 'schaduw-kant-lamp'. */
  id: string;
  /** Voor de leerkracht, bv. 'schaduw aan de kant van de lamp'. De tekst mag in een nieuwe versie beter verwoord worden. */
  tekst: string;
}

export interface BewijsDef {
  /** Vast id binnen het pakket, bv. '4c1' of '4-meten'. */
  id: string;
  soort: BewijsSoort;
  /** De doelen waarvoor dit bewijs telt; minstens één. */
  doelen: readonly DoelSleutel[];
  /** Het nummer van een foutpatroon is zijn plaats in deze lijst (0 tot 7). */
  foutpatronen: readonly Foutpatroon[];
}

export interface PakketVersie {
  /** 1, 2, 3 … zonder gaten. */
  versie: number;
  /** Het bewijsnummer is de plaats in deze lijst. */
  bewijzen: readonly BewijsDef[];
}

export interface PakketManifest {
  /** 3 tekens uit A-Z en 0-9, bv. 'LK4'. */
  pakket: string;
  /** Alle versies, van versie 1 tot de nieuwste, zonder gaten. */
  versies: readonly PakketVersie[];
}

const PAKKETCODE_RE = /^[A-Z0-9]{3}$/;
/** 1 tot 32 tekens: kleine letters, cijfers en koppeltekens, niet beginnend of eindigend op een koppelteken. */
const ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

export function isPakketcode(p: unknown): p is string {
  return typeof p === 'string' && PAKKETCODE_RE.test(p);
}

function isLijst(x: unknown): x is readonly unknown[] {
  return Array.isArray(x);
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** De fouten van één versie op zich, als zinnen. Een lege lijst betekent: in orde. */
function controleerVersie(pakket: string, v: unknown, plaats: number): string[] {
  const fouten: string[] = [];
  const waar = `Pakket ${pakket} versie ${plaats + 1}`;
  if (!isObject(v)) return [`${waar}: geen object.`];
  if (v.versie !== plaats + 1) fouten.push(`${waar}: het versienummer is ${String(v.versie)}, verwacht ${plaats + 1} (versies lopen van 1 zonder gaten).`);
  if (!isLijst(v.bewijzen)) return [...fouten, `${waar}: de lijst bewijzen ontbreekt.`];
  if (v.bewijzen.length === 0) fouten.push(`${waar}: er staat geen enkel bewijs in.`);
  if (v.bewijzen.length > MAX_BEWIJZEN) fouten.push(`${waar}: ${v.bewijzen.length} bewijzen, hoogstens ${MAX_BEWIJZEN}.`);

  const ids = new Set<string>();
  v.bewijzen.forEach((b, n) => {
    const bw = `${waar}, bewijs ${n}`;
    if (!isObject(b)) {
      fouten.push(`${bw}: geen object.`);
      return;
    }
    if (typeof b.id !== 'string' || !ID_RE.test(b.id)) fouten.push(`${bw}: id '${String(b.id)}' mag alleen kleine letters, cijfers en koppeltekens bevatten (1 tot 32 tekens).`);
    else if (ids.has(b.id)) fouten.push(`${bw}: id '${b.id}' komt twee keer voor.`);
    else ids.add(b.id);
    if (!(BEWIJS_SOORTEN as readonly unknown[]).includes(b.soort)) fouten.push(`${bw}: onbekende soort '${String(b.soort)}' (check, oefening of observatie).`);

    if (!isLijst(b.doelen) || b.doelen.length === 0) fouten.push(`${bw}: telt voor geen enkel doel.`);
    else {
      if (b.doelen.length > MAX_DOELEN_PER_BEWIJS) fouten.push(`${bw}: ${b.doelen.length} doelen, hoogstens ${MAX_DOELEN_PER_BEWIJS}.`);
      const doelen = new Set<string>();
      for (const d of b.doelen) {
        const reden = redenOngeldigeDoelSleutel(d);
        if (reden) {
          fouten.push(`${bw}: ongeldig doel: ${reden}.`);
          continue;
        }
        const t = doelSleutelTekst(d as DoelSleutel);
        if (doelen.has(t)) fouten.push(`${bw}: doel ${t} staat er twee keer.`);
        doelen.add(t);
      }
    }

    if (!isLijst(b.foutpatronen)) fouten.push(`${bw}: de lijst foutpatronen ontbreekt (een lege lijst mag).`);
    else {
      if (b.foutpatronen.length > MAX_FOUTPATRONEN) fouten.push(`${bw}: ${b.foutpatronen.length} foutpatronen, hoogstens ${MAX_FOUTPATRONEN}.`);
      const fids = new Set<string>();
      b.foutpatronen.forEach((f, i) => {
        if (!isObject(f) || typeof f.id !== 'string' || !ID_RE.test(f.id)) {
          fouten.push(`${bw}, foutpatroon ${i}: ongeldig id.`);
          return;
        }
        if (fids.has(f.id)) fouten.push(`${bw}: foutpatroon '${f.id}' komt twee keer voor.`);
        fids.add(f.id);
        if (typeof f.tekst !== 'string' || f.tekst.trim() === '' || f.tekst !== f.tekst.trim()) fouten.push(`${bw}, foutpatroon '${f.id}': de tekst is leeg of heeft spaties vooraan of achteraan.`);
      });
    }
  });
  return fouten;
}

/**
 * Mag `nieuw` volgen op `oud`? Alleen als `nieuw` begint met alle bewijzen van `oud`, in dezelfde volgorde, met hetzelfde
 * id en dezelfde soort, met dezelfde doelen vooraan en dezelfde foutpatronen vooraan (de tekst van een foutpatroon mag
 * anders verwoord zijn). Herschikken, wissen of een bewijs een andere betekenis geven wordt geweigerd.
 */
export function controleerVersieOvergang(pakket: string, oud: PakketVersie, nieuw: PakketVersie): string[] {
  const fouten: string[] = [];
  const waar = `Pakket ${pakket} versie ${nieuw.versie}`;
  const regel = 'Een nieuwe versie mag de lijst alleen achteraan aanvullen.';
  if (nieuw.bewijzen.length < oud.bewijzen.length) {
    fouten.push(`${waar}: telt ${nieuw.bewijzen.length} bewijzen, versie ${oud.versie} had er ${oud.bewijzen.length}. Een bewijs wissen mag niet. ${regel}`);
  }
  const n = Math.min(oud.bewijzen.length, nieuw.bewijzen.length);
  for (let i = 0; i < n; i++) {
    const a = oud.bewijzen[i];
    const b = nieuw.bewijzen[i];
    if (a.id !== b.id) {
      fouten.push(`${waar}: bewijs ${i} was '${a.id}' en is nu '${b.id}'. Herschikken of vervangen mag niet. ${regel}`);
      continue;
    }
    if (a.soort !== b.soort) fouten.push(`${waar}: bewijs '${a.id}' was een ${a.soort} en is nu een ${b.soort}. De soort bepaalt welk record telt en mag niet veranderen.`);
    const doelenBehouden = a.doelen.length <= b.doelen.length && a.doelen.every((d, j) => zelfdeDoelSleutel(d, b.doelen[j]));
    if (!doelenBehouden) fouten.push(`${waar}: bewijs '${a.id}' verliest of herschikt een doel. Doelen mogen alleen achteraan bijkomen.`);
    const foutenBehouden = a.foutpatronen.length <= b.foutpatronen.length && a.foutpatronen.every((f, j) => f.id === b.foutpatronen[j].id);
    if (!foutenBehouden) fouten.push(`${waar}: bewijs '${a.id}' verliest of herschikt een foutpatroon. Foutpatronen mogen alleen achteraan bijkomen.`);
  }
  return fouten;
}

/**
 * Bewaakt een manifest: de pakketcode, elke versie op zich (grenzen, unieke id's, geldige doelen) en elke overgang van
 * een versie naar de volgende (alleen achteraan aanvullen). Geeft de fouten als zinnen; een lege lijst betekent dat alles
 * in orde is. Werkt ook op invoer van een onbekende vorm, zonder te crashen.
 */
export function controleerPakket(m: PakketManifest): string[] {
  const ruw: unknown = m;
  if (!isObject(ruw)) return ['Het manifest is geen object.'];
  const pakket = isPakketcode(ruw.pakket) ? ruw.pakket : String(ruw.pakket);
  const fouten: string[] = [];
  if (!isPakketcode(ruw.pakket)) fouten.push(`Pakket '${pakket}': de pakketcode moet precies 3 tekens uit A-Z en 0-9 hebben.`);
  if (!isLijst(ruw.versies) || ruw.versies.length === 0) return [...fouten, `Pakket ${pakket}: er is geen enkele versie.`];
  if (ruw.versies.length > MAX_VERSIE) fouten.push(`Pakket ${pakket}: ${ruw.versies.length} versies, hoogstens ${MAX_VERSIE}.`);
  const perVersie = ruw.versies.map((v, i) => controleerVersie(pakket, v, i));
  perVersie.forEach((f) => fouten.push(...f));
  // Een overgang vergelijken heeft alleen zin tussen twee versies die op zich in orde zijn.
  for (let i = 1; i < ruw.versies.length; i++) {
    if (perVersie[i - 1].length === 0 && perVersie[i].length === 0) {
      fouten.push(...controleerVersieOvergang(pakket, ruw.versies[i - 1] as PakketVersie, ruw.versies[i] as PakketVersie));
    }
  }
  return fouten;
}

/** De nieuwste versie van een (gecontroleerd) manifest. */
export function laatsteVersie(m: PakketManifest): PakketVersie {
  return m.versies[m.versies.length - 1];
}

/** De sleutel van een bewijs over pakketten heen: '<pakket>/<id>', bv. 'LK4/4c1'. */
export function bewijsSleutel(pakket: string, bewijsId: string): string {
  return `${pakket}/${bewijsId}`;
}

// ─── De index over de gekende manifesten ─────────────────────────────────────

export interface BewijsIndex {
  /** Per pakketcode het manifest (een bevroren kopie). */
  readonly pakketten: ReadonlyMap<string, PakketManifest>;
  /**
   * Per doel (doelSleutelTekst) de bewijzen die ervoor tellen, als bewijssleutels, uit de nieuwste versie van elk
   * pakket, in de volgorde van de manifesten en van hun lijst. Dit is BEWIJS_PER_DOEL van het prototype.
   * Omdat het uit de nieuwste versie komt, telt een doel dat een nieuwere versie achteraan bij een bewijs zette, ook voor
   * de records van oudere versies (het is hetzelfde bewijs), en kan een nieuw bewijs de drempel van 'toont het' voor een
   * doel verhogen (minstens twee juiste bewijzen zodra het doel er twee heeft).
   */
  readonly perDoel: ReadonlyMap<string, readonly string[]>;
  /** Per doel (doelSleutelTekst) de doelsleutel zoals ze het eerst in een manifest staat. */
  readonly doelen: ReadonlyMap<string, DoelSleutel>;
}

function bevrorenKopie(m: PakketManifest): PakketManifest {
  return Object.freeze({
    pakket: m.pakket,
    versies: Object.freeze(
      m.versies.map((v) =>
        Object.freeze({
          versie: v.versie,
          bewijzen: Object.freeze(
            v.bewijzen.map((b) =>
              Object.freeze({
                id: b.id,
                soort: b.soort,
                doelen: Object.freeze(
                  b.doelen.map((d) =>
                    Object.freeze(d.soort === 'minimumdoel' ? { soort: d.soort, set: d.set, id: d.id } : { soort: d.soort, code: d.code }),
                  ),
                ),
                foutpatronen: Object.freeze(b.foutpatronen.map((f) => Object.freeze({ id: f.id, tekst: f.tekst }))),
              }),
            ),
          ),
        }),
      ),
    ),
  });
}

/**
 * Bouwt de index over een lijst manifesten. Elk manifest wordt eerst gecontroleerd; een fout manifest of een pakketcode
 * die twee keer voorkomt, geeft een Error met alle fouten. Laad een manifest van buiten (JSON) dus eerst door
 * controleerPakket en toon de fouten, voor je deze functie aanroept. De index houdt een bevroren kopie bij: een latere
 * wijziging aan een manifest verandert de index niet.
 */
export function maakBewijsIndex(manifesten: readonly PakketManifest[]): BewijsIndex {
  const fouten: string[] = [];
  const pakketten = new Map<string, PakketManifest>();
  for (const m of manifesten) {
    const f = controleerPakket(m);
    if (f.length > 0) {
      fouten.push(...f);
      continue;
    }
    if (pakketten.has(m.pakket)) {
      fouten.push(`Pakket ${m.pakket} komt twee keer voor.`);
      continue;
    }
    pakketten.set(m.pakket, bevrorenKopie(m));
  }
  if (fouten.length > 0) throw new Error(`Ongeldige pakketmanifesten:\n${fouten.join('\n')}`);

  const perDoel = new Map<string, string[]>();
  const doelen = new Map<string, DoelSleutel>();
  for (const m of pakketten.values()) {
    for (const b of laatsteVersie(m).bewijzen) {
      for (const d of b.doelen) {
        const t = doelSleutelTekst(d);
        if (!doelen.has(t)) doelen.set(t, d);
        const lijst = perDoel.get(t) ?? [];
        lijst.push(bewijsSleutel(m.pakket, b.id));
        perDoel.set(t, lijst);
      }
    }
  }
  return { pakketten, perDoel, doelen };
}

/**
 * Het bewijs met dit nummer in deze versie van dit pakket, of `undefined` als het pakket, de versie of het nummer niet
 * gekend is (bv. een record van een nieuwere versie dan dit toestel kent).
 */
export function zoekBewijs(index: BewijsIndex, pakket: string, versie: number, nummer: number): BewijsDef | undefined {
  const m = index.pakketten.get(pakket);
  if (!m || !Number.isInteger(versie) || versie < 1 || versie > m.versies.length) return undefined;
  const v = m.versies[versie - 1];
  if (!Number.isInteger(nummer) || nummer < 0 || nummer >= v.bewijzen.length) return undefined;
  return v.bewijzen[nummer];
}

/**
 * Voor wie een record maakt: de nieuwste versie van het pakket en het nummer van het bewijs met dit id daarin, of
 * `undefined` als het pakket of het id niet bestaat.
 */
export function nummerVanBewijs(index: BewijsIndex, pakket: string, bewijsId: string): { versie: number; nummer: number; bewijs: BewijsDef } | undefined {
  const m = index.pakketten.get(pakket);
  if (!m) return undefined;
  const v = laatsteVersie(m);
  const nummer = v.bewijzen.findIndex((b) => b.id === bewijsId);
  return nummer < 0 ? undefined : { versie: v.versie, nummer, bewijs: v.bewijzen[nummer] };
}

/** Het nummer van het foutpatroon met dit id bij dit bewijs, of `undefined`. */
export function nummerVanFoutpatroon(bewijs: BewijsDef, foutpatroonId: string): number | undefined {
  const i = bewijs.foutpatronen.findIndex((f) => f.id === foutpatroonId);
  return i < 0 ? undefined : i;
}
