import { describe, expect, it } from 'vitest'
import { invertChanges } from '../../src/domain/changes'
import { blocksOn } from '../../src/domain/completion'
import { newBlock, newNote, newResource, newSession, newSessionResource, newTask } from '../../src/domain/factories'
import {
  applyShift, backlog, capacityConflicts, moveBlock, moveBlockBy, previewShift, scheduleSession, unscheduleSession,
} from '../../src/domain/scheduling'
import { toggleTask } from '../../src/domain/sessions'
import { blank, run, testCtx } from '../helpers'

function setup() {
  const ctx = testCtx()
  const s = newSession(ctx, { title: 'Plot binding curves', planned_min: 90 })
  const task = newTask(ctx, { session_id: s.id, title: 'Fit KD', description: 'Use scipy', done: true })
  const res = newResource(ctx, { title: 'My textbook' })
  const link = newSessionResource(ctx, { session_id: s.id, resource_id: res.id, portion: 'Ch. 3' })
  const note = newNote(ctx, { session_id: s.id, body: 'KD is the concentration at half occupancy' })
  const snap = { ...blank(), sessions: [s], tasks: [task], resources: [res], session_resources: [link], notes: [note] }
  return { ctx, snap, s, task, note }
}

describe('scheduling and moving', () => {
  it('schedules a backlog session, then moves it while preserving everything attached', () => {
    const { ctx, snap, s, task, note } = setup()
    expect(backlog(snap).map((x) => x.id)).toEqual([s.id])

    let state = run(snap, scheduleSession(snap, s.id, '2026-11-02', ctx))
    expect(backlog(state)).toHaveLength(0)
    const block = state.blocks[0]
    expect(block).toMatchObject({ session_id: s.id, duration_min: 90, date: '2026-11-02' })

    state = run(state, moveBlock(state, block.id, '2026-11-05', undefined, ctx))
    expect(state.blocks).toHaveLength(1) // moved, not duplicated
    const moved = state.blocks[0]
    expect(moved.id).toBe(block.id)
    expect(moved.date).toBe('2026-11-05')
    expect(moved.history).toEqual([expect.objectContaining({ from: '2026-11-02', to: '2026-11-05' })])
    expect(state.sessions).toEqual(snap.sessions)
    expect(state.tasks).toEqual([task])
    expect(state.notes).toEqual([note]) // same note, same created_at
    expect(state.session_resources).toEqual(snap.session_resources)
  })

  it('scheduling an already-scheduled session moves its block instead of duplicating', () => {
    const { ctx, snap, s } = setup()
    let state = run(snap, scheduleSession(snap, s.id, '2026-11-02', ctx))
    state = run(state, scheduleSession(state, s.id, '2026-11-03', ctx))
    expect(state.blocks).toHaveLength(1)
    expect(state.blocks[0].date).toBe('2026-11-03')
  })

  it('reorders within a day and across days with consistent positions', () => {
    const ctx = testCtx()
    const a = newBlock(ctx, { date: '2026-11-02', position: 0, title: 'A' })
    const b = newBlock(ctx, { date: '2026-11-02', position: 1, title: 'B' })
    const c = newBlock(ctx, { date: '2026-11-02', position: 2, title: 'C' })
    const d = newBlock(ctx, { date: '2026-11-03', position: 0, title: 'D' })
    let state = { ...blank(), blocks: [a, b, c, d] }

    state = run(state, moveBlockBy(state, c.id, -1))
    expect(blocksOn(state, '2026-11-02').map((x) => x.title)).toEqual(['A', 'C', 'B'])

    state = run(state, moveBlock(state, a.id, '2026-11-03', 0, ctx))
    expect(blocksOn(state, '2026-11-02').map((x) => [x.title, x.position])).toEqual([['C', 0], ['B', 1]])
    expect(blocksOn(state, '2026-11-03').map((x) => [x.title, x.position])).toEqual([['A', 0], ['D', 1]])
  })

  it('returns a session to the backlog; recurring slots keep their placeholder', () => {
    const { ctx, snap, s } = setup()
    let state = run(snap, scheduleSession(snap, s.id, '2026-11-02', ctx))
    state = run(state, unscheduleSession(state, s.id))
    expect(state.blocks).toHaveLength(0)
    expect(backlog(state)).toHaveLength(1)

    const slot = newBlock(ctx, { date: '2026-11-02', session_id: s.id, recurrence_id: 'r1', occurrence_date: '2026-11-02' })
    state = run({ ...snap, blocks: [slot] }, unscheduleSession({ ...snap, blocks: [slot] }, s.id))
    expect(state.blocks).toEqual([{ ...slot, session_id: null }])
  })

  it('undo restores the exact previous placement', () => {
    const { ctx, snap, s } = setup()
    const placed = run(snap, scheduleSession(snap, s.id, '2026-11-02', ctx))
    const changes = moveBlock(placed, placed.blocks[0].id, '2026-11-09', undefined, ctx)
    const undone = run(run(placed, changes), invertChanges(changes))
    expect(undone.blocks).toEqual(placed.blocks)
  })

  it('previews bulk shifts, skipping completed work and rest days', () => {
    const { ctx, snap, s, task } = setup()
    const other = newSession(ctx, { title: 'Open session' })
    const done = newBlock(ctx, { date: '2026-11-05', session_id: s.id }) // s has its only required task done
    const open = newBlock(ctx, { date: '2026-11-06', session_id: other.id }) // Friday
    const state = { ...snap, sessions: [...snap.sessions, other], blocks: [done, open] }
    expect(state.tasks[0]).toBe(task)

    const items = previewShift(state, '2026-11-01', 1, [1, 2, 3, 4, 5], () => 'x')
    expect(items).toEqual([{ blockId: open.id, label: 'x', from: '2026-11-06', to: '2026-11-09' }]) // Fri → Mon
    const after = run(state, applyShift(state, items, ctx))
    expect(after.blocks.find((b) => b.id === open.id)!.date).toBe('2026-11-09')
    expect(after.blocks.find((b) => b.id === done.id)!.date).toBe('2026-11-05')
  })

  it('reports capacity conflicts without preventing the change', () => {
    const ctx = testCtx()
    const blocks = [120, 120, 150].map((m, i) => newBlock(ctx, { date: '2026-11-02', duration_min: m, position: i }))
    const state = { ...blank(), blocks }
    expect(capacityConflicts(state, ['2026-11-02'], 360)).toEqual([
      { date: '2026-11-02', plannedMin: 390, capacityMin: 360 },
    ])
  })

  it('never auto-moves unfinished work: past unfinished blocks stay where they were', () => {
    const { ctx, snap, s, task } = setup()
    let state = run(snap, scheduleSession(snap, s.id, '2026-10-20', ctx))
    state = run(state, toggleTask(state, task.id, ctx)) // uncheck → unfinished
    expect(state.blocks[0].date).toBe('2026-10-20')
  })
})
