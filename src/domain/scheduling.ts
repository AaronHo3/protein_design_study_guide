// Calendar placement. A Block is only a placement: moving it never touches the
// linked session, its tasks, notes or resources.
import { addDays, weekday } from '../lib/dates'
import { blockState, blocksOn } from './completion'
import { compact, insert, remove, update, type Change } from './changes'
import { newBlock, type Ctx } from './factories'
import type { Block, ISODate, Session, Snapshot, Weekday } from './types'

function reindex(blocks: Block[]): Change[] {
  return compact(blocks.map((b, i) => update('blocks', b, { position: i })))
}

/** Moves a block to a date (and optionally a position), recording its previous date. */
export function moveBlock(snapshot: Snapshot, blockId: string, toDate: ISODate, toIndex?: number, ctx?: Ctx): Change[] {
  const block = snapshot.blocks.find((b) => b.id === blockId)
  if (!block) return []
  const source = blocksOn(snapshot, block.date).filter((b) => b.id !== blockId)
  const target = toDate === block.date ? source : blocksOn(snapshot, toDate).filter((b) => b.id !== blockId)
  const index = Math.max(0, Math.min(toIndex ?? target.length, target.length))
  const moved = { ...block, date: toDate }
  const ordered = [...target.slice(0, index), moved, ...target.slice(index)]

  const history = toDate !== block.date
    ? [...block.history, { from: block.date, to: toDate, at: ctx?.now() ?? new Date().toISOString() }]
    : block.history

  const changes: Change[] = compact([update('blocks', block, { date: toDate, position: index, history })])
  for (const [i, b] of ordered.entries()) {
    if (b.id !== blockId) {
      const c = update('blocks', b, { position: i })
      if (c) changes.push(c)
    }
  }
  if (toDate !== block.date) changes.push(...reindex(source))
  return changes
}

export function moveBlockBy(snapshot: Snapshot, blockId: string, delta: -1 | 1): Change[] {
  const block = snapshot.blocks.find((b) => b.id === blockId)
  if (!block) return []
  const day = blocksOn(snapshot, block.date)
  const index = day.findIndex((b) => b.id === blockId)
  const next = index + delta
  if (next < 0 || next >= day.length) return []
  return moveBlock(snapshot, blockId, block.date, next)
}

export interface ScheduleOptions {
  duration_min?: number
  start_time?: string | null
  required?: boolean
  index?: number
}

/** Places a session on a date. If it already has a block, that block moves. */
export function scheduleSession(
  snapshot: Snapshot, sessionId: string, date: ISODate, ctx: Ctx, opts: ScheduleOptions = {},
): Change[] {
  const session = snapshot.sessions.find((s) => s.id === sessionId)
  if (!session) return []
  const existing = snapshot.blocks.find((b) => b.session_id === sessionId)
  if (existing) return moveBlock(snapshot, existing.id, date, opts.index, ctx)

  const day = blocksOn(snapshot, date)
  const index = Math.max(0, Math.min(opts.index ?? day.length, day.length))
  const block = newBlock(ctx, {
    date,
    position: index,
    session_id: sessionId,
    track_id: session.track_id,
    duration_min: opts.duration_min ?? session.planned_min ?? 60,
    start_time: opts.start_time ?? null,
    required: opts.required ?? true,
  })
  return [
    insert('blocks', [block]),
    ...compact(day.slice(index).map((b, i) => update('blocks', b, { position: index + 1 + i }))),
  ]
}

/** Creates a block on the calendar, optionally empty (content decided later). */
export function createBlock(snapshot: Snapshot, date: ISODate, ctx: Ctx, p: Partial<Block> = {}): Change[] {
  const block = newBlock(ctx, { duration_min: 60, ...p, date, position: blocksOn(snapshot, date).length })
  return [insert('blocks', [block])]
}

export function setBlockStatus(snapshot: Snapshot, blockId: string, status: Block['status']): Change[] {
  const block = snapshot.blocks.find((b) => b.id === blockId)
  return block ? compact([update('blocks', block, { status })]) : []
}

