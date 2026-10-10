// ── Klassen en opdrachten ───────────────────────────────────────────────────
//
// Een klas is een lijst leerlingen met een klascode. Opdrachten koppelen een
// cursus of widget aan een klas (met optionele deadline). De leerling kiest
// zijn naam uit de klaslijst; zo krijgen inzendingen en leesvoortgang een
// vaste identiteit (studentId) in plaats van een vrij ingetikte naam — en kan
// het klasoverzicht per leerling optellen, ook per leerplandoel.

import type { Doelgroep } from './doelgroep';

export interface ClassStudent {
  id: string;
  name: string;
  /** Klasnummer (optioneel), handig voor sorteren en anonieme exports. */
  number?: number;
}

export interface ClassGroup {
  id: string;
  name: string;
  /** Klascode van 6 tekens, zoals bij widgets en cursussen. */
  code: string;
  schoolYear?: string;
  /**
   * De studierichting en het jaar van de klas (docs/STUDIERICHTINGEN.md § 22.6). Alleen via `doelgroepVoorKlas`: een witte
   * lijst met groepnummer, titel, graad, jaar, soort en onderdeel; geen vak en geen kadervelden. Geen persoonsgegevens,
   * reist mee in het klaspakket.
   */
  doelgroep?: Doelgroep;
  students: ClassStudent[];
  createdAt: number;
  updatedAt: number;
}

export interface Assignment {
  id: string;
  classId: string;
  kind: 'course' | 'widget';
  /** Course.id of Widget.id. */
  targetId: string;
  /** Deadline (ms) of null. */
  dueAt?: number | null;
  /** Korte instructie voor de leerlingen. */
  note?: string;
  createdAt: number;
}

/** Wat een leerlingtoestel lokaal onthoudt na het kiezen van een naam. */
export interface StudentContext {
  classId: string;
  classCode: string;
  className: string;
  studentId: string;
  studentName: string;
}
