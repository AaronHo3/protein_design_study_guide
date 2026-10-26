import {
  Archive, ArchiveRestore, ArrowLeft, CalendarClock, ChevronRight, Copy, LayoutTemplate, Plus, Scissors, SkipForward, Trash2, Undo2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { compact, insert, update } from '../../domain/changes'
import { sessionProgress } from '../../domain/completion'
import { newNote } from '../../domain/factories'
import { unscheduleSession } from '../../domain/scheduling'
import { completeSession, deleteSession, sessionDependents, setSessionStatus } from '../../domain/sessions'
import type { Session } from '../../domain/types'
import { formatLongDate, formatMinutes } from '../../lib/dates'
import { act } from '../../state/actions'
import { confirm } from '../../state/confirm'
import { activeTopics, activeTracks, useMaps } from '../../state/selectors'
import { useStore } from '../../state/store'
import { NoteEditor } from '../notes/NoteEditor'
import { WORK_LABEL, WorkIcon } from '../status'
import { TrackBadge } from '../track'
import { Button } from '../ui/button'
import { Input, Select, Textarea } from '../ui/field'
import { Menu } from '../ui/menu'
import { DuplicateDialog, MoveDialog, SaveTemplateDialog, SplitDialog } from './dialogs'
import { SessionResources } from './SessionResources'
import { TaskList } from './TaskList'

function useField<T>(value: T) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return [local, setLocal] as const
}

function minutesOrNull(v: string): number | null {
  if (v.trim() === '') return null
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.max(0, Math.min(1440, n)) : null
}

