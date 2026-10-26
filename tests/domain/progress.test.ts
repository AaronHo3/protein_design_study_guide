import { describe, expect, it } from 'vitest'
import { newBlock, newSession, newTask } from '../../src/domain/factories'
import { activity, heatmap, trackRows, weeklyRows } from '../../src/domain/progress'
import { blank, testCtx } from '../helpers'

const DAYS = [1, 2, 3, 4, 5] as (1 | 2 | 3 | 4 | 5)[]

function setup() {
  const ctx = testCtx()
  const done = newSession(ctx, { title: 'Done', track_id: 't1', actual_min: 50 })
  const skipped = newSession(ctx, { title: 'Skipped', track_id: 't1', status: 'skipped' })
  const future = newSession(ctx, { title: 'Future', track_id: 't2' })
  const tasks = [newTask(ctx, { session_id: done.id, title: 'x', done: true })]
  const blocks = [
    newBlock(ctx, { date: '2026-11-02', session_id: done.id, duration_min: 120 }),
    newBlock(ctx, { date: '2026-11-03', session_id: skipped.id, duration_min: 120 }),
    newBlock(ctx, { date: '2026-11-20', session_id: future.id, duration_min: 60 }),
  ]
  return { ...blank(), sessions: [done, skipped, future], tasks, blocks }
}

describe('progress', () => {
  it('counts activity up to today, excluding skipped and future work', () => {
    const a = activity(setup(), '2026-11-05', DAYS)
    expect(a).toEqual({ tasksDone: 1, sessionsDone: 1, completedDays: 1, plannedMin: 120, actualMin: 50, sessionsWithActual: 1 })
  })

  it('reports weekly completion of required blocks', () => {
    const [week] = weeklyRows(setup(), '2026-11-05', DAYS, 1)
    expect(week).toMatchObject({ start: '2026-11-02', requiredBlocks: 2, requiredDone: 1, completedDays: 1 })
  })

  it('tracks progress per track independently', () => {
    const rows = trackRows(setup(), '2026-11-05')
    expect(rows.find((r) => r.trackId === 't1')).toMatchObject({ sessionsDone: 1, sessionsScheduled: 2, plannedMin: 120, actualMin: 50 })
    expect(rows.find((r) => r.trackId === 't2')).toMatchObject({ sessionsDone: 0, sessionsScheduled: 0 })
  })

  it('builds a Monday-first heatmap ending this week', () => {
    const grid = heatmap(setup(), '2026-11-05', DAYS, 2)
    expect(grid).toHaveLength(2)
    expect(grid[1][0]).toMatchObject({ date: '2026-11-02', kind: 'complete', future: false })
    expect(grid[1][5]).toMatchObject({ kind: 'rest', future: true })
  })
})
