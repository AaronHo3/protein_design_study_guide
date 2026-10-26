import { ChevronLeft, ChevronRight, Info, Plus, SquarePlus, StepForward } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BlockCard } from '../components/BlockCard'
import { NoteEditor } from '../components/notes/NoteEditor'
import { NewSessionDialog } from '../components/session/dialogs'
import { useOpenSession } from '../components/session/useOpenSession'
import { DayIcon } from '../components/status'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/field'
import { Empty, Progress } from '../components/ui/misc'
import { insert } from '../domain/changes'
import { blockState, blocksOn, DAY_KIND_LABEL, daySummary } from '../domain/completion'
import { newNote } from '../domain/factories'
import { createBlock } from '../domain/scheduling'
import { addDays, formatLongDate, formatMinutes, formatShortDate, isISODate } from '../lib/dates'
import { act } from '../state/actions'
import { isStudyDay, todayFor, useSettings } from '../state/selectors'
import { useStore } from '../state/store'

export function TodayPage() {
  const data = useStore((s) => s.data)
  const ctx = useStore((s) => s.ctx)
  const settings = useSettings()
  const today = todayFor(settings)
  const [params, setParams] = useSearchParams()
  const date = isISODate(params.get('date')) ? (params.get('date') as string) : today
  const { open } = useOpenSession()
  const [creating, setCreating] = useState(false)

  const go = (d: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (d === today) next.delete('date')
      else next.set('date', d)
      return next
    })

  const blocks = blocksOn(data, date)
  const summary = daySummary(data, date, isStudyDay(settings, date))
  const dayNotes = data.notes.filter((n) => n.date === date && !n.session_id)

  const next = useMemo(() => {
    const upcoming = data.blocks
      .filter((b) => b.session_id && b.date >= today)
      .filter((b) => {
        const s = blockState(b, data.sessions, data.tasks)
        return s === 'planned' || s === 'in_progress'
      })
      .sort((a, b) => (a.date === b.date ? a.position - b.position : a.date < b.date ? -1 : 1))
    return upcoming[0]
  }, [data, today])

  const addDayNote = () => void act([insert('notes', [newNote(ctx, { date })])])
  const addEmptyBlock = () => void act(createBlock(data, date, ctx, { duration_min: 60 }), { label: 'Empty block added' })

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-medium text-accent">{date === today ? 'Today' : date < today ? 'Past day' : 'Upcoming'}</p>
            <h1 className="text-xl font-semibold tracking-tight">{formatLongDate(date)}</h1>
          </div>
          <div className="flex w-full items-center gap-1 sm:w-auto">
            <Button size="icon" variant="ghost" aria-label="Previous day" onClick={() => go(addDays(date, -1))}><ChevronLeft /></Button>
            {date !== today && <Button size="sm" onClick={() => go(today)}>Today</Button>}
            <Button size="icon" variant="ghost" aria-label="Next day" onClick={() => go(addDays(date, 1))}><ChevronRight /></Button>
            <Input aria-label="Go to date" type="date" value={date} onChange={(e) => isISODate(e.target.value) && go(e.target.value)} className="w-40" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface px-4 py-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium">
            <DayIcon kind={summary.kind} className="size-4" /> {DAY_KIND_LABEL[summary.kind]}
          </span>
          {summary.requiredTotal > 0 && (
            <div className="flex min-w-40 flex-1 items-center gap-3">
              <Progress value={summary.requiredDone} max={summary.requiredTotal} label="Required blocks complete" />
              <span className="shrink-0 text-[13px] text-muted">{summary.requiredDone} of {summary.requiredTotal} required</span>
            </div>
          )}
          <span className="text-[13px] text-muted">
            {formatMinutes(summary.plannedMin)} planned of {formatMinutes(settings.daily_capacity_min)}
          </span>
          <details className="w-full text-[12.5px] text-muted">
            <summary className="inline-flex cursor-pointer items-center gap-1"><Info className="size-3.5" aria-hidden /> What counts as a completed day?</summary>
            <p className="mt-1">
              A day is complete when every <strong>required</strong> block is complete. Optional blocks never hold a day back,
              skipped work never counts as done, and a day with no required blocks isn’t counted as a completed study day.
            </p>
          </details>
        </div>
      </header>

      {blocks.length === 0 ? (
        <Empty
          title={summary.kind === 'rest' ? 'Rest day — nothing planned' : 'Nothing planned for this day'}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => setCreating(true)}><Plus /> Add session</Button>
              <Button onClick={addEmptyBlock}><SquarePlus /> Reserve an empty block</Button>
            </div>
          }
        >
          {next && next.date !== date ? (
            <button type="button" className="text-accent hover:underline" onClick={() => { go(next.date); open(next.session_id) }}>
              Next planned session: {formatShortDate(next.date)}
            </button>
          ) : 'Plan sessions from the backlog in the Planner, or add one here.'}
        </Empty>
      ) : (
        <div className="space-y-3">
          {blocks.map((b, i) => <BlockCard key={b.id} block={b} index={i} count={blocks.length} />)}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => setCreating(true)}><Plus /> Add session</Button>
            <Button size="sm" variant="ghost" onClick={addEmptyBlock}><SquarePlus /> Add empty block</Button>
            {next && (next.date !== date || summary.kind === 'complete') && (
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { go(next.date); open(next.session_id) }}>
                <StepForward /> Next planned session ({formatShortDate(next.date)})
              </Button>
            )}
          </div>
        </div>
      )}

      <section aria-labelledby="daynote-h" className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 id="daynote-h" className="text-[13px] font-semibold">Notes for this day</h2>
          <Button size="sm" variant="ghost" onClick={addDayNote}><Plus /> Day note</Button>
        </div>
        {dayNotes.length === 0 ? (
          <p className="text-[13px] text-faint">Session notes live inside each session. Use a day note for anything else.</p>
        ) : (
          dayNotes.map((n) => <NoteEditor key={n.id} noteId={n.id} />)
        )}
      </section>

      {creating && <NewSessionDialog preset={{ date }} onClose={() => setCreating(false)} />}
    </div>
  )
}
