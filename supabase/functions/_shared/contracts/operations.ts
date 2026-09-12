import { z } from 'zod';
import { ServiceSchema } from './service.ts';
export { serviceLabels } from './service.ts';

export const LeadIdSchema = z.uuid().brand<'LeadId'>();
export const StaffIdSchema = z.uuid().brand<'StaffId'>();
export const EventIdSchema = z.uuid().brand<'EventId'>();
export const CommandIdSchema = z.uuid().brand<'CommandId'>();
export const AppointmentIdSchema = z.uuid().brand<'AppointmentId'>();
export const AppointmentInstantSchema = z.iso
  .datetime({ offset: true })
  .refine((value) => {
    const year = new Date(value).getUTCFullYear();
    return year >= 2020 && year <= 2100;
  }, 'Vælg en dato mellem 2020 og 2100.')
  .brand<'AppointmentInstant'>();
const appointmentFields = {
  title: z.string().trim().min(3).max(160),
  location: z.string().trim().max(300),
  startsAt: AppointmentInstantSchema,
  endsAt: AppointmentInstantSchema,
};
function validAppointmentRange(value: { startsAt: string; endsAt: string }) {
  const duration = Date.parse(value.endsAt) - Date.parse(value.startsAt);
  return duration >= 60000 && duration <= 24 * 60 * 60000;
}
export const AppointmentInputSchema = z
  .strictObject(appointmentFields)
  .refine(
    validAppointmentRange,
    'Aftalen skal vare mellem 1 minut og 24 timer.',
  );
export const AppointmentSchema = z.object({
  id: AppointmentIdSchema,
  lead_id: LeadIdSchema,
  title: z.string(),
  location: z.string(),
  starts_at: AppointmentInstantSchema,
  ends_at: AppointmentInstantSchema,
  time_zone: z.literal('Europe/Copenhagen'),
  state: z.enum(['booked', 'cancelled']),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  lead: z.object({ name: z.string(), postal_code: z.string() }).optional(),
});
export type Appointment = z.infer<typeof AppointmentSchema>;
export type AppointmentId = z.infer<typeof AppointmentIdSchema>;
export const LeadVersionSchema = z
  .number()
  .int()
  .positive()
  .max(2147483647)
  .brand<'LeadVersion'>();
