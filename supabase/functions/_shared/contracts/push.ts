import { z } from 'zod';
import { LeadIdSchema } from './operations.ts';

export const PushEndpointSchema = z
  .string()
  .max(2048)
  .regex(
    /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\/[^\s#]+$/,
  )
  .brand<'PushEndpoint'>();
export const PushSubscriptionSchema = z.object({
  endpoint: PushEndpointSchema,
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  }),
});
export const PushDeliverySchema = z.object({
  id: z.uuid().brand<'PushDeliveryId'>(),
  leaseId: z.uuid().brand<'PushLeaseId'>(),
  leadId: LeadIdSchema,
  subscription: PushSubscriptionSchema,
});
export type PushDelivery = z.infer<typeof PushDeliverySchema>;
export type PushResult = 'accepted' | 'gone' | 'retry' | 'rejected';

/** Fixed text avoids disclosing customer data on lock screens or to push providers. */
export function pushPayload(delivery: PushDelivery) {
  return JSON.stringify({ leadId: delivery.leadId, deliveryId: delivery.id });
}
