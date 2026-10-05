// De lijst met sites waar je het leerplan van je net vindt, met de twee tips eronder. Gedeeld door de
// wegwijzer op de leerplannenpagina en stap 1 van de inleeswizard (de gegevens staan in
// lib/leerplanNetten.ts).

import { ExternalLink } from 'lucide-react';
import { AUTEURSRECHT_TIP, LEERPLANCODE_TIP, NET_LINKS } from '../../lib/leerplanNetten';
import { TipIcon } from '../icons';
import '../../styles/leerplan.css';

export function NettenLinks() {
  return (
    <>
      <ul className="lw-links">
        {NET_LINKS.map((n) => (
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
        <span>{LEERPLANCODE_TIP}</span>
      </p>
      <p className="hint lw-tip">
        <span>{AUTEURSRECHT_TIP}</span>
      </p>
    </>
  );
}
