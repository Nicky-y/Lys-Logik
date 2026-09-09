import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import {
  createTestDatabase,
  validLead,
  submissionKey,
} from './helpers/database.ts';
import {
  OperationsLeadSchema,
  CommandReceiptSchema,
  LeadEventSchema,
} from '../supabase/functions/_shared/contracts/operations.ts';
let db: PGlite;
let leadId: string;
const technical = 'ec421bef-f031-4416-9f30-21871b4c7d30';
const backoffice = '1054ed20-67f4-4ff8-bd50-b423d7b11baf';
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
  await db.query('insert into auth.users(id) values ($1),($2)', [
    technical,
    backoffice,
  ]);
  await db.query(
    "insert into public.staff_members(user_id,display_name,role) values ($1,'Faglig medarbejder','technical'),($2,'Backoffice','backoffice')",
    [technical, backoffice],
  );
  await db.query('select public.create_lead_submission($1::uuid,$2::jsonb)', [
    submissionKey,
    JSON.stringify(validLead),
  ]);
  leadId = (await db.query<{ id: string }>('select id from public.leads'))
    .rows[0].id;
  await login(technical);
});
async function login(id: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
}
async function status(
  to: string,
  version = 1,
  key = randomUUID(),
  reason = '',
) {
  return (
    await db.query<{ receipt: unknown }>(
      'select public.change_lead_status($1::uuid,$2,$3::uuid,$4::public.lead_status,$5) as receipt',
      [leadId, version, key, to, reason],
    )
  ).rows[0].receipt;
}
async function review(decision = 'approved', version = 1) {
  return db.query(
    'select public.record_lead_review($1::uuid,$2,$3::uuid,$4,$5)',
    [
      leadId,
      version,
      randomUUID(),
      decision,
      'Opgaven er gennemgået og vurderet fagligt.',
    ],
  );
}
async function note(body: string, version = 1, key = randomUUID()) {
  return db.query('select public.add_lead_note($1::uuid,$2,$3::uuid,$4)', [
    leadId,
    version,
    key,
    body,
  ]);
}
async function state() {
  return (
    await db.query<Record<string, unknown>>(
      'select * from public.leads where id=$1',
      [leadId],
    )
  ).rows[0];
}
async function events() {
  return (
    await db.query<Record<string, unknown>>(
      'select * from public.lead_events where lead_id=$1 order by lead_version',
      [leadId],
    )
  ).rows;
}

