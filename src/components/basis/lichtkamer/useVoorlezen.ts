// Voorlezen met speechSynthesis van de browser: eerst een stem nl-BE, dan nl. In de prikkelarme stand leest niets vanzelf
// voor; de knop 'Hoor het nog eens' leest altijd voor. Ontbreekt speechSynthesis, dan is `beschikbaar` onwaar en toont
// het scherm de knoppen niet.

import { useCallback, useEffect, useRef, useState } from 'react';
import { VOORLEES_TAAL, kiesStem } from '../../../lib/basis/lichtkamer/les';

function synth(): SpeechSynthesis | null {
  try {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined' ? window.speechSynthesis : null;
  } catch {
    return null;
  }
}

function spreekUit(tekst: string): void {
  const s = synth();
  if (!s || !tekst.trim()) return;
  try {
    s.cancel();
    const u = new SpeechSynthesisUtterance(tekst);
    u.lang = VOORLEES_TAAL;
    u.rate = 0.95;
    const stem = kiesStem(s.getVoices());
    if (stem) u.voice = stem;
    s.speak(u);
  } catch {
    // Een stem die niet wil, mag de les niet breken.
  }
}

export function stopVoorlezen(): void {
  try {
    synth()?.cancel();
  } catch {
    // niets
  }
}

export interface Voorlezen {
  beschikbaar: boolean;
  aan: boolean;
  zetAan(aan: boolean): void;
  /** Leest voor als Voorlezen aan staat en het niet prikkelarm is (voor teksten die vanzelf komen). */
  leesVoor(tekst: string): void;
  /** 'Hoor het nog eens': leest altijd voor. */
  hoorNogEens(tekst: string): void;
}

export function useVoorlezen(prikkelarm: boolean, huidigeTekst: string): Voorlezen {
  const [beschikbaar] = useState(() => synth() !== null);
  const [aan, setAan] = useState(false);
  const laatste = useRef({ aan: false, prikkelarm, tekst: huidigeTekst });
  laatste.current = { aan, prikkelarm, tekst: huidigeTekst };

  useEffect(() => {
    if (prikkelarm) stopVoorlezen();
  }, [prikkelarm]);
  useEffect(() => stopVoorlezen, []);

  const zetAan = useCallback((nu: boolean) => {
    setAan(nu);
    if (nu) {
      // Net aangezet: lees meteen de tekst in beeld voor, behalve in de prikkelarme stand.
      if (!laatste.current.prikkelarm) spreekUit(laatste.current.tekst);
    } else stopVoorlezen();
  }, []);
  const leesVoor = useCallback((tekst: string) => {
    if (laatste.current.aan && !laatste.current.prikkelarm) spreekUit(tekst);
  }, []);
  const hoorNogEens = useCallback((tekst: string) => spreekUit(tekst), []);

  return { beschikbaar, aan, zetAan, leesVoor, hoorNogEens };
}
