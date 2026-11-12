// Lesmateriaal voor proefles 1 van de Lichtkamer, schaduwtheater, in een 3de leerjaar (LK-7 in
// docs/basisonderwijs/LICHTKAMER-APP.md): de spiekkaart met plan B, het observatieblad en een meetblad.
//
// Alleen gegevens en twee kleine zuivere functies. Het scherm van LK-8 toont ze en drukt de spiekkaart af op één A4.
//
// Verwijzingen in plaats van overgetypte tekst:
// - oefeningen, bewijzen en foutpatronen staan hier met hun id uit manifest v1 (src/lib/basis/bewijs/lichtkamerManifest.ts,
//   pakket LK4). De tekst van een foutpatroon komt uit dat manifest;
// - een minimumdoel staat hier met zijn set en zijn vaste nummer, een leerplandoel van het GO! met zijn code. Hun tekst
//   komt letterlijk uit de gegevens van de app (public/leerplannen/minimumdoelen en public/basis/go), via vulSpiekkaart.
// lesmateriaal.test.ts kijkt elk id na, rekent de antwoorden na met de lichtlogica van deze map en telt de woorden.
//
// Het foutpatroon 'metingen-passen-niet' staat wel in het manifest, maar komt in de app niet meer voor (tolerantieVoor in
// onderzoek.ts): de spiekkaart heeft er bewust geen rij voor.
//
// Beslissingen van de eigenaar (12 november 2026): 'Waar valt de schaduw?' samen op het bord; 'Drie kaartjes' en
// 'Onderzoek' op de Chromebook; daarna de digitale check; meten op 30, 15 en 10 cm; apart of in duo, zoals de
// proefleerkracht kiest; de link via Smartschool of als QR-code op het bord; de leerplandoelen van het GO! ter info, met
// de bron; proefles 1 bewaart niets en kent geen namen.
//
// Zuiver: geen import van buiten deze map, geen DOM, geen opslag (zie zuiver.test.ts).

// ─── Types ───────────────────────────────────────────────────────────────────

/** Een id van een oefening van het moment 'einde-4de' in het manifest. */
export type LesOefening = 'waar-valt-de-schaduw' | 'drie-kaartjes' | 'onderzoek-schaduw';

/** Een leerplandoel van het GO!, ter info. De tekst en de leeftijden komen uit public/basis/go. */
export interface GoVerwijzing {
  code: string;
}

/** Een minimumdoel op de spiekkaart. De code en de tekst komen uit de set; de zin in kindertaal en 'zo zie je het' staan hier. */
export interface DoelVerwijzing {
  set: string;
  id: string;
  /** De zin in kindertaal (uit de doelkaart van het prototype). */
  kind: string;
  /** Zo zie je dat het lukt (uit de doelkaart van het prototype). Voor de lespagina; de afgedrukte spiekkaart laat het weg. */
  zie: string;
  /** Leerplandoelen van het GO! die het GO! zelf aan dit minimumdoel koppelt, ter info. */
  go: readonly GoVerwijzing[];
}

/** Waar een fase gebeurt. */
export type Plek = 'klas' | 'bord' | 'chromebook';

export interface Fase {
  /** Minuten vanaf het begin van de les. */
  van: number;
  tot: number;
  titel: string;
  plek: Plek;
  /** De oefeningen van deze fase, met hun id uit het manifest. */
  oefeningen: readonly LesOefening[];
  /** Wat de leerkracht doet, kort. */
  doe: readonly string[];
  /** Wat de leerkracht tegen de klas zegt, in kindertaal. */
  zeg?: string;
}

/** Een rij van de foutpatronen: wat je ziet, wat je zegt (kindertaal) en wat je doet. */
export interface FoutRij {
  /** Het id van het foutpatroon in het manifest; de tekst komt uit het manifest. */
  foutpatroon: string;
  /** De bewijzen in het manifest die dit foutpatroon dragen. */
  bewijzen: readonly string[];
  /** Een oefening waar je het ook ziet, al telt het daar niet als foutpatroon. */
  ookBij?: LesOefening;
  /** Wat het scherm van het kind zegt, als dat meer zegt dan de tekst van het foutpatroon. */
  zieJe?: string;
  /** Wat de leerkracht zegt, in kindertaal. */
  zeg: string;
  /** Wat de leerkracht doet. */
  doe: string;
}

