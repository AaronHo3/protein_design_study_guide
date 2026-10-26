import { describe, expect, it } from 'vitest'
import { buildStudyGuide, planStudyGuide } from '../../src/domain/studyGuide'
import { buildTemplate } from '../../src/domain/template'
import { blank, run, testCtx } from '../helpers'

describe('study guide calendar placement', () => {
  it('schedules the backlog in track order, reuses sample slots and is idempotent', () => {
    const ctx = testCtx()
    const opts = {tracks:true,goal:true,roadmap:true,structure:true,schedule:true,sampleWeek:true}
    const base = run(blank(), buildTemplate(blank(),opts,ctx,{startDate:'2026-11-02',studyDays:[1,2,3,4,5]}))
    const data = run(base,buildStudyGuide(base,ctx))
    const plan = planStudyGuide(data,'2026-11-02',ctx)
    expect(plan.placements).toHaveLength(59)
    expect(plan.placements[0]).toMatchObject({date:'2026-11-02',title:'Atoms, amino acids and peptide bonds'})
    expect(plan.placements.filter(p=>p.replaced)).toHaveLength(15)
    const scheduled = run(data,plan.changes)
    expect(scheduled.blocks.filter(b=>b.date==='2026-11-02')).toHaveLength(3)
    expect(planStudyGuide(scheduled,'2026-11-02',ctx).placements).toHaveLength(0)
    expect(scheduled.sessions).toHaveLength(data.sessions.length)
  })
  it('protects sample work when a task is completed or a note exists', () => {
    const ctx = testCtx()
    const opts = {tracks:true,goal:false,roadmap:false,structure:false,schedule:true,sampleWeek:true}
    const base = run(blank(), buildTemplate(blank(),opts,ctx,{startDate:'2026-11-02',studyDays:[1,2,3,4,5]}))
    const data = run(base,buildStudyGuide(base,ctx))
    const originalBlock = data.blocks[0]
    const protectedData = {...data,tasks:data.tasks.map(t=>t.session_id===originalBlock.session_id ? {...t,done:true}:t)}
    const plan = planStudyGuide(protectedData,'2026-11-02',ctx)
    const result = run(protectedData, plan.changes)
    expect(result.blocks.find(b=>b.id===originalBlock.id)?.session_id).toBe(originalBlock.session_id)
    expect(result.tasks.find(t=>t.session_id===originalBlock.session_id)?.done).toBe(true)
  })
})
