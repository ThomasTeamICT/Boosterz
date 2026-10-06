// ── Pdf-viewer met markeerstiften ───────────────────────────────────────────
//
// Volwaardige, client-side pdf-weergave (pdf.js, lazy geladen als eigen chunk):
// - doorlopend scrollen met luie paginarendering (IntersectionObserver)
// - zoom + breedte-passend, paginateller, openen in nieuw tabblad
// - tekstlaag met MARKEERSTIFTEN: de leerkracht legt een kleurenlegende vast,
//   de leerling selecteert tekst en kiest een kleur (zoals op papier).
//   Markeringen worden als span-indexen per pagina bewaard — compact genoeg
//   voor een inzending.
// - valt bij een extern (CORS-geblokkeerd) bestand terug op de ingebouwde
//   pdf-weergave van de browser (iframe), zonder markeerstiften.
// - VEILIGHEID: een adres komt uit gedeelde inhoud. Alleen http(s) (en een
//   eigen blob:-URL) gaat naar pdf.js, de iframe of een link; een
//   javascript:-URL zou anders in de app uitgevoerd worden. Een eigen blob
//   krijgt altijd het type application/pdf (zie lib/veiligeUrl.ts).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, ExternalLink, FileType, Highlighter, Minus } from 'lucide-react';
import { uid } from '../../lib/utils';
import { webUrl } from '../../lib/veiligeUrl';
import { AddIcon, DownloadIcon } from '../icons';

const PDF_TYPE = 'application/pdf';
export const PDF_LINK_GEWEIGERD = 'Deze pdf-link kan niet geopend worden: alleen https://-adressen zijn toegelaten.';

/** Het adres dat pdf.js, de iframe en de links mogen krijgen; null = weigeren. */
function veiligPdfAdres(src: string): string | null {
  return webUrl(src) ?? (src.startsWith('blob:') ? src : null);
}

export interface PdfHighlight {
  id: string;
  page: number;
  /** Indexen van tekst-spans in de tekstlaag van die pagina. */
  spans: number[];
  color: string;
  /** Fragment van de gemarkeerde tekst (voor de leerkracht/weergave elders). */
  text: string;
}

export interface HighlightColor {
  color: string;
  label: string;
}

/** Standaardlegende — de leerkracht kan ze aanpassen in de editor. */
export const DEFAULT_PALETTE: HighlightColor[] = [
  { color: '#ffd54a', label: 'geel' },
  { color: '#7cc4ff', label: 'blauw' },
  { color: '#8ce99a', label: 'groen' },
  { color: '#ffb26b', label: 'oranje' },
  { color: '#f7a8d8', label: 'roze' },
];

const STYLE = `
.pdfv { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--bg-sunken); display: flex; flex-direction: column; }
.pdfv-bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 6px 10px; border-bottom: 1px solid var(--line); background: var(--bg-raised); }
.pdfv-scroll { overflow: auto; flex: 1; padding: 14px 0; scroll-behavior: smooth; }
.pdfv-page { position: relative; margin: 0 auto 14px; background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,0.18); }
.pdfv-page canvas { display: block; width: 100%; height: 100%; }
.pdfv-text { position: absolute; inset: 0; overflow: hidden; line-height: 1; }
.pdfv-text span { position: absolute; color: transparent; white-space: pre; cursor: text; transform-origin: 0 0; }
.pdfv-text span.pdfv-hl { border-radius: 2px; }
.pdfv-text span::selection { background: rgba(90, 120, 255, 0.35); }
.pdfv-swatch { width: 26px; height: 26px; border-radius: 8px; border: 2px solid transparent; cursor: pointer; padding: 0; }
.pdfv-swatch[aria-pressed="true"] { border-color: var(--text); box-shadow: 0 0 0 2px var(--bg-raised); }
`;

type Tool = { kind: 'none' } | { kind: 'mark'; color: string } | { kind: 'erase' };

