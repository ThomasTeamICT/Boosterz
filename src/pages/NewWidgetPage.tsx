import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, LayoutTemplate, Star } from 'lucide-react';
import { CATEGORIES, createWidget, WIDGET_TYPES } from '../widgets/registry';
import { saveWidget } from '../lib/storage';
import { extractPlaceholders, fillPlaceholders, TEMPLATES } from '../lib/templates';
import {
  deleteCustomTemplate, getCustomTemplates, instantiateTemplate,
} from '../lib/customTemplates';
import type { CustomTemplate } from '../lib/customTemplates';
import { normalizeText } from '../lib/library';
import { formatDateShort } from '../lib/utils';
import { ConfirmModal, EmptyState, Field, Modal, useToast } from '../components/ui';
import type { Widget, WidgetTypeId } from '../lib/types';
import { TypeTile } from '../components/TypeTile';
import { AIIcon, DeleteIcon, SearchIcon } from '../components/icons';
import '../styles/materiaal.css';
import { CategoryIcon } from '../components/CategoryIcon';

/** "HERHAALVRAAG 1" → "Herhaalvraag 1": leesbaar label voor een invulveld. */
function readableLabel(placeholder: string): string {
  return placeholder.charAt(0) + placeholder.slice(1).toLowerCase();
}

/** Sjabloon dat klaarstaat om ingevuld te worden via de invul-modal. */
interface FillState {
  widget: Widget;
  placeholders: string[];
  values: Record<string, string>;
}

/** Past de tekst bij de zoekterm? Elk woord moet ergens voorkomen, zonder accenten. */
function matches(query: string, ...texts: string[]): boolean {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = normalizeText(texts.join(' '));
  return words.every((w) => hay.includes(w));
}

