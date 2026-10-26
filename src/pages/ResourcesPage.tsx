import { ExternalLink, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { safeHref } from '../components/Markdown'
import { deleteWithConsequences, rowMenu } from '../components/curriculum/shared'
import { RESOURCE_STATUS, RESOURCE_TYPES, ResourceForm, draftFrom, draftToFields, validateDraft } from '../components/resources/ResourceForm'
import { useOpenSession } from '../components/session/useOpenSession'
import { TrackBadge } from '../components/track'
import { Button } from '../components/ui/button'
import { Dialog } from '../components/ui/dialog'
import { Checkbox, Input, Select } from '../components/ui/field'
import { Menu } from '../components/ui/menu'
import { Badge, Empty, PageHeader } from '../components/ui/misc'
import { compact, insert, update } from '../domain/changes'
import { archive, deleteResource } from '../domain/curriculum'
import { newResource } from '../domain/factories'
import type { Resource, ResourceStatus, ResourceType } from '../domain/types'
import { formatShortDate } from '../lib/dates'
import { cn } from '../lib/cn'
import { act } from '../state/actions'
import { activeTracks, useMaps } from '../state/selectors'
import { useStore } from '../state/store'

function ResourceDialog({ resource, onClose }: { resource?: Resource; onClose: () => void }) {
  const ctx = useStore((s) => s.ctx)
  const [draft, setDraft] = useState(draftFrom(resource))
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    const problem = validateDraft(draft)
    if (problem) return setError(problem)
    const fields = draftToFields(draft)
    const changes = resource ? compact([update('resources', resource, fields)]) : [insert('resources', [newResource(ctx, fields)])]
    if (await act(changes, { label: resource ? undefined : 'Resource added' })) onClose()
  }
  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={resource ? 'Edit resource' : 'New resource'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void save()}>Save</Button></>}
    >
      <ResourceForm value={draft} onChange={setDraft} />
      {error && <p role="alert" className="mt-3 text-[13px] text-danger">{error}</p>}
    </Dialog>
  )
}

