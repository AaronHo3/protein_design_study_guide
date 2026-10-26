// Demo-mode repository: browser-local only, never synced anywhere.
// It mimics the server contract (version checks, unique occurrences, cascades)
// and reads storage fresh on every call, so two tabs behave like two devices.
import { applyChange, type Change } from '../domain/changes'
import { emptySnapshot, TABLE_ORDER, type Note, type Snapshot } from '../domain/types'
import { RepoError, type NoteDraft, type Repository, type SaveNoteResult } from './repository'

export const DEMO_USER_ID = 'demo-user'
const STORAGE_KEY = 'study-planner.demo.v1'
const FAIL_KEY = 'study-planner.demo.simulate-failure'
const LATENCY_MS = 120

export function isFailureSimulated(): boolean {
  try {
    return localStorage.getItem(FAIL_KEY) === '1'
  } catch {
    return false
  }
}

export function setFailureSimulated(on: boolean): void {
  try {
    if (on) localStorage.setItem(FAIL_KEY, '1')
    else localStorage.removeItem(FAIL_KEY)
  } catch {
    // Storage unavailable: the toggle simply has no effect.
  }
}

export function clearDemoData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear.
  }
}

interface Options {
  storage?: Storage
  latencyMs?: number
}

export class LocalRepo implements Repository {
  readonly mode = 'demo' as const
  readonly userId = DEMO_USER_ID
  private readonly storage: Storage
  private readonly latency: number

  constructor(opts: Options = {}) {
    this.storage = opts.storage ?? localStorage
    this.latency = opts.latencyMs ?? LATENCY_MS
  }

  private async tick(): Promise<void> {
    if (this.latency) await new Promise((r) => setTimeout(r, this.latency))
    if (isFailureSimulated()) throw new RepoError('Simulated network failure (demo setting)', { network: true })
  }

  private read(): Snapshot {
    const raw = this.storage.getItem(STORAGE_KEY)
    if (!raw) return emptySnapshot()
    try {
      const parsed = JSON.parse(raw) as Partial<Snapshot>
      const snap = emptySnapshot()
      for (const t of TABLE_ORDER) (snap as Record<string, unknown[]>)[t] = (parsed[t] as unknown[]) ?? []
      return snap
    } catch {
      throw new RepoError('Demo data in this browser is corrupted. Reset it from Settings.')
    }
  }

  private write(snapshot: Snapshot): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    } catch {
      throw new RepoError('Browser storage is full or unavailable.')
    }
  }

  async loadAll(): Promise<Snapshot> {
    await this.tick()
    return this.read()
  }

  async apply(change: Change): Promise<{ needsReload?: boolean }> {
    await this.tick()
    const snap = this.read()
    const stamped = this.stamp(change)
    let next = applyChange(snap, this.dedupe(snap, stamped))
    if (change.op === 'delete' && change.table === 'sessions') next = this.cascadeSession(next, change.rows.map((r) => r.id))
    this.write(next)
    return {}
  }

  /** Server-side `updated_at` and note `version` semantics. */
  private stamp(change: Change): Change {
    if (change.op !== 'update') return change
    const patch: Record<string, unknown> = { ...change.patch, updated_at: new Date().toISOString() }
    return { ...change, patch }
  }

  /** Mirrors the unique (recurrence_id, occurrence_date) constraint with "ignore duplicates". */
  private dedupe(snap: Snapshot, change: Change): Change {
    if (change.op !== 'insert' || change.table !== 'blocks') return change
    const taken = new Set(snap.blocks.filter((b) => b.recurrence_id).map((b) => `${b.recurrence_id}|${b.occurrence_date}`))
    const rows = change.rows.filter((r) => {
      const b = r as Snapshot['blocks'][number]
      return !b.recurrence_id || !taken.has(`${b.recurrence_id}|${b.occurrence_date}`)
    })
    return { ...change, rows }
  }

  private cascadeSession(snap: Snapshot, ids: string[]): Snapshot {
    const gone = new Set(ids)
    return {
      ...snap,
      tasks: snap.tasks.filter((t) => !gone.has(t.session_id)),
      session_resources: snap.session_resources.filter((l) => !gone.has(l.session_id)),
      notes: snap.notes.map((n) => (n.session_id && gone.has(n.session_id) ? { ...n, session_id: null } : n)),
      blocks: snap.blocks.map((b) => (b.session_id && gone.has(b.session_id) ? { ...b, session_id: null } : b)),
    }
  }

  async loadNote(id: string): Promise<Note | null> {
    await this.tick()
    return this.read().notes.find((n) => n.id === id) ?? null
  }

  async saveNote(draft: NoteDraft, baseVersion: number): Promise<SaveNoteResult> {
    await this.tick()
    const snap = this.read()
    const current = snap.notes.find((n) => n.id === draft.id)
    if (!current || current.version !== baseVersion) return { status: 'conflict', server: current ?? null }
    const changed = current.body !== draft.body || current.title !== draft.title
    const note: Note = {
      ...current,
      title: draft.title,
      body: draft.body,
      version: changed ? current.version + 1 : current.version,
      updated_at: new Date().toISOString(),
    }
    this.write({ ...snap, notes: snap.notes.map((n) => (n.id === note.id ? note : n)) })
    return { status: 'saved', note }
  }

  async replaceAll(snapshot: Snapshot): Promise<void> {
    await this.tick()
    this.write(snapshot)
  }
}
