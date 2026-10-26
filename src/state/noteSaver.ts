// Autosave for one note.
// - "Saved" is only shown after the repository confirms the write.
// - Every keystroke is mirrored to a local draft; the draft is only cleared once
//   the server has the same content, so failed saves never lose text.
// - Saves are conditional on the version we loaded; a newer version from another
//   device becomes a conflict the user resolves, never a silent overwrite.
import type { Note } from '../domain/types'
import { describeError, type Repository } from '../data/repository'

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict'

export interface NoteSaverState {
  title: string
  body: string
  baseVersion: number
  status: SaveStatus
  error: string | null
  conflict: Note | null
  serverMissing: boolean
  recoveredDraft: boolean
}

export interface DraftStore {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

export const browserDrafts: DraftStore = {
  get: (k) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      // Storage full/blocked: autosave still works, only crash recovery is lost.
    }
  },
  remove: (k) => {
    try {
      localStorage.removeItem(k)
    } catch {
      // ignore
    }
  },
}

interface Draft {
  title: string
  body: string
  baseVersion: number
  savedAt: string
}

export function draftKey(userId: string, noteId: string): string {
  return `study-planner.draft.${userId}.${noteId}`
}

export function hasDraft(drafts: DraftStore, userId: string, noteId: string): boolean {
  return drafts.get(draftKey(userId, noteId)) != null
}

interface Deps {
  repo: Repository
  drafts: DraftStore
  /** Resolves once queued structural changes (e.g. the note's insert) have landed. */
  waitForQueue: () => Promise<void>
  onSaved: (note: Note) => void
  onState: (s: NoteSaverState) => void
  debounceMs?: number
}

export class NoteSaver {
  private s: NoteSaverState
  private readonly key: string
  private timer: ReturnType<typeof setTimeout> | null = null
  private inFlight: Promise<void> | null = null
  private disposed = false
  private readonly deps: Deps
  private readonly noteId: string

  constructor(note: Note, deps: Deps) {
    this.deps = deps
    this.noteId = note.id
    this.key = draftKey(deps.repo.userId, note.id)
    this.s = {
      title: note.title, body: note.body, baseVersion: note.version, status: 'idle', error: null,
      conflict: null, serverMissing: false, recoveredDraft: false,
    }
    const raw = deps.drafts.get(this.key)
    if (raw) {
      try {
        const draft = JSON.parse(raw) as Draft
        if (draft.body !== note.body || draft.title !== note.title) {
          this.s = { ...this.s, title: draft.title, body: draft.body, baseVersion: draft.baseVersion, status: 'dirty', recoveredDraft: true }
        } else {
          deps.drafts.remove(this.key)
        }
      } catch {
        deps.drafts.remove(this.key)
      }
    }
  }

  get state(): NoteSaverState {
    return this.s
  }

  private set(patch: Partial<NoteSaverState>): void {
    this.s = { ...this.s, ...patch }
    if (!this.disposed) this.deps.onState(this.s)
  }

  private writeDraft(): void {
    const draft: Draft = { title: this.s.title, body: this.s.body, baseVersion: this.s.baseVersion, savedAt: new Date().toISOString() }
    this.deps.drafts.set(this.key, JSON.stringify(draft))
  }

  edit(patch: { title?: string; body?: string }): void {
    this.set({ ...patch, status: this.s.status === 'conflict' ? 'conflict' : 'dirty', error: null })
    this.writeDraft()
    if (this.s.status !== 'conflict') this.schedule()
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.save(), this.deps.debounceMs ?? 900)
  }

  /** Saves immediately (e.g. on blur or Retry). */
  async save(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.inFlight) {
      await this.inFlight
      if (this.s.status === 'dirty') return this.save()
      return
    }
    if (this.s.status !== 'dirty' && this.s.status !== 'error') return
    this.inFlight = this.doSave().finally(() => (this.inFlight = null))
    return this.inFlight
  }

  private async doSave(): Promise<void> {
    const sent = { title: this.s.title, body: this.s.body }
    this.set({ status: 'saving', error: null })
    try {
      await this.deps.waitForQueue()
      const result = await this.deps.repo.saveNote({ id: this.noteId, ...sent }, this.s.baseVersion)
      // A "conflict" whose server copy already equals what we sent is our own
      // earlier save whose response was lost — treat it as saved.
      const own = result.status === 'conflict' && result.server && result.server.body === sent.body && result.server.title === sent.title
      if (result.status === 'conflict' && !own) {
        this.set({ status: 'conflict', conflict: result.server, serverMissing: result.server === null })
        return
      }
      const note = result.status === 'saved' ? result.note : result.server!
      this.deps.onSaved(note)
      const unchanged = this.s.title === sent.title && this.s.body === sent.body
      this.set({ baseVersion: note.version, status: unchanged ? 'saved' : 'dirty', recoveredDraft: false })
      if (unchanged) this.deps.drafts.remove(this.key)
      else {
        this.writeDraft()
        this.schedule()
      }
    } catch (error) {
      this.set({ status: 'error', error: describeError(error) })
    }
  }

  /** Conflict: overwrite the server copy with mine (the other edit stays in history only if copied first). */
  async keepMine(): Promise<void> {
    if (!this.s.conflict) return
    this.set({ baseVersion: this.s.conflict.version, conflict: null, status: 'dirty' })
    this.writeDraft()
    await this.save()
  }

  /** Conflict: discard my edits and load the server copy. */
  useTheirs(): void {
    const server = this.s.conflict
    if (!server) return
    this.deps.drafts.remove(this.key)
    this.deps.onSaved(server)
    this.set({ title: server.title, body: server.body, baseVersion: server.version, conflict: null, status: 'saved', recoveredDraft: false })
  }

  /** The store reloaded this note; adopt newer server content only if I have no local edits. */
  external(note: Note): void {
    if (note.version <= this.s.baseVersion) return
    if (this.s.status === 'idle' || this.s.status === 'saved') {
      this.set({ title: note.title, body: note.body, baseVersion: note.version })
    }
  }

  discardDraft(server: Note): void {
    this.deps.drafts.remove(this.key)
    this.set({ title: server.title, body: server.body, baseVersion: server.version, status: 'idle', recoveredDraft: false, error: null })
  }

  get unsaved(): boolean {
    return ['dirty', 'saving', 'error', 'conflict'].includes(this.s.status)
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    if (this.s.status === 'dirty') void this.save()
    this.disposed = true
  }
}
