import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, Inbox, Menu, PanelLeftClose, X } from 'lucide-react';
import { workspaceSections, type WorkspaceSection } from './navigation';
import './shell.css';

interface AppShellProps {
  section: WorkspaceSection;
  children: ReactNode;
  profile: { name: string; initials: string; role: string };
  inboxHasActivity?: boolean;
  preview?: boolean;
}

/** Presentation only: navigation, mobile drawer and page frame; no customer-data access. */
export function AppShell({
  section,
  children,
  profile,
  inboxHasActivity = false,
  preview = false,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(
    () => matchMedia('(max-width: 800px)').matches,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousSection = useRef(section.id);

  useEffect(() => {
    const media = matchMedia('(max-width: 800px)');
    const resize = () => {
      setMobile(media.matches);
      if (!media.matches) drawer.current?.close();
    };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  useEffect(() => {
    if (previousSection.current === section.id) return;
    previousSection.current = section.id;
    heading.current?.focus();
  }, [section.id]);

  function toggleMenu() {
    if (!mobile) {
      setCollapsed((value) => !value);
      return;
    }
    if (drawer.current?.open) drawer.current.close();
    else {
      drawer.current?.showModal();
      setMenuOpen(true);
    }
  }

  function navigate() {
    if (drawer.current?.open) {
      drawer.current.close();
      requestAnimationFrame(() => heading.current?.focus());
    }
  }

  function navigation(inDrawer = false) {
    const compact = collapsed && !inDrawer;
    return (
      <>
        <div className="ws-brand-row">
          <a
            href="#/sager"
            className="ws-brand"
            aria-label="Lys & Logik – Sager"
            onClick={navigate}
          >
            <img
              className="ws-wordmark"
              src="/logo-white-v34.png"
              alt=""
              width="1254"
              height="1254"
            />
            <img
              className="ws-mark"
              src="/icons/app-v12-192.png"
              alt=""
              width="192"
              height="192"
            />
          </a>
          {inDrawer && (
            <button
              type="button"
              className="ws-icon-button ws-drawer-close"
              aria-label="Luk menu"
              onClick={() => drawer.current?.close()}
            >
              <X size={22} aria-hidden="true" />
            </button>
          )}
        </div>
        <p className="ws-nav-caption">ARBEJDSRUM</p>
        <nav aria-label="Appens hovedmenu" className="ws-navigation">
          {workspaceSections
            .filter((item) => item.id !== 'indbakke')
            .map((item) => (
              <a
                key={item.id}
                href={`#/${item.id}`}
                className={`ws-nav-link${item.id === 'indstillinger' ? ' ws-nav-settings' : ''}`}
                aria-current={section.id === item.id ? 'page' : undefined}
                aria-label={compact ? item.label : undefined}
                title={compact ? item.label : undefined}
                onClick={navigate}
              >
                <item.icon size={20} strokeWidth={1.65} aria-hidden="true" />
                <span className="ws-nav-label">{item.label}</span>
                <ChevronRight
                  className="ws-nav-chevron"
                  size={15}
                  aria-hidden="true"
                />
              </a>
            ))}
        </nav>
        <div className="ws-sidebar-bottom">
          <div
            className="ws-profile"
            title={compact ? `${profile.name} · ${profile.role}` : undefined}
          >
            <span className="ws-avatar" aria-hidden="true">
              {profile.initials}
            </span>
            <div className="ws-profile-label">
              <strong>{profile.name}</strong>
              <span>{profile.role}</span>
            </div>
            {compact && (
              <span className="ws-sr-only">
                {profile.name} · {profile.role}
              </span>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className={`ws-shell${collapsed ? ' ws-shell-collapsed' : ''}`}>
      <a
        className="ws-skip"
        href="#ws-main"
        onClick={(event) => {
          event.preventDefault();
          heading.current?.focus();
        }}
      >
        Gå til indhold
      </a>
      <aside
        id="workspace-sidebar"
        className="ws-sidebar"
        aria-label="Navigation"
      >
        {navigation()}
      </aside>
      <dialog
        id="workspace-mobile-navigation"
        ref={drawer}
        className="ws-drawer"
        aria-label="Hovedmenu"
        onClose={() => {
          setMenuOpen(false);
          menuButton.current?.focus();
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            event.currentTarget.close();
        }}
      >
        {navigation(true)}
      </dialog>
      <div className="ws-content">
        <header className="ws-topbar">
          <button
            type="button"
            ref={menuButton}
            className="ws-icon-button ws-menu-toggle"
            aria-label={
              mobile
                ? 'Åbn menu'
                : collapsed
                  ? 'Fold menu ud'
                  : 'Fold menu sammen'
            }
            aria-expanded={mobile ? menuOpen : !collapsed}
            aria-controls={
              mobile ? 'workspace-mobile-navigation' : 'workspace-sidebar'
            }
            aria-haspopup={mobile ? 'dialog' : undefined}
            onClick={toggleMenu}
          >
            {!mobile && !collapsed ? (
              <PanelLeftClose size={21} aria-hidden="true" />
            ) : (
              <Menu size={22} aria-hidden="true" />
            )}
          </button>
          <div className="ws-breadcrumb" aria-hidden="true">
            <span>Arbejdsrum</span>
            <ChevronRight size={14} />
            <strong>{section.label}</strong>
          </div>
          <span className="ws-mobile-name">Lys & Logik</span>
          <div className="ws-topbar-actions">
            <a
              href="#/indbakke"
              className="ws-inbox ws-icon-button"
              aria-current={section.id === 'indbakke' ? 'page' : undefined}
              aria-label={`Indbakke${inboxHasActivity ? (preview ? ' – eksempel på nye henvendelser' : ' – nye henvendelser') : ''}`}
              title={preview ? 'Indbakke · eksempel' : 'Indbakke'}
            >
              <Inbox size={22} strokeWidth={1.65} aria-hidden="true" />
              {inboxHasActivity && (
                <span className="ws-inbox-dot" aria-hidden="true" />
              )}
            </a>
            <span className="ws-topbar-divider" />
            <span
              className="ws-topbar-avatar"
              title={`${profile.name} · ${profile.role}`}
            >
              {profile.initials}
            </span>
          </div>
        </header>
        <main id="ws-main" className="ws-main">
          <div className="ws-page-heading">
            <p className="ws-eyebrow">LYS & LOGIK</p>
            <h1 ref={heading} tabIndex={-1}>
              {section.label}
            </h1>
            <p className="ws-page-description">{section.description}</p>
          </div>
          {children}
        </main>
        {preview && (
          <footer className="ws-preview-note">
            <span className="ws-preview-dot" /> Designudkast <span>·</span>{' '}
            Ingen kundedata
          </footer>
        )}
      </div>
    </div>
  );
}
