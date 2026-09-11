import { Webhook } from 'svix';
import { z } from 'zod';
import { ProviderMailIdSchema } from '../contracts/mail.ts';
import { limitedBytes } from '../infrastructure/resend-mail.ts';

const EventSchema = z.object({
  type: z.string(),
  created_at: z.iso.datetime({ offset: true }),
  data: z.object({ email_id: ProviderMailIdSchema }),
});
type Event = z.infer<typeof EventSchema>;
export function customerMailWebhook(
  secret: string,
  handle: (id: string, event: Event) => Promise<void>,
) {
  const verifier = new Webhook(secret);
  return async (request: Request) => {
    const headers = { 'Cache-Control': 'no-store' };
    if (request.method !== 'POST')
      return new Response(null, { status: 405, headers });
    let event: Event;
    let id: string;
    try {
      const raw = new TextDecoder().decode(
        await limitedBytes(request, 256 * 1024),
      );
      id = z.string().min(1).max(200).parse(request.headers.get('svix-id'));
      verifier.verify(raw, {
        'svix-id': id,
        'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
        'svix-signature': request.headers.get('svix-signature') ?? '',
      });
      event = EventSchema.parse(JSON.parse(raw));
    } catch {
      return new Response(null, { status: 400, headers });
    }
    try {
      await handle(id, event);
      return new Response(null, { status: 204, headers });
    } catch {
      return new Response(null, { status: 503, headers });
    }
  };
}
