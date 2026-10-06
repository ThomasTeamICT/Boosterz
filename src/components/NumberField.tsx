import React, { useEffect, useRef, useState } from 'react';

// Getalveld voor editors (quiz, rekenoefening, ...). Staat apart van de quiz,
// zodat een editor die alleen een getalveld nodig heeft niet de hele quiz-chunk
// meeneemt. quiz.tsx exporteert beide opnieuw voor bestaande importen.

/**
 * Getal uit een editorveld lezen: komma of punt als decimaalteken, spaties
 * rond het getal mogen. Null als er (nog) geen eindig getal staat ("", "-",
 * ","). Gebruikt door NumberField.
 */
export function parseNumberInput(raw: string): number | null {
  const n = parseFloat(raw.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

type NumberFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'> & {
  value: number;
  onChange: (n: number) => void;
  /** Kleinere waarden worden opgetrokken tot dit minimum (bv. 0 voor een tolerantie). */
  min?: number;
  max?: number;
  /** Extra voorwaarde; een getal dat ze niet haalt, wordt niet bewaard (bv. stap > 0). */
  allow?: (n: number) => boolean;
};

/**
 * Getalveld voor de editor met eigen teksttoestand. Een gewoon
 * `type="number"`-veld met `parseFloat(v) || 0` maakte van "-5" een 5 (het
 * minteken alleen werd 0 en daarna kwam de 5) en van "2,5" soms 25. Hier
 * blijft wat je typt staan, en wordt alleen een eindig getal bewaard; bij
 * het verlaten van het veld toont het weer de bewaarde waarde. Mogen
 * negatieve getallen (geen minimum, of een minimum onder 0), dan krijgt het
 * veld het gewone toetsenbord: het decimale toetsenbord van iPad en iPhone
 * heeft geen minteken. Ook 0 kan je gewoon typen: er is geen terugval op een
 * standaardwaarde.
 */
export function NumberField({ value, onChange, min, max, allow, onBlur, ...rest }: NumberFieldProps) {
  const show = (n: number) => (Number.isFinite(n) ? String(n) : '');
  const [text, setText] = useState(() => show(value));
  const committed = useRef(value);

  // waarde van buitenaf gewijzigd (andere vraag, ongedaan maken): tekst volgen
  useEffect(() => {
    if (!Object.is(value, committed.current)) {
      committed.current = value;
      setText(show(value));
    }
  }, [value]);

  const resolve = (raw: string): number | null => {
    const n = parseNumberInput(raw);
    if (n === null || (allow && !allow(n))) return null;
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };
  // ongeldig: geen getal, geweigerd, of buiten de grenzen (dan wordt de grens bewaard)
  const typed = parseNumberInput(text);
  const invalid = typed === null || !Object.is(resolve(text), typed);
  const allowsNegative = min === undefined || min < 0;

  return (
    <input
      {...rest}
      type="text"
      inputMode={allowsNegative ? 'text' : 'decimal'}
      autoComplete="off"
      value={text}
      aria-invalid={invalid || undefined}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const v = resolve(raw);
        if (v !== null && !Object.is(v, committed.current)) {
          committed.current = v;
          onChange(v);
        }
      }}
      onBlur={(e) => {
        // onvolledige, geweigerde of afgetopte invoer ("-", "", stap 0, tolerantie -1):
        // terug naar wat echt bewaard is; "2,50" blijft gewoon staan
        const shown = parseNumberInput(text);
        if (shown === null || !Object.is(shown, committed.current)) setText(show(committed.current));
        onBlur?.(e);
      }}
    />
  );
}
