// Wegwijzer boven de lijst met leerplannen: wat is het verschil tussen minimumdoelen en een
// leerplan, hoe begin je, en waar vind je het leerplan van je net? In- en uitklapbaar; standaard
// open zolang de leerkracht nog geen eigen leerplan heeft. Vervangt de oude SourcesCallout.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ExternalLink, FileBraces, FileText, Landmark } from 'lucide-react';
import { InfoIcon, TipIcon } from '../icons';
import '../../styles/leerplan.css';

const NETTEN = [
  { naam: 'GO!', url: 'https://pro.g-o.be', tekst: 'pro.g-o.be' },
  { naam: 'Katholiek Onderwijs Vlaanderen', url: 'https://pro.katholiekonderwijs.vlaanderen', tekst: 'pro.katholiekonderwijs.vlaanderen' },
  { naam: 'OVSG', url: 'https://www.ovsg.be', tekst: 'www.ovsg.be' },
  { naam: 'POV', url: 'https://www.pov.be', tekst: 'www.pov.be' },
];

export function LeerplanWegwijzer({
  defaultOpen, onInlezen, onBestand,
}: {
  /** Open zolang de leerkracht nog geen eigen leerplan heeft; daarna beslist de leerkracht zelf. */
  defaultOpen: boolean;
  /** "Leerplan van je net inlezen": uit pdf of tekst. */
  onInlezen: () => void;
  /** "Bestand van een collega": een Boosterz-bestand (.json) kiezen. */
  onBestand: () => void;
}) {
  const [open, setOpen] = useState<boolean | null>(null);
  return (
    <details
      className="callout mat-details lw"
      open={open ?? defaultOpen}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <InfoIcon size={20} />
        <span>Minimumdoelen of leerplan? Zo begin je</span>
        <ChevronDown size={18} className="mat-chevron" />
      </summary>
      <div className="mat-details-body">
        <p className="lw-uitleg">
          <strong>Minimumdoelen</strong> zijn de wettelijke basis van de overheid en voor elk net gelijk; het{' '}
          <strong>leerplan van je net</strong> werkt ze uit in leerplandoelen. Boosterz koppelt beide.
        </p>

        <h2 className="lw-kop">Kies hoe je begint</h2>
        <ul className="lw-wegen">
          <li>
            <Link to="/leerplannen/minimumdoelen" className="lw-weg">
              <span className="lw-weg-titel"><Landmark size={18} /> Officiële minimumdoelen gebruiken</span>
              <span className="lw-weg-zin">Altijd juist en meteen klaar: de doelen komen rechtstreeks uit de officiële bron.</span>
            </Link>
          </li>
          <li>
            <button type="button" className="lw-weg" onClick={onInlezen}>
              <span className="lw-weg-titel"><FileText size={18} /> Leerplan van je net inlezen</span>
              <span className="lw-weg-zin">Haal de doelen uit de pdf of de tekst van het leerplan van je net.</span>
            </button>
          </li>
          <li>
            <button type="button" className="lw-weg" onClick={onBestand}>
              <span className="lw-weg-titel"><FileBraces size={18} /> Bestand van een collega</span>
              <span className="lw-weg-zin">Open een Boosterz-bestand (.json) dat een collega met je deelde.</span>
            </button>
          </li>
        </ul>

        <h2 className="lw-kop">Waar vind ik het leerplan van mijn net?</h2>
        <ul className="lw-links">
          {NETTEN.map((n) => (
            <li key={n.url}>
              <a href={n.url} target="_blank" rel="noopener noreferrer">
                <strong>{n.naam}</strong> <span className="lw-domein">{n.tekst}</span>
                <ExternalLink size={14} className="icon-inline" aria-hidden="true" />
                <span className="sr-only"> (opent in een nieuw tabblad)</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="hint lw-tip">
          <TipIcon size={16} className="lw-tip-icoon" />
          <span>
            Vraag je vakwerkgroep of coördinator welk leerplan je school volgt. De leerplancode staat meestal op de
            eerste bladzijde (bv. “I-Aar-a”).
          </span>
        </p>
        <p className="hint lw-tip">
          <span>
            Boosterz haalt die leerplannen niet zelf op: ze zijn auteursrechtelijk beschermd. Alles wat je inleest, blijft op dit toestel.
          </span>
        </p>
      </div>
    </details>
  );
}
