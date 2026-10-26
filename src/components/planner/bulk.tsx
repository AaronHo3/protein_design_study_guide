import { useMemo, useState } from 'react'
import { applyChanges } from '../../domain/changes'
import { generateOccurrences, MAX_GENERATION_DAYS, planOccurrences } from '../../domain/recurrence'
import { applyShift, capacityConflicts, previewShift } from '../../domain/scheduling'
import type { ISODate } from '../../domain/types'
import { diffDays, formatMinutes, formatShortDate, isISODate } from '../../lib/dates'
import { act } from '../../state/actions'
import { blockTitle, settingsOf, useMaps } from '../../state/selectors'
import { useStore } from '../../state/store'
import { Button } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { Checkbox, Field, Input } from '../ui/field'

function ConflictList({ conflicts }: { conflicts: { date: ISODate; plannedMin: number; capacityMin: number }[] }) {
  if (conflicts.length === 0) return null
  return (
    <div role="alert" className="rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
      <p className="font-medium">Over daily capacity after this change:</p>
      <ul className="mt-1 list-disc pl-5">
        {conflicts.map((c) => (
          <li key={c.date}>{formatShortDate(c.date)} — {formatMinutes(c.plannedMin)} of {formatMinutes(c.capacityMin)}</li>
        ))}
      </ul>
      <p className="mt-1">You can still go ahead.</p>
    </div>
  )
}

/** Explicit, previewed generation of recurring blocks for a limited range. */
export function GenerateDialog({ start, end, onClose }: { start: ISODate; end: ISODate; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const ctx = useStore((s) => s.ctx)
  const maps = useMaps()
  const [from, setFrom] = useState(start)
  const [to, setTo] = useState(end)
  const valid = isISODate(from) && isISODate(to) && from <= to && diffDays(to, from) < MAX_GENERATION_DAYS
  const preview = useMemo(() => (valid ? planOccurrences(data, from, to, ctx) : []), [data, from, to, valid, ctx])
  const after = useMemo(() => applyChanges(data, preview.length ? [{ op: 'insert', table: 'blocks', rows: preview }] : []), [data, preview])
  const conflicts = capacityConflicts(after, preview.map((b) => b.date), settingsOf(data).daily_capacity_min)
  const byDate = preview.reduce<Record<string, string[]>>((acc, b) => {
    acc[b.date] = [...(acc[b.date] ?? []), b.title || maps.tracks.get(b.track_id ?? '')?.name || 'Block']
    return acc
  }, {})

  const run = async () => {
    const changes = generateOccurrences(useStore.getState().data, from, to, ctx)
    if (await act(changes, { label: `Added ${preview.length} recurring block${preview.length === 1 ? '' : 's'}`, skipCapacity: true })) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add recurring blocks"
      description="Creates occurrences of your recurring block templates for this range only. Existing occurrences (even moved ones) are never duplicated."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid || preview.length === 0} onClick={() => void run()}>Add {preview.length} block{preview.length === 1 ? '' : 's'}</Button></>}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="To">{(id) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        </div>
        {!valid && <p className="text-[12.5px] text-danger">Choose a range of up to {MAX_GENERATION_DAYS} days.</p>}
        {data.recurring_blocks.filter((r) => !r.archived_at).length === 0 ? (
          <p className="text-[13px] text-muted">You have no recurring block templates. Add them in Settings → Recurring blocks.</p>
        ) : preview.length === 0 ? (
          <p className="text-[13px] text-muted">Nothing to add — every occurrence in this range already exists.</p>
        ) : (
          <ul className="max-h-60 space-y-1 overflow-y-auto text-[13px]">
            {Object.entries(byDate).map(([d, titles]) => (
              <li key={d}><span className="font-medium">{formatShortDate(d)}:</span> <span className="text-muted">{titles.join(', ')}</span></li>
            ))}
          </ul>
        )}
        <ConflictList conflicts={conflicts} />
      </div>
    </Dialog>
  )
}

/** Previewed bulk shift of unfinished work. Completed and skipped blocks never move. */
export function ShiftDialog({ initialFrom, onClose }: { initialFrom: ISODate; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const ctx = useStore((s) => s.ctx)
  const maps = useMaps()
  const settings = settingsOf(data)
  const [from, setFrom] = useState(initialFrom)
  const [offset, setOffset] = useState('1')
  const [studyDaysOnly, setStudyDaysOnly] = useState(true)
  const n = Math.max(-60, Math.min(60, Math.round(Number(offset)) || 0))
  const items = useMemo(
    () => (isISODate(from) ? previewShift(data, from, n, studyDaysOnly ? settings.study_days : null, (b) => blockTitle(b, maps)) : []),
    [data, from, n, studyDaysOnly, settings.study_days, maps],
  )
  const after = useMemo(() => applyChanges(data, applyShift(data, items, ctx)), [data, items, ctx])
  const conflicts = capacityConflicts(after, items.map((i) => i.to), settings.daily_capacity_min)

  const run = async () => {
    const changes = applyShift(useStore.getState().data, items, ctx)
    if (await act(changes, { label: `Shifted ${items.length} block${items.length === 1 ? '' : 's'}`, skipCapacity: true })) onClose()
  }

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title="Shift unfinished work"
      description="Moves every unfinished block on or after a date. Completed and skipped work stays where it happened."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={items.length === 0} onClick={() => void run()}>Shift {items.length} block{items.length === 1 ? '' : 's'}</Button></>}
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Starting from">{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="Shift by (days)" hint="Negative moves earlier.">
            {(id) => <Input id={id} type="number" min={-60} max={60} value={offset} onChange={(e) => setOffset(e.target.value)} />}
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox label="Count study days only" checked={studyDaysOnly} onChange={(e) => setStudyDaysOnly(e.target.checked)} />
          </div>
        </div>
        {items.length === 0 ? (
          <p className="text-[13px] text-muted">No unfinished blocks would move.</p>
        ) : (
          <div className="max-h-64 overflow-y-auto rounded-md border border-line">
            <table className="w-full text-[13px]">
              <caption className="sr-only">Blocks that will move</caption>
              <thead className="bg-surface-2 text-left text-[12px] text-muted">
                <tr><th className="px-2 py-1 font-medium">Block</th><th className="px-2 py-1 font-medium">From</th><th className="px-2 py-1 font-medium">To</th></tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.blockId} className="border-t border-line">
                    <td className="px-2 py-1">{i.label}</td>
                    <td className="px-2 py-1 whitespace-nowrap text-muted">{formatShortDate(i.from)}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{formatShortDate(i.to)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ConflictList conflicts={conflicts} />
        {n !== 0 && <p className="text-[12px] text-faint">Each move is recorded in the block’s history. You can undo right after.</p>}
      </div>
    </Dialog>
  )
}
