import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, CalendarClock, GripVertical, Inbox, Minus, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { blockState } from '../../domain/completion'
import { compact, update } from '../../domain/changes'
import { deleteBlock, moveBlockBy, unscheduleSession } from '../../domain/scheduling'
import type { Block, Session } from '../../domain/types'
import { formatMinutes } from '../../lib/dates'
import { cn } from '../../lib/cn'
import { act } from '../../state/actions'
import { blockTitle, useMaps } from '../../state/selectors'
import { useStore } from '../../state/store'
import { MoveDialog } from '../session/dialogs'
import { useOpenSession } from '../session/useOpenSession'
import { WorkIcon } from '../status'
import { TrackDot, trackClass } from '../track'
import { Menu } from '../ui/menu'

export function blockDragId(id: string) {
  return `block:${id}`
}
export function sessionDragId(id: string) {
  return `session:${id}`
}

export function PlannerBlock({ block, index, count, draggable = true }: { block: Block; index: number; count: number; draggable?: boolean }) {
  const data = useStore((s) => s.data)
  const maps = useMaps()
  const { open } = useOpenSession()
  const [moving, setMoving] = useState(false)
  const sortable = useSortable({ id: blockDragId(block.id), disabled: !draggable })
  const session = block.session_id ? maps.sessions.get(block.session_id) : undefined
  const track = maps.tracks.get(session?.track_id ?? block.track_id ?? '')
  const state = blockState(block, data.sessions, data.tasks)
  const title = blockTitle(block, maps)
  const snap = () => useStore.getState().data
  const resize = (delta: number) => {
    const next = Math.max(15, Math.min(720, block.duration_min + delta))
    void act(compact([update('blocks', block, { duration_min: next })]))
  }

  return (
    <div
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}
      className={cn(
        trackClass(track),
        'track-bar group relative rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px]',
        sortable.isDragging && 'z-10 opacity-80 shadow-panel',
        state === 'skipped' && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-1">
        {draggable && (
          <button
            type="button"
            className="-ml-1 cursor-grab touch-none rounded text-faint hover:text-fg active:cursor-grabbing"
            aria-label={`Drag ${title}. Press space to pick up, arrow keys to move, space to drop.`}
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <GripVertical className="size-3.5" />
          </button>
        )}
        <WorkIcon state={state} className="size-3.5" />
        <span className="min-w-0 flex-1 truncate text-[11px] text-faint">
          {block.start_time ? `${block.start_time} · ` : ''}{formatMinutes(block.duration_min)}{!block.required && ' · optional'}
        </span>
        <Menu
          label={`Actions for ${title}`}
          trigger={
            <button type="button" aria-label={`Actions for ${title}`} className="rounded p-0.5 text-faint hover:bg-surface-2 hover:text-fg">
              <span aria-hidden className="block text-[13px] leading-none">⋯</span>
            </button>
          }
          items={[
            { label: 'Move to date…', icon: <CalendarClock />, onSelect: () => setMoving(true) },
            { label: 'Move up', icon: <ArrowUp />, disabled: index === 0, onSelect: () => void act(moveBlockBy(snap(), block.id, -1)) },
            { label: 'Move down', icon: <ArrowDown />, disabled: index === count - 1, onSelect: () => void act(moveBlockBy(snap(), block.id, 1)) },
            { label: 'Longer (+15 min)', icon: <Plus />, onSelect: () => resize(15) },
            { label: 'Shorter (−15 min)', icon: <Minus />, disabled: block.duration_min <= 15, onSelect: () => resize(-15) },
            ...(session
              ? [{ label: 'Return to backlog', icon: <Inbox />, onSelect: () => void act(unscheduleSession(snap(), session.id), { label: 'Returned to backlog' }) }]
              : []),
            { label: 'Remove block', icon: <Trash2 />, danger: true, separatorBefore: true, onSelect: () => void act(deleteBlock(snap(), block.id), { label: 'Block removed' }) },
          ]}
        />
      </div>
      <button
        type="button"
        title={title}
        onClick={() => (session ? open(session.id) : setMoving(true))}
        className={cn('mt-0.5 line-clamp-3 w-full text-left leading-snug [overflow-wrap:anywhere] hover:underline', !session && 'italic text-muted')}
      >
        {title}
      </button>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
        <TrackDot track={track} />
        <span className="truncate">{track?.name ?? 'No track'}</span>
      </div>
      {moving && <MoveDialog block={block} session={session} onClose={() => setMoving(false)} />}
    </div>
  )
}

export function BacklogItem({ session }: { session: Session }) {
  const maps = useMaps()
  const { open } = useOpenSession()
  const sortable = useSortable({ id: sessionDragId(session.id) })
  const [scheduling, setScheduling] = useState(false)
  const track = maps.tracks.get(session.track_id ?? '')
  const topic = session.topic_id ? maps.topics.get(session.topic_id) : undefined
  return (
    <div
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}
      className={cn(trackClass(track), 'track-bar flex items-start gap-1 rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px]', sortable.isDragging && 'z-10 opacity-80 shadow-panel')}
    >
      <button
        type="button"
        className="-ml-1 mt-0.5 cursor-grab touch-none rounded text-faint hover:text-fg"
        aria-label={`Drag ${session.title} onto a day`}
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" className="text-left leading-snug hover:underline" onClick={() => open(session.id)}>{session.title}</button>
        <p className="text-[11.5px] text-faint">
          {track?.name ?? 'No track'}{topic ? ` · ${topic.title}` : ''}{session.planned_min ? ` · ${formatMinutes(session.planned_min)}` : ''}
        </p>
      </div>
      <button type="button" onClick={() => setScheduling(true)} className="shrink-0 rounded px-1.5 py-0.5 text-[11.5px] font-medium text-accent hover:bg-accent-soft">
        Schedule
      </button>
      {scheduling && <MoveDialog session={session} onClose={() => setScheduling(false)} />}
    </div>
  )
}
