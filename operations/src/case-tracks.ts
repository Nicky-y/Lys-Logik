import type { LeadStatus } from '../../supabase/functions/_shared/contracts/operations.ts';

/** Presentation groups only; changing a track never changes a case's saved status. */
export const caseTracks = {
  planning: {
    label: 'Afklaring og aftaler',
    description: 'Fra den første dialog til opgaven er aftalt med kunden.',
    statuses: ['clarifying', 'qualified', 'scheduled'],
  },
  settlement: {
    label: 'Udført og betaling',
    description: 'Følg de udførte opgaver frem til fakturering og betaling.',
    statuses: ['completed', 'invoiced', 'paid'],
  },
} as const satisfies Record<
  string,
  { label: string; description: string; statuses: readonly LeadStatus[] }
>;

export type CaseTrack = keyof typeof caseTracks;

/** Inbox and archived cases do not belong to either active track. */
export function caseTrackForStatus(status: LeadStatus): CaseTrack | undefined {
  for (const track of ['planning', 'settlement'] as const) {
    const statuses: readonly LeadStatus[] = caseTracks[track].statuses;
    if (statuses.includes(status)) return track;
  }
  return undefined;
}
