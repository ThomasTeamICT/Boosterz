// ── Verslag van een geplakte reeks resultaatcodes ───────────────────────────
//
// Apart van resultsHelpers.ts: dit bestand haalt lib/inbox binnen en hoort bij
// het plakvenster van ResultsPage. resultsHelpers.ts wordt door drie pagina's
// gedeeld en blijft daarom klein.

import { summarizeReport, type InboxReport, type InboxRow } from '../../lib/inbox';

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
 */
export function importOutcome(report: InboxReport, forThisWidget: number): ImportOutcome {
  const saved = report.rows.filter((r) => r.saved).length;
  const elsewhere = Math.max(0, saved - forThisWidget);
  return {
    saved,
    elsewhere,
    clean: saved > 0 && elsewhere === 0 && report.dubbel === 0 && report.onbekend === 0 && report.ongeldig === 0,
    summary: summarizeReport(report),
    problems: report.rows.filter((r) => r.outcome !== 'nieuw'),
  };
}
