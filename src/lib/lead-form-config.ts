/** Production must never silently fall back to a form that discards enquiries. */
export function resolveLeadFormConfig(input: {
  development: boolean;
  endpoint?: string;
  siteKey?: string;
}) {
  const endpoint = input.endpoint?.trim() ?? '';
  const siteKey = input.siteKey?.trim() ?? '';
  if (!endpoint && !siteKey && input.development)
    return { endpoint, siteKey, live: false };
  if (!endpoint || !siteKey)
    throw new Error(
      'A live form requires both endpoint and Turnstile site key. Use npm run build for the production configuration.',
    );
  const url = new URL(endpoint);
  const local =
    input.development && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  )
    throw new Error(
      'The form endpoint must use HTTPS without credentials, query or fragment.',
    );
  if (
    !input.development &&
    (!/^0x[\w-]{20,}$/.test(siteKey) || siteKey.includes('DUMMY'))
  )
    throw new Error('Production requires a real Turnstile site key.');
  return { endpoint, siteKey, live: true };
}
