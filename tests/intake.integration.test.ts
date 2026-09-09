import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import {
  createTestDatabase,
  validLead,
  submissionKey,
} from './helpers/database.ts';

let db: PGlite;
before(async () => {
  db = await createTestDatabase();
});
after(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);
    truncate public.leads, public.staff_members, auth.users cascade;
    update lys_private.lead_request_limit set minute_start=now(),minute_count=0,hour_start=now(),hour_count=0,max_per_minute=20,max_per_hour=200;`);
});

async function submit(key = submissionKey, lead: unknown = validLead) {
  return (
    await db.query<{ receipt: { reference: string } }>(
      'select public.create_lead_submission($1::uuid,$2::jsonb) as receipt',
      [key, JSON.stringify(lead)],
    )
  ).rows[0].receipt;
}
async function counts() {
  return (
    await db.query(`select (select count(*)::int from public.leads) leads,
    (select count(*)::int from public.lead_events) events,
    (select count(*)::int from lys_private.notification_outbox) deliveries,
    (select count(*)::int from lys_private.lead_submissions) submissions`)
  ).rows[0];
}

test('migration atomically creates snapshot, receipt, event and two pending delivery intents', async () => {
  const receipt = await submit();
  assert.match(receipt.reference, /^[0-9a-f-]{36}$/);
  assert.deepEqual(await counts(), {
    leads: 1,
    events: 1,
    deliveries: 2,
    submissions: 1,
  });
  const { rows } = await db.query(
    'select original_submission,phone,postal_code,status,version from public.leads',
  );
  assert.deepEqual(rows[0], {
    original_submission: validLead,
    phone: '+4512345678',
    postal_code: '0800',
    status: 'new',
    version: 1,
  });
  assert.deepEqual(
    (
      await db.query(
        'select distinct state from lys_private.notification_outbox',
      )
    ).rows,
    [{ state: 'pending' }],
  );
});

test('same key and snapshot replay one receipt without duplicate events or deliveries', async () => {
  const first = await submit();
  assert.deepEqual(await submit(), first);
  assert.deepEqual(await counts(), {
    leads: 1,
    events: 1,
    deliveries: 2,
    submissions: 1,
  });
});

test('two genuine enquiries from the same person remain two unchanged snapshots', async () => {
  const first = await submit();
  const second = await submit('755d91f3-d760-4faf-b659-7612d996a050');
  assert.notEqual(first.reference, second.reference);
  assert.deepEqual(await counts(), {
    leads: 2,
    events: 2,
    deliveries: 4,
    submissions: 2,
  });
});

test('reused key with changed details is rejected without overwriting the original', async () => {
  await submit();
  await assert.rejects(
    submit(submissionKey, { ...validLead, name: 'Changed Name' }),
    /submission_conflict/,
  );
  assert.equal(
    (await db.query<{ name: string }>('select name from public.leads')).rows[0]
      .name,
    'Anna Jensen',
  );
});

test('outbox failure rolls back the complete intake transaction', async () => {
  await db.exec(
    `alter table lys_private.notification_outbox add constraint simulated_failure check (kind <> 'lead_received.customer');`,
  );
  try {
    await assert.rejects(submit(), /simulated_failure/);
    assert.deepEqual(await counts(), {
      leads: 0,
      events: 0,
      deliveries: 0,
      submissions: 0,
    });
  } finally {
    await db.exec(
      'alter table lys_private.notification_outbox drop constraint simulated_failure',
    );
  }
});

test('database rejects invalid payloads even if application validation is bypassed', async () => {
  for (const lead of [
    null,
    [],
    { ...validLead, status: 'paid' },
    { ...validLead, terms: false },
    { ...validLead, name: 123 },
    { ...validLead, email: 'invalid' },
    { ...validLead, phone: '+4612345678' },
    { ...validLead, description: 'tiny' },
  ]) {
    await assert.rejects(submit(submissionKey, lead));
  }
  assert.deepEqual(await counts(), {
    leads: 0,
    events: 0,
    deliveries: 0,
    submissions: 0,
  });
});

test('anonymous callers cannot read enquiries or execute privileged intake RPCs', async () => {
  await submit();
  await db.exec('set role anon');
  await assert.rejects(
    db.query('select * from public.leads'),
    /permission denied/,
  );
  await assert.rejects(submit(), /permission denied/);
  await assert.rejects(
    db.query('select public.consume_lead_request()'),
    /permission denied/,
  );
  await assert.rejects(
    db.query('select * from lys_private.lead_submissions'),
    /permission denied/,
  );
});

test('login alone grants no lead access; only an active staff membership does', async () => {
  await submit();
  const userId = 'a99f1c8f-49d5-44d9-9142-b1241bbfb166';
  await db.query('insert into auth.users (id) values ($1)', [userId]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    userId,
  ]);
  await db.exec('set role authenticated');
  assert.equal((await db.query('select * from public.leads')).rows.length, 0);
  await assert.rejects(submit(), /permission denied/);
  await assert.rejects(
    db.query(
      "insert into public.staff_members (user_id,display_name) values (auth.uid(),'Self promotion')",
    ),
    /permission denied/,
  );
  await db.exec('reset role');
  await db.query(
    "insert into public.staff_members (user_id,display_name) values ($1,'Anna')",
    [userId],
  );
  await db.exec('set role authenticated');
  assert.equal((await db.query('select * from public.leads')).rows.length, 1);
  assert.equal(
    (await db.query('select * from public.lead_events')).rows.length,
    1,
  );
  await assert.rejects(
    db.query("update public.leads set status='paid'"),
    /permission denied/,
  );
  await assert.rejects(
    db.query('delete from public.lead_events'),
    /permission denied/,
  );
  await db.exec(
    'reset role; update public.staff_members set active=false; set role authenticated',
  );
  assert.equal((await db.query('select * from public.leads')).rows.length, 0);
});

test('global limiter is durable, enforces its configured maximum and resets after the window', async () => {
  await db.exec('update lys_private.lead_request_limit set max_per_minute=2');
  const consume = async () =>
    (
      await db.query<{ result: { allowed: boolean; retryAfter: number } }>(
        'select public.consume_lead_request() result',
      )
    ).rows[0].result;
  assert.equal((await consume()).allowed, true);
  assert.equal((await consume()).allowed, true);
  const denied = await consume();
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfter >= 1 && denied.retryAfter <= 60);
  await db.exec(
    "update lys_private.lead_request_limit set minute_start=now()-interval '2 minutes'",
  );
  assert.equal((await consume()).allowed, true);
  await db.exec(
    'update lys_private.lead_request_limit set hour_count=max_per_hour',
  );
  assert.equal((await consume()).allowed, false);
});
