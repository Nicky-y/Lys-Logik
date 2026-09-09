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
  AppointmentSchema,
  CommandReceiptSchema,
  LeadEventSchema,
} from '../supabase/functions/_shared/contracts/operations.ts';
let db: PGlite;
let leadId: string;
const tech = 'ec421bef-f031-4416-9f30-21871b4c7d30';
const back = '1054ed20-67f4-4ff8-bd50-b423d7b11baf';
before(async () => {
  db = await createTestDatabase();
});
after(async () => {
  await db?.close();
});
async function login(id: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
}
beforeEach(async () => {
  await db.exec(
    'reset role; truncate public.leads,public.staff_members,auth.users cascade;',
  );
  await db.query('insert into auth.users(id) values ($1),($2)', [tech, back]);
  await db.query(
    "insert into public.staff_members(user_id,display_name,role) values ($1,'Faglig','technical'),($2,'Backoffice','backoffice')",
    [tech, back],
  );
  await db.query('select public.create_lead_submission($1,$2)', [
    submissionKey,
    JSON.stringify(validLead),
  ]);
  leadId = (await db.query<{ id: string }>('select id from public.leads'))
    .rows[0].id;
  await login(tech);
  await db.query(
    "select public.record_lead_review($1,1,$2,'approved','Opgaven er gennemgået og godkendt.')",
    [leadId, randomUUID()],
  );
  await db.query("select public.change_lead_status($1,2,$2,'qualified','')", [
    leadId,
    randomUUID(),
  ]);
  await login(back);
});
async function create(
  key = randomUUID(),
  version = 3,
  start = '2026-09-15T09:00:00+02:00',
  end = '2026-09-15T11:00:00+02:00',
) {
  return CommandReceiptSchema.parse(
    (
      await db.query<{ receipt: unknown }>(
        'select public.create_lead_appointment($1,$2,$3,$4,$5,$6,$7) receipt',
        [leadId, version, key, 'Køkkenlamper', 'Eksempelvej 12', start, end],
      )
    ).rows[0].receipt,
  );
}
async function bookings() {
  return (
    await db.query<Record<string, unknown>>(
      'select * from public.appointments order by created_at,id',
    )
  ).rows.map((row) => AppointmentSchema.parse(JSON.parse(JSON.stringify(row))));
}
async function lead() {
  return (
    await db.query<{
      version: number;
      status: string;
      waiting_on: string | null;
      original_submission: unknown;
    }>('select * from public.leads where id=$1', [leadId])
  ).rows[0];
}
async function history() {
  return (
    await db.query('select * from public.lead_events order by lead_version')
  ).rows.map((row) => LeadEventSchema.parse(JSON.parse(JSON.stringify(row))));
}
async function move(
  id: string,
  version = 4,
  key = randomUUID(),
  reason = 'Kunden ønsker en anden dag',
) {
  return CommandReceiptSchema.parse(
    (
      await db.query<{ receipt: unknown }>(
        'select public.reschedule_lead_appointment($1,$2,$3,$4,$5,$6,$7,$8,$9) receipt',
        [
          leadId,
          version,
          key,
          id,
          'Køkkenlamper',
          'Eksempelvej 12',
          '2026-09-16T08:00:00Z',
          '2026-09-16T10:00:00Z',
          reason,
        ],
      )
    ).rows[0].receipt,
  );
}
async function cancel(
  id: string,
  version = 4,
  reason = 'Vi aftaler en ny tid',
) {
  return db.query('select public.cancel_lead_appointment($1,$2,$3,$4,$5)', [
    leadId,
    version,
    randomUUID(),
    id,
    reason,
  ]);
}

