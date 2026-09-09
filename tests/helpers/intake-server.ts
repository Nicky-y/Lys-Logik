// Test-only loopback server. No Supabase credentials or external email/push services.
import { createServer } from 'node:http';
import { createLeadHandler } from '../../supabase/functions/_shared/http/lead-handler.ts';
import { createTestDatabase, testRepository } from './database.ts';

const db = await createTestDatabase();
const handler = createLeadHandler({
  repository: testRepository(db),
  allowedOrigins: ['http://127.0.0.1:4322'],
  verifyHuman: async (token) => token === 'local-test-proof',
  consumeRequest: async () =>
    (
      await db.query<{ result: { allowed: boolean; retryAfter: number } }>(
        'select public.consume_lead_request() as result',
      )
    ).rows[0].result,
});
const server = createServer(async (incoming, outgoing) => {
  try {
    if (incoming.url === '/health') {
      outgoing.end('ready');
      return;
    }
    if (incoming.url === '/_test/reset' && incoming.method === 'POST') {
      await db.exec(
        'truncate public.leads cascade; update lys_private.lead_request_limit set minute_count=0,hour_count=0',
      );
      outgoing.end('reset');
      return;
    }
    if (incoming.url === '/_test/state') {
      const { rows } =
        await db.query(`select (select count(*)::int from public.leads) as leads,
        (select count(*)::int from public.lead_events) as events,
        (select count(*)::int from lys_private.notification_outbox) as deliveries`);
      outgoing.setHeader('Content-Type', 'application/json');
      outgoing.end(JSON.stringify(rows[0]));
      return;
    }
    if (incoming.url !== '/create-lead') {
      outgoing.statusCode = 404;
      outgoing.end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers))
      if (value)
        headers.set(name, Array.isArray(value) ? value.join(',') : value);
    const request = new Request('http://127.0.0.1:54325/create-lead', {
      method: incoming.method,
      headers,
      body: ['GET', 'HEAD', 'OPTIONS'].includes(incoming.method ?? 'GET')
        ? undefined
        : Buffer.concat(chunks).toString('utf8'),
    });
    const response = await handler(request);
    outgoing.statusCode = response.status;
    response.headers.forEach((value, name) => outgoing.setHeader(name, value));
    outgoing.end(await response.text());
  } catch {
    outgoing.statusCode = 500;
    outgoing.end('Test server error');
  }
});
server.listen(54325, '127.0.0.1', () =>
  console.log('Local intake test server ready'),
);
process.on('SIGTERM', () => {
  server.close();
  void db.close().then(() => process.exit(0));
});
