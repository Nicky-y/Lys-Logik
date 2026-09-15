import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import { AppShell } from './app-shell';
import { sectionFromHash } from './navigation';

// Separate Vite development entry: no auth, gateway, customer fixtures or API calls.
function ShellPreview() {
  const [section, setSection] = useState(() => sectionFromHash(location.hash));
  useEffect(() => {
    const change = () => setSection(sectionFromHash(location.hash));
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    document.title = `${section.label} · Lys & Logik`;
  }, [section]);
  return (
    <AppShell
      section={section}
      profile={{ name: 'Niclas', initials: 'NB', role: 'Backoffice' }}
      inboxHasActivity
      preview
    >
      <section
        className="ws-page-surface"
        aria-label={`${section.label} – foreløbig side`}
      >
        <div className="ws-placeholder">
          <span className="ws-placeholder-icon">
            <section.icon size={30} strokeWidth={1.4} aria-hidden="true" />
          </span>
          <h2>
            {section.id === 'indbakke'
              ? 'Plads til den første henvendelse'
              : section.label}
          </h2>
          <p>Indholdet kommer i næste trin.</p>
        </div>
      </section>
    </AppShell>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ShellPreview />
  </StrictMode>,
);
