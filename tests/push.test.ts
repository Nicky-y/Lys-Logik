import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createPushController,
  type PushBrowser,
} from '../operations/src/push-controller.ts';
import {
  dispatchPush,
  classifyPushResponse,
} from '../supabase/functions/_shared/application/dispatch-push.ts';
import {
  PushDeliverySchema,
  pushPayload,
} from '../supabase/functions/_shared/contracts/push.ts';
import { createWebPushSender } from '../supabase/functions/_shared/infrastructure/web-push.ts';
import webpush from 'web-push';
import { createECDH, randomBytes } from 'node:crypto';
const sub = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/fixture',
  keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) },
};
const delivery = PushDeliverySchema.parse({
  id: '1054ed20-67f4-4ff8-bd50-b423d7b11baf',
  leaseId: 'ec421bef-f031-4416-9f30-21871b4c7d30',
  leadId: '5b9b39fd-cd5d-46ef-8545-eeb43b24a6b7',
  subscription: sub,
});
test('permission denial never subscribes or registers; persistence failure removes the browser subscription', async () => {
  const calls: string[] = [];
  const browser: PushBrowser = {
    supported: true,
    permission: () => 'default',
    requestPermission: async () => 'denied',
    subscription: async () => null,
    subscribe: async () => {
      calls.push('subscribe');
      return sub;
    },
    unsubscribe: async () => {
      calls.push('unsubscribe');
    },
  };
  const backend = {
    active: async () => false,
    register: async () => {
      calls.push('register');
      throw new Error('offline');
    },
    disable: async () => {
      calls.push('disable');
    },
  };
  const controller = createPushController(browser, backend);
  await assert.rejects(controller.enable(), /ikke tilladt/);
  assert.deepEqual(calls, []);
  browser.requestPermission = async () => 'granted';
  await assert.rejects(controller.enable(), /kunne ikke slås til/);
  assert.deepEqual(calls, ['subscribe', 'register', 'unsubscribe']);
});
test('logout/disable removes local subscription before contacting server, even if offline', async () => {
  const calls: string[] = [];
  const browser: PushBrowser = {
    supported: true,
    permission: () => 'granted',
    requestPermission: async () => 'granted',
    subscription: async () => sub,
    subscribe: async () => sub,
    unsubscribe: async () => {
      calls.push('unsubscribe');
    },
  };
  const controller = createPushController(browser, {
    active: async () => true,
    register: async () => {},
    disable: async () => {
      calls.push('server');
      throw new Error('offline');
    },
  });
  await assert.rejects(controller.disable());
  assert.deepEqual(calls, ['unsubscribe', 'server']);
});
test('provider errors are classified for bounded retries and every device gets its own completion', async () => {
  assert.deepEqual(
    [201, 404, 410, 429, 503, 400, 403].map(classifyPushResponse),
    ['accepted', 'gone', 'gone', 'retry', 'retry', 'rejected', 'rejected'],
  );
  const outcomes: string[] = [];
  await dispatchPush(
    {
      claim: async () => [delivery],
      complete: async (item, result) => {
        assert.equal(item.leaseId, delivery.leaseId);
        outcomes.push(result);
      },
    },
    async () => {
      throw new Error('network');
    },
  );
  assert.deepEqual(outcomes, ['retry']);
  assert.deepEqual(JSON.parse(pushPayload(delivery)), {
    leadId: delivery.leadId,
    deliveryId: delivery.id,
  });
});
test('real Web Push encryption produces an authenticated request with redirect and timeout guards', async () => {
  const keys = webpush.generateVAPIDKeys();
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const actual = {
    ...delivery,
    subscription: {
      ...sub,
      keys: {
        p256dh: ecdh.getPublicKey().toString('base64url'),
        auth: randomBytes(16).toString('base64url'),
      },
    },
  };
  let called = false;
  const send = createWebPushSender(
    keys.publicKey,
    keys.privateKey,
    async (url, options) => {
      called = true;
      assert.equal(url, sub.endpoint);
      assert.equal(options?.redirect, 'error');
      assert.ok(options?.signal);
      const headers = new Headers(options?.headers);
      assert.match(headers.get('authorization')!, /^vapid /);
      const token = headers.get('authorization')!.match(/t=([^,]+)/)![1];
      const claims = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString(),
      );
      assert.equal(claims.sub, 'https://app.lysoglogik.dk');
      assert.equal(headers.get('content-encoding'), 'aes128gcm');
      assert.ok(options?.body instanceof Uint8Array);
      assert.ok(
        !Buffer.from(options!.body as Uint8Array).includes(
          Buffer.from(delivery.leadId),
        ),
      );
      return new Response(null, { status: 201 });
    },
  );
  assert.equal((await send(PushDeliverySchema.parse(actual))).status, 201);
  assert.ok(called);
  await assert.rejects(
    send({
      ...delivery,
      subscription: {
        ...delivery.subscription,
        endpoint: 'https://localhost/x' as any,
      },
    }),
  );
});

test('a failed completion waits for in-flight siblings before the invocation ends', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const second = {
    ...delivery,
    id: 'f5b9b39f-cd5d-46ef-8545-eeb43b24a6b7' as typeof delivery.id,
  };
  let ended = false;
  let siblingFinished = false;
  const running = dispatchPush(
    {
      claim: async () => [delivery, second],
      complete: async (item) => {
        if (item.id === delivery.id) throw new Error('database down');
        await gate;
        siblingFinished = true;
      },
    },
    async () => ({ status: 201 }),
  );
  const checked = assert.rejects(running, /push_completion_failed/).then(() => {
    ended = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ended, false);
  release();
  await checked;
  assert.equal(siblingFinished, true);
});
