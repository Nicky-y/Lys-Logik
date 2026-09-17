import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  StaffSchema,
  StaffAccessCommandSchema,
  StaffAccessReceiptSchema,
  StaffDeactivationCommandSchema,
  type Staff,
  type StaffAccessCommand,
  type StaffAccessReceipt,
  type StaffDeactivationCommand,
} from '../../supabase/functions/_shared/contracts/staff.ts';
import { randomId } from './random-id.ts';
import {
  createStaffInvitationGateway,
  type StaffInvitationGateway,
} from './staff-invitations.ts';

/** Owner-only directory and versioned access changes. Authorization is enforced by RLS/RPC. */
export interface StaffAccessGateway {
  invitations: StaffInvitationGateway;
  list(): Promise<Staff[]>;
  update(command: StaffAccessCommand): Promise<StaffAccessReceipt>;
  /** An active owner may remove another member's access/push enrollment; never their own. Preserves historical records. */
  deactivate(command: StaffDeactivationCommand): Promise<StaffAccessReceipt>;
}
const errors: Record<string, string> = {
  owner_required: 'Kun en aktiv ejer kan ændre medarbejdernes rettigheder.',
  self_deactivation_forbidden:
    'Du kan ikke deaktivere din egen konto. En anden ejer skal gøre det.',
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
  staff_already_inactive:
    'Medarbejderen er allerede deaktiveret. Hent oversigten igen.',
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
    invitations: createStaffInvitationGateway(client),
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
    async deactivate(input) {
      const command = StaffDeactivationCommandSchema.parse(input);
      const { data, error } = await client.rpc('deactivate_staff_member', {
        p_command_id: command.commandId,
        p_user_id: command.userId,
        p_expected_version: command.expectedVersion,
      });
      check(error);
      return StaffAccessReceiptSchema.parse(data);
    },
  };
}

/** A retry retains the confirmed target/version; a new observed version needs a new confirmation and command. */
export function createStaffDeactivationSender(
  gateway: Pick<StaffAccessGateway, 'deactivate'>,
) {
  let pending: StaffDeactivationCommand | undefined;
  return async (input: Omit<StaffDeactivationCommand, 'commandId'>) => {
    const validated = StaffDeactivationCommandSchema.parse({
      ...input,
      commandId: randomId(),
    });
    if (
      !pending ||
      pending.userId !== validated.userId ||
      pending.expectedVersion !== validated.expectedVersion
    )
      pending = validated;
    const receipt = await gateway.deactivate(pending);
    pending = undefined;
    return receipt;
  };
}
/** Keep the exact command for a lost response; changed input gets a fresh command. */
export function createStaffAccessSender(
  gateway: Pick<StaffAccessGateway, 'update'>,
) {
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
