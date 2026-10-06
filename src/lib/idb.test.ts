import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FILES_STORE, filesTx, OPEN_TIMEOUT_MS, openFilesDb, type FileRecord } from './idb';
import { configureMediaStore, mediaAvailable, MEDIA_REF_PREFIX, migrateDataUrls, storeMedia } from './mediaStore';

// ── Kleine nagemaakte IndexedDB ─────────────────────────────────────────────
//
// Net genoeg van de echte API om filesTx te testen, mét de volgorde die er
// in een browser toe doet: eerst slaagt het verzoek (onsuccess), pas daarna
// legt de transactie vast (oncomplete) — of breekt ze af (onabort), bv. met
// een QuotaExceededError. Gebeurtenissen lopen asynchroon, zoals echt.

type Handler = (() => void) | null;

interface Plan {
  /** ok: opent; hang: antwoordt nooit; error: onerror; throw: open() gooit; blocked: onblocked. */
  open: 'ok' | 'hang' | 'error' | 'throw' | 'blocked';
  /** Wat het vastleggen van een schrijftransactie doet ('handmatig': de test roept finish zelf). */
  commit: 'ok' | 'quota' | 'abort-zonder-fout' | 'handmatig';
  /** Het verzoek zelf mislukt (bv. ConstraintError). */
  requestFails: boolean;
}

class FakeRequest {
  result: unknown = undefined;
  error: DOMException | null = null;
  onsuccess: Handler = null;
  onerror: Handler = null;
}

class FakeOpenRequest extends FakeRequest {
  onupgradeneeded: Handler = null;
  onblocked: Handler = null;
}

class FakeDb {
  closed = false;
  readonly objectStoreNames = { contains: (n: string) => n === FILES_STORE };
  constructor(private readonly idb: FakeIdb) {}
  close() {
    this.closed = true;
  }
  createObjectStore() {
    /* bestaat al */
  }
  transaction(_name: string, mode: IDBTransactionMode) {
    if (this.closed) throw new DOMException('De verbinding is dicht', 'InvalidStateError');
    return new FakeTransaction(this.idb, mode);
  }
}

class FakeTransaction {
  error: DOMException | null = null;
  oncomplete: Handler = null;
  onabort: Handler = null;
  /** Het verzoek is geslaagd (onsuccess is gelopen). */
  requestDone = false;
  private finished = false;
  private readonly staged = new Map<string, FileRecord | null>();
  constructor(private readonly idb: FakeIdb, readonly mode: IDBTransactionMode) {
    idb.transactions.push(this);
  }

  objectStore() {
    const records = this.idb.records;
    return {
      put: (rec: FileRecord) => this.request(() => {
        this.staged.set(rec.id, rec);
        return rec.id;
      }),
      get: (id: string) => this.request(() => records.get(id)),
      getAll: (range?: { lower: string; upper: string }) =>
        this.request(() => [...records.values()].filter((r) => !range || (r.id >= range.lower && r.id <= range.upper))),
      delete: (id: string) => this.request(() => {
        this.staged.set(id, null);
        return undefined;
      }),
    };
  }

  abort() {
    if (this.finished) throw new DOMException('Transactie al voorbij', 'InvalidStateError');
    this.finished = true;
    this.staged.clear();
    setTimeout(() => this.onabort?.(), 0);
  }

  private request(compute: () => unknown): FakeRequest {
    const req = new FakeRequest();
    setTimeout(() => {
      if (this.finished) return;
      if (this.idb.plan.requestFails) {
        req.error = new DOMException('Sleutel bestaat al', 'ConstraintError');
        req.onerror?.();
        this.finish('abort', req.error);
        return;
      }
      req.result = compute();
      req.onsuccess?.();
      this.requestDone = true;
      if (this.idb.plan.commit === 'handmatig' && this.mode === 'readwrite') return;
      // Pas ná het geslaagde verzoek komt het vastleggen.
      setTimeout(() => {
        if (this.mode === 'readwrite' && this.idb.plan.commit === 'quota') {
          this.finish('abort', new DOMException('Quota overschreden', 'QuotaExceededError'));
        } else if (this.mode === 'readwrite' && this.idb.plan.commit === 'abort-zonder-fout') {
          this.finish('abort', null);
        } else {
          this.finish('complete', null);
        }
      }, 0);
    }, 0);
    return req;
  }

  finish(how: 'complete' | 'abort', error: DOMException | null) {
    if (this.finished) return;
    this.finished = true;
    if (how === 'complete') {
      for (const [id, rec] of this.staged) {
        if (rec) this.idb.records.set(id, rec);
        else this.idb.records.delete(id);
      }
      this.oncomplete?.();
    } else {
      this.error = error;
      this.staged.clear();
      this.onabort?.();
    }
  }
}

class FakeIdb {
  plan: Plan = { open: 'ok', commit: 'ok', requestFails: false };
  readonly records = new Map<string, FileRecord>();
  readonly dbs: FakeDb[] = [];
  readonly openRequests: FakeOpenRequest[] = [];
  readonly transactions: FakeTransaction[] = [];

