// ── Bestaand materiaal verwerken (/importeren) ──────────────────────────────
//
// De meeste leerkrachten beginnen niet bij nul: er ligt al een Word-document,
// een pdf of een oude cursus. Deze pagina is de brug. Ze haalt de tekst uit
// wat je erin gooit, laat je die nalezen en aanpassen, en biedt dan vier
// duidelijke vervolgstappen: cursus met AI, oefeningen met AI, cursus zonder
// AI, of — bij een Boosterz-bestand — meteen importeren.
//
// Alles gebeurt op dit toestel. Pas wanneer je zelf voor een AI-stap kiest,
// vertrekt de tekst naar je gekozen AI-aanbieder.

import React, { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, type LucideIcon, Package, Puzzle } from 'lucide-react';
import {
  describeCourseImport, describePackImport, extractFromFile, findCourseImportConflicts, fromPastedText,
  ImportError, IMPORT_ACCEPT, MAX_COMFORT_CHARS, markdownToCourse, mergeSourcesToCourse, saveCourseWithWidgets,
  saveImportedCourse, saveImportedPack, saveImportedWidget, STORAGE_FULL_HINT,
} from '../lib/importers';
import type { CourseBundle, ExtractedSource, ImportTone } from '../lib/importers';
import type { Course } from '../lib/courseTypes';
import type { Widget } from '../lib/types';
import { conflictKey, type SharedChoice, type SharedConflict } from '../lib/courses';
import { deriveExercises, describeDerived } from '../lib/deriveExercises';
import { setHandoff } from '../lib/handoff';
import { getCurricula } from '../lib/curriculum';
import { suggestCourseTitle } from '../lib/importTitle';
import { EmptyState, Field, Modal, useToast } from '../components/ui';
import { uid } from '../lib/utils';
import {
  AddIcon, AIIcon, BackIcon, CheckIcon, CourseIcon, DeleteIcon, EditIcon, ImportIcon, PrivacyIcon, RetryIcon,
  WarningIcon,
} from '../components/icons';
import '../styles/cursus.css';

interface SourceItem extends ExtractedSource {
  key: string;
  /** Samenvatting nadat een json-bron geïmporteerd is (eerlijk: ook wat niet lukte). */
  imported?: string;
  /** Hoe het afliep: alles bewaard (ok) of maar een deel (warn). */
  importTone?: ImportTone;
  /** Label bij de samenvatting, bv. "geïmporteerd" of "deels bewaard". */
  importBadge?: string;
  /** Waar je naartoe kan na die import. */
  importedTo?: { label: React.ReactNode; to: string };
  /** Widgets uit een pakket die niet bewaard konden worden (opslag vol): opnieuw te proberen. */
  retry?: { widgets: Widget[]; folderId: string | null; folderName: string; saved: number; folderSaved: boolean };
}

const KIND_META: Record<ExtractedSource['kind'], { icon: LucideIcon; label: string }> = {
  text: { icon: FileText, label: 'tekst' },
  widget: { icon: Puzzle, label: 'widget' },
  pack: { icon: Package, label: 'pakket' },
  course: { icon: CourseIcon, label: 'cursus' },
};