test('status and actor history commit together without changing the original enquiry', async () => {
  const receipt = CommandReceiptSchema.parse(await status('clarifying'));
  const lead = OperationsLeadSchema.parse(
    JSON.parse(JSON.stringify(await state())),
  );
  assert.equal(lead.status, 'clarifying');
  assert.equal(lead.waiting_on, 'staff');
  assert.equal(lead.version, 2);
  assert.deepEqual((await state()).original_submission, validLead);
  const event = LeadEventSchema.parse(
    JSON.parse(JSON.stringify((await events())[1])),
  );
  assert.equal(event.id, receipt.eventId);
  assert.equal(event.actor_id, technical);
  assert.equal(event.actor_name, 'Faglig medarbejder');
  assert.equal(event.from_status, 'new');
  assert.equal(event.to_status, 'clarifying');
  assert.equal(event.lead_version, 2);
});
test('a lost response can replay exactly once, even after another later command', async () => {
  const key = randomUUID();
  const receipt = await status('clarifying', 1, key);
  await note('Senere note', 2);
  assert.deepEqual(await status('clarifying', 1, key), receipt);
  assert.equal((await events()).length, 3);
  await assert.rejects(
    status('cancelled', 1, key, 'Andet indhold'),
    /command_conflict/,
  );
  await login(backoffice);
  await assert.rejects(status('clarifying', 1, key), /command_conflict/);
});
test('a second employee with a stale version cannot overwrite the first change', async () => {
  await status('clarifying');
  await login(backoffice);
  await assert.rejects(
    status('cancelled', 1, randomUUID(), 'Ikke relevant'),
    /lead_version_conflict/,
  );
  assert.equal((await state()).status, 'clarifying');
  assert.equal((await events()).length, 2);
});
test('technical review is independent evidence and qualification requires it', async () => {
  await assert.rejects(status('qualified'), /review_required/);
  await review();
  assert.equal((await state()).status, 'new');
  await status('qualified', 2);
  assert.equal((await state()).reviewed_by, technical);
  await assert.rejects(review('declined', 3), /return_to_clarifying/);
  assert.equal((await events()).length, 3);
});
test('backoffice can add notes but cannot impersonate a technical reviewer', async () => {
  await login(backoffice);
  await assert.rejects(review(), /reviewer_required/);
  await note('Ring til kunden efter klokken 16.');
  assert.equal((await events())[1].actor_id, backoffice);
  await assert.rejects(
    db.query(
      "update public.staff_members set role='technical' where user_id=auth.uid()",
    ),
    /permission denied/,
  );
});
test('waiting is separate from status and clears when leaving clarification', async () => {
  await assert.rejects(
    db.query('select public.set_lead_waiting($1,1,$2,$3)', [
      leadId,
      randomUUID(),
      'customer',
    ]),
    /invalid_waiting_state/,
  );
  await status('clarifying');
  await db.query('select public.set_lead_waiting($1,2,$2,$3)', [
    leadId,
    randomUUID(),
    'customer',
  ]);
  assert.equal((await state()).status, 'clarifying');
  assert.equal((await state()).waiting_on, 'customer');
  await status('cancelled', 3, randomUUID(), 'Kunden har aflyst');
  assert.equal((await state()).waiting_on, null);
});
test('invalid transitions and missing future milestones are rejected', async () => {
  await assert.rejects(status('new'), /invalid_transition/);
  await assert.rejects(status('cancelled'), /reason_required/);
  await assert.rejects(status('scheduled'), /appointment_required/);
  await assert.rejects(status('paid'), /workflow_not_ready/);
  await status('rejected', 1, randomUUID(), 'Opgaven passer ikke');
  await assert.rejects(status('clarifying', 2), /reason_required/);
  await status('clarifying', 2, randomUUID(), 'Kunden har nye oplysninger');
  assert.equal((await events()).length, 3);
});
test('history failure rolls back state, version and idempotency receipt', async () => {
  await db.exec(
    "reset role; alter table public.lead_events add constraint simulated_history_failure check(event_type<>'status_changed'); set role authenticated;",
  );
  const key = randomUUID();
  try {
    await assert.rejects(
      status('clarifying', 1, key),
      /simulated_history_failure/,
    );
    assert.equal((await state()).version, 1);
    assert.equal((await events()).length, 1);
  } finally {
    await db.exec(
      'reset role; alter table public.lead_events drop constraint simulated_history_failure; set role authenticated;',
    );
  }
  await status('clarifying', 1, key);
  assert.equal((await state()).version, 2);
});
test('no login, unapproved login and revoked staff cannot read or command leads', async () => {
  await login('');
  await assert.rejects(note('Uautoriseret note'), /staff_required/);
  assert.equal((await events()).length, 0);
  await login(randomUUID());
  await assert.rejects(status('clarifying'), /staff_required/);
  await login(technical);
  const key = randomUUID();
  await status('clarifying', 1, key);
  await db.exec('reset role');
  await db.query(
    'update public.staff_members set active=false where user_id=$1',
    [technical],
  );
  await db.exec('set role authenticated');
  await assert.rejects(status('clarifying', 1, key), /staff_required/);
  assert.equal((await events()).length, 0);
  await db.exec('set role anon');
  await assert.rejects(note('Anonym note'), /permission denied/);
});
test('notes are validated, append-only and keep deterministic per-lead ordering', async () => {
  await assert.rejects(note('  '), /invalid_note/);
  await assert.rejects(note('x'.repeat(3001)), /invalid_note/);
  await note('  Første note  ');
  await note('Anden note', 2);
  const history = await events();
  assert.deepEqual(
    history.map((e) => e.lead_version),
    [1, 2, 3],
  );
  assert.equal(history[1].body, 'Første note');
  await assert.rejects(
    db.query("update public.lead_events set body='Changed'"),
    /permission denied/,
  );
  await assert.rejects(
    db.query('delete from public.lead_events'),
    /permission denied/,
  );
});
