// Backup export/import. Files are validated with zod, normalized to complete
// rows, checked for duplicate IDs and dangling references, and previewed before
// anything is written.
import { z } from 'zod'
import { isISODate } from '../lib/dates'
import { TABLE_ORDER, emptySnapshot, type Snapshot, type TableName } from './types'

export const BACKUP_FORMAT = 'study-planner-backup'
export const BACKUP_VERSION = 1

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid id')
const nullableUuid = uuid.nullable().default(null)
const date = z.string().refine(isISODate, 'Invalid date (expected YYYY-MM-DD)')
const ts = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid timestamp')
const nullableTs = ts.nullable().default(null)
const text = (max: number) => z.string().max(max).default('')
const minutes = z.number().int().min(0).max(1440).nullable().default(null)
const weekdays = z.array(z.number().int().min(1).max(7)).default([])
const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).transform((s) => s.slice(0, 5)).nullable().default(null)
const ids = z.array(uuid).default([])
const now = () => new Date().toISOString()

const owned = {
  id: uuid,
  user_id: z.string().optional(),
  created_at: ts.default(now),
  updated_at: ts.default(now),
}

const blueprint = z.object({
  title: z.string().min(1).max(1000),
  description: text(20000),
  required: z.boolean().default(false),
  est_min: minutes,
  output: text(5000),
})

export const schemas = {
  settings: z.object({
    ...owned,
    timezone: z.string().min(1).max(64).default('UTC'),
    theme: z.enum(['light', 'dark', 'system']).default('system'),
    study_days: weekdays,
    daily_capacity_min: z.number().int().min(0).max(1440).default(360),
    start_date: date.nullable().default(null),
    onboarded: z.boolean().default(true),
  }),
  goals: z.object({
    ...owned, title: z.string().min(1).max(500), description: text(20000),
    position: z.number().int().default(0), archived_at: nullableTs,
  }),
  tracks: z.object({
    ...owned, name: z.string().min(1).max(200), color: z.string().min(1).max(32).default('slate'),
    position: z.number().int().default(0), archived_at: nullableTs,
  }),
  stages: z.object({
    ...owned, title: z.string().min(1).max(500), description: text(20000), position: z.number().int().default(0),
    est_weeks_min: z.number().int().min(0).max(520).nullable().default(null),
    est_weeks_max: z.number().int().min(0).max(520).nullable().default(null),
    archived_at: nullableTs,
  }),
  topics: z.object({
    ...owned, title: z.string().min(1).max(500), description: text(20000), parent_id: nullableUuid,
    stage_id: nullableUuid, track_ids: ids, goal_ids: ids, position: z.number().int().default(0),
    archived_at: nullableTs,
  }),
  checkpoints: z.object({
    ...owned, stage_id: nullableUuid, title: z.string().min(1).max(1000), description: text(20000),
    achieved_at: nullableTs, evidence: text(20000), position: z.number().int().default(0), archived_at: nullableTs,
  }),
  session_templates: z.object({
    ...owned, name: z.string().min(1).max(300), title: text(500), description: text(20000),
    track_id: nullableUuid, topic_id: nullableUuid, planned_min: minutes, output: text(5000),
    tasks: z.array(blueprint).default([]), archived_at: nullableTs,
  }),
  sessions: z.object({
    ...owned, title: z.string().min(1).max(500), description: text(20000), track_id: nullableUuid,
    topic_id: nullableUuid, template_id: nullableUuid,
    status: z.enum(['planned', 'in_progress', 'completed', 'skipped']).default('planned'),
    output: text(5000), planned_min: minutes, actual_min: minutes, completed_at: nullableTs, archived_at: nullableTs,
  }),
  tasks: z.object({
    ...owned, session_id: uuid, position: z.number().int().default(0), title: z.string().min(1).max(1000),
    description: text(20000), required: z.boolean().default(true), done: z.boolean().default(false),
    done_at: nullableTs, est_min: minutes, output: text(5000),
  }),
  resources: z.object({
    ...owned, title: z.string().min(1).max(1000),
    url: z.string().max(2048).regex(/^https?:\/\//i, 'URL must start with http:// or https://').nullable().default(null),
    type: z.enum(['paper', 'article', 'video', 'course', 'documentation', 'repository', 'book', 'other']).default('other'),
    description: text(20000), tags: z.array(z.string().max(100)).default([]), track_ids: ids, topic_ids: ids,
    stage_ids: ids, status: z.enum(['not_started', 'in_progress', 'completed']).default('not_started'),
    archived_at: nullableTs,
  }),
  session_resources: z.object({
    ...owned, session_id: uuid, resource_id: uuid,
    portion_kind: z.enum(['chapter', 'pages', 'timestamp', 'exercise', 'other']).nullable().default(null),
    portion: text(1000), portion_done: z.boolean().default(false), position: z.number().int().default(0),
  }),
  recurring_blocks: z.object({
    ...owned, title: text(500), track_id: nullableUuid, weekdays, start_time: time,
    duration_min: z.number().int().min(5).max(1440).default(60), required: z.boolean().default(true),
    starts_on: date, ends_on: date.nullable().default(null), archived_at: nullableTs,
  }).refine((r) => r.ends_on == null || r.ends_on >= r.starts_on, { message: 'ends_on is before starts_on', path: ['ends_on'] }),
  blocks: z.object({
    ...owned, date, position: z.number().int().default(0), start_time: time,
    duration_min: z.number().int().min(5).max(1440).default(60), required: z.boolean().default(true),
    title: text(500), track_id: nullableUuid, session_id: nullableUuid,
    status: z.enum(['planned', 'completed', 'skipped']).default('planned'), recurrence_id: nullableUuid,
    occurrence_date: date.nullable().default(null), detached: z.boolean().default(false),
    history: z.array(z.object({ from: date, to: date, at: ts })).default([]),
  }),
  notes: z.object({
    ...owned, title: text(500), body: text(200000), session_id: nullableUuid, topic_id: nullableUuid,
    date: date.nullable().default(null), version: z.number().int().min(1).default(1),
  }),
} satisfies Record<TableName, z.ZodTypeAny>

const fileSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().min(1).max(BACKUP_VERSION),
  exported_at: ts.optional(),
  data: z.record(z.string(), z.unknown()),
})

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  exported_at: string
  data: Snapshot
}

