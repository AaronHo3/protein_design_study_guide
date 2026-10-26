// Calendar-date utilities. Study dates are 'YYYY-MM-DD' strings and all
// arithmetic happens in UTC on those strings, so a device's local timezone can
// never shift a stored date. "Today" is resolved in the user's configured zone.
import type { ISODate, Weekday } from '../domain/types'

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string') return false
  const m = DATE_RE.exec(value)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

function toUTC(date: ISODate): Date {
  const m = DATE_RE.exec(date)
  if (!m) throw new Error(`Invalid date: ${date}`)
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
}

function fromUTC(d: Date): ISODate {
  return d.toISOString().slice(0, 10)
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = toUTC(date)
  d.setUTCDate(d.getUTCDate() + days)
  return fromUTC(d)
}

export function addMonths(date: ISODate, months: number): ISODate {
  const d = toUTC(date)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return fromUTC(d)
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(a).getTime() - toUTC(b).getTime()) / 86_400_000)
}

/** ISO weekday: Monday = 1 … Sunday = 7. */
export function weekday(date: ISODate): Weekday {
  const js = toUTC(date).getUTCDay()
  return (js === 0 ? 7 : js) as Weekday
}

export function startOfWeek(date: ISODate): ISODate {
  return addDays(date, 1 - weekday(date))
}

export function startOfMonth(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`
}

export function daysInRange(start: ISODate, endInclusive: ISODate): ISODate[] {
  const out: ISODate[] = []
  for (let d = start; d <= endInclusive; d = addDays(d, 1)) out.push(d)
  return out
}

/** The 6×7 grid of dates shown for a month view, starting on Monday. */
export function monthGrid(date: ISODate): ISODate[] {
  const first = startOfWeek(startOfMonth(date))
  return daysInRange(first, addDays(first, 41))
}

/** Today's calendar date in the given IANA timezone. */
export function todayIn(timezone: string, now: Date = new Date()): ISODate {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    return `${get('year')}-${get('month')}-${get('day')}`
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Formats a calendar date without ever converting through the local zone. */
export function formatDate(date: ISODate, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...opts }).format(toUTC(date))
}

export function formatLongDate(date: ISODate): string {
  return formatDate(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export function formatShortDate(date: ISODate): string {
  return formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatMinutes(min: number | null | undefined): string {
  if (min == null) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun',
}

/** First date on/after `from` whose weekday is in `days`. */
export function nextStudyDay(from: ISODate, days: Weekday[]): ISODate | null {
  if (days.length === 0) return null
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i)
    if (days.includes(weekday(d))) return d
  }
  return null
}

/** The first `count` study days on/after `from`. */
export function studyDaysFrom(from: ISODate, days: Weekday[], count: number): ISODate[] {
  const out: ISODate[] = []
  if (days.length === 0) return out
  for (let d = from; out.length < count; d = addDays(d, 1)) {
    if (days.includes(weekday(d))) out.push(d)
  }
  return out
}
