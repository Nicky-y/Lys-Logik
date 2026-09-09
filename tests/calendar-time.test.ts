import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  copenhagenInstant,
  copenhagenLocal,
  monthDays,
  occursOn,
} from '../operations/src/calendar-time.ts';
import { AppointmentInputSchema } from '../supabase/functions/_shared/contracts/operations.ts';

test('Copenhagen appointments use UTC instants in winter and summer independent of device timezone', () => {
  assert.equal(
    copenhagenInstant('2026-01-15T09:30'),
    '2026-01-15T08:30:00.000Z',
  );
  assert.equal(
    copenhagenInstant('2026-07-15T09:30'),
    '2026-07-15T07:30:00.000Z',
  );
  assert.equal(copenhagenLocal('2026-07-15T07:30:00Z'), '2026-07-15T09:30');
});
test('clock changes cannot silently move or ambiguously schedule an appointment', () => {
  assert.throws(() => copenhagenInstant('2026-03-29T02:30'), /findes ikke/);
  assert.throws(() => copenhagenInstant('2026-10-25T02:30'), /to gange/);
  assert.equal(
    copenhagenInstant('2026-03-29T03:00'),
    '2026-03-29T01:00:00.000Z',
  );
  assert.equal(
    copenhagenInstant('2026-10-25T03:00'),
    '2026-10-25T02:00:00.000Z',
  );
  assert.throws(() => copenhagenInstant('2026-02-30T09:00'), /gyldig/);
});
test('month grid starts on Monday and interval membership respects midnight end exclusivity', () => {
  const days = monthDays('2026-09');
  assert.equal(days.length, 42);
  assert.equal(days[0], '2026-08-31');
  assert.equal(days[41], '2026-10-11');
  const booking = {
    starts_at: '2026-09-08T21:00:00Z',
    ends_at: '2026-09-08T22:00:00Z',
  };
  assert.equal(occursOn(booking, '2026-09-08'), true);
  assert.equal(occursOn(booking, '2026-09-09'), false);
  assert.equal(
    occursOn({ ...booking, ends_at: '2026-09-08T22:01:00Z' }, '2026-09-09'),
    true,
  );
});
test('appointment input rejects invalid durations and enforces agreed date and text boundaries', () => {
  const valid = {
    title: 'Køkkenlamper',
    location: '',
    startsAt: '2026-09-08T08:00:00Z',
    endsAt: '2026-09-08T10:00:00Z',
  };
  assert.equal(AppointmentInputSchema.safeParse(valid).success, true);
  for (const change of [
    { endsAt: valid.startsAt },
    { endsAt: '2026-09-09T08:01:00Z' },
    { startsAt: '2019-12-31T23:00:00Z' },
    { title: '  ' },
    { location: 'x'.repeat(301) },
    { startsAt: '2026-09-08T08:00:00' },
  ])
    assert.equal(
      AppointmentInputSchema.safeParse({ ...valid, ...change }).success,
      false,
    );
});
