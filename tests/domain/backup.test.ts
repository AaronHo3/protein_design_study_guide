import { describe, expect, it } from 'vitest'
import { makeBackup, mergeSnapshots, notesToMarkdown, parseBackup, remapIds } from '../../src/domain/backup'
import { newNote, newSession, newSettings, newTask, newTrack } from '../../src/domain/factories'
import { ALL_PARTS, buildTemplate } from '../../src/domain/template'
import { blank, run, testCtx } from '../helpers'

function fullSnapshot() {
  const ctx = testCtx()
  const base = { ...blank(), settings: [newSettings(ctx, { onboarded: true })] }
  return run(base, buildTemplate(base, ALL_PARTS, ctx, { startDate: '2026-11-02', studyDays: [1, 2, 3, 4, 5] }))
}

const strip = <T extends object>(rows: T[]) => rows.map(({ user_id: _u, ...r }: T & { user_id?: string }) => r)

describe('backup round trip', () => {
  it('export → import reproduces every table exactly (minus ownership)', () => {
    const snap = fullSnapshot()
    const text = JSON.stringify(makeBackup(snap))
    const parsed = parseBackup(text)
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'))
    expect(parsed.warnings).toEqual([])
    for (const table of Object.keys(snap) as (keyof typeof snap)[]) {
      expect(strip(parsed.snapshot[table] as object[])).toEqual(strip(snap[table] as object[]))
    }
  })

  it('rejects non-backups, bad rows, and duplicate ids with readable errors', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, errors: ['The file is not valid JSON.'] })
    expect(parseBackup('{"hello":1}').ok).toBe(false)

    const snap = fullSnapshot()
    const bad = makeBackup(snap)
    const withBadDate = { ...bad, data: { ...bad.data, blocks: [{ ...bad.data.blocks[0], date: '2026-13-01' }] } }
    const res = parseBackup(JSON.stringify(withBadDate))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors[0]).toMatch(/blocks\[0\]\.date/)

    const dupe = { ...bad, data: { ...bad.data, tracks: [bad.data.tracks[0], bad.data.tracks[0]] } }
    const res2 = parseBackup(JSON.stringify(dupe))
    expect(res2.ok).toBe(false)
    if (!res2.ok) expect(res2.errors[0]).toMatch(/Duplicate id/)
  })

  it('rejects unsafe resource URLs', () => {
    const snap = fullSnapshot()
    const b = makeBackup(snap)
    const evil = { ...b, data: { ...b.data, resources: [{ id: '00000000-0000-4000-8000-0000000fffff', title: 'x', url: 'javascript:alert(1)' }] } }
    expect(parseBackup(JSON.stringify(evil)).ok).toBe(false)
  })

  it('repairs dangling references instead of corrupting relationships', () => {
    const ctx = testCtx()
    const s = newSession(ctx, { title: 'S', track_id: '00000000-0000-4000-8000-00000000dead' })
    const orphan = newTask(ctx, { session_id: '00000000-0000-4000-8000-00000000beef', title: 'orphan' })
    const res = parseBackup(JSON.stringify(makeBackup({ ...blank(), sessions: [s], tasks: [orphan] })))
    if (!res.ok) throw new Error('expected ok')
    expect(res.snapshot.sessions[0].track_id).toBeNull()
    expect(res.snapshot.tasks).toHaveLength(0)
    expect(res.warnings.join(' ')).toMatch(/task\(s\) referenced missing sessions/)
  })
})

describe('merge', () => {
  it('adds new records, keeps newer versions, and never removes existing ones', () => {
    const ctx = testCtx()
    const shared = newTrack(ctx, { name: 'Old name' })
    const mine = newTrack(ctx, { name: 'Only mine' })
    const theirs = newTrack(ctx, { name: 'Only theirs' })
    const newer = { ...shared, name: 'New name', updated_at: '2030-01-01T00:00:00.000Z' }
    const { snapshot, summary } = mergeSnapshots(
      { ...blank(), tracks: [shared, mine] },
      { ...blank(), tracks: [newer, theirs] },
    )
    expect(snapshot.tracks.map((t) => t.name).sort()).toEqual(['New name', 'Only mine', 'Only theirs'])
    expect(summary.find((s) => s.table === 'tracks')).toMatchObject({ added: 1, updated: 1 })
  })

  it('merging the same backup twice creates no duplicates', () => {
    const snap = fullSnapshot()
    const once = mergeSnapshots(snap, snap).snapshot
    const twice = mergeSnapshots(once, snap).snapshot
    expect(twice.blocks).toHaveLength(snap.blocks.length)
    expect(twice.sessions).toHaveLength(snap.sessions.length)
  })
})

describe('importing into another account', () => {
  it('remaps every id and reference consistently', () => {
    const snap = fullSnapshot()
    let n = 0
    const copy = remapIds(snap, () => `11111111-1111-4111-8111-${(++n).toString(16).padStart(12, '0')}`)
    const oldIds = new Set(Object.values(snap).flatMap((rows) => (rows as { id: string }[]).map((r) => r.id)))
    expect(Object.values(copy).flat().some((r) => oldIds.has((r as { id: string }).id))).toBe(false)
    // Relationships survive: re-validating repairs nothing.
    const res = parseBackup(JSON.stringify(makeBackup(copy)))
    if (!res.ok) throw new Error(res.errors.join())
    expect(res.warnings).toEqual([])
    expect(copy.blocks.filter((b) => b.session_id).length).toBe(snap.blocks.filter((b) => b.session_id).length)
    const topic = copy.topics.find((t) => t.track_ids.length)!
    expect(copy.tracks.some((t) => t.id === topic.track_ids[0])).toBe(true)
  })
})

describe('markdown export', () => {
  it('includes note bodies with session context', () => {
    const ctx = testCtx()
    const s = newSession(ctx, { title: 'Kinetics' })
    const n = newNote(ctx, { session_id: s.id, body: '## What I learned\nkon/koff', date: '2026-11-02' })
    const md = notesToMarkdown({ ...blank(), sessions: [s], notes: [n] })
    expect(md).toContain('## Kinetics')
    expect(md).toContain('Session: Kinetics')
    expect(md).toContain('kon/koff')
  })
})
