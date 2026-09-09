const zone = 'Europe/Copenhagen';
const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: zone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Local form value in the business timezone, independent of the device timezone. */
export function copenhagenLocal(instant: string): string {
  const parts = Object.fromEntries(
    partsFormatter
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Reject missing/ambiguous clock times instead of silently shifting an agreed appointment. */
export function copenhagenInstant(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw new Error('Vælg en gyldig dato og tid.');
  const anchor = Date.parse(`${local}:00Z`);
  if (
    !Number.isFinite(anchor) ||
    new Date(anchor).toISOString().slice(0, 16) !== local ||
    Number(local.slice(0, 4)) < 2019 ||
    Number(local.slice(0, 4)) > 2101
  )
    throw new Error('Vælg en gyldig dato.');
  const matches: string[] = [];
  // Enumerate offset candidates, then let Intl's timezone database decide which exist.
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 30) {
    const candidate = new Date(anchor - offset * 60000).toISOString();
    if (copenhagenLocal(candidate) === local) matches.push(candidate);
  }
  if (!matches.length)
    throw new Error(
      'Tidspunktet findes ikke ved skift til sommertid. Vælg et andet klokkeslæt.',
    );
  if (matches.length > 1)
    throw new Error(
      'Tidspunktet forekommer to gange ved skift til vintertid. Vælg et entydigt klokkeslæt, fx kl. 03.00.',
    );
  return matches[0];
}

export function shiftDay(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function monthDays(month: string): string[] {
  const first = `${month}-01`;
  const weekday = new Date(`${first}T12:00:00Z`).getUTCDay();
  const start = shiftDay(first, -(weekday + 6) % 7);
  return Array.from({ length: 42 }, (_, i) => shiftDay(start, i));
}
export function occursOn(
  appointment: { starts_at: string; ends_at: string },
  day: string,
): boolean {
  const first = copenhagenLocal(appointment.starts_at).slice(0, 10);
  const last = copenhagenLocal(
    new Date(Date.parse(appointment.ends_at) - 1).toISOString(),
  ).slice(0, 10);
  return first <= day && last >= day;
}
export const appointmentTime = (instant: string) =>
  new Intl.DateTimeFormat('da-DK', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(instant));
export const appointmentDate = (instant: string) =>
  new Intl.DateTimeFormat('da-DK', {
    timeZone: zone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(instant));
