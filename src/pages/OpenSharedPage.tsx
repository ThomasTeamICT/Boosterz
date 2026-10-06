import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
// Check is al onderdeel van de hoofdbundel (components/ui.tsx, CopyButton):
// hergebruiken hier kost geen extra kB.
import { Check } from 'lucide-react';
import { decodeWidgetFromParam } from '../lib/share';
import { getWidget, saveWidget } from '../lib/storage';
import { WidgetRunner } from './PlayerPage';
import { useToast } from '../components/ui';
import { uid } from '../lib/utils';
import { makeCode } from '../lib/utils';

/** Opent een draagbare deellink: de widget zit volledig in de URL. */
export function OpenSharedPage() {
  const [params] = useSearchParams();
  const d = params.get('d') ?? '';
  // Een andere link in hetzelfde tabblad (alleen de hash wijzigt) is een
  // andere oefening: met de link als key starten speler, startpoort en
  // "bewaard" opnieuw, anders zou B's titel boven A's vragen staan.
  return <SharedRunner key={d} d={d} />;
}

function SharedRunner({ d }: { d: string }) {
  const toast = useToast();
  const widget = useMemo(() => (d ? decodeWidgetFromParam(d) : null), [d]);
  const [saved, setSaved] = useState(false);

  if (!widget) {
    return (
      <div className="player-shell" style={{ minHeight: '100vh' }}>
        <main id="main" className="player-main" style={{ textAlign: 'center', paddingTop: 80 }}>
          <h1>Ongeldige link</h1>
          <p style={{ color: 'var(--text-soft)' }}>Deze deellink is onvolledig of beschadigd. Vraag een nieuwe link.</p>
          <Link to="/meedoen" className="btn btn-primary">Code invoeren</Link>
        </main>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <WidgetRunner widget={widget} recordSubmission />
      <div style={{ position: 'fixed', bottom: 14, right: 14, zIndex: 60 }}>
        <button
          className="btn btn-ghost"
          style={{ boxShadow: 'var(--shadow-2)', background: 'var(--bg-raised)', minHeight: 44 }}
          disabled={saved}
          onClick={() => {
            const existing = getWidget(widget.id);
            const copy = existing ? { ...widget, id: uid(), code: makeCode() } : widget;
            if (!saveWidget(copy)) {
              toast('Niet bewaard: de opslag van dit toestel is vol.', 'err');
              return;
            }
            setSaved(true);
            toast('Bewaard bij je materiaal', 'ok');
          }}
        >
          {saved ? <><Check size={14} aria-hidden /> Bewaard</> : 'Leerkracht? Bewaar bij je materiaal'}
        </button>
      </div>
    </div>
  );
}
