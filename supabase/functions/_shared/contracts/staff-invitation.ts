import { z } from 'zod';
import { StaffIdSchema, WorkRoleSchema } from './staff.ts';

export const StaffInvitationIdSchema = z.uuid().brand<'StaffInvitationId'>();
export const StaffInvitationAttemptIdSchema = z
  .uuid()
  .brand<'StaffInvitationAttemptId'>();
export const StaffEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254))
  .brand<'StaffEmail'>();
export type StaffEmail = z.infer<typeof StaffEmailSchema>;
/** The same invitation ID and payload are retained when an outcome is uncertain. */
export const StaffInvitationCommandSchema = z.strictObject({
  invitationId: StaffInvitationIdSchema,
  email: StaffEmailSchema,
  displayName: z.string().trim().min(1).max(120),
  role: WorkRoleSchema.nullable(),
  isOwner: z.boolean(),
});
export type StaffInvitationCommand = z.infer<
  typeof StaffInvitationCommandSchema
>;
export const StaffInvitationSchema = z.object({
  id: StaffInvitationIdSchema,
  email: StaffEmailSchema,
  display_name: z.string().min(1).max(120),
  role: WorkRoleSchema.nullable(),
  is_owner: z.boolean(),
  state: z.enum(['sending', 'sent', 'uncertain', 'activated']),
  created_by: StaffIdSchema,
  created_at: z.iso.datetime({ offset: true }),
  last_attempt_at: z.iso.datetime({ offset: true }),
  sent_at: z.iso.datetime({ offset: true }).nullable(),
  activated_at: z.iso.datetime({ offset: true }).nullable(),
});
export type StaffInvitation = z.infer<typeof StaffInvitationSchema>;
export const StaffInvitationClaimSchema = z.object({
  invitation: StaffInvitationSchema,
  attemptId: StaffInvitationAttemptIdSchema.nullable(),
});
export type StaffInvitationClaim = z.infer<typeof StaffInvitationClaimSchema>;

export const staffInvitationErrorMessages: Record<string, string> = {
  owner_required: 'Kun en aktiv ejer kan oprette medarbejdere.',
  invalid_staff_invitation: 'Kontrollér navn, e-mail og de valgte rettigheder.',
  invitation_conflict:
    'Invitationen findes med andre oplysninger. Hent oversigten igen.',
  invitation_email_exists:
    'E-mailadressen er allerede oprettet eller inviteret. Brug den eksisterende medarbejder eller invitation.',
  invitation_busy:
    'Invitationen behandles allerede. Vent et øjeblik og prøv igen.',
  invitation_cooldown:
    'Vent mindst ét minut mellem forsøg på at sende invitationen.',
  invitation_limit:
    'Grænsen for invitationsforsøg er nået. Prøv igen senere eller kontakt administratoren.',
  invitation_identity_conflict:
    'Kontoen kunne ikke knyttes sikkert til invitationen. Kontakt administratoren.',
  invitation_owner_inactive:
    'Ejeren, der oprettede invitationen, har ikke længere ejeradgang. Kontakt en aktiv ejer.',
  unavailable:
    'Invitationen kunne ikke bekræftes. Oplysningerne er bevaret; et nyt forsøg kan sende en ny invitationsmail.',
};
export class StaffInvitationError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(
      staffInvitationErrorMessages[code] ??
        staffInvitationErrorMessages.unavailable,
    );
    this.code = code;
  }
}
