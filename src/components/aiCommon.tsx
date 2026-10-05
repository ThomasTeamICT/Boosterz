import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { hasAIKey } from '../lib/ai';
import { AIIcon, SettingsIcon, WarningIcon } from './icons';

/**
 * Poortje voor AI-functies: toont de kinderen alleen als er een API-sleutel
 * is; anders een vriendelijke uitleg met link naar de instellingen. `uitleg` vervangt de standaardtekst (over widgets
 * en cursussen) door een zin die bij de plek past, bv. bij de leerplannen.
 */
export function AIGate({ children, uitleg }: { children: React.ReactNode; uitleg?: React.ReactNode }) {
  if (hasAIKey()) return <>{children}</>;
  return (
    <div className="card" style={{ padding: 18, textAlign: 'center', display: 'grid', gap: 8, justifyItems: 'center' }}>
      <div aria-hidden><AIIcon size={32} /></div>
      <strong>AI-assistent nog niet ingesteld</strong>
      <p className="hint" style={{ maxWidth: 420, margin: 0 }}>
        {uitleg ?? (
          <>
            Voeg één keer een API-sleutel toe (Google Gemini, Anthropic of OpenAI) — of open de
            instel-link die je van je beheerder kreeg — en maak daarna in enkele seconden widgets
            en cursussen uit je eigen bronmateriaal. De sleutel blijft op dit toestel.
          </>
        )}
      </p>
      <Link to="/ai-instellingen" className="btn btn-primary"><SettingsIcon size={18} aria-hidden /> AI instellen</Link>
    </div>
  );
}

/**
 * Toont live wat de AI aan het schrijven is (meestromende tekst) met een
 * annuleerknop. Puur presentatie: de aanroeper beheert de stream.
 */
export function AIWorkingBox({
  streamText, label = 'De AI schrijft…', onCancel,
}: { streamText: string; label?: string; onCancel?: () => void }) {
  const boxRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [streamText]);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="ai-pulse" aria-hidden><AIIcon size={18} /></span>
        <strong aria-live="polite">{label}</strong>
        <span style={{ flex: 1 }} />
        {onCancel && (
          <button className="btn btn-sm btn-ghost" onClick={onCancel}>Annuleren</button>
        )}
      </div>
      <pre
        ref={boxRef}
        style={{
          maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          background: 'var(--bg-sunken)', border: '1px solid var(--line)', borderRadius: 10,
          padding: 12, margin: 0, fontSize: '0.78rem', opacity: 0.8,
        }}
        aria-hidden
      >
        {streamText || '…'}
      </pre>
    </div>
  );
}

/** Nette foutweergave voor AI-aanroepen. */
export function AIErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      style={{
        border: '1px solid var(--err)', borderRadius: 10, padding: '10px 14px',
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
      }}
    >
      <WarningIcon aria-hidden />
      <span style={{ flex: 1, minWidth: 200 }}>{error}</span>
      {onRetry && <button className="btn btn-sm" onClick={onRetry}>Opnieuw proberen</button>}
    </div>
  );
}

/** Kleine herbruikbare "gemaakt met AI, kijk na"-melding boven previews. */
export function AIReviewNote() {
  return (
    <p className="hint" style={{ margin: 0 }}>
      <AIIcon size={16} className="icon-inline" aria-hidden /> Dit is een AI-voorzet. <strong>Kijk alles na voor je het gebruikt</strong> — jij blijft
      de leerkracht; de AI kan zich vergissen.
    </p>
  );
}
