import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MessageSchema,
  MessageIdSchema,
  ComposeMessageSchema,
  type ComposeMessage,
  type CustomerMessage,
} from '../../supabase/functions/_shared/contracts/mail.ts';
import type { LeadId } from '../../supabase/functions/_shared/contracts/operations.ts';
import { randomId } from './random-id.ts';
export interface CustomerMailGateway {
  enabled(): Promise<boolean>;
  list(leadId: LeadId, offset: number): Promise<CustomerMessage[]>;
  queue(message: ComposeMessage): Promise<string>;
  attachment(messageId: string, attachmentId: string): Promise<Blob>;
}
const errors: Record<string, string> = {
  mail_not_ready: 'Mailfunktionen er endnu ikke aktiveret.',
  mail_rate_limit:
    'Der er sendt mange beskeder den seneste time. Vent lidt, før du prøver igen.',
  staff_required: 'Din medarbejderadgang er ikke aktiv.',
  message_conflict:
    'Beskedens reference er allerede brugt til andet indhold. Hent sagen igen.',
};
function check(error: { message: string } | null) {
  if (error)
    throw new Error(
      Object.entries(errors).find(([key]) =>
        error.message.includes(key),
      )?.[1] ??
        'Beskeden kunne ikke bekræftes. Teksten er bevaret. Prøv igen med samme indhold.',
    );
}
export function createCustomerMailGateway(
  client: SupabaseClient,
): CustomerMailGateway {
  return {
    async enabled() {
      const { data, error } = await client.rpc('customer_mail_enabled');
      check(error);
      return z.boolean().parse(data);
    },
    async list(leadId, offset) {
      const { data, error } = await client
        .from('lead_messages')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + 49);
      check(error);
      return z.array(MessageSchema).parse(data);
    },
    async queue(input) {
      const message = ComposeMessageSchema.parse(input);
      const { data, error } = await client.rpc('queue_customer_message', {
        p_id: message.id,
        p_lead_id: message.leadId,
        p_subject: message.subject,
        p_body: message.body,
      });
      check(error);
      return MessageIdSchema.parse(data);
    },
    async attachment(messageId, attachmentId) {
      const { data, error } = await client.functions.invoke(
        'customer-attachment',
        { body: { messageId, attachmentId } },
      );
      if (error || !(data instanceof Blob))
        throw new Error(
          'Filen kunne ikke hentes. Kontrollér forbindelsen og prøv igen.',
        );
      return data;
    },
  };
}
/** Retry the same logical message with the same identity after an uncertain acknowledgement. */
export function createMessageSender(gateway: CustomerMailGateway) {
  let pending: ComposeMessage | null = null;
  return async (input: Omit<ComposeMessage, 'id'>) => {
    if (
      !pending ||
      pending.leadId !== input.leadId ||
      pending.subject !== input.subject.trim() ||
      pending.body !== input.body.trim()
    )
      pending = ComposeMessageSchema.parse({ ...input, id: randomId() });
    const result = await gateway.queue(pending);
    pending = null;
    return result;
  };
}
