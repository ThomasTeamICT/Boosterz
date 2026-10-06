import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, ImagePlus, TriangleAlert, X } from 'lucide-react';
import { fileToMediaUrl } from '../lib/utils';

// ── Toasts ──────────────────────────────────────────────────────────────────

interface Toast { id: number; text: string; kind: 'info' | 'ok' | 'err' }
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div className="toast-stack" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind === 'ok' ? 'toast-ok' : t.kind === 'err' ? 'toast-err' : ''}`}>
              {t.kind === 'ok' ? <Check size={17} /> : t.kind === 'err' ? <TriangleAlert size={17} /> : null}
              <span>{t.text}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastCtx.Provider>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────

export function Modal({
  title, onClose, children, footer, wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Een inline onClose van de ouder is bij elke render een nieuwe functie: via een ref
  // blijft het effect één keer lopen (anders steelt het bij elke toets de focus).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // De vorige focus leggen we vast vóór de kinderen committen: bij een kind met
  // autoFocus staat de focus in het effect al in de modal.
  const [prev] = useState(() => document.activeElement as HTMLElement | null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key === 'Tab' && ref.current) {
        // eenvoudige focus-trap: alleen wat zichtbaar en bruikbaar is (ook <summary>).
        // De inhoud van een dichte <details> heeft in sommige browsers nog rechthoeken,
        // vandaar de aparte selector (alles behalve de <summary> zelf).
        const els = Array.from(ref.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), summary, [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
        )).filter((el) => el.getClientRects().length > 0 && !el.closest('[hidden], details:not([open]) > :not(summary)'));
        if (els.length === 0) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    // focus in de modal zetten
    setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.btn-icon)');
      el?.focus();
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (prev?.isConnected) prev.focus();
    };
  }, [prev]);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'modal-lg' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: '1.15rem' }}>{title}</h2>
          <button className="btn btn-quiet btn-icon" onClick={onClose} aria-label="Sluiten"><X size={20} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

// ── Bevestiging ─────────────────────────────────────────────────────────────

export function ConfirmModal({
  title, message, confirmLabel = 'Verwijderen', danger = true, onConfirm, onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => { onConfirm(); onClose(); }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}

// ── Formulier-hulpjes ───────────────────────────────────────────────────────

const FORM_TAGS = new Set(['input', 'textarea', 'select']);

/**
 * Label met invoerveld. Het label wordt gekoppeld aan het eerste
 * formulierelement tussen de kinderen, ook als er een hulpregel of knop
 * naast staat. Is het enige kind een component, dan krijgt die de id (hij
 * geeft ze door aan zijn invoerveld). Heeft het veld al een id, dan koppelt
 * het label daaraan.
 */
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const autoId = useId();
  let htmlFor: string | undefined;
  const single = React.Children.count(children) === 1;
  const child = React.Children.map(children, (c) => {
    if (htmlFor || !React.isValidElement(c) || c.type === React.Fragment) return c;
    const el = c as React.ReactElement<{ id?: string }>;
    const koppelbaar = typeof el.type === 'string' ? FORM_TAGS.has(el.type) : single;
    if (!koppelbaar) return c;
    if (el.props.id) {
      htmlFor = el.props.id;
      return c;
    }
    htmlFor = autoId;
    return React.cloneElement(el, { id: autoId });
  });
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {child}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function CheckRow({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="checkbox-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function EmptyState({
  icon, title, children, level = 2,
}: { icon: React.ReactNode; title: string; children?: React.ReactNode; level?: 1 | 2 | 3 }) {
  const Heading = level === 1 ? 'h1' : level === 3 ? 'h3' : 'h2';
  return (
    <div className="empty-state">
      <div className="big" aria-hidden>{icon}</div>
      <Heading>{title}</Heading>
      {children}
    </div>
  );
}

// ── Score-ring ──────────────────────────────────────────────────────────────

export function ScoreRing({ percent, color }: { percent: number; color?: string }) {
  const r = 62;
  const c = 2 * Math.PI * r;
  const clampP = Math.max(0, Math.min(100, percent));
  const col = color ?? (clampP >= 70 ? 'var(--ok)' : clampP >= 45 ? 'var(--warn)' : 'var(--err)');
  return (
    <div className="score-ring" role="img" aria-label={`Score: ${clampP} procent`}>
      <svg width="148" height="148" viewBox="0 0 148 148">
        <circle cx="74" cy="74" r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth="13" />
        <circle
          cx="74" cy="74" r={r} fill="none" stroke={col} strokeWidth="13" strokeLinecap="round"
          strokeDasharray={`${(clampP / 100) * c} ${c}`}
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <div className="val" style={{ color: col }}>{clampP}%</div>
    </div>
  );
}

// ── Afbeelding-kiezer (upload → verkleind → IndexedDB, blob:-URL) ───────────────────────────────────

export function ImagePicker({
  value, onChange, label = 'Afbeelding',
}: { value?: string; onChange: (url: string | undefined) => void; label?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="field">
      <label>{label}</label>
      {value ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <img src={value} alt="" style={{ height: 56, borderRadius: 8, border: '1px solid var(--line)' }} />
          <button className="btn btn-sm btn-ghost" onClick={() => onChange(undefined)}>Verwijderen</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => inputRef.current?.click()}>
            <ImagePlus size={17} /> Afbeelding kiezen…
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          onChange(await fileToMediaUrl(f));
          e.target.value = '';
        }}
      />
    </div>
  );
}

// ── Kopieerknop ─────────────────────────────────────────────────────────────

export function CopyButton({ text, label = 'Kopiëren' }: { text: string; label?: string }) {
  const toast = useToast();
  return (
    <button
      className="btn btn-sm btn-ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast('Gekopieerd naar klembord', 'ok');
        } catch {
          toast('Kopiëren mislukt', 'err');
        }
      }}
    >
      <Copy size={16} /> {label}
    </button>
  );
}
