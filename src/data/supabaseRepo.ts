import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { withOwner } from '../domain/backup'
import type { Change } from '../domain/changes'
import { TABLE_ORDER, emptySnapshot, type Note, type Snapshot } from '../domain/types'
import { RepoError, type NoteDraft, type Repository, type SaveNoteResult } from './repository'

const PAGE = 1000

function fail(error: PostgrestError | Error | null | unknown): never {
  if (error instanceof TypeError || (error instanceof Error && /fetch|network/i.test(error.message))) {
    throw new RepoError(error.message, { network: true })
  }
  const pg = error as PostgrestError
  throw new RepoError(pg?.message || 'Request failed', { code: pg?.code })
}

export class SupabaseRepo implements Repository {
  readonly mode = 'cloud' as const
  private readonly client: SupabaseClient
  readonly userId: string

  constructor(client: SupabaseClient, userId: string) {
    this.client = client
    this.userId = userId
  }

  async loadAll(): Promise<Snapshot> {
    const tables = await Promise.all(TABLE_ORDER.map((t) => this.loadTable(t)))
    const snap = emptySnapshot() as Record<string, unknown[]>
    TABLE_ORDER.forEach((t, i) => (snap[t] = tables[i]))
    return normalizeTimes(snap as unknown as Snapshot)
  }

  private async loadTable(table: string): Promise<unknown[]> {
    const rows: unknown[] = []
    for (let from = 0; ; from += PAGE) {
      try {
        const { data, error } = await this.client.from(table).select('*').order('id').range(from, from + PAGE - 1)
        if (error) fail(error)
        rows.push(...(data ?? []))
        if (!data || data.length < PAGE) return rows
      } catch (e) {
        if (e instanceof RepoError) throw e
        fail(e)
      }
    }
  }

  async apply(change: Change): Promise<{ needsReload?: boolean }> {
    try {
      if (change.op === 'insert') {
        const rows = change.rows.map((r) => ({ ...r, user_id: this.userId }))
        // Recurring occurrences may already exist (created on another device):
        // the unique key makes this idempotent, then we reload to reconcile.
        if (change.table === 'blocks' && rows.every((r) => 'recurrence_id' in r && r.recurrence_id)) {
          const { error } = await this.client
            .from('blocks')
            .upsert(rows, { onConflict: 'user_id,recurrence_id,occurrence_date', ignoreDuplicates: true })
          if (error) fail(error)
          return { needsReload: true }
        }
        // Idempotent on id: if an earlier attempt reached the server but its
        // response was lost (or an undo re-inserts an existing row), a retry
        // must not fail forever with a duplicate-key error.
        const { error } = await this.client.from(change.table).upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
        if (error) fail(error)
      } else if (change.op === 'update') {
        const { data, error } = await this.client.from(change.table).update(change.patch).eq('id', change.id).select('id')
        if (error) fail(error)
        // 0 rows: the record was deleted elsewhere — reload so the UI stops showing it.
        if (!data || data.length === 0) return { needsReload: true }
      } else {
        const ids = change.rows.map((r) => r.id)
        const { data, error } = await this.client.from(change.table).delete().in('id', ids).select('id')
        if (error) fail(error)
        if ((data?.length ?? 0) < ids.length) return { needsReload: true }
      }
      return {}
    } catch (e) {
      if (e instanceof RepoError) throw e
      fail(e)
    }
  }

  async loadNote(id: string): Promise<Note | null> {
    try {
      const { data, error } = await this.client.from('notes').select('*').eq('id', id).maybeSingle()
      if (error) fail(error)
      return (data as Note | null) ?? null
    } catch (e) {
      if (e instanceof RepoError) throw e
      fail(e)
    }
  }

  async saveNote(draft: NoteDraft, baseVersion: number): Promise<SaveNoteResult> {
    try {
      const { data, error } = await this.client
        .from('notes')
        .update({ title: draft.title, body: draft.body })
        .eq('id', draft.id)
        .eq('version', baseVersion)
        .select('*')
      if (error) fail(error)
      if (data && data.length === 1) return { status: 'saved', note: data[0] as Note }
      return { status: 'conflict', server: await this.loadNote(draft.id) }
    } catch (e) {
      if (e instanceof RepoError) throw e
      fail(e)
    }
  }

  async replaceAll(snapshot: Snapshot): Promise<void> {
    try {
      const { error } = await this.client.rpc('replace_user_data', { payload: withOwner(snapshot, this.userId) })
      if (error) fail(error)
    } catch (e) {
      if (e instanceof RepoError) throw e
      fail(e)
    }
  }
}

/** Postgres returns `time` as HH:MM:SS; the app uses HH:MM. */
function normalizeTimes(s: Snapshot): Snapshot {
  const hm = (t: string | null) => (t ? t.slice(0, 5) : null)
  return {
    ...s,
    blocks: s.blocks.map((b) => ({ ...b, start_time: hm(b.start_time) })),
    recurring_blocks: s.recurring_blocks.map((r) => ({ ...r, start_time: hm(r.start_time) })),
  }
}
