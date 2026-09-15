import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import {
  createAuthSessionStore,
  endBrowserSession,
} from '../operations/src/auth-session.ts';

const url = 'https://logout-fixture.example.com';
const baseKey = 'sb-logout-fixture-auth-token';
function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
  };
}
function session(expiresAt = Math.floor(Date.now() / 1000) + 3600) {
  const payload = Buffer.from(
    JSON.stringify({ sub: 'fixture-user', exp: expiresAt }),
  ).toString('base64url');
  return {
    access_token: `e30.${payload}.fixture`,
    refresh_token: 'fixture-refresh',
    expires_at: expiresAt,
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: 'fixture-user',
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-09-01T00:00:00Z',
    },
  };
}
function clientFor(
  store: ReturnType<typeof createAuthSessionStore>,
  fetcher: typeof fetch,
) {
  return createClient(url, 'sb_publishable_fixture_only', {
    auth: {
      storage: store.storage,
      storageKey: store.storageKey,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: fetcher },
  });
}

test('expired session + failed refresh: logout removes persistence and reopening cannot authenticate', async (t) => {
  const storage = memoryStorage();
  storage.setItem(baseKey, JSON.stringify(session(1)));
  storage.setItem(`${baseKey}-code-verifier`, 'fixture-pkce');
  storage.setItem(`${baseKey}-user`, 'fixture-user');
  storage.setItem('unrelated-preference', 'kept');
  const store = createAuthSessionStore(storage, url);
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  t.mock.method(console, 'error', () => {});
  let refreshCalls = 0;
  const client = clientFor(store, async () => {
    refreshCalls++;
    now += 60_000; // Exhaust SDK refresh retry window without real waits.
    return Response.json(
      { message: 'temporary fixture outage' },
      { status: 503 },
    );
  });
  t.after(() => client.auth.dispose());
  // Control: this installed SDK returns an error without clearing the expired session.
  assert.ok((await client.auth.signOut({ scope: 'local' })).error);
  assert.ok(storage.getItem(baseKey));
  assert.ok(refreshCalls > 0);
  await endBrowserSession(client.auth, store);
  assert.equal(storage.getItem(baseKey), null);
  assert.equal(storage.getItem(`${baseKey}-user`), null);
  assert.equal(storage.getItem(`${baseKey}-code-verifier`), null);
  assert.equal(storage.getItem('unrelated-preference'), 'kept');
  let reopenedRequests = 0;
  const reopened = clientFor(createAuthSessionStore(storage, url), async () => {
    reopenedRequests++;
    return Response.json(session());
  });
  t.after(() => reopened.auth.dispose());
  assert.equal((await reopened.auth.getSession()).data.session, null);
  assert.equal(reopenedRequests, 0);
});

test('another tab completing a refresh after logout cannot restore or overwrite a later login', async (t) => {
  const storage = memoryStorage();
  const first = createAuthSessionStore(storage, url);
  storage.setItem(first.storageKey, JSON.stringify(session()));
  const second = createAuthSessionStore(storage, url);
  let started!: () => void;
  const requestStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let finish!: (response: Response) => void;
  const client = clientFor(second, async () => {
    started();
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  });
  t.after(() => client.auth.dispose());
  await client.auth.getSession();
  const refresh = client.auth.refreshSession();
  await requestStarted;
  first.invalidate();
  const next = createAuthSessionStore(storage, url);
  next.storage.setItem(next.storageKey, JSON.stringify(session()));
  finish(Response.json(session()));
  const result = await refresh;
  assert.ok(result.error);
  assert.equal(second.isCurrent(), false);
  assert.equal(second.storage.getItem(second.storageKey), null);
  assert.throws(() =>
    second.storage.setItem(second.storageKey, JSON.stringify(session())),
  );
  // Late SDK cleanup must not remove the new session either.
  second.storage.removeItem(second.storageKey);
  assert.ok(next.storage.getItem(next.storageKey));
  assert.equal(storage.getItem(baseKey), null);
});

test('cross-process invalidation between storage check and write cleans the stale write', () => {
  const storage = memoryStorage();
  const old = createAuthSessionStore(storage, url);
  const originalSet = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === old.storageKey) {
      storage.setItem = originalSet;
      createAuthSessionStore(storage, url).invalidate();
    }
    originalSet(key, value);
  };
  assert.throws(() =>
    old.storage.setItem(old.storageKey, JSON.stringify(session())),
  );
  assert.equal(storage.getItem(old.storageKey), null);
  const next = createAuthSessionStore(storage, url);
  assert.equal(next.storage.getItem(next.storageKey), null);
});

test('normal local logout preserves remote scope and allows a fresh password login', async (t) => {
  const storage = memoryStorage();
  const store = createAuthSessionStore(storage, url);
  store.storage.setItem(store.storageKey, JSON.stringify(session()));
  const paths: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    paths.push(String(input));
    return new URL(String(input)).pathname.endsWith('/logout')
      ? new Response(null, { status: 204 })
      : Response.json(session());
  };
  const client = clientFor(store, fetcher);
  t.after(() => client.auth.dispose());
  await endBrowserSession(client.auth, store);
  assert.ok(paths.some((path) => path.endsWith('/logout?scope=local')));
  const next = clientFor(createAuthSessionStore(storage, url), fetcher);
  t.after(() => next.auth.dispose());
  assert.equal(
    (
      await next.auth.signInWithPassword({
        email: 'fixture@example.com',
        password: 'fixture-password',
      })
    ).error,
    null,
  );
  assert.equal(
    (await next.auth.getSession()).data.session?.user.id,
    'fixture-user',
  );
});

for (const mode of ['returned-error', 'thrown-error'] as const) {
  test(`push failure and ${mode} from auth do not prevent local cleanup`, async () => {
    const storage = memoryStorage();
    const store = createAuthSessionStore(storage, url);
    store.storage.setItem(store.storageKey, JSON.stringify(session()));
    let disposed = false;
    const order: string[] = [];
    await endBrowserSession(
      {
        async signOut() {
          order.push('auth');
          if (mode === 'thrown-error') throw new Error('fixture failure');
          return { error: new Error('fixture failure') };
        },
        dispose() {
          disposed = true;
        },
      },
      store,
      async () => {
        order.push('push');
        throw new Error('fixture offline');
      },
    );
    assert.deepEqual(order, ['push', 'auth']);
    assert.equal(disposed, true);
    assert.equal(storage.getItem(baseKey), null);
  });
}

for (const mode of ['throws', 'silently-ignores'] as const) {
  test(`storage cleanup that ${mode} never reports successful logout`, async () => {
    const storage = memoryStorage();
    const store = createAuthSessionStore(storage, url);
    store.storage.setItem(store.storageKey, JSON.stringify(session()));
    storage.removeItem = () => {
      if (mode === 'throws') throw new Error('fixture storage failure');
    };
    await assert.rejects(
      endBrowserSession(
        {
          async signOut() {
            return { error: null };
          },
          dispose() {},
        },
        store,
      ),
    );
  });
}
