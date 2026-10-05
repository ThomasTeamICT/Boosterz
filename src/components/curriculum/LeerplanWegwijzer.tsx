// Wegwijzer boven de lijst met leerplannen: wat is het verschil tussen minimumdoelen en een
// leerplan, hoe begin je, en waar vind je het leerplan van je net? In- en uitklapbaar; standaard
// open zolang de leerkracht nog geen eigen leerplan heeft. Vervangt de oude SourcesCallout.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, FileBraces, FileText, Landmark } from 'lucide-react';
import { InfoIcon } from '../icons';
import { NettenLinks } from './NettenLinks';
import '../../styles/leerplan.css';

export function LeerplanWegwijzer({
  defaultOpen, onBestand,
}: {
  /** Open zolang de leerkracht nog geen eigen leerplan heeft; daarna beslist de leerkracht zelf. */
  defaultOpen: boolean;
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
        <p className="lw-keuzehulp">
          Volgt je school het leerplan van een net (KOV, GO!, OVSG of POV)? Kies ‘Leerplan van je net inlezen’. Wil je enkel de
          wettelijke basis? Kies ‘Officiële minimumdoelen’. Kreeg je een bestand van een collega? Kies ‘Bestand van een collega’.
        </p>
        <ul className="lw-wegen">
          <li>
            <Link to="/leerplannen/minimumdoelen" className="lw-weg">
              <span className="lw-weg-titel"><Landmark size={18} /> Officiële minimumdoelen gebruiken</span>
              <span className="lw-weg-zin">De doelen komen letterlijk uit de officiële bron. Kies een set die nog geldt.</span>
            </Link>
          </li>
          <li>
            <Link to="/leerplannen/inlezen" className="lw-weg">
              <span className="lw-weg-titel"><FileText size={18} /> Leerplan van je net inlezen</span>
              <span className="lw-weg-zin">Haal de doelen uit de pdf of de tekst van het leerplan van je net.</span>
            </Link>
          </li>
          <li>
            <button type="button" className="lw-weg" onClick={onBestand}>
              <span className="lw-weg-titel"><FileBraces size={18} /> Bestand van een collega</span>
              <span className="lw-weg-zin">Open een Boosterz-bestand (.json) dat een collega met je deelde.</span>
            </button>
          </li>
        </ul>

        <h2 className="lw-kop">Waar vind ik het leerplan van mijn net?</h2>
        <NettenLinks />
      </div>
    </details>
  );
}
