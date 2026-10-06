// ── AI-laag: rechtstreeks vanuit de browser naar de AI-aanbieder ─────────────
//
// De app blijft 100% client-side: de leerkracht bewaart een eigen API-sleutel
// in de lokale opslag van dit toestel. Aanvragen gaan rechtstreeks van de
// browser naar de gekozen aanbieder; er zit geen eigen server tussen.

const SETTINGS_KEY = 'wf.ai.v1';
const USAGE_KEY = 'wf.aiusage.v1';

export type AIProviderId = 'anthropic' | 'openai' | 'gemini' | 'custom';

export interface AISettings {
  provider: AIProviderId;
  apiKey: string;
  model: string;
  /** Alleen voor 'custom': OpenAI-compatibel basisadres, bv. https://openrouter.ai/api */
  baseUrl?: string;
}

export interface AIUsageEntry {
  at: number;
  /** Korte taakomschrijving, bv. "widgets uit bron" of "cursus uit leerplandoelen". */
  task: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Gemaskeerde sleutel (bv. "AQ.…2NhQ") — zo zie je per sleutel het verbruik op dit toestel. */
  keyLabel?: string;
}

/** Maskeert een sleutel tot een herkenbaar maar onbruikbaar label. */
export function maskAIKey(key: string): string {
  const k = key.trim();
  if (!k) return '';
  if (k.length <= 8) return '••••••';
  return `${k.slice(0, 3)}…${k.slice(-4)}`;
}

