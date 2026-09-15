import {
  downloadableAttachment,
  type CustomerMessage,
} from '../../supabase/functions/_shared/contracts/mail.ts';
import type { LeadId } from '../../supabase/functions/_shared/contracts/operations.ts';

/** Merge overlapping pages without showing messages from another case. Oldest first. */
export function conversationMessages(
  pages: CustomerMessage[][],
  leadId: LeadId,
) {
  const messages = new Map<CustomerMessage['id'], CustomerMessage>();
  for (const page of pages) {
    for (const message of page) {
      if (message.lead_id === leadId && !messages.has(message.id))
        messages.set(message.id, message);
    }
  }
  return [...messages.values()].sort((a, b) => {
    const difference = Date.parse(a.created_at) - Date.parse(b.created_at);
    return difference || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}

/** Customer photos keep their message identity so retrieval uses the existing access boundary. */
export function customerPhotos(messages: CustomerMessage[]) {
  return [...messages]
    .reverse()
    .flatMap((message) =>
      message.direction !== 'inbound'
        ? []
        : message.attachments
            .filter(
              (file) =>
                downloadableAttachment(file) &&
                ['image/jpeg', 'image/png', 'image/webp'].includes(
                  file.content_type,
                ),
            )
            .map((file) => ({ message, file })),
    );
}