export const LeadStatusSchema = z.enum([
  'new',
  'clarifying',
  'qualified',
  'scheduled',
  'completed',
  'invoiced',
  'paid',
  'rejected',
  'outside_scope',
  'cancelled',
]);
export const WaitingOnSchema = z.enum(['staff', 'customer']).nullable();
export const ReviewDecisionSchema = z.enum(['pending', 'approved', 'declined']);
export const StaffSchema = z.object({
  user_id: StaffIdSchema,
  display_name: z.string().min(1),
  active: z.boolean(),
  role: z.enum(['backoffice', 'technical']),
});
export const OperationsLeadSchema = z.object({
  id: LeadIdSchema,
  reference: z.uuid(),
  name: z.string(),
  email: z.email(),
  phone: z.string(),
  postal_code: z.string().regex(/^\d{4}$/),
  service: ServiceSchema,
  description: z.string(),
  status: LeadStatusSchema,
  version: LeadVersionSchema,
  waiting_on: WaitingOnSchema,
  review_decision: ReviewDecisionSchema,
  review_summary: z.string().nullable(),
  reviewed_by: StaffIdSchema.nullable(),
  reviewed_at: z.iso.datetime({ offset: true }).nullable(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});
export const LeadEventSchema = z.object({
  id: EventIdSchema,
  lead_id: LeadIdSchema,
  event_type: z.enum([
    'lead_created',
    'status_changed',
    'review_recorded',
    'waiting_changed',
    'note_added',
    'appointment_created',
    'appointment_rescheduled',
    'appointment_cancelled',
  ]),
  actor_type: z.enum(['system', 'staff']),
  actor_id: StaffIdSchema.nullable(),
  actor_name: z.string().nullable(),
  lead_version: LeadVersionSchema,
  from_status: LeadStatusSchema.nullable(),
  to_status: LeadStatusSchema.nullable(),
  body: z.string().nullable(),
  details: z.record(z.string(), z.unknown()),
  created_at: z.iso.datetime({ offset: true }),
});
const commandBase = {
  leadId: LeadIdSchema,
  expectedVersion: LeadVersionSchema,
  commandId: CommandIdSchema,
};
export const StaffCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...commandBase,
    kind: z.literal('status'),
    status: LeadStatusSchema,
    reason: z.string().trim().max(1000),
  }),
  z.strictObject({
    ...commandBase,
    kind: z.literal('waiting'),
    waitingOn: WaitingOnSchema,
  }),
  z.strictObject({
    ...commandBase,
    kind: z.literal('review'),
    decision: z.enum(['approved', 'declined']),
    summary: z.string().trim().min(10).max(2000),
  }),
  z.strictObject({
    ...commandBase,
    kind: z.literal('note'),
    body: z.string().trim().min(3).max(3000),
  }),
  z
    .strictObject({
      ...commandBase,
      kind: z.literal('appointment_create'),
      ...appointmentFields,
    })
    .refine(validAppointmentRange),
  z
    .strictObject({
      ...commandBase,
      kind: z.literal('appointment_reschedule'),
      appointmentId: AppointmentIdSchema,
      ...appointmentFields,
      reason: z.string().trim().min(3).max(1000),
    })
    .refine(validAppointmentRange),
  z.strictObject({
    ...commandBase,
    kind: z.literal('appointment_cancel'),
    appointmentId: AppointmentIdSchema,
    reason: z.string().trim().min(3).max(1000),
  }),
]);
export const CommandReceiptSchema = z.strictObject({
  leadId: LeadIdSchema,
  version: LeadVersionSchema,
  eventId: EventIdSchema,
});
export type LeadId = z.infer<typeof LeadIdSchema>;
export type LeadStatus = z.infer<typeof LeadStatusSchema>;
export type OperationsLead = z.infer<typeof OperationsLeadSchema>;
export type LeadEvent = z.infer<typeof LeadEventSchema>;
export type Staff = z.infer<typeof StaffSchema>;
export type StaffCommand = z.infer<typeof StaffCommandSchema>;
export type CommandReceipt = z.infer<typeof CommandReceiptSchema>;

export const statusLabels: Record<LeadStatus, string> = {
  new: 'Nye henvendelser',
  clarifying: 'Afklaring',
  qualified: 'Klar til aftale',
  scheduled: 'Aftaler',
  completed: 'Udført',
  invoiced: 'Faktureret',
  paid: 'Betalt',
  rejected: 'Afvist',
  outside_scope: 'Uden for rammerne',
  cancelled: 'Annulleret',
};
export const pipelineStatuses: LeadStatus[] = [
  'new',
  'clarifying',
  'qualified',
  'scheduled',
  'completed',
  'invoiced',
  'paid',
];
export const archiveStatuses: LeadStatus[] = [
  'rejected',
  'outside_scope',
  'cancelled',
];

/** UI guidance only. PostgreSQL is authoritative for transitions and review prerequisites. */
export function availableTransitions(lead: OperationsLead): LeadStatus[] {
  const archive: LeadStatus[] = ['rejected', 'outside_scope', 'cancelled'];
  const qualify: LeadStatus[] =
    lead.review_decision === 'approved' ? ['qualified'] : [];
  switch (lead.status) {
    case 'new':
      return ['clarifying', ...qualify, ...archive];
    case 'clarifying':
      return ['new', ...qualify, ...archive];
    case 'qualified':
      return ['clarifying', ...archive];
    case 'scheduled':
      return ['cancelled']; // Use the explicit appointment cancellation action to return to clarification.
    case 'rejected':
    case 'outside_scope':
    case 'cancelled':
      return ['clarifying'];
    default:
      return [];
  }
}
