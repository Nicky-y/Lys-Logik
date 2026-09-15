import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  StaffInvitationCommandSchema,
  StaffInvitationClaimSchema,
  StaffInvitationSchema,
  StaffInvitationError,
  type StaffInvitationCommand,
} from '../supabase/functions/_shared/contracts/staff-invitation.ts';
import {
  inviteStaff,
  type StaffInvitationPorts,
} from '../supabase/functions/_shared/application/invite-staff.ts';
import { inviteStaffHandler } from '../supabase/functions/_shared/http/invite-staff.ts';
import { createStaffInvitationSender } from '../operations/src/staff-invitations.ts';
import { createStaffInvitationPorts } from '../supabase/functions/_shared/infrastructure/staff-invitation-runtime.ts';

test('runtime adapter preserves caller authorization, selects the configured server key and fixes the Auth redirect', async () => {
  const { claim, invitation } = fixture();
  const values: Record<string, string> = {
    SUPABASE_URL: 'https://project.example',
    SUPABASE_ANON_KEY: 'sb_publishable_fixture',
    SUPABASE_SECRET_KEYS: JSON.stringify({ default_v1: 'sb_secret_fixture' }),
    LEAD_SERVER_KEY_NAME: 'default_v1',
  };
  const calls: { url: URL; headers: Headers; body: any }[] = [];
  const request: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body));
    calls.push({ url, headers, body });
    if (url.pathname.endsWith('/begin_staff_invitation'))
      return Response.json(claim);
    if (url.pathname.endsWith('/invite'))
      return Response.json({ id: randomUUID(), email: command.email });
    if (url.pathname.endsWith('/finish_staff_invitation'))
      return Response.json({ ...invitation, state: 'sent' });
    throw new Error('unexpected network path');
  };
  const ports = createStaffInvitationPorts(
    { get: (name) => values[name] },
    request,
  );
  assert.equal(
    (await inviteStaff(ports, 'Bearer caller-session', command)).state,
    'sent',
  );
  assert.equal(calls.length, 3);
  assert.equal(calls[0].headers.get('authorization'), 'Bearer caller-session');
  assert.equal(calls[0].headers.get('apikey'), 'sb_publishable_fixture');
  assert.equal(calls[1].headers.get('apikey'), 'sb_secret_fixture');
  assert.equal(
    calls[1].url.searchParams.get('redirect_to'),
    'https://app.lysoglogik.dk/',
  );
  assert.equal(calls[1].body.email, command.email);
  assert.equal(calls[2].body.p_attempt_id, claim.attemptId);
  assert.equal(calls[2].body.p_sent, true);
  values.LEAD_SERVER_KEY_NAME = 'missing';
  await assert.rejects(
    ports.send(command.email),
    /configured Supabase server key is missing/,
  );
  assert.equal(
    calls.length,
    3,
    'missing named key must not try another key or make a request',
  );
});

