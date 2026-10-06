// ── Kern-datamodellen van Boosterz ─────────────────────────────────────

export type WidgetTypeId =
  | 'quiz'
  | 'worksheet'
  | 'exitticket'
  | 'flashcards'
  | 'crossword'
  | 'wordsearch'
  | 'memory'
  | 'hangman'
  | 'pairs'
  | 'timeline'
  | 'hotspot'
  | 'whiteboard'
  | 'spinner'
  | 'bingo'
  | 'arithmetic'
  | 'dictation'
  | 'poll'
  | 'checklist'
  | 'timer'
  | 'scramble'
  | 'splitworksheet'
  | 'videoquiz'
  | 'splitwhiteboard'
  | 'jigsaw'
  | 'spotdifference'
  | 'carousel'
  | 'imageviewer'
  | 'beforeafter'
  | 'framesequence'
  | 'tiptiles'
  | 'randomimages'
  | 'mediaplayer'
  | 'activeplot'
  | 'chart'
  | 'webquest'
  | 'mindmap'
  | 'planner'
  | 'piano';

export type WidgetCategory = 'test' | 'game' | 'picture' | 'math' | 'classroom';

/** Gedeelde instellingen die voor (bijna) elke widget gelden. */
export interface WidgetSettings {
  /** Kleuraccent van de widget in spelersweergave. */
  accentColor: string;
  /** Vragen/kaarten in willekeurige volgorde tonen. */
  shuffle: boolean;
  /** Feedback (juiste antwoorden) tonen na indienen. */
  showFeedback: boolean;
  /** Score tonen aan de leerling na indienen. */
  showScore: boolean;
  /** Tijdslimiet in minuten (0 = geen). */
  timeLimitMin: number;
  /** Maximaal aantal pogingen (0 = onbeperkt). */
  maxAttempts: number;
  /** Naam van de leerling verplicht vóór start. */
  requireName: boolean;
  /** Instructietekst die vóór het starten getoond wordt. */
  instructions: string;
  /** Toetsmodus: volledig scherm vragen en focusverlies registreren. */
  examMode?: boolean;
  /** Na dit tijdstip (ISO-string) kan de widget niet meer gestart worden. */
  expiresAt?: string;
}

export interface Widget<TConfig = unknown> {
  id: string;
  type: WidgetTypeId;
  title: string;
  folderId: string | null;
  config: TConfig;
  settings: WidgetSettings;
  /** Korte deelcode, bv. "K7P2QD". */
  code: string;
  createdAt: number;
  updatedAt: number;
  /** Leerplan waaraan de vragen gekoppeld zijn (goalCode-lookup). */
  curriculumId?: string;
}

