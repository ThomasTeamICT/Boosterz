import { describe, expect, it } from 'vitest';
import { bulletMarksFromOps, classifySizes, itemsToLines, pdfLinesToMarkdown, type PdfLine } from './pdfMarkdown';

const L = (page: number, y: number, text: string, size = 12, bold = false, italic = false): PdfLine => ({
  page, y, x: 50, spans: [{ text, size, bold, italic }],
});

describe('pdfLinesToMarkdown', () => {
  const lines: PdfLine[] = [
    L(1, 760, 'Hoofdstuk 1: Kennismaken met', 32),
    L(1, 725, 'natuurwetenschappen', 32),
    L(1, 690, 'Dit hoofdstuk behandelt de basisprincipes van wetenschappelijk', 12),
    L(1, 676, 'onderzoek en past deze toe.', 12),
    L(1, 640, 'Kennismaking met natuurwetenschappen', 18),
    L(1, 612, '1.1 Hoe stel je een goede onderzoeksvraag?', 14),
    { page: 1, y: 590, x: 50, spans: [{ text: 'Theoretische uitleg: ', size: 12, bold: true, italic: false }, { text: 'Elk onderzoek start met een vraag.', size: 12, bold: false, italic: false }] },
    L(1, 576, 'Een goede vraag is specifiek.', 12),
    L(1, 550, '• Specifiek: duidelijk wat je onderzoekt.', 12),
    L(1, 536, '• Meetbaar: je kunt metingen doen.', 12),
    L(1, 510, '3', 12), // paginanummer: ruis
    { page: 2, y: 760, x: 50, spans: [{ text: 'Voorbeeld:', size: 12, bold: true, italic: false }, { text: ' Beschimmelen boterhammen sneller?', size: 12, bold: false, italic: false }] },
    L(2, 730, '1.2 Hoe bedenk je een hypothese?', 14),
    L(2, 708, 'Een hypothese is een voorlopig antwoord.', 12),
  ];

  it('rangschikt lettergroottes: broodtekst en kopniveaus', () => {
    expect(classifySizes(lines)).toEqual({ body: 12, headings: [32, 18, 14] });
  });

  it('maakt koppen, alinea’s, lijsten en vette run-ins', () => {
    const md = pdfLinesToMarkdown(lines);
    expect(md).toContain('# Hoofdstuk 1: Kennismaken met natuurwetenschappen\n');
    expect(md).toContain('## Kennismaking met natuurwetenschappen\n');
    expect(md).toContain('### 1.1 Hoe stel je een goede onderzoeksvraag?\n');
    expect(md).toContain('### 1.2 Hoe bedenk je een hypothese?\n');
    // regels binnen een alinea worden samengevoegd
    expect(md).toContain('Dit hoofdstuk behandelt de basisprincipes van wetenschappelijk onderzoek en past deze toe.');
    // vet run-in blijft vet, zodat de cursusomzetter er een callout van maakt
    expect(md).toContain('**Theoretische uitleg:** Elk onderzoek start met een vraag.');
    expect(md).toContain('**Voorbeeld:** Beschimmelen boterhammen sneller?');
    expect(md).toContain('- Specifiek: duidelijk wat je onderzoekt.\n- Meetbaar: je kunt metingen doen.');
    expect(md).not.toMatch(/\n3\n/);
  });
});

describe('itemsToLines', () => {
  it('groepeert items op basislijn en herkent vet via de lettertypenaam', () => {
    const items = [
      { str: 'Voorbeeld:', transform: [12, 0, 0, 12, 50, 700], fontName: 'g_f2' },
      { str: ' tekst', transform: [12, 0, 0, 12, 110, 700.6], fontName: 'g_f1' },
      { str: 'Volgende regel', transform: [12, 0, 0, 12, 50, 686], fontName: 'g_f1' },
    ];
    const lines = itemsToLines(1, items, (f) => (f === 'g_f2' ? 'Calibri-Bold' : 'Calibri'));
    expect(lines).toHaveLength(2);
    expect(lines[0].bullet).toBeUndefined();
    expect(lines[0].spans.map((s) => [s.text, s.bold])).toEqual([['Voorbeeld:', true], [' tekst', false]]);
    expect(lines[1].spans[0].text).toBe('Volgende regel');
  });
});

