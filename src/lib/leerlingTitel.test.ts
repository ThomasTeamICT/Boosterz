import { describe, expect, it } from 'vitest';
import { titelVoorLeerling } from './leerlingTitel';

describe('titelVoorLeerling', () => {
  it('haalt "Voorbeeld:" en "Sjabloon:" van het begin van de titel', () => {
    expect(titelVoorLeerling('Voorbeeld: quiz over België')).toBe('quiz over België');
    expect(titelVoorLeerling('Sjabloon: werkblad')).toBe('werkblad');
    expect(titelVoorLeerling('  voorbeeld :  mindmap — de waterkringloop')).toBe('mindmap — de waterkringloop');
  });

  it('laat een gewone titel ongemoeid, ook als het woord midden in de titel staat', () => {
    expect(titelVoorLeerling('Quiz over België')).toBe('Quiz over België');
    expect(titelVoorLeerling('Een voorbeeld: dat telt niet')).toBe('Een voorbeeld: dat telt niet');
    expect(titelVoorLeerling('Voorbeelden van zinnen')).toBe('Voorbeelden van zinnen');
  });

  it('blijft er niets over, dan blijft de titel zoals ze is', () => {
    expect(titelVoorLeerling('Voorbeeld:')).toBe('Voorbeeld:');
    expect(titelVoorLeerling('')).toBe('');
  });

  it('kapotte invoer geeft een lege titel', () => {
    expect(titelVoorLeerling(undefined as unknown as string)).toBe('');
  });
});
