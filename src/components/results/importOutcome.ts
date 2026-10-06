// ── Verslag van een geplakte reeks resultaatcodes ───────────────────────────
//
// Apart van resultsHelpers.ts: dit bestand haalt lib/inbox binnen en hoort bij
// het plakvenster van ResultsPage. resultsHelpers.ts wordt door drie pagina's
// gedeeld en blijft daarom klein. Ook de meldingen van het Inleverpunt staan
// hier: pure functies, zodat ze te testen zijn zonder pagina.

import { summarizeReport, type InboxReport, type InboxRow } from '../../lib/inbox';
import { submissionTooLarge } from '../../lib/progressTransfer';
import { decodeSubmission } from '../../lib/share';

/** Wat een geplakte reeks resultaatcodes opleverde, voor de melding in het plakvenster. */
export interface ImportOutcome {
  /** Codes waarvan het werk bewaard is (voor deze widget of een andere). */
  saved: number;
  /** Bewaard, maar bij een andere widget of cursus dan die van dit scherm. */
  elsewhere: number;
  /** Alles lukte en alles hoort bij dit scherm: kort melden en sluiten volstaat. */
  clean: boolean;
  /** Korte samenvatting ("2 nieuw, 1 al aanwezig, 1 ongeldig"). */
  summary: string;
  /** De codes die niet gewoon nieuw waren, elk met hun uitleg. */
  problems: InboxRow[];
}

/**
 * Vat het verslag van `processCodes` samen. `forThisWidget` is het aantal
 * inzendingen dat er voor de widget van dit scherm bij kwam (verschil van de
 * opslag voor en na): wat daarbovenop bewaard werd, hoort bij een andere
 * widget of cursus. Zo verdwijnt er niets stil, ook geen code voor iets anders.
 *
 * Een code die al binnen was en alleen een reflectie aanvulde (uitkomst
 * 'dubbel', wel bewaard) maakt geen nieuwe inzending: ze telt niet mee voor
 * "elders bewaard" (G14), anders klopt het verschil met `forThisWidget` niet.
 * Ze staat wel bij de problemen, met haar eigen uitleg.
 */
export function importOutcome(report: InboxReport, forThisWidget: number): ImportOutcome {
  const saved = report.rows.filter((r) => r.saved).length;
  const nieuwBewaard = report.rows.filter((r) => r.saved && r.outcome !== 'dubbel').length;
  const elsewhere = Math.max(0, nieuwBewaard - forThisWidget);
  return {
    saved,
    elsewhere,
    clean: saved > 0 && elsewhere === 0 && report.dubbel === 0 && report.onbekend === 0 && report.ongeldig === 0,
    summary: summarizeReport(report),
    problems: report.rows.filter((r) => r.outcome !== 'nieuw'),
  };
}

// ── Inleverpunt ─────────────────────────────────────────────────────────────

/**
 * Een 'dubbel' resultaat waarvan de aanvulling (de reflectie die de leerling
 * pas later invulde) niet bewaard kon worden omdat de opslag vol is: lib/inbox
 * meldt dat in de uitleg bij de rij. Het werk zelf stond er al; de aanvulling
 * is nog niet binnen.
 */
function aanvullingMislukt(row: InboxRow): boolean {
  return row.outcome === 'dubbel' && !row.saved && /niet bewaard/i.test(row.message);
}

/**
 * De codes die niet verwerkt zijn: de rij is 'ongeldig' (onleesbaar, te groot
 * of niet bewaard door een volle opslag), of een dubbele code waarvan de
 * aanvulling niet bewaard kon worden. `codes` is `splitCodes(tekst)`, in
 * dezelfde volgorde als de rijen van `processCodes(tekst)`. Het Inleverpunt
 * laat ze in het tekstvak staan, zodat de leerkracht ze opnieuw kan proberen
 * (G5): de codes die wel bewaard zijn, geven bij opnieuw verwerken 'dubbel'.
 */
export function nietVerwerkteCodes(rows: InboxRow[], codes: string[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const code = codes[r.index - 1];
    if ((r.outcome === 'ongeldig' || aanvullingMislukt(r)) && code) out.push(code);
  }
  return out;
}

/**
 * Een resultaatcode die veel te groot is, wordt geweigerd door
 * sanitizeSubmission (S2). lib/inbox meldt dat als "onvolledig of beschadigd",
 * wat niet klopt: hier de echte reden bij de rij zetten. Alleen 'ongeldig'e
 * rijen van een resultaatcode (WF1.) worden bekeken, de rest blijft ongemoeid.
 */
export function verklaarWeigeringen(rows: InboxRow[], codes: string[]): InboxRow[] {
  return rows.map((r) => {
    const code = codes[r.index - 1];
    if (r.outcome !== 'ongeldig' || r.saved || !code || !code.startsWith('WF1.')) return r;
    const reden = submissionTooLarge(decodeSubmission(code));
    return reden ? { ...r, message: reden } : r;
  });
}

/** De regel die de camerascanner na elke gescande code toont. */
export function scanRegel(row: InboxRow): string {
  const wie = row.studentName || 'Onbekende leerling';
  const wat = row.title ?? (row.kind === 'course' ? 'onbekende cursus' : 'onbekende widget');
  if (row.outcome === 'nieuw') return `${wie} — ${wat} — ${row.detail}`;
  if (aanvullingMislukt(row)) return `${wie} — ${wat} — ${row.message}`;
  if (row.outcome === 'dubbel') return `${wie} — ${wat} — stond hier al`;
  if (row.outcome === 'onbekend') return `${wie} — bewaard, maar ${wat} staat niet op dit toestel`;
  // 'ongeldig' kan van alles zijn: onleesbaar, te groot of niet bewaard omdat
  // de opslag vol is. De rij weet welk van de drie.
  return row.message || 'Onleesbare of onvolledige code';
}
