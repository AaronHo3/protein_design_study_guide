import { useEffect, useRef, useState } from 'react'
import { browserDrafts, NoteSaver, type NoteSaverState } from '../../state/noteSaver'
import { getOutbox, useStore } from '../../state/store'

export function useNoteSaver(noteId: string) {
  const note = useStore((s) => s.data.notes.find((n) => n.id === noteId))
  const repo = useStore((s) => s.repo)
  const setNoteLocal = useStore((s) => s.setNoteLocal)
  const saverRef = useRef<NoteSaver | null>(null)
  const [saver, setSaver] = useState<NoteSaver | null>(null)
  const [state, setState] = useState<NoteSaverState | null>(null)
  const hasNote = note != null

  useEffect(() => {
    const current = useStore.getState().data.notes.find((n) => n.id === noteId)
    if (!current || !repo) return
    const saver = new NoteSaver(current, {
      repo,
      drafts: browserDrafts,
      waitForQueue: () => getOutbox()?.whenIdle() ?? Promise.resolve(),
      onSaved: setNoteLocal,
      onState: setState,
    })
    saverRef.current = saver
    setSaver(saver)
    setState(saver.state)
    return () => {
      saver.dispose()
      if (saverRef.current === saver) saverRef.current = null
    }
  }, [noteId, repo, setNoteLocal, hasNote])

  useEffect(() => {
    if (note) saverRef.current?.external(note)
  }, [note])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saverRef.current?.unsaved) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  return { note, state, saver }
}
