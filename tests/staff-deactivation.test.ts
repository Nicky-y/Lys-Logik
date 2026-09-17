import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  StaffDeactivationCommandSchema,
  StaffAccessCommandSchema,
  StaffAccessReceiptSchema,
  StaffSchema,
} from '../supabase/functions/_shared/contracts/staff.ts';
import { createStaffDeactivationSender } from '../operations/src/staff-access.ts';
import { createDemoStaffAccess } from '../operations/src/staff-access-demo.ts';

test('deactivation command accepts only guarded identity/version and cannot carry privileges or reactivation', () => {
  const input = {
    commandId: randomUUID(),
    userId: randomUUID(),
    expectedVersion: 1,
  };
  assert.equal(StaffDeactivationCommandSchema.safeParse(input).success, true);
  for (const patch of [
    { commandId: 'same' },
    { userId: '' },
    { expectedVersion: 0 },
    { expectedVersion: '1' },
    { expectedVersion: 1.5 },
    { active: true },
    { role: 'technical' },
    { isOwner: true },
  ])
    assert.equal(
      StaffDeactivationCommandSchema.safeParse({ ...input, ...patch }).success,
      false,
    );
});

test('uncertain deactivation reuses exact command; updated target/version and confirmed success start fresh commands', async () => {
  const calls: Array<ReturnType<typeof StaffDeactivationCommandSchema.parse>> =
    [];
  let fail = true;
  const send = createStaffDeactivationSender({
    deactivate: async (command) => {
      calls.push(command);
      if (fail) throw new Error('Response lost');
      return StaffAccessReceiptSchema.parse({
        userId: command.userId,
        version: command.expectedVersion + 1,
        eventId: randomUUID(),
      });
    },
  });
  const input = StaffDeactivationCommandSchema.omit({ commandId: true }).parse({
    userId: randomUUID(),
    expectedVersion: 1,
  });
  await assert.rejects(send(input));
  await assert.rejects(send(input));
  assert.deepEqual(calls[0], calls[1]);
  await assert.rejects(
    send({
      ...input,
      expectedVersion:
        StaffDeactivationCommandSchema.shape.expectedVersion.parse(2),
    }),
  );
  assert.notEqual(calls[1].commandId, calls[2].commandId);
  fail = false;
  await send(input);
  await send(input);
  assert.notEqual(calls[3].commandId, calls[4].commandId);
});

test('demo rejects self-deactivation with one or multiple owners and preserves another deactivated member and retry rules', async () => {
  const actor = StaffSchema.parse({
    user_id: randomUUID(),
    display_name: 'Prøveejer',
    active: true,
    is_owner: true,
    role: 'technical',
    access_version: 1,
  });
  const gateway = createDemoStaffAccess(actor);
  let colleague = (await gateway.list()).find(
    (m) => m.user_id !== actor.user_id,
  )!;
  const selfCommand = StaffDeactivationCommandSchema.parse({
    commandId: randomUUID(),
    userId: actor.user_id,
    expectedVersion: actor.access_version,
  });
  await assert.rejects(gateway.deactivate(selfCommand), /egen konto/);
  await gateway.update(
    StaffAccessCommandSchema.parse({
      commandId: randomUUID(),
      userId: colleague.user_id,
      expectedVersion: colleague.access_version,
      role: colleague.role,
      isOwner: true,
    }),
  );
  const before = await gateway.list();
  await assert.rejects(gateway.deactivate(selfCommand), /egen konto/);
  assert.deepEqual(await gateway.list(), before);
  colleague = before.find((m) => m.user_id === colleague.user_id)!;
  const command = StaffDeactivationCommandSchema.parse({
    commandId: randomUUID(),
    userId: colleague.user_id,
    expectedVersion: colleague.access_version,
  });
  const receipt = await gateway.deactivate(command);
  assert.deepEqual(await gateway.deactivate(command), receipt);
  const after = (await gateway.list()).find(
    (m) => m.user_id === colleague.user_id,
  )!;
  assert.equal(after.active, false);
  assert.equal(after.role, colleague.role);
  assert.equal(after.access_version, colleague.access_version + 1);
  await assert.rejects(
    gateway.deactivate({
      ...command,
      userId: StaffSchema.shape.user_id.parse(randomUUID()),
    }),
    /allerede brugt/,
  );
  await assert.rejects(
    gateway.deactivate({
      ...command,
      commandId:
        StaffDeactivationCommandSchema.shape.commandId.parse(randomUUID()),
      userId: actor.user_id,
    }),
    /egen konto/,
  );
});
