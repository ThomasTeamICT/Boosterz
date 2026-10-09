// De sectie "Leerplannen" van een richting (docs/STUDIERICHTINGEN.md § 11.2, § 11.3 en § 14.3): de leerplannen van deze richting
// op dit toestel (met "Werk het leerplan bij" als de officiële koppeling veranderde) en het leerplan van je net.
//
// Van de netten tonen we alleen links en wat de school zelf inlas, nooit inhoud (auteursrecht).

import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { GoalIcon, RetryIcon, WarningIcon } from '../icons';
import { useToast } from '../ui';
import { ControleLabel } from '../curriculum/ControleLabel';
import { NettenLinks } from '../curriculum/NettenLinks';
import { saveCurriculum } from '../../lib/curriculum';
import type { Curriculum } from '../../lib/curriculumTypes';
import { doelgroepVoorLeerplan, sanitizeDoelgroep } from '../../lib/doelgroep';
import { effectieveStatus, isSamengesteld, uitOfficieleBron } from '../../lib/leerplanStatus';
import { opvolgersVan, oudeVersieIds } from '../../lib/minimumdoelenBron';
import { leerplannenBijRichting, leerplanVoorRichting, vergelijkMetKader } from '../../lib/richtingCursus';
import { doelgroepVan } from '../../lib/richtingKader';
import { metExtraLeerplan } from '../../lib/richtingWeergave';
import {
  aantalDoelen,
  kaderSleutelsVan,
  laadSetBestanden,
  nietNagekekenTekst,
  richtingQuery,
  type RichtingContext,
} from './RichtingDoelen';

/** "3 doelen nieuw, 2 doelen vervallen": alleen wat groter is dan nul. */
function veranderingTekst(nieuw: number, vervallen: number): string {
  const delen: string[] = [];
  if (nieuw > 0) delen.push(`${aantalDoelen(nieuw)} nieuw`);
  if (vervallen > 0) delen.push(`${aantalDoelen(vervallen)} vervallen`);
  return delen.join(', ');
}

function OpenKnop({ leerplan }: { leerplan: Curriculum }) {
  return (
    <Link className="btn btn-sm btn-ghost ri-knop" to={`/leerplannen?open=${encodeURIComponent(leerplan.id)}`}>
      Open<span className="sr-only"> {leerplan.title}</span>
    </Link>
  );
}

