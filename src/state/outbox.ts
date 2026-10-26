// Sends changes to the repository strictly in order. On failure the queue
// pauses (nothing later can land before an earlier failed change), local state
// is kept, and the user can retry or discard.
import type { Change } from '../domain/changes'
import { describeError, type Repository } from '../data/repository'

export interface OutboxState {
  pending: number
  saving: boolean
  failed: string | null
}

type Waiter = { resolve: () => void; reject: (e: Error) => void }

const isOccurrenceInsert = (c: Change) =>
  c.op === 'insert' && c.table === 'blocks' && c.rows.every((r) => (r as { recurrence_id?: string | null }).recurrence_id)

/**
 * Merges consecutive inserts into the same table into one request (order is
 * preserved). Recurring-occurrence inserts are only merged with each other,
 * because they use idempotent upserts.
 */
export function takeBatch(queue: Change[]): { change: Change; count: number } {
  const first = queue[0]
  if (first.op !== 'insert') return { change: first, count: 1 }
  const rows = [...first.rows]
  let count = 1
  while (count < queue.length) {
    const next = queue[count]
    if (next.op !== 'insert' || next.table !== first.table || isOccurrenceInsert(next) !== isOccurrenceInsert(first)) break
    rows.push(...next.rows)
    count++
  }
  return { change: { ...first, rows }, count }
}

export class Outbox {
  private queue: Change[] = []
  private running = false
  private failure: string | null = null
  private waiters: Waiter[] = []
  private readonly repo: Repository
  private readonly onState: (s: OutboxState) => void
  private readonly onNeedsReload: () => void

  constructor(repo: Repository, onState: (s: OutboxState) => void, onNeedsReload: () => void) {
    this.repo = repo
    this.onState = onState
    this.onNeedsReload = onNeedsReload
  }

  get state(): OutboxState {
    return { pending: this.queue.length, saving: this.running, failed: this.failure }
  }

  push(changes: Change[]): void {
    if (changes.length === 0) return
    this.queue.push(...changes)
    this.emit()
    void this.drain()
  }

  retry(): void {
    this.failure = null
    this.emit()
    void this.drain()
  }

  /** Drops unsent changes (the caller reloads from the server afterwards). */
  discard(): void {
    this.queue = []
    this.failure = null
    this.emit()
    this.settleWaiters()
  }

  /** Resolves once everything queued so far is saved; rejects if the queue is paused on an error. */
  whenIdle(): Promise<void> {
    if (this.failure) return Promise.reject(new Error(this.failure))
    if (!this.running && this.queue.length === 0) return Promise.resolve()
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }))
  }

  private emit(): void {
    this.onState(this.state)
  }

  private settleWaiters(): void {
    const waiters = this.waiters
    this.waiters = []
    for (const w of waiters) {
      if (this.failure) w.reject(new Error(this.failure))
      else w.resolve()
    }
  }

  private async drain(): Promise<void> {
    if (this.running || this.failure) return
    this.running = true
    this.emit()
    let reload = false
    while (this.queue.length > 0 && !this.failure) {
      const { change, count } = takeBatch(this.queue)
      try {
        const result = await this.repo.apply(change)
        if (result.needsReload) reload = true
        this.queue.splice(0, count)
      } catch (error) {
        this.failure = describeError(error)
      }
      this.emit()
    }
    this.running = false
    this.emit()
    this.settleWaiters()
    if (reload && !this.failure && this.queue.length === 0) this.onNeedsReload()
  }
}
