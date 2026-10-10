import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Globe, Mail, School } from 'lucide-react';
import type { Course } from '../../lib/courseTypes';
import { courseReadUrl, encodeCourseToUrl, exportCourseJson } from '../../lib/courses';
import { referencedWidgetIds } from '../../lib/courseTypes';
import { getCurricula } from '../../lib/curriculum';
import { doelgroepVanCursus } from '../../lib/doelgroepGebruik';
import { downloadFile } from '../../lib/utils';
import { AssignToClassSection } from '../ShareModal';
import { AssignIcon, ExportIcon, LinkIcon, WarningIcon } from '../icons';
import { CopyButton, Modal } from '../ui';

export function CourseShareModal({ course, onClose }: { course: Course; onClose: () => void }) {
  const [selected, setSelected] = useState<string[]>(() => course.chapters.map((c) => c.id));
  const [qr, setQr] = useState('');
  // De studierichting en het jaar van de cursus (haar eigen doelgroep, anders die van haar leerplan): de klassen voor die
  // richting staan bij "Toewijzen aan een klas" bovenaan.
  const doelgroep = useMemo(() => doelgroepVanCursus(course, getCurricula()), [course]);

  const partial = selected.length > 0 && selected.length < course.chapters.length;
  // Async: media staan in IndexedDB en gaan als data-URL in de link (lib/mediaStore).
  const [portableUrl, setPortableUrl] = useState('');
  const [unresolved, setUnresolved] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const selectedKey = selected.join(',');
  useEffect(() => {
    let alive = true;
    if (!selected.length) { setPortableUrl(''); setPreparing(false); return; }
    setPreparing(true);
    encodeCourseToUrl(course, partial ? selected : undefined)
      .then((res) => { if (alive) { setPortableUrl(res.url); setUnresolved(res.unresolved); } })
      .catch(() => { if (alive) setPortableUrl(''); })
      .finally(() => { if (alive) setPreparing(false); });
    return () => { alive = false; };
    // selectedKey vat de selectie samen; `selected` zelf is elke render een nieuw array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course, selectedKey, partial]);
  const exportJson = async () => {
    try {
      downloadFile(`${course.title || 'cursus'}.json`, await exportCourseJson(course));
    } catch {
      /* downloadFile faalt niet; inlineMedia hoogstens bij een kapotte blob */
    }
  };
  const readUrl = courseReadUrl(course.code);
  const widgetCount = referencedWidgetIds({ ...course, chapters: course.chapters.filter((c) => selected.includes(c.id)) }).length;
  const mailUrl = `mailto:?subject=${encodeURIComponent(`Cursus: ${course.title}`)}&body=${encodeURIComponent(`Dag!\n\nHier vind je de cursus "${course.title}": ${portableUrl}\n\nVeel leesplezier!`)}`;

  useEffect(() => {
    let alive = true;
    if (!portableUrl) { setQr(''); return; }
    QRCode.toDataURL(portableUrl, { width: 220, margin: 1 })
      .then((url) => { if (alive) setQr(url); })
      // Bij te lange links (QR-capaciteit ±2,9 kB) móét de oude QR weg,
      // anders projecteert de leerkracht de verkeerde selectie.
      .catch(() => { if (alive) setQr(''); });
    return () => { alive = false; };
  }, [portableUrl]);

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  // Volgt de hoofdstukselectie live via portableUrl.
  const embedCode = portableUrl
    ? `<iframe src="${portableUrl}" width="100%" height="720" style="border:0;border-radius:12px" allowfullscreen title="${course.title.replace(/"/g, '&quot;')}"></iframe>`
    : '';

  return (
    <Modal title={`“${course.title}” delen`} onClose={onClose} wide>
      <AssignToClassSection kind="course" targetId={course.id} title={course.title} doelgroep={doelgroep} />

      <hr className="divider" />

      <div className="callout">
        <span aria-hidden><School size={18} /></span>
        <div>
          <strong>Losse code (zelfde toestel/browser):</strong> leerlingen typen deze code in — en dus
          ook zelf hun naam, los van een klaslijst. Voortgang komt dan automatisch bij jou terecht.
        </div>
      </div>
      <div style={{ textAlign: 'center', margin: '10px 0 14px' }}>
        <div style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '0.3em', fontFamily: 'monospace' }}>
          {course.code}
        </div>
        <CopyButton text={course.code} label="Code kopiëren" />
      </div>

      <hr className="divider" />

      <details className="more-ways">
        <summary>Meer manieren om te delen</summary>

        <div style={{ paddingTop: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <LinkIcon size={16} className="icon-inline" />
            <strong>Directe link</strong>
            <span className="hint">(zelfde toestel) — opent de cursus meteen met deze code al ingevuld.</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <input className="input input-sm" readOnly value={readUrl} aria-label="Directe link met de cursuscode" onFocus={(e) => e.target.select()} />
            <CopyButton text={readUrl} label="Kopiëren" />
          </div>

          <h3 style={{ marginTop: 0 }}>Wat deel je?</h3>
          <p className="hint" style={{ marginTop: -6 }}>
            Deel gerust per hoofdstuk — zo groeit de cursus mee met je lessenreeks. Ingebedde oefen-widgets reizen automatisch mee{widgetCount > 0 ? ` (${widgetCount} in deze selectie)` : ''}.
          </p>
          <div style={{ display: 'grid', gap: 4, marginBottom: 14 }}>
            {course.chapters.map((ch) => (
              <label key={ch.id} className="checkbox-row">
                <input type="checkbox" checked={selected.includes(ch.id)} onChange={() => toggle(ch.id)} />
                <span>{ch.emoji} {ch.title} <span className="hint">({ch.sections.length} secties)</span></span>
              </label>
            ))}
          </div>

          <div className="callout">
            <span aria-hidden><Globe size={18} /></span>
            <div>
              <strong>Draagbare link (elk toestel):</strong> de cursus zit volledig in de link — werkt
              overal, ook thuis, zonder account. De leesvoortgang blijft dan op het toestel van de
              leerling; die stuurt op het einde zijn <em>voortgangscode</em> door.
            </div>
          </div>
          {selected.length === 0 ? (
            <p className="hint">Vink minstens één hoofdstuk aan.</p>
          ) : (
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', margin: '10px 0 14px' }}>
              <div style={{ flex: '1 1 300px' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <input className="input input-sm" readOnly value={preparing && !portableUrl ? 'Link wordt klaargemaakt…' : portableUrl} aria-label="Draagbare cursuslink" aria-busy={preparing} onFocus={(e) => e.target.select()} />
                  <CopyButton text={portableUrl} label="Kopiëren" />
                </div>
                <p className="hint" style={{ margin: '0 0 8px' }}>Linklengte: {portableUrl.length.toLocaleString('nl-BE')} tekens.</p>
                {unresolved > 0 && (
                  <div className="callout warn" style={{ marginBottom: 8 }}>
                    <span aria-hidden><WarningIcon size={18} /></span>
                    <div>
                      {unresolved === 1 ? 'Eén afbeelding of bijlage' : `${unresolved} afbeeldingen of bijlagen`} staan niet (meer) op dit
                      toestel en reizen dus niet mee in deze link.
                    </div>
                  </div>
                )}
                {portableUrl.length > 8000 && (
                  <div className="callout warn" style={{ marginBottom: 8 }}>
                    <span aria-hidden><WarningIcon size={18} /></span>
                    <div>
                      Deze link is fors (grote afbeeldingen of bijlagen?). Sommige apps knippen zulke
                      links af. Deel per hoofdstuk, of gebruik het <strong>cursusbestand</strong> hieronder.
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a className="btn btn-sm btn-ghost" href={mailUrl}><Mail size={16} /> Versturen via e-mail</a>
                  <a
                    className="btn btn-sm btn-ghost"
                    href={`https://classroom.google.com/share?url=${encodeURIComponent(portableUrl)}`}
                    target="_blank" rel="noopener noreferrer"
                  >
                    <AssignIcon size={16} /> Delen in Google Classroom
                  </a>
                </div>
              </div>
              {qr && (
                <figure style={{ margin: 0, textAlign: 'center' }}>
                  <img src={qr} alt="QR-code met de cursuslink" style={{ borderRadius: 10, border: '1px solid var(--line)' }} />
                  <figcaption className="hint">Scan met de klas</figcaption>
                </figure>
              )}
            </div>
          )}

          {selected.length > 0 && (
            <>
              <hr className="divider" />

              <div className="callout">
                <span aria-hidden><School size={18} /></span>
                <div>
                  <strong>Insluiten in je leeromgeving (Smartschool, Moodle, …):</strong> plak deze code
                  in een pagina die iframes toelaat. De cursus opent dan rechtstreeks in de leeromgeving.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '10px 0 6px' }}>
                <textarea
                  className="textarea"
                  rows={3}
                  readOnly
                  value={embedCode}
                  aria-label="Insluitcode voor de leeromgeving"
                  onFocus={(e) => e.target.select()}
                  style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                />
                <CopyButton text={embedCode} label="Kopiëren" />
              </div>
              <p className="hint" style={{ margin: '0 0 14px' }}>
                Werkt overal waar een gewone link werkt; bij een héél lange link (grote afbeeldingen)
                kan de leeromgeving weigeren — deel dan per hoofdstuk.
              </p>
            </>
          )}

          <hr className="divider" />

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => { void exportJson(); }}
            >
              <ExportIcon size={16} /> Cursusbestand (.json)
            </button>
            <span className="hint">
              Voor collega's of als back-up — de volledige cursus mét ingebedde widgets. Importeren kan bij Cursussen.
            </span>
          </div>
        </div>
      </details>
    </Modal>
  );
}
