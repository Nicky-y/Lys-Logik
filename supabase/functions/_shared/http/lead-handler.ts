import {
  CreateLeadRequestSchema,
  SubmissionKeySchema,
} from '../contracts/lead.ts';
import {
  createLead,
  LeadFailure,
  type LeadDependencies,
} from '../application/create-lead.ts';

export interface LeadHttpDependencies extends LeadDependencies {
  allowedOrigins: readonly string[];
  consumeRequest(): Promise<{ allowed: boolean; retryAfter: number }>;
}

const MAX_BODY_BYTES = 16_384;

async function readJson(request: Request): Promise<unknown> {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES))
    throw new RangeError();
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError();
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
}

/** Public endpoint: CORS is a browser restriction; Turnstile and durable limits protect writes. */
export function createLeadHandler(dependencies: LeadHttpDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers = new Headers({
      'Cache-Control': 'no-store',
      Vary: 'Origin',
      'X-Content-Type-Options': 'nosniff',
    });
    const reply = (status: number, data: unknown) =>
      Response.json(data, { status, headers });
    if (!origin || !dependencies.allowedOrigins.includes(origin)) {
      return reply(403, { error: 'Denne formularadresse er ikke tilladt.' });
    }
    headers.set('Access-Control-Allow-Origin', origin);
    if (request.method === 'OPTIONS') {
      headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      headers.set(
        'Access-Control-Allow-Headers',
        'content-type, idempotency-key',
      );
      headers.set('Access-Control-Max-Age', '600');
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') {
      headers.set('Allow', 'POST, OPTIONS');
      return reply(405, {
        error: 'Brug formularen til at sende din henvendelse.',
      });
    }
    if (
      request.headers
        .get('content-type')
        ?.split(';')[0]
        .trim()
        .toLowerCase() !== 'application/json'
    ) {
      return reply(415, { error: 'Henvendelsen skal sendes som JSON.' });
    }
    try {
      const limit = await dependencies.consumeRequest();
      if (!limit.allowed) {
        headers.set('Retry-After', String(limit.retryAfter));
        return reply(429, {
          error: 'Der er mange henvendelser lige nu. Prøv igen lidt senere.',
        });
      }
      const key = SubmissionKeySchema.safeParse(
        request.headers.get('idempotency-key'),
      );
      if (!key.success)
        return reply(400, {
          error: 'Henvendelsens nøgle er ugyldig. Genindlæs siden.',
        });
      const parsed = CreateLeadRequestSchema.safeParse(await readJson(request));
      if (!parsed.success)
        return reply(400, { error: 'Tjek oplysningerne i formularen.' });
      const receipt = await createLead(
        dependencies,
        key.data,
        parsed.data.lead,
        parsed.data.turnstileToken,
      );
      return reply(200, { success: true, ...receipt });
    } catch (error) {
      if (error instanceof RangeError)
        return reply(413, { error: 'Henvendelsen er for stor.' });
      if (
        error instanceof SyntaxError ||
        (error instanceof TypeError && /encoded data/.test(error.message))
      ) {
        return reply(400, { error: 'Formularens data kunne ikke læses.' });
      }
      if (error instanceof LeadFailure && error.code === 'conflict') {
        return reply(409, {
          error:
            'Henvendelsen er allerede gemt med andre oplysninger. Start en ny henvendelse.',
        });
      }
      if (error instanceof LeadFailure && error.code === 'verification') {
        return reply(422, {
          error: 'Sikkerhedskontrollen skal gennemføres igen.',
        });
      }
      return reply(503, {
        error:
          'Vi kunne ikke bekræfte modtagelsen. Dine oplysninger står stadig i formularen. Prøv igen.',
      });
    }
  };
}
