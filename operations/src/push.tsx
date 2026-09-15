import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createPushController,
  type PushBrowser,
  type PushController,
} from './push-controller';

export function browserPushController(
  client: SupabaseClient,
  key: string,
): PushController {
  const supported =
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
  const registration = async () => {
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg?.active)
      throw new Error(
        'Luk appen og åbn den igen for at gøre notifikationer klar.',
      );
    return reg;
  };
  const port: PushBrowser = {
    supported,
    permission: () => Notification.permission,
    requestPermission: () => Notification.requestPermission(),
    async subscription() {
      return (
        (
          await (await registration()).pushManager.getSubscription()
        )?.toJSON() ?? null
      );
    },
    async subscribe() {
      const reg = await registration();
      await new Promise<void>((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => {
          channel.port1.close();
          reject(
            new Error(
              'Luk alle appens vinduer og faner, og åbn appen igen for at aktivere opdateringen.',
            ),
          );
        }, 3000);
        channel.port1.onmessage = (event) => {
          if (event.data?.push === true) {
            clearTimeout(timer);
            channel.port1.close();
            resolve();
          }
        };
        reg.active!.postMessage({ type: 'PUSH_CAPABILITY' }, [channel.port2]);
      });
      return (
        await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        })
      ).toJSON();
    },
    async unsubscribe() {
      const sub = await (await registration()).pushManager.getSubscription();
      if (sub && !(await sub.unsubscribe()))
        throw new Error('Notifikationer kunne ikke slås fra. Prøv igen.');
    },
  };
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error)
      throw new Error('Forbindelsen til notifikationer fejlede. Prøv igen.');
    return data;
  }
  return createPushController(port, {
    active: async (endpoint) =>
      (await rpc('push_subscription_active', { p_endpoint: endpoint })) ===
      true,
    register: async (subscription) => {
      await rpc('register_push_subscription', { p_subscription: subscription });
    },
    disable: async (endpoint) => {
      await rpc('disable_push_subscription', { p_endpoint: endpoint });
    },
  });
}

export function PushSettings({
  controller,
  unavailableReason,
}: {
  controller?: PushController;
  unavailableReason: string;
}) {
  const [active, setActive] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const changing = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    setActive(null);
    setError('');
    changing.current = false;
    const refresh = async () => {
      if (changing.current || document.visibilityState === 'hidden') return;
      const request = ++generation.current;
      setBusy(true);
      try {
        const value = controller?.supported ? await controller.active() : null;
        if (request === generation.current) {
          setActive(value);
          setError('');
        }
      } catch {
        if (request === generation.current) {
          setActive(null);
          setError(
            'Status kunne ikke hentes. Kontrollér forbindelsen og prøv igen.',
          );
        }
      } finally {
        if (request === generation.current) setBusy(false);
      }
    };
    void refresh();
    // Recheck after returning from Android/browser settings, without asking permission.
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      generation.current++;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [controller]);
  async function change() {
    if (!controller?.supported || busy || changing.current) return;
    changing.current = true;
    const request = ++generation.current;
    setBusy(true);
    setError('');
    try {
      if (active !== null) {
        if (active) await controller.disable();
        else await controller.enable();
      }
      const value = await controller.active();
      if (request === generation.current) setActive(value);
    } catch (err) {
      const value = await controller.active().catch(() => null);
      if (request === generation.current) {
        setError(err instanceof Error ? err.message : 'Prøv igen.');
        setActive(value);
      }
    } finally {
      if (request === generation.current) {
        setBusy(false);
        changing.current = false;
      }
    }
  }
  const unavailable = !controller
    ? unavailableReason
    : !controller.supported
      ? 'Åbn appen i Chrome på Android for at bruge mobilnotifikationer.'
      : '';
  const status =
    unavailable ||
    (active === null
      ? 'Status for notifikationer er ikke bekræftet endnu.'
      : active
        ? 'Notifikationer er slået til på denne enhed.'
        : 'Notifikationer er slået fra på denne enhed.');
  return (
    <div className="device-setting-row">
      <span className="device-setting-icon">
        <Bell size={22} aria-hidden="true" />
      </span>
      <div className="device-setting-copy">
        <h3 id="push-title">Notifikationer</h3>
        <p>
          Få besked om nye henvendelser og svar fra kunder. Tryk på
          notifikationen for at åbne sagen.
        </p>
        <p id="push-status" role="status">
          {status}
        </p>
      </div>
      <div className="device-setting-action">
        <button
          type="button"
          role="switch"
          className="notification-switch"
          aria-labelledby="push-title"
          aria-describedby="push-status"
          aria-checked={active === true}
          aria-busy={busy}
          disabled={busy || active === null || !!unavailable}
          onClick={() => void change()}
        >
          <span className="notification-switch-track" aria-hidden="true" />
          <span aria-hidden="true">
            {busy
              ? 'Vent…'
              : unavailable
                ? '—'
                : active === null
                  ? 'Ukendt'
                  : active
                    ? 'Til'
                    : 'Fra'}
          </span>
        </button>
      </div>
      {(error || (active === null && !unavailable && !busy)) && (
        <div className="device-setting-feedback">
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          {active === null && !unavailable && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void change()}
            >
              Kontrollér status
            </button>
          )}
        </div>
      )}
    </div>
  );
}
