// De bronvermelding van het GO! bij een lesplan of een leerplandoel, in de vorm die de eigenaar vroeg (9 november 2026):
//   lesplan:     "Bron: GO! onderwijs van de Vlaamse Gemeenschap, lesplan LP0065 (GO! studio). Letterlijk overgenomen met toestemming."
//                met 'GO! studio' als link naar https://studio.g-o.be/
//   leerplandoel: "Bron: GO! onderwijs van de Vlaamse Gemeenschap, het nieuwe GO! leerplan basisonderwijs, doelenset <vak>.
//                Letterlijk overgenomen met toestemming."
// De zinnen komen uit bronvermeldingLesplan en bronvermeldingLeerplan (types.ts): de tekst staat op één plaats.

import { GO_NAAMSVERMELDING, GO_STUDIO_URL, bronvermeldingLeerplan, type GoVak } from '../../../lib/basis/go/types';
import { datumLeesbaar } from '../../../lib/minimumdoelenBron';
import { webUrl } from '../../../lib/veiligeUrl';

export type GoBronvermeldingProps =
  | { soort: 'lesplan'; code: string; url?: string; ingelezen?: string }
  | { soort: 'leerplan'; vak: GoVak; ingelezen?: string };

export function GoBronvermelding(props: GoBronvermeldingProps) {
  const ingelezen = props.ingelezen ? ` Ingelezen op ${datumLeesbaar(props.ingelezen)}.` : '';
  if (props.soort === 'leerplan') {
    return (
      <p className="b-lp-bron">
        {bronvermeldingLeerplan(props.vak)}
        {ingelezen}
      </p>
    );
  }
  const url = webUrl(props.url ?? GO_STUDIO_URL);
  return (
    <p className="b-lp-bron">
      {`Bron: ${GO_NAAMSVERMELDING}, lesplan ${props.code} (`}
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          GO! studio<span className="sr-only"> (opent in een nieuw tabblad)</span>
        </a>
      ) : (
        'GO! studio'
      )}
      {'). Letterlijk overgenomen met toestemming.'}
      {ingelezen}
    </p>
  );
}
