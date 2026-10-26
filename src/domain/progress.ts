// Progress separates activity (what was done) from understanding (what the user
// explicitly marked as achieved). No mastery scores are inferred from activity.
import { addDays, daysInRange, startOfWeek, weekday } from '../lib/dates'
import { blockState, daySummary, sessionProgress, type DayKind } from './completion'
import type { ISODate, Snapshot, Weekday } from './types'

export interface Activity {
  tasksDone: number
  sessionsDone: number
  completedDays: number
  plannedMin: number
  actualMin: number
  sessionsWithActual: number
}

export interface WeekRow {
  start: ISODate
  requiredBlocks: number
  requiredDone: number
  completedDays: number
  studyDaysWithWork: number
  plannedMin: number
}

export interface TrackRow {
  trackId: string | null
  sessionsDone: number
  sessionsScheduled: number
  plannedMin: number
  actualMin: number
}

export interface HeatCell {
  date: ISODate
  kind: DayKind
  future: boolean
}

const isStudy = (days: Weekday[], d: ISODate) => days.includes(weekday(d))

/** Activity up to and including `today` (future plans are not counted). */
export function activity(s: Snapshot, today: ISODate, studyDays: Weekday[]): Activity {
  const past = s.blocks.filter((b) => b.date <= today)
  const dates = [...new Set(past.map((b) => b.date))]
  const sessionsDone = s.sessions.filter((x) => sessionProgress(x, s.tasks).state === 'complete')
  return {
    tasksDone: s.tasks.filter((t) => t.done).length,
    sessionsDone: sessionsDone.length,
    completedDays: dates.filter((d) => daySummary(s, d, isStudy(studyDays, d)).kind === 'complete').length,
    plannedMin: past.filter((b) => blockState(b, s.sessions, s.tasks) !== 'skipped').reduce((n, b) => n + b.duration_min, 0),
    actualMin: s.sessions.reduce((n, x) => n + (x.actual_min ?? 0), 0),
    sessionsWithActual: s.sessions.filter((x) => x.actual_min != null).length,
  }
}

export function weeklyRows(s: Snapshot, today: ISODate, studyDays: Weekday[], weeks = 8): WeekRow[] {
  const thisWeek = startOfWeek(today)
  return Array.from({ length: weeks }, (_, i) => addDays(thisWeek, -7 * i)).map((start) => {
    const days = daysInRange(start, addDays(start, 6))
    const summaries = days.map((d) => daySummary(s, d, isStudy(studyDays, d)))
    return {
      start,
      requiredBlocks: summaries.reduce((n, x) => n + x.requiredTotal, 0),
      requiredDone: summaries.reduce((n, x) => n + x.requiredDone, 0),
      completedDays: summaries.filter((x) => x.kind === 'complete').length,
      studyDaysWithWork: summaries.filter((x) => x.requiredTotal > 0).length,
      plannedMin: summaries.reduce((n, x) => n + x.plannedMin, 0),
    }
  })
}

export function trackRows(s: Snapshot, today: ISODate): TrackRow[] {
  const rows = new Map<string | null, TrackRow>()
  const row = (id: string | null) => {
    if (!rows.has(id)) rows.set(id, { trackId: id, sessionsDone: 0, sessionsScheduled: 0, plannedMin: 0, actualMin: 0 })
    return rows.get(id)!
  }
  for (const session of s.sessions) {
    if (session.archived_at) continue
    const block = s.blocks.find((b) => b.session_id === session.id)
    const r = row(session.track_id)
    if (sessionProgress(session, s.tasks).state === 'complete') r.sessionsDone++
    if (block && block.date <= today) {
      r.sessionsScheduled++
      if (blockState(block, s.sessions, s.tasks) !== 'skipped') r.plannedMin += block.duration_min
    }
    r.actualMin += session.actual_min ?? 0
  }
  return [...rows.values()]
}

/** Weeks × 7 grid ending with the current week, Monday first. */
export function heatmap(s: Snapshot, today: ISODate, studyDays: Weekday[], weeks = 16): HeatCell[][] {
  const first = addDays(startOfWeek(today), -7 * (weeks - 1))
  return Array.from({ length: weeks }, (_, w) =>
    daysInRange(addDays(first, w * 7), addDays(first, w * 7 + 6)).map((date) => ({
      date,
      kind: daySummary(s, date, isStudy(studyDays, date)).kind,
      future: date > today,
    })),
  )
}
