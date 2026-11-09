// De drie lagen van #/basis: minimumdoel (overheid) ← leerplandoel (GO!) ← lesplan (GO!).
// Ontwerp: docs/basisonderwijs/GO-LEERPLAN.md ("Gegevensmodel", met de rechtzettingen van de rechter
// en de antwoorden van de eigenaar van 9 november 2026).
//
// Alle tekst van het GO! is letterlijk; de app maakt er alleen opmaak van, nooit een andere tekst.
// De tekst van een minimumdoel staat hier nooit: die komt altijd uit public/leerplannen/minimumdoelen/ (de API).
//
// Dit bestand is het contract tussen de import (tools/basis/go/maak.ts), de validator (valideer.ts) en de
// schermen. Naast de types staan hier alleen vaste gegevens en kleine zuivere functies die bij het contract horen
// (de vakken, de bronvermelding, wat de sha256 van een bestand dekt).
import type { MinimumdoelRef } from '../../curriculumTypes';

/** De twaalf vakdisciplines van het nieuwe GO! leerplan basisonderwijs (het voorvoegsel van de code). */
export type GoVak = 'AA' | 'BU' | 'FR' | 'GE' | 'IT' | 'LL' | 'LO' | 'MV' | 'NL' | 'SV' | 'WI' | 'WT';
/** De leeftijdsgroepen van het GO! (de kolommen 2,5-4 … 11-12; tussen haakjes in een lesplan). */
export type GoLeeftijd = '2,5-4' | '4-5' | '5-6' | '6-7' | '7-8' | '8-9' | '9-10' | '10-11' | '11-12';
/** Kolom KENNISVERWERKING; in een lesplan cursief tussen haken, bv. [begrijpen]. Geen niveau E tot A (docs/NIVEAUS.md). */
export type Kennisverwerking = 'begrijpen' | 'gebruiken' | 'engageren';
/** De kolommen 'KO nummer', 'L4 nummer' en 'L6 nummer'. */
export type GoMoment = 'KO' | 'L4' | 'L6';

export const GO_MOMENTEN: readonly GoMoment[] = ['KO', 'L4', 'L6'];
export const KENNISVERWERKINGEN: readonly Kennisverwerking[] = ['begrijpen', 'gebruiken', 'engageren'];

/**
 * Per vakdiscipline: de naam van het tabblad in de doelenset (zo staat ze ook als 'Vakdiscipline:' in een lesplan) en
 * de naam van de doelenset in de bronvermelding. Een `Record`: een vak zonder rij laat de typecheck falen.
 */
export const GO_VAKKEN: Readonly<Record<GoVak, { naam: string; doelenset: string }>> = {
  AA: { naam: 'Aardrijkskunde', doelenset: 'aardrijkskunde' },
  BU: { naam: 'Burgerschap', doelenset: 'burgerschap' },
  FR: { naam: 'Frans', doelenset: 'Frans' },
  GE: { naam: 'Geschiedenis', doelenset: 'geschiedenis' },
  IT: { naam: 'ICT', doelenset: 'ICT' },
  LL: { naam: 'Leren leren', doelenset: 'leren leren' },
  LO: { naam: 'Lichamelijke opvoeding', doelenset: 'lichamelijke opvoeding' },
  MV: { naam: 'Muzische vorming', doelenset: 'muzische vorming' },
  NL: { naam: 'Nederlands', doelenset: 'Nederlands' },
  SV: { naam: 'Sociale vaardigheden', doelenset: 'sociale vaardigheden' },
  WI: { naam: 'Wiskunde', doelenset: 'wiskunde' },
  WT: { naam: 'Wetenschap en techniek', doelenset: 'wetenschap en techniek' },
};
/** De vakken in vaste (alfabetische) volgorde: zo staan ze ook in de index. */
export const GO_VAK_CODES: readonly GoVak[] = ['AA', 'BU', 'FR', 'GE', 'IT', 'LL', 'LO', 'MV', 'NL', 'SV', 'WI', 'WT'];

export function isGoVak(v: unknown): v is GoVak {
  return typeof v === 'string' && (GO_VAK_CODES as readonly string[]).includes(v);
}

