import { LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { signOut } from '../auth/AuthGate'
import { TracksManager } from '../components/curriculum/TracksManager'
import { DataPanel } from '../components/settings/DataPanel'
import { RecurringPanel } from '../components/settings/RecurringPanel'
import { Button } from '../components/ui/button'
import { Field, Input } from '../components/ui/field'
import { PageHeader, Section, Segmented } from '../components/ui/misc'
import { clearDemoData, isFailureSimulated, setFailureSimulated } from '../data/localRepo'
import { compact, update } from '../domain/changes'
import type { Settings, ThemePref, Weekday } from '../domain/types'
import { WEEKDAY_LABELS, isISODate, isValidTimezone } from '../lib/dates'
import { cn } from '../lib/cn'
import { getSupabase } from '../lib/supabase'
import { act } from '../state/actions'
import { confirm } from '../state/confirm'
import { draftKey } from '../state/noteSaver'
import { useSettings } from '../state/selectors'
import { useStore } from '../state/store'
import { toastError } from '../state/toasts'

function zones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
  } catch {
    return []
  }
}

function ScheduleSection({ settings }: { settings: Settings }) {
  const [capacity, setCapacity] = useState(String(settings.daily_capacity_min / 60))
  const [timezone, setTimezone] = useState(settings.timezone)
  useEffect(() => setTimezone(settings.timezone), [settings.timezone])
  const patch = (p: Partial<Settings>) => void act(compact([update('settings', settings, p)]))
  const toggleDay = (d: Weekday) => {
    const next = settings.study_days.includes(d) ? settings.study_days.filter((x) => x !== d) : [...settings.study_days, d].sort()
    patch({ study_days: next as Weekday[] })
  }
  const saveTz = () => {
    if (timezone === settings.timezone) return
    if (!isValidTimezone(timezone)) {
      toastError('That isn’t a valid timezone name.')
      return setTimezone(settings.timezone)
    }
    patch({ timezone })
  }
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-muted">Study days</legend>
        <div className="flex flex-wrap gap-1.5">
          {([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={settings.study_days.includes(d)}
              onClick={() => toggleDay(d)}
              className={cn('h-9 min-w-12 rounded-md border px-2 text-[13px] font-medium', settings.study_days.includes(d) ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-fg')}
            >
              {WEEKDAY_LABELS[d]}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[12px] text-faint">Other days show as rest days. Existing plans are never moved when you change this.</p>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Daily capacity (hours)">
          {(id) => (
            <Input
              id={id} type="number" min={0} max={24} step={0.5} value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              onBlur={() => {
                const h = Number(capacity)
                if (Number.isFinite(h) && h >= 0 && h <= 24) patch({ daily_capacity_min: Math.round(h * 60) })
                else setCapacity(String(settings.daily_capacity_min / 60))
              }}
            />
          )}
        </Field>
        <Field label="Timezone" hint="Decides which date is “today”. Stored study dates never shift.">
          {(id) => (
            <>
              <Input id={id} list="tz-list" value={timezone} onChange={(e) => setTimezone(e.target.value)} onBlur={saveTz} />
              <datalist id="tz-list">{zones().map((z) => <option key={z} value={z} />)}</datalist>
            </>
          )}
        </Field>
        <Field label="Start date">
          {(id) => (
            <Input id={id} type="date" value={settings.start_date ?? ''} onChange={(e) => patch({ start_date: isISODate(e.target.value) ? e.target.value : null })} />
          )}
        </Field>
      </div>
    </div>
  )
}

function AccountSection() {
  const mode = useStore((s) => s.repo?.mode)
  const userId = useStore((s) => s.repo?.userId)
  const sync = useStore((s) => s.sync)
  const data = useStore((s) => s.data)
  const [email, setEmail] = useState<string | null>(null)
  const [simulate, setSimulate] = useState(isFailureSimulated())

  useEffect(() => {
    void getSupabase()?.auth.getUser().then(({ data: d }) => setEmail(d.user?.email ?? null))
  }, [])

  const doSignOut = async () => {
    const drafts = userId ? data.notes.filter((n) => localStorage.getItem(draftKey(userId, n.id))).length : 0
    if (sync.pending > 0 || sync.failed || drafts > 0) {
      const ok = await confirm({
        title: 'You have unsaved changes',
        body: `${sync.pending} change(s) and ${drafts} note draft(s) haven’t reached the server. Signing out will discard them from this browser.`,
        confirmLabel: 'Sign out anyway',
        destructive: true,
      })
      if (!ok) return
    }
    if (userId) data.notes.forEach((n) => localStorage.removeItem(draftKey(userId, n.id)))
    await signOut()
  }

  if (mode === 'demo') {
    return (
      <div className="space-y-3 text-[13px]">
        <p className="text-muted">
          Demo mode has no account. To enable sign-in and cloud sync, add your Supabase URL and publishable key to <code className="font-mono">.env.local</code> (see README) and restart.
        </p>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--accent)]"
            checked={simulate}
            onChange={(e) => {
              setFailureSimulated(e.target.checked)
              setSimulate(e.target.checked)
            }}
          />
          <span>
            <span className="font-medium">Simulate save failures</span>
            <span className="block text-faint">For testing: every save fails, so you can see error states, retry, and local note drafts.</span>
          </span>
        </label>
        <Button
          variant="danger"
          size="sm"
          onClick={async () => {
            const ok = await confirm({ title: 'Reset demo data?', body: 'All demo data in this browser will be deleted. Export a backup first if you want to keep it.', confirmLabel: 'Reset', destructive: true, typeToConfirm: 'RESET' })
            if (ok) {
              clearDemoData()
              window.location.reload()
            }
          }}
        >
          Reset demo data
        </Button>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-3 text-[13px]">
      <span>Signed in as <strong>{email ?? '…'}</strong></span>
      <Button size="sm" className="ml-auto" onClick={() => void doSignOut()}><LogOut /> Sign out</Button>
    </div>
  )
}

export function SettingsPage() {
  const settings = useSettings()
  const mode = useStore((s) => s.repo?.mode)
  const setTheme = (theme: ThemePref) => void act(compact([update('settings', settings, { theme })]))
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" />
      <Section title="Study schedule"><ScheduleSection settings={settings} /></Section>
      <Section title="Tracks and colors"><TracksManager /></Section>
      <Section title="Recurring blocks (optional)"><RecurringPanel /></Section>
      <Section title="Appearance">
        <Segmented
          label="Theme"
          value={settings.theme}
          onChange={setTheme}
          options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]}
        />
      </Section>
      <Section title="Account"><AccountSection /></Section>
      <Section title="Backups and data">
        <div className="space-y-4">
          <div className="space-y-1 text-[13px] text-muted">
            {mode === 'cloud' ? (
              <p>
                Your data is stored in your Supabase database, private to your account (row-level security), and loads on any device you sign in from.
                Cloud storage keeps your data available, but it isn’t a backup: export a JSON backup regularly and keep it somewhere safe.
              </p>
            ) : (
              <p>Demo data lives only in this browser’s local storage. Clearing site data deletes it. Export a backup to keep it.</p>
            )}
            <p>Unsaved note text is also kept in this browser until the server confirms it, so a failed save never loses your writing.</p>
          </div>
          <DataPanel />
        </div>
      </Section>
    </div>
  )
}
