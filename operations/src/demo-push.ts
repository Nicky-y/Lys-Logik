import type { PushController } from './push-controller';

// Local visual preview only: no browser permission, device subscription or RPC.
export function createDemoPushController(): PushController {
  let enabled = false;
  return {
    supported: true,
    active: async () => enabled,
    enable: async () => {
      enabled = true;
    },
    disable: async () => {
      enabled = false;
    },
  };
}
