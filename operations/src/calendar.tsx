import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  RefreshCw,
  ArrowUpRight,
} from 'lucide-react';
import {
  AppointmentInputSchema,
  AppointmentSchema,
  type Appointment,
  type OperationsLead,
} from '../../supabase/functions/_shared/contracts/operations.ts';
import type { CommandInput, OperationsGateway } from './gateway';
import {
  copenhagenLocal,
  copenhagenInstant,
  monthDays,
  occursOn,
  shiftDay,
  appointmentTime,
  appointmentDate,
} from './calendar-time';

export function CalendarView({
  gateway,
  selectedDay,
  online,
}: {
  gateway: OperationsGateway;
  selectedDay?: string;
  online: boolean;
}) {
  const today = copenhagenLocal(new Date().toISOString()).slice(0, 10);
  const day = selectedDay ?? today;
  const month = day.slice(0, 7);
  const days = monthDays(month);
  const from = copenhagenInstant(`${days[0]}T00:00`);
  const to = copenhagenInstant(`${shiftDay(days[41], 1)}T00:00`);
  const calendar = useInfiniteQuery({
    queryKey: ['calendar', month],
    queryFn: ({ pageParam }) => gateway.calendar(from, to, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.hasMore ? pages.length * 100 : undefined,
  });
  const all = calendar.data?.pages.flatMap((page) => page.items) ?? [];
  const selected = all.filter((item) => occursOn(item, day));
  function moveMonth(delta: number) {
    const next = new Date(`${month}-01T12:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + delta);
    location.hash = `#/calendar/${next.toISOString().slice(0, 10)}`;
  }
  const longDay = (date: string) =>
    new Intl.DateTimeFormat('da-DK', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${date}T12:00:00Z`));
  return (
    <section className="calendar-page" aria-label="Fælles kalender">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PLADS TIL GODT HÅNDVÆRK</p>
          <h1>En aftale ad gangen.</h1>
          <p className="muted">
            Jeres fælles kalender. Alle tider er dansk tid.
          </p>
        </div>
        <button
          className="secondary refresh"
          disabled={!online || calendar.isFetching}
          onClick={() => void calendar.refetch()}
        >
          <RefreshCw size={16} />
          Opdater kalender
        </button>
      </div>
      <div className="calendar-layout">
        <section className="month-card" aria-label="Vælg en dag">
          <div className="month-toolbar">
            <h2>
              {new Intl.DateTimeFormat('da-DK', {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              }).format(new Date(`${month}-01T12:00:00Z`))}
            </h2>
            <div>
              <button
                className="icon-button"
                aria-label="Forrige måned"
                disabled={month <= '2020-02'}
                onClick={() => moveMonth(-1)}
              >
                <ChevronLeft size={19} />
              </button>
              <a className="secondary" href={`#/calendar/${today}`}>
                I dag
              </a>
              <button
                className="icon-button"
                aria-label="Næste måned"
                disabled={month >= '2100-11'}
                onClick={() => moveMonth(1)}
              >
                <ChevronRight size={19} />
              </button>
            </div>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            {['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="month-grid">
            {days.map((date) => {
              const items = all.filter((item) => occursOn(item, date));
              return (
                <button
                  key={date}
                  className={`month-day ${date.slice(0, 7) !== month ? 'outside-month' : ''} ${date === today ? 'today' : ''}`}
                  aria-label={`${longDay(date)}, ${items.length} aftaler`}
                  aria-pressed={date === day}
                  onClick={() => {
                    location.hash = `#/calendar/${date}`;
                  }}
                >
                  <span>{Number(date.slice(-2))}</span>
                  {items.length > 0 && (
                    <small>
                      <i />
                      {items.length}
                      <span className="day-appointments-label">
                        {' '}
                        {items.length === 1 ? 'aftale' : 'aftaler'}
                      </span>
                    </small>
                  )}
                </button>
              );
            })}
          </div>
          <p className="calendar-help">
            Opret en aftale fra en sag, der er klar til aftale.
          </p>
        </section>
        <section className="agenda" aria-label="Aftaler på den valgte dag">
          <div className="agenda-heading">
            <p className="eyebrow">{day === today ? 'I DAG' : 'VALGT DAG'}</p>
            <h2>{longDay(day)}</h2>
            <p className="muted">
              {selected.length} {selected.length === 1 ? 'aftale' : 'aftaler'}
            </p>
          </div>
          {calendar.isPending ? (
            <p role="status" className="empty">
              Henter kalenderen…
            </p>
          ) : calendar.isError ? (
            <p role="alert" className="error-box">
              Kalenderen kunne ikke hentes. Prøv Opdater kalender.
            </p>
          ) : selected.length === 0 ? (
            <div className="agenda-empty">
              <CalendarDays size={32} />
              <h3>Plads i kalenderen</h3>
              <p>Der er ingen aftaler denne dag.</p>
            </div>
          ) : (
            selected.map((item) => (
              <a
                className="agenda-card"
                key={item.id}
                href={`#/calendar/${day}/leads/${item.lead_id}`}
              >
                <div className="agenda-time">
                  <Clock3 size={15} />
                  {appointmentTime(item.starts_at)}–
                  {appointmentTime(item.ends_at)}
                  <ArrowUpRight size={16} />
                </div>
                <h3>{item.title}</h3>
                <p>
                  {item.lead?.name ?? 'Åbn sag'}{' '}
                  {item.lead?.postal_code && `· ${item.lead.postal_code}`}
                </p>
                <span>
                  <MapPin size={14} />
                  {item.location || 'Sted aftales'}
                </span>
                {copenhagenLocal(item.starts_at).slice(0, 10) !==
                  copenhagenLocal(item.ends_at).slice(0, 10) && (
                  <small>
                    {appointmentDate(item.starts_at)} –{' '}
                    {appointmentDate(item.ends_at)}
                  </small>
                )}
              </a>
            ))
          )}
        </section>
      </div>
      {calendar.hasNextPage && (
        <button
          className="secondary load-more"
          disabled={calendar.isFetchingNextPage}
          onClick={() => void calendar.fetchNextPage()}
        >
          Indlæs flere aftaler
        </button>
      )}
      <p className="board-help">
        {calendar.hasNextPage
          ? 'Tallene gælder de indlæste aftaler. Indlæs flere for resten.'
          : 'Kalenderen deles mellem jer. Aftaler sender endnu ingen besked til kunden og synkroniseres ikke til eksterne kalendere.'}
      </p>
    </section>
  );
}

export function AppointmentPanel({
  gateway,
  lead,
  version,
  disabled,
  send,
}: {
  gateway: OperationsGateway;
  lead: OperationsLead;
  version: OperationsLead['version'];
  disabled: boolean;
  send: (command: CommandInput) => void;
}) {
  const booking = useQuery({
    queryKey: ['appointment', lead.id],
    queryFn: () => gateway.appointment(lead.id),
  });
  return (
    <section className="detail-section appointment-panel">
      <h3>
        <CalendarDays size={18} />
        Kalenderaftale
      </h3>
      {booking.isPending ? (
        <p role="status">Henter aftale…</p>
      ) : booking.isError ? (
        <>
          <p role="alert" className="error-box">
            Aftalen kunne ikke hentes.
          </p>
          <button className="secondary" onClick={() => void booking.refetch()}>
            Hent aftale igen
          </button>
        </>
      ) : booking.data ? (
        <>
          <div className="booking-summary">
            <strong>{booking.data.title}</strong>
            <span>
              <Clock3 size={15} />
              {appointmentDate(booking.data.starts_at)} –{' '}
              {appointmentDate(booking.data.ends_at)}
            </span>
            <span>
              <MapPin size={15} />
              {booking.data.location || 'Sted aftales'}
            </span>
            <a
              className="text-button"
              href={`#/calendar/${copenhagenLocal(booking.data.starts_at).slice(0, 10)}`}
            >
              Se i kalenderen <ArrowUpRight size={15} />
            </a>
          </div>
          <details>
            <summary>Flyt eller ret aftale</summary>
            <AppointmentForm
              key={booking.data.id}
              lead={lead}
              version={version}
              appointment={booking.data}
              disabled={disabled}
              send={send}
            />
          </details>
          <details className="cancel-booking">
            <summary>Aflys aftale</summary>
            <CancelForm
              lead={lead}
              version={version}
              appointment={booking.data}
              disabled={disabled}
              send={send}
            />
          </details>
        </>
      ) : lead.status === 'qualified' ? (
        <AppointmentForm
          lead={lead}
          version={version}
          disabled={disabled}
          send={send}
        />
      ) : (
        <p className="field-help">
          Aftalen oprettes, når sagen er fagligt godkendt og flyttet til Klar
          til aftale.
        </p>
      )}
    </section>
  );
}
type FormProps = {
  lead: OperationsLead;
  version: OperationsLead['version'];
  appointment?: Appointment;
  disabled: boolean;
  send: (command: CommandInput) => void;
};
function AppointmentForm({
  lead,
  version,
  appointment,
  disabled,
  send,
}: FormProps) {
  const [title, setTitle] = useState(appointment?.title ?? '');
  const [place, setPlace] = useState(appointment?.location ?? '');
  const [start, setStart] = useState(
    appointment ? copenhagenLocal(appointment.starts_at) : '',
  );
  const [end, setEnd] = useState(
    appointment ? copenhagenLocal(appointment.ends_at) : '',
  );
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  return (
    <form
      className="appointment-form"
      onSubmit={(event) => {
        event.preventDefault();
        setError('');
        try {
          const input = AppointmentInputSchema.parse({
            title,
            location: place,
            startsAt: copenhagenInstant(start),
            endsAt: copenhagenInstant(end),
          });
          send(
            appointment
              ? {
                  kind: 'appointment_reschedule',
                  leadId: lead.id,
                  expectedVersion: version,
                  appointmentId: appointment.id,
                  ...input,
                  reason,
                }
              : {
                  kind: 'appointment_create',
                  leadId: lead.id,
                  expectedVersion: version,
                  ...input,
                },
          );
        } catch (err) {
          setError(
            err instanceof Error && err.name !== 'ZodError'
              ? err.message
              : 'Kontrollér felterne. Titlen kræver mindst 3 tegn, og aftalen skal vare mellem 1 minut og 24 timer.',
          );
        }
      }}
    >
      <label>
        Aftaletitel
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={3}
          maxLength={160}
          disabled={disabled}
          placeholder="Fx montering af køkkenlamper"
        />
      </label>
      <label>
        Sted
        <input
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          maxLength={300}
          disabled={disabled}
          placeholder="Adresse eller andet mødested"
        />
      </label>
      <div className="appointment-dates">
        <label>
          Start – dansk tid
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            min="2020-01-01T00:00"
            max="2100-12-31T23:59"
            required
            disabled={disabled}
          />
        </label>
        <label>
          Slut – dansk tid
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            min="2020-01-01T00:00"
            max="2100-12-31T23:59"
            required
            disabled={disabled}
          />
        </label>
      </div>
      {appointment && (
        <label>
          Begrundelse for ændringen
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
            maxLength={1000}
            disabled={disabled}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <small className="muted">
        {appointment
          ? 'Tidligere oplysninger bevares i historikken.'
          : 'Opret først aftalen, når tidspunktet er aftalt med kunden.'}{' '}
        Kunden får endnu ingen automatisk besked.
      </small>
      <button className="primary" disabled={disabled}>
        {appointment ? 'Gem aftaleændring' : 'Opret aftale'}
      </button>
    </form>
  );
}
function CancelForm({
  lead,
  version,
  appointment,
  disabled,
  send,
}: FormProps & { appointment: Appointment }) {
  const [reason, setReason] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send({
          kind: 'appointment_cancel',
          leadId: lead.id,
          expectedVersion: version,
          appointmentId: appointment.id,
          reason,
        });
      }}
    >
      <p className="field-help">
        Aftalen fjernes fra kalenderen, og sagen går tilbage til Afklaring med
        Afventer os. Historikken bevares.
      </p>
      <label>
        Begrundelse for aflysning
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={3}
          maxLength={1000}
          required
          disabled={disabled}
        />
      </label>
      <button className="secondary" disabled={disabled}>
        Bekræft aflysning
      </button>
    </form>
  );
}

export function AppointmentHistory({
  details,
}: {
  details: Record<string, unknown>;
}) {
  const before = AppointmentSchema.safeParse(details.appointmentBefore);
  const after = AppointmentSchema.safeParse(details.appointmentAfter);
  if (!after.success) return null;
  return (
    <div className="appointment-history">
      {before.success && (
        <p>
          <strong>Tidligere: </strong>
          {appointmentDate(before.data.starts_at)} –{' '}
          {appointmentDate(before.data.ends_at)}
          <br />
          {before.data.title} · {before.data.location || 'Sted aftales'}
        </p>
      )}
      <p>
        <strong>
          {after.data.state === 'cancelled' ? 'Aflyst: ' : 'Aftale: '}
        </strong>
        {appointmentDate(after.data.starts_at)} –{' '}
        {appointmentDate(after.data.ends_at)}
        <br />
        {after.data.title} · {after.data.location || 'Sted aftales'}
      </p>
    </div>
  );
}
