import React from 'react';
import { Link } from 'react-router-dom';
import { ChartColumn, Inbox, Library, type LucideIcon } from 'lucide-react';
import { AIIcon, AssignIcon, InfoIcon, PrivacyIcon, StudentIcon } from '../components/icons';
import '../styles/start.css';

/**
 * /hulp — hoe de onderdelen van Boosterz samenhangen, een eerste les in vijf
 * stappen, en de bestaande veelgestelde vragen.
 */
export function HelpPage() {
  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <h1>Hoe werkt Boosterz?</h1>
          <p className="sub">Wat elk onderdeel doet, hoe ze samenhangen, en waar je begint.</p>
        </div>
      </div>

      <section aria-labelledby="help-parts-title" style={{ marginBottom: 34 }}>
        <h2 id="help-parts-title" style={{ marginBottom: 16 }}>De onderdelen</h2>
        <div className="help-parts">
          {PARTS.map((p) => (
            <div key={p.title} className="help-part">
              <span className="icon" aria-hidden="true"><p.Icon size={20} /></span>
              <div>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="help-steps-title" style={{ marginBottom: 34 }}>
        <h2 id="help-steps-title" style={{ marginBottom: 14 }}>Je eerste les in vijf stappen</h2>
        <ol className="help-steps">
          {STEPS.map((s) => <li key={s}>{s}</li>)}
        </ol>
      </section>

      <section aria-labelledby="help-faq-title" style={{ marginBottom: 34 }}>
        <h2 id="help-faq-title" style={{ marginBottom: 12 }}>Veelgestelde vragen</h2>
        <div className="help-faq">
          {FAQ.map((item) => (
            <details key={item.q} className="card" style={{ padding: '12px 16px' }}>
              <summary>{item.q}</summary>
              {typeof item.a === 'string' ? <p>{item.a}</p> : item.a}
            </details>
          ))}
        </div>
      </section>

      <section aria-labelledby="help-soon-title" style={{ marginBottom: 20 }}>
        <h2 id="help-soon-title" style={{ marginBottom: 12 }}>Wat komt er nog</h2>
        <div className="callout">
          <InfoIcon aria-hidden="true" />
          <div>
            <strong>Synchronisatie tussen toestellen (het klaskanaal)</strong> — in voorbereiding.
            Inzendingen en leesvoortgang lopen vandaag via klaslinks, codes en het inleverpunt; dat
            blijft ook straks de terugval voor wie het klaskanaal niet gebruikt.
          </div>
        </div>
      </section>

      <div className="callout">
        <PrivacyIcon aria-hidden="true" />
        <div>
          Alles staat in je browser, zonder account — inclusief wat er gebeurt als je de
          AI-assistent gebruikt: de{' '}<Link to="/privacy">privacypagina</Link>.
        </div>
      </div>
    </div>
  );
}

// ── De onderdelen ────────────────────────────────────────────────────────────

const PARTS: { title: string; Icon: LucideIcon; text: string }[] = [
  {
    title: 'Materiaal: widgets, cursussen en leerplannen', Icon: Library,
    text: 'Een widget is één oefening of spel (38 soorten). Een cursus bundelt hoofdstukken met uitleg en widgets erin. Een leerplan legt doelen vast waar je materiaal aan koppelt, zodat de dekking en de scores per doel kloppen.',
  },
  {
    title: 'Klassen', Icon: AssignIcon,
    text: 'Een klaslijst met een klascode. Je wijst er opdrachten aan toe — een cursus of widget, met een deadline — en één klaslink brengt elke leerling naar zijn eigen overzicht.',
  },
  {
    title: 'Resultaten', Icon: ChartColumn,
    text: 'Scores, antwoorden en leesvoortgang van elke inzending, per widget of cursus en per leerplandoel. Open vragen kijk je hier na; per klas zie je meteen wie nog moet indienen.',
  },
  {
    title: 'Inleverpunt', Icon: Inbox,
    text: 'Voor werk dat niet via een klaslink binnenkomt: na het indienen toont de leerling een code of QR, en jij scant of plakt die hier om het resultaat op te halen.',
  },
  {
    title: 'AI-studio', Icon: AIIcon,
    text: 'Optioneel, met je eigen sleutel bij Anthropic of OpenAI. Plak een hoofdstuk of leerplandoelen en krijg een voorzet voor widgets of een cursus — jij kijkt na voor je deelt. Zonder sleutel werkt de rest van Boosterz gewoon.',
  },
  {
    title: 'De leerlingkant', Icon: StudentIcon,
    text: 'Een leerling opent een klaslink of tikt een code van 6 tekens in bij "Ik ben leerling en heb een code" — zonder account. Daar vindt ze haar opdrachten, oefeningen en cursussen.',
  },
];

const STEPS: string[] = [
  'Maak een oefening of cursus — zelf, of laat de AI-studio een voorzet schrijven vanuit je lesmateriaal.',
  'Maak een klas aan en plak je klaslijst.',
  'Wijs de oefening of cursus toe als opdracht aan de klas, eventueel met een deadline.',
  'Deel de klaslink met je leerlingen, of laat ze de code intikken op de leerlingpagina.',
  'Volg de resultaten op en kijk openstaande vragen na.',
];

// ── Veelgestelde vragen (ongewijzigde inhoud, zonder emoji in de vraag) ─────

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: 'Waar staan mijn gegevens?',
    a: 'Alles staat lokaal in de browser van dit toestel — er is geen server en geen account. Dat betekent ook: een ander toestel of een andere browser ziet je widgets niet vanzelf. Exporteer belangrijke widgets of cursussen als bestand (back-up!) of deel ze via de draagbare link.',
  },
  {
    q: 'Wat kost de AI-assistent?',
    a: 'De app zelf is gratis; de AI werkt met jouw eigen API-sleutel bij Anthropic of OpenAI, en die aanbieder rekent per gebruikte token af (typisch enkele centen per generatie). Bij AI-instellingen zie je een logboek van elk gebruik. Zonder sleutel werkt de hele app gewoon — alleen de AI-functies staan dan uit.',
  },
  {
    q: 'Hoe krijg ik thuiswerk binnen?',
    a: 'Wie thuis via de draagbare link werkt, houdt resultaten op het eigen toestel. Daarvoor zijn er codes: na een oefening kopieert de leerling zijn resultaatcode, na (een stuk) cursus zijn voortgangscode. Die plak jij bij Resultaten of bij het voortgangsoverzicht — klaar. Handig via je leeromgeving of e-mail.',
  },
  {
    q: 'Hebben leerlingen een account nodig?',
    a: 'Nee. Een voornaam volstaat (en zelfs dat kan je uitschakelen). Er wordt bewust zo weinig mogelijk gevraagd — zie de privacypagina voor het volledige plaatje, inclusief een printbare uitleg voor directie of ouders.',
  },
  {
    q: 'Werkt dit in Smartschool of Moodle?',
    a: 'Ja: elke widget en cursus heeft in het deelvenster een insluitcode (iframe) die je in een pagina van je leeromgeving plakt. De gewone deellink werkt uiteraard ook overal waar je een link kwijt kan.',
  },
  {
    q: 'Hoe deel ik met collega\'s?',
    a: 'Exporteer een widget of cursus als JSON-bestand, of deel een hele map in één keer als vakgroeppakket (bij Materiaal, Widgets: open de map, kies "Map" en dan "Delen als pakket"). Je collega importeert het bestand en heeft meteen alles, inclusief ingebedde oefeningen.',
  },
  {
    q: 'Kan ik terug naar een vorige versie?',
    a: 'De app bewaart geen versiegeschiedenis; exporteer daarom vóór grote ingrepen (zoals een AI-herwerking) even een back-upbestand — de AI-herwerkmodal heeft daar een knop voor. Importeren zet de back-up terug (met bevestiging).',
  },
  {
    q: 'Hoe werk ik met een klas op meerdere toestellen?',
    a: (
      <ol>
        <li>Maak bij Klassen een klas en plak je klaslijst.</li>
        <li>Wijs opdrachten toe: een cursus of widget, met een deadline.</li>
        <li>Deel de klaslink of de QR-code met je leerlingen: op elk toestel opent die het overzicht van de leerling, waar hij zijn naam kiest en zijn opdrachten ziet.</li>
        <li>Inleveren: de leerling toont zijn QR-code in de sectie Inleveren, jij scant of plakt ze op het Inleverpunt. Het klasoverzicht telt alles op per leerling, ook per leerplandoel.</li>
      </ol>
    ),
  },
  {
    q: 'Hoe bouw ik een cursus die het leerplan dekt?',
    a: 'Maak eerst een leerplan bij Leerplannen: plak de doelen of lees de pdf in; de AI zet ze om in een doelenlijst met codes (officiële nummering blijft staan). Kies dan bij Cursussen "Blanco vanuit leerplan", vink de doelen aan en laat de AI-cursusbouwer een cursus maken waarin elk doel in een sectie zit. De dekkingsmatrix in de editor toont wat gedekt is; de knop "Vul de hiaten" schrijft secties voor wat nog ontbreekt.',
  },
  {
    q: 'Ik heb al cursusmateriaal in Word of pdf. Hoe krijg ik dat erin?',
    a: 'Ga naar Importeren (ook via de knop op de widgetpagina): sleep je .docx, pdf, markdown of tekst erin. Je ziet de tekst en kiest wat je ermee doet: een cursus laten bouwen met AI (optioneel gekoppeld aan een leerplan), oefeningen laten maken in de AI-studio, of zonder AI omzetten naar een cursus waarbij koppen hoofdstukken en secties worden. Daarna pas je alles aan in de editor en kan je het met de optimaliseer-knop vereenvoudigen, differentiëren of controlevragen laten toevoegen.',
  },
  {
    q: 'Mijn cursus is één pdf per hoofdstuk. Kan dat in één keer?',
    a: 'Ja. Kies bij Importeren alle pdf\'s tegelijk (in de goede volgorde), geef de cursus een titel en klik "Samenvoegen tot één cursus": elk bestand wordt een hoofdstuk. Alleen de afbeeldingen reizen niet mee: die voeg je daarna toe met een afbeeldingsblok. Laat je het vinkje "Oefeningen afleiden" aan, dan krijgt elk hoofdstuk er meteen een begrippenquiz, een koppelspel, invuloefeningen en een werkblad met je eigen opdrachten bij, zonder AI. Wil je eerst zien hoe zoiets eruitziet? Klik bij Cursussen op "Voorbeeldcursus laden": een echte cursus natuurwetenschappen van 14 hoofdstukken die precies zo binnenkwam, aangevuld met oefeningen in allerlei vormen.',
  },
  {
    q: 'De opslag zit vol — wat nu?',
    a: 'Afbeeldingen, audio en bijlagen staan sinds kort apart in de bestandsopslag van de browser (IndexedDB, honderden MB), dus die vullen de kleine tekstopslag niet meer. Zit ze toch vol, dan zijn oude inzendingen (met tekeningen en audio-antwoorden) meestal de boosdoener: wis ze via de privacypagina, of exporteer oude widgets naar een bestand en verwijder ze uit de app.',
  },
];
