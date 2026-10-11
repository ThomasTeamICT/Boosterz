// Kleine, pure hulpen voor de vensters "Nieuwe cursus voor deze richting" en "Studierichting van deze cursus"
// (docs/STUDIERICHTINGEN.md § 12.3, § 14.4 en § 14.5). Zonder scherm en zonder netwerk, zodat ze getest kunnen worden:
// teksten die iets met een waarschuwing of een melding doen, de status in de voet, en wat de richtingkiezer teruggeeft.

import { BK_VENSTER_FOUT, BK_VENSTER_LADEN, bkNogNodig } from './bkWeergave';
import type { BkBestand } from './beroepskwalificaties';
import { MAX_DOELGROEP_VAK, type Doelgroep } from './doelgroep';
import {
  doelgroepVan,
  filterRichtingen,
  type KaderHerkomst,
  type RichtingInfo,
  type RichtingKeuze,
  type SoortKeuze,
} from './richtingKader';
import { contextVanSet } from './minimumdoelenBron';
import { setKenmerken, setNaam, zegOntbreekt, type Ontbreekt } from './samenstelKeuze';
import type { MatrixBestand } from './studierichtingen';

// ── Teksten voor op het scherm ──────────────────────────────────────────────

/**
 * Haalt de set-id's uit een tekst die voor de leerkracht bedoeld is: "Nederlands (ODS_3343): 3 doelen …" wordt
 * "Nederlands: 3 doelen …", "De set ODS_3343 bestaat niet" wordt "De set bestaat niet", en een los "ODS_3343" wordt
 * "de set". Een set-id staat nooit op het scherm.
 */
export function zonderSetId(tekst: string): string {
  return tekst
    .replace(/\s*\(ODS_\d+\)/g, '')
    .replace(/\b(set) ODS_\d+/gi, '$1')
    .replace(/ODS_\d+/g, 'de set');
}

/**
 * De foutmelding bij een set die niet geladen kon worden, voor op het scherm. De bibliotheek zegt "De set ODS_x bestaat
 * niet (meer). Kies een set uit de lijst.": hier wordt dat "De set ‘Biologie’ bestaat niet (meer)." met een verwijzing
 * naar wat er in dit venster echt staat, want er is geen lijst om uit te kiezen. Zonder naam blijft de tekst zoals ze is,
 * zonder set-id. Er staat nooit een set-id in het resultaat.
 */
export function setFoutTekst(naam: string | undefined, fout: string): string {
  const schoon = fout.trim();
  const m = /^De set ODS_\d+\s+([\s\S]*)$/.exec(schoon);
  const basis = naam === undefined ? schoon : m ? `De set ‘${naam}’ ${m[1]}` : `${naam}: ${schoon}`;
  return zonderSetId(basis.replace(/\s*Kies een set uit de lijst\.?/g, ' Kies andere sets of andere doelen.')).trim();
}

/** Het aantal doelen dat in de koppeling staat maar niet meer in het setbestand (`leerplanVoorRichting().ontbrekend`). */
export function aantalOntbrekend(ontbrekend: readonly { ids: readonly string[] }[]): number {
  return ontbrekend.reduce((som, o) => som + o.ids.length, 0);
}

/**
 * De zin voor een leerplan dat wel nagekeken is, maar waarvan een deel van de gekoppelde doelen niet meer in de huidige
 * versie van de set staat (§ 14.3). Leeg zonder ontbrekende doelen.
 */
export function ontbrekendeDoelenZin(n: number): string {
  if (!Number.isFinite(n) || n < 1) return '';
  const aantal = Math.floor(n);
  return `${aantal} ${aantal === 1 ? 'doel uit de koppeling staat' : 'doelen uit de koppeling staan'} niet meer in de huidige versie van de set. De koppeling wordt elke maand bijgewerkt.`;
}