export function NewWidgetPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const preselect = params.get('type');
  const [customTemplates, setCustomTemplates] = React.useState<CustomTemplate[]>(() => getCustomTemplates());
  const [templateToDelete, setTemplateToDelete] = React.useState<CustomTemplate | null>(null);
  const [fill, setFill] = React.useState<FillState | null>(null);
  const [query, setQuery] = React.useState('');

  // Lukt bewaren niet (opslag vol), dan niet naar een editor van een widget
  // die niet bestaat, maar hier blijven met een duidelijke melding.
  const VOL = 'Niet aangemaakt: de opslag van dit toestel is vol. Maak ruimte en probeer opnieuw.';
  const create = (type: WidgetTypeId) => {
    const w = createWidget(type);
    if (!saveWidget(w)) { toast(VOL, 'err'); return; }
    navigate(`/bewerk/${w.id}`, { replace: true });
  };

  const finishWidget = (w: Widget) => {
    if (!saveWidget(w)) { toast(VOL, 'err'); return; }
    navigate(`/bewerk/${w.id}`);
  };

  /** Opent eerst de invul-modal wanneer het sjabloon [PLACEHOLDERS] bevat. */
  const startWithPlaceholders = (w: Widget) => {
    const placeholders = extractPlaceholders(w);
    if (placeholders.length === 0) finishWidget(w);
    else setFill({ widget: w, placeholders, values: {} });
  };

  const startFromTemplate = (t: CustomTemplate) => {
    // sjablonen met een (na een update) onbekend widgettype nooit instantiëren
    if (!WIDGET_TYPES.some((wt) => wt.id === t.typeId)) return;
    startWithPlaceholders(instantiateTemplate(t));
  };

  // /nieuw?type=<id> (bv. vanaf de startpagina): meteen die soort aanmaken
  // en de editor openen.
  // Ook als /nieuw al open stond: de hash-router hermount de pagina dan niet.
  const preselectDone = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!preselect) { preselectDone.current = null; return; }
    // guard tegen dubbele uitvoering (React StrictMode mount-cyclus)
    if (preselectDone.current === preselect) return;
    preselectDone.current = preselect;
    if (WIDGET_TYPES.some((t) => t.id === preselect)) {
      create(preselect as WidgetTypeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselect]);

  const searching = query.trim().length > 0;
  const templates = TEMPLATES.filter((t) => matches(query, t.name, t.description));
  const mine = customTemplates.filter((t) => {
    const def = WIDGET_TYPES.find((x) => x.id === t.typeId);
    return matches(query, t.name, def?.name ?? '');
  });
  const types = WIDGET_TYPES.filter((t) => matches(query, t.name, t.tagline));
  const found = templates.length + mine.length + types.length;

  return (
    <div className="page mat-page">
      <div className="page-head">
        <div>
          <h1>Nieuwe widget</h1>
          <p className="sub">Kies de soort die bij je les past. Je kan alles daarna nog aanpassen.</p>
        </div>
      </div>

      <div className="lib-search mat-new-search">
        <SearchIcon size={18} />
        <label htmlFor="nieuw-zoek" className="sr-only">Zoek een soort widget</label>
        <input
          id="nieuw-zoek"
          className="input" type="search"
          placeholder="Zoek een soort, bv. quiz, puzzel of tijdlijn"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <p className="sr-only" aria-live="polite">
        {searching ? `${types.length} soort${types.length === 1 ? '' : 'en'} gevonden` : ''}
      </p>

      {!searching && (
        <Link to="/ai-studio" className="card mat-ai-card">
          <span className="mat-ai-icon" aria-hidden="true"><AIIcon size={24} /></span>
          <span className="mat-ai-text">
            <h2>Laat de AI het voorbereidende werk doen</h2>
            <p>Plak je cursustekst of leerplandoelen en krijg kant-en-klare widgets als voorzet. Jij kijkt na en bewaart.</p>
          </span>
          <span className="btn btn-ai" aria-hidden="true">Naar de AI-studio <ArrowRight size={18} /></span>
        </Link>
      )}

      {templates.length > 0 && (
        <section style={{ marginBottom: 30 }} aria-labelledby="cat-templates">
          <h2 id="cat-templates" className="mat-section-title"><LayoutTemplate size={20} /> Start van een sjabloon</h2>
          <p className="hint" style={{ marginBottom: 12 }}>
            Didactisch doordachte startpunten: vul de [placeholders] in en klaar.
          </p>
          <div className="type-grid">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                className="card type-card"
                onClick={() => startWithPlaceholders(t.build())}
              >
                <TypeTile type={t.type} size="lg" />
                <span>
                  <h3>{t.name}</h3>
                  <p>{t.description}</p>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {mine.length > 0 && (
        <section style={{ marginBottom: 30 }} aria-labelledby="cat-mytemplates">
          <h2 id="cat-mytemplates" className="mat-section-title"><Star size={20} /> Mijn sjablonen</h2>
          <p className="hint" style={{ marginBottom: 12 }}>
            Sjablonen die je zelf bewaarde vanuit de editor. Klik om er een nieuwe widget mee te starten.
          </p>
          <div className="type-grid">
            {mine.map((t) => {
              const def = WIDGET_TYPES.find((x) => x.id === t.typeId);
              return (
                <div key={t.id} className="mat-template">
                  <button
                    type="button"
                    className="card type-card"
                    onClick={() => startFromTemplate(t)}
                  >
                    {def ? <TypeTile type={def} size="lg" /> : <span className="type-tile type-tile-lg" aria-hidden="true"><Star size={24} /></span>}
                    <span>
                      <h3>{t.name}</h3>
                      <p>{def?.name ?? t.typeId} · bewaard op {formatDateShort(t.savedAt)}</p>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-quiet btn-icon mat-template-delete"
                    aria-label={`Sjabloon "${t.name}" verwijderen`}
                    title="Sjabloon verwijderen"
                    onClick={() => setTemplateToDelete(t)}
                  >
                    <DeleteIcon size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {fill && (
        <Modal
          title="Vul je sjabloon in"
          onClose={() => setFill(null)}
          footer={
            <>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const w = fill.widget;
                  setFill(null);
                  finishWidget(w);
                }}
              >
                Overslaan
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const w = fillPlaceholders(fill.widget, fill.values);
                  setFill(null);
                  finishWidget(w);
                }}
              >
                Widget aanmaken
              </button>
            </>
          }
        >
          <p className="hint" style={{ marginBottom: 14 }}>
            Dit sjabloon bevat invulvelden. Velden die je leeg laat, blijven als [placeholder] in
            de widget staan. Die kan je later in de editor nog invullen.
          </p>
          {fill.placeholders.map((p) => (
            <Field key={p} label={readableLabel(p)}>
              <input
                type="text"
                className="input"
                value={fill.values[p] ?? ''}
                placeholder={`[${p}]`}
                onChange={(e) =>
                  setFill((f) => (f ? { ...f, values: { ...f.values, [p]: e.target.value } } : f))
                }
              />
            </Field>
          ))}
        </Modal>
      )}

      {templateToDelete && (
        <ConfirmModal
          title="Sjabloon verwijderen?"
          message={`Weet je zeker dat je het sjabloon "${templateToDelete.name}" wil verwijderen? Widgets die je er al mee maakte, blijven gewoon bestaan.`}
          confirmLabel="Verwijderen"
          onConfirm={() => {
            deleteCustomTemplate(templateToDelete.id);
            setCustomTemplates(getCustomTemplates());
          }}
          onClose={() => setTemplateToDelete(null)}
        />
      )}

      {CATEGORIES.map((cat) => {
        const inCat = types.filter((t) => t.category === cat.id);
        if (inCat.length === 0) return null;
        return (
          <section key={cat.id} style={{ marginBottom: 26 }} aria-labelledby={`cat-${cat.id}`}>
            <h2 id={`cat-${cat.id}`} className="mat-section-title" style={{ marginBottom: 12 }}><CategoryIcon id={cat.id} size={20} /> {cat.name}</h2>
            <div className="type-grid">
              {inCat.map((t) => (
                <button key={t.id} type="button" className="card type-card" onClick={() => create(t.id)}>
                  <TypeTile type={t} size="lg" />
                  <span>
                    <h3>{t.name}</h3>
                    <p>{t.tagline}</p>
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}

      {searching && found === 0 && (
        <EmptyState icon={<SearchIcon size={40} />} title="Geen soort gevonden">
          <p>Niets gevonden voor “{query.trim()}”. Probeer een ander woord, of laat de AI een voorstel doen.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setQuery('')}>Zoekterm wissen</button>
            <Link to="/ai-studio" className="btn btn-ai"><AIIcon size={18} /> Naar de AI-studio</Link>
          </div>
        </EmptyState>
      )}
    </div>
  );
}
