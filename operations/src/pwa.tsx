import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Download, X } from 'lucide-react';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
const PwaContext = createContext<{
  installed: boolean;
  prompt: InstallPrompt | null;
  clearPrompt: () => void;
}>({ installed: false, prompt: null, clearPrompt: () => {} });

export function PwaProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    const display = matchMedia('(display-mode: standalone)');
    const updateDisplay = () => setInstalled(display.matches);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const didInstall = () => {
      setInstalled(true);
      setPrompt(null);
    };
    updateDisplay();
    display.addEventListener('change', updateDisplay);
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', didInstall);
    if (
      import.meta.env.PROD &&
      import.meta.env.VITE_OPERATIONS_MODE !== 'demo' &&
      window.isSecureContext &&
      'serviceWorker' in navigator
    ) {
      // Failure leaves the online app usable; registration is retried on next visit.
      void navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .catch(() => {});
    }
    return () => {
      display.removeEventListener('change', updateDisplay);
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', didInstall);
    };
  }, []);
  return (
    <PwaContext.Provider
      value={{ installed, prompt, clearPrompt: () => setPrompt(null) }}
    >
      {children}
    </PwaContext.Provider>
  );
}

export function InstallApp() {
  const { installed, prompt, clearPrompt } = useContext(PwaContext);
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (installed || import.meta.env.VITE_OPERATIONS_MODE === 'demo') return null;
  async function install() {
    if (!prompt) return;
    setBusy(true);
    setMessage('');
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') dialog.current?.close();
      else
        setMessage(
          'Installationen blev lukket. Du kan stadig bruge appen her og installere senere via browserens menu.',
        );
    } catch {
      setMessage('Installationen kunne ikke åbnes. Prøv via browserens menu.');
    } finally {
      clearPrompt();
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="install-app-button"
        onClick={() => dialog.current?.showModal()}
      >
        <Download size={16} /> Installér app
      </button>
      <dialog
        ref={dialog}
        className="install-dialog"
        aria-labelledby="install-title"
      >
        <button
          type="button"
          className="icon-button install-close"
          aria-label="Luk installationsvejledning"
          onClick={() => dialog.current?.close()}
        >
          <X size={20} />
        </button>
        <img className="install-icon" src="/icons/app-192.png" alt="" />
        <p className="eyebrow">LYS & LOGIK PÅ TELEFONEN</p>
        <h2 id="install-title">Et tryk til arbejdsrummet.</h2>
        <p>
          Få Lys & Logik som app med eget ikon på din hjemmeskærm. Brug din
          samme medarbejderkonto.
        </p>
        {!window.isSecureContext ? (
          <p className="error-box">
            Åbn appens HTTPS-adresse på telefonen for at installere. Den lokale
            netværksadresse understøtter ikke installation.
          </p>
        ) : prompt ? (
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => void install()}
          >
            {busy ? 'Åbner installation…' : 'Installér Lys & Logik'}
          </button>
        ) : (
          <ol>
            <li>
              Åbn denne adresse i <strong>Chrome på Android</strong>.
            </li>
            <li>
              Tryk på browserens menu <strong>⋮</strong>.
            </li>
            <li>
              Vælg <strong>Føj til startskærm</strong> og derefter{' '}
              <strong>Installér</strong>. Nogle versioner viser direkte
              »Installér app«.
            </li>
          </ol>
        )}
        {message && <p role="status">{message}</p>}
        <p className="install-footnote">
          Sager og aftaler kræver internet. Mobilnotifikationer kommer i et
          senere trin.
        </p>
      </dialog>
    </>
  );
}
