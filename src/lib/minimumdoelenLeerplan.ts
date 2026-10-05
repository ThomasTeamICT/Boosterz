// Van een officiële set minimumdoelen (laag 1) naar een nagekeken leerplan (docs/LEERPLANNEN.md § 14).
//
// Een leerkracht die de minimumdoelen als leerplan wil gebruiken, hoeft niets in te lezen of na te
// kijken: de doelen komen letterlijk uit het bestand van de Vlaamse overheid. De controlepoort kijkt
// dat na met de set als bron (`bevestigUitOfficieleSet`): elke tekst gelijk aan die van zijn
// minimumdoel en geen doel van de set vergeten. Lukt dat, dan krijgt het leerplan meteen de status
// "nagekeken", met een vingerafdruk van de doelen zoals ze er nu staan. Wie later iets wijzigt, merkt
// dat aan die status ("gewijzigd na nakijken").

import type { Curriculum, CurriculumGoal, CurriculumHerkomst } from './curriculumTypes';
import {
  bevestigLeerplan, bewaakControle, controleStatus, createCurriculum, doelenVingerafdruk, normalizeGoalCode, sanitizeCurriculum,
} from './curriculum';
import { controleerLeerplan, type ControleRapport } from './curriculumCheck';
import { htmlNaarTekst, NAAMSVERMELDING, type Minimumdoel, type MinimumdoelenSetBestand } from './minimumdoelen';
import { datumLeesbaar } from './minimumdoelenBron';
import { geldigheidVanBestand } from './setKeuze';
import { uid } from './utils';

/** Wie het leerplan "nagekeken" heeft: de officiële bron zelf, niet een leerkracht. */
export const NAGEKEKEN_DOOR_BRON = 'Boosterz (officiële bron)';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Tekst uit een (HTML-)waarde: tags en entiteiten weg, op één regel. Leeg als er niets overblijft. */
function enkeleRegel(v: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return typeof v === 'string' ? htmlNaarTekst(v).replace(/\s+/g, ' ').trim() : '';
}

function titelsVan(doel: Minimumdoel): Record<string, unknown> {
  const titels = doel.extra?.titels;
  return isObject(titels) ? titels : {};
}

/** Eén rubriekniveau: `{ titel, nr? }` of gewoon een tekst. */
function titelEnNr(niveau: unknown): { titel: string; nr: string } {
  if (isObject(niveau)) return { titel: enkeleRegel(niveau.titel), nr: enkeleRegel(niveau.nr).replace(/\.+$/, '') };
  return { titel: enkeleRegel(niveau), nr: '' };
}

/**
 * De rubrieken van een doel, van groot naar klein: de titels uit `extra.titels` op volgorde van hun
 * sleutel ("1", "2", …). Lege titels vallen weg.
 */
export function rubriekenVan(doel: Minimumdoel): string[] {
  const titels = titelsVan(doel);
  return Object.keys(titels)
    .sort((a, b) => a.localeCompare(b, 'nl', { numeric: true }))
    .map((sleutel) => titelEnNr(titels[sleutel]).titel)
    .filter((t) => t !== '');
}

/** De rubrieken samengevoegd met " › ", bv. "Muzikale opvoeding › Waarnemen"; `undefined` zonder rubrieken. */
export function themaVanDoel(doel: Minimumdoel): string | undefined {
  const r = rubriekenVan(doel);
  return r.length > 0 ? r.join(' › ') : undefined;
}

/** Is dit doel een attitude? (de API geeft 0 of 1; een boolean mag ook) */
export function isAttitude(doel: Minimumdoel): boolean {
  const a = doel.extra?.attitude;
  return a === true || a === 1;
}

export function isOptioneel(doel: Minimumdoel): boolean {
  return doel.extra?.optioneel === true;
}

