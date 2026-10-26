// Guarded commits: explain before a change reopens a completed day or pushes a
// day past its capacity, then commit (with undo) only if the user agrees.
import { useCallback } from 'react'
import { applyChanges, type Change } from '../domain/changes'
import { reopenedDays } from '../domain/completion'
import { plannedMinutesOn } from '../domain/scheduling'
import type { Block, ISODate, Snapshot } from '../domain/types'
import { formatMinutes, formatShortDate } from '../lib/dates'
import { confirm } from './confirm'
import { settingsOf } from './selectors'
import { useStore, type CommitOptions } from './store'

export interface ActOptions extends CommitOptions {
  /** Skip the reopened-day explanation (used for explicit un-completion). */
  allowReopen?: boolean
  /** Skip the capacity warning (e.g. when a preview already showed it). */
  skipCapacity?: boolean
}

function touchedDates(before: Snapshot, changes: Change[]): ISODate[] {
  const dates = new Set<ISODate>()
  for (const c of changes) {
    if (c.table !== 'blocks') continue
    if (c.op === 'insert') c.rows.forEach((r) => dates.add((r as Block).date))
    if (c.op === 'update') {
      if (typeof c.patch.date === 'string') dates.add(c.patch.date)
      const b = before.blocks.find((x) => x.id === c.id)
      if (b && 'duration_min' in c.patch) dates.add(b.date)
    }
  }
  return [...dates]
}

export async function act(changes: Change[], opts: ActOptions = {}): Promise<boolean> {
  if (changes.length === 0) return true
  const { data, commit } = useStore.getState()
  const after = applyChanges(data, changes)

  if (!opts.allowReopen) {
    const reopened = reopenedDays(data, after)
    if (reopened.length) {
      const ok = await confirm({
        title: reopened.length === 1 ? 'This reopens a completed day' : 'This reopens completed days',
        body: `${reopened.map(formatShortDate).join(', ')} ${reopened.length === 1 ? 'is' : 'are'} fully complete. ` +
          'This change adds required work that isn’t done yet, so the day will show as not complete until it is. ' +
          'Completed tasks and notes stay as they are.',
        confirmLabel: 'Continue',
      })
      if (!ok) return false
    }
  }

  if (!opts.skipCapacity) {
    const capacity = settingsOf(data).daily_capacity_min
    const over = touchedDates(data, changes).filter(
      (d) => plannedMinutesOn(after, d) > capacity && plannedMinutesOn(after, d) > plannedMinutesOn(data, d),
    )
    if (over.length) {
      const ok = await confirm({
        title: 'Over your daily capacity',
        body: over
          .map((d) => `${formatShortDate(d)}: ${formatMinutes(plannedMinutesOn(after, d))} planned of ${formatMinutes(capacity)}`)
          .join(' · ') + '. You can still go ahead.',
        confirmLabel: 'Schedule anyway',
      })
      if (!ok) return false
    }
  }

  commit(changes, opts)
  return true
}

export function useAct() {
  return useCallback(act, [])
}

export function useCtx() {
  return useStore((s) => s.ctx)
}
