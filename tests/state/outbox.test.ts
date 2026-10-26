import { describe, expect, it } from 'vitest'
import type { Change } from '../../src/domain/changes'
import { insert, update } from '../../src/domain/changes'
import { newTrack } from '../../src/domain/factories'
import type { Repository } from '../../src/data/repository'
import { RepoError } from '../../src/data/repository'
import { Outbox, takeBatch, type OutboxState } from '../../src/state/outbox'
import { testCtx } from '../helpers'

function fakeRepo(failTimes = 0) {
  const applied: Change[] = []
  let failures = failTimes
  const repo = {
    mode: 'demo', userId: 'u1',
    apply: async (c: Change) => {
      if (failures > 0) {
        failures--
        throw new RepoError('offline', { network: true })
      }
      applied.push(c)
      return {}
    },
  } as unknown as Repository
  return { repo, applied }
}

describe('outbox', () => {
  it('sends changes in order and resolves whenIdle', async () => {
    const { repo, applied } = fakeRepo()
    const ctx = testCtx()
    const a = newTrack(ctx, { name: 'A' })
    const box = new Outbox(repo, () => {}, () => {})
    box.push([insert('tracks', [a]), update('tracks', a, { name: 'B' })!])
    await box.whenIdle()
    expect(applied.map((c) => c.op)).toEqual(['insert', 'update'])
  })

  it('pauses on failure without dropping or reordering, and resumes on retry', async () => {
    const { repo, applied } = fakeRepo(1)
    const ctx = testCtx()
    const a = newTrack(ctx, { name: 'A' })
    const states: OutboxState[] = []
    const box = new Outbox(repo, (s) => states.push(s), () => {})
    box.push([insert('tracks', [a]), update('tracks', a, { name: 'B' })!])
    await expect(box.whenIdle()).rejects.toThrow(/reach the server/)
    expect(applied).toHaveLength(0)
    expect(box.state).toMatchObject({ pending: 2, failed: expect.stringMatching(/reach the server/) })
    box.retry()
    await box.whenIdle()
    expect(applied.map((c) => c.op)).toEqual(['insert', 'update'])
    expect(box.state).toMatchObject({ pending: 0, failed: null })
  })

  it('batches consecutive inserts into the same table', () => {
    const ctx = testCtx()
    const [a, b, c] = ['A', 'B', 'C'].map((name) => newTrack(ctx, { name }))
    const queue = [insert('tracks', [a]), insert('tracks', [b]), update('tracks', a, { name: 'Z' })!, insert('tracks', [c])]
    const first = takeBatch(queue)
    expect(first.count).toBe(2)
    expect(first.change.op === 'insert' && first.change.rows.map((r) => r.id)).toEqual([a.id, b.id])
  })
})
