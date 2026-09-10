import webpush from 'web-push';
import { PushDeliverySchema, pushPayload } from '../contracts/push.ts';
import type { SendPush } from '../application/dispatch-push.ts';

export function createWebPushSender(
  publicKey: string,
  privateKey: string,
  request: typeof fetch = fetch,
): SendPush {
  return async (input) => {
    const delivery = PushDeliverySchema.parse(input);
    const details = webpush.generateRequestDetails(
      delivery.subscription,
      pushPayload(delivery),
      {
        vapidDetails: {
          subject: 'https://app.lysoglogik.dk',
          publicKey,
          privateKey,
        },
        TTL: 3600,
        urgency: 'normal',
        topic: delivery.id.replaceAll('-', ''),
        contentEncoding: 'aes128gcm',
      },
    );
    const response = await request(details.endpoint, {
      method: 'POST',
      headers: details.headers as Record<string, string>,
      body: details.body ? new Uint8Array(details.body) : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    const retry = Number(response.headers.get('retry-after'));
    await response.body?.cancel();
    return {
      status: response.status,
      retryAfter: Number.isFinite(retry)
        ? Math.min(3600, Math.max(60, retry))
        : 60,
    };
  };
}
