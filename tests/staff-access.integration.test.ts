import assert from 'node:assert/strict';
import { test, before, beforeEach, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createTestDatabase, validLead } from './helpers/database.ts';
import {
  StaffSchema,
  WorkRoleSchema,
  StaffAccessReceiptSchema,
} from '../supabase/functions/_shared/contracts/staff.ts';
let db: Awaited<ReturnType<typeof createTestDatabase>>;
const owner = 'dbfd477b-bdf1-4897-9896-a42e2a36c3e6';
const office = '1054ed20-67f4-4ff8-bd50-b423d7b11baf';
const tech = 'ec421bef-f031-4416-9f30-21871b4c7d30';
let lead: string;
before(async () => {
  db = await createTestDatabase();
});
after(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "reset role; select set_config('request.jwt.claim.sub','',false); truncate public.leads,public.staff_members,auth.users cascade;",
  );
  await db.query('insert into auth.users(id) values($1),($2),($3)', [
    owner,
    office,
    tech,
  ]);
  await db.query(
    "insert into public.staff_members(user_id,display_name,role,is_owner) values($1,'Ejer',null,true),($2,'Backoffice','backoffice',false),($3,'Faglig','technical',false)",
    [owner, office, tech],
  );
  await db.query('select public.create_lead_submission($1,$2)', [
    randomUUID(),
    JSON.stringify(validLead),
  ]);
  lead = (await db.query<{ id: string }>('select id from public.leads')).rows[0]
    .id;
  await db.exec('update lys_private.mail_settings set enabled=true');
});
async function login(id: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
}
async function change(
  user = office,
  role: string | null = 'backoffice',
  isOwner = true,
  version = 1,
  id = randomUUID(),
) {
  return (
    await db.query<{ receipt: unknown }>(
      'select public.set_staff_access($1,$2,$3,$4,$5) receipt',
      [id, user, version, role, isOwner],
    )
  ).rows[0].receipt;
}
async function admin() {
  await db.exec(
    "reset role; select set_config('request.jwt.claim.sub','',false)",
  );
}

