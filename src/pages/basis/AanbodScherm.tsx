// #/basis/aanbod/LP0065/dier-of-plant: één onderdeel van het aanbod in Boosterz bij een lesplan, op het bord.
// Pakket A2-light (docs/basisonderwijs/GO-LEERPLAN.md, § A2). Het scherm laadt het manifest van het lesplan en de bordles
// van het onderdeel, en toont de bordles-speler. Op het bord wordt niets bewaard: de speler draait in de voorbeeldmodus
// en onComplete doet niets.
//
// De speler laadt lui (eigen chunk, dezelfde als in de registry), zodat hij nooit in de hoofdbundel of op het leerlingpad
// belandt. 'Dit hoort bij stap X' komt uit het manifest; het lesplan zelf hoeft hiervoor niet te laden.

import { lazy, Suspense, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAanbodBordles, useGoAanbod } from '../../components/basis/useAanbod';
import { FoutBericht, LaadBericht } from '../../components/curriculum/LaadStatus';
import { basisPad } from '../../lib/basis/basisRoutes';
import { hoortBijZin, type GoAanbodBordles, type GoAanbodOnderdeel } from '../../lib/basis/go/aanbod';
import { FOUT_BORDLES_ONTBREEKT } from '../../lib/basis/go/aanbodBron';
import type { BordlesConfig, Widget } from '../../lib/types';
import { defaultSettings } from '../../widgets/registry';
import '../../styles/basis-aanbod.css';

const BordlesPlayer = lazy(() => import('../../widgets/bordles').then((m) => ({ default: m.BordlesPlayer })));

const nietsBewaren = () => {};

/** De nep-oefening voor de speler: niets ervan wordt ergens bewaard. */
export function aanbodWidget(code: string, onderdeel: GoAanbodOnderdeel, les: GoAanbodBordles): Widget<BordlesConfig> {
  return {
    id: `aanbod-${code}-${onderdeel.id}`,
    type: 'bordles',
    title: les.titel,
    config: les.config,
    settings: defaultSettings(),
    code: '',
    folderId: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

function TerugNaarLesplan({ code }: { code: string }) {
  return (
    <Link to={basisPad({ s: 'lesplan', code })} className="b-aanbod-terug">
      Terug naar lesplan {code}
    </Link>
  );
}

/** Een scherm zonder bordles (laden, niet gevonden, fout): altijd één h1 en de weg terug. */
function Kader({ titel, code, children }: { titel: string; code: string; children?: ReactNode }) {
  return (
    <div className="b-aanbod">
      <h1>{titel}</h1>
      {children}
      <p>
        <TerugNaarLesplan code={code} />
      </p>
    </div>
  );
}

function Speler({ code, onderdeel, bestand }: { code: string; onderdeel: GoAanbodOnderdeel; bestand: string }) {
  const { stand, opnieuw } = useAanbodBordles(code, bestand);
  const widget = useMemo(() => (stand.status === 'klaar' ? aanbodWidget(code, onderdeel, stand.waarde) : undefined), [stand, code, onderdeel]);

  let inhoud: ReactNode;
  if (stand.status === 'laden') inhoud = <LaadBericht tekst="De bordles wordt geladen" />;
  else if (stand.status === 'fout') {
    inhoud =
      stand.fout === FOUT_BORDLES_ONTBREEKT ? <p className="b-aanbod-melding">{stand.fout}</p> : <FoutBericht fout={stand.fout} onOpnieuw={opnieuw} />;
  } else if (widget) {
    inhoud = (
      <Suspense fallback={<LaadBericht tekst="Het bord wordt klaargezet" />}>
        <BordlesPlayer widget={widget} preview studentName="" onComplete={nietsBewaren} />
      </Suspense>
    );
  }

  return (
    <div className="b-aanbod">
      <p className="b-aanbod-kop-rij">
        <TerugNaarLesplan code={code} />
      </p>
      <h1>{onderdeel.titel}</h1>
      <p className="b-onderregel">{hoortBijZin(onderdeel, code)}</p>
      <div className="b-aanbod-speler">{inhoud}</div>
    </div>
  );
}

export function AanbodScherm({ code, onderdeel: id }: { code: string; onderdeel: string }) {
  const { stand, opnieuw } = useGoAanbod(code);
  if (stand.status === 'laden') {
    return (
      <Kader titel="Op het bord" code={code}>
        <LaadBericht tekst="Het aanbod wordt geladen" />
      </Kader>
    );
  }
  if (stand.status === 'fout') {
    return (
      <Kader titel="Op het bord" code={code}>
        <FoutBericht fout={stand.fout} onOpnieuw={opnieuw} />
      </Kader>
    );
  }
  const onderdeel = stand.waarde?.onderdelen.find((o) => o.id === id);
  if (!onderdeel) {
    return (
      <Kader titel="Dit onderdeel vonden we niet" code={code}>
        <p>Bij lesplan {code} hoort in Boosterz geen onderdeel met deze naam.</p>
      </Kader>
    );
  }
  if (onderdeel.widget?.type !== 'bordles') {
    return (
      <Kader titel={onderdeel.titel} code={code}>
        <p>Bij dit onderdeel hoort geen uitleg op het bord.</p>
      </Kader>
    );
  }
  return <Speler code={code} onderdeel={onderdeel} bestand={onderdeel.widget.bestand} />;
}
