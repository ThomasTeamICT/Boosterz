import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { Bookmark, FileText } from 'lucide-react';
import { getSubmissions, getWidget, saveWidget } from '../lib/storage';
import { onStorageNotice } from '../lib/storageHealth';
import { syncState, versionOf } from '../lib/editorSync';
import {
  captureFocus, countMediaRefs, leaveMessage, restoreFocus, shouldRefreshMedia, type FocusSlot,
} from '../lib/editorOvernemen';
import { onMediaChange } from '../lib/mediaStore';
import { readableAccent } from '../lib/color';
import { exportWidgetJsonWithMedia } from '../lib/share';
import { downloadFile } from '../lib/utils';
import { getTypeDef } from '../widgets/registry';
import { getCurricula } from '../lib/curriculum';
import type { Widget } from '../lib/types';
import { CheckRow, Field, Modal, useToast } from '../components/ui';
import { ShareModal } from '../components/ShareModal';
import { AIEditorPanel } from '../components/AIEditorPanel';
import { AI_GEN_TYPES } from '../lib/aiWidgetGen';
import { saveCustomTemplate } from '../lib/customTemplates';
import { lintQuiz } from '../lib/linter';
import type { QuizConfig } from '../lib/types';
import { TypeTile } from '../components/TypeTile';
import {
  AIIcon, BackIcon, CheckIcon, CloseIcon, DownloadIcon, EditIcon, PreviewIcon, ResultsIcon,
  RetryIcon, SearchIcon, SettingsIcon, ShareIcon, PrintIcon, TryIcon, WarningIcon,
} from '../components/icons';
import '../styles/editor.css';

// ── Eerlijk bewaren (debugronde oktober 2026, OP3 en OP4) ───────────────────
// - "Bewaard" verschijnt alleen als saveWidget echt lukte; anders "Niet
//   bewaard" en één duidelijke banner, met opnieuw proberen en downloaden.
//   Het werk blijft op het scherm; weggaan wordt eerst gevraagd.
// - Er wordt alleen geschreven als er iets veranderde (openen alleen schrijft
//   niets), en nooit over een versie heen die een ander tabblad intussen
//   bewaarde, of over een widget die daar verwijderd werd: zie lib/editorSync.
// - Herstelpakket P3: een open AI-assistent telt als onbewaard werk (dan een
//   conflict in plaats van stil overnemen), nieuwe afbeeldingen verschijnen na
//   het overnemen vanzelf, de focus blijft in het veld waar je typte, en na een
//   bannerknop staat de focus op het titelveld: zie lib/editorOvernemen.

/** Sleutel van de widgets in localStorage (zie KEYS in lib/storage.ts). */
const WIDGETS_KEY = 'wf.widgets.v1';
const FAIL_FALLBACK = 'Bewaren op dit toestel is mislukt — je laatste wijziging is niet bewaard.';
/**
 * Bij het verwijderen van een widget gaan ook de resultaten van de leerlingen
 * weg (deleteWidget). Opnieuw bewaren zet enkel de widget zelf terug (B1).
 * Soorten zonder inzendingen hebben geen resultaten om te verliezen.
 */
const resultsGoneSentence = (w: Widget): string =>
  getTypeDef(w.type).hasSubmissions ? ' De resultaten van je leerlingen komen niet terug.' : '';

/** Wacht op een keuze van de leerkracht: tot dan schrijft de editor niets weg. */
type Hold = { kind: 'conflict' | 'verwijderd' };
type SaveStatus = 'rust' | 'bewaard' | 'bijgewerkt' | 'mislukt';
/** Wat adoptStored met de statusmelding doet: "Bijgewerkt" tonen, niets tonen, of laten zoals ze is. */
type AdoptNotice = 'bijgewerkt' | 'geen' | 'behouden';

