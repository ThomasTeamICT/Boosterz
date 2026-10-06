import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Inbox } from 'lucide-react';
import { processCodes, splitCodes, summarizeReport, type InboxRow } from '../lib/inbox';
import { nietVerwerkteCodes, scanRegel, verklaarWeigeringen } from '../components/results/importOutcome';
import { QrScanner } from '../components/QrScanner';
import { EmptyState, useToast } from '../components/ui';
import { formatDate } from '../lib/utils';
import {
  AssignIcon, CheckIcon, CloseIcon, PrivacyIcon, TipIcon, WarningIcon,
} from '../components/icons';

/**
 * /inleverpunt — één plek waar al het werk van elders binnenkomt.
 *
 * Twee wegen, dezelfde verwerking (lib/inbox.ts):
 *  • plakken: een hele hoop codes tegelijk, bv. uit een Smartschool-bericht;
 *  • scannen: de leerlingen tonen hun QR-code aan de camera.
 * Per code toont de lijst eerlijk wat ermee gebeurde — ook "stond hier al" of
 * "deze widget ken ik niet". Werk van een leerling gooien we nooit weg.
 */
export function InboxPage() {
  const toast = useToast();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [scanning, setScanning] = useState(false);
  const [melding, setMelding] = useState('');

  const totals = useMemo(() => {
    const t = { nieuw: 0, dubbel: 0, onbekend: 0, ongeldig: 0 };
    for (const r of rows) t[r.outcome]++;
    return t;
  }, [rows]);

  const addRows = (fresh: InboxRow[]) => {
    setRows((cur) => [...fresh.map((r, i) => ({ ...r, index: cur.length + i + 1 })), ...cur]);
  };

  const verwerkTekst = () => {
    const codes = splitCodes(text);
    const report = processCodes(text);
    if (report.rows.length === 0) {
      setMelding('Geen codes gevonden. Een resultaatcode begint met WF1., een voortgangscode met WFC1.');
      toast('Geen codes gevonden', 'err');
      return;
    }
    addRows(verklaarWeigeringen(report.rows, codes));
    // Wat niet verwerkt is (onleesbaar, te groot, of niet bewaard door een volle
    // opslag), blijft in het tekstvak staan om opnieuw te proberen (G5). De
    // bewaarde codes gaan eruit: opnieuw verwerken geeft er alleen "dubbel" voor.
    const blijft = nietVerwerkteCodes(report.rows, codes);
    let samenvatting = summarizeReport(report);
    if (blijft.length > 0) {
      samenvatting += `. ${blijft.length} ${blijft.length === 1 ? 'code is' : 'codes zijn'} niet verwerkt en ${blijft.length === 1 ? 'blijft' : 'blijven'} in het tekstvak staan: kijk in de lijst waarom.`;
    }
    setMelding(samenvatting);
    toast(samenvatting, blijft.length > 0 ? 'err' : report.nieuw > 0 ? 'ok' : 'info');
    if (report.nieuw > 0 || report.onbekend > 0) setText(blijft.join('\n'));
  };

  /** Eén gescande code verwerken; de tekst is meteen de log-regel voor de scanner. */
  const verwerkScan = (code: string): string => {
    const codes = splitCodes(code);
    const report = processCodes(code);
    if (!report.rows[0]) return 'Deze QR-code bevat geen Boosterz-code';
    const rows = verklaarWeigeringen(report.rows, codes);
    addRows(rows);
    return scanRegel(rows[0]);
  };

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Inbox size={24} /> Inleverpunt</h1>
          <p className="sub">
            Codes van leerlingen die thuis of zonder klaslink werkten: plak ze hier, of scan hun QR-code
            met de camera.
          </p>
        </div>
        <div className="page-head-actions">
          <Link to="/klassen" className="btn btn-ghost"><AssignIcon size={18} /> Klassen</Link>
        </div>
      </div>

      <div className="callout">
        <span aria-hidden><TipIcon size={18} /></span>
        <div>
          Een leerling vindt zijn code in de app: na het indienen van een oefening (<code>WF1.…</code>)
          of in een cursus (<code>WFC1.…</code>). Werkt hij met een klaslink, dan staan al zijn codes
          samen onder <em>Inleveren</em> — als QR om te tonen, of om te kopiëren.
        </div>
      </div>

      {scanning ? (
        <QrScanner onCode={verwerkScan} onClose={() => setScanning(false)} />
      ) : (
        <p style={{ margin: '14px 0' }}>
          <button className="btn btn-primary" onClick={() => setScanning(true)}>
            <Camera size={18} /> Camera starten en scannen
          </button>
        </p>
      )}

      <div className="field">
        <label htmlFor="inbox-codes">Codes plakken</label>
        <textarea
          id="inbox-codes"
          className="textarea"
          rows={7}
          value={text}
          placeholder={'WF1.…\nWFC1.…'}
          onChange={(e) => { setText(e.target.value); setMelding(''); }}
          style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}
        />
        <span className="hint">
          Zoveel codes als je wil, gescheiden door spaties of nieuwe regels. Begeleidende tekst
          (“hier is mijn code”) mag blijven staan.
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <button className="btn btn-primary" disabled={!text.trim()} onClick={verwerkTekst}>
          <CheckIcon size={16} /> Codes verwerken
        </button>
        {rows.length > 0 && (
          <button className="btn btn-ghost" onClick={() => { setRows([]); setMelding(''); }}>
            Lijst wissen
          </button>
        )}
      </div>
      <p className="hint" role="status" aria-live="polite" style={{ minHeight: '1.2em' }}>{melding}</p>

      {rows.length === 0 ? (
        <EmptyState icon={<Inbox size={40} />} title="Nog niets verwerkt">
          <p>
            De verwerkte codes verschijnen hier, met per code wat ermee gebeurde. Resultaten vind je
            daarna gewoon bij <Link to="/resultaten">Resultaten</Link> en in je{' '}
            <Link to="/klassen">klasoverzicht</Link>.
          </p>
        </EmptyState>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
            <span className="badge badge-ok">{totals.nieuw} nieuw</span>
            {totals.dubbel > 0 && <span className="badge">{totals.dubbel} al aanwezig</span>}
            {totals.onbekend > 0 && <span className="badge badge-warn">{totals.onbekend} zonder widget of cursus hier</span>}
            {totals.ongeldig > 0 && <span className="badge badge-err">{totals.ongeldig} ongeldig</span>}
          </div>
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="data" style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse' }}>
              <caption className="sr-only">Verwerkte codes</caption>
              <thead>
                <tr>
                  <th scope="col" style={{ textAlign: 'left', padding: '8px 12px' }}>Leerling</th>
                  <th scope="col" style={{ textAlign: 'left', padding: '8px 12px' }}>Opdracht</th>
                  <th scope="col" style={{ textAlign: 'left', padding: '8px 12px' }}>Resultaat</th>
                  <th scope="col" style={{ textAlign: 'left', padding: '8px 12px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.code}-${r.index}`} style={{ cursor: 'default' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <strong>{r.studentName || '—'}</strong>
                      {r.className && <span className="hint" style={{ display: 'block' }}>{r.className}</span>}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {r.title ?? <span className="hint">niet op dit toestel</span>}
                      {r.at && <span className="hint" style={{ display: 'block' }}>{formatDate(r.at)}</span>}
                    </td>
                    <td style={{ padding: '8px 12px' }}>{r.detail || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span
                        className={`badge ${
                          r.outcome === 'nieuw' ? 'badge-ok' : r.outcome === 'onbekend' ? 'badge-warn' : r.outcome === 'ongeldig' ? 'badge-err' : ''
                        }`}
                      >
                        {r.outcome === 'nieuw' && <><CheckIcon size={14} className="icon-inline" /> toegevoegd</>}
                        {r.outcome === 'dubbel' && '= al aanwezig'}
                        {r.outcome === 'onbekend' && <><WarningIcon size={14} className="icon-inline" /> bewaard</>}
                        {r.outcome === 'ongeldig' && <><CloseIcon size={14} className="icon-inline" /> ongeldig</>}
                      </span>
                      {r.message && <span className="hint" style={{ display: 'block' }}>{r.message}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="hint" style={{ marginTop: 20 }}>
        <PrivacyIcon size={14} className="icon-inline" /> Alles blijft op dit toestel. Een code bevat het werk van één leerling; er gaat niets naar
        internet.
      </p>
    </div>
  );
}
