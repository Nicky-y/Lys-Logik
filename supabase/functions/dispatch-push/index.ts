import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual, createHash } from 'node:crypto';
import { dispatchPush } from '../_shared/application/dispatch-push.ts';
import { createWebPushSender } from '../_shared/infrastructure/web-push.ts';
import { readSupabaseServerKey } from '../_shared/infrastructure/server-key.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};
Deno.serve(async (request) => {
  const headers = { 'Cache-Control': 'no-store' };
  if (request.method !== 'POST')
    return new Response(null, { status: 405, headers });
  const secret = Deno.env.get('PUSH_CRON_SECRET');
  if (!secret) return new Response(null, { status: 503, headers });
  const digest = (text: string) => createHash('sha256').update(text).digest();
  if (
    !timingSafeEqual(
      digest(request.headers.get('authorization') ?? ''),
      digest('Bearer ' + secret),
    )
  )
    return new Response(null, { status: 401, headers });
  try {
    const publicKey = Deno.env.get('WEB_PUSH_PUBLIC_KEY');
    const privateKey = Deno.env.get('WEB_PUSH_PRIVATE_KEY');
    if (!publicKey || !privateKey) throw new Error('push_not_configured');
    const client = createClient(
      Deno.env.get('SUPABASE_URL')!,
      readSupabaseServerKey(
        Deno.env.get('SUPABASE_SECRET_KEYS'),
        Deno.env.get('LEAD_SERVER_KEY_NAME') ?? 'default',
      ),
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (input, init) =>
            fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
        },
      },
    );
    const stats = await dispatchPush(
      {
        async claim() {
          const { data, error } = await client.rpc('claim_push_deliveries');
          if (error) throw new Error('push_claim_failed');
          return data;
        },
        async complete(item, result, retryAfter) {
          const { error } = await client.rpc('complete_push_delivery', {
            p_id: item.id,
            p_lease_id: item.leaseId,
            p_result: result,
            p_retry_after: retryAfter,
          });
          if (error) throw new Error('push_completion_failed');
        },
      },
      createWebPushSender(publicKey, privateKey),
    );
    console.log(JSON.stringify({ event: 'push_dispatch', ...stats }));
    return Response.json(stats, { headers });
  } catch {
    console.error('push_dispatch_failed');
    return new Response(null, { status: 503, headers });
  }
});
