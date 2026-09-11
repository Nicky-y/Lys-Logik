import { useEffect, useRef, useState } from 'react';
import { Download, Expand, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { CustomerMailGateway } from './customer-mail';
import {
  downloadableAttachment,
  type CustomerMessage,
} from '../../supabase/functions/_shared/contracts/mail.ts';

export function MessageAttachment({
  messageId,
  file,
  gateway,
  online,
}: {
  messageId: CustomerMessage['id'];
  file: CustomerMessage['attachments'][number];
  gateway: CustomerMailGateway;
  online: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [resource, setResource] = useState<{ url: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);
  const allowed = downloadableAttachment(file);
  const isImage =
    allowed &&
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.content_type);
  const { id, content_type: contentType } = file;

  useEffect(() => {
    if (!isImage || !container.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' },
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [isImage]);

  useEffect(() => {
    if (visible && online && isImage) setReady(true);
  }, [visible, online, isImage]);

  // Private image bytes live only in this mounted component. Revocation also
  // handles a response arriving after the case was closed or the user logged out.
  useEffect(() => {
    if (!ready) return;
    let active = true;
    let objectUrl: string | undefined;
    setBusy(true);
    setError('');
    setResource(null);
    void gateway
      .attachment(messageId, id)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(
          new Blob([blob], { type: contentType }),
        );
        setResource({ url: objectUrl });
      })
      .catch(() => {
        if (active) setError('Billedet kunne ikke hentes. Prøv igen.');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ready, attempt, gateway, messageId, id, contentType]);

  async function download() {
    if (resource) {
      const anchor = document.createElement('a');
      anchor.href = resource.url;
      anchor.download = file.filename;
      anchor.click();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const blob = await gateway.attachment(messageId, id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch {
      setError('Filen kunne ikke hentes. Prøv igen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={container} className="attachment-card">
      {isImage &&
        (resource ? (
          <button
            type="button"
            className="attachment-preview"
            aria-label={'Vis billede: ' + file.filename}
            onClick={() => {
              setZoom(false);
              dialog.current?.showModal();
            }}
          >
            <img
              src={resource.url}
              alt={file.filename}
              decoding="async"
              onError={() =>
                setError(
                  'Billedformatet kunne ikke vises. Du kan stadig hente filen.',
                )
              }
            />
            <span>
              <Expand size={16} /> Vis stort
            </span>
          </button>
        ) : (
          <div className="attachment-placeholder" role="status">
            {!online
              ? 'Forbind til internettet for at se billedet.'
              : busy
                ? 'Henter billede…'
                : error
                  ? 'Billedet kunne ikke vises.'
                  : 'Billede'}
          </div>
        ))}
      <div className="attachment-caption">
        <span>
          {file.filename} <small>({Math.ceil(file.size / 1024)} KB)</small>
        </span>
        <button
          type="button"
          className="text-button"
          disabled={!allowed || busy || (!online && !resource)}
          aria-label={'Hent fil: ' + file.filename}
          onClick={() => void download()}
        >
          <Download size={16} /> Hent
        </button>
      </div>
      {!allowed && (
        <small>
          Kun JPG, PNG, WebP og PDF op til 10 MB kan hentes i appen.
        </small>
      )}
      {error && (
        <div className="attachment-error">
          <p role="alert">{error}</p>
          {isImage && !resource && (
            <button
              type="button"
              className="text-button"
              disabled={!online || busy}
              onClick={() => setAttempt((n) => n + 1)}
            >
              Prøv igen
            </button>
          )}
        </div>
      )}
      {isImage && (
        <dialog
          ref={dialog}
          className="image-dialog"
          aria-label={'Billede: ' + file.filename}
          onCancel={(event) => {
            event.preventDefault();
            event.stopPropagation();
            dialog.current?.close();
          }}
        >
          <header className="image-toolbar">
            <strong>{file.filename}</strong>
            <button
              type="button"
              className="text-button"
              onClick={() => setZoom((value) => !value)}
            >
              {zoom ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
              {zoom ? 'Tilpas' : 'Forstør'}
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Luk billede"
              onClick={() => dialog.current?.close()}
            >
              <X />
            </button>
          </header>
          <div className={'image-viewport' + (zoom ? ' zoomed' : '')}>
            {resource && <img src={resource.url} alt={file.filename} />}
          </div>
        </dialog>
      )}
    </div>
  );
}
