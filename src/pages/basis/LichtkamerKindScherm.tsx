// #/basis/oefen/lichtkamer/einde-4de: het scherm van het kind op de eigen Chromebook (LK-8). De drie oefeningen, de check
// en 'Wat ik al kan'. Geen naam en niets bewaard op het toestel: het bewijs leeft in het geheugen en in de sessionStorage
// van het tabblad (useKindBewijs). Met ?scherm=<oefening> opent de les meteen op die oefening (voor de leerkracht en tests).
// Dit scherm laadt lui (BasisDeel) en draagt zijn eigen kale schil.

import { KindSchil } from '../../components/basis/KindSchil';
import { LichtkamerLes } from '../../components/basis/lichtkamer/LichtkamerLes';
import { useKindBewijs } from '../../components/basis/lichtkamer/useKindBewijs';
import { PAKKETTEN, type PakketBeginScherm, type PakketNaam } from '../../lib/basis/pakketten';
import '../../styles/basis-lichtkamer.css';
import '../../styles/basis-lichtkamer-schermen.css';

export function LichtkamerKindScherm({ pakket, scherm }: { pakket: PakketNaam; scherm?: PakketBeginScherm }) {
  const bewijs = useKindBewijs();
  return (
    <KindSchil titel={PAKKETTEN[pakket].titel}>
      <LichtkamerLes stand="kind" bewijs={bewijs} beginScherm={scherm} />
    </KindSchil>
  );
}