export interface PlanBRij {
  storing: string;
  doe: string;
}

/** De sleutel om snel na te kijken. */
export interface Antwoord {
  /** Een oefening of 'check'. */
  waar: LesOefening | 'check';
  /** Bewijzen in het manifest waar dit antwoord bij hoort. */
  bewijzen: readonly string[];
  regels: readonly string[];
}

export interface Spiekkaart {
  titel: string;
  ondertitel: string;
  /** De noot voor het 3de leerjaar (prototype, lichtkamer.html r. 988, ingekort). */
  noot: string;
  doelen: readonly DoelVerwijzing[];
  materiaal: string;
  fasen: readonly Fase[];
  antwoorden: readonly Antwoord[];
  fouten: readonly FoutRij[];
  planB: readonly PlanBRij[];
  /** De regel bij de leerplandoelen van het GO!. De bronvermelding zelf is bronvermeldingLeerplan(goVak) uit src/lib/basis/go/types.ts. */
  goTerInfo: { zin: string; goVak: 'WT' };
}

/** Een veld op het observatieblad. `regels` is het aantal schrijflijnen op papier. */
export type ObservatieVeld =
  | { soort: 'regels'; vraag: string; regels: number }
  | { soort: 'keuze'; vraag: string; opties: readonly string[]; /** Er komt een lijn 'anders: ...' bij. */ anders?: true }
  | { soort: 'getal'; vraag: string }
  /** Een tabel met de fasen van de spiekkaart: gepland, echt (minuten) en een opmerking. */
  | { soort: 'tijden'; vraag: string }
  /** Turven per foutpatroon van de spiekkaart (de ids van de rijen, in dezelfde volgorde). */
  | { soort: 'turven'; vraag: string; foutpatronen: readonly string[] };

/** Waarover een blok gaat; de vijf soorten haperingen uit de opdracht, plus algemeen. */
export type ObservatieOnderwerp = 'algemeen' | 'tijd' | 'toestel' | 'link' | '3d' | 'oefening' | 'gemist';

export interface ObservatieBlok {
  titel: string;
  onderwerp: ObservatieOnderwerp;
  velden: readonly ObservatieVeld[];
}

export interface Observatieblad {
  titel: string;
  ondertitel: string;
  /** Staat bovenaan, goed zichtbaar. */
  geenNamen: string;
  blokken: readonly ObservatieBlok[];
}

export interface Meetblad {
  titel: string;
  /** Voor de leerkracht, niet voor het kind: wanneer en hoe. */
  noot: string;
  onderzoeksvraag: string;
  jeVerandert: string;
  jeHoudtGelijk: string;
  stappen: readonly string[];
  hypothesen: readonly string[];
  /** De afstanden van de meettabel, in centimeters. */
  afstanden: readonly number[];
  kolomAfstand: string;
  kolomHoogte: string;
  conclusies: readonly string[];
}

// ─── Gemeenschappelijk ───────────────────────────────────────────────────────

/** De namen van de oefeningen zoals op de tegels van het kindscherm. */
export const OEFENING_TITEL: Readonly<Record<LesOefening, string>> = {
  'waar-valt-de-schaduw': 'Waar valt de schaduw?',
  'drie-kaartjes': 'Drie kaartjes',
  'onderzoek-schaduw': 'Onderzoek',
};

const SET = 'ODS_3408';

// ─── De spiekkaart ───────────────────────────────────────────────────────────

