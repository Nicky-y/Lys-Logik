import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createTestDatabase, validLead } from './helpers/database.ts';
import { StaffAccessReceiptSchema } from '../supabase/functions/_shared/contracts/staff.ts';
let db: Awaited<ReturnType<typeof createTestDatabase>>;
const owner = 'dbfd477b-bdf1-4897-9896-a42e2a36c3e6';
const worker = '1054ed20-67f4-4ff8-bd50-b423d7b11baf';
const other = 'ec421bef-f031-4416-9f30-21871b4c7d30';
const endpoint = 'https://fcm.googleapis.com/fcm/send/deactivation-fixture';
let lead: string;
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
async function deactivate(id = worker, version = 1, command = randomUUID()) {
  return StaffAccessReceiptSchema.parse(
    (
      await db.query<{ receipt: unknown }>(
        'select public.deactivate_staff_member($1,$2,$3) receipt',
        [command, id, version],
      )
    ).rows[0].receipt,
  );
}
beforeEach(async () => {
  await admin();
  await db.exec(
    'truncate public.leads,public.staff_members,auth.users cascade',
  );
  await db.query('insert into auth.users(id) values($1),($2),($3)', [
    owner,
    worker,
    other,
  ]);
  await db.query(
    "insert into public.staff_members(user_id,display_name,role,is_owner) values($1,'Ejer',null,true),($2,'Kollega','technical',false),($3,'Anden',null,false)",
    [owner, worker, other],
  );
  await db.query('select public.create_lead_submission($1,$2)', [
    randomUUID(),
    JSON.stringify(validLead),
  ]);
  lead = (await db.query<{ id: string }>('select id from public.leads')).rows[0]
    .id;
  await db.exec('update lys_private.mail_settings set enabled=true');
  await login(worker);
  await db.query('select public.add_lead_note($1,1,$2,$3)', [
    lead,
    randomUUID(),
    'Kollegaens eksisterende note',
  ]);
  await db.query('select public.register_push_subscription($1)', [
    JSON.stringify({
      endpoint,
      keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) },
    }),
  ]);
});

test('only an active owner can deactivate; no UI bypass, self-service or direct table mutation', async () => {
  for (const id of [worker, other, randomUUID()]) {
    await login(id);
    await assert.rejects(deactivate(), /owner_required/);
    await assert.rejects(
      db.query(
        'update public.staff_members set active=false where user_id=$1',
        [worker],
      ),
      /permission denied/,
    );
  }
  await admin();
  await db.exec('set role anon');
  await assert.rejects(deactivate(), /permission denied/);
  await login(owner);
  for (const [command, id, version] of [
    [null, worker, 1],
    [randomUUID(), null, 1],
    [randomUUID(), worker, 0],
    [randomUUID(), worker, null],
  ])
    await assert.rejects(
      db.query('select public.deactivate_staff_member($1,$2,$3)', [
        command,
        id,
        version,
      ]),
      /invalid_staff_access/,
    );
  await deactivate();
  await admin();
  assert.equal(
    (
      await db.query<{ active: boolean }>(
        'select active from public.staff_members where user_id=$1',
        [worker],
      )
    ).rows[0].active,
    false,
  );
});

test('deactivation preserves actor history and permissions evidence, disables push, and denies the existing identity all work APIs', async () => {
  await admin();
  const before = (
    await db.query('select * from public.lead_events order by lead_version')
  ).rows;
  await login(owner);
  const receipt = await deactivate();
  const event = (
    await db.query<{
      actor_id: string;
      before_access: unknown;
      after_access: unknown;
    }>('select * from public.staff_access_events where id=$1', [
      receipt.eventId,
    ])
  ).rows[0];
  assert.equal(event.actor_id, owner);
  assert.deepEqual(event.before_access, {
    role: 'technical',
    isOwner: false,
    active: true,
  });
  assert.deepEqual(event.after_access, {
    role: 'technical',
    isOwner: false,
    active: false,
  });
  assert.equal(receipt.version, 2);
  await admin();
  assert.deepEqual(
    (await db.query('select * from public.lead_events order by lead_version'))
      .rows,
    before,
  );
  assert.equal(
    (await db.query('select * from auth.users where id=$1', [worker])).rows
      .length,
    1,
  );
  assert.equal(
    (
      await db.query<{ active: boolean }>(
        'select active from lys_private.push_subscriptions where user_id=$1',
        [worker],
      )
    ).rows[0].active,
    false,
  );
  await db.query('select public.create_lead_submission($1,$2)', [
    randomUUID(),
    JSON.stringify(validLead),
  ]);
  assert.deepEqual(
    (
      await db.query<{ items: unknown[] }>(
        'select public.claim_push_deliveries() items',
      )
    ).rows[0].items,
    [],
  );
  // Same identity as before: no refreshed JWT or browser cooperation is required.
  await login(worker);
  for (const table of [
    'leads',
    'lead_events',
    'appointments',
    'lead_messages',
    'staff_members',
    'staff_access_events',
  ])
    assert.equal(
      (await db.query(`select * from public.${table}`)).rows.length,
      0,
      table,
    );
  assert.equal(
    (await db.query('select id from public.staff_invitations')).rows.length,
    0,
  );
  await assert.rejects(
    db.query('select public.add_lead_note($1,2,$2,$3)', [
      lead,
      randomUUID(),
      'Forbidden note',
    ]),
    /staff_required/,
  );
  await assert.rejects(
    db.query('select public.record_lead_review($1,2,$2,$3,$4)', [
      lead,
      randomUUID(),
      'approved',
      'Forbidden review',
    ]),
    /staff_required/,
  );
  await assert.rejects(
    db.query('select public.queue_customer_message($1,$2,$3,$4)', [
      randomUUID(),
      lead,
      'Test',
      'Forbidden message',
    ]),
    /staff_required/,
  );
  await assert.rejects(
    db.query('select public.register_push_subscription($1)', [
      JSON.stringify({
        endpoint,
        keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) },
      }),
    ]),
    /staff_required/,
  );
  assert.equal(
    (
      await db.query<{ result: unknown }>(
        'select public.activate_staff_invitation() result',
      )
    ).rows[0].result,
    null,
  );
});