export function RichtingLeerplannen({
  info, keuze, kader, indexSets, curricula, bestaandLeerplan,
}: RichtingContext & {
  /** Het leerplan waar "Open het leerplan" naartoe wijst: het staat ook in de lijst hieronder (zie `useBestaandLeerplan`). */
  bestaandLeerplan: Curriculum | undefined;
}) {
  const toast = useToast();
  const [bezigId, setBezigId] = useState<string | null>(null);
  const [fout, setFout] = useState<{ id: string; tekst: string } | null>(null);
  /** De kop van de lijst: na "Werk het leerplan bij" verdwijnt de knop en gaat de focus hierheen. */
  const lijstKop = useRef<HTMLHeadingElement>(null);

  const soort = kader.keuze.soort;
  const kaderSleutels = useMemo(() => kaderSleutelsVan(kader), [kader]);
  const bijRichting = useMemo(
    () => leerplannenBijRichting(curricula, kaderSleutels, info.groep.nummer),
    [curricula, kaderSleutels, info.groep.nummer],
  );

  // Eigen lijsten uit de officiële bron die bij deze richting horen, en leerplannen van een net die naar haar doelen verwijzen.
  // Het leerplan waar "Open het leerplan" naartoe wijst staat er ook bij, ook zonder doelgroep, zodat knop en lijst hetzelfde zeggen.
  const bestaandId = bestaandLeerplan?.id;
  const vanRichting = useMemo(
    () => metExtraLeerplan(
      bijRichting.filter((r) => r.curriculum.id === bestaandId
        || (r.viaDoelgroep && uitOfficieleBron(r.curriculum) && sanitizeDoelgroep(r.curriculum.doelgroep)?.soort === soort)),
      bestaandLeerplan,
      (curriculum) => ({ curriculum, raakt: 0, viaDoelgroep: false }),
    ).map((r) => ({ ...r, verschil: isSamengesteld(r.curriculum) ? vergelijkMetKader(r.curriculum, kader) : undefined })),
    [bijRichting, kader, soort, bestaandId, bestaandLeerplan],
  );
  const vanNet = useMemo(
    () => bijRichting.filter((r) => r.curriculum.id !== bestaandId && !uitOfficieleBron(r.curriculum)
      && (r.raakt > 0 || (r.viaDoelgroep && sanitizeDoelgroep(r.curriculum.doelgroep)?.soort === soort))),
    [bijRichting, soort, bestaandId],
  );

  const werkBij = async (c: Curriculum) => {
    if (bezigId !== null) return;
    setBezigId(c.id);
    setFout(null);
    try {
      // De sets van het leerplan die nog in het kader staan, plus de opvolgers van de sets die er niet meer in staan.
      const inKader = new Set(kader.sets.map((k) => k.set.id));
      const sets = new Set((c.minimumdoelenSets ?? []).filter((s) => inKader.has(s)));
      for (const weg of vergelijkMetKader(c, kader).setsNietMeerInKader) {
        const oud = indexSets.find((s) => s.id === weg);
        if (!oud) continue;
        for (const opvolger of opvolgersVan(oud, indexSets).sets) if (inKader.has(opvolger.id)) sets.add(opvolger.id);
      }
      const ids = [...sets];
      const bestanden = await laadSetBestanden(ids);
      const doelgroep = doelgroepVoorLeerplan(c.doelgroep) ?? doelgroepVan(info, keuze);
      const r = leerplanVoorRichting(kader, bestanden, doelgroep, {
        sets: ids,
        bestaand: c,
        titel: c.title,
        vak: c.subject,
        oudeVersies: oudeVersieIds(indexSets),
      });
      if (!r.bevestigd) {
        setFout({ id: c.id, tekst: nietNagekekenTekst(r.waarschuwingen) });
        return;
      }
      // Bij een volle opslag meldt de opslaglaag dat zelf: dan zeggen we hier niet dat het bijgewerkt is.
      if (!saveCurriculum(r.leerplan)) return;
      lijstKop.current?.focus();
      toast('Leerplan bijgewerkt. De doelcodes in je cursussen blijven dezelfde.', 'ok');
    } catch {
      setFout({ id: c.id, tekst: 'Het leerplan kon niet bijgewerkt worden. Controleer je verbinding en probeer opnieuw.' });
    } finally {
      setBezigId(null);
    }
  };

  const query = richtingQuery(info, keuze, kader);

  return (
    <section className="ri-sectie" aria-labelledby="ri-leerplannen-kop">
      <h2 id="ri-leerplannen-kop">Leerplannen</h2>

      <div className="ri-groep">
        <h3 ref={lijstKop} tabIndex={-1}>Leerplannen van deze richting op dit toestel</h3>
        {vanRichting.length === 0 ? (
          <p className="ri-leeg">Nog geen leerplan van deze richting op dit toestel.</p>
        ) : (
          <ul className="ri-items">
            {vanRichting.map(({ curriculum: c, verschil }) => {
              const veranderd = verschil !== undefined && (verschil.nieuw > 0 || verschil.vervallen > 0);
              const volgt = sanitizeDoelgroep(c.doelgroep)?.volgtKader === true;
              return (
                <li key={c.id} className="ri-item">
                  <div className="ri-item-rij">
                    <div className="ri-item-tekst">
                      <span className="ri-item-titel">{c.title}</span>
                      {' · '}
                      <ControleLabel status={effectieveStatus(c)} />
                      {' · '}
                      {aantalDoelen(c.goals.length)}
                      {c.kind === 'eigen' && <>{' · '}<span className="badge">Eigen kopie</span></>}
                    </div>
                    <OpenKnop leerplan={c} />
                  </div>
                  {veranderd && verschil && (
                    <div className="callout warn ri-melding" role="note">
                      <WarningIcon size={20} className="ri-melding-icoon" />
                      <div className="ri-melding-tekst">
                        <p>
                          De officiële koppeling van deze richting is veranderd sinds je ‘{c.title}’ maakte: {veranderingTekst(verschil.nieuw, verschil.vervallen)}.
                        </p>
                        {volgt ? (
                          <button
                            type="button" className="btn btn-sm btn-ghost ri-knop" aria-disabled={bezigId !== null ? 'true' : undefined}
                            onClick={() => void werkBij(c)}
                          >
                            <RetryIcon size={16} /> Werk het leerplan bij<span className="sr-only"> {c.title}</span>
                          </button>
                        ) : (
                          <Link className="btn btn-sm btn-ghost ri-knop" to={`/leerplannen/samenstellen/${encodeURIComponent(c.id)}?${query}`}>
                            <GoalIcon size={16} /> Kies de doelen opnieuw<span className="sr-only"> voor {c.title}</span>
                          </Link>
                        )}
                        {bezigId === c.id && <p className="ri-bezig" role="status">De sets worden geladen en nagekeken…</p>}
                      </div>
                    </div>
                  )}
                  {fout?.id === c.id && (
                    <div className="callout err ri-melding" role="alert">
                      <WarningIcon size={20} className="ri-melding-icoon" />
                      <div className="ri-melding-tekst"><p>{fout.tekst}</p></div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="ri-groep">
        <h3>Leerplan van je net</h3>
        <p>
          Boosterz levert de leerplannen van de netten niet mee: ze zijn auteursrechtelijk beschermd. Haal het leerplan van je school bij je net en lees het in.
          De verwijzingen naar de minimumdoelen worden dan nagekeken, en het leerplan telt mee in de dekking.
        </p>
        <NettenLinks />
        <p className="ri-label">Op dit toestel:</p>
        {vanNet.length === 0 ? (
          <p className="ri-leeg">Nog geen leerplan van een net op dit toestel dat naar doelen van deze richting verwijst.</p>
        ) : (
          <ul className="ri-items">
            {vanNet.map((r) => (
              <li key={r.curriculum.id} className="ri-item">
                <div className="ri-item-rij">
                  <div className="ri-item-tekst">
                    <span className="ri-item-titel">{r.curriculum.title}</span>
                    {' · '}
                    {r.raakt > 0
                      ? `verwijst naar ${aantalDoelen(r.raakt)} van deze richting`
                      : 'verwijst niet naar doelen van deze richting'}
                  </div>
                  <OpenKnop leerplan={r.curriculum} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="ri-acties">
          <Link className="btn btn-ghost ri-knop" to={`/leerplannen/inlezen?${query}`}>Leerplan inlezen voor deze richting</Link>
        </div>
      </div>
    </section>
  );
}
