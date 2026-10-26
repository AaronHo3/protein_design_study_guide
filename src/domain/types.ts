// Row types mirror the SQL schema 1:1 (snake_case) so no mapping layer is needed.
// Dates are 'YYYY-MM-DD' strings (calendar dates); timestamps are ISO strings.

export type ISODate = string
export type Timestamp = string
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7 // ISO: 1 = Monday

export type ThemePref = 'light' | 'dark' | 'system'
export type SessionStatus = 'planned' | 'in_progress' | 'completed' | 'skipped'
export type BlockStatus = 'planned' | 'completed' | 'skipped'
export type ResourceType = 'paper' | 'article' | 'video' | 'course' | 'documentation' | 'repository' | 'book' | 'other'
export type ResourceStatus = 'not_started' | 'in_progress' | 'completed'
export type PortionKind = 'chapter' | 'pages' | 'timestamp' | 'exercise' | 'other'

interface Owned {
  id: string
  user_id: string
  created_at: Timestamp
  updated_at: Timestamp
}

export interface Settings extends Owned {
  timezone: string
  theme: ThemePref
  study_days: Weekday[]
  daily_capacity_min: number
  start_date: ISODate | null
  onboarded: boolean
}

export interface Goal extends Owned {
  title: string
  description: string
  position: number
  archived_at: Timestamp | null
}

export interface Track extends Owned {
  name: string
  color: string
  position: number
  archived_at: Timestamp | null
}

export interface Stage extends Owned {
  title: string
  description: string
  position: number
  est_weeks_min: number | null
  est_weeks_max: number | null
  archived_at: Timestamp | null
}

export interface Topic extends Owned {
  title: string
  description: string
  parent_id: string | null
  stage_id: string | null
  track_ids: string[]
  goal_ids: string[]
  position: number
  archived_at: Timestamp | null
}

export interface Checkpoint extends Owned {
  stage_id: string | null
  title: string
  description: string
  achieved_at: Timestamp | null
  evidence: string
  position: number
  archived_at: Timestamp | null
}

export interface TaskBlueprint {
  title: string
  description: string
  required: boolean
  est_min: number | null
  output: string
}

export interface SessionTemplate extends Owned {
  name: string
  title: string
  description: string
  track_id: string | null
  topic_id: string | null
  planned_min: number | null
  output: string
  tasks: TaskBlueprint[]
  archived_at: Timestamp | null
}

export interface Session extends Owned {
  title: string
  description: string
  track_id: string | null
  topic_id: string | null
  template_id: string | null
  status: SessionStatus
  output: string
  planned_min: number | null
  actual_min: number | null
  completed_at: Timestamp | null
  archived_at: Timestamp | null
}

export interface Task extends Owned {
  session_id: string
  position: number
  title: string
  description: string
  required: boolean
  done: boolean
  done_at: Timestamp | null
  est_min: number | null
  output: string
}

export interface Resource extends Owned {
  title: string
  url: string | null
  type: ResourceType
  description: string
  tags: string[]
  track_ids: string[]
  topic_ids: string[]
  stage_ids: string[]
  status: ResourceStatus
  archived_at: Timestamp | null
}

export interface SessionResource extends Owned {
  session_id: string
  resource_id: string
  portion_kind: PortionKind | null
  portion: string
  portion_done: boolean
  position: number
}

export interface RecurringBlock extends Owned {
  title: string
  track_id: string | null
  weekdays: Weekday[]
  start_time: string | null // 'HH:MM' wall clock in settings.timezone
  duration_min: number
  required: boolean
  starts_on: ISODate
  ends_on: ISODate | null
  archived_at: Timestamp | null
}

export interface MoveRecord {
  from: ISODate
  to: ISODate
  at: Timestamp
}

export interface Block extends Owned {
  date: ISODate
  position: number
  start_time: string | null
  duration_min: number
  required: boolean
  title: string
  track_id: string | null
  session_id: string | null
  status: BlockStatus
  recurrence_id: string | null
  occurrence_date: ISODate | null
  detached: boolean
  history: MoveRecord[]
}

export interface Note extends Owned {
  title: string
  body: string
  session_id: string | null
  topic_id: string | null
  date: ISODate | null
  version: number
}

export interface Tables {
  settings: Settings
  goals: Goal
  tracks: Track
  stages: Stage
  topics: Topic
  checkpoints: Checkpoint
  session_templates: SessionTemplate
  sessions: Session
  tasks: Task
  resources: Resource
  session_resources: SessionResource
  recurring_blocks: RecurringBlock
  blocks: Block
  notes: Note
}

export type TableName = keyof Tables
export type Row<T extends TableName> = Tables[T]
export type Snapshot = { [K in TableName]: Tables[K][] }

// Parents before children: the order inserts must happen in.
export const TABLE_ORDER: TableName[] = [
  'settings', 'goals', 'tracks', 'stages', 'topics', 'checkpoints',
  'session_templates', 'resources', 'sessions', 'tasks', 'session_resources',
  'notes', 'recurring_blocks', 'blocks',
]

export function emptySnapshot(): Snapshot {
  return Object.fromEntries(TABLE_ORDER.map((t) => [t, []])) as unknown as Snapshot
}
