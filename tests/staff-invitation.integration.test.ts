import assert from 'node:assert/strict';
import { test, before, beforeEach, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from './helpers/database.ts';
import {
  StaffInvitationClaimSchema,
  StaffInvitationSchema,
  type StaffInvitationClaim,
} from '../supabase/functions/_shared/contracts/staff-invitation.ts';
import { StaffSchema } from '../supabase/functions/_shared/contracts/staff.ts';

let db: Awaited<ReturnType<typeof createTestDatabase>>;
const owner = randomUUID(),
  office = randomUUID(),
  technical = randomUUID(),
  outsider = randomUUID();
before(async () => {
  db = await createTestDatabase();
});
after(async () => {
  await db?.close();
});
async function admin() {
  await db.exec(
    "reset role; select set_config('request.jwt.claim.sub','',false)",
  );
}
async function login(id: string) {
  await admin();
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
}
beforeEach(async () => {
  await admin();
  await db.exec(
    'truncate public.leads,public.staff_members,auth.users cascade',
  );
  await db.query(
    'insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6),($7,$8)',
    [
      owner,
      'owner@example.com',
      office,
      'office@example.com',
      technical,
      'technical@example.com',
      outsider,
      'outsider@example.com',
    ],
  );
  await db.query(
    "insert into public.staff_members(user_id,display_name,role,is_owner) values($1,'Owner',null,true),($2,'Office','backoffice',false),($3,'Technical','technical',false)",
    [owner, office, technical],
  );
});
async function reserve(
  id: string = randomUUID(),
  email = 'partner@example.com',
  role: string | null = 'technical',
  isOwner = false,
  name = 'Partner',
) {
  const result = await db.query<{ result: unknown }>(
    'select public.begin_staff_invitation($1,$2,$3,$4,$5) result',
    [id, email, name, role, isOwner],
  );
  return StaffInvitationClaimSchema.parse(result.rows[0].result);
}
async function finish(claim: StaffInvitationClaim, sent = true) {
  await admin();
  await db.exec('set role service_role');
  return StaffInvitationSchema.parse(
    (
      await db.query<{ result: unknown }>(
        'select public.finish_staff_invitation($1,$2,$3) result',
        [claim.invitation.id, claim.attemptId, sent],
      )
    ).rows[0].result,
  );
}
async function invitedUser(
  email = 'partner@example.com',
  verified = false,
  password = false,
) {
  await admin();
  const id = randomUUID();
  await db.query(
    'insert into auth.users(id,email,invited_at,email_confirmed_at,encrypted_password) values($1,$2,now(),$3,$4)',
    [
      id,
      email,
      verified ? new Date().toISOString() : null,
      password ? 'fixture-password-hash' : null,
    ],
  );
  return id;
}
async function activate(id: string) {
  await login(id);
  return (
    await db.query<{ result: unknown }>(
      'select public.activate_staff_invitation() result',
    )
  ).rows[0].result;
}

test('only active owners reserve or read invitations; browser cannot bind identities or insert membership', async () => {
  await login(owner);
  const claim = await reserve();
  assert.equal(
    (await db.query('select id,email from public.staff_invitations')).rows
      .length,
    1,
  );
  await assert.rejects(
    db.query('select * from public.staff_invitations'),
    /permission denied/,
  );
  await assert.rejects(
    db.query('select public.finish_staff_invitation($1,$2,true)', [
      claim.invitation.id,
      claim.attemptId,
    ]),
    /permission denied/,
  );
  await assert.rejects(
    db.query('update public.staff_invitations set is_owner=true'),
    /permission denied/,
  );
  for (const id of [office, technical, outsider]) {
    await login(id);
    await assert.rejects(
      reserve(randomUUID(), `${id}@example.com`),
      /owner_required/,
    );
    assert.equal(
      (await db.query('select id,email from public.staff_invitations')).rows
        .length,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into public.staff_members(user_id,display_name,is_owner) values($1,'Attacker',true)",
        [outsider],
      ),
      /permission denied/,
    );
  }
  await admin();
  await db.query(
    'update public.staff_members set active=false,is_owner=true where user_id=$1',
    [office],
  );
  await login(office);
  await assert.rejects(reserve(), /owner_required/);
  await admin();
  await db.exec('set role anon');
  await assert.rejects(reserve(), /permission denied/);
  await assert.rejects(
    db.query('select public.activate_staff_invitation()'),
    /permission denied/,
  );
});

