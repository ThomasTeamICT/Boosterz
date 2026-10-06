// ── Leerplannen: het doelenregister van de leerkracht ───────────────────────
//
// Eén leerplan = een lijst doelen met een stabiele CODE. Die codes koppelen
// cursussecties, quizvragen en resultaten aan elkaar. Je maakt een lijst
// blanco, uit de officiële minimumdoelen (pagina "Officiële minimumdoelen"), uit
// een pdf of geplakte tekst met de inleeswizard (pagina "Leerplan inlezen", zonder
// AI), via de AI-structurering (laatste redmiddel, ook bereikbaar met ?ai=nieuw),
// of uit een JSON-bestand van een collega.
//
// De app haalt géén leerplannen van de netten op: die staan achter auteursrecht
// en zijn niet vrij op te vragen vanuit een browser (CORS). Kopieer/plak de tekst
// of lees de pdf in — zie de wegwijzer boven de lijst. De officiële minimumdoelen
// zijn wel meegeleverd: een leerplan daaruit is meteen "nagekeken" en staat op
// slot (zie components/curriculum/LeerplanOpSlot.tsx).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import type { ControleStatus, Curriculum, CurriculumGoal, CurriculumNet } from '../lib/curriculumTypes';
import { CURRICULUM_NETS } from '../lib/curriculumTypes';
import {
  createCurriculum, curriculumLabel, deleteCurriculum, exportCurriculumJson, getCurricula,
  importCurriculumJsonMetRapport, maakEigenKopie, netLabel, saveCurriculum,
} from '../lib/curriculum';
import { leesAiVoorinvulling, type AiVoorinvulling } from '../lib/leerplanAiOverdracht';
import { leesNiveau } from '../lib/leerplanNiveau';
import { isGeldigSetId } from '../lib/minimumdoelenBron';
import { buildCurriculumPrompt, MAX_CURRICULUM_CHARS, sanitizeAICurriculum } from '../lib/aiCurriculum';
import { askAI, extractJson } from '../lib/ai';
import { AIErrorBox, AIGate, AIReviewNote, AIWorkingBox } from '../components/aiCommon';
import { PdfImportButton } from '../components/PdfImportButton';
import { ConfirmModal, EmptyState, Field, Modal, useToast } from '../components/ui';
import { downloadFile, formatDateShort, uid } from '../lib/utils';
import { onStorageChange } from '../lib/storage';
import { useNewParam } from '../lib/useNewParam';
import { BadgeCheck, FileBraces, FileText, ListChecks, ListTree } from 'lucide-react';
import { MenuButton } from '../components/Menu';
import {
  AddIcon, AIIcon, BackIcon, CheckIcon, DeleteIcon, EditIcon, ExportIcon, GoalIcon, InfoIcon, MoreIcon, MoveDownIcon,
  MoveUpIcon, PreviewIcon, RetryIcon, TipIcon, WarningIcon,
} from '../components/icons';
import { DEEL_HINT, effectieveStatus, isOfficieel, isSamengesteld, nagekekenTekst, uitOfficieleBron } from '../lib/leerplanStatus';
import { ControleLabel, OfficieelLabel } from '../components/curriculum/ControleLabel';
import { LeerplanOpSlot } from '../components/curriculum/LeerplanOpSlot';
import { LeerplanWegwijzer } from '../components/curriculum/LeerplanWegwijzer';
import { MinimumdoelKiezer } from '../components/curriculum/MinimumdoelKiezer';
import { SetsKiezen } from '../components/curriculum/SetsKiezen';
import { VerwijzingLabels } from '../components/curriculum/VerwijzingLabels';
import '../styles/materiaal.css';
import '../styles/leerplan.css';

type AITarget = { mode: 'new'; voorinvulling?: AiVoorinvulling } | { mode: 'add'; curriculum: Curriculum };

/** Een bestand van een collega is klein; wat groter is dan dit, is bijna zeker het verkeerde bestand. */
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/**
 * Opent het leerplan uit `?open=<id>` in de URL (zo komt "Gebruik als leerplan" op de pagina
 * "Officiële minimumdoelen" hier terecht). Zoals `useNewParam`: daarna verdwijnt de parameter weer,
 * zodat terugkeren of herladen de editor niet opnieuw opent.
 */
function useOpenParam(open: (id: string) => void) {
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const id = params.get('open');
    if (!id) return;
    open(id);
    const next = new URLSearchParams(params);
    next.delete('open');
    setParams(next, { replace: true });
    // open is een setter uit de pagina; enkel de URL is de trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
}

/**
 * Opent het AI-venster voor een nieuw leerplan als de URL `?ai=nieuw` bevat (de inleeswizard stuurt
 * hierheen als haar lezer geen doelen vindt). De wizard geeft de tekst en de keuzes uit stap 1 mee in de
 * routerstate, zodat het venster vooraf ingevuld is. Zoals `useNewParam`: daarna verdwijnt de parameter weer,
 * zodat terugkeren of herladen het venster niet opnieuw opent.
 */
