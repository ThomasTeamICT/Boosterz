import { beforeEach, describe, expect, it } from 'vitest';
import { afterEach, vi } from 'vitest';
import {
  aiEndpoint, aiEndpointHost, aiKeyProblem, AISettings, askAI, decideSetupLink, decodeAISetupLink,
  effectiveMaxTokens, encodeAISetupLink, getAISettings, isAllowedBaseUrl, maskAIKey, PROVIDER_INFO,
  readSSE, saveAISettings,
} from './ai';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => { data.clear(); },
  };
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = memoryStorage();
});

describe('AI-instellingen: modellen', () => {
  it('biedt geen Gemini-model aan dat de API niet kent', () => {
    const ids = PROVIDER_INFO.gemini.models.map((m) => m.id);
    expect(ids).not.toContain('gemini-3.1-pro');
    expect(ids).toContain('gemini-pro-latest');
  });

  it('schuift een bewaard, verdwenen model door naar zijn opvolger', () => {
    saveAISettings({ provider: 'gemini', apiKey: 'x', model: 'gemini-3.1-pro' });
    expect(getAISettings().model).toBe('gemini-pro-latest');
  });

  it('laat een geldig bewaard model met rust', () => {
    saveAISettings({ provider: 'gemini', apiKey: 'x', model: 'gemini-3.7-flash' });
    expect(getAISettings().model).toBe('gemini-3.7-flash');
  });
});

describe('readSSE', () => {
  function streamOf(chunks: string[]): Response {
    const enc = new TextEncoder();
    return new Response(new ReadableStream({
      start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close(); },
    }));
  }

  it('leest data-regels, ook over stukgeknipte chunks heen', async () => {
    const got: string[] = [];
    await readSSE(streamOf(['data: {"a":', '1}\n\nda', 'ta: [DONE]\n']), (d) => got.push(d));
    expect(got).toEqual(['{"a":1}', '[DONE]']);
  });

  it('verliest de laatste regel niet als de stroom zonder regeleinde stopt', async () => {
    const got: string[] = [];
    await readSSE(streamOf(['data: {"x":1}\n\n', 'data: {"usage":{"prompt_tokens":5}}']), (d) => got.push(d));
    expect(got).toEqual(['{"x":1}', '{"usage":{"prompt_tokens":5}}']);
  });
});

describe('effectiveMaxTokens', () => {
  it('geeft Gemini ruimte voor het denkwerk: minstens 8192, het dubbele van de vraag, hoogstens 65.536', () => {
    expect(effectiveMaxTokens('gemini', 250)).toBe(8192);
    expect(effectiveMaxTokens('gemini', 16000)).toBe(32000);
    expect(effectiveMaxTokens('gemini', 32000)).toBe(64000);
    expect(effectiveMaxTokens('gemini', 50000)).toBe(65536);
    expect(effectiveMaxTokens('gemini', undefined)).toBe(32000);
  });
  it('laat andere aanbieders ongemoeid', () => {
    expect(effectiveMaxTokens('anthropic', 250)).toBe(250);
    expect(effectiveMaxTokens('openai', undefined)).toBe(16000);
  });
  it('OpenAI: nooit boven de uitvoerlimiet van gpt-4o (16.384)', () => {
    expect(effectiveMaxTokens('openai', 32000)).toBe(16384);
    expect(effectiveMaxTokens('openai', 16384)).toBe(16384);
    expect(effectiveMaxTokens('openai', 250)).toBe(250);
    // eigen aanbieders en Anthropic houden hun gevraagde limiet
    expect(effectiveMaxTokens('custom', 32000)).toBe(32000);
    expect(effectiveMaxTokens('anthropic', 32000)).toBe(32000);
  });
});

