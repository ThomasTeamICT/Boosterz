// Een pdf van een leerplan inlezen voor de wizard: de tekst per regel (extractPdfLines) en de
// vingerafdruk van het bestand zelf (sha-256 van de bytes). Alles gebeurt in de browser; er gaat niets
// het toestel af.

import { MAX_PDF_MB, type BronGegevens } from '../../../lib/leerplanInlezen';
import { extractPdfLines } from '../../../lib/pdfText';
import { sha256Hex } from '../../../lib/sha256';

export type PdfStand =
  | { status: 'leeg' }
  | { status: 'bezig'; naam: string }
  | { status: 'klaar'; bron: BronGegevens }
  /** `scan`: de pdf is gelezen maar bevat geen tekst (waarschijnlijk een scan). */
  | { status: 'fout'; naam: string; fout: string; scan?: boolean };

/** Geeft de uiteindelijke stand terug; gooit nooit. */
export async function leesPdfBestand(file: File): Promise<PdfStand> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return { status: 'fout', naam: file.name, fout: 'Kies een pdf-bestand.' };
  }
  if (file.size > MAX_PDF_MB * 1024 * 1024) {
    return { status: 'fout', naam: file.name, fout: `Deze pdf is groter dan ${MAX_PDF_MB} MB, dus Boosterz kan hem niet lezen. Lees dan alleen de pagina’s met de doelen in: kopieer ze en kies ‘Tekst plakken’.` };
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const bronSha256 = sha256Hex(bytes);
    const res = await extractPdfLines(file);
    if (!res.tekst.trim()) {
      return { status: 'fout', naam: file.name, fout: 'Deze pdf bevat geen leesbare tekst.', scan: true };
    }
    return {
      status: 'klaar',
      bron: {
        methode: 'pdf', tekst: res.tekst, bronNaam: file.name, bronSha256,
        paginas: res.paginas.length, paginasTotaal: res.pages, afgekapt: res.afgekapt,
      },
    };
  } catch {
    return { status: 'fout', naam: file.name, fout: 'Deze pdf kon niet gelezen worden. Is het bestand beschadigd of beveiligd met een wachtwoord?' };
  }
}
