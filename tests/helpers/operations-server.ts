// Local E2E-only Supabase HTTP substitute backed by the actual PostgreSQL migrations.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createTestDatabase, validLead, submissionKey } from './database.ts';
import { inviteStaffHandler } from '../../supabase/functions/_shared/http/invite-staff.ts';
import {
  StaffInvitationClaimSchema,
  StaffInvitationSchema,
  StaffInvitationError,
} from '../../supabase/functions/_shared/contracts/staff-invitation.ts';
const db = await createTestDatabase();
const staffId = '1054ed20-67f4-4ff8-bd50-b423d7b11baf';
const techId = 'ec421bef-f031-4416-9f30-21871b4c7d30';
const outsiderId = '5b9b39fd-cd5d-46ef-8545-eeb43b24a6b7';
const ownerId = 'dbfd477b-bdf1-4897-9896-a42e2a36c3e6';
const users = [
  { id: staffId, email: 'staff@example.com' },
  { id: techId, email: 'technical@example.com' },
  { id: outsiderId, email: 'outsider@example.com' },
  { id: ownerId, email: 'owner@example.com' },
];
let invitationEmails = 0;
const token = (id: string) =>
  `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: 4102444800, role: 'authenticated' })).toString('base64url')}.fixture-only`;
async function reset() {
  users.splice(4);
  invitationEmails = 0;
  await db.exec(
    'reset role; truncate public.leads,public.staff_members,auth.users cascade;',
  );
  for (const user of users)
    await db.query('insert into auth.users(id,email) values($1,$2)', [
      user.id,
      user.email,
    ]);
  await db.query(
    "insert into public.staff_members(user_id,display_name,role) values ($1,'Backoffice','backoffice'),($2,'Faglig medarbejder','technical')",
    [staffId, techId],
  );
  await db.query(
    "insert into public.staff_members(user_id,display_name,role,is_owner) values($1,'Ejer uden arbejdsrolle',null,true)",
    [ownerId],
  );
  await db.query('select public.create_lead_submission($1::uuid,$2::jsonb)', [
    submissionKey,
    JSON.stringify(validLead),
  ]);
  await db.exec('update lys_private.mail_settings set enabled=true');
}
await reset();
let queue = Promise.resolve();
const server = createServer((req, res) => {
  queue = queue
    .then(async () => {
      const origin = req.headers.origin;
      if (
        origin === 'http://127.0.0.1:5175' ||
        origin === 'http://127.0.0.1:5176'
      )
        res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader(
        'Access-Control-Allow-Headers',
        'authorization,apikey,content-type,x-client-info,range,prefer,accept,range-unit,x-supabase-api-version,accept-profile,content-profile,x-retry-count',
      );
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET,HEAD,POST,PUT,OPTIONS',
      );
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range');
      res.setHeader('Content-Type', 'application/json');
      const reply = (data: unknown, status = 200) => {
        res.statusCode = status;
        res.end(JSON.stringify(data));
      };
      try {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }
        const url = new URL(req.url!, 'http://127.0.0.1:54327');
        if (url.pathname === '/health') {
          reply({ ready: true });
          return;
        }
        if (url.pathname === '/_test/reset') {
          await reset();
          reply({ ok: true });
          return;
        }
        if (url.pathname === '/_test/state') {
          await db.exec('reset role');
          reply(
            (
              await db.query(
                'select (select count(*)::int from public.leads) as leads,(select count(*)::int from public.lead_events) as events',
              )
            ).rows[0],
          );
          return;
        }
        if (url.pathname === '/_test/staff-access') {
          await db.exec('reset role');
          reply(
            (
              await db.query(
                'select * from public.staff_access_events order by created_at,id',
              )
            ).rows,
          );
          return;
        }
        if (url.pathname === '/_test/staff-invitations') {
          await db.exec('reset role');
          reply({
            invitations: (
              await db.query(
                'select id,email,state,auth_user_id,role,is_owner from public.staff_invitations',
              )
            ).rows,
            members: (await db.query('select * from public.staff_members'))
              .rows,
            emails: invitationEmails,
          });
          return;
        }
        if (url.pathname === '/_test/accept-invitation') {
          // Auth-provider boundary fixture: simulates possession and verification
          // of the emailed link. PostgreSQL activation and browser onboarding remain real.
          await db.exec('reset role');
          const user = users.find(
            (item) => item.email === url.searchParams.get('email'),
          );
          if (!user) {
            reply({ error: 'fixture_user_missing' }, 404);
            return;
          }
          await db.query(
            'update auth.users set email_confirmed_at=now() where id=$1',
            [user.id],
          );
          reply({
            hash: `#access_token=${token(user.id)}&token_type=bearer&expires_in=3600&refresh_token=fixture-refresh&type=invite`,
          });
          return;
        }
        if (url.pathname === '/_test/staff-access-conflict') {
          await db.exec('reset role');
          await db.query(
            "select set_config('request.jwt.claim.sub',$1,false)",
            [ownerId],
          );
          await db.query('select public.set_staff_access($1,$2,1,$3,false)', [
            randomUUID(),
            staffId,
            'technical',
          ]);
          reply({ ok: true });
          return;
        }
        if (url.pathname === '/_test/inbox-pages') {
          await db.exec('reset role');
          await db.query(
            'select public.create_lead_submission(gen_random_uuid(),$1::jsonb) from generate_series(1,101)',
            [JSON.stringify({ ...validLead, name: 'Igangværende testkunde' })],
          );
          await db.exec(
            "update public.leads set status='clarifying' where name='Igangværende testkunde'; update public.leads set created_at='2026-01-01T10:00:00Z' where name='Anna Jensen'",
          );
          reply({ ok: true });
          return;
        }
        if (url.pathname === '/_test/case-tracks') {
          await db.exec('reset role');
          if (req.method === 'POST') {
            await db.query(
              "select set_config('request.jwt.claim.sub',$1,false)",
              [techId],
            );
            for (const [status, name] of [
              ['clarifying', 'Afklaring test'],
              ['qualified', 'Klar test'],
              ['scheduled', 'Aftale test'],
              ['completed', 'Udført test'],
              ['invoiced', 'Faktureret test'],
              ['paid', 'Betalt test'],
              ['rejected', 'Arkiv test'],
            ]) {
              await db.query('select public.create_lead_submission($1,$2)', [
                randomUUID(),
                JSON.stringify({ ...validLead, name }),
              ]);
              if (status === 'qualified' || status === 'scheduled') {
                await db.query(
                  "select public.record_lead_review(id,version,$1,'approved','Opgaven er gennemgået og godkendt.') from public.leads where name=$2",
                  [randomUUID(), name],
                );
                await db.query(
                  "select public.change_lead_status(id,version,$1,'qualified','') from public.leads where name=$2",
                  [randomUUID(), name],
                );
                if (status === 'scheduled') {
                  await db.query(
                    "select public.create_lead_appointment(id,version,$1,'Planlagt opgave','Eksempelvej 1','2026-09-20T08:00:00Z','2026-09-20T10:00:00Z') from public.leads where name=$2",
                    [randomUUID(), name],
                  );
                }
              } else {
                // Read-only UI fixtures: later statuses are seeded by the test administrator.
                // This is not evidence that the corresponding staff commands exist yet.
                await db.query(
                  'update public.leads set status=$1::public.lead_status where name=$2',
                  [status, name],
                );
              }
              await db.query(
                "update public.leads set created_at='2026-01-01T10:00:00Z' where name=$1",
                [name],
              );
            }
          }
          reply(
            (
              await db.query(
                'select id,status,version from public.leads order by id',
              )
            ).rows,
          );
          return;
        }
        if (url.pathname === '/_test/building-automation') {
          await db.exec('reset role');
          if (req.method === 'POST') {
            await db.query(
              'select public.create_lead_submission($1::uuid,$2::jsonb)',
              [
                randomUUID(),
                JSON.stringify({
                  ...validLead,
                  name: 'Bygningsautomatik test',
                  service: 'bygningsautomatik',
                  description: 'Ventilationen kører om natten.',
                }),
              ],
            );
          }
          reply(
            (
              await db.query(
                "select service,status,original_submission from public.leads where service='bygningsautomatik'",
              )
            ).rows,
          );
          return;
        }
        if (url.pathname === '/_test/pilot') {
          await db.exec('reset role');
          if (req.method === 'POST') {
            await db.query(
              'select public.create_lead_submission($1::uuid,$2::jsonb)',
              [
                randomUUID(),
                JSON.stringify({
                  ...validLead,
                  name: 'Pilotkunden',
                  pilotRequested: true,
                }),
              ],
            );
          }
          reply(
            (
              await db.query(
                'select pilot_requested,description,original_submission,status,review_decision from public.leads where pilot_requested=true',
              )
            ).rows,
          );
          return;
        }
        if (url.pathname === '/_test/advance') {
          await db.exec('reset role');
          await db.query(
            "select set_config('request.jwt.claim.sub',$1,false)",
            [techId],
          );
          await db.query(
            "select public.add_lead_note(id,version,$1,'Opdateret af den anden medarbejder') from public.leads",
            [randomUUID()],
          );
          reply({ ok: true });
          return;
        }
        if (url.pathname === '/_test/qualify') {
          await db.exec('reset role');
          await db.query(
            "select set_config('request.jwt.claim.sub',$1,false)",
            [techId],
          );
          await db.query(
            "select public.record_lead_review(id,version,$1,'approved','Opgaven er gennemgået og godkendt.') from public.leads",
            [randomUUID()],
          );
          await db.query(
            "select public.change_lead_status(id,version,$1,'qualified','') from public.leads",
            [randomUUID()],
          );
          reply({ ok: true });
          return;
        }
        if (url.pathname === '/_test/calendar-state') {
          await db.exec('reset role');
          reply(
            (
              await db.query(
                "select count(*)::int as appointments,count(*) filter(where state='booked')::int as booked from public.appointments",
              )
            ).rows[0],
          );
          return;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const body = chunks.length
          ? JSON.parse(Buffer.concat(chunks).toString())
          : {};
        if (url.pathname === '/auth/v1/token') {
          const user = users.find((u) => u.email === body.email);
          if (!user || body.password !== 'fixture-password') {
            reply(
              {
                error: 'invalid_grant',
                error_description: 'Invalid login credentials',
              },
              400,
            );
            return;
          }
          reply({
            access_token: token(user.id),
            refresh_token: 'fixture-refresh',
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            token_type: 'bearer',
            user: {
              ...user,
              aud: 'authenticated',
              role: 'authenticated',
              app_metadata: {},
              user_metadata: {},
              created_at: '2026-09-08T10:00:00Z',
            },
          });
          return;
        }
        if (url.pathname === '/auth/v1/logout') {
          res.statusCode = 204;
          res.end();
          return;
        }
        const user = users.find(
          (u) => req.headers.authorization === `Bearer ${token(u.id)}`,
        );
        await db.exec('reset role');
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
          user?.id ?? '',
        ]);
        await db.exec(user ? 'set role authenticated' : 'set role anon');
        if (url.pathname === '/auth/v1/user') {
          if (!user) {
            reply({ message: 'unauthenticated' }, 401);
            return;
          }
          if (req.method === 'PUT') {
            if (
              typeof body.password !== 'string' ||
              body.password.length < 12
            ) {
              reply({ message: 'weak password' }, 400);
              return;
            }
            await db.exec('reset role');
            await db.query(
              "update auth.users set encrypted_password='fixture-password-hash' where id=$1",
              [user.id],
            );
          }
          reply({
            ...user,
            aud: 'authenticated',
            role: 'authenticated',
            app_metadata: {},
            user_metadata: {},
            created_at: '2026-09-08T10:00:00Z',
          });
          return;
        }
        if (url.pathname === '/functions/v1/invite-staff') {
          const handler = inviteStaffHandler(['http://127.0.0.1:5175'], {
            async reserve(_bearer, command) {
              try {
                return StaffInvitationClaimSchema.parse(
                  (
                    await db.query<{ result: unknown }>(
                      'select public.begin_staff_invitation($1,$2,$3,$4,$5) result',
                      [
                        command.invitationId,
                        command.email,
                        command.displayName,
                        command.role,
                        command.isOwner,
                      ],
                    )
                  ).rows[0].result,
                );
              } catch (error) {
                throw new StaffInvitationError((error as Error).message);
              }
            },
            async send(email) {
              await db.exec('reset role');
              let invited = users.find((item) => item.email === email);
              if (!invited) {
                invited = { id: randomUUID(), email };
                await db.query(
                  'insert into auth.users(id,email,invited_at) values($1,$2,now())',
                  [invited.id, email],
                );
                users.push(invited);
              }
              invitationEmails++;
            },
            async finish(claim, sent) {
              await db.exec('reset role; set role service_role');
              return StaffInvitationSchema.parse(
                (
                  await db.query<{ result: unknown }>(
                    'select public.finish_staff_invitation($1,$2,$3) result',
                    [claim.invitation.id, claim.attemptId, sent],
                  )
                ).rows[0].result,
              );
            },
          });
          const response = await handler(
            new Request(url, {
              method: req.method,
              headers: {
                authorization: req.headers.authorization ?? '',
                origin: origin ?? 'http://127.0.0.1:5175',
              },
              body: JSON.stringify(body),
            }),
          );
          reply(await response.json(), response.status);
          return;
        }
        if (url.pathname.startsWith('/rest/v1/rpc/')) {
          const name = url.pathname.split('/').at(-1);
          if (name === 'deactivate_staff_member') {
            reply((await db.query<{ receipt: unknown }>(
              'select public.deactivate_staff_member($1,$2,$3) receipt',
              [body.p_command_id, body.p_user_id, body.p_expected_version],
            )).rows[0].receipt);
            return;
          }
          if (name === 'activate_staff_invitation') {
            reply(
              (
                await db.query<{ result: unknown }>(
                  'select public.activate_staff_invitation() result',
                )
              ).rows[0].result,
            );
            return;
          }
          if (name === 'set_staff_access') {
            reply(
              (
                await db.query<{ receipt: unknown }>(
                  'select public.set_staff_access($1,$2,$3,$4,$5) receipt',
                  [
                    body.p_command_id,
                    body.p_user_id,
                    body.p_expected_version,
                    body.p_role,
                    body.p_is_owner,
                  ],
                )
              ).rows[0].receipt,
            );
            return;
          }
          if (name === 'customer_mail_enabled') {
            reply(
              (
                await db.query<{ enabled: boolean }>(
                  'select public.customer_mail_enabled() enabled',
                )
              ).rows[0].enabled,
            );
            return;
          }
          if (name === 'queue_customer_message') {
            reply(
              (
                await db.query<{ id: string }>(
                  'select public.queue_customer_message($1,$2,$3,$4) id',
                  [body.p_id, body.p_lead_id, body.p_subject, body.p_body],
                )
              ).rows[0].id,
            );
            return;
          }
          if (
            name === 'register_push_subscription' ||
            name === 'disable_push_subscription' ||
            name === 'push_subscription_active'
          ) {
            const value =
              name === 'register_push_subscription'
                ? JSON.stringify(body.p_subscription)
                : body.p_endpoint;
            reply(
              (
                await db.query<{ receipt: unknown }>(
                  `select public.${name}($1) as receipt`,
                  [value],
                )
              ).rows[0].receipt,
            );
            return;
          }
          const args = [
            body.p_lead_id,
            body.p_expected_version,
            body.p_command_id,
          ];
          let sql = '';
          if (name === 'change_lead_status') {
            sql =
              'select public.change_lead_status($1,$2,$3,$4::public.lead_status,$5) as receipt';
            args.push(body.p_status, body.p_reason);
          }
          if (name === 'add_lead_note') {
            sql = 'select public.add_lead_note($1,$2,$3,$4) as receipt';
            args.push(body.p_body);
          }
          if (name === 'record_lead_review') {
            sql = 'select public.record_lead_review($1,$2,$3,$4,$5) as receipt';
            args.push(body.p_decision, body.p_summary);
          }
          if (name === 'set_lead_waiting') {
            sql = 'select public.set_lead_waiting($1,$2,$3,$4) as receipt';
            args.push(body.p_waiting_on);
          }
          if (!sql) {
            if (name === 'create_lead_appointment') {
              sql =
                'select public.create_lead_appointment($1,$2,$3,$4,$5,$6,$7) receipt';
              args.push(
                body.p_title,
                body.p_location,
                body.p_starts_at,
                body.p_ends_at,
              );
            }
            if (name === 'reschedule_lead_appointment') {
              sql =
                'select public.reschedule_lead_appointment($1,$2,$3,$4,$5,$6,$7,$8,$9) receipt';
              args.push(
                body.p_appointment_id,
                body.p_title,
                body.p_location,
                body.p_starts_at,
                body.p_ends_at,
                body.p_reason,
              );
            }
            if (name === 'cancel_lead_appointment') {
              sql =
                'select public.cancel_lead_appointment($1,$2,$3,$4,$5) receipt';
              args.push(body.p_appointment_id, body.p_reason);
            }
          }
          if (!sql) {
            reply({ message: 'Unknown fixture RPC' }, 404);
            return;
          }
          reply(
            (await db.query<{ receipt: unknown }>(sql, args)).rows[0].receipt,
          );
          return;
        }
        let rows: unknown[] = [];
        if (url.pathname === '/rest/v1/staff_members') {
          const id =
            url.searchParams.get('user_id')?.replace(/^eq\./, '') ?? null;
          rows = (
            await db.query(
              'select * from public.staff_members where ($1::uuid is null or user_id=$1) order by display_name,user_id',
              [id],
            )
          ).rows;
        } else if (url.pathname === '/rest/v1/staff_invitations') {
          rows = (
            await db.query(
              "select id,email,display_name,role,is_owner,state,created_by,created_at,last_attempt_at,sent_at,activated_at from public.staff_invitations where state<>'activated' order by created_at desc",
            )
          ).rows;
        } else if (url.pathname === '/rest/v1/leads') {
          const id = url.searchParams.get('id')?.replace(/^eq\./, '');
          const statusFilter = url.searchParams.get('status');
          const statuses = statusFilter?.startsWith('in.(')
            ? statusFilter.slice(4, -1).split(',')
            : statusFilter?.startsWith('eq.')
              ? [statusFilter.slice(3)]
              : null;
          if (req.method === 'HEAD') {
            const result = await db.query<{ count: number }>(
              'select count(*)::int as count from public.leads where ($1::text[] is null or status::text = any($1::text[]))',
              [statuses],
            );
            res.setHeader('Content-Range', `*/${result.rows[0].count}`);
            reply(null);
            return;
          }
          rows = id
            ? (await db.query('select * from public.leads where id=$1', [id]))
                .rows
            : (
                await db.query(
                  'select * from public.leads where ($2::text[] is null or status::text = any($2::text[])) order by created_at desc,id limit 100 offset $1',
                  [Number(url.searchParams.get('offset') ?? 0), statuses],
                )
              ).rows;
        } else if (url.pathname === '/rest/v1/appointments') {
          const id = url.searchParams.get('lead_id')?.replace(/^eq\./, '');
          rows = id
            ? (
                await db.query(
                  "select * from public.appointments where lead_id=$1 and state='booked'",
                  [id],
                )
              ).rows
            : (
                await db.query(
                  "select a.*,json_build_object('name',l.name,'postal_code',l.postal_code) as lead from public.appointments a join public.leads l on l.id=a.lead_id where a.state='booked' and a.ends_at>$1::timestamptz and a.starts_at<$2::timestamptz order by a.starts_at,a.id limit 100 offset $3",
                  [
                    url.searchParams.get('ends_at')?.replace(/^gt\./, ''),
                    url.searchParams.get('starts_at')?.replace(/^lt\./, ''),
                    Number(url.searchParams.get('offset') ?? 0),
                  ],
                )
              ).rows;
        } else if (url.pathname === '/rest/v1/lead_messages') {
          rows = (
            await db.query(
              'select * from public.lead_messages where lead_id=$1 order by created_at desc,id desc limit 50 offset $2',
              [
                url.searchParams.get('lead_id')?.replace(/^eq\./, ''),
                Number(url.searchParams.get('offset') ?? 0),
              ],
            )
          ).rows;
        } else if (url.pathname === '/rest/v1/lead_events')
          rows = (
            await db.query(
              'select * from public.lead_events where lead_id=$1 order by lead_version desc',
              [url.searchParams.get('lead_id')?.replace(/^eq\./, '')],
            )
          ).rows;
        else {
          reply({ message: 'Unknown fixture route' }, 404);
          return;
        }
        reply(
          req.headers.accept?.includes('application/vnd.pgrst.object+json')
            ? (rows[0] ?? null)
            : rows,
        );
      } catch (error) {
        const e = error as { code?: string; message: string };
        reply(
          { code: e.code, message: e.message },
          e.code === '40001' ? 409 : 400,
        );
      }
    })
    .catch(() => {
      res.statusCode = 500;
      res.end();
    });
});
export const operationsServerReady = new Promise<void>((resolve) =>
  server.listen(54327, '127.0.0.1', resolve),
);
export async function stopOperationsServer() {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await db.close();
}
process.on('SIGTERM', () => {
  server.close();
  void db.close().then(() => process.exit(0));
});