export interface Folder {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface ItemScore {
  earned: number;
  max: number;
  /** 'auto' = automatisch beoordeeld, 'manual' = door leerkracht, 'pending' = wacht op leerkracht */
  mode: 'auto' | 'manual' | 'pending';
  comment?: string;
}

export interface Submission {
  id: string;
  widgetId: string;
  widgetCode: string;
  studentName: string;
  startedAt: number;
  submittedAt: number;
  durationSec: number;
  /** Antwoorden per item-id; vorm is widget-specifiek. */
  answers: Record<string, unknown>;
  /** Score per item-id; null voor widgets zonder score. */
  itemScores: Record<string, ItemScore> | null;
  totalEarned: number;
  totalMax: number;
  status: 'submitted' | 'graded';
  teacherFeedback?: string;
  /** Aantal keren dat de leerling het venster verliet (toetsmodus). */
  focusLosses?: number;
  /** Klas en leerling uit de klaslijst, als de leerling via een klascode werkte. */
  classId?: string;
  studentId?: string;
}

// ── Quiz / werkblad / exitticket ────────────────────────────────────────────

export type QuestionType =
  | 'mc'        // meerkeuze, één juist
  | 'multi'     // meerkeuze, meerdere juist
  | 'tf'        // juist/onjuist
  | 'short'     // kort antwoord (tekst)
  | 'long'      // open vraag (lang, manueel beoordeeld)
  | 'gap'       // invuloefening (gaten in tekst)
  | 'match'     // koppelparen
  | 'order'     // rangschikken
  | 'number'    // numeriek antwoord
  | 'slider'    // schaal/schuiver
  | 'info'      // infoblok (geen vraag)
  // ── uitgebreide vraagtypes (src/widgets/qtypes/) ──
  | 'dropdown'  // zin(nen) met keuzelijstjes
  | 'rating'    // beoordeling met sterren
  | 'likert'    // stellingenmatrix (bv. oneens → eens)
  | 'upload'    // bestand inleveren (manueel beoordeeld)
  | 'marktext'  // markeer de juiste woorden in een tekst
  | 'sort'      // sorteer items in de juiste categorie
  | 'imagepoint'// klik de juiste plek(ken) aan op een afbeelding
  | 'table';    // invultabel (cellen aanvullen)

export interface QuestionBase {
  id: string;
  type: QuestionType;
  prompt: string;
  /** Afbeelding als data-URL of extern adres. */
  imageUrl?: string;
  /** Beschrijving van de afbeelding voor wie ze niet ziet (alt-tekst); leeg = versiering. */
  imageAlt?: string;
  points: number;
  /** Uitleg die bij feedback getoond wordt. */
  explanation?: string;
  /** Optionele hulp die de leerling zelf kan openvouwen (scaffolding). */
  hint?: string;
  /**
   * Hintladder: oplopende hulpstappen (strategie → aanwijzing → voorbeeld).
   * Heeft voorrang op het oudere enkelvoudige hint-veld.
   */
  hints?: string[];
  /** Leerdoel waar deze vraag bij hoort (vrije tekst, voor score-per-doel). */
  goal?: string;
  /** Code van een leerplandoel (zie lib/curriculumTypes.ts), bv. "WIS 2.3". */
  goalCode?: string;
  /** Niveaulaag voor routes binnen één widget. */
  level?: 'basis' | 'kern' | 'uitbreiding';
  /** Steuntaalversie van de vraag (vertaling/eenvoudiger taal); standaard verborgen. */
  support?: string;
}

export interface MCQuestion extends QuestionBase {
  type: 'mc';
  options: string[];
  correctIndex: number;
}
export interface MultiQuestion extends QuestionBase {
  type: 'multi';
  options: string[];
  correctIndices: number[];
}
export interface TFQuestion extends QuestionBase {
  type: 'tf';
  answer: boolean;
}
export interface ShortQuestion extends QuestionBase {
  type: 'short';
  /** Meerdere juiste antwoorden toegelaten. */
  accepted: string[];
  caseSensitive: boolean;
  /**
   * Accenten tellen mee (é ≠ e). Opt-in: standaard is de verbetering soepel
   * voor accenten. Staat los van caseSensitive.
   */
  accentSensitive?: boolean;
}
export interface LongQuestion extends QuestionBase {
  type: 'long';
  /** Verwachte modelantwoord (alleen voor de leerkracht). */
  modelAnswer?: string;
  /** Beoordelingsrubric: criteria met maximumpunten (som ≤ points). */
  rubric?: { criterion: string; points: number }[];
  /** Leerling mag ook tekenen als antwoordvorm. */
  allowDraw?: boolean;
  /** Leerling mag ook een audio-antwoord inspreken. */
  allowAudio?: boolean;
}

/** Antwoordvorm van een open vraag met meerdere modaliteiten. */
export interface LongAnswerValue {
  tekst?: string;
  /** Tekening als data-URL (jpeg). */
  tekening?: string;
  /** Audio-opname als data-URL (webm/ogg). */
  audio?: string;
}
export interface GapQuestion extends QuestionBase {
  type: 'gap';
  /** Tekst met gaten tussen [vierkante haken], bv. "De hoofdstad van Frankrijk is [Parijs]." */
  text: string;
}
export interface MatchQuestion extends QuestionBase {
  type: 'match';
  pairs: { left: string; right: string }[];
}
export interface OrderQuestion extends QuestionBase {
  type: 'order';
  /** Items in de juiste volgorde. */
  items: string[];
}
export interface NumberQuestion extends QuestionBase {
  type: 'number';
  answer: number;
  tolerance: number;
}
export interface SliderQuestion extends QuestionBase {
  type: 'slider';
  min: number;
  max: number;
  step: number;
  answer: number;
  /** Marge waarbinnen het antwoord juist gerekend wordt. */
  tolerance: number;
}
export interface InfoBlock extends QuestionBase {
  type: 'info';
}

// ── Uitgebreide vraagtypes (implementatie in src/widgets/qtypes/) ───────────

export interface DropdownQuestion extends QuestionBase {
  type: 'dropdown';
  /** Zin(nen) met keuzelijstjes: "De hoofdstad is {Brussel|Antwerpen|Gent}" — eerste optie is juist. */
  text: string;
  /** Afleiders per gat door elkaar tonen. */
  shuffle: boolean;
}
export interface RatingQuestion extends QuestionBase {
  type: 'rating';
  /** Aantal sterren (3–10). Niet automatisch beoordeeld (mening). */
  scale: number;
  labelLow?: string;
  labelHigh?: string;
}
export interface LikertQuestion extends QuestionBase {
  type: 'likert';
  /** Stellingen die elk op dezelfde schaal beoordeeld worden. */
  statements: { id: string; text: string }[];
  /** Schaalpunten, bv. ["Helemaal oneens", "Oneens", "Neutraal", "Eens", "Helemaal eens"]. */
  options: string[];
}
export interface UploadQuestion extends QuestionBase {
  type: 'upload';
  /** Toegelaten extensies als hint, bv. ".pdf, .docx" (leeg = alles). */
  accept?: string;
  /** Maximale bestandsgrootte in MB (opslag is beperkt; standaard 2). */
  maxMb: number;
}
export interface MarkTextQuestion extends QuestionBase {
  type: 'marktext';
  /** Tekst waarin de leerling woorden aanklikt; juiste woorden staan tussen [vierkante haken]. */
  text: string;
  /** Punten aftrekken voor fout gemarkeerde woorden. */
  penalizeWrong: boolean;
}
export interface SortQuestion extends QuestionBase {
  type: 'sort';
  categories: { id: string; name: string }[];
  items: { id: string; text: string; categoryId: string }[];
}
export interface ImagePointQuestion extends QuestionBase {
  type: 'imagepoint';
  /** Afbeelding waarop geklikt wordt (data-URL of extern adres). */
  image: string;
  /** Juiste zones als relatieve cirkels (x/y/r in % van de afbeelding). */
  targets: { id: string; x: number; y: number; r: number; label?: string }[];
  /** Hoeveel klikken de leerling mag zetten (meestal = aantal zones). */
  maxClicks: number;
}
export interface TableQuestion extends QuestionBase {
  type: 'table';
  /** Kolomkoppen. */
  columns: string[];
  /** Rijen; lege cel ('') = invulveld voor de leerling, met het juiste antwoord in answers. */
  rows: { id: string; cells: string[]; answers: (string | null)[] }[];
  caseSensitive: boolean;
}

export type Question =
  | MCQuestion | MultiQuestion | TFQuestion | ShortQuestion | LongQuestion
  | GapQuestion | MatchQuestion | OrderQuestion | NumberQuestion
  | SliderQuestion | InfoBlock
  | DropdownQuestion | RatingQuestion | LikertQuestion | UploadQuestion
  | MarkTextQuestion | SortQuestion | ImagePointQuestion | TableQuestion;

export interface QuizConfig {
  questions: Question[];
  /** 'single' = één vraag per scherm, 'scroll' = alles onder elkaar. */
  layout: 'single' | 'scroll';
  /** Vraag per vraag naar de zekerheid van de leerling (kalibratie). */
  askConfidence?: boolean;
  /** Trek per leerling n willekeurige vragen uit de pool (0/undefined = alle vragen). */
  drawCount?: number;
  /**
   * Getrapte feedback (alleen bij layout 'single'): de leerling controleert per
   * vraag; bij een fout eerst de hint en een tweede kans, pas daarna de oplossing.
   */
  stepCheck?: boolean;
  /** Niveauroutes aanbieden op basis van de level-tags van de vragen. */
  useRoutes?: boolean;
  /** Klikbaar begrippenglossarium: schooltaalwoorden met korte uitleg. */
  glossary?: { term: string; uitleg: string }[];
}

// ── Overige widget-configuraties ────────────────────────────────────────────

export interface Flashcard { id: string; front: string; back: string; frontImage?: string; backImage?: string }
export interface FlashcardsConfig { cards: Flashcard[]; autoFlipSec: number }

export interface CrosswordEntry { id: string; word: string; clue: string }
export interface CrosswordConfig { entries: CrosswordEntry[] }

export interface WordsearchConfig { words: string[]; size: number; allowDiagonal: boolean; allowReverse: boolean }

export interface MemoryPair { id: string; a: string; b: string; aImage?: string; bImage?: string }
export interface MemoryConfig { pairs: MemoryPair[] }

export interface HangmanConfig { words: { word: string; hint: string }[]; maxErrors: number }

export interface PairsConfig { pairs: { id: string; left: string; right: string }[] }

export interface TimelineEvent { id: string; date: string; title: string; description?: string; imageUrl?: string }
export interface TimelineConfig { events: TimelineEvent[]; mode: 'view' | 'exercise' }

export interface HotspotPoint { id: string; x: number; y: number; label: string; description?: string }
export interface HotspotConfig { imageUrl: string; hotspots: HotspotPoint[]; mode: 'explore' | 'quiz' }

export interface WhiteboardConfig { backgroundImageUrl?: string; prompt: string }

export interface SpinnerConfig { items: string[]; removeAfterSpin: boolean }

export interface BingoConfig { items: string[]; size: 3 | 4 | 5; freeCenter: boolean }

export type ArithmeticOp = 'add' | 'sub' | 'mul' | 'div';
export interface ArithmeticConfig {
  ops: ArithmeticOp[];
  min: number;
  max: number;
  count: number;
  /** Tafels-modus: vermenigvuldigen met vaste tafels. */
  tables: number[];
}

export interface DictationConfig {
  sentences: { id: string; text: string; hint?: string }[];
  lang: string;
  rate: number;
  /** Streng verbeteren: hoofdletters en accenten tellen mee (leestekens nooit). */
  strict?: boolean;
}

export interface PollConfig {
  question: string;
  options: string[];
  allowMultiple: boolean;
  showResults: boolean;
}

export interface ChecklistConfig { items: { id: string; text: string }[]; title: string }

export interface TimerConfig { minutes: number; seconds: number; label: string; sound: boolean }

export interface ScrambleConfig {
  mode: 'word' | 'sentence';
  items: { id: string; text: string; hint?: string }[];
}

export interface WorksheetConfig extends QuizConfig {}
export interface ExitTicketConfig extends QuizConfig {}

// ── Bronpaneel (voor gesplitste widgets) ────────────────────────────────────

export interface SourcePane {
  kind: 'text' | 'image' | 'video' | 'pdf';
  /** Bron als tekst (mag meerdere alinea's bevatten). */
  text?: string;
  imageUrl?: string;
  /** YouTube- of Vimeo-URL. */
  videoUrl?: string;
  /** Geüploade pdf: verwijzing naar IndexedDB (zie lib/pdfStore). Staat alleen op het toestel van de upload. */
  pdfId?: string;
  /** Externe pdf-URL — werkt op elk toestel; ook terugval als de upload ontbreekt. */
  pdfUrl?: string;
  /** Bestandsnaam van de geüploade pdf (weergave). */
  pdfName?: string;
  /**
   * Markeerlegende voor de leerling (markeerstiften in de pdf), bv.
   * geel = hoofdtitel. Leeg of undefined = geen markeeropdracht.
   */
  highlightPalette?: { color: string; label: string }[];
  title?: string;
}

export interface SplitWorksheetConfig {
  source: SourcePane;
  questions: Question[];
}

export interface SplitWhiteboardConfig {
  source: SourcePane;
  prompt: string;
}

// ── Video-quiz ──────────────────────────────────────────────────────────────

export interface VideoCheckpoint {
  id: string;
  /** Tijdstip in de video (seconden) waarop de vraag verschijnt. */
  timeSec: number;
  question: Question;
}
export interface VideoQuizConfig {
  /** YouTube-URL of video-id. */
  videoUrl: string;
  checkpoints: VideoCheckpoint[];
}

// ── Beeld & media ───────────────────────────────────────────────────────────

export interface JigsawConfig {
  imageUrl: string;
  cols: number; // 2..6
  rows: number; // 2..6
}

export interface SpotDifference {
  id: string;
  /** Positie in procenten op de afbeelding. */
  x: number;
  y: number;
  /** Klikstraal in procenten van de breedte. */
  radius: number;
  label?: string;
}
export interface SpotDifferenceConfig {
  imageA: string;
  imageB: string;
  differences: SpotDifference[];
}

export interface CarouselSlide { id: string; imageUrl: string; caption: string; description?: string }
export interface CarouselConfig { slides: CarouselSlide[] }

export interface ImageViewerConfig { imageUrl: string; description?: string }

export interface BeforeAfterConfig {
  imageBefore: string;
  imageAfter: string;
  labelBefore: string;
  labelAfter: string;
}

export interface Frame { id: string; imageUrl?: string; title: string; text?: string }
export interface FrameSequenceConfig { frames: Frame[] }

export interface TipTile { id: string; title: string; imageUrl?: string; text: string; color?: string }
export interface TipTilesConfig { tiles: TipTile[] }

export interface RandomImagesConfig { images: { id: string; imageUrl: string; caption?: string }[] }

export interface MediaPlayerConfig {
  provider: 'youtube' | 'vimeo';
  videoUrl: string;
  startSec?: number;
  endSec?: number;
  title?: string;
}

// ── Wiskunde ────────────────────────────────────────────────────────────────

export interface PlotParam { name: string; min: number; max: number; step: number; value: number }
export interface ActivePlotConfig {
  /** Uitdrukkingen in x en parameternamen, bv. "a*x^2 + b". */
  functions: { id: string; expression: string; color: string }[];
  params: PlotParam[];
  xMin: number; xMax: number; yMin: number; yMax: number;
}

export interface ChartConfig {
  chartType: 'bar' | 'line' | 'pie' | 'donut';
  title: string;
  labels: string[];
  values: number[];
  /** Mogen leerlingen de waarden aanpassen en het effect zien? */
  studentEditable: boolean;
}

// ── Diversen ────────────────────────────────────────────────────────────────

export interface WebquestStep {
  id: string;
  title: string;
  content: string;
  links: { label: string; url: string }[];
  imageUrl?: string;
}
export interface WebquestConfig { steps: WebquestStep[] }

export interface MindmapConfig {
  /** Centrale begrip. */
  root: string;
  /** Takken als ingesprongen tekst (2 spaties per niveau). */
  outline: string;
  /** Mag de leerling de mindmap aanpassen en indienen? */
  studentEditable: boolean;
}

export interface PlannerSection { id: string; title: string; tasks: { id: string; text: string }[] }
export interface PlannerConfig { title: string; sections: PlannerSection[] }

export interface PianoConfig {
  showNoteNames: boolean;
  octaves: 1 | 2;
}