// ── Bronvermelding (antwoord van de eigenaar, 9 november 2026) ──────────
export const GO_NAAMSVERMELDING = 'GO! onderwijs van de Vlaamse Gemeenschap';
/** Tot het patroon van een link per lesplan gekend is, linkt elk lesplan hierheen. */
export const GO_STUDIO_URL = 'https://studio.g-o.be/';
/** De badge bij een koppeling met status 'voorstel' (nu alleen MV.040 '6.12'). */
export const GO_VOORSTEL_LABEL = 'voorstel, nog niet bevestigd door het GO!';

/** De volledige bronvermelding bij een lesplan, bv. lesplan LP0065. */
export function bronvermeldingLesplan(code: string): string {
  return `Bron: ${GO_NAAMSVERMELDING}, lesplan ${code} (GO! studio). Letterlijk overgenomen met toestemming.`;
}

/** De volledige bronvermelding bij een leerplandoel of een overzicht van leerplandoelen van één vak. */
export function bronvermeldingLeerplan(vak: GoVak): string {
  return `Bron: ${GO_NAAMSVERMELDING}, het nieuwe GO! leerplan basisonderwijs, doelenset ${GO_VAKKEN[vak].doelenset}. Letterlijk overgenomen met toestemming.`;
}

// ── Letterlijke, opgemaakte tekst ────────────────────────────────────
export type GoIcoon = 'vlag' | 'schakel' | 'diploma' | 'deelconcept' | 'go-concept' | 'denklens';
export const GO_ICONEN: readonly GoIcoon[] = ['vlag', 'schakel', 'diploma', 'deelconcept', 'go-concept', 'denklens'];

/**
 * Tekst met de opmaak van de bron: vet (b), cursief (i), onderlijnd (u), doorgehaald (s) en superschrift (sup).
 * Een vlag staat er alleen als ze `true` is. Doorgehaalde tekst blijft letterlijk staan, als doorgehaald: of hij
 * getoond of weggelaten wordt, beslist de hoofdsessie per geval (rechtzetting 3 van de rechter), nooit de app.
 */
export interface TekstStuk {
  t: string;
  b?: true;
  i?: true;
  u?: true;
  s?: true;
  sup?: true;
}
/** Tekst, een regeleinde (w:br of een regeleinde in w:t) of een pictogram. */
export type Stuk = TekstStuk | { br: true } | { icoon: GoIcoon };
/** Eén alinea of één lijstitem. Aangrenzende stukken met dezelfde opmaak zijn samengevoegd. */
export type Regel = Stuk[];

/**
 * Een letterlijke tekst uit een doelenset (een cel van de Excel).
 * - `tekst`: alle runs van de cel samen, ook de doorgehaalde, zonder opmaak. Zo kan een tekst nooit stil korter
 *   worden: een doorgehaalde spatie tussen twee woorden ('Tellen gerelateerde' + ' ' + 'breuken op.') blijft een spatie.
 * - `opmaak`: alleen als de cel opgemaakte runs heeft (doorgehaald, superschrift, cursief …). Alleen tekststukken,
 *   en samen precies `tekst`. Een scherm toont `opmaak` als die er is; zoeken en vergelijken gebeurt op `tekst`.
 */
export interface GoTekst {
  tekst: string;
  opmaak?: TekstStuk[];
}

interface GoBeeldBasis {
  soort: 'beeld';
  /** Naam in word/media van het origineel en de maat uit wp:extent, in px. */
  bron: string;
  breedte: number;
  hoogte: number;
}
/**
 * Een beeld uit een lesplan (geen pictogram). De mindmap 'Mijn lichaam' (LP0014a, LP0014b) is door de eigenaar
 * vrijgegeven op 9 november 2026: 'getoond', met een beschrijvende alt-tekst.
 */
export type GoBeeld =
  | (GoBeeldBasis & {
      status: 'getoond';
      /** Pad onder public/basis/go/, altijd 'beelden/<naam>.<webp|png|jpg>'. */
      bestand: string;
      /** Geschreven en nagekeken, want de bron heeft geen alt-tekst. */
      alt: string;
      /** Een langere beschrijving (in een details-blok), als die er is. */
      uitleg?: string;
    })
  | (GoBeeldBasis & {
      status: 'weggelaten';
      /** Staat zichtbaar op de plaats van het beeld. */
      uitleg: string;
    });

