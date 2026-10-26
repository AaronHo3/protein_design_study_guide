import { describe, expect, it } from 'vitest'
import { newBlock, newRecurringBlock, newSession } from '../../src/domain/factories'
import {
  applyRecurrenceEdit, endRecurrence, generateOccurrences, planOccurrences, previewRecurrenceEdit,
} from '../../src/domain/recurrence'
import { moveBlock } from '../../src/domain/scheduling'
import { blank, run, testCtx } from '../helpers'

function setup() {
  const ctx = testCtx()
  const rule = newRecurringBlock(ctx, { title: 'Biology', weekdays: [1, 3, 5], starts_on: '2026-11-02', duration_min: 120 })
  return { ctx, rule, snap: { ...blank(), recurring_blocks: [rule] } }
}

describe('recurrence generation', () => {
  it('creates occurrences only for the requested range and rule weekdays', () => {
    const { ctx, snap } = setup()
    const blocks = planOccurrences(snap, '2026-10-26', '2026-11-08', ctx)
    expect(blocks.map((b) => b.date)).toEqual(['2026-11-02', '2026-11-04', '2026-11-06'])
  })

  it('is idempotent, even after an occurrence was moved', () => {
    const { ctx, snap } = setup()
    let state = run(snap, generateOccurrences(snap, '2026-11-02', '2026-11-08', ctx))
    expect(state.blocks).toHaveLength(3)
    state = run(state, generateOccurrences(state, '2026-11-02', '2026-11-08', ctx))
    expect(state.blocks).toHaveLength(3)

    const monday = state.blocks.find((b) => b.date === '2026-11-02')!
    state = run(state, moveBlock(state, monday.id, '2026-11-03', undefined, ctx))
    state = run(state, generateOccurrences(state, '2026-11-02', '2026-11-08', ctx))
    expect(state.blocks).toHaveLength(3)
    expect(state.blocks.map((b) => b.date).sort()).toEqual(['2026-11-03', '2026-11-04', '2026-11-06'])
  })

  it('respects end dates and archived rules', () => {
    const { ctx, rule } = setup()
    const ended = { ...blank(), recurring_blocks: [{ ...rule, ends_on: '2026-11-04' }] }
    expect(planOccurrences(ended, '2026-11-01', '2026-11-30', ctx).map((b) => b.date)).toEqual(['2026-11-02', '2026-11-04'])
    const archived = { ...blank(), recurring_blocks: [{ ...rule, archived_at: '2026-11-01T00:00:00Z' }] }
    expect(planOccurrences(archived, '2026-11-01', '2026-11-30', ctx)).toHaveLength(0)
  })
})

describe('recurrence edits', () => {
  function generated() {
    const { ctx, rule, snap } = setup()
    const state = run(snap, generateOccurrences(snap, '2026-11-02', '2026-11-13', ctx))
    const byDate = (d: string) => state.blocks.find((b) => b.date === d)!
    // 11-02 completed, 11-04 detached, 11-06 holds a session
    const session = newSession(ctx, { title: 'Real work' })
    const blocks = state.blocks.map((b) =>
      b.id === byDate('2026-11-02').id ? { ...b, status: 'completed' as const }
        : b.id === byDate('2026-11-04').id ? { ...b, detached: true }
          : b.id === byDate('2026-11-06').id ? { ...b, session_id: session.id } : b,
    )
    return { ctx, rule, state: { ...state, sessions: [session], blocks } }
  }

  it('"future" updates unfinished occurrences but never completed or detached ones', () => {
    const { rule, state } = generated()
    const fields = { duration_min: 90 }
    const preview = previewRecurrenceEdit(state, rule.id, 'future', '2026-11-01', undefined, fields)
    const after = run(state, applyRecurrenceEdit(state, rule.id, preview, fields))
    const dur = (d: string) => after.blocks.find((b) => b.date === d)!.duration_min
    expect(dur('2026-11-02')).toBe(120) // completed history preserved
    expect(dur('2026-11-04')).toBe(120) // detached occurrence untouched
    expect(dur('2026-11-06')).toBe(90)
    expect(dur('2026-11-09')).toBe(90)
    expect(after.recurring_blocks[0].duration_min).toBe(90)
  })

  it('"template" changes only the rule', () => {
    const { rule, state } = generated()
    const preview = previewRecurrenceEdit(state, rule.id, 'template', '2026-11-01')
    const after = run(state, applyRecurrenceEdit(state, rule.id, preview, { duration_min: 30 }))
    expect(after.blocks).toEqual(state.blocks)
    expect(after.recurring_blocks[0].duration_min).toBe(30)
  })

  it('"occurrence" changes one block and detaches it from future edits', () => {
    const { rule, state } = generated()
    const target = state.blocks.find((b) => b.date === '2026-11-09')!
    const preview = previewRecurrenceEdit(state, rule.id, 'occurrence', '2026-11-09', target.id)
    const after = run(state, applyRecurrenceEdit(state, rule.id, preview, { title: 'Lab day' }))
    expect(after.blocks.find((b) => b.id === target.id)).toMatchObject({ title: 'Lab day', detached: true })
    expect(after.recurring_blocks[0].title).toBe('Biology')
  })

  it('dropping a weekday removes only empty unfinished occurrences, keeping ones with sessions', () => {
    const { rule, state } = generated()
    const fields = { weekdays: [3 as const] } // Wednesdays only
    const preview = previewRecurrenceEdit(state, rule.id, 'future', '2026-11-01', undefined, fields)
    expect(preview.removed.map((b) => b.date)).toEqual(['2026-11-09', '2026-11-13'])
    expect(preview.kept.map((b) => b.date).sort()).toEqual(['2026-11-02', '2026-11-04', '2026-11-06'])
  })

  it('ending a rule keeps completed history and occurrences holding sessions', () => {
    const { ctx, rule, state } = generated()
    const extra = newBlock(ctx, { date: '2026-11-11', recurrence_id: rule.id, occurrence_date: '2026-11-11', status: 'completed' })
    const s = { ...state, blocks: [...state.blocks, extra] }
    const after = run(s, endRecurrence(s, rule.id, '2026-11-01'))
    expect(after.blocks.map((b) => b.date).sort()).toEqual(['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-11'])
  })
})
