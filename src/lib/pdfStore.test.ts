import { describe, expect, it } from 'vitest';
import { pdfDataUrlToBlob } from './pdfStore';

describe('pdfDataUrlToBlob (pdf uit een cursusbestand terugzetten, CU4)', () => {
  it('maakt een pdf-blob van een pdf-data-URL', async () => {
    const blob = pdfDataUrlToBlob('data:application/pdf;base64,' + btoa('%PDF-1.4\n'))!;
    expect(blob.type).toBe('application/pdf');
    expect(await blob.text()).toBe('%PDF-1.4\n');
  });

  it('weigert al de rest', () => {
    expect(pdfDataUrlToBlob('data:text/html;base64,PHNjcmlwdD4=')).toBeNull();
    expect(pdfDataUrlToBlob('https://example.org/a.pdf')).toBeNull();
    expect(pdfDataUrlToBlob('data:application/pdf;base64,***')).toBeNull();
    expect(pdfDataUrlToBlob(undefined as unknown as string)).toBeNull();
  });
});
