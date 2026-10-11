// Een nagekeken leerplan: alleen-lezen. De doelen staan op slot, zodat ze letterlijk blijven zoals
// ze nagekeken zijn; wie iets wil aanpassen, maakt een eigen kopie. Exporteren blijft mogelijk.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Lock } from 'lucide-react';
import type { Curriculum } from '../../lib/curriculumTypes';
import { netLabel } from '../../lib/curriculum';
import { doelgroepTekst, sanitizeDoelgroep } from '../../lib/doelgroep';
import { veiligeLink } from '../../lib/minimumdoelenBron';
import { formatDateShort } from '../../lib/utils';
import { BackIcon, DuplicateIcon, EditIcon, ExportIcon, TipIcon } from '../icons';
import { DEEL_HINT, isSamengesteld, nagekekenTekst, uitOfficieleBron } from '../../lib/leerplanStatus';
import { ControleLabel, OfficieelLabel, officieelSoort } from './ControleLabel';
import { DoelenPerRubriek, type DoelRij } from './DoelenPerRubriek';
import { VerwijzingLabels } from './VerwijzingLabels';
import '../../styles/leerplan.css';
import '../../styles/leerplan-richting.css';

/** De hostnaam van een link, om te zien waar ze heen gaat ("www.onderwijsdoelen.be"); leeg als ze niet te lezen is. */
function hostnaam(link: string): string {
  try {
    return new URL(link).hostname;
  } catch {
    return '';
  }
}

function aantal(n: number): string {
  return `${n} doel${n === 1 ? '' : 'en'}`;
}

/**
 * Bij een officieel leerplan (een hele set of een zelf samengestelde lijst) verwijst elk doel naar zichzelf: een label
 * "→ 09.01" achter elke regel zegt dan niets nieuws en maakt de lijst druk. De verwijzingen blijven wel in de gegevens
 * (dekking, export). Bij een leerplan van een net zeggen ze wel iets: dan staan ze er.
 */
function maakRijen(cur: Curriculum): DoelRij[] {
  const toonVerwijzingen = !uitOfficieleBron(cur);
  return cur.goals.map((goal) => {
    const optioneel = goal.note?.trim().toLowerCase() === 'optioneel';
    const toelichting = goal.note && !optioneel ? goal.note : undefined;
    const heeftLabels = (toonVerwijzingen && Boolean(goal.refs?.length)) || optioneel || Boolean(toelichting) || goal.level === 'uitbreiding';
    return {
      key: goal.id,
      code: goal.code,
      tekst: goal.text,
      rubriek: goal.theme,
      labels: heeftLabels ? (
        <>
          {goal.level === 'uitbreiding' && <span className="badge badge-warn">Uitbreiding</span>}
          {optioneel && <span className="badge badge-warn">Optioneel</span>}
          {toonVerwijzingen && <VerwijzingLabels verwijzingen={goal.refs} />}
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
  const officieel = uitOfficieleBron(curriculum);
  // Een zelf samengestelde lijst past de leerkracht aan door de keuze te wijzigen (de lijst wordt dan opnieuw samengesteld).
  const keuzeAanpassen = isSamengesteld(curriculum) && curriculum.kind !== 'eigen';
  const rijen = useMemo(() => maakRijen(curriculum), [curriculum]);
  const geldigVanaf = h?.geldigVanaf ? Date.parse(h.geldigVanaf) : NaN;
  const feiten: { naam: string; waarde: string; link?: string; klasse?: string }[] = [{ naam: 'Net', waarde: netLabel(curriculum.net) }];
  if (curriculum.subject) feiten.push({ naam: 'Vak', waarde: curriculum.subject });
  if (curriculum.level) feiten.push({ naam: 'Niveau', waarde: curriculum.level });
  // De studierichting waarvoor het leerplan gemaakt is (alleen als er een geldige doelgroep is). Het vak staat al hierboven.
  const doelgroep = sanitizeDoelgroep(curriculum.doelgroep);
  if (doelgroep) {
    feiten.push({
      naam: 'Studierichting',
      klasse: 'lp-info-richting',
      waarde: doelgroepTekst(doelgroep, { zonderVak: true }),
      link: `/cursussen/richtingen/${encodeURIComponent(doelgroep.groep)}${doelgroep.soort === 'buso' ? '?soort=buso' : ''}`,
    });
  }
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
          <h1 className="lp-kop" tabIndex={-1} style={{ marginTop: 6 }}>{curriculum.title || 'Leerplan'}</h1>
          <p className="sub">
            {netLabel(curriculum.net)} · {aantal(curriculum.goals.length)}
            {curriculum.example ? ' · voorbeeldmateriaal, geen officieel document' : ''}
          </p>
          <div className="lp-labels">
            <ControleLabel status="gecontroleerd" />
            {officieel && <OfficieelLabel eigenKopie={curriculum.kind === 'eigen'} soort={officieelSoort(curriculum)} />}
          </div>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-ghost" onClick={onExport}><ExportIcon size={18} /> Exporteren</button>
        </div>
      </div>
      {!officieel && <p className="hint lp-deelhint">{DEEL_HINT}</p>}

      <div className="callout lp-slot" role="note">
        <Lock size={20} className="lp-slot-icoon" />
        <div>
          <p>
            <strong>{nagekekenTekst(curriculum)}.</strong> Dit leerplan staat op slot, zodat het letterlijk blijft.
            {keuzeAanpassen
              ? ' Wil je andere doelen kiezen? Pas de keuze aan. Wil je zelf iets in een doel veranderen? Maak een eigen kopie.'
              : ' Wil je iets aanpassen? Maak een eigen kopie.'}
          </p>
          <div className="lp-acties">
            {keuzeAanpassen && (
              <Link className="btn btn-sm btn-primary" to={`/leerplannen/samenstellen/${encodeURIComponent(curriculum.id)}`}>
                <EditIcon size={16} /> Keuze aanpassen
              </Link>
            )}
            <button className={`btn btn-sm ${keuzeAanpassen ? 'btn-ghost' : 'btn-primary'}`} onClick={onEigenKopie}><DuplicateIcon size={16} /> Eigen kopie maken</button>
          </div>
        </div>
      </div>

      <dl className="card card-pad lp-info">
        {feiten.map((f) => (
          <div key={f.naam} className={f.klasse}>
            <dt>{f.naam}</dt>
            <dd>{f.link ? <Link to={f.link} className="lp-info-link">{f.waarde}</Link> : f.waarde}</dd>
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
                    Bekijk de bron{hostnaam(bronLink) ? ` (${hostnaam(bronLink)})` : ''} <ExternalLink size={14} className="icon-inline" aria-hidden="true" />
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