  open() {
    if (this.plan.open === 'throw') throw new DOMException('Geen toegang', 'SecurityError');
    const req = new FakeOpenRequest();
    this.openRequests.push(req);
    if (this.plan.open === 'hang') return req; // nooit een antwoord
    setTimeout(() => {
      if (this.plan.open === 'error') {
        req.error = new DOMException('Openen mislukt', 'UnknownError');
        req.onerror?.();
      } else if (this.plan.open === 'blocked') {
        req.onblocked?.();
      } else {
        req.result = this.newDb();
        req.onsuccess?.();
      }
    }, 0);
    return req;
  }

  /** Een (late) geslaagde opening nabootsen op een eerder verzoek. */
  succeedLate(req: FakeOpenRequest): FakeDb {
    const db = this.newDb();
    req.result = db;
    req.onsuccess?.();
    return db;
  }

  openConnections(): number {
    return this.dbs.filter((d) => !d.closed).length;
  }

  private newDb(): FakeDb {
    const db = new FakeDb(this);
    this.dbs.push(db);
    return db;
  }
}

let fake: FakeIdb;

beforeEach(() => {
  fake = new FakeIdb();
  vi.stubGlobal('indexedDB', { open: () => fake.open() });
  vi.stubGlobal('IDBKeyRange', { bound: (lower: string, upper: string) => ({ lower, upper }) });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function record(id = 'm_een'): FileRecord {
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
  return { id, name: 'foto.png', blob, size: blob.size, createdAt: 1 };
}

/** Uitkomst van een belofte zonder ooit een onafgehandelde afwijzing te laten liggen. */
function track<T>(p: Promise<T>) {
  const state: { status: 'wacht' | 'opgelost' | 'afgewezen'; value?: T; error?: unknown } = { status: 'wacht' };
  p.then(
    (value) => Object.assign(state, { status: 'opgelost', value }),
    (error: unknown) => Object.assign(state, { status: 'afgewezen', error })
  );
  return state;
}

// ── filesTx ─────────────────────────────────────────────────────────────────

describe('filesTx', () => {
  it('wijst af als het verzoek slaagt maar het vastleggen afbreekt met QuotaExceededError', async () => {
    fake.plan.commit = 'quota';
    const p = filesTx('readwrite', (s) => s.put(record()));
    await expect(p).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(fake.records.size).toBe(0); // er staat echt niets
    expect(fake.openConnections()).toBe(0);
  });

  it('lost niet op tussen het geslaagde verzoek en het afbreken', async () => {
    fake.plan.commit = 'handmatig';
    const state = track(filesTx('readwrite', (s) => s.put(record())));
    await vi.waitFor(() => expect(fake.transactions[0]?.requestDone).toBe(true));
    await new Promise((r) => setTimeout(r, 20)); // alle lopende taken en microtaken afwerken
    // Het verzoek is geslaagd, maar er is nog niets vastgelegd: nog geen uitkomst.
    expect(state.status).toBe('wacht');
    fake.transactions[0].finish('abort', new DOMException('Quota overschreden', 'QuotaExceededError'));
    await vi.waitFor(() => expect(state.status).toBe('afgewezen'));
    expect(state.error).toMatchObject({ name: 'QuotaExceededError' });
    expect(fake.openConnections()).toBe(0);
  });

  it('lost bij een gewone vastlegging op met het resultaat van het verzoek', async () => {
    await expect(filesTx('readwrite', (s) => s.put(record('m_twee')))).resolves.toBe('m_twee');
    expect(fake.records.has('m_twee')).toBe(true);
    const got = await filesTx<FileRecord | undefined>('readonly', (s) => s.get('m_twee') as IDBRequest<FileRecord | undefined>);
    expect(got?.name).toBe('foto.png');
    await expect(filesTx('readwrite', (s) => s.delete('m_twee'))).resolves.toBeUndefined();
    expect(fake.records.size).toBe(0);
    expect(fake.openConnections()).toBe(0);
  });

  it('wijst af met de fout van het verzoek als dat zelf mislukt', async () => {
    fake.plan.requestFails = true;
    await expect(filesTx('readwrite', (s) => s.put(record()))).rejects.toMatchObject({ name: 'ConstraintError' });
    expect(fake.records.size).toBe(0);
    expect(fake.openConnections()).toBe(0);
  });

  it('wijst af met een echte fout, ook als de transactie zonder foutobject afbreekt', async () => {
    fake.plan.commit = 'abort-zonder-fout';
    const err = await filesTx('readwrite', (s) => s.put(record())).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(fake.records.size).toBe(0);
  });

  it('wijst af en sluit de db als het verzoek niet aangemaakt kan worden', async () => {
    const err = await filesTx('readwrite', () => {
      throw new DOMException('Ongeldige sleutel', 'DataError');
    }).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: 'DataError' });
    expect(fake.openConnections()).toBe(0);
  });

  it('wijst af als IndexedDB niet opent', async () => {
    fake.plan.open = 'error';
    await expect(filesTx('readonly', (s) => s.get('x'))).rejects.toMatchObject({ name: 'UnknownError' });
  });
});

