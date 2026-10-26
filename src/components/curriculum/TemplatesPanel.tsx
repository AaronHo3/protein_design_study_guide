import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { compact, insert, remove, update } from '../../domain/changes'
import { archive } from '../../domain/curriculum'
import { newSessionTemplate } from '../../domain/factories'
import type { SessionTemplate, TaskBlueprint } from '../../domain/types'
import { formatMinutes } from '../../lib/dates'
import { cn } from '../../lib/cn'
import { act } from '../../state/actions'
import { activeTracks } from '../../state/selectors'
import { useStore } from '../../state/store'
import { NewSessionDialog } from '../session/dialogs'
import { Button } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { Field, Input, Select } from '../ui/field'
import { Menu } from '../ui/menu'
import { Empty } from '../ui/misc'
import { deleteWithConsequences, rowMenu } from './shared'

function TemplateDialog({ template, onClose }: { template?: SessionTemplate; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const ctx = useStore((s) => s.ctx)
  const [name, setName] = useState(template?.name ?? '')
  const [title, setTitle] = useState(template?.title ?? '')
  const [trackId, setTrackId] = useState(template?.track_id ?? '')
  const [minutes, setMinutes] = useState(template?.planned_min?.toString() ?? '')
  const [output, setOutput] = useState(template?.output ?? '')
  const [tasks, setTasks] = useState<TaskBlueprint[]>(template?.tasks ?? [])
  const used = template ? data.sessions.filter((s) => s.template_id === template.id).length : 0

  const setTask = (i: number, patch: Partial<TaskBlueprint>) => setTasks(tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)))
  const save = async () => {
    if (!name.trim()) return
    const planned = minutes.trim() === '' ? null : Math.max(0, Math.min(1440, Math.round(Number(minutes)) || 0))
    const fields = {
      name: name.trim(), title, track_id: trackId || null, planned_min: planned, output,
      tasks: tasks.filter((t) => t.title.trim()).map((t) => ({ ...t, title: t.title.trim() })),
    }
    const changes = template ? compact([update('session_templates', template, fields)]) : [insert('session_templates', [newSessionTemplate(ctx, fields)])]
    if (await act(changes, { label: template ? 'Template updated' : 'Template created' })) onClose()
  }

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={template ? 'Edit template' : 'New session template'}
      description={used ? `${used} session(s) were created from this template. They are independent copies and will not change.` : 'A reusable session structure.'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!name.trim()} onClick={() => void save()}>Save template</Button></>}
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Template name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoFocus />}</Field>
          <Field label="Default session title (optional)">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
          <Field label="Default track">
            {(id) => (
              <Select id={id} value={trackId} onChange={(e) => setTrackId(e.target.value)}>
                <option value="">None</option>
                {activeTracks(data).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Planned minutes">{(id) => <Input id={id} type="number" min={0} max={1440} value={minutes} onChange={(e) => setMinutes(e.target.value)} />}</Field>
        </div>
        <Field label="Output (optional)">{(id) => <Input id={id} value={output} onChange={(e) => setOutput(e.target.value)} />}</Field>
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-[13px] font-medium text-muted">Tasks</legend>
          {tasks.map((t, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input aria-label={`Task ${i + 1} title`} value={t.title} onChange={(e) => setTask(i, { title: e.target.value })} className="h-8 min-w-40 flex-1" />
              <Input aria-label={`Task ${i + 1} minutes`} type="number" min={0} placeholder="min" value={t.est_min ?? ''} onChange={(e) => setTask(i, { est_min: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value)) || 0) })} className="h-8 w-20" />
              <label className="flex items-center gap-1 text-[12.5px] text-muted">
                <input type="checkbox" className="accent-[var(--accent)]" checked={t.required} onChange={(e) => setTask(i, { required: e.target.checked })} /> Required
              </label>
              <Button size="icon-sm" variant="ghost" aria-label={`Remove task ${i + 1}`} onClick={() => setTasks(tasks.filter((_, j) => j !== i))}><Trash2 /></Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setTasks([...tasks, { title: '', description: '', required: false, est_min: null, output: '' }])}><Plus /> Add task</Button>
        </fieldset>
      </div>
    </Dialog>
  )
}

export function TemplatesPanel() {
  const data = useStore((s) => s.data)
  const ctx = useStore((s) => s.ctx)
  const [editing, setEditing] = useState<SessionTemplate | 'new' | null>(null)
  const [using, setUsing] = useState<SessionTemplate | null>(null)
  const templates = [...data.session_templates].sort((a, b) => a.name.localeCompare(b.name))
  const snap = () => useStore.getState().data
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-[13px] text-muted">
          A template is a reusable structure. Sessions created from it are copies; editing a template never rewrites existing sessions.
          Save any session as a template from its menu.
        </p>
        <Button size="sm" variant="primary" onClick={() => setEditing('new')}><Plus /> New template</Button>
      </div>
      {templates.length === 0 && <Empty title="No templates yet" />}
      <ul className="space-y-1.5">
        {templates.map((t) => {
          const used = data.sessions.filter((s) => s.template_id === t.id).length
          return (
            <li key={t.id} className={cn('flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2', t.archived_at && 'opacity-60')}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.name}{t.archived_at && <span className="ml-2 text-[12px] font-normal text-faint">archived</span>}</p>
                <p className="text-[12px] text-faint">
                  {t.tasks.length} task(s){t.planned_min ? ` · ${formatMinutes(t.planned_min)}` : ''} · used {used}×
                </p>
              </div>
              <Button size="sm" onClick={() => setUsing(t)}>Use</Button>
              <Menu
                label={`Actions for ${t.name}`}
                items={rowMenu({
                  archived: !!t.archived_at,
                  onEdit: () => setEditing(t),
                  onArchive: () => void act(archive(snap(), 'session_templates', t.id, t.archived_at ? null : ctx.now())),
                  onDelete: () => void deleteWithConsequences(t.name, used ? [`${used} session(s) created from it keep their tasks but lose the template reference`] : [], [...snap().sessions.filter((s) => s.template_id === t.id).flatMap((s) => compact([update('sessions', s, { template_id: null })])), remove('session_templates', [t])]),
                })}
              />
            </li>
          )
        })}
      </ul>
      {editing && <TemplateDialog template={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {using && <NewSessionDialog preset={{ templateId: using.id }} onClose={() => setUsing(null)} />}
    </div>
  )
}
