import {
  CONSENT_KEY,
  CONSENT_LIFETIME,
  MEASUREMENT_ID,
  encodeChoice,
  readChoice,
  pageLocation,
  type StatisticsChoice,
} from './analytics-consent';

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  [key: `ga-disable-${string}`]: boolean;
};
export function initAnalytics() {
  const banner = document.querySelector<HTMLElement>('#statistics-banner');
  if (!banner || banner.dataset.initialized) return;
  banner.dataset.initialized = 'true';
  const win = window as unknown as AnalyticsWindow;
  const productionHost =
    location.protocol === 'https:' &&
    (location.hostname === 'lysoglogik.dk' ||
      (location.hostname === 'nicky-y.github.io' &&
        location.pathname.startsWith('/Lys-Logik/')));
  // Local builds exercise consent without contacting Google.
  const canLoadGoogle = productionHost;
  const status = banner.querySelector<HTMLElement>('[data-consent-status]')!;
  const accept = banner.querySelector<HTMLButtonElement>(
    '[data-consent-accept]',
  )!;
  let started = false;
  let active = false;
  let storageFailed = false;
  let opener: HTMLElement | null = null;
  let choice: StatisticsChoice | null = null;
  let timer: ReturnType<typeof setTimeout>;
  const stored = () => {
    try {
      return localStorage.getItem(CONSENT_KEY);
    } catch {
      storageFailed = true;
      return null;
    }
  };
  const show = () => {
    banner.hidden = false;
    reserveBannerSpace();
  };
  const hide = () => {
    banner.hidden = true;
    reserveBannerSpace();
    opener?.focus();
    opener = null;
  };
  function reserveBannerSpace() {
    // Allow the footer to scroll above the fixed banner, also on narrow screens.
    document.documentElement.style.setProperty(
      '--statistics-space',
      banner!.hidden
        ? '0px'
        : `${banner!.getBoundingClientRect().height + 32}px`,
    );
  }
  new ResizeObserver(reserveBannerSpace).observe(banner);
  win[`ga-disable-${MEASUREMENT_ID}`] = true;
  // gtag's queue uses array-like arguments objects, as in Google's snippet.
  win.dataLayer = win.dataLayer || [];
  win.gtag =
    win.gtag ||
    function (..._args: unknown[]) {
      win.dataLayer!.push(arguments);
    };
  const denied = {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  };
  win.gtag('consent', 'default', denied);
  function start() {
    if (active) return;
    active = true;
    win[`ga-disable-${MEASUREMENT_ID}`] = false;
    win.gtag!('consent', 'update', { ...denied, analytics_storage: 'granted' });
    // Reaccepting resumes collection without initializing a second tag/page view.
    if (started) return;
    started = true;
    win.gtag!('js', new Date());
    win.gtag!('config', MEASUREMENT_ID, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_domain: location.hostname,
      cookie_path: '/',
      cookie_expires: CONSENT_LIFETIME / 1000,
      cookie_update: false,
      page_location: pageLocation(location.href, banner!.dataset.base!),
      page_referrer: '',
    });
    win.gtag!('event', 'page_view', {
      send_to: MEASUREMENT_ID,
      page_location: pageLocation(location.href, banner!.dataset.base!),
      page_referrer: '',
      page_title: document.title,
    });
    if (canLoadGoogle) {
      const script = document.createElement('script');
      script.id = 'google-statistics-tag';
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
      document.head.append(script);
    }
  }
  function removeCookies() {
    for (const name of ['_ga', `_ga_${MEASUREMENT_ID.slice(2)}`]) {
      for (const domain of [
        '',
        `; Domain=${location.hostname}`,
        `; Domain=.${location.hostname}`,
      ]) {
        try {
          document.cookie = `${name}=; Max-Age=0; Path=/${domain}; SameSite=Lax`;
        } catch {
          /* Blocked cookies must not break the enquiry form. */
        }
      }
    }
  }
  function stop() {
    win[`ga-disable-${MEASUREMENT_ID}`] = true;
    if (active) win.gtag!('consent', 'update', denied);
    active = false;
    removeCookies();
    // Google's collection opt-out precedes the consent update. Removing a script
    // does not remove its listeners; reloading would lose the customer's form.
  }
  function scheduleExpiry(raw: string | null) {
    clearTimeout(timer);
    if (storageFailed || !readChoice(raw, Date.now())) return;
    const remaining = JSON.parse(raw!).at + CONSENT_LIFETIME - Date.now();
    timer = setTimeout(sync, Math.min(remaining, 2_147_483_647));
  }
  function sync() {
    const raw = stored();
    choice = storageFailed ? null : readChoice(raw, Date.now());
    if (choice === 'granted') {
      // Use a stored grant only when withdrawal can also be persisted.
      try {
        localStorage.setItem(CONSENT_KEY, raw!);
      } catch {
        storageFailed = true;
        choice = null;
      }
    }
    if (choice === 'granted') start();
    else stop();
    if (choice) hide();
    else show();
    // Use the same validated record for activation and expiry, not a second read.
    scheduleExpiry(raw);
  }
  function choose(next: StatisticsChoice) {
    if (next === 'denied') stop();
    try {
      localStorage.setItem(CONSENT_KEY, encodeChoice(next, Date.now()));
    } catch {
      storageFailed = true;
      choice = null;
      clearTimeout(timer);
      stop();
      try {
        localStorage.removeItem(CONSENT_KEY);
      } catch {
        /* Storage unavailable. */
      }
      status.textContent =
        'Dit valg kunne ikke gemmes. Statistik er slået fra på denne side. Din henvendelse kan stadig udfyldes.';
      show();
      return;
    }
    storageFailed = false;
    status.textContent = '';
    sync();
  }
  accept.addEventListener('click', () => choose('granted'));
  banner
    .querySelector('[data-consent-reject]')!
    .addEventListener('click', () => choose('denied'));
  document
    .querySelectorAll<HTMLElement>('[data-statistics-settings]')
    .forEach((button) =>
      button.addEventListener('click', () => {
        status.textContent = active
          ? 'Statistik er slået til. Du kan trække dit samtykke tilbage ved at vælge Afvis statistik.'
          : 'Statistik er slået fra.';
        opener = button;
        show();
        banner
          .querySelector<HTMLButtonElement>('[data-consent-reject]')
          ?.focus();
      }),
    );
  window.addEventListener('storage', (event) => {
    if (event.key === CONSENT_KEY || event.key === null) sync();
  });
  window.addEventListener('pageshow', () => sync());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) sync();
  });
  sync();
}