function useAiParam(open: (voorinvulling?: AiVoorinvulling) => void) {
  const [params, setParams] = useSearchParams();
  const { state } = useLocation();
  useEffect(() => {
    if (params.get('ai') !== 'nieuw') return;
    open(leesAiVoorinvulling(state));
    const next = new URLSearchParams(params);
    next.delete('ai');
    setParams(next, { replace: true });
    // open is een setter uit de pagina; enkel de URL is de trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
}

function exporteer(cur: Curriculum) {
  downloadFile(`${cur.title || 'leerplan'}.json`, exportCurriculumJson(cur));
}

export function CurriculaPage() {
  const toast = useToast();
  // Meteen inlezen: de wegwijzer hieronder krijgt zo meteen de juiste begintoestand.
  const [curricula, setCurricula] = useState<Curriculum[]>(getCurricula);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [aiTarget, setAiTarget] = useState<AITarget | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  useNewParam(() => setNewOpen(true));
  useAiParam((voorinvulling) => setAiTarget({ mode: 'new', voorinvulling }));
  useOpenParam((id) => {
    if (getCurricula().some((c) => c.id === id)) setEditingId(id);
    else toast('Dit leerplan werd niet gevonden. Misschien is het verwijderd.', 'err');
  });
  const [deleteTarget, setDeleteTarget] = useState<Curriculum | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = () => setCurricula(getCurricula());
  useEffect(() => {
    reload();
    return onStorageChange(reload);
  }, []);

  const editing = curricula.find((c) => c.id === editingId);
  // Status per leerplan: nagekeken (op slot), niet nagekeken of gewijzigd na nakijken.
  const statussen = useMemo(() => new Map(curricula.map((c) => [c.id, effectieveStatus(c)] as const)), [curricula]);

  // Wisselen tussen lijst en editor is een nieuw scherm: bovenaan beginnen, anders opent de editor halverwege
  // (vooral op gsm), en de focus naar de kop van het nieuwe scherm. Zonder dat blijft de focus verloren na
  // "Gebruik als leerplan", "Bewaren zonder nakijken" en "Bevestigen" (de knop is dan weg) en leest een schermlezer
  // niet voor waar je nu bent. Niet bij het eerste laden van de pagina.
  const eersteKeer = useRef(true);
  useEffect(() => {
    window.scrollTo(0, 0);
    if (eersteKeer.current) {
      eersteKeer.current = false;
      return;
    }
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
  }, [editingId]);

  /** Bewaart en leest opnieuw in; geeft false als de opslag het weigerde (de opslaglaag meldt dat zelf). */
  const save = (cur: Curriculum): boolean => {
    const ok = saveCurriculum(cur);
    reload();
    return ok;
  };

  /** Een bewerkbare kopie van een (nagekeken) leerplan; die kopie opent meteen. */
  const eigenKopie = (cur: Curriculum) => {
    const kopie = maakEigenKopie(cur);
    if (!save(kopie)) return;
    setEditingId(kopie.id);
    toast(`Eigen kopie gemaakt: ${kopie.title}. Hier kan je alles aanpassen.`, 'ok');
  };

  const importFile = async (file: File) => {
    if (file.size > MAX_IMPORT_BYTES) {
      toast('Dit bestand is groter dan 2 MB. Een leerplanbestand van Boosterz is veel kleiner: kies het juiste bestand.', 'err');
      return;
    }
    try {
      const { curriculum: cur, weggevallen, afgekapt } = importCurriculumJsonMetRapport(await file.text());
      if (!cur) {
        toast('Dit bestand bevat geen bruikbaar leerplan', 'err');
        return;
      }
      // Altijd als nieuw leerplan binnenhalen: nooit stilletjes iets overschrijven.
      const copy: Curriculum = { ...cur, id: uid(), example: undefined, createdAt: Date.now(), updatedAt: Date.now() };
      // Lukt het bewaren niet (opslag vol), dan meldt de opslaglaag dat zelf: dan niet doen alsof het gelukt is.
      if (!save(copy)) return;
      setEditingId(copy.id);
      // Wat wegviel of ingekort werd, zeggen we er altijd bij.
      const opmerkingen: string[] = [];
      if (weggevallen > 0) opmerkingen.push(`${weggevallen} ${weggevallen === 1 ? 'doel viel' : 'doelen vielen'} weg (zonder tekst, met een dubbele code of boven de 5.000 doelen)`);
      if (afgekapt > 0) opmerkingen.push(`bij ${afgekapt} ${afgekapt === 1 ? 'doel is' : 'doelen is'} een te lange tekst ingekort`);
      toast(
        `Leerplan "${copy.title}" geïmporteerd (${copy.goals.length} doelen).${opmerkingen.length > 0 ? ` Let op: ${opmerkingen.join('; ')}. Kijk het leerplan na.` : ''}`,
        opmerkingen.length > 0 ? 'info' : 'ok',
      );
    } catch {
      toast('Importeren mislukt', 'err');
    }
  };

  // Het AI-venster hoort bij beide weergaven: de lijst (nieuw leerplan) én de
  // editor (doelen toevoegen). Vroeger stond het alleen in de lijst, waardoor
  // "Doelen toevoegen met AI" in de editor niets deed.
  const aiModal = aiTarget ? (
    <CurriculumAIModal
      curriculum={aiTarget.mode === 'add' ? aiTarget.curriculum : undefined}
      voorinvulling={aiTarget.mode === 'new' ? aiTarget.voorinvulling : undefined}
      onClose={() => setAiTarget(null)}
      onApply={(goals, meta) => {
        if (aiTarget.mode === 'add') {
          const merged = mergeGoals(aiTarget.curriculum.goals, goals);
          save({ ...aiTarget.curriculum, goals: merged });
          // Dubbele codes slaat mergeGoals over: tel wat er echt bij kwam.
          const added = merged.length - aiTarget.curriculum.goals.length;
          const skipped = goals.length - added;
          toast(
            `${added} doel(en) toegevoegd${skipped > 0 ? `, ${skipped} overgeslagen omdat de code al bestond` : ''} — kijk ze na`,
            'ok'
          );
        } else {
          const cur = createCurriculum({
            title: meta.title || `Leerplan ${meta.subject || ''}`.trim(),
            net: meta.net,
            subject: meta.subject,
            level: meta.level,
            source: meta.source || undefined,
            // De AI-weg is het laatste redmiddel: het leerplan is nog niet nagekeken en de herkomst zegt dat.
            kind: 'leerplan',
            herkomst: { methode: 'ai', ingelezenOp: Date.now() },
            goals,
          });
          save(cur);
          setEditingId(cur.id);
          toast(`Leerplan aangemaakt met ${goals.length} doelen — kijk ze na`, 'ok');
        }
        setAiTarget(null);
      }}
    />
  ) : null;

  if (editing) {
    const status = statussen.get(editing.id) ?? effectieveStatus(editing);
    return (
      <>
        {status === 'gecontroleerd' ? (
          // Nagekeken = op slot: alleen lezen, exporteren of een eigen kopie maken.
          <LeerplanOpSlot
            curriculum={editing}
            onBack={() => setEditingId(null)}
            onExport={() => exporteer(editing)}
            onEigenKopie={() => eigenKopie(editing)}
          />
        ) : (
          <CurriculumEditor
            curriculum={editing}
            status={status}
            onChange={save}
            onBack={() => setEditingId(null)}
            onAskAI={() => setAiTarget({ mode: 'add', curriculum: editing })}
            onEigenKopie={() => eigenKopie(editing)}
          />
        )}
        {aiModal}
      </>
    );
  }

  return (
    <div className="page mat-page">
      <div className="page-head">
        <div>
          <h1>Leerplannen</h1>
          <p className="sub">
            Je leerplannen met doelcodes. Een code koppelt een cursussectie, een quizvraag en een
            resultaat aan hetzelfde doel — zo weet je meteen wat gedekt is en wat nog niet.
          </p>
        </div>
        <div className="page-head-actions">
          <Link className="btn btn-primary" to="/leerplannen/inlezen"><FileText size={18} /> Leerplan inlezen</Link>
          <Link className="btn btn-ghost" to="/leerplannen/minimumdoelen"><GoalIcon size={18} /> Officiële minimumdoelen</Link>
          <Link className="btn btn-ghost" to="/leerplannen/samenstellen"><ListChecks size={18} /> Zelf doelen samenstellen</Link>
          <button className="btn btn-ghost" title="Open een Boosterz-bestand (.json) dat een collega met je deelde" onClick={() => fileRef.current?.click()}>
            <FileBraces size={18} /> Bestand van een collega
          </button>
          <input
            ref={fileRef} type="file" accept="application/json,.json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }}
          />
          <button className="btn btn-ghost" onClick={() => setNewOpen(true)}><AddIcon size={18} /> Blanco leerplan</button>
        </div>
      </div>

      <LeerplanWegwijzer
        defaultOpen={!curricula.some((c) => !c.example)}
        onBestand={() => fileRef.current?.click()}
      />

      {curricula.length === 0 ? (
        <EmptyState icon={<ListTree size={40} />} title="Nog geen leerplannen">
          <p>
            Neem de doelen uit je leerplan of de minimumdoelen één keer over in Boosterz. Daarna kan je elke
            cursussectie en elke oefening eraan koppelen — en zie je in één oogopslag welke doelen
            nog niet aan bod komen.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link className="btn btn-primary" to="/leerplannen/inlezen"><FileText size={18} /> Leerplan inlezen</Link>
            <button className="btn btn-ghost" onClick={() => setNewOpen(true)}><AddIcon size={18} /> Blanco leerplan</button>
          </div>
        </EmptyState>
      ) : (
        <ul className="mat-grid">
          {curricula.map((cur) => {
            const status = statussen.get(cur.id) ?? 'niet-gecontroleerd';
            return (
              <li key={cur.id}>
                <article className="card mat-card">
                  <div className="mat-card-head">
                    <span className="mat-card-icon" aria-hidden="true"><ListTree size={20} /></span>
                    <div className="mat-card-titles">
                      <h2 className="mat-card-title">{cur.title}</h2>
                      <div className="lp-labels">
                        {cur.example && <span className="badge">voorbeeld</span>}
                        <ControleLabel status={status} />
                        {uitOfficieleBron(cur) && <OfficieelLabel eigenKopie={cur.kind === 'eigen'} samengesteld={isSamengesteld(cur)} />}
                      </div>
                    </div>
                  </div>
                  <ul className="mat-facts">
                    <li>
                      <InfoIcon size={16} />
                      <span>{netLabel(cur.net)} · {curriculumLabel(cur)}</span>
                    </li>
                    <li>
                      <GoalIcon size={16} />
                      <span>{cur.goals.length} doel{cur.goals.length === 1 ? '' : 'en'} · bijgewerkt {formatDateShort(cur.updatedAt)}</span>
                    </li>
                    {status === 'gecontroleerd' && (
                      <li>
                        <BadgeCheck size={16} />
                        <span>{nagekekenTekst(cur)}</span>
                      </li>
                    )}
                  </ul>
                  <div className="mat-card-actions">
                    <button className="btn btn-sm btn-primary" onClick={() => setEditingId(cur.id)}>
                      {status === 'gecontroleerd' ? <PreviewIcon size={16} /> : <EditIcon size={16} />}
                      {status === 'gecontroleerd' ? 'Bekijken' : 'Bewerken'}<span className="sr-only">: {cur.title}</span>
                    </button>
                    <MenuButton
                      Icon={MoreIcon}
                      ariaLabel={`Acties voor ${cur.title}`}
                      className="btn btn-quiet btn-icon"
                      items={[
                        {
                          label: 'Exporteren', hint: uitOfficieleBron(cur) ? 'Als bestand (.json)' : `Als bestand (.json). ${DEEL_HINT}`,
                          Icon: ExportIcon, onSelect: () => exporteer(cur),
                        },
                        { label: 'Verwijderen', Icon: DeleteIcon, danger: true, separator: true, onSelect: () => setDeleteTarget(cur) },
                      ]}
                    />
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {newOpen && (
        <NewCurriculumModal
          onClose={() => setNewOpen(false)}
          onCreate={(cur) => { save(cur); setEditingId(cur.id); }}
        />
      )}

      {aiModal}

      {deleteTarget && (
        <ConfirmModal
          title="Leerplan verwijderen?"
          message={`"${deleteTarget.title}" en zijn ${deleteTarget.goals.length} doelen worden verwijderd. Cursussen en widgets blijven bestaan, maar hun doelcodes verwijzen dan naar een leerplan dat er niet meer is.`}
          onConfirm={() => { deleteCurriculum(deleteTarget.id); reload(); toast('Leerplan verwijderd', 'ok'); }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

/** Nieuwe doelen bij bestaande voegen; dezelfde code wordt niet gedupliceerd. */
function mergeGoals(existing: CurriculumGoal[], incoming: CurriculumGoal[]): CurriculumGoal[] {
  const have = new Set(existing.map((g) => g.code.toUpperCase()));
  return [...existing, ...incoming.filter((g) => !have.has(g.code.toUpperCase()))];
}

// ── Nieuw (blanco) ──────────────────────────────────────────────────────────

function NewCurriculumModal({ onClose, onCreate }: { onClose: () => void; onCreate: (cur: Curriculum) => void }) {
  const [title, setTitle] = useState('');
  const [net, setNet] = useState<CurriculumNet>('minimumdoelen');
  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState('');

  const submit = () => {
    if (!title.trim()) return;
    onCreate(createCurriculum({ title: title.trim(), net, subject: subject.trim(), level: level.trim(), goals: [] }));
    onClose();
  };

  return (
    <Modal
      title="Nieuw leerplan"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" disabled={!title.trim()} onClick={submit}>Aanmaken</button>
        </>
      }
    >
      <Field label="Titel">
        <input
          className="input" value={title} autoFocus
          placeholder="bv. Natuurwetenschappen 1e graad A — eigen leerplan"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
      </Field>
      <NetSelect value={net} onChange={setNet} />
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Field label="Vak">
          <input className="input" value={subject} placeholder="bv. Wiskunde" onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Niveau">
          <input className="input" value={level} placeholder="bv. 1e graad A-stroom" onChange={(e) => setLevel(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function NetSelect({ value, onChange }: { value: CurriculumNet; onChange: (v: CurriculumNet) => void }) {
  const hint = CURRICULUM_NETS.find((n) => n.id === value)?.hint;
  return (
    <Field label="Net / uitgever" hint={hint}>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value as CurriculumNet)}>
        {CURRICULUM_NETS.map((n) => (
          <option key={n.id} value={n.id}>{n.label}</option>
        ))}
      </select>
    </Field>
  );
}

// ── De doelentabel ──────────────────────────────────────────────────────────

function CurriculumEditor({
  curriculum, status, onChange, onBack, onAskAI, onEigenKopie,
}: {
  curriculum: Curriculum;
  /** 'niet-gecontroleerd' of 'gewijzigd': een nagekeken leerplan staat op slot en komt hier niet. */
  status: ControleStatus;
  onChange: (cur: Curriculum) => void;
  onBack: () => void;
  onAskAI: () => void;
  onEigenKopie: () => void;
}) {
  const toast = useToast();
  const goals = curriculum.goals;
  // Een hele officiële set, of een lijst die de leerkracht zelf samenstelde uit officiële sets: beide komen letterlijk uit de bron.
  const officieel = isOfficieel(curriculum);
  const samengesteld = isSamengesteld(curriculum);
  const uitBron = officieel || samengesteld;
  // Een samengestelde lijst pas je aan door de keuze te wijzigen; een eigen kopie ervan pas je hier aan.
  const keuzeAanpassen = samengesteld && curriculum.kind !== 'eigen';
  const bronSet = curriculum.herkomst?.bronNaam;
  const setGoals = (next: CurriculumGoal[]) => onChange({ ...curriculum, goals: next });
  const patch = (i: number, p: Partial<CurriculumGoal>) => setGoals(goals.map((g, j) => (j === i ? { ...g, ...p } : g)));

  // Verwijzingen toevoegen: uit de sets van het leerplan; heeft het er nog geen, dan kiest de leerkracht ze eerst.
  const [kiezerVoor, setKiezerVoor] = useState<number | null>(null);
  const [setsKiezenVoor, setSetsKiezenVoor] = useState<number | null>(null);
  const sets = curriculum.minimumdoelenSets ?? [];
  const voegVerwijzingToe = (i: number) => (sets.length > 0 ? setKiezerVoor(i) : setSetsKiezenVoor(i));
  // Stabiele functies: het venster zet de focus opnieuw als zijn onClose bij elke render van de editor verandert.
  const sluitKiezer = useCallback(() => setKiezerVoor(null), []);
  const sluitSetsKiezen = useCallback(() => setSetsKiezenVoor(null), []);
  const wizardLink = uitBron ? undefined : `/leerplannen/inlezen/${encodeURIComponent(curriculum.id)}`;
  const aanpassenLink = `/leerplannen/samenstellen/${encodeURIComponent(curriculum.id)}`;

  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= goals.length) return;
    const copy = goals.slice();
    const [x] = copy.splice(i, 1);
    copy.splice(j, 0, x);
    setGoals(copy);
  };

  const add = () => {
    const last = goals[goals.length - 1];
    setGoals([...goals, { id: uid(), code: '', text: '', theme: last?.theme, level: 'basis' }]);
  };

  const duplicateCodes = useMemo(() => {
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const g of goals) {
      const c = g.code.trim().toUpperCase();
      if (!c) continue;
      if (seen.has(c)) dup.add(c);
      seen.add(c);
    }
    return dup;
  }, [goals]);

  return (
    <div className="page mat-page">
      <div className="page-head">
        <div>
          <button className="btn btn-sm btn-quiet" onClick={onBack}><BackIcon size={16} /> Alle leerplannen</button>
          <h1 className="lp-kop" tabIndex={-1} style={{ marginTop: 6 }}>{curriculum.title || 'Leerplan'}</h1>
          <p className="sub">
            {netLabel(curriculum.net)} · {goals.length} doel{goals.length === 1 ? '' : 'en'}
            {curriculum.example ? ' · voorbeeldmateriaal, geen officieel document' : ''}
          </p>
          <div className="lp-labels">
            <ControleLabel status={status} />
            {uitBron && <OfficieelLabel eigenKopie={curriculum.kind === 'eigen'} samengesteld={samengesteld} />}
          </div>
          {status === 'niet-gecontroleerd' && (
            <p className="hint lp-labeluitleg">
              {keuzeAanpassen
                ? 'Deze lijst kon niet als nagekeken bevestigd worden. Pas de keuze aan en bewaar de lijst opnieuw om het nog eens te proberen. Bewaar je ze opnieuw, dan wordt ze opnieuw samengesteld uit de officiële doelen; wat je zelf in de doelen veranderde, gaat dan verloren.'
                : 'De doelen zijn nog niet met de bron vergeleken. Kijk ze na om ze vast te leggen.'}
            </p>
          )}
        </div>
        <div className="page-head-actions">
          {wizardLink && <Link className="btn btn-primary" to={wizardLink}><BadgeCheck size={18} /> Nakijken en bevestigen</Link>}
          {keuzeAanpassen && <Link className="btn btn-primary" to={aanpassenLink}><EditIcon size={18} /> Keuze aanpassen</Link>}
          <button className="btn btn-ai" onClick={onAskAI}><AIIcon size={18} /> Doelen toevoegen met AI</button>
          <button className="btn btn-ghost" onClick={() => exporteer(curriculum)}>
            <ExportIcon size={18} /> Exporteren
          </button>
        </div>
      </div>
      {!uitBron && <p className="hint lp-deelhint">{DEEL_HINT}</p>}

      {status === 'gewijzigd' && (
        <div className="callout warn lp-gewijzigd" role="note">
          <WarningIcon size={20} style={{ flex: 'none', marginTop: 2, color: 'var(--warn-text)' }} />
          <div>
            <p>
              <strong>
                De doelen zijn gewijzigd sinds het nakijken{curriculum.controle?.op ? ` op ${formatDateShort(curriculum.controle.op)}` : ''}.
              </strong>{' '}
              Dit leerplan telt daarom niet meer als nagekeken.
              {officieel && ' Wil je de officiële doelen? Gebruik de officiële set opnieuw, of maak er bewust een eigen leerplan van.'}
              {keuzeAanpassen && ' Wil je weer de officiële doelen? Pas de keuze aan en bewaar de lijst opnieuw: ze wordt dan opnieuw samengesteld uit de officiële doelen, en je eigen aanpassingen gaan verloren.'}
            </p>
            {officieel && (
              <div className="lp-acties">
                {bronSet && isGeldigSetId(bronSet) && (
                  <Link className="btn btn-sm btn-ghost" to={`/leerplannen/minimumdoelen/${bronSet}`}>Officiële set openen</Link>
                )}
                <button className="btn btn-sm btn-ghost" onClick={onEigenKopie}>Eigen kopie maken</button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <Field label="Titel">
          <input className="input" value={curriculum.title} onChange={(e) => onChange({ ...curriculum, title: e.target.value })} />
        </Field>
        <NetSelect value={curriculum.net} onChange={(net) => onChange({ ...curriculum, net })} />
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <Field label="Vak">
            <input className="input" value={curriculum.subject} onChange={(e) => onChange({ ...curriculum, subject: e.target.value })} />
          </Field>
          <Field label="Niveau">
            <input className="input" value={curriculum.level} onChange={(e) => onChange({ ...curriculum, level: e.target.value })} />
          </Field>
        </div>
        <Field label="Herkomst (optioneel)" hint="Documentnaam, versie of jaartal — handig om later te weten waar dit vandaan komt.">
          <input
            className="input" value={curriculum.source ?? ''}
            placeholder="bv. Leerplan 2024, p. 12–15"
            onChange={(e) => onChange({ ...curriculum, source: e.target.value || undefined })}
          />
        </Field>
      </div>

      {duplicateCodes.size > 0 && (
        <div role="alert" className="callout warn" style={{ marginBottom: 12 }}>
          <WarningIcon size={20} style={{ flex: 'none', marginTop: 2, color: 'var(--warn-text)' }} />
          <p style={{ margin: 0 }}>
            Dubbele code(s): {[...duplicateCodes].join(', ')}. Een code moet uniek zijn binnen het
            leerplan, anders tellen twee doelen als één bij de dekking en de resultaten.
          </p>
        </div>
      )}

      {goals.length === 0 ? (
        <EmptyState icon={<GoalIcon size={40} />} title="Nog geen doelen">
          <p>Voeg doelen toe met de knop hieronder, of laat de AI ze uit je leerplantekst halen.</p>
        </EmptyState>
      ) : (
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
          {goals.map((goal, i) => (
            <li key={goal.id} className="editor-item">
              <div className="editor-item-head mat-goal-actions">
                <strong style={{ fontSize: '0.88rem' }}>Doel {i + 1}</strong>
                <span style={{ flex: 1 }} />
                <button className="btn btn-quiet btn-sm btn-icon" disabled={i === 0} aria-label={`Doel ${i + 1} omhoog`} onClick={() => move(i, -1)}><MoveUpIcon size={16} /></button>
                <button className="btn btn-quiet btn-sm btn-icon" disabled={i === goals.length - 1} aria-label={`Doel ${i + 1} omlaag`} onClick={() => move(i, 1)}><MoveDownIcon size={16} /></button>
                <button
                  className="btn btn-quiet btn-sm btn-icon"
                  aria-label={`Doel ${i + 1} verwijderen`}
                  onClick={() => { setGoals(goals.filter((_, j) => j !== i)); toast('Doel verwijderd', 'ok'); }}
                >
                  <DeleteIcon size={16} />
                </button>
              </div>
              <div className="editor-item-body">
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                  <Field label="Code">
                    <input
                      className="input input-sm"
                      style={{ fontFamily: 'monospace' }}
                      value={goal.code}
                      placeholder="bv. NW 2.1"
                      aria-label={`Code van doel ${i + 1}`}
                      onChange={(e) => patch(i, { code: e.target.value })}
                    />
                  </Field>
                  <Field label="Rubriek / thema">
                    <input
                      className="input input-sm"
                      value={goal.theme ?? ''}
                      placeholder="bv. Materie"
                      aria-label={`Thema van doel ${i + 1}`}
                      onChange={(e) => patch(i, { theme: e.target.value || undefined })}
                    />
                  </Field>
                  <Field label="Niveau">
                    <select
                      className="select input-sm"
                      value={goal.level ?? 'basis'}
                      aria-label={`Niveau van doel ${i + 1}`}
                      onChange={(e) => patch(i, { level: e.target.value === 'uitbreiding' ? 'uitbreiding' : 'basis' })}
                    >
                      <option value="basis">Basis</option>
                      <option value="uitbreiding">Uitbreiding</option>
                    </select>
                  </Field>
                </div>
                <Field label="Doeltekst">
                  <textarea
                    className="textarea"
                    rows={2}
                    value={goal.text}
                    placeholder="bv. De leerlingen beschrijven de waterkringloop met de begrippen verdamping, condensatie en neerslag."
                    aria-label={`Doeltekst van doel ${i + 1}`}
                    onChange={(e) => patch(i, { text: e.target.value })}
                  />
                </Field>
                <Field label="Toelichting (optioneel)">
                  <input
                    className="input input-sm"
                    value={goal.note ?? ''}
                    placeholder="Afbakening of voorbeeld uit het leerplan"
                    aria-label={`Toelichting bij doel ${i + 1}`}
                    onChange={(e) => patch(i, { note: e.target.value || undefined })}
                  />
                </Field>
                <div className="lp-refs" role="group" aria-label={`Verwijzingen van doel ${i + 1}`}>
                  <span className="lp-refs-titel">Verwijst naar minimumdoel</span>
                  <div className="dl-labels">
                    <VerwijzingLabels
                      verwijzingen={goal.refs}
                      onRemove={(r) => {
                        const rest = (goal.refs ?? []).filter((_, k) => k !== r);
                        patch(i, { refs: rest.length > 0 ? rest : undefined });
                      }}
                    />
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => voegVerwijzingToe(i)}>
                      <AddIcon size={16} /> Verwijzing toevoegen<span className="sr-only"> bij doel {i + 1}</span>
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <button className="btn btn-ghost" style={{ width: '100%', marginTop: 12 }} onClick={add}><AddIcon size={18} /> Doel toevoegen</button>

      <p className="hint" style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <TipIcon size={16} style={{ flex: 'none', marginTop: 3 }} />
        <span>
          Koppel deze doelen daarna aan je cursussen via <Link to="/cursussen">Cursussen</Link>,
          of laat de AI-cursusbouwer een dekkende cursus opzetten vanuit deze lijst.
        </span>
      </p>

      {kiezerVoor !== null && goals[kiezerVoor] && (
        <MinimumdoelKiezer
          titel={`Minimumdoelen kiezen voor ${goals[kiezerVoor].code.trim() || `doel ${kiezerVoor + 1}`}`}
          setIds={sets} gekozen={goals[kiezerVoor].refs ?? []}
          onKies={(refs) => { patch(kiezerVoor, { refs: refs.length > 0 ? refs : undefined }); setKiezerVoor(null); }}
          onClose={sluitKiezer}
        />
      )}
      {setsKiezenVoor !== null && (
        <SetsKiezen
          graad={leesNiveau(curriculum.level).graad} stroom={leesNiveau(curriculum.level).stroom} vak={curriculum.subject}
          gekozen={sets} wizardLink={wizardLink}
          onKies={(ids) => { onChange({ ...curriculum, minimumdoelenSets: ids }); setKiezerVoor(setsKiezenVoor); setSetsKiezenVoor(null); }}
          onClose={sluitSetsKiezen}
        />
      )}
    </div>
  );
}

// ── AI: leerplantekst → doelenlijst ─────────────────────────────────────────

interface AIMeta { title: string; net: CurriculumNet; subject: string; level: string; source: string }

function CurriculumAIModal({
  curriculum, voorinvulling, onClose, onApply,
}: {
  /** Aanwezig = doelen toevoegen aan dit leerplan. */
  curriculum?: Curriculum;
  /** Wat de inleeswizard meegaf (tekst en keuzes uit stap 1): vult het venster vooraf in. */
  voorinvulling?: AiVoorinvulling;
  onClose: () => void;
  onApply: (goals: CurriculumGoal[], meta: AIMeta) => void;
}) {
  const [text, setText] = useState(voorinvulling?.text ?? '');
  const [title, setTitle] = useState(curriculum?.title ?? voorinvulling?.title ?? '');
  const [net, setNet] = useState<CurriculumNet>(curriculum?.net ?? voorinvulling?.net ?? 'minimumdoelen');
  const [subject, setSubject] = useState(curriculum?.subject ?? voorinvulling?.subject ?? '');
  const [level, setLevel] = useState(curriculum?.level ?? voorinvulling?.level ?? '');
  const [source, setSource] = useState(curriculum?.source ?? voorinvulling?.source ?? '');
  const [wishes, setWishes] = useState('');

  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ goals: CurriculumGoal[]; warnings: string[] } | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);
  useEffect(() => () => ctrlRef.current?.abort(), []);

  const generate = async () => {
    setError('');
    setPreview(null);
    setStream('');
    setBusy(true);
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    try {
      const p = buildCurriculumPrompt({ text, subject, level, wishes });
      let acc = '';
      const full = await askAI({
        ...p,
        task: 'leerplan structureren',
        maxTokens: 16000,
        onDelta: (t) => { acc += t; setStream(acc); },
        signal: ctrl.signal,
      });
      const res = sanitizeAICurriculum(extractJson(full), { subject });
      if (res.goals.length === 0) {
        setError(res.warnings[0] ?? 'De AI vond geen doelen in deze tekst. Plak een stuk waarin de doelen zelf staan.');
      } else {
        setPreview(res);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setBusy(false);
      ctrlRef.current = null;
    }
  };

  const apply = () => {
    if (!preview) return;
    onApply(preview.goals, {
      title: title.trim() || `Leerplan ${subject.trim()}`.trim(),
      net,
      subject: subject.trim(),
      level: level.trim(),
      source: source.trim(),
    });
  };

  return (
    <Modal title={curriculum ? 'Doelen toevoegen met AI' : 'Leerplan uit tekst of pdf'} onClose={onClose} wide>
      <AIGate
        uitleg={
          <>
            Voor deze hulp heb je een eigen AI-sleutel nodig (Google Gemini, Anthropic of OpenAI). Voeg die één keer toe bij de
            AI-instellingen. Zonder sleutel kan je de doelen ook zelf toevoegen in een blanco leerplan.
          </>
        }
      >
        {!busy && !preview && (
          <div style={{ display: 'grid', gap: 4 }}>
            <p className="hint" style={{ marginTop: 0 }}>
              Plak de doelen uit je leerplan of de minimumdoelen, of lees de pdf in. De AI zet ze om
              in een lijst met codes; ze verzint geen doelen bij. De tekst die je hier plakt, gaat naar de AI-aanbieder die je bij
              de <Link to="/ai-instellingen">AI-instellingen</Link> koos.
            </p>
            <Field label="Leerplantekst" hint="Alleen het stuk met de doelen zelf; inleidingen en visieteksten mag je weglaten.">
              <textarea
                className="textarea" rows={9} value={text}
                placeholder={'bv.\n5.1 De leerlingen beschrijven de waterkringloop…\n5.2 De leerlingen verklaren hoe wolken ontstaan…'}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <PdfImportButton onText={(t) => {
                if (text.trim().length > 200 && !window.confirm('Het tekstveld bevat al tekst. Vervangen door de tekst uit de pdf?')) return;
                setText(t);
              }} />
              <span className="hint">
                {text.length > 0
                  ? `${text.length.toLocaleString('nl-BE')} tekens${text.length > MAX_CURRICULUM_CHARS ? ` — alleen de eerste ${MAX_CURRICULUM_CHARS.toLocaleString('nl-BE')} gaan mee; doe het dan per vak of per graad` : ''}`
                  : 'Werkt met tekst-pdf’s; een gescande pdf (foto’s) bevat geen leesbare tekst.'}
              </span>
            </div>
            {!curriculum && (
              <>
                <Field label="Titel van het leerplan">
                  <input
                    className="input" value={title}
                    placeholder="bv. Minimumdoelen natuurwetenschappen 1e graad"
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </Field>
                <NetSelect value={net} onChange={setNet} />
              </>
            )}
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
              <Field label="Vak" hint="Bepaalt mee de codes die de AI zelf maakt.">
                <input className="input" value={subject} placeholder="bv. Natuurwetenschappen" onChange={(e) => setSubject(e.target.value)} />
              </Field>
              <Field label="Niveau">
                <input className="input" value={level} placeholder="bv. 1e graad A-stroom" onChange={(e) => setLevel(e.target.value)} />
              </Field>
            </div>
            {!curriculum && (
              <Field label="Herkomst (optioneel)">
                <input className="input" value={source} placeholder="bv. onderwijsdoelen.be, versie 2024" onChange={(e) => setSource(e.target.value)} />
              </Field>
            )}
            <Field label="Extra aanwijzing (optioneel)">
              <input className="input" value={wishes} placeholder="bv. alleen de doelen van hoofdstuk 3" onChange={(e) => setWishes(e.target.value)} />
            </Field>
            {error && <AIErrorBox error={error} onRetry={generate} />}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
              <button className="btn btn-ai" disabled={text.trim().length < 40} onClick={generate}><AIIcon size={18} /> Doelen ophalen</button>
            </div>
          </div>
        )}

        {busy && (
          <AIWorkingBox streamText={stream} label="De AI leest je leerplantekst…" onCancel={() => ctrlRef.current?.abort()} />
        )}

        {!busy && preview && (
          <div style={{ display: 'grid', gap: 12 }}>
            <AIReviewNote />
            {preview.warnings.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--warn)', fontSize: '0.88rem' }}>
                {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
            <div className="card" style={{ padding: 14, maxHeight: 360, overflowY: 'auto' }}>
              <strong>{preview.goals.length} doel(en) gevonden</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: '0.9rem' }}>
                {preview.goals.map((g) => (
                  <li key={g.id} style={{ marginBottom: 4 }}>
                    <strong style={{ fontFamily: 'monospace' }}>{g.code}</strong> {g.text}
                    {g.theme && <span className="hint"> · {g.theme}</span>}
                    {g.level === 'uitbreiding' && <span className="badge badge-warn" style={{ marginLeft: 6 }}>uitbreiding</span>}
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setPreview(null)}><BackIcon size={18} /> Aanpassen</button>
              <button className="btn btn-ghost" onClick={generate}><RetryIcon size={18} /> Opnieuw</button>
              <button className="btn btn-primary" onClick={apply}>
                <CheckIcon size={18} /> {curriculum ? 'Doelen toevoegen' : 'Leerplan aanmaken'}
              </button>
            </div>
          </div>
        )}
      </AIGate>
    </Modal>
  );
}
