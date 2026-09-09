import { randomId } from './random-id';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  OperationsLeadSchema,
  LeadEventSchema,
  StaffCommandSchema,
  CommandReceiptSchema,
  type OperationsLead,
  type LeadId,
  type LeadEvent,
  type StaffCommand,
  type CommandReceipt,
  AppointmentSchema,
  type Appointment,
} from '../../supabase/functions/_shared/contracts/operations.ts';

export interface OperationsGateway {
  list(offset: number): Promise<{ items: OperationsLead[]; hasMore: boolean }>;
  lead(id: LeadId): Promise<OperationsLead>;
  history(id: LeadId): Promise<LeadEvent[]>;
  appointment(id: LeadId): Promise<Appointment | null>;
  calendar(
    from: string,
    to: string,
    offset: number,
  ): Promise<{ items: Appointment[]; hasMore: boolean }>;
  execute(command: StaffCommand): Promise<CommandReceipt>;
}
export class OperationsError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const messages: Record<string, string> = {
  lead_version_conflict:
    'Sagen er ændret af en anden. Hent den seneste version, gennemgå ændringerne og prøv igen.',
  command_conflict:
    'Denne handling har allerede andet indhold. Hent sagen igen.',
  staff_required:
    'Din medarbejderadgang er ikke aktiv. Log ud og kontakt administratoren.',
  reviewer_required: 'En faglig medarbejder skal registrere denne vurdering.',
  review_required:
    'Gem en faglig godkendelse, før sagen flyttes til Klar til aftale.',
  reason_required:
    'Skriv en kort begrundelse for at arkivere eller genåbne sagen.',
  appointment_required: 'Der skal først oprettes en kalenderaftale.',
  appointment_qualification_required:
    'Sagen skal være fagligt godkendt og stå som Klar til aftale.',
  appointment_not_found:
    'Aftalen er ikke længere aktiv på denne sag. Hent sagen igen.',
  invalid_appointment_time:
    'Kontrollér dato og tid. Aftalen skal vare mellem 1 minut og 24 timer.',
  invalid_appointment:
    'Skriv en kort aftaletitel og højst 300 tegn i stedfeltet.',
  no_change:
    'Aftalen er uændret. Ret tidspunkt, sted eller titel, før du gemmer.',
  workflow_not_ready:
    'Dette trin bliver tilgængeligt sammen med aftale- og fakturafunktionen.',
  invalid_transition:
    'Sagen kan ikke flyttes til dette trin. Hent den seneste version.',
  return_to_clarifying:
    'Flyt sagen tilbage til Afklaring, før godkendelsen ændres.',
};
function check(error: { message: string; code?: string } | null) {
  if (!error) return;
  const code =
    Object.keys(messages).find((key) => error.message.includes(key)) ??
    'unavailable';
  throw new OperationsError(
    code,
    messages[code] ??
      'Handlingen kunne ikke bekræftes. Dine indtastninger er bevaret. Prøv igen.',
  );
}
export function createOperationsGateway(
  client: SupabaseClient,
): OperationsGateway {
  return {
    async list(offset) {
      const { data, error } = await client
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id')
        .range(offset, offset + 99);
      check(error);
      const items = z.array(OperationsLeadSchema).parse(data);
      return { items, hasMore: items.length === 100 };
    },
    async lead(id) {
      const { data, error } = await client
        .from('leads')
        .select('*')
        .eq('id', id)
        .single();
      check(error);
      return OperationsLeadSchema.parse(data);
    },
    async history(id) {
      const { data, error } = await client
        .from('lead_events')
        .select('*')
        .eq('lead_id', id)
        .order('lead_version', { ascending: false })
        .limit(500);
      check(error);
      return z.array(LeadEventSchema).parse(data);
    },
    async appointment(id) {
      const { data, error } = await client
        .from('appointments')
        .select('*')
        .eq('lead_id', id)
        .eq('state', 'booked')
        .maybeSingle();
      check(error);
      return data ? AppointmentSchema.parse(data) : null;
    },
    async calendar(from, to, offset) {
      const { data, error } = await client
        .from('appointments')
        .select('*,lead:leads(name,postal_code)')
        .eq('state', 'booked')
        .gt('ends_at', from)
        .lt('starts_at', to)
        .order('starts_at')
        .order('id')
        .range(offset, offset + 99);
      check(error);
      const items = z.array(AppointmentSchema).parse(data);
      return { items, hasMore: items.length === 100 };
    },
    async execute(input) {
      const command = StaffCommandSchema.parse(input);
      const common = {
        p_lead_id: command.leadId,
        p_expected_version: command.expectedVersion,
        p_command_id: command.commandId,
      };
      let result;
      switch (command.kind) {
        case 'status':
          result = await client.rpc('change_lead_status', {
            ...common,
            p_status: command.status,
            p_reason: command.reason,
          });
          break;
        case 'waiting':
          result = await client.rpc('set_lead_waiting', {
            ...common,
            p_waiting_on: command.waitingOn,
          });
          break;
        case 'review':
          result = await client.rpc('record_lead_review', {
            ...common,
            p_decision: command.decision,
            p_summary: command.summary,
          });
          break;
        case 'note':
          result = await client.rpc('add_lead_note', {
            ...common,
            p_body: command.body,
          });
          break;
        case 'appointment_create':
          result = await client.rpc('create_lead_appointment', {
            ...common,
            p_title: command.title,
            p_location: command.location,
            p_starts_at: command.startsAt,
            p_ends_at: command.endsAt,
          });
          break;
        case 'appointment_reschedule':
          result = await client.rpc('reschedule_lead_appointment', {
            ...common,
            p_appointment_id: command.appointmentId,
            p_title: command.title,
            p_location: command.location,
            p_starts_at: command.startsAt,
            p_ends_at: command.endsAt,
            p_reason: command.reason,
          });
          break;
        case 'appointment_cancel':
          result = await client.rpc('cancel_lead_appointment', {
            ...common,
            p_appointment_id: command.appointmentId,
            p_reason: command.reason,
          });
          break;
      }
      check(result.error);
      return CommandReceiptSchema.parse(result.data);
    },
  };
}
/** A lost response keeps the exact command ID. Changed input or version starts a new command. */
export function createCommandSender(gateway: OperationsGateway) {
  let pending: { payload: string; command: StaffCommand } | undefined;
  return async (input: CommandInput) => {
    const payload = JSON.stringify(input);
    if (!pending || pending.payload !== payload)
      pending = {
        payload,
        command: StaffCommandSchema.parse({
          ...input,
          commandId: randomId(),
        }),
      };
    const receipt = await gateway.execute(pending.command);
    pending = undefined;
    return receipt;
  };
}
export type CommandInput = StaffCommand extends infer C
  ? C extends StaffCommand
    ? Omit<C, 'commandId'>
    : never
  : never;