export function makeBackup(snapshot: Snapshot): BackupFile {
  const data = Object.fromEntries(
    TABLE_ORDER.map((t) => [t, (snapshot[t] as { user_id?: string }[]).map(({ user_id: _omit, ...rest }) => rest)]),
  ) as unknown as Snapshot
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exported_at: new Date().toISOString(), data }
}

export type ParseResult =
  | { ok: true; snapshot: Snapshot; warnings: string[]; exportedAt: string | null }
  | { ok: false; errors: string[] }

/** Parses and validates a backup file's text. Never throws. */
export function parseBackup(raw: string): ParseResult {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'] }
  }
  const file = fileSchema.safeParse(json)
  if (!file.success) {
    return { ok: false, errors: ['This is not a study planner backup (missing or unsupported format/version).'] }
  }

  const errors: string[] = []
  const snapshot = emptySnapshot()
  for (const table of TABLE_ORDER) {
    const value = file.data.data[table]
    if (value === undefined) continue
    if (!Array.isArray(value)) {
      errors.push(`"${table}" must be a list.`)
      continue
    }
    const rows: unknown[] = []
    value.forEach((row, i) => {
      const parsed = schemas[table].safeParse(row)
      if (parsed.success) rows.push(parsed.data)
      else {
        const issue = parsed.error.issues[0]
        errors.push(`${table}[${i}]${issue?.path.length ? '.' + issue.path.join('.') : ''}: ${issue?.message ?? 'invalid'}`)
      }
    })
    ;(snapshot as Record<TableName, unknown[]>)[table] = rows
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, 20) }

  const dupes = duplicateIds(snapshot)
  if (dupes.length) return { ok: false, errors: dupes.map((d) => `Duplicate id ${d.id} in ${d.table}.`).slice(0, 20) }

  const { snapshot: repaired, warnings } = repairReferences(snapshot)
  return { ok: true, snapshot: repaired, warnings, exportedAt: file.data.exported_at ?? null }
}

export function duplicateIds(snapshot: Snapshot): { table: TableName; id: string }[] {
  const out: { table: TableName; id: string }[] = []
  for (const table of TABLE_ORDER) {
    const seen = new Set<string>()
    for (const row of snapshot[table] as { id: string }[]) {
      if (seen.has(row.id)) out.push({ table, id: row.id })
      seen.add(row.id)
    }
  }
  return out
}

/**
 * Makes relationships consistent: optional links to missing records are cleared,
 * children whose required parent is missing are dropped, and uniqueness rules
 * (one block per session, one occurrence per rule/date, one settings row) hold.
 */
