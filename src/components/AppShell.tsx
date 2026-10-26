import { BookMarked, CalendarDays, ChartNoAxesColumn, Ellipsis, Map, NotebookPen, Settings, Sun } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Menu } from './ui/menu'
import { cn } from '../lib/cn'
import { useStore } from '../state/store'
import { ConfirmHost, DemoBanner, SyncIndicator, Toaster } from './feedback'
import { SessionDetail } from './session/SessionDetail'
import { useOpenSession } from './session/useOpenSession'

const NAV = [
  { to: '/', label: 'Today', icon: Sun, end: true },
  { to: '/planner', label: 'Planner', icon: CalendarDays },
  { to: '/curriculum', label: 'Curriculum', icon: Map },
  { to: '/resources', label: 'Resources', icon: BookMarked },
  { to: '/notes', label: 'Notes', icon: NotebookPen },
  { to: '/progress', label: 'Progress', icon: ChartNoAxesColumn },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const MOBILE_NAV = NAV.filter((n) => ['/', '/planner', '/curriculum', '/notes'].includes(n.to))
const MOBILE_MORE = NAV.filter((n) => ['/resources', '/progress', '/settings'].includes(n.to))

function MobileMore() {
  const navigate = useNavigate()
  const location = useLocation()
  const active = MOBILE_MORE.some((n) => location.pathname.startsWith(n.to))
  return (
    <Menu
      label="More sections"
      align="end"
      trigger={
        <button type="button" className={cn('flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]', active ? 'text-accent' : 'text-muted')}>
          <Ellipsis className="size-5" aria-hidden />
          More
        </button>
      }
      items={MOBILE_MORE.map(({ to, label, icon: Icon }) => ({ label, icon: <Icon />, onSelect: () => navigate(to) }))}
    />
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { openId, open } = useOpenSession()
  const location = useLocation()
  const reload = useStore((s) => s.reload)

  // Pick up changes made on other devices when the tab regains focus.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [reload])

  // Warn before leaving while changes are still on their way to storage.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      const { pending, failed } = useStore.getState().sync
      if (pending > 0 || failed) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  useEffect(() => {
    if (!openId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) open(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, open])

  return (
    <div className="flex h-full flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[70] focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <DemoBanner />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-52 shrink-0 flex-col border-r border-line bg-surface lg:flex">
          <div className="px-4 pt-4 pb-3">
            <p className="text-[13px] font-semibold tracking-tight">Study Planner</p>
          </div>
          <nav aria-label="Main" className="flex flex-col gap-0.5 px-2">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors',
                    isActive ? 'bg-surface-2 font-medium text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
                  )
                }
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto border-t border-line p-3">
            <SyncIndicator compact />
          </div>
        </aside>

        <main id="main" className="min-w-0 flex-1 overflow-y-auto" key={location.pathname}>
          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-bg/95 px-4 py-2 backdrop-blur lg:hidden">
            <span className="text-[13px] font-semibold">Study Planner</span>
            <SyncIndicator compact />
          </div>
          <div className="hidden px-6 pt-3 lg:block">
            <SyncFailureBar />
          </div>
          <div className="mx-auto max-w-[88rem] px-4 pt-4 pb-24 lg:px-8 lg:pt-6 lg:pb-10">{children}</div>
        </main>

        {openId && (
          <aside
            aria-label="Session details"
            className="fixed inset-0 z-40 flex flex-col bg-surface animate-fade-in lg:static lg:z-auto lg:w-[min(560px,42vw)] lg:shrink-0 lg:border-l lg:border-line"
          >
            <SessionDetail sessionId={openId} onClose={() => open(null)} />
          </aside>
        )}
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {MOBILE_NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn('flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]', isActive ? 'text-accent' : 'text-muted')
            }
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </NavLink>
        ))}
        <MobileMore />
      </nav>
      <Toaster />
      <ConfirmHost />
    </div>
  )
}

/** Only rendered (desktop) when saving has failed, so the failure is impossible to miss. */
function SyncFailureBar() {
  const failed = useStore((s) => s.sync.failed)
  if (!failed) return null
  return <SyncIndicator />
}
