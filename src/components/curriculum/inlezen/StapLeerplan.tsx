// Stap 1 van de inleeswizard: welk leerplan lees je in? Net, vak, onderwijs, graad, stroom, leerplancode,
// versie en titel. De titel wordt voorgesteld uit de rest en blijft van de leerkracht zodra die ze aanpast.

import { Link } from 'react-router-dom';
import { ChevronDown, ExternalLink, Landmark } from 'lucide-react';
import type { CurriculumNet } from '../../../lib/curriculumTypes';
import { CURRICULUM_NETS } from '../../../lib/curriculumTypes';
import {
  GRAAD_OPTIES, ONDERWIJS_OPTIES, STROOM_OPTIES, type LeerplanKeuze, type OnderwijsKeuze,
} from '../../../lib/leerplanInlezen';
import { netLinkVoor, NET_KEUZES } from '../../../lib/leerplanNetten';
import { InfoIcon } from '../../icons';
import { Field } from '../../ui';
import { NettenLinks } from '../NettenLinks';

export function StapLeerplan({
  keuze, onChange, onTitel,
}: {
  keuze: LeerplanKeuze;
  /** Een of meer velden wijzigen; de pagina stelt de titel opnieuw voor als de leerkracht ze nog niet aanpaste. */
  onChange: (patch: Partial<LeerplanKeuze>) => void;
  /** De leerkracht typt in de titel zelf. */
  onTitel: (titel: string) => void;
}) {
  const link = netLinkVoor(keuze.net);
  // Een bestaand leerplan kan nog van het net "minimumdoelen" zijn: dat blijft dan zichtbaar in de lijst.
  const netten: { id: CurriculumNet; label: string }[] = NET_KEUZES.map((n) => ({ id: n.id, label: n.label }));
  if (keuze.net === 'minimumdoelen') {
    netten.push({ id: 'minimumdoelen', label: CURRICULUM_NETS.find((n) => n.id === 'minimumdoelen')?.label ?? 'Minimumdoelen' });
  }
  return (
    <div className="il-stap-inhoud">
      <p className="il-uitleg">Vertel kort welk leerplan je inleest. Boosterz gebruikt dit om de juiste minimumdoelen voor te stellen en om het leerplan een naam te geven.</p>

      <div className="il-velden">
        <Field label="Net" hint={link ? undefined : 'Het net of de organisatie die het leerplan maakte.'}>
          <select
            id="il-net" className="select" value={keuze.net} aria-required="true"
            onChange={(e) => onChange({ net: e.target.value as CurriculumNet | '' })}
          >
            <option value="">Kies een net</option>
            {netten.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
        </Field>
        <Field label="Vak" hint="bv. Aardrijkskunde of Natuurwetenschappen">
          <input
            id="il-vak" className="input" value={keuze.vak} aria-required="true" autoComplete="off"
            onChange={(e) => onChange({ vak: e.target.value })}
          />
        </Field>
        <Field label="Soort onderwijs">
          <select id="il-onderwijs" className="select" value={keuze.onderwijs} onChange={(e) => onChange({ onderwijs: e.target.value as OnderwijsKeuze })}>
            {ONDERWIJS_OPTIES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Graad">
          <select id="il-graad" className="select" value={keuze.graad} onChange={(e) => onChange({ graad: e.target.value })}>
            <option value="">Geen graad</option>
            {GRAAD_OPTIES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Stroom of finaliteit" hint="De A- of B-stroom van de 1ste graad. Anders laat je dit leeg.">
          <select id="il-stroom" className="select" value={keuze.stroom} onChange={(e) => onChange({ stroom: e.target.value })}>
            <option value="">Geen stroom</option>
            {STROOM_OPTIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Leerplancode (optioneel)" hint="Staat meestal op de eerste bladzijde, bv. I-Aar-a.">
          <input id="il-code" className="input" value={keuze.leerplancode} autoComplete="off" onChange={(e) => onChange({ leerplancode: e.target.value })} />
        </Field>
        <Field label="Versie of jaar (optioneel)" hint="bv. 2024 of versie 2.1">
          <input id="il-versie" className="input" value={keuze.versie} autoComplete="off" onChange={(e) => onChange({ versie: e.target.value })} />
        </Field>
      </div>

      {link && (
        <p className="hint il-netlink">
          <InfoIcon size={16} className="icon-inline" /> Het leerplan van dit net vind je op{' '}
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            {link.tekst}
            <ExternalLink size={14} className="icon-inline" aria-hidden="true" />
            <span className="sr-only"> (opent in een nieuw tabblad)</span>
          </a>.
        </p>
      )}

      <Field label="Titel" hint="Voorgesteld uit de rest. Pas ze gerust aan: zo herken je het leerplan later.">
        <input id="il-titel" className="input" value={keuze.titel} aria-required="true" autoComplete="off" onChange={(e) => onTitel(e.target.value)} />
      </Field>

      <details className="callout mat-details il-hulp">
        <summary>
          <InfoIcon size={20} />
          <span>Waar vind ik het leerplan van mijn net?</span>
          <ChevronDown size={18} className="mat-chevron" />
        </summary>
        <div className="mat-details-body">
          <NettenLinks />
        </div>
      </details>

      <div className="callout il-minimum" role="note">
        <Landmark size={20} className="il-minimum-icoon" />
        <p>
          Wil je eigenlijk gewoon de officiële minimumdoelen? Die kan je meteen gebruiken, zonder iets in te lezen:{' '}
          <Link to="/leerplannen/minimumdoelen">naar de officiële minimumdoelen</Link>.
        </p>
      </div>
    </div>
  );
}
