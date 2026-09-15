import {
  ComposeMessageSchema,
  MessageSchema,
  type CustomerMessage,
} from '../../supabase/functions/_shared/contracts/mail.ts';
import type { OperationsLead } from '../../supabase/functions/_shared/contracts/operations.ts';
import type { CustomerMailGateway } from './customer-mail';
import { randomId } from './random-id.ts';

// Local, in-memory preview. This adapter never sends mail or calls the backend.
export function createDemoCustomerMail(
  leads: Pick<OperationsLead, 'id' | 'name' | 'email' | 'created_at'>[],
): CustomerMailGateway {
  const messages: CustomerMessage[] = [];
  const submitted = new Map<string, string>();
  const pictureId = '88725b06-9dce-4348-9451-f0c49c1bd70a';
  for (const lead of leads) {
    messages.push(
      MessageSchema.parse({
        id: randomId(),
        lead_id: lead.id,
        direction: 'inbound',
        sender: lead.email,
        recipient: 'sager@example.com',
        subject: 'Billeder af opgaven',
        body:
          'Hej! Her er et billede af området. Vi vil gerne høre, hvad I tænker om løsningen.\n\nVenlig hilsen\n' +
          lead.name,
        attachments: [
          {
            id: pictureId,
            filename: 'Belysning – eksempel.webp',
            content_type: 'image/webp',
            size: 120000,
          },
        ],
        sender_matches_customer: true,
        state: 'received',
        created_at: lead.created_at,
        updated_at: lead.created_at,
        created_by: null,
      }),
    );
  }
  return {
    async enabled() {
      return true;
    },
    async list(leadId, offset) {
      return structuredClone(
        messages
          .filter((message) => message.lead_id === leadId)
          .slice(offset, offset + 50),
      );
    },
    async queue(input) {
      const message = ComposeMessageSchema.parse(input);
      const previous = submitted.get(message.id);
      if (previous) {
        if (previous !== JSON.stringify(message))
          throw new Error('Beskedens reference er allerede brugt.');
        return message.id;
      }
      const lead = leads.find((lead) => lead.id === message.leadId);
      if (!lead) throw new Error('Sagen findes ikke.');
      const now = new Date().toISOString();
      messages.unshift(
        MessageSchema.parse({
          id: message.id,
          lead_id: lead.id,
          direction: 'outbound',
          sender: 'Lys & Logik',
          recipient: lead.email,
          subject: message.subject,
          body: message.body,
          attachments: [],
          sender_matches_customer: true,
          state: 'queued',
          created_at: now,
          updated_at: now,
          created_by: null,
        }),
      );
      submitted.set(message.id, JSON.stringify(message));
      return message.id;
    },
    async attachment(messageId, attachmentId) {
      if (
        !messages.some(
          (message) =>
            message.id === messageId &&
            message.attachments.some((file) => file.id === attachmentId),
        )
      )
        throw new Error('Billedet findes ikke på beskeden.');
      const response = await fetch(
        new URL('../../public/images/lighting-960.webp', import.meta.url),
      );
      if (!response.ok) throw new Error('Eksempelbilledet kunne ikke hentes.');
      return response.blob();
    },
  };
}
