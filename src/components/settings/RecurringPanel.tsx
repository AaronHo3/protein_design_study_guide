import { Plus, Repeat } from 'lucide-react'
import { useMemo, useState } from 'react'
import { compact, insert, remove, update, type Change } from '../../domain/changes'
import { newRecurringBlock } from '../../domain/factories'
import {
  applyRecurrenceEdit, endRecurrence, occurrencesRemovedByEnd, previewRecurrenceEdit, type RuleFields,
} from '../../domain/recurrence'
import type { RecurringBlock, Weekday } from '../../domain/types'
import { WEEKDAY_LABELS, formatMinutes, formatShortDate, isISODate } from '../../lib/dates'
import { cn } from '../../lib/cn'
import { act } from '../../state/actions'
import { confirm } from '../../state/confirm'
import { activeTracks, todayFor, useMaps, useSettings } from '../../state/selectors'
import { useStore } from '../../state/store'
import { TrackBadge } from '../track'
import { Button } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { Checkbox, Field, Input, Select } from '../ui/field'
import { Menu } from '../ui/menu'
import { Segmented } from '../ui/misc'

function WeekdayPicker({ value, onChange }: { value: Weekday[]; onChange: (v: Weekday[]) => void }) {
  return (
    <div role="group" aria-label="Weekdays" className="flex flex-wrap gap-1">
      {([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={value.includes(d)}
          onClick={() => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort())}
          className={cn('h-8 min-w-11 rounded-md border px-2 text-[12.5px] font-medium', value.includes(d) ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted')}
        >
          {WEEKDAY_LABELS[d]}
        </button>
      ))}
    </div>
  )
}

type Scope = 'future' | 'template'

function RuleDialog({ rule, onClose }: { rule?: RecurringBlock; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const ctx = useStore((s) => s.ctx)
  const settings = useSettings()
  const today = todayFor(settings)
  const [f, setF] = useState<RuleFields & { starts_on: string; ends_on: string }>({
    title: rule?.title ?? '', track_id: rule?.track_id ?? null, start_time: rule?.start_time ?? null,
    duration_min: rule?.duration_min ?? 60, required: rule?.required ?? true, weekdays: rule?.weekdays ?? settings.study_days,
    starts_on: rule?.starts_on ?? today, ends_on: rule?.ends_on ?? '',
  })
  const [scope, setScope] = useState<Scope>('future')
  const [fromDate, setFromDate] = useState(today)

  const fields: Partial<RuleFields> = { title: f.title, track_id: f.track_id, start_time: f.start_time, duration_min: f.duration_min, required: f.required, weekdays: f.weekdays }
  const preview = useMemo(
    () => (rule ? previewRecurrenceEdit(data, rule.id, scope, fromDate, undefined, fields) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, rule, scope, fromDate, JSON.stringify(fields)],
  )
  const valid = f.weekdays.length > 0 && f.duration_min >= 5 && isISODate(f.starts_on) && (!f.ends_on || (isISODate(f.ends_on) && f.ends_on >= f.starts_on))

  const save = async () => {
    if (!valid) return
    const dates = { starts_on: f.starts_on, ends_on: f.ends_on || null }
    let changes: Change[]
    if (!rule) {
      changes = [insert('recurring_blocks', [newRecurringBlock(ctx, { ...fields, weekdays: f.weekdays, ...dates })])]
    } else {
      changes = [...applyRecurrenceEdit(data, rule.id, preview!, fields), ...compact([update('recurring_blocks', rule, dates)])]
      // applyRecurrenceEdit already updated the rule's fields; merge both updates on the same row safely:
      changes = mergeRuleUpdates(changes, rule.id)
    }
    if (await act(changes, { label: rule ? 'Recurring block updated' : 'Recurring block added — add occurrences from the Planner' })) onClose()
  }

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={rule ? 'Edit recurring block' : 'New recurring block'}
      description="A template for time you reserve regularly. Occurrences are only created when you add them from the Planner."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} onClick={() => void save()}>Save</Button></>}
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title (optional)">{(id) => <Input id={id} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Morning biology" />}</Field>
          <Field label="Track (optional)">
            {(id) => (
              <Select id={id} value={f.track_id ?? ''} onChange={(e) => setF({ ...f, track_id: e.target.value || null })}>
                <option value="">No track</option>
                {activeTracks(data).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Repeats on">{() => <WeekdayPicker value={f.weekdays} onChange={(w) => setF({ ...f, weekdays: w })} />}</Field>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Duration (min)">{(id) => <Input id={id} type="number" min={5} max={1440} step={5} value={f.duration_min} onChange={(e) => setF({ ...f, duration_min: Math.max(5, Math.round(Number(e.target.value)) || 5) })} />}</Field>
          <Field label="Start time (optional)">{(id) => <Input id={id} type="time" value={f.start_time ?? ''} onChange={(e) => setF({ ...f, start_time: e.target.value || null })} />}</Field>
          <Field label="Starts on">{(id) => <Input id={id} type="date" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} />}</Field>
          <Field label="Ends on (optional)">{(id) => <Input id={id} type="date" value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} />}</Field>
        </div>
        <Checkbox label="Required for a completed day" checked={f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} />

        {rule && preview && (
          <div className="space-y-2 rounded-lg border border-line bg-surface-2 p-3">
            <Segmented
              label="Apply changes to"
              value={scope}
              onChange={setScope}
              options={[{ value: 'future', label: 'Template + future unfinished occurrences' }, { value: 'template', label: 'Template only' }]}
            />
            {scope === 'future' && (
              <label className="flex items-center gap-2 text-[13px]">From <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 w-40" /></label>
            )}
            <p className="text-[12.5px] text-muted">
              {scope === 'template'
                ? 'Only occurrences you add later use the new settings. Existing blocks stay as they are.'
                : `${preview.updated.length} occurrence(s) will update${preview.removed.length ? `, ${preview.removed.length} empty occurrence(s) on removed weekdays will be removed` : ''}. ${preview.kept.length} will be left alone (completed, skipped, individually edited, or holding a session).`}
            </p>
            <p className="text-[12px] text-faint">To change a single occurrence, edit that block in the Planner or Today view.</p>
          </div>
        )}
      </div>
    </Dialog>
  )
}

