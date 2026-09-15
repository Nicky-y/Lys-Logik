import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, Users, LoaderCircle } from 'lucide-react';
import {
  WorkRoleSchema,
  workRoleLabels,
  canManageStaff,
  staffAccessLabel,
  type Staff,
  type WorkRole,
} from '../../supabase/functions/_shared/contracts/staff.ts';
import {
  createStaffAccessSender,
  StaffAccessError,
  type StaffAccessGateway,
} from './staff-access';
import './staff-settings.css';

export function StaffSettings({
  staff,
  gateway,
  online,
  onAccessChanged,
}: {
  staff: Staff;
  gateway: StaffAccessGateway;
  online: boolean;
  onAccessChanged: () => Promise<void>;
}) {
  const directory = useQuery({
    queryKey: ['staff-directory', staff.user_id],
    queryFn: () => gateway.list(),
    enabled: canManageStaff(staff),
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });
  return (
    <section
      className="settings-panel staff-settings"
      aria-labelledby="staff-heading"
    >
      <div className="staff-section-title">
        <Users size={22} aria-hidden="true" />
        <h2 id="staff-heading">Medarbejdere og rettigheder</h2>
      </div>
      <p>
        Arbejdsrollen bestemmer adgangen til sager og faglige funktioner.
        Ejerrettigheder giver adgang til at administrere medarbejdere.
      </p>
      <div className="staff-own-access">
        <ShieldCheck size={20} aria-hidden="true" />
        <span>
          Din adgang: <strong>{staffAccessLabel(staff)}</strong>
        </span>
      </div>
      {canManageStaff(staff) ? (
        <>
          <p className="muted">
            Ingen arbejdsrolle betyder, at medarbejderen ikke har adgang til
            kundesager, kalender eller kundenotifikationer.
          </p>
          {directory.isPending && <p role="status">Henter medarbejdere…</p>}
          {directory.isError && (
            <p role="alert" className="error-box">
              Medarbejderne kunne ikke hentes.{' '}
              <button
                className="text-button"
                onClick={() => void directory.refetch()}
              >
                Prøv igen
              </button>
            </p>
          )}
          <div className="staff-directory">
            {directory.data?.map((member) => (
              <StaffEditor
                key={member.user_id}
                member={member}
                gateway={gateway}
                online={online}
                onSaved={async () => {
                  await onAccessChanged();
                  await directory.refetch();
                }}
                onRefresh={async () => {
                  await directory.refetch();
                  await onAccessChanged();
                }}
              />
            ))}
          </div>
        </>
      ) : (
        <p className="muted">
          Kontakt en ejer, hvis din arbejdsrolle eller dine rettigheder skal
          ændres.
        </p>
      )}
    </section>
  );
}

function StaffEditor({
  member,
  gateway,
  online,
  onSaved,
  onRefresh,
}: {
  member: Staff;
  gateway: StaffAccessGateway;
  online: boolean;
  onSaved: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [observed, setObserved] = useState(member);
  const [role, setRole] = useState<WorkRole | null>(member.role);
  const [isOwner, setIsOwner] = useState(member.is_owner);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const send = useMemo(() => createStaffAccessSender(gateway), [gateway]);
  const changed = role !== observed.role || isOwner !== observed.is_owner;
  function start() {
    setObserved(member);
    setRole(member.role);
    setIsOwner(member.is_owner);
    setEditing(true);
    setError('');
    setConflict(false);
    setSaved(false);
  }
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !online || !changed || conflict) return;
    setBusy(true);
    setError('');
    try {
      await send({
        userId: member.user_id,
        expectedVersion: observed.access_version,
        role,
        isOwner,
      });
      setEditing(false);
      setSaved(true);
      await onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Ændringen kunne ikke bekræftes. Prøv igen.',
      );
      setConflict(
        caught instanceof StaffAccessError &&
          caught.code === 'staff_version_conflict',
      );
      if (
        caught instanceof StaffAccessError &&
        caught.code === 'owner_required'
      )
        await onRefresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="staff-member" aria-label={member.display_name}>
      <div className="staff-member-heading">
        <div>
          <h3>{member.display_name}</h3>
          <p className="muted">
            {staffAccessLabel(member)}
            {!member.active ? ' · Deaktiveret' : ''}
          </p>
        </div>
        {!editing && (
          <button className="secondary" onClick={start} disabled={!online}>
            Redigér rettigheder
          </button>
        )}
      </div>
      {saved && (
        <p role="status" className="staff-saved">
          Rettighederne er gemt.
        </p>
      )}
      {editing && (
        <form onSubmit={submit}>
          <label>
            Arbejdsrolle
            <select
              value={role ?? ''}
              disabled={busy || conflict}
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
              disabled={busy || conflict}
              onChange={(e) => setIsOwner(e.target.checked)}
            />
            <span>
              <strong>Ejerrettigheder</strong>
              <small>
                Må administrere medarbejdere. Giver ikke automatisk faglige
                beføjelser.
              </small>
            </span>
          </label>
          {error && (
            <div role="alert" className="error-box">
              {error}
            </div>
          )}
          <div className="staff-edit-actions">
            {conflict ? (
              <button
                type="button"
                className="secondary"
                onClick={async () => {
                  await onRefresh();
                  setEditing(false);
                  setConflict(false);
                  setError('');
                }}
              >
                Hent seneste rettigheder
              </button>
            ) : (
              <button
                className="primary"
                disabled={busy || !online || !changed}
              >
                {busy && (
                  <LoaderCircle className="spin" size={18} aria-hidden="true" />
                )}
                Gem rettigheder
              </button>
            )}
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Annuller
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
