import { z } from 'zod';
import { LeadIdSchema } from './operations.ts';

export const MessageIdSchema = z.uuid().brand<'MessageId'>();
export const ProviderMailIdSchema = z.uuid().brand<'ProviderMailId'>();
export const AttachmentIdSchema = z.uuid().brand<'AttachmentId'>();
export const AttachmentSchema = z.object({
  id: AttachmentIdSchema,
  filename: z
    .string()
    .max(500)
    .nullable()
    .transform((v) => v || 'vedhaeftning'),
  content_type: z.string().max(200),
  size: z.number().int().nonnegative(),
});
export const MessageSchema = z.object({
  id: MessageIdSchema,
  lead_id: LeadIdSchema,
  direction: z.enum(['inbound', 'outbound']),
  sender: z.string(),
  recipient: z.string(),
  subject: z.string(),
  body: z.string(),
  attachments: z.array(AttachmentSchema).max(30),
  sender_matches_customer: z.boolean(),
  state: z.enum([
    'queued',
    'sending',
    'accepted',
    'delivered',
    'bounced',
    'failed',
    'review',
    'received',
  ]),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.uuid().nullable(),
});
export const ComposeMessageSchema = z
  .object({
    id: MessageIdSchema,
    leadId: LeadIdSchema,
    subject: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine((v) => !/[\r\n]/.test(v)),
    body: z.string().trim().min(1).max(10000),
  })
  .strict();
export const MailJobSchema = z.object({
  id: MessageIdSchema,
  leaseId: z.uuid().brand<'MailLeaseId'>(),
  payload: z
    .object({
      from: z.string().min(1).max(300),
      to: z.array(z.email()).length(1),
      reply_to: z.string().regex(/^sag\+[a-f0-9]{32}@mail\.lysoglogik\.dk$/),
      subject: ComposeMessageSchema.shape.subject,
      text: ComposeMessageSchema.shape.body,
    })
    .strict(),
});
export type CustomerMessage = z.infer<typeof MessageSchema>;
export type ComposeMessage = z.infer<typeof ComposeMessageSchema>;
export type MailJob = z.infer<typeof MailJobSchema>;
export type MailResult =
  | { state: 'accepted'; providerId: z.infer<typeof ProviderMailIdSchema> }
  | { state: 'retry' | 'failed' | 'review' };
export const downloadableAttachment = (a: z.infer<typeof AttachmentSchema>) =>
  a.size <= 10 * 1024 * 1024 &&
  ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(
    a.content_type,
  );