/**
 * Codes die na `normalizeGoalCode` uniek zijn. De nummering begint in de echte gegevens per rubriek
 * opnieuw, dus dezelfde code komt vaak meer dan eens voor. Zo'n code krijgt het nummer van de eerste
 * rubriek ervoor ("1.1" en "2.1" in plaats van twee keer "1"): `extra.titels["1"].nr`, en zonder
 * nummer het volgnummer van die rubriek in de set. Blijft een code toch dubbel, dan komt er "-2",
 * "-3", … achter. Een code die al uniek is, blijft zoals ze is.
 */
export function uniekeCodes(doelen: readonly Minimumdoel[]): string[] {
  const basis = doelen.map((d) => normalizeGoalCode(d.code));
  const telling = new Map<string, number>();
  for (const c of basis) telling.set(c, (telling.get(c) ?? 0) + 1);

  // Volgnummer van elke eerste rubriek in de set, voor rubrieken zonder eigen nummer.
  const volgnummers = new Map<string, number>();
  for (const d of doelen) {
    const titel = titelEnNr(titelsVan(d)['1']).titel;
    if (titel !== '' && !volgnummers.has(titel)) volgnummers.set(titel, volgnummers.size + 1);
  }

  const metRubriek = doelen.map((d, i) => {
    if ((telling.get(basis[i]) ?? 0) < 2) return basis[i];
    const { titel, nr } = titelEnNr(titelsVan(d)['1']);
    const rubriekNr = nr !== '' ? nr : titel !== '' ? String(volgnummers.get(titel)) : '';
    return rubriekNr !== '' ? normalizeGoalCode(`${rubriekNr}.${d.code}`) : basis[i];
  });

  // Wat nog dubbel is, krijgt een suffix. Een suffix mag nooit een code overnemen die een ander doel heeft.
  const bezet = new Set(metRubriek);
  const gebruikt = new Set<string>();
  return metRubriek.map((code) => {
    if (!gebruikt.has(code)) {
      gebruikt.add(code);
      return code;
    }
    let n = 2;
    while (gebruikt.has(`${code}-${n}`) || bezet.has(`${code}-${n}`)) n++;
    const uniek = `${code}-${n}`;
    gebruikt.add(uniek);
    return uniek;
  });
}

export interface LeerplanUitSet {
  leerplan: Curriculum;
  /** Wat niet kon worden overgenomen, in gewone taal. Leeg = alles is overgenomen. */
  waarschuwingen: string[];
}

function doelen(n: number): string {
  return `${n} ${n === 1 ? 'doel' : 'doelen'}`;
}

export interface OfficieelBevestigd {
  /** Gesaneerd; met status "gecontroleerd" als `bevestigd`, anders zonder nakijkstatus. */
  leerplan: Curriculum;
  /** Het rapport van de controlepoort, met de set als bron. */
  rapport: ControleRapport;
  bevestigd: boolean;
}

/**
 * Bevestigt een leerplan uit een officiële set (herkomst "officieel"): saneert het, draait de
 * controlepoort met de set als bron (`controleerLeerplan(…, { sets: [bestand] })`: elke tekst gelijk
 * aan die van het minimumdoel waar hij naar verwijst, elk doel van de set aanwezig, verwijzingen in
 * orde) en bevestigt het alleen als de poort geen fouten vindt. Anders blijft het leerplan niet
 * nagekeken en zegt het rapport waarom. Gooit een `Error` als de herkomst niet "officieel" is.
 */
