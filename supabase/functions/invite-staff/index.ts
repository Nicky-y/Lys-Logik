import { inviteStaffHandler } from '../_shared/http/invite-staff.ts';
import { createStaffInvitationPorts } from '../_shared/infrastructure/staff-invitation-runtime.ts';
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};
Deno.serve(
  inviteStaffHandler(
    (Deno.env.get('STAFF_APP_ORIGINS') ?? 'https://app.lysoglogik.dk')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    createStaffInvitationPorts(Deno.env),
  ),
);
