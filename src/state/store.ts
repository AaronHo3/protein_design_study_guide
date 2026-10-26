// Single in-memory copy of the signed-in user's data. Every mutation is a list
// of Changes: applied locally first (instant UI), then sent through the outbox.
import { create } from 'zustand'
import { applyChanges, invertChanges, type Change } from '../domain/changes'
import { defaultCtx, type Ctx } from '../domain/factories'
import { emptySnapshot, type Note, type Snapshot } from '../domain/types'
import { describeError, type Repository } from '../data/repository'
import { Outbox, type OutboxState } from './outbox'
import { toast } from './toasts'

interface UndoEntry {
  id: number
  label: string
  inverse: Change[]
}

export interface CommitOptions {
  /** Shown in a toast with an Undo action. Omit for silent, non-undoable changes. */
  label?: string
  undoable?: boolean
}

interface AppState {
  phase: 'idle' | 'loading' | 'ready' | 'error'
  loadError: string | null
  repo: Repository | null
  ctx: Ctx
  data: Snapshot
  sync: OutboxState
  undoStack: UndoEntry[]
  init: (repo: Repository) => Promise<void>
  reset: () => void
  reload: (opts?: { force?: boolean }) => Promise<void>
  commit: (changes: Change[], opts?: CommitOptions) => void
  undo: (id?: number) => void
  retrySync: () => void
  discardUnsaved: () => Promise<void>
  setNoteLocal: (note: Note) => void
  replaceAll: (snapshot: Snapshot) => Promise<void>
}

let outbox: Outbox | null = null
let undoSeq = 1
// Bumped on every local commit; a reload that started before a commit is stale.
let commitGen = 0
const MAX_UNDO = 30

export function getOutbox(): Outbox | null {
  return outbox
}

export const useStore = create<AppState>((set, get) => ({
  phase: 'idle',
  loadError: null,
  repo: null,
  ctx: defaultCtx('anonymous'),
  data: emptySnapshot(),
  sync: { pending: 0, saving: false, failed: null },
  undoStack: [],

  init: async (repo) => {
    outbox = new Outbox(
      repo,
      (sync) => set({ sync }),
      () => void get().reload(),
    )
    set({ repo, ctx: defaultCtx(repo.userId), phase: 'loading', loadError: null, undoStack: [] })
    try {
      const data = await repo.loadAll()
      if (get().repo !== repo) return
      set({ data, phase: 'ready' })
    } catch (error) {
      set({ phase: 'error', loadError: describeError(error) })
    }
  },

  reset: () => {
    outbox = null
    set({ phase: 'idle', repo: null, data: emptySnapshot(), undoStack: [], sync: { pending: 0, saving: false, failed: null } })
  },

  reload: async ({ force = false } = {}) => {
    const { repo, sync } = get()
    if (!repo) return
    // Never replace optimistic local state while changes are still unsent.
    if (!force && (sync.pending > 0 || sync.failed)) return
    const gen = commitGen
    try {
      const data = await repo.loadAll()
      if (get().repo !== repo) return
      if (!force && (gen !== commitGen || get().sync.pending > 0 || get().sync.failed)) return
      // If the server copy differs (e.g. another device changed it), older undo
      // entries could overwrite those changes, so they are dropped.
      const changed = JSON.stringify(data) !== JSON.stringify(get().data)
      set({ data, phase: 'ready', loadError: null, ...(changed ? { undoStack: [] } : {}) })
    } catch (error) {
      if (get().phase !== 'ready') set({ phase: 'error', loadError: describeError(error) })
    }
  },

  commit: (changes, opts = {}) => {
    if (changes.length === 0) return
    commitGen++
    set({ data: applyChanges(get().data, changes) })
    outbox?.push(changes)
    if (opts.label) {
      if (opts.undoable === false) {
        toast(opts.label)
        return
      }
      const entry: UndoEntry = { id: undoSeq++, label: opts.label, inverse: invertChanges(changes) }
      set({ undoStack: [...get().undoStack.slice(-(MAX_UNDO - 1)), entry] })
      toast(opts.label, { label: 'Undo', run: () => get().undo(entry.id) })
    }
  },

  undo: (id) => {
    const stack = get().undoStack
    const entry = stack[stack.length - 1]
    if (!entry) return
    if (id != null && entry.id !== id) {
      toast('Only the most recent change can be undone.')
      return
    }
    commitGen++
    set({ undoStack: stack.slice(0, -1) })
    set({ data: applyChanges(get().data, entry.inverse) })
    outbox?.push(entry.inverse)
    toast(`Undid: ${entry.label}`)
  },

  retrySync: () => outbox?.retry(),

  discardUnsaved: async () => {
    outbox?.discard()
    set({ undoStack: [] })
    await get().reload({ force: true })
  },

  setNoteLocal: (note) => {
    const data = get().data
    const exists = data.notes.some((n) => n.id === note.id)
    set({
      data: { ...data, notes: exists ? data.notes.map((n) => (n.id === note.id ? note : n)) : [...data.notes, note] },
    })
  },

  replaceAll: async (snapshot) => {
    const repo = get().repo
    if (!repo) throw new Error('Not ready')
    await outbox?.whenIdle()
    await repo.replaceAll(snapshot)
    // Show what the server now holds even if the follow-up reload fails.
    commitGen++
    set({ undoStack: [], data: snapshot })
    await get().reload({ force: true })
  },
}))

/** Convenience for components: current data plus a commit function. */
export function useData(): Snapshot {
  return useStore((s) => s.data)
}
