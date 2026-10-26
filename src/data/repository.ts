// The UI never talks to Supabase or localStorage directly; it goes through this
// interface. Two implementations exist: cloud (Supabase) and demo (browser-local).
import type { Change } from '../domain/changes'
import type { Note, Snapshot } from '../domain/types'

export type RepoMode = 'cloud' | 'demo'

export type SaveNoteResult =
  | { status: 'saved'; note: Note }
  | { status: 'conflict'; server: Note | null }

export interface NoteDraft {
  id: string
  title: string
  body: string
}

export interface Repository {
  readonly mode: RepoMode
  readonly userId: string
  loadAll(): Promise<Snapshot>
  apply(change: Change): Promise<{ needsReload?: boolean }>
  loadNote(id: string): Promise<Note | null>
  /**
   * Saves note content only if the stored version still equals `baseVersion`.
   * Returns a conflict (with the server copy) instead of overwriting newer edits.
   */
  saveNote(draft: NoteDraft, baseVersion: number): Promise<SaveNoteResult>
  /** Atomically replaces all of the user's data. */
  replaceAll(snapshot: Snapshot): Promise<void>
}

export class RepoError extends Error {
  readonly code: string | undefined
  readonly network: boolean

  constructor(message: string, opts: { code?: string; network?: boolean } = {}) {
    super(message)
    this.name = 'RepoError'
    this.code = opts.code
    this.network = opts.network ?? false
  }
}

export function describeError(error: unknown): string {
  if (error instanceof RepoError) {
    if (error.network) return 'Can’t reach the server. Check your connection.'
    if (error.code === '42501') return 'Permission denied. Try signing in again.'
    if (error.code === 'PGRST301' || error.code === '401') return 'Your session expired. Sign in again.'
    return error.message
  }
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}
