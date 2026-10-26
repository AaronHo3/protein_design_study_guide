import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cloudConfig } from './config'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (!cloudConfig) return null
  client ??= createClient(cloudConfig.url, cloudConfig.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  return client
}
