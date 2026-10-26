import { useMemo } from 'react'
import { isValidTimezone, todayIn, weekday } from '../lib/dates'
import { newSettings } from '../domain/factories'
import type { Block, ISODate, Settings, Snapshot } from '../domain/types'
import { useStore } from './store'

const FALLBACK = newSettings({ userId: '', id: () => 'fallback', now: () => new Date(0).toISOString() })

export function settingsOf(data: Snapshot): Settings {
  return data.settings[0] ?? FALLBACK
}

export function useSettings(): Settings {
  return useStore((s) => settingsOf(s.data))
}

export function todayFor(settings: Settings): ISODate {
  return todayIn(isValidTimezone(settings.timezone) ? settings.timezone : 'UTC')
}

export function isStudyDay(settings: Settings, date: ISODate): boolean {
  return settings.study_days.includes(weekday(date))
}

export function useMaps() {
  const data = useStore((s) => s.data)
  return useMemo(
    () => ({
      tracks: new Map(data.tracks.map((t) => [t.id, t])),
      topics: new Map(data.topics.map((t) => [t.id, t])),
      stages: new Map(data.stages.map((t) => [t.id, t])),
      goals: new Map(data.goals.map((t) => [t.id, t])),
      sessions: new Map(data.sessions.map((t) => [t.id, t])),
      resources: new Map(data.resources.map((t) => [t.id, t])),
      templates: new Map(data.session_templates.map((t) => [t.id, t])),
      rules: new Map(data.recurring_blocks.map((t) => [t.id, t])),
      blockBySession: new Map(data.blocks.filter((b) => b.session_id).map((b) => [b.session_id as string, b])),
    }),
    [data],
  )
}

export type Maps = ReturnType<typeof useMaps>

export function blockTitle(block: Block, maps: Maps): string {
  const session = block.session_id ? maps.sessions.get(block.session_id) : undefined
  if (session) return session.title
  if (block.title) return block.title
  const track = block.track_id ? maps.tracks.get(block.track_id) : undefined
  return track ? `${track.name} block` : 'Open block'
}

export function activeTracks(data: Snapshot) {
  return data.tracks.filter((t) => !t.archived_at).sort((a, b) => a.position - b.position)
}

export function activeTopics(data: Snapshot) {
  return data.topics.filter((t) => !t.archived_at).sort((a, b) => a.position - b.position)
}
