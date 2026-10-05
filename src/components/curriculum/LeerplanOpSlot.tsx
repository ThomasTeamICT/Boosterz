// Een nagekeken leerplan: alleen-lezen. De doelen staan op slot, zodat ze letterlijk blijven zoals
// ze nagekeken zijn; wie iets wil aanpassen, maakt een eigen kopie. Exporteren blijft mogelijk.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Lock } from 'lucide-react';
import type { Curriculum } from '../../lib/curriculumTypes';
import { netLabel } from '../../lib/curriculum';
import { veiligeLink } from '../../lib/minimumdoelenBron';
import { formatDateShort } from '../../lib/utils';
import { BackIcon, DuplicateIcon, ExportIcon, TipIcon } from '../icons';
import { isOfficieel, nagekekenTekst } from '../../lib/leerplanStatus';
import { ControleLabel, OfficieelLabel } from './ControleLabel';
import { DoelenPerRubriek, type DoelRij } from './DoelenPerRubriek';
import { VerwijzingLabels } from './VerwijzingLabels';
import '../../styles/leerplan.css';

function aantal(n: number): string {
  return `${n} doel${n === 1 ? '' : 'en'}`;
}

function maakRijen(cur: Curriculum): DoelRij[] {
  return cur.goals.map((goal) => {
    const optioneel = goal.note?.trim().toLowerCase() === 'optioneel';
    const toelichting = goal.note && !optioneel ? goal.note : undefined;
    const heeftLabels = Boolean(goal.refs?.length) || optioneel || Boolean(toelichting) || goal.level === 'uitbreiding';
    return {
      key: goal.id,
      code: goal.code,
      tekst: goal.text,
      rubriek: goal.theme,
      labels: heeftLabels ? (
        <>
          {goal.level === 'uitbreiding' && <span className="badge badge-warn">Uitbreiding</span>}
          {optioneel && <span className="badge badge-warn">Optioneel</span>}
          <VerwijzingLabels verwijzingen={goal.refs} />
          {toelichting && <span className="lp-note">{toelichting}</span>}
        </>
      ) : undefined,
    };
  });
}

export function LeerplanOpSlot({
  curriculum, onBack, onExport, onEigenKopie,
}: {
  curriculum: Curriculum;
  onBack: () => void;
  onExport: () => void;
  onEigenKopie: () => void;
}) {
  const h = curriculum.herkomst;
  const bronLink = veiligeLink(h?.bronUrl);
  const rijen = useMemo(() => maakRijen(curriculum), [curriculum]);
  const geldigVanaf = h?.geldigVanaf ? Date.parse(h.geldigVanaf) : NaN;
  const feiten: { naam: string; waarde: string }[] = [{ naam: 'Net', waarde: netLabel(curriculum.net) }];
  if (curriculum.subject) feiten.push({ naam: 'Vak', waarde: curriculum.subject });
  if (curriculum.level) feiten.push({ naam: 'Niveau', waarde: curriculum.level });
  if (h?.leerplancode) feiten.push({ naam: 'Leerplancode', waarde: h.leerplancode });
  if (h?.bronNaam) feiten.push({ naam: 'Bron', waarde: h.bronNaam });
  if (h?.versie) feiten.push({ naam: 'Versie', waarde: h.versie });
  if (h?.geldigVanaf) feiten.push({ naam: 'Geldig vanaf', waarde: Number.isNaN(geldigVanaf) ? h.geldigVanaf : formatDateShort(geldigVanaf) });
  if (h?.ingelezenOp) feiten.push({ naam: 'Ingelezen op', waarde: formatDateShort(h.ingelezenOp) });

  return (
    <div className="page mat-page lp-page">
      <div className="page-head">
        <div>
          <button className="btn btn-sm btn-quiet" onClick={onBack}><BackIcon size={16} /> Alle leerplannen</button>
          <h1 style={{ marginTop: 6 }}>{curriculum.title || 'Leerplan'}</h1>
          <p className="sub">
            {netLabel(curriculum.net)} · {aantal(curriculum.goals.length)}
            {curriculum.example ? ' · voorbeeldmateriaal, geen officieel document' : ''}
          </p>
          <div className="lp-labels">
            <ControleLabel status="gecontroleerd" />
            {isOfficieel(curriculum) && <OfficieelLabel />}
          </div>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-ghost" onClick={onExport}><ExportIcon size={18} /> Exporteren</button>
        </div>
      </div>

      <div className="callout lp-slot" role="note">
        <Lock size={20} className="lp-slot-icoon" />
        <div>
          <p>
            <strong>{nagekekenTekst(curriculum)}.</strong> Dit leerplan staat op slot, zodat het letterlijk blijft.
            Wil je iets aanpassen? Maak een eigen kopie.
          </p>
          <button className="btn btn-sm btn-primary" onClick={onEigenKopie}><DuplicateIcon size={16} /> Eigen kopie maken</button>
        </div>
      </div>

      <dl className="card card-pad lp-info">
        {feiten.map((f) => (
          <div key={f.naam}>
            <dt>{f.naam}</dt>
            <dd>{f.waarde}</dd>
          </div>
        ))}
        {curriculum.controle?.samenvatting && (
          <div className="lp-info-breed">
            <dt>Nagekeken</dt>
            <dd>{curriculum.controle.samenvatting}</dd>
          </div>
        )}
        {(curriculum.source || bronLink) && (
          <div className="lp-info-breed">
            <dt>Naamsvermelding</dt>
            <dd>
              {curriculum.source}
              {bronLink && (
                <>
                  {curriculum.source ? ' ' : ''}
                  <a href={bronLink} target="_blank" rel="noopener noreferrer">
                    Bekijk de bron <ExternalLink size={14} className="icon-inline" aria-hidden="true" />
                    <span className="sr-only"> (opent in een nieuw tabblad)</span>
                  </a>
                </>
              )}
            </dd>
          </div>
        )}
      </dl>

      <h2 className="lp-doelen-kop">Doelen ({curriculum.goals.length})</h2>
      {curriculum.goals.length === 0
        ? <p className="hint">Dit leerplan heeft geen doelen.</p>
        : <DoelenPerRubriek rijen={rijen} />}

      <p className="hint lp-tip">
        <TipIcon size={16} className="lp-tip-icoon" />
        <span>
          Koppel deze doelen daarna aan je cursussen via <Link to="/cursussen">Cursussen</Link>,
          of laat de AI-cursusbouwer een dekkende cursus opzetten vanuit deze lijst.
        </span>
      </p>
    </div>
  );
}
