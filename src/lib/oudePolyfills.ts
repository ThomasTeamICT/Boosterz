// Terugvallen voor Safari en iPadOS 14, die een paar kleine functies missen die pdf.js gebruikt: at() op lijsten en
// tekst, Object.hasOwn en structuredClone. Elke terugval komt er alleen als de functie ontbreekt, dus nieuwere
// browsers merken niets. Wordt alleen geladen voor pdf.js op een toestel dat de moderne pdf-worker niet kan lezen.

function zetAt(proto: object): void {
  if (typeof (proto as { at?: unknown }).at === 'function') return;
  Object.defineProperty(proto, 'at', {
    configurable: true,
    writable: true,
    value: function at(this: ArrayLike<unknown>, index: number): unknown {
      const lengte = this.length >>> 0;
      let i = Math.trunc(Number(index)) || 0;
      if (i < 0) i += lengte;
      return i < 0 || i >= lengte ? undefined : this[i];
    },
  });
}

/** Een eenvoudige diepe kopie: genoeg voor wat pdf.js doorgeeft (objecten, lijsten, typed arrays, Map, Set, Date). */
function eenvoudigeKopie<T>(waarde: T, gezien = new Map<unknown, unknown>()): T {
  if (waarde === null || typeof waarde !== 'object') return waarde;
  if (gezien.has(waarde)) return gezien.get(waarde) as T;
  if (ArrayBuffer.isView(waarde)) {
    const view = waarde as unknown as { buffer: ArrayBuffer; byteOffset: number; byteLength: number; constructor: new (b: ArrayBuffer) => unknown };
    return new view.constructor(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)) as T;
  }
  if (waarde instanceof ArrayBuffer) return waarde.slice(0) as T;
  if (waarde instanceof Date) return new Date(waarde.getTime()) as T;
  if (waarde instanceof Map) {
    const kopie = new Map();
    gezien.set(waarde, kopie);
    waarde.forEach((v, k) => kopie.set(eenvoudigeKopie(k, gezien), eenvoudigeKopie(v, gezien)));
    return kopie as T;
  }
  if (waarde instanceof Set) {
    const kopie = new Set();
    gezien.set(waarde, kopie);
    waarde.forEach((v) => kopie.add(eenvoudigeKopie(v, gezien)));
    return kopie as T;
  }
  const kopie: Record<string, unknown> | unknown[] = Array.isArray(waarde) ? [] : {};
  gezien.set(waarde, kopie);
  for (const sleutel of Object.keys(waarde)) {
    (kopie as Record<string, unknown>)[sleutel] = eenvoudigeKopie((waarde as Record<string, unknown>)[sleutel], gezien);
  }
  return kopie as T;
}

export function vulPolyfillsAan(): void {
  zetAt(Array.prototype);
  zetAt(String.prototype);
  const typed = Object.getPrototypeOf(Uint8Array.prototype) as object | null;
  if (typed) zetAt(typed);
  if (typeof (Object as { hasOwn?: unknown }).hasOwn !== 'function') {
    Object.defineProperty(Object, 'hasOwn', {
      configurable: true,
      writable: true,
      value: (o: object, sleutel: PropertyKey) => Object.prototype.hasOwnProperty.call(o, sleutel),
    });
  }
  const g = globalThis as { structuredClone?: unknown };
  if (typeof g.structuredClone !== 'function') g.structuredClone = (v: unknown) => eenvoudigeKopie(v);
}