export const PROVIDER_INFO: Record<AIProviderId, { name: string; models: { id: string; label: string }[] }> = {
  anthropic: {
    name: 'Anthropic (Claude)',
    models: [
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 — beste prijs-kwaliteit (aanbevolen)' },
      { id: 'claude-fable-5-1', label: 'Claude Fable 5.1 — sterkste model, ±5× duurder' },
      { id: 'claude-opus-5', label: 'Claude Opus 5 — zeer sterk, ±2,5× duurder' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — snelst en goedkoopst' },
    ],
  },
  openai: {
    name: 'OpenAI',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini — voordelig' },
    ],
  },
  gemini: {
    name: 'Google (Gemini)',
    models: [
      { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash — beste prijs-kwaliteit (aanbevolen)' },
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite — zuinigst' },
      { id: 'gemini-pro-latest', label: 'Gemini Pro (nieuwste) — hoogste kwaliteit, duurder' },
    ],
  },
  custom: {
    name: 'Eigen aanbieder (OpenAI-compatibel)',
    models: [],
  },
};

const DEFAULT_SETTINGS: AISettings = { provider: 'anthropic', apiKey: '', model: 'claude-sonnet-5' };

/**
 * Modelnamen die een aanbieder niet (meer) kent, met hun opvolger. Wie zo'n
 * model ooit koos, krijgt anders bij elke AI-stap een 404.
 * - gemini-3.1-pro bestond alleen als gemini-3.1-pro-preview; de alias
 *   gemini-pro-latest volgt voortaan het nieuwste Pro-model.
 */
const RETIRED_MODELS: Record<string, string> = {
  'gemini-3.1-pro': 'gemini-pro-latest',
};

export function getAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const s = JSON.parse(raw) as Partial<AISettings>;
    return {
      provider: s.provider === 'openai' || s.provider === 'gemini' || s.provider === 'custom' ? s.provider : 'anthropic',
      apiKey: typeof s.apiKey === 'string' ? s.apiKey : '',
      model: typeof s.model === 'string' && s.model ? (RETIRED_MODELS[s.model] ?? s.model) : DEFAULT_SETTINGS.model,
      baseUrl: typeof s.baseUrl === 'string' ? s.baseUrl : undefined,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Bewaart de instellingen. Geeft false terug als de opslag van de browser
 * weigert (vol, geblokkeerd of privévenster): de oproeper meldt dat dan,
 * in plaats van dat de pagina met een renderfout stopt.
 */
export function saveAISettings(s: AISettings): boolean {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function hasAIKey(): boolean {
  return getAISettings().apiKey.trim().length > 0;
}

// ── Adres van de aanbieder en controle van de sleutel ───────────────────────

const PROVIDER_ENDPOINTS: Record<Exclude<AIProviderId, 'custom'>, string> = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1/chat/completions',
  // Gemini spreekt het OpenAI-compatibele protocol, maar op een eigen pad
  // (…/v1beta/openai/chat/completions — zonder extra /v1 ervoor).
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
};

/**
 * Mag dit basisadres van een eigen aanbieder de sleutel ontvangen? Alleen
 * https://, of http:// naar dit toestel zelf (localhost of 127.0.0.1, met of
 * zonder poort). Een adres zonder schema zou een relatieve url worden en de
 * sleutel naar de eigen website sturen; http naar een ander toestel stuurt
 * hem onversleuteld over het netwerk.
 */
export function isAllowedBaseUrl(raw: string | undefined): boolean {
  const u = (raw ?? '').trim();
  if (!u || /[\s?#]/.test(u)) return false;
  const https = /^https:\/\/[^/\s]/i.test(u);
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(u);
  if (!https && !local) return false;
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return false;
  }
  // Gebruikersnaam of wachtwoord in het adres: fetch weigert dat, en het
  // verbergt waar de aanvraag echt naartoe gaat.
  if (parsed.username || parsed.password) return false;
  if (parsed.protocol === 'https:') return parsed.hostname.length > 0;
  return parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
}

/**
 * Het volledige adres waar een AI-aanvraag (mét sleutel) naartoe gaat. Voor
 * een eigen aanbieder zonder geldig basisadres volgt een AIError, nog vóór er
 * iets verstuurd wordt.
 */
export function aiEndpoint(s: Pick<AISettings, 'provider' | 'baseUrl'>): string {
  if (s.provider !== 'custom') return PROVIDER_ENDPOINTS[s.provider];
  const base = (s.baseUrl ?? '').trim();
  if (!base) {
    throw new AIError('Vul bij de AI-instellingen het basisadres van je eigen aanbieder in (bv. https://openrouter.ai/api).');
  }
  if (!isAllowedBaseUrl(base)) {
    throw new AIError(
      'Het basisadres van je eigen aanbieder moet met https:// beginnen (of http://localhost voor een model op dit toestel). ' +
      'Pas het aan bij de AI-instellingen.'
    );
  }
  return `${base.replace(/\/+$/, '')}/v1/chat/completions`;
}

/** De host die de sleutel te zien krijgt, bv. "api.anthropic.com"; leeg als het adres ongeldig is. */
export function aiEndpointHost(s: Pick<AISettings, 'provider' | 'baseUrl'>): string {
  try {
    return new URL(aiEndpoint(s)).host;
  } catch {
    return '';
  }
}

/**
 * Een sleutel bestaat alleen uit zichtbare ASCII-tekens. Een onzichtbaar teken
 * (bv. een zero-width space uit een chat) of een typografisch streepje laat
 * fetch anders struikelen met een misleidende netwerkfout.
 */
export function aiKeyProblem(key: string): string | null {
  const k = key.trim();
  if (!k) return null;
  return /[^\x21-\x7e]/.test(k) ? 'Je sleutel bevat een onzichtbaar of ongeldig teken. Plak hem opnieuw.' : null;
}

// ── Instel-links ────────────────────────────────────────────────────────────
// Een instel-link draagt aanbieder, model en sleutel in het hash-fragment
// (bereikt dus nooit een server). Omdat iedereen zo'n link kan maken en in
// een gedeelde cursus kan verstoppen, beslist decideSetupLink wat er mag:
// - automatisch bewaren alleen als dit toestel nog GEEN sleutel heeft én de
//   aanbieder geen eigen aanbieder ('custom') is;
// - een eigen aanbieder zonder geldig adres (https:// of http://localhost)
//   wordt geweigerd;
// - in alle andere gevallen enkel invullen: de leerkracht ziet welke sleutel
//   vervangen wordt en waar de nieuwe heen gaat, en kiest zelf.

export function encodeAISetupLink(s: AISettings): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(s))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeAISetupLink(v: string): unknown {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(v.replace(/-/g, '+').replace(/_/g, '/')))));
  } catch {
    return null;
  }
}

const PROVIDER_IDS: readonly AIProviderId[] = ['anthropic', 'openai', 'gemini', 'custom'];

export type SetupLinkDecision =
  | { action: 'reject'; message: string }
  | {
      action: 'save' | 'prefill' | 'unchanged';
      settings: AISettings;
      providerName: string;
      /** Host die de sleutel ontvangt, bv. "api.anthropic.com". */
      host: string;
      /** Gemaskeerde huidige sleutel als de link die vervangt, anders ''. */
      replacesKeyLabel: string;
    };

