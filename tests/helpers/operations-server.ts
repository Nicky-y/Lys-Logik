// Local E2E-only Supabase HTTP substitute backed by the actual PostgreSQL migrations.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createTestDatabase, validLead, submissionKey } from './database.ts';
const db = await createTestDatabase();
const staffId = '1054ed20-67f4-4ff8-bd50-b423d7b11baf';
const techId = 'ec421bef-f031-4416-9f30-21871b4c7d30';
const outsiderId = '5b9b39fd-cd5d-46ef-8545-eeb43b24a6b7';
const users = [
  { id: staffId, email: 'staff@example.com' },
  { id: techId, email: 'technical@example.com' },
  { id: outsiderId, email: 'outsider@example.com' },
];
const token = (id: string) =>
  `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: 4102444800, role: 'authenticated' })).toString('base64url')}.fixture-only`;
async function reset() {
  await db.exec(
    'reset role; truncate public.leads,public.staff_members,auth.users cascade;',
  );
  for (const user of users)
    await db.query('insert into auth.users(id) values($1)', [user.id]);
  await db.query(
    "insert into public.staff_members(user_id,display_name,role) values ($1,'Backoffice','backoffice'),($2,'Faglig medarbejder','technical')",
    [staffId, techId],
  );
  await db.query('select public.create_lead_submission($1::uuid,$2::jsonb)', [
    submissionKey,
    JSON.stringify(validLead),
  ]);
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
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
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
        if (url.pathname.startsWith('/rest/v1/rpc/')) {
          const name = url.pathname.split('/').at(-1);
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
        if (url.pathname === '/rest/v1/staff_members')
          rows = (
            await db.query(
              'select * from public.staff_members where user_id=$1',
              [user?.id ?? outsiderId],
            )
          ).rows;
        else if (url.pathname === '/rest/v1/leads') {
          const id = url.searchParams.get('id')?.replace(/^eq\./, '');
          rows = id
            ? (await db.query('select * from public.leads where id=$1', [id]))
                .rows
            : (
                await db.query(
                  'select * from public.leads order by created_at desc,id limit 100 offset $1',
                  [Number(url.searchParams.get('offset') ?? 0)],
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
server.listen(54327, '127.0.0.1', () =>
  console.log('Operations PostgreSQL fixture ready'),
);
process.on('SIGTERM', () => {
  server.close();
  void db.close().then(() => process.exit(0));
});
