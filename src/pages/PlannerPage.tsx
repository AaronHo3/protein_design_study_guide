import { DndContext } from '@dnd-kit/core'
import { ChevronLeft, ChevronRight, MoveHorizontal, Repeat } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GenerateDialog, ShiftDialog } from '../components/planner/bulk'
import { PlanWeek } from '../components/planner/PlanWeek'
import { useDragHandlers } from '../components/planner/useDragHandlers'
import { AgendaView, BacklogPanel, MonthView, WeekView } from '../components/planner/views'
import { Button } from '../components/ui/button'
import { PageHeader, Segmented } from '../components/ui/misc'
import { addDays, addMonths, formatDate, isISODate, startOfWeek } from '../lib/dates'
import { todayFor, useSettings } from '../state/selectors'
import { useStore } from '../state/store'

type View = 'week' | 'month' | 'agenda' | 'plan'

function useIsWide(): boolean {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

export function PlannerPage() {
  const settings = useSettings()
  const today = todayFor(settings)
  const wide = useIsWide()
  const [params, setParams] = useSearchParams()
  const hasRules = useStore((s) => s.data.recurring_blocks.some((r) => !r.archived_at))
  const requested = params.get('view') as View | null
  const view: View = requested ?? (wide ? 'week' : 'agenda')
  const anchor = isISODate(params.get('date')) ? (params.get('date') as string) : today
  const [dialog, setDialog] = useState<'generate' | 'shift' | null>(null)
  const { sensors, onDragEnd } = useDragHandlers()

  const set = (patch: Record<string, string | null>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) next.delete(k)
        else next.set(k, v)
      }
      return next
    })

  const step = (dir: -1 | 1) => {
    const next = view === 'month' ? addMonths(anchor, dir) : addDays(anchor, dir * (view === 'agenda' ? 14 : 7))
    set({ date: next })
  }

  const weekStart = startOfWeek(anchor)
  const title =
    view === 'month'
      ? formatDate(anchor, { month: 'long', year: 'numeric' })
      : `Week of ${formatDate(view === 'agenda' ? anchor : weekStart, { month: 'short', day: 'numeric', year: 'numeric' })}`

  const showBacklog = wide && view !== 'plan'
  const calendar = (
    <>
      {view === 'week' && (wide ? <WeekView anchor={anchor} /> : <AgendaView start={weekStart} days={7} />)}
      {view === 'month' && (
        <div className="space-y-3">
          <MonthView anchor={anchor} selected={anchor} onSelect={(d) => set({ date: d })} />
          <div>
            <h3 className="mb-2 text-[13px] font-semibold">Selected day</h3>
            <AgendaView start={anchor} days={1} />
          </div>
        </div>
      )}
      {view === 'agenda' && <AgendaView start={anchor} />}
      {view === 'plan' && <PlanWeek weekStart={weekStart} />}
    </>
  )

  return (
    <div>
      <PageHeader
        title="Planner"
        subtitle="Arrange sessions on your calendar. Drag on desktop, or use each block’s menu (also keyboard-accessible)."
        actions={
          <>
            {hasRules && (
              <Button size="sm" onClick={() => setDialog('generate')}><Repeat /> Add recurring blocks</Button>
            )}
            <Button size="sm" onClick={() => setDialog('shift')}><MoveHorizontal /> Shift unfinished…</Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          label="Calendar view"
          value={view}
          onChange={(v) => set({ view: v })}
          options={[
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
            { value: 'agenda', label: 'Agenda' },
            { value: 'plan', label: 'Plan week' },
          ]}
        />
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" aria-label="Previous" onClick={() => step(-1)}><ChevronLeft /></Button>
          <Button size="sm" onClick={() => set({ date: null })}>Today</Button>
          <Button size="icon" variant="ghost" aria-label="Next" onClick={() => step(1)}><ChevronRight /></Button>
        </div>
        <h2 className="text-sm font-semibold" aria-live="polite">{title}</h2>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className={showBacklog ? 'grid grid-cols-[minmax(0,1fr)_13rem] gap-3 xl:grid-cols-[minmax(0,1fr)_15rem] xl:gap-4' : ''}>
          <div className="min-w-0">{calendar}</div>
          {showBacklog ? (
            <div><BacklogPanel draggable /></div>
          ) : view !== 'plan' && (
            <div className="mt-5"><BacklogPanel draggable={false} /></div>
          )}
        </div>
      </DndContext>

      {dialog === 'generate' && <GenerateDialog start={weekStart} end={addDays(weekStart, 6)} onClose={() => setDialog(null)} />}
      {dialog === 'shift' && <ShiftDialog initialFrom={today} onClose={() => setDialog(null)} />}
    </div>
  )
}