// ── openFilesDb ─────────────────────────────────────────────────────────────

describe('openFilesDb', () => {
  it(`wijst af na ${OPEN_TIMEOUT_MS} ms als open nooit antwoordt, en sluit een late verbinding meteen`, async () => {
    vi.useFakeTimers();
    fake.plan.open = 'hang';
    const state = track(openFilesDb());
    await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS - 1);
    expect(state.status).toBe('wacht');
    await vi.advanceTimersByTimeAsync(1);
    expect(state.status).toBe('afgewezen');
    expect(state.error).toBeInstanceOf(Error);
    expect((state.error as Error).message).toBe('IndexedDB antwoordt niet');
    // Het antwoord komt toch nog: die verbinding mag niet blijven openstaan.
    const late = fake.succeedLate(fake.openRequests[0]);
    expect(late.closed).toBe(true);
    expect(state.status).toBe('afgewezen');
  });

  it('filesTx valt bij een hangende open ook na de tijdslimiet af', async () => {
    vi.useFakeTimers();
    fake.plan.open = 'hang';
    const state = track(filesTx('readwrite', (s) => s.put(record())));
    await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS);
    expect(state.status).toBe('afgewezen');
  });

  it('ruimt de tijdslimiet op na een geslaagde opening', async () => {
    vi.useFakeTimers();
    const state = track(openFilesDb());
    await vi.advanceTimersByTimeAsync(0);
    expect(state.status).toBe('opgelost');
    expect(vi.getTimerCount()).toBe(0);
    (state.value as unknown as FakeDb).close();
  });

  it('ruimt de tijdslimiet op na een fout', async () => {
    vi.useFakeTimers();
    fake.plan.open = 'error';
    const state = track(openFilesDb());
    await vi.advanceTimersByTimeAsync(0);
    expect(state.status).toBe('afgewezen');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('wijst af als indexedDB.open zelf gooit', async () => {
    fake.plan.open = 'throw';
    await expect(openFilesDb()).rejects.toMatchObject({ name: 'SecurityError' });
  });

  it('sluit een verbinding die na "blocked" alsnog opent', async () => {
    fake.plan.open = 'blocked';
    await expect(openFilesDb()).rejects.toThrow('IndexedDB geblokkeerd');
    const late = fake.succeedLate(fake.openRequests[0]);
    expect(late.closed).toBe(true);
  });
});

// ── Samen met de medialaag (echte idb-achterkant, nagemaakte IndexedDB) ────

function memoryStorage(init: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(init));
  return {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, String(v));
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    clear: () => data.clear(),
  } as Storage;
}

function bigDataUrl(bytes = 4096): string {
  let bin = '';
  for (let i = 0; i < bytes; i++) bin += String.fromCharCode((i * 31 + 7) & 0xff);
  return `data:image/png;base64,${btoa(bin)}`;
}

describe('medialaag bij een volle opslag', () => {
  let storage: Storage;
  const dataUrl = bigDataUrl();

  beforeEach(() => {
    storage = memoryStorage({
      'wf.widgets.v1': JSON.stringify([{ id: 'w1', type: 'imageviewer', config: { imageUrl: dataUrl } }]),
    });
    let n = 0;
    // Geen `backend` meegeven: de echte idb-achterkant (filesTx) blijft in gebruik.
    configureMediaStore({
      storage: () => storage,
      createObjectUrl: () => `blob:test/${++n}`,
      revokeObjectUrl: () => {},
      preloadTimeoutMs: 4000,
    });
  });

  it('migrateDataUrls laat de data-URL staan als IndexedDB vol is', async () => {
    fake.plan.commit = 'quota';
    const moved = await migrateDataUrls();
    expect(moved).toBe(0);
    const raw = storage.getItem('wf.widgets.v1') ?? '';
    expect(raw).toContain(dataUrl);
    expect(raw).not.toContain(MEDIA_REF_PREFIX);
    expect(fake.records.size).toBe(0);
    expect(mediaAvailable()).toBe(false);
  });

  it('migrateDataUrls verhuist wél als het vastleggen lukt (controle)', async () => {
    const moved = await migrateDataUrls();
    expect(moved).toBe(1);
    const raw = storage.getItem('wf.widgets.v1') ?? '';
    expect(raw).not.toContain(dataUrl);
    expect(raw).toContain(MEDIA_REF_PREFIX + 'm_');
    expect(fake.records.size).toBe(1);
  });

  it('storeMedia gooit bij een volle opslag, zodat de aanroeper op een data-URL terugvalt', async () => {
    fake.plan.commit = 'quota';
    const blob = new Blob([new Uint8Array([9, 8, 7])], { type: 'image/png' });
    await expect(storeMedia(blob, 'foto.png')).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(mediaAvailable()).toBe(false);
    expect(fake.records.size).toBe(0);
  });
});
