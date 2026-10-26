import type { Track } from '../domain/types'
import { cn } from '../lib/cn'

export const TRACK_COLORS = ['slate', 'emerald', 'sky', 'amber', 'violet', 'rose', 'teal', 'orange'] as const

export function trackClass(track: Track | undefined | null): string {
  const color = track && (TRACK_COLORS as readonly string[]).includes(track.color) ? track.color : 'slate'
  return `track-${color}`
}

export function TrackDot({ track, className }: { track?: Track | null; className?: string }) {
  return <span aria-hidden className={cn(trackClass(track), 'inline-block size-2 shrink-0 rounded-full bg-track', className)} />
}

/** Track label: always text + color, never color alone. */
export function TrackBadge({ track, className }: { track?: Track | null; className?: string }) {
  if (!track) return null
  return (
    <span
      className={cn(
        trackClass(track),
        'track-soft inline-flex max-w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-[11.5px] font-medium text-track',
        className,
      )}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-track" />
      <span className="truncate">{track.name}</span>
      {track.archived_at && <span className="text-faint">(archived)</span>}
    </span>
  )
}
