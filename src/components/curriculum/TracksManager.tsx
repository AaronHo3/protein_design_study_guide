import { Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { compact, insert, update } from '../../domain/changes'
import { archive, deleteTrack, describeDependents, moveInList, trackDependents } from '../../domain/curriculum'
import { newTrack } from '../../domain/factories'
import type { Track } from '../../domain/types'
import { cn } from '../../lib/cn'
import { act } from '../../state/actions'
import { useStore } from '../../state/store'
import { TRACK_COLORS, trackClass } from '../track'
import { Button } from '../ui/button'
import { Input } from '../ui/field'
import { Menu } from '../ui/menu'
import { deleteWithConsequences, rowMenu } from './shared'

function ColorPicker({ track }: { track: Track }) {
  return (
    <div role="radiogroup" aria-label={`Color for ${track.name}`} className="flex flex-wrap gap-1">
      {TRACK_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={track.color === c}
          aria-label={c}
          onClick={() => void act(compact([update('tracks', track, { color: c })]))}
          className={cn(`track-${c}`, 'size-5 rounded-full bg-track ring-offset-2 ring-offset-surface', track.color === c && 'ring-2 ring-fg')}
        />
      ))}
    </div>
  )
}

function TrackRow({ track, first, last }: { track: Track; first: boolean; last: boolean }) {
  const ctx = useStore((s) => s.ctx)
  const [name, setName] = useState(track.name)
  const snap = () => useStore.getState().data
  const rename = () => {
    const n = name.trim()
    if (!n) return setName(track.name)
    if (n !== track.name) void act(compact([update('tracks', track, { name: n })]))
  }
  return (
    <li className={cn(trackClass(track), 'track-bar flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-3 py-2', track.archived_at && 'opacity-60')}>
      <Input aria-label="Track name" value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} className="h-8 max-w-64 flex-1" />
      <ColorPicker track={track} />
      {track.archived_at && <span className="text-[12px] text-faint">Archived</span>}
      <div className="ml-auto">
        <Menu
          label={`Actions for ${track.name}`}
          items={rowMenu({
            first, last, archived: !!track.archived_at,
            onUp: () => void act(moveInList('tracks', snap().tracks, track.id, -1)),
            onDown: () => void act(moveInList('tracks', snap().tracks, track.id, 1)),
            onArchive: () => void act(archive(snap(), 'tracks', track.id, track.archived_at ? null : ctx.now()), { label: track.archived_at ? 'Track restored' : 'Track archived' }),
            onDelete: () => void deleteWithConsequences(track.name, describeDependents(trackDependents(snap(), track.id)), deleteTrack(snap(), track.id)),
          })}
        />
      </div>
    </li>
  )
}

export function TracksManager() {
  const tracks = useStore((s) => s.data.tracks)
  const ctx = useStore((s) => s.ctx)
  const [name, setName] = useState('')
  const sorted = [...tracks].sort((a, b) => a.position - b.position)
  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const color = TRACK_COLORS[(tracks.length + 1) % TRACK_COLORS.length]
    void act([insert('tracks', [newTrack(ctx, { name: name.trim(), color, position: tracks.length })])], { label: 'Track added' })
    setName('')
  }
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">Tracks are broad categories. Choose different tracks on different days — nothing requires finishing one before another.</p>
      <ul className="space-y-1.5">
        {sorted.map((t, i) => <TrackRow key={t.id} track={t} first={i === 0} last={i === sorted.length - 1} />)}
      </ul>
      {sorted.length === 0 && <p className="text-[13px] text-faint">No tracks yet.</p>}
      <form onSubmit={add} className="flex gap-2">
        <Input aria-label="New track name" placeholder="New track name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-64" />
        <Button type="submit" disabled={!name.trim()}><Plus /> Add track</Button>
      </form>
    </div>
  )
}
