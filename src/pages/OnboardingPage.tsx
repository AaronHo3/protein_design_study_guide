import { useState } from 'react'
import { Button } from '../components/ui/button'
import { Field, Input } from '../components/ui/field'
import { cn } from '../lib/cn'
import { compact, insert, update, type Change } from '../domain/changes'
import { newSettings } from '../domain/factories'
import { ALL_PARTS, TEMPLATE_NAME, buildTemplate, needsCalendar, type TemplateOptions } from '../domain/template'
import type { Weekday } from '../domain/types'
import { WEEKDAY_LABELS, detectTimezone, isISODate, isValidTimezone } from '../lib/dates'
import { useStore } from '../state/store'
import { describeError } from '../data/repository'
import { getOutbox } from '../state/store'

type Start = 'blank' | 'template' | 'parts'

const PARTS: { key: keyof TemplateOptions; label: string; detail: string }[] = [
  { key: 'tracks', label: 'Study tracks', detail: 'Biology, Computational foundations, AI/application' },
  { key: 'goal', label: 'Example goal', detail: '“Evaluate AI-generated protein binders”' },
  { key: 'roadmap', label: 'Roadmap', detail: '6 optional stages with topics and readiness checkpoints' },
  { key: 'structure', label: 'Session structure template', detail: 'Recall 10 · Learn 40 · Break 10 · Practice 50 · Close 10 (optional checklist)' },
  { key: 'schedule', label: 'Recurring schedule', detail: 'Three 2-hour blocks on your study days (first week generated)' },
  { key: 'sampleWeek', label: 'Sample first week', detail: '15 editable starter sessions on your first five study days' },
]

const NONE: TemplateOptions = { tracks: false, goal: false, roadmap: false, structure: false, schedule: false, sampleWeek: false }

