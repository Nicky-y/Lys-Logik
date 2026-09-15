import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  StaffSchema,
  StaffAccessCommandSchema,
  StaffAccessReceiptSchema,
  type Staff,
  type StaffAccessCommand,
  type StaffAccessReceipt,
} from '../../supabase/functions/_shared/contracts/staff.ts';
import { randomId } from './random-id.ts';

/** Owner-only directory and versioned access changes. Authorization is enforced by RLS/RPC. */
export interface StaffAccessGateway {
  list(): Promise<Staff[]>;
  update(command: StaffAccessCommand): Promise<StaffAccessReceipt>;
}
const errors: Record<string, string> = {
  owner_required: 'Kun en aktiv ejer kan ændre medarbejdernes rettigheder.',
  staff_version_conflict:
    'Rettighederne er ændret af en anden. Hent den seneste version og gennemgå den, før du gemmer igen.',
  last_owner_required:
    'Der skal være mindst én aktiv ejer. Giv først en anden medarbejder ejerrettigheder.',
  invalid_staff_access:
    'Vælg en arbejdsrolle fra listen og kontrollér ejerrettighederne.',
  staff_not_found: 'Medarbejderen findes ikke længere. Hent oversigten igen.',
  command_conflict:
    'Handlingen er allerede brugt med et andet indhold. Hent oversigten igen.',
  no_change: 'Rettighederne er uændrede.',
};
export class StaffAccessError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(
      errors[code] ??
        'Ændringen kunne ikke bekræftes. Dine valg er bevaret. Prøv igen.',
    );
    this.code = code;
  }
}
export function createStaffAccessGateway(
  client: SupabaseClient,
): StaffAccessGateway {
  function check(error: { message: string } | null) {
    if (error)
      throw new StaffAccessError(
        Object.keys(errors).find((key) => error.message === key) ??
          'unavailable',
      );
  }
  return {
    async list() {
      const { data, error } = await client
        .from('staff_members')
        .select('user_id,display_name,role,is_owner,active,access_version')
        .order('display_name')
        .order('user_id');
      check(error);
      return z.array(StaffSchema).parse(data);
    },
    async update(input) {
      const command = StaffAccessCommandSchema.parse(input);
      const { data, error } = await client.rpc('set_staff_access', {
        p_command_id: command.commandId,
        p_user_id: command.userId,
        p_expected_version: command.expectedVersion,
        p_role: command.role,
        p_is_owner: command.isOwner,
      });
      check(error);
      return StaffAccessReceiptSchema.parse(data);
    },
  };
}
/** Keep the exact command for a lost response; changed input gets a fresh command. */
export function createStaffAccessSender(gateway: StaffAccessGateway) {
  let pending: { payload: string; command: StaffAccessCommand } | undefined;
  return async (input: Omit<StaffAccessCommand, 'commandId'>) => {
    const payload = JSON.stringify(input);
    if (!pending || pending.payload !== payload)
      pending = {
        payload,
        command: StaffAccessCommandSchema.parse({
          ...input,
          commandId: randomId(),
        }),
      };
    const receipt = await gateway.update(pending.command);
    pending = undefined;
    return receipt;
  };
}