export function deleteBlock(snapshot: Snapshot, blockId: string): Change[] {
  const block = snapshot.blocks.find((b) => b.id === blockId)
  if (!block) return []
  return [remove('blocks', [block]), ...reindex(blocksOn(snapshot, block.date).filter((b) => b.id !== blockId))]
}

/**
 * Returns a session to the backlog. A one-off block is removed; a recurring
 * occurrence keeps its slot and simply loses the session link.
 */
export function unscheduleSession(snapshot: Snapshot, sessionId: string): Change[] {
  const block = snapshot.blocks.find((b) => b.session_id === sessionId)
  if (!block) return []
  if (block.recurrence_id) return compact([update('blocks', block, { session_id: null })])
  const rest = blocksOn(snapshot, block.date).filter((b) => b.id !== block.id)
  return [remove('blocks', [block]), ...reindex(rest)]
}

/** Sessions that are actionable but not placed on the calendar. */
export function backlog(snapshot: Snapshot): Session[] {
  const placed = new Set(snapshot.blocks.map((b) => b.session_id).filter(Boolean))
  return snapshot.sessions.filter(
    (s) => !s.archived_at && !placed.has(s.id) && s.status !== 'completed' && s.status !== 'skipped',
  )
}

export function plannedMinutesOn(snapshot: Snapshot, date: ISODate, excludeBlockId?: string): number {
  return blocksOn(snapshot, date)
    .filter((b) => b.id !== excludeBlockId)
    .filter((b) => blockState(b, snapshot.sessions, snapshot.tasks) !== 'skipped')
    .reduce((sum, b) => sum + b.duration_min, 0)
}

export interface CapacityConflict {
  date: ISODate
  plannedMin: number
  capacityMin: number
}

/** Days whose planned time would exceed capacity after `changes` are applied. */
export function capacityConflicts(after: Snapshot, dates: ISODate[], capacityMin: number): CapacityConflict[] {
  return [...new Set(dates)]
    .map((date) => ({ date, plannedMin: plannedMinutesOn(after, date), capacityMin }))
    .filter((c) => c.plannedMin > capacityMin)
}

export interface ShiftItem {
  blockId: string
  label: string
  from: ISODate
  to: ISODate
}

/**
 * Previews shifting every unfinished block on/after `fromDate` by `offset`
 * study days (or calendar days). Completed and skipped blocks never move.
 */
export function previewShift(
  snapshot: Snapshot,
  fromDate: ISODate,
  offset: number,
  studyDays: Weekday[] | null,
  label: (b: Block) => string,
): ShiftItem[] {
  if (offset === 0) return []
  const step = (date: ISODate): ISODate => {
    if (!studyDays || studyDays.length === 0) return addDays(date, offset)
    let d = date
    let remaining = Math.abs(offset)
    const dir = offset > 0 ? 1 : -1
    while (remaining > 0) {
      d = addDays(d, dir)
      if (studyDays.includes(weekday(d))) remaining--
    }
    return d
  }
  return snapshot.blocks
    .filter((b) => b.date >= fromDate)
    .filter((b) => {
      const s = blockState(b, snapshot.sessions, snapshot.tasks)
      return s !== 'complete' && s !== 'skipped'
    })
    .sort((a, b) => (a.date === b.date ? a.position - b.position : a.date < b.date ? -1 : 1))
    .map((b) => ({ blockId: b.id, label: label(b), from: b.date, to: step(b.date) }))
}

export function applyShift(snapshot: Snapshot, items: ShiftItem[], ctx: Ctx): Change[] {
  const at = ctx.now()
  const changes: Change[] = []
  const nextPos = new Map<ISODate, number>()
  for (const item of items) {
    const block = snapshot.blocks.find((b) => b.id === item.blockId)
    if (!block) continue
    const staying = snapshot.blocks.filter((b) => b.date === item.to && !items.some((i) => i.blockId === b.id)).length
    const pos = nextPos.get(item.to) ?? staying
    nextPos.set(item.to, pos + 1)
    const c = update('blocks', block, {
      date: item.to,
      position: pos,
      history: [...block.history, { from: item.from, to: item.to, at }],
    })
    if (c) changes.push(c)
  }
  return changes
}
