import { describe, expect, it } from 'vitest'
import { buildStudyGuide } from '../../src/domain/studyGuide'
import { blank, run, testCtx } from '../helpers'

describe('optional study guide', () => {
  it('creates unscheduled, actionable lessons with linked resources and can be imported twice', () => {
    const ctx = testCtx()
    const first = run(blank(), buildStudyGuide(blank(), ctx))
    expect(first.stages).toHaveLength(6)
    expect(first.sessions.length).toBeGreaterThan(50)
    expect(first.blocks).toHaveLength(0)
    expect(first.sessions.every(s => s.topic_id && s.track_id && s.output)).toBe(true)
    expect(first.sessions.every(s => first.tasks.filter(t => t.session_id === s.id).length >= 3)).toBe(true)
    expect(first.sessions.every(s => first.session_resources.some(r => r.session_id === s.id && first.resources.some(x => x.id === r.resource_id)))).toBe(true)
    expect(buildStudyGuide(first, ctx)).toHaveLength(0)
  })
  it('preserves existing notes, progress, sessions, and stages', () => {
    const ctx = testCtx()
    const first = run(blank(), buildStudyGuide(blank(), ctx))
    const changed = { ...first, sessions: first.sessions.map((s,i)=>i===0 ? {...s, status: 'completed' as const} : s) }
    const second = run(changed, buildStudyGuide(changed, ctx))
    expect(second.sessions[0].status).toBe('completed')
    expect(second.sessions).toHaveLength(first.sessions.length)
    expect(second.stages).toHaveLength(6)
  })
})
