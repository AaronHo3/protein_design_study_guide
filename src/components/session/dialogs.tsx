import { useMemo, useState } from 'react'
import { applyChanges, compact, insert, update, type Change } from '../../domain/changes'
import { moveBlock, plannedMinutesOn, scheduleSession, unscheduleSession } from '../../domain/scheduling'
import {
  duplicateSession, moveTaskToSession, sessionFromTemplate, sessionFromTopic, splitSession, tasksOf, templateFromSession,
} from '../../domain/sessions'
import { newSession } from '../../domain/factories'
import type { Block, ISODate, Session, Task } from '../../domain/types'
import { formatMinutes, formatShortDate, isISODate } from '../../lib/dates'
import { act } from '../../state/actions'
import { activeTopics, activeTracks, settingsOf, todayFor, useMaps } from '../../state/selectors'
import { useStore } from '../../state/store'
import { Button } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { Checkbox, Field, Input, Select, Textarea } from '../ui/field'
import { Segmented } from '../ui/misc'

function clampMinutes(v: string, fallback: number | null): number | null {
  if (v.trim() === '') return fallback
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.max(5, Math.min(1440, n)) : fallback
}

function CapacityHint({ date, extra, excludeBlockId }: { date: ISODate; extra: number; excludeBlockId?: string }) {
  const data = useStore((s) => s.data)
  if (!isISODate(date)) return null
  const capacity = settingsOf(data).daily_capacity_min
  const planned = plannedMinutesOn(data, date, excludeBlockId) + extra
  const over = planned > capacity
  return (
    <p className={over ? 'text-[12.5px] text-warn' : 'text-[12.5px] text-faint'}>
      {formatShortDate(date)}: {formatMinutes(planned)} planned of {formatMinutes(capacity)} capacity{over ? ' — over capacity' : ''}
    </p>
  )
}

