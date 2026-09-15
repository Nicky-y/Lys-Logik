import { randomId } from './random-id.ts';

/** Keep Supabase's non-persistent login behavior when the browser blocks storage. */
export function browserAuthSessionStore(supabaseUrl: string) {
  try {
    const storage = window.localStorage;
    const probe = `lys-logik:storage-check:${randomId()}`;
    storage.setItem(probe, probe);
    const available = storage.getItem(probe) === probe;
    storage.removeItem(probe);
    if (available) return createAuthSessionStore(storage, supabaseUrl);
  } catch {
    // Privacy settings can deny even reading window.localStorage.
  }
  const values = new Map<string, string>();
  const temporary = createAuthSessionStore(
    {
      get length() {
        return values.size;
      },
      key: (index) => [...values.keys()][index] ?? null,
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
      clear: () => values.clear(),
    },
    supabaseUrl,
  );
  return {
    ...temporary,
    invalidate() {
      // A temporary storage failure does not prove there was no older disk session.
      // Retry the browser store at logout; never acknowledge success without cleanup.
      createAuthSessionStore(window.localStorage, supabaseUrl).invalidate();
      temporary.invalidate();
    },
  };
}

/** Owns only this project's persisted auth state. A logout changes the storage
 * namespace, so a late refresh in another tab cannot restore the next session. */
export function createAuthSessionStore(storage: Storage, supabaseUrl: string) {
  // Preserve Supabase's default key for sessions saved before this boundary existed.
  const baseKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
  const logoutKey = `lys-logik:logout:${baseKey}`;
  const generation = storage.getItem(logoutKey);
  const storageKey = generation ? `${baseKey}::${generation}` : baseKey;
  const isCurrent = () => storage.getItem(logoutKey) === generation;
  const assertCurrent = () => {
    if (!isCurrent())
      throw new Error('Auth session was ended in this browser.');
  };
  return {
    storageKey,
    logoutKey,
    isCurrent,
    storage: {
      getItem(key: string) {
        return isCurrent() ? storage.getItem(key) : null;
      },
      setItem(key: string, value: string) {
        assertCurrent();
        storage.setItem(key, value);
        // Another browser process can change the generation between storage calls.
        if (!isCurrent()) {
          storage.removeItem(key);
          assertCurrent();
        }
      },
      removeItem(key: string) {
        // SDK cleanup still targets its original namespace, never a newer login.
        storage.removeItem(key);
      },
    },
    invalidate() {
      const next = randomId();
      storage.setItem(logoutKey, next);
      if (storage.getItem(logoutKey) !== next)
        throw new Error('Could not end the stored auth session.');
      const owns = (key: string) =>
        key === baseKey ||
        key.startsWith(`${baseKey}-`) ||
        key.startsWith(`${baseKey}::`);
      // Include Supabase's user/PKCE keys, and older logout namespaces.
      const keys = Array.from({ length: storage.length }, (_, i) =>
        storage.key(i),
      ).filter((key): key is string => key !== null && owns(key));
      for (const key of keys) storage.removeItem(key);
      for (const key of keys) {
        if (storage.getItem(key) !== null)
          throw new Error('Could not remove the stored auth session.');
      }
    },
  };
}

/** Attempts normal server revocation, then guarantees local cleanup independently
 * of refresh/revocation errors. Resolves only after the local cleanup succeeds.
 * The caller must discard UI state and reload to use a fresh auth client. */
export async function endBrowserSession(
  auth: {
    signOut(options: { scope: 'local' }): Promise<{ error: unknown }>;
    dispose(): void;
  },
  store: ReturnType<typeof createAuthSessionStore>,
  disablePush?: () => Promise<void>,
) {
  try {
    await disablePush?.();
  } catch {
    // Browser unsubscribe is attempted before its optional server registration.
  }
  try {
    // A returned or thrown error must not prevent the independent local cleanup.
    await auth.signOut({ scope: 'local' });
  } catch {
    // Offline logout cannot promise server-side revocation.
  }
  store.invalidate();
  auth.dispose();
}
