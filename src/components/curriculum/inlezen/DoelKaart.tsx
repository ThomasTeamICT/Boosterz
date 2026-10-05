// Eén doel in stap 4 van de inleeswizard: code, rubriek en tekst (aanpasbaar, want de lezer kan verkeerd
// knippen), de nakijkstatus, de verwijzingen naar minimumdoelen als labels, de keuze bij een
// dubbelzinnige verwijzing, en "Bekijk in de bron". Een doel verwijderen kan ook.

import { memo } from 'react';
import { CircleCheck, CircleDashed, CircleHelp, CircleX, LoaderCircle } from 'lucide-react';
import type { CurriculumGoal, MinimumdoelRef } from '../../../lib/curriculumTypes';
import { geldigheidTekstVanBestand, zoekMinimumdoel } from '../../../lib/leerplanInlezen';
import { htmlNaarTekst, type MinimumdoelenSetBestand } from '../../../lib/minimumdoelen';
import { niveauTekst } from '../../../lib/leerplanNiveau';
import { themaVanDoel } from '../../../lib/minimumdoelenLeerplan';
import type { VerwijzingProbleem } from '../../../lib/minimumdoelVerwijzing';
import { AddIcon, DeleteIcon, WarningIcon } from '../../icons';
import { Field } from '../../ui';
import { VerwijzingLabels } from '../VerwijzingLabels';

/** Hoe het doel er voor staat: letterlijk in de bron, niet, geen bron, aan het nakijken of buiten het nakijken gebleven. */
export type DoelStatus = 'ja' | 'nee' | 'onbekend' | 'bezig' | 'overgeslagen';

const STATUS = {
  ja: { klasse: 'badge badge-ok', Icoon: CircleCheck, tekst: 'Letterlijk in de bron' },
  nee: { klasse: 'badge badge-err', Icoon: CircleX, tekst: 'Niet letterlijk gevonden' },
  onbekend: { klasse: 'badge', Icoon: CircleHelp, tekst: 'Geen bron' },
  bezig: { klasse: 'badge', Icoon: LoaderCircle, tekst: 'Wordt nagekeken…' },
  overgeslagen: { klasse: 'badge badge-warn', Icoon: CircleDashed, tekst: 'Nog niet nagekeken' },
} as const;

