import { useCallback, useEffect, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUpRight,
  Archive,
  Check,
  ChevronRight,
  Clock3,
  Inbox,
  LoaderCircle,
  LogOut,
  MessagesSquare,
  MapPin,
  RefreshCw,
  Search,
  ReceiptText,
} from 'lucide-react';
import {
  serviceLabels,
  statusLabels,
  type LeadStatus,
  type OperationsLead,
  type Staff,
} from '../../supabase/functions/_shared/contracts/operations.ts';
import type { OperationsGateway } from './gateway';
import type { PushController } from './push-controller';
import { LeadDialog } from './lead-detail';
import { CalendarView } from './calendar';
import { DeviceSettings } from './device-settings';
import { AppShell } from './shell/app-shell';
import {
  collectionPath,
  leadPath,
  readWorkspaceRoute,
  statusesForCollection,
} from './lead-navigation';
import { caseTracks } from './case-tracks';
import './inbox.css';
import {
  canWorkWithCustomers,
  staffAccessLabel,
} from '../../supabase/functions/_shared/contracts/staff.ts';
import type { StaffAccessGateway } from './staff-access';
import { StaffSettings } from './staff-settings';

const refreshPolicy = {
  refetchInterval: 30000,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
} as const;

export function Workspace({
  gateway,
  push,
  staff,
  demo,
  onSignOut,
  staffAccess,
  onAccessChanged,
}: {
  gateway: OperationsGateway;
  push?: PushController;
  staff: Staff;
  demo: boolean;
  onSignOut: () => void;
  staffAccess: StaffAccessGateway;
  onAccessChanged: () => Promise<void>;
}) {
  const canWork = canWorkWithCustomers(staff);
  const [view, setView] = useState(() => readWorkspaceRoute(location.hash));
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('all');
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => {
      setView(readWorkspaceRoute(location.hash));
      setStage('all');
      setSearch('');
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
  const isInbox = view.section.id === 'indbakke';
  const isCases = view.section.id === 'sager';
  const isArchive = view.collection === 'archive';
  const list = useInfiniteQuery({
    queryKey: ['leads', staff.user_id, view.collection, view.caseTrack],
    queryFn: ({ pageParam }) =>
      gateway.list(pageParam, view.collection, view.caseTrack),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.hasMore ? pages.length * 100 : undefined,
    enabled: canWork && (isInbox || isCases),
    ...refreshPolicy,
  });
  const inbox = useQuery({
    queryKey: ['inbox-count', staff.user_id],
    queryFn: () => gateway.inboxCount(),
    enabled: canWork,
    ...refreshPolicy,
  });
  const all = list.data?.pages.flatMap((page) => page.items) ?? [];
  const statuses = statusesForCollection(view.collection, view.caseTrack);
  const track = caseTracks[view.caseTrack];
  const visible = all.filter(
    (lead) =>
      statuses.includes(lead.status) &&
      (stage === 'all' || stage === lead.status) &&
      `${lead.name} ${lead.email} ${lead.postal_code} ${lead.description}`
        .toLocaleLowerCase('da')
        .includes(search.toLocaleLowerCase('da')),
  );
  const currentColumns =
    stage === 'all' ? statuses : statuses.filter((status) => status === stage);

  // A push notification can be older than the handoff. Resolve its destination from saved state.
  const resolveLead = useCallback((lead: OperationsLead) => {
    const current = readWorkspaceRoute(location.hash);
    if (current.lead !== lead.id) return;
    const target =
      current.section.id === 'kalender' && lead.status !== 'new'
        ? location.hash
        : leadPath(lead.id, lead.status);
    if (target !== location.hash) {
      history.replaceState(
        null,
        '',
        location.pathname + location.search + target,
      );
      setView(readWorkspaceRoute(target));
      setStage('all');
      setSearch('');
    }
  }, []);
  const refresh = () => {
    void list.refetch();
    void inbox.refetch();
  };
  const inboxLabel = !canWork
    ? 'Indbakke – kræver en arbejdsrolle'
    : inbox.isError || !online
      ? 'Indbakke – status kan ikke opdateres'
      : inbox.isPending
        ? 'Indbakke – henter nye henvendelser'
        : `Indbakke – ${inbox.data} nye henvendelser`;
  return (
    <>
      <AppShell
        section={view.section}
        profile={{
          name: staff.display_name,
          initials: staff.display_name
            .split(' ')
            .filter(Boolean)
            .map((word) => word[0])
            .slice(0, 2)
            .join('')
            .toUpperCase(),
          role: staffAccessLabel(staff),
        }}
        inboxHasActivity={canWork && (inbox.data ?? 0) > 0}
        inboxLabel={inboxLabel}
        sessionAction={
          <button
            type="button"
            className="ws-signout"
            onClick={onSignOut}
            aria-label={demo ? 'Nulstil prøvevisning' : 'Log ud'}
            title={demo ? 'Nulstil prøvevisning' : 'Log ud'}
          >
            <LogOut size={18} aria-hidden="true" />
            <span>{demo ? 'Nulstil prøvevisning' : 'Log ud'}</span>
          </button>
        }
      >
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
        {canWork && inbox.isError && (
          <p role="alert" className="error-box">
            Indbakkens antal kunne ikke opdateres.{' '}
            <button
              className="text-button"
              onClick={() => void inbox.refetch()}
            >
              Prøv igen
            </button>
          </p>
        )}
        {!canWork && view.section.id !== 'indstillinger' ? (
          <section className="settings-panel">
            <h2>Ingen arbejdsrolle</h2>
            <p>
              Din konto har ikke adgang til kundesager eller kalender.
              Ejerrettigheder administreres separat.
            </p>
            <a className="secondary" href="#/indstillinger">
              Åbn Indstillinger
            </a>
          </section>
        ) : view.section.id === 'kalender' ? (
          <CalendarView
            gateway={gateway}
            selectedDay={view.day}
            online={online}
          />
        ) : isInbox || isCases ? (
          <>
            {isCases && (
              <nav className="case-tabs" aria-label="Sagsoversigter">
                <div className="case-track-switch">
                  <a
                    href="#/sager"
                    aria-current={
                      !isArchive && view.caseTrack === 'planning'
                        ? 'page'
                        : undefined
                    }
                  >
                    <MessagesSquare size={19} aria-hidden="true" />
                    {caseTracks.planning.label}
                  </a>
                  <a
                    href="#/sager/opfoelgning"
                    aria-current={
                      !isArchive && view.caseTrack === 'settlement'
                        ? 'page'
                        : undefined
                    }
                  >
                    <ReceiptText size={19} aria-hidden="true" />
                    {caseTracks.settlement.label}
                  </a>
                </div>
                <a
                  href="#/sager/arkiv"
                  className="case-archive-link"
                  aria-current={isArchive ? 'page' : undefined}
                >
                  <Archive size={17} aria-hidden="true" /> Arkiv
                </a>
              </nav>
            )}
            <section
              className="pipeline-section inbox-workspace"
              aria-label={
                isInbox
                  ? 'Nye henvendelser'
                  : isArchive
                    ? 'Arkiverede sager'
                    : track.label
              }
            >
              <div className="pipeline-tools">
                <div>
                  <h2>
                    {isInbox
                      ? 'Afventer første behandling'
                      : isArchive
                        ? 'Arkiverede sager'
                        : track.label}
                  </h2>
                  <span className="muted">
                    {isInbox
                      ? `${inbox.data ?? '…'} nye henvendelser`
                      : `${visible.length} sager i overblikket`}
                  </span>
                </div>
                <label className="search">
                  <Search size={18} aria-hidden="true" />
                  <span className="sr-only">Søg i sager</span>
                  <input
                    type="search"
                    placeholder="Søg navn, postnr. eller opgave"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                <button
                  className="secondary refresh"
                  disabled={list.isFetching || !online}
                  onClick={refresh}
                >
                  <RefreshCw
                    size={16}
                    className={list.isFetching ? 'spin' : ''}
                    aria-hidden="true"
                  />
                  Opdater
                </button>
              </div>
              {isInbox && (
                <p className="inbox-explanation">
                  Åbn en henvendelse, og tag den første kontakt. Vælg derefter{' '}
                  <strong>Flyt til Sager</strong>, når I er klar til at arbejde
                  videre med opgaven.
                </p>
              )}
              {isCases && !isArchive && (
                <p className="case-track-description">{track.description}</p>
              )}
              {!isInbox && (
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
                  {statuses.map((status) => (
                    <button
                      key={status}
                      aria-pressed={stage === status}
                      onClick={() => setStage(status)}
                    >
                      {statusLabels[status]}{' '}
                      <span>
                        {all.filter((lead) => lead.status === status).length}
                      </span>
                    </button>
                  ))}
                </div>
              )}
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
              ) : isInbox ? (
                <div className="inbox-list">
                  {visible.map((lead) => (
                    <LeadCard key={lead.id} lead={lead} />
                  ))}
                  {visible.length === 0 && (
                    <div className="inbox-empty">
                      <Inbox size={32} aria-hidden="true" />
                      <h3>{search ? 'Ingen match' : 'Indbakken er tom'}</h3>
                      <p>
                        {search
                          ? 'Prøv et andet navn eller postnummer.'
                          : 'Nye henvendelser fra hjemmesiden vises her.'}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className={`board case-board ${isArchive ? 'archive-board' : ''}`}
                  aria-label="Sagskolonner"
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
                          {
                            visible.filter((lead) => lead.status === status)
                              .length
                          }
                        </span>
                      </header>
                      <div className="column-cards">
                        {visible
                          .filter((lead) => lead.status === status)
                          .map((lead) => (
                            <LeadCard key={lead.id} lead={lead} />
                          ))}
                        {!visible.some((lead) => lead.status === status) && (
                          <div className="empty">
                            <Inbox size={26} aria-hidden="true" />
                            <p>
                              {search ? 'Ingen match' : 'Ingen sager her endnu'}
                            </p>
                          </div>
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
                  <ArrowDown size={16} aria-hidden="true" />
                  Indlæs flere sager
                </button>
              )}
              <p className="board-help">
                {list.hasNextPage
                  ? 'Søgningen og kolonnernes antal gælder de indlæste sager. Indlæs flere for resten.'
                  : 'Hver henvendelse bevarer sin egen sag, samtale og historik.'}
              </p>
            </section>
          </>
        ) : view.section.id === 'indstillinger' ? (
          <>
            <StaffSettings
              staff={staff}
              gateway={staffAccess}
              online={online}
              onAccessChanged={onAccessChanged}
            />
            <DeviceSettings
              key={staff.user_id}
              push={push}
              canWork={canWork}
              demo={demo}
            />
          </>
        ) : (
          <section className="ws-page-surface">
            <div className="ws-placeholder">
              <span className="ws-placeholder-icon">
                <view.section.icon size={30} aria-hidden="true" />
              </span>
              <h2>{view.section.label}</h2>
              <p>Indholdet kommer i næste trin.</p>
            </div>
          </section>
        )}
      </AppShell>
      {canWork && view.lead && (
        <LeadDialog
          key={view.lead}
          id={view.lead}
          gateway={gateway}
          staff={staff}
          online={online}
          onResolved={resolveLead}
          routeKey={location.hash}
          onClose={() => {
            location.hash =
              view.section.id === 'kalender'
                ? `#/kalender${view.day ? '/' + view.day : ''}`
                : collectionPath(view.collection, view.caseTrack);
          }}
        />
      )}
    </>
  );
}

function LeadCard({ lead }: { lead: OperationsLead }) {
  return (
    <a className="lead-card" href={leadPath(lead.id, lead.status)}>
      <div className="card-top">
        <span className={`service-tag service-${lead.service}`}>
          {serviceLabels[lead.service]}
        </span>
        <ArrowUpRight size={16} aria-hidden="true" />
      </div>
      <h4>{lead.name}</h4>
      <span className="location">
        <MapPin size={13} aria-hidden="true" />
        {lead.postal_code}
      </span>
      <p className="card-description">{lead.description}</p>
      {lead.pilot_requested === true && (
        <span className="pilot-request">Ønsker pilotprojekt</span>
      )}
      {lead.waiting_on && (
        <span className={`waiting waiting-${lead.waiting_on}`}>
          <Clock3 size={13} aria-hidden="true" />
          {lead.waiting_on === 'customer' ? 'Afventer kunden' : 'Afventer os'}
        </span>
      )}
      {lead.review_decision === 'approved' && (
        <span className="approved">
          <Check size={13} aria-hidden="true" />
          Fagligt godkendt
        </span>
      )}
      <footer>
        <span>
          {new Intl.DateTimeFormat('da-DK', {
            day: 'numeric',
            month: 'short',
            timeZone: 'Europe/Copenhagen',
          }).format(new Date(lead.created_at))}
        </span>
        <span>
          {lead.status === 'new' ? 'Åbn henvendelse' : 'Åbn sag'}{' '}
          <ChevronRight size={13} aria-hidden="true" />
        </span>
      </footer>
    </a>
  );
}
