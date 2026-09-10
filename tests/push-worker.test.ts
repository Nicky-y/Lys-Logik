import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
test('push displays fixed private text, groups retries and opens only the matching app case', async () => {
  const handlers: Record<string, (event: any) => void> = {};
  const shown: any[] = [];
  const opened: string[] = [];
  runInNewContext(
    readFileSync(
      new URL('../operations/service-worker.js', import.meta.url),
      'utf8',
    ),
    {
      URL,
      self: {
        location: { origin: 'https://app.example' },
        addEventListener: (name: string, fn: any) => {
          handlers[name] = fn;
        },
        registration: {
          showNotification: async (title: string, options: any) => {
            shown.push({ title, ...options });
          },
        },
        clients: {
          matchAll: async () => [],
          openWindow: async (url: string) => {
            opened.push(url);
          },
        },
      },
    },
  );
  let completion: Promise<void> | undefined;
  const waitUntil = (p: Promise<void>) => {
    completion = p;
  };
  const leadId = '1054ed20-67f4-4ff8-bd50-b423d7b11baf';
  const deliveryId = 'ec421bef-f031-4416-9f30-21871b4c7d30';
  handlers.push({
    data: {
      json: () => ({
        leadId,
        deliveryId,
        title: 'Private name',
        body: 'Private description',
        url: 'https://evil.example',
      }),
    },
    waitUntil,
  });
  await completion;
  assert.equal(shown[0].title, 'Ny henvendelse · Lys & Logik');
  assert.equal(shown[0].tag, deliveryId);
  assert.equal(shown[0].renotify, false);
  assert.ok(!JSON.stringify(shown).includes('Private'));
  handlers.notificationclick({
    notification: { data: shown[0].data, close() {} },
    waitUntil,
  });
  await completion;
  assert.deepEqual(opened, ['https://app.example/#/leads/' + leadId]);
  handlers.notificationclick({
    notification: { data: { leadId: 'https://evil.example' }, close() {} },
    waitUntil,
  });
  await completion;
  assert.equal(opened[1], 'https://app.example/#/pipeline');
  handlers.push({
    data: {
      json: () => {
        throw new Error('bad JSON');
      },
    },
    waitUntil,
  });
  await completion;
  assert.equal(shown.length, 2);
});