export function ResourcesPage() {
  const data = useStore((s) => s.data)
  const ctx = useStore((s) => s.ctx)
  const maps = useMaps()
  const { open } = useOpenSession()
  const [query, setQuery] = useState('')
  const [type, setType] = useState<ResourceType | ''>('')
  const [status, setStatus] = useState<ResourceStatus | ''>('')
  const [trackId, setTrackId] = useState('')
  const [tag, setTag] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<Resource | 'new' | null>(null)
  const snap = () => useStore.getState().data

  const tags = useMemo(() => [...new Set(data.resources.flatMap((r) => r.tags))].sort(), [data.resources])
  const list = useMemo(() => {
    const q = query.toLowerCase().trim()
    return data.resources
      .filter((r) => showArchived || !r.archived_at)
      .filter((r) => !type || r.type === type)
      .filter((r) => !status || r.status === status)
      .filter((r) => !trackId || r.track_ids.includes(trackId))
      .filter((r) => !tag || r.tags.includes(tag))
      .filter((r) => !q || [r.title, r.description, r.url ?? '', ...r.tags].some((f) => f.toLowerCase().includes(q)))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [data.resources, query, type, status, trackId, tag, showArchived])

  const setStatusOf = (r: Resource, s: ResourceStatus) => void act(compact([update('resources', r, { status: s })]))

  return (
    <div>
      <PageHeader
        title="Resource library"
        subtitle="Reusable references. Attach one resource to many sessions, each with its own assigned portion."
        actions={<Button variant="primary" size="sm" onClick={() => setEditing('new')}><Plus /> New resource</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input aria-label="Search resources" placeholder="Search title, description, tags, URL…" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-72" />
        <Select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value as ResourceType | '')} className="w-36">
          <option value="">All types</option>
          {RESOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as ResourceStatus | '')} className="w-36">
          <option value="">Any status</option>
          {RESOURCE_STATUS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        {activeTracks(data).length > 0 && (
          <Select aria-label="Filter by track" value={trackId} onChange={(e) => setTrackId(e.target.value)} className="w-44">
            <option value="">All tracks</option>
            {activeTracks(data).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        )}
        {tags.length > 0 && (
          <Select aria-label="Filter by tag" value={tag} onChange={(e) => setTag(e.target.value)} className="w-36">
            <option value="">Any tag</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        )}
        <Checkbox label="Show archived" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
      </div>

      {data.resources.length === 0 ? (
        <Empty title="Your library is empty" action={<Button onClick={() => setEditing('new')}><Plus /> Add your first resource</Button>}>
          Add papers, videos, courses, docs, repositories or books — or add them directly inside a session.
        </Empty>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">No resources match these filters.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((r) => {
            const href = safeHref(r.url)
            const links = data.session_resources.filter((l) => l.resource_id === r.id)
            return (
              <li key={r.id} className={cn('rounded-lg border border-line bg-surface px-4 py-3', r.archived_at && 'opacity-60')}>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                          {r.title} <ExternalLink className="size-3.5" aria-hidden /><span className="sr-only">(opens in new tab)</span>
                        </a>
                      ) : (
                        <span className="font-medium">{r.title}</span>
                      )}
                      <Badge>{RESOURCE_TYPES.find((t) => t.value === r.type)?.label}</Badge>
                      {r.archived_at && <Badge>Archived</Badge>}
                    </div>
                    {r.description && <p className="mt-0.5 text-[13px] text-muted">{r.description}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {r.track_ids.map((id) => <TrackBadge key={id} track={maps.tracks.get(id)} />)}
                      {r.topic_ids.map((id) => maps.topics.get(id)).filter(Boolean).map((t) => <Badge key={t!.id}>{t!.title}</Badge>)}
                      {r.stage_ids.map((id) => maps.stages.get(id)).filter(Boolean).map((s) => <Badge key={s!.id}>{s!.title}</Badge>)}
                      {r.tags.map((t) => <Badge key={t} tone="accent">#{t}</Badge>)}
                    </div>
                  </div>
                  <Select aria-label={`Status of ${r.title}`} value={r.status} onChange={(e) => setStatusOf(r, e.target.value as ResourceStatus)} className="h-8 w-36 text-[13px]">
                    {RESOURCE_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </Select>
                  <Menu
                    label={`Actions for ${r.title}`}
                    items={rowMenu({
                      archived: !!r.archived_at,
                      onEdit: () => setEditing(r),
                      onArchive: () => void act(archive(snap(), 'resources', r.id, r.archived_at ? null : ctx.now()), { label: r.archived_at ? 'Resource restored' : 'Resource archived' }),
                      onDelete: () => void deleteWithConsequences(r.title, links.length ? [`It will be removed from ${links.length} session(s)`] : [], deleteResource(snap(), r.id)),
                    })}
                  />
                </div>
                {links.length > 0 && (
                  <details className="mt-2 text-[13px]">
                    <summary className="cursor-pointer text-muted">Used in {links.length} session{links.length === 1 ? '' : 's'}</summary>
                    <ul className="mt-1 space-y-0.5 pl-3">
                      {links.map((l) => {
                        const s = maps.sessions.get(l.session_id)
                        const b = maps.blockBySession.get(l.session_id)
                        if (!s) return null
                        return (
                          <li key={l.id} className="flex flex-wrap items-center gap-2">
                            <span aria-label={l.portion_done ? 'Portion done' : 'Portion not done'}>{l.portion_done ? '✓' : '○'}</span>
                            <button type="button" className="hover:underline" onClick={() => open(s.id)}>{s.title}</button>
                            {l.portion && <span className="text-muted">— {l.portion}</span>}
                            <span className="text-faint">{b ? formatShortDate(b.date) : 'backlog'}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </details>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {editing && <ResourceDialog resource={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
