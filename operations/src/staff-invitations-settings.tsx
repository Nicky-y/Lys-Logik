import { useMemo, useState, type SubmitEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserPlus, Mail, LoaderCircle } from 'lucide-react';
import {
  WorkRoleSchema,
  workRoleLabels,
  type Staff,
  type WorkRole,
} from '../../supabase/functions/_shared/contracts/staff.ts';
import {
  StaffInvitationCommandSchema,
  StaffInvitationError,
  type StaffInvitation,
} from '../../supabase/functions/_shared/contracts/staff-invitation.ts';
import {
  createStaffInvitationSender,
  type StaffInvitationGateway,
} from './staff-invitations';

export function StaffInvitationsSettings({
  staff,
  gateway,
  online,
  demo,
}: {
  staff: Staff;
  gateway: StaffInvitationGateway;
  online: boolean;
  demo: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkRole | null>(null);
  const [isOwner, setOwner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const send = useMemo(() => createStaffInvitationSender(gateway), [gateway]);
  const pending = useQuery({
    queryKey: ['staff-invitations', staff.user_id],
    queryFn: () => gateway.list(),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });
  async function perform(action: () => Promise<StaffInvitation>) {
    if (busy || !online) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const receipt = await action();
      if (receipt.state === 'sent' || receipt.state === 'activated') {
        setNotice(
          demo
            ? 'Prøveinvitationen er oprettet. Der er ikke sendt en e-mail.'
            : `Invitationen er sendt til ${receipt.email}. Medarbejderen vælger selv sin adgangskode.`,
        );
        setOpen(false);
        setName('');
        setEmail('');
        setRole(null);
        setOwner(false);
      } else {
        setError(
          'Afsendelsen kunne ikke bekræftes. Vent mindst ét minut og prøv igen via invitationen nedenfor. Et nyt forsøg kan sende en ny e-mail.',
        );
      }
      await pending.refetch();
    } catch (caught) {
      setError(
        caught instanceof StaffInvitationError
          ? caught.message
          : 'Invitationen kunne ikke bekræftes. Dine oplysninger er bevaret. Prøv igen.',
      );
      await pending.refetch();
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    await perform(() => send({ displayName: name, email, role, isOwner }));
  }
  return (
    <div className="staff-invitations">
      {!open && (
        <button
          className="primary"
          disabled={!online || busy}
          onClick={() => {
            setOpen(true);
            setError('');
            setNotice('');
          }}
        >
          <UserPlus size={20} aria-hidden="true" />
          Opret medarbejder
        </button>
      )}
      {open && (
        <article
          className="staff-member staff-create"
          aria-labelledby="create-staff-heading"
        >
          <h3 id="create-staff-heading">Opret medarbejder</h3>
          <p className="muted">
            Send en personlig invitation. Medarbejderen får først adgang, når
            kontoen er aktiveret.
          </p>
          {demo && (
            <p className="muted">
              Prøvevisning: Der oprettes ingen rigtig konto og sendes ingen
              e-mail.
            </p>
          )}
          <form onSubmit={submit}>
            <fieldset disabled={busy || !online}>
              <label>
                Navn
                <input
                  autoFocus
                  autoComplete="off"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                E-mail
                <input
                  type="email"
                  autoComplete="off"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                Arbejdsrolle
                <select
                  value={role ?? ''}
                  onChange={(e) =>
                    setRole(
                      e.target.value === ''
                        ? null
                        : WorkRoleSchema.parse(e.target.value),
                    )
                  }
                >
                  <option value="">Ingen arbejdsrolle</option>
                  {WorkRoleSchema.options.map((value) => (
                    <option key={value} value={value}>
                      {workRoleLabels[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="staff-owner-choice">
                <input
                  type="checkbox"
                  checked={isOwner}
                  onChange={(e) => setOwner(e.target.checked)}
                />
                <span>
                  <strong>Ejerrettigheder</strong>
                  <small>
                    Må oprette medarbejdere og ændre rettigheder. Giver ikke
                    automatisk faglige beføjelser.
                  </small>
                </span>
              </label>
            </fieldset>
            <div className="staff-edit-actions">
              <button
                className="primary"
                disabled={busy || !online || !name.trim()}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={18} aria-hidden="true" />
                ) : (
                  <Mail size={18} aria-hidden="true" />
                )}
                Send invitation
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Annuller
              </button>
            </div>
          </form>
        </article>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="staff-saved">
          {notice}
        </p>
      )}
      {pending.isPending && <p role="status">Henter invitationer…</p>}
      {pending.isError && (
        <p role="alert">
          Invitationerne kunne ikke hentes.{' '}
          <button
            className="text-button"
            onClick={() => void pending.refetch()}
          >
            Prøv igen
          </button>
        </p>
      )}
      {!!pending.data?.length && (
        <div className="staff-pending" aria-labelledby="pending-staff-heading">
          <h3 id="pending-staff-heading">Afventer aktivering</h3>
          {pending.data.map((invitation) => (
            <article
              className="staff-pending-item"
              key={invitation.id}
              aria-label={`Invitation til ${invitation.display_name}`}
            >
              <Mail size={20} aria-hidden="true" />
              <div>
                <strong>{invitation.display_name}</strong>
                <span>{invitation.email}</span>
                <small>
                  {invitation.role
                    ? workRoleLabels[invitation.role]
                    : 'Ingen arbejdsrolle'}
                  {invitation.is_owner ? ' · Ejer' : ''}
                </small>
                <small>
                  {invitation.state === 'sent'
                    ? demo
                      ? 'Prøveinvitation · ingen e-mail sendt'
                      : 'Invitation sendt · afventer aktivering'
                    : invitation.state === 'sending'
                      ? 'Afsendelse i gang eller endnu ikke bekræftet'
                      : 'Afsendelse ikke bekræftet'}
                </small>
              </div>
              {invitation.created_by === staff.user_id &&
                ['sending', 'uncertain'].includes(invitation.state) && (
                  <button
                    className="secondary"
                    disabled={busy || !online}
                    onClick={() =>
                      void perform(() =>
                        gateway.invite(
                          StaffInvitationCommandSchema.parse({
                            invitationId: invitation.id,
                            email: invitation.email,
                            displayName: invitation.display_name,
                            role: invitation.role,
                            isOwner: invitation.is_owner,
                          }),
                        ),
                      )
                    }
                  >
                    Prøv afsendelse igen
                  </button>
                )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
