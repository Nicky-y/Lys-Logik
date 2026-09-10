import { PushSubscriptionSchema } from '../../supabase/functions/_shared/contracts/push.ts';

export interface PushBrowser {
  supported: boolean;
  permission(): NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  subscription(): Promise<PushSubscriptionJSON | null>;
  subscribe(): Promise<PushSubscriptionJSON>;
  unsubscribe(): Promise<void>;
}
export interface PushGateway {
  active(endpoint: string): Promise<boolean>;
  register(subscription: PushSubscriptionJSON): Promise<void>;
  disable(endpoint: string): Promise<void>;
}
export function createPushController(
  browser: PushBrowser,
  gateway: PushGateway,
) {
  return {
    supported: browser.supported,
    async active() {
      if (!browser.supported || browser.permission() !== 'granted')
        return false;
      const sub = await browser.subscription();
      return sub?.endpoint ? gateway.active(sub.endpoint) : false;
    },
    async enable() {
      if (!browser.supported)
        throw new Error(
          'Åbn appen i Chrome på Android for at bruge mobilnotifikationer.',
        );
      // Permission is requested only from the employee's explicit button click.
      if ((await browser.requestPermission()) !== 'granted')
        throw new Error(
          'Notifikationer er ikke tilladt. Du kan ændre tilladelsen i browserens indstillinger for siden.',
        );
      const existing = await browser.subscription();
      if (existing?.endpoint && (await gateway.active(existing.endpoint)))
        return;
      if (existing) await browser.unsubscribe();
      const sub = await browser.subscribe();
      try {
        PushSubscriptionSchema.parse(sub);
        await gateway.register(sub);
      } catch {
        await browser.unsubscribe().catch(() => {});
        throw new Error(
          'Notifikationer kunne ikke slås til. Prøv igen, når forbindelsen er tilbage.',
        );
      }
    },
    async disable() {
      if (!browser.supported) return;
      const sub = await browser.subscription();
      if (!sub?.endpoint) return;
      // Remove the browser capability even if the server is temporarily unavailable.
      await browser.unsubscribe();
      await gateway.disable(sub.endpoint);
    },
  };
}
export type PushController = ReturnType<typeof createPushController>;
