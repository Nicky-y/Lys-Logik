import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  StaffSchema,
  WorkRoleSchema,
  StaffAccessCommandSchema,
  StaffAccessReceiptSchema,
  canManageStaff,
  canWorkWithCustomers,
  staffAccessLabel,
} from '../supabase/functions/_shared/contracts/staff.ts';
import { createStaffAccessSender } from '../operations/src/staff-access.ts';

test('owner and work role are independent across every supported combination', () => {
  for (const role of [null, ...WorkRoleSchema.options])
    for (const is_owner of [false, true])
      for (const active of [false, true]) {
        const staff = StaffSchema.parse({
          user_id: randomUUID(),
          display_name: 'Test',
          active,
          role,
          is_owner,
          access_version: 1,
        });
        assert.equal(canManageStaff(staff), active && is_owner);
        assert.equal(canWorkWithCustomers(staff), active && role !== null);
        assert.equal(staffAccessLabel(staff).startsWith('Ejer ·'), is_owner);
      }
});
test('role, owner, identity and version inputs are guarded without coercion or implicit privilege defaults', () => {
  const valid = {
    commandId: randomUUID(),
    userId: randomUUID(),
    expectedVersion: 1,
    role: 'backoffice',
    isOwner: false,
  };
  for (const patch of [
    { role: 'owner' },
    { role: 'Faglig' },
    { role: '' },
    { role: ['technical'] },
    { isOwner: 'false' },
    { expectedVersion: 0 },
    { userId: 'someone' },
    { commandId: 'same' },
    { isAdmin: true },
  ])
    assert.equal(
      StaffAccessCommandSchema.safeParse({ ...valid, ...patch }).success,
      false,
    );
  assert.equal(
    StaffAccessCommandSchema.parse({ ...valid, role: null, isOwner: true })
      .role,
    null,
  );
  assert.equal(
    StaffSchema.safeParse({
      user_id: randomUUID(),
      display_name: 'Test',
      role: 'technical',
      active: true,
    }).success,
    false,
  );
});
test('lost access-change responses retain the command, while changed choices get a new ID', async () => {
  const commands: unknown[] = [];
  let fail = true;
  const send = createStaffAccessSender({
    update: async (command) => {
      commands.push(command);
      if (fail) throw new Error('lost');
      return StaffAccessReceiptSchema.parse({
        userId: command.userId,
        version: 2,
        eventId: randomUUID(),
      });
    },
  });
  const input = StaffAccessCommandSchema.omit({ commandId: true }).parse({
    userId: randomUUID(),
    expectedVersion: 1,
    role: 'technical',
    isOwner: false,
  });
  await assert.rejects(send(input));
  await assert.rejects(send(input));
  assert.deepEqual(commands[0], commands[1]);
  fail = false;
  await send({ ...input, role: null });
  assert.notDeepEqual(commands[1], commands[2]);
});
