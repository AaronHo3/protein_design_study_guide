import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalRepo, setFailureSimulated } from '../../src/data/localRepo'
import { insert } from '../../src/domain/changes'
import { newNote } from '../../src/domain/factories'
import type { Note } from '../../src/domain/types'
import { NoteSaver, draftKey, type DraftStore, type NoteSaverState } from '../../src/state/noteSaver'
import { testCtx } from '../helpers'

class MemoryStorage implements Storage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  clear() { this.m.clear() }
  getItem(k: string) { return this.m.get(k) ?? null }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  removeItem(k: string) { this.m.delete(k) }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
}

let storage: MemoryStorage

beforeEach(() => {
  storage = new MemoryStorage()
  ;(globalThis as { localStorage?: Storage }).localStorage = storage // failure flag lives here
})
afterEach(() => setFailureSimulated(false))

const drafts = (): DraftStore => ({
  get: (k) => storage.getItem(k),
  set: (k, v) => storage.setItem(k, v),
  remove: (k) => storage.removeItem(k),
})

async function setup() {
  const repo = new LocalRepo({ storage, latencyMs: 0 })
  const note = { ...newNote(testCtx(), { body: 'v1' }), user_id: repo.userId }
  await repo.apply(insert('notes', [note]))
  return { repo, note }
}

function saver(repo: LocalRepo, note: Note, states: NoteSaverState[] = [], saved: Note[] = []) {
  return new NoteSaver(note, {
    repo, drafts: drafts(), waitForQueue: async () => {}, debounceMs: 10_000,
    onSaved: (n) => saved.push(n), onState: (s) => states.push(s),
  })
}

describe('note autosave', () => {
  it('reports Saved only after the repository confirms', async () => {
    const { repo, note } = await setup()
    const states: NoteSaverState[] = []
    const s = saver(repo, note, states)
    s.edit({ body: 'v2' })
    expect(s.state.status).toBe('dirty')
    const pending = s.save()
    expect(s.state.status).toBe('saving')
    await pending
    expect(s.state.status).toBe('saved')
    expect((await repo.loadNote(note.id))!.body).toBe('v2')
    expect(states.map((x) => x.status)).toEqual(['dirty', 'saving', 'saved'])
  })

  it('keeps a local draft when saving fails, then recovers it after a reload and retries', async () => {
    const { repo, note } = await setup()
    const s = saver(repo, note)
    setFailureSimulated(true)
    s.edit({ body: 'important thought' })
    await s.save()
    expect(s.state.status).toBe('error')
    expect(s.state.error).toMatch(/connection/i)
    expect(storage.getItem(draftKey(repo.userId, note.id))).toContain('important thought')

    // Simulate a page reload: a new saver for the server copy picks up the draft.
    setFailureSimulated(false)
    const server = (await repo.loadNote(note.id))!
    expect(server.body).toBe('v1')
    const again = saver(repo, server)
    expect(again.state).toMatchObject({ body: 'important thought', status: 'dirty', recoveredDraft: true })
    await again.save()
    expect(again.state.status).toBe('saved')
    expect((await repo.loadNote(note.id))!.body).toBe('important thought')
    expect(storage.getItem(draftKey(repo.userId, note.id))).toBeNull()
  })

  it('detects a conflicting edit from another device instead of overwriting it', async () => {
    const { repo, note } = await setup()
    const laptop = saver(repo, note)
    const phone = saver(repo, note)
    phone.edit({ body: 'from phone' })
    await phone.save()
    laptop.edit({ body: 'from laptop' })
    await laptop.save()
    expect(laptop.state.status).toBe('conflict')
    expect(laptop.state.conflict?.body).toBe('from phone')
    expect((await repo.loadNote(note.id))!.body).toBe('from phone') // not overwritten
  })

  it('resolves conflicts either way, recoverably', async () => {
    const { repo, note } = await setup()
    const a = saver(repo, note)
    const b = saver(repo, note)
    b.edit({ body: 'theirs' })
    await b.save()
    a.edit({ body: 'mine' })
    await a.save()
    await a.keepMine()
    expect(a.state.status).toBe('saved')
    expect((await repo.loadNote(note.id))!.body).toBe('mine')

    b.edit({ body: 'theirs again' })
    await b.save()
    expect(b.state.status).toBe('conflict')
    b.useTheirs()
    expect(b.state).toMatchObject({ body: 'mine', status: 'saved' })
  })

  it('treats a save whose response was lost as saved, not as a conflict', async () => {
    const { repo, note } = await setup()
    const s = saver(repo, note)
    s.edit({ body: 'landed' })
    // The write reaches storage, but the client never hears back.
    await repo.saveNote({ id: note.id, title: '', body: 'landed' }, note.version)
    await s.save()
    expect(s.state.status).toBe('saved')
    expect(s.state.baseVersion).toBe(note.version + 1)
  })

  it('does not adopt server content over unsaved local edits', async () => {
    const { repo, note } = await setup()
    const s = saver(repo, note)
    s.edit({ body: 'local' })
    s.external({ ...note, body: 'remote', version: 5 })
    expect(s.state.body).toBe('local')
  })
})
