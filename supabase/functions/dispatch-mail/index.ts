import { dispatchCustomerMail } from '../_shared/application/customer-mail.ts';
import { createResendMail } from '../_shared/infrastructure/resend-mail.ts';
import {
  cronAuthorized,
  mailServerClient,
} from '../_shared/infrastructure/mail-runtime.ts';
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};
Deno.serve(async (request) => {
  const headers = { 'Cache-Control': 'no-store' };
  if (request.method !== 'POST')
    return new Response(null, { status: 405, headers });
  if (!cronAuthorized(request, Deno.env.get('PUSH_CRON_SECRET')))
    return new Response(null, { status: 401, headers });
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return new Response(null, { status: 503, headers });
  try {
    const client = mailServerClient(Deno.env);
    const result = await dispatchCustomerMail(
      {
        async claim() {
          const { data, error } = await client.rpc('claim_customer_mail');
          if (error) throw new Error('claim_failed');
          return data;
        },
        async complete(job, result) {
          const { error } = await client.rpc('complete_customer_mail', {
            p_id: job.id,
            p_lease_id: job.leaseId,
            p_result: result.state,
            p_provider_id:
              result.state === 'accepted' ? result.providerId : null,
          });
          if (error) throw new Error('completion_failed');
        },
      },
      createResendMail(key).send,
    );
    return Response.json(result, { headers });
  } catch {
    console.error('mail_dispatch_failed');
    return new Response(null, { status: 503, headers });
  }
});