export function repairReferences(input: Snapshot): { snapshot: Snapshot; warnings: string[] } {
  const warnings: string[] = []
  const has = (t: TableName) => new Set((input[t] as { id: string }[]).map((r) => r.id))
  const tracks = has('tracks'), topics = has('topics'), stages = has('stages'), goals = has('goals')
  const sessions = has('sessions'), resources = has('resources'), templates = has('session_templates')
  const rules = has('recurring_blocks')
  let cleared = 0
  const ref = (id: string | null, set: Set<string>) => {
    if (id && !set.has(id)) {
      cleared++
      return null
    }
    return id
  }
  const refs = (list: string[], set: Set<string>) => {
    const kept = list.filter((id) => set.has(id))
    cleared += list.length - kept.length
    return kept
  }

  const dropOrphans = <T extends { session_id: string }>(rows: T[], extra?: (r: T) => boolean) => {
    const kept = rows.filter((r) => sessions.has(r.session_id) && (extra ? extra(r) : true))
    return { kept, dropped: rows.length - kept.length }
  }
  const tasks = dropOrphans(input.tasks)
  const links = dropOrphans(input.session_resources, (r) => resources.has(r.resource_id))
  if (tasks.dropped) warnings.push(`${tasks.dropped} task(s) referenced missing sessions and will be skipped.`)
  if (links.dropped) warnings.push(`${links.dropped} resource link(s) referenced missing records and will be skipped.`)

  const seenSessions = new Set<string>()
  const seenOccurrences = new Set<string>()
  let unlinkedBlocks = 0
  let droppedOccurrences = 0
  const blocks = input.blocks.flatMap((b) => {
    let session_id = ref(b.session_id, sessions)
    if (session_id && seenSessions.has(session_id)) {
      session_id = null
      unlinkedBlocks++
    }
    if (session_id) seenSessions.add(session_id)
    const recurrence_id = ref(b.recurrence_id, rules)
    // Mirrors the DB unique key, which only constrains rows with both values set.
    const key = `${recurrence_id}|${b.occurrence_date}`
    const keyed = recurrence_id != null && b.occurrence_date != null
    if (keyed && seenOccurrences.has(key)) {
      droppedOccurrences++
      return []
    }
    if (keyed) seenOccurrences.add(key)
    return [{ ...b, session_id, recurrence_id, track_id: ref(b.track_id, tracks) }]
  })
  if (unlinkedBlocks) warnings.push(`${unlinkedBlocks} extra calendar placement(s) for the same session were unlinked.`)
  if (droppedOccurrences) warnings.push(`${droppedOccurrences} duplicate recurring occurrence(s) will be skipped.`)

  if (input.settings.length > 1) warnings.push('Multiple settings rows found; only the first is used.')

  const snapshot: Snapshot = {
    settings: input.settings.slice(0, 1),
    goals: input.goals,
    tracks: input.tracks,
    stages: input.stages,
    topics: input.topics.map((t) => ({
      ...t, parent_id: ref(t.parent_id, topics), stage_id: ref(t.stage_id, stages),
      track_ids: refs(t.track_ids, tracks), goal_ids: refs(t.goal_ids, goals),
    })),
    checkpoints: input.checkpoints.map((c) => ({ ...c, stage_id: ref(c.stage_id, stages) })),
    session_templates: input.session_templates.map((s) => ({
      ...s, track_id: ref(s.track_id, tracks), topic_id: ref(s.topic_id, topics),
    })),
    resources: input.resources.map((r) => ({
      ...r, track_ids: refs(r.track_ids, tracks), topic_ids: refs(r.topic_ids, topics), stage_ids: refs(r.stage_ids, stages),
    })),
    sessions: input.sessions.map((s) => ({
      ...s, track_id: ref(s.track_id, tracks), topic_id: ref(s.topic_id, topics), template_id: ref(s.template_id, templates),
    })),
    tasks: tasks.kept,
    session_resources: links.kept,
    notes: input.notes.map((n) => ({ ...n, session_id: ref(n.session_id, sessions), topic_id: ref(n.topic_id, topics) })),
    recurring_blocks: input.recurring_blocks.map((r) => ({ ...r, track_id: ref(r.track_id, tracks) })),
    blocks,
  }
  if (cleared) warnings.push(`${cleared} link(s) to missing records were cleared.`)
  return { snapshot, warnings }
}

export interface ImportSummary {
  table: TableName
  incoming: number
  added: number
  updated: number
  unchanged: number
}

/**
 * Merge: records are matched by id. New ids are added; for ids present on both
 * sides the more recently updated version wins. Your current settings are kept.
 * Nothing that exists only in your current data is removed.
 */