const command = StaffInvitationCommandSchema.parse({
  invitationId: randomUUID(),
  email: ' Partner@Example.COM ',
  displayName: 'Partner',
  role: 'technical',
  isOwner: false,
});
function fixture() {
  const invitation = StaffInvitationSchema.parse({
    id: command.invitationId,
    email: command.email,
    display_name: command.displayName,
    role: command.role,
    is_owner: command.isOwner,
    state: 'sending',
    created_by: randomUUID(),
    created_at: '2026-09-15T12:00:00Z',
    last_attempt_at: '2026-09-15T12:00:00Z',
    sent_at: null,
    activated_at: null,
  });
  const claim = StaffInvitationClaimSchema.parse({
    invitation,
    attemptId: randomUUID(),
  });
  const calls: string[] = [];
  const ports: StaffInvitationPorts = {
    reserve: async () => {
      calls.push('reserve');
      return claim;
    },
    send: async (email) => {
      assert.equal(email, command.email);
      calls.push('send');
    },
    finish: async (_claim, sent) => {
      calls.push(`finish:${sent}`);
      return StaffInvitationSchema.parse({
        ...invitation,
        state: sent ? 'sent' : 'uncertain',
      });
    },
  };
  return { claim, ports, calls, invitation };
}
test('invitation input canonicalizes identity, rejects unrecognized authority and arbitrary redirect or user ID', () => {
  assert.equal(command.email, 'partner@example.com');
  for (const input of [
    { ...command, role: 'owner' },
    { ...command, isOwner: 'true' },
    { ...command, userId: randomUUID() },
    { ...command, redirectTo: 'https://attacker.example' },
    { ...command, email: 'bad@example.com\nBcc:victim@example.com' },
    { ...command, invitationId: 'random-string' },
  ])
    assert.equal(StaffInvitationCommandSchema.safeParse(input).success, false);
});
test('reservation rejection prevents Auth calls and reconciliation', async () => {
  const { ports, calls } = fixture();
  ports.reserve = async () => {
    throw new StaffInvitationError('owner_required');
  };
  await assert.rejects(
    inviteStaff(ports, 'Bearer invalid', command),
    /Kun en aktiv ejer/,
  );
  assert.deepEqual(calls, []);
});
test('confirmed replay never resends, and unknown transport result is reconciled honestly once', async () => {
  const { ports, calls, claim } = fixture();
  claim.attemptId = null;
  assert.deepEqual(
    await inviteStaff(ports, 'Bearer owner', command),
    claim.invitation,
  );
  assert.deepEqual(calls, ['reserve']);
  const second = fixture();
  second.ports.send = async () => {
    second.calls.push('send');
    throw new Error('private-provider-details');
  };
  assert.equal(
    (await inviteStaff(second.ports, 'Bearer owner', command)).state,
    'uncertain',
  );
  assert.deepEqual(second.calls, ['reserve', 'send', 'finish:false']);
});
test('HTTP rejects invalid request boundaries without side effects and suppresses internal errors', async () => {
  const { ports, calls } = fixture();
  const handler = inviteStaffHandler(['https://app.lysoglogik.dk'], ports);
  const request = (
    body: unknown,
    headers: Record<string, string> = {},
    method = 'POST',
  ) =>
    new Request('https://api.example/invite', {
      method,
      headers: {
        origin: 'https://app.lysoglogik.dk',
        authorization: 'Bearer fixture',
        ...headers,
      },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    });
  assert.equal((await handler(request(command, {}, 'GET'))).status, 405);
  assert.equal(
    (await handler(request(command, { origin: 'https://other.example' })))
      .status,
    403,
  );
  assert.equal(
    (await handler(request(command, { authorization: '' }))).status,
    401,
  );
  assert.equal(
    (await handler(request({ ...command, role: 'administrator' }))).status,
    400,
  );
  assert.equal(
    (await handler(request({ ...command, displayName: 'x'.repeat(4000) })))
      .status,
    400,
  );
  const options = await handler(request(null, {}, 'OPTIONS'));
  assert.equal(options.status, 204);
  assert.deepEqual(calls, []);
  ports.reserve = async () => {
    throw new StaffInvitationError('owner_required');
  };
  assert.equal((await handler(request(command))).status, 403);
  ports.reserve = async () => {
    throw new StaffInvitationError('invitation_limit');
  };
  assert.equal((await handler(request(command))).status, 429);
  ports.reserve = async () => {
    throw new Error('SECRET_DATABASE_DETAILS');
  };
  const unavailable = await handler(request(command));
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { code: 'unavailable' });
  assert.equal(unavailable.headers.get('cache-control'), 'no-store');
});
test('browser sender preserves normalized commands after uncertain outcomes; changed intent gets a new ID', async () => {
  const { invitation } = fixture();
  const commands: StaffInvitationCommand[] = [];
  let failure = true;
  const send = createStaffInvitationSender({
    list: async () => [],
    invite: async (input) => {
      commands.push(input);
      if (failure) throw new Error('network lost');
      return { ...invitation, id: input.invitationId, state: 'sent' };
    },
  });
  const { invitationId: _, ...input } = command;
  await assert.rejects(send(input));
  await assert.rejects(send({ ...input, email: ' PARTNER@EXAMPLE.COM ' }));
  assert.deepEqual(commands[0], commands[1]);
  await assert.rejects(send({ ...input, isOwner: true }));
  assert.notEqual(commands[1].invitationId, commands[2].invitationId);
  failure = false;
  await send({ ...input, isOwner: true });
  assert.deepEqual(commands[2], commands[3]);
  await send({ ...input, isOwner: true });
  assert.notEqual(commands[3].invitationId, commands[4].invitationId);
});
