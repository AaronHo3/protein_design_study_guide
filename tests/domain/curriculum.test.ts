import { describe, expect, it } from 'vitest'
import { deleteResource, deleteTopic, deleteTrack, moveInList, topicSubtree, trackDependents } from '../../src/domain/curriculum'
import { newResource, newSession, newSessionResource, newTopic, newTrack } from '../../src/domain/factories'
import { blank, run, testCtx } from '../helpers'

describe('curriculum maintenance', () => {
  it('deleting a track clears every reference, including id arrays', () => {
    const ctx = testCtx()
    const t = newTrack(ctx, { name: 'Bio' })
    const other = newTrack(ctx, { name: 'Comp' })
    const topic = newTopic(ctx, { title: 'Kinetics', track_ids: [t.id, other.id] })
    const s = newSession(ctx, { title: 'S', track_id: t.id })
    const r = newResource(ctx, { title: 'R', track_ids: [t.id] })
    const snap = { ...blank(), tracks: [t, other], topics: [topic], sessions: [s], resources: [r] }
    expect(trackDependents(snap, t.id)).toMatchObject({ sessions: 1, topics: 1, resources: 1 })
    const after = run(snap, deleteTrack(snap, t.id))
    expect(after.tracks.map((x) => x.id)).toEqual([other.id])
    expect(after.topics[0].track_ids).toEqual([other.id])
    expect(after.sessions[0].track_id).toBeNull()
    expect(after.resources[0].track_ids).toEqual([])
  })

  it('deleting a topic re-parents its subtopics and keeps sessions', () => {
    const ctx = testCtx()
    const root = newTopic(ctx, { title: 'Root' })
    const mid = newTopic(ctx, { title: 'Mid', parent_id: root.id })
    const leaf = newTopic(ctx, { title: 'Leaf', parent_id: mid.id })
    const s = newSession(ctx, { title: 'S', topic_id: mid.id })
    const snap = { ...blank(), topics: [root, mid, leaf], sessions: [s] }
    expect([...topicSubtree(snap, root.id)].sort()).toEqual([root.id, mid.id, leaf.id].sort())
    const after = run(snap, deleteTopic(snap, mid.id))
    expect(after.topics.find((x) => x.id === leaf.id)!.parent_id).toBe(root.id)
    expect(after.sessions[0]).toMatchObject({ id: s.id, topic_id: null })
  })

  it('deleting a resource removes its session links but not the sessions', () => {
    const ctx = testCtx()
    const s = newSession(ctx, { title: 'S' })
    const r = newResource(ctx, { title: 'R' })
    const l = newSessionResource(ctx, { session_id: s.id, resource_id: r.id })
    const snap = { ...blank(), sessions: [s], resources: [r], session_resources: [l] }
    const after = run(snap, deleteResource(snap, r.id))
    expect(after.resources).toHaveLength(0)
    expect(after.session_resources).toHaveLength(0)
    expect(after.sessions).toHaveLength(1)
  })

  it('reorders with contiguous positions', () => {
    const ctx = testCtx()
    const a = newTrack(ctx, { name: 'A', position: 0 })
    const b = newTrack(ctx, { name: 'B', position: 1 })
    const c = newTrack(ctx, { name: 'C', position: 2 })
    const snap = { ...blank(), tracks: [a, b, c] }
    const after = run(snap, moveInList('tracks', snap.tracks, c.id, -1))
    expect([...after.tracks].sort((x, y) => x.position - y.position).map((t) => t.name)).toEqual(['A', 'C', 'B'])
  })
})
