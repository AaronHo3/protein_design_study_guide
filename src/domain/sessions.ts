// Session-level operations: tasks, duplication, splitting, templates, deletion.
import { compact, insert, remove, update, type Change } from './changes'
import { nextSessionStatus } from './completion'
import { newNote, newSession, newSessionResource, newSessionTemplate, newTask, type Ctx } from './factories'
import type { Session, SessionTemplate, Snapshot, Task, TaskBlueprint, Topic } from './types'

export function tasksOf(snapshot: Snapshot, sessionId: string): Task[] {
  return snapshot.tasks.filter((t) => t.session_id === sessionId).sort((a, b) => a.position - b.position)
}

/** Status change implied by a new task list, as a Change (or nothing). */
function statusSync(session: Session, tasksAfter: Task[], ctx: Ctx): Change | null {
  const status = nextSessionStatus(session, tasksAfter)
  if (status === session.status) return null
  return update('sessions', session, {
    status,
    completed_at: status === 'completed' ? ctx.now() : null,
  })
}

function withTasks(snapshot: Snapshot, replace: Task[], drop: string[] = []): Task[] {
  const ids = new Set([...replace.map((t) => t.id), ...drop])
  return [...snapshot.tasks.filter((t) => !ids.has(t.id)), ...replace.filter((t) => !drop.includes(t.id))]
}

export function toggleTask(snapshot: Snapshot, taskId: string, ctx: Ctx): Change[] {
  const task = snapshot.tasks.find((t) => t.id === taskId)
  const session = task && snapshot.sessions.find((s) => s.id === task.session_id)
  if (!task || !session) return []
  const done = !task.done
  const next = { ...task, done, done_at: done ? ctx.now() : null }
  return compact([
    update('tasks', task, { done: next.done, done_at: next.done_at }),
    statusSync(session, withTasks(snapshot, [next]), ctx),
  ])
}

export function addTask(
  snapshot: Snapshot, sessionId: string, p: Partial<Task> & { title: string }, ctx: Ctx,
): Change[] {
  const session = snapshot.sessions.find((s) => s.id === sessionId)
  if (!session) return []
  const task = newTask(ctx, { position: tasksOf(snapshot, sessionId).length, ...p, session_id: sessionId })
  return compact([insert('tasks', [task]), statusSync(session, withTasks(snapshot, [task]), ctx)])
}

export function editTask(snapshot: Snapshot, taskId: string, patch: Partial<Task>, ctx: Ctx): Change[] {
  const task = snapshot.tasks.find((t) => t.id === taskId)
  const session = task && snapshot.sessions.find((s) => s.id === task.session_id)
  if (!task || !session) return []
  const next = { ...task, ...patch }
  return compact([update('tasks', task, patch), statusSync(session, withTasks(snapshot, [next]), ctx)])
}

export function deleteTask(snapshot: Snapshot, taskId: string, ctx: Ctx): Change[] {
  const task = snapshot.tasks.find((t) => t.id === taskId)
  const session = task && snapshot.sessions.find((s) => s.id === task.session_id)
  if (!task || !session) return []
  return compact([remove('tasks', [task]), statusSync(session, withTasks(snapshot, [], [task.id]), ctx)])
}

export function moveTaskBy(snapshot: Snapshot, taskId: string, delta: -1 | 1): Change[] {
  const task = snapshot.tasks.find((t) => t.id === taskId)
  if (!task) return []
  const list = tasksOf(snapshot, task.session_id)
  const i = list.findIndex((t) => t.id === taskId)
  const j = i + delta
  if (j < 0 || j >= list.length) return []
  const reordered = [...list]
  ;[reordered[i], reordered[j]] = [reordered[j], reordered[i]]
  return compact(reordered.map((t, idx) => update('tasks', t, { position: idx })))
}

