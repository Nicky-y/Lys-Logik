import { useId, useMemo, useRef, useState } from 'react';
import { LoaderCircle, UserRoundX } from 'lucide-react';
import {
  staffAccessLabel,
  type Staff,
} from '../../supabase/functions/_shared/contracts/staff.ts';
import {
  createStaffDeactivationSender,
  StaffAccessError,
  type StaffAccessGateway,
} from './staff-access';

export function StaffDeactivation({
  member,
  gateway,
  online,
  onDeactivated,
  onRefresh,
}: {
  member: Staff;
  gateway: StaffAccessGateway;
  online: boolean;
  onDeactivated: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const sending = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const [observed, setObserved] = useState(member);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refreshRequired, setRefreshRequired] = useState(false);
  const send = useMemo(() => createStaffDeactivationSender(gateway), [gateway]);

  async function confirm() {
    if (sending.current || !online || refreshRequired) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      await send({
        userId: observed.user_id,
        expectedVersion: observed.access_version,
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Deaktiveringen kunne ikke bekræftes. Prøv igen.',
      );
      setRefreshRequired(
        caught instanceof StaffAccessError &&
          [
            'staff_version_conflict',
            'staff_already_inactive',
            'owner_required',
            'staff_not_found',
          ].includes(caught.code),
      );
      return;
    } finally {
      sending.current = false;
      setBusy(false);
    }
    dialog.current?.close();
    // The mutation is confirmed. A refresh failure must not report it as unsaved.
    await onDeactivated();
  }

  return (
    <>
      <button
        className="secondary staff-deactivate"
        disabled={!online}
        onClick={() => {
          setObserved(member);
          setError('');
          setRefreshRequired(false);
          dialog.current?.showModal();
        }}
      >
        <UserRoundX size={18} aria-hidden="true" />
        Deaktivér medarbejder
      </button>
      <dialog
        className="staff-deactivation-dialog"
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onCancel={(event) => {
          if (sending.current) event.preventDefault();
        }}
      >
        <h2 id={titleId}>Deaktivér {observed.display_name}?</h2>
        <div id={descriptionId}>
          <p>
            Medarbejderen mister adgangen til arbejdsrummet og fremtidige
            kundenotifikationer. Sager, beskeder og historik bevares.
          </p>
          <p className="muted">
            Nuværende adgang: {staffAccessLabel(observed)}
          </p>
        </div>
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        <div className="staff-edit-actions">
          <button
            type="button"
            className="secondary"
            autoFocus
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            Annuller
          </button>
          {refreshRequired ? (
            <button
              type="button"
              className="secondary"
              onClick={async () => {
                await onRefresh();
                dialog.current?.close();
              }}
            >
              Hent seneste rettigheder
            </button>
          ) : (
            <button
              type="button"
              className="staff-deactivate-confirm"
              disabled={busy || !online}
              onClick={() => void confirm()}
            >
              {busy && (
                <LoaderCircle className="spin" size={18} aria-hidden="true" />
              )}
              {busy ? 'Deaktiverer…' : 'Ja, deaktivér medarbejder'}
            </button>
          )}
        </div>
      </dialog>
    </>
  );
}