test('owner-only profile reads its directory but cannot read customers or execute any customer mutation', async () => {
  await login(tech);
  await db.query('select public.record_lead_review($1,1,$2,$3,$4)', [
    lead,
    randomUUID(),
    'approved',
    'Opgaven er gennemgået fagligt.',
  ]);
  await db.query('select public.change_lead_status($1,2,$2,$3,null)', [
    lead,
    randomUUID(),
    'qualified',
  ]);
  await db.query('select public.create_lead_appointment($1,3,$2,$3,$4,$5,$6)', [
    lead,
    randomUUID(),
    'Gennemgang',
    '',
    '2026-10-01T09:00:00Z',
    '2026-10-01T10:00:00Z',
  ]);
  await db.query('select public.queue_customer_message($1,$2,$3,$4)', [
    randomUUID(),
    lead,
    'Aftale',
    'Din aftale er klar',
  ]);
  await login(owner);
  assert.equal(
    (await db.query('select * from public.staff_members')).rows.length,
    3,
  );
  for (const table of [
    'leads',
    'lead_events',
    'appointments',
    'lead_messages',
    'mail_message_events',
  ]) {
    assert.equal(
      (await db.query(`select * from public.${table}`)).rows.length,
      0,
      table,
    );
  }
  const operations = [
    [
      'select public.add_lead_note($1,1,$2,$3)',
      [lead, randomUUID(), 'En intern note'],
    ],
    [
      'select public.record_lead_review($1,1,$2,$3,$4)',
      [lead, randomUUID(), 'approved', 'Fagligt vurderet opgave'],
    ],
    [
      'select public.change_lead_status($1,1,$2,$3,null)',
      [lead, randomUUID(), 'clarifying'],
    ],
    [
      'select public.set_lead_waiting($1,1,$2,$3)',
      [lead, randomUUID(), 'staff'],
    ],
    [
      'select public.create_lead_appointment($1,1,$2,$3,$4,$5,$6)',
      [
        lead,
        randomUUID(),
        'Test aftale',
        '',
        '2026-10-01T09:00:00Z',
        '2026-10-01T10:00:00Z',
      ],
    ],
    [
      'select public.queue_customer_message($1,$2,$3,$4)',
      [randomUUID(), lead, 'Emne', 'Besked'],
    ],
    ['select public.register_push_subscription($1)', [JSON.stringify({})]],
    [
      'select public.customer_attachment_source($1,$2)',
      [randomUUID(), randomUUID()],
    ],
    ['select public.customer_mail_enabled()', []],
  ] as const;
  for (const [sql, args] of operations)
    await assert.rejects(db.query(sql, [...args]), /staff_required/);
});
test('ordinary work roles retain work access but cannot administer or promote themselves', async () => {
  for (const id of [office, tech]) {
    await login(id);
    assert.equal((await db.query('select * from public.leads')).rows.length, 1);
    assert.equal(
      (await db.query('select * from public.staff_members')).rows.length,
      1,
    );
    await assert.rejects(change(id, null, true), /owner_required/);
    await assert.rejects(
      db.query('select public.bootstrap_staff_owner($1)', [id]),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        'update public.staff_members set is_owner=true where user_id=$1',
        [id],
      ),
      /permission denied/,
    );
    assert.equal(
      (await db.query('select * from public.staff_access_events')).rows.length,
      0,
    );
  }
  await login(office);
  await assert.rejects(
    db.query('select public.record_lead_review($1,1,$2,$3,$4)', [
      lead,
      randomUUID(),
      'approved',
      'Vurderet opgave',
    ]),
    /reviewer_required/,
  );
});
test('all supported roles and null persist independently of ownership and are validated by the database', async () => {
  await login(owner);
  let version = 1;
  for (const role of [null, ...WorkRoleSchema.options])
    for (const isOwner of [true, false]) {
      const receipt = StaffAccessReceiptSchema.parse(
        await change(office, role, isOwner, version++),
      );
      const member = StaffSchema.parse(
        (
          await db.query(
            'select * from public.staff_members where user_id=$1',
            [office],
          )
        ).rows[0],
      );
      assert.equal(member.role, role);
      assert.equal(member.is_owner, isOwner);
      assert.equal(member.access_version, receipt.version);
    }
  for (const invalid of ['owner', 'Faglig', '', 'backoffice,technical']) {
    await assert.rejects(
      change(office, invalid, true, version),
      /invalid_staff_access/,
    );
    await admin();
    await assert.rejects(
      db.query('update public.staff_members set role=$1 where user_id=$2', [
        invalid,
        office,
      ]),
      /check constraint/,
    );
    await login(owner);
  }
});
test('access changes and audit snapshots are atomic, versioned and idempotent', async () => {
  await login(owner);
  const command = randomUUID();
  const receipt = StaffAccessReceiptSchema.parse(
    await change(office, null, true, 1, command),
  );
  assert.deepEqual(await change(office, null, true, 1, command), receipt);
  const events = (
    await db.query<any>('select * from public.staff_access_events')
  ).rows;
  assert.equal(events.length, 1);
  assert.equal(events[0].actor_id, owner);
  assert.equal(events[0].actor_name, 'Ejer');
  assert.deepEqual(events[0].before_access, {
    role: 'backoffice',
    isOwner: false,
    active: true,
  });
  assert.deepEqual(events[0].after_access, {
    role: null,
    isOwner: true,
    active: true,
  });
  await assert.rejects(
    change(office, 'technical', true, 1),
    /staff_version_conflict/,
  );
  await assert.rejects(
    change(office, 'technical', true, 1, command),
    /command_conflict/,
  );
  await assert.rejects(
    db.exec("update public.staff_access_events set actor_name='Changed'"),
    /permission denied/,
  );
  assert.equal(
    (await db.query('select * from public.staff_access_events')).rows.length,
    1,
  );
  await login(office);
  await assert.rejects(
    change(office, null, true, 1, command),
    /command_conflict/,
  );
});
test('last active owner cannot be removed or deactivated; another owner enables a safe handover', async () => {
  await login(owner);
  await assert.rejects(change(owner, null, false), /last_owner_required/);
  await admin();
  await assert.rejects(
    db.query('update public.staff_members set active=false where user_id=$1', [
      owner,
    ]),
    /last_owner_required/,
  );
  await login(owner);
  await change(office, 'backoffice', true);
  await change(owner, null, false);
  await assert.rejects(change(tech, 'technical', true), /owner_required/);
  await login(office);
  assert.equal(
    (
      await db.query<{ role: string }>(
        'select role from public.staff_members where user_id=$1',
        [office],
      )
    ).rows[0].role,
    'backoffice',
  );
});
test('inactive owners and nonstaff users have no administration or customer access', async () => {
  await admin();
  await db.query(
    'update public.staff_members set is_owner=true,active=false where user_id=$1',
    [office],
  );
  for (const id of [office, randomUUID()]) {
    await login(id);
    await assert.rejects(change(), /owner_required/);
    assert.equal(
      (await db.query('select * from public.staff_members')).rows.length,
      0,
    );
    assert.equal((await db.query('select * from public.leads')).rows.length, 0);
  }
  await db.exec('reset role; set role anon');
  await assert.rejects(change(), /permission denied/);
});
test('first owner bootstrap is server-only, exact and preserves the work role', async () => {
  await admin();
  await db.exec(
    'truncate public.leads,public.staff_members,auth.users cascade',
  );
  await db.query('insert into auth.users(id) values($1),($2)', [office, tech]);
  await db.query(
    "insert into public.staff_members(user_id,display_name,role) values($1,'Backoffice','backoffice')",
    [office],
  );
  await db.query(
    "insert into public.staff_members(user_id,display_name) values($1,'Uden rolle')",
    [tech],
  );
  const untouched = StaffSchema.parse(
    (
      await db.query('select * from public.staff_members where user_id=$1', [
        tech,
      ])
    ).rows[0],
  );
  assert.equal(untouched.role, null);
  assert.equal(untouched.is_owner, false);
  await db.exec('set role service_role');
  await db.query('select public.bootstrap_staff_owner($1)', [office]);
  await assert.rejects(
    db.query('select public.bootstrap_staff_owner($1)', [tech]),
    /owner_already_exists/,
  );
  await login(office);
  const member = StaffSchema.parse(
    (
      await db.query('select * from public.staff_members where user_id=$1', [
        office,
      ])
    ).rows[0],
  );
  assert.equal(member.role, 'backoffice');
  assert.equal(member.is_owner, true);
  assert.equal(
    (await db.query('select * from public.staff_access_events')).rows.length,
    1,
  );
});
test('deployment bootstrap selects only the named existing account and can be repeated safely', async () => {
  await admin();
  await db.exec(
    'truncate public.leads,public.staff_members,auth.users cascade;',
  );
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [
    office,
    'mnbrom@gmail.com',
    tech,
    'someone@example.com',
  ]);
  await db.query(
    "insert into public.staff_members(user_id,display_name,role) values($1,'Backoffice','backoffice'),($2,'Faglig','technical')",
    [office, tech],
  );
  const sql = await readFile(
    new URL('../supabase/operations/bootstrap-owner.sql', import.meta.url),
    'utf8',
  );
  await db.exec(sql);
  await db.exec(sql);
  const members = (
    await db.query<{ user_id: string; role: string; is_owner: boolean }>(
      'select * from public.staff_members',
    )
  ).rows;
  assert.equal(members.find((m) => m.user_id === office)?.is_owner, true);
  assert.equal(members.find((m) => m.user_id === office)?.role, 'backoffice');
  assert.equal(members.find((m) => m.user_id === tech)?.is_owner, false);
  assert.equal(
    (await db.query('select * from public.staff_access_events')).rows.length,
    1,
  );
});

