import {
  ArrowDown, ArrowUp, CalendarClock, CalendarX2, Check, Clock, Inbox, ListPlus, NotebookPen, PanelRightOpen, Repeat, SkipForward, Trash2, Undo2,
} from 'lucide-react'
import { useState } from 'react'
import { compact, insert, update } from '../domain/changes'
import { blockState, sessionProgress } from '../domain/completion'
import { newNote } from '../domain/factories'
import { deleteBlock, moveBlock, moveBlockBy, setBlockStatus, unscheduleSession, backlog } from '../domain/scheduling'
import { completeSession, setSessionStatus } from '../domain/sessions'
import type { Block } from '../domain/types'
import { addDays, formatMinutes, formatShortDate } from '../lib/dates'
import { cn } from '../lib/cn'
import { act } from '../state/actions'
import { blockTitle, useMaps } from '../state/selectors'
import { useStore } from '../state/store'
import { MoveDialog, NewSessionDialog } from './session/dialogs'
import { SessionResources } from './session/SessionResources'
import { TaskList } from './session/TaskList'
import { useOpenSession } from './session/useOpenSession'
import { WORK_LABEL, WorkIcon } from './status'
import { trackClass, TrackBadge } from './track'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { Menu } from './ui/menu'
import { Badge } from './ui/misc'

