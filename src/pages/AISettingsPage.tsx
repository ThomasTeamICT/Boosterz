import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EyeOff, KeyRound, Loader2, Plug } from 'lucide-react';
import {
  AIProviderId,
  AISettings,
  PROVIDER_INFO,
  askAI,
  clearAIUsage,
  decideSetupLink,
  decodeAISetupLink,
  encodeAISetupLink,
  getAISettings,
  getAIUsage,
  isAllowedBaseUrl,
  maskAIKey,
  saveAISettings,
  usageTotals,
} from '../lib/ai';
import { AIErrorBox } from '../components/aiCommon';
import { CheckRow, ConfirmModal, CopyButton, Field, useToast } from '../components/ui';
import {
  AIIcon, CheckIcon, DeleteIcon, LinkIcon, PreviewIcon, PrivacyIcon, ResultsIcon, WarningIcon,
} from '../components/icons';
import { formatDate } from '../lib/utils';
import '../styles/editor.css';

// ── Instel-links: instellingen (incl. sleutel) delen met een testgroep ──────
// De link gebruikt het hash-fragment, dus de sleutel bereikt nooit een server;
// bij het openen wordt hij meteen uit de adresbalk verwijderd. Wat een link
// mag (bewaren, enkel invullen of weigeren) beslist decideSetupLink in ai.ts.

const SAVE_FAILED = 'Bewaren lukte niet: de opslag van deze browser is vol of geblokkeerd. Er is niets gewijzigd.';

/** Wat de pagina toont nadat een instel-link geopend werd. */
type LinkNotice =
  | { kind: 'rejected'; message: string }
  | {
      kind: 'saved' | 'prefill' | 'unchanged';
      providerName: string;
      host: string;
      /** Gemaskeerde sleutel die de link zou vervangen, of ''. */
      replacesKeyLabel: string;
      /** Gemaskeerde sleutel uit de link. */
      keyLabel: string;
    };

/** Nette getallen in Vlaamse notatie (1 234 567). */
function num(n: number): string {
  return n.toLocaleString('nl-BE');
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        flex: '1 1 140px', background: 'var(--bg-sunken)', border: '1px solid var(--line)',
        borderRadius: 'var(--radius-m)', padding: '12px 16px',
      }}
    >
      <div style={{ fontSize: '1.55rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{num(value)}</div>
      <div className="hint" style={{ marginTop: 2 }}>{label}</div>
    </div>
  );
}

type TestResult = { ok: true; model: string } | { ok: false; error: string };

/**
 * Instellingenpagina voor de AI-assistent: verbinding (aanbieder, sleutel,
 * model), gebruikslog met kostentransparantie, privacy-afspraken en het
 * verwijderen van de sleutel. Alles blijft in de browser van dit toestel.
 */