/**
 * Beslist wat een geopende instel-link met dit toestel mag doen. Puur: leest
 * en schrijft niets, zodat elke regel apart getest kan worden.
 * @param raw     de gedecodeerde inhoud van de link (onvertrouwd)
 * @param current de instellingen die nu op dit toestel bewaard zijn
 * @param auto    de link vraagt om meteen te bewaren (&auto=1)
 */
export function decideSetupLink(raw: unknown, current: AISettings, auto: boolean): SetupLinkDecision {
  const invalid: SetupLinkDecision = { action: 'reject', message: 'Deze instel-link is ongeldig of onvolledig.' };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid;
  const s = raw as Record<string, unknown>;
  const provider = PROVIDER_IDS.find((p) => p === s.provider);
  const apiKey = typeof s.apiKey === 'string' ? s.apiKey.trim() : '';
  if (!provider || !apiKey) return invalid;
  if (aiKeyProblem(apiKey)) {
    return { action: 'reject', message: 'De sleutel in deze instel-link bevat een onzichtbaar of ongeldig teken.' };
  }
  let baseUrl: string | undefined;
  if (provider === 'custom') {
    const b = typeof s.baseUrl === 'string' ? s.baseUrl.trim() : '';
    if (!isAllowedBaseUrl(b)) {
      return {
        action: 'reject',
        message: 'Deze instel-link wil een eigen aanbieder instellen zonder geldig adres. ' +
          'Alleen een adres dat met https:// begint (of http://localhost) is toegestaan.',
      };
    }
    baseUrl = b.replace(/\/+$/, '');
  }
  const model = typeof s.model === 'string' && s.model.trim()
    ? s.model.trim()
    : (PROVIDER_INFO[provider].models[0]?.id ?? '');
  const settings: AISettings = { provider, apiKey, model, ...(baseUrl ? { baseUrl } : {}) };
  const currentKey = current.apiKey.trim();
  const shown = {
    settings,
    providerName: PROVIDER_INFO[provider].name,
    host: aiEndpointHost(settings),
    replacesKeyLabel: currentKey && currentKey !== apiKey ? maskAIKey(currentKey) : '',
  };
  const sameAsCurrent = currentKey === apiKey && current.provider === provider && current.model === model &&
    (provider !== 'custom' || (current.baseUrl ?? '').trim().replace(/\/+$/, '') === baseUrl);
  if (sameAsCurrent) return { action: 'unchanged', ...shown };
  if (auto && !currentKey && provider !== 'custom') return { action: 'save', ...shown };
  return { action: 'prefill', ...shown };
}

// ── Gebruikslog (kostentransparantie) ────────────────────────────────────────

export function getAIUsage(): AIUsageEntry[] {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    return raw ? (JSON.parse(raw) as AIUsageEntry[]) : [];
  } catch {
    return [];
  }
}

function logUsage(entry: AIUsageEntry) {
  try {
    const all = getAIUsage();
    all.unshift(entry);
    localStorage.setItem(USAGE_KEY, JSON.stringify(all.slice(0, 200)));
  } catch {
    /* log is nice-to-have */
  }
}

export function clearAIUsage() {
  localStorage.removeItem(USAGE_KEY);
}

// ── Fouten ──────────────────────────────────────────────────────────────────

export class AIError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'AIError';
  }
}

function friendlyError(status: number, body: string): AIError {
  if (status === 401 || status === 403) {
    return new AIError('De API-sleutel is ongeldig of geeft geen toegang. Controleer de sleutel bij de AI-instellingen.', status);
  }
  if (status === 404) {
    return new AIError('Het gekozen model bestaat niet (meer) bij deze aanbieder. Kies een ander model bij de AI-instellingen.', status);
  }
  if (status === 429) {
    return new AIError('De aanbieder geeft aan dat de limiet bereikt is (te veel aanvragen of tegoed op). Probeer het zo dadelijk opnieuw.', status);
  }
  if (status === 529 || status === 503) {
    return new AIError('De AI-dienst is tijdelijk overbelast. Probeer het over een minuutje opnieuw.', status);
  }
  let detail: unknown = '';
  // Een html-pagina (bv. een foutpagina van een proxy) is geen bruikbare uitleg.
  if (!body.trimStart().startsWith('<')) {
    try {
      const j = JSON.parse(body);
      // Gemini's OpenAI-laag antwoordt soms met een array: [{"error":{…}}].
      detail = Array.isArray(j) ? j[0]?.error?.message : (j?.error?.message ?? j?.message);
    } catch {
      detail = body.slice(0, 200);
    }
  }
  const text = typeof detail === 'string' ? detail.trim() : '';
  return new AIError(`De AI-aanvraag mislukte (HTTP ${status}). ${text}`.trim(), status);
}

