// Van een officiële set minimumdoelen (laag 1) naar een nagekeken leerplan (docs/LEERPLANNEN.md § 14).
//
// Een leerkracht die de minimumdoelen als leerplan wil gebruiken, hoeft niets in te lezen of na te
// kijken: de doelen komen letterlijk uit het bestand van de Vlaamse overheid. Het leerplan krijgt
// daarom meteen de status "nagekeken", met een vingerafdruk van de doelen zoals ze er nu staan. Wie
// later iets wijzigt, merkt dat aan die status ("gewijzigd na nakijken").

import type { Curriculum, CurriculumGoal, CurriculumHerkomst } from './curriculumTypes';
import { bevestigLeerplan, controleStatus, createCurriculum, doelenVingerafdruk, normalizeGoalCode } from './curriculum';
import { htmlNaarTekst, NAAMSVERMELDING, type Minimumdoel, type MinimumdoelenSetBestand } from './minimumdoelen';
import { datumLeesbaar } from './minimumdoelenBron';
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

/**
 * Maakt een nagekeken leerplan rechtstreeks uit een officiële set. De doelen blijven in de volgorde
 * van het bestand; de tekst gaat door `htmlNaarTekst` (nooit HTML bewaren). Elk doel verwijst naar
 * zichzelf in de set (`refs`: set + vast nummer + code). Een doel zonder vast nummer of zonder tekst
 * wordt overgeslagen en komt in `waarschuwingen`, zodat niets stil verdwijnt.
 *
 * Geeft het leerplan nog niet terug uit de opslag: de aanroeper bewaart het met `saveCurriculum`.
 */
export function leerplanUitSet(bestand: MinimumdoelenSetBestand): LeerplanUitSet {
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
  const herkomst: CurriculumHerkomst = { methode: 'officieel', ingelezenOp: Date.now() };
  if (s.versie) herkomst.versie = s.versie;
  if (s.geldigVan) herkomst.geldigVanaf = s.geldigVan;
  if (s.bron) herkomst.bronUrl = s.bron;
  herkomst.bronNaam = s.id;
  if (s.sha256) herkomst.bronSha256 = s.sha256;

  const opgehaald = datumLeesbaar(s.opgehaald);
  const leerplan = bevestigLeerplan(
    createCurriculum({
      title: niveau ? `${naam} · ${niveau}` : naam,
      net: 'minimumdoelen',
      subject: naam,
      level: niveau,
      kind: 'leerplan',
      // De volledige setnaam onderscheidt sets met dezelfde korte naam (bv. aso en tso in de 3de graad).
      source: `${s.naam.trim()}. ${s.naamsvermelding || NAAMSVERMELDING}${opgehaald ? ` (opgehaald ${opgehaald})` : ''}`,
      herkomst,
      minimumdoelenSets: [s.id],
      goals,
    }),
    {
      door: NAGEKEKEN_DOOR_BRON,
      samenvatting: `Letterlijk overgenomen uit de officiële set ${s.id} (${doelen(goals.length)}).`,
    },
  );
  return { leerplan, waarschuwingen };
}

/**
 * Het leerplan dat je al van deze set bewaarde: herkomst "officieel", dezelfde set en dezelfde
 * vingerafdruk (een nieuwere versie van de set is dus een ander leerplan). Een eigen kopie of een
 * leerplan dat na het nakijken gewijzigd werd, telt niet mee: wie opnieuw "gebruik als leerplan"
 * kiest, wil de officiële doelen zoals ze zijn.
 */
export function vindLeerplanVoorSet(curricula: readonly Curriculum[], bestand: MinimumdoelenSetBestand): Curriculum | undefined {
  const { id, sha256 } = bestand.set;
  return curricula.find((c) => {
    if (c.herkomst?.methode !== 'officieel' || c.herkomst.bronNaam !== id || c.herkomst.bronSha256 !== sha256) return false;
    if (c.kind === 'eigen') return false;
    const nagekeken = c.controle?.doelenSha256;
    const gewijzigd = controleStatus(c) === 'gewijzigd' || (nagekeken !== undefined && nagekeken !== doelenVingerafdruk(c.goals));
    return !gewijzigd;
  });
}
