import { z } from 'zod';
import {
  MailJobSchema,
  type MailJob,
  type MailResult,
} from '../contracts/mail.ts';

/** Leased jobs keep their original payload and idempotency key across transport retries. */
export interface CustomerMailQueue {
  claim(): Promise<unknown>;
  complete(job: MailJob, result: MailResult): Promise<void>;
}
export async function dispatchCustomerMail(
  queue: CustomerMailQueue,
  send: (job: MailJob) => Promise<MailResult>,
) {
  const jobs = z
    .array(MailJobSchema)
    .max(5)
    .parse(await queue.claim());
  let completed = 0;
  // Sequential bounded sends also respect a new Resend account's modest rate limit.
  for (const job of jobs) {
    let result: MailResult;
    try {
      result = await send(job);
    } catch {
      result = { state: 'retry' };
    }
    await queue.complete(job, result);
    completed++;
  }
  return { claimed: jobs.length, completed };
}