export function PdfViewer({
  src, title, palette, highlights, onHighlightsChange, height = 560,
}: {
  src: Blob | string;
  title?: string;
  /** Markeerlegende; niet meegeven = geen markeermodus (alleen lezen). */
  palette?: HighlightColor[];
  highlights?: PdfHighlight[];
  onHighlightsChange?: (h: PdfHighlight[]) => void;
  height?: number | string;
}): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pageNow, setPageNow] = useState(1);
  const [tool, setTool] = useState<Tool>({ kind: 'none' });
  const pdfjsRef = useRef<any>(null);
  const blobUrlRef = useRef<string | null>(null);
  const hlRef = useRef<PdfHighlight[]>(highlights ?? []);
  useEffect(() => { hlRef.current = highlights ?? []; }, [highlights]);

  const canMark = !!palette?.length && !!onHighlightsChange;
  // Een adres dat niet mag (javascript:, data: …): geen pdf.js, geen iframe, geen link.
  const adres = typeof src === 'string' ? veiligPdfAdres(src) : null;
  const geweigerd = typeof src === 'string' && adres === null;

  // ── Document laden ────────────────────────────────────────────────────────
  useEffect(() => {
    setDoc(null);
    setFallbackUrl(null);
    setError(null);
    if (geweigerd) return;
    let alive = true;
    let task: any = null;
    (async () => {
      try {
        // De legacy-build: de moderne build eist splinternieuwe JS-API's die op
        // oudere school-pc's (en de test-Chromium) nog ontbreken.
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
        pdfjsRef.current = pdfjs;
        if (typeof src !== 'string') {
          const data = await src.arrayBuffer();
          task = pdfjs.getDocument({ data });
        } else if (adres) {
          task = pdfjs.getDocument({ url: adres });
        } else {
          return; // kan niet (geweigerd hierboven), maar nooit een leeg adres laden
        }
        const d = await task.promise;
        if (alive) setDoc(d);
      } catch {
        if (!alive) return;
        if (adres) {
          // Extern bestand dat pdf.js niet mag lezen (CORS) → browserweergave.
          setFallbackUrl(adres);
        } else {
          setError('Deze pdf kon niet gelezen worden. Is het bestand beschadigd?');
        }
      }
    })();
    return () => { alive = false; try { task?.destroy?.(); } catch { /* al weg */ } };
  }, [src, adres, geweigerd]);

  // Link voor "openen in nieuw tabblad" (en downloadfallback). Een eigen blob
  // krijgt het type application/pdf: met een html-type zou hij in een nieuw
  // tabblad als pagina van de app draaien.
  const openUrl = useMemo(() => {
    if (typeof src === 'string') return adres;
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    blobUrlRef.current = URL.createObjectURL(src.type === PDF_TYPE ? src : src.slice(0, src.size, PDF_TYPE));
    return blobUrlRef.current;
  }, [src, adres]);
  useEffect(() => () => { if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current); }, []);

  // ── Pagina's renderen (lui) ───────────────────────────────────────────────
  useEffect(() => {
    if (!doc || !scrollRef.current) return;
    const host = scrollRef.current;
    host.innerHTML = '';
    const rendered = new Set<number>();
    const wraps: HTMLDivElement[] = [];
    let disposed = false;

    const baseWidth = Math.min(host.clientWidth - 28, 900);

    const renderPage = async (n: number, wrap: HTMLDivElement) => {
      if (rendered.has(n) || disposed) return;
      rendered.add(n);
      try {
        const page = await doc.getPage(n);
        const raw = page.getViewport({ scale: 1 });
        const scale = (baseWidth / raw.width) * zoom;
        const vp = page.getViewport({ scale });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        wrap.style.width = `${vp.width}px`;
        wrap.style.height = `${vp.height}px`;
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(vp.width * ratio);
        canvas.height = Math.floor(vp.height * ratio);
        wrap.appendChild(canvas);
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined, canvas }).promise;
        // Tekstlaag voor selectie + markeerstiften
        const textDiv = document.createElement('div');
        textDiv.className = 'pdfv-text';
        textDiv.style.setProperty('--scale-factor', String(vp.scale));
        wrap.appendChild(textDiv);
        const layer = new pdfjsRef.current.TextLayer({
          textContentSource: page.streamTextContent(),
          container: textDiv,
          viewport: vp,
        });
        await layer.render();
        const spans = Array.from(textDiv.querySelectorAll('span'));
        spans.forEach((s, i) => s.setAttribute('data-pv', String(i)));
        applyHighlights(wrap, n);
      } catch (e) {
        // één pagina die faalt mag de rest niet tegenhouden
        console.warn('pdf-pagina render faalde', e);
      }
    };

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          const n = Number((e.target as HTMLElement).dataset.page);
          renderPage(n, e.target as HTMLDivElement);
        }
      }
    }, { root: host, rootMargin: '400px' });

    for (let n = 1; n <= doc.numPages; n++) {
      const wrap = document.createElement('div');
      wrap.className = 'pdfv-page';
      wrap.dataset.page = String(n);
      // Placeholderhoogte tot de echte render (A4-verhouding)
      wrap.style.width = `${baseWidth * zoom}px`;
      wrap.style.height = `${baseWidth * zoom * 1.414}px`;
      host.appendChild(wrap);
      wraps.push(wrap);
      io.observe(wrap);
    }

    // Paginateller: scroll-gebaseerd i.p.v. een threshold-observer — een sterk
    // ingezoomde pagina kan ruim groter zijn dan de viewport en haalt dan
    // nooit 40% zichtbaarheid, waardoor de teller op "p. 1" bleef hangen.
    // We kiezen de pagina die de bovenrand van de scrollcontainer overlapt,
    // of anders de pagina waarvan de bovenkant er het dichtst bij ligt.
    let raf = 0;
    const updatePageNow = () => {
      raf = 0;
      const topEdge = host.getBoundingClientRect().top;
      let best = 1;
      let bestDist = Infinity;
      for (const wrap of wraps) {
        const r = wrap.getBoundingClientRect();
        if (r.top <= topEdge && r.bottom > topEdge) {
          best = Number(wrap.dataset.page);
          break;
        }
        const dist = Math.abs(r.top - topEdge);
        if (dist < bestDist) {
          bestDist = dist;
          best = Number(wrap.dataset.page);
        }
      }
      setPageNow(best);
    };
    const onScroll = () => {
      // Throttlen met requestAnimationFrame: max. één meting per frame.
      if (!raf) raf = requestAnimationFrame(updatePageNow);
    };
    host.addEventListener('scroll', onScroll, { passive: true });
    updatePageNow();

    return () => {
      disposed = true;
      io.disconnect();
      host.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, zoom]);

  // ── Markeringen tonen ─────────────────────────────────────────────────────
  const applyHighlights = (wrap: HTMLElement, page: number) => {
    const spans = wrap.querySelectorAll<HTMLElement>('.pdfv-text span');
    spans.forEach((s) => { s.classList.remove('pdfv-hl'); s.style.background = ''; });
    for (const h of hlRef.current) {
      if (h.page !== page) continue;
      for (const idx of h.spans) {
        const el = wrap.querySelector<HTMLElement>(`.pdfv-text span[data-pv="${idx}"]`);
        if (el) { el.classList.add('pdfv-hl'); el.style.background = withAlpha(h.color, 0.45); }
      }
    }
  };
  const refreshAll = () => {
    scrollRef.current?.querySelectorAll<HTMLElement>('.pdfv-page').forEach((w) =>
      applyHighlights(w, Number(w.dataset.page)));
  };
  useEffect(refreshAll, [highlights]);

  // ── Markeren & gommen ─────────────────────────────────────────────────────
  const onMouseUp = () => {
    if (!canMark || tool.kind !== 'mark') return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const wrap = (range.startContainer.parentElement as HTMLElement | null)?.closest('.pdfv-page') as HTMLElement | null;
    if (!wrap || !scrollRef.current?.contains(wrap)) return;
    const page = Number(wrap.dataset.page);
    const spans: number[] = [];
    wrap.querySelectorAll<HTMLElement>('.pdfv-text span[data-pv]').forEach((s) => {
      if (range.intersectsNode(s)) spans.push(Number(s.dataset.pv));
    });
    if (!spans.length) return;
    const text = sel.toString().replace(/\s+/g, ' ').trim().slice(0, 240);
    onHighlightsChange!([...hlRef.current, { id: uid(), page, spans, color: tool.color, text }]);
    sel.removeAllRanges();
  };
  const onClickErase = (e: React.MouseEvent) => {
    if (!canMark || tool.kind !== 'erase') return;
    const target = (e.target as HTMLElement).closest('span[data-pv]') as HTMLElement | null;
    const wrap = (e.target as HTMLElement).closest('.pdfv-page') as HTMLElement | null;
    if (!target || !wrap) return;
    const page = Number(wrap.dataset.page);
    const idx = Number(target.dataset.pv);
    const next = hlRef.current.filter((h) => !(h.page === page && h.spans.includes(idx)));
    if (next.length !== hlRef.current.length) onHighlightsChange!(next);
  };

  // ── Weergave ──────────────────────────────────────────────────────────────
  if (geweigerd) {
    return (
      <div className="card card-pad" style={{ textAlign: 'center' }}>
        <FileType size={32} aria-hidden />
        <p role="alert" style={{ color: 'var(--err)', fontWeight: 600 }}>{PDF_LINK_GEWEIGERD}</p>
      </div>
    );
  }
  if (fallbackUrl) {
    return (
      <div className="pdfv" style={{ height }}>
        <style>{STYLE}</style>
        <iframe src={fallbackUrl} title={title || 'Pdf-document'} style={{ border: 0, flex: 1, width: '100%' }} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="card card-pad" style={{ textAlign: 'center' }}>
        <FileType size={32} aria-hidden />
        <p style={{ color: 'var(--err)', fontWeight: 600 }}>{error}</p>
        {openUrl && <a className="btn btn-sm btn-ghost" href={openUrl} download={title || 'document.pdf'}><DownloadIcon size={16} aria-hidden /> Download het bestand</a>}
      </div>
    );
  }
  return (
    <div className="pdfv" style={{ height }}>
      <style>{STYLE}</style>
      <div className="pdfv-bar">
        <button className="btn btn-sm btn-quiet btn-icon" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))} aria-label="Uitzoomen"><Minus size={16} aria-hidden /></button>
        <span className="hint" style={{ minWidth: 42, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button className="btn btn-sm btn-quiet btn-icon" onClick={() => setZoom((z) => Math.min(2.4, +(z + 0.2).toFixed(1)))} aria-label="Inzoomen"><AddIcon size={16} aria-hidden /></button>
        <span className="hint" aria-live="polite" style={{ marginLeft: 6 }}>
          {doc ? `p. ${pageNow}/${doc.numPages}` : 'laden…'}
        </span>
        <div style={{ flex: 1 }} />
        {canMark && (
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }} role="group" aria-label="Markeerstiften">
            {palette!.map((p) => (
              <button
                key={p.color}
                className="pdfv-swatch"
                style={{ background: p.color }}
                aria-pressed={tool.kind === 'mark' && tool.color === p.color}
                aria-label={`Markeer in ${p.label}`}
                title={`Markeer: ${p.label}`}
                onClick={() => setTool(tool.kind === 'mark' && tool.color === p.color ? { kind: 'none' } : { kind: 'mark', color: p.color })}
              />
            ))}
            <button
              className="btn btn-sm btn-quiet"
              aria-pressed={tool.kind === 'erase'}
              aria-label="Markering weggommen"
              title="Markering weggommen: klik op een gemarkeerd stuk"
              onClick={() => setTool(tool.kind === 'erase' ? { kind: 'none' } : { kind: 'erase' })}
            >
              <Eraser size={16} aria-hidden />
            </button>
          </div>
        )}
        {openUrl && <a className="btn btn-sm btn-quiet" href={openUrl} target="_blank" rel="noopener noreferrer" aria-label="Openen in nieuw tabblad" title="Openen in nieuw tabblad"><ExternalLink size={16} aria-hidden /></a>}
      </div>
      {canMark && tool.kind !== 'none' && (
        <div className="hint" style={{ padding: '4px 10px', borderBottom: '1px solid var(--line)' }} aria-live="polite">
          {tool.kind === 'mark'
            ? <><Highlighter size={14} className="icon-inline" aria-hidden /> Selecteer tekst in de pdf om ze te markeren ({palette!.find((p) => p.color === (tool as any).color)?.label ?? ''}).</>
            : <><Eraser size={14} className="icon-inline" aria-hidden /> Klik op een gemarkeerd stuk tekst om de markering te verwijderen.</>}
        </div>
      )}
      <div
        ref={scrollRef}
        className="pdfv-scroll"
        onMouseUp={onMouseUp}
        onClick={onClickErase}
        aria-label={title ? `Pdf: ${title}` : 'Pdf-document'}
      />
    </div>
  );
}

function withAlpha(hex: string, a: number): string {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${a})`;
}

/** Uploadhulp: leest een gekozen pdf-bestand in en bewaart hem in IndexedDB. */
export async function pickAndStorePdf(file: File): Promise<{ pdfId: string; name: string; size: number } | { error: string }> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return { error: 'Kies een pdf-bestand.' };
  }
  if (file.size > 25 * 1024 * 1024) {
    return { error: 'Deze pdf is groter dan 25 MB. Verklein hem (bv. exporteer opnieuw met lagere kwaliteit).' };
  }
  const { savePdf } = await import('../../lib/pdfStore');
  const pdfId = uid();
  try {
    await savePdf(pdfId, file.name, file);
  } catch {
    return { error: 'Bewaren mislukt — is de opslag van dit toestel vol?' };
  }
  return { pdfId, name: file.name, size: file.size };
}
