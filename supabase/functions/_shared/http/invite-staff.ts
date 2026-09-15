import {
  StaffInvitationCommandSchema,
  StaffInvitationError,
} from '../contracts/staff-invitation.ts';
import {
  inviteStaff,
  type StaffInvitationPorts,
} from '../application/invite-staff.ts';
import { limitedBytes } from '../infrastructure/limited-bytes.ts';

export function inviteStaffHandler(
  allowedOrigins: string[],
  ports: StaffInvitationPorts,
) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Origin',
    };
    const reply = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers });
    if (origin && !allowedOrigins.includes(origin))
      return reply({ code: 'forbidden' }, 403);
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] =
      'authorization,apikey,content-type,x-client-info';
    headers['Access-Control-Allow-Methods'] = 'POST,OPTIONS';
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers });
    if (request.method !== 'POST')
      return reply({ code: 'method_not_allowed' }, 405);
    const bearer = request.headers.get('authorization');
    if (!bearer?.startsWith('Bearer ') || bearer.length > 8192)
      return reply({ code: 'authentication_required' }, 401);
    let command;
    try {
      command = StaffInvitationCommandSchema.parse(
        JSON.parse(new TextDecoder().decode(await limitedBytes(request, 2048))),
      );
    } catch {
      return reply({ code: 'invalid_staff_invitation' }, 400);
    }
    try {
      return reply(await inviteStaff(ports, bearer, command));
    } catch (error) {
      const code =
        error instanceof StaffInvitationError ? error.code : 'unavailable';
      const status =
        code === 'owner_required'
          ? 403
          : ['invitation_limit', 'invitation_cooldown'].includes(code)
            ? 429
            : code === 'unavailable'
              ? 503
              : 409;
      if (status === 429) headers['Retry-After'] = '60';
      return reply({ code }, status);
    }
  };
}