test('email canonicalization, fixed roles and immutable intended access reject collisions and tampering', async () => {
  await login(owner);
  const claim = await reserve(
    randomUUID(),
    ' Partner@Example.COM ',
    null,
    true,
    ' Partner ',
  );
  assert.equal(claim.invitation.email, 'partner@example.com');
  assert.equal(claim.invitation.display_name, 'Partner');
  assert.equal(claim.invitation.role, null);
  assert.equal(claim.invitation.is_owner, true);
  await assert.rejects(
    reserve(randomUUID(), 'PARTNER@example.com'),
    /invitation_email_exists/,
  );
  await assert.rejects(
    reserve(randomUUID(), 'OFFICE@example.com'),
    /invitation_email_exists/,
  );
  await assert.rejects(
    reserve(claim.invitation.id, 'partner@example.com', 'backoffice', true),
    /invitation_conflict/,
  );
  for (const role of ['owner', 'Faglig', '', 'technical,backoffice'])
    await assert.rejects(
      reserve(randomUUID(), 'another@example.com', role),
      /invalid_staff_invitation/,
    );
  for (const email of ['invalid', 'x@y', 'x @example.com'])
    await assert.rejects(
      reserve(randomUUID(), email),
      /invalid_staff_invitation/,
    );
  await assert.rejects(
    reserve(randomUUID(), 'valid@example.com', 'technical', false, ' '),
    /invalid_staff_invitation/,
  );
});

test('verified invited identity must choose password; activation grants exactly the reserved role and is idempotent', async () => {
  for (const [index, role] of [null, 'backoffice', 'technical'].entries()) {
    const email = `member${index}@example.com`;
    await login(owner);
    const claim = await reserve(randomUUID(), email, role, index === 0);
    const id = await invitedUser(email);
    await finish(claim);
    await assert.rejects(activate(id), /invitation_identity_conflict/);
    await admin();
    await db.query(
      'update auth.users set email_confirmed_at=now() where id=$1',
      [id],
    );
    await assert.rejects(activate(id), /invitation_password_required/);
    await admin();
    assert.equal(
      (
        await db.query('select * from public.staff_members where user_id=$1', [
          id,
        ])
      ).rows.length,
      0,
    );
    await db.query(
      "update auth.users set encrypted_password='fixture-password-hash' where id=$1",
      [id],
    );
    const member = StaffSchema.parse(await activate(id));
    assert.equal(member.role, role);
    assert.equal(member.is_owner, index === 0);
    assert.equal(member.access_version, 1);
    assert.equal(member.display_name, 'Partner');
    assert.equal(await activate(id), null);
    await admin();
    const row = (
      await db.query<any>(
        'select * from public.staff_invitations where id=$1',
        [claim.invitation.id],
      )
    ).rows[0];
    assert.equal(row.state, 'activated');
    assert.ok(row.activated_at);
    assert.equal(row.created_by, owner);
    assert.equal(row.auth_user_id, id);
  }
});

test('an unsent or unrelated account cannot activate; existing Auth accounts cannot be bound by email alone', async () => {
  await login(owner);
  const claim = await reserve();
  assert.equal(await activate(outsider), null);
  await admin();
  await db.query(
    'insert into auth.users(id,email,email_confirmed_at,encrypted_password) values($1,$2,now(),$3)',
    [randomUUID(), 'partner@example.com', 'hash'],
  );
  await assert.rejects(finish(claim), /invitation_identity_conflict/);
  await admin();
  assert.equal(
    (await db.query('select * from public.staff_members')).rows.length,
    3,
  );
});

test('pending owner does not count towards last-owner protection; revoked inviting owner blocks activation', async () => {
  await login(owner);
  const claim = await reserve(
    randomUUID(),
    'partner@example.com',
    'technical',
    true,
  );
  const id = await invitedUser('partner@example.com', true, true);
  await finish(claim);
  await admin();
  await assert.rejects(
    db.query(
      'update public.staff_members set is_owner=false where user_id=$1',
      [owner],
    ),
    /last_owner_required/,
  );
  await db.query(
    'update public.staff_members set is_owner=true where user_id=$1',
    [office],
  );
  await db.query(
    'update public.staff_members set is_owner=false where user_id=$1',
    [owner],
  );
  await assert.rejects(activate(id), /invitation_owner_inactive/);
  await admin();
  assert.equal(
    (
      await db.query('select * from public.staff_members where user_id=$1', [
        id,
      ])
    ).rows.length,
    0,
  );
});