export function SessionDetail({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const session = data.sessions.find((s) => s.id === sessionId)
  if (!session) {
    return (
      <div className="p-6 text-sm text-muted">
        <p>This session no longer exists. It may have been deleted on another device.</p>
        <Button className="mt-3" onClick={onClose}>Close</Button>
      </div>
    )
  }
  return <SessionDetailInner key={session.id} session={session} onClose={onClose} />
}

function SessionDetailInner({ session, onClose }: { session: Session; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const ctx = useStore((s) => s.ctx)
  const maps = useMaps()
  const block = maps.blockBySession.get(session.id)
  const progress = sessionProgress(session, data.tasks)
  const notes = data.notes.filter((n) => n.session_id === session.id).sort((a, b) => a.created_at.localeCompare(b.created_at))
  const topic = session.topic_id ? maps.topics.get(session.topic_id) : undefined
  const goals = topic ? topic.goal_ids.map((g) => maps.goals.get(g)).filter(Boolean) : []
  const track = session.track_id ? maps.tracks.get(session.track_id) : undefined
  const template = session.template_id ? maps.templates.get(session.template_id) : undefined

  const [title, setTitle] = useField(session.title)
  const [output, setOutput] = useField(session.output)
  const [description, setDescription] = useField(session.description)
  const [planned, setPlanned] = useField(session.planned_min?.toString() ?? '')
  const [actual, setActual] = useField(session.actual_min?.toString() ?? '')
  const [dialog, setDialog] = useState<'move' | 'split' | 'duplicate' | 'template' | null>(null)
  const [newNoteId, setNewNoteId] = useState<string | null>(null)

  const patch = (p: Partial<Session>) => void act(compact([update('sessions', session, p)]))

  const addNote = async () => {
    const note = newNote(ctx, { session_id: session.id })
    await act([insert('notes', [note])])
    setNewNoteId(note.id)
  }

  const archive = async () => {
    const unfinished = progress.state !== 'complete' && progress.state !== 'skipped'
    const ok = await confirm({
      title: 'Archive this session?',
      body: block && unfinished
        ? 'It will be hidden from lists and taken off the calendar. Its tasks, notes and resource links are kept, and you can restore it later.'
        : 'It will be hidden from lists. Its history, tasks, notes and resource links are kept, and you can restore it later.',
      confirmLabel: 'Archive',
    })
    if (!ok) return
    const snap = useStore.getState().data
    const changes = [
      ...(block && unfinished ? unscheduleSession(snap, session.id) : []),
      ...compact([update('sessions', session, { archived_at: ctx.now() })]),
    ]
    await act(changes, { label: 'Session archived' })
  }

  const destroy = async () => {
    const d = sessionDependents(data, session.id)
    const ok = await confirm({
      title: 'Delete this session permanently?',
      body: (
        <ul className="list-disc space-y-1 pl-5">
          <li>{d.tasks} task(s) and {d.resources} resource link(s) will be deleted. Library resources are kept.</li>
          <li>{d.notes} note(s) will be kept but no longer linked to a session.</li>
          {d.scheduled && <li>Its calendar placement will be removed.</li>}
          <li>Consider archiving instead to keep its history.</li>
        </ul>
      ),
      confirmLabel: 'Delete session',
      destructive: true,
    })
    if (!ok) return
    onClose()
    await act(deleteSession(useStore.getState().data, session.id), { label: 'Session deleted' })
  }

  const statusLine =
    progress.requiredTotal > 0
      ? `${progress.requiredDone} of ${progress.requiredTotal} required tasks done — completes when all required tasks are checked.`
      : 'No required tasks — mark it complete when you’re done.'

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close session details">
          <ArrowLeft />
        </Button>
        <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
          <WorkIcon state={progress.state} /> {WORK_LABEL[progress.state]}
          {session.archived_at && <span className="text-faint">· archived</span>}
        </span>
        <div className="ml-auto">
          <Menu
            label="Session actions"
            items={[
              { label: block ? 'Move / reschedule…' : 'Schedule…', icon: <CalendarClock />, onSelect: () => setDialog('move') },
              { label: 'Duplicate…', icon: <Copy />, onSelect: () => setDialog('duplicate') },
              { label: 'Split into parts…', icon: <Scissors />, onSelect: () => setDialog('split') },
              { label: 'Save as template…', icon: <LayoutTemplate />, onSelect: () => setDialog('template') },
              session.archived_at
                ? { label: 'Restore from archive', icon: <ArchiveRestore />, separatorBefore: true, onSelect: () => void act(compact([update('sessions', session, { archived_at: null })]), { label: 'Session restored' }) }
                : { label: 'Archive', icon: <Archive />, separatorBefore: true, onSelect: () => void archive() },
              { label: 'Delete permanently…', icon: <Trash2 />, danger: true, onSelect: () => void destroy() },
            ]}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 lg:px-5">
        <div className="space-y-2">
          <Textarea
            aria-label="Session title"
            value={title}
            rows={1}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== session.title && patch({ title: title.trim() })}
            className="min-h-0 resize-none border-transparent bg-transparent px-0 text-lg leading-snug font-semibold hover:border-line focus:px-2"
          />
          <nav aria-label="Connections" className="flex flex-wrap items-center gap-1 text-[12.5px] text-muted">
            {goals.length > 0 && (
              <>
                <span>{goals.map((g) => g!.title).join(', ')}</span>
                <ChevronRight className="size-3 text-faint" aria-hidden />
              </>
            )}
            <span>{topic ? topic.title : 'No topic'}</span>
            <ChevronRight className="size-3 text-faint" aria-hidden />
            <span className="font-medium text-fg">This session</span>
            <ChevronRight className="size-3 text-faint" aria-hidden />
            <span>{session.output || 'No output defined'}</span>
          </nav>
        </div>

        <div className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
          <label className="space-y-1">
            <span className="text-muted">Track</span>
            <Select value={session.track_id ?? ''} onChange={(e) => patch({ track_id: e.target.value || null })}>
              <option value="">No track</option>
              {activeTracks(data).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              {track?.archived_at && <option value={track.id}>{track.name} (archived)</option>}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-muted">Topic</span>
            <Select value={session.topic_id ?? ''} onChange={(e) => patch({ topic_id: e.target.value || null })}>
              <option value="">No topic</option>
              {activeTopics(data).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              {topic?.archived_at && <option value={topic.id}>{topic.title} (archived)</option>}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-muted">Planned (min)</span>
            <Input type="number" min={0} max={1440} step={5} value={planned} onChange={(e) => setPlanned(e.target.value)} onBlur={() => patch({ planned_min: minutesOrNull(planned) })} />
          </label>
          <label className="space-y-1">
            <span className="text-muted">Actual (optional)</span>
            <Input type="number" min={0} max={1440} step={5} value={actual} placeholder="—" onChange={(e) => setActual(e.target.value)} onBlur={() => patch({ actual_min: minutesOrNull(actual) })} />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px]">
          <CalendarClock className="size-4 text-muted" aria-hidden />
          {block ? (
            <span>
              {formatLongDate(block.date)}
              {block.start_time && ` · ${block.start_time}`} · {formatMinutes(block.duration_min)}
              {!block.required && ' · optional'}
              {block.history.length > 0 && <span className="text-faint"> · moved {block.history.length}×, first planned {block.history[0].from}</span>}
            </span>
          ) : (
            <span className="text-muted">In the backlog (not scheduled)</span>
          )}
          <Button size="sm" className="ml-auto" onClick={() => setDialog('move')}>{block ? 'Move' : 'Schedule'}</Button>
          {block && (
            <Button size="sm" variant="ghost" onClick={() => void act(unscheduleSession(useStore.getState().data, session.id), { label: 'Returned to backlog' })}>
              To backlog
            </Button>
          )}
        </div>

        <label className="block space-y-1 text-[13px]">
          <span className="text-muted">Output or success criterion</span>
          <Input value={output} placeholder="What will exist when this is done?" onChange={(e) => setOutput(e.target.value)} onBlur={() => output !== session.output && patch({ output })} />
        </label>

        <div className="space-y-2 rounded-lg border border-line p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex-1 text-[12.5px] text-muted">{statusLine}</p>
            {progress.state === 'complete' ? (
              progress.requiredTotal === 0 && (
                <Button size="sm" onClick={() => void act(setSessionStatus(useStore.getState().data, session.id, 'in_progress', ctx), { label: 'Marked not complete', allowReopen: true })}>
                  <Undo2 /> Mark not complete
                </Button>
              )
            ) : (
              <Button size="sm" variant="primary" onClick={() => void act(completeSession(useStore.getState().data, session.id, ctx), { label: 'Session complete' })}>
                Complete session
              </Button>
            )}
            {progress.state === 'skipped' ? (
              <Button size="sm" variant="ghost" onClick={() => void act(setSessionStatus(useStore.getState().data, session.id, 'planned', ctx), { label: 'Unskipped' })}>Unskip</Button>
            ) : progress.state !== 'complete' && (
              <Button size="sm" variant="ghost" onClick={() => void act(setSessionStatus(useStore.getState().data, session.id, 'skipped', ctx), { label: 'Skipped (not counted as completed)' })}>
                <SkipForward /> Skip
              </Button>
            )}
          </div>
          {progress.requiredTotal > 0 && progress.state === 'complete' && (
            <p className="text-[12px] text-faint">To reopen it, uncheck a required task. Other checked tasks are kept.</p>
          )}
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <section aria-labelledby="tasks-h">
            <h3 id="tasks-h" className="mb-1.5 text-[13px] font-semibold">Tasks</h3>
            <TaskList sessionId={session.id} />
          </section>
          <section aria-labelledby="res-h">
            <h3 id="res-h" className="mb-1.5 text-[13px] font-semibold">Resources</h3>
            <SessionResources sessionId={session.id} />
          </section>
        </div>

        <section aria-labelledby="notes-h" className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 id="notes-h" className="text-[13px] font-semibold">Notes</h3>
            <Button size="sm" variant="ghost" onClick={() => void addNote()}><Plus /> Add note</Button>
          </div>
          {notes.length === 0 && <p className="text-[13px] text-faint">No notes yet.</p>}
          {notes.map((n) => <NoteEditor key={n.id} noteId={n.id} autoFocus={n.id === newNoteId} />)}
        </section>

        <details className="text-[13px]">
          <summary className="cursor-pointer text-muted">More details</summary>
          <div className="mt-2 space-y-2">
            <Textarea aria-label="Description" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} onBlur={() => description !== session.description && patch({ description })} />
            <p className="text-faint">
              Created {new Date(session.created_at).toLocaleString()}
              {template && <> · from template “{template.name}” (a copy; template edits don’t change it)</>}
              {track && <> · <TrackBadge track={track} /></>}
            </p>
          </div>
        </details>
      </div>

      {dialog === 'move' && <MoveDialog session={session} block={block} onClose={() => setDialog(null)} />}
      {dialog === 'split' && <SplitDialog session={session} onClose={() => setDialog(null)} />}
      {dialog === 'duplicate' && <DuplicateDialog session={session} onClose={() => setDialog(null)} />}
      {dialog === 'template' && <SaveTemplateDialog session={session} onClose={() => setDialog(null)} />}
    </div>
  )
}
