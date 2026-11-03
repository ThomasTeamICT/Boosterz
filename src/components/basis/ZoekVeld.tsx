// Het zoekveld van de zoekpagina: een form role="search" met een label voor schermlezers (sr-only), een invoer van 48 px
// en de knop 'Zoek'. Het veld bewaart niets: de vraag staat in de url en nergens anders. Het scherm zet `key={vraag}`,
// zodat de invoer meekomt als de url verandert (een link in de resultaten).

import { useState, type FormEvent } from 'react';

export function ZoekVeld({ vraag, label, onZoek }: { vraag: string; label: string; onZoek: (vraag: string) => void }) {
  const [tekst, setTekst] = useState(vraag);
  const verstuur = (e: FormEvent) => {
    e.preventDefault();
    onZoek(tekst.trim());
  };
  return (
    <form className="b-zoekrij" role="search" onSubmit={verstuur}>
      <label htmlFor="b-zoek-invoer" className="sr-only">
        {label}
      </label>
      <div className="b-zoekveld">
        <input
          id="b-zoek-invoer"
          className="input b-zoekinvoer"
          type="search"
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
          placeholder="Bijvoorbeeld schaduw, breuken of rijmen"
          autoComplete="off"
          enterKeyHint="search"
        />
        <button type="submit" className="btn btn-primary b-zoekknop">
          Zoek
        </button>
      </div>
    </form>
  );
}