/** Collapses multiple updates to the same rule row into one, keeping the earliest "before". */
function mergeRuleUpdates(changes: Change[], ruleId: string): Change[] {
  const ruleUpdates = changes.filter((c) => c.op === 'update' && c.table === 'recurring_blocks' && c.id === ruleId)
  if (ruleUpdates.length < 2) return changes
  const merged = ruleUpdates.reduce((acc, c) => (c.op === 'update' && acc.op === 'update'
    ? { ...acc, patch: { ...acc.patch, ...c.patch }, before: { ...c.before, ...acc.before } }
    : acc))
  return [merged, ...changes.filter((c) => !ruleUpdates.includes(c))]
}

export function RecurringPanel() {
  const data = useStore((s) => s.data)
  const settings = useSettings()
  const maps = useMaps()
  const today = todayFor(settings)
  const [editing, setEditing] = useState<RecurringBlock | 'new' | null>(null)
  const rules = [...data.recurring_blocks].sort((a, b) => a.created_at.localeCompare(b.created_at))

  const end = async (rule: RecurringBlock) => {
    const removed = occurrencesRemovedByEnd(data, rule.id, today)
    const ok = await confirm({
      title: 'Stop this recurring block?',
      body: `It ends today. ${removed.length} empty, unfinished future occurrence(s) will be removed. Completed history, occurrences holding sessions, and individually edited ones are kept.`,
      confirmLabel: 'Stop recurring',
    })
    if (ok) await act(endRecurrence(useStore.getState().data, rule.id, today), { label: 'Recurring block ended' })
  }

  const destroy = async (rule: RecurringBlock) => {
    const blocks = data.blocks.filter((b) => b.recurrence_id === rule.id)
    const ok = await confirm({
      title: 'Delete this recurring template?',
      body: `${blocks.length} existing occurrence(s) stay on your calendar as ordinary blocks. Only the template is deleted.`,
      confirmLabel: 'Delete template',
      destructive: true,
    })
    if (!ok) return
    const changes = [...blocks.flatMap((b) => compact([update('blocks', b, { recurrence_id: null })])), remove('recurring_blocks', [rule])]
    await act(changes, { label: 'Recurring template deleted' })
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">Optional. Use these if you reserve the same time regularly. Nothing is added to your calendar until you choose “Add recurring blocks” in the Planner.</p>
      <ul className="space-y-1.5">
        {rules.map((r) => (
          <li key={r.id} className={cn('flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2', (r.archived_at || (r.ends_on && r.ends_on < today)) && 'opacity-60')}>
            <Repeat className="size-4 text-muted" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{r.title || maps.tracks.get(r.track_id ?? '')?.name || 'Untitled block'}</p>
              <p className="text-[12px] text-faint">
                {r.weekdays.map((d) => WEEKDAY_LABELS[d]).join(', ')} · {r.start_time ? `${r.start_time} · ` : ''}{formatMinutes(r.duration_min)}
                {!r.required && ' · optional'} · from {formatShortDate(r.starts_on)}{r.ends_on ? ` to ${formatShortDate(r.ends_on)}` : ''}
              </p>
            </div>
            <TrackBadge track={maps.tracks.get(r.track_id ?? '')} />
            <Menu
              label={`Actions for recurring block ${r.title}`}
              items={[
                { label: 'Edit…', onSelect: () => setEditing(r) },
                { label: 'Stop recurring (end today)…', onSelect: () => void end(r), disabled: !!r.ends_on && r.ends_on <= today },
                { label: 'Delete template…', danger: true, separatorBefore: true, onSelect: () => void destroy(r) },
              ]}
            />
          </li>
        ))}
      </ul>
      <Button size="sm" onClick={() => setEditing('new')}><Plus /> Add recurring block</Button>
      {editing && <RuleDialog rule={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
