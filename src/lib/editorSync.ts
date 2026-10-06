// ── Widget-editor: eerlijk bewaren naast andere tabbladen ───────────────────
//
// Debugronde oktober 2026, OP3 en OP4. Twee tabbladen met dezelfde widget
// overschreven elkaars werk, en een widget die in het ene tabblad verwijderd
// werd, kwam terug zodra het andere tabblad sloot.
//
// De editor onthoudt welke versie (updatedAt) hij het laatst in de opslag zag
// of er zelf schreef. Vóór elk bewaren, en bij elk `storage`-event van een
// ander tabblad, vergelijkt hij die met wat er nu in de opslag staat:
//
//   gelijk      niemand anders schreef: gewoon bewaren
//   overnemen   een ander tabblad bewaarde een nieuwere versie en hier staat
//               niets onbewaards: die versie tonen (er gaat niets verloren)
//   conflict    een ander tabblad bewaarde een andere versie én hier staan
//               onbewaarde wijzigingen: niet stil overschrijven, de
//               leerkracht kiest (andere versie laden of de eigen bewaren)
//   verwijderd  de widget staat niet meer in de opslag: niet stil terugzetten
//
// Bewust puur (geen opslag, geen React), zodat het los te testen is.

export type SyncState = 'gelijk' | 'overnemen' | 'conflict' | 'verwijderd';

/**
 * @param stored versie (updatedAt) in de opslag, of null als de widget er niet (meer) staat
 * @param known  de versie die deze editor het laatst zag of zelf bewaarde
 * @param dirty  heeft deze editor wijzigingen die nog niet bewaard zijn?
 */
export function syncState(stored: number | null, known: number, dirty: boolean): SyncState {
  if (stored === null) return 'verwijderd';
  if (stored === known) return 'gelijk';
  return dirty ? 'conflict' : 'overnemen';
}

/** Versie van een widget zoals de editor ze vergelijkt (oude data zonder updatedAt telt als 0). */
export function versionOf(w: { updatedAt?: unknown } | undefined | null): number | null {
  if (!w) return null;
  return typeof w.updatedAt === 'number' && Number.isFinite(w.updatedAt) ? w.updatedAt : 0;
}
