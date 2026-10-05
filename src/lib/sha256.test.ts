import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from './sha256';

const node = (x: string | Uint8Array) => createHash('sha256').update(x).digest('hex');

describe('sha256Hex', () => {
  it('geeft de standaard testwaarden', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('rekent tekst als UTF-8, net als Node', () => {
    for (const t of ['De leerlingen situeren …', 'Ruimtelijk bewustzijn – “09.01”', 'ﬁ ligatuur en é', '😀']) {
      expect(sha256Hex(t)).toBe(node(t));
    }
  });

  it('klopt rond de blokgrenzen en voor bytes', () => {
    for (const n of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 1000, 70_000]) {
      const bytes = new Uint8Array(randomBytes(n));
      expect(sha256Hex(bytes), `lengte ${n}`).toBe(node(bytes));
      expect(sha256Hex('a'.repeat(n)), `tekst ${n}`).toBe(node('a'.repeat(n)));
    }
  });
});
