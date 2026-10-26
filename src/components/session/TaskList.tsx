import { ArrowDown, ArrowRightLeft, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { addTask, deleteTask, editTask, moveTaskBy, tasksOf, toggleTask } from '../../domain/sessions'
import type { Task } from '../../domain/types'
import { formatMinutes } from '../../lib/dates'
import { cn } from '../../lib/cn'
import { act } from '../../state/actions'
import { useStore } from '../../state/store'
import { Button } from '../ui/button'
import { Checkbox, Field, Input, Textarea } from '../ui/field'
import { Dialog } from '../ui/dialog'
import { Menu } from '../ui/menu'
import { MoveTaskDialog } from './dialogs'

interface TaskListProps {
  sessionId: string
  compact?: boolean
}

export function TaskList({ sessionId, compact = false }: TaskListProps) {
  const data = useStore((s) => s.data)
  const ctx = useStore((s) => s.ctx)
  const tasks = tasksOf(data, sessionId)
  const [editing, setEditing] = useState<Task | null>(null)
  const [moving, setMoving] = useState<Task | null>(null)
  const [title, setTitle] = useState('')
  const [required, setRequired] = useState(true)

  const add = async (e: FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    const ok = await act(addTask(useStore.getState().data, sessionId, { title: t, required }, ctx))
    if (ok) setTitle('')
  }

  return (
    <div>
      {tasks.length > 0 && (
        <ul className="space-y-0.5">
          {tasks.map((task, i) => (
            <li key={task.id} className="group flex items-start gap-2.5 rounded-md px-1.5 py-1 hover:bg-surface-2">
              <Checkbox
                key={`${task.id}-${task.done}`}
                checked={task.done}
                onChange={() => void act(toggleTask(useStore.getState().data, task.id, ctx), { allowReopen: true })}
                aria-label={`${task.done ? 'Uncheck' : 'Check'} task: ${task.title}`}
                className={cn('mt-0.5', task.done && 'animate-pop')}
              />
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm', task.done && 'text-muted line-through decoration-faint')}>
                  {task.title}
                  {!task.required && <span className="ml-1.5 text-[11.5px] text-faint">optional</span>}
                  {task.est_min != null && <span className="ml-1.5 text-[11.5px] text-faint">{formatMinutes(task.est_min)}</span>}
                </p>
                {!compact && task.description && <p className="text-[12.5px] text-muted whitespace-pre-wrap">{task.description}</p>}
                {!compact && task.output && <p className="text-[12.5px] text-muted">Output: {task.output}</p>}
              </div>
              <div className="opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
                <Menu
                  label={`Task actions: ${task.title}`}
                  items={[
                    { label: 'Edit', icon: <Pencil />, onSelect: () => setEditing(task) },
                    { label: 'Move up', icon: <ArrowUp />, disabled: i === 0, onSelect: () => void act(moveTaskBy(data, task.id, -1)) },
                    { label: 'Move down', icon: <ArrowDown />, disabled: i === tasks.length - 1, onSelect: () => void act(moveTaskBy(data, task.id, 1)) },
                    { label: 'Move to another session…', icon: <ArrowRightLeft />, onSelect: () => setMoving(task) },
                    {
                      label: 'Delete task', icon: <Trash2 />, danger: true, separatorBefore: true,
                      onSelect: () => void act(deleteTask(useStore.getState().data, task.id, ctx), { label: 'Task deleted' }),
                    },
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(e) => void add(e)} className="mt-1.5 flex items-center gap-2">
        <Input
          aria-label="New task"
          placeholder="Add a task…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-8"
        />
        <label className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-muted">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="accent-[var(--accent)]" />
          Required
        </label>
        <Button type="submit" size="sm" disabled={!title.trim()} aria-label="Add task">
          <Plus /> Add
        </Button>
      </form>

      {editing && <TaskEditDialog task={editing} onClose={() => setEditing(null)} />}
      {moving && <MoveTaskDialog task={moving} onClose={() => setMoving(null)} />}
    </div>
  )
}

function TaskEditDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const ctx = useStore((s) => s.ctx)
  const [form, setForm] = useState({
    title: task.title, description: task.description, required: task.required,
    est_min: task.est_min?.toString() ?? '', output: task.output,
  })
  const save = async () => {
    if (!form.title.trim()) return
    const est = form.est_min.trim() === '' ? null : Math.max(0, Math.min(1440, Math.round(Number(form.est_min)) || 0))
    const ok = await act(
      editTask(useStore.getState().data, task.id, {
        title: form.title.trim(), description: form.description, required: form.required, est_min: est, output: form.output,
      }, ctx),
    )
    if (ok) onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Edit task"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} disabled={!form.title.trim()}>Save</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Title">{(id) => <Input id={id} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}</Field>
        <Field label="Description (optional)">
          {(id) => <Textarea id={id} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Estimated minutes (optional)">
            {(id) => <Input id={id} type="number" min={0} max={1440} value={form.est_min} onChange={(e) => setForm({ ...form, est_min: e.target.value })} />}
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox label="Required for completion" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} />
          </div>
        </div>
        <Field label="Output or success criterion (optional)">
          {(id) => <Input id={id} value={form.output} onChange={(e) => setForm({ ...form, output: e.target.value })} />}
        </Field>
      </div>
    </Dialog>
  )
}
