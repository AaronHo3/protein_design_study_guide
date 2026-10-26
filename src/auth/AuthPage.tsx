import { useState, type FormEvent } from 'react'
import { Button } from '../components/ui/button'
import { Field, Input } from '../components/ui/field'
import { Segmented } from '../components/ui/misc'
import { getSupabase } from '../lib/supabase'

type Mode = 'signin' | 'signup' | 'reset'

const MIN_PASSWORD = 8

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const supabase = getSupabase()
    if (!supabase) return
    setError(null)
    setInfo(null)
    const addr = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return setError('Enter a valid email address.')
    if (mode !== 'reset' && password.length < MIN_PASSWORD) return setError(`Passwords need at least ${MIN_PASSWORD} characters.`)
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: addr, password })
        if (err) setError(err.message === 'Invalid login credentials' ? 'Email or password is incorrect.' : err.message)
      } else if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp({
          email: addr,
          password,
          options: { emailRedirectTo: window.location.origin },
        })
        if (err) setError(err.message)
        else if (!data.session) setInfo('Check your email to confirm your account, then sign in.')
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(addr, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (err) setError(err.message)
        else setInfo('If an account exists for that email, a reset link is on its way.')
      }
    } catch {
      setError('Can’t reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight">Study Planner</h1>
        <p className="mt-1 text-[13px] text-muted">Your plans, notes and progress — private to your account and available on any device.</p>
        <div className="mt-6 rounded-xl border border-line bg-surface p-5 shadow-panel">
          <Segmented
            label="Account action"
            value={mode === 'reset' ? 'signin' : mode}
            onChange={(m) => { setMode(m); setError(null); setInfo(null) }}
            options={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' }]}
            className="mb-4 w-full [&>button]:flex-1"
          />
          <form onSubmit={(e) => void submit(e)} className="space-y-3" noValidate>
            <Field label="Email">
              {(id) => <Input id={id} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}
            </Field>
            {mode !== 'reset' && (
              <Field label="Password" hint={mode === 'signup' ? `At least ${MIN_PASSWORD} characters.` : undefined}>
                {(id) => (
                  <Input
                    id={id}
                    type="password"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                )}
              </Field>
            )}
            {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
            {info && <p role="status" className="text-[13px] text-success">{info}</p>}
            <Button type="submit" variant="primary" className="w-full justify-center" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
            </Button>
          </form>
          <div className="mt-3 text-center text-[13px]">
            {mode === 'reset' ? (
              <button type="button" className="text-accent hover:underline" onClick={() => setMode('signin')}>Back to sign in</button>
            ) : (
              <button type="button" className="text-muted hover:text-fg hover:underline" onClick={() => setMode('reset')}>Forgot password?</button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

export function ResetPasswordPage({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_PASSWORD) return setError(`Passwords need at least ${MIN_PASSWORD} characters.`)
    if (password !== confirmPw) return setError('The passwords don’t match.')
    const supabase = getSupabase()
    if (!supabase) return
    setBusy(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (err) setError(err.message)
    else onDone()
  }

  return (
    <main className="flex min-h-full items-center justify-center px-4 py-12">
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-sm space-y-3 rounded-xl border border-line bg-surface p-5 shadow-panel" noValidate>
        <h1 className="text-lg font-semibold">Choose a new password</h1>
        <Field label="New password">
          {(id) => <Input id={id} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Field label="Confirm new password">
          {(id) => <Input id={id} type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />}
        </Field>
        {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
        <Button type="submit" variant="primary" className="w-full justify-center" disabled={busy}>
          {busy ? 'Saving…' : 'Update password'}
        </Button>
      </form>
    </main>
  )
}
