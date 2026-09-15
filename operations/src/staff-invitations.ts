import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  StaffInvitationCommandSchema,
  StaffInvitationSchema,
  StaffInvitationError,
  type StaffInvitation,
  type StaffInvitationCommand,
} from '../../supabase/functions/_shared/contracts/staff-invitation.ts';
import { randomId } from './random-id.ts';

/** Owner-only invitations. Creating an invitation does not activate employee access. */
export interface StaffInvitationGateway {
  list(): Promise<StaffInvitation[]>;
  invite(command: StaffInvitationCommand): Promise<StaffInvitation>;
}
export function createStaffInvitationGateway(
  client: SupabaseClient,
): StaffInvitationGateway {
  return {
    async list() {
      const { data, error } = await client
        .from('staff_invitations')
        .select(
          'id,email,display_name,role,is_owner,state,created_by,created_at,last_attempt_at,sent_at,activated_at',
        )
        .neq('state', 'activated')
        .order('created_at', { ascending: false });
      if (error) throw new StaffInvitationError('unavailable');
      return z.array(StaffInvitationSchema).parse(data);
    },
    async invite(input) {
      const command = StaffInvitationCommandSchema.parse(input);
      const { data, error } = await client.functions.invoke('invite-staff', {
        body: command,
      });
      if (error) {
        let code = 'unavailable';
        if (error instanceof FunctionsHttpError) {
          try {
            const body = await error.context.json();
            if (typeof body?.code === 'string') code = body.code;
          } catch {
            /* Keep uncertain outcome; no internal provider errors reach the UI. */
          }
        }
        throw new StaffInvitationError(code);
      }
      return StaffInvitationSchema.parse(data);
    },
  };
}

/** Lost responses retry the same validated intent; successful sends are not repeated. */
export function createStaffInvitationSender(gateway: StaffInvitationGateway) {
  let pending: StaffInvitationCommand | undefined;
  return async (
    input: Omit<z.input<typeof StaffInvitationCommandSchema>, 'invitationId'>,
  ) => {
    const command = StaffInvitationCommandSchema.parse({
      ...input,
      invitationId: pending?.invitationId ?? randomId(),
    });
    if (
      pending &&
      (command.email !== pending.email ||
        command.displayName !== pending.displayName ||
        command.role !== pending.role ||
        command.isOwner !== pending.isOwner)
    )
      command.invitationId = StaffInvitationCommandSchema.parse({
        ...input,
        invitationId: randomId(),
      }).invitationId;
    pending = command;
    const result = await gateway.invite(command);
    if (result.state === 'sent' || result.state === 'activated')
      pending = undefined;
    return result;
  };
}