describe('opsommingstekens als vectorbolletjes', () => {
  const items = [
    { str: 'Route:', transform: [12, 0, 0, 12, 27.7, 720], fontName: 'g_f1' },
    { str: '', transform: [12, 0, 0, 12, 51.7, 700], fontName: 'g_f2', hasEOL: true },
    { str: 'Mondholte', transform: [12, 0, 0, 12, 51.7, 700], fontName: 'g_f2' },
    { str: ' (mond)', transform: [12, 0, 0, 12, 118, 700], fontName: 'g_f1' },
    { str: '', transform: [12, 0, 0, 12, 51.7, 684], fontName: 'g_f2', hasEOL: true },
    { str: 'Slokdarm', transform: [12, 0, 0, 12, 51.7, 684], fontName: 'g_f2' },
    { str: '', transform: [12, 0, 0, 12, 27.7, 660], fontName: 'g_f1', hasEOL: true },
    { str: 'Gewone alinea die begint met een leeg item.', transform: [12, 0, 0, 12, 27.7, 660], fontName: 'g_f1' },
  ];
  const fontOf = (f: string) => (f === 'g_f2' ? 'OpenSans-Bold' : 'OpenSans');

  it('koppelt een bolletje links van de regel aan die regel; een leeg item alleen is géén bolletje', () => {
    const marks = [{ x: 39.7, y: 703.7 }, { x: 39.7, y: 687.7 }];
    const lines = itemsToLines(1, items, fontOf, marks);
    expect(lines.map((l) => Boolean(l.bullet))).toEqual([false, true, true, false]);
    const md = pdfLinesToMarkdown(lines);
    expect(md).toContain('Route:\n\n- **Mondholte** (mond)\n- **Slokdarm**\n\nGewone alinea');
  });

  it('zonder bolletjes blijft het gewone tekst', () => {
    const lines = itemsToLines(1, items, fontOf);
    expect(lines.every((l) => !l.bullet)).toBe(true);
  });
});

describe('bulletMarksFromOps', () => {
  // OPS-nummers zoals in pdf.js
  const OPS = { save: 10, restore: 11, transform: 12, constructPath: 91, fill: 22, eoFill: 23, fillStroke: 24, eoFillStroke: 25, closeFillStroke: 26, closeEoFillStroke: 27 };

  it('volgt de transformatiematrix en houdt alleen kleine gevulde paden over', () => {
    // Opbouw zoals een browser-pdf: pagina geschaald 0,24 en gespiegeld, dan per
    // bolletje save + transform + gevuld cirkelpad van 25 × 25 in eigen ruimte.
    const fn = [OPS.transform, OPS.save, OPS.transform, OPS.constructPath, OPS.restore, OPS.save, OPS.transform, OPS.constructPath, OPS.restore, OPS.constructPath];
    const args = [
      [0.24, 0, 0, -0.24, 0, 841.92],
      null,
      [0.25, 0, 0, 0.25, 153.125, 1034.375],
      [OPS.fill, [new Float32Array(0)], [0, 0, 100, 100]],
      null,
      null,
      [0.25, 0, 0, 0.25, 153.125, 1106.25],
      [OPS.eoFill, [new Float32Array(0)], [0, 0, 100, 100]],
      null,
      // groot kader (callout-achtergrond): geen bolletje
      [OPS.fill, [new Float32Array(0)], [0, 3147, 794, 4196]],
    ];
    const marks = bulletMarksFromOps(fn, args, OPS);
    expect(marks).toHaveLength(2);
    expect(marks[0].x).toBeCloseTo(39.75, 1);
    expect(marks[0].y).toBeCloseTo(590.67, 1);
    expect(marks[1].y).toBeCloseTo(573.42, 1);
  });

  it('slaat streepjes (lijnen) en niet-gevulde paden over', () => {
    const fn = [OPS.constructPath, OPS.constructPath];
    const args = [
      [OPS.fill, [new Float32Array(0)], [10, 100, 60, 101]], // onderstreping: 50 × 1
      [20, [new Float32Array(0)], [10, 100, 15, 105]], // stroke (op 20)
    ];
    expect(bulletMarksFromOps(fn, args, OPS)).toEqual([]);
  });
});

describe('vet over een regeleinde heen', () => {
  it('voegt "**7**" en "**meter**" op de volgende regel samen tot één vette markering', () => {
    const lines: PdfLine[] = [
      { page: 1, y: 700, x: 27, spans: [{ text: 'Wist je dat dit ongeveer ', size: 12, bold: false, italic: false }, { text: '7', size: 12, bold: true, italic: false }] },
      { page: 1, y: 682, x: 27, spans: [{ text: 'meter', size: 12, bold: true, italic: false }, { text: ' is?', size: 12, bold: false, italic: false }] },
    ];
    expect(pdfLinesToMarkdown(lines)).toContain('ongeveer **7 meter** is?');
  });
});