export function OnboardingPage() {
  const ctx = useStore((s) => s.ctx)
  const data = useStore((s) => s.data)
  const commit = useStore((s) => s.commit)
  const mode = useStore((s) => s.repo?.mode)
  const [start, setStart] = useState<Start>('blank')
  const [parts, setParts] = useState<TemplateOptions>({ ...NONE, tracks: true, roadmap: true })
  const [days, setDays] = useState<Weekday[]>([1, 2, 3, 4, 5])
  const [capacity, setCapacity] = useState('6')
  const [timezone, setTimezone] = useState(detectTimezone())
  const [startDate, setStartDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resumeId, setResumeId] = useState<string | null>(null)

  const chosen: TemplateOptions = start === 'blank' ? NONE : start === 'template' ? ALL_PARTS : parts
  const calendar = needsCalendar(chosen)

  const finish = async () => {
    setError(null)
    if (!isValidTimezone(timezone)) return setError('Enter a valid timezone, e.g. America/New_York.')
    const hours = Number(capacity)
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) return setError('Daily capacity must be between 0 and 24 hours.')
    if (calendar && days.length === 0) return setError('Choose at least one study day for the calendar parts.')
    if (calendar && !isISODate(startDate)) return setError('Choose a start date — calendar entries begin there.')
    if (startDate && !isISODate(startDate)) return setError('That start date isn’t valid.')

    const fields = {
      study_days: [...days].sort(), daily_capacity_min: Math.round(hours * 60), timezone,
      start_date: startDate || null, onboarded: true,
    }
    // Phase 1: save the workspace content (settings row not yet marked onboarded).
    // Phase 2: mark onboarded only after the server confirmed phase 1, so the app
    // never appears "ready" while setup writes are still in flight.
    const existing = data.settings[0]
    const settingsRow = existing ?? newSettings(ctx, { ...fields, onboarded: false })
    const phase1: Change[] = existing
      ? compact([update('settings', existing, { ...fields, onboarded: false })])
      : [insert('settings', [settingsRow])]
    if (start !== 'blank') {
      phase1.push(...buildTemplate(data, chosen, ctx, calendar ? { startDate, studyDays: fields.study_days } : undefined))
    }
    commit(phase1)
    setResumeId(settingsRow.id)
    await complete(settingsRow.id)
  }

  /** Waits for setup writes, then marks onboarding done. Safe to call again after a failure. */
  const complete = async (settingsId: string) => {
    setBusy(true)
    setError(null)
    try {
      await getOutbox()?.whenIdle()
      const saved = useStore.getState().data.settings.find((s) => s.id === settingsId)
      if (saved) commit(compact([update('settings', saved, { onboarded: true })]))
      await getOutbox()?.whenIdle()
    } catch (e) {
      setError(`Setup isn’t saved yet: ${describeError(e)} Your choices are kept — press Retry when you’re back online.`)
    } finally {
      setBusy(false)
    }
  }

  const retry = () => {
    if (!resumeId) return
    getOutbox()?.retry()
    void complete(resumeId)
  }

  const toggleDay = (d: Weekday) => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Set up your study planner</h1>
      <p className="mt-1 text-sm text-muted">
        You design the plan; the planner makes each day easy to follow. Everything here can be changed later.
        {mode === 'demo' && ' (Demo mode: stored in this browser only.)'}
      </p>

      <section className="mt-8 space-y-3" aria-labelledby="start-h">
        <h2 id="start-h" className="text-sm font-semibold">1. How do you want to start?</h2>
        <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
          {([
            ['blank', 'Blank workspace', 'Create your own tracks, topics and sessions.'],
            ['template', TEMPLATE_NAME, 'Tracks, roadmap, schedule and a sample week.'],
            ['parts', 'Pick template parts', 'Import only what you want.'],
          ] as const).map(([value, title, body]) => (
            <label
              key={value}
              className={cn(
                'cursor-pointer rounded-lg border p-3 transition-colors hover:border-line-strong has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)]',
                start === value ? 'border-accent bg-accent-soft' : 'border-line bg-surface',
              )}
            >
              <input type="radio" name="start" className="sr-only" checked={start === value} onChange={() => setStart(value)} />
              <span className="block text-sm font-medium">{title}</span>
              <span className="mt-0.5 block text-[12.5px] text-muted">{body}</span>
            </label>
          ))}
        </div>
        {start === 'parts' && (
          <fieldset className="space-y-2 rounded-lg border border-line bg-surface p-4">
            <legend className="sr-only">Template parts</legend>
            {PARTS.map((p) => (
              <label key={p.key} className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-[var(--accent)]"
                  checked={parts[p.key]}
                  onChange={(e) => setParts({ ...parts, [p.key]: e.target.checked })}
                />
                <span>
                  <span className="text-sm font-medium">{p.label}</span>
                  <span className="block text-[12.5px] text-muted">{p.detail}</span>
                </span>
              </label>
            ))}
            {(parts.schedule || parts.sampleWeek) && !parts.tracks && (
              <p className="text-[12.5px] text-faint">The schedule and sample week use the three study tracks, so those tracks will be added too.</p>
            )}
            <p className="text-[12.5px] text-faint">Resource sections are left empty — add your own references.</p>
          </fieldset>
        )}
      </section>

      <section className="mt-8 space-y-4" aria-labelledby="sched-h">
        <h2 id="sched-h" className="text-sm font-semibold">2. Your study schedule</h2>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-muted">Study days</legend>
          <div className="flex flex-wrap gap-1.5">
            {([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={days.includes(d)}
                onClick={() => toggleDay(d)}
                className={cn(
                  'h-9 min-w-12 rounded-md border px-2 text-[13px] font-medium transition-colors',
                  days.includes(d) ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-muted hover:text-fg',
                )}
              >
                {WEEKDAY_LABELS[d]}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Daily capacity (hours)" hint="Used to warn when a day is overbooked.">
            {(id) => <Input id={id} type="number" min={0} max={24} step={0.5} value={capacity} onChange={(e) => setCapacity(e.target.value)} />}
          </Field>
          <Field label="Timezone" hint="Decides which date is “today”.">
            {(id) => <Input id={id} value={timezone} onChange={(e) => setTimezone(e.target.value)} />}
          </Field>
          <Field label={calendar ? 'Start date (required)' : 'Start date (optional)'} hint={calendar ? 'Only your first study week is created.' : undefined}>
            {(id) => <Input id={id} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />}
          </Field>
        </div>
        {!calendar && (
          <p className="text-[12.5px] text-faint">Nothing will be added to your calendar yet — you’ll schedule sessions yourself.</p>
        )}
      </section>

      {error && <p role="alert" className="mt-6 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
      <div className="mt-8 flex justify-end">
        {resumeId ? (
          <Button variant="primary" onClick={retry} disabled={busy}>{busy ? 'Saving your setup…' : 'Retry saving setup'}</Button>
        ) : (
          <Button variant="primary" onClick={() => void finish()} disabled={busy}>
            {busy ? 'Setting up…' : 'Start planning'}
          </Button>
        )}
      </div>
    </main>
  )
}
