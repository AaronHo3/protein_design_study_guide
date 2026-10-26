import { CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { blockState } from '../../domain/completion'
import { backlog, scheduleSession, unscheduleSession } from '../../domain/scheduling'
import { tasksOf } from '../../domain/sessions'
import type { Block, ISODate } from '../../domain/types'
import { addDays, daysInRange, formatShortDate } from '../../lib/dates'
import { act } from '../../state/actions'
import { blockTitle, isStudyDay, useMaps, useSettings } from '../../state/selectors'
import { useStore } from '../../state/store'
import { MoveDialog } from '../session/dialogs'
import { useOpenSession } from '../session/useOpenSession'
import { WorkIcon } from '../status'
import { TrackBadge } from '../track'
import { Button } from '../ui/button'
import { Select } from '../ui/field'
import { Badge, Section } from '../ui/misc'

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Section title={<span className="flex items-center gap-2"><span className="inline-flex size-5 items-center justify-center rounded-full bg-accent-soft text-[11px] text-accent">{n}</span>{title}</span>}>
      {children}
    </Section>
  )
}

export function PlanWeek({ weekStart }: { weekStart: ISODate }) {
  const data = useStore((s) => s.data)
  const ctx = useStore((s) => s.ctx)
  const settings = useSettings()
  const maps = useMaps()
  const { open } = useOpenSession()
  const [moving, setMoving] = useState<Block | null>(null)
  const week = daysInRange(weekStart, addDays(weekStart, 6))
  const studyDates = week.filter((d) => isStudyDay(settings, d))
  const [targets, setTargets] = useState<Record<string, string>>({})

  const lastWeek = data.blocks.filter((b) => b.date >= addDays(weekStart, -7) && b.date < weekStart)
  const states = lastWeek.map((b) => ({ b, s: blockState(b, data.sessions, data.tasks) }))
  const done = states.filter((x) => x.s === 'complete').length
  const skipped = states.filter((x) => x.s === 'skipped').length
  const unfinished = states.filter((x) => x.s === 'planned' || x.s === 'in_progress')

  const thisWeek = data.blocks
    .filter((b) => b.date >= weekStart && b.date <= addDays(weekStart, 6))
    .sort((a, b) => (a.date === b.date ? a.position - b.position : a.date < b.date ? -1 : 1))

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">A lightweight routine for planning the week of {formatShortDate(weekStart)}. Use any step, in any order.</p>

      <Step n={1} title="Review last week">
        <p className="text-[13px]">
          {lastWeek.length === 0
            ? 'Nothing was scheduled last week.'
            : `${done} of ${lastWeek.length} blocks completed${skipped ? `, ${skipped} skipped` : ''}, ${unfinished.length} unfinished.`}
        </p>
        {unfinished.length > 0 && (
          <ul className="mt-2 space-y-1">
            {unfinished.map(({ b, s }) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                <WorkIcon state={s} />
                <span className="min-w-0 flex-1 truncate">{blockTitle(b, maps)} <span className="text-faint">· {formatShortDate(b.date)}</span></span>
                <Button size="sm" variant="ghost" onClick={() => setMoving(b)}>Move…</Button>
                {b.session_id && (
                  <Button size="sm" variant="ghost" onClick={() => void act(unscheduleSession(useStore.getState().data, b.session_id!), { label: 'Returned to backlog' })}>To backlog</Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[12px] text-faint">Unfinished work is never moved automatically — you decide what happens to it.</p>
      </Step>

      <Step n={2} title="Choose sessions from the backlog and assign dates">
        {backlog(data).length === 0 ? (
          <p className="text-[13px] text-muted">The backlog is empty.</p>
        ) : (
          <ul className="space-y-1.5">
            {backlog(data).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => open(s.id)}>{s.title}</button>
                <TrackBadge track={maps.tracks.get(s.track_id ?? '')} />
                <Select
                  aria-label={`Day for ${s.title}`}
                  value={targets[s.id] ?? ''}
                  onChange={(e) => setTargets({ ...targets, [s.id]: e.target.value })}
                  className="h-8 w-36 text-[13px]"
                >
                  <option value="">Pick a day…</option>
                  {(studyDates.length ? studyDates : week).map((d) => <option key={d} value={d}>{formatShortDate(d)}</option>)}
                </Select>
                <Button
                  size="sm"
                  disabled={!targets[s.id]}
                  onClick={() => void act(scheduleSession(useStore.getState().data, s.id, targets[s.id], ctx), { label: `Scheduled for ${formatShortDate(targets[s.id])}` })}
                >
                  Schedule
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Step>

      <Step n={3} title="Check durations, resources and next actions">
        {thisWeek.length === 0 ? (
          <p className="text-[13px] text-muted">Nothing scheduled this week yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {thisWeek.map((b) => {
              const session = b.session_id ? maps.sessions.get(b.session_id) : undefined
              const tasks = session ? tasksOf(data, session.id) : []
              const flags = session
                ? [
                    !tasks.some((t) => !t.done) && blockState(b, data.sessions, data.tasks) !== 'complete' ? 'No open task (next action)' : null,
                    !data.session_resources.some((l) => l.session_id === session.id) ? 'No resources' : null,
                    !session.output ? 'No output' : null,
                  ].filter(Boolean)
                : ['Empty block — choose content']
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="w-24 shrink-0 text-faint">{formatShortDate(b.date)}</span>
                  <span className="min-w-0 flex-1 truncate">{blockTitle(b, maps)}</span>
                  {flags.length === 0 ? (
                    <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="size-3.5" /> Ready</span>
                  ) : (
                    flags.map((f) => <Badge key={f} tone="warn">{f}</Badge>)
                  )}
                  {session ? (
                    <Button size="sm" variant="ghost" onClick={() => open(session.id)}>Open</Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setMoving(b)}>Edit</Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Step>

      {moving && <MoveDialog block={moving} session={moving.session_id ? maps.sessions.get(moving.session_id) : undefined} onClose={() => setMoving(null)} />}
    </div>
  )
}
