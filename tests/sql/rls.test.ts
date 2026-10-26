// Runs the real SQL migrations against PGlite (Postgres compiled to WASM) with a
// minimal stand-in for Supabase's auth schema, then checks row isolation.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const USER_A = '00000000-0000-4000-8000-00000000000a'
const USER_B = '00000000-0000-4000-8000-00000000000b'

const AUTH_SHIM = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
`

let db: PGlite

async function as<T>(uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`)
  await db.exec(uid ? 'set role authenticated' : 'set role anon')
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
  }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(AUTH_SHIM)
  const dir = join(__dirname, '../../supabase/migrations')
  for (const file of readdirSync(dir).sort()) {
    await db.exec(readFileSync(join(dir, file), 'utf8'))
  }
  await db.exec(`insert into auth.users (id) values ('${USER_A}'), ('${USER_B}')`)
})

describe('row level security', () => {
  it('lets users read and write only their own rows', async () => {
    await as(USER_A, () => db.exec(`insert into public.tracks (name) values ('A track')`))
    await as(USER_B, () => db.exec(`insert into public.tracks (name) values ('B track')`))

    const seenByA = await as(USER_A, () => db.query<{ name: string }>('select name from public.tracks'))
    expect(seenByA.rows.map((r) => r.name)).toEqual(['A track'])

    const updated = await as(USER_B, () =>
      db.query(`update public.tracks set name = 'hijacked' where name = 'A track' returning id`),
    )
    expect(updated.rows).toHaveLength(0)

    const deleted = await as(USER_B, () => db.query(`delete from public.tracks where name = 'A track' returning id`))
    expect(deleted.rows).toHaveLength(0)
  })

  it('rejects inserting rows owned by someone else', async () => {
    await expect(
      as(USER_A, () => db.exec(`insert into public.goals (user_id, title) values ('${USER_B}', 'spoof')`)),
    ).rejects.toThrow(/row-level security/)
  })

  it('rejects reassigning a row to another user', async () => {
    await as(USER_A, () => db.exec(`insert into public.goals (title) values ('mine')`))
    await expect(
      as(USER_A, () => db.exec(`update public.goals set user_id = '${USER_B}' where title = 'mine'`)),
    ).rejects.toThrow(/row-level security/)
  })

  it('denies anonymous access entirely', async () => {
    await expect(as(null, () => db.query('select * from public.tracks'))).rejects.toThrow(/permission denied/)
  })

  it('prevents linking to another user’s session via composite foreign keys', async () => {
    const res = await as(USER_B, () =>
      db.query<{ id: string }>(`insert into public.sessions (title) values ('B session') returning id`),
    )
    const bSession = res.rows[0].id
    await expect(
      as(USER_A, () => db.exec(`insert into public.tasks (session_id, title) values ('${bSession}', 'sneaky')`)),
    ).rejects.toThrow(/foreign key/)
  })

  it('keeps notes when their session is deleted and bumps note versions', async () => {
    const out = await as(USER_A, async () => {
      const s = await db.query<{ id: string }>(`insert into public.sessions (title) values ('S') returning id`)
      const n = await db.query<{ id: string; version: number }>(
        `insert into public.notes (session_id, body) values ('${s.rows[0].id}', 'hello') returning id, version`,
      )
      await db.exec(`update public.notes set body = 'edited' where id = '${n.rows[0].id}'`)
      await db.exec(`delete from public.sessions where id = '${s.rows[0].id}'`)
      return db.query<{ session_id: string | null; version: number; body: string }>(
        `select session_id, version, body from public.notes where id = '${n.rows[0].id}'`,
      )
    })
    expect(out.rows[0]).toEqual({ session_id: null, version: 2, body: 'edited' })
  })

  it('makes recurrence occurrences unique per rule and date', async () => {
    await as(USER_A, async () => {
      const r = await db.query<{ id: string }>(
        `insert into public.recurring_blocks (weekdays, starts_on) values ('{1}', '2026-11-02') returning id`,
      )
      const rid = r.rows[0].id
      await db.exec(`insert into public.blocks (date, recurrence_id, occurrence_date) values ('2026-11-02', '${rid}', '2026-11-02')`)
      await db.exec(
        `insert into public.blocks (date, recurrence_id, occurrence_date) values ('2026-11-02', '${rid}', '2026-11-02')
         on conflict (user_id, recurrence_id, occurrence_date) do nothing`,
      )
      const count = await db.query<{ n: number }>(`select count(*)::int as n from public.blocks where recurrence_id = '${rid}'`)
      expect(count.rows[0].n).toBe(1)
    })
  })
})