const FASEN: readonly Fase[] = [
  {
    van: 0,
    tot: 5,
    titel: 'Start met echt materiaal',
    plek: 'klas',
    oefeningen: [],
    doe: ['Zet een zaklamp en een kartonnen boompje voor het bord. Eerst voorspellen, dan schijnen.'],
    zeg: 'Waar komt de schaduw, denk je? Wijs maar.',
  },
  {
    van: 5,
    tot: 20,
    titel: 'Samen op het bord',
    plek: 'bord',
    oefeningen: ['waar-valt-de-schaduw'],
    doe: [
      'Drie rondes. Open de klasvraag: iedereen toont A, B of C met de vingers. Tik de keuze van de klas aan en toon de schaduw en de lichtstralen.',
      'Na de uitkomst: tik op Volgende ronde. Druk niet op PageDown: dat opent een andere oefening.',
    ],
    zeg: 'Eerst voorspellen, dan kijken. A, B of C?',
  },
  {
    van: 20,
    tot: 40,
    titel: 'Op de Chromebook, apart of in duo',
    plek: 'chromebook',
    oefeningen: ['drie-kaartjes', 'onderzoek-schaduw'],
    doe: [
      'Link: Smartschool of de QR-code op het bord. Geen naam nodig.',
      'Drie kaartjes: tot het scherm zegt: Ook schuin lukt het!',
      'Onderzoek: hypothese, meten op 30, 15 en 10 cm, het getal typen (komma of punt), conclusie, Mijn onderzoek nakijken.',
      'Wie klaar is, test met echte kaartjes.',
    ],
    zeg: 'Je hypothese is wat jij denkt vóór je meet. Ze mag fout zijn.',
  },
  {
    van: 40,
    tot: 45,
    titel: 'Check',
    plek: 'chromebook',
    oefeningen: [],
    doe: ['Drie prentvragen. Het eerste antwoord telt: help niet.', 'Daarna Wat ik al kan: kijk mee.'],
  },
  {
    van: 45,
    tot: 50,
    titel: 'Nabespreking op het bord',
    plek: 'bord',
    oefeningen: [],
    doe: ['Goed antwoord: licht gaat rechtdoor, het voorwerp houdt het tegen, daarachter komt geen licht.'],
    zeg: 'Waarom valt de schaduw aan de andere kant dan de lamp?',
  },
];

const ANTWOORDEN: readonly Antwoord[] = [
  {
    waar: 'waar-valt-de-schaduw',
    bewijzen: ['4-voorspel'],
    regels: ['Ronde 1: A. Ronde 2: B. Ronde 3: C, bijna recht achter het voorwerp: de lamp staat ver en maar een beetje rechts. Wie C kiest: vraag waarom. A is de goede kant, maar te ver. B is de kant van de lamp.'],
  },
  {
    waar: 'drie-kaartjes',
    bewijzen: ['4-kaartjes'],
    regels: ['Gaatje 1 zit bij de lamp. Schuin lukt met de lamp heel hoog (gaatje 1, 2, 3: hoog, midden, laag) of heel laag (laag, midden, hoog).'],
  },
  {
    waar: 'onderzoek-schaduw',
    bewijzen: ['4-meten', '4-besluit'],
    regels: [
      'Goed, boompje of huisje: 30 cm: 11-12, 15 cm: 13-14, 10 cm: 14,5-15,5.',
      'Kartonnen kind: 30 cm: 11-12, 15 cm: 12,5-13,5, 10 cm: 14-15.',
      'Conclusie: hoe dichter de zaklamp, hoe groter de schaduw.',
    ],
  },
  {
    waar: 'check',
    bewijzen: ['4c1', '4c2', '4c3'],
    regels: ['Vraag 1: C. Vraag 2: groter. Vraag 3: A.'],
  },
];