export function mergeSnapshots(current: Snapshot, incoming: Snapshot): { snapshot: Snapshot; summary: ImportSummary[] } {
  const summary: ImportSummary[] = []
  const merged = emptySnapshot() as Record<TableName, { id: string; updated_at: string }[]>
  for (const table of TABLE_ORDER) {
    const cur = current[table] as { id: string; updated_at: string }[]
    const inc = incoming[table] as { id: string; updated_at: string }[]
    if (table === 'settings') {
      merged.settings = cur.length ? cur : inc.slice(0, 1)
      summary.push({ table, incoming: inc.length, added: cur.length ? 0 : inc.length ? 1 : 0, updated: 0, unchanged: cur.length ? inc.length : 0 })
      continue
    }
    const byId = new Map(cur.map((r) => [r.id, r]))
    let added = 0, updated = 0, unchanged = 0
    for (const row of inc) {
      const existing = byId.get(row.id)
      if (!existing) {
        byId.set(row.id, row)
        added++
      } else if (Date.parse(row.updated_at) > Date.parse(existing.updated_at)) {
        byId.set(row.id, row)
        updated++
      } else unchanged++
    }
    merged[table] = [...byId.values()]
    summary.push({ table, incoming: inc.length, added, updated, unchanged })
  }
  const { snapshot } = repairReferences(merged as unknown as Snapshot)
  return { snapshot, summary }
}

const ID_FIELDS = ['parent_id', 'stage_id', 'track_id', 'topic_id', 'template_id', 'session_id', 'resource_id', 'recurrence_id']
const ID_ARRAY_FIELDS = ['track_ids', 'goal_ids', 'topic_ids', 'stage_ids']

/**
 * Gives every record a fresh id and rewrites every reference consistently.
 * Used to import a backup that came from another account (whose ids already
 * exist in the database) as an independent copy.
 */
export function remapIds(snapshot: Snapshot, newId: () => string = () => crypto.randomUUID()): Snapshot {
  const map = new Map<string, string>()
  for (const t of TABLE_ORDER) for (const r of snapshot[t] as { id: string }[]) map.set(r.id, newId())
  const swap = (id: unknown) => (typeof id === 'string' && map.has(id) ? map.get(id)! : id)
  return Object.fromEntries(
    TABLE_ORDER.map((t) => [
      t,
      (snapshot[t] as unknown as Record<string, unknown>[]).map((row) => {
        const next: Record<string, unknown> = { ...row, id: swap(row.id) }
        for (const f of ID_FIELDS) if (f in row) next[f] = swap(row[f])
        for (const f of ID_ARRAY_FIELDS) if (Array.isArray(row[f])) next[f] = (row[f] as unknown[]).map(swap)
        return next
      }),
    ]),
  ) as unknown as Snapshot
}

export function countRows(snapshot: Snapshot): Record<TableName, number> {
  return Object.fromEntries(TABLE_ORDER.map((t) => [t, snapshot[t].length])) as Record<TableName, number>
}

/** Forces ownership onto every row before sending a snapshot to storage. */
export function withOwner(snapshot: Snapshot, userId: string): Snapshot {
  return Object.fromEntries(
    TABLE_ORDER.map((t) => [t, (snapshot[t] as object[]).map((r) => ({ ...r, user_id: userId }))]),
  ) as unknown as Snapshot
}

export function notesToMarkdown(snapshot: Snapshot): string {
  const sessionById = new Map(snapshot.sessions.map((s) => [s.id, s]))
  const topicById = new Map(snapshot.topics.map((t) => [t.id, t]))
  const trackById = new Map(snapshot.tracks.map((t) => [t.id, t]))
  const dateOf = (n: Snapshot['notes'][number]) =>
    snapshot.blocks.find((b) => b.session_id && b.session_id === n.session_id)?.date ?? n.date ?? n.created_at.slice(0, 10)

  const notes = [...snapshot.notes].sort((a, b) => dateOf(a).localeCompare(dateOf(b)) || a.created_at.localeCompare(b.created_at))
  const parts = [`# Study notes\n\nExported ${new Date().toISOString().slice(0, 10)} · ${notes.length} note(s)\n`]
  for (const n of notes) {
    const session = n.session_id ? sessionById.get(n.session_id) : undefined
    const topic = topicById.get(n.topic_id ?? session?.topic_id ?? '')
    const track = session?.track_id ? trackById.get(session.track_id) : undefined
    const heading = n.title || session?.title || topic?.title || 'Untitled note'
    const meta = [
      `Date: ${dateOf(n)}`,
      session ? `Session: ${session.title}` : null,
      track ? `Track: ${track.name}` : null,
      topic ? `Topic: ${topic.title}` : null,
    ].filter(Boolean)
    parts.push(`## ${heading}\n\n_${meta.join(' · ')}_\n\n${n.body.trim() || '_(empty)_'}\n`)
  }
  return parts.join('\n')
}
