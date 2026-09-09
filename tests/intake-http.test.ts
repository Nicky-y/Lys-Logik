import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import {
  createLeadHandler,
  type LeadHttpDependencies,
} from '../supabase/functions/_shared/http/lead-handler.ts';
import { createTurnstileVerifier } from '../supabase/functions/_shared/infrastructure/turnstile.ts';
import { createSupabaseLeadRepository } from '../supabase/functions/_shared/infrastructure/supabase-leads.ts';
import { LeadFailure } from '../supabase/functions/_shared/application/create-lead.ts';
import {
  LeadReferenceSchema,
  SubmissionKeySchema,
} from '../supabase/functions/_shared/contracts/lead.ts';
import { validLead, submissionKey } from './helpers/database.ts';

const reference = LeadReferenceSchema.parse(
  '19d43304-9a15-4398-8709-3f263241d184',
);
const key = SubmissionKeySchema.parse(submissionKey);
const origin = 'https://example.com';
const payload = { lead: validLead, turnstileToken: 'test-token' };
function fixture(overrides: Partial<LeadHttpDependencies> = {}) {
  const calls = { writes: 0, verification: 0, limits: 0 };
  const handler = createLeadHandler({
    allowedOrigins: [origin],
    async consumeRequest() {
      calls.limits++;
      return { allowed: true, retryAfter: 0 };
    },
    async verifyHuman() {
      calls.verification++;
      return true;
    },
    repository: {
      async findSubmission() {
        return null;
      },
      async createSubmission() {
        calls.writes++;
        return { reference };
      },
    },
    ...overrides,
  });
  return { calls, handler };
}
function request(
  body: unknown = payload,
  headers: Record<string, string> = {},
) {
  return new Request('https://backend.example/create-lead', {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'Idempotency-Key': submissionKey,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test('valid HTTP request receives only a durable receipt and private cache headers', async () => {
  const { handler, calls } = fixture();
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, reference });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.deepEqual(calls, { writes: 1, verification: 1, limits: 1 });
});
test('preflight works without creating a lead or consuming request quota', async () => {
  const { handler, calls } = fixture();
  assert.equal(
    (
      await handler(
        new Request('https://backend.example', {
          method: 'OPTIONS',
          headers: { Origin: origin },
        }),
      )
    ).status,
    204,
  );
  assert.deepEqual(calls, { writes: 0, verification: 0, limits: 0 });
});
test('unapproved origins, methods and content types cannot reach persistence', async () => {
  const { handler, calls } = fixture();
  assert.equal(
    (await handler(request(payload, { Origin: 'https://attacker.example' })))
      .status,
    403,
  );
  assert.equal(
    (
      await handler(
        new Request('https://backend.example', { headers: { Origin: origin } }),
      )
    ).status,
    405,
  );
  assert.equal(
    (await handler(request(payload, { 'Content-Type': 'text/plain' }))).status,
    415,
  );
  assert.equal(calls.writes, 0);
});
test('invalid payloads, extra privileges and invalid identities are rejected', async () => {
  const { handler, calls } = fixture();
  for (const body of [
    null,
    { lead: { ...validLead, status: 'paid' }, turnstileToken: 'test-token' },
    { ...payload, lead: { ...validLead, email: '' } },
  ]) {
    assert.equal((await handler(request(body))).status, 400);
  }
  assert.equal(
    (await handler(request(payload, { 'Idempotency-Key': '123' }))).status,
    400,
  );
  assert.equal(calls.writes, 0);
});
test('byte limit applies without relying on a declared Content-Length', async () => {
  const { handler, calls } = fixture();
  assert.equal(
    (await handler(request({ content: 'ø'.repeat(10_000) }))).status,
    413,
  );
  assert.equal(
    (await handler(request(payload, { 'Content-Length': '20000' }))).status,
    413,
  );
  assert.equal(calls.writes, 0);
});
test('bad JSON is reported without leaking parsing details', async () => {
  const { handler } = fixture();
  const response = await handler(
    new Request('https://backend.example', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'Idempotency-Key': submissionKey,
      },
      body: '{private-data',
    }),
  );
  assert.equal(response.status, 400);
  assert.doesNotMatch(await response.text(), /private-data/);
});
test('rate limiting fails closed and publishes Retry-After', async () => {
  const { handler, calls } = fixture({
    consumeRequest: async () => ({ allowed: false, retryAfter: 42 }),
  });
  const response = await handler(request());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '42');
  assert.equal(calls.writes, 0);
});
test('saved retry returns receipt without consuming a single-use Turnstile token again', async () => {
  const { handler, calls } = fixture({
    repository: {
      async findSubmission() {
        return { reference };
      },
      async createSubmission() {
        throw new Error('Must not create');
      },
    },
  });
  assert.equal(
    (await handler(request({ ...payload, turnstileToken: '' }))).status,
    200,
  );
  assert.equal(calls.verification, 0);
});
test('bot rejection and provider outage never save a lead', async () => {
  const rejected = fixture({ verifyHuman: async () => false });
  assert.equal((await rejected.handler(request())).status, 422);
  assert.equal(rejected.calls.writes, 0);
  const unavailable = fixture({
    verifyHuman: async () => {
      throw new Error('secret-provider-detail');
    },
  });
  const response = await unavailable.handler(request());
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret-provider-detail/);
  assert.equal(unavailable.calls.writes, 0);
});
test('conflicting retries return 409, storage outages return 503', async () => {
  for (const [code, expected] of [
    ['conflict', 409],
    ['unavailable', 503],
  ] as const) {
    const { handler } = fixture({
      repository: {
        async findSubmission() {
          throw new LeadFailure(code);
        },
        async createSubmission() {
          throw new Error('Unexpected');
        },
      },
    });
    assert.equal((await handler(request())).status, expected);
  }
});
test('Turnstile verifies success, expected action and exact hostname on the server', async () => {
  for (const result of [
    { success: false, action: 'create-lead', hostname: 'example.com' },
    { success: true, action: 'login', hostname: 'example.com' },
    { success: true, action: 'create-lead', hostname: 'attacker.example' },
  ]) {
    const verify = createTurnstileVerifier(
      'test-secret',
      ['example.com'],
      async () => Response.json(result),
    );
    assert.equal(await verify('token', key), false);
  }
  const verify = createTurnstileVerifier(
    'test-secret',
    ['example.com'],
    async (url, init) => {
      assert.equal(
        url,
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      );
      assert.deepEqual(JSON.parse(String(init?.body)), {
        secret: 'test-secret',
        response: 'token',
        idempotency_key: submissionKey,
      });
      return Response.json({
        success: true,
        action: 'create-lead',
        hostname: 'example.com',
      });
    },
  );
  assert.equal(await verify('token', key), true);
});
test('Supabase adapter sends validated RPC arguments and validates returned receipts', async () => {
  const client = createClient('https://project.supabase.co', 'sb_secret_test', {
    auth: { persistSession: false },
    global: {
      fetch: async (url, init) => {
        assert.match(String(url), /\/rest\/v1\/rpc\/create_lead_submission$/);
        assert.deepEqual(JSON.parse(String(init?.body)), {
          p_key: submissionKey,
          p_submission: validLead,
        });
        return Response.json({ reference });
      },
    },
  });
  assert.deepEqual(
    await createSupabaseLeadRepository(client).createSubmission(key, validLead),
    { reference },
  );
});
