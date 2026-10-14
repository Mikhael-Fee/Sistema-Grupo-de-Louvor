import { describe, expect, it } from 'vitest';
import { calendarDays, calendarMonthLabel, ministryToday, shiftCalendarMonth } from './service-calendar';

describe('datas do calendário do ministério', () => {
  it('usa o dia de São Paulo mesmo quando o UTC já mudou de dia, mês ou ano', () => {
    expect(ministryToday(new Date('2027-01-01T01:30:00Z'))).toBe('2026-12-31');
    expect(ministryToday(new Date('2026-11-01T03:01:00Z'))).toBe('2026-11-01');
    expect(ministryToday(new Date('2026-11-01T02:59:00Z'))).toBe('2026-10-31');
  });

  it('navega de dezembro para janeiro e de janeiro para dezembro sem alterar o dia', () => {
    expect(shiftCalendarMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftCalendarMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftCalendarMonth('2026-01', 12)).toBe('2027-01');
  });

  it('inclui o dia 29 de fevereiro apenas em anos bissextos', () => {
    expect(calendarDays('2028-02').filter(day => day.inMonth)).toHaveLength(29);
    expect(calendarDays('2027-02').filter(day => day.inMonth)).toHaveLength(28);
    expect(calendarDays('2028-02').find(day => day.date === '2028-02-29')).toMatchObject({ day: 29, inMonth: true });
    expect(calendarDays('2027-02').find(day => day.date === '2027-02-29')).toBeUndefined();
  });

  it('produz seis semanas inteiras sem duplicar datas e começando no domingo', () => {
    const days = calendarDays('2026-10');
    expect(days).toHaveLength(42);
    expect(new Set(days.map(day => day.date)).size).toBe(42);
    expect(days[0].date).toBe('2026-09-27');
    expect(days.at(-1)?.date).toBe('2026-11-07');
    expect(days.filter(day => day.inMonth)).toHaveLength(31);
    for (let index = 1; index < days.length; index++) {
      expect(new Date(`${days[index].date}T12:00:00Z`).getTime() - new Date(`${days[index - 1].date}T12:00:00Z`).getTime()).toBe(86_400_000);
    }
  });

  it('preserva o domingo inicial em um mês que começa no domingo', () => {
    expect(calendarDays('2026-11')[0]).toEqual({ date: '2026-11-01', day: 1, inMonth: true });
  });

  it('mostra o mês e ano em português e rejeita mês inválido', () => {
    expect(calendarMonthLabel('2026-10')).toBe('outubro de 2026');
    for (const invalid of ['2026-00', '2026-13', '2026-1', 'not-a-month']) expect(() => calendarDays(invalid)).toThrow('Mês inválido.');
    expect(() => shiftCalendarMonth('2026-10', 0.5)).toThrow('Deslocamento de mês inválido.');
  });
});
