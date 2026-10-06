import { describe, expect, it } from 'vitest';
import { newWidgetTitle, WIDGET_TYPES } from './registry';

describe('newWidgetTitle', () => {
  it('geeft het-woorden "Nieuw" en de-woorden "Nieuwe"', () => {
    expect(newWidgetTitle('worksheet')).toBe('Nieuw werkblad');
    expect(newWidgetTitle('hangman')).toBe('Nieuw galgje');
    expect(newWidgetTitle('crossword')).toBe('Nieuw kruiswoordraadsel');
    expect(newWidgetTitle('whiteboard')).toBe('Nieuw whiteboard');
    expect(newWidgetTitle('spinner')).toBe('Nieuw rad van fortuin');
    expect(newWidgetTitle('quiz')).toBe('Nieuwe quiz');
    expect(newWidgetTitle('wordsearch')).toBe('Nieuwe woordzoeker');
  });
  it('zegt "Nieuw spel: zoek de verschillen" in plaats van "Nieuwe zoek de verschillen"', () => {
    expect(newWidgetTitle('spotdifference')).toBe('Nieuw spel: zoek de verschillen');
  });
  it('geeft elke widgetsoort een titel', () => {
    for (const t of WIDGET_TYPES) expect(newWidgetTitle(t.id)).toMatch(/^Nieuw/);
  });
});