export function AISettingsPage() {
  const toast = useToast();
  const [saved, setSaved] = useState<AISettings>(() => getAISettings());
  const [form, setForm] = useState<AISettings>(() => getAISettings());
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [confirm, setConfirm] = useState<null | 'log' | 'key'>(null);
  // dwingt herlezen van het gebruikslog af (na test of wissen)
  const [, setTick] = useState(0);
  const bump = () => setTick((x) => x + 1);

  const providerModels = PROVIDER_INFO[form.provider].models;

  // Instel-link geopend? De sleutel meteen uit de adresbalk halen en
  // decideSetupLink laten beslissen: automatisch bewaren mag alleen op een
  // toestel zonder sleutel en niet voor een eigen aanbieder; anders enkel
  // invullen (bewaren blijft dan een bewuste klik) of weigeren.
  const [searchParams, setSearchParams] = useSearchParams();
  const [linkNotice, setLinkNotice] = useState<LinkNotice | null>(null);
  const [autoLink, setAutoLink] = useState(true);
  // Ook een link die opengaat terwijl deze pagina al openstaat, wordt verwerkt
  // (anders bleef de sleutel in de adresbalk staan). De ref voorkomt dat
  // StrictMode in ontwikkeling dezelfde link twee keer verwerkt.
  const lastLink = useRef<string | null>(null);
  useEffect(() => {
    const raw = searchParams.get('setup');
    if (!raw) {
      lastLink.current = null;
      return;
    }
    if (lastLink.current === raw) return;
    lastLink.current = raw;
    const auto = searchParams.get('auto') === '1';
    setSearchParams({}, { replace: true });
    const d = decideSetupLink(decodeAISetupLink(raw), getAISettings(), auto);
    if (d.action === 'reject') {
      setLinkNotice({ kind: 'rejected', message: d.message });
      return;
    }
    const shown = {
      providerName: d.providerName,
      host: d.host,
      replacesKeyLabel: d.replacesKeyLabel,
      keyLabel: maskAIKey(d.settings.apiKey),
    };
    if (d.action === 'unchanged') {
      setLinkNotice({ kind: 'unchanged', ...shown });
      return;
    }
    if (d.action === 'save') {
      if (saveAISettings(d.settings)) {
        setSaved(d.settings);
        setForm(d.settings);
        setLinkNotice({ kind: 'saved', ...shown });
        toast('AI-instellingen automatisch bewaard — je kan meteen aan de slag', 'ok');
        return;
      }
      // Opslag weigert: dan enkel invullen, zodat niets stil verloren gaat.
      toast(SAVE_FAILED, 'err');
    }
    setForm(d.settings);
    setLinkNotice({ kind: 'prefill', ...shown });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const patch = (p: Partial<AISettings>) => {
    setForm((f) => ({ ...f, ...p }));
    setTestResult(null);
  };

  const switchProvider = (p: AIProviderId) => {
    setForm((f) => ({
      ...f,
      provider: p,
      // per wissel het standaardmodel van die aanbieder; het eerder bewaarde
      // model terughalen als je terugkeert naar je bewaarde aanbieder
      model: p === saved.provider && saved.model ? saved.model : (PROVIDER_INFO[p].models[0]?.id ?? ''),
      baseUrl: p === 'custom' ? (f.baseUrl ?? saved.baseUrl ?? '') : f.baseUrl,
      // De sleutel van de ene aanbieder nooit meesturen naar een andere: bij
      // een wissel blijft alleen de bewaarde sleutel van die aanbieder staan.
      apiKey: p === saved.provider ? saved.apiKey : '',
    }));
    setTestResult(null);
  };

  /** Opschonen vóór opslag: trims, standaardmodel als noodoplossing. */
  const normalized = (f: AISettings): AISettings => ({
    provider: f.provider,
    apiKey: f.apiKey.trim(),
    model: f.model.trim() || (PROVIDER_INFO[f.provider].models[0]?.id ?? ''),
    baseUrl: f.provider === 'custom' ? ((f.baseUrl ?? '').trim().replace(/\/+$/, '') || undefined) : undefined,
  });

  const doSave = () => {
    const s = normalized(form);
    if (!saveAISettings(s)) {
      toast(SAVE_FAILED, 'err');
      return;
    }
    setSaved(s);
    setForm(s);
    // "nog niet bewaard" klopt niet meer
    setLinkNotice((n) => (n?.kind === 'prefill' ? null : n));
    toast('AI-instellingen bewaard op dit toestel', 'ok');
  };

  const doTest = async () => {
    // askAI leest uit de lokale opslag, dus eerst de huidige invoer bewaren.
    // Lukt dat niet, dan niet testen: de test zou de oude instellingen gebruiken.
    const s = normalized(form);
    if (!saveAISettings(s)) {
      toast(SAVE_FAILED, 'err');
      return;
    }
    setSaved(s);
    setForm(s);
    setLinkNotice((n) => (n?.kind === 'prefill' ? null : n));
    setTesting(true);
    setTestResult(null);
    try {
      await askAI({ prompt: 'Antwoord met precies: OK', task: 'verbindingstest', maxTokens: 20 });
      setTestResult({ ok: true, model: s.model });
    } catch (e) {
      setTestResult({ ok: false, error: (e as Error).message });
    } finally {
      setTesting(false);
      bump(); // gebruikslog kreeg er mogelijk een regel bij
    }
  };

  const removeKey = () => {
    const s: AISettings = { ...normalized(form), apiKey: '' };
    if (!saveAISettings(s)) {
      toast('Verwijderen lukte niet: de opslag van deze browser is geblokkeerd. De sleutel staat er nog.', 'err');
      return;
    }
    setSaved(s);
    setForm(s);
    setShowKey(false);
    setTestResult(null);
    toast('API-sleutel verwijderd van dit toestel', 'ok');
  };

  const wipeLog = () => {
    clearAIUsage();
    bump();
    toast('Gebruikslog gewist', 'ok');
  };

  const totals = usageTotals();
  const usage = getAIUsage().slice(0, 15);
  const hasSavedKey = saved.apiKey.trim().length > 0;

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}><AIIcon aria-hidden /> AI-instellingen</h1>
          <p className="sub">Jouw sleutel, jouw toestel, jouw controle — Boosterz werkt ook prima zonder, de AI-functies schakelen pas in als jij zelf een sleutel instelt.</p>
        </div>
      </div>

      {/* minmax(0, 1fr): een brede gebruikstabel scrolt binnen haar .table-wrap
          in plaats van de hele pagina op 390 pixels breder te maken. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
        {/* ── 1. Verbinding ─────────────────────────────────────────────── */}
        <section className="card card-pad">
          <h2 style={{ marginTop: 0, fontSize: '1.08rem', display: 'flex', alignItems: 'center', gap: 8 }}><KeyRound size={20} aria-hidden /> Verbinding</h2>
          <p style={{ marginTop: 0 }}>
            Je gebruikt je <strong>eigen API-sleutel</strong>; die wordt enkel in de browser van dit
            toestel bewaard. Aanvragen gaan <strong>rechtstreeks van je browser naar de gekozen
            aanbieder</strong> — er zit geen server van Boosterz tussen.
          </p>

          {linkNotice?.kind === 'rejected' && (
            <div className="callout warn" role="alert">
              <WarningIcon aria-hidden />
              <div>
                <strong>Instel-link geweigerd.</strong> {linkNotice.message} Je huidige
                instellingen blijven ongewijzigd.
              </div>
            </div>
          )}
          {linkNotice && linkNotice.kind !== 'rejected' && (
            <div className={linkNotice.kind === 'prefill' ? 'callout warn' : 'callout'}>
              <LinkIcon aria-hidden />
              <div>
                {linkNotice.kind === 'saved' && (
                  <>
                    <strong>Klaar!</strong> De instellingen uit je instel-link zijn bewaard
                    (aanbieder: {linkNotice.providerName}, adres: {linkNotice.host}, sleutel{' '}
                    {linkNotice.keyLabel}). De AI-assistent werkt nu overal in de app. Probeer
                    gerust de <em>Test de verbinding</em>-knop, of ga meteen naar de AI-studio.
                  </>
                )}
                {linkNotice.kind === 'unchanged' && (
                  <>
                    <strong>Deze instel-link is al toegepast.</strong> Dezelfde aanbieder, hetzelfde
                    model en dezelfde sleutel ({linkNotice.keyLabel}) staan al bewaard op dit toestel.
                  </>
                )}
                {linkNotice.kind === 'prefill' && (
                  <>
                    <strong>Instellingen ontvangen via een instel-link, nog niet bewaard.</strong>{' '}
                    {linkNotice.replacesKeyLabel
                      ? `Deze link vervangt je huidige sleutel (${linkNotice.replacesKeyLabel}). `
                      : 'Alles staat al ingevuld. '}
                    Aanbieder: {linkNotice.providerName}, adres: {linkNotice.host}. Bewaar alleen als
                    je de afzender vertrouwt (ook <em>Test de verbinding</em> bewaart eerst).
                  </>
                )}
              </div>
            </div>
          )}

          <Field label="Aanbieder">
            <select
              className="select"
              value={form.provider}
              onChange={(e) => switchProvider(e.target.value as AIProviderId)}
            >
              {(Object.keys(PROVIDER_INFO) as AIProviderId[]).map((p) => (
                <option key={p} value={p}>{PROVIDER_INFO[p].name}</option>
              ))}
            </select>
          </Field>

          <Field
            label="API-sleutel"
            hint={hasSavedKey
              ? `Er is al een sleutel bewaard op dit toestel: ${maskAIKey(saved.apiKey)}`
              : 'Nog geen sleutel bewaard. Plak hier je sleutel en klik op Bewaren.'}
          >
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={(e) => patch({ apiKey: e.target.value })}
                placeholder={form.provider === 'anthropic' ? 'sk-ant-…' : form.provider === 'gemini' ? 'AIza…' : 'sk-…'}
                autoComplete="off"
                spellCheck={false}
                style={{ flex: 1 }}
                aria-label="API-sleutel"
              />
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? 'Verberg de API-sleutel' : 'Toon de API-sleutel'}
                aria-pressed={showKey}
                title={showKey ? 'Verberg de API-sleutel' : 'Toon de API-sleutel'}
              >
                {showKey ? <EyeOff size={18} aria-hidden /> : <PreviewIcon size={18} aria-hidden />}
              </button>
            </div>
          </Field>

          {form.provider === 'gemini' && (
            <div className="callout warn">
              <WarningIcon aria-hidden />
              <div>
                <strong>Gratis Gemini-sleutel?</strong> Op de gratis laag van Google AI Studio mag
                Google je invoer gebruiken om zijn producten te verbeteren. Voor schoolgebruik:
                koppel facturatie aan je sleutel (betaalde laag = geen training op je data), of
                stuur alleen materiaal in dat publiek mag zijn. Facturatie koppel je op{' '}
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
                  aistudio.google.com/apikey
                </a>{' '}
                via <em>"Set up billing"</em> naast je project (stel daar ook meteen een budget met
                waarschuwingen in); de kolom <em>Plan</em> toont daarna "Paid". Details:{' '}
                <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">
                  Gemini API-voorwaarden
                </a>.
              </div>
            </div>
          )}

          {form.provider === 'custom' ? (
            <>
              <Field label="Model" hint="De exacte modelnaam zoals je aanbieder die verwacht.">
                <input
                  type="text"
                  value={form.model}
                  onChange={(e) => patch({ model: e.target.value })}
                  placeholder="bv. meta-llama/llama-3.3-70b-instruct"
                  spellCheck={false}
                />
              </Field>
              <Field
                label="Basisadres (OpenAI-compatibel)"
                hint={(form.baseUrl ?? '').trim() && !isAllowedBaseUrl(form.baseUrl)
                  ? 'Dit adres wordt niet gebruikt: het moet met https:// beginnen (of http://localhost voor een model op dit toestel).'
                  : 'Zonder /v1 op het einde — de app vult zelf /v1/chat/completions aan.'}
              >
                <input
                  type="url"
                  value={form.baseUrl ?? ''}
                  onChange={(e) => patch({ baseUrl: e.target.value })}
                  placeholder="bv. https://openrouter.ai/api"
                  spellCheck={false}
                />
              </Field>
            </>
          ) : (
            <Field label="Model">
              <select className="select" value={form.model} onChange={(e) => patch({ model: e.target.value })}>
                {providerModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
                {/* Een bewaard model dat niet (meer) in de lijst staat, blijft zichtbaar:
                    wat de keuzelijst toont, is ook wat de app gebruikt. */}
                {form.model && !providerModels.some((m) => m.id === form.model) && (
                  <option value={form.model}>{form.model} (niet meer in de lijst)</option>
                )}
              </select>
            </Field>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={doSave}>Bewaren</button>
            <button
              className="btn"
              onClick={() => { void doTest(); }}
              disabled={testing || !form.apiKey.trim()}
            >
              {testing ? <><Loader2 size={16} className="icon-inline icon-spin" aria-hidden /> Bezig met testen…</> : <><Plug size={16} aria-hidden /> Test de verbinding</>}
            </button>
          </div>
          <p className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
            De test bewaart eerst je instellingen en stelt daarna één minivraag aan het model.
          </p>

          {testResult && testResult.ok && (
            <div
              role="status"
              style={{
                marginTop: 12, border: '1px solid var(--ok)', background: 'var(--ok-soft)',
                borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center',
              }}
            >
              <CheckIcon aria-hidden style={{ color: 'var(--ok)' }} />
              <span>Verbinding werkt (model {testResult.model}).</span>
            </div>
          )}
          {testResult && !testResult.ok && (
            <div style={{ marginTop: 12 }}>
              <AIErrorBox error={testResult.error} onRetry={() => { void doTest(); }} />
            </div>
          )}

          <p className="hint" style={{ marginTop: 14, marginBottom: 0 }}>
            Waar vind ik een sleutel?{' '}
            <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer">
              console.anthropic.com
            </a>{' '}
            (Anthropic),{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
              aistudio.google.com/apikey
            </a>{' '}
            (Google Gemini) of{' '}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
              platform.openai.com/api-keys
            </a>{' '}
            (OpenAI). Je hebt er een account met wat tegoed nodig.
          </p>

          {saved.apiKey && (
            <>
              <hr className="divider" />
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><LinkIcon size={20} aria-hidden /> Instel-link voor je testgroep</h3>
              <p style={{ marginTop: 0 }}>
                Wil je collega's laten meetesten zonder dat ze zelf iets moeten instellen? Deel
                deze link: wie hem opent, krijgt deze aanbieder, dit model én deze sleutel
                {saved.provider !== 'custom' && autoLink
                  ? '. Op een toestel zonder sleutel wordt alles meteen bewaard; staat er al een sleutel, dan vult de link alleen in en kiest de ontvanger zelf.'
                  : ' al ingevuld, en klikt alleen nog op Bewaren.'}
              </p>
              {saved.provider !== 'custom' && (
                <CheckRow
                  checked={autoLink}
                  onChange={setAutoLink}
                  label="Meteen bewaren bij openen (alleen op een toestel dat nog geen sleutel heeft)"
                />
              )}
              {(() => {
                const auto = autoLink && saved.provider !== 'custom';
                const link = `${window.location.origin}${window.location.pathname}#/ai-instellingen?setup=${encodeAISetupLink(saved)}${auto ? '&auto=1' : ''}`;
                return (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <input
                      className="input input-sm"
                      readOnly
                      value={link}
                      aria-label="Instel-link met sleutel"
                      onFocus={(e) => e.target.select()}
                      style={{ flex: 1 }}
                    />
                    <CopyButton text={link} label="Kopiëren" />
                  </div>
                );
              })()}
              <div className="callout warn" style={{ marginTop: 10 }}>
                <PrivacyIcon aria-hidden />
                <div>
                  <strong>Deze link bevat je API-sleutel.</strong> Deel hem alleen rechtstreeks met
                  mensen die je vertrouwt (je testgroep), nooit in openbare kanalen of chats met
                  veel leden. Uitgetest en klaar? Trek de sleutel dan in bij je aanbieder — dan
                  werkt ook elke gedeelde link niet meer.
                </div>
              </div>
            </>
          )}
        </section>

        {/* ── 2. Gebruik & kosten ───────────────────────────────────────── */}
        <section className="card card-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: '1.08rem', flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}><ResultsIcon size={20} aria-hidden /> Gebruik &amp; kosten</h2>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setConfirm('log')}
              disabled={totals.calls === 0}
            >
              <DeleteIcon size={16} aria-hidden /> Log wissen
            </button>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
            <StatBox label="AI-aanvragen" value={totals.calls} />
            <StatBox label="Invoertokens" value={totals.inputTokens} />
            <StatBox label="Uitvoertokens" value={totals.outputTokens} />
          </div>

          {(() => {
            // Verbruik per (gemaskeerde) sleutel — handig wanneer je met een
            // testgroep meerdere sleutels rond laat gaan.
            const m = new Map<string, { calls: number; inTok: number; outTok: number }>();
            for (const u of getAIUsage()) {
              const k = u.keyLabel ?? 'onbekend';
              const cur = m.get(k) ?? { calls: 0, inTok: 0, outTok: 0 };
              cur.calls++; cur.inTok += u.inputTokens; cur.outTok += u.outputTokens;
              m.set(k, cur);
            }
            const rows = [...m.entries()];
            if (rows.length < 2 && !rows.some(([k]) => k !== 'onbekend')) return null;
            return (
              <div style={{ marginTop: 14 }}>
                <h3 style={{ margin: '0 0 6px', fontSize: '1rem' }}>Per sleutel (op dit toestel)</h3>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Sleutel</th>
                        <th style={{ textAlign: 'right' }}>Aanvragen</th>
                        <th style={{ textAlign: 'right' }}>In</th>
                        <th style={{ textAlign: 'right' }}>Uit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(([k, v]) => (
                        <tr key={k} style={{ cursor: 'default' }}>
                          <td style={{ fontFamily: 'monospace' }}>{k}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(v.calls)}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(v.inTok)}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(v.outTok)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="hint" style={{ margin: '6px 0 0' }}>
                  Dit telt alleen dít toestel. Het totaalverbruik per sleutel (alle testers samen)
                  zie je bij Google zelf: elke sleutel hoort bij een eigen project in{' '}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">AI Studio</a>.
                </p>
              </div>
            );
          })()}

          {usage.length === 0 ? (
            <p className="hint" style={{ marginTop: 14, marginBottom: 0 }}>
              Nog geen AI-aanvragen gedaan op dit toestel.
            </p>
          ) : (
            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Taak</th>
                    <th>Model</th>
                    <th style={{ textAlign: 'right' }}>In</th>
                    <th style={{ textAlign: 'right' }}>Uit</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.map((u, i) => (
                    <tr key={`${u.at}-${i}`} style={{ cursor: 'default' }}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(u.at)}</td>
                      <td>{u.task}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{u.model}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(u.inputTokens)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(u.outputTokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
            Tokens bepalen de kostprijs bij je aanbieder; raadpleeg diens prijzenpagina.
            Grote bronteksten = meer tokens. Hierboven zie je de laatste 15 aanvragen.
          </p>
        </section>

        {/* ── 3. Privacy & goed gebruik ─────────────────────────────────── */}
        <section className="card card-pad">
          <h2 style={{ marginTop: 0, fontSize: '1.08rem', display: 'flex', alignItems: 'center', gap: 8 }}><PrivacyIcon size={20} aria-hidden /> Privacy &amp; goed gebruik</h2>
          <ul style={{ paddingLeft: 20, margin: 0, display: 'grid', gap: 8 }}>
            <li>
              Je sleutel is van <strong>jou</strong> en staat <strong>alleen in deze browser</strong>
              {' '}(localStorage) — ze verlaat dit toestel niet, behalve richting je AI-aanbieder om
              je aanvragen te ondertekenen.
            </li>
            <li>
              <strong>Boosterz blijft volledig bruikbaar zonder sleutel</strong>: alleen de
              AI-functies (AI-studio en de AI-assistent in de editor) staan dan uit.
            </li>
            <li>
              Wat je laat genereren, vertrekt <strong>als tekst naar de gekozen aanbieder</strong>.
              Stuur dus <strong>nooit leerlingnamen of andere leerlinggegevens</strong> mee in
              bronmateriaal of opdrachten.
            </li>
            <li>
              AI-uitvoer is een <strong>voorzet</strong>: jij als leerkracht kijkt alles na en
              beslist wat er met de klas meegaat.
            </li>
            <li>
              De app kent <strong>nergens automatisch punten toe op basis van AI</strong> — scoren
              en beoordelen blijven mensenwerk.
            </li>
          </ul>
        </section>

        {/* ── 4. Sleutel verwijderen ────────────────────────────────────── */}
        <section className="card card-pad">
          <h2 style={{ marginTop: 0, fontSize: '1.08rem', display: 'flex', alignItems: 'center', gap: 8 }}><DeleteIcon size={20} aria-hidden /> Sleutel verwijderen</h2>
          <p style={{ marginTop: 0 }}>
            Verwijder je sleutel van dit toestel — bijvoorbeeld op een gedeelde klascomputer.
            De AI-functies schakelen dan uit tot je opnieuw een sleutel instelt; je aanbieder en
            modelkeuze blijven bewaard.
          </p>
          <button
            className="btn btn-danger"
            onClick={() => setConfirm('key')}
            disabled={!hasSavedKey}
          >
<DeleteIcon size={16} aria-hidden /> Sleutel verwijderen van dit toestel
          </button>
          {!hasSavedKey && (
            <p className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
              Er is momenteel geen sleutel bewaard.
            </p>
          )}
        </section>
      </div>

      {confirm === 'log' && (
        <ConfirmModal
          title="Gebruikslog wissen?"
          message={`Het logboek met ${num(totals.calls)} AI-aanvragen (tijdstip, taak, model en tokens) wordt definitief van dit toestel verwijderd. Dit heeft geen invloed op de facturatie bij je aanbieder.`}
          confirmLabel="Log wissen"
          onConfirm={wipeLog}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === 'key' && (
        <ConfirmModal
          title="API-sleutel verwijderen?"
          message={`De sleutel ${maskAIKey(saved.apiKey)} wordt van dit toestel verwijderd en de AI-functies schakelen uit. Bij je aanbieder blijft de sleutel gewoon bestaan; daar intrekken doe je op diens website.`}
          confirmLabel="Sleutel verwijderen"
          onConfirm={removeKey}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
