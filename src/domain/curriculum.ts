// Curriculum maintenance: ordering, archiving and consequence-aware deletion.
// Many-to-many links are stored as id arrays, so deletion explicitly removes the
// id from every array that references it (foreign keys can't do that).
import { compact, remove, update, type Change } from './changes'
import type { Snapshot, TableName } from './types'

interface Positioned {
  id: string
  position: number
}

/** Swaps an item with its neighbour and renumbers the list. */
export function moveInList<T extends TableName>(table: T, rows: (Positioned & Snapshot[T][number])[], id: string, delta: -1 | 1): Change[] {
  const list = [...rows].sort((a, b) => a.position - b.position)
  const i = list.findIndex((r) => r.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= list.length) return []
  ;[list[i], list[j]] = [list[j], list[i]]
  return compact(list.map((r, idx) => update(table, r as never, { position: idx } as never)))
}

export function archive<T extends 'goals' | 'tracks' | 'stages' | 'topics' | 'resources' | 'session_templates' | 'checkpoints'>(
  snapshot: Snapshot, table: T, id: string, at: string | null,
): Change[] {
  const row = (snapshot[table] as { id: string }[]).find((r) => r.id === id)
  return row ? compact([update(table, row as never, { archived_at: at } as never)]) : []
}

export interface Dependents {
  sessions: number
  topics: number
  resources: number
  templates: number
  blocks: number
  notes: number
  checkpoints: number
  rules: number
}

const none = (): Dependents => ({ sessions: 0, topics: 0, resources: 0, templates: 0, blocks: 0, notes: 0, checkpoints: 0, rules: 0 })

export function trackDependents(s: Snapshot, id: string): Dependents {
  return {
    ...none(),
    sessions: s.sessions.filter((x) => x.track_id === id).length,
    topics: s.topics.filter((x) => x.track_ids.includes(id)).length,
    resources: s.resources.filter((x) => x.track_ids.includes(id)).length,
    templates: s.session_templates.filter((x) => x.track_id === id).length,
    blocks: s.blocks.filter((x) => x.track_id === id).length,
    rules: s.recurring_blocks.filter((x) => x.track_id === id).length,
  }
}

export function topicDependents(s: Snapshot, id: string): Dependents {
  return {
    ...none(),
    sessions: s.sessions.filter((x) => x.topic_id === id).length,
    topics: s.topics.filter((x) => x.parent_id === id).length,
    resources: s.resources.filter((x) => x.topic_ids.includes(id)).length,
    templates: s.session_templates.filter((x) => x.topic_id === id).length,
    notes: s.notes.filter((x) => x.topic_id === id).length,
  }
}

export function stageDependents(s: Snapshot, id: string): Dependents {
  return {
    ...none(),
    topics: s.topics.filter((x) => x.stage_id === id).length,
    resources: s.resources.filter((x) => x.stage_ids.includes(id)).length,
    checkpoints: s.checkpoints.filter((x) => x.stage_id === id).length,
  }
}

export function goalDependents(s: Snapshot, id: string): Dependents {
  return { ...none(), topics: s.topics.filter((x) => x.goal_ids.includes(id)).length }
}

export function hasDependents(d: Dependents): boolean {
  return Object.values(d).some((n) => n > 0)
}

export function describeDependents(d: Dependents): string[] {
  const parts: [number, string][] = [
    [d.sessions, 'session(s) will lose this link'],
    [d.topics, 'topic(s) will lose this link'],
    [d.resources, 'resource(s) will lose this link'],
    [d.templates, 'template(s) will lose this link'],
    [d.blocks, 'calendar block(s) will lose this link'],
    [d.rules, 'recurring block(s) will lose this link'],
    [d.notes, 'note(s) will lose this link (the notes are kept)'],
    [d.checkpoints, 'checkpoint(s) will no longer belong to a stage'],
  ]
  return parts.filter(([n]) => n > 0).map(([n, text]) => `${n} ${text}`)
}

export function deleteTrack(s: Snapshot, id: string): Change[] {
  const track = s.tracks.find((t) => t.id === id)
  if (!track) return []
  return compact([
    ...s.sessions.filter((x) => x.track_id === id).map((x) => update('sessions', x, { track_id: null })),
    ...s.topics.filter((x) => x.track_ids.includes(id)).map((x) => update('topics', x, { track_ids: x.track_ids.filter((t) => t !== id) })),
    ...s.resources.filter((x) => x.track_ids.includes(id)).map((x) => update('resources', x, { track_ids: x.track_ids.filter((t) => t !== id) })),
    ...s.session_templates.filter((x) => x.track_id === id).map((x) => update('session_templates', x, { track_id: null })),
    ...s.blocks.filter((x) => x.track_id === id).map((x) => update('blocks', x, { track_id: null })),
    ...s.recurring_blocks.filter((x) => x.track_id === id).map((x) => update('recurring_blocks', x, { track_id: null })),
    remove('tracks', [track]),
  ])
}

export function deleteTopic(s: Snapshot, id: string): Change[] {
  const topic = s.topics.find((t) => t.id === id)
  if (!topic) return []
  return compact([
    ...s.topics.filter((x) => x.parent_id === id).map((x) => update('topics', x, { parent_id: topic.parent_id })),
    ...s.sessions.filter((x) => x.topic_id === id).map((x) => update('sessions', x, { topic_id: null })),
    ...s.resources.filter((x) => x.topic_ids.includes(id)).map((x) => update('resources', x, { topic_ids: x.topic_ids.filter((t) => t !== id) })),
    ...s.session_templates.filter((x) => x.topic_id === id).map((x) => update('session_templates', x, { topic_id: null })),
    ...s.notes.filter((x) => x.topic_id === id).map((x) => update('notes', x, { topic_id: null })),
    remove('topics', [topic]),
  ])
}

export function deleteStage(s: Snapshot, id: string): Change[] {
  const stage = s.stages.find((t) => t.id === id)
  if (!stage) return []
  return compact([
    ...s.topics.filter((x) => x.stage_id === id).map((x) => update('topics', x, { stage_id: null })),
    ...s.resources.filter((x) => x.stage_ids.includes(id)).map((x) => update('resources', x, { stage_ids: x.stage_ids.filter((t) => t !== id) })),
    ...s.checkpoints.filter((x) => x.stage_id === id).map((x) => update('checkpoints', x, { stage_id: null })),
    remove('stages', [stage]),
  ])
}

export function deleteGoal(s: Snapshot, id: string): Change[] {
  const goal = s.goals.find((t) => t.id === id)
  if (!goal) return []
  return compact([
    ...s.topics.filter((x) => x.goal_ids.includes(id)).map((x) => update('topics', x, { goal_ids: x.goal_ids.filter((t) => t !== id) })),
    remove('goals', [goal]),
  ])
}

export function deleteResource(s: Snapshot, id: string): Change[] {
  const resource = s.resources.find((r) => r.id === id)
  if (!resource) return []
  const links = s.session_resources.filter((l) => l.resource_id === id)
  return compact([links.length ? remove('session_resources', links) : null, remove('resources', [resource])])
}

/** Topic ids including all descendants (for filtering by a parent topic). */
export function topicSubtree(s: Snapshot, id: string): Set<string> {
  const out = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const t of s.topics) {
      if (t.parent_id && out.has(t.parent_id) && !out.has(t.id)) {
        out.add(t.id)
        grew = true
      }
    }
  }
  return out
}
