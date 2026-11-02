const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const hoursAgo = (h: number, now = Date.now()) => new Date(now - h * HOUR).toISOString();
export const daysAgo = (d: number, now = Date.now()) => new Date(now - d * DAY).toISOString();
export const daysFromNow = (d: number, now = Date.now()) => new Date(now + d * DAY).toISOString();
export const hoursFromNow = (h: number, now = Date.now()) => new Date(now + h * HOUR).toISOString();

export const hoursBetween = (from: string, to = Date.now()) => (to - new Date(from).getTime()) / HOUR;

let counter = 0;
export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const money = (n: number, compact = false) =>
  compact && Math.abs(n) >= 1000
    ? `$${(n / 1000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, '')}k`
    : `$${Math.round(n).toLocaleString('en-US')}`;

export const pct = (n: number) => `${Math.round(n * 100)}%`;

export function relTime(iso: string | undefined | null, now = Date.now()): string {
  if (!iso) return 'never';
  const diff = now - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  let s: string;
  if (abs < 60_000) s = 'just now';
  else if (abs < HOUR) s = `${Math.round(abs / 60_000)}m`;
  else if (abs < 48 * HOUR) s = `${Math.round(abs / HOUR)}h`;
  else s = `${Math.round(abs / DAY)}d`;
  if (s === 'just now') return s;
  return future ? `in ${s}` : `${s} ago`;
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const isSameDay = (a: string | number, b: string | number = Date.now()) =>
  new Date(a).toDateString() === new Date(b).toDateString();

export const firstName = (name: string) => name.split(' ')[0];

/** Next business-day slots used to propose meeting times in drafts. */
export function nextSlots(count = 2, now = Date.now()): string[] {
  const out: string[] = [];
  const d = new Date(now);
  const hours = [10, 14];
  let i = 0;
  while (out.length < count) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const h = hours[i++ % hours.length];
    const label = d.toLocaleDateString('en-US', { weekday: 'long' });
    out.push(`${label} at ${h > 12 ? h - 12 : h}${h >= 12 ? 'pm' : 'am'}`);
  }
  return out;
}

export function nextBusinessDayAt(hour: number, now = Date.now()): string {
  const d = new Date(now);
  do d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

/** Due "today": 23:59 local, so a task due today never reads as overdue before midnight. */
export function endOfToday(now = Date.now()): string {
  const d = new Date(now);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}
