import type { SubmissionKey } from '../contracts/lead.ts';
import { LeadFailure } from '../application/create-lead.ts';

export function createTurnstileVerifier(
  secret: string,
  hostnames: readonly string[],
  fetcher: typeof fetch = fetch,
) {
  return async (token: string, key: SubmissionKey): Promise<boolean> => {
    const response = await fetcher(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, response: token, idempotency_key: key }),
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) throw new LeadFailure('unavailable');
    const result = await response.json();
    return (
      result.success === true &&
      result.action === 'create-lead' &&
      hostnames.includes(result.hostname)
    );
  };
}
