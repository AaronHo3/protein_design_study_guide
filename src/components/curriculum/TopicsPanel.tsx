import { CalendarPlus, CornerDownRight, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { compact, insert, update } from '../../domain/changes'
import { sessionProgress } from '../../domain/completion'
import { archive, deleteTopic, describeDependents, moveInList, topicDependents } from '../../domain/curriculum'
import { newTopic } from '../../domain/factories'
import type { Topic } from '../../domain/types'
import { cn } from '../../lib/cn'
import { act } from '../../state/actions'
import { activeTracks, useMaps } from '../../state/selectors'
import { useStore } from '../../state/store'
import { NewSessionDialog } from '../session/dialogs'
import { TrackBadge } from '../track'
import { Button } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { Checkbox, Field, Input, Select, Textarea } from '../ui/field'
import { Menu } from '../ui/menu'
import { Empty } from '../ui/misc'
import { deleteWithConsequences, rowMenu } from './shared'

interface TopicDraft {
  title: string
  description: string
  parent_id: string
  stage_id: string
  track_ids: string[]
  goal_ids: string[]
}

export function TopicDialog({ topic, parentId, stageId, onClose }: { topic?: Topic; parentId?: string; stageId?: string; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const ctx = useStore((s) => s.ctx)
  const parent = parentId ? data.topics.find((t) => t.id === parentId) : undefined
  const [d, setD] = useState<TopicDraft>({
    title: topic?.title ?? '', description: topic?.description ?? '',
    parent_id: topic?.parent_id ?? parentId ?? '', stage_id: topic?.stage_id ?? stageId ?? parent?.stage_id ?? '',
    track_ids: topic?.track_ids ?? parent?.track_ids ?? [], goal_ids: topic?.goal_ids ?? parent?.goal_ids ?? [],
  })
  const toggle = (key: 'track_ids' | 'goal_ids', id: string) =>
    setD({ ...d, [key]: d[key].includes(id) ? d[key].filter((x) => x !== id) : [...d[key], id] })
  const possibleParents = data.topics.filter((t) => !t.archived_at && t.id !== topic?.id && t.parent_id !== topic?.id)

  const save = async () => {
    if (!d.title.trim()) return
    const fields = {
      title: d.title.trim(), description: d.description, parent_id: d.parent_id || null, stage_id: d.stage_id || null,
      track_ids: d.track_ids, goal_ids: d.goal_ids,
    }
    const siblings = data.topics.filter((t) => t.parent_id === fields.parent_id)
    const changes = topic
      ? compact([update('topics', topic, fields)])
      : [insert('topics', [newTopic(ctx, { ...fields, position: siblings.length })])]
    if (await act(changes, { label: topic ? undefined : 'Topic added' })) onClose()
  }

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={topic ? 'Edit topic' : parent ? `New subtopic of “${parent.title}”` : 'New topic'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!d.title.trim()} onClick={() => void save()}>Save</Button></>}
    >
      <div className="space-y-3">
        <Field label="Topic">{(id) => <Input id={id} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="e.g. Binding kinetics" autoFocus />}</Field>
        <Field label="Description (optional)">{(id) => <Textarea id={id} rows={2} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />}</Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Parent topic (optional)">
            {(id) => (
              <Select id={id} value={d.parent_id} onChange={(e) => setD({ ...d, parent_id: e.target.value })}>
                <option value="">None (top level)</option>
                {possibleParents.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Stage (optional)">
            {(id) => (
              <Select id={id} value={d.stage_id} onChange={(e) => setD({ ...d, stage_id: e.target.value })}>
                <option value="">No stage</option>
                {data.stages.filter((s) => !s.archived_at).sort((a, b) => a.position - b.position).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </Select>
            )}
          </Field>
        </div>
        {activeTracks(data).length > 0 && (
          <fieldset>
            <legend className="mb-1 text-[13px] font-medium text-muted">Tracks (a topic can belong to several)</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {activeTracks(data).map((t) => <Checkbox key={t.id} label={t.name} checked={d.track_ids.includes(t.id)} onChange={() => toggle('track_ids', t.id)} />)}
            </div>
          </fieldset>
        )}
        {data.goals.some((g) => !g.archived_at) && (
          <fieldset>
            <legend className="mb-1 text-[13px] font-medium text-muted">Goals it serves (optional)</legend>
            <div className="flex flex-col gap-1">
              {data.goals.filter((g) => !g.archived_at).map((g) => <Checkbox key={g.id} label={g.title} checked={d.goal_ids.includes(g.id)} onChange={() => toggle('goal_ids', g.id)} />)}
            </div>
          </fieldset>
        )}
      </div>
    </Dialog>
  )
}

function TopicRow({ topic, depth, siblings, index }: { topic: Topic; depth: number; siblings: Topic[]; index: number }) {
  const data = useStore((s) => s.data)
  const ctx = useStore((s) => s.ctx)
  const maps = useMaps()
  const [dialog, setDialog] = useState<'edit' | 'sub' | 'session' | null>(null)
  const sessions = data.sessions.filter((s) => s.topic_id === topic.id && !s.archived_at)
  const done = sessions.filter((s) => sessionProgress(s, data.tasks).state === 'complete').length
  const snap = () => useStore.getState().data
  return (
    <li className={cn('flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2', topic.archived_at && 'opacity-60')} style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}>
      {depth > 0 && <CornerDownRight className="size-3.5 text-faint" aria-hidden />}
      <span className="min-w-0 flex-1">
        <span className="text-sm">{topic.title}</span>
        {topic.archived_at && <span className="ml-2 text-[12px] text-faint">archived</span>}
        {topic.description && <span className="block truncate text-[12px] text-faint">{topic.description}</span>}
      </span>
      <span className="flex flex-wrap gap-1">{topic.track_ids.map((id) => <TrackBadge key={id} track={maps.tracks.get(id)} />)}</span>
      <span className="w-20 text-right text-[12px] text-faint" title="Completed sessions / all sessions for this topic (activity, not mastery)">
        {sessions.length ? `${done}/${sessions.length} sessions` : ''}
      </span>
      <Button size="sm" variant="ghost" onClick={() => setDialog('session')} aria-label={`Create session for ${topic.title}`}>
        <CalendarPlus /> <span className="hidden sm:inline">Session</span>
      </Button>
      <Menu
        label={`Actions for ${topic.title}`}
        items={rowMenu({
          first: index === 0, last: index === siblings.length - 1, archived: !!topic.archived_at,
          extra: [{ label: 'Add subtopic', icon: <Plus />, onSelect: () => setDialog('sub') }],
          onEdit: () => setDialog('edit'),
          onUp: () => void act(moveInList('topics', siblings, topic.id, -1)),
          onDown: () => void act(moveInList('topics', siblings, topic.id, 1)),
          onArchive: () => void act(archive(snap(), 'topics', topic.id, topic.archived_at ? null : ctx.now()), { label: topic.archived_at ? 'Topic restored' : 'Topic archived' }),
          onDelete: () => void deleteWithConsequences(topic.title, describeDependents(topicDependents(snap(), topic.id)), deleteTopic(snap(), topic.id)),
        })}
      />
      {dialog === 'edit' && <TopicDialog topic={topic} onClose={() => setDialog(null)} />}
      {dialog === 'sub' && <TopicDialog parentId={topic.id} onClose={() => setDialog(null)} />}
      {dialog === 'session' && <NewSessionDialog preset={{ topicId: topic.id }} onClose={() => setDialog(null)} />}
    </li>
  )
}

/** `parentOf` is display-only (orphans shown at top level); rows themselves are never altered. */
function TopicTree({ topics, parentOf, parentId, depth }: { topics: Topic[]; parentOf: Map<string, string | null>; parentId: string | null; depth: number }) {
  const level = topics.filter((t) => parentOf.get(t.id) === parentId).sort((a, b) => a.position - b.position)
  return (
    <>
      {level.map((t, i) => (
        <TopicTreeNode key={t.id} topic={t} topics={topics} parentOf={parentOf} depth={depth} siblings={level} index={i} />
      ))}
    </>
  )
}

function TopicTreeNode({ topic, topics, parentOf, depth, siblings, index }: { topic: Topic; topics: Topic[]; parentOf: Map<string, string | null>; depth: number; siblings: Topic[]; index: number }) {
  return (
    <>
      <TopicRow topic={topic} depth={depth} siblings={siblings} index={index} />
      <TopicTree topics={topics} parentOf={parentOf} parentId={topic.id} depth={depth + 1} />
    </>
  )
}

export function TopicsPanel() {
  const data = useStore((s) => s.data)
  const [query, setQuery] = useState('')
  const [trackId, setTrackId] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [creating, setCreating] = useState<{ stageId?: string } | null>(null)

  const visible = useMemo(() => {
    const q = query.toLowerCase().trim()
    const base = data.topics.filter((t) => showArchived || !t.archived_at)
    if (!q && !trackId) return base
    const matches = new Set(
      base.filter((t) => (!q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)) && (!trackId || t.track_ids.includes(trackId))).map((t) => t.id),
    )
    // Keep ancestors of matches so the tree stays readable.
    const byId = new Map(base.map((t) => [t.id, t]))
    for (const id of [...matches]) {
      let p = byId.get(id)?.parent_id
      while (p && !matches.has(p)) {
        matches.add(p)
        p = byId.get(p)?.parent_id
      }
    }
    return base.filter((t) => matches.has(t.id))
  }, [data.topics, query, trackId, showArchived])

  const stages = data.stages.filter((s) => !s.archived_at).sort((a, b) => a.position - b.position)
  const groups = [
    ...stages.map((s) => ({ key: s.id, title: s.title, stageId: s.id })),
    { key: 'none', title: stages.length ? 'Not in a stage' : 'Topics', stageId: undefined as string | undefined },
  ]
  // Subtopics render under their parent, so group by the root topic's stage.
  const rootStage = (t: { parent_id: string | null; stage_id: string | null }): string | null => {
    let cur = t
    const seen = new Set<string>()
    while (cur.parent_id && !seen.has(cur.parent_id)) {
      seen.add(cur.parent_id)
      const parent = data.topics.find((x) => x.id === cur.parent_id)
      if (!parent) break
      cur = parent
    }
    return cur.stage_id
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Search topics" placeholder="Search topics…" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-64" />
        <Select aria-label="Filter by track" value={trackId} onChange={(e) => setTrackId(e.target.value)} className="max-w-52">
          <option value="">All tracks</option>
          {activeTracks(data).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Checkbox label="Show archived" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        <Button variant="primary" size="sm" className="ml-auto" onClick={() => setCreating({})}><Plus /> New topic</Button>
      </div>
      {data.topics.length === 0 && <Empty title="No topics yet">Topics are knowledge areas, like “Binding kinetics” or “Attention”. Add subtopics to organize them.</Empty>}
      {groups.map((g) => {
        const inGroup = visible.filter((t) => (rootStage(t) ?? undefined) === g.stageId || (g.stageId === undefined && !stages.some((s) => s.id === rootStage(t))))
        if (inGroup.length === 0) return null
        const ids = new Set(inGroup.map((t) => t.id))
        const parentOf = new Map(inGroup.map((t) => [t.id, t.parent_id && ids.has(t.parent_id) ? t.parent_id : null]))
        return (
          <section key={g.key} aria-labelledby={`grp-${g.key}`} className="rounded-lg border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <h3 id={`grp-${g.key}`} className="text-[13px] font-semibold">{g.title}</h3>
              <Button size="sm" variant="ghost" onClick={() => setCreating({ stageId: g.stageId })}><Plus /> Topic</Button>
            </div>
            <ul className="p-1"><TopicTree topics={inGroup} parentOf={parentOf} parentId={null} depth={0} /></ul>
          </section>
        )
      })}
      {creating && <TopicDialog stageId={creating.stageId} onClose={() => setCreating(null)} />}
    </div>
  )
}
