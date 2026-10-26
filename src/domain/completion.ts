// Completion rules, kept pure so they can be tested and shown transparently.
//
// - A session with required tasks is complete when every required task is checked.
// - A session without required tasks is complete only via explicit status.
// - A block without a session uses its own manual status.
// - A day is fully complete when every required block on it is complete.
// - A day with no required blocks is never a "completed study day".
// - Skipped work is never counted as completed.
import type { Block, ISODate, Session, SessionStatus, Snapshot, Task } from './types'

export type WorkState = 'complete' | 'skipped' | 'in_progress' | 'planned'

export interface SessionProgress {
  state: WorkState
  requiredTotal: number
  requiredDone: number
  total: number
  done: number
}

export function sessionProgress(session: Session, tasks: Task[]): SessionProgress {
  const own = tasks.filter((t) => t.session_id === session.id)
  const required = own.filter((t) => t.required)
  const requiredDone = required.filter((t) => t.done).length
  const done = own.filter((t) => t.done).length
  const counts = { requiredTotal: required.length, requiredDone, total: own.length, done }

  if (session.status === 'skipped') return { state: 'skipped', ...counts }
  if (required.length > 0) {
    if (requiredDone === required.length) return { state: 'complete', ...counts }
    return { state: done > 0 || session.status === 'in_progress' ? 'in_progress' : 'planned', ...counts }
  }
  if (session.status === 'completed') return { state: 'complete', ...counts }
  return { state: done > 0 || session.status === 'in_progress' ? 'in_progress' : 'planned', ...counts }
}

/**
 * The status a session should have after its tasks change. Checking the last
 * required task completes it; unchecking one reopens it. Sessions without
 * required tasks never auto-complete.
 */
export function nextSessionStatus(session: Session, tasksAfter: Task[]): SessionStatus {
  const own = tasksAfter.filter((t) => t.session_id === session.id)
  const required = own.filter((t) => t.required)
  const anyDone = own.some((t) => t.done)

  if (required.length > 0) {
    if (required.every((t) => t.done)) return 'completed'
    if (session.status === 'completed') return 'in_progress'
  }
  if (session.status === 'skipped') return anyDone ? 'in_progress' : 'skipped'
  if (session.status === 'planned' && anyDone) return 'in_progress'
  return session.status
}

export function blockState(block: Block, sessions: Session[], tasks: Task[]): WorkState {
  if (block.session_id) {
    const session = sessions.find((s) => s.id === block.session_id)
    if (session) return sessionProgress(session, tasks).state
  }
  if (block.status === 'completed') return 'complete'
  if (block.status === 'skipped') return 'skipped'
  return 'planned'
}

export type DayKind = 'complete' | 'partial' | 'planned' | 'no_required' | 'empty' | 'rest'

export interface DaySummary {
  date: ISODate
  kind: DayKind
  blocks: number
  requiredTotal: number
  requiredDone: number
  skipped: number
  plannedMin: number
}

export function blocksOn(snapshot: Snapshot, date: ISODate): Block[] {
  return snapshot.blocks.filter((b) => b.date === date).sort((a, b) => a.position - b.position)
}

export function daySummary(snapshot: Snapshot, date: ISODate, isStudyDay: boolean): DaySummary {
  const blocks = blocksOn(snapshot, date)
  const states = blocks.map((b) => blockState(b, snapshot.sessions, snapshot.tasks))
  const required = blocks.map((b, i) => ({ b, s: states[i] })).filter((x) => x.b.required)
  const requiredDone = required.filter((x) => x.s === 'complete').length
  const plannedMin = blocks.reduce((sum, b, i) => (states[i] === 'skipped' ? sum : sum + b.duration_min), 0)
  const summary = {
    date,
    blocks: blocks.length,
    requiredTotal: required.length,
    requiredDone,
    skipped: states.filter((s) => s === 'skipped').length,
    plannedMin,
  }

  if (blocks.length === 0) return { ...summary, kind: isStudyDay ? 'empty' : 'rest' }
  if (required.length === 0) return { ...summary, kind: 'no_required' }
  if (requiredDone === required.length) return { ...summary, kind: 'complete' }
  const anyProgress = states.some((s) => s === 'complete' || s === 'in_progress')
  return { ...summary, kind: anyProgress ? 'partial' : 'planned' }
}

/** Dates that were fully complete in `before` but are not in `after`. */
export function reopenedDays(before: Snapshot, after: Snapshot): ISODate[] {
  const dates = new Set([...before.blocks.map((b) => b.date), ...after.blocks.map((b) => b.date)])
  return [...dates]
    .filter((d) => daySummary(before, d, true).kind === 'complete' && daySummary(after, d, true).kind !== 'complete')
    .sort()
}

export const DAY_KIND_LABEL: Record<DayKind, string> = {
  complete: 'Complete',
  partial: 'Partly done',
  planned: 'Planned',
  no_required: 'Optional only',
  empty: 'Nothing planned',
  rest: 'Rest day',
}
