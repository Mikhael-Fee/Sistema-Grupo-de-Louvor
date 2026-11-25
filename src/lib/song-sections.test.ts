import { describe, expect, it } from 'vitest';
import { sectionLabel } from './song-sections';

describe('partes da música', () => {
  it('reconhece marcações entre colchetes do Cifra Club, com acordes na mesma linha', () => {
    expect(sectionLabel('[Refrão]')).toEqual({ label: 'Refrão', rest: '' });
    expect(sectionLabel('  [Primeira Parte]  ')).toEqual({ label: 'Primeira Parte', rest: '' });
    expect(sectionLabel('[Intro] [C]  [G/B]  [Am]')).toEqual({ label: 'Intro', rest: '[C]  [G/B]  [Am]' });
    expect(sectionLabel('[Solo 2x]')).toEqual({ label: 'Solo 2x', rest: '' });
  });
  it('reconhece nomes de partes escritos sozinhos na linha', () => {
    expect(sectionLabel('Refrão:')).toEqual({ label: 'Refrão', rest: '' });
    expect(sectionLabel('VERSO 2')).toEqual({ label: 'VERSO 2', rest: '' });
    expect(sectionLabel('Pré-refrão')).toEqual({ label: 'Pré-refrão', rest: '' });
  });
  it('não confunde acordes nem letra com partes', () => {
    expect(sectionLabel('[C]Já [G/B]está aqui')).toBeNull();
    expect(sectionLabel('[Am]')).toBeNull();
    expect(sectionLabel('[Bb7(9)]')).toBeNull();
    expect(sectionLabel('Ponte que nos leva ao céu')).toBeNull();
    expect(sectionLabel('Final de tarde')).toBeNull();
    expect(sectionLabel('')).toBeNull();
    expect(sectionLabel('[Isso é uma frase longa demais para ser só o nome de uma parte da música]')).toBeNull();
  });
});
