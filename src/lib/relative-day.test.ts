import { describe, expect, it } from 'vitest';
import { relativeDay } from '../pages/ServicesPage';

describe('rótulo de proximidade na lista de cultos', () => {
  it('diz hoje, amanhã e em N dias nas próximas duas semanas', () => {
    expect(relativeDay('2026-11-26', '2026-11-26')).toBe('Hoje');
    expect(relativeDay('2026-11-27', '2026-11-26')).toBe('Amanhã');
    expect(relativeDay('2026-11-29', '2026-11-26')).toBe('Em 3 dias');
    expect(relativeDay('2026-12-10', '2026-11-26')).toBe('Em 14 dias');
  });
  it('não mostra nada depois de duas semanas nem para datas passadas', () => {
    expect(relativeDay('2026-12-11', '2026-11-26')).toBe('');
    expect(relativeDay('2026-11-25', '2026-11-26')).toBe('');
  });
});
