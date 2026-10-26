import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthGate } from './auth/AuthGate'
import { AppShell } from './components/AppShell'
import { ConfirmHost, DemoBanner, Toaster } from './components/feedback'
import { Button } from './components/ui/button'
import { Spinner } from './components/ui/misc'
import { applyTheme, watchSystemTheme } from './lib/theme'
import { CurriculumPage } from './pages/CurriculumPage'
import { NotesPage } from './pages/NotesPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { PlannerPage } from './pages/PlannerPage'
import { ProgressPage } from './pages/ProgressPage'
import { ResourcesPage } from './pages/ResourcesPage'
import { SettingsPage } from './pages/SettingsPage'
import { TodayPage } from './pages/TodayPage'
import { settingsOf } from './state/selectors'
import { useStore } from './state/store'

function Workspace() {
  const phase = useStore((s) => s.phase)
  const loadError = useStore((s) => s.loadError)
  const init = useStore((s) => s.init)
  const repo = useStore((s) => s.repo)
  const settings = useStore((s) => s.data.settings[0])
  const theme = settings?.theme

  useEffect(() => {
    if (theme) applyTheme(theme)
  }, [theme])
  useEffect(() => watchSystemTheme(() => settingsOf(useStore.getState().data).theme), [])

  if (phase === 'idle' || phase === 'loading') {
    return <div className="flex h-full items-center justify-center"><Spinner label="Loading your plan…" /></div>
  }
  if (phase === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-medium">Couldn’t load your data.</p>
        <p className="text-sm text-muted">{loadError}</p>
        <Button variant="primary" onClick={() => repo && void init(repo)}>Try again</Button>
      </div>
    )
  }
  if (!settings?.onboarded) {
    return (
      <>
        <DemoBanner />
        <OnboardingPage />
        <Toaster />
        <ConfirmHost />
      </>
    )
  }
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<TodayPage />} />
        <Route path="/planner" element={<PlannerPage />} />
        <Route path="/curriculum" element={<CurriculumPage />} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <Workspace />
      </AuthGate>
    </BrowserRouter>
  )
}
