import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient, type Session } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArrowRight, ShieldCheck, LoaderCircle } from 'lucide-react';
import '@fontsource-variable/manrope';
import './styles.css';
import {
  StaffSchema,
  type Staff,
} from '../../supabase/functions/_shared/contracts/operations.ts';
import { createOperationsGateway, type OperationsGateway } from './gateway';
import { Workspace } from './workspace';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 15000, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});
const demo = import.meta.env.VITE_OPERATIONS_MODE === 'demo';
const url = import.meta.env.VITE_SUPABASE_URL;
const publishable = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const passwordLink = /(?:type=invite|type=recovery)/.test(
  location.hash + location.search,
);
const client =
  !demo && url && publishable
    ? createClient(url, publishable, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
        global: {
          fetch: (input, init) =>
            fetch(input, {
              ...init,
              signal: init?.signal ?? AbortSignal.timeout(15000),
            }),
        },
      })
    : null;
const liveGateway = client ? createOperationsGateway(client) : null;

function SignIn({
  onDone,
  initialPassword = false,
}: {
  onDone?: () => void;
  initialPassword?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!client) return;
    setBusy(true);
    setError('');
    try {
      const result = initialPassword
        ? await client.auth.updateUser({ password })
        : await client.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
      if (result.error)
        throw new Error(
          initialPassword
            ? 'Adgangskoden kunne ikke gemmes. Brug mindst 12 tegn, og prøv igen.'
            : 'Login lykkedes ikke. Kontrollér e-mail og adgangskode.',
        );
      if (initialPassword) {
        history.replaceState(null, '', location.pathname + '#/pipeline');
        onDone?.();
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Der er ikke forbindelse. Prøv igen.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="signin">
      <section className="signin-story">
        <img src="/logo.png" alt="Lys & Logik" />
        <div>
          <span className="eyebrow">JERES FÆLLES ARBEJDSRUM</span>
          <h1>
            Fra første hej
            <br />
            til sidste detalje.
          </h1>
          <p>
            Henvendelser, faglig omtanke og tydelige aftaler. Samlet ét sted.
          </p>
        </div>
        <small>Håndværk. Omtanke. Muligheder.</small>
      </section>
      <section className="signin-panel">
        <div className="signin-box">
          <span className="icon-box">
            <ShieldCheck size={23} />
          </span>
          <p className="eyebrow">LYS & LOGIK · INTERNT</p>
          <h2>
            {initialPassword ? 'Vælg din adgangskode' : 'Velkommen tilbage'}
          </h2>
          <p className="muted">
            {initialPassword
              ? 'Gør din personlige konto klar til arbejdsrummet.'
              : 'Log ind med din personlige medarbejderkonto.'}
          </p>
          <form onSubmit={submit}>
            {!initialPassword && (
              <label>
                E-mail
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            )}
            <label>
              Adgangskode
              <input
                type="password"
                autoComplete={
                  initialPassword ? 'new-password' : 'current-password'
                }
                minLength={initialPassword ? 12 : 1}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {initialPassword && (
              <small>Mindst 12 tegn. Brug en unik adgangskode.</small>
            )}
            {error && (
              <p role="alert" className="error-box">
                {error}
              </p>
            )}
            {!client && (
              <p role="alert" className="error-box">
                Appens forbindelse mangler. Opsæt de offentlige
                Supabase-oplysninger, før du logger ind.
              </p>
            )}
            <button className="primary" disabled={busy || !client}>
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <ArrowRight size={18} />
              )}{' '}
              {initialPassword ? 'Gem og åbn arbejdsrummet' : 'Log ind'}
            </button>
          </form>
          <p className="login-help">
            Adgang gives personligt. Har du ikke en konto endnu, skal du
            inviteres af administratoren.
          </p>
        </div>
      </section>
    </main>
  );
}
function Application() {
  const [session, setSession] = useState<Session | null>(null);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(!demo && !!client);
  const [accessError, setAccessError] = useState('');
  const [needPassword, setNeedPassword] = useState(passwordLink);
  const [demoState, setDemoState] = useState<{
    gateway: OperationsGateway;
    staff: Staff;
  } | null>(null);
  useEffect(() => {
    if (demo) {
      void import('./demo').then((m) =>
        setDemoState({ gateway: m.createDemoGateway(), staff: m.demoStaff }),
      );
    }
  }, []);
  useEffect(() => {
    if (!client) return;
    let current = true;
    void client.auth.getSession().then(({ data, error }) => {
      if (current) {
        setSession(data.session);
        if (error || !data.session) setLoading(false);
      }
    });
    const { data } = client.auth.onAuthStateChange((event, next) => {
      if (current) {
        if (event === 'PASSWORD_RECOVERY') setNeedPassword(true);
        setSession(next);
        if (!next) {
          queryClient.clear();
          setStaff(null);
          setLoading(false);
        }
      }
    });
    return () => {
      current = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!client || !session) return;
    let current = true;
    async function load() {
      setLoading(true);
      setAccessError('');
      try {
        const result = await client!
          .from('staff_members')
          .select('user_id,display_name,active,role')
          .eq('user_id', session!.user.id)
          .maybeSingle();
        if (!current) return;
        if (result.error)
          throw new Error(
            'Medarbejderadgangen kunne ikke kontrolleres. Prøv at logge ind igen.',
          );
        const member = result.data ? StaffSchema.parse(result.data) : null;
        setStaff(member?.active ? member : null);
      } catch (err) {
        if (current) {
          setStaff(null);
          setAccessError(
            err instanceof Error
              ? err.message
              : 'Adgangen kunne ikke kontrolleres.',
          );
        }
      } finally {
        if (current) setLoading(false);
      }
    }
    void load();
    return () => {
      current = false;
    };
  }, [session?.user.id]);
  async function signOut() {
    await client?.auth.signOut({ scope: 'local' });
    queryClient.clear();
    setSession(null);
    setStaff(null);
  }
  if (demo && demoState)
    return (
      <Workspace
        gateway={demoState.gateway}
        staff={demoState.staff}
        demo
        onSignOut={() => location.reload()}
      />
    );
  if (loading || demo)
    return (
      <main className="loading-screen">
        <LoaderCircle className="spin" />
        <p>Åbner arbejdsrummet…</p>
      </main>
    );
  if (!session) return <SignIn />;
  if (needPassword)
    return <SignIn initialPassword onDone={() => setNeedPassword(false)} />;
  if (!staff)
    return (
      <main className="loading-screen">
        <ShieldCheck size={32} />
        <h1>Din konto afventer adgang</h1>
        <p>
          {accessError ||
            'Du er logget ind, men er endnu ikke tilføjet som aktiv medarbejder.'}
        </p>
        <button className="secondary" onClick={() => void signOut()}>
          Log ud
        </button>
      </main>
    );
  return (
    <Workspace
      gateway={liveGateway!}
      staff={staff}
      demo={false}
      onSignOut={() => void signOut()}
    />
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Application />
    </QueryClientProvider>
  </React.StrictMode>,
);
