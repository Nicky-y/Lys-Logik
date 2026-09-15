import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MessageSchema,
  type CustomerMessage,
} from '../supabase/functions/_shared/contracts/mail.ts';
import { LeadIdSchema } from '../supabase/functions/_shared/contracts/operations.ts';
import {
  conversationMessages,
  customerPhotos,
} from '../operations/src/conversation-model.ts';
const leadId = LeadIdSchema.parse('1054ed20-67f4-4ff8-bd50-b423d7b11baf');
const otherLead = LeadIdSchema.parse('ec421bef-f031-4416-9f30-21871b4c7d30');
const id = (number: number) =>
  `c6d771c8-1242-4c22-8ab5-${String(number).padStart(12, '0')}`;
const message = (number: number, changes: Partial<CustomerMessage> = {}) =>
  MessageSchema.parse({
    id: id(number),
    lead_id: leadId,
    direction: 'inbound',
    sender: 'customer@example.com',
    recipient: 'staff@example.com',
    subject: 'Billeder',
    body: 'Her er opgaven.',
    attachments: [],
    sender_matches_customer: true,
    state: 'received',
    created_at: '2026-09-15T10:00:00Z',
    updated_at: '2026-09-15T10:00:00Z',
    created_by: null,
    ...changes,
  });

test('overlapping pages keep one message with the newest fetched state, deterministic order and no other case data', () => {
  const recent = message(3, {
    state: 'delivered',
    created_at: '2026-09-15T11:00:00Z',
  });
  const result = conversationMessages(
    [
      [recent, message(2)],
      [
        message(3, { state: 'accepted' }),
        message(1),
        message(4, { lead_id: otherLead }),
      ],
    ],
    leadId,
  );
  assert.deepEqual(
    result.map((item) => [item.id, item.state]),
    [
      [id(1), 'received'],
      [id(2), 'received'],
      [id(3), 'delivered'],
    ],
  );
});

test('gallery contains only allowed customer photos, preserving sender warning and message-to-file identity', () => {
  const attachment = {
    id: id(20),
    filename: 'photo.png',
    size: 100,
    content_type: 'image/png',
  };
  const inbound = message(1, {
    sender_matches_customer: false,
    attachments: [
      attachment,
      { ...attachment, id: id(21), content_type: 'application/pdf' },
      { ...attachment, id: id(22), content_type: 'image/svg+xml' },
      { ...attachment, id: id(23), size: 10 * 1024 * 1024 + 1 },
    ],
  });
  const outbound = message(2, {
    direction: 'outbound',
    attachments: [attachment],
  });
  const newest = message(3, {
    attachments: [
      {
        ...attachment,
        id: id(24),
        content_type: 'image/jpeg',
        size: 10 * 1024 * 1024,
      },
    ],
  });
  const photos = customerPhotos([inbound, outbound, newest]);
  assert.deepEqual(
    photos.map(({ message, file }) => [message.id, file.id]),
    [
      [id(3), id(24)],
      [id(1), id(20)],
    ],
  );
  assert.equal(photos[1].message.sender_matches_customer, false);
  assert.equal(inbound.attachments.length, 4);
});