test('self-deactivation is forbidden with one or multiple owners; only another active owner can remove access', async () => {
  await login(owner);
  await db.query('select public.begin_staff_invitation($1,$2,$3,null,true)', [
    randomUUID(),
    'pending@example.com',
    'Afventende ejer',
  ]);
  await assert.rejects(deactivate(owner), /self_deactivation_forbidden/);
  await db.query('select public.set_staff_access($1,$2,1,null,true)', [
    randomUUID(),
    other,
  ]);
  const before = (
    await db.query('select * from public.staff_members order by user_id')
  ).rows;
  const selfCommand = randomUUID();
  await assert.rejects(
    deactivate(owner, 1, selfCommand),
    /self_deactivation_forbidden/,
  );
  assert.deepEqual(
    (await db.query('select * from public.staff_members order by user_id'))
      .rows,
    before,
  );
  assert.equal(
    (await db.query('select * from public.staff_access_events')).rows.length,
    1,
  );
  await admin();
  assert.equal(
    (
      await db.query(
        'select * from lys_private.staff_access_commands where command_id=$1',
        [selfCommand],
      )
    ).rows.length,
    0,
  );
  await login(other);
  await assert.rejects(deactivate(other, 2), /self_deactivation_forbidden/);
  await deactivate(owner);
  await login(owner);
  await assert.rejects(deactivate(worker), /owner_required/);
  await assert.rejects(
    db.query('select public.begin_staff_invitation($1,$2,$3,null,false)', [
      randomUUID(),
      'forbidden@example.com',
      'Forbidden',
    ]),
    /owner_required/,
  );
  await login(other);
  await assert.rejects(deactivate(other, 2), /self_deactivation_forbidden/);
  await deactivate(worker);
});

test('retries are idempotent and cannot switch target, actor or action; stale versions require a new reviewed command', async () => {
  await login(owner);
  const command = randomUUID();
  const first = await deactivate(worker, 1, command);
  assert.deepEqual(await deactivate(worker, 1, command), first);
  assert.equal(
    (await db.query('select * from public.staff_access_events')).rows.length,
    1,
  );
  await assert.rejects(deactivate(other, 1, command), /command_conflict/);
  await assert.rejects(
    db.query('select public.set_staff_access($1,$2,1,null,false)', [
      command,
      worker,
    ]),
    /command_conflict/,
  );
  await assert.rejects(deactivate(worker, 1), /staff_version_conflict/);
  await assert.rejects(deactivate(worker, 2), /staff_already_inactive/);
  await assert.rejects(deactivate(randomUUID(), 1), /staff_not_found/);
  const updateId = randomUUID();
  await db.query('select public.set_staff_access($1,$2,1,null,true)', [
    updateId,
    other,
  ]);
  await assert.rejects(deactivate(other, 2, updateId), /command_conflict/);
  await assert.rejects(deactivate(other, 1), /staff_version_conflict/);
  await login(other);
  await assert.rejects(deactivate(worker, 1, command), /command_conflict/);
});

test('access-evidence failure rolls back deactivation, push subscription changes and retry receipt', async () => {
  await admin();
  await db.exec(
    "create function public.fail_deactivation_evidence() returns trigger language plpgsql as $$ begin raise exception 'evidence_failed'; end $$; create trigger fail_deactivation_evidence before insert on public.staff_access_events for each row execute function public.fail_deactivation_evidence();",
  );
  const command = randomUUID();
  try {
    await login(owner);
    await assert.rejects(deactivate(worker, 1, command), /evidence_failed/);
    await admin();
    const member = (
      await db.query<{ active: boolean; access_version: number }>(
        'select * from public.staff_members where user_id=$1',
        [worker],
      )
    ).rows[0];
    assert.equal(member.active, true);
    assert.equal(member.access_version, 1);
    assert.equal(
      (
        await db.query<{ active: boolean }>(
          'select active from lys_private.push_subscriptions where user_id=$1',
          [worker],
        )
      ).rows[0].active,
      true,
    );
    assert.equal(
      (
        await db.query(
          'select * from lys_private.staff_access_commands where command_id=$1',
          [command],
        )
      ).rows.length,
      0,
    );
  } finally {
    await admin();
    await db.exec(
      'drop trigger fail_deactivation_evidence on public.staff_access_events; drop function public.fail_deactivation_evidence()',
    );
  }
});
