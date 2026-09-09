import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  LeadReceiptSchema,
  type LeadSubmission,
  type SubmissionKey,
} from '../contracts/lead.ts';
import {
  LeadFailure,
  type LeadRepository,
} from '../application/create-lead.ts';

/** Only a server-side privileged client may execute these narrowly granted RPCs. */
export function createSupabaseLeadRepository(
  client: SupabaseClient,
): LeadRepository {
  async function rpc(name: string, key: SubmissionKey, lead: LeadSubmission) {
    const { data, error } = await client.rpc(name, {
      p_key: key,
      p_submission: lead,
    });
    if (error)
      throw new LeadFailure(
        error.message === 'submission_conflict' ? 'conflict' : 'unavailable',
      );
    return data === null ? null : LeadReceiptSchema.parse(data);
  }
  return {
    findSubmission: (key, lead) => rpc('find_lead_submission', key, lead),
    async createSubmission(key, lead) {
      const receipt = await rpc('create_lead_submission', key, lead);
      if (!receipt) throw new LeadFailure('unavailable');
      return receipt;
    },
  };
}

const LimitSchema = z.object({
  allowed: z.boolean(),
  retryAfter: z.number().int().min(0),
});

export function createRequestLimiter(client: SupabaseClient) {
  return async () => {
    const { data, error } = await client.rpc('consume_lead_request');
    if (error) throw new LeadFailure('unavailable');
    return LimitSchema.parse(data);
  };
}