export type Blok =
  | { soort: 'kop'; niveau: 1 | 2 | 3 | 4; tekst: Regel }
  | { soort: 'alinea'; tekst: Regel }
  /** `start` alleen bij een genummerde lijst die een onderbroken lijst voortzet (dus 2 of meer). */
  | { soort: 'lijst'; genummerd: boolean; start?: number; items: Regel[] }
  | { soort: 'tabel'; rijen: Cel[][] }
  | GoBeeld;

export type CelBlok = Extract<Blok, { soort: 'alinea' | 'lijst' }> | GoBeeld;

export interface Cel {
  /** kolomkop: de grijze koprij (F2F2F2); rijkop: de eerste kolom van de tabellen in deel 1, 2 en 4. */
  rol: 'kolomkop' | 'rijkop' | 'data';
  /** Verticaal samengevoegd (w:vMerge), zoals 'Leskern' over de stappen. Een 'vervolg'-cel heeft een cel erboven. */
  samengevoegd?: 'begin' | 'vervolg';
  /** Geen koppen en geen tabellen in een cel (de bron heeft er geen; de validator weigert ze). Mag leeg zijn. */
  blokken: CelBlok[];
}

/**
 * Een plek in de letterlijke tekst van een lesplan: deel (nr), blok, in een tabel rij en kolom, in een cel het blok
 * (`regel`), en in een lijst het item. Rechtzetting 6: zonder `item` en `regel` kan een activiteit van 'Trainen' die
 * midden in een lijst begint, niet aangewezen worden.
 */
export interface Wijzer {
  deel: number;
  blok: number;
  rij?: number;
  kolom?: number;
  /** Het blok binnen de cel; alleen samen met rij en kolom. */
  regel?: number;
  /** Het item binnen de lijst die de wijzer anders aanwijst. */
  item?: number;
}

// ── Laag 3: lesplan ──────────────────────────────────────────────────
/** public/basis/go/lesplannen/<code>.json */
export interface GoLesplanBestand {
  app: 'boosterz';
  kind: 'go-lesplan';
  v: 1;
  /** 'LP0065', gelijk aan de bestandsnaam (LP[0-9]{4}[a-z]?). */
  code: string;
  /** 'Dieren classificeren'. */
  titel: string;
  /** Uit de titel: '(2,5-4 jaar)'. */
  leeftijd: GoLeeftijd;
  /**
   * De volledige tekst, in de volgorde van de bron. Deel 0 is de kop (Heading1 en de metaregels), daarna deel 1 tot 6
   * (deel 7 = Bijlagen, alleen LP0014a). `nr` is gelijk aan de plaats in de lijst. Deel 0 begint met de kop van
   * niveau 1 ('Lesplan <code> <titel> (<leeftijd> jaar)'), elk ander deel met zijn kop van niveau 2.
   */
  delen: { nr: number; blokken: Blok[] }[];
  afgeleid: GoLesplanAfgeleid;
  bron: GoLesplanBron;
  /** sha-256 (hex) van canoniek(lesplanShaInvoer(bestand)). */
  sha256: string;
}

/** Wat de app nodig heeft om te zoeken, te filteren en te koppelen. Elke tekst hierin staat letterlijk in de tekst van het lesplan. */
export interface GoLesplanAfgeleid {
  /** 'Wetenschap en techniek': gelijk aan GO_VAKKEN[vak].naam, en zo in deel 0. */
  vakdiscipline: string;
  vak: GoVak;
  lessenlijn: string;
  lessenreeks: string;
  /** Een of meer, bv. LP0074: DFWT005 en DFWT004. */
  didactischeFiches: { code: string; titel: string }[];
  /** Uit deel 2; `waar` wijst de doelregel aan ('WT.001 [begrijpen] Herkennen het organisme dier. (2,5-4 jaar)'). */
  leerplandoelen: { code: string; kennisverwerking: Kennisverwerking; leeftijden: GoLeeftijd[]; tekst: string; waar: Wijzer }[];
  /** Uit de rij Lesdoel van deel 4; `waar` wijst aan waar het diploma met al zijn ik-doelen staat (meestal de cel). */
  diplomas: { naam: string; leeftijd: GoLeeftijd; ikDoelen: { code: string; zinnen: string[] }[]; waar: Wijzer }[];
  deelconcepten: string[];
  goConcepten: string[];
  /** Codes met het pictogram vlag in deel 3. */
  vlaggen: string[];
  /** Codes met het pictogram schakel in deel 3. */
  schakels: string[];
  /** De stappen van de leskern, oplopend vanaf 1; LP0014b heeft er 5. `wat` en `hoe` wijzen de twee cellen aan. */
  stappen: { nr: 1 | 2 | 3 | 4 | 5 | 6; naam: string; wat: Wijzer; hoe: Wijzer }[];
  /** De activiteiten van deel 5; LP0017 heeft 3 activiteiten zonder titel. */
  trainen: { titel?: string; vanaf: Wijzer; tot: Wijzer }[];
  materiaal: Wijzer;
}