test('backoffice books an approved lead with atomic status and actor history', async () => {
  const receipt = await create();
  const [appointment] = await bookings();
  const saved = await lead();
  const event = (await history()).at(-1)!;
  assert.equal(receipt.version, 4);
  assert.equal(saved.status, 'scheduled');
  assert.equal(appointment.starts_at, '2026-09-15T07:00:00.000Z');
  assert.equal(appointment.time_zone, 'Europe/Copenhagen');
  assert.equal(event.event_type, 'appointment_created');
  assert.equal(event.actor_id, back);
  assert.equal(event.lead_version, 4);
  assert.deepEqual(saved.original_submission, validLead);
  assert.equal(event.from_status, 'qualified');
  assert.equal(event.to_status, 'scheduled');
});
test('a lost booking response replays after a later note without creating another appointment', async () => {
  const key = randomUUID();
  const receipt = await create(key);
  await db.query(
    "select public.add_lead_note($1,4,$2,'Kunden lukker os ind')",
    [leadId, randomUUID()],
  );
  assert.deepEqual(await create(key), receipt);
  assert.equal((await bookings()).length, 1);
  assert.equal((await lead()).version, 5);
  await assert.rejects(
    create(key, 3, '2026-09-15T10:00:00Z'),
    /command_conflict/,
  );
});
test('moving an appointment preserves its ID, previous times and reason; retries remain idempotent', async () => {
  await create();
  const [before] = await bookings();
  const key = randomUUID();
  const receipt = await move(before.id, 4, key);
  assert.deepEqual(await move(before.id, 4, key), receipt);
  const [after] = await bookings();
  assert.equal(before.id, after.id);
  assert.equal(after.starts_at, '2026-09-16T08:00:00.000Z');
  assert.equal((await lead()).version, 5);
  const event = (await history()).at(-1)!;
  assert.equal(event.event_type, 'appointment_rescheduled');
  assert.equal(event.body, 'Kunden ønsker en anden dag');
  assert.equal(
    Date.parse(
      AppointmentSchema.parse(event.details.appointmentBefore).starts_at,
    ),
    Date.parse(before.starts_at),
  );
  assert.equal(
    Date.parse(
      AppointmentSchema.parse(event.details.appointmentAfter).starts_at,
    ),
    Date.parse(after.starts_at),
  );
});
test('cancellation retains the booking, returns the case to clarification and permits a later fresh booking', async () => {
  await create();
  const [original] = await bookings();
  await cancel(original.id);
  assert.equal((await bookings())[0].state, 'cancelled');
  assert.equal((await lead()).status, 'clarifying');
  assert.equal((await lead()).waiting_on, 'staff');
  assert.equal((await history()).at(-1)!.event_type, 'appointment_cancelled');
  await db.query("select public.change_lead_status($1,5,$2,'qualified','')", [
    leadId,
    randomUUID(),
  ]);
  await create(randomUUID(), 6);
  assert.equal((await bookings()).length, 2);
  assert.equal(
    (await bookings()).filter((a) => a.state === 'booked').length,
    1,
  );
});
test('archiving a scheduled case cannot leave an active calendar entry behind', async () => {
  await create();
  await db.query(
    "select public.change_lead_status($1,4,$2,'cancelled','Kunden ønsker ikke opgaven')",
    [leadId, randomUUID()],
  );
  assert.equal((await bookings())[0].state, 'cancelled');
  assert.equal((await lead()).status, 'cancelled');
  assert.equal(
    AppointmentSchema.parse((await history()).at(-1)!.details.appointmentAfter)
      .state,
    'cancelled',
  );
});
test('stale edits and an appointment from another case cannot modify a booking', async () => {
  await create();
  const [booking] = await bookings();
  await assert.rejects(move(randomUUID()), /appointment_not_found/);
  await assert.rejects(
    move(booking.id, 4, randomUUID(), ''),
    /reason_required/,
  );
  await move(booking.id);
  await login(tech);
  await assert.rejects(cancel(booking.id, 4), /lead_version_conflict/);
  assert.equal((await bookings())[0].state, 'booked');
});
test('unqualified cases, invalid times and invalid durations do not create calendar state', async () => {
  for (const [start, end] of [
    ['2026-09-15T09:00:00', '2026-09-15T11:00:00Z'],
    ['infinity', 'infinity'],
    ['2026-09-15T09:00:00Z', '2026-09-15T09:00:00Z'],
    ['2026-09-15T09:00:00Z', '2026-09-16T09:01:00Z'],
    ['2019-01-01T09:00:00Z', '2019-01-01T10:00:00Z'],
  ])
    await assert.rejects(
      create(randomUUID(), 3, start, end),
      /invalid_appointment_time/,
    );
  await db.query("select public.change_lead_status($1,3,$2,'clarifying','')", [
    leadId,
    randomUUID(),
  ]);
  await assert.rejects(
    create(randomUUID(), 4),
    /appointment_qualification_required/,
  );
  assert.equal((await bookings()).length, 0);
});
test('history failure rolls back booking, status and command receipt together', async () => {
  await db.exec(
    "reset role; alter table public.lead_events add constraint fail_calendar_history check(event_type<>'appointment_created'); set role authenticated;",
  );
  const key = randomUUID();
  try {
    await assert.rejects(create(key), /fail_calendar_history/);
    assert.equal((await bookings()).length, 0);
    assert.equal((await lead()).version, 3);
  } finally {
    await db.exec(
      'reset role; alter table public.lead_events drop constraint fail_calendar_history; set role authenticated;',
    );
  }
  await create(key);
  assert.equal((await bookings()).length, 1);
});
test('calendar reads and writes require active staff and direct table changes are forbidden', async () => {
  await create();
  const [booking] = await bookings();
  await assert.rejects(
    db.query("update public.appointments set title='Changed'"),
    /permission denied/,
  );
  await login('');
  assert.equal((await bookings()).length, 0);
  await assert.rejects(cancel(booking.id), /staff_required/);
  await login(randomUUID());
  assert.equal((await bookings()).length, 0);
  await assert.rejects(cancel(booking.id), /staff_required/);
  await login(back);
  await db.exec('reset role');
  await db.query(
    'update public.staff_members set active=false where user_id=$1',
    [back],
  );
  await db.exec('set role authenticated');
  assert.equal((await bookings()).length, 0);
  await assert.rejects(cancel(booking.id), /staff_required/);
  await db.exec('set role anon');
  await assert.rejects(
    db.query('select * from public.appointments'),
    /permission denied/,
  );
});
test('deferred invariants reject orphan appointments and scheduled cases without a booking', async () => {
  await db.exec('reset role');
  await assert.rejects(
    db.query("update public.leads set status='scheduled' where id=$1", [
      leadId,
    ]),
    /appointment_status_mismatch/,
  );
  await login(back);
  await create();
  await db.exec('reset role');
  await assert.rejects(
    db.query('delete from public.appointments where lead_id=$1', [leadId]),
    /appointment_status_mismatch/,
  );
  await assert.rejects(
    db.query("update public.leads set status='clarifying' where id=$1", [
      leadId,
    ]),
    /appointment_status_mismatch/,
  );
});
