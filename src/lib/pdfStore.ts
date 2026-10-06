// ── Pdf- en bestandsopslag in IndexedDB ─────────────────────────────────────
//
// Pdf's zijn te groot voor localStorage (quota ±5 MB voor de héle app), dus
// bewaren we ze als Blob in IndexedDB — daar is doorgaans honderden MB ruimte.
// Widgets/cursussen verwijzen ernaar met een pdfId. Let op bij delen:
// een geüploade pdf zit in dít toestel; via de draagbare link reist hij NIET
// mee (te groot voor een URL). Wel mee: in het cursusbestand (export, als
// base64; zie exportCourseJson en restoreCoursePdfs in lib/courses.ts), of via
// een openbare URL als bron.
//
// Dezelfde database en object store (zie lib/idb.ts) bewaart óók ingeleverde
// bestanden van leerlingen (upload-vraagtype), via saveStudentFile/
// getStudentFile/deleteStudentFile, én de media van widgets en cursussen
// (lib/mediaStore.ts). De records zijn identiek ({id, name, blob, size,
// createdAt}) en de id's zijn uniek per soort, dus niets kan botsen.

import { filesTx, type FileRecord } from './idb';

type PdfRecord = FileRecord;

const tx = filesTx;

export async function savePdf(id: string, name: string, blob: Blob): Promise<void> {
  const rec: PdfRecord = { id, name, blob, size: blob.size, createdAt: Date.now() };
  await tx('readwrite', (s) => s.put(rec));
}

export async function getPdf(id: string): Promise<{ name: string; blob: Blob } | null> {
  try {
    const rec = (await tx<PdfRecord | undefined>('readonly', (s) => s.get(id) as IDBRequest<PdfRecord | undefined>)) ?? null;
    return rec ? { name: rec.name, blob: rec.blob } : null;
  } catch {
    return null;
  }
}

export async function deletePdf(id: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(id));
  } catch {
    /* opruimen mag nooit iets blokkeren */
  }
}

// ── Ingeleverde bestanden (leerling-uploads) ────────────────────────────────
// Zelfde store als de pdf's (zie kop van dit bestand); alleen de naamgeving
// maakt duidelijk waarvoor de aanroep dient.

export async function saveStudentFile(id: string, name: string, blob: Blob): Promise<void> {
  await savePdf(id, name, blob);
}

export async function getStudentFile(id: string): Promise<{ name: string; blob: Blob } | null> {
  return getPdf(id);
}

export async function deleteStudentFile(id: string): Promise<void> {
  await deletePdf(id);
}

/** Voor export naar een widget-/cursusbestand: pdf als data-URL (base64). */
export async function pdfToDataUrl(id: string): Promise<{ name: string; dataUrl: string } | null> {
  const rec = await getPdf(id);
  if (!rec) return null;
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(rec.blob);
  });
  return { name: rec.name, dataUrl };
}

const PDF_DATA_PREFIX = 'data:application/pdf;base64,';

/**
 * Data-URL van een pdf (base64) terug naar een Blob van type application/pdf.
 * Zonder fetch: werkt overal en hangt niet af van netwerkregels. Geeft null
 * voor alles wat geen pdf-data-URL is.
 */
export function pdfDataUrlToBlob(dataUrl: string): Blob | null {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PDF_DATA_PREFIX)) return null;
  try {
    const bin = atob(dataUrl.slice(PDF_DATA_PREFIX.length));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: 'application/pdf' });
  } catch {
    return null;
  }
}

/** Voor import uit een bestand: data-URL terug naar IndexedDB. */
export async function importPdfFromDataUrl(id: string, name: string, dataUrl: string): Promise<boolean> {
  const blob = pdfDataUrlToBlob(dataUrl);
  if (!blob) return false;
  try {
    await savePdf(id, name, blob);
    return true;
  } catch {
    return false;
  }
}

/** Menselijk leesbare bestandsgrootte. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
