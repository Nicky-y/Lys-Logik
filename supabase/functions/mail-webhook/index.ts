import { customerMailWebhook } from '../_shared/http/mail-webhook.ts';
import { createResendMail } from '../_shared/infrastructure/resend-mail.ts';
import { mailServerClient } from '../_shared/infrastructure/mail-runtime.ts';
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};
Deno.serve(async (request) => {
  const key = Deno.env.get('RESEND_API_KEY');
  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET');
  if (!key || !secret)
    return new Response(null, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  return customerMailWebhook(secret, async (id, event) => {
    const client = mailServerClient(Deno.env);
    if (event.type === 'email.received') {
      const mail = await createResendMail(key).receive(event.data.email_id);
      const { error } = await client.rpc('receive_customer_mail', {
        p_event_id: id,
        p_provider_id: event.data.email_id,
        p_occurred_at: event.created_at,
        p_mail: mail,
      });
      if (error) throw new Error('receive_failed');
    } else if (
      [
        'email.delivered',
        'email.bounced',
        'email.failed',
        'email.complained',
      ].includes(event.type)
    ) {
      const { error } = await client.rpc('record_customer_mail_delivery', {
        p_event_id: id,
        p_provider_id: event.data.email_id,
        p_type: event.type,
        p_occurred_at: event.created_at,
      });
      if (error) throw new Error('delivery_failed');
    }
  })(request);
});
