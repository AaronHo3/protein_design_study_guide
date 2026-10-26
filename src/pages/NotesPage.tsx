import { Download, Plus } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { NoteEditor } from '../components/notes/NoteEditor'
import { useOpenSession } from '../components/session/useOpenSession'
import { TrackBadge } from '../components/track'
import { Button } from '../components/ui/button'
import { Input, Select } from '../components/ui/field'
import { Empty, PageHeader } from '../components/ui/misc'
import { notesToMarkdown } from '../domain/backup'
import { insert } from '../domain/changes'
import { topicSubtree } from '../domain/curriculum'
import { newNote } from '../domain/factories'
import type { Note } from '../domain/types'
import { formatShortDate } from '../lib/dates'
import { downloadText } from '../lib/download'
import { cn } from '../lib/cn'
import { act } from '../state/actions'
import { activeTopics, activeTracks, todayFor, useMaps, useSettings } from '../state/selectors'
import { useStore } from '../state/store'

export function NotesPage() {
  const data = useStore((s) => s.data)
  const ctx = useStore((s) => s.ctx)
  const settings = useSettings()
  const maps = useMaps()
  const { open } = useOpenSession()
  const [query, setQuery] = useState('')
  const [trackId, setTrackId] = useState('')
  const [topicId, setTopicId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  /** A note's date: its session's calendar date, else its own date, else creation day. */
  const dateOf = useCallback(
    (n: Note) => (n.session_id && maps.blockBySession.get(n.session_id)?.date) || n.date || n.created_at.slice(0, 10),
    [maps],
  )

  const notes = useMemo(() => {
    const q = query.toLowerCase().trim()
    const topicIds = topicId ? topicSubtree(data, topicId) : null
    return data.notes
      .filter((n) => {
        const session = n.session_id ? maps.sessions.get(n.session_id) : undefined
        if (trackId && session?.track_id !== trackId) return false
        if (topicIds && !topicIds.has(n.topic_id ?? session?.topic_id ?? '')) return false
        const d = dateOf(n)
        if (from && d < from) return false
        if (to && d > to) return false
        if (q && !`${n.title}\n${n.body}\n${session?.title ?? ''}`.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => dateOf(b).localeCompare(dateOf(a)) || b.updated_at.localeCompare(a.updated_at))
  }, [data, maps, dateOf, query, trackId, topicId, from, to])

  const createNote = async () => {
    const note = newNote(ctx, { date: todayFor(settings), topic_id: topicId || null })
    await act([insert('notes', [note])])
    setSelected(note.id)
  }

  const exportMd = () => downloadText(`study-notes-${todayFor(settings)}.md`, notesToMarkdown(data), 'text/markdown')

  return (
    <div>
      <PageHeader
        title="Notes"
        subtitle="Everything you’ve written, searchable. Notes stay attached to their session wherever it moves."
        actions={
          <>
            <Button size="sm" onClick={exportMd} disabled={data.notes.length === 0}><Download /> Export Markdown</Button>
            <Button size="sm" variant="primary" onClick={() => void createNote()}><Plus /> New note</Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input aria-label="Search notes" placeholder="Search notes…" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-64" />
        <Select aria-label="Filter by track" value={trackId} onChange={(e) => setTrackId(e.target.value)} className="w-44">
          <option value="">All tracks</option>
          {activeTracks(data).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Select aria-label="Filter by topic" value={topicId} onChange={(e) => setTopicId(e.target.value)} className="w-48">
          <option value="">All topics</option>
          {activeTopics(data).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </Select>
        <label className="flex items-center gap-1 text-[13px] text-muted">From <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-38" /></label>
        <label className="flex items-center gap-1 text-[13px] text-muted">To <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-38" /></label>
      </div>

      {data.notes.length === 0 ? (
        <Empty title="No notes yet">Write notes inside any session, on a day, or here.</Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <ul className="space-y-1.5" aria-label="Notes">
            {notes.length === 0 && <li className="text-sm text-muted">No notes match.</li>}
            {notes.map((n) => {
              const session = n.session_id ? maps.sessions.get(n.session_id) : undefined
              const topic = maps.topics.get(n.topic_id ?? session?.topic_id ?? '')
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(n.id)}
                    aria-current={selected === n.id}
                    className={cn('w-full rounded-lg border px-3 py-2 text-left transition-colors hover:border-line-strong', selected === n.id ? 'border-accent bg-accent-soft' : 'border-line bg-surface')}
                  >
                    <span className="flex items-center gap-2 text-[12px] text-faint">
                      {formatShortDate(dateOf(n))}
                      <TrackBadge track={maps.tracks.get(session?.track_id ?? '')} />
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-medium">{n.title || session?.title || topic?.title || 'Untitled note'}</span>
                    <span className="line-clamp-2 text-[12.5px] text-muted">{n.body.slice(0, 200) || 'Empty'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="lg:sticky lg:top-4 lg:self-start">
            {selected && data.notes.some((n) => n.id === selected) ? (
              <div className="space-y-2">
                {(() => {
                  const n = data.notes.find((x) => x.id === selected)!
                  const session = n.session_id ? maps.sessions.get(n.session_id) : undefined
                  return session ? (
                    <p className="text-[13px] text-muted">
                      From session{' '}
                      <button type="button" className="font-medium text-accent hover:underline" onClick={() => open(session.id)}>{session.title}</button>
                    </p>
                  ) : (
                    <p className="text-[13px] text-faint">{n.date ? `Day note for ${formatShortDate(n.date)}` : 'Freeform note'}</p>
                  )
                })()}
                <NoteEditor key={selected} noteId={selected} onDeleted={() => setSelected(null)} />
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-faint">Select a note to read or edit it.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