export function bevestigUitOfficieleSet(
  cur: Curriculum,
  bestand: MinimumdoelenSetBestand,
  opts: { door?: string; samenvatting?: string; op?: number } = {},
): OfficieelBevestigd {
  if (cur.herkomst?.methode !== 'officieel') {
    throw new Error('Alleen een leerplan dat rechtstreeks uit een officiële set komt, kan zo bevestigd worden.');
  }
  const gesaneerd = sanitizeCurriculum(cur);
  if (!gesaneerd) {
    return { leerplan: cur, rapport: controleerLeerplan(cur, { sets: [bestand] }), bevestigd: false };
  }
  const zonderStatus: Curriculum = { ...gesaneerd };
  delete zonderStatus.controle;
  const rapport = controleerLeerplan(zonderStatus, { sets: [bestand] });
  if (!rapport.kanBevestigen) return { leerplan: zonderStatus, rapport, bevestigd: false };
  const leerplan = bevestigLeerplan(zonderStatus, { door: opts.door ?? NAGEKEKEN_DOOR_BRON, rapport, samenvatting: opts.samenvatting, op: opts.op });
  return { leerplan, rapport, bevestigd: true };
}

/** Het leerplan uit een set, gesaneerd zoals bij bewaren, nog zonder nakijken. */
function bouwLeerplanUitSet(bestand: MinimumdoelenSetBestand): LeerplanUitSet {
  const s = bestand.set;
  const waarschuwingen: string[] = [];

  const bruikbaar: Minimumdoel[] = [];
  let zonderId = 0;
  let zonderTekst = 0;
  for (const doel of bestand.doelen) {
    if (typeof doel.id !== 'string' || doel.id.trim() === '') zonderId++;
    else if (htmlNaarTekst(doel.tekst) === '') zonderTekst++;
    else bruikbaar.push(doel);
  }
  if (zonderId > 0) waarschuwingen.push(`${doelen(zonderId)} zonder vast nummer ${zonderId === 1 ? 'is' : 'zijn'} overgeslagen.`);
  if (zonderTekst > 0) waarschuwingen.push(`${doelen(zonderTekst)} zonder tekst ${zonderTekst === 1 ? 'is' : 'zijn'} overgeslagen.`);

  const codes = uniekeCodes(bruikbaar);
  const goals: CurriculumGoal[] = bruikbaar.map((doel, i) => {
    const goal: CurriculumGoal = {
      id: uid(),
      code: codes[i],
      text: htmlNaarTekst(doel.tekst),
      refs: [{ set: s.id, id: doel.id as string, code: doel.code }],
    };
    const thema = themaVanDoel(doel);
    if (thema) goal.theme = thema;
    if (isOptioneel(doel)) goal.note = 'Optioneel';
    return goal;
  });

  const naam = s.korteNaam?.trim() || s.naam.trim();
  const niveau = [s.graad, s.stroom].map((t) => t?.trim()).filter(Boolean).join(' ');
  // Een set die niet meer geldt, mag je nog gebruiken, maar de titel zegt het en er staat geen "geldig vanaf" bij: dat
  // zou doen alsof ze nog geldt. (De vingerafdruk dekt alleen de doelen; de titel en de herkomst veranderen die niet.)
  const verouderd = geldigheidVanBestand(bestand) === 'N';
  const herkomst: CurriculumHerkomst = { methode: 'officieel', ingelezenOp: Date.now() };
  if (s.versie) herkomst.versie = s.versie;
  if (s.geldigVan && !verouderd) herkomst.geldigVanaf = s.geldigVan;
  if (s.bron) herkomst.bronUrl = s.bron;
  herkomst.bronNaam = s.id;
  if (s.sha256) herkomst.bronSha256 = s.sha256;

  const opgehaald = datumLeesbaar(s.opgehaald);
  // Eerst saneren zoals een import dat doet, dan pas nakijken en bevestigen: zo is de vingerafdruk die
  // van de doelen zoals ze na exporteren en importeren terugkomen, en blijft het leerplan "nagekeken".
  const ruw = createCurriculum({
      title: `${niveau ? `${naam} · ${niveau}` : naam}${verouderd ? ' (niet meer geldig)' : ''}`,
      net: 'minimumdoelen',
      subject: naam,
      level: niveau,
      kind: 'leerplan',
      // De volledige setnaam onderscheidt sets met dezelfde korte naam (bv. aso en tso in de 3de graad).
      source: `${s.naam.trim()}. ${s.naamsvermelding || NAAMSVERMELDING}${opgehaald ? ` (opgehaald ${opgehaald})` : ''}`,
      herkomst,
      minimumdoelenSets: [s.id],
      goals,
    });
  const gesaneerd = sanitizeCurriculum(ruw) ?? ruw;
  if (gesaneerd.goals.length !== goals.length) {
    const weg = goals.length - gesaneerd.goals.length;
    waarschuwingen.push(`${doelen(weg)} ${weg === 1 ? 'viel' : 'vielen'} weg bij het saneren.`);
  }
  return { leerplan: gesaneerd, waarschuwingen };
}

