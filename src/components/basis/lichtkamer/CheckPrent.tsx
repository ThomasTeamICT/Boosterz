// De prenten bij de antwoorden van de check (4c1 en 4c3), uit het prototype. Ze staan er voor wie ze ziet; de keuze
// zelf heeft een tekst (en een label voor de schermlezer), dus de prent is versiering (aria-hidden).

import type { ReactElement } from 'react';

const LAMP = (x: number, y: number) => (
  <g transform={`translate(${x} ${y})`}>
    <rect x="-14" y="-7" width="22" height="14" rx="3" fill="#2b5bd0" />
    <path d="M8 -10 L16 -12 L16 12 L8 10 Z" fill="#22324f" />
    <circle cx="19" cy="0" r="3" fill="#ffc53d" />
  </g>
);

const KAARTEN = (
  <>
    <rect x="60" y="10" width="6" height="100" fill="#9aa4bd" />
    <rect x="100" y="10" width="6" height="100" fill="#9aa4bd" />
    <rect x="140" y="10" width="6" height="100" fill="#9aa4bd" />
    <rect x="186" y="5" width="8" height="110" fill="#c9cfdd" />
  </>
);

/** Van boven gezien: de zaklamp links voor het boompje, de schaduw op het scherm (links, recht achter of rechts). */
function boven(x: number, letter: string): ReactElement {
  return (
    <>
      <rect x="10" y="10" width="180" height="8" fill="#9aa4bd" />
      <circle cx="100" cy="60" r="7" fill="#3f9a5b" />
      {LAMP(40, 100)}
      <rect x={x} y="8" width="34" height="12" fill="#16203a" opacity=".6" />
      <text x={x + 17} y="36" fontSize="16" textAnchor="middle" fill="#16203a">
        {letter}
      </text>
    </>
  );
}

/** Van opzij gezien: drie kaartjes met een gaatje op de hoogtes y1 (bij de lamp), y2 en y3 (bij het scherm). */
function opzij(y1: number, y2: number, y3: number): ReactElement {
  return (
    <>
      {LAMP(22, 40)}
      {KAARTEN}
      <rect x="59" y={y1} width="8" height="10" fill="#fff" />
      <rect x="99" y={y2} width="8" height="10" fill="#fff" />
      <rect x="139" y={y3} width="8" height="10" fill="#fff" />
    </>
  );
}

const PRENTEN: Readonly<Record<string, readonly ReactElement[]>> = {
  '4c1': [boven(30, 'A'), boven(83, 'B'), boven(136, 'C')],
  '4c3': [opzij(45, 63, 81), opzij(81, 81, 81), opzij(35, 75, 35)],
};

/** De prent bij antwoord `i` van vraag `vraagId`, of niets als die vraag geen prenten heeft (4c2). */
export function CheckPrent({ vraagId, i }: { vraagId: string; i: number }) {
  const inhoud = PRENTEN[vraagId]?.[i];
  if (!inhoud) return null;
  return (
    <span className="b-lk-prent">
      <svg viewBox="0 0 200 120" aria-hidden="true" focusable="false">
        {inhoud}
      </svg>
    </span>
  );
}
