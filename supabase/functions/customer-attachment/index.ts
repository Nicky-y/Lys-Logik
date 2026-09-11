import { createClient } from '@supabase/supabase-js';
import { createResendMail } from '../_shared/infrastructure/resend-mail.ts';
import { customerAttachmentHandler } from '../_shared/http/customer-attachment.ts';
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};
Deno.serve(
  customerAttachmentHandler(
    (Deno.env.get('MAIL_APP_ORIGINS') ?? 'https://app.lysoglogik.dk').split(
      ',',
    ),
    {
      async authorize(bearer, input) {
        const client = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_ANON_KEY')!,
          {
            global: {
              headers: { Authorization: bearer },
              fetch: (input, init) =>
                fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
            },
            auth: { persistSession: false, autoRefreshToken: false },
          },
        );
        const { data, error } = await client.rpc('customer_attachment_source', {
          p_message_id: input.messageId,
          p_attachment_id: input.attachmentId,
        });
        return error ? null : data;
      },
      async metadata(providerId, attachmentId) {
        const key = Deno.env.get('RESEND_API_KEY');
        if (!key) throw new Error('mail_not_configured');
        return createResendMail(key).attachment(providerId, attachmentId);
      },
    },
  ),
);