/** Moves a task into another session, keeping its completion state and description. */
export function moveTaskToSession(snapshot: Snapshot, taskId: string, targetId: string, ctx: Ctx): Change[] {
  const task = snapshot.tasks.find((t) => t.id === taskId)
  const from = task && snapshot.sessions.find((s) => s.id === task.session_id)
  const to = snapshot.sessions.find((s) => s.id === targetId)
  if (!task || !from || !to || from.id === to.id) return []
  const moved = { ...task, session_id: to.id, position: tasksOf(snapshot, to.id).length }
  const after = withTasks(snapshot, [moved])
  return compact([
    update('tasks', task, { session_id: moved.session_id, position: moved.position }),
    statusSync(from, after, ctx),
    statusSync(to, after, ctx),
  ])
}

export function setSessionStatus(snapshot: Snapshot, sessionId: string, status: Session['status'], ctx: Ctx): Change[] {
  const session = snapshot.sessions.find((s) => s.id === sessionId)
  if (!session) return []
  return compact([
    update('sessions', session, { status, completed_at: status === 'completed' ? ctx.now() : null }),
  ])
}

/** Explicit completion: checks remaining required tasks so the rules stay consistent. */
export function completeSession(snapshot: Snapshot, sessionId: string, ctx: Ctx): Change[] {
  const session = snapshot.sessions.find((s) => s.id === sessionId)
  if (!session) return []
  const now = ctx.now()
  const open = tasksOf(snapshot, sessionId).filter((t) => t.required && !t.done)
  return compact([
    ...open.map((t) => update('tasks', t, { done: true, done_at: now })),
    update('sessions', session, { status: 'completed', completed_at: now }),
  ])
}

export interface DuplicateOptions {
  includeNotes?: boolean
  title?: string
}

/** New instance: same task structure (unchecked) and resource links; notes only if asked. */
export function duplicateSession(snapshot: Snapshot, sessionId: string, ctx: Ctx, opts: DuplicateOptions = {}): Change[] {
  const src = snapshot.sessions.find((s) => s.id === sessionId)
  if (!src) return []
  const copy = newSession(ctx, {
    title: opts.title ?? `${src.title} (copy)`,
    description: src.description, track_id: src.track_id, topic_id: src.topic_id,
    template_id: src.template_id, output: src.output, planned_min: src.planned_min,
  })
  const tasks = tasksOf(snapshot, src.id).map((t) =>
    newTask(ctx, {
      session_id: copy.id, position: t.position, title: t.title, description: t.description,
      required: t.required, est_min: t.est_min, output: t.output,
    }),
  )
  const links = snapshot.session_resources
    .filter((l) => l.session_id === src.id)
    .map((l) =>
      newSessionResource(ctx, {
        session_id: copy.id, resource_id: l.resource_id, portion_kind: l.portion_kind,
        portion: l.portion, position: l.position,
      }),
    )
  const notes = opts.includeNotes
    ? snapshot.notes
        .filter((n) => n.session_id === src.id)
        .map((n) => newNote(ctx, { session_id: copy.id, title: n.title, body: n.body, topic_id: n.topic_id }))
    : []
  return compact([
    insert('sessions', [copy]),
    tasks.length ? insert('tasks', tasks) : null,
    links.length ? insert('session_resources', links) : null,
    notes.length ? insert('notes', notes) : null,
  ])
}

/** Moves the chosen tasks into a new backlog session; resource links are copied. */
export function splitSession(
  snapshot: Snapshot, sessionId: string, taskIds: string[], title: string, ctx: Ctx,
): Change[] {
  const src = snapshot.sessions.find((s) => s.id === sessionId)
  if (!src || taskIds.length === 0) return []
  const part = newSession(ctx, {
    title, description: '', track_id: src.track_id, topic_id: src.topic_id, template_id: src.template_id,
    planned_min: src.planned_min,
  })
  const moving = tasksOf(snapshot, src.id).filter((t) => taskIds.includes(t.id))
  const movedTasks = moving.map((t, i) => ({ ...t, session_id: part.id, position: i }))
  const after = withTasks(snapshot, movedTasks)
  const links = snapshot.session_resources
    .filter((l) => l.session_id === src.id)
    .map((l) =>
      newSessionResource(ctx, {
        session_id: part.id, resource_id: l.resource_id, portion_kind: l.portion_kind,
        portion: l.portion, position: l.position,
      }),
    )
  return compact([
    insert('sessions', [part]),
    ...moving.map((t, i) => update('tasks', t, { session_id: part.id, position: i })),
    links.length ? insert('session_resources', links) : null,
    statusSync(src, after, ctx),
    statusSync(part, after, ctx),
  ])
}