const FOUTEN: readonly FoutRij[] = [
  {
    foutpatroon: 'schaduw-kant-lamp',
    bewijzen: ['4-voorspel', '4c1'],
    zeg: 'Licht gaat rechtdoor. Volg de lijn van de lamp langs het boompje. De schaduw valt aan de andere kant.',
    doe: 'Tik op Lichtstralen tonen.',
  },
  {
    foutpatroon: 'schaduw-recht-achter',
    bewijzen: ['4c1'],
    ookBij: 'waar-valt-de-schaduw',
    zeg: 'Staat de lamp opzij, dan schuift de schaduw naar de andere kant.',
    doe: 'Zet de echte zaklamp links, dan rechts.',
  },
  {
    foutpatroon: 'kleiner-als-dichter',
    bewijzen: ['4c2'],
    zeg: 'Bij welke afstand was je schaduw het grootst?',
    doe: 'Kom met de echte zaklamp dichterbij.',
  },
  {
    foutpatroon: 'afstand-maakt-niet-uit',
    bewijzen: ['4c2'],
    zeg: 'Waren je drie metingen even groot?',
    doe: 'Leg de metingen naast elkaar.',
  },
  {
    foutpatroon: 'gaatjes-even-hoog',
    bewijzen: ['4c3'],
    ookBij: 'drie-kaartjes',
    zeg: 'Het hoeft niet even hoog. Lamp en gaatjes moeten op één rechte lijn liggen.',
    doe: 'Lamp heel hoog, dan Lichtstralen tonen.',
  },
  {
    foutpatroon: 'licht-maakt-bocht',
    bewijzen: ['4c3'],
    zeg: 'Licht maakt geen bocht. Het gaat rechtdoor.',
    doe: 'Probeer met echte kaartjes en een zaklamp.',
  },
  {
    foutpatroon: 'meetlat-onnauwkeurig',
    bewijzen: ['4-meten'],
    zieJe: 'Kijk de meting bij ... cm nog eens na.',
    zeg: 'Staat de lamp juist? Lees de top van de schaduw af. Een streepje is een halve centimeter.',
    doe: 'Zet de lamp samen op die afstand en lees de top samen af.',
  },
  {
    foutpatroon: 'conclusie-past-niet',
    bewijzen: ['4-besluit'],
    zieJe: 'Kijk naar je metingen.',
    zeg: 'Waar is je schaduw het grootst? Welke zin past daarbij?',
    doe: 'Wijs de meting bij 10 cm aan.',
  },
];

const PLAN_B: readonly PlanBRij[] = [
  { storing: 'De kijkdoos laadt niet', doe: 'Werk met de echte zaklamp, het boompje, de kaartjes en het meetblad. De check werkt wel.' },
  { storing: 'Tik om de kijkdoos opnieuw te laden', doe: 'Tik erop en wacht even.' },
  { storing: 'De link opent niet', doe: 'Toon de QR-code op het bord, of zet de link in Smartschool. Opent hij nergens: werk met echt materiaal en het meetblad.' },
  { storing: 'Het netwerk valt weg', doe: 'Gebruik alleen het bord. Kaartjes en meten met echt materiaal en het meetblad. Opent de app nog op de Chromebooks, doe dan de check.' },
  { storing: 'Een Chromebook valt uit', doe: 'In duo werken.' },
  { storing: 'Een kind zit vast', doe: 'Tik op Lichtstralen tonen, of laat een kind meekijken dat het al kan.' },
  { storing: 'Je komt tijd tekort', doe: 'Doe zeker de check en de vraag van de nabespreking.' },
];

