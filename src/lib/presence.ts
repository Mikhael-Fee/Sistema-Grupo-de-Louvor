import type { Assignment, AssignmentStatus, MinistryData, Unavailability } from '../types';

export const STATUS_LABELS: Record<AssignmentStatus, string> = {
  pending: 'Aguardando resposta',
  confirmed: 'Confirmado',
  declined: 'Não poderá',
};

/** The date a person marked as unavailable, if any. */
export function unavailableOn(data: Pick<MinistryData, 'unavailability'>, personId: string, date: string): Unavailability | undefined {
  return data.unavailability?.find(item => item.personId === personId && item.date === date);
}

export function presenceSummary(assignments: Assignment[]): { confirmed: number; declined: number; pending: number } {
  const count = (status: AssignmentStatus) => assignments.filter(item => (item.status ?? 'pending') === status).length;
  return { confirmed: count('confirmed'), declined: count('declined'), pending: count('pending') };
}

/** Upcoming unavailable dates of one person, soonest first. */
export function upcomingUnavailability(data: Pick<MinistryData, 'unavailability'>, personId: string, today: string): Unavailability[] {
  return (data.unavailability ?? [])
    .filter(item => item.personId === personId && item.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
}
