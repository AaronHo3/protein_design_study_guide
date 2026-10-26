import { describe, expect, it } from 'vitest'
import { daySummary, reopenedDays, sessionProgress } from '../../src/domain/completion'
import { newBlock, newSession, newTask } from '../../src/domain/factories'
import { addTask, completeSession, setSessionStatus, toggleTask } from '../../src/domain/sessions'
import { blank, run, testCtx } from '../helpers'

const D = '2026-11-02'

function setup() {
  const ctx = testCtx()
  const s1 = newSession(ctx, { title: 'With required tasks' })
  const s2 = newSession(ctx, { title: 'No required tasks' })
  const t1 = newTask(ctx, { session_id: s1.id, title: 'req A', required: true })
  const t2 = newTask(ctx, { session_id: s1.id, title: 'req B', required: true, position: 1 })
  const t3 = newTask(ctx, { session_id: s1.id, title: 'optional', required: false, position: 2 })
  const t4 = newTask(ctx, { session_id: s2.id, title: 'optional only', required: false })
  const b1 = newBlock(ctx, { date: D, session_id: s1.id })
  const b2 = newBlock(ctx, { date: D, session_id: s2.id, position: 1 })
  const snap = { ...blank(), sessions: [s1, s2], tasks: [t1, t2, t3, t4], blocks: [b1, b2] }
  return { ctx, snap, s1, s2, t1, t2, t3, t4, b1, b2 }
}

describe('session completion', () => {
  it('completes when all required tasks are checked, ignoring optional ones', () => {
    const { ctx, snap, s1, t1, t2 } = setup()
    let s = run(snap, toggleTask(snap, t1.id, ctx))
    expect(s.sessions.find((x) => x.id === s1.id)!.status).toBe('in_progress')
    s = run(s, toggleTask(s, t2.id, ctx))
    const session = s.sessions.find((x) => x.id === s1.id)!
    expect(session.status).toBe('completed')
    expect(sessionProgress(session, s.tasks).state).toBe('complete')
  })

  it('reopens when a required task is unchecked (completion is reversible)', () => {
    const { ctx, snap, s1, t1, t2 } = setup()
    let s = run(snap, [...toggleTask(snap, t1.id, ctx)])
    s = run(s, toggleTask(s, t2.id, ctx))
    s = run(s, toggleTask(s, t2.id, ctx))
    expect(s.sessions.find((x) => x.id === s1.id)!.status).toBe('in_progress')
    expect(s.tasks.find((t) => t.id === t1.id)!.done).toBe(true) // partial progress kept
  })

  it('needs explicit completion when there are no required tasks', () => {
    const { ctx, snap, s2, t4 } = setup()
    let s = run(snap, toggleTask(snap, t4.id, ctx))
    expect(sessionProgress(s.sessions.find((x) => x.id === s2.id)!, s.tasks).state).toBe('in_progress')
    s = run(s, completeSession(s, s2.id, ctx))
    expect(sessionProgress(s.sessions.find((x) => x.id === s2.id)!, s.tasks).state).toBe('complete')
  })

  it('explicit completion checks remaining required tasks so rules stay consistent', () => {
    const { ctx, snap, s1 } = setup()
    const s = run(snap, completeSession(snap, s1.id, ctx))
    expect(s.tasks.filter((t) => t.session_id === s1.id && t.required).every((t) => t.done)).toBe(true)
  })

  it('never counts skipped work as complete', () => {
    const { ctx, snap, s2 } = setup()
    const s = run(snap, setSessionStatus(snap, s2.id, 'skipped', ctx))
    expect(sessionProgress(s.sessions.find((x) => x.id === s2.id)!, s.tasks).state).toBe('skipped')
  })
})

describe('day completion', () => {
  it('is complete only when every required block is complete; optional blocks do not block it', () => {
    const { ctx, snap, b2, s1 } = setup()
    const optional = { ...snap, blocks: snap.blocks.map((b) => (b.id === b2.id ? { ...b, required: false } : b)) }
    expect(daySummary(optional, D, true).kind).toBe('planned')
    const done = run(optional, completeSession(optional, s1.id, ctx))
    const sum = daySummary(done, D, true)
    expect(sum.kind).toBe('complete')
    expect(sum).toMatchObject({ requiredTotal: 1, requiredDone: 1 })
  })

  it('is partial when some work is done', () => {
    const { ctx, snap, t1 } = setup()
    expect(daySummary(run(snap, toggleTask(snap, t1.id, ctx)), D, true).kind).toBe('partial')
  })

  it('a skipped required block keeps the day from being complete', () => {
    const { ctx, snap, s1, s2 } = setup()
    let s = run(snap, completeSession(snap, s1.id, ctx))
    s = run(s, setSessionStatus(s, s2.id, 'skipped', ctx))
    expect(daySummary(s, D, true).kind).toBe('partial')
  })

  it('days with no required blocks, no blocks, or rest days are never "complete"', () => {
    const { ctx } = setup()
    const optionalOnly = { ...blank(), blocks: [newBlock(ctx, { date: D, required: false, status: 'completed' })] }
    expect(daySummary(optionalOnly, D, true).kind).toBe('no_required')
    expect(daySummary(blank(), D, true).kind).toBe('empty')
    expect(daySummary(blank(), D, false).kind).toBe('rest')
  })

  it('empty blocks can be completed manually', () => {
    const { ctx } = setup()
    const s = { ...blank(), blocks: [newBlock(ctx, { date: D, status: 'completed' })] }
    expect(daySummary(s, D, true).kind).toBe('complete')
  })

  it('detects when adding required work would reopen a completed day', () => {
    const { ctx, snap, s1, s2 } = setup()
    let s = run(snap, completeSession(snap, s1.id, ctx))
    s = run(s, completeSession(s, s2.id, ctx))
    expect(daySummary(s, D, true).kind).toBe('complete')
    const after = run(s, addTask(s, s1.id, { title: 'new required', required: true }, ctx))
    expect(reopenedDays(s, after)).toEqual([D])
    const afterOptional = run(s, addTask(s, s1.id, { title: 'new optional', required: false }, ctx))
    expect(reopenedDays(s, afterOptional)).toEqual([])
  })
})