export const SPIEKKAART: Spiekkaart = {
  titel: 'Lichtkamer: schaduwtheater',
  ondertitel: 'Spiekkaart proefles 1, 3de leerjaar, 50 minuten. Geen namen, niets bewaard.',
  noot: 'Je werkt naar deze doelen toe. Ze gelden voor het einde van het 4de leerjaar.',
  doelen: [
    {
      set: SET,
      id: '92767',
      kind: 'Ik weet dat licht in een rechte lijn gaat. Zo kan ik voorspellen waar een schaduw komt.',
      zie: 'Het kind voorspelt waar een schaduw valt en zet de gaatjes van drie kaartjes op één rechte lijn met de lamp.',
      go: [{ code: 'WT.343' }, { code: 'WT.348' }],
    },
    {
      set: SET,
      id: '92775',
      kind: 'Ik voer een onderzoek uit en verander maar één ding.',
      zie: 'Het kind voert het klaargezette onderzoek uit en verandert alleen de afstand.',
      go: [{ code: 'WT.407' }, { code: 'WT.408' }],
    },
    {
      set: SET,
      id: '92777',
      kind: 'Ik noteer wat ik meet en zeg wat ik ontdekt heb.',
      zie: 'Het kind vult de meettabel juist in en kiest de conclusie die bij de metingen past.',
      go: [{ code: 'WT.402' }],
    },
  ],
  materiaal: 'Zaklampen, kartonnen boompjes, kaartjes met een gaatje, een meetlat, wit karton als scherm, het meetblad.',
  fasen: FASEN,
  antwoorden: ANTWOORDEN,
  fouten: FOUTEN,
  planB: PLAN_B,
  goTerInfo: {
    zin: 'Ter info: leerplandoelen die het GO! zelf aan deze doelen koppelt. Het GO! voorziet deze les niet zo. Voor 8-9 jaar koppelt het GO! geen doel over schaduw aan 92767.',
    goVak: 'WT',
  },
};

// ─── Het observatieblad ──────────────────────────────────────────────────────

export const OBSERVATIEBLAD: Observatieblad = {
  titel: 'Observatieblad proefles 1',
  ondertitel: 'Lichtkamer: schaduwtheater, 3de leerjaar. Vul in tijdens en vlak na de les.',
  geenNamen: 'Schrijf geen namen van kinderen. Tel of beschrijf: "4 duo\'s", "een paar kinderen", "één kind".',
  blokken: [
    {
      titel: 'De klas',
      onderwerp: 'algemeen',
      velden: [
        { soort: 'getal', vraag: 'Aantal kinderen' },
        { soort: 'keuze', vraag: 'Zo werkten ze', opties: ['apart', 'in duo', 'gemengd'] },
      ],
    },
    {
      titel: 'Tijd',
      onderwerp: 'tijd',
      velden: [
        { soort: 'tijden', vraag: 'Hoe lang duurde elke fase?' },
        { soort: 'regels', vraag: 'Waar liep je uit, of had je tijd over?', regels: 2 },
      ],
    },
    {
      titel: 'Toestel',
      onderwerp: 'toestel',
      velden: [
        { soort: 'keuze', vraag: 'De Chromebooks', opties: ['eigen account', 'toestel uit de kar'], anders: true },
        { soort: 'regels', vraag: 'Wat haperde aan een toestel? (aanmelden, batterij, scherm, toetsenbord)', regels: 2 },
      ],
    },
    {
      titel: 'Link',
      onderwerp: 'link',
      velden: [
        { soort: 'keuze', vraag: 'De link kwam via', opties: ['Smartschool', 'QR-code op het bord'], anders: true },
        { soort: 'getal', vraag: 'Hoeveel toestellen openden de link niet meteen?' },
        { soort: 'regels', vraag: 'Wat liep er mis met de link?', regels: 1 },
      ],
    },
    {
      titel: '3D',
      onderwerp: '3d',
      velden: [
        { soort: 'keuze', vraag: 'Op het bord liep de kijkdoos', opties: ['vlot', 'traag', 'niet'] },
        { soort: 'keuze', vraag: 'Op de Chromebooks liep de kijkdoos', opties: ['vlot', 'traag', 'niet'] },
        { soort: 'keuze', vraag: 'Stand op de Chromebooks', opties: ['hoog', 'midden', 'laag', 'weet niet'] },
        { soort: 'regels', vraag: 'Moest een kijkdoos opnieuw laden? Wat zag je?', regels: 1 },
      ],
    },
    {
      titel: 'Oefeningen',
      onderwerp: 'oefening',
      velden: [
        { soort: 'turven', vraag: 'Welke fouten zag je? Zet een streepje per keer.', foutpatronen: FOUTEN.map((f) => f.foutpatroon) },
        { soort: 'regels', vraag: 'Waar liepen kinderen vast? Bij welke oefening, bij welke stap?', regels: 2 },
        { soort: 'regels', vraag: 'Wat lukte goed?', regels: 2 },
      ],
    },
    {
      titel: 'Wat je miste',
      onderwerp: 'gemist',
      velden: [
        { soort: 'regels', vraag: 'Wat moest je improviseren? Welke rij van plan B gebruikte je?', regels: 2 },
        { soort: 'regels', vraag: 'Wat miste je op de spiekkaart of in de app?', regels: 2 },
        { soort: 'regels', vraag: 'Wat had je nodig om achteraf te zien wie welk doel haalde?', regels: 2 },
      ],
    },
  ],
};

