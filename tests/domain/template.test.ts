import { describe, expect, it } from 'vitest'
import { daySummary } from '../../src/domain/completion'
import { buildTemplate, type TemplateOptions } from '../../src/domain/template'
import { blank, run, testCtx } from '../helpers'

const none: TemplateOptions = { tracks: false, goal: false, roadmap: false, structure: false, schedule: false, sampleWeek: false }
const cal = { startDate: '2026-11-04', studyDays: [1, 2, 3, 4, 5] as (1 | 2 | 3 | 4 | 5)[] } // a Wednesday

describe('template import', () => {
  it('can import the roadmap without any calendar entries', () => {
    const ctx = testCtx()
    const s = run(blank(), buildTemplate(blank(), { ...none, roadmap: true }, ctx, cal))
    expect(s.stages).toHaveLength(6)
    expect(s.topics.length).toBeGreaterThan(50)
    expect(s.checkpoints.length).toBeGreaterThan(10)
    expect(s.blocks).toHaveLength(0)
    expect(s.sessions).toHaveLength(0)
    expect(s.topics.every((t) => t.track_ids.length === 0)).toBe(true)
  })

  it('can import tracks without sample lessons', () => {
    const ctx = testCtx()
    const s = run(blank(), buildTemplate(blank(), { ...none, tracks: true }, ctx, cal))
    expect(s.tracks.map((t) => t.name)).toEqual(['Biology', 'Computational foundations', 'AI/application'])
    expect(s.sessions).toHaveLength(0)
  })

  it('creates no calendar entries without a start date', () => {
    const ctx = testCtx()
    const s = run(blank(), buildTemplate(blank(), { ...none, schedule: true, sampleWeek: true }, ctx))
    expect(s.blocks).toHaveLength(0)
    expect(s.recurring_blocks).toHaveLength(0)
  })

  it('fills only the first study week and links sample sessions into recurring slots', () => {
    const ctx = testCtx()
    const opts = { ...none, tracks: true, schedule: true, sampleWeek: true, roadmap: true, structure: true }
    const s = run(blank(), buildTemplate(blank(), opts, ctx, cal))
    const dates = [...new Set(s.blocks.map((b) => b.date))].sort()
    expect(dates).toEqual(['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10'])
    expect(s.blocks).toHaveLength(15) // 3 per day, no duplicates from schedule + sample
    expect(s.blocks.every((b) => b.session_id && b.recurrence_id)).toBe(true)
    expect(s.sessions).toHaveLength(15)
    expect(s.resources).toHaveLength(0) // no invented resources
    expect(daySummary(s, '2026-11-04', true)).toMatchObject({ kind: 'planned', requiredTotal: 3, plannedMin: 360 })
    const tasks = s.tasks.filter((t) => t.session_id === s.sessions[0].id)
    expect(tasks.map((t) => t.required)).toEqual([true, false, false, false, false, false])
  })

  it('uses a small number of writes, with sessions inserted before blocks that reference them', () => {
    const ctx = testCtx()
    const changes = buildTemplate(blank(), { tracks: true, goal: true, roadmap: true, structure: true, schedule: true, sampleWeek: true }, ctx, cal)
    expect(changes.every((c) => c.op === 'insert')).toBe(true)
    expect(changes.length).toBeLessThanOrEqual(12)
    const order = changes.map((c) => c.table)
    expect(order.indexOf('sessions')).toBeLessThan(order.indexOf('blocks'))
  })

  it('reuses existing tracks with the same name instead of duplicating them', () => {
    const ctx = testCtx()
    const first = run(blank(), buildTemplate(blank(), { ...none, tracks: true }, ctx))
    const second = run(first, buildTemplate(first, { ...none, tracks: true, roadmap: true }, ctx))
    expect(second.tracks).toHaveLength(3)
  })
})
