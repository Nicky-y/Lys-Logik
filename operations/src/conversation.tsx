import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Send, Image, Images, RefreshCw } from 'lucide-react';
import { type CustomerMailGateway, createMessageSender } from './customer-mail';
import type { OperationsLead } from '../../supabase/functions/_shared/contracts/operations.ts';
import { MessageAttachment } from './message-attachment';
import { conversationMessages, customerPhotos } from './conversation-model';
import type { ChatView } from './case-chat';

const status = {
  queued: 'Afventer afsendelse',
  sending: 'Sender…',
  accepted: 'Afsendt · accepteret af mailudbyderen',
  delivered: 'Leveret til kundens mailserver',
  bounced: 'Kunne ikke leveres',
  failed: 'Afsendelse fejlede',
  review: 'Afsendelse skal kontrolleres hos mailudbyderen',
  received: 'Modtaget',
};
const time = (s: string) =>
  new Intl.DateTimeFormat('da-DK', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Copenhagen',
  }).format(new Date(s));

export function LeadConversation({
  lead,
  gateway,
  online,
  active,
  view,
}: {
  lead: OperationsLead;
  gateway: CustomerMailGateway;
  online: boolean;
  active: boolean;
  view: ChatView;
}) {
  const cache = useQueryClient();
  const sender = useMemo(() => createMessageSender(gateway), [gateway]);
  const [subject, setSubject] = useState('Din opgave hos Lys & Logik');
  const [body, setBody] = useState('');
  const [notice, setNotice] = useState('');
  const scroll = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const previousView = useRef('');
  const enabled = useQuery({
    queryKey: ['mail-enabled'],
    queryFn: () => gateway.enabled(),
    enabled: active,
  });
  const messages = useInfiniteQuery({
    queryKey: ['conversation', lead.id],
    queryFn: ({ pageParam }) => gateway.list(lead.id, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.length === 50 ? pages.length * 50 : undefined,
    enabled: active,
    refetchInterval: active && online ? 15000 : false,
  });
  const send = useMutation({
    mutationFn: () => sender({ leadId: lead.id, subject, body }),
    onSuccess: async () => {
      setBody('');
      followLatest.current = true;
      setNotice('Beskeden er gemt og venter på afsendelse.');
      await cache.invalidateQueries({ queryKey: ['conversation', lead.id] });
    },
  });
  const items = useMemo(
    () => conversationMessages(messages.data?.pages ?? [], lead.id),
    [messages.data, lead.id],
  );
  const photos = useMemo(() => customerPhotos(items), [items]);
  const latestId = items.at(-1)?.id;
  useEffect(() => {
    const currentView = active ? view : '';
    if (currentView !== previousView.current) {
      followLatest.current = true;
      if (scroll.current) scroll.current.scrollTop = 0;
    }
    previousView.current = currentView;
    if (
      active &&
      view === 'conversation' &&
      followLatest.current &&
      scroll.current
    )
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [active, view, latestId]);

  async function loadOlder() {
    const element = scroll.current;
    const before = element?.scrollHeight ?? 0;
    const top = element?.scrollTop ?? 0;
    followLatest.current = false;
    await messages.fetchNextPage();
    // Keep the reading position when older messages are inserted above it.
    requestAnimationFrame(() => {
      if (element?.isConnected && previousView.current === 'conversation')
        element.scrollTop = top + element.scrollHeight - before;
    });
  }

  return (
    <div className="conversation">
      <div className="conversation-tools">
        <p>
          {view === 'photos'
            ? 'Billeder fra kundens mails på denne sag.'
            : 'Kunden modtager og besvarer dine beskeder via e-mail.'}
        </p>
        <button
          type="button"
          className="icon-button"
          aria-label="Opdater samtale"
          onClick={() => void messages.refetch()}
          disabled={!online || messages.isFetching}
        >
          <RefreshCw size={17} aria-hidden="true" />
        </button>
      </div>
      {!online && (
        <p className="chat-connection" role="status">
          Du er offline. Forbind til internettet for at hente nyt og sende.
        </p>
      )}
      <div
        ref={scroll}
        className="conversation-scroll"
        aria-label={
          view === 'photos' ? 'Kundens billeder' : 'Beskeder på sagen'
        }
        tabIndex={0}
        onScroll={() => {
          const element = scroll.current;
          if (element)
            followLatest.current =
              element.scrollHeight - element.scrollTop - element.clientHeight <
              80;
        }}
      >
        {active && (
          <>
            {messages.isPending ? (
              <p role="status">Henter beskeder…</p>
            ) : messages.isError ? (
              <p className="error-box" role="alert">
                Samtalen kunne ikke hentes. Prøv at opdatere.
              </p>
            ) : null}
            {messages.hasNextPage && (
              <button
                type="button"
                className="secondary chat-load-older"
                disabled={!online || messages.isFetching}
                onClick={() => void loadOlder()}
              >
                {messages.isFetchingNextPage
                  ? 'Henter…'
                  : view === 'photos'
                    ? 'Find billeder i ældre beskeder'
                    : 'Vis ældre beskeder'}
              </button>
            )}
            {view === 'photos' ? (
              <>
                {!messages.isPending && !messages.isError && !photos.length && (
                  <div className="conversation-empty">
                    <Images size={28} aria-hidden="true" />
                    <p>Ingen billeder i de hentede beskeder endnu.</p>
                    <p>Du kan bede kunden om billeder i samtalen.</p>
                  </div>
                )}
                <ul className="customer-photo-gallery">
                  {photos.map(({ message, file }) => (
                    <li key={message.id + '/' + file.id}>
                      <MessageAttachment
                        messageId={message.id}
                        file={file}
                        gateway={gateway}
                        online={online}
                      />
                      <small className="muted">
                        <time dateTime={message.created_at}>
                          {time(message.created_at)}
                        </time>{' '}
                        · {message.sender}
                      </small>
                      {!message.sender_matches_customer && (
                        <p className="warning-box">
                          Afsenderadressen afviger fra kundens adresse.
                          Kontrollér afsenderen.
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                {!messages.isPending && !messages.isError && !items.length && (
                  <div className="conversation-empty">
                    <p>Her samler vi jeres beskeder om opgaven.</p>
                    <p>Skriv til kunden, eller bed om et par billeder.</p>
                  </div>
                )}
                <ol className="conversation-list">
                  {items.map((message) => (
                    <li
                      key={message.id}
                      className={'message ' + message.direction}
                    >
                      <div className="message-meta">
                        <strong>
                          {message.direction === 'outbound'
                            ? 'Lys & Logik'
                            : message.sender}
                        </strong>
                        <time dateTime={message.created_at}>
                          {time(message.created_at)}
                        </time>
                      </div>
                      <strong>{message.subject}</strong>
                      {!message.sender_matches_customer && (
                        <p className="warning-box">
                          Afsenderadressen afviger fra kundens adresse.
                          Kontrollér afsenderen, før du bruger oplysningerne.
                        </p>
                      )}
                      <div className="message-body">{message.body}</div>
                      {message.attachments.length > 0 && (
                        <ul className="message-files">
                          {message.attachments.map((file) => (
                            <li key={file.id}>
                              <MessageAttachment
                                messageId={message.id}
                                file={file}
                                gateway={gateway}
                                online={online}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                      <small
                        className={
                          ['failed', 'bounced', 'review'].includes(
                            message.state,
                          )
                            ? 'message-problem'
                            : 'muted'
                        }
                      >
                        {status[message.state]}
                      </small>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </>
        )}
      </div>
      <form
        className="conversation-composer"
        hidden={view !== 'conversation'}
        onSubmit={(e) => {
          e.preventDefault();
          if (
            !active ||
            !online ||
            !enabled.data ||
            send.isPending ||
            !body.trim() ||
            !subject.trim()
          )
            return;
          setNotice('');
          send.mutate();
        }}
      >
        {enabled.isError ? (
          <p className="warning-box">
            Mailforbindelsen kunne ikke kontrolleres.
          </p>
        ) : enabled.data === false ? (
          <p className="warning-box">
            Mailfunktionen afventer opsætning. Du kan endnu ikke sende herfra.
          </p>
        ) : null}
        <details className="chat-subject">
          <summary>Emne: {subject || 'Angiv emne'}</summary>
          <label>
            Emne
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              required
              disabled={send.isPending}
            />
          </label>
        </details>
        <label>
          Besked til kunden
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={10000}
            required
            disabled={send.isPending}
            placeholder="Skriv til kunden om opgaven…"
          />
        </label>
        <div className="conversation-actions">
          <button
            type="button"
            className="secondary"
            disabled={send.isPending}
            onClick={() =>
              setBody(
                (text) =>
                  text +
                  (text ? '\n\n' : '') +
                  'Vil du sende et par billeder af området og de synlige installationer ved at svare på denne mail? Tag gerne både et oversigtsbillede og et nærbillede. Du skal ikke åbne eller skille installationer ad.\n\nVenlig hilsen\nLys & Logik',
              )
            }
          >
            <Image size={16} aria-hidden="true" /> Bed om billeder
          </button>
          <button
            className="primary"
            disabled={
              !online ||
              !enabled.data ||
              send.isPending ||
              !body.trim() ||
              !subject.trim()
            }
          >
            <Send size={16} aria-hidden="true" />
            {send.isPending ? 'Gemmer besked…' : 'Send e-mail'}
          </button>
        </div>
        <small className="muted">Til: {lead.email}</small>
        {send.error && (
          <p role="alert" className="error-box">
            {send.error.message}
          </p>
        )}
        {notice && (
          <p role="status" className="saved-notice">
            {notice}
          </p>
        )}
      </form>
    </div>
  );
}
