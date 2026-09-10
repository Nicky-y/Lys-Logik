import assert from 'node:assert/strict';
import { test, before, after, beforeEach } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createTestDatabase, validLead } from './helpers/database.ts';
let db: Awaited<ReturnType<typeof createTestDatabase>>;
const staff = '1054ed20-67f4-4ff8-bd50-b423d7b11baf';
const other = 'ec421bef-f031-4416-9f30-21871b4c7d30';
const subscription = (suffix = 'one') => ({
  endpoint: 'https://fcm.googleapis.com/fcm/send/' + suffix,
  keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) },
});
before(async () => {
  db = await createTestDatabase();
});
after(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    'reset role; truncate public.leads,public.staff_members,auth.users cascade;',
  );
  for (const id of [staff, other]) {
    await db.query('insert into auth.users(id) values($1)', [id]);
    await db.query(
      "insert into public.staff_members(user_id,display_name) values($1,'Test')",
      [id],
    );
  }
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    staff,
  ]);
});
async function register(suffix = 'one') {
  return (
    await db.query<{ id: string }>(
      'select public.register_push_subscription($1) as id',
      [JSON.stringify(subscription(suffix))],
    )
  ).rows[0].id;
}
async function lead() {
  await db.query('select public.create_lead_submission($1,$2)', [
    randomUUID(),
    JSON.stringify(validLead),
  ]);
}
async function claim() {
  return (
    await db.query<{ items: any[] }>(
      'select public.claim_push_deliveries() as items',
    )
  ).rows[0].items;
}
async function finish(item: any, result: string) {
  return (
    await db.query<{ ok: boolean }>(
      'select public.complete_push_delivery($1,$2,$3) as ok',
      [item.id, item.leaseId, result],
    )
  ).rows[0].ok;
}

test('only active staff register; endpoints cannot be stolen or read directly', async () => {
  await db.exec('set role authenticated');
  const id = await register();
  assert.equal(await register(), id);
  await assert.rejects(
    db.query('select * from lys_private.push_subscriptions'),
    /permission denied/,
  );
  await assert.rejects(
    db.query('select public.claim_push_deliveries()'),
    /permission denied/,
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    other,
  ]);
  await assert.rejects(register(), /subscription_owned/);
  await db.exec('reset role');
  await db.query(
    'update public.staff_members set active=false where user_id=$1',
    [other],
  );
  await assert.rejects(register('two'), /staff_required/);
  await db.exec('set role anon');
  await assert.rejects(register('three'), /permission denied/);
});
test('registration rejects arbitrary destinations and malformed keys', async () => {
  for (const endpoint of [
    'https://127.0.0.1/x',
    'https://fcm.googleapis.com.attacker.example/x',
    'https://fcm.googleapis.com:444/x',
    'https://user@fcm.googleapis.com/x',
    'http://fcm.googleapis.com/x',
  ])
    await assert.rejects(
      db.query('select public.register_push_subscription($1)', [
        JSON.stringify({ ...subscription(), endpoint }),
      ]),
      /invalid_subscription/,
    );
  await assert.rejects(
    db.query('select public.register_push_subscription($1)', [
      JSON.stringify({
        ...subscription(),
        keys: { auth: 'bad', p256dh: 'bad' },
      }),
    ]),
    /invalid_subscription/,
  );
});
test('no historical backfill or customer-mail consumption', async () => {
  await lead();
  await register();
  await db.exec(
    "update lys_private.push_subscriptions set subscribed_at=now()+interval '1 minute'",
  );
  assert.equal((await claim()).length, 0);
  const rows = (
    await db.query<{ kind: string; state: string }>(
      'select kind,state from lys_private.notification_outbox order by kind',
    )
  ).rows;
  assert.deepEqual(rows, [
    { kind: 'lead_received.customer', state: 'pending' },
    { kind: 'lead_received.staff', state: 'skipped' },
  ]);
});
test('per-device success is not resent when a sibling retries; claims have exclusive leases', async () => {
  await register();
  await register('two');
  await lead();
  const batch = await claim();
  assert.equal(batch.length, 2);
  assert.equal((await claim()).length, 0);
  await finish(batch[0], 'accepted');
  await finish(batch[1], 'retry');
  assert.equal((await claim()).length, 0);
  await db.exec(
    "update lys_private.push_deliveries set available_at=now()-interval '1 second'",
  );
  const retry = await claim();
  assert.equal(retry.length, 1);
  assert.equal(retry[0].id, batch[1].id);
  assert.notEqual(retry[0].leaseId, batch[1].leaseId);
  assert.equal(await finish(batch[1], 'accepted'), false);
  await finish(retry[0], 'accepted');
  assert.equal((await claim()).length, 0);
  assert.equal(
    (
      await db.query<{ state: string }>(
        "select state from lys_private.notification_outbox where kind='lead_received.staff'",
      )
    ).rows[0].state,
    'sent',
  );
});
test('crashed workers are reclaimed and an old attempt cannot finish a new lease', async () => {
  await register();
  await lead();
  const [old] = await claim();
  await db.exec(
    "update lys_private.push_deliveries set lease_until=now()-interval '1 second'",
  );
  const [next] = await claim();
  assert.equal(old.id, next.id);
  assert.notEqual(old.leaseId, next.leaseId);
  assert.equal(await finish(old, 'accepted'), false);
  assert.equal(await finish(next, 'accepted'), true);
});
test('permanent expiry disables the device, revocation cancels outstanding delivery, retries stop at five', async () => {
  const id = await register();
  await lead();
  await finish((await claim())[0], 'gone');
  assert.equal(
    (
      await db.query<{ active: boolean }>(
        'select active from lys_private.push_subscriptions where id=$1',
        [id],
      )
    ).rows[0].active,
    false,
  );
  await register();
  await lead();
  await db.query(
    'update public.staff_members set active=false where user_id=$1',
    [staff],
  );
  assert.equal((await claim()).length, 0);
  await db.query(
    'update public.staff_members set active=true where user_id=$1',
    [staff],
  );
  await lead();
  for (let i = 0; i < 5; i++) {
    const [attempt] = await claim();
    assert.ok(attempt);
    await finish(attempt, 'retry');
    await db.exec(
      "update lys_private.push_deliveries set available_at=now()-interval '1 second'",
    );
  }
  assert.equal((await claim()).length, 0);
  assert.equal(
    (
      await db.query<{ n: number }>(
        'select max(attempts) as n from lys_private.push_deliveries',
      )
    ).rows[0].n,
    5,
  );
});