/**
 * Maakt een leerplan rechtstreeks uit een officiële set en bevestigt het als nagekeken via
 * `bevestigUitOfficieleSet` (de controlepoort met de set als bron). De doelen blijven in de volgorde
 * van het bestand; de tekst gaat door `htmlNaarTekst` (nooit HTML bewaren). Elk doel verwijst naar
 * zichzelf in de set (`refs`: set + vast nummer + code). Een doel zonder vast nummer of zonder tekst
 * wordt overgeslagen en komt in `waarschuwingen`, zodat niets stil verdwijnt. Vindt de poort toch een
 * fout, dan blijft het leerplan niet nagekeken en staat dat in `waarschuwingen`.
 *
 * Geeft het leerplan nog niet terug uit de opslag: de aanroeper bewaart het met `saveCurriculum`.
 */
export function leerplanUitSet(bestand: MinimumdoelenSetBestand): LeerplanUitSet {
  const { leerplan: gebouwd, waarschuwingen } = bouwLeerplanUitSet(bestand);
  if (gebouwd.goals.length === 0) return { leerplan: gebouwd, waarschuwingen };
  const { leerplan, rapport, bevestigd } = bevestigUitOfficieleSet(gebouwd, bestand, {
    samenvatting: `Letterlijk overgenomen uit de officiële set ${bestand.set.id} (${doelen(gebouwd.goals.length)}).`,
  });
  if (!bevestigd) {
    const eerste = rapport.bevindingen.find((b) => b.ernst === 'fout')?.bericht ?? '';
    waarschuwingen.push(`Het leerplan kon niet als nagekeken bevestigd worden, want het nakijken vond een probleem: ${eerste}`);
  }
  return { leerplan, waarschuwingen };
}

/**
 * Het leerplan dat je al van deze set bewaarde: herkomst "officieel", dezelfde set, dezelfde
 * vingerafdruk van de set (een nieuwere versie van de set is dus een ander leerplan), en doelen die
 * precies zijn wat een verse afleiding uit de set nu geeft (`doelenVingerafdruk`). Zo wordt een
 * leerplan van vóór een verbetering van `htmlNaarTekst`, of een bestand met andere doelen dat zich
 * als officieel voordoet, nooit hergebruikt. Een eigen kopie of een leerplan dat na het nakijken
 * gewijzigd werd, telt ook niet mee: wie opnieuw "gebruik als leerplan" kiest, wil de officiële doelen
 * zoals ze zijn.
 */
export function vindLeerplanVoorSet(curricula: readonly Curriculum[], bestand: MinimumdoelenSetBestand): Curriculum | undefined {
  const { id, sha256 } = bestand.set;
  let vers: string | undefined;
  const versAfgeleid = () => (vers ??= doelenVingerafdruk(bouwLeerplanUitSet(bestand).leerplan.goals));
  return curricula.find((c) => {
    if (c.herkomst?.methode !== 'officieel' || c.herkomst.bronNaam !== id || c.herkomst.bronSha256 !== sha256) return false;
    if (c.kind === 'eigen') return false;
    if (controleStatus(bewaakControle(c)) === 'gewijzigd') return false;
    return doelenVingerafdruk(c.goals) === versAfgeleid();
  });
}
