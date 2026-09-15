import { createClient } from '@supabase/supabase-js';
import type { StaffInvitationPorts } from '../application/invite-staff.ts';
import { readSupabaseServerKey } from './server-key.ts';
import {
  StaffInvitationClaimSchema,
  StaffInvitationSchema,
  StaffInvitationError,
  staffInvitationErrorMessages,
} from '../contracts/staff-invitation.ts';

/** Uses caller JWT for authorization; the configured server key is confined to Auth and completion. */
export function createStaffInvitationPorts(
  env: { get(name: string): string | undefined },
  request: typeof fetch = fetch,
): StaffInvitationPorts {
  const options = {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        request(input, { ...init, signal: AbortSignal.timeout(12000) }),
    },
  };
  function check(error: { message: string } | null) {
    if (error)
      throw new StaffInvitationError(
        Object.hasOwn(staffInvitationErrorMessages, error.message)
          ? error.message
          : 'unavailable',
      );
  }
  function admin() {
    return createClient(
      env.get('SUPABASE_URL')!,
      readSupabaseServerKey(
        env.get('SUPABASE_SECRET_KEYS'),
        env.get('LEAD_SERVER_KEY_NAME') ?? 'default',
      ),
      options,
    );
  }
  return {
    async reserve(bearer, command) {
      const client = createClient(
        env.get('SUPABASE_URL')!,
        env.get('SUPABASE_ANON_KEY')!,
        {
          ...options,
          global: { ...options.global, headers: { Authorization: bearer } },
        },
      );
      const { data, error } = await client.rpc('begin_staff_invitation', {
        p_id: command.invitationId,
        p_email: command.email,
        p_display_name: command.displayName,
        p_role: command.role,
        p_is_owner: command.isOwner,
      });
      check(error);
      return StaffInvitationClaimSchema.parse(data);
    },
    async send(email) {
      const { error } = await admin().auth.admin.inviteUserByEmail(email, {
        redirectTo: 'https://app.lysoglogik.dk/',
      });
      if (error) throw new Error('invite_delivery_uncertain');
    },
    async finish(claim, sent) {
      const { data, error } = await admin().rpc('finish_staff_invitation', {
        p_id: claim.invitation.id,
        p_attempt_id: claim.attemptId,
        p_sent: sent,
      });
      check(error);
      return StaffInvitationSchema.parse(data);
    },
  };
}
