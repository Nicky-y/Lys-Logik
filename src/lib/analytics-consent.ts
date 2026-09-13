export const MEASUREMENT_ID = 'G-PK63ZEEQM9';
// Ask again after expanding the disclosure to identify Google and cookie duration.
export const CONSENT_KEY = 'lys-logik-statistics-v2';
export const CONSENT_LIFETIME = 180 * 24 * 60 * 60 * 1000;
export type StatisticsChoice = 'granted' | 'denied';
export function readChoice(
  raw: string | null,
  now: number,
): StatisticsChoice | null {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (
      value?.version !== 1 ||
      !['granted', 'denied'].includes(value.choice) ||
      !Number.isFinite(value.at) ||
      value.at > now ||
      now - value.at >= CONSENT_LIFETIME
    )
      return null;
    return value.choice;
  } catch {
    return null;
  }
}
export function encodeChoice(choice: StatisticsChoice, now: number): string {
  return JSON.stringify({ version: 1, choice, at: now });
}
// Only known public routes are sent. Query strings, fragments and arbitrary paths
// can contain customer details and must never enter analytics.
export function pageLocation(url: string, base: string): string {
  const parsed = new URL(url);
  const root = base.replace(/\/?$/, '/');
  const path = parsed.pathname.slice(root.length);
  const routes = [
    '',
    'services/lampeopsaetning/',
    'services/stikkontakter/',
    'services/smart-home/',
    'services/lysstyring/',
    'services/hvidevarer/',
  ];
  return (
    parsed.origin +
    root +
    (parsed.pathname.startsWith(root) && routes.includes(path) ? path : '')
  );
}