// ── Kernaanroep met streaming ───────────────────────────────────────────────

export interface AskAIOptions {
  /** Systeeminstructie (rol/kader). */
  system?: string;
  /** De eigenlijke opdracht + bronmateriaal. */
  prompt: string;
  maxTokens?: number;
  /** Korte taaknaam voor de gebruikslog. */
  task: string;
  /** Wordt aangeroepen met elk stukje tekst zodra het binnenkomt. */
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
}

/**
 * Stelt één vraag aan het geconfigureerde model en geeft de volledige
 * tekstuitvoer terug. Streamt tussentijds via onDelta zodat de leerkracht
 * ziet dat er gewerkt wordt. Gooit AIError met een leesbare uitleg.
 */
export async function askAI(opts: AskAIOptions): Promise<string> {
  const s = getAISettings();
  if (!s.apiKey.trim()) {
    throw new AIError('Er is nog geen API-sleutel ingesteld. Ga naar de AI-instellingen om er één toe te voegen.');
  }
  const keyProblem = aiKeyProblem(s.apiKey);
  if (keyProblem) throw new AIError(keyProblem);
  if (s.provider === 'anthropic') return askAnthropic(s, opts);
  return askOpenAICompatible(s, opts);
}

const EMPTY_ANSWER = 'De AI-dienst gaf een leeg antwoord.';

/** Fout die de aanbieder midden in een antwoord meldt (in de stroom of in JSON). */
function providerError(err: unknown): AIError {
  const msg = typeof err === 'string' ? err : (err as { message?: unknown } | null)?.message;
  return new AIError(typeof msg === 'string' && msg.trim()
    ? `De AI-dienst meldde een fout: ${msg.trim()}`
    : 'De AI-dienst meldde een fout tijdens het genereren.');
}

async function askAnthropic(s: AISettings, opts: AskAIOptions): Promise<string> {
  const url = aiEndpoint(s);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal: opts.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': s.apiKey.trim(),
        'anthropic-version': '2023-06-01',
        // Nodig om rechtstreeks vanuit de browser te mogen aanroepen (CORS).
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: s.model,
        max_tokens: opts.maxTokens ?? 16000,
        // De systeeminstructie (rol + vraagschema) is per taak identiek, terwijl
        // het bronmateriaal in de gebruikersvraag varieert. Caching van dat
        // stabiele voorstuk maakt een tweede generatie in dezelfde reeks fors
        // goedkoper — precies het patroon van een leerkracht die genereert,
        // nakijkt en opnieuw genereert.
        cache_control: { type: 'ephemeral' },
        system: opts.system,
        messages: [{ role: 'user', content: opts.prompt }],
        stream: true,
      }),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AIError('Kon de AI-dienst niet bereiken. Controleer de internetverbinding (of een adblocker die api.anthropic.com blokkeert).');
  }
  if (!res.ok) throw friendlyError(res.status, await res.text().catch(() => ''));

  let full = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let refused = false;
  let truncated = false;
  try {
    await readSSE(res, (data) => {
      try {
        const ev = JSON.parse(data);
        if (ev.type === 'message_start') inputTokens = ev.message?.usage?.input_tokens ?? 0;
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          full += ev.delta.text;
          opts.onDelta?.(ev.delta.text);
        }
        if (ev.type === 'message_delta' && ev.usage?.output_tokens) outputTokens = ev.usage.output_tokens;
        if (ev.type === 'message_delta' && ev.delta?.stop_reason === 'refusal') {
          refused = true;
        }
        if (ev.type === 'message_delta' && ev.delta?.stop_reason === 'max_tokens') truncated = true;
        if (ev.type === 'error') throw providerError(ev.error);
      } catch (e) {
        if (e instanceof AIError) throw e;
        /* niet-JSON regels negeren */
      }
    });
  } finally {
    // Ook geannuleerde of halverwege mislukte aanvragen loggen: de
    // invoertokens zijn dan al aangerekend door de aanbieder.
    if (outputTokens === 0 && full) outputTokens = Math.round(full.length / 4);
    logUsage({ at: Date.now(), task: opts.task, model: s.model, inputTokens, outputTokens, keyLabel: maskAIKey(s.apiKey) });
  }
  if (refused) {
    throw new AIError(
      'Het model heeft deze aanvraag geweigerd. Herformuleer je opdracht of bronmateriaal; ' +
      'blijft het misgaan, probeer dan een ander model bij de AI-instellingen.'
    );
  }
  if (truncated) throw truncatedError();
  if (!full.trim()) throw new AIError(EMPTY_ANSWER);
  return full;
}

