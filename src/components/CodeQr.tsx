import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QR_MAX_CHARS } from '../lib/qrLimits';
import { CopyButton, Modal } from './ui';
import { DownloadIcon, InfoIcon } from './icons';

/**
 * Een gehele schaal (elke module is precies 4 × 4 beeldpunten), geen
 * `width`: met een breedte die geen veelvoud is van het aantal modules
 * vervaagt de bibliotheek de randen en leest een scanner de code onbetrouwbaar.
 * Foutcorrectie 'L' houdt de code zo grof mogelijk; de marge van 2 modules
 * komt bovenop de witte rand van het knopvlak.
 */
const QR_OPTIES = { scale: 4, margin: 2, errorCorrectionLevel: 'L' } as const;

/**
 * Onder 2 css-pixels per module is een QR op een gewoon scherm of een projector
 * niet meer te scannen: een lange link (±100 tot ±160 modules) krijgt daarom
 * meer ruimte dan `size`, in plaats van dat hij onleesbaar klein wordt.
 */
const MIN_PX_PER_MODULE = 2;

/**
 * Aantal modules (inclusief marge) uit de kop van de png: bytes 16 tot 19 van
 * het bestand zijn de breedte. Zo hoeft de code niet een tweede keer berekend
 * te worden (voor een lange link duurt dat ±150 ms op de hoofdthread).
 */
function modulesUitPng(dataUrl: string): number {
  try {
    const komma = dataUrl.indexOf(',');
    const bytes = atob(dataUrl.slice(komma + 1, komma + 33));
    const breedte = ((bytes.charCodeAt(16) << 24) | (bytes.charCodeAt(17) << 16) | (bytes.charCodeAt(18) << 8) | bytes.charCodeAt(19)) >>> 0;
    return breedte / QR_OPTIES.scale;
  } catch {
    return 0;
  }
}

/**
 * Breedte in css-pixels als veelvoud van het aantal modules, zodat elke module
 * een geheel aantal pixels beslaat (scherp, met `image-rendering: pixelated`).
 */
function breedteVoor(modules: number, gewenst: number, afronden: (x: number) => number): number {
  if (!Number.isInteger(modules) || modules <= 0) return gewenst;
  return modules * Math.max(MIN_PX_PER_MODULE, afronden(gewenst / modules));
}

/**
 * QR-code van een tekst (meestal een resultaat- of voortgangscode, of een
 * klaslink). Een QR heeft een harde capaciteitsgrens: boven ±2 300 tekens
 * lukt het niet meer, of wordt de code zo fijn dat geen enkele telefoon ze
 * nog leest. Dan tonen we eerlijk waarom, met de kopieerknop als alternatief —
 * nooit een lege plek of een onleesbaar blokje.
 */
export function CodeQr({
  value,
  label,
  size = 190,
  maxChars = QR_MAX_CHARS,
  hint,
  copyLabel = 'Code kopiëren',
  downloadName,
  tooLongText,
  enlarge = true,
}: {
  value: string;
  /** Beschrijving voor de alt-tekst, bv. "de resultaatcode van Emma". */
  label: string;
  /**
   * Gewenste breedte in css-pixels. De QR wordt afgerond op een geheel aantal
   * pixels per module en is nooit minder dan 2 pixels per module breed.
   */
  size?: number;
  maxChars?: number;
  hint?: string;
  copyLabel?: string;
  /** Bestandsnaam (bv. "qr-ABC123.png"): toont dan ook een knop "QR downloaden". */
  downloadName?: string;
  /** Uitleg als de tekst te lang is voor een QR; vervangt de standaardzin. */
  tooLongText?: string;
  /**
   * Klik om te vergroten. Zet dit uit binnen een venster (Modal): twee
   * vensters boven elkaar sluiten allebei op Escape.
   */
  enlarge?: boolean;
}) {
  const [qr, setQr] = useState<{ url: string; modules: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [big, setBig] = useState(false);
  const closeBig = useCallback(() => setBig(false), []);
  const tooLong = value.length > maxChars;

  useEffect(() => {
    let alive = true;
    setQr(null);
    setFailed(false);
    if (!value || tooLong) return;
    QRCode.toDataURL(value, QR_OPTIES)
      .then((url) => { if (alive) setQr({ url, modules: modulesUitPng(url) }); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [value, tooLong]);

  if (!value) return null;

  if (tooLong || failed) {
    return (
      <div className="callout" role="note">
        {/* In een span: een kale svg krimpt in de flexrij tot een stipje naast lange tekst. */}
        <span aria-hidden><InfoIcon size={18} /></span>
        <div>
          <strong>Te groot voor een QR-code.</strong>{' '}
          {tooLongText ?? 'Deze code bevat te veel (bv. een tekening of foto) om ze te laten scannen. Kopieer ze en stuur ze door via je gewone kanaal.'}
          <div style={{ marginTop: 8 }}>
            <CopyButton text={value} label={copyLabel} />
          </div>
        </div>
      </div>
    );
  }

  const breedte = qr ? breedteVoor(qr.modules, size, Math.round) : size;
  const afbeelding = qr && (
    <img
      src={qr.url}
      alt={`QR-code van ${label}`}
      width={breedte}
      height={breedte}
      style={{ display: 'block', width: breedte, maxWidth: '100%', height: 'auto', aspectRatio: '1 / 1', borderRadius: 8, imageRendering: 'pixelated' }}
    />
  );

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
      {qr ? (
        enlarge ? (
          <button
            type="button"
            className="btn btn-quiet"
            style={{ padding: 4, height: 'auto', background: '#fff', borderRadius: 12, maxWidth: '100%' }}
            onClick={() => setBig(true)}
            aria-label={`QR-code van ${label} groter tonen`}
            title="Groter tonen"
          >
            {afbeelding}
          </button>
        ) : (
          <div style={{ padding: 4, background: '#fff', borderRadius: 12, maxWidth: '100%', border: '1px solid var(--line)' }}>
            {afbeelding}
          </div>
        )
      ) : (
        <p className="hint" role="status" style={{ width: size, textAlign: 'center' }}>QR-code wordt gemaakt…</p>
      )}
      <div style={{ flex: '1 1 180px', minWidth: 0 }}>
        {hint && <p className="hint" style={{ marginTop: 0 }}>{hint}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <CopyButton text={value} label={copyLabel} />
          {qr && downloadName && (
            <a className="btn btn-sm btn-ghost" href={qr.url} download={downloadName}>
              <DownloadIcon size={16} /> QR downloaden
            </a>
          )}
        </div>
      </div>
      {big && qr && (
        <Modal title={`QR-code van ${label}`} onClose={closeBig}>
          <div style={{ textAlign: 'center', background: '#fff', padding: 16, borderRadius: 12 }}>
            <img
              src={qr.url}
              alt={`QR-code van ${label}`}
              style={{
                width: breedteVoor(qr.modules, Math.min(window.innerWidth * 0.8, 440), Math.floor),
                maxWidth: '100%', height: 'auto', aspectRatio: '1 / 1', imageRendering: 'pixelated',
              }}
            />
          </div>
          <p className="hint" style={{ textAlign: 'center', marginTop: 10 }}>
            Houd je scherm stil voor de camera van je leerkracht.
          </p>
        </Modal>
      )}
    </div>
  );
}
