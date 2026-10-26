import { CircleCheck, Circle, Plus, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { compact, insert, update } from '../../domain/changes'
import { blockState, sessionProgress } from '../../domain/completion'
import { archive, deleteStage, describeDependents, moveInList, stageDependents } from '../../domain/curriculum'
import { newCheckpoint, newStage } from '../../domain/factories'
import type { Checkpoint, Stage } from '../../domain/types'
import { cn } from '../../lib/cn'
import { act } from '../../state/actions'
import { confirm } from '../../state/confirm'
import { useStore } from '../../state/store'
import { Markdown } from '../Markdown'
import { Button } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { Field, Input, Textarea } from '../ui/field'
import { Menu } from '../ui/menu'
import { Empty } from '../ui/misc'
import { deleteWithConsequences, rowMenu } from './shared'

function StageDialog({ stage, onClose }: { stage?: Stage; onClose: () => void }) {
  const ctx = useStore((s) => s.ctx)
  const count = useStore((s) => s.data.stages.length)
  const [title, setTitle] = useState(stage?.title ?? '')
  const [description, setDescription] = useState(stage?.description ?? '')
  const [min, setMin] = useState(stage?.est_weeks_min?.toString() ?? '')
  const [max, setMax] = useState(stage?.est_weeks_max?.toString() ?? '')
  const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.min(520, Math.round(Number(v)) || 0)))
  const save = async () => {
    if (!title.trim()) return
    const fields = { title: title.trim(), description, est_weeks_min: num(min), est_weeks_max: num(max) }
    const changes = stage ? compact([update('stages', stage, fields)]) : [insert('stages', [newStage(ctx, { ...fields, position: count })])]
    if (await act(changes, { label: stage ? undefined : 'Stage added' })) onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={stage ? 'Edit stage' : 'New stage'}
      description="Stages are optional ways to organize topics — never gates."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!title.trim()} onClick={() => void save()}>Save</Button></>}
    >
      <div className="space-y-3">
        <Field label="Title">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />}</Field>
        <Field label="Description (optional)">{(id) => <Textarea id={id} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Estimate: min weeks">{(id) => <Input id={id} type="number" min={0} value={min} onChange={(e) => setMin(e.target.value)} />}</Field>
          <Field label="Estimate: max weeks">{(id) => <Input id={id} type="number" min={0} value={max} onChange={(e) => setMax(e.target.value)} />}</Field>
        </div>
        <p className="text-[12px] text-faint">Estimates are for your reference only. Stages never advance automatically.</p>
      </div>
    </Dialog>
  )
}

function AchieveDialog({ checkpoint, onClose }: { checkpoint: Checkpoint; onClose: () => void }) {
  const ctx = useStore((s) => s.ctx)
  const [evidence, setEvidence] = useState(checkpoint.evidence)
  const save = async () => {
    if (await act(compact([update('checkpoints', checkpoint, { achieved_at: checkpoint.achieved_at ?? ctx.now(), evidence })]), { label: 'Checkpoint marked achieved' })) onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Mark checkpoint achieved"
      description={checkpoint.title}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void save()}>Mark achieved</Button></>}
    >
      <Field label="Evidence (optional)" hint="Links, a short explanation, or a project output. Markdown supported.">
        {(id) => <Textarea id={id} rows={5} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="e.g. Explained attention shapes in my notes: https://…" />}
      </Field>
    </Dialog>
  )
}