/** Move a session (or an empty block) to a date, adjust duration/time, or return it to the backlog. */
export function MoveDialog({ block, session, onClose }: { block?: Block; session?: Session; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const ctx = useStore((s) => s.ctx)
  const today = todayFor(settingsOf(data))
  const [date, setDate] = useState(block?.date ?? today)
  const [time, setTime] = useState(block?.start_time ?? '')
  const [duration, setDuration] = useState(String(block?.duration_min ?? session?.planned_min ?? 60))
  const [required, setRequired] = useState(block?.required ?? true)
  const minutes = clampMinutes(duration, 60) ?? 60

  const save = async () => {
    if (!isISODate(date)) return
    const snap = useStore.getState().data
    let changes: Change[]
    if (block) {
      const moved = block.date !== date ? moveBlock(snap, block.id, date, undefined, ctx) : []
      const after = applyChanges(snap, moved)
      const current = after.blocks.find((b) => b.id === block.id)!
      const fields = { start_time: time || null, duration_min: minutes, required }
      const edited = fields.start_time !== current.start_time || fields.duration_min !== current.duration_min || fields.required !== current.required
      // Editing one recurring occurrence detaches it so later "future occurrences" edits leave it alone.
      changes = [...moved, ...compact([update('blocks', current, { ...fields, ...(edited && current.recurrence_id ? { detached: true } : {}) })])]
    } else if (session) {
      changes = scheduleSession(snap, session.id, date, ctx, { duration_min: minutes, start_time: time || null, required })
    } else return
    const label = block && block.date !== date ? `Moved to ${formatShortDate(date)}` : session && !block ? `Scheduled for ${formatShortDate(date)}` : 'Block updated'
    if (await act(changes, { label })) onClose()
  }

  const toBacklog = async () => {
    if (!session) return
    if (await act(unscheduleSession(useStore.getState().data, session.id), { label: 'Returned to backlog' })) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={block ? 'Move or edit block' : 'Schedule session'}
      description={session?.title ?? block?.title}
      size="sm"
      footer={
        <>
          {session && block && (
            <Button variant="ghost" className="mr-auto" onClick={() => void toBacklog()}>Return to backlog</Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} disabled={!isISODate(date)}>Save</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Date">{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 7].map((n) => {
            const d = new Date(`${today}T00:00:00Z`)
            d.setUTCDate(d.getUTCDate() + n)
            const iso = d.toISOString().slice(0, 10)
            return (
              <Button key={n} size="sm" variant="subtle" onClick={() => setDate(iso)} aria-pressed={date === iso}>
                {n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === 7 ? 'Next week' : formatShortDate(iso)}
              </Button>
            )
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start time (optional)" hint="Leave empty to plan by date only.">
            {(id) => <Input id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}
          </Field>
          <Field label="Duration (minutes)">
            {(id) => <Input id={id} type="number" min={5} max={1440} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} />}
          </Field>
        </div>
        <Checkbox label="Required for a completed day" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        <CapacityHint date={date} extra={minutes} excludeBlockId={block?.id} />
      </div>
    </Dialog>
  )
}

export interface NewSessionPreset {
  topicId?: string | null
  trackId?: string | null
  date?: ISODate | null
  blockId?: string // fill an existing empty block
  templateId?: string
}

/** Create a session from scratch, from a topic, or from a template; schedule it or keep it in the backlog. */
export function NewSessionDialog({ preset = {}, onClose, onCreated }: { preset?: NewSessionPreset; onClose: () => void; onCreated?: (id: string) => void }) {
  const data = useStore((s) => s.data)
  const ctx = useStore((s) => s.ctx)
  const maps = useMaps()
  const tracks = activeTracks(data)
  const topics = activeTopics(data)
  const templates = data.session_templates.filter((t) => !t.archived_at)
  const topic = preset.topicId ? maps.topics.get(preset.topicId) : undefined
  const fillBlock = preset.blockId ? data.blocks.find((b) => b.id === preset.blockId) : undefined

  const presetTemplate = preset.templateId ? maps.templates.get(preset.templateId) : undefined
  const [templateId, setTemplateId] = useState(presetTemplate?.id ?? '')
  const [title, setTitle] = useState(topic?.title ?? presetTemplate?.title ?? presetTemplate?.name ?? '')
  const [trackId, setTrackId] = useState(preset.trackId ?? fillBlock?.track_id ?? topic?.track_ids[0] ?? presetTemplate?.track_id ?? '')
  const [topicId, setTopicId] = useState(preset.topicId ?? presetTemplate?.topic_id ?? '')
  const [minutes, setMinutes] = useState(String(fillBlock?.duration_min ?? presetTemplate?.planned_min ?? 60))
  const [output, setOutput] = useState(presetTemplate?.output ?? '')
  const [description, setDescription] = useState('')
  const [where, setWhere] = useState<'backlog' | 'date'>(preset.date || fillBlock ? 'date' : 'backlog')
  const [date, setDate] = useState(preset.date ?? fillBlock?.date ?? todayFor(settingsOf(data)))

  const pickTemplate = (id: string) => {
    setTemplateId(id)
    const t = maps.templates.get(id)
    if (!t) return
    if (!title) setTitle(t.title || t.name)
    if (t.track_id && !trackId) setTrackId(t.track_id)
    if (t.topic_id && !topicId) setTopicId(t.topic_id)
    if (t.planned_min) setMinutes(String(t.planned_min))
    if (t.output && !output) setOutput(t.output)
  }

  const create = async () => {
    if (!title.trim()) return
    const planned = clampMinutes(minutes, null)
    const fields = {
      title: title.trim(), track_id: trackId || null, topic_id: topicId || null, planned_min: planned, output, description,
    }
    const tpl = templateId ? maps.templates.get(templateId) : undefined
    const topicRow = topicId ? maps.topics.get(topicId) : undefined
    let session: Session
    let changes: Change[]
    if (tpl) {
      ;({ session, changes } = sessionFromTemplate(tpl, ctx, fields))
    } else {
      session = topicRow ? { ...sessionFromTopic(topicRow, ctx, fields), ...fields } : newSession(ctx, fields)
      changes = [insert('sessions', [session])]
    }
    const after = applyChanges(useStore.getState().data, changes)
    if (fillBlock) {
      changes.push(...compact([update('blocks', fillBlock, { session_id: session.id, track_id: fillBlock.track_id ?? session.track_id })]))
    } else if (where === 'date' && isISODate(date)) {
      changes.push(...scheduleSession(after, session.id, date, ctx, { duration_min: planned ?? 60 }))
    }
    const label = fillBlock || where === 'date' ? `Session scheduled for ${formatShortDate(fillBlock?.date ?? date)}` : 'Session added to backlog'
    if (await act(changes, { label })) {
      onCreated?.(session.id)
      onClose()
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={fillBlock ? 'Plan this block' : topic ? `New session for “${topic.title}”` : 'New study session'}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void create()} disabled={!title.trim()}>Create session</Button>
        </>
      }
    >
      <div className="space-y-3">
        {templates.length > 0 && (
          <Field label="Start from a template (optional)" hint="The session gets its own copy; editing the template later won’t change it.">
            {(id) => (
              <Select id={id} value={templateId} onChange={(e) => pickTemplate(e.target.value)}>
                <option value="">No template</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.tasks.length} tasks)</option>)}
              </Select>
            )}
          </Field>
        )}
        <Field label="What will you do?">
          {(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Plot binding curves and explain how KD changes occupancy" autoFocus />}
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Track">
            {(id) => (
              <Select id={id} value={trackId} onChange={(e) => setTrackId(e.target.value)}>
                <option value="">No track</option>
                {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Topic">
            {(id) => (
              <Select id={id} value={topicId} onChange={(e) => setTopicId(e.target.value)}>
                <option value="">No topic</option>
                {topics.map((t) => <option key={t.id} value={t.id}>{t.parent_id ? '— ' : ''}{t.title}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Planned minutes">
            {(id) => <Input id={id} type="number" min={5} max={1440} step={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} />}
          </Field>
        </div>
        <Field label="Output or success criterion (optional)">
          {(id) => <Input id={id} value={output} onChange={(e) => setOutput(e.target.value)} placeholder="e.g. A plotted curve with a one-paragraph explanation" />}
        </Field>
        <Field label="Description (optional)">
          {(id) => <Textarea id={id} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        {!fillBlock && (
          <div className="space-y-2">
            <Segmented
              label="Where should it go?"
              value={where}
              onChange={setWhere}
              options={[{ value: 'backlog', label: 'Backlog (no date)' }, { value: 'date', label: 'Schedule on a date' }]}
            />
            {where === 'date' && (
              <div className="space-y-1">
                <Input aria-label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-48" />
                <CapacityHint date={date} extra={clampMinutes(minutes, 60) ?? 60} />
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}

export function SplitDialog({ session, onClose }: { session: Session; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const ctx = useStore((s) => s.ctx)
  const tasks = tasksOf(data, session.id)
  const [picked, setPicked] = useState<string[]>([])
  const [title, setTitle] = useState(`${session.title} (part 2)`)
  const save = async () => {
    if (await act(splitSession(useStore.getState().data, session.id, picked, title.trim() || 'Untitled part', ctx), { label: 'Session split — new part is in the backlog' })) onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Split session"
      description="Chosen tasks move (with their progress) into a new session in the backlog. Resource links are copied."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={picked.length === 0} onClick={() => void save()}>Split</Button></>}
    >
      <div className="space-y-3">
        <Field label="New session title">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <fieldset className="space-y-1">
          <legend className="mb-1 text-[13px] font-medium text-muted">Tasks to move</legend>
          {tasks.length === 0 && <p className="text-[13px] text-faint">This session has no tasks to split.</p>}
          {tasks.map((t) => (
            <Checkbox
              key={t.id}
              label={<>{t.title}{t.done && <span className="text-faint"> (done)</span>}</>}
              checked={picked.includes(t.id)}
              onChange={() => setPicked(picked.includes(t.id) ? picked.filter((x) => x !== t.id) : [...picked, t.id])}
            />
          ))}
        </fieldset>
      </div>
    </Dialog>
  )
}

export function DuplicateDialog({ session, onClose, onCreated }: { session: Session; onClose: () => void; onCreated?: (id: string) => void }) {
  const ctx = useStore((s) => s.ctx)
  const notes = useStore((s) => s.data.notes.filter((n) => n.session_id === session.id).length)
  const [includeNotes, setIncludeNotes] = useState(false)
  const [title, setTitle] = useState(`${session.title} (again)`)
  const save = async () => {
    const changes = duplicateSession(useStore.getState().data, session.id, ctx, { includeNotes, title: title.trim() || session.title })
    const created = changes[0]?.op === 'insert' ? changes[0].rows[0]?.id : undefined
    if (await act(changes, { label: 'Session duplicated into the backlog' })) {
      if (created) onCreated?.(created)
      onClose()
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Duplicate session"
      description="Creates a new instance in the backlog with the same tasks (unchecked) and resource links."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void save()}>Duplicate</Button></>}
    >
      <div className="space-y-3">
        <Field label="Title">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Checkbox
          label={`Also copy notes (${notes})`}
          checked={includeNotes}
          disabled={notes === 0}
          onChange={(e) => setIncludeNotes(e.target.checked)}
        />
      </div>
    </Dialog>
  )
}

export function SaveTemplateDialog({ session, onClose }: { session: Session; onClose: () => void }) {
  const ctx = useStore((s) => s.ctx)
  const [name, setName] = useState(session.title)
  const save = async () => {
    if (!name.trim()) return
    if (await act(templateFromSession(useStore.getState().data, session.id, name.trim(), ctx), { label: 'Saved as a template' })) onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Save as reusable template"
      description="Stores this session’s task structure, duration and output. Sessions you create from it later are independent copies."
      size="sm"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!name.trim()} onClick={() => void save()}>Save template</Button></>}
    >
      <Field label="Template name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoFocus />}</Field>
    </Dialog>
  )
}

export function MoveTaskDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const ctx = useStore((s) => s.ctx)
  const maps = useMaps()
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState('')
  const options = useMemo(() => {
    const q = query.toLowerCase()
    return data.sessions
      .filter((s) => s.id !== task.session_id && !s.archived_at && s.title.toLowerCase().includes(q))
      .map((s) => ({ s, date: maps.blockBySession.get(s.id)?.date ?? null }))
      .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
      .slice(0, 60)
  }, [data.sessions, maps, query, task.session_id])
  const save = async () => {
    if (!target) return
    if (await act(moveTaskToSession(useStore.getState().data, task.id, target, ctx), { label: 'Task moved' })) onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Move task to another session"
      description={`“${task.title}” keeps its completion state and description.`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!target} onClick={() => void save()}>Move task</Button></>}
    >
      <div className="space-y-2">
        <Input aria-label="Search sessions" placeholder="Search sessions…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        <div role="radiogroup" aria-label="Target session" className="max-h-72 space-y-0.5 overflow-y-auto rounded-md border border-line p-1">
          {options.map(({ s, date }) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-2">
              <input type="radio" name="target" className="accent-[var(--accent)]" checked={target === s.id} onChange={() => setTarget(s.id)} />
              <span className="min-w-0 flex-1 truncate">{s.title}</span>
              <span className="text-[12px] text-faint">{date ? formatShortDate(date) : 'Backlog'}</span>
            </label>
          ))}
          {options.length === 0 && <p className="p-3 text-[13px] text-faint">No other sessions.</p>}
        </div>
      </div>
    </Dialog>
  )
}
