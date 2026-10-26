// Public, browser-safe configuration. Only the Supabase URL and the publishable
// (or legacy anon) key belong here — never a service-role/secret key.
export interface CloudConfig {
  url: string
  key: string
}

function read(): CloudConfig | null {
  const env = import.meta.env as Record<string, string | undefined>
  // VITE_* names, or the NEXT_PUBLIC_* names the Vercel Supabase integration creates.
  const first = (...names: string[]) => names.map((n) => env[n]?.trim()).find((v) => v)
  const url = first('VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL')
  const key = first(
    'VITE_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  )
  if (!url || !key) return null
  if (!/^https?:\/\//.test(url)) return null
  assertBrowserSafeKey(key)
  return { url, key }
}

/** Refuses secret keys: new-style `sb_secret_…` and legacy JWTs whose role isn't `anon`. */
export function assertBrowserSafeKey(key: string): void {
  const message = 'A Supabase secret/service-role key was provided to the browser build. Use the publishable (or anon) key instead.'
  if (key.startsWith('sb_secret_') || /service_role/i.test(key)) throw new Error(message)
  if (key.startsWith('sb_publishable_')) return
  const parts = key.split('.')
  if (parts.length === 3) {
    let role: unknown
    try {
      const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
      role = (JSON.parse(atob(payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '='))) as { role?: unknown }).role
    } catch {
      return // Not a decodable JWT; Supabase will reject it if it's invalid.
    }
    if (role !== 'anon') throw new Error(message)
  }
}

export const cloudConfig: CloudConfig | null = read()
export const isDemoMode = cloudConfig === null
