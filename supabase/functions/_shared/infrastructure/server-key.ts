/** Selects one named server key from Supabase's runtime dictionary; never falls back to another key. */
export function readSupabaseServerKey(
  serialized: string | undefined,
  name = 'default',
): string {
  const keys: unknown = JSON.parse(serialized ?? '{}');
  if (
    !keys ||
    typeof keys !== 'object' ||
    Array.isArray(keys) ||
    !Object.hasOwn(keys, name)
  ) {
    throw new Error('The configured Supabase server key is missing.');
  }
  const key = (keys as Record<string, unknown>)[name];
  if (typeof key !== 'string' || !/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error('The configured Supabase server key is invalid.');
  }
  return key;
}