// ─── Het meetblad (plan B, of voor wie klaar is) ─────────────────────────────

export const MEETBLAD: Meetblad = {
  titel: 'Mijn onderzoek: lamp dichterbij, schaduw groter?',
  noot: 'Voor plan B, of voor wie klaar is: meten met een echte zaklamp, een boompje, wit karton en een meetlat. Geen naam nodig. De getallen kunnen anders zijn dan in de app. De conclusie is dezelfde als de zaklamp lager staat dan de top van het boompje.',
  onderzoeksvraag: 'Wordt de schaduw van het boompje groter als de zaklamp dichterbij staat?',
  jeVerandert: 'de afstand tussen zaklamp en boompje.',
  jeHoudtGelijk: 'de zaklamp, de hoogte van de zaklamp, het boompje en het scherm.',
  stappen: [
    'Kies je hypothese. Wat denk jij, vóór je meet?',
    'Zet het scherm 10 cm achter het boompje. Zet de meetlat rechtop tegen het scherm. Leg de zaklamp plat op tafel: zo staat hij lager dan de top van het boompje.',
    'Zet de voorkant van de zaklamp op 30 cm van het boompje. Meet hoe hoog de schaduw op het scherm komt. Schrijf het op.',
    'Doe hetzelfde op 15 cm en op 10 cm.',
    'Kies je conclusie. Wat zeggen je metingen?',
  ],
  hypothesen: ['De schaduw wordt groter.', 'De schaduw wordt kleiner.', 'De schaduw blijft even groot.'],
  afstanden: [30, 15, 10],
  kolomAfstand: 'Afstand zaklamp – boompje',
  kolomHoogte: 'Hoogte schaduw (cm)',
  conclusies: ['Hoe dichter de zaklamp, hoe groter de schaduw.', 'Hoe dichter de zaklamp, hoe kleiner de schaduw.', 'De afstand maakt niets uit.'],
};

// ─── Teksten invullen uit de gegevens ────────────────────────────────────────

/** Wat vulSpiekkaart nodig heeft om de teksten letterlijk op te halen. Het scherm geeft de geladen gegevens mee. */
export interface LesmateriaalBronnen {
  /** Code en tekst (zonder opmaak) van een minimumdoel, of undefined. */
  minimumdoel(set: string, id: string): { code: string; tekst: string } | undefined;
  /** Tekst en leeftijden van een leerplandoel van het GO! zoals het GO! het bij dit minimumdoel zet, of undefined. */
  goBijMinimumdoel(id: string, code: string): { tekst: string; leeftijden: readonly string[] } | undefined;
  /** De tekst van een foutpatroon in het manifest, of undefined. */
  foutpatroon(id: string): string | undefined;
}

export interface GevuldDoel extends DoelVerwijzing {
  code: string;
  tekst: string;
  goDoelen: readonly { code: string; tekst: string; leeftijden: readonly string[] }[];
}

export interface GevuldeFoutRij extends FoutRij {
  tekst: string;
}

export interface GevuldeSpiekkaart extends Omit<Spiekkaart, 'doelen' | 'fouten'> {
  doelen: readonly GevuldDoel[];
  fouten: readonly GevuldeFoutRij[];
}

/**
 * De spiekkaart met de teksten van de doelen en de foutpatronen erin, letterlijk uit de bronnen. Ontbreekt er één, dan
 * komt er een fout in `fouten` en geen verzonnen tekst: het scherm toont dan de spiekkaart niet half.
 */