/** Een naam om te vergelijken: zonder hoofdletters en overtollige spaties. */
function naamSleutel(naam: string): string {
  return naam.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** De namen zonder dubbels, in de volgorde van het eerste voorkomen. */
export function uniekeNamen(namen: readonly string[]): string[] {
  const gezien = new Set<string>();
  const uit: string[] = [];
  for (const naam of namen) {
    const sleutel = naamSleutel(naam);
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uit.push(naam);
  }
  return uit;
}

/** Wat een schermlezer hoort over een set: een volledige set of een deel ervan. */
function deelTekst(volledig: boolean): string {
  return volledig ? 'de volledige set' : 'een deel van de set';
}

/** Een set zoals de lijst met vakjes hem kent: genoeg om hem van een andere set met dezelfde naam te onderscheiden. */
export interface SetVoorLabel {
  set: { naam: string; korteNaam?: string; graad?: string; stroom?: string };
  volledig: boolean;
}

/** De naam van een set en wat erbij moet als een andere set dezelfde naam heeft (met een spatie vooraan, of leeg). */
export interface SetLabel {
  naam: string;
  achtervoegsel: string;
}

/**
 * De namen van de sets in een lijst, zo dat twee sets met dezelfde naam voor een schermlezer uit elkaar te houden zijn.
 * Heeft een naam maar één set, dan is er geen achtervoegsel. Anders is het achtervoegsel, per groep van gelijke namen
 * en in deze volgorde, het eerste dat alle sets van de groep van elkaar onderscheidt:
 * 1. een volledige set of een deel van de set ("Wiskunde (een deel van de set)");
 * 2. de soort doelen uit de volledige naam, bv. "Eindtermen basisgeletterdheid" of "Uitbreidingsdoelen";
 * 3. de graad, de stroom en de soort doelen samen;
 * 4. als dat ook niet volstaat: een volgnummer ("2 van 3").
 * Zo heten in de 1ste graad de drie sets "Nederlands" niet alle drie "de volledige set".
 */
export function setLabels(sets: readonly SetVoorLabel[]): SetLabel[] {
  const namen = sets.map((s) => setNaam(s.set));
  const groepen = new Map<string, number[]>();
  namen.forEach((naam, i) => {
    const sleutel = naamSleutel(naam);
    groepen.set(sleutel, [...(groepen.get(sleutel) ?? []), i]);
  });
  const uit: SetLabel[] = namen.map((naam) => ({ naam, achtervoegsel: '' }));
  for (const indices of groepen.values()) {
    if (indices.length < 2) continue;
    const trappen: ((s: SetVoorLabel) => string)[] = [
      (s) => deelTekst(s.volledig),
      (s) => contextVanSet(s.set.naam) || deelTekst(s.volledig),
      (s) => [deelTekst(s.volledig), setKenmerken(s.set)].filter(Boolean).join(', '),
    ];
    let labels: string[] | undefined;
    for (const trap of trappen) {
      const kandidaat = indices.map((i) => trap(sets[i]));
      if (new Set(kandidaat).size === kandidaat.length) { labels = kandidaat; break; }
    }
    if (!labels) {
      const laatste = trappen[trappen.length - 1];
      labels = indices.map((i, k) => `${laatste(sets[i])}, ${k + 1} van ${indices.length}`);
    }
    indices.forEach((i, k) => { uit[i].achtervoegsel = ` (${labels![k]})`; });
  }
  return uit;
}

/** De zin onder het vak: welke sets er bij passen. Leeg zonder vak. Een naam komt hoogstens één keer voor. */
export function voorstelZin(vak: string, namen: readonly string[], metStem: boolean): string {
  if (vak === '') return '';
  const uniek = uniekeNamen(namen);
  if (uniek.length > 0) {
    return `Voorgesteld bij ‘${vak}’: ${uniek.join(', ')}.${metStem ? ' Daarnaast past een STEM-set; lees de uitleg hieronder.' : ''}`;
  }
  if (metStem) return `Bij ‘${vak}’ past alleen een STEM-set. Lees de uitleg hieronder.`;
  return `Geen set gevonden bij ‘${vak}’. Kies zelf hieronder.`;
}

/**
 * De uitleg bij het veld "Je vak". Heeft de richting sets, dan zegt ze dat Boosterz er sets bij aanvinkt; heeft ze er
 * geen, dan is er niets om aan te vinken en komt het vak alleen op de cursus te staan.
 */
export function vakHint(kaderLeeg: boolean): string {
  return kaderLeeg
    ? 'Het vak komt in de titel en bij de studierichting van de cursus.'
    : 'Boosterz vinkt de sets aan die bij dat vak passen. Dat is een hulp bij het kiezen, geen officiële koppeling.';
}

/**
 * De tekst in de voet van het venster. "Nog nodig:" gaat alleen over zaken (een titel, een set, een leerplan); dat de
 * sets nog laden of niet laadden is een eigen status, geen opdracht na "Nog nodig:".
 */
export function voetTekst(ontbreekt: readonly Ontbreekt[], laden: number, mislukt: number): string {
  return [
    zegOntbreekt(ontbreekt),
    laden > 0 ? 'De sets worden nog geladen.' : '',
    mislukt > 0 ? 'Een set kon niet geladen worden. Probeer opnieuw.' : '',
  ].filter(Boolean).join(' ');
}

// ── De competenties van een beroepskwalificatie (§ 23.7.3) ──────────────────

/** Het vak in het titelvoorstel als er meer dan één beroepskwalificatie gekozen is (gelijk aan het vak van het leerplan). */
export const BK_VAK_MEER = 'Beroepsgerichte vorming';

/**
 * De melding als het deel van het venster dat de keuze van de competenties toont, niet geladen kon worden (bv. omdat de
 * verbinding wegviel). Het venster laat dan niets maken dat de leerkracht niet zag. Het venster sluiten en heropenen helpt
 * niet: de browser onthoudt een mislukt deel tot de pagina herladen wordt. Daarom wijst de melding naar de pagina zelf.
 */
export const FOUT_BK_KEUZE = 'De keuze van de competenties kon niet getoond worden. Controleer je verbinding en laad de pagina opnieuw.';

/** De knop bij `FOUT_BK_KEUZE`. */
export const BK_PAGINA_HERLADEN = 'Pagina herladen';

/**
 * Het vak voor het titelvoorstel bij de competenties van een beroepskwalificatie: de titel van de beroepskwalificatie als er
 * competenties van precies één titel gekozen zijn, "Beroepsgerichte vorming" bij meer titels, en niets zonder keuze. Een
 * titel die twee keer voorkomt (twee versies van dezelfde beroepskwalificatie) telt één keer, een lege titel niet.
 */
export function bkVakVoorstel(titels: readonly string[]): string {
  const uniek = uniekeNamen((Array.isArray(titels) ? titels : []).filter((t): t is string => typeof t === 'string' && t.trim() !== '').map((t) => t.trim()));
  return uniek.length === 0 ? '' : uniek.length === 1 ? uniek[0] : BK_VAK_MEER;
}

/**
 * Het vak dat het venster vooraf invult als het geopend werd vanaf de kaart van een beroepskwalificatie (`startTitel`): de
 * titel van die beroepskwalificatie, tot er competenties van een andere gekozen zijn. Dan volgt het vak de gekozen
 * beroepskwalificaties (`gekozenTitels`, "Beroepsgerichte vorming" bij meer), zoals bij het titelvoorstel van § 23.7.3. Het is een
 * voorstel: typt de leerkracht zelf in het vak, dan wint haar tekst. Zonder `startTitel` is er niets vooraf ingevuld.
 */
export function bkVoorgevuldVak(startTitel: string | undefined, gekozenTitels: readonly string[]): string {
  if (startTitel === undefined) return '';
  return (bkVakVoorstel(gekozenTitels) || startTitel.trim()).slice(0, MAX_DOELGROEP_VAK);
}

/**
 * De competenties die het venster als gekozen toont, per BK-versie als lijst codes in de volgorde van het bestand.
 * `alle`: per versie de codes van al haar competenties, alleen van versies waarvan het bestand al binnen is. `eigen`: wat de
 * leerkracht per versie zelf aan- of uitvinkte (ook een lege lijst: alles uit). Een versie die ze niet aanraakte, krijgt de
 * standaard (`standaard`: de versies die vooraf helemaal aangevinkt staan), ook als haar bestand pas binnenkomt nadat ze in een
 * andere versie klikte. Een versie zonder gekozen competenties staat er niet in.
 */
export function bkGekozen(
  alle: ReadonlyMap<string, readonly string[]>,
  eigen: ReadonlyMap<string, readonly string[]> | null,
  standaard: readonly string[],
): Map<string, string[]> {
  const uit = new Map<string, string[]>();
  for (const [versie, ids] of alle) {
    const aangeraakt = eigen?.get(versie);
    const gewenst = new Set<string>(aangeraakt ?? (standaard.includes(versie) ? ids : []));
    const lijst = ids.filter((id) => gewenst.has(id));
    if (lijst.length > 0) uit.set(versie, lijst);
  }
  return uit;
}

/** Hoe het met het bestand van een BK-versie staat in het venster. */
export type BkBestandStand = 'laden' | 'klaar' | 'ontbreekt' | 'fout';

/** De uitkomst van het laden van één BK-versie. */
export interface BkBestandUitkomst {
  /** Bij welke poging deze uitkomst hoort ("Opnieuw proberen" start een nieuwe poging). */
  poging: number;
  stand: Exclude<BkBestandStand, 'laden'>;
  bestand?: BkBestand;
}

/**
 * Per BK-versie van `versies` de stand en de geladen bestanden. Een bestand dat binnen is (of dat er niet is) blijft gelden bij
 * een nieuwe poging: alleen een fout hoort bij de poging waarin ze viel en staat daarna weer op 'laden'. Zo blijven de
 * competenties die al getoond worden, en wat de leerkracht daarin aanvinkte, staan terwijl een andere versie opnieuw laadt.
 */
export function bkBestandStanden(
  versies: readonly string[],
  uitkomsten: ReadonlyMap<string, BkBestandUitkomst>,
  poging: number,
): { stand: Map<string, BkBestandStand>; bestanden: Map<string, BkBestand> } {
  const stand = new Map<string, BkBestandStand>();
  const bestanden = new Map<string, BkBestand>();
  for (const v of versies) {
    const u = uitkomsten.get(v);
    const geldt = u !== undefined && (u.stand !== 'fout' || u.poging === poging);
    stand.set(v, geldt ? u.stand : 'laden');
    if (geldt && u.stand === 'klaar' && u.bestand) bestanden.set(v, u.bestand);
  }
  return { stand, bestanden };
}

/**
 * De tekst in de voet bij de competenties van een beroepskwalificatie: wat er nog nodig is ("Nog nodig: een titel, minstens
 * één competentie."), dat de beroepskwalificaties nog laden, en dat er een niet geladen kon worden. Net als bij `voetTekst`
 * noemt "Nog nodig:" alleen zaken; laden en fouten zijn een eigen status. `keuzeFout`: het deel met de vakjes zelf kon niet
 * geladen worden. Leeg als alles er is.
 */
export function voetTekstBk(o: { titel: boolean; competenties: boolean; laden: boolean; mislukt: boolean; keuzeFout?: boolean }): string {
  return [
    bkNogNodig({ titel: o.titel, competenties: o.competenties }),
    o.laden ? BK_VENSTER_LADEN : '',
    o.mislukt ? BK_VENSTER_FOUT : '',
    o.keuzeFout ? FOUT_BK_KEUZE : '',
  ].filter(Boolean).join(' ');
}

/**
 * De melding bovenaan het venster als de richting geen sets heeft om uit te kiezen. Ze zegt wat er mis is en verwijst
 * naar wat er echt in het venster staat: een leerplan dat al op dit toestel staat (`heeftLeerplan`), de competenties van
 * een beroepskwalificatie (`metBk`), of anders de links om er een in te lezen of een doelenlijst samen te stellen.
 */
export function kaderLeegTekst(herkomst: KaderHerkomst, heeftLeerplan: boolean, metBk = false): string {
  const situatie = herkomst === 'geen'
    ? 'Voor deze richting geeft de officiële bron geen minimumdoelen.'
    : herkomst === 'nog-niet-opgehaald'
      ? 'De doelen van deze richting zijn nog niet opgehaald.'
      : 'Voor deze richting staan er geen sets om uit te kiezen.';
  const verder = metBk
    ? heeftLeerplan
      ? 'Kies hieronder de competenties van een beroepskwalificatie, of een leerplan dat al op dit toestel staat.'
      : 'Kies hieronder de competenties van een beroepskwalificatie, lees het leerplan van je net in of stel zelf een doelenlijst samen.'
    : heeftLeerplan
      ? 'Kies hieronder een leerplan dat al op dit toestel staat.'
      : 'Lees het leerplan van je net in of stel zelf een doelenlijst samen.';
  return `${situatie} ${verder}`;
}

/** De link om het leerplan van je net in te lezen, met de richting (en het jaar) al ingevuld. */
export function inlezenLink(groep: string, soort: SoortKeuze, jaar?: number): string {
  const p = new URLSearchParams();
  p.set('richting', groep);
  p.set('soort', soort);
  if (jaar !== undefined) p.set('jaar', String(jaar));
  return `/leerplannen/inlezen?${p.toString()}`;
}

// ── De richtingkiezer ───────────────────────────────────────────────────────

/**
 * De doelgroep die de kiezer teruggeeft. Bevestigt de leerkracht dezelfde richting als `huidig` zonder iets te wijzigen
 * (zelfde jaar, zelfde soort onderwijs), dan is dat `huidig` zelf, onveranderd. Wijzigt ze alleen het jaar of het soort,
 * dan blijven het onderdeel (de variant) en het vak van `huidig` behouden. Het onderdeel valt vanzelf weg als het niet
 * bij de gekozen richting hoort; het vak gaat altijd mee.
 */
export function bevestigRichting(info: RichtingInfo, keuze: RichtingKeuze, huidig: Doelgroep | undefined): Doelgroep {
  const zelfdeRichting = huidig !== undefined && huidig.groep === info.groep.nummer;
  const nieuw = doelgroepVan(
    info,
    { ...keuze, onderdeel: zelfdeRichting ? huidig.onderdeel : keuze.onderdeel },
    huidig?.vak ? { vak: huidig.vak } : undefined,
  );
  if (zelfdeRichting && nieuw.jaar === huidig.jaar && nieuw.soort === huidig.soort) return huidig;
  return nieuw;
}

/**
 * Heeft de leerkracht niets gewijzigd aan wat het venster toonde bij het openen: dezelfde richting, hetzelfde jaar en
 * hetzelfde soort onderwijs als `huidig`? Dan blijft `huidig` zoals het is, ook als de kiezer zelf een jaar zou invullen
 * (bv. het enige jaar van de richting) dat er nog niet in stond.
 */
export function isOngewijzigd(
  huidig: Doelgroep | undefined,
  gekozen: { groep: string | null; jaar: number | undefined; buso: boolean },
): boolean {
  return huidig !== undefined
    && gekozen.groep === huidig.groep
    && gekozen.jaar === huidig.jaar
    && gekozen.buso === (huidig.soort === 'buso');
}

/** De filters van de lijst met richtingen. */
export interface KiezerFilter {
  graad: 1 | 2 | 3 | undefined;
  ookMeer: boolean;
  afgebouwd: boolean;
}

/**
 * Met welke filters de lijst begint, zodat de huidige richting erin staat: eerst de gewone lijst van haar graad, dan met
 * 7de jaren en buitengewoon onderwijs, dan met afgebouwde richtingen, dan met allebei, en als ze nog niet verschijnt
 * zonder graadfilter. Zonder huidige richting, of als ze niet in de matrix staat, begint de lijst gewoon bij `graad`.
 */
export function beginFilter(matrix: MatrixBestand, groep: string | undefined, graad: 1 | 2 | 3 | undefined, vandaag: string): KiezerFilter {
  const gewoon: KiezerFilter = { graad, ookMeer: false, afgebouwd: false };
  if (groep === undefined) return gewoon;
  const staatErIn = (f: KiezerFilter) =>
    filterRichtingen(matrix, { graad: f.graad, zoek: '', ookMeer: f.ookMeer, afgebouwd: f.afgebouwd }, vandaag).some((r) => r.groep.nummer === groep);
  const graden = graad === undefined ? [undefined] : [graad, undefined];
  for (const g of graden) {
    for (const [ookMeer, afgebouwd] of [[false, false], [true, false], [false, true], [true, true]] as const) {
      const f: KiezerFilter = { graad: g, ookMeer, afgebouwd };
      if (staatErIn(f)) return f;
    }
  }
  return gewoon;
}

/** De huidige richting bovenaan de lijst (als ze erin staat); de rest blijft in dezelfde volgorde. */
export function huidigeEerst<T extends { groep: { nummer: string } }>(lijst: readonly T[], groep: string | undefined): T[] {
  const i = groep === undefined ? -1 : lijst.findIndex((r) => r.groep.nummer === groep);
  if (i <= 0) return [...lijst];
  return [lijst[i], ...lijst.slice(0, i), ...lijst.slice(i + 1)];
}