/** Uitvoerlimiet van gpt-4o en gpt-4o-mini volgens de documentatie van OpenAI. */
const OPENAI_MAX_OUTPUT_TOKENS = 16384;

/**
 * Tokenlimiet per aanvraag. Gemini 3.x-modellen denken eerst na, en dat
 * denkwerk telt mee in max_tokens: met de krappe limiet van een korte taak
 * (bv. 250 voor een feedbackvoorstel) bleef er soms maar een handvol woorden
 * over voor het antwoord. Een hogere limiet kost niets extra (de aanbieder
 * rekent alleen verbruikte tokens aan); Gemini's eigen denkbudget op nul
 * zetten wordt door die modellen genegeerd. Plafond: 65.536 uitvoertokens.
 *
 * OpenAI weigert een aanvraag met een max_tokens boven de uitvoerlimiet van
 * het model (16.384 voor gpt-4o en gpt-4o-mini); de grote cursustaken vragen
 * 32.000, dus die limiet wordt daar het plafond.
 */
export function effectiveMaxTokens(provider: AIProviderId, requested: number | undefined): number {
  const wanted = requested ?? 16000;
  if (provider === 'openai') return Math.min(wanted, OPENAI_MAX_OUTPUT_TOKENS);
  if (provider !== 'gemini') return wanted;
  return Math.min(65536, Math.max(8192, wanted * 2));
}

/** Leesbare fout als de aanbieder het antwoord afkapte op de tokenlimiet. */
function truncatedError(): AIError {
  return new AIError(
    'Het antwoord van de AI werd afgekapt omdat het te lang werd. Probeer het opnieuw, vraag minder tegelijk ' +
    '(bv. minder widgettypes of een kleiner stuk tekst), of kies een ander model bij de AI-instellingen.'
  );
}

async function askOpenAICompatible(s: AISettings, opts: AskAIOptions): Promise<string> {
  // Vóór de fetch: een eigen aanbieder zonder geldig adres stuurt de sleutel
  // nergens heen (AIError uit aiEndpoint).
  const url = aiEndpoint(s);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal: opts.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${s.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: s.model,
        max_tokens: effectiveMaxTokens(s.provider, opts.maxTokens),
        messages: [
          ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
          { role: 'user', content: opts.prompt },
        ],
        stream: true,
        // Zonder deze optie melden OpenAI én Gemini geen tokenverbruik in de
        // stream, en toont het kostenlogboek nul invoertokens. Eigen aanbieders
        // krijgen ze niet: niet elke OpenAI-kloon aanvaardt het veld.
        ...(s.provider === 'openai' || s.provider === 'gemini' ? { stream_options: { include_usage: true } } : {}),
      }),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AIError('Kon de AI-dienst niet bereiken. Controleer de internetverbinding en het basisadres van de aanbieder.');
  }
  if (!res.ok) throw friendlyError(res.status, await res.text().catch(() => ''));

  let full = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let blocked = false;
  let truncated = false;
  /** Verwerkt één stuk antwoord: een stroomgebeurtenis of het hele JSON-antwoord. */
  const handle = (raw: unknown): void => {
    // Gemini's OpenAI-laag verpakt een fout soms in een array: [{"error":{…}}].
    if (Array.isArray(raw)) return handle(raw[0]);
    if (!raw || typeof raw !== 'object') return;
    const ev = raw as {
      error?: unknown;
      choices?: { finish_reason?: unknown; delta?: { content?: unknown }; message?: { content?: unknown } }[];
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
    };
    // Sommige aanbieders (bv. OpenRouter) melden een fout met status 200,
    // als gebeurtenis in de stroom of als JSON-antwoord.
    if (ev.error) throw providerError(ev.error);
    const choice = Array.isArray(ev.choices) ? ev.choices[0] : undefined;
    const finish = choice?.finish_reason;
    if (finish === 'error') throw providerError(null);
    if (finish === 'content_filter' || finish === 'safety') blocked = true;
    if (finish === 'length' || finish === 'max_tokens') truncated = true;
    const text = choice?.delta?.content ?? choice?.message?.content;
    if (typeof text === 'string' && text) {
      full += text;
      try {
        opts.onDelta?.(text);
      } catch {
        /* een fout in de tussentijdse weergave breekt het antwoord niet af */
      }
    }
    if (ev.usage && typeof ev.usage === 'object') {
      if (typeof ev.usage.prompt_tokens === 'number') inputTokens = ev.usage.prompt_tokens;
      if (typeof ev.usage.completion_tokens === 'number') outputTokens = ev.usage.completion_tokens;
    }
  };
  try {
    const contentType = res.headers.get('content-type') ?? '';
    if (/application\/json/i.test(contentType)) {
      // Geen stroom maar één JSON-antwoord (eigen aanbieders die stream negeren).
      let body: string;
      try {
        body = await res.text();
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        throw new AIError(CONNECTION_LOST);
      }
      let ev: unknown;
      try {
        ev = JSON.parse(body);
      } catch {
        throw new AIError('De AI-dienst gaf een antwoord dat de app niet kon lezen.');
      }
      handle(ev);
    } else {
      await readSSE(res, (data) => {
        if (data === '[DONE]') return;
        let ev: unknown;
        try {
          ev = JSON.parse(data);
        } catch {
          return; /* niet-JSON regels negeren */
        }
        handle(ev);
      });
    }
  } finally {
    // Aanbieders zonder usage in de stream (of afgebroken streams): ruw
    // schatten op tekstlengte, zodat het logboek nooit stil onderrapporteert.
    if (outputTokens === 0 && full) outputTokens = Math.round(full.length / 4);
    logUsage({ at: Date.now(), task: opts.task, model: s.model, inputTokens, outputTokens, keyLabel: maskAIKey(s.apiKey) });
  }
  if (blocked) {
    throw new AIError(
      'Het model blokkeerde deze aanvraag (inhoudsfilter van de aanbieder). Herformuleer je ' +
      'opdracht of bronmateriaal, of probeer een ander model bij de AI-instellingen.'
    );
  }
  if (truncated) throw truncatedError();
  if (!full.trim()) throw new AIError(EMPTY_ANSWER);
  return full;
}