export interface GoBronBestand {
  /** Bestandsnaam van het origineel, zonder pad. */
  naam: string;
  bytes: number;
  /** sha-256 (hex) van het originele bestand. */
  sha256: string;
  /** dcterms:created (docx) of dcterms:modified (xlsx), ISO. Nooit dc:creator of cp:lastModifiedBy. */
  datum: string;
}

export interface GoLesplanBron {
  net: 'GO!';
  /** GO_NAAMSVERMELDING. */
  naamsvermelding: string;
  waar: 'GO! studio';
  /** GO_STUDIO_URL tot het patroon van een link per lesplan gekend is; altijd https://studio.g-o.be/… */
  url: string;
  /** naam = '<code>.docx'. */
  bestand: GoBronBestand;
  /** Datum van de import, JJJJ-MM-DD. */
  ingelezen: string;
}

// ── Laag 2: leerplandoelen ───────────────────────────────────────────
/** public/basis/go/leerplan/<vak>.json, één per doelenset. */
export interface GoLeerplanBestand {
  app: 'boosterz';
  kind: 'go-leerplan';
  v: 1;
  vak: GoVak;
  /** De naam van het tabblad, gelijk aan GO_VAKKEN[vak].naam. */
  naam: string;
  /** De hiërarchie, in bronvolgorde (rij oplopend). */
  rubrieken: GoRubriek[];
  /** In bronvolgorde: de code loopt op van 001 tot N, zonder gaten. */
  doelen: GoLeerplandoel[];
  bron: GoLeerplanBron;
  /** sha-256 (hex) van canoniek(leerplanShaInvoer(bestand)). */
  sha256: string;
}

export interface GoLeerplanBron {
  net: 'GO!';
  naamsvermelding: string;
  waar: 'GO! Navigator';
  leerplan: 'Het nieuwe GO! leerplan basisonderwijs';
  /** 'Doelenset BaO wetenschap en techniek.xlsx'. */
  bestand: GoBronBestand;
  ingelezen: string;
}

export type GoRubriekSoort = 'onderwerp' | 'subthema' | 'rubriek' | 'subrubriek';
/** Van hoog naar laag. Een niveau mag overgeslagen worden (in WI staat een subrubriek rechtstreeks onder een subthema). */
export const GO_RUBRIEK_SOORTEN: readonly GoRubriekSoort[] = ['onderwerp', 'subthema', 'rubriek', 'subrubriek'];

export interface GoRubriek extends GoTekst {
  /** 'WT-r012': een volgnummer in de set (vanaf r001, in bronvolgorde), want de bron nummert rubrieken niet. */
  id: string;
  soort: GoRubriekSoort;
  /** De dichtstbijzijnde rubriek erboven van een hoger niveau; geen als er geen is. */
  ouder?: string;
  /** Rij in de Excel. */
  rij: number;
}

export interface GoLeerplandoel extends GoTekst {
  /** 'WT.086'. */
  code: string;
  rij: number;
  kennisverwerking: Kennisverwerking;
  /** De leeftijdskolommen met 1, in volgorde; minstens één. */
  leeftijden: GoLeeftijd[];
  /** id van de diepste rubriek erboven: de laatste rubriekrij vóór het doel. */
  rubriek: string;
  /** MIA, begrippen, voorbeelden en voetnoten, in bronvolgorde: tussen het doel en de volgende doel- of rubriekrij. */
  inhoud: GoDoelInhoud[];
  /** De codekolommen van de doelzin-rij. */
  minimumdoelen: GoKoppeling;
  /** Kolom VLAGGEN. */
  vlaggen: GoVerwijzingen;
  /** Kolom SCHAKELS. */
  schakels: GoVerwijzingen;
}

