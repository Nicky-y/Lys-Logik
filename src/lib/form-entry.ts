const sources = ['qr', 'visitkort'] as const;

/** Stable printed addresses. Destinations stay local and can change after printing. */
export function formEntryLinks(base: string) {
  const root = base.replace(/\/?$/, '/');
  return sources.map((source) => ({
    source,
    path: `${root}${source}/formular`,
    destination: `${root}?via=${source}#formular`,
  }));
}

/** Only explicit, known landing sources may cross the analytics boundary. */
export function formEntryCampaign(url: string, base: string) {
  const parsed = new URL(url);
  const root = base.replace(/\/?$/, '/');
  const values = parsed.searchParams.getAll('via');
  if (parsed.pathname !== root || values.length !== 1) return {};
  const source = sources.find((candidate) => candidate === values[0]);
  if (!source) return {};
  return {
    campaign_source: source,
    campaign_medium: 'qr',
    campaign_name: 'kontaktformular',
  };
}