describe('begrippenlijst met krappe regelafstand', () => {
  it('"**Term** Uitleg." op opeenvolgende regels blijven aparte alinea\'s', () => {
    const term = (y: number, t: string, u: string): PdfLine => ({ page: 1, y, x: 40, spans: [{ text: t, size: 12, bold: true, italic: false }, { text: ' ' + u, size: 12, bold: false, italic: false }] });
    const lines: PdfLine[] = [
      { page: 1, y: 760, x: 40, spans: [{ text: 'Kernbegrippen', size: 14, bold: true, italic: false }] },
      term(734, 'Kracht', 'Een duw of een trek.'),
      term(712, 'Contactkracht', 'Werkt alleen bij aanraking.'),
      term(690, 'Zwaartekracht', 'Trekt voorwerpen naar de aarde.'),
      { page: 1, y: 668, x: 40, spans: [{ text: 'Gewone vervolgregel zonder vet begin.', size: 12, bold: false, italic: false }] },
    ];
    const md = pdfLinesToMarkdown(lines);
    expect(md).toContain('**Kracht** Een duw of een trek.\n\n**Contactkracht** Werkt alleen bij aanraking.\n\n**Zwaartekracht** Trekt voorwerpen naar de aarde. Gewone vervolgregel');
  });
});

describe('afgebroken woorden en streepjes', () => {
  // opeenvolgende regels met de gewone regelafstand: één alinea
  const para = (...texts: string[]): PdfLine[] => texts.map((t, i) => L(1, 700 - i * 14, t));

  it('plakt een woord dat op een regeleinde is afgebroken weer aan elkaar', () => {
    expect(pdfLinesToMarkdown(para('Ook de zee-', 'water en het regenwater komen aan bod.'))).toBe(
      'Ook de zeewater en het regenwater komen aan bod.\n'
    );
    expect(pdfLinesToMarkdown(para('het ver-', 'enigd koninkrijk'))).toBe('het verenigd koninkrijk\n');
  });

  it('laat "voor- en nadelen" en "massa- en volume-eenheden" binnen één regel staan', () => {
    const md = pdfLinesToMarkdown(para('We bespreken de voor- en nadelen van water.', 'Ook massa- en volume-eenheden komen aan bod.'));
    expect(md).toBe('We bespreken de voor- en nadelen van water. Ook massa- en volume-eenheden komen aan bod.\n');
  });

  it('houdt het streepje en zet een spatie als een voegwoord op de volgende regel staat', () => {
    expect(pdfLinesToMarkdown(para('We bespreken de voor-', 'en nadelen van water.'))).toBe('We bespreken de voor- en nadelen van water.\n');
    expect(pdfLinesToMarkdown(para('Ook de massa-', 'en volume-eenheden.'))).toBe('Ook de massa- en volume-eenheden.\n');
    expect(pdfLinesToMarkdown(para('natuur-', 'of milieu'))).toBe('natuur- of milieu\n');
    expect(pdfLinesToMarkdown(para('tien-', 'tot twintigjarigen'))).toBe('tien- tot twintigjarigen\n');
    expect(pdfLinesToMarkdown(para('noch zee-', 'noch land'))).toBe('noch zee- noch land\n');
  });

  it('plakt niet als er een hoofdletter volgt: het streepje blijft en de letters raken niet aan elkaar', () => {
    const md = pdfLinesToMarkdown(para('in Noord-', 'Amerika'));
    expect(md).toContain('Noord-');
    expect(md).not.toContain('NoordAmerika');
  });

  it('laat een streepje midden in een regel met rust', () => {
    expect(pdfLinesToMarkdown(para('a - b is anders dan a- b', 'maar c-d blijft'))).toBe('a - b is anders dan a- b maar c-d blijft\n');
  });

  it('plakt ook in een vervolgregel van een lijstitem', () => {
    expect(pdfLinesToMarkdown([L(1, 700, '• Het water-'), L(1, 686, 'verbruik daalt.')])).toBe('- Het waterverbruik daalt.\n');
  });

  it('werkt ook met letters met accenten', () => {
    expect(pdfLinesToMarkdown(para('de café-', 'tafel'))).toBe('de cafétafel\n');
  });
});
