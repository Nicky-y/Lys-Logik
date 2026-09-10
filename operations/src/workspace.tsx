import { randomId } from './random-id';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Inbox,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
  Archive,
  LoaderCircle,
  CalendarDays,
} from 'lucide-react';
import {
  LeadIdSchema,
  StaffCommandSchema,
  availableTransitions,
  archiveStatuses,
  pipelineStatuses,
  statusLabels,
  serviceLabels,
  type OperationsLead,
  type Staff,
  type LeadId,
  type LeadStatus,
  type LeadEvent,
} from '../../supabase/functions/_shared/contracts/operations.ts';
import {
  createCommandSender,
  OperationsError,
  type OperationsGateway,
  type CommandInput,
} from './gateway';
import { CalendarView, AppointmentPanel, AppointmentHistory } from './calendar';
import { copenhagenLocal } from './calendar-time';
import { InstallApp } from './pwa';
import { PushSettings } from './push';
import type { PushController } from './push-controller';

const dateTime = (value: string) =>
  new Intl.DateTimeFormat('da-DK', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Copenhagen',
  }).format(new Date(value));
const dateShort = (value: string) =>
  new Intl.DateTimeFormat('da-DK', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Copenhagen',
  }).format(new Date(value));
function route() {
  const hash = location.hash;
  const match = /^#\/leads\/([^/]+)$/.exec(hash);
  const calendar =
    /^#\/calendar(?:\/(\d{4}-\d{2}-\d{2}))?(?:\/leads\/([^/]+))?$/.exec(hash);
  const day = calendar?.[1];
  const validDay =
    day &&
    day >= '2020-01-01' &&
    day <= '2100-12-31' &&
    Number.isFinite(Date.parse(`${day}T12:00:00Z`)) &&
    new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day
      ? day
      : undefined;
  return {
    archive: hash === '#/archive',
    calendar: !!calendar,
    day: validDay,
    lead: match
      ? LeadIdSchema.safeParse(match[1]).data
      : calendar?.[2]
        ? LeadIdSchema.safeParse(calendar[2]).data
        : undefined,
  };
}
function Badge({ status }: { status: LeadStatus }) {
  return (
    <span className={`badge badge-${status}`}>
      <i />
      {statusLabels[status]}
    </span>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <Inbox size={26} />
      <p>{children}</p>
    </div>
  );
}
export function Workspace({
  gateway,
  push,
  staff,
  demo,
  onSignOut,
}: {
  gateway: OperationsGateway;
  push?: PushController;
  staff: Staff;
  demo: boolean;
  onSignOut: () => void;
}) {
  const [view, setView] = useState(route);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('all');
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => {
      setView(route());
      setStage('all');
    };
    const connection = () => setOnline(navigator.onLine);
    window.addEventListener('hashchange', update);
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    return () => {
      window.removeEventListener('hashchange', update);
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
    };
  }, []);
  const list = useInfiniteQuery({
    queryKey: ['leads', staff.user_id],
    queryFn: ({ pageParam }) => gateway.list(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.hasMore ? pages.length * 100 : undefined,
  });
  const all = list.data?.pages.flatMap((page) => page.items) ?? [];
  const statuses = view.archive ? archiveStatuses : pipelineStatuses;
  const visible = all.filter(
    (lead) =>
      statuses.includes(lead.status) &&
      (stage === 'all' || stage === lead.status) &&
      `${lead.name} ${lead.email} ${lead.postal_code} ${lead.description}`
        .toLocaleLowerCase('da')
        .includes(search.toLocaleLowerCase('da')),
  );
  const counts = (status: LeadStatus) =>
    all.filter((lead) => lead.status === status).length;
  const currentColumns =
    stage === 'all' ? statuses : statuses.filter((s) => s === stage);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#/pipeline"
          aria-label="Lys og Logik – pipeline"
        >
          <img src="/logo.png" alt="Lys & Logik" />
        </a>
        <span className="sidebar-caption">ARBEJDSRUM</span>
        <nav aria-label="Appens hovedmenu">
          <a
            href="#/pipeline"
            aria-current={!view.archive && !view.calendar ? 'page' : undefined}
          >
            <LayoutDashboard size={19} /> Pipeline{' '}
            <span>
              {all.filter((l) => !archiveStatuses.includes(l.status)).length}
            </span>
          </a>
          <a
            href="#/calendar"
            aria-current={view.calendar ? 'page' : undefined}
          >
            <CalendarDays size={19} /> Kalender
          </a>
          <a href="#/archive" aria-current={view.archive ? 'page' : undefined}>
            <Archive size={19} /> Arkiv{' '}
            <span>
              {all.filter((l) => archiveStatuses.includes(l.status)).length}
            </span>
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="yellow-dot" />
            <strong>Små skridt. Godt håndværk.</strong>
            <p>Et fælles overblik over de første pilotprojekter.</p>
          </div>
          <div className="profile">
            <span className="avatar">
              {staff.display_name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{staff.display_name}</strong>
              <small>
                {staff.role === 'technical'
                  ? 'Faglig medarbejder'
                  : 'Backoffice'}
              </small>
            </div>
            <button
              className="icon-button"
              title={demo ? 'Nulstil prøvevisning' : 'Log ud'}
              aria-label={demo ? 'Nulstil prøvevisning' : 'Log ud'}
              onClick={onSignOut}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Arbejdsrum <ChevronRight size={14} />{' '}
            <strong>
              {view.calendar ? 'Kalender' : view.archive ? 'Arkiv' : 'Overblik'}
            </strong>
          </span>
          <span className="topbar-date">
            {new Intl.DateTimeFormat('da-DK', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            }).format(new Date())}
          </span>
          <span className="mobile-brand">Lys & Logik</span>
          <InstallApp />
          {push && <PushSettings controller={push} />}
        </header>
        {demo && (
          <div className="demo-banner">
            <span className="yellow-dot" />
            <strong>Prøvevisning</strong>
            <span>
              Fiktive sager. Ændringer gemmes kun, mens siden er åben.
            </span>
          </div>
        )}
        {!online && (
          <p role="status" className="offline-banner">
            Du er offline. Sager kan først opdateres, når forbindelsen er
            tilbage.
          </p>
        )}
        <main className="workspace">
          {view.calendar ? (
            <CalendarView
              gateway={gateway}
              selectedDay={view.day}
              online={online}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {view.archive
                      ? 'GEMT, SÅ I KAN FINDE DET IGEN'
                      : 'FRA HENVENDELSE TIL GOD AFTALE'}
                  </p>
                  <h1>
                    {view.archive
                      ? 'Afsluttede dialoger'
                      : 'Jeres opgaver. Ét overblik.'}
                  </h1>
                  <p className="muted">
                    {view.archive
                      ? 'Afviste, annullerede og andre afsluttede henvendelser.'
                      : 'Her begynder næste gode kundeoplevelse.'}
                  </p>
                </div>
                <button
                  className="secondary refresh"
                  disabled={list.isFetching || !online}
                  onClick={() => void list.refetch()}
                >
                  <RefreshCw
                    size={16}
                    className={list.isFetching ? 'spin' : ''}
                  />
                  Opdater
                </button>
              </div>
              {!view.archive && (
                <section className="stats" aria-label="Nøgletal">
                  <Stat
                    label="Nye henvendelser"
                    value={counts('new')}
                    icon={<Inbox />}
                    accent
                  />
                  <Stat
                    label="Afventer kunden"
                    value={
                      all.filter((l) => l.waiting_on === 'customer').length
                    }
                    icon={<MessageSquare />}
                  />
                  <Stat
                    label="Afventer faglig vurdering"
                    value={
                      all.filter(
                        (l) =>
                          ['new', 'clarifying'].includes(l.status) &&
                          l.review_decision === 'pending',
                      ).length
                    }
                    icon={<ShieldCheck />}
                  />
                  <Stat
                    label="Klar til aftale"
                    value={counts('qualified')}
                    icon={<CheckCircle2 />}
                  />
                </section>
              )}
              <section
                className="pipeline-section"
                aria-label={view.archive ? 'Arkiverede sager' : 'Pipeline'}
              >
                <div className="pipeline-tools">
                  <div>
                    <h2>{view.archive ? 'Arkiverede sager' : 'Pipeline'}</h2>
                    <span className="muted">
                      {visible.length} {visible.length === 1 ? 'sag' : 'sager'}{' '}
                      i overblikket
                    </span>
                  </div>
                  <label className="search">
                    <Search size={18} />
                    <span className="sr-only">Søg i sager</span>
                    <input
                      type="search"
                      placeholder="Søg navn, postnr. eller opgave"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                </div>
                <div
                  className="stage-filters"
                  aria-label="Filtrér efter status"
                >
                  <button
                    aria-pressed={stage === 'all'}
                    onClick={() => setStage('all')}
                  >
                    Alle trin
                  </button>
                  {statuses.map((s) => (
                    <button
                      key={s}
                      aria-pressed={stage === s}
                      onClick={() => setStage(s)}
                    >
                      {statusLabels[s]} <span>{counts(s)}</span>
                    </button>
                  ))}
                </div>
                {list.isError ? (
                  <div role="alert" className="error-box">
                    Sagerne kunne ikke hentes. Kontrollér forbindelsen, og tryk
                    Opdater.
                  </div>
                ) : list.isPending ? (
                  <div role="status" className="empty">
                    <LoaderCircle className="spin" />
                    Henter sager…
                  </div>
                ) : (
                  <div
                    className={`board ${view.archive ? 'archive-board' : ''}`}
                    tabIndex={0}
                    aria-label="Sagskolonner – rul vandret for flere trin"
                  >
                    {currentColumns.map((status) => (
                      <section
                        className={`column column-${status}`}
                        key={status}
                        aria-label={statusLabels[status]}
                      >
                        <header>
                          <span className="column-dot" />
                          <h3>{statusLabels[status]}</h3>
                          <span className="count">
                            {visible.filter((l) => l.status === status).length}
                          </span>
                        </header>
                        <div className="column-cards">
                          {visible
                            .filter((l) => l.status === status)
                            .map((lead) => (
                              <LeadCard key={lead.id} lead={lead} />
                            ))}
                          {!visible.some((l) => l.status === status) && (
                            <Empty>
                              {search ? 'Ingen match' : 'Ingen sager her endnu'}
                            </Empty>
                          )}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
                {list.hasNextPage && (
                  <button
                    className="secondary load-more"
                    disabled={list.isFetchingNextPage}
                    onClick={() => void list.fetchNextPage()}
                  >
                    <ArrowDown size={16} />
                    Indlæs flere sager
                  </button>
                )}
                <p className="board-help">
                  {list.hasNextPage
                    ? 'Tallene og søgningen gælder de indlæste sager. Indlæs flere for resten.'
                    : 'Hver henvendelse har sin egen sag. Statusændringer og noter bliver en del af historikken.'}
                </p>
              </section>
            </>
          )}
        </main>
      </div>
      {view.lead && (
        <LeadDialog
          key={view.lead}
          id={view.lead}
          gateway={gateway}
          staff={staff}
          online={online}
          onClose={() => {
            location.hash = view.calendar
              ? `#/calendar/${view.day ?? copenhagenLocal(new Date().toISOString()).slice(0, 10)}`
              : '#/pipeline';
          }}
        />
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  icon,
  accent = false,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  accent?: boolean;
}) {
  return (
    <article className={`stat ${accent ? 'stat-accent' : ''}`}>
      <div>
        <span>{label}</span>
        <strong>{value.toString().padStart(2, '0')}</strong>
      </div>
      <span className="stat-icon">{icon}</span>
    </article>
  );
}
function LeadCard({ lead }: { lead: OperationsLead }) {
  return (
    <a className="lead-card" href={`#/leads/${lead.id}`}>
      <div className="card-top">
        <span className={`service-tag service-${lead.service}`}>
          {serviceLabels[lead.service]}
        </span>
        <ArrowUpRight size={16} />
      </div>
      <h4>{lead.name}</h4>
      <span className="location">
        <MapPin size={13} />
        {lead.postal_code}
      </span>
      <p className="card-description">{lead.description}</p>
      {lead.waiting_on && (
        <span className={`waiting waiting-${lead.waiting_on}`}>
          <Clock3 size={13} />
          {lead.waiting_on === 'customer' ? 'Afventer kunden' : 'Afventer os'}
        </span>
      )}
      {lead.review_decision === 'approved' && (
        <span className="approved">
          <Check size={13} />
          Fagligt godkendt
        </span>
      )}
      <footer>
        <span>{dateShort(lead.created_at)}</span>
        <span>
          Åbn sag <ChevronRight size={13} />
        </span>
      </footer>
    </a>
  );
}
function LeadDialog({
  id,
  gateway,
  staff,
  online,
  onClose,
}: {
  id: LeadId;
  gateway: OperationsGateway;
  staff: Staff;
  online: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  const lead = useQuery({
    queryKey: ['lead', id],
    queryFn: () => gateway.lead(id),
  });
  const events = useQuery({
    queryKey: ['history', id],
    queryFn: () => gateway.history(id),
  });
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
  const mutation = useMutation({
    mutationFn: (input: CommandInput) => sender(input),
    onSuccess: async (receipt, command) => {
      setVersion(receipt.version);
      setNotice('Gemt på sagen.');
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
        <h3>Kundens opgave</h3>
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
                {availableTransitions(lead).map((s) => (
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
    </div>
  );
}
function HistoryEvent({ event }: { event: LeadEvent }) {
  const title =
    event.event_type === 'lead_created'
      ? 'Henvendelse modtaget'
      : event.event_type === 'status_changed'
        ? `${statusLabels[event.from_status!]} → ${statusLabels[event.to_status!]}`
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
