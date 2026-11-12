// #/basis/bord/lichtkamer/einde-4de: het scherm voor het digibord (LK-8). Grote letters, de klasvraag, 'Toon de uitkomst'
// en de presentertoetsen. Geen namen in beeld en niets bewaard (het bewijs is hier leeg: bewijs={null}). Met
// ?scherm=<oefening> opent het meteen op die oefening. Dit scherm laadt lui (BasisDeel) en draagt zijn eigen kale schil.

import { BordSchil } from '../../components/basis/BordSchil';
import { LichtkamerLes } from '../../components/basis/lichtkamer/LichtkamerLes';
import { basisPad } from '../../lib/basis/basisRoutes';
import { PAKKETTEN, type PakketBeginScherm, type PakketNaam } from '../../lib/basis/pakketten';
import '../../styles/basis-lichtkamer.css';
import '../../styles/basis-lichtkamer-schermen.css';

export function LichtkamerBordScherm({ pakket, scherm }: { pakket: PakketNaam; scherm?: PakketBeginScherm }) {
  const p = PAKKETTEN[pakket];
  return (
    <BordSchil titel={p.titel} terug={basisPad({ s: 'pakket', pakket, eind: p.eind })}>
      <LichtkamerLes stand="bord" bewijs={null} beginScherm={scherm} />
    </BordSchil>
  );
}
