import {
  StaffInvitationClaimSchema,
  StaffInvitationSchema,
  type StaffInvitationCommand,
  type StaffInvitationClaim,
  type StaffInvitation,
  type StaffEmail,
} from '../contracts/staff-invitation.ts';

/** Reservation runs as the authenticated owner; transport and reconciliation run only on the server. */
export interface StaffInvitationPorts {
  reserve(
    bearer: string,
    command: StaffInvitationCommand,
  ): Promise<StaffInvitationClaim>;
  send(email: StaffEmail): Promise<void>;
  finish(claim: StaffInvitationClaim, sent: boolean): Promise<StaffInvitation>;
}
export async function inviteStaff(
  ports: StaffInvitationPorts,
  bearer: string,
  command: StaffInvitationCommand,
): Promise<StaffInvitation> {
  const claim = StaffInvitationClaimSchema.parse(
    await ports.reserve(bearer, command),
  );
  if (!claim.attemptId) return claim.invitation;
  let sent = false;
  try {
    await ports.send(claim.invitation.email);
    sent = true;
  } catch {
    // A timeout cannot establish whether the mail was sent. Keep a recoverable
    // uncertain result; never silently retry an external send within this call.
  }
  return StaffInvitationSchema.parse(await ports.finish(claim, sent));
}
