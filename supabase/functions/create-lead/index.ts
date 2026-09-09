import { createClient } from '@supabase/supabase-js';
import { createLeadHandler } from '../_shared/http/lead-handler.ts';
import {
  createRequestLimiter,
  createSupabaseLeadRepository,
} from '../_shared/infrastructure/supabase-leads.ts';
import { createTurnstileVerifier } from '../_shared/infrastructure/turnstile.ts';
import { readSupabaseServerKey } from '../_shared/infrastructure/server-key.ts';

// Minimal host contract keeps shared application modules independent of Deno.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

function buildHandler(): (request: Request) => Promise<Response> {
  const origins = (Deno.env.get('LEAD_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const hostnames = (Deno.env.get('TURNSTILE_HOSTNAMES') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  const serverKey = readSupabaseServerKey(
    Deno.env.get('SUPABASE_SECRET_KEYS'),
    Deno.env.get('LEAD_SERVER_KEY_NAME') ?? 'default',
  );
  if (!secret || !serverKey || !url || !origins.length || !hostnames.length) {
    throw new Error('Lead intake is not configured.');
  }
  // Fresh project keys are supplied by the Edge runtime, never sent to the website.
  const client = createClient(url, serverKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(8_000) }),
    },
  });
  return createLeadHandler({
    repository: createSupabaseLeadRepository(client),
    consumeRequest: createRequestLimiter(client),
    verifyHuman: createTurnstileVerifier(secret, hostnames),
    allowedOrigins: origins,
  });
}

let handler: ((request: Request) => Promise<Response>) | undefined;
Deno.serve(async (request) => {
  try {
    handler ??= buildHandler();
    return await handler(request);
  } catch {
    return Response.json(
      { error: 'Formularmodtagelsen er ikke klar endnu.' },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
});