function blueprint(t: Task | TaskBlueprint): TaskBlueprint {
  return { title: t.title, description: t.description, required: t.required, est_min: t.est_min, output: t.output }
}

/** Snapshot of a session's structure as a reusable template. */
export function templateFromSession(snapshot: Snapshot, sessionId: string, name: string, ctx: Ctx): Change[] {
  const s = snapshot.sessions.find((x) => x.id === sessionId)
  if (!s) return []
  const tpl = newSessionTemplate(ctx, {
    name, title: s.title, description: s.description, track_id: s.track_id, topic_id: s.topic_id,
    planned_min: s.planned_min, output: s.output, tasks: tasksOf(snapshot, s.id).map(blueprint),
  })
  return [insert('session_templates', [tpl])]
}

export interface NewSessionInput {
  title: string
  track_id?: string | null
  topic_id?: string | null
  planned_min?: number | null
  output?: string
  description?: string
}

/** A new, independent session copied from a template. Later template edits never touch it. */
export function sessionFromTemplate(
  template: SessionTemplate, ctx: Ctx, overrides: Partial<NewSessionInput> = {},
): { session: Session; changes: Change[] } {
  const session = newSession(ctx, {
    title: overrides.title || template.title || template.name,
    description: overrides.description ?? template.description,
    track_id: overrides.track_id !== undefined ? overrides.track_id : template.track_id,
    topic_id: overrides.topic_id !== undefined ? overrides.topic_id : template.topic_id,
    planned_min: overrides.planned_min !== undefined ? overrides.planned_min : template.planned_min,
    output: overrides.output ?? template.output,
    template_id: template.id,
  })
  const tasks = template.tasks.map((bp, i) => newTask(ctx, { ...blueprint(bp), session_id: session.id, position: i }))
  return { session, changes: compact([insert('sessions', [session]), tasks.length ? insert('tasks', tasks) : null]) }
}

export function sessionFromTopic(topic: Topic, ctx: Ctx, overrides: Partial<NewSessionInput> = {}): Session {
  return newSession(ctx, {
    title: overrides.title || topic.title,
    topic_id: topic.id,
    track_id: overrides.track_id !== undefined ? overrides.track_id : (topic.track_ids[0] ?? null),
    planned_min: overrides.planned_min ?? null,
    output: overrides.output ?? '',
    description: overrides.description ?? '',
  })
}

/** What a hard delete would affect, so the UI can explain consequences first. */
export function sessionDependents(snapshot: Snapshot, sessionId: string) {
  return {
    tasks: snapshot.tasks.filter((t) => t.session_id === sessionId).length,
    notes: snapshot.notes.filter((n) => n.session_id === sessionId).length,
    resources: snapshot.session_resources.filter((l) => l.session_id === sessionId).length,
    scheduled: snapshot.blocks.some((b) => b.session_id === sessionId),
  }
}

/**
 * Permanently deletes a session. Tasks and resource links go with it (as the
 * database cascade does); notes are kept but become unattached; its calendar
 * block is removed (or emptied if it is a recurring occurrence).
 */
export function deleteSession(snapshot: Snapshot, sessionId: string): Change[] {
  const session = snapshot.sessions.find((s) => s.id === sessionId)
  if (!session) return []
  const block = snapshot.blocks.find((b) => b.session_id === sessionId)
  const tasks = snapshot.tasks.filter((t) => t.session_id === sessionId)
  const links = snapshot.session_resources.filter((l) => l.session_id === sessionId)
  const notes = snapshot.notes.filter((n) => n.session_id === sessionId)
  return compact([
    block ? (block.recurrence_id ? update('blocks', block, { session_id: null }) : remove('blocks', [block])) : null,
    ...notes.map((n) => update('notes', n, { session_id: null })),
    links.length ? remove('session_resources', links) : null,
    tasks.length ? remove('tasks', tasks) : null,
    remove('sessions', [session]),
  ])
}