export function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const initial = useMemo(() => (id ? getWidget(id) : undefined), [id]);
  const [widget, setWidget] = useState<Widget | undefined>(initial);
  const [tab, setTab] = useState<'content' | 'settings'>('content');
  const [previewMode, setPreviewMode] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('rust');
  const [failMessage, setFailMessage] = useState<string | null>(null);
  const [hold, setHoldState] = useState<Hold | null>(null);
  /** Telt op als de inhoud van buitenaf vervangen werd: de editoronderdelen beginnen dan opnieuw. */
  const [syncKey, setSyncKey] = useState(0);

  const widgetRef = useRef(widget);
  useEffect(() => { widgetRef.current = widget; }, [widget]);
  /** Wat het laatst bewaard (of uit de opslag gelezen) is; alleen een ander object is een wijziging. */
  const lastSavedRef = useRef<Widget | undefined>(initial);
  /** Versie (updatedAt) die deze editor het laatst in de opslag zag of er zelf schreef. */
  const knownRef = useRef<number>(versionOf(initial) ?? 0);
  const holdRef = useRef<Hold | null>(null);
  /** true tijdens saveWidget: een opslagmelding hoort dan bij ons eigen bewaren. */
  const savingRef = useRef(false);
  /** De AI-assistent staat open: zij bouwt op de config van het moment van openen (zie B6). */
  const aiOpenRef = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  /** Welk veld in het inhoudspaneel de focus had vóór het overnemen (B5). */
  const focusSlotRef = useRef<FocusSlot | null>(null);
  const noticeRef = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const flashTimer = useRef<number | null>(null);

  const setHold = useCallback((h: Hold | null) => {
    holdRef.current = h;
    setHoldState(h);
  }, []);

  const flash = useCallback((s: 'bewaard') => {
    setStatus(s);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setStatus((cur) => (cur === s ? 'rust' : cur)), 1200);
  }, []);
  useEffect(() => () => { if (flashTimer.current !== null) window.clearTimeout(flashTimer.current); }, []);

  /**
   * De versie uit de opslag tonen (na een wijziging in een ander tabblad, of op
   * vraag). De editor bouwt dan opnieuw op: onthoud eerst welk veld de focus had.
   * "Bijgewerkt" blijft staan tot de volgende wijziging of bewaring (B5).
   */
  const adoptStored = useCallback((stored: Widget, notice: AdoptNotice = 'geen') => {
    focusSlotRef.current = captureFocus(document.getElementById('panel-content'));
    if (flashTimer.current !== null) {
      window.clearTimeout(flashTimer.current);
      flashTimer.current = null;
    }
    lastSavedRef.current = stored;
    knownRef.current = versionOf(stored) ?? 0;
    widgetRef.current = stored;
    setHold(null);
    setFailMessage(null);
    setStatus((cur) => (notice === 'bijgewerkt' ? 'bijgewerkt' : notice === 'behouden' ? cur : 'rust'));
    setWidget(stored);
    setSyncKey((k) => k + 1);
  }, [setHold]);

  // Na het opnieuw opbouwen van de editor: de focus (en selectie) terugzetten,
  // zodat verder typen gewoon werkt (B5). Een lui geladen editor kan een
  // ogenblik later pas klaar zijn: dan nog enkele keren proberen.
  useLayoutEffect(() => {
    const slot = focusSlotRef.current;
    if (!slot) return;
    focusSlotRef.current = null;
    const root = document.getElementById('panel-content');
    if (restoreFocus(root, slot)) return;
    let tries = 0;
    let raf = 0;
    const again = () => {
      if (++tries > 12) return;
      // de leerkracht tikte intussen ergens anders: niets afpakken
      const active = document.activeElement;
      if (active && active !== document.body && !document.getElementById('panel-content')?.contains(active)) return;
      if (!restoreFocus(document.getElementById('panel-content'), slot)) raf = window.requestAnimationFrame(again);
    };
    raf = window.requestAnimationFrame(again);
    return () => window.cancelAnimationFrame(raf);
  }, [syncKey]);

  /**
   * Bewaart als er iets nieuws is. false = niet bewaard: de opslag is vol, of
   * een ander tabblad bewaarde of verwijderde de widget intussen (dan eerst
   * een keuze). `force`: de leerkracht koos uitdrukkelijk voor haar versie.
   */
  const persist = useCallback((w: Widget, force = false): boolean => {
    if (!force && w === lastSavedRef.current) return true;
    if (!force && holdRef.current) return false;
    if (!force) {
      const stored = getWidget(w.id);
      const state = syncState(versionOf(stored), knownRef.current, true);
      if (state === 'verwijderd') {
        setHold({ kind: 'verwijderd' });
        return false;
      }
      if (state === 'conflict') {
        setHold({ kind: 'conflict' });
        return false;
      }
    }
    savingRef.current = true;
    noticeRef.current = null;
    let ok = false;
    try {
      ok = saveWidget(w);
    } finally {
      savingRef.current = false;
    }
    if (!ok) {
      const notice = noticeRef.current;
      setFailMessage((cur) => notice ?? cur ?? FAIL_FALLBACK);
      setStatus('mislukt');
      return false;
    }
    lastSavedRef.current = w;
    knownRef.current = versionOf(getWidget(w.id)) ?? knownRef.current;
    setHold(null);
    setFailMessage(null);
    flash('bewaard');
    return true;
  }, [flash, setHold]);

  // Zelfde route, andere widget (terug/vooruit in de browser tussen twee
  // editors): de pagina blijft gemonteerd en useState houdt anders de vorige
  // widget vast. Eerst de vorige wegschrijven (de debounce hieronder wordt
  // geannuleerd), dan opnieuw beginnen met de nieuwe.
  useEffect(() => {
    const cur = widgetRef.current;
    if (cur?.id === initial?.id) return;
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (cur) persist(cur);
    lastSavedRef.current = initial;
    knownRef.current = versionOf(initial) ?? 0;
    widgetRef.current = initial;
    setHold(null);
    setFailMessage(null);
    setStatus('rust');
    setWidget(initial);
  }, [initial, persist, setHold]);

  // Automatisch bewaren met een korte debounce, alleen na een wijziging.
  useEffect(() => {
    if (!widget || widget === lastSavedRef.current) return;
    // De volgende wijziging: "Bijgewerkt uit een ander tabblad" heeft dan zijn werk gedaan.
    setStatus((cur) => (cur === 'bijgewerkt' ? 'rust' : cur));
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      persist(widget);
    }, 500);
    return () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [widget, persist]);

  // Wegschrijven bij unmount (wie binnen de debounce op "Terug" klikt) en bij
  // F5/tabblad sluiten (pagehide; dan draait de React-cleanup niet). Lukt
  // bewaren niet, dan vraagt de browser eerst of je echt weg wil.
  // Dit effect staat vóór de meldingenluisteraar: bij unmount ruimt React in
  // deze volgorde op, zodat een mislukte laatste poging nog bij ons
  // binnenkomt en niet als alert().
  useEffect(() => {
    const flush = () => {
      const w = widgetRef.current;
      if (w) persist(w);
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      const w = widgetRef.current;
      if (!w || persist(w)) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', beforeUnload);
      flush();
    };
  }, [persist]);

  // Opslagmeldingen: de editor valt buiten de leerkrachtschil, dus zonder
  // luisteraar kwam elke mislukking als alert() (om de 8 seconden). Een
  // melding bij ons eigen bewaren komt in de banner; andere als toast.
  useEffect(() => onStorageNotice((n) => {
    if (!n.severe) return; // een back-uptip toont de schil later zelf
    if (savingRef.current) {
      noticeRef.current = n.message;
      return;
    }
    toast(n.message, 'err');
  }), [toast]);

  // Een ander tabblad bewaarde of verwijderde iets (OP4). Een open AI-assistent
  // telt mee als onbewaard werk (B6): ze bouwt op de config van het moment dat
  // ze openging, dus stil overnemen zou haar "Toepassen" later het andere
  // tabblad laten overschrijven.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== WIDGETS_KEY) return;
      const cur = widgetRef.current;
      if (!cur) return;
      const stored = getWidget(cur.id);
      const onScreen = cur !== lastSavedRef.current;
      const state = syncState(versionOf(stored), knownRef.current, onScreen || aiOpenRef.current);
      if (state === 'gelijk') {
        if (holdRef.current?.kind === 'verwijderd') setHold(null); // weer terug, ongewijzigd
        return;
      }
      if (state === 'overnemen' && stored) {
        adoptStored(stored, 'bijgewerkt');
        return;
      }
      if (state === 'verwijderd') {
        if (holdRef.current?.kind !== 'verwijderd') setHold({ kind: 'verwijderd' });
        return;
      }
      // De banner staat achter het venster van de assistent: zeg het daarom ook in een melding.
      if (!onScreen && aiOpenRef.current && holdRef.current?.kind !== 'conflict') {
        toast('Een ander tabblad bewaarde deze widget intussen. Sluit de AI-assistent om de nieuwe versie te laden.', 'err');
      }
      setHold({ kind: 'conflict' });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [adoptStored, setHold, toast]);

  // Afbeeldingen en andere media die op de achtergrond binnenkomen (B4): na het
  // overnemen van een versie met een nieuwe afbeelding stond ze als open
  // verwijzing op het scherm, en niemand las opnieuw. Is er niets onbewaard en
  // staat in de opslag nog dezelfde versie, dan lezen we stil opnieuw.
  const refreshMedia = useCallback(() => {
    const cur = widgetRef.current;
    if (!cur) return;
    const stored = getWidget(cur.id);
    if (!stored) return;
    const ok = shouldRefreshMedia({
      unsaved: cur !== lastSavedRef.current || aiOpenRef.current,
      holding: holdRef.current !== null,
      storedVersion: versionOf(stored),
      knownVersion: knownRef.current,
      shownRefs: countMediaRefs(cur),
      storedRefs: countMediaRefs(stored),
    });
    if (ok) adoptStored(stored, 'behouden');
  }, [adoptStored]);
  useEffect(() => onMediaChange(refreshMedia), [refreshMedia]);

  // Weggaan binnen de app (Terug, een link, de vorige-knop van de browser):
  // eerst bewaren; lukt dat niet, dan eerst vragen.
  const shouldBlock = useCallback(() => {
    const w = widgetRef.current;
    return w ? !persist(w) : false;
  }, [persist]);
  const blocker = useBlocker(shouldBlock);

  const downloadWidget = async () => {
    const w = widgetRef.current;
    if (!w) return;
    try {
      const json = await exportWidgetJsonWithMedia(w);
      downloadFile(`${w.title.replace(/[^\w\dà-ÿ -]/gi, '').trim() || 'widget'}.widget.json`, json);
      toast('De widget is gedownload als bestand. Terugzetten kan via "Bestaand materiaal verwerken".', 'ok');
    } catch {
      toast('Downloaden is mislukt.', 'err');
    }
  };

  /**
   * Na een bannerknop verdwijnt die knop, en dan viel de focus op BODY (B9).
   * Het titelveld staat altijd in beeld, ook in de voorbeeldmodus.
   */
  const focusTitle = () => titleRef.current?.focus();

  const retrySave = () => {
    const w = widgetRef.current;
    if (w && persist(w)) {
      toast('Alles is bewaard.', 'ok');
      focusTitle();
    }
  };

  /** Uitdrukkelijke keuze voor de versie op dit scherm (na een conflict of een verwijdering elders). */
  const keepMine = () => {
    const w = widgetRef.current;
    const wasDeleted = holdRef.current?.kind === 'verwijderd';
    if (w && persist(w, true)) {
      toast(wasDeleted ? `De widget is opnieuw bewaard.${resultsGoneSentence(w)}` : 'Jouw versie is bewaard.', 'ok');
      focusTitle();
    }
  };

  const loadTheirs = () => {
    const cur = widgetRef.current;
    const stored = cur ? getWidget(cur.id) : undefined;
    if (!stored) {
      setHold({ kind: 'verwijderd' });
      focusTitle();
      return;
    }
    adoptStored(stored);
    toast('De versie uit het andere tabblad staat nu hier.', 'ok');
    focusTitle();
  };

  const openAi = () => {
    aiOpenRef.current = true;
    setAiOpen(true);
  };

  /**
   * De assistent sluiten. Stond er een conflict enkel omdat zij openstond (er
   * is op het scherm niets onbewaard), dan valt er niets te verliezen en laden
   * we meteen de nieuwere versie uit het andere tabblad.
   */
  const closeAi = () => {
    aiOpenRef.current = false;
    setAiOpen(false);
    const cur = widgetRef.current;
    if (cur && holdRef.current?.kind === 'conflict' && cur === lastSavedRef.current) {
      const stored = getWidget(cur.id);
      if (stored) {
        adoptStored(stored, 'bijgewerkt');
        return;
      }
    }
    refreshMedia();
  };

  if (!widget) {
    return (
      <main id="main" className="page page-narrow" style={{ textAlign: 'center', paddingTop: 80 }}>
        <h1>Widget niet gevonden</h1>
        <p style={{ color: 'var(--text-soft)' }}>Deze widget bestaat niet (meer) in deze browser.</p>
        <Link to="/widgets" className="btn btn-primary"><BackIcon size={18} aria-hidden /> Naar mijn widgets</Link>
      </main>
    );
  }

  const def = getTypeDef(widget.type);
  const subCount = getSubmissions(widget.id).length;
  // Staat er op het scherm iets dat nog niet bewaard is? (De ref verandert altijd
  // samen met een state-update, dus dit is hier betrouwbaar.) Zo niet, dan staat
  // een conflict er enkel omdat de AI-assistent openstaat.
  const changedOnScreen = widget !== lastSavedRef.current;
  const unsaved = status === 'mislukt' || (hold?.kind === 'conflict' && changedOnScreen);

  const alerts = (hold || status === 'mislukt') && (
    <>
      {hold?.kind === 'conflict' && (
        <div className="callout warn" role="alert">
          <WarningIcon size={20} aria-hidden style={{ flex: 'none' }} />
          <div style={{ minWidth: 0 }}>
            <strong>Deze widget werd intussen in een ander tabblad bewaard.</strong>{' '}
            {changedOnScreen
              ? 'Je wijzigingen hier zijn nog niet bewaard. Kies welke versie je houdt.'
              : 'De AI-assistent werkt nog met de oude versie. Sluit de assistent om de nieuwe versie te laden, of kies zelf welke versie je houdt.'}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <button type="button" className="btn btn-sm btn-primary" onClick={keepMine}>Mijn versie bewaren</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={loadTheirs}>
                Andere versie laden (mijn wijzigingen vervallen)
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => void downloadWidget()}>
                <DownloadIcon size={16} aria-hidden /> Downloaden als bestand
              </button>
            </div>
          </div>
        </div>
      )}
      {hold?.kind === 'verwijderd' && (
        <div className="callout warn" role="alert">
          <WarningIcon size={20} aria-hidden style={{ flex: 'none' }} />
          <div style={{ minWidth: 0 }}>
            <strong>Deze widget werd in een ander tabblad verwijderd.</strong> Ze wordt hier niet vanzelf
            teruggezet. Wil je ze toch houden, bewaar ze dan opnieuw.{resultsGoneSentence(widget)}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <button type="button" className="btn btn-sm btn-primary" onClick={keepMine}>Opnieuw bewaren</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => void downloadWidget()}>
                <DownloadIcon size={16} aria-hidden /> Downloaden als bestand
              </button>
            </div>
          </div>
        </div>
      )}
      {status === 'mislukt' && (
        <div className="callout err" role="alert">
          <WarningIcon size={20} aria-hidden style={{ flex: 'none' }} />
          <div style={{ minWidth: 0 }}>
            <strong>Niet bewaard.</strong> {failMessage ?? FAIL_FALLBACK}
            <p style={{ margin: '6px 0 0' }}>
              Je wijzigingen staan nog op dit scherm. Sluit dit tabblad niet: maak eerst ruimte en klik dan op
              “Opnieuw proberen”, of download de widget als bestand.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <button type="button" className="btn btn-sm btn-primary" onClick={retrySave}>
                <RetryIcon size={16} aria-hidden /> Opnieuw proberen
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => void downloadWidget()}>
                <DownloadIcon size={16} aria-hidden /> Downloaden als bestand
              </button>
              <a className="btn btn-sm btn-ghost" href="#/privacy" target="_blank" rel="noopener noreferrer">
                Opslag bekijken (nieuw tabblad)
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const leaveText = leaveMessage(hold?.kind ?? 'mislukt', failMessage);

  return (
    <div className="appshell">
      <header className="topbar editor-topbar">
        <h1 className="sr-only">Widget bewerken: {widget.title}</h1>
        <button className="btn btn-quiet btn-sm" onClick={() => navigate('/widgets')}>
          <BackIcon size={18} aria-hidden /> Terug
        </button>
        <TypeTile type={def} size="sm" />
        <input
          ref={titleRef}
          className="input input-sm"
          style={{ maxWidth: 340, fontWeight: 700 }}
          value={widget.title}
          onChange={(e) => setWidget({ ...widget, title: e.target.value })}
          aria-label="Titel van de widget"
        />
        <span
          className="hint"
          aria-live="polite"
          style={{
            minWidth: 86, display: 'inline-flex', alignItems: 'center', gap: 4,
            ...(unsaved || hold ? { color: 'var(--err-text)', fontWeight: 600 } : {}),
          }}
        >
          {unsaved ? <><WarningIcon size={16} aria-hidden /> Niet bewaard</>
            : hold?.kind === 'verwijderd' ? <><WarningIcon size={16} aria-hidden /> Elders verwijderd</>
              : hold?.kind === 'conflict' ? <><WarningIcon size={16} aria-hidden /> Elders bewaard</>
                : status === 'bewaard' ? <><CheckIcon size={16} aria-hidden /> Bewaard</>
                  : status === 'bijgewerkt' ? <><CheckIcon size={16} aria-hidden /> Bijgewerkt uit een ander tabblad</>
                    : null}
        </span>
        <div className="topbar-spacer" />
        <span className="badge" title="Code van deze widget" style={{ fontFamily: 'monospace', letterSpacing: '0.15em' }}>{widget.code}</span>
        {def.hasSubmissions && (
          <Link to={`/resultaten/${widget.id}`} className="btn btn-sm btn-ghost"><ResultsIcon size={18} aria-hidden /> Resultaten ({subCount})</Link>
        )}
        {['quiz', 'worksheet', 'exitticket'].includes(widget.type) && (
          <Link to={`/print/${widget.id}`} className="btn btn-sm btn-ghost" title="Afdrukken of als PDF bewaren"><PrintIcon size={18} aria-hidden /> Afdrukken</Link>
        )}
        {(AI_GEN_TYPES.includes(widget.type) || widget.type === 'videoquiz') && (
          <button
            className="btn btn-sm btn-ai"
            onClick={openAi}
            title="Vragen bijmaken, hints aanvullen, afleiders versterken — met AI"
          >
            <AIIcon size={18} aria-hidden /> AI-assistent
          </button>
        )}
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => setTemplateOpen(true)}
          title="Bewaar deze widget als eigen sjabloon voor later hergebruik"
        >
          <Bookmark size={18} aria-hidden /> Bewaar als sjabloon
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => setShareOpen(true)}><ShareIcon size={18} aria-hidden /> Delen</button>
        <button
          className={`btn btn-sm ${previewMode ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => { setPreviewMode((v) => !v); setPreviewKey((k) => k + 1); }}
          aria-pressed={previewMode}
        >
          {previewMode ? <><EditIcon size={18} aria-hidden /> Terug naar bewerken</> : <><TryIcon size={18} aria-hidden /> Uitproberen</>}
        </button>
      </header>

      {previewMode ? (
        <main
          id="main"
          className="player-shell"
          // Zelfde leesbare accentkleur als het leerlingscherm (W15d): een te
          // lichte kleur wordt donkerder tot witte tekst erop leesbaar is.
          style={{ flex: 1, ['--player-accent' as string]: readableAccent(widget.settings.accentColor) } as React.CSSProperties}
        >
          {alerts && <div style={{ maxWidth: 860, margin: '14px auto 0', width: 'calc(100% - 36px)' }}>{alerts}</div>}
          <div className="callout warn" style={{ maxWidth: 860, margin: '14px auto 0', width: 'calc(100% - 36px)' }}>
            <PreviewIcon aria-hidden />
            <div>Voorbeeldmodus — zo ziet je leerling de widget. Er wordt niets opgeslagen.
              <button className="btn btn-sm btn-ghost" style={{ marginLeft: 10 }} onClick={() => setPreviewKey((k) => k + 1)}><RetryIcon size={16} aria-hidden /> Herstart voorbeeld</button>
            </div>
          </div>
          <div className={`player-main ${def.wide ? 'player-main-wide' : ''}`}>
            <React.Suspense fallback={<div className="hint" role="status" style={{ textAlign: 'center', padding: '40px 0' }}>Widget laden…</div>}>
              <def.Player key={previewKey} widget={widget} studentName="Voorbeeld" preview onComplete={() => {}} />
            </React.Suspense>
          </div>
        </main>
      ) : (
        <main id="main" className="page" style={{ paddingTop: 20 }}>
          {alerts}
          <div className="editor-layout">
            <div style={{ minWidth: 0 }}>
              <div
                style={{ display: 'flex', gap: 6, marginBottom: 16 }}
                role="tablist"
                aria-label="Editor-onderdelen"
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                  e.preventDefault();
                  const next = tab === 'content' ? 'settings' : 'content';
                  setTab(next);
                  document.getElementById(`tab-${next}`)?.focus();
                }}
              >
                <button
                  id="tab-content" role="tab" aria-selected={tab === 'content'} aria-controls="panel-content"
                  tabIndex={tab === 'content' ? 0 : -1}
                  className={`btn btn-sm ${tab === 'content' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setTab('content')}
                >
                  <FileText size={18} aria-hidden /> Inhoud
                </button>
                <button
                  id="tab-settings" role="tab" aria-selected={tab === 'settings'} aria-controls="panel-settings"
                  tabIndex={tab === 'settings' ? 0 : -1}
                  className={`btn btn-sm ${tab === 'settings' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setTab('settings')}
                >
                  <SettingsIcon size={18} aria-hidden /> Instellingen
                </button>
              </div>
              {tab === 'content' ? (
                // de editormodule wordt lazy geladen (zie registry): even een laadmelding tonen
                <div role="tabpanel" id="panel-content" aria-labelledby="tab-content">
                  <React.Suspense fallback={<div className="hint" role="status" style={{ textAlign: 'center', padding: '40px 0' }}>Widget laden…</div>}>
                    <def.Editor key={syncKey} config={widget.config} onChange={(config: unknown) => setWidget({ ...widget, config })} />
                  </React.Suspense>
                </div>
              ) : (
                <div role="tabpanel" id="panel-settings" aria-labelledby="tab-settings">
                  <SettingsPanel widget={widget} onChange={setWidget} />
                </div>
              )}
            </div>
            <aside className="card card-pad" style={{ position: 'sticky', top: 76 }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.08rem' }}><TypeTile type={def} size="sm" /> {def.name}</h2>
              <p style={{ color: 'var(--text-soft)', fontSize: '0.9rem' }}>{def.tagline}</p>
              <hr className="divider" />
              <p style={{ fontSize: '0.9rem', color: 'var(--text-soft)', marginBottom: 8 }}>
                <strong>Zo deel je deze widget:</strong>
              </p>
              <ol style={{ fontSize: '0.88rem', color: 'var(--text-soft)', paddingLeft: 18, margin: 0 }}>
                <li>Klik op <em>Uitproberen</em> om alles zelf te testen.</li>
                <li>Klik op <em>Delen</em> en geef je leerlingen de code <strong style={{ fontFamily: 'monospace' }}>{widget.code}</strong> of de link.</li>
                {def.hasSubmissions && <li>Volg de inzendingen op via <em>Resultaten</em>.</li>}
              </ol>
              <button className="btn btn-primary" style={{ marginTop: 14, width: '100%' }} onClick={() => setShareOpen(true)}>
                <ShareIcon size={18} aria-hidden /> Delen met je klas
              </button>
              {['quiz', 'worksheet', 'exitticket', 'splitworksheet'].includes(widget.type) && (() => {
                const warnings = lintQuiz(widget.config as QuizConfig);
                if (warnings.length === 0) return null;
                return (
                  <>
                    <hr className="divider" />
                    <h3 style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}><SearchIcon size={20} aria-hidden /> Vraag-check</h3>
                    <p className="hint" style={{ marginTop: -4 }}>Signalen uit de toetsliteratuur — jij beslist.</p>
                    <ul style={{ paddingLeft: 16, margin: 0, fontSize: '0.85rem', color: 'var(--text-soft)' }}>
                      {warnings.slice(0, 6).map((w, i) => (
                        <li key={i} style={{ marginBottom: 6 }}>
                          {w.questionNo !== null && <strong>V{w.questionNo}: </strong>}{w.text}
                        </li>
                      ))}
                      {warnings.length > 6 && <li>… en nog {warnings.length - 6} signalen.</li>}
                    </ul>
                  </>
                );
              })()}
            </aside>
          </div>
        </main>
      )}

      {shareOpen && <ShareModal widget={widget} onClose={() => setShareOpen(false)} />}
      {aiOpen && (
        <AIEditorPanel
          widget={widget}
          onClose={closeAi}
          onApply={(config: unknown, note: string) => {
            setWidget({ ...widget, config });
            if (holdRef.current) {
              // Het toepassen lukt, maar bewaren wacht op een keuze (B6): niet doen alsof het bewaard is.
              toast('Toegepast, maar nog niet bewaard. Sluit de assistent en kies welke versie je houdt.', 'err');
            } else {
              toast(note, 'ok');
            }
          }}
        />
      )}
      {templateOpen && <SaveTemplateModal widget={widget} onClose={() => setTemplateOpen(false)} />}
      {blocker.state === 'blocked' && (
        <Modal
          title="Je wijzigingen zijn niet bewaard"
          onClose={() => blocker.reset()}
          footer={
            <>
              <button type="button" className="btn btn-primary" onClick={() => blocker.reset()}>Blijven</button>
              <button type="button" className="btn btn-ghost" onClick={() => void downloadWidget()}>
                <DownloadIcon size={18} aria-hidden /> Downloaden als bestand
              </button>
              <button type="button" className="btn btn-danger" onClick={() => blocker.proceed()}>Toch weggaan</button>
            </>
          }
        >
          <p>{leaveText}</p>
        </Modal>
      )}
    </div>
  );
}

function SaveTemplateModal({ widget, onClose }: { widget: Widget; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(widget.title);

  const save = () => {
    if (!name.trim()) return;
    try {
      saveCustomTemplate(name, widget);
      toast('Sjabloon bewaard — je vindt het terug bij "Nieuwe widget"', 'ok');
      onClose();
    } catch {
      toast('Bewaren mislukt: de lokale opslag is vol. Verwijder oude widgets of sjablonen.', 'err');
    }
  };

  return (
    <Modal
      title="Bewaar als sjabloon"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" onClick={save} disabled={!name.trim()}><Bookmark size={18} aria-hidden /> Bewaren</button>
        </>
      }
    >
      <Field
        label="Naam van het sjabloon"
        hint="Bewaart de inhoud én instellingen van deze widget als startpunt voor nieuwe widgets."
      >
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          placeholder="bv. Weektoets woordenschat"
        />
      </Field>
    </Modal>
  );
}

function SettingsPanel({ widget, onChange }: { widget: Widget; onChange: (w: Widget) => void }) {
  const def = getTypeDef(widget.type);
  const s = widget.settings;
  const set = (patch: Partial<typeof s>) => onChange({ ...widget, settings: { ...s, ...patch } });
  // Wat de leerling écht ziet (W15d): een te lichte kleur wordt donkerder.
  const shownAccent = readableAccent(s.accentColor);
  // Tijdslimiet en pogingen werken alleen bij soorten met inzendingen (W5).
  // Staat er bij een andere soort toch een waarde (oude widget), dan blijven
  // de velden zichtbaar om ze op 0 te zetten.
  const showLimits = def.hasSubmissions || s.timeLimitMin > 0 || s.maxAttempts > 0;

  return (
    <div className="card card-pad">
      <h2 style={{ fontSize: '1.08rem' }}>Weergave</h2>
      <Field label="Accentkleur voor de leerling">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="color" value={s.accentColor} onChange={(e) => set({ accentColor: e.target.value })} aria-label="Accentkleur" />
          <span className="hint">{s.accentColor}</span>
        </div>
        {shownAccent !== s.accentColor && (
          <p className="hint" style={{ margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            Te licht voor witte tekst: leerlingen zien een donkerdere tint
            <span
              aria-hidden
              style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 4, background: shownAccent, border: '1px solid var(--line-strong)' }}
            />
            {shownAccent}.
          </p>
        )}
      </Field>
      <Field label="Instructies vóór de start (optioneel)">
        <textarea className="textarea" rows={2} value={s.instructions} placeholder="bv. Je mag je woordenboek gebruiken."
          onChange={(e) => set({ instructions: e.target.value })} />
      </Field>
      <CurriculumField widget={widget} onChange={onChange} />

      <hr className="divider" />
      <h2 style={{ fontSize: '1.08rem' }}>Gedrag</h2>
      <CheckRow checked={s.shuffle} onChange={(v) => set({ shuffle: v })} label="Vragen/kaarten in willekeurige volgorde" />
      {def.hasScore && (
        <>
          <CheckRow checked={s.showFeedback} onChange={(v) => set({ showFeedback: v })} label="Juiste antwoorden tonen na indienen" />
          <CheckRow checked={s.showScore} onChange={(v) => set({ showScore: v })} label="Score tonen aan de leerling" />
        </>
      )}
      {def.hasSubmissions && (
        <CheckRow checked={s.requireName} onChange={(v) => set({ requireName: v })} label="Leerling moet eerst een naam invullen" />
      )}

      {showLimits && (
        <>
          <hr className="divider" />
          <h2 style={{ fontSize: '1.08rem' }}>Beperkingen</h2>
          {!def.hasSubmissions && (
            <p className="hint" style={{ marginTop: -4 }}>
              Deze soort levert geen inzendingen op: na de tijdslimiet wordt niets ingediend en pogingen worden niet
              geteld. Zet beide best op 0.
            </p>
          )}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Field label="Tijdslimiet (minuten)" hint="0 = geen limiet">
              <input className="input input-sm" type="number" min={0} max={240} style={{ maxWidth: 110 }}
                value={s.timeLimitMin}
                onChange={(e) => set({ timeLimitMin: Math.max(0, parseInt(e.target.value) || 0) })} />
            </Field>
            <Field label="Max. pogingen per leerling" hint="0 = onbeperkt">
              <input className="input input-sm" type="number" min={0} max={20} style={{ maxWidth: 110 }}
                value={s.maxAttempts}
                onChange={(e) => set({ maxAttempts: Math.max(0, parseInt(e.target.value) || 0) })} />
            </Field>
          </div>
        </>
      )}

      <hr className="divider" />
      <h2 style={{ fontSize: '1.08rem' }}>Toets &amp; deadline</h2>
      <CheckRow
        checked={s.examMode ?? false}
        onChange={(v) => set({ examMode: v })}
        label="Toetsmodus: volledig scherm vragen en registreren wanneer de leerling het venster verlaat"
      />
      <Field label="Afsluiten na (deadline, optioneel)" hint="Na dit tijdstip kunnen leerlingen niet meer starten.">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="input input-sm" type="datetime-local" style={{ maxWidth: 230 }}
            aria-label="Afsluiten na (deadline, optioneel)"
            value={s.expiresAt ?? ''}
            onChange={(e) => set({ expiresAt: e.target.value || undefined })}
          />
          {s.expiresAt && (
            <button className="btn btn-sm btn-quiet" onClick={() => set({ expiresAt: undefined })}><CloseIcon size={16} aria-hidden /> Wissen</button>
          )}
        </div>
      </Field>
    </div>
  );
}

/**
 * Leerplan van deze widget. De vragen dragen een doelcode (goalCode); dit veld
 * zegt uit wélke doelenlijst die codes komen, zodat de resultaten de doeltekst
 * kunnen tonen in plaats van alleen de code.
 */
function CurriculumField({ widget, onChange }: { widget: Widget; onChange: (w: Widget) => void }) {
  const curricula = useMemo(() => getCurricula(), []);
  if (curricula.length === 0) return null;
  return (
    <Field
      label="Leerplan (optioneel)"
      hint="Bepaalt bij welke doelenlijst de doelcodes van je vragen horen — je ziet de doeltekst dan overal mee."
    >
      <select
        className="select"
        value={widget.curriculumId ?? ''}
        onChange={(e) => onChange({ ...widget, curriculumId: e.target.value || undefined })}
      >
        <option value="">Geen leerplan</option>
        {curricula.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title} — {c.subject}, {c.level}
          </option>
        ))}
      </select>
    </Field>
  );
}
