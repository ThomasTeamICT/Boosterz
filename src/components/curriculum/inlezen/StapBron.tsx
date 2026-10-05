// Stap 2 van de inleeswizard: de bron. De leerkracht leest de pdf van het leerplan in of plakt de tekst,
// en Boosterz zoekt de doelen (leerplanLezer, zonder AI). Bij een bestaand leerplan is dit alleen de
// bron om letterlijk mee te vergelijken: de doelen blijven zoals ze zijn.

import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardPaste, FileText, ScanSearch } from 'lucide-react';
import type { Curriculum } from '../../../lib/curriculumTypes';
import type { BronGegevens, Gevonden } from '../../../lib/leerplanInlezen';
import { aantalMetVerwijzing } from '../../../lib/leerplanInlezen';
import { AIIcon, ImportIcon, WarningIcon } from '../../icons';
import { Field } from '../../ui';
import { LaadBericht } from '../LaadStatus';
import type { PdfStand } from './leesPdf';

const PREVIEW = 8;
/** Een blanco leerplan: de leerplannenpagina opent dan meteen het venster "Nieuw leerplan" (`?nieuw=1`). */
const BLANCO_LEERPLAN_ROUTE = '/leerplannen?nieuw=1';

function aantal(n: number, enkel: string, meer: string): string {
  return `${n.toLocaleString('nl-BE')} ${n === 1 ? enkel : meer}`;
}

