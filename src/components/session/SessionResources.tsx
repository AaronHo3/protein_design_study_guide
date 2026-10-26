import { ExternalLink, Link2Off, Pencil, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { compact, insert, remove, update } from '../../domain/changes'
import { newResource, newSessionResource } from '../../domain/factories'
import type { PortionKind, SessionResource } from '../../domain/types'
import { cn } from '../../lib/cn'
import { act } from '../../state/actions'
import { useMaps } from '../../state/selectors'
import { useStore } from '../../state/store'
import { safeHref } from '../Markdown'
import { RESOURCE_STATUS, RESOURCE_TYPES, ResourceForm, draftFrom, draftToFields, validateDraft } from '../resources/ResourceForm'
import { Button } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { Field, Input, Select } from '../ui/field'
import { Badge, Segmented } from '../ui/misc'

export const PORTION_KINDS: { value: PortionKind | ''; label: string }[] = [
  { value: '', label: 'Whole resource' },
  { value: 'chapter', label: 'Chapter' },
  { value: 'pages', label: 'Page range' },
  { value: 'timestamp', label: 'Video timestamp' },
  { value: 'exercise', label: 'Exercise' },
  { value: 'other', label: 'Other portion' },
]

function portionLabel(l: SessionResource): string | null {
  if (!l.portion) return null
  const kind = PORTION_KINDS.find((k) => k.value === l.portion_kind)
  return l.portion_kind ? `${kind?.label}: ${l.portion}` : l.portion
}

export function SessionResources({ sessionId, compact: compactView = false }: { sessionId: string; compact?: boolean }) {
  const data = useStore((s) => s.data)
  const maps = useMaps()
  const links = data.session_resources.filter((l) => l.session_id === sessionId).sort((a, b) => a.position - b.position)
  const [attaching, setAttaching] = useState(false)
  const [editing, setEditing] = useState<SessionResource | null>(null)

  return (
    <div>
      {links.length === 0 && !compactView && <p className="text-[13px] text-faint">No resources attached.</p>}
      <ul className="space-y-1">
        {links.map((l) => {
          const r = maps.resources.get(l.resource_id)
          if (!r) return null
          const href = safeHref(r.url)
          const portion = portionLabel(l)
          return (
            <li key={l.id} className="group flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-[var(--accent)]"
                checked={l.portion_done}
                aria-label={`Assigned portion done: ${r.title}`}
                title="Assigned portion done (separate from finishing the whole resource)"
                onChange={() => void act(compact([update('session_resources', l, { portion_done: !l.portion_done })]), { allowReopen: true })}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className={cn('inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline', l.portion_done && 'opacity-70')}>
                      {r.title} <ExternalLink className="size-3" aria-hidden /> <span className="sr-only">(opens in new tab)</span>
                    </a>
                  ) : (
                    <span className="text-sm font-medium">{r.title}</span>
                  )}
                  <Badge>{RESOURCE_TYPES.find((t) => t.value === r.type)?.label}</Badge>
                  {!compactView && r.status !== 'not_started' && (
                    <Badge tone={r.status === 'completed' ? 'success' : 'accent'}>
                      Whole: {RESOURCE_STATUS.find((s) => s.value === r.status)?.label}
                    </Badge>
                  )}
                </div>
                {portion && <p className="text-[12.5px] text-muted">{portion}</p>}
              </div>
              <div className="flex opacity-100 lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
                <Button variant="ghost" size="icon-sm" aria-label={`Edit assigned portion: ${r.title}`} onClick={() => setEditing(l)}>
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${r.title} from this session`}
                  title="Remove from session (keeps it in the library)"
                  onClick={() => void act([remove('session_resources', [l])], { label: 'Removed from session (still in library)' })}
                >
                  <Link2Off />
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
      <Button size="sm" variant="ghost" className="mt-1" onClick={() => setAttaching(true)}>
        <Plus /> Add resource
      </Button>
      {attaching && <AttachResourceDialog sessionId={sessionId} onClose={() => setAttaching(false)} />}
      {editing && <PortionDialog link={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function PortionFields({ kind, portion, onChange }: { kind: PortionKind | ''; portion: string; onChange: (k: PortionKind | '', p: string) => void }) {
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
      <Field label="Assigned portion">
        {(id) => (
          <Select id={id} value={kind} onChange={(e) => onChange(e.target.value as PortionKind | '', portion)}>
            {PORTION_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </Select>
        )}
      </Field>
      <Field label="Details (optional)">
        {(id) => (
          <Input id={id} placeholder="e.g. Ch. 4, pp. 80–95, 12:30–25:00" value={portion} onChange={(e) => onChange(kind, e.target.value)} />
        )}
      </Field>
    </div>
  )
}

function AttachResourceDialog({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const ctx = useStore((s) => s.ctx)
  const [tab, setTab] = useState<'library' | 'new'>(data.resources.some((r) => !r.archived_at) ? 'library' : 'new')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [draft, setDraft] = useState(draftFrom())
  const [kind, setKind] = useState<PortionKind | ''>('')
  const [portion, setPortion] = useState('')
  const [error, setError] = useState<string | null>(null)

  const attachedIds = new Set(data.session_resources.filter((l) => l.session_id === sessionId).map((l) => l.resource_id))
  const results = useMemo(() => {
    const q = query.toLowerCase().trim()
    return data.resources
      .filter((r) => !r.archived_at)
      .filter((r) => !q || [r.title, r.description, r.url ?? '', ...r.tags].some((f) => f.toLowerCase().includes(q)))
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 50)
  }, [data.resources, query])

  const position = data.session_resources.filter((l) => l.session_id === sessionId).length
  const submit = async () => {
    const linkFields = { portion_kind: kind || null, portion: portion.trim(), position }
    if (tab === 'library') {
      if (!picked) return setError('Choose a resource from your library.')
      await act([insert('session_resources', [newSessionResource(ctx, { session_id: sessionId, resource_id: picked, ...linkFields })])], { label: 'Resource attached' })
    } else {
      const problem = validateDraft(draft)
      if (problem) return setError(problem)
      const resource = newResource(ctx, draftToFields(draft))
      await act(
        [insert('resources', [resource]), insert('session_resources', [newSessionResource(ctx, { session_id: sessionId, resource_id: resource.id, ...linkFields })])],
        { label: 'Resource added to library and attached' },
      )
    }
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add a resource to this session"
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()}>Attach</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          label="Resource source"
          value={tab}
          onChange={(v) => { setTab(v); setError(null) }}
          options={[{ value: 'library', label: 'From library' }, { value: 'new', label: 'New resource' }]}
        />
        {tab === 'library' ? (
          <div className="space-y-2">
            <Input aria-label="Search library" placeholder="Search title, tags, URL…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
            <div role="radiogroup" aria-label="Library resources" className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border border-line p-1">
              {results.length === 0 && <p className="p-3 text-[13px] text-faint">No matching resources. Switch to “New resource” to add one.</p>}
              {results.map((r) => (
                <label key={r.id} className={cn('flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-2', picked === r.id && 'bg-accent-soft')}>
                  <input type="radio" name="resource" className="accent-[var(--accent)]" checked={picked === r.id} onChange={() => setPicked(r.id)} />
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                  {attachedIds.has(r.id) && <Badge>already attached</Badge>}
                  <Badge>{RESOURCE_TYPES.find((t) => t.value === r.type)?.label}</Badge>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <ResourceForm value={draft} onChange={setDraft} />
        )}
        <PortionFields kind={kind} portion={portion} onChange={(k, p) => { setKind(k); setPortion(p) }} />
        {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  )
}

function PortionDialog({ link, onClose }: { link: SessionResource; onClose: () => void }) {
  const [kind, setKind] = useState<PortionKind | ''>(link.portion_kind ?? '')
  const [portion, setPortion] = useState(link.portion)
  const save = async () => {
    await act(compact([update('session_resources', link, { portion_kind: kind || null, portion: portion.trim() })]))
    onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Assigned portion"
      size="sm"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void save()}>Save</Button></>}
    >
      <PortionFields kind={kind} portion={portion} onChange={(k, p) => { setKind(k); setPortion(p) }} />
    </Dialog>
  )
}
