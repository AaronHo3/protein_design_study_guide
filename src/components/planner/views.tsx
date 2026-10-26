import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ListPlus, Plus, SquarePlus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { blocksOn, DAY_KIND_LABEL, daySummary } from '../../domain/completion'
import { backlog, createBlock } from '../../domain/scheduling'
import type { ISODate } from '../../domain/types'
import { addDays, daysInRange, formatDate, formatMinutes, monthGrid, startOfWeek } from '../../lib/dates'
import { cn } from '../../lib/cn'
import { act } from '../../state/actions'
import { activeTracks, isStudyDay, todayFor, useMaps, useSettings } from '../../state/selectors'
import { useStore } from '../../state/store'
import { NewSessionDialog } from '../session/dialogs'
import { DayIcon } from '../status'
import { TrackDot } from '../track'
import { Button } from '../ui/button'
import { Menu } from '../ui/menu'
import { Select } from '../ui/field'
import { BacklogItem, PlannerBlock, blockDragId, sessionDragId } from './PlannerBlock'
import { BACKLOG_DROP, dayDropId } from './useDragHandlers'

function CapacityLine({ date }: { date: ISODate }) {
  const data = useStore((s) => s.data)
  const settings = useSettings()
  const s = daySummary(data, date, isStudyDay(settings, date))
  const over = s.plannedMin > settings.daily_capacity_min
  return (
    <span className={cn('text-[11.5px]', over ? 'font-medium text-warn' : 'text-faint')}>
      {formatMinutes(s.plannedMin)} / {formatMinutes(settings.daily_capacity_min)}{over && ' · over'}
    </span>
  )
}

function AddToDayMenu({ date }: { date: ISODate }) {
  const ctx = useStore((s) => s.ctx)
  const [creating, setCreating] = useState(false)
  return (
    <>
      <Menu
        label={`Add to ${formatDate(date, { weekday: 'long', month: 'short', day: 'numeric' })}`}
        trigger={
          <button type="button" aria-label={`Add to ${formatDate(date, { weekday: 'long', month: 'short', day: 'numeric' })}`} className="rounded p-0.5 text-faint hover:bg-surface-2 hover:text-fg">
            <Plus className="size-3.5" />
          </button>
        }
        items={[
          { label: 'New session…', icon: <ListPlus />, onSelect: () => setCreating(true) },
          { label: 'Empty block (decide later)', icon: <SquarePlus />, onSelect: () => void act(createBlock(useStore.getState().data, date, ctx), { label: 'Empty block added' }) },
        ]}
      />
      {creating && <NewSessionDialog preset={{ date }} onClose={() => setCreating(false)} />}
    </>
  )
}

