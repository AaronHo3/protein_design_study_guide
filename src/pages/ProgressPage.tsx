import { CircleCheck } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Markdown } from '../components/Markdown'
import { DayIcon } from '../components/status'
import { TrackBadge } from '../components/track'
import { Empty, PageHeader, Progress, Section } from '../components/ui/misc'
import { DAY_KIND_LABEL, type DayKind } from '../domain/completion'
import { activity, heatmap, trackRows, weeklyRows } from '../domain/progress'
import { formatDate, formatMinutes, formatShortDate } from '../lib/dates'
import { cn } from '../lib/cn'
import { todayFor, useMaps, useSettings } from '../state/selectors'
import { useStore } from '../state/store'

const HEAT: Record<DayKind, string> = {
  complete: 'bg-success',
  partial: 'bg-accent/60',
  planned: 'bg-surface-3',
  no_required: 'bg-surface-3',
  empty: 'bg-surface-2',
  rest: 'bg-transparent border border-line',
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2.5">
      <p className="text-[12px] text-muted">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[11.5px] text-faint">{hint}</p>}
    </div>
  )
}

export function ProgressPage() {
  const data = useStore((s) => s.data)
  const settings = useSettings()
  const maps = useMaps()
  const navigate = useNavigate()
  const today = todayFor(settings)
  const a = useMemo(() => activity(data, today, settings.study_days), [data, today, settings.study_days])
  const weeks = useMemo(() => weeklyRows(data, today, settings.study_days), [data, today, settings.study_days])
  const tracks = useMemo(() => trackRows(data, today), [data, today])
  const grid = useMemo(() => heatmap(data, today, settings.study_days), [data, today, settings.study_days])
  const checkpoints = data.checkpoints.filter((c) => !c.archived_at)
  const achieved = checkpoints.filter((c) => c.achieved_at).sort((x, y) => (y.achieved_at ?? '').localeCompare(x.achieved_at ?? ''))

  return (
    <div className="space-y-6">
      <PageHeader title="Progress" subtitle="Activity shows what you did. Understanding is only what you explicitly mark as achieved." />

      <section aria-labelledby="act-h" className="space-y-3">
        <h2 id="act-h" className="text-sm font-semibold">Activity</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Tasks completed" value={String(a.tasksDone)} />
          <Stat label="Sessions completed" value={String(a.sessionsDone)} />
          <Stat label="Fully completed days" value={String(a.completedDays)} hint="All required blocks done" />
          <Stat label="Planned time (to date)" value={formatMinutes(a.plannedMin)} hint="Excludes skipped" />
          <Stat label="Logged actual time" value={a.sessionsWithActual ? formatMinutes(a.actualMin) : '—'} hint={`${a.sessionsWithActual} session(s) logged`} />
          <Stat label="Checkpoints achieved" value={`${achieved.length}/${checkpoints.length}`} />
        </div>

        <Section title="Completion heatmap (last 16 weeks)">
          <div className="flex gap-3 overflow-x-auto">
            <div className="grid shrink-0 grid-rows-7 gap-1 text-[10.5px] text-faint" aria-hidden>
              {['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((d, i) => <span key={i} className="h-3.5 leading-3.5">{d}</span>)}
            </div>
            <div role="grid" aria-label="Daily completion, last 16 weeks" className="flex gap-1">
              {grid.map((week) => (
                <div role="row" key={week[0].date} className="grid grid-rows-7 gap-1">
                  {week.map((c) => (
                    <button
                      key={c.date}
                      type="button"
                      role="gridcell"
                      onClick={() => navigate(`/?date=${c.date}`)}
                      aria-label={`${formatDate(c.date, { weekday: 'long', month: 'long', day: 'numeric' })}: ${DAY_KIND_LABEL[c.kind]}${c.future ? ' (upcoming)' : ''}`}
                      title={`${formatShortDate(c.date)} · ${DAY_KIND_LABEL[c.kind]}`}
                      className={cn('size-3.5 rounded-[3px]', HEAT[c.kind], c.future && 'opacity-40', c.date === today && 'ring-2 ring-accent ring-offset-1 ring-offset-surface')}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
            {(['complete', 'partial', 'planned', 'empty', 'rest'] as DayKind[]).map((k) => (
              <li key={k} className="inline-flex items-center gap-1.5">
                <span className={cn('size-3 rounded-[3px]', HEAT[k])} aria-hidden />
                <DayIcon kind={k} /> {DAY_KIND_LABEL[k]}
              </li>
            ))}
          </ul>
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Weekly completion">
            <table className="w-full text-[13px]">
              <caption className="sr-only">Required blocks completed per week</caption>
              <thead className="text-left text-[12px] text-muted">
                <tr><th className="pb-1 font-medium">Week of</th><th className="pb-1 font-medium">Required blocks</th><th className="pb-1 font-medium">Complete days</th><th className="pb-1 font-medium">Planned</th></tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.start} className="border-t border-line">
                    <td className="py-1.5 whitespace-nowrap">{formatShortDate(w.start)}</td>
                    <td className="py-1.5">
                      {w.requiredBlocks ? (
                        <span className="flex items-center gap-2">
                          <span className="w-12 tabular-nums">{w.requiredDone}/{w.requiredBlocks}</span>
                          <span className="w-20"><Progress value={w.requiredDone} max={w.requiredBlocks} label={`Week of ${w.start}`} /></span>
                        </span>
                      ) : <span className="text-faint">—</span>}
                    </td>
                    <td className="py-1.5 tabular-nums">{w.studyDaysWithWork ? `${w.completedDays}/${w.studyDaysWithWork}` : '—'}</td>
                    <td className="py-1.5 tabular-nums">{w.plannedMin ? formatMinutes(w.plannedMin) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="By track">
            {tracks.length === 0 ? (
              <p className="text-[13px] text-muted">No sessions yet.</p>
            ) : (
              <table className="w-full text-[13px]">
                <caption className="sr-only">Activity per track</caption>
                <thead className="text-left text-[12px] text-muted">
                  <tr><th className="pb-1 font-medium">Track</th><th className="pb-1 font-medium">Sessions done</th><th className="pb-1 font-medium">Planned</th><th className="pb-1 font-medium">Logged</th></tr>
                </thead>
                <tbody>
                  {tracks.map((r) => (
                    <tr key={r.trackId ?? 'none'} className="border-t border-line">
                      <td className="py-1.5">{r.trackId ? <TrackBadge track={maps.tracks.get(r.trackId)} /> : <span className="text-muted">No track</span>}</td>
                      <td className="py-1.5 tabular-nums">{r.sessionsDone}</td>
                      <td className="py-1.5 tabular-nums">{r.plannedMin ? formatMinutes(r.plannedMin) : '—'}</td>
                      <td className="py-1.5 tabular-nums">{r.actualMin ? formatMinutes(r.actualMin) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-2 text-[12px] text-faint">Time is shown for planning only — it isn’t a measure of understanding.</p>
          </Section>
        </div>
      </section>

      <section aria-labelledby="und-h" className="space-y-3">
        <h2 id="und-h" className="text-sm font-semibold">Understanding</h2>
        {achieved.length === 0 ? (
          <Empty title="No checkpoints marked achieved yet">
            When you can do what a readiness checkpoint describes, mark it achieved in Curriculum → Stages & checkpoints and add evidence.
          </Empty>
        ) : (
          <ul className="space-y-2">
            {achieved.map((c) => (
              <li key={c.id} className="rounded-lg border border-line bg-surface px-4 py-3">
                <p className="flex items-start gap-2 text-sm font-medium">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {c.title}
                </p>
                <p className="ml-6 text-[12px] text-faint">
                  {c.stage_id && maps.stages.get(c.stage_id)?.title} · achieved {new Date(c.achieved_at!).toLocaleDateString()}
                </p>
                {c.evidence && <div className="mt-2 ml-6"><Markdown source={c.evidence} /></div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
