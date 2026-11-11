// De terugvallen voor pdf.js op Safari en iPadOS 14: ze komen er alleen als de functie ontbreekt, en doen wat de echte doet.
import { afterEach, describe, expect, it } from 'vitest';
import { vulPolyfillsAan } from './oudePolyfills';
import { kanModerneSyntaxis } from './pdfWorker';

type Open = Record<string, unknown>;
// De typebibliotheek van het project (es2020) kent at() en hasOwn nog niet: precies waarom ze hier getest worden.
type Nieuw = { at(i: number): unknown };
const met = (v: unknown) => v as Nieuw;
const hasOwn = (o: object, k: string) => (Object as unknown as { hasOwn(o: object, k: string): boolean }).hasOwn(o, k);
const typed = Object.getPrototypeOf(Uint8Array.prototype) as Open;
const origineel = {
  arrayAt: (Array.prototype as unknown as Open).at, stringAt: (String.prototype as unknown as Open).at, typedAt: typed.at,
  hasOwn: (Object as unknown as Open).hasOwn, structuredClone: globalThis.structuredClone,
};
afterEach(() => {
  Object.defineProperty(Array.prototype, 'at', { value: origineel.arrayAt, configurable: true, writable: true });
  Object.defineProperty(String.prototype, 'at', { value: origineel.stringAt, configurable: true, writable: true });
  Object.defineProperty(typed, 'at', { value: origineel.typedAt, configurable: true, writable: true });
  Object.defineProperty(Object, 'hasOwn', { value: origineel.hasOwn, configurable: true, writable: true });
  globalThis.structuredClone = origineel.structuredClone;
});

function haalWeg() {
  delete (Array.prototype as unknown as Open).at;
  delete (String.prototype as unknown as Open).at;
  delete typed.at;
  delete (Object as unknown as Open).hasOwn;
  delete (globalThis as unknown as Open).structuredClone;
}

describe('oude polyfills', () => {
  it('zet at() op lijsten, tekst en typed arrays, met negatieve indexen', () => {
    haalWeg();
    expect(typeof met([]).at).toBe('undefined');
    vulPolyfillsAan();
    expect(met([1, 2, 3]).at(-1)).toBe(3);
    expect(met([1, 2, 3]).at(0)).toBe(1);
    expect(met([1, 2, 3]).at(5)).toBeUndefined();
    expect(met('abc').at(-2)).toBe('b');
    expect(met(new Uint8Array([7, 8, 9])).at(-1)).toBe(9);
  });

  it('zet Object.hasOwn', () => {
    haalWeg();
    vulPolyfillsAan();
    expect(hasOwn({ a: 1 }, 'a')).toBe(true);
    expect(hasOwn({ a: 1 }, 'toString')).toBe(false);
  });

  it('zet een structuredClone die diep kopieert, ook typed arrays, Map en Set', () => {
    haalWeg();
    vulPolyfillsAan();
    const bron = { a: [1, { b: 2 }], bytes: new Uint8Array([1, 2, 3]), m: new Map([['k', 1]]), s: new Set([1]) };
    const kopie = structuredClone(bron);
    expect(kopie).toEqual(bron);
    expect(kopie.a).not.toBe(bron.a);
    expect(kopie.bytes).not.toBe(bron.bytes);
    expect(kopie.bytes.buffer).not.toBe(bron.bytes.buffer);
  });

  it('laat de echte functies staan als ze er zijn', () => {
    const at = (Array.prototype as unknown as Open).at;
    const kloon = globalThis.structuredClone;
    vulPolyfillsAan();
    expect((Array.prototype as unknown as Open).at).toBe(at);
    expect(globalThis.structuredClone).toBe(kloon);
  });

  it('kanModerneSyntaxis zegt ja in een moderne omgeving, zonder eval', () => {
    expect(kanModerneSyntaxis()).toBe(true);
  });

  it('kanModerneSyntaxis zegt nee zonder isWellFormed, en blijft nee na de polyfills', () => {
    const proto = String.prototype as unknown as Open;
    const echt = proto.isWellFormed;
    try {
      delete proto.isWellFormed;
      expect(kanModerneSyntaxis()).toBe(false);
      haalWeg();
      vulPolyfillsAan();
      expect(kanModerneSyntaxis()).toBe(false);
    } finally {
      if (echt) Object.defineProperty(String.prototype, 'isWellFormed', { value: echt, configurable: true, writable: true });
    }
  });
});