function DayColumn({ date }: { date: ISODate }) {
  const data = useStore((s) => s.data)
  const settings = useSettings()
  const today = todayFor(settings)
  const navigate = useNavigate()
  const blocks = blocksOn(data, date)
  const summary = daySummary(data, date, isStudyDay(settings, date))
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(date) })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-48 min-w-0 flex-col rounded-lg border bg-surface-2/50 p-1.5 transition-colors',
        isOver ? 'border-accent bg-accent-soft' : 'border-line',
        summary.kind === 'rest' && 'bg-transparent',
      )}
    >
      <div className="mb-1.5 flex items-center gap-1 px-1">
        <button
          type="button"
          onClick={() => navigate(`/?date=${date}`)}
          className="min-w-0 flex-1 text-left"
          aria-label={`${formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}: ${DAY_KIND_LABEL[summary.kind]}${date === today ? ', today' : ''}. Open day.`}
        >
          <span className={cn('block text-[11.5px] font-medium tracking-wide uppercase', date === today ? 'text-accent' : 'text-faint')}>
            {formatDate(date, { weekday: 'short' })}
          </span>
          <span className={cn('inline-flex items-center gap-1 text-sm font-semibold', date === today && 'text-accent')}>
            {formatDate(date, { day: 'numeric' })}
            <DayIcon kind={summary.kind} />
          </span>
        </button>
        <AddToDayMenu date={date} />
      </div>
      <div className="px-1 pb-1"><CapacityLine date={date} /></div>
      <SortableContext items={blocks.map((b) => blockDragId(b.id))} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-1.5">
          {blocks.map((b, i) => <PlannerBlock key={b.id} block={b} index={i} count={blocks.length} />)}
          {blocks.length === 0 && (
            <p className="px-1 py-3 text-center text-[11.5px] text-faint">{summary.kind === 'rest' ? 'Rest day' : 'Drop here'}</p>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

export function WeekView({ anchor }: { anchor: ISODate }) {
  const start = startOfWeek(anchor)
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {daysInRange(start, addDays(start, 6)).map((d) => <DayColumn key={d} date={d} />)}
    </div>
  )
}

export function MonthView({ anchor, selected, onSelect }: { anchor: ISODate; selected: ISODate; onSelect: (d: ISODate) => void }) {
  const data = useStore((s) => s.data)
  const settings = useSettings()
  const maps = useMaps()
  const today = todayFor(settings)
  const month = anchor.slice(0, 7)
  const days = monthGrid(anchor)
  return (
    <div role="grid" aria-label={formatDate(anchor, { month: 'long', year: 'numeric' })} className="overflow-hidden rounded-lg border border-line">
      <div role="row" className="grid grid-cols-7 border-b border-line bg-surface-2 text-center text-[11.5px] font-medium text-faint">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div role="columnheader" key={d} className="py-1.5">{d}</div>)}
      </div>
      {[0, 1, 2, 3, 4, 5].map((w) => (
        <div role="row" key={w} className="grid grid-cols-7">
          {days.slice(w * 7, w * 7 + 7).map((d) => {
            const s = daySummary(data, d, isStudyDay(settings, d))
            const blocks = blocksOn(data, d)
            const inMonth = d.slice(0, 7) === month
            const label = `${formatDate(d, { weekday: 'long', month: 'long', day: 'numeric' })}. ${DAY_KIND_LABEL[s.kind]}${s.requiredTotal ? `, ${s.requiredDone} of ${s.requiredTotal} required done` : ''}${d === today ? '. Today' : ''}`
            return (
              <div role="gridcell" key={d} aria-selected={d === selected} className="border-r border-b border-line last:border-r-0">
                <button
                  type="button"
                  aria-label={label}
                  onClick={() => onSelect(d)}
                  className={cn(
                    'flex h-full min-h-20 w-full flex-col gap-1 p-1.5 text-left transition-colors hover:bg-surface-2',
                    !inMonth && 'opacity-45',
                    s.kind === 'rest' && 'bg-surface-2/40',
                    d === selected && 'bg-accent-soft hover:bg-accent-soft',
                  )}
                >
                  <span className="flex items-center gap-1">
                    <span className={cn('inline-flex size-6 items-center justify-center rounded-full text-[12.5px] font-medium', d === today && 'bg-accent text-accent-fg')}>
                      {Number(d.slice(8))}
                    </span>
                    {s.kind !== 'empty' && <DayIcon kind={s.kind} />}
                  </span>
                  {blocks.length > 0 && (
                    <span className="flex flex-wrap items-center gap-0.5">
                      {blocks.slice(0, 4).map((b) => {
                        const track = maps.tracks.get(maps.sessions.get(b.session_id ?? '')?.track_id ?? b.track_id ?? '')
                        return <TrackDot key={b.id} track={track} />
                      })}
                      {blocks.length > 4 && <span className="text-[10.5px] text-faint">+{blocks.length - 4}</span>}
                    </span>
                  )}
                  {s.requiredTotal > 0 && <span className="text-[11px] text-muted">{s.requiredDone}/{s.requiredTotal}</span>}
                  {s.kind === 'rest' && inMonth && <span className="text-[10.5px] text-faint">Rest</span>}
                </button>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** Readable list of days — the default calendar on small screens. */
export function AgendaView({ start, days = 14 }: { start: ISODate; days?: number }) {
  const data = useStore((s) => s.data)
  const settings = useSettings()
  const today = todayFor(settings)
  const navigate = useNavigate()
  return (
    <ol className="space-y-3">
      {daysInRange(start, addDays(start, days - 1)).map((d) => {
        const blocks = blocksOn(data, d)
        const s = daySummary(data, d, isStudyDay(settings, d))
        return (
          <li key={d} className="rounded-lg border border-line bg-surface">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <button type="button" onClick={() => navigate(`/?date=${d}`)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className={cn('text-sm font-semibold', d === today && 'text-accent')}>
                  {formatDate(d, { weekday: 'short', month: 'short', day: 'numeric' })}{d === today && ' · Today'}
                </span>
                <span className="inline-flex items-center gap-1 text-[12px] text-muted"><DayIcon kind={s.kind} /> {DAY_KIND_LABEL[s.kind]}</span>
              </button>
              <CapacityLine date={d} />
              <AddToDayMenu date={d} />
            </div>
            {blocks.length > 0 && (
              <div className="space-y-1.5 p-2">
                <SortableContext items={blocks.map((b) => blockDragId(b.id))} strategy={verticalListSortingStrategy}>
                  {blocks.map((b, i) => <PlannerBlock key={b.id} block={b} index={i} count={blocks.length} draggable={false} />)}
                </SortableContext>
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

export function BacklogPanel({ draggable }: { draggable: boolean }) {
  const data = useStore((s) => s.data)
  const tracks = activeTracks(data)
  const [trackId, setTrackId] = useState('')
  const [creating, setCreating] = useState(false)
  const items = backlog(data).filter((s) => !trackId || s.track_id === trackId)
  const { setNodeRef, isOver } = useDroppable({ id: BACKLOG_DROP })
  return (
    <section aria-labelledby="backlog-h" ref={setNodeRef} className={cn('flex flex-col rounded-lg border bg-surface', isOver ? 'border-accent' : 'border-line')}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <h2 id="backlog-h" className="flex-1 text-[13px] font-semibold">Backlog <span className="font-normal text-faint">({backlog(data).length})</span></h2>
        <Button size="sm" variant="ghost" onClick={() => setCreating(true)}><Plus /> New</Button>
      </div>
      {tracks.length > 0 && (
        <div className="px-3 pt-2">
          <Select aria-label="Filter backlog by track" value={trackId} onChange={(e) => setTrackId(e.target.value)} className="h-8 text-[13px]">
            <option value="">All tracks</option>
            {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </div>
      )}
      <div className="flex flex-col gap-1.5 p-2">
        <SortableContext items={items.map((s) => sessionDragId(s.id))} strategy={verticalListSortingStrategy} disabled={!draggable}>
          {items.map((s) => <BacklogItem key={s.id} session={s} />)}
        </SortableContext>
        {items.length === 0 && (
          <p className="px-2 py-4 text-center text-[12.5px] text-faint">
            No unscheduled sessions. Create sessions here or from topics in the Curriculum.
          </p>
        )}
      </div>
      {creating && <NewSessionDialog onClose={() => setCreating(false)} />}
    </section>
  )
}