const CONNECTION_LOST = 'De verbinding viel weg tijdens het antwoord. Probeer het opnieuw.';

/** Leest een SSE-stroom en roept onData aan per "data:"-regel. */
export async function readSSE(res: Response, onData: (data: string) => void): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new AIError(EMPTY_ANSWER);
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch (e) {
      // Netwerk halverwege weg: de browser gooit een TypeError ("network
      // error"). Annuleren (AbortError) en andere fouten gaan ongewijzigd door.
      if (e instanceof TypeError) throw new AIError(CONNECTION_LOST);
      throw e;
    }
    const { done, value } = chunk;
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith('data:')) onData(t.slice(5).trim());
    }
  }
  // Een stroom die eindigt zonder afsluitend regeleinde: de laatste regel
  // (vaak het tokenverbruik of het slot van de tekst) niet laten vallen.
  const rest = (buffer + decoder.decode()).trim();
  if (rest.startsWith('data:')) onData(rest.slice(5).trim());
}

// ── JSON uit modeluitvoer halen ─────────────────────────────────────────────

/**
 * Haalt het eerste JSON-object of de eerste JSON-array uit modeluitvoer.
 * Verdraagt ```json-hekken en tekst er omheen zónder de inhoud aan te raken:
 * de gebalanceerde scanner begint bij de eerste { of [ en respecteert
 * strings, dus backticks BINNEN stringwaarden blijven intact.
 */
export function extractJson(text: string): unknown {
  const raw = text.trim();
  // snelle poging: alles is al JSON
  try {
    return JSON.parse(raw);
  } catch {
    /* verder zoeken */
  }
  const start = raw.search(/[{[]/);
  if (start < 0) throw new AIError('De AI gaf geen bruikbare JSON terug. Probeer het opnieuw.');
  const open = raw[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        const candidate = raw.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          throw new AIError('De AI gaf JSON terug die niet ontleed kon worden. Probeer het opnieuw.');
        }
      }
    }
  }
  throw new AIError('De JSON in het AI-antwoord was onvolledig (mogelijk te lang afgekapt). Probeer het opnieuw of vraag minder tegelijk.');
}

/** Som van het gelogde gebruik, voor de instellingenpagina. */
export function usageTotals(): { calls: number; inputTokens: number; outputTokens: number } {
  const all = getAIUsage();
  return {
    calls: all.length,
    inputTokens: all.reduce((a, u) => a + u.inputTokens, 0),
    outputTokens: all.reduce((a, u) => a + u.outputTokens, 0),
  };
}
