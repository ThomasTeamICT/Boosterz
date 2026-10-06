import type { CourseBlock } from '../../lib/courseTypes';

// ── Lege blokken ────────────────────────────────────────────────────────────
//
// Een blok dat de leerkracht toevoegde maar nooit invulde (geen afbeelding
// gekozen, lege tekst, een oefening die nog niet gekozen is) heeft een leerling
// niets te zeggen. In de editor blijft het blok zichtbaar, met zijn hint; in de
// cursuslezer en de afdrukversie slaan we het over, zodat een leerling geen
// "(geen afbeelding gekozen)" of "Oefening niet gevonden" te zien krijgt.
//
// Een oefening waarvan het id wél ingevuld is maar niet op dit toestel staat,
// is NIET leeg: dan klopt de melding "vraag je leerkracht om een nieuwe link".

const blank = (v: unknown): boolean => typeof v !== 'string' || v.trim() === '';
const list = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);

export function isEmptyBlock(block: CourseBlock): boolean {
  switch (block.type) {
    case 'heading': return blank(block.text);
    case 'text': return blank(block.markdown);
    case 'image': return blank(block.url);
    case 'video': return blank(block.url);
    case 'audio': return blank(block.url);
    case 'pdf': return blank(block.pdfId) && blank(block.url);
    case 'embed': return blank(block.url);
    case 'callout': return blank(block.text) && blank(block.title);
    case 'quote': return blank(block.text);
    case 'divider': return false;
    case 'attachment': return blank(block.dataUrl) && blank(block.name);
    case 'accordion': return list(block.items).every((it) => blank(it.title) && blank(it.text));
    case 'columns': return blank(block.left) && blank(block.right);
    case 'table': return list(block.rows).every((row) => list(row).every((cell) => blank(cell)));
    case 'terms': return list(block.items).every((it) => blank(it.term) && blank(it.uitleg));
    case 'checklist': return list(block.items).every((it) => blank(it.text));
    case 'widget': return blank(block.widgetId);
    default: return false; // onbekend bloktype: laten staan, de renderer beslist
  }
}

/**
 * Gaat er niets verloren als de leerkracht dit blok in de editor verwijdert?
 * Strenger dan isEmptyBlock: een blok zonder bestand maar mét bijschrift, een
 * embed met titel, een citaat met bron, een checklist met titel of een
 * oefening met notitie is voor een leerling leeg, maar de leerkracht typte
 * die tekst en verliest ze. Een scheidingslijn bevat niets om te verliezen
 * (ze is zo opnieuw gezet). Alleen voor de editor: de lezer en de afdrukversie
 * gebruiken isEmptyBlock om te bepalen wat een leerling ziet.
 */
export function nietsTeVerliezen(block: CourseBlock): boolean {
  if (block.type === 'divider') return true;
  if (!isEmptyBlock(block)) return false;
  switch (block.type) {
    case 'image':
    case 'video':
    case 'audio':
    case 'pdf': return blank(block.caption);
    case 'embed': return blank(block.title);
    case 'quote': return blank(block.source);
    case 'checklist': return blank(block.title);
    case 'widget': return blank(block.note);
    default: return true;
  }
}

/** De blokken die een leerling te zien krijgt: zonder de lege. */
export function leerlingBlokken(blocks: CourseBlock[]): CourseBlock[] {
  return blocks.filter((b) => !isEmptyBlock(b));
}
