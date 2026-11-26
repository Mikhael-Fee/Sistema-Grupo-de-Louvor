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

/**
 * Counts answers. Someone who has not answered but marked the date as unavailable
 * already said they cannot serve, so they count as "não poderão", not "aguardando".
 */
export function presenceSummary(
  assignments: Assignment[],
  isUnavailable: (personId: string) => boolean = () => false,
): { confirmed: number; declined: number; pending: number } {
  const shown = (item: Assignment): AssignmentStatus => {
    const status = item.status ?? 'pending';
    return status === 'pending' && isUnavailable(item.personId) ? 'declined' : status;
  };
  const count = (status: AssignmentStatus) => assignments.filter(item => shown(item) === status).length;
  return { confirmed: count('confirmed'), declined: count('declined'), pending: count('pending') };
}

/** Upcoming unavailable dates of one person, soonest first. */
export function upcomingUnavailability(data: Pick<MinistryData, 'unavailability'>, personId: string, today: string): Unavailability[] {
  return (data.unavailability ?? [])
    .filter(item => item.personId === personId && item.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
}
