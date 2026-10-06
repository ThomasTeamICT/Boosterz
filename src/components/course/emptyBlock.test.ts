import { describe, expect, it } from 'vitest';
import type { CourseBlock, CourseBlockType } from '../../lib/courseTypes';
import { makeBlock } from '../../lib/courses';
import { isEmptyBlock, leerlingBlokken } from './emptyBlock';

describe('isEmptyBlock', () => {
  it('ziet een vers toegevoegd blok zonder inhoud als leeg', () => {
    const leeg: CourseBlockType[] = [
      'text', 'image', 'video', 'audio', 'pdf', 'embed', 'callout', 'quote', 'attachment',
      'columns', 'table', 'terms', 'checklist', 'widget',
    ];
    for (const type of leeg) {
      expect(isEmptyBlock(makeBlock(type)), type).toBe(true);
    }
  });

  it('laat een scheidingslijn en een kop met tekst staan', () => {
    expect(isEmptyBlock(makeBlock('divider'))).toBe(false);
    expect(isEmptyBlock(makeBlock('heading'))).toBe(false); // "Nieuwe kop"
    expect(isEmptyBlock({ id: 'h', type: 'heading', text: '   ', level: 2 })).toBe(true);
  });

  it('telt alleen spaties of nieuwe regels als leeg', () => {
    expect(isEmptyBlock({ id: 't', type: 'text', markdown: ' \n  ' })).toBe(true);
    expect(isEmptyBlock({ id: 't', type: 'text', markdown: 'Hallo' })).toBe(false);
  });

  it('laat een blok met inhoud staan', () => {
    const vol: CourseBlock[] = [
      { id: '1', type: 'image', url: 'https://example.com/a.png', size: 'normal' },
      { id: '2', type: 'video', url: 'https://youtu.be/abcdefghijk' },
      { id: '3', type: 'audio', url: 'blob:x' },
      { id: '4', type: 'pdf', pdfId: 'p1', height: 560 },
      { id: '5', type: 'pdf', url: 'https://example.com/a.pdf', height: 560 },
      { id: '6', type: 'embed', url: 'https://example.com', height: 420 },
      { id: '7', type: 'callout', kind: 'tip', text: '', title: 'Let op' },
      { id: '8', type: 'quote', text: 'Wat je zaait, zal je oogsten.' },
      { id: '9', type: 'attachment', name: 'werkblad.pdf', dataUrl: '' },
      { id: '10', type: 'columns', left: '', right: 'rechts' },
      { id: '11', type: 'table', header: true, rows: [['', ''], ['', 'x']] },
      { id: '12', type: 'terms', items: [{ id: 'a', term: 'kracht', uitleg: '' }] },
      { id: '13', type: 'checklist', items: [{ id: 'a', text: '' }, { id: 'b', text: 'Klaar' }] },
      { id: '14', type: 'accordion', items: [{ id: 'a', title: 'Onderdeel', text: '' }] },
      { id: '15', type: 'widget', widgetId: 'w1' },
    ];
    for (const b of vol) expect(isEmptyBlock(b), b.type).toBe(false);
  });

  it('beschouwt een oefening die niet op dit toestel staat niet als leeg', () => {
    // het id is ingevuld: de melding "vraag je leerkracht om een nieuwe link" klopt dan
    expect(isEmptyBlock({ id: 'w', type: 'widget', widgetId: 'bestaat-niet' })).toBe(false);
  });

  it('houdt een kapot blok (ontbrekende lijst) uit de crash', () => {
    const kapot = { id: 'x', type: 'terms' } as unknown as CourseBlock;
    expect(() => isEmptyBlock(kapot)).not.toThrow();
  });
});

describe('leerlingBlokken', () => {
  it('filtert de lege blokken weg en behoudt de volgorde', () => {
    const blocks: CourseBlock[] = [
      { id: 'a', type: 'text', markdown: 'Eerste' },
      makeBlock('image'),
      { id: 'b', type: 'text', markdown: 'Tweede' },
      makeBlock('widget'),
    ];
    expect(leerlingBlokken(blocks).map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('geeft een lege lijst als er niets overblijft', () => {
    expect(leerlingBlokken([makeBlock('text'), makeBlock('widget')])).toEqual([]);
  });
});
