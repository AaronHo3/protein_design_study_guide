import { describe, expect, it } from 'vitest'
import { update } from '../../src/domain/changes'
import { newBlock, newNote, newResource, newSession, newSessionResource, newTask } from '../../src/domain/factories'
import {
  deleteSession, duplicateSession, moveTaskToSession, sessionFromTemplate, splitSession, templateFromSession,
} from '../../src/domain/sessions'
import { blank, run, testCtx } from '../helpers'

function setup() {
  const ctx = testCtx()
  const s = newSession(ctx, { title: 'Attention', output: 'Shape diagram', status: 'in_progress', actual_min: 50 })
  const t1 = newTask(ctx, { session_id: s.id, title: 'Read', description: 'pp. 1-10', done: true, position: 0 })
  const t2 = newTask(ctx, { session_id: s.id, title: 'Code', required: true, position: 1 })
  const t3 = newTask(ctx, { session_id: s.id, title: 'Explain', required: false, position: 2 })
  const r = newResource(ctx, { title: 'Paper' })
  const link = newSessionResource(ctx, { session_id: s.id, resource_id: r.id, portion: '§3', portion_done: true })
  const note = newNote(ctx, { session_id: s.id, body: 'private thoughts' })
  const snap = { ...blank(), sessions: [s], tasks: [t1, t2, t3], resources: [r], session_resources: [link], notes: [note] }
  return { ctx, snap, s, t1, t2, t3, r, link, note }
}

describe('duplicating sessions', () => {
  it('copies task structure and resource links, resets completion, and skips notes by default', () => {
    const { ctx, snap, s, r } = setup()
    const after = run(snap, duplicateSession(snap, s.id, ctx))
    const copy = after.sessions.find((x) => x.id !== s.id)!
    expect(copy).toMatchObject({ title: 'Attention (copy)', status: 'planned', actual_min: null, output: 'Shape diagram' })
    const tasks = after.tasks.filter((t) => t.session_id === copy.id)
    expect(tasks.map((t) => [t.title, t.done, t.required])).toEqual([['Read', false, true], ['Code', false, true], ['Explain', false, false]])
    const links = after.session_resources.filter((l) => l.session_id === copy.id)
    expect(links).toEqual([expect.objectContaining({ resource_id: r.id, portion: '§3', portion_done: false })])
    expect(after.resources).toHaveLength(1) // same underlying resource
    expect(after.notes.filter((n) => n.session_id === copy.id)).toHaveLength(0)
  })

  it('copies notes only when explicitly asked', () => {
    const { ctx, snap, s } = setup()
    const after = run(snap, duplicateSession(snap, s.id, ctx, { includeNotes: true }))
    expect(after.notes.filter((n) => n.session_id !== s.id).map((n) => n.body)).toEqual(['private thoughts'])
  })
})

describe('splitting and moving tasks', () => {
  it('moves chosen tasks (with their state) into a new backlog session', () => {
    const { ctx, snap, s, t1 } = setup()
    const after = run(snap, splitSession(snap, s.id, [t1.id], 'Attention — reading', ctx))
    const part = after.sessions.find((x) => x.id !== s.id)!
    const moved = after.tasks.find((t) => t.id === t1.id)!
    expect(moved).toMatchObject({ session_id: part.id, done: true, description: 'pp. 1-10' })
    expect(after.tasks).toHaveLength(3)
    expect(after.blocks).toHaveLength(0)
  })

  it('moving a task between sessions preserves completion and description, and updates status', () => {
    const { ctx, snap, s, t1 } = setup()
    const target = newSession(ctx, { title: 'Target' })
    const state = { ...snap, sessions: [...snap.sessions, target] }
    const after = run(state, moveTaskToSession(state, t1.id, target.id, ctx))
    expect(after.tasks.find((t) => t.id === t1.id)).toMatchObject({ session_id: target.id, done: true, description: 'pp. 1-10' })
    // target's only required task is done → completed
    expect(after.sessions.find((x) => x.id === target.id)!.status).toBe('completed')
    expect(after.sessions.find((x) => x.id === s.id)!.status).toBe('in_progress')
  })
})

describe('templates', () => {
  it('editing a template never rewrites sessions created from it', () => {
    const { ctx, snap, s } = setup()
    let state = run(snap, templateFromSession(snap, s.id, 'Paper reading', ctx))
    const tpl = state.session_templates[0]
    expect(tpl.tasks.map((t) => t.title)).toEqual(['Read', 'Code', 'Explain'])

    const { session, changes } = sessionFromTemplate(tpl, ctx, { title: 'Transformers' })
    state = run(state, changes)
    expect(session.template_id).toBe(tpl.id)
    const before = state.tasks.filter((t) => t.session_id === session.id)

    state = run(state, [update('session_templates', tpl, { tasks: [{ ...tpl.tasks[0], title: 'Skim' }], name: 'Renamed' })!])
    expect(state.tasks.filter((t) => t.session_id === session.id)).toEqual(before)
    expect(state.sessions.find((x) => x.id === session.id)!.title).toBe('Transformers')
  })
})

describe('deleting sessions', () => {
  it('keeps notes (unattached) and removes the placement', () => {
    const { ctx, snap, s, note } = setup()
    const block = newBlock(ctx, { date: '2026-11-02', session_id: s.id })
    const state = { ...snap, blocks: [block] }
    const after = run(state, deleteSession(state, s.id))
    expect(after.sessions).toHaveLength(0)
    expect(after.tasks).toHaveLength(0)
    expect(after.session_resources).toHaveLength(0)
    expect(after.resources).toHaveLength(1)
    expect(after.blocks).toHaveLength(0)
    expect(after.notes).toEqual([{ ...note, session_id: null }])
  })
})
