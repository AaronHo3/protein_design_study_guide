import { describe, expect, it } from 'vitest'
import { assertBrowserSafeKey } from '../../src/lib/config'

const jwt = (payload: object) =>
  ['eyJhbGciOiJIUzI1NiJ9', btoa(JSON.stringify(payload)).replace(/=+$/, ''), 'signature'].join('.')

describe('browser key guard', () => {
  it('accepts publishable and anon keys', () => {
    expect(() => assertBrowserSafeKey('sb_publishable_abc123')).not.toThrow()
    expect(() => assertBrowserSafeKey(jwt({ role: 'anon', iss: 'supabase' }))).not.toThrow()
  })

  it('refuses secret and service-role keys', () => {
    expect(() => assertBrowserSafeKey('sb_secret_abc123')).toThrow(/secret/)
    expect(() => assertBrowserSafeKey(jwt({ role: 'service_role', iss: 'supabase' }))).toThrow(/secret/)
    expect(() => assertBrowserSafeKey(jwt({ role: 'authenticated' }))).toThrow(/secret/)
  })
})