export function vulSpiekkaart(kaart: Spiekkaart, bronnen: LesmateriaalBronnen): { kaart: GevuldeSpiekkaart | null; fouten: string[] } {
  const fouten: string[] = [];
  const doelen: GevuldDoel[] = kaart.doelen.map((d) => {
    const md = bronnen.minimumdoel(d.set, d.id);
    if (!md) fouten.push(`Minimumdoel ${d.id} staat niet in ${d.set}.`);
    const goDoelen = d.go.map((g) => {
      const gd = bronnen.goBijMinimumdoel(d.id, g.code);
      if (!gd) fouten.push(`Het GO! koppelt ${g.code} niet aan ${d.id}.`);
      return { code: g.code, tekst: gd?.tekst ?? '', leeftijden: gd?.leeftijden ?? [] };
    });
    return { ...d, code: md?.code ?? '', tekst: md?.tekst ?? '', goDoelen };
  });
  const rijen: GevuldeFoutRij[] = kaart.fouten.map((f) => {
    const tekst = bronnen.foutpatroon(f.foutpatroon);
    if (tekst === undefined) fouten.push(`Foutpatroon ${f.foutpatroon} staat niet in het manifest.`);
    return { ...f, tekst: tekst ?? '' };
  });
  return { kaart: fouten.length ? null : { ...kaart, doelen, fouten: rijen }, fouten };
}

/** Alle tekst die op de afgedrukte spiekkaart komt, in leesvolgorde (voor het tellen van de woorden en voor tests). */
export function tekstenVanSpiekkaart(k: GevuldeSpiekkaart): string[] {
  const uit: string[] = [k.titel, k.ondertitel, 'Doelen', k.noot];
  for (const d of k.doelen) uit.push(`${d.id} ${d.code}`, d.tekst, d.kind);
  uit.push('Materiaal', k.materiaal, 'Lesverloop');
  for (const f of k.fasen) {
    uit.push(`${f.van}-${f.tot} min ${f.titel}`, ...f.oefeningen.map((o) => OEFENING_TITEL[o]), ...f.doe);
    if (f.zeg) uit.push(`Zeg: ${f.zeg}`);
  }
  uit.push('Antwoorden');
  for (const a of k.antwoorden) uit.push(a.waar === 'check' ? 'Check' : OEFENING_TITEL[a.waar], ...a.regels);
  uit.push('Als het misloopt bij een kind', 'Wat je ziet', 'Zeg', 'Doe');
  for (const f of k.fouten) uit.push(f.tekst, ...(f.zieJe ? [`Het scherm zegt: ${f.zieJe}`] : []), f.zeg, f.doe);
  uit.push('Plan B', 'Storing', 'Wat je doet');
  for (const p of k.planB) uit.push(p.storing, p.doe);
  uit.push(k.goTerInfo.zin);
  for (const d of k.doelen) for (const g of d.goDoelen) uit.push(`${g.code} (${leeftijdBereik(g.leeftijden)} jaar) ${g.tekst}`);
  return uit;
}

/**
 * De leeftijden van een leerplandoel kort: ['4-5', '5-6', '6-7', '7-8'] wordt '4-8'. Alleen als ze aaneensluiten; anders
 * staan ze er allemaal, met komma's.
 */
export function leeftijdBereik(leeftijden: readonly string[]): string {
  const delen = leeftijden.map((l) => l.split('-'));
  const aaneen = delen.every((d, i) => d.length === 2 && (i === 0 || d[0] === delen[i - 1]?.[1]));
  if (!aaneen || delen.length < 2) return leeftijden.join(', ');
  return `${delen[0]?.[0] ?? ''}-${delen[delen.length - 1]?.[1] ?? ''}`;
}

/** Het aantal woorden in een lijst teksten. */
export function telWoorden(teksten: readonly string[]): number {
  return teksten.reduce((n, t) => n + t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length, 0);
}