export function BlockCard({ block, index, count }: { block: Block; index: number; count: number }) {
  const data = useStore((s) => s.data)
  const ctx = useStore((s) => s.ctx)
  const maps = useMaps()
  const { open } = useOpenSession()
  const [dialog, setDialog] = useState<'move' | 'plan' | 'pick' | null>(null)
  const session = block.session_id ? maps.sessions.get(block.session_id) : undefined
  const state = blockState(block, data.sessions, data.tasks)
  const track = maps.tracks.get(session?.track_id ?? block.track_id ?? '')
  const topic = session?.topic_id ? maps.topics.get(session.topic_id) : undefined
  const stage = topic?.stage_id ? maps.stages.get(topic.stage_id) : undefined
  const notes = session ? data.notes.filter((n) => n.session_id === session.id) : []
  const progress = session ? sessionProgress(session, data.tasks) : null
  const title = blockTitle(block, maps)
  const snap = () => useStore.getState().data

  const addNote = async () => {
    if (!session) return
    await act([insert('notes', [newNote(ctx, { session_id: session.id })])])
    open(session.id)
  }

  const defer = () =>
    void act(moveBlock(snap(), block.id, addDays(block.date, 1), undefined, ctx), { label: `Deferred to ${formatShortDate(addDays(block.date, 1))}` })

  const menuItems = [
    { label: 'Move to date…', icon: <CalendarClock />, onSelect: () => setDialog('move') },
    { label: 'Defer to next day', icon: <CalendarX2 />, onSelect: defer },
    { label: 'Move up', icon: <ArrowUp />, disabled: index === 0, onSelect: () => void act(moveBlockBy(snap(), block.id, -1)) },
    { label: 'Move down', icon: <ArrowDown />, disabled: index === count - 1, onSelect: () => void act(moveBlockBy(snap(), block.id, 1)) },
    ...(session
      ? [
          { label: 'Return session to backlog', icon: <Inbox />, onSelect: () => void act(unscheduleSession(snap(), session.id), { label: 'Returned to backlog' }) },
          state === 'skipped'
            ? { label: 'Unskip', icon: <Undo2 />, onSelect: () => void act(setSessionStatus(snap(), session.id, 'planned', ctx), { label: 'Unskipped' }) }
            : { label: 'Skip', icon: <SkipForward />, onSelect: () => void act(setSessionStatus(snap(), session.id, 'skipped', ctx), { label: 'Skipped (not counted as completed)' }) },
        ]
      : [
          state === 'skipped'
            ? { label: 'Unskip', icon: <Undo2 />, onSelect: () => void act(setBlockStatus(snap(), block.id, 'planned'), { label: 'Unskipped' }) }
            : { label: 'Skip', icon: <SkipForward />, onSelect: () => void act(setBlockStatus(snap(), block.id, 'skipped'), { label: 'Skipped (not counted as completed)' }) },
        ]),
    {
      label: 'Remove block', icon: <Trash2 />, danger: true, separatorBefore: true,
      onSelect: () => void act(deleteBlock(snap(), block.id), { label: session ? 'Block removed — session is back in the backlog' : 'Block removed' }),
    },
  ]

  return (
    <article
      aria-labelledby={`block-${block.id}`}
      className={cn(trackClass(track), 'track-bar rounded-lg border border-line bg-surface', state === 'skipped' && 'opacity-70')}
    >
      <header className="flex items-start gap-3 px-4 pt-3">
        <WorkIcon state={state} className="mt-0.5 size-5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
            <TrackBadge track={track} />
            {topic && <span>{topic.title}</span>}
            {stage && <span className="text-faint">· {stage.title}</span>}
          </div>
          <h3 id={`block-${block.id}`} className="mt-1 text-[15px] leading-snug font-medium">
            {session ? (
              <button type="button" className="text-left hover:underline" onClick={() => open(session.id)}>{title}</button>
            ) : (
              title
            )}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
            <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden />{block.start_time ? `${block.start_time} · ` : ''}{formatMinutes(block.duration_min)}</span>
            {!block.required && <Badge>Optional</Badge>}
            {block.recurrence_id && <span className="inline-flex items-center gap-1"><Repeat className="size-3" aria-hidden /> Recurring</span>}
            {session?.actual_min != null && <span>Actual {formatMinutes(session.actual_min)}</span>}
            <span className="sr-only">Status: {WORK_LABEL[state]}</span>
            {progress && progress.requiredTotal > 0 && <span>{progress.requiredDone}/{progress.requiredTotal} required</span>}
          </div>
        </div>
        <Menu label={`Actions for ${title}`} items={menuItems} />
      </header>

      {session ? (
        <div className="space-y-3 px-4 pt-2 pb-3">
          {session.output && (
            <p className="rounded-md bg-surface-2 px-2.5 py-1.5 text-[13px]"><span className="text-muted">Output: </span>{session.output}</p>
          )}
          <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div>
              <h4 className="mb-1 text-[12px] font-semibold tracking-wide text-faint uppercase">Tasks</h4>
              <TaskList sessionId={session.id} compact />
            </div>
            <div>
              <h4 className="mb-1 text-[12px] font-semibold tracking-wide text-faint uppercase">Resources</h4>
              <SessionResources sessionId={session.id} compact />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
            {state === 'complete' ? (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-success animate-pop"><Check className="size-4" /> Done</span>
            ) : state !== 'skipped' && (
              <Button size="sm" variant="primary" onClick={() => void act(completeSession(snap(), session.id, ctx), { label: 'Session complete' })}>
                <Check /> Complete
              </Button>
            )}
            <Button size="sm" onClick={() => void addNote()}><NotebookPen /> {notes.length ? 'Add note' : 'Write a note'}</Button>
            {notes.length > 0 && (
              <button type="button" className="text-[12.5px] text-muted hover:text-fg hover:underline" onClick={() => open(session.id)}>
                {notes.length} note{notes.length === 1 ? '' : 's'}
              </button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setDialog('move')}><CalendarClock /> Move</Button>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => open(session.id)}><PanelRightOpen /> Details</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 px-4 pt-2 pb-3">
          <p className="w-full text-[13px] text-muted">Time reserved — decide what to study, or just mark it done.</p>
          <Button size="sm" variant="primary" onClick={() => setDialog('plan')}><ListPlus /> Plan this block</Button>
          <Button size="sm" onClick={() => setDialog('pick')}><Inbox /> Pick from backlog</Button>
          {state === 'complete' ? (
            <Button size="sm" variant="ghost" onClick={() => void act(setBlockStatus(snap(), block.id, 'planned'), { label: 'Marked not done', allowReopen: true })}>
              <Undo2 /> Mark not done
            </Button>
          ) : state !== 'skipped' && (
            <Button size="sm" variant="ghost" onClick={() => void act(setBlockStatus(snap(), block.id, 'completed'), { label: 'Block done' })}>
              <Check /> Mark done
            </Button>
          )}
        </div>
      )}

      {dialog === 'move' && <MoveDialog block={block} session={session} onClose={() => setDialog(null)} />}
      {dialog === 'plan' && <NewSessionDialog preset={{ blockId: block.id }} onClose={() => setDialog(null)} />}
      {dialog === 'pick' && <PickBacklogDialog block={block} onClose={() => setDialog(null)} />}
    </article>
  )
}

function PickBacklogDialog({ block, onClose }: { block: Block; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const maps = useMaps()
  const items = backlog(data)
  const [picked, setPicked] = useState('')
  const save = async () => {
    const s = maps.sessions.get(picked)
    if (!s) return
    const changes = compact([update('blocks', block, { session_id: s.id, track_id: block.track_id ?? s.track_id })])
    if (await act(changes, { label: 'Session placed in block' })) onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Pick a session from the backlog"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!picked} onClick={() => void save()}>Use session</Button></>}
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted">Your backlog is empty. Create sessions from the Curriculum or Planner.</p>
      ) : (
        <div role="radiogroup" aria-label="Backlog sessions" className="max-h-80 space-y-0.5 overflow-y-auto">
          {items.map((s) => (
            <label key={s.id} className={cn('flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-2', picked === s.id && 'bg-accent-soft')}>
              <input type="radio" name="pick" className="accent-[var(--accent)]" checked={picked === s.id} onChange={() => setPicked(s.id)} />
              <span className="min-w-0 flex-1 truncate">{s.title}</span>
              <TrackBadge track={maps.tracks.get(s.track_id ?? '')} />
            </label>
          ))}
        </div>
      )}
    </Dialog>
  )
}
