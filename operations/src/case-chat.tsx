import { useEffect, useLayoutEffect, useRef } from 'react';
import { Images, Mail, MessageCircle, Minus } from 'lucide-react';
import type { OperationsLead } from '../../supabase/functions/_shared/contracts/operations.ts';
import type { CustomerMailGateway } from './customer-mail';
import { LeadConversation } from './conversation';
import './case-chat.css';

export type ChatView = 'conversation' | 'photos';

export function CaseChat({
  lead,
  gateway,
  online,
  view,
  onViewChange,
}: {
  lead: OperationsLead;
  gateway: CustomerMailGateway;
  online: boolean;
  view: ChatView | null;
  onViewChange: (view: ChatView | null) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    if (view && !dialog.current?.open) dialog.current?.showModal();
    else if (!view && dialog.current?.open) dialog.current.close();
  }, [view]);
  useEffect(() => {
    const element = dialog.current;
    return () => element?.close();
  }, []);

  return (
    <>
      <button
        type="button"
        className="customer-chat-launcher"
        aria-label="Åbn kundesamtale"
        aria-haspopup="dialog"
        aria-controls="customer-chat"
        aria-expanded={view !== null}
        onClick={() => onViewChange('conversation')}
      >
        <MessageCircle size={21} aria-hidden="true" /> Kundesamtale
      </button>
      <dialog
        ref={dialog}
        id="customer-chat"
        className="customer-chat"
        aria-labelledby="customer-chat-title"
        onCancel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onViewChange(null);
        }}
      >
        <header className="customer-chat-header">
          <span className="customer-chat-mark">
            <MessageCircle size={23} aria-hidden="true" />
          </span>
          <div>
            <h3 id="customer-chat-title">Samtale med kunden</h3>
            <p>{lead.name}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Minimer kundesamtale"
            onClick={() => onViewChange(null)}
            autoFocus
          >
            <Minus size={22} aria-hidden="true" />
          </button>
        </header>
        <div
          className="customer-chat-views"
          role="group"
          aria-label="Visning i kundesamtalen"
        >
          <button
            type="button"
            aria-pressed={view === 'conversation'}
            onClick={() => onViewChange('conversation')}
          >
            <Mail size={17} aria-hidden="true" /> Samtale
          </button>
          <button
            type="button"
            aria-pressed={view === 'photos'}
            onClick={() => onViewChange('photos')}
          >
            <Images size={17} aria-hidden="true" /> Billeder
          </button>
        </div>
        {/* Keep drafts and retry identity while minimized. Private image components
          and polling exist only while this case's chat is open. */}
        <LeadConversation
          lead={lead}
          gateway={gateway}
          online={online}
          active={view !== null}
          view={view ?? 'conversation'}
        />
      </dialog>
    </>
  );
}