function CheckpointRow({ c, list, index }: { c: Checkpoint; list: Checkpoint[]; index: number }) {
  const ctx = useStore((s) => s.ctx)
  const [achieving, setAchieving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(c.title)
  const snap = () => useStore.getState().data
  const unmark = async () => {
    const ok = await confirm({ title: 'Mark as not achieved?', body: 'The checkpoint returns to open. Your evidence text is kept.', confirmLabel: 'Mark not achieved' })
    if (ok) await act(compact([update('checkpoints', c, { achieved_at: null })]), { label: 'Checkpoint reopened' })
  }
  return (
    <li className={cn('rounded-md px-2 py-1.5 hover:bg-surface-2', c.archived_at && 'opacity-60')}>
      <div className="flex items-start gap-2">
        {c.achieved_at ? <CircleCheck className="mt-0.5 size-4 text-success" aria-label="Achieved" /> : <Circle className="mt-0.5 size-4 text-faint" aria-label="Not yet achieved" />}
        <div className="min-w-0 flex-1">
          {editing ? (
            <Input
              aria-label="Checkpoint"
              value={title}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                setEditing(false)
                if (title.trim() && title !== c.title) void act(compact([update('checkpoints', c, { title: title.trim() })]))
              }}
              className="h-8"
            />
          ) : (
            <p className="text-sm">{c.title}</p>
          )}
          {c.achieved_at && <p className="text-[12px] text-success">Achieved {new Date(c.achieved_at).toLocaleDateString()}</p>}
          {c.evidence && <div className="mt-1 rounded border border-line bg-surface px-2 py-1"><Markdown source={c.evidence} /></div>}
        </div>
        {c.achieved_at ? (
          <Button size="sm" variant="ghost" onClick={() => void unmark()}><Undo2 /> Reopen</Button>
        ) : (
          <Button size="sm" onClick={() => setAchieving(true)}>Mark achieved…</Button>
        )}
        <Menu
          label={`Actions for checkpoint ${c.title}`}
          items={rowMenu({
            first: index === 0, last: index === list.length - 1, archived: !!c.archived_at,
            extra: c.achieved_at ? [{ label: 'Edit evidence', onSelect: () => setAchieving(true) }] : [],
            onEdit: () => setEditing(true),
            onUp: () => void act(moveInList('checkpoints', list, c.id, -1)),
            onDown: () => void act(moveInList('checkpoints', list, c.id, 1)),
            onArchive: () => void act(archive(snap(), 'checkpoints', c.id, c.archived_at ? null : ctx.now())),
            onDelete: () => void deleteWithConsequences(c.title, c.achieved_at ? ['Its achieved status and evidence will be lost'] : [], [{ op: 'delete', table: 'checkpoints', rows: [c] }]),
          })}
        />
      </div>
      {achieving && <AchieveDialog checkpoint={c} onClose={() => setAchieving(false)} />}
    </li>
  )
}