describe('replace_user_data', () => {
  it('replaces only the caller’s data and forces ownership', async () => {
    const trackId = '11111111-1111-4111-8111-111111111111'
    const sessionId = '22222222-2222-4222-8222-222222222222'
    const ts = { created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
    const payload = {
      tracks: [{ id: trackId, user_id: USER_B, name: 'Imported', color: 'emerald', position: 0, archived_at: null, ...ts }],
      sessions: [
        {
          id: sessionId, title: 'Imported session', description: '', track_id: trackId, topic_id: null,
          template_id: null, status: 'planned', output: '', planned_min: 60, actual_min: null,
          completed_at: null, archived_at: null, ...ts,
        },
      ],
      tasks: [
        {
          id: '33333333-3333-4333-8333-333333333333', session_id: sessionId, position: 0, title: 'Do it',
          description: '', required: true, done: true, done_at: null, est_min: null, output: '', ...ts,
        },
      ],
    }
    await as(USER_A, () => db.query('select public.replace_user_data($1::jsonb)', [JSON.stringify(payload)]))

    const aTracks = await as(USER_A, () => db.query<{ name: string; user_id: string }>('select name, user_id from public.tracks'))
    expect(aTracks.rows).toEqual([{ name: 'Imported', user_id: USER_A }])

    const aTasks = await as(USER_A, () => db.query<{ done: boolean }>('select done from public.tasks'))
    expect(aTasks.rows).toEqual([{ done: true }])

    const bTracks = await as(USER_B, () => db.query<{ name: string }>('select name from public.tracks'))
    expect(bTracks.rows.map((r) => r.name)).toEqual(['B track'])
  })

  it('rolls back everything when the payload is invalid', async () => {
    const bad = { goals: [{ id: '44444444-4444-4444-8444-444444444444', title: '' }] }
    await expect(
      as(USER_A, () => db.query('select public.replace_user_data($1::jsonb)', [JSON.stringify(bad)])),
    ).rejects.toThrow()
    const still = await as(USER_A, () => db.query<{ name: string }>('select name from public.tracks'))
    expect(still.rows.map((r) => r.name)).toEqual(['Imported'])
  })

  it('moves restored note versions forward so stale editors conflict instead of overwriting', async () => {
    const noteId = '55555555-5555-4555-8555-555555555555'
    const ts = { created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
    const note = (body: string, version: number) => ({
      id: noteId, title: '', body, session_id: null, topic_id: null, date: null, version, ...ts,
    })
    await as(USER_A, () => db.query('select public.replace_user_data($1::jsonb)', [JSON.stringify({ notes: [note('v3 text', 3)] })]))
    // Restore an older export of the same note (version 1).
    await as(USER_A, () => db.query('select public.replace_user_data($1::jsonb)', [JSON.stringify({ notes: [note('old text', 1)] })]))
    const row = await as(USER_A, () => db.query<{ version: number; body: string }>(`select version, body from public.notes where id = '${noteId}'`))
    expect(row.rows[0]).toEqual({ version: 4, body: 'old text' })
    // An editor that loaded version 3 earlier can no longer overwrite it.
    const stale = await as(USER_A, () => db.query(`update public.notes set body = 'stale' where id = '${noteId}' and version = 3 returning id`))
    expect(stale.rows).toHaveLength(0)
  })

  it('cannot be called anonymously', async () => {
    await expect(as(null, () => db.query(`select public.replace_user_data('{}'::jsonb)`))).rejects.toThrow()
  })
})
