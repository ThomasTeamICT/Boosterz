// ── Gedeelde IndexedDB-toegang ──────────────────────────────────────────────
//
// Eén database ('wf-files') met één object store ('pdfs') voor álle blobs van
// de app: geüploade pdf's, ingeleverde leerlingbestanden én (sinds de
// media-migratie) afbeeldingen, audio en bijlagen uit widgets en cursussen.
// De records hebben dezelfde vorm; het id-voorvoegsel zegt wat het is
// (pdf's en inzendingen: uid(), media: 'm_…'). Eén store betekent geen
// versiebump en geen VersionError tussen modules die de db apart openen.

export const FILES_DB_NAME = 'wf-files';
export const FILES_STORE = 'pdfs';

export interface FileRecord {
  id: string;
  name: string;
  blob: Blob;
  size: number;
  createdAt: number;
}

/**
 * Zo lang wachten we op `indexedDB.open`. In zeldzame gevallen (Safari,
 * privévensters) antwoordt die nooit; zonder grens bleef dan elke bewaar- en
 * leesactie stil hangen. Na de grens wijzen we af, zodat de medialaag
 * terugvalt op data-URL's en een upload een nette foutmelding toont.
 */
export const OPEN_TIMEOUT_MS = 5000;

export function openFilesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(FILES_DB_NAME, 1);
    } catch (e) {
      reject(e);
      return;
    }
    // Precies één uitkomst. Komt het antwoord pas na de tijdslimiet (of na
    // 'blocked'), dan gaat die verbinding meteen weer dicht: anders bleef ze
    // open en blokkeerde ze later bv. het wissen van de database.
    // (De handlers lopen altijd asynchroon, dus `timer` bestaat al wanneer
    // fail of onsuccess hem opruimt.)
    let settled = false;
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    };
    const timer = setTimeout(() => fail(new Error('IndexedDB antwoordt niet')), OPEN_TIMEOUT_MS);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(FILES_STORE)) {
        req.result.createObjectStore(FILES_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      if (settled) {
        try {
          req.result.close();
        } catch {
          // al dicht of nooit echt open: niets te doen
        }
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(req.result);
    };
    req.onerror = () => fail(req.error ?? new Error('IndexedDB kon niet geopend worden'));
    req.onblocked = () => fail(new Error('IndexedDB geblokkeerd'));
  });
}

/**
 * Eén verzoek in één transactie; de db gaat na afloop weer dicht.
 *
 * Lost pas op als de transactie écht vastgelegd is (`complete`), niet al bij
 * het slagen van het verzoek: een QuotaExceededError komt pas bij het
 * vastleggen (`abort`), en wie dan al "bewaard" gehoord heeft, gooit
 * misschien de enige andere kopie weg (zie migrateDataUrls in mediaStore).
 */
export function filesTx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openFilesDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let t: IDBTransaction | undefined;
        try {
          t = db.transaction(FILES_STORE, mode);
          const tx = t;
          const req = run(tx.objectStore(FILES_STORE));
          let result: T | undefined;
          req.onsuccess = () => {
            result = req.result;
          };
          // Een mislukt verzoek breekt de transactie af; we wijzen al meteen
          // af met de fout van het verzoek (onabort doet daarna niets meer).
          req.onerror = () => reject(req.error ?? new Error('IndexedDB-verzoek mislukt'));
          tx.oncomplete = () => {
            db.close();
            resolve(result as T);
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error ?? req.error ?? new Error('IndexedDB-transactie afgebroken'));
          };
        } catch (e) {
          // Niets half laten vastleggen: wat al gevraagd was, gaat niet door.
          try {
            t?.abort();
          } catch {
            // transactie al voorbij of nooit gestart
          }
          db.close();
          reject(e);
        }
      })
  );
}

/** Sleutelbereik voor alle id's met een voorvoegsel (bv. 'm_'). */
export function prefixRange(prefix: string): IDBKeyRange {
  return IDBKeyRange.bound(prefix, prefix + '\uffff');
}

/** Hele bestandsdatabase weg (privacypagina: "alles wissen"). */
export function deleteFilesDb(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(FILES_DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
