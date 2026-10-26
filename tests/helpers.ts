import { applyChanges, type Change } from '../src/domain/changes'
import type { Ctx } from '../src/domain/factories'
import { emptySnapshot, type Snapshot } from '../src/domain/types'

export function testCtx(): Ctx {
  let n = 0
  let t = Date.parse('2026-11-01T12:00:00Z')
  return {
    userId: 'u1',
    id: () => {
      n++
      return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
    },
    now: () => new Date((t += 1000)).toISOString(),
  }
}

export function run(snapshot: Snapshot, changes: Change[]): Snapshot {
  return applyChanges(snapshot, changes)
}

export function blank(): Snapshot {
  return emptySnapshot()
}