/** De soorten inhoudsrijen die zelf een code kunnen dragen: een fijnere koppeling op het niveau van een MIA (14 rijen). */
export type GoInhoudMetKoppeling = 'mia-titel' | 'mia' | 'voorbeelden-titel' | 'voorbeeld';

export type GoDoelInhoud =
  | (GoTekst & { soort: 'mia-titel'; rij: number; koppeling?: GoKoppeling })
  /** `aanklikbaar` blijft bewaard, maar staat niet op het scherm zolang de betekenis niet gekend is. */
  | (GoTekst & { soort: 'mia'; aanklikbaar: boolean; rij: number; koppeling?: GoKoppeling })
  /** De leeftijden van een begrip mogen leeg zijn (17 rijen in de bron; rechtzetting 4). */
  | (GoTekst & { soort: 'begrip'; leeftijden: GoLeeftijd[]; rij: number })
  | (GoTekst & { soort: 'voorbeelden-titel'; rij: number; koppeling?: GoKoppeling })
  | (GoTekst & { soort: 'voorbeeld'; rij: number; koppeling?: GoKoppeling })
  /** TYPE 'asterisk'. */
  | (GoTekst & { soort: 'voetnoot'; rij: number });

/**
 * De koppeling naar minimumdoelen uit de codekolommen van één rij. Elke code in `bron` (gesplitst op komma) staat
 * precies één keer verantwoord: als officiële ref (moment + code) of als probleem (moment + bronCode).
 */
export interface GoKoppeling {
  /** Letterlijk uit de kolommen, bv. { KO: '3.1.3, 3.1.4' }. Alleen kolommen met tekst. */
  bron: Partial<Record<GoMoment, string>>;
  /** Leeg en geen bron: het leerplan koppelt deze rij aan geen minimumdoel. */
  refs: GoMinimumdoelRef[];
  /**
   * Codes die geen doel vinden. 'onleesbaar': niet van de vorm cijfer.cijfer.cijfer (app: 'Dat is geen geldig nummer');
   * 'bestaat-niet': wel die vorm, maar geen doel (app: 'Dat nummer bestaat niet in de officiële minimumdoelen').
   */
  problemen: { moment: GoMoment; bronCode: string; reden: 'bestaat-niet' | 'onleesbaar' }[];
}

/**
 * Een twijfel bij een officiële koppeling: melden, niet verbeteren.
 * - 'moment-buiten-leeftijden': het moment past niet bij de leeftijden van het doel (regel: momentPastBijLeeftijden).
 * - 'ander-vak': de code wijst naar een doel van een ander vak dan de vakdiscipline verwacht (bv. WI.706 → KO 4.2.3);
 *   alleen via bekende-afwijkingen.json.
 */
export type GoTwijfel = 'moment-buiten-leeftijden' | 'ander-vak';
/** Ook de volgorde waarin twijfels in een lijst staan. */
export const GO_TWIJFELS: readonly GoTwijfel[] = ['moment-buiten-leeftijden', 'ander-vak'];

/** De sleutel van de app (set + vast nummer + code), met het moment en de status. */
export interface GoMinimumdoelRef extends MinimumdoelRef {
  moment: GoMoment;
  /** 'voorstel': alleen voor een code die geen doel vindt, uit bekende-afwijkingen.json (sleutel doel + moment + bronCode). */
  status: 'officieel' | 'voorstel';
  /** Niet leeg, zonder dubbels, in de volgorde van GO_TWIJFELS. */
  twijfel?: GoTwijfel[];
  /** Alleen bij een voorstel: wat er letterlijk in de bron staat, bv. '6.12'. Er staat dan ook een probleem bij. */
  bronCode?: string;
}

export interface GoVerwijzingen {
  /** Letterlijk uit de kolom; gesplitst op komma of puntkomma. */
  bron?: string;
  /** De delen die een code van een leerplandoel zijn (<vak>.<3 cijfers>). */
  codes: string[];
  /** De andere delen, letterlijk: geen geldige code ('NL. 200', 'LL/095') of een code die niet bestaat ('NL.624'). */
  kapot: string[];
}

// ── Omgekeerd: per minimumdoel ───────────────────────────────────────
/**
 * public/basis/go/bij-minimumdoel/<vak 1-10>.json: per vast nummer de leerplandoelen die ernaar verwijzen.
 * Geldt voor gewoon en buitengewoon onderwijs: de tweelingsets hebben hetzelfde nummer.
 */
