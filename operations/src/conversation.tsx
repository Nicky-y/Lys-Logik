import { useMemo, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Mail, Send, Image, RefreshCw } from 'lucide-react';
import { type CustomerMailGateway, createMessageSender } from './customer-mail';
import type { OperationsLead } from '../../supabase/functions/_shared/contracts/operations.ts';
import { MessageAttachment } from './message-attachment';
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
}: {
  lead: OperationsLead;
  gateway: CustomerMailGateway;
  online: boolean;
}) {
  const cache = useQueryClient();
  const sender = useMemo(() => createMessageSender(gateway), [gateway]);
  const [subject, setSubject] = useState('Din opgave hos Lys & Logik');
  const [body, setBody] = useState('');
  const [notice, setNotice] = useState('');
  const enabled = useQuery({
    queryKey: ['mail-enabled'],
    queryFn: () => gateway.enabled(),
  });
  const messages = useInfiniteQuery({
    queryKey: ['conversation', lead.id],
    queryFn: ({ pageParam }) => gateway.list(lead.id, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.length === 50 ? pages.length * 50 : undefined,
    refetchInterval: online ? 15000 : false,
  });
  const send = useMutation({
    mutationFn: () => sender({ leadId: lead.id, subject, body }),
    onSuccess: async () => {
      setBody('');
      setNotice(
        'Beskeden er gemt og venter på afsendelse. Leveringsstatus opdateres her.',
      );
      await cache.invalidateQueries({ queryKey: ['conversation', lead.id] });
    },
  });
  const items = messages.data?.pages.flat() ?? [];
  return (
    <section
      className="detail-section conversation"
      aria-labelledby="conversation-heading"
    >
      <div className="section-heading">
        <h3 id="conversation-heading">
          <Mail size={18} /> Samtale med kunden
        </h3>
        <button
          className="text-button"
          onClick={() => void messages.refetch()}
          disabled={!online || messages.isFetching}
        >
          <RefreshCw size={16} /> Opdater samtale
        </button>
      </div>
      <p className="muted">
        Du skriver her. Kunden modtager en e-mail og svarer direkte på den.
      </p>
      {messages.isPending ? (
        <p role="status">Henter beskeder…</p>
      ) : messages.isError ? (
        <p className="error-box" role="alert">
          Samtalen kunne ikke hentes. Prøv at opdatere.
        </p>
      ) : !items.length ? (
        <p className="conversation-empty">
          Her samler vi jeres beskeder om opgaven.
        </p>
      ) : (
        <>
          {messages.hasNextPage && (
            <button
              className="secondary"
              disabled={messages.isFetchingNextPage}
              onClick={() => void messages.fetchNextPage()}
            >
              Vis ældre beskeder
            </button>
          )}
          <ol className="conversation-list">
            {[...items].reverse().map((message) => (
              <li key={message.id} className={'message ' + message.direction}>
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
                    Afsenderadressen afviger fra kundens adresse. Kontrollér
                    afsenderen, før du bruger oplysningerne.
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
                    ['failed', 'bounced', 'review'].includes(message.state)
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
      {enabled.isError ? (
        <p className="warning-box">Mailforbindelsen kunne ikke kontrolleres.</p>
      ) : enabled.data === false ? (
        <p className="warning-box">
          Mailfunktionen afventer opsætning. Du kan endnu ikke sende herfra.
        </p>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setNotice('');
          send.mutate();
        }}
      >
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
        <label>
          Besked til kunden
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
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
            <Image size={16} /> Bed om billeder
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
            <Send size={16} />
            {send.isPending ? 'Gemmer besked…' : 'Send e-mail'}
          </button>
        </div>
        <small className="muted">
          Til: {lead.email} · {body.length}/10.000 tegn
        </small>
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
    </section>
  );
}
