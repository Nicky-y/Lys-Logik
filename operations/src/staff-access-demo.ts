import {
  StaffSchema,
  StaffAccessCommandSchema,
  StaffAccessReceiptSchema,
  StaffDeactivationCommandSchema,
  canManageStaff,
  type Staff,
} from '../../supabase/functions/_shared/contracts/staff.ts';
import { StaffAccessError, type StaffAccessGateway } from './staff-access.ts';
import { randomId } from './random-id.ts';
import {
  StaffInvitationCommandSchema,
  StaffInvitationSchema,
  StaffInvitationError,
  type StaffInvitation,
} from '../../supabase/functions/_shared/contracts/staff-invitation.ts';

/** Isolated demonstration data; never provisions real accounts or sends invitations. */
export function createDemoStaffAccess(current: Staff): StaffAccessGateway {
  const members = [
    structuredClone(current),
    StaffSchema.parse({
      user_id: '1054ed20-67f4-4ff8-bd50-b423d7b11baf',
      display_name: 'Sam · prøvevisning',
      role: 'backoffice',
      active: true,
      is_owner: false,
      access_version: 1,
    }),
  ];
  const receipts = new Map<
    string,
    {
      payload: string;
      receipt: ReturnType<typeof StaffAccessReceiptSchema.parse>;
    }
  >();
  const invitations = new Map<string, StaffInvitation>();
  return {
    invitations: {
      async list() {
        if (
          !canManageStaff(members.find((m) => m.user_id === current.user_id)!)
        )
          throw new StaffInvitationError('owner_required');
        return structuredClone([...invitations.values()]);
      },
      async invite(input) {
        if (
          !canManageStaff(members.find((m) => m.user_id === current.user_id)!)
        )
          throw new StaffInvitationError('owner_required');
        const command = StaffInvitationCommandSchema.parse(input);
        const previous = invitations.get(command.invitationId);
        if (previous) {
          if (
            previous.email !== command.email ||
            previous.display_name !== command.displayName ||
            previous.role !== command.role ||
            previous.is_owner !== command.isOwner
          )
            throw new StaffInvitationError('invitation_conflict');
          return structuredClone(previous);
        }
        if (
          [...invitations.values()].some((item) => item.email === command.email)
        )
          throw new StaffInvitationError('invitation_email_exists');
        const now = new Date().toISOString();
        const result = StaffInvitationSchema.parse({
          id: command.invitationId,
          email: command.email,
          display_name: command.displayName,
          role: command.role,
          is_owner: command.isOwner,
          state: 'sent',
          created_by: current.user_id,
          created_at: now,
          last_attempt_at: now,
          sent_at: now,
          activated_at: null,
        });
        invitations.set(result.id, result);
        return structuredClone(result);
      },
    },
    async list() {
      return structuredClone(members);
    },
    async update(input) {
      const command = StaffAccessCommandSchema.parse(input);
      const actor = members.find((m) => m.user_id === current.user_id)!;
      if (!canManageStaff(actor)) throw new StaffAccessError('owner_required');
      const payload = JSON.stringify(command);
      const previous = receipts.get(command.commandId);
      if (previous) {
        if (previous.payload !== payload)
          throw new StaffAccessError('command_conflict');
        return previous.receipt;
      }
      const member = members.find((m) => m.user_id === command.userId);
      if (!member) throw new StaffAccessError('staff_not_found');
      if (member.access_version !== command.expectedVersion)
        throw new StaffAccessError('staff_version_conflict');
      if (member.is_owner === command.isOwner && member.role === command.role)
        throw new StaffAccessError('no_change');
      if (
        member.active &&
        member.is_owner &&
        !command.isOwner &&
        !members.some(
          (m) => m.user_id !== member.user_id && m.active && m.is_owner,
        )
      )
        throw new StaffAccessError('last_owner_required');
      const updated = StaffSchema.parse({
        ...member,
        is_owner: command.isOwner,
        role: command.role,
        access_version: member.access_version + 1,
      });
      Object.assign(member, updated);
      const receipt = StaffAccessReceiptSchema.parse({
        userId: member.user_id,
        version: member.access_version,
        eventId: randomId(),
      });
      receipts.set(command.commandId, { payload, receipt });
      return receipt;
    },
    async deactivate(input) {
      const command = StaffDeactivationCommandSchema.parse(input);
      const actor = members.find((m) => m.user_id === current.user_id)!;
      if (!canManageStaff(actor)) throw new StaffAccessError('owner_required');
      if (command.userId === actor.user_id)
        throw new StaffAccessError('self_deactivation_forbidden');
      const payload = JSON.stringify({ action: 'deactivate', ...command });
      const previous = receipts.get(command.commandId);
      if (previous) {
        if (previous.payload !== payload)
          throw new StaffAccessError('command_conflict');
        return previous.receipt;
      }
      const member = members.find((m) => m.user_id === command.userId);
      if (!member) throw new StaffAccessError('staff_not_found');
      if (member.access_version !== command.expectedVersion)
        throw new StaffAccessError('staff_version_conflict');
      if (!member.active) throw new StaffAccessError('staff_already_inactive');
      if (
        member.is_owner &&
        !members.some(
          (m) => m.user_id !== member.user_id && m.active && m.is_owner,
        )
      )
        throw new StaffAccessError('last_owner_required');
      Object.assign(
        member,
        StaffSchema.parse({
          ...member,
          active: false,
          access_version: member.access_version + 1,
        }),
      );
      const receipt = StaffAccessReceiptSchema.parse({
        userId: member.user_id,
        version: member.access_version,
        eventId: randomId(),
      });
      receipts.set(command.commandId, { payload, receipt });
      return receipt;
    },
  };
}