export interface GoBijMinimumdoelBestand {
  app: 'boosterz';
  kind: 'go-bij-minimumdoel';
  v: 1;
  vak: number;
  /** Sleutels alleen cijfers (het vaste nummer); inlezen in een Map, nooit opzoeken op een gewoon object. */
  doelen: Record<string, GoBijDoel[]>;
  /** sha-256 (hex) van canoniek(bijMinimumdoelShaInvoer(bestand)). */
  sha256: string;
}

/** Een MIA- of voorbeeldrij van het doel die naar dit minimumdoel verwijst, terwijl de doelzin zelf dat niet doet. */
export interface GoVia extends GoTekst {
  soort: GoInhoudMetKoppeling;
  rij: number;
}

/** Eén leerplandoel bij één minimumdoel; per minimumdoel oplopend op code, elke code één keer. */
export interface GoBijDoel extends GoTekst {
  code: string;
  moment: GoMoment;
  status: 'officieel' | 'voorstel';
  twijfel?: GoTwijfel[];
  /** Alleen bij een voorstel: wat er letterlijk in de bron staat. */
  bronCode?: string;
  kennisverwerking: Kennisverwerking;
  leeftijden: GoLeeftijd[];
  /** Lesplancodes met dit doel in deel 2, oplopend. */
  lesplannen: string[];
  /**
   * Alleen als de doelzin zelf niet naar dit minimumdoel verwijst, maar een MIA- of voorbeeldrij van het doel wel
   * (rechtzetting 2, bv. WI.408 'Aftrekken:' → L6 2.2.7). De app zegt dan: 'Het leerplan koppelt een onderdeel van dit
   * doel (MIA "Aftrekken:") aan dit minimumdoel.'
   */
  via?: GoVia[];
}

// ── Index ────────────────────────────────────────────────────────────
/** public/basis/go/index.json. Lijsten in vaste volgorde: leerplan op vak, bijMinimumdoel op vak, lesplannen op code. */
export interface GoIndex {
  app: 'boosterz';
  kind: 'go-index';
  v: 1;
  naamsvermelding: string;
  ingelezen: string;
  leerplan: {
    vak: GoVak;
    naam: string;
    /** 'leerplan/<vak>.json'. */
    bestand: string;
    aantal: number;
    /** Doelen zonder enige koppeling, ook niet via een MIA (isZonderMinimumdoel). */
    zonderMinimumdoel: number;
    perLeeftijd: Record<GoLeeftijd, number>;
    bronDatum: string;
    sha256: string;
  }[];
  /** bestand: 'bij-minimumdoel/<vak>.json'. */
  bijMinimumdoel: { vak: number; bestand: string; sha256: string }[];
  lesplannen: {
    code: string;
    titel: string;
    leeftijd: GoLeeftijd;
    vak: GoVak;
    lessenlijn: string;
    lessenreeks: string;
    /** De leerplandoelen uit deel 2, in volgorde. */
    doelen: string[];
    /** 'lesplannen/<code>.json'. */
    bestand: string;
    sha256: string;
  }[];
}

// ── Wat de sha256 van een bestand dekt (canoniek uit src/lib/minimumdoelen.ts) ──
// Eén plek, zodat de import (maak.ts) en de uitrolpoort (goBestanden.test.ts) hetzelfde narekenen.
export function lesplanShaInvoer(b: GoLesplanBestand): Pick<GoLesplanBestand, 'code' | 'titel' | 'leeftijd' | 'delen' | 'afgeleid'> {
  return { code: b.code, titel: b.titel, leeftijd: b.leeftijd, delen: b.delen, afgeleid: b.afgeleid };
}

export function leerplanShaInvoer(b: GoLeerplanBestand): Pick<GoLeerplanBestand, 'vak' | 'naam' | 'rubrieken' | 'doelen'> {
  return { vak: b.vak, naam: b.naam, rubrieken: b.rubrieken, doelen: b.doelen };
}

export function bijMinimumdoelShaInvoer(b: GoBijMinimumdoelBestand): Pick<GoBijMinimumdoelBestand, 'vak' | 'doelen'> {
  return { vak: b.vak, doelen: b.doelen };
}
