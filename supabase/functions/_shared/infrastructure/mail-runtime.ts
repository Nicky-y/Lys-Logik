import { createClient } from '@supabase/supabase-js';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readSupabaseServerKey } from './server-key.ts';
export type Environment = { get(name: string): string | undefined };
export function mailServerClient(env: Environment) {
  return createClient(
    env.get('SUPABASE_URL')!,
    readSupabaseServerKey(
      env.get('SUPABASE_SECRET_KEYS'),
      env.get('LEAD_SERVER_KEY_NAME') ?? 'default',
    ),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
      },
    },
  );
}
export function cronAuthorized(request: Request, secret: string | undefined) {
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return (
    !!secret &&
    timingSafeEqual(
      digest(request.headers.get('authorization') ?? ''),
      digest('Bearer ' + secret),
    )
  );
}
