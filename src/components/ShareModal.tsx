import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Accessibility, ArrowRight, Globe, Mail, School } from 'lucide-react';
import type { Widget } from '../lib/types';
import { encodeWidgetToUrl, exportWidgetJson, playUrlForCode } from '../lib/share';
import { assignmentsForClass, dueBadge, getClasses, upsertAssignment } from '../lib/classes';
import type { Doelgroep } from '../lib/doelgroep';
import { klassenVoorToewijzen } from '../lib/doelgroepGebruik';
import { ANDERE_KLASSEN, klassenVoorLabel } from '../lib/klasRichtingWeergave';
import { countUnresolvedMedia, inlineMedia } from '../lib/mediaStore';
import { downloadFile } from '../lib/utils';
import {
  AddIcon, AssignIcon, CheckIcon, ExportIcon, LinkIcon, WarningIcon,
} from './icons';
import { CheckRow, CopyButton, Field, Modal, useToast } from './ui';
import { CodeQr } from './CodeQr';

interface Inlined {
  /** Widget met de media als data-URL (null zolang dat nog loopt). */
  widget: Widget | null;
  /** Media die niet mee konden (blob niet op dit toestel). */
  unresolved: number;
}

/**
 * De media van de widget staan in IndexedDB en moeten voor een draagbare link
 * of exportbestand als data-URL ingevoegd worden (lib/mediaStore). Dat is
 * werk voor de hoofdthread (base64 van elke afbeelding), dus precies één
 * keer per geopend deelvenster; de gewone én de aangepaste link delen het.
 */
function useInlinedWidget(widget: Widget): Inlined {
  const [state, setState] = useState<Inlined>({ widget: null, unresolved: 0 });
  useEffect(() => {
    let alive = true;
    setState({ widget: null, unresolved: 0 });
    inlineMedia(widget)
      .then((w) => { if (alive) setState({ widget: w, unresolved: countUnresolvedMedia(w) }); })
      .catch(() => { if (alive) setState({ widget, unresolved: countUnresolvedMedia(widget) }); });
    return () => { alive = false; };
  }, [widget]);
  return state;
}

