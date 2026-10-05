// ── Leerplannen: het gedeelde doelenregister ────────────────────────────────
//
// Eén leerplan = een lijst doelen met een stabiele CODE. Die code is de ruggen-
// graat waarlangs alles met elkaar praat: een cursussectie draagt goalCodes,
// een quizvraag draagt een goalCode, een inzending levert dus score per doel,
// en het klasoverzicht telt dat op per leerling. Vrije-teksttags (goals /
// goal) blijven bestaan voor wie geen leerplan gebruikt.

export type CurriculumNet = 'minimumdoelen' | 'go' | 'kov' | 'ovsg' | 'pov' | 'eigen';

export const CURRICULUM_NETS: { id: CurriculumNet; label: string; hint: string }[] = [
  { id: 'minimumdoelen', label: 'Minimumdoelen (Vlaamse overheid)', hint: 'onderwijsdoelen.be — de wettelijke basis voor elk net' },
  { id: 'go', label: 'GO! leerplan', hint: 'pro.g-o.be' },
  { id: 'kov', label: 'Katholiek Onderwijs Vlaanderen', hint: 'leerplannen KOV / ZILL (basis)' },
  { id: 'ovsg', label: 'OVSG (stedelijk & gemeentelijk)', hint: 'ovsg.be' },
  { id: 'pov', label: 'POV (provinciaal)', hint: 'pov.be' },
  { id: 'eigen', label: 'Eigen leerplan', hint: 'vakgroep, school of jezelf' },
];

export interface CurriculumGoal {
  id: string;
  /** Stabiele code zoals in het leerplan, bv. "WIS 2.3" of "MD 6.12". Uniek binnen het leerplan. */
  code: string;
  /** Het doel zelf, liefst letterlijk uit het leerplan. */
  text: string;
  /** Rubriek / leerlijn / thema, bv. "Getallenleer". */
  theme?: string;
  /** Basis (voor iedereen) of uitbreiding (verdieping). */
  level?: 'basis' | 'uitbreiding';
  /** Eventuele toelichting of afbakening uit het leerplan. */
  note?: string;
  /**
   * Officiële minimumdoelen waar dit leerplandoel naar verwijst (laag 1, zie
   * docs/LEERPLANNEN.md). De sleutel is set + vast nummer, nooit de code alleen:
   * een code kan binnen een set meer dan eens voorkomen.
   */
  refs?: MinimumdoelRef[];
  /** De verwijzingen zoals ze letterlijk in de bron staan, bv. "MD 09.01, MD 09.03". */
  refsBron?: string;
}

/** Verwijzing van een leerplandoel naar één officieel minimumdoel. */
export interface MinimumdoelRef {
  /** Set uit laag 1, bv. "ODS_3287". */
  set: string;
  /** Vast nummer van het doel in de API (`@id`), als tekst. Dit is de echte sleutel. */
  id: string;
  /** Code zoals in de set, bv. "09.01": voor weergave en als terugval. */
  code: string;
}

/** Hoe de doelen in Boosterz kwamen. */
export type CurriculumMethode =
  | 'officieel' // rechtstreeks uit een set minimumdoelen van laag 1
  | 'export' // een gestructureerd bestand van het net
  | 'pdf' // de officiële pdf, met de leerplanlezer
  | 'tekst' // geplakte tekst, met de leerplanlezer
  | 'ai' // door de AI omgezet (laatste redmiddel)
  | 'handmatig';

export interface CurriculumHerkomst {
  methode: CurriculumMethode;
  /** Leerplancode van het net, bv. "I-Aar-a". */
  leerplancode?: string;
  versie?: string;
  /** ISO-datum (JJJJ-MM-DD). */
  geldigVanaf?: string;
  bronUrl?: string;
  /** Bestandsnaam van de bron, bv. "Aardrijkskunde I-Aar-a.pdf". */
  bronNaam?: string;
  /** Vingerafdruk (sha-256, hex) van het bronbestand of de geplakte tekst. */
  bronSha256?: string;
  /** Tijdstip van inlezen (ms). */
  ingelezenOp: number;
}

export type ControleStatus = 'niet-gecontroleerd' | 'gecontroleerd' | 'gewijzigd';

export interface CurriculumControle {
  status: ControleStatus;
  /** Wie bevestigde (vrije naam). */
  door?: string;
  /** Tijdstip van bevestigen (ms). */
  op?: number;
  /** Vingerafdruk van de doelen bij het bevestigen; zie `doelenVingerafdruk`. */
  doelenSha256?: string;
  /** Korte samenvatting van het controlerapport, bv. "32 doelen letterlijk, 45 verwijzingen in orde". */
  samenvatting?: string;
}

export interface Curriculum {
  id: string;
  title: string;
  net: CurriculumNet;
  /** Vak, bv. "Wiskunde". */
  subject: string;
  /** Niveau, bv. "1e graad A-stroom" of "3e leerjaar". */
  level: string;
  /** Herkomst: url, documentnaam, versie/jaar. */
  source?: string;
  /** Voorbeeldmateriaal dat met de app meekomt (niet het officiële document). */
  example?: boolean;
  /**
   * 'leerplan': een officieel document (van een net of de overheid), ingelezen en
   * eventueel gecontroleerd. 'eigen': zelf gemaakt, of een gewijzigde kopie. Leeg
   * bij leerplannen van vóór versie 2: die gelden als 'eigen'.
   */
  kind?: 'leerplan' | 'eigen';
  herkomst?: CurriculumHerkomst;
  /** Ontbreekt = niet gecontroleerd. */
  controle?: CurriculumControle;
  /** Sets van laag 1 waar de verwijzingen van dit leerplan naar wijzen, bv. ["ODS_3287"]. */
  minimumdoelenSets?: string[];
  goals: CurriculumGoal[];
  createdAt: number;
  updatedAt: number;
}
