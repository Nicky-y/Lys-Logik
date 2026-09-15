import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Images,
  MessageSquare,
  Phone,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  StaffCommandSchema,
  availableTransitions,
  statusLabels,
  serviceLabels,
  type OperationsLead,
  type LeadId,
  type LeadStatus,
  type Staff,
  type LeadEvent,
} from '../../supabase/functions/_shared/contracts/operations.ts';
import {
  createCommandSender,
  OperationsError,
  type OperationsGateway,
  type CommandInput,
} from './gateway';
import { CaseChat, type ChatView } from './case-chat';
import { randomId } from './random-id';
import { AppointmentPanel, AppointmentHistory } from './calendar';
const dateTime = (value: string) =>
  new Intl.DateTimeFormat('da-DK', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Copenhagen',
  }).format(new Date(value));
function Badge({ status }: { status: LeadStatus }) {
  return (
    <span className={`badge badge-${status}`}>
      <i />
      {statusLabels[status]}
    </span>
  );
}
export function LeadDialog({
  id,
  gateway,
  staff,
  online,
  onClose,
  onResolved,
  routeKey,
}: {
  id: LeadId;
  gateway: OperationsGateway;
  staff: Staff;
  online: boolean;
  onClose: () => void;
  onResolved: (lead: OperationsLead) => void;
  routeKey: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  const lead = useQuery({
    queryKey: ['lead', id],
    queryFn: () => gateway.lead(id),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });
  const events = useQuery({
    queryKey: ['history', id],
    queryFn: () => gateway.history(id),
  });
  useEffect(() => {
    if (lead.data) onResolved(lead.data);
  }, [lead.data, onResolved, routeKey]);
  return (
    <dialog
      ref={dialog}
      className="lead-dialog"
      aria-labelledby="lead-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="dialog-bar">
        <button className="text-button" onClick={onClose}>
          <ArrowLeft size={17} />
          Tilbage til overblik
        </button>
        <button className="icon-button" onClick={onClose} aria-label="Luk sag">
          <X />
        </button>
      </header>
      {lead.isPending ? (
        <div className="empty" role="status">
          Henter sagen…
        </div>
      ) : lead.isError ? (
        <div className="dialog-content">
          <h2 id="lead-title">Sagen kunne ikke åbnes</h2>
          <p role="alert">Kontrollér forbindelsen og din adgang.</p>
          <button onClick={() => void lead.refetch()}>Prøv igen</button>
        </div>
      ) : (
        <LeadContent
          lead={lead.data}
          events={events.data ?? []}
          historyError={events.isError}
          gateway={gateway}
          staff={staff}
          online={online}
        />
      )}
    </dialog>
  );
}
function LeadContent({
  lead,
  events,
  historyError,
  gateway,
  staff,
  online,
}: {
  lead: OperationsLead;
  events: LeadEvent[];
  historyError: boolean;
  gateway: OperationsGateway;
  staff: Staff;
  online: boolean;
}) {
  const cache = useQueryClient();
  const sender = useMemo(() => createCommandSender(gateway), [gateway]);
  const [version, setVersion] = useState(lead.version);
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [decision, setDecision] = useState<'approved' | 'declined'>('approved');
  const [assessment, setAssessment] = useState('');
  const [waiting, setWaiting] = useState(lead.waiting_on ?? 'staff');
  const [notice, setNotice] = useState('');
  const [chatView, setChatView] = useState<ChatView | null>(null);
  const mutation = useMutation({
    mutationFn: (input: CommandInput) => sender(input),
    onSuccess: async (receipt, command) => {
      setVersion(receipt.version);
      setNotice(
        command.kind === 'status' &&
          lead.status === 'new' &&
          command.status === 'clarifying'
          ? 'Flyttet til Sager. Henvendelsen ligger nu under Afklaring.'
          : 'Gemt på sagen.',
      );
      if (command.kind === 'note') setNote('');
      if (command.kind === 'review') setAssessment('');
      if (command.kind === 'status') {
        setReason('');
        setStatus(command.status);
      }
      if (command.kind === 'appointment_create') setStatus('scheduled');
      if (command.kind === 'appointment_cancel') setStatus('clarifying');
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['lead', lead.id] }),
        cache.invalidateQueries({ queryKey: ['history', lead.id] }),
        cache.invalidateQueries({ queryKey: ['leads'] }),
        cache.invalidateQueries({ queryKey: ['inbox-count'] }),
        cache.invalidateQueries({ queryKey: ['appointment', lead.id] }),
        cache.invalidateQueries({ queryKey: ['calendar'] }),
      ]);
    },
    onError: async (error) => {
      setNotice('');
      if (
        error instanceof OperationsError &&
        error.code === 'lead_version_conflict'
      )
        await Promise.all([
          cache.invalidateQueries({ queryKey: ['lead', lead.id] }),
          cache.invalidateQueries({ queryKey: ['appointment', lead.id] }),
          cache.invalidateQueries({ queryKey: ['history', lead.id] }),
          cache.invalidateQueries({ queryKey: ['leads'] }),
          cache.invalidateQueries({ queryKey: ['inbox-count'] }),
        ]);
    },
  });
  const stale = version !== lead.version;
  const disabled = mutation.isPending || !online || stale;
  const common = { leadId: lead.id, expectedVersion: version };
  function send(input: CommandInput) {
    setNotice('');
    mutation.reset();
    const check = StaffCommandSchema.safeParse({
      ...input,
      commandId: randomId(),
    });
    if (!check.success) {
      setNotice('Tjek tekstens længde og de markerede felter.');
      return;
    }
    mutation.mutate(input);
  }
  return (
    <div className="dialog-content">
      <div className="detail-heading">
        <div>
          <p className="eyebrow">
            SAG · {lead.reference.slice(0, 8).toUpperCase()}
          </p>
          <h2 id="lead-title">{lead.name}</h2>
          <p className="muted">
            {serviceLabels[lead.service]} · {lead.postal_code}
          </p>
        </div>
        <Badge status={lead.status} />
      </div>
      <div className="contact-row">
        <div>
          <span>E-mail</span>
          <strong>{lead.email}</strong>
        </div>
        <div>
          <span>Telefon</span>
          <strong>{lead.phone || 'Ikke oplyst'}</strong>
        </div>
        {lead.phone && (
          <a className="secondary call" href={`tel:${lead.phone}`}>
            <Phone size={16} />
            Ring til kunden
          </a>
        )}
      </div>
      <section className="detail-section">
        <div className="section-heading">
          <h3>Kundens opgave</h3>
          {gateway.mail && (
            <button
              type="button"
              className="text-button customer-photos-shortcut"
              aria-label="Se kundens billeder"
              aria-haspopup="dialog"
              aria-controls="customer-chat"
              onClick={() => setChatView('photos')}
            >
              <Images size={19} aria-hidden="true" /> Billeder
            </button>
          )}
        </div>
        {lead.pilot_requested === true && (
          <p>
            <span className="pilot-request">Ønsker pilotprojekt</span>{' '}
            <small className="muted">Et pilotforløb aftales særskilt.</small>
          </p>
        )}
        <p className="preserve">{lead.description}</p>
        <small className="muted">Modtaget {dateTime(lead.created_at)}</small>
      </section>
      {stale && (
        <div role="alert" className="warning-box">
          <strong>Der er nyt på sagen.</strong>
          <p>
            Gennemgå de opdaterede oplysninger, før du gemmer. Dine
            indtastninger er bevaret.
          </p>
          <button
            className="secondary"
            onClick={() => {
              setVersion(lead.version);
              if (
                status !== lead.status &&
                !availableTransitions(lead).includes(status)
              )
                setStatus(lead.status);
              mutation.reset();
            }}
          >
            Arbejd videre med den viste version
          </button>
        </div>
      )}
      {mutation.error && (
        <div role="alert" className="error-box">
          {mutation.error.message}
        </div>
      )}
      {notice && (
        <p role="status" className="saved-notice">
          {notice}
        </p>
      )}
      {lead.status === 'new' && (
        <section className="detail-section inbox-handoff">
          <div>
            <h3>Første behandling</h3>
            <p>
              Når I har taget den første kontakt, kan I flytte henvendelsen til
              Sager. Samtale, billeder og historik følger med.
            </p>
          </div>
          <button
            type="button"
            className="primary transfer-button"
            disabled={disabled}
            onClick={() =>
              send({
                ...common,
                kind: 'status',
                status: 'clarifying',
                reason: '',
              })
            }
          >
            <ArrowRight size={18} aria-hidden="true" />
            {mutation.isPending ? 'Gemmer…' : 'Flyt til Sager'}
          </button>
        </section>
      )}
      <section className="detail-section">
        <div className="section-heading">
          <h3>Sagens næste skridt</h3>
          <small className="muted">Version {lead.version}</small>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send({ ...common, kind: 'status', status, reason });
          }}
        >
          <div className="form-row">
            <label>
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as LeadStatus)}
                disabled={disabled}
              >
                <option value={lead.status}>{statusLabels[lead.status]}</option>
                {availableTransitions(lead)
                  .filter(
                    (s) =>
                      lead.status !== 'new' ||
                      ['rejected', 'outside_scope', 'cancelled'].includes(s),
                  )
                  .map((s) => (
                    <option key={s} value={s}>
                      {statusLabels[s]}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="primary"
              disabled={disabled || status === lead.status}
            >
              Gem status
            </button>
          </div>
          <label>
            Begrundelse{' '}
            <span className="muted">
              – påkrævet ved arkivering og genåbning
            </span>
            <input
              value={reason}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Skriv en kort begrundelse"
              disabled={mutation.isPending}
            />
          </label>
        </form>
        {lead.status === 'clarifying' && (
          <form
            className="waiting-form"
            onSubmit={(e) => {
              e.preventDefault();
              send({
                ...common,
                kind: 'waiting',
                waitingOn: waiting as 'staff' | 'customer',
              });
            }}
          >
            <label>
              Hvem afventer vi?
              <select
                value={waiting}
                onChange={(e) =>
                  setWaiting(e.target.value as 'staff' | 'customer')
                }
                disabled={disabled}
              >
                <option value="staff">Afventer os</option>
                <option value="customer">Afventer kunden</option>
              </select>
            </label>
            <button
              className="secondary"
              disabled={disabled || waiting === lead.waiting_on}
            >
              Gem afventer
            </button>
          </form>
        )}
        {lead.status === 'qualified' && (
          <p className="field-help">
            Sagen er klar. Opret kalenderaftalen herunder, når tidspunktet er
            aftalt.
          </p>
        )}
      </section>
      <section className="detail-section">
        <div className="section-heading">
          <h3>
            <ShieldCheck size={18} />
            Faglig vurdering
          </h3>
          <span className={`review-tag review-${lead.review_decision}`}>
            {lead.review_decision === 'approved'
              ? 'Godkendt'
              : lead.review_decision === 'declined'
                ? 'Ikke godkendt'
                : 'Afventer vurdering'}
          </span>
        </div>
        {lead.review_summary && (
          <p className="assessment preserve">{lead.review_summary}</p>
        )}
        {lead.reviewed_at && (
          <small className="muted">
            Registreret {dateTime(lead.reviewed_at)} · aktøren fremgår af
            historikken
          </small>
        )}
        {staff.role === 'technical' &&
        ['new', 'clarifying', 'qualified'].includes(lead.status) ? (
          <form
            className="review-form"
            onSubmit={(e) => {
              e.preventDefault();
              send({
                ...common,
                kind: 'review',
                decision,
                summary: assessment,
              });
            }}
          >
            <label>
              Vurdering
              <select
                value={decision}
                onChange={(e) =>
                  setDecision(e.target.value as 'approved' | 'declined')
                }
                disabled={disabled}
              >
                <option value="approved">Opgaven er fagligt godkendt</option>
                <option value="declined">
                  Opgaven er ikke fagligt godkendt
                </option>
              </select>
            </label>
            <label>
              Faglig begrundelse
              <textarea
                value={assessment}
                onChange={(e) => setAssessment(e.target.value)}
                minLength={10}
                maxLength={2000}
                required
                rows={3}
                placeholder="Beskriv vurderingen og de rammer, der skal være opfyldt."
                disabled={mutation.isPending}
              />
            </label>
            <button
              className="secondary"
              disabled={disabled || assessment.trim().length < 10}
            >
              Gem faglig vurdering
            </button>
          </form>
        ) : (
          staff.role !== 'technical' && (
            <p className="field-help">
              Den faglige medarbejder registrerer vurderingen. Du kan følge den
              her og i historikken.
            </p>
          )
        )}
      </section>
      <section className="detail-section">
        <h3>Intern note</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send({ ...common, kind: 'note', body: note });
          }}
        >
          <label className="sr-only" htmlFor="internal-note">
            Intern note
          </label>
          <textarea
            id="internal-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            minLength={3}
            maxLength={3000}
            rows={3}
            placeholder="Fx hvad I har aftalt i telefonen, eller hvad der skal følges op på…"
            required
            disabled={mutation.isPending}
          />
          <div className="note-bottom">
            <small className="muted">
              Kun synlig for jer. Noten føjes til historikken.
            </small>
            <button
              className="primary"
              disabled={disabled || note.trim().length < 3}
            >
              <MessageSquare size={16} />
              Gem note
            </button>
          </div>
        </form>
      </section>
      <AppointmentPanel
        gateway={gateway}
        lead={lead}
        version={version}
        disabled={disabled}
        send={send}
      />
      <section className="detail-section history">
        <h3>
          Historik <span>{events.length}</span>
        </h3>
        {historyError && (
          <p role="alert" className="error-box">
            Historikken kunne ikke hentes.
          </p>
        )}
        {events.map((event) => (
          <HistoryEvent key={event.id} event={event} />
        ))}
        {events.length === 500 && (
          <p className="muted">Viser de seneste 500 hændelser.</p>
        )}
      </section>
      {gateway.mail && (
        <CaseChat
          key={lead.id}
          lead={lead}
          gateway={gateway.mail}
          online={online}
          view={chatView}
          onViewChange={setChatView}
        />
      )}
    </div>
  );
}
function HistoryEvent({ event }: { event: LeadEvent }) {
  const title =
    event.event_type === 'lead_created'
      ? 'Henvendelse modtaget'
      : event.event_type === 'status_changed'
        ? event.from_status === 'new' && event.to_status === 'clarifying'
          ? 'Flyttet fra Indbakke til Sager'
          : `${statusLabels[event.from_status!]} → ${statusLabels[event.to_status!]}`
        : event.event_type === 'review_recorded'
          ? `Faglig vurdering: ${event.details.to === 'approved' ? 'godkendt' : 'ikke godkendt'}`
          : event.event_type === 'waiting_changed'
            ? `Afventer ${event.details.to === 'customer' ? 'kunden' : event.details.to === 'staff' ? 'os' : 'ingen'}`
            : event.event_type === 'appointment_created'
              ? 'Aftale oprettet'
              : event.event_type === 'appointment_rescheduled'
                ? 'Aftale ændret'
                : event.event_type === 'appointment_cancelled'
                  ? 'Aftale aflyst'
                  : 'Intern note';
  return (
    <article className="history-event">
      <span className="history-icon">
        {event.event_type === 'note_added' ? (
          <MessageSquare size={14} />
        ) : event.event_type === 'review_recorded' ? (
          <ShieldCheck size={14} />
        ) : (
          <Check size={14} />
        )}
      </span>
      <div>
        <h4>{title}</h4>
        {event.body && <p className="preserve">{event.body}</p>}
        <AppointmentHistory details={event.details} />
        <small>
          {event.actor_name ?? 'Website'} · {dateTime(event.created_at)}
        </small>
      </div>
    </article>
  );
}