function StageCard({ stage, index, count }: { stage: Stage; index: number; count: number }) {
  const data = useStore((s) => s.data)
  const ctx = useStore((s) => s.ctx)
  const [editing, setEditing] = useState(false)
  const [newCp, setNewCp] = useState('')
  const snap = () => useStore.getState().data
  const topics = data.topics.filter((t) => t.stage_id === stage.id && !t.archived_at)
  const topicIds = new Set(topics.map((t) => t.id))
  const sessions = data.sessions.filter((s) => s.topic_id && topicIds.has(s.topic_id))
  const completed = sessions.filter((s) => sessionProgress(s, data.tasks).state === 'complete')
  const dates = data.blocks
    .filter((b) => b.session_id && sessions.some((s) => s.id === b.session_id) && blockState(b, data.sessions, data.tasks) === 'complete')
    .map((b) => b.date)
    .sort()
  const checkpoints = data.checkpoints.filter((c) => c.stage_id === stage.id).sort((a, b) => a.position - b.position)
  const achieved = checkpoints.filter((c) => c.achieved_at).length
  const est = stage.est_weeks_min != null || stage.est_weeks_max != null
    ? `${stage.est_weeks_min ?? '?'}–${stage.est_weeks_max ?? '?'} weeks (estimate)`
    : 'No estimate'

  return (
    <li className={cn('rounded-lg border border-line bg-surface', stage.archived_at && 'opacity-60')}>
      <details open={index === 0}>
        <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3">
          <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12px] font-semibold text-muted">{index + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{stage.title}{stage.archived_at && <span className="ml-2 text-[12px] font-normal text-faint">archived</span>}</span>
            <span className="mt-0.5 flex flex-wrap gap-x-4 text-[12.5px] text-muted">
              <span>{est}</span>
              <span>Activity: {completed.length}/{sessions.length} sessions done{dates.length ? ` · ${dates[0]} → ${dates[dates.length - 1]}` : ''}</span>
              <span>Checkpoints: {achieved}/{checkpoints.length} achieved</span>
            </span>
          </span>
          <span onClick={(e) => e.preventDefault()}>
            <Menu
              label={`Actions for ${stage.title}`}
              items={rowMenu({
                first: index === 0, last: index === count - 1, archived: !!stage.archived_at,
                onEdit: () => setEditing(true),
                onUp: () => void act(moveInList('stages', snap().stages, stage.id, -1)),
                onDown: () => void act(moveInList('stages', snap().stages, stage.id, 1)),
                onArchive: () => void act(archive(snap(), 'stages', stage.id, stage.archived_at ? null : ctx.now()), { label: stage.archived_at ? 'Stage restored' : 'Stage archived' }),
                onDelete: () => void deleteWithConsequences(stage.title, describeDependents(stageDependents(snap(), stage.id)), deleteStage(snap(), stage.id)),
              })}
            />
          </span>
        </summary>
        <div className="space-y-3 border-t border-line px-4 py-3">
          {stage.description && <p className="text-[13px] text-muted">{stage.description}</p>}
          <p className="text-[12.5px] text-muted">{topics.length} topic(s) — manage them in the Topics tab.</p>
          <div>
            <h4 className="mb-1 text-[12px] font-semibold tracking-wide text-faint uppercase">Readiness checkpoints</h4>
            <ul className="space-y-0.5">
              {checkpoints.map((c, i) => <CheckpointRow key={c.id} c={c} list={checkpoints} index={i} />)}
            </ul>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (!newCp.trim()) return
                void act([insert('checkpoints', [newCheckpoint(ctx, { title: newCp.trim(), stage_id: stage.id, position: checkpoints.length })])])
                setNewCp('')
              }}
            >
              <Input aria-label="New checkpoint" placeholder="Add a checkpoint…" value={newCp} onChange={(e) => setNewCp(e.target.value)} className="h-8" />
              <Button type="submit" size="sm" disabled={!newCp.trim()}><Plus /> Add</Button>
            </form>
          </div>
        </div>
      </details>
      {editing && <StageDialog stage={stage} onClose={() => setEditing(false)} />}
    </li>
  )
}

export function StagesPanel() {
  const stages = useStore((s) => s.data.stages)
  const checkpoints = useStore((s) => s.data.checkpoints)
  const looseCheckpoints = checkpoints.filter((c) => !c.stage_id)
  const [creating, setCreating] = useState(false)
  const sorted = [...stages].sort((a, b) => a.position - b.position)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-[13px] text-muted">
          Optional collections of topics and readiness checkpoints. Use them, ignore them, or work across several at once.
        </p>
        <Button size="sm" variant="primary" onClick={() => setCreating(true)}><Plus /> New stage</Button>
      </div>
      {sorted.length === 0 && <Empty title="No stages">Stages are optional. Add one if it helps you organize topics.</Empty>}
      <ul className="space-y-2">{sorted.map((s, i) => <StageCard key={s.id} stage={s} index={i} count={sorted.length} />)}</ul>
      {looseCheckpoints.length > 0 && (
        <section className="rounded-lg border border-line bg-surface p-3">
          <h3 className="mb-1 text-[13px] font-semibold">Checkpoints without a stage</h3>
          <ul>{looseCheckpoints.map((c, i) => <CheckpointRow key={c.id} c={c} list={looseCheckpoints} index={i} />)}</ul>
        </section>
      )}
      {creating && <StageDialog onClose={() => setCreating(false)} />}
    </div>
  )
}