test('failure to record access evidence rolls back rights, version and command receipt together', async () => {
  await admin();
  await db.exec(
    "create function public.fail_staff_evidence() returns trigger language plpgsql as $$ begin raise exception 'evidence_failed'; end $$; create trigger fail_staff_evidence before insert on public.staff_access_events for each row execute function public.fail_staff_evidence();",
  );
  const command = randomUUID();
  try {
    await login(owner);
    await assert.rejects(
      change(office, null, true, 1, command),
      /evidence_failed/,
    );
    const member = StaffSchema.parse(
      (
        await db.query('select * from public.staff_members where user_id=$1', [
          office,
        ])
      ).rows[0],
    );
    assert.equal(member.role, 'backoffice');
    assert.equal(member.is_owner, false);
    assert.equal(member.access_version, 1);
    assert.equal(
      (await db.query('select * from public.staff_access_events')).rows.length,
      0,
    );
    await admin();
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
      'drop trigger fail_staff_evidence on public.staff_access_events; drop function public.fail_staff_evidence();',
    );
  }
});

test('removing a work role stops new push dispatch even when ownership remains', async () => {
  await login(office);
  await db.query('select public.register_push_subscription($1)', [
    JSON.stringify({
      endpoint: 'https://fcm.googleapis.com/fcm/send/test',
      keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) },
    }),
  ]);
  await login(owner);
  await change(office, null, true);
  await admin();
  await db.query('select public.create_lead_submission($1,$2)', [
    randomUUID(),
    JSON.stringify(validLead),
  ]);
  const items = (
    await db.query<{ items: unknown[] }>(
      'select public.claim_push_deliveries() items',
    )
  ).rows[0].items;
  assert.deepEqual(items, []);
  await login(office);
  assert.equal(
    (
      await db.query<{ active: boolean }>(
        'select public.push_subscription_active($1) active',
        ['https://fcm.googleapis.com/fcm/send/test'],
      )
    ).rows[0].active,
    false,
  );
});
