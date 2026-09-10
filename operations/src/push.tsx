import { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
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

export function PushSettings({ controller }: { controller: PushController }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [active, setActive] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    void controller
      .active()
      .then((value) => {
        if (mounted) setActive(value);
      })
      .catch(() => { if (mounted) setError('Status kunne ikke hentes. Kontrollér forbindelsen og prøv igen.'); });
    return () => {
      mounted = false;
    };
  }, [controller]);
  async function change() {
    setBusy(true);
    setError('');
    try {
      if (active === null) { setActive(await controller.active()); return; }
      if (active) await controller.disable();
      else await controller.enable();
      setActive(await controller.active());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prøv igen.');
      setActive(await controller.active().catch(() => null));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="install-app-button"
        onClick={() => dialog.current?.showModal()}
      >
        <Bell size={16} /> Notifikationer
      </button>
      <dialog
        ref={dialog}
        className="install-dialog"
        aria-labelledby="push-title"
      >
        <button
          type="button"
          className="icon-button install-close"
          aria-label="Luk notifikationer"
          onClick={() => dialog.current?.close()}
        >
          <X size={20} />
        </button>
        <p className="eyebrow">NYE HENVENDELSER</p>
        <h2 id="push-title">Besked på denne enhed.</h2>
        <p>
          Få en notifikation, når der kommer en ny henvendelse. Tryk på den for
          at åbne sagen. Kundens oplysninger vises først i appen.
        </p>
        <p role="status">
          {active === null ? 'Status for notifikationer er ikke bekræftet endnu.' : active
            ? 'Notifikationer er slået til på denne enhed.'
            : 'Notifikationer er slået fra på denne enhed.'}
        </p>
        {controller.supported ? (
          <button
            className="primary"
            disabled={busy}
            onClick={() => void change()}
          >
            {busy
              ? 'Gemmer…'
              : active === null ? 'Kontrollér status'
              : active
                ? 'Slå notifikationer fra'
                : 'Slå notifikationer til'}
          </button>
        ) : (
          <p>Åbn appen i Chrome på Android for at bruge mobilnotifikationer.</p>
        )}
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        <p className="install-footnote">
          Gælder nye henvendelser efter tilmelding. Levering sker normalt ved
          næste minutkontrol og afhænger af telefonens forbindelse. Log ud for
          at afmelde denne enhed.
        </p>
      </dialog>
    </>
  );
}