export function StapBron({
  bestaand, methode, onMethode, pdf, onPdf, tekst, onTekst, bron, gevonden, verouderd, bezig, onZoek, onAI, overeen,
}: {
  /** Een bestaand leerplan wordt nagekeken: dan zoekt de wizard geen doelen. */
  bestaand?: Curriculum;
  methode: 'pdf' | 'tekst';
  onMethode: (m: 'pdf' | 'tekst') => void;
  pdf: PdfStand;
  onPdf: (file: File) => void;
  tekst: string;
  onTekst: (t: string) => void;
  /** De bron die nu geldt: de gelezen pdf of de geplakte tekst. */
  bron: BronGegevens | null;
  gevonden: Gevonden | null;
  /** De tekst is veranderd sinds de doelen gezocht werden. */
  verouderd: boolean;
  bezig: boolean;
  onZoek: () => void;
  onAI: () => void;
  /** Bestaand leerplan: komt deze bron overeen met die van het inlezen? `undefined` = niet na te gaan. */
  overeen?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [alles, setAlles] = useState(false);
  const doelen = gevonden?.goals ?? [];
  const toon = alles ? doelen : doelen.slice(0, PREVIEW);
  const resultaat = gevonden && !verouderd ? gevonden : null;
  // Zonder doelen is er één melding. Zag Boosterz helemaal geen nummering, dan is de eerste waarschuwing precies die
  // melding en laten we ze weg; herkende het er wel een, dan staat in de waarschuwingen wat er misging.
  const details = resultaat && doelen.length === 0
    ? (resultaat.resultaat.patroon ? resultaat.resultaat.waarschuwingen : resultaat.resultaat.waarschuwingen.slice(1))
    : [];

  return (
    <div className="il-stap-inhoud">
      {bestaand ? (
        <p className="il-uitleg">
          De doelen van <strong>{bestaand.title}</strong> blijven zoals ze zijn. Lees de bron opnieuw in: Boosterz vergelijkt elk doel er woord voor woord mee.
        </p>
      ) : (
        <p className="il-uitleg">
          Lees de pdf van het leerplan in, of plak de tekst. Boosterz zoekt zelf de doelen, de nummers en de verwijzingen naar minimumdoelen.
        </p>
      )}
      <p className="hint il-privacy">
        Alles blijft op dit toestel, behalve als je de AI laat helpen. Een gescande pdf (foto’s van pagina’s) bevat geen tekst en kan niet gelezen worden.
      </p>

      <fieldset className="il-keuzes">
        <legend>Hoe lees je het leerplan in?</legend>
        <div className="il-keuzes-lijst">
          <label className="il-keuze">
            <input type="radio" name="il-methode" checked={methode === 'pdf'} onChange={() => onMethode('pdf')} />
            <span className="il-keuze-tekst">
              <span className="il-keuze-titel"><FileText size={18} /> Pdf van het leerplan <span className="badge badge-brand">Aanbevolen</span></span>
              <span className="il-keuze-zin">Je kiest het pdf-bestand dat je van je net kreeg of downloadde.</span>
            </span>
          </label>
          <label className="il-keuze">
            <input type="radio" name="il-methode" checked={methode === 'tekst'} onChange={() => onMethode('tekst')} />
            <span className="il-keuze-tekst">
              <span className="il-keuze-titel"><ClipboardPaste size={18} /> Tekst plakken</span>
              <span className="il-keuze-zin">Je kopieert de tekst uit een document of van een website en plakt ze hier.</span>
            </span>
          </label>
        </div>
      </fieldset>

      {methode === 'pdf' ? (
        <div className="il-bronblok">
          <input
            ref={fileRef} id="il-pdf" type="file" accept="application/pdf,.pdf" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPdf(f); e.target.value = ''; }}
          />
          <button id="il-pdf-knop" type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={pdf.status === 'bezig'}>
            <ImportIcon size={18} /> {pdf.status === 'klaar' ? 'Een andere pdf kiezen' : 'Pdf kiezen'}
          </button>
          <div className="il-pdfstand" aria-live="polite">
            {pdf.status === 'bezig' && <LaadBericht tekst={`${pdf.naam} wordt gelezen…`} />}
            {pdf.status === 'klaar' && (
              <p className="il-ok">
                <strong>{pdf.bron.bronNaam}</strong>:{' '}
                {pdf.bron.afgekapt
                  ? `alleen de eerste ${aantal(pdf.bron.paginas ?? 0, 'pagina', 'pagina’s')} van ${pdf.bron.paginasTotaal ?? '?'} gelezen.`
                  : `${aantal(pdf.bron.paginas ?? 0, 'pagina', 'pagina’s')} gelezen.`}
              </p>
            )}
            {pdf.status === 'fout' && (
              <div className="callout warn" role="alert">
                <WarningIcon size={20} className="il-callout-icoon" />
                <div>
                  <p><strong>{pdf.naam}</strong>: {pdf.fout}</p>
                  {pdf.scan && (
                    <>
                      <p>Waarschijnlijk is het een scan: foto’s van de pagina’s, zonder echte tekst. Dit kan je doen:</p>
                      <ul>
                        <li>Zoek op de site van je net een pdf waarin je tekst kan selecteren, en lees die in.</li>
                        <li>Open de pdf, selecteer de tekst, kopieer ze en kies hier “Tekst plakken”.</li>
                        <li>Laat de scan eerst omzetten naar tekst (tekstherkenning of OCR) en lees de nieuwe pdf in.</li>
                      </ul>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="il-bronblok">
          <Field label="Tekst van het leerplan" hint={tekst.length > 0 ? `${tekst.length.toLocaleString('nl-BE')} tekens` : 'Neem het stuk met de doelen mee, niet alleen de inleiding.'}>
            <textarea id="il-tekst" className="textarea" rows={10} value={tekst} onChange={(e) => onTekst(e.target.value)} />
          </Field>
        </div>
      )}

      {bron?.afgekapt && (
        <div className="callout warn" role="alert">
          <WarningIcon size={20} className="il-callout-icoon" />
          <p>
            <strong>Alleen een deel van de pdf is gelezen.</strong> Er kunnen doelen ontbreken. Zo’n leerplan kan je bewaren, maar nakijken kan dan niet
            bevestigd worden. Lees dan alleen de pagina’s met de doelen in: kopieer ze en kies ‘Tekst plakken’.
          </p>
        </div>
      )}

      {bestaand ? (
        <>
          {bron && overeen === false && (
            <div className="callout warn" role="note">
              <WarningIcon size={20} className="il-callout-icoon" />
              <p>
                Dit lijkt niet dezelfde bron als waarmee het leerplan ingelezen werd. Je kan gewoon verder: de doelen worden met deze bron vergeleken.
              </p>
            </div>
          )}
          {bron && overeen === true && <p className="il-ok">Dit is dezelfde bron als waarmee het leerplan ingelezen werd.</p>}
        </>
      ) : (
        <>
          <div className="il-zoekrij">
            <button id="il-zoek-knop" type="button" className="btn btn-primary" disabled={!bron || bezig} onClick={() => { setAlles(false); onZoek(); }}>
              <ScanSearch size={18} /> Doelen zoeken
            </button>
            {!bron && <span className="hint">Lees eerst een pdf in of plak de tekst.</span>}
          </div>

          <p className="sr-only" role="status">
            {!bezig && resultaat ? (doelen.length === 0 ? 'Geen doelen gevonden.' : `${aantal(doelen.length, 'doel', 'doelen')} gevonden.`) : ''}
          </p>
          <div className="il-resultaat-zone">
            {bezig && <LaadBericht tekst="De doelen worden gezocht…" />}
            {!bezig && gevonden && verouderd && (
              <p className="callout warn il-verouderd" role="note">
                <WarningIcon size={20} className="il-callout-icoon" />
                <span>De bron is gewijzigd sinds je de doelen zocht. Klik op “Doelen zoeken” om opnieuw te zoeken.</span>
              </p>
            )}
            {!bezig && resultaat && (
              <section className="card card-pad il-resultaat" aria-labelledby="il-gevonden-kop">
                <h3 id="il-gevonden-kop">
                  {doelen.length === 0 ? 'Geen doelen gevonden' : `${aantal(doelen.length, 'doel', 'doelen')} gevonden`}
                </h3>
                {doelen.length > 0 && (
                  <ul className="il-feiten">
                    {resultaat.resultaat.patroon && (
                      <li>
                        Herkend: genummerde doelen zoals <span className="il-code">{resultaat.resultaat.patroon.voorbeeld}</span>
                      </li>
                    )}
                    {resultaat.resultaat.genegeerdeRegels > 0 && (
                      <li>Bladzijdenummers en koppen overgeslagen ({aantal(resultaat.resultaat.genegeerdeRegels, 'regel', 'regels')})</li>
                    )}
                    <li>
                      {aantalMetVerwijzing(doelen) > 0
                        ? `${aantal(aantalMetVerwijzing(doelen), 'doel', 'doelen')} met een verwijzing naar minimumdoelen`
                        : 'Geen verwijzingen naar minimumdoelen in de tekst gevonden'}
                    </li>
                  </ul>
                )}
                {doelen.length > 0 && resultaat.resultaat.waarschuwingen.length > 0 && (
                  <div className="callout warn il-waarschuwingen" role="note">
                    <WarningIcon size={20} className="il-callout-icoon" />
                    <div>
                      <p><strong>Kijk dit na:</strong></p>
                      <ul>{resultaat.resultaat.waarschuwingen.map((w, i) => <li key={i}>{w}</li>)}</ul>
                    </div>
                  </div>
                )}
                {doelen.length > 0 ? (
                  <>
                    <ol className="il-preview" aria-label="Voorvertoning van de gevonden doelen">
                      {toon.map((g) => (
                        <li key={g.id}>
                          <span className="il-code">{g.code}</span>
                          <span className="il-preview-tekst">{g.text}</span>
                          {(g.theme || g.refsBron) && (
                            <span className="il-preview-meta">
                              {g.theme && <span>Rubriek: {g.theme}</span>}
                              {g.refsBron && <span>Verwijzing: {g.refsBron}</span>}
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                    {doelen.length > PREVIEW && (
                      <button type="button" className="btn btn-sm btn-ghost" aria-expanded={alles} onClick={() => setAlles((a) => !a)}>
                        {alles ? 'Toon minder' : `Toon alle ${doelen.length} doelen`}
                      </button>
                    )}
                    <p className="hint">Dit is een voorvertoning. In stap 4 kijk je elk doel na en kan je ze aanpassen.</p>
                  </>
                ) : (
                  <div id="il-geen" className="il-geen" tabIndex={-1}>
                    <p>
                      Boosterz vond in deze tekst geen doelen. Kijk na of de tekst de doelen met hun code bevat (zoals “LPD 1” of “1.2”). Dat
                      kan komen doordat:
                    </p>
                    <ul>
                      <li>de pdf een scan is (foto’s van pagina’s) en dus geen echte tekst bevat;</li>
                      <li>je alleen de inleiding hebt meegenomen en niet de pagina’s met de doelen;</li>
                      <li>de doelen in een tabel of in twee kolommen staan: kopieer ze dan en plak ze als tekst;</li>
                      <li>het leerplan een nummering gebruikt die Boosterz niet herkent.</li>
                    </ul>
                    {details.length > 0 && (
                      <>
                        <p>Dit zag Boosterz nog:</p>
                        <ul>{details.map((w, i) => <li key={i}>{w}</li>)}</ul>
                      </>
                    )}
                    <p>Kijk de tekst na en probeer het opnieuw. Lukt het niet, dan kan de AI het als laatste redmiddel proberen. Kijk de doelen daarna zelf goed na.</p>
                    <button type="button" className="btn btn-ai" onClick={onAI}><AIIcon size={18} /> Laat de AI het proberen</button>
                    <p className="hint il-ai-hint">Daarvoor heb je een eigen AI-sleutel nodig; de tekst gaat dan naar je AI-aanbieder.</p>
                    <p>
                      Of <Link to={BLANCO_LEERPLAN_ROUTE}>maak een blanco leerplan</Link> en voeg de doelen zelf toe.
                    </p>
                  </div>
                )}
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