export function ShareModal({ widget, onClose }: { widget: Widget; onClose: () => void }) {
  const toast = useToast();
  const codeUrl = playUrlForCode(widget.code);
  const inlined = useInlinedWidget(widget);
  const portableUrl = useMemo(() => (inlined.widget ? encodeWidgetToUrl(inlined.widget) : ''), [inlined.widget]);
  const embedCode = `<iframe src="${portableUrl}" width="100%" height="640" style="border:0;border-radius:12px" allowfullscreen title="${widget.title.replace(/"/g, '&quot;')}"></iframe>`;
  const classroomUrl = `https://classroom.google.com/share?url=${encodeURIComponent(portableUrl)}`;
  const mailUrl = `mailto:?subject=${encodeURIComponent(`Oefening: ${widget.title}`)}&body=${encodeURIComponent(`Dag!\n\nMaak deze oefening: ${portableUrl}\n\nVeel succes!`)}`;

  const exportJson = async () => {
    try {
      const json = exportWidgetJson(inlined.widget ?? (await inlineMedia(widget)));
      downloadFile(`${widget.title.replace(/[^\w\dà-ÿ -]/gi, '')}.widget.json`, json);
    } catch {
      toast('Exporteren mislukt', 'err');
    }
  };

  return (
    <Modal title={`“${widget.title}” delen`} onClose={onClose} wide>
      <AssignToClassSection kind="widget" targetId={widget.id} title={widget.title} />

      <hr className="divider" />

      <div className="callout">
        <span aria-hidden><School size={18} /></span>
        <div>
          <strong>Losse code (zelfde toestel/browser):</strong> leerlingen surfen naar de app, klikken op
          {' '}<em>Ik ben leerling</em> en typen deze code in — en dus ook zelf hun naam, los van een klaslijst.
        </div>
      </div>
      <div style={{ textAlign: 'center', margin: '10px 0 18px' }}>
        <div style={{ fontSize: '2.6rem', fontWeight: 800, letterSpacing: '0.3em', fontFamily: 'monospace' }}>
          {widget.code}
        </div>
        <CopyButton text={widget.code} label="Code kopiëren" />
      </div>

      <hr className="divider" />

      <details className="more-ways">
        <summary>Meer manieren om te delen</summary>

        <div style={{ paddingTop: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <LinkIcon size={16} className="icon-inline" />
            <strong>Directe link</strong>
            <span className="hint">(zelfde toestel) — opent de widget meteen met deze code al ingevuld.</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <input className="input input-sm" readOnly value={codeUrl} aria-label="Directe link met de code" onFocus={(e) => e.target.select()} />
            <CopyButton text={codeUrl} label="Kopiëren" />
          </div>

          <div className="callout">
            <span aria-hidden><Globe size={18} /></span>
            <div>
              <strong>Draagbare link (elk toestel):</strong> de volledige widget zit in de link zelf,
              dus deze werkt overal — ook thuis. Resultaten blijven dan wel op het toestel van de leerling.
            </div>
          </div>
          {inlined.unresolved > 0 && (
            <div className="callout warn">
              <span aria-hidden><WarningIcon size={18} /></span>
              <div>
                {inlined.unresolved === 1 ? 'Eén afbeelding of bijlage' : `${inlined.unresolved} afbeeldingen of bijlagen`} van deze
                widget staan niet (meer) op dit toestel en reizen dus niet mee in de link of het bestand.
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ flex: '1 1 300px' }}>
              {portableUrl ? (
                <>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                    <input className="input input-sm" readOnly value={portableUrl} aria-label="Draagbare deellink" onFocus={(e) => e.target.select()} />
                    <CopyButton text={portableUrl} label="Kopiëren" />
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <a className="btn btn-sm btn-ghost" href={classroomUrl} target="_blank" rel="noopener noreferrer">
                      <AssignIcon size={16} /> Delen in Google Classroom
                    </a>
                    <a className="btn btn-sm btn-ghost" href={mailUrl}>
                      <Mail size={16} /> Mailen
                    </a>
                  </div>
                </>
              ) : (
                // Pas tonen als de link er écht is: anders kopieert of mailt iemand een lege link.
                <p className="hint" role="status" aria-busy>Link wordt klaargemaakt (afbeeldingen worden ingevoegd)…</p>
              )}
            </div>
          </div>
          {portableUrl && (
            <div style={{ marginBottom: 12 }}>
              <CodeQr
                value={portableUrl}
                label={`de draagbare link van ${widget.title}`}
                size={220}
                hint="Scan met tablet of gsm. Op een projector of smartboard: download de QR en toon hem op volledig scherm."
                copyLabel="Link kopiëren"
                downloadName={`qr-${widget.code}.png`}
                tooLongText="Deze widget bevat te veel (bv. afbeeldingen of veel vragen) om in één QR-code te passen. Kopieer de link en deel ze via mail of Google Classroom."
                enlarge={false}
              />
            </div>
          )}

          <hr className="divider" />

          <AdaptedLinkSection widget={widget} inlined={inlined.widget} />

          <hr className="divider" />

          <details style={{ marginBottom: 12 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}><LinkIcon size={16} className="icon-inline" /> Insluiten in je eigen website (embed)</summary>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
              <textarea className="textarea" rows={3} readOnly value={embedCode} aria-label="Embed-code" onFocus={(e) => e.target.select()} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
              <CopyButton text={embedCode} label="Kopiëren" />
            </div>
          </details>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <strong>Bestand:</strong>
            <button className="btn btn-sm btn-ghost" onClick={() => { void exportJson(); }}>
              <ExportIcon size={16} /> Exporteren (.json)
            </button>
            <span className="hint">Importeer dit bestand op een ander toestel of geef het aan een collega.</span>
          </div>
        </div>
      </details>
    </Modal>
  );
}

/**
 * Redelijke aanpassingen, discreet: een aangepaste variant van de draagbare
 * link (meer tijd, extra poging) die er voor de leerling identiek uitziet.
 */
function AdaptedLinkSection({ widget, inlined }: { widget: Widget; inlined: Widget | null }) {
  const [open, setOpen] = useState(false);
  const [extraTime, setExtraTime] = useState(true);
  const [noLimit, setNoLimit] = useState(false);
  const [extraAttempt, setExtraAttempt] = useState(false);

  // Vertrekt van de al ingelijnde widget: enkel de instellingen wijzigen en
  // opnieuw coderen, niet opnieuw alle afbeeldingen omzetten.
  const adaptedUrl = useMemo(() => {
    if (!inlined) return '';
    const w: Widget = { ...inlined, settings: { ...inlined.settings } };
    if (noLimit) w.settings.timeLimitMin = 0;
    else if (extraTime && w.settings.timeLimitMin > 0) w.settings.timeLimitMin = Math.ceil(w.settings.timeLimitMin * 1.5);
    if (extraAttempt && w.settings.maxAttempts > 0) w.settings.maxAttempts += 1;
    return encodeWidgetToUrl(w);
  }, [inlined, extraTime, noLimit, extraAttempt]);

  const hasEffect = noLimit || (extraTime && widget.settings.timeLimitMin > 0) || (extraAttempt && widget.settings.maxAttempts > 0);

  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} style={{ marginBottom: 4 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
        <Accessibility size={16} className="icon-inline" /> Aangepaste link (redelijke aanpassingen)
      </summary>
      <div style={{ paddingTop: 8 }}>
        <p className="hint" style={{ marginTop: 0 }}>
          Voor leerlingen met bv. dyslexie of aandachtproblemen: dezelfde oefening, discreet aangepast.
          De leerling ziet geen verschil met de gewone link.
        </p>
        <CheckRow checked={extraTime && !noLimit} onChange={(v) => { setExtraTime(v); if (v) setNoLimit(false); }} label={`Tijdslimiet × 1,5${widget.settings.timeLimitMin > 0 ? ` (${widget.settings.timeLimitMin} → ${Math.ceil(widget.settings.timeLimitMin * 1.5)} min)` : ' (geen limiet ingesteld)'}`} />
        <CheckRow checked={noLimit} onChange={(v) => { setNoLimit(v); if (v) setExtraTime(false); }} label="Geen tijdslimiet" />
        <CheckRow checked={extraAttempt} onChange={setExtraAttempt} label={`Eén extra poging${widget.settings.maxAttempts > 0 ? ` (${widget.settings.maxAttempts} → ${widget.settings.maxAttempts + 1})` : ' (onbeperkt ingesteld)'}`} />
        {hasEffect ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
            <input className="input input-sm" readOnly value={adaptedUrl || 'Link wordt klaargemaakt…'} aria-label="Aangepaste deellink" aria-busy={!adaptedUrl} onFocus={(e) => e.target.select()} />
            <CopyButton text={adaptedUrl} label="Kopiëren" />
          </div>
        ) : (
          <p className="hint">Vink een aanpassing aan die effect heeft op deze widget.</p>
        )}
      </div>
    </details>
  );
}

// ── Toewijzen aan een klas ──────────────────────────────────────────────────

/** Timestamp naar lokale JJJJ-MM-DD voor <input type="date"> — geen UTC-afkapping. */
function toDateInputValue(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Van "delen" naar "opgeven": dezelfde cursus of oefening als opdracht in een
 * klas zetten, met een deadline. De leerling ziet ze meteen in zijn klaslink,
 * de leerkracht in zijn klasoverzicht. Ook gebruikt door de cursus-deelmodal.
 */
export function AssignToClassSection({
  kind, targetId, title, doelgroep,
}: {
  kind: 'course' | 'widget';
  targetId: string;
  title: string;
  /**
   * De studierichting en het jaar van de cursus (de aanroeper rekent ze uit, want dit bestand haalt geen leerplannen binnen).
   * Met een doelgroep staan de klassen voor die richting bovenaan, in een eigen groep van de keuzelijst. Er wordt niets
   * vooraf gekozen: dat blijft alleen als er precies één klas is.
   */
  doelgroep?: Doelgroep;
}) {
  const toast = useToast();
  const classes = useMemo(() => getClasses(), []);
  // Alleen groepen als er klassen voor de richting van de cursus zijn; anders blijft het één gewone lijst.
  const groepen = useMemo(() => {
    if (!doelgroep) return null;
    const { passend, andere } = klassenVoorToewijzen(classes, doelgroep);
    return passend.length > 0 ? { label: klassenVoorLabel(doelgroep), passend, andere } : null;
  }, [classes, doelgroep]);
  const klasOptie = (c: (typeof classes)[number]) => (
    <option key={c.id} value={c.id}>{c.name}{c.schoolYear ? ` (${c.schoolYear})` : ''}</option>
  );
  const [classId, setClassId] = useState(() => (classes.length === 1 ? classes[0].id : ''));
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');
  const [melding, setMelding] = useState('');

  // Bewust zonder useMemo: de opdrachtenlijst is klein, en na het toewijzen
  // moet deze regel meteen de nieuwe stand tonen ("bijwerken" i.p.v. "toewijzen").
  const bestaande = classId
    ? assignmentsForClass(classId).find((a) => a.kind === kind && a.targetId === targetId)
    : undefined;

  // Bij het kiezen van een klas (en bij het openen als er maar één klas is,
  // via de initiële classId hierboven) de al ingevulde deadline en instructie
  // overnemen — anders lijkt het alsof "bijwerken" ze zou wissen.
  useEffect(() => {
    if (!classId) return;
    const a = assignmentsForClass(classId).find((x) => x.kind === kind && x.targetId === targetId);
    setDue(a?.dueAt ? toDateInputValue(a.dueAt) : '');
    setNote(a?.note ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  if (classes.length === 0) {
    return (
      <div className="callout">
        <span aria-hidden><AssignIcon size={18} /></span>
        <div>
          <strong>Toewijzen aan een klas?</strong>{' '}
          <Link to="/klassen?nieuw=1">Maak een klas aan</Link>. Daarna geef je deze {kind === 'course' ? 'cursus' : 'oefening'}{' '}
          in één klik op, met deadline — en volg je in één overzicht wie ze al maakte. Namen hangen dan
          vast aan je klaslijst, in plaats van dat leerlingen ze zelf intikken.
        </div>
      </div>
    );
  }

  const toewijzen = () => {
    if (!classId) return;
    const dueAt = due ? new Date(`${due}T23:59:59`).getTime() : null;
    const cls = classes.find((c) => c.id === classId);
    const { assignment, created } = upsertAssignment({
      classId, kind, targetId,
      dueAt: Number.isFinite(dueAt) ? dueAt : null,
      note: note.trim() || undefined,
    });
    const badge = dueBadge(assignment.dueAt);
    const tekst = `“${title}” staat nu in ${cls?.name ?? 'de klas'}${badge ? ` (deadline: ${badge.label})` : ''}.`;
    setMelding(tekst);
    toast(created ? 'Toegewezen aan de klas' : 'Opdracht bijgewerkt', 'ok');
  };

  return (
    <div>
      <div className="callout">
        <span aria-hidden><AssignIcon size={18} /></span>
        <div>
          <strong>Toewijzen aan een klas:</strong> je leerlingen zien deze opdracht in hun klaslink en
          kiezen hun naam uit de klaslijst — geen tikfouten of dubbels, en hun werk komt automatisch
          onder hun eigen naam in je klasoverzicht terecht.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 200px' }}>
          <Field label="Klas">
            <select className="select" value={classId} onChange={(e) => { setClassId(e.target.value); setMelding(''); }}>
              <option value="">— kies een klas —</option>
              {groepen ? (
                <>
                  <optgroup label={groepen.label}>{groepen.passend.map(klasOptie)}</optgroup>
                  {groepen.andere.length > 0 && <optgroup label={ANDERE_KLASSEN}>{groepen.andere.map(klasOptie)}</optgroup>}
                </>
              ) : classes.map(klasOptie)}
            </select>
          </Field>
        </div>
        <div style={{ flex: '1 1 160px' }}>
          <Field label="Deadline (optioneel)">
            <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
      </div>
      <Field label="Instructie (optioneel)" hint="Eén zin: wat verwacht je van je leerlingen?">
        <input
          className="input"
          value={note}
          placeholder="bv. Maak dit tegen vrijdag; één poging volstaat."
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" disabled={!classId} onClick={toewijzen}>
          {bestaande ? <><CheckIcon size={16} /> Opdracht bijwerken</> : <><AddIcon size={16} /> Toewijzen aan deze klas</>}
        </button>
        {bestaande && !melding && (
          <span className="hint">Staat al in deze klas — bijwerken past de deadline aan.</span>
        )}
        {melding && (
          <span className="hint" role="status">
            {melding} <Link to={`/klas/${classId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>klasoverzicht <ArrowRight size={14} /></Link>
          </span>
        )}
      </div>
    </div>
  );
}
