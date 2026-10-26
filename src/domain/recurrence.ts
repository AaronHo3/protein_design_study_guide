// Recurring blocks are rules; occurrences are materialized Block rows keyed by
// (recurrence_id, occurrence_date). Generation is idempotent and only ever runs
// for a range the user asks for — it never fills months automatically.
// Because history is materialized, editing a rule can't rewrite past blocks.
import { daysInRange, weekday } from '../lib/dates'
import { blockState, blocksOn } from './completion'
import { compact, insert, remove, update, type Change } from './changes'
import { newBlock, type Ctx } from './factories'
import type { Block, ISODate, RecurringBlock, Snapshot } from './types'

export const MAX_GENERATION_DAYS = 42

export function occurrenceDates(rule: RecurringBlock, start: ISODate, end: ISODate): ISODate[] {
  if (rule.archived_at) return []
  const from = start > rule.starts_on ? start : rule.starts_on
  const to = rule.ends_on && rule.ends_on < end ? rule.ends_on : end
  if (from > to) return []
  return daysInRange(from, to).filter((d) => rule.weekdays.includes(weekday(d)))
}

/** Blocks that generating [start, end] would create. Existing occurrences (even moved ones) are skipped. */
export function planOccurrences(snapshot: Snapshot, start: ISODate, end: ISODate, ctx: Ctx): Block[] {
  const existing = new Set(
    snapshot.blocks.filter((b) => b.recurrence_id).map((b) => `${b.recurrence_id}|${b.occurrence_date}`),
  )
  const counts = new Map<ISODate, number>()
  const positionFor = (date: ISODate) => {
    const n = counts.get(date) ?? blocksOn(snapshot, date).length
    counts.set(date, n + 1)
    return n
  }
  const rules = [...snapshot.recurring_blocks].sort((a, b) =>
    (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99') || a.created_at.localeCompare(b.created_at),
  )
  const out: Block[] = []
  for (const rule of rules) {
    for (const date of occurrenceDates(rule, start, end)) {
      if (existing.has(`${rule.id}|${date}`)) continue
      out.push(
        newBlock(ctx, {
          date, position: positionFor(date), start_time: rule.start_time, duration_min: rule.duration_min,
          required: rule.required, title: rule.title, track_id: rule.track_id, recurrence_id: rule.id,
          occurrence_date: date,
        }),
      )
    }
  }
  return out
}

export function generateOccurrences(snapshot: Snapshot, start: ISODate, end: ISODate, ctx: Ctx): Change[] {
  const blocks = planOccurrences(snapshot, start, end, ctx)
  return blocks.length ? [insert('blocks', blocks)] : []
}

export type RuleFields = Pick<RecurringBlock, 'title' | 'track_id' | 'start_time' | 'duration_min' | 'required' | 'weekdays'>

export type EditScope = 'occurrence' | 'future' | 'template'

export interface RecurrenceEditPreview {
  scope: EditScope
  updated: Block[]
  removed: Block[]
  kept: Block[] // future occurrences left alone (completed, detached, or holding a session on a removed weekday)
}

function isFinished(snapshot: Snapshot, b: Block): boolean {
  const s = blockState(b, snapshot.sessions, snapshot.tasks)
  return s === 'complete' || s === 'skipped'
}

/**
 * Previews an edit to a recurring rule.
 * - 'occurrence': only `occurrence` changes and is detached from future rule edits.
 * - 'future': the rule changes, and unfinished, non-detached occurrences on/after
 *   `fromDate` are updated. Occurrences on weekdays no longer in the rule are
 *   removed if empty; ones holding a session are kept.
 * - 'template': only the rule changes; existing blocks are untouched.
 * Completed and skipped occurrences are never modified.
 */
export function previewRecurrenceEdit(
  snapshot: Snapshot, ruleId: string, scope: EditScope, fromDate: ISODate, occurrenceId?: string,
  fields?: Partial<RuleFields>,
): RecurrenceEditPreview {
  const empty = { scope, updated: [], removed: [], kept: [] }
  if (scope === 'template') return empty
  if (scope === 'occurrence') {
    const b = snapshot.blocks.find((x) => x.id === occurrenceId)
    return b ? { ...empty, updated: [b] } : empty
  }
  const rule = snapshot.recurring_blocks.find((r) => r.id === ruleId)
  if (!rule) return empty
  const weekdays = fields?.weekdays ?? rule.weekdays
  const future = snapshot.blocks.filter((b) => b.recurrence_id === ruleId && (b.occurrence_date ?? b.date) >= fromDate)
  const result: RecurrenceEditPreview = { scope, updated: [], removed: [], kept: [] }
  for (const b of future) {
    if (isFinished(snapshot, b) || b.detached) {
      result.kept.push(b)
    } else if (!weekdays.includes(weekday(b.occurrence_date ?? b.date))) {
      if (b.session_id) result.kept.push(b)
      else result.removed.push(b)
    } else {
      result.updated.push(b)
    }
  }
  return result
}

export function applyRecurrenceEdit(
  snapshot: Snapshot, ruleId: string, preview: RecurrenceEditPreview, fields: Partial<RuleFields>,
): Change[] {
  const rule = snapshot.recurring_blocks.find((r) => r.id === ruleId)
  if (!rule) return []
  const blockFields = (({ title, track_id, start_time, duration_min, required }) =>
    Object.fromEntries(
      Object.entries({ title, track_id, start_time, duration_min, required }).filter(([, v]) => v !== undefined),
    ))(fields) as Partial<Block>

  if (preview.scope === 'occurrence') {
    return compact(preview.updated.map((b) => update('blocks', b, { ...blockFields, detached: true })))
  }
  const changes = compact([update('recurring_blocks', rule, fields)])
  if (preview.scope === 'future') {
    changes.push(...compact(preview.updated.map((b) => update('blocks', b, blockFields))))
    if (preview.removed.length) changes.push(remove('blocks', preview.removed))
  }
  return changes
}

/** Blocks that ending a rule after `lastDate` would remove: empty, unfinished, not individually edited. */
export function occurrencesRemovedByEnd(snapshot: Snapshot, ruleId: string, lastDate: ISODate): Block[] {
  return snapshot.blocks.filter(
    (b) =>
      b.recurrence_id === ruleId && (b.occurrence_date ?? b.date) > lastDate &&
      !b.session_id && !b.detached && !isFinished(snapshot, b),
  )
}

/** Ends a rule as of a date, removing only its empty, unfinished, unedited occurrences after it. */
export function endRecurrence(snapshot: Snapshot, ruleId: string, lastDate: ISODate): Change[] {
  const rule = snapshot.recurring_blocks.find((r) => r.id === ruleId)
  if (!rule) return []
  const doomed = occurrencesRemovedByEnd(snapshot, ruleId, lastDate)
  const endsOn = lastDate < rule.starts_on ? rule.starts_on : lastDate
  return compact([update('recurring_blocks', rule, { ends_on: endsOn }), doomed.length ? remove('blocks', doomed) : null])
}
