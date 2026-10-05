import { describe, expect, it } from 'vitest';
import { verwijzingUitleg } from './VerwijzingLabels';

describe('verborgen tekst bij een verwijzingslabel', () => {
  const ref = { set: 'ODS_3287', id: '107', code: '09.01' };

  it('"Verwijst naar minimumdoel 09.01", met de setnaam als die gekend is', () => {
    expect(verwijzingUitleg(ref)).toBe('Verwijst naar minimumdoel 09.01');
    expect(verwijzingUitleg(ref, 'Ruimtelijk bewustzijn')).toBe('Verwijst naar minimumdoel 09.01 (Ruimtelijk bewustzijn)');
  });

  it('noemt nooit het nummer van de set', () => {
    expect(verwijzingUitleg(ref)).not.toMatch(/ODS_/);
    expect(verwijzingUitleg(ref, 'Ruimtelijk bewustzijn')).not.toMatch(/ODS_/);
  });

  it('een lege of witte naam telt als niet gekend', () => {
    expect(verwijzingUitleg(ref, '')).toBe('Verwijst naar minimumdoel 09.01');
    expect(verwijzingUitleg(ref, '   ')).toBe('Verwijst naar minimumdoel 09.01');
  });
});
