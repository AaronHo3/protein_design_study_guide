import { ChevronRight, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { compact, insert, update } from '../../domain/changes'
import { sessionProgress } from '../../domain/completion'
import { archive, deleteGoal, describeDependents, goalDependents, moveInList } from '../../domain/curriculum'
import { newGoal } from '../../domain/factories'
import type { Goal } from '../../domain/types'
import { cn } from '../../lib/cn'
import { act } from '../../state/actions'
import { useStore } from '../../state/store'
import { useOpenSession } from '../session/useOpenSession'
import { WorkIcon } from '../status'
import { Button } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { Field, Input, Textarea } from '../ui/field'
import { Menu } from '../ui/menu'
import { Empty } from '../ui/misc'
import { deleteWithConsequences, rowMenu } from './shared'

function GoalDialog({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const ctx = useStore((s) => s.ctx)
  const count = useStore((s) => s.data.goals.length)
  const [title, setTitle] = useState(goal?.title ?? '')
  const [description, setDescription] = useState(goal?.description ?? '')
  const save = async () => {
    if (!title.trim()) return
    const changes = goal
      ? compact([update('goals', goal, { title: title.trim(), description })])
      : [insert('goals', [newGoal(ctx, { title: title.trim(), description, position: count })])]
    if (await act(changes, { label: goal ? undefined : 'Goal added' })) onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={goal ? 'Edit goal' : 'New goal'}
      description="Something you want to become capable of doing."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!title.trim()} onClick={() => void save()}>Save</Button></>}
    >
      <div className="space-y-3">
        <Field label="Goal">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Evaluate AI-generated protein binders" autoFocus />}</Field>
        <Field label="Description (optional)">{(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
      </div>
    </Dialog>
  )
}

export function GoalsPanel() {
  const data = useStore((s) => s.data)
  const ctx = useStore((s) => s.ctx)
  const { open } = useOpenSession()
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const [quick, setQuick] = useState('')
  const goals = [...data.goals].sort((a, b) => a.position - b.position)
  const snap = () => useStore.getState().data

  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!quick.trim()) return
    void act([insert('goals', [newGoal(ctx, { title: quick.trim(), position: goals.length })])], { label: 'Goal added' })
    setQuick('')
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">Link goals to topics (edit a topic) to see the chain goal → topic → session → output.</p>
      {goals.length === 0 && <Empty title="No goals yet">What do you want to become capable of doing?</Empty>}
      <ul className="space-y-2">
        {goals.map((g, i) => {
          const topics = data.topics.filter((t) => t.goal_ids.includes(g.id) && !t.archived_at)
          const sessions = data.sessions.filter((s) => s.topic_id && topics.some((t) => t.id === s.topic_id) && !s.archived_at)
          return (
            <li key={g.id} className={cn('rounded-lg border border-line bg-surface', g.archived_at && 'opacity-60')}>
              <div className="flex items-start gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{g.title}{g.archived_at && <span className="ml-2 text-[12px] font-normal text-faint">archived</span>}</p>
                  {g.description && <p className="text-[13px] text-muted">{g.description}</p>}
                  <p className="text-[12px] text-faint">{topics.length} topic(s) · {sessions.length} session(s)</p>
                </div>
                <Menu
                  label={`Actions for ${g.title}`}
                  items={rowMenu({
                    first: i === 0, last: i === goals.length - 1, archived: !!g.archived_at,
                    onEdit: () => setEditing(g),
                    onUp: () => void act(moveInList('goals', snap().goals, g.id, -1)),
                    onDown: () => void act(moveInList('goals', snap().goals, g.id, 1)),
                    onArchive: () => void act(archive(snap(), 'goals', g.id, g.archived_at ? null : ctx.now()), { label: g.archived_at ? 'Goal restored' : 'Goal archived' }),
                    onDelete: () => void deleteWithConsequences(g.title, describeDependents(goalDependents(snap(), g.id)), deleteGoal(snap(), g.id)),
                  })}
                />
              </div>
              {topics.length > 0 && (
                <details className="border-t border-line px-3 py-2 text-[13px]">
                  <summary className="cursor-pointer text-muted">Show connections</summary>
                  <ul className="mt-2 space-y-2">
                    {topics.map((t) => (
                      <li key={t.id}>
                        <p className="font-medium">{t.title}</p>
                        <ul className="mt-1 space-y-0.5 pl-3">
                          {sessions.filter((s) => s.topic_id === t.id).map((s) => (
                            <li key={s.id} className="flex items-center gap-1.5">
                              <WorkIcon state={sessionProgress(s, data.tasks).state} className="size-3.5" />
                              <button type="button" className="hover:underline" onClick={() => open(s.id)}>{s.title}</button>
                              {s.output && <><ChevronRight className="size-3 text-faint" aria-hidden /><span className="text-muted">{s.output}</span></>}
                            </li>
                          ))}
                          {!sessions.some((s) => s.topic_id === t.id) && <li className="text-faint">No sessions yet</li>}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          )
        })}
      </ul>
      <form onSubmit={add} className="flex gap-2">
        <Input aria-label="New goal" placeholder="New goal…" value={quick} onChange={(e) => setQuick(e.target.value)} />
        <Button type="submit" disabled={!quick.trim()}><Plus /> Add goal</Button>
      </form>
      {editing && <GoalDialog goal={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
