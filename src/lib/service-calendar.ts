/** Calendar dates stay as YYYY-MM-DD strings, including across timezone and year boundaries. */
export interface ServiceCalendarDay { date: string; day: number; inMonth: boolean }

export function ministryToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const isoDate = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

function monthStart(month: string): Date {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) throw new Error('Mês inválido.');
  const [year, number] = month.split('-').map(Number);
  const date = new Date(0);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCFullYear(year, number - 1, 1);
  return date;
}

export function shiftCalendarMonth(month: string, amount: number): string {
  if (!Number.isInteger(amount)) throw new Error('Deslocamento de mês inválido.');
  const date = monthStart(month);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return isoDate(date).slice(0, 7);
}

/** Six full weeks, starting on Sunday, keep navigation stable on small screens. */
export function calendarDays(month: string): ServiceCalendarDay[] {
  const start = monthStart(month);
  start.setUTCDate(1 - start.getUTCDay());
  return Array.from({ length: 42 }, (_, offset) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + offset);
    const value = isoDate(date);
    return { date: value, day: date.getUTCDate(), inMonth: value.slice(0, 7) === month };
  });
}

export function calendarMonthLabel(month: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(monthStart(month));
}
