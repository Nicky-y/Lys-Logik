import { z } from 'zod';

/** Fixed work roles. Ownership is a separate capability and grants no customer access. */
export const WorkRoleSchema = z.enum(['backoffice', 'technical']);
export type WorkRole = z.infer<typeof WorkRoleSchema>;
export const workRoleLabels: Record<WorkRole, string> = {
  backoffice: 'Backoffice',
  technical: 'Faglig',
};
export const StaffIdSchema = z.uuid().brand<'StaffId'>();
export const StaffVersionSchema = z
  .number()
  .int()
  .positive()
  .max(2147483647)
  .brand<'StaffVersion'>();
export const StaffAccessCommandIdSchema = z
  .uuid()
  .brand<'StaffAccessCommandId'>();
export const StaffAccessEventIdSchema = z.uuid().brand<'StaffAccessEventId'>();
export const StaffSchema = z.object({
  user_id: StaffIdSchema,
  display_name: z.string().trim().min(1).max(120),
  active: z.boolean(),
  role: WorkRoleSchema.nullable(),
  is_owner: z.boolean(),
  access_version: StaffVersionSchema,
});
export type Staff = z.infer<typeof StaffSchema>;
/** The caller supplies the observed version and keeps the command ID for ambiguous retries. */
export const StaffAccessCommandSchema = z.strictObject({
  commandId: StaffAccessCommandIdSchema,
  userId: StaffIdSchema,
  expectedVersion: StaffVersionSchema,
  role: WorkRoleSchema.nullable(),
  isOwner: z.boolean(),
});
export type StaffAccessCommand = z.infer<typeof StaffAccessCommandSchema>;
/** Ends access for the observed membership. No client-supplied role, owner or reactivation flag is accepted. */
export const StaffDeactivationCommandSchema = z.strictObject({
  commandId: StaffAccessCommandIdSchema,
  userId: StaffIdSchema,
  expectedVersion: StaffVersionSchema,
});
export type StaffDeactivationCommand = z.infer<typeof StaffDeactivationCommandSchema>;
export const StaffAccessReceiptSchema = z.object({
  userId: StaffIdSchema,
  version: StaffVersionSchema,
  eventId: StaffAccessEventIdSchema,
});
export type StaffAccessReceipt = z.infer<typeof StaffAccessReceiptSchema>;
export function canManageStaff(staff: Staff): boolean {
  return staff.active && staff.is_owner;
}
export function canWorkWithCustomers(staff: Staff): boolean {
  return staff.active && staff.role !== null;
}
export function staffAccessLabel(staff: Staff): string {
  const role =
    staff.role === null ? 'Ingen arbejdsrolle' : workRoleLabels[staff.role];
  return staff.is_owner ? `Ejer · ${role}` : role;
}
