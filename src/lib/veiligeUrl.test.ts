import { describe, expect, it } from 'vitest';
import {
  isBestandUrl, isPassiefType, isSvgType, isWebUrl, kernType, NEUTRAAL_TYPE, passieveBlob, veiligBlobType, webUrl,
} from './veiligeUrl';

describe('isWebUrl / webUrl', () => {
  it('aanvaardt http(s), ook met hoofdletters en witruimte rond, en geeft de getrimde waarde', () => {
    expect(isWebUrl('https://example.org/werkblad.pdf')).toBe(true);
    expect(isWebUrl('http://example.org/a')).toBe(true);
    expect(isWebUrl('HTTPS://EXAMPLE.ORG/A.PDF')).toBe(true);
    expect(webUrl('  https://example.org/a.pdf \n')).toBe('https://example.org/a.pdf');
  });

  it('weigert javascript: in alle vermommingen', () => {
    for (const u of [
      'javascript:alert(1)',
      ' JaVaScRiPt:alert(1)',
      '\u0001javascript:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      ' javascript:alert(1)',
      'vbscript:msgbox(1)',
    ]) {
      expect(isWebUrl(u), JSON.stringify(u)).toBe(false);
    }
  });

  it('weigert data:, blob:, relatieve en half-geschreven adressen', () => {
    expect(isWebUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isWebUrl('data:application/pdf;base64,AAAA')).toBe(false);
    expect(isWebUrl('blob:https://example.org/123')).toBe(false);
    expect(isWebUrl('//example.org/a')).toBe(false);
    expect(isWebUrl('https:javascript:alert(1)')).toBe(false);
    expect(isWebUrl('example.org/a.pdf')).toBe(false);
    expect(isWebUrl('')).toBe(false);
    expect(isWebUrl(undefined)).toBe(false);
    expect(isWebUrl(42)).toBe(false);
  });

  it('weigert een http(s)-adres met controletekens erin', () => {
    expect(isWebUrl('https://exa\tmple.org/')).toBe(false);
    expect(isWebUrl('https://example.org/\u0000')).toBe(false);
    expect(isWebUrl('https://example.org/\u0085')).toBe(false);
  });
});

describe('isBestandUrl', () => {
  it('aanvaardt data: en blob:', () => {
    expect(isBestandUrl('data:application/pdf;base64,AAAA')).toBe(true);
    expect(isBestandUrl('blob:http://localhost/abc')).toBe(true);
  });

  it('weigert al de rest, ook javascript: en vermommingen van data:', () => {
    expect(isBestandUrl('javascript:alert(1)')).toBe(false);
    expect(isBestandUrl(' data:text/plain,x')).toBe(false);
    expect(isBestandUrl('DATA:text/plain,x')).toBe(false);
    expect(isBestandUrl('https://example.org/a.pdf')).toBe(false);
    expect(isBestandUrl('wfmedia:m_1')).toBe(false);
    expect(isBestandUrl(null)).toBe(false);
  });
});

describe('blobtypes', () => {
  it('kent de passieve types', () => {
    for (const t of ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'audio/webm', 'audio/mpeg', 'video/mp4', 'application/pdf', 'text/plain', 'TEXT/PLAIN; charset=utf-8']) {
      expect(isPassiefType(t), t).toBe(true);
    }
    for (const t of ['', 'text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/xml', 'application/xml', 'application/octet-stream', 'text/javascript', 'audio/x,text/html', 'multipart/x-mixed-replace']) {
      expect(isPassiefType(t), t).toBe(false);
    }
  });

  it('kernType en isSvgType negeren parameters en hoofdletters', () => {
    expect(kernType(' Image/SVG+XML ; charset=utf-8')).toBe('image/svg+xml');
    expect(isSvgType('image/svg+xml;charset=utf-8')).toBe(true);
    expect(isSvgType('image/png')).toBe(false);
  });

  it('veiligBlobType houdt alleen het kale passieve type over', () => {
    expect(veiligBlobType('image/png')).toBe('image/png');
    expect(veiligBlobType('text/plain;charset=utf-8')).toBe('text/plain');
    // een komma kan de browser als tweede (actief) type lezen
    expect(veiligBlobType('image/png;x=1,text/html')).toBe('image/png');
    expect(veiligBlobType('text/html')).toBe(NEUTRAAL_TYPE);
    expect(veiligBlobType('image/svg+xml')).toBe(NEUTRAAL_TYPE);
    expect(veiligBlobType('')).toBe(NEUTRAAL_TYPE);
  });

  it('passieveBlob houdt de bytes en kopieert niet als het type al klopt', async () => {
    const png = new Blob(['abc'], { type: 'image/png' });
    expect(passieveBlob(png)).toBe(png);
    const html = new Blob(['<script>x()</script>'], { type: 'text/html' });
    const veilig = passieveBlob(html);
    expect(veilig.type).toBe(NEUTRAAL_TYPE);
    expect(await veilig.text()).toBe('<script>x()</script>');
    expect(passieveBlob(new Blob(['x'])).type).toBe(NEUTRAAL_TYPE);
  });
});
