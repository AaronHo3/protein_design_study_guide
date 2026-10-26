// Decides which data source the app uses:
// - no Supabase config → local demo mode (clearly labelled), no auth
// - Supabase config → email/password auth; data loads only for the signed-in user
import type { Session as AuthSession } from '@supabase/supabase-js'
import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Spinner } from '../components/ui/misc'
import { LocalRepo } from '../data/localRepo'
import { SupabaseRepo } from '../data/supabaseRepo'
import { isDemoMode } from '../lib/config'
import { getSupabase } from '../lib/supabase'
import { useStore } from '../state/store'
import { toast } from '../state/toasts'
import { AuthPage, ResetPasswordPage } from './AuthPage'

export function AuthGate({ children }: { children: ReactNode }) {
  return isDemoMode ? <DemoGate>{children}</DemoGate> : <CloudGate>{children}</CloudGate>
}

function DemoGate({ children }: { children: ReactNode }) {
  const init = useStore((s) => s.init)
  const repo = useStore((s) => s.repo)
  useEffect(() => {
    if (!repo) void init(new LocalRepo())
  }, [init, repo])
  return <>{children}</>
}

function CloudGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined)
  const [recovering, setRecovering] = useState(false)
  const init = useStore((s) => s.init)
  const reset = useStore((s) => s.reset)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(next)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return
    if (userId) {
      const current = useStore.getState().repo
      if (current?.userId !== userId) void init(new SupabaseRepo(supabase, userId))
    } else if (session === null) {
      reset()
    }
  }, [userId, session, init, reset])

  if (session === undefined) {
    return <div className="flex h-full items-center justify-center"><Spinner label="Checking your session…" /></div>
  }
  if (recovering || (location.pathname === '/reset-password' && session)) {
    return (
      <ResetPasswordPage
        onDone={() => {
          setRecovering(false)
          toast('Password updated.')
          navigate('/', { replace: true })
        }}
      />
    )
  }
  if (!session) return <AuthPage />
  return <>{children}</>
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase()
  useStore.getState().reset()
  await supabase?.auth.signOut()
}