describe('askAI: afgekapte antwoorden', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  function sse(lines: string[]): Response {
    const body = lines.map((l) => `data: ${l}\n\n`).join('');
    return new Response(body, { status: 200 });
  }

  it('Gemini: finish_reason "length" wordt een leesbare fout in plaats van een halve zin', async () => {
    saveAISettings({ provider: 'gemini', apiKey: 'x', model: 'gemini-3.7-flash' });
    const fetchMock = vi.fn(async () => sse([
      JSON.stringify({ choices: [{ delta: { content: 'Je bent al goed op weg, want je' } }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }], usage: { prompt_tokens: 80, completion_tokens: 9 } }),
      '[DONE]',
    ]));
    vi.stubGlobal('fetch', fetchMock);
    await expect(askAI({ prompt: 'p', task: 't', maxTokens: 250 })).rejects.toThrow(/afgekapt/);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.max_tokens).toBe(8192);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it('Anthropic: stop_reason "max_tokens" wordt dezelfde fout', async () => {
    saveAISettings({ provider: 'anthropic', apiKey: 'x', model: 'claude-sonnet-5' });
    vi.stubGlobal('fetch', vi.fn(async () => sse([
      JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Half' } }),
      JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'max_tokens' }, usage: { output_tokens: 250 } }),
    ])));
    await expect(askAI({ prompt: 'p', task: 't', maxTokens: 250 })).rejects.toThrow(/afgekapt/);
  });

  it('een normaal beëindigd antwoord komt gewoon terug', async () => {
    saveAISettings({ provider: 'gemini', apiKey: 'x', model: 'gemini-3.7-flash' });
    vi.stubGlobal('fetch', vi.fn(async () => sse([
      JSON.stringify({ choices: [{ delta: { content: 'Goed zo.' } }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      '[DONE]',
    ])));
    await expect(askAI({ prompt: 'p', task: 't' })).resolves.toBe('Goed zo.');
  });
});

// ── Hulpjes voor de aanroeptests ────────────────────────────────────────────

function sseResponse(lines: string[], headers: Record<string, string> = { 'content-type': 'text/event-stream' }): Response {
  return new Response(lines.map((l) => `data: ${l}\n\n`).join(''), { status: 200, headers });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

/** Stroom die na een eerste stukje met de gegeven fout afbreekt. */
function brokenStream(err: unknown): Response {
  const enc = new TextEncoder();
  let n = 0;
  return new Response(new ReadableStream<Uint8Array>({
    pull(c) {
      if (n++ === 0) c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: '{"wid' } }] })}\n\n`));
      else c.error(err);
    },
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function usageLog(): { inputTokens: number; outputTokens: number; keyLabel?: string }[] {
  return JSON.parse(localStorage.getItem('wf.aiusage.v1') ?? '[]');
}

// ── Adres van een eigen aanbieder (AI13) ────────────────────────────────────

describe('isAllowedBaseUrl', () => {
  it('aanvaardt https en http naar dit toestel zelf', () => {
    for (const u of [
      'https://openrouter.ai/api', 'https://x.example', 'https://x.example:8443/pad/', 'HTTPS://Example.com',
      'http://localhost', 'http://localhost/', 'http://localhost:11434', 'http://127.0.0.1:8080/v', '  https://x.example  ',
    ]) expect(isAllowedBaseUrl(u), u).toBe(true);
  });
  it('weigert http naar een ander toestel, adressen zonder schema en trucjes', () => {
    for (const u of [
      undefined, '', '   ', 'openrouter.ai/api', '//aanvaller.example', 'http://aanvaller.example',
      'http://localhost.aanvaller.example', 'http://localhost@aanvaller.example', 'http://localhost:8080@aanvaller.example',
      'http://127.0.0.1.aanvaller.example', 'http://localhost:abc', 'https://', 'https:///pad', 'https://gebruiker:ww@x.example',
      'ftp://x.example', 'javascript:alert(1)', 'https://x.example/api?x=1', 'https://x.example/#a', 'https://x .example',
      'http://[::1]:8080',
    ]) expect(isAllowedBaseUrl(u), String(u)).toBe(false);
  });
});

describe('aiEndpoint', () => {
  it('kent het vaste adres van elke aanbieder', () => {
    expect(aiEndpoint({ provider: 'anthropic' })).toBe('https://api.anthropic.com/v1/messages');
    expect(aiEndpoint({ provider: 'openai' })).toBe('https://api.openai.com/v1/chat/completions');
    expect(aiEndpoint({ provider: 'gemini' })).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    // een achtergebleven baseUrl bij een vaste aanbieder telt niet mee
    expect(aiEndpoint({ provider: 'openai', baseUrl: 'https://aanvaller.example' })).toBe('https://api.openai.com/v1/chat/completions');
  });
  it('eigen aanbieder: basisadres + /v1/chat/completions, zonder dubbele schuine streep', () => {
    expect(aiEndpoint({ provider: 'custom', baseUrl: 'https://openrouter.ai/api//' })).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(aiEndpointHost({ provider: 'custom', baseUrl: 'http://localhost:11434' })).toBe('localhost:11434');
  });
  it('eigen aanbieder zonder of met ongeldig adres: een AIError, geen stil terugvallen op api.openai.com', () => {
    expect(() => aiEndpoint({ provider: 'custom' })).toThrow(/basisadres/);
    expect(() => aiEndpoint({ provider: 'custom', baseUrl: '  ' })).toThrow(/basisadres/);
    expect(() => aiEndpoint({ provider: 'custom', baseUrl: 'openrouter.ai/api' })).toThrow(/https:\/\//);
    expect(() => aiEndpoint({ provider: 'custom', baseUrl: 'http://aanvaller.example' })).toThrow(/https:\/\//);
    expect(aiEndpointHost({ provider: 'custom', baseUrl: 'openrouter.ai/api' })).toBe('');
  });
});

describe('askAI: eigen aanbieder zonder geldig adres', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  for (const baseUrl of [undefined, '', 'openrouter.ai/api', 'http://aanvaller.example']) {
    it(`stuurt de sleutel nergens heen (baseUrl ${JSON.stringify(baseUrl)})`, async () => {
      saveAISettings({ provider: 'custom', apiKey: 'sk-or-v1-geheim', model: 'm', ...(baseUrl === undefined ? {} : { baseUrl }) });
      const fetchMock = vi.fn(async () => sseResponse(['[DONE]']));
      vi.stubGlobal('fetch', fetchMock);
      await expect(askAI({ prompt: 'p', task: 't' })).rejects.toMatchObject({ name: 'AIError' });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it('een geldig adres gaat wel door, naar dat adres', async () => {
    saveAISettings({ provider: 'custom', apiKey: 'sk-or-v1-geheim', model: 'm', baseUrl: 'https://openrouter.ai/api/' });
    const fetchMock = vi.fn(async () => sseResponse([JSON.stringify({ choices: [{ delta: { content: 'OK' } }] }), '[DONE]']));
    vi.stubGlobal('fetch', fetchMock);
    await expect(askAI({ prompt: 'p', task: 't' })).resolves.toBe('OK');
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('https://openrouter.ai/api/v1/chat/completions');
  });
});

// ── Sleutel met een onzichtbaar teken (AI14) ────────────────────────────────

describe('aiKeyProblem en askAI met een kapotte sleutel', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('herkent onzichtbare en niet-ASCII-tekens, maar niet spaties rond de sleutel', () => {
    expect(aiKeyProblem('sk-ant-api03-abcdef')).toBeNull();
    expect(aiKeyProblem('  sk-ant-api03-abcdef \n')).toBeNull();
    expect(aiKeyProblem('')).toBeNull();
    expect(aiKeyProblem('sk-ant-api03-abcdef​')).toMatch(/onzichtbaar of ongeldig teken/);
    expect(aiKeyProblem('sk-ant-api03–abcdef')).toMatch(/Plak hem opnieuw/);
    expect(aiKeyProblem('sk-ant api03')).toMatch(/ongeldig teken/);
    expect(aiKeyProblem('sk-ant-é')).toMatch(/ongeldig teken/);
  });

  it('meldt het vóór de fetch, in plaats van een misleidende netwerkfout', async () => {
    const fetchMock = vi.fn(async () => sseResponse(['[DONE]']));
    vi.stubGlobal('fetch', fetchMock);
    for (const provider of ['anthropic', 'gemini'] as const) {
      saveAISettings({ provider, apiKey: 'sk-ant-api03-abcdef​', model: 'm' });
      await expect(askAI({ prompt: 'p', task: 't' })).rejects.toThrow(/onzichtbaar of ongeldig teken/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── Foutteksten van de aanbieder (AI14) ─────────────────────────────────────

describe('askAI: leesbare fouten bij een mislukte aanvraag', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  async function errorFor(status: number, body: string): Promise<string> {
    saveAISettings({ provider: 'gemini', apiKey: 'test', model: 'gemini-3.7-flash' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })));
    try {
      await askAI({ prompt: 'p', task: 't' });
    } catch (e) {
      return (e as Error).message;
    }
    throw new Error('geen fout');
  }

  it('Gemini: de foutmelding uit een array-antwoord komt door', async () => {
    const msg = await errorFor(400, '[{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}]');
    expect(msg).toBe('De AI-aanvraag mislukte (HTTP 400). API key not valid. Please pass a valid API key.');
  });
  it('een object-antwoord werkt zoals voorheen', async () => {
    expect(await errorFor(400, '{"error":{"message":"Bad model"}}')).toBe('De AI-aanvraag mislukte (HTTP 400). Bad model');
    expect(await errorFor(400, '{"message":"Iets anders"}')).toBe('De AI-aanvraag mislukte (HTTP 400). Iets anders');
  });
  it('een html-foutpagina toont geen opmaakcode', async () => {
    expect(await errorFor(413, '<html><body>Request Entity Too Large</body></html>')).toBe('De AI-aanvraag mislukte (HTTP 413).');
    expect(await errorFor(502, '\n  <!DOCTYPE html><html></html>')).toBe('De AI-aanvraag mislukte (HTTP 502).');
  });
  it('gewone tekst blijft (ingekort) zichtbaar, rare JSON geeft geen [object Object]', async () => {
    expect(await errorFor(500, 'oeps')).toBe('De AI-aanvraag mislukte (HTTP 500). oeps');
    expect(await errorFor(500, '{"error":{"message":{"diep":1}}}')).toBe('De AI-aanvraag mislukte (HTTP 500).');
    expect(await errorFor(500, '[]')).toBe('De AI-aanvraag mislukte (HTTP 500).');
  });
  it('vaste statussen houden hun eigen uitleg', async () => {
    expect(await errorFor(401, '[{"error":{"message":"x"}}]')).toMatch(/API-sleutel is ongeldig/);
    expect(await errorFor(429, '<html></html>')).toMatch(/limiet bereikt/);
  });
});

describe('readSSE: verbinding valt weg', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('een TypeError midden in de stroom wordt een leesbare AIError', async () => {
    await expect(readSSE(brokenStream(new TypeError('network error')), () => {}))
      .rejects.toMatchObject({ name: 'AIError', message: expect.stringMatching(/verbinding viel weg tijdens het antwoord/) });
  });
  it('annuleren blijft een AbortError (geen foutmelding voor de leerkracht)', async () => {
    await expect(readSSE(brokenStream(new DOMException('gestopt', 'AbortError')), () => {}))
      .rejects.toMatchObject({ name: 'AbortError' });
  });
  it('via askAI: de fout komt door en het verbruik wordt toch gelogd', async () => {
    saveAISettings({ provider: 'gemini', apiKey: 'test', model: 'gemini-3.7-flash' });
    vi.stubGlobal('fetch', vi.fn(async () => brokenStream(new TypeError('network error'))));
    await expect(askAI({ prompt: 'p', task: 't' })).rejects.toThrow(/verbinding viel weg/);
    expect(usageLog()).toHaveLength(1);
  });
  it('een fout uit de verwerking zelf (geen TypeError) wordt niet vermomd', async () => {
    const res = sseResponse(['{"a":1}']);
    await expect(readSSE(res, () => { throw new RangeError('stuk'); })).rejects.toThrow(RangeError);
  });
});

// ── Lege of foute antwoorden met status 200 (AI8) ───────────────────────────

describe('askAI: geen stil succes bij een leeg of foutief antwoord', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  beforeEach(() => {
    saveAISettings({ provider: 'custom', apiKey: 'sk-test', model: 'm', baseUrl: 'https://llm.example.test' });
  });

  it('een fout-gebeurtenis in de stroom (bv. OpenRouter zonder tegoed) wordt een AIError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      JSON.stringify({ error: { code: 402, message: 'Insufficient credits. Add more at openrouter.ai/credits' } }),
    ])));
    await expect(askAI({ prompt: 'p', task: 't' })).rejects.toThrow('De AI-dienst meldde een fout: Insufficient credits. Add more at openrouter.ai/credits');
  });
  it('een fout als gewone tekst in plaats van object', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([JSON.stringify({ error: 'Rate limited' })])));
    await expect(askAI({ prompt: 'p', task: 't' })).rejects.toThrow('De AI-dienst meldde een fout: Rate limited');
  });
  it('finish_reason "error" wordt een AIError, ook na wat tekst', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      JSON.stringify({ choices: [{ delta: { content: 'Half' } }] }),
      JSON.stringify({ choices: [{ delta: { content: '' }, finish_reason: 'error' }] }),
      '[DONE]',
    ])));
    await expect(askAI({ prompt: 'p', task: 't' })).rejects.toThrow('De AI-dienst meldde een fout tijdens het genereren.');
  });
  it('fout én finish_reason "error" in één gebeurtenis: de uitleg van de aanbieder wint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      JSON.stringify({ error: { message: 'Provider disconnected' }, choices: [{ delta: { content: '' }, finish_reason: 'error' }] }),
      '[DONE]',
    ])));
    await expect(askAI({ prompt: 'p', task: 't' })).rejects.toThrow(/Provider disconnected/);
  });
  it('een lege stroom wordt "leeg antwoord", geen leeg succes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(['[DONE]'])));
    await expect(askAI({ prompt: 'p', task: 't' })).rejects.toThrow('De AI-dienst gaf een leeg antwoord.');
  });
  it('alleen witruimte telt ook als leeg', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([JSON.stringify({ choices: [{ delta: { content: '  \n' }, finish_reason: 'stop' }] }), '[DONE]'])));
    await expect(askAI({ prompt: 'p', task: 't' })).rejects.toThrow(/leeg antwoord/);
  });
  it('JSON-antwoord zonder stroom: de tekst uit choices[0].message.content komt terug, met verbruik', async () => {
    const deltas: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      choices: [{ message: { content: '{"widgets":[]}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 7 },
    })));
    await expect(askAI({ prompt: 'p', task: 't', onDelta: (d) => deltas.push(d) })).resolves.toBe('{"widgets":[]}');
    expect(deltas).toEqual(['{"widgets":[]}']);
    expect(usageLog()[0]).toMatchObject({ inputTokens: 5, outputTokens: 7 });
  });
  it('JSON-antwoord met charset in het content-type wordt ook herkend', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), {
      status: 200, headers: { 'content-type': 'application/json; charset=utf-8' },
    })));
    await expect(askAI({ prompt: 'p', task: 't' })).resolves.toBe('OK');
  });
  it('JSON-antwoord met een fout (status 200) wordt een AIError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { message: 'No endpoints found for m' } })));
    await expect(askAI({ prompt: 'p', task: 't' })).rejects.toThrow(/No endpoints found/);
  });
  it('JSON-antwoord als array met een fout (Gemini-stijl, status 200)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([{ error: { message: 'API key not valid.' } }])));
    await expect(askAI({ prompt: 'p', task: 't' })).rejects.toThrow(/API key not valid/);
  });
  it('JSON-antwoord zonder tekst wordt "leeg antwoord"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] })));
    await expect(askAI({ prompt: 'p', task: 't' })).rejects.toThrow(/leeg antwoord/);
  });
  it('JSON-antwoord dat geen JSON is: een leesbare fout', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('{kapot')));
    await expect(askAI({ prompt: 'p', task: 't' })).rejects.toThrow(/niet kon lezen/);
  });
  it('JSON-antwoord dat afgekapt werd: dezelfde afkapfout als bij een stroom', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ choices: [{ message: { content: '{"wid' }, finish_reason: 'length' }] })));
    await expect(askAI({ prompt: 'p', task: 't' })).rejects.toThrow(/afgekapt/);
  });
  it('een fout in de tussentijdse weergave breekt het antwoord niet af', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([JSON.stringify({ choices: [{ delta: { content: 'OK' } }] }), '[DONE]'])));
    await expect(askAI({ prompt: 'p', task: 't', onDelta: () => { throw new Error('ui'); } })).resolves.toBe('OK');
  });

  it('Anthropic: een lege stroom wordt ook "leeg antwoord"', async () => {
    saveAISettings({ provider: 'anthropic', apiKey: 'x', model: 'claude-sonnet-5' });
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 12 } } }),
      JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 0 } }),
    ])));
    await expect(askAI({ prompt: 'p', task: 't' })).rejects.toThrow('De AI-dienst gaf een leeg antwoord.');
    expect(usageLog()[0]).toMatchObject({ inputTokens: 12 });
  });
  it('Anthropic: een fout-gebeurtenis toont de uitleg van de aanbieder', async () => {
    saveAISettings({ provider: 'anthropic', apiKey: 'x', model: 'claude-sonnet-5' });
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })])));
    await expect(askAI({ prompt: 'p', task: 't' })).rejects.toThrow('De AI-dienst meldde een fout: Overloaded');
  });
  it('Anthropic: een gewoon antwoord komt terug', async () => {
    saveAISettings({ provider: 'anthropic', apiKey: 'x', model: 'claude-sonnet-5' });
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'OK' } }),
      JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } }),
    ])));
    await expect(askAI({ prompt: 'p', task: 't' })).resolves.toBe('OK');
  });
});

// ── Opslag die weigert (AI15) ───────────────────────────────────────────────

describe('saveAISettings', () => {
  it('geeft true terug als bewaren lukt', () => {
    expect(saveAISettings({ provider: 'anthropic', apiKey: 'k', model: 'claude-sonnet-5' })).toBe(true);
    expect(getAISettings().apiKey).toBe('k');
  });
  it('geeft false terug (en gooit niet) als de opslag vol of geblokkeerd is', () => {
    const store = memoryStorage();
    store.setItem = () => { throw new DOMException('vol', 'QuotaExceededError'); };
    (globalThis as unknown as { localStorage: Storage }).localStorage = store;
    expect(saveAISettings({ provider: 'anthropic', apiKey: 'k', model: 'claude-sonnet-5' })).toBe(false);
  });
});

// ── Instel-links (AI3/V2) ───────────────────────────────────────────────────

describe('instel-link coderen en decoderen', () => {
  it('overleeft de heen-en-terugweg, ook met tekens buiten ASCII', () => {
    const s: AISettings = { provider: 'custom', apiKey: 'sk-abc', model: 'modèle/één', baseUrl: 'https://x.example/api' };
    const code = encodeAISetupLink(s);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeAISetupLink(code)).toEqual(s);
  });
  it('rommel decodeert tot null, niet tot een fout', () => {
    expect(decodeAISetupLink('!!!')).toBeNull();
    expect(decodeAISetupLink('')).toBeNull();
  });
});

describe('decideSetupLink', () => {
  const NONE: AISettings = { provider: 'anthropic', apiKey: '', model: 'claude-sonnet-5' };
  const MINE: AISettings = { provider: 'anthropic', apiKey: 'sk-ant-ECHTE-SLEUTEL-VAN-LEERKRACHT', model: 'claude-sonnet-5' };
  const link = (o: Record<string, unknown>) => decodeAISetupLink(encodeAISetupLink(o as unknown as AISettings));

  it('bewaart automatisch op een toestel zonder sleutel, bij een vaste aanbieder', () => {
    const d = decideSetupLink(link({ provider: 'gemini', apiKey: ' AIzaTest1234567 ', model: 'gemini-3.7-flash' }), NONE, true);
    expect(d).toMatchObject({
      action: 'save',
      settings: { provider: 'gemini', apiKey: 'AIzaTest1234567', model: 'gemini-3.7-flash' },
      providerName: 'Google (Gemini)', host: 'generativelanguage.googleapis.com', replacesKeyLabel: '',
    });
  });

  it('een spatie als bewaarde sleutel telt als geen sleutel', () => {
    const d = decideSetupLink(link({ provider: 'openai', apiKey: 'sk-test-1234567', model: 'gpt-4o' }), { ...NONE, apiKey: '   ' }, true);
    expect(d.action).toBe('save');
  });

  it('vervangt nooit stil een bestaande sleutel: enkel invullen, met het gemaskeerde label', () => {
    const d = decideSetupLink(link({ provider: 'anthropic', apiKey: 'sk-ant-andere-sleutel-9999', model: 'claude-opus-5' }), MINE, true);
    expect(d).toMatchObject({ action: 'prefill', replacesKeyLabel: maskAIKey(MINE.apiKey), host: 'api.anthropic.com' });
    expect(maskAIKey(MINE.apiKey)).toBe('sk-…ACHT');
  });

  it('een eigen aanbieder wordt nooit automatisch bewaard, ook niet op een leeg toestel', () => {
    const d = decideSetupLink(link({ provider: 'custom', apiKey: 'sk-x-123456789', model: 'x', baseUrl: 'https://llm.example/api/' }), NONE, true);
    expect(d).toMatchObject({
      action: 'prefill', host: 'llm.example', replacesKeyLabel: '',
      settings: { provider: 'custom', baseUrl: 'https://llm.example/api' },
    });
  });

  it('weigert een eigen aanbieder zonder geldig adres (de aanval uit de debugronde)', () => {
    for (const baseUrl of ['http://aanvaller.example', 'aanvaller.example', '', undefined, 42, 'http://localhost@aanvaller.example']) {
      for (const current of [NONE, MINE]) {
        const d = decideSetupLink(link({ provider: 'custom', apiKey: 'aanvaller-sleutel', model: 'x', baseUrl }), current, true);
        expect(d.action, String(baseUrl)).toBe('reject');
        if (d.action === 'reject') expect(d.message).toMatch(/eigen aanbieder instellen zonder geldig adres/);
      }
    }
  });

  it('https-aanvaller met bestaande sleutel: enkel invullen, en de host staat in het zicht', () => {
    const d = decideSetupLink(link({ provider: 'custom', apiKey: 'aanvaller-sleutel', model: 'x', baseUrl: 'https://aanvaller.example' }), MINE, true);
    expect(d).toMatchObject({ action: 'prefill', host: 'aanvaller.example', providerName: 'Eigen aanbieder (OpenAI-compatibel)' });
  });

  it('zonder &auto=1 nooit bewaren', () => {
    expect(decideSetupLink(link({ provider: 'anthropic', apiKey: 'sk-ant-1234567890', model: 'claude-sonnet-5' }), NONE, false).action).toBe('prefill');
  });

  it('dezelfde instellingen nog eens openen verandert niets', () => {
    expect(decideSetupLink(link(MINE as unknown as Record<string, unknown>), MINE, true).action).toBe('unchanged');
    const custom: AISettings = { provider: 'custom', apiKey: 'sk-x-123456789', model: 'x', baseUrl: 'https://llm.example/api' };
    expect(decideSetupLink(link({ ...custom, baseUrl: 'https://llm.example/api/' }), custom, true).action).toBe('unchanged');
    // zelfde sleutel, ander model: invullen zonder "vervangt je sleutel"
    const d = decideSetupLink(link({ ...MINE, model: 'claude-opus-5' }), MINE, true);
    expect(d).toMatchObject({ action: 'prefill', replacesKeyLabel: '' });
  });

  it('een baseUrl bij een vaste aanbieder wordt genegeerd', () => {
    const d = decideSetupLink(link({ provider: 'openai', apiKey: 'sk-test-1234567', model: 'gpt-4o', baseUrl: 'https://aanvaller.example' }), NONE, true);
    expect(d.action).toBe('save');
    if (d.action !== 'reject') {
      expect(d.settings.baseUrl).toBeUndefined();
      expect(d.host).toBe('api.openai.com');
    }
  });

  it('zonder model: het standaardmodel van die aanbieder', () => {
    const d = decideSetupLink(link({ provider: 'openai', apiKey: 'sk-test-1234567' }), NONE, true);
    expect(d.action !== 'reject' && d.settings.model).toBe('gpt-4o');
  });

  it('weigert ongeldige of onvolledige links zonder te crashen', () => {
    for (const raw of [
      null, undefined, 'tekst', 42, [], [{ provider: 'anthropic', apiKey: 'k' }], {},
      { provider: 'anthropic' }, { provider: 'anthropic', apiKey: '   ' }, { provider: 'anthropic', apiKey: 12 },
      { apiKey: 'sk-1234567890' }, { provider: 'toString', apiKey: 'sk-1234567890' },
      { provider: 'constructor', apiKey: 'sk-1234567890' }, { provider: '__proto__', apiKey: 'sk-1234567890' },
    ]) {
      const d = decideSetupLink(raw, NONE, true);
      expect(d, JSON.stringify(raw)).toEqual({ action: 'reject', message: 'Deze instel-link is ongeldig of onvolledig.' });
    }
  });

  it('weigert een sleutel met een onzichtbaar teken', () => {
    const d = decideSetupLink(link({ provider: 'anthropic', apiKey: 'sk-ant-123​456', model: 'claude-sonnet-5' }), NONE, true);
    expect(d).toMatchObject({ action: 'reject', message: expect.stringMatching(/onzichtbaar of ongeldig teken/) });
  });
});
