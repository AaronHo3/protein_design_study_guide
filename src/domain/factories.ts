// Row constructors with schema defaults. Client-generated UUIDs give every row a
// stable identity before it reaches the server, which makes optimistic updates,
// undo and import/export straightforward.
import type {
  Block, Checkpoint, Goal, Note, RecurringBlock, Resource, Session, SessionResource,
  SessionTemplate, Settings, Stage, Task, Topic, Track,
} from './types'

export interface Ctx {
  userId: string
  now: () => string
  id: () => string
}

export function defaultCtx(userId: string): Ctx {
  return { userId, now: () => new Date().toISOString(), id: () => crypto.randomUUID() }
}

function base(ctx: Ctx) {
  const now = ctx.now()
  return { id: ctx.id(), user_id: ctx.userId, created_at: now, updated_at: now }
}

export function newSettings(ctx: Ctx, p: Partial<Settings> = {}): Settings {
  return {
    ...base(ctx), timezone: 'UTC', theme: 'system', study_days: [1, 2, 3, 4, 5],
    daily_capacity_min: 360, start_date: null, onboarded: false, ...p,
  }
}

export function newGoal(ctx: Ctx, p: Partial<Goal> & { title: string }): Goal {
  return { ...base(ctx), description: '', position: 0, archived_at: null, ...p }
}

export function newTrack(ctx: Ctx, p: Partial<Track> & { name: string }): Track {
  return { ...base(ctx), color: 'slate', position: 0, archived_at: null, ...p }
}

export function newStage(ctx: Ctx, p: Partial<Stage> & { title: string }): Stage {
  return {
    ...base(ctx), description: '', position: 0, est_weeks_min: null, est_weeks_max: null,
    archived_at: null, ...p,
  }
}

export function newTopic(ctx: Ctx, p: Partial<Topic> & { title: string }): Topic {
  return {
    ...base(ctx), description: '', parent_id: null, stage_id: null, track_ids: [], goal_ids: [],
    position: 0, archived_at: null, ...p,
  }
}

export function newCheckpoint(ctx: Ctx, p: Partial<Checkpoint> & { title: string }): Checkpoint {
  return {
    ...base(ctx), stage_id: null, description: '', achieved_at: null, evidence: '', position: 0,
    archived_at: null, ...p,
  }
}

export function newSessionTemplate(ctx: Ctx, p: Partial<SessionTemplate> & { name: string }): SessionTemplate {
  return {
    ...base(ctx), title: '', description: '', track_id: null, topic_id: null, planned_min: null,
    output: '', tasks: [], archived_at: null, ...p,
  }
}

export function newSession(ctx: Ctx, p: Partial<Session> & { title: string }): Session {
  return {
    ...base(ctx), description: '', track_id: null, topic_id: null, template_id: null,
    status: 'planned', output: '', planned_min: null, actual_min: null, completed_at: null,
    archived_at: null, ...p,
  }
}

export function newTask(ctx: Ctx, p: Partial<Task> & { session_id: string; title: string }): Task {
  return {
    ...base(ctx), position: 0, description: '', required: true, done: false, done_at: null,
    est_min: null, output: '', ...p,
  }
}

export function newResource(ctx: Ctx, p: Partial<Resource> & { title: string }): Resource {
  return {
    ...base(ctx), url: null, type: 'other', description: '', tags: [], track_ids: [], topic_ids: [],
    stage_ids: [], status: 'not_started', archived_at: null, ...p,
  }
}

export function newSessionResource(
  ctx: Ctx,
  p: Partial<SessionResource> & { session_id: string; resource_id: string },
): SessionResource {
  return { ...base(ctx), portion_kind: null, portion: '', portion_done: false, position: 0, ...p }
}

export function newRecurringBlock(
  ctx: Ctx,
  p: Partial<RecurringBlock> & { weekdays: RecurringBlock['weekdays']; starts_on: string },
): RecurringBlock {
  return {
    ...base(ctx), title: '', track_id: null, start_time: null, duration_min: 60, required: true,
    ends_on: null, archived_at: null, ...p,
  }
}

export function newBlock(ctx: Ctx, p: Partial<Block> & { date: string }): Block {
  return {
    ...base(ctx), position: 0, start_time: null, duration_min: 60, required: true, title: '',
    track_id: null, session_id: null, status: 'planned', recurrence_id: null, occurrence_date: null,
    detached: false, history: [], ...p,
  }
}

export function newNote(ctx: Ctx, p: Partial<Note> = {}): Note {
  return {
    ...base(ctx), title: '', body: '', session_id: null, topic_id: null, date: null, version: 1, ...p,
  }
}