export function ImportPage() {
  const toast = useToast();
  const navigate = useNavigate();

  const [items, setItems] = useState<SourceItem[]>([]);
  const [paste, setPaste] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [curriculumId, setCurriculumId] = useState('');
  const [sectionLevel, setSectionLevel] = useState<2 | 3>(2);
  const [mergeTitle, setMergeTitle] = useState('');
  const [deriveOn, setDeriveOn] = useState(true);
  /** Bron die nu geïmporteerd wordt (knop even uit: niet twee keer importeren). */
  const [importing, setImporting] = useState<string | null>(null);
  /** Cursusbestand dat een andere versie bevat van eigen werk: eerst kiezen. */
  const [courseConflict, setCourseConflict] = useState<{ item: SourceItem; conflicts: SharedConflict[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const curricula = useMemo(() => getCurricula(), []);

  const patch = (key: string, next: Partial<SourceItem>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...next } : it)));

  const remove = (key: string) => setItems((list) => list.filter((it) => it.key !== key));

  /**
   * Titelvoorstel voor een tekstbron: de eerste duidelijke kop in het
   * document, anders de titel die de bron al meekreeg (doorgaans de
   * bestandsnaam zonder extensie). De leerkracht ziet en past dit meteen aan
   * in "Titel van deze bron" — vóór ze op "Omzetten naar cursus" klikt.
   */
  function withSuggestedTitle(src: ExtractedSource): ExtractedSource {
    if (src.kind !== 'text') return src;
    return { ...src, title: suggestCourseTitle(src.text, src.title) };
  }

  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    let added = 0;
    for (const file of files) {
      setBusy(file.name);
      setStatus(`“${file.name}” wordt gelezen…`);
      try {
        const src = withSuggestedTitle(await extractFromFile(file));
        setItems((list) => [...list, { ...src, key: uid() }]);
        added++;
        setStatus(`“${file.name}” is ingelezen.`);
      } catch (e) {
        const msg = e instanceof ImportError ? e.message : `“${file.name}” kon niet gelezen worden.`;
        setStatus(msg);
        toast(msg, 'err');
      }
    }
    setBusy(null);
    if (added > 0) toast(`${added} ${added === 1 ? 'bron' : 'bronnen'} toegevoegd`, 'ok');
  }

  function addPaste() {
    try {
      const raw = fromPastedText(paste, pasteTitle.trim() || 'Geplakte tekst');
      // Een titel die de leerkracht hier zelf al intypte, laten we met rust.
      const src = pasteTitle.trim() ? raw : withSuggestedTitle(raw);
      setItems((list) => [...list, { ...src, key: uid() }]);
      setPaste('');
      setPasteTitle('');
      setStatus('De geplakte tekst is toegevoegd.');
      toast('Tekst toegevoegd', 'ok');
    } catch (e) {
      const msg = e instanceof ImportError ? e.message : 'De tekst kon niet verwerkt worden.';
      setStatus(msg);
      toast(msg, 'err');
    }
  }

  // ── Vervolgstappen ────────────────────────────────────────────────────────

  function toHandoff(item: SourceItem, target: 'cursus' | 'studio') {
    const source = item.text.trim();
    if (!source) {
      toast('Er staat nog geen tekst in deze bron.', 'err');
      return;
    }
    const ok = setHandoff({
      source,
      title: item.title.trim() || undefined,
      curriculumId: curriculumId || undefined,
      origin: item.origin,
    });
    if (!ok) {
      toast('De tekst kon niet doorgegeven worden (de sessieopslag zit vol). Kopieer ze zelf naar de AI-pagina.', 'err');
      return;
    }
    navigate(target === 'cursus' ? '/cursussen?ai=nieuw' : '/ai-studio');
  }

  /**
   * De titel komt uit "Titel van deze bron" — die staat al vóór dit moment op
   * het scherm, met een voorstel (eerste kop, anders de bestandsnaam), en de
   * leerkracht kon ze al aanpassen. Die titel wint altijd, ook als er verderop
   * in de tekst nog een `#`-kop staat.
   */
  function toCourseWithoutAI(item: SourceItem) {
    const text = item.text.trim();
    if (!text) {
      toast('Er staat nog geen tekst in deze bron.', 'err');
      return;
    }
    const chosenTitle = item.title.trim() || item.origin;
    const built = markdownToCourse(item.text, chosenTitle, { sectionLevel });
    built.title = chosenTitle;
    if (curriculumId) built.curriculumId = curriculumId;
    const done = finishCourse(built);
    if (!done) return;
    const { course, note } = done;
    const sections = course.chapters.reduce((n, ch) => n + ch.sections.length, 0);
    reportCourse(
      `Cursus “${course.title}” aangemaakt — ${course.chapters.length} hoofdstuk${course.chapters.length === 1 ? '' : 'ken'}, ${sections} sectie${sections === 1 ? '' : 's'}${note}`,
      done.failedNote
    );
    navigate(`/cursus/bewerk/${course.id}`);
  }

  /** Melding na het omzetten: volledig gelukt (ok) of met oefeningen die niet bewaard konden worden (err). */
  function reportCourse(text: string, failedNote: string) {
    if (failedNote) toast(`${text}. ${failedNote}`, 'err');
    else toast(text, 'ok');
  }

  /**
   * Optioneel oefeningen afleiden (begrippenquiz, koppelspel, invuloefeningen,
   * werkblad met de opdrachten) en alles bewaren. Zie lib/deriveExercises.ts.
   * null = de cursus kon niet bewaard worden (opslag vol): dan blijft de
   * leerkracht hier, met haar tekst nog op het scherm.
   */
  function finishCourse(built: Course): { course: Course; note: string; failedNote: string } | null {
    const derived = deriveOn ? deriveExercises(built, { curriculumId: built.curriculumId }) : null;
    const res = saveCourseWithWidgets(derived ? derived.course : built, derived ? derived.widgets : []);
    if (!res.saved) {
      const msg = `De cursus is niet bewaard: de opslag van dit toestel is vol. Je tekst staat nog hier. ${STORAGE_FULL_HINT}`;
      setStatus(msg);
      toast(msg, 'err');
      return null;
    }
    const note = derived && res.widgetsSaved > 0 ? ` — ${describeDerived(derived.counts)}` : '';
    const failedNote = res.widgetsFailed > 0
      ? `${res.widgetsFailed} afgeleide oefening${res.widgetsFailed === 1 ? '' : 'en'} kon${res.widgetsFailed === 1 ? '' : 'den'} niet bewaard worden: de opslag van dit toestel is vol`
      : '';
    return { course: res.course, note, failedNote };
  }

  /** Alle tekstbronnen samen: elk bestand een hoofdstuk (in de volgorde van de lijst). */
  function mergeToCourse() {
    const texts = items.filter((it) => it.kind === 'text' && it.text.trim());
    if (texts.length < 2) {
      toast('Voeg minstens twee bronnen met tekst toe om ze samen te voegen.', 'err');
      return;
    }
    const title = mergeTitle.trim() || 'Cursus';
    const built = mergeSourcesToCourse(
      texts.map((it) => ({ title: it.title.trim() || it.origin, text: it.text })),
      title,
      { sectionLevel }
    );
    if (curriculumId) built.curriculumId = curriculumId;
    const done = finishCourse(built);
    if (!done) return;
    const { course, note } = done;
    const sections = course.chapters.reduce((n, ch) => n + ch.sections.length, 0);
    reportCourse(`Cursus “${course.title}” aangemaakt — ${course.chapters.length} hoofdstukken, ${sections} secties${note}`, done.failedNote);
    navigate(`/cursus/bewerk/${course.id}`);
  }

  // ── Boosterz-bestanden importeren ─────────────────────────────────────────
  // Eerlijk melden (OP2, OP11): "geïmporteerd" alleen voor wat echt bewaard
  // is; bij een volle opslag zegt de kaart wat wel en wat niet lukte.

  /** Eén importactie tegelijk, met een nette foutmelding als er iets misgaat. */
  async function guarded(key: string, run: () => void | Promise<void>) {
    if (importing) return;
    setImporting(key);
    try {
      await run();
    } catch (e) {
      const msg = e instanceof ImportError ? e.message : 'Importeren is mislukt.';
      toast(msg, 'err');
      setStatus(msg);
    } finally {
      setImporting(null);
    }
  }

  function importJson(item: SourceItem) {
    void guarded(item.key, async () => {
      if (item.kind === 'widget' && item.widget) {
        const saved = saveImportedWidget(item.widget); // gooit een ImportError als de opslag vol is
        const text = `“${saved.title}” staat nu bij je widgets (code ${saved.code}).`;
        patch(item.key, {
          imported: text,
          importTone: 'ok',
          importBadge: 'geïmporteerd',
          importedTo: { label: <><EditIcon size={16} /> Openen in de editor</>, to: `/bewerk/${saved.id}` },
        });
        setStatus(text);
        toast(`“${saved.title}” geïmporteerd`, 'ok');
        return;
      }
      if (item.kind === 'pack' && item.pack) {
        finishPack(item, saveImportedPack(item.pack), 0);
        return;
      }
      if (item.kind === 'course' && item.course) {
        // Staat er al een andere versie als eigen werk? Dan eerst kiezen,
        // nooit stil vervangen (zelfde regels als op de cursuspagina).
        const conflicts = await findCourseImportConflicts(item.course);
        if (conflicts.length > 0) {
          setCourseConflict({ item, conflicts });
          return;
        }
        await finishCourseImport(item, item.course);
      }
    });
  }

  /** Na een pakketimport (of een nieuwe poging): de kaart en de melding bijwerken. */
  function finishPack(item: SourceItem, res: ReturnType<typeof saveImportedPack>, alreadySaved: number) {
    const { text, tone } = describePackImport(res, alreadySaved);
    setStatus(text);
    if (alreadySaved === 0 && res.widgets.length === 0) {
      // Niets bewaard: de knop "Nu importeren" blijft, voor na het opruimen.
      toast(text, 'err');
      return;
    }
    patch(item.key, {
      imported: text,
      importTone: tone,
      importBadge: tone === 'ok' ? 'geïmporteerd' : 'deels bewaard',
      importedTo: {
        label: <><Puzzle size={16} /> Naar mijn widgets</>,
        to: res.folderId ? `/widgets?map=${encodeURIComponent(res.folderId)}` : '/widgets',
      },
      retry: res.failed.length > 0
        ? {
            widgets: res.failed, folderId: res.folderId, folderName: res.folderName,
            saved: alreadySaved + res.widgets.length, folderSaved: res.folderSaved,
          }
        : undefined,
    });
    const total = alreadySaved + res.widgets.length;
    toast(tone === 'ok' ? `${total} widget${total === 1 ? '' : 's'} geïmporteerd` : text, tone === 'ok' ? 'ok' : 'err');
  }

  /** De widgets die bij een volle opslag niet bewaard konden worden, opnieuw proberen (in dezelfde map). */
  function retryPack(item: SourceItem) {
    const r = item.retry;
    if (!r || !item.pack) return;
    void guarded(item.key, () => {
      const res = saveImportedPack(
        { ...item.pack!, widgets: r.widgets },
        { intoFolder: { id: r.folderId, name: r.folderName, folderSaved: r.folderSaved } }
      );
      finishPack(item, res, r.saved);
    });
  }

  /** Een cursusbestand bewaren (na de keuze, als die nodig was) en eerlijk melden wat er gebeurde. */
  async function finishCourseImport(
    item: SourceItem,
    bundle: CourseBundle,
    keuze?: { choice: SharedChoice; conflicts: SharedConflict[] }
  ) {
    const res = await saveImportedCourse(bundle, keuze);
    const { text, tone, badge } = describeCourseImport(res);
    setStatus(text);
    if (res.outcome === 'mislukt') {
      toast(text, 'err');
      return;
    }
    patch(item.key, {
      imported: text,
      importTone: tone,
      importBadge: badge,
      importedTo: res.courseId
        ? { label: <><CourseIcon size={16} /> Cursus openen</>, to: `/cursus/bewerk/${res.courseId}` }
        : undefined,
    });
    toast(text, tone === 'ok' ? 'ok' : 'err');
  }

  // ── Weergave ──────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}><ImportIcon size={24} /> Bestaand materiaal verwerken</h1>
          <p className="sub">
            Je Word-document, pdf of losse tekst wordt hier leesbare tekst — en daarna een cursus of oefeningen.
          </p>
        </div>
        <div className="page-head-actions">
          <Link to="/widgets" className="btn btn-ghost"><BackIcon size={16} /> Mijn widgets</Link>
        </div>
      </div>

      <div className="callout" style={{ marginBottom: 18 }}>
        {/* Eén flex-kind i.p.v. vier: anders zet .callout (display: flex) elk
            blok in een eigen smalle kolom naast elkaar, met tekstoverloop tot gevolg. */}
        <div style={{ minWidth: 0 }}>
          <strong>Wat kan hier binnen?</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
            <li><strong>.docx</strong> (Word), <strong>.pdf</strong>, <strong>.md</strong>, <strong>.txt</strong> en <strong>.html</strong> → de tekst eruit.</li>
            <li><strong>.json</strong> uit Boosterz → een widget, een vakgroeppakket of een cursus, meteen te importeren.</li>
          </ul>
          <p className="hint" style={{ margin: '8px 0 0' }}>
            <WarningIcon size={16} className="icon-inline" aria-hidden /> Een <strong>gescande</strong> pdf (foto’s van
            pagina’s) bevat geen tekstlaag: daar komt niets uit. Gebruik dan het originele bestand of plak de tekst
            hieronder zelf.
          </p>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            <PrivacyIcon size={16} className="icon-inline" aria-hidden /> Het lezen gebeurt volledig op dit toestel. Er
            vertrekt <strong>niets</strong> naar het internet, behalve de tekst die je zelf naar een AI-stap stuurt —
            die gaat dan naar je gekozen AI-aanbieder.
          </p>
        </div>
      </div>

      {/* ── Bronnen toevoegen ── */}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void addFiles(Array.from(e.dataTransfer.files ?? []));
          }}
          style={{
            border: `2px dashed ${dragOver ? 'var(--brand)' : 'var(--line-strong)'}`,
            background: dragOver ? 'var(--brand-soft)' : 'transparent',
            borderRadius: 12,
            padding: '20px 16px',
            textAlign: 'center',
            display: 'grid',
            gap: 8,
            justifyItems: 'center',
          }}
        >
          <span aria-hidden style={{ display: 'flex', color: 'var(--brand)' }}><ImportIcon size={32} /></span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
            aria-busy={busy !== null}
          >
            {busy ? `${busy} lezen…` : 'Bestanden kiezen…'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={IMPORT_ACCEPT}
            multiple
            hidden
            onChange={(e) => {
              void addFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
          <span className="hint">
            Of sleep je bestanden hierheen. Meerdere tegelijk mag — elke bron krijgt hieronder een eigen kaart.
          </span>
        </div>

        <p className="hint" role="status" aria-live="polite" style={{ margin: '10px 0 0', minHeight: '1.2em' }}>
          {status}
        </p>

        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <EditIcon size={16} aria-hidden /> Of plak je tekst rechtstreeks
          </summary>
          <div style={{ paddingTop: 10 }}>
            <Field label="Titel (optioneel)">
              <input
                className="input"
                type="text"
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
                placeholder='bv. "Hoofdstuk 3 — de waterkringloop"'
                style={{ maxWidth: 360 }}
              />
            </Field>
            <Field label="Tekst" hint="Een hoofdstuk, een samenvatting, een artikel … markdown mag ook.">
              <textarea
                className="textarea"
                rows={6}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder="Plak hier je tekst…"
              />
            </Field>
            <button className="btn btn-primary" onClick={addPaste} disabled={!paste.trim()}>
              <AddIcon size={16} /> Tekst toevoegen als bron
            </button>
          </div>
        </details>
      </div>

      {/* ── Leerplan dat meereist naar de AI-stappen ── */}
      {items.some((it) => it.kind === 'text') && (
        <div className="card card-pad" style={{ marginBottom: 18 }}>
          <Field
            label="Leerplan (optioneel)"
            hint="Wordt meegegeven aan de AI-stappen hieronder, zodat vragen en secties meteen aan de juiste leerplandoelen hangen."
          >
            {curricula.length > 0 ? (
              <select
                className="select"
                value={curriculumId}
                onChange={(e) => setCurriculumId(e.target.value)}
                style={{ maxWidth: 460 }}
              >
                <option value="">Geen leerplan koppelen</option>
                {curricula.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} — {c.subject}, {c.level} ({c.goals.length} doelen)
                  </option>
                ))}
              </select>
            ) : (
              <span className="hint">
                Je hebt nog geen leerplan. <Link to="/leerplannen">Voeg er eerst een toe</Link> als je met
                leerplandoelen wil werken — het hoeft niet.
              </span>
            )}
          </Field>
          <Field
            label="Wat wordt een sectie bij omzetten zonder AI?"
            hint="Kies niveau 3 als je materiaal genummerde tussentitels heeft (1.1, 1.2 …) onder bredere titels: elke genummerde titel wordt dan een sectie en de bredere titel een tussenkop."
          >
            <select
              className="select"
              value={String(sectionLevel)}
              onChange={(e) => setSectionLevel(e.target.value === '3' ? 3 : 2)}
              style={{ maxWidth: 460 }}
            >
              <option value="2">Koppen van niveau 2 (## of de op één na grootste titel)</option>
              <option value="3">Koppen van niveau 3 (### of genummerde tussentitels zoals 1.1)</option>
            </select>
          </Field>
          <label className="check" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 6 }}>
            <input type="checkbox" checked={deriveOn} onChange={(e) => setDeriveOn(e.target.checked)} />
            <span>
              <strong>Oefeningen afleiden bij omzetten zonder AI.</strong>{' '}
              <span className="hint">
                Uit een begrippenlijst komt een begrippenquiz en een koppelspel, uit de vette kernbegrippen per sectie een
                invuloefening, en de kadertjes “Oefening:”/“Opdracht:” worden een werkblad met open vragen. Allemaal
                zonder AI, dus voorspelbaar; de AI-stap maakt er later rijkere vragen bij.
              </span>
            </span>
          </label>
          {items.filter((it) => it.kind === 'text').length >= 2 && (
            <div className="callout" style={{ marginTop: 6 }}>
              <CourseIcon size={18} aria-hidden style={{ flex: 'none' }} />
              <div style={{ flex: 1 }}>
                <strong>Alles samen: één cursus.</strong> Elk bestand wordt een hoofdstuk, in de volgorde van de
                lijst hieronder; begint een bestand met een eigen titel (“Hoofdstuk 3: Materie”), dan wordt die de
                hoofdstuktitel.
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                  <input
                    className="input input-sm"
                    value={mergeTitle}
                    onChange={(e) => setMergeTitle(e.target.value)}
                    placeholder="Titel van de cursus, bv. Natuurwetenschappen 1e graad"
                    aria-label="Titel van de samengevoegde cursus"
                    style={{ maxWidth: 380 }}
                  />
                  <button className="btn btn-primary btn-sm" onClick={mergeToCourse}>
                    <CourseIcon size={16} /> Samenvoegen tot één cursus (zonder AI)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── De bronnen ── */}
      {items.length === 0 ? (
        <EmptyState icon={<CourseIcon size={40} />} title="Nog geen bronmateriaal">
          <p>
            Kies hierboven een bestand of plak je tekst. Je ziet dan eerst wat eruit komt — pas daarna beslis
            jij wat ermee gebeurt.
          </p>
        </EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {items.map((item) => (
            <SourceCard
              key={item.key}
              item={item}
              onChange={(next) => patch(item.key, next)}
              onRemove={() => remove(item.key)}
              onCourseAI={() => toHandoff(item, 'cursus')}
              onWidgetsAI={() => toHandoff(item, 'studio')}
              onCourse={() => toCourseWithoutAI(item)}
              onImport={() => importJson(item)}
              onRetry={() => retryPack(item)}
              busy={importing === item.key}
            />
          ))}
        </div>
      )}

      {courseConflict && (
        <CourseConflictModal
          conflicts={courseConflict.conflicts}
          onChoose={(choice) => {
            const { item, conflicts } = courseConflict;
            setCourseConflict(null);
            if (!item.course) return;
            const bundle = item.course;
            void guarded(item.key, () => finishCourseImport(item, bundle, { choice, conflicts }));
          }}
          onClose={() => {
            setCourseConflict(null);
            setStatus('Importeren geannuleerd: er is niets veranderd.');
          }}
        />
      )}
    </div>
  );
}

/**
 * Het cursusbestand bevat een andere versie van een cursus of widget die hier
 * al als eigen werk staat. Drie keuzes, zoals op de cursuspagina; nooit stil
 * overschrijven (OP11, V3). Sluiten (Escape of Annuleren) importeert niets.
 */
function CourseConflictModal({
  conflicts, onChoose, onClose,
}: {
  conflicts: SharedConflict[];
  onChoose: (choice: SharedChoice) => void;
  onClose: () => void;
}) {
  const keuzes: { choice: SharedChoice; label: string; uitleg: string; primary?: boolean }[] = [
    {
      choice: 'kopie',
      label: 'Als kopie bewaren',
      uitleg: 'De versie uit het bestand komt ernaast, met “(kopie)” in de titel. Er gaat niets verloren.',
      primary: true,
    },
    { choice: 'houden', label: 'Mijn versie houden', uitleg: 'Wat hier staat, blijft; de rest van het bestand komt erbij.' },
    {
      choice: 'bijwerken',
      label: 'Vervangen door de versie uit het bestand',
      uitleg: 'Je huidige versie gaat verloren (exporteer ze eerst als je twijfelt).',
    },
  ];
  return (
    <Modal
      title="Er staat al een versie op dit toestel"
      onClose={onClose}
      footer={<button type="button" className="btn btn-ghost" onClick={onClose}>Annuleren</button>}
    >
      <p>Het bestand bevat een andere versie van:</p>
      <ul>
        {conflicts.map((c) => (
          <li key={conflictKey(c)}>
            {c.kind === 'course' ? 'Cursus' : 'Widget'} <strong>“{c.title}”</strong>
            {c.localTitle !== c.title && <> (hier: “{c.localTitle}”)</>}
            {c.older && <> — de versie in het bestand is <strong>ouder</strong> dan die op dit toestel</>}
          </li>
        ))}
      </ul>
      <div style={{ display: 'grid', gap: 12 }}>
        {keuzes.map((k) => (
          <div key={k.choice}>
            <button
              type="button"
              className={`btn ${k.primary ? 'btn-primary' : 'btn-ghost'}`}
              style={{ width: '100%' }}
              aria-describedby={`import-keuze-${k.choice}`}
              onClick={() => onChoose(k.choice)}
            >
              {k.label}
            </button>
            <p id={`import-keuze-${k.choice}`} className="hint" style={{ margin: '4px 0 0' }}>{k.uitleg}</p>
          </div>
        ))}
      </div>
      <p className="hint">Leesvoortgang van leerlingen blijft altijd staan.</p>
    </Modal>
  );
}

// ── Eén bron ────────────────────────────────────────────────────────────────

function SourceCard({
  item, onChange, onRemove, onCourseAI, onWidgetsAI, onCourse, onImport, onRetry, busy,
}: {
  item: SourceItem;
  onChange: (next: Partial<SourceItem>) => void;
  onRemove: () => void;
  onCourseAI: () => void;
  onWidgetsAI: () => void;
  onCourse: () => void;
  onImport: () => void;
  onRetry: () => void;
  /** Deze bron wordt nu geïmporteerd. */
  busy: boolean;
}) {
  const counterId = `teller-${item.key}`;
  const tooLong = item.text.length > MAX_COMFORT_CHARS;
  const empty = item.text.trim() === '';
  const kindMeta = KIND_META[item.kind];

  return (
    <div className="card card-pad">
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <Field
            label="Titel van deze bron"
            hint={item.kind === 'text' ? 'Ook de titel van de cursus bij "Omzetten naar cursus" — pas ze hier aan.' : undefined}
          >
            <input
              className="input"
              type="text"
              value={item.title}
              onChange={(e) => onChange({ title: e.target.value })}
            />
          </Field>
          <p className="hint" style={{ margin: '-8px 0 0' }}>
            <span className="badge badge-brand"><kindMeta.icon size={13} /> {kindMeta.label}</span>{' '}
            uit <strong>{item.origin}</strong> · {item.sourceLabel}
          </p>
        </div>
        <button
          className="btn btn-sm btn-quiet"
          style={{ color: 'var(--err)' }}
          onClick={onRemove}
          aria-label={`Bron “${item.title}” verwijderen uit deze lijst`}
        >
          <DeleteIcon size={16} /> Verwijderen
        </button>
      </div>

      {item.warnings.length > 0 && (
        <div className="callout warn" style={{ margin: '12px 0' }} role="status">
          <div style={{ minWidth: 0 }}>
            {item.warnings.map((w, i) => (
              <p key={i} style={{ margin: i === 0 ? 0 : '6px 0 0' }}>
                <WarningIcon size={16} className="icon-inline" aria-hidden /> {w}
              </p>
            ))}
          </div>
        </div>
      )}

      {item.kind === 'text' ? (
        <>
          <Field label="Geëxtraheerde tekst — lees ze even na en pas gerust aan">
            <textarea
              className="textarea"
              rows={10}
              value={item.text}
              onChange={(e) => onChange({ text: e.target.value })}
              aria-describedby={counterId}
              placeholder="Hier stond geen tekst — typ of plak ze zelf."
            />
          </Field>
          <p
            id={counterId}
            className="hint"
            aria-live="polite"
            style={{ margin: '-8px 0 12px', ...(tooLong ? { color: 'var(--warn)', fontWeight: 600 } : {}) }}
          >
            {item.text.length.toLocaleString('nl-BE')} tekens
            {tooLong && (
              <>
                {' — '}<WarningIcon size={14} className="icon-inline" aria-hidden /> erg lang: knip in kleinere
                stukken voor een beter resultaat
              </>
            )}
          </p>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <strong style={{ display: 'block', marginBottom: 8 }}>Wat wil je hiermee doen?</strong>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-ai" onClick={onCourseAI} disabled={empty}>
                <AIIcon size={16} /> Cursus bouwen met AI
              </button>
              <button className="btn btn-ai" onClick={onWidgetsAI} disabled={empty}>
                <AIIcon size={16} /> Oefeningen maken met AI
              </button>
              <button className="btn btn-ghost" onClick={onCourse} disabled={empty}>
                <CourseIcon size={16} /> Omzetten naar cursus (zonder AI)
              </button>
            </div>
            <p className="hint" style={{ margin: '8px 0 0' }}>
              Zonder AI wordt de opmaak letterlijk gevolgd: <code>#</code> wordt een hoofdstuk,
              <code> ##</code> een sectie, <code> ###</code> een tussenkop; alinea’s, lijsten en tabellen
              worden blokken. Niets verlaat je toestel.
            </p>
            {empty && <p className="hint" style={{ margin: '4px 0 0' }}>Vul eerst tekst in om verder te kunnen.</p>}
          </div>
        </>
      ) : (
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <p style={{ margin: '0 0 10px' }}>{describeBundle(item)}</p>
          {item.imported ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {item.importTone === 'ok' || !item.importTone ? (
                <span className="badge badge-ok"><CheckIcon size={13} aria-hidden /> {item.importBadge ?? 'geïmporteerd'}</span>
              ) : (
                <span className="badge badge-warn"><WarningIcon size={13} aria-hidden /> {item.importBadge ?? 'deels bewaard'}</span>
              )}
              <span style={{ minWidth: 0, flex: '1 1 240px' }}>{item.imported}</span>
              {item.importedTo && (
                <Link className="btn btn-sm btn-ghost" to={item.importedTo.to}>{item.importedTo.label}</Link>
              )}
              {item.retry && (
                <button className="btn btn-sm btn-primary" onClick={onRetry} disabled={busy} aria-busy={busy}>
                  <RetryIcon size={16} aria-hidden /> Opnieuw proberen ({item.retry.widgets.length})
                </button>
              )}
            </div>
          ) : (
            <button className="btn btn-primary" onClick={onImport} disabled={busy} aria-busy={busy}>
              <ImportIcon size={16} /> {busy ? 'Bezig met importeren…' : 'Nu importeren'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function describeBundle(item: SourceItem): string {
  if (item.kind === 'widget' && item.widget) {
    return 'Dit is één widget. Bij het importeren krijgt ze een nieuwe deelcode, zodat ze naast je bestaande widgets kan bestaan.';
  }
  if (item.kind === 'pack' && item.pack) {
    const n = item.pack.widgets.length;
    return `Dit vakgroeppakket bevat ${n} widget${n === 1 ? '' : 's'}${item.pack.meta.auteur ? `, gedeeld door ${item.pack.meta.auteur}` : ''}. Ze komen in een nieuwe map “${item.pack.meta.naam}”.`;
  }
  if (item.kind === 'course' && item.course) {
    const n = item.course.widgets.length;
    const p = item.course.pdfs?.length ?? 0;
    const extra = [n ? `${n} meegereisde widget${n === 1 ? '' : 's'}` : '', p ? `${p} pdf${p === 1 ? '' : '’s'}` : '']
      .filter(Boolean)
      .join(' en ');
    return `Dit is een cursusbestand${extra ? ` met ${extra}` : ''}. Staat er al een andere versie op dit toestel, dan kies je eerst: vervangen, je eigen versie houden of als kopie bewaren.`;
  }
  return '';
}