test('changed email is rejected and existing inactive members are never overwritten or reactivated', async () => {
  await login(owner);
  const claim = await reserve();
  const id = await invitedUser('partner@example.com', true, true);
  await finish(claim);
  await admin();
  await db.query(
    "update auth.users set email='changed@example.com' where id=$1",
    [id],
  );
  await assert.rejects(activate(id), /invitation_identity_conflict/);
  await admin();
  await db.query(
    "insert into public.staff_members(user_id,display_name,role,active) values($1,'Existing','backoffice',false)",
    [id],
  );
  assert.equal(await activate(id), null);
  await admin();
  const member = StaffSchema.parse(
    (
      await db.query('select * from public.staff_members where user_id=$1', [
        id,
      ])
    ).rows[0],
  );
  assert.equal(member.active, false);
  assert.equal(member.role, 'backoffice');
  assert.equal(member.display_name, 'Existing');
});

test('ambiguous delivery, expired leases and lost responses preserve one invitation with bounded attempts', async () => {
  await login(owner);
  const claim = await reserve();
  await assert.rejects(reserve(claim.invitation.id), /invitation_busy/);
  assert.equal((await finish(claim, false)).state, 'uncertain');
  await login(owner);
  await assert.rejects(reserve(claim.invitation.id), /invitation_cooldown/);
  await admin();
  await db.query(
    "update public.staff_invitations set last_attempt_at=now()-interval '2 minutes' where id=$1",
    [claim.invitation.id],
  );
  await login(owner);
  const retry = await reserve(claim.invitation.id);
  assert.notEqual(retry.attemptId, claim.attemptId);
  await assert.rejects(finish(claim), /invitation_conflict/);
  await invitedUser('partner@example.com', true, true);
  const sent = await finish(retry);
  assert.equal(sent.state, 'sent');
  assert.deepEqual(await finish(retry, false), sent);
  await login(owner);
  const replay = await reserve(claim.invitation.id);
  assert.equal(replay.attemptId, null);
  await admin();
  assert.equal(
    (await db.query('select * from public.staff_invitations')).rows.length,
    1,
  );
  const attempts = (
    await db.query<any>(
      'select outcome from lys_private.staff_invitation_attempts order by started_at',
    )
  ).rows;
  assert.deepEqual(
    attempts.map((row) => row.outcome),
    ['uncertain', 'sent'],
  );
});

test('per-owner request quota is enforced in database even when bypassing the UI', async () => {
  await login(owner);
  for (let i = 0; i < 10; i++)
    await reserve(randomUUID(), `member${i}@example.com`);
  await assert.rejects(
    reserve(randomUUID(), 'one-too-many@example.com'),
    /invitation_limit/,
  );
  await admin();
  assert.equal(
    (await db.query('select * from public.staff_invitations')).rows.length,
    10,
  );
});

test('activation evidence failure rolls back the new membership atomically', async () => {
  await login(owner);
  const claim = await reserve();
  const id = await invitedUser('partner@example.com', true, true);
  await finish(claim);
  await admin();
  await db.exec(
    "create function public.fail_invitation_activation() returns trigger language plpgsql as $$ begin raise exception 'evidence_failed'; end $$; create trigger fail_invitation_activation before update on public.staff_invitations for each row execute function public.fail_invitation_activation();",
  );
  try {
    await assert.rejects(activate(id), /evidence_failed/);
    await admin();
    assert.equal(
      (
        await db.query('select * from public.staff_members where user_id=$1', [
          id,
        ])
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query<any>(
          'select state from public.staff_invitations where id=$1',
          [claim.invitation.id],
        )
      ).rows[0].state,
      'sent',
    );
  } finally {
    await admin();
    await db.exec(
      'drop trigger fail_invitation_activation on public.staff_invitations; drop function public.fail_invitation_activation()',
    );
  }
});
