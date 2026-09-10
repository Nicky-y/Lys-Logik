import {
  PushDeliverySchema,
  type PushDelivery,
  type PushResult,
} from '../contracts/push.ts';

/** Persistence claims bounded batches and fences completion with a per-attempt lease. */
export interface PushRepository {
  claim(): Promise<unknown[]>;
  complete(
    delivery: PushDelivery,
    result: PushResult,
    retryAfter: number,
  ): Promise<void>;
}
export type SendPush = (
  delivery: PushDelivery,
) => Promise<{ status: number; retryAfter?: number }>;

export function classifyPushResponse(status: number): PushResult {
  if (status >= 200 && status < 300) return 'accepted';
  if (status === 404 || status === 410) return 'gone';
  if (status === 408 || status === 429 || status >= 500) return 'retry';
  return 'rejected';
}

/** Provider acceptance is recorded separately for every device; failures never resend successful siblings. */
export async function dispatchPush(repository: PushRepository, send: SendPush) {
  const batch = (await repository.claim()).map((value) =>
    PushDeliverySchema.parse(value),
  );
  if (batch.length > 20) throw new Error('push_batch_limit');
  const stats = { claimed: batch.length, accepted: 0, failed: 0 };
  for (let offset = 0; offset < batch.length; offset += 4) {
    const completed = await Promise.allSettled(
      batch.slice(offset, offset + 4).map(async (delivery) => {
        let result: PushResult = 'retry';
        let retryAfter = 60;
        try {
          const response = await send(delivery);
          result = classifyPushResponse(response.status);
          retryAfter = response.retryAfter ?? 60;
        } catch {
          /* Network errors retain the task for bounded retry. No endpoint/key logging. */
        }
        await repository.complete(delivery, result, retryAfter);
        if (result === 'accepted') stats.accepted++;
        else stats.failed++;
      }),
    );
    if (completed.some(result => result.status === 'rejected')) {
      throw new Error('push_completion_failed');
    }
  }
  return stats;
}