function kort(t: string, max: number): string {
  const s = t.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max).trimEnd()}…` : s;
}

interface Props {
  goal: CurriculumGoal;
  /** Volgnummer vanaf 1, voor labels voor schermlezers. */
  nummer: number;
  status: DoelStatus;
  /** De plaats in de bron waar het doel staat (uit de nakijkpoort). */
  vindplaats?: string;
  /** De ruwe regels van de lezer, als terugval. */
  fragment?: string;
  problemen: readonly VerwijzingProbleem[];
  bestanden: ReadonlyMap<string, MinimumdoelenSetBestand>;
  onCode: (id: string, waarde: string) => void;
  onTekst: (id: string, waarde: string) => void;
  onVerwijder: (id: string) => void;
  onVerwijderRef: (id: string, index: number) => void;
  onKies: (id: string, ref: MinimumdoelRef) => void;
  onVoegToe: (id: string) => void;
}

function Kandidaat({ refMd, bestanden, onKies }: { refMd: MinimumdoelRef; bestanden: ReadonlyMap<string, MinimumdoelenSetBestand>; onKies: () => void }) {
  const doel = zoekMinimumdoel(bestanden, refMd);
  const bestand = bestanden.get(refMd.set);
  const set = bestand?.set;
  // "Ruimtelijk bewustzijn, 1ste graad A-stroom": dezelfde code komt in meer sets voor (de A- en de B-stroom, een
  // oude en een nieuwe versie), dus graad en stroom horen bij de naam.
  const niveau = set ? niveauTekst(set.graad ?? '', set.stroom ?? '') : '';
  const naam = [set?.korteNaam?.trim() || set?.naam || refMd.set, niveau].filter(Boolean).join(', ');
  // Het nummer en de geldigheid maken het verschil tussen een oude en een nieuwe versie met dezelfde naam.
  const geldig = bestand ? geldigheidTekstVanBestand(bestand)?.toLowerCase().replace(/\s*\(([^)]*)\)\s*$/, ', $1') : undefined;
  const welke = [refMd.set, geldig].filter(Boolean).join(', ');
  const uitleg = [doel ? themaVanDoel(doel) : undefined, doel ? kort(htmlNaarTekst(doel.tekst), 110) : undefined].filter(Boolean).join(' — ');
  return (
    <button type="button" className="il-kandidaat" onClick={onKies}>
      <span className="il-kandidaat-titel">{refMd.code} · {naam} <span className="il-kandidaat-set">({welke})</span></span>
      {uitleg && <span className="il-kandidaat-zin">{uitleg}</span>}
      <span className="il-kandidaat-actie">Kies dit minimumdoel</span>
    </button>
  );
}

function DoelKaartBasis({
  goal, nummer, status, vindplaats, fragment, problemen, bestanden, onCode, onTekst, onVerwijder, onVerwijderRef, onKies, onVoegToe,
}: Props) {
  const s = STATUS[status];
  const naam = goal.code.trim() || `Doel ${nummer}`;
  const bron = vindplaats ?? fragment;
  const setNaamVan = (id: string) => {
    const kop = bestanden.get(id)?.set;
    return kop?.korteNaam?.trim() || kop?.naam;
  };
  const bronKop = vindplaats
    ? status === 'nee' ? 'Hier lijkt het doel in de bron te staan:' : 'Zo staat het in de bron:'
    : 'Zo las Boosterz dit doel in de bron:';
  return (
    <article className="card il-doel" id={`il-doel-${goal.id}`} aria-labelledby={`il-doel-kop-${goal.id}`}>
      <header className="il-doel-kop">
        <h4 id={`il-doel-kop-${goal.id}`} tabIndex={-1}>{naam}</h4>
        <span className={s.klasse}>
          <s.Icoon size={16} className={status === 'bezig' ? 'il-spin' : undefined} />
          {s.tekst}
        </span>
        {goal.level === 'uitbreiding' && <span className="badge badge-warn">Uitbreiding</span>}
        <button
          type="button" className="btn btn-quiet btn-sm btn-icon il-doel-weg" aria-label={`Doel ${naam} verwijderen`}
          onClick={() => onVerwijder(goal.id)}
        >
          <DeleteIcon size={16} />
        </button>
      </header>
      {goal.theme && <p className="il-rubriek">Rubriek: {goal.theme}</p>}

      <div className="il-doel-velden">
        <Field label="Code">
          <input className="input input-sm il-codeveld" value={goal.code} aria-label={`Code van doel ${nummer}`} autoComplete="off" onChange={(e) => onCode(goal.id, e.target.value)} />
        </Field>
        <Field label="Tekst">
          <textarea className="textarea" rows={3} value={goal.text} aria-label={`Tekst van doel ${nummer}`} onChange={(e) => onTekst(goal.id, e.target.value)} />
        </Field>
      </div>

      <div className="il-refs" role="group" aria-label={`Verwijzingen van doel ${naam}`}>
        <span className="lp-refs-titel">Verwijst naar minimumdoel</span>
        <div className="dl-labels">
          {goal.refs && goal.refs.length > 0
            ? <VerwijzingLabels verwijzingen={goal.refs} setNaamVan={setNaamVan} onRemove={(i) => onVerwijderRef(goal.id, i)} />
            : <span className="hint">Geen verwijzingen</span>}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onVoegToe(goal.id)}>
            <AddIcon size={16} /> Verwijzing toevoegen<span className="sr-only"> bij doel {naam}</span>
          </button>
        </div>
        {goal.refsBron && <p className="hint il-refsbron">In de bron: {goal.refsBron}</p>}
      </div>

      {problemen.map((p) =>
        p.soort === 'dubbelzinnig' ? (
          <div key={`${p.code}-d`} className="il-probleem" role="group" aria-label={`Verwijzing ${p.code} van doel ${naam}: kies het juiste minimumdoel`}>
            <p>
              <WarningIcon size={16} className="icon-inline" /> <strong>De verwijzing {p.code}</strong> past op meer dan één minimumdoel. Kies het juiste:
            </p>
            <ul className="il-kandidaten">
              {p.kandidaten.map((k) => (
                <li key={`${k.set}:${k.id}`}>
                  <Kandidaat refMd={k} bestanden={bestanden} onKies={() => onKies(goal.id, k)} />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p key={`${p.code}-o`} className="il-probleem">
            <WarningIcon size={16} className="icon-inline" /> <strong>De verwijzing {p.code}</strong> uit de bron bestaat niet in de gekozen sets. Kijk na of je de
            juiste sets koos (stap 3), of voeg het minimumdoel zelf toe.
          </p>
        ),
      )}

      <details className="il-brondetails">
        <summary>Bekijk in de bron</summary>
        {bron ? (
          <>
            <p className="hint">{bronKop}</p>
            <p className="il-bron-tekst">{bron}</p>
          </>
        ) : (
          <p className="hint">Er is geen fragment uit de bron om te tonen.</p>
        )}
      </details>
    </article>
  );
}

/** Zonder nodeloos opnieuw tekenen: bij een leerplan met honderd doelen verandert bij elke toets maar één kaart. */
export const DoelKaart = memo(DoelKaartBasis);
