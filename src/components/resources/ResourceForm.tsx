import { useState } from 'react'
import type { Resource, ResourceStatus, ResourceType } from '../../domain/types'
import { activeTopics, activeTracks } from '../../state/selectors'
import { useStore } from '../../state/store'
import { Field, Input, Select, Textarea } from '../ui/field'

export const RESOURCE_TYPES: { value: ResourceType; label: string }[] = [
  { value: 'paper', label: 'Paper' },
  { value: 'article', label: 'Article' },
  { value: 'video', label: 'Video' },
  { value: 'course', label: 'Course' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'repository', label: 'Repository' },
  { value: 'book', label: 'Book' },
  { value: 'other', label: 'Other' },
]

export const RESOURCE_STATUS: { value: ResourceStatus; label: string }[] = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
]

export interface ResourceDraft {
  title: string
  url: string
  type: ResourceType
  description: string
  tags: string
  track_ids: string[]
  topic_ids: string[]
  stage_ids: string[]
  status: ResourceStatus
}

export function draftFrom(r?: Resource): ResourceDraft {
  return {
    title: r?.title ?? '', url: r?.url ?? '', type: r?.type ?? 'paper', description: r?.description ?? '',
    tags: r?.tags.join(', ') ?? '', track_ids: r?.track_ids ?? [], topic_ids: r?.topic_ids ?? [],
    stage_ids: r?.stage_ids ?? [], status: r?.status ?? 'not_started',
  }
}

export function validateDraft(d: ResourceDraft): string | null {
  if (!d.title.trim()) return 'A title is required.'
  const url = d.url.trim()
  if (url && !/^https?:\/\/[^\s]+$/i.test(url)) return 'URLs must start with http:// or https:// (or leave it empty for offline references).'
  return null
}

export function draftToFields(d: ResourceDraft): Partial<Resource> & { title: string } {
  return {
    title: d.title.trim(),
    url: d.url.trim() || null,
    type: d.type,
    description: d.description,
    tags: [...new Set(d.tags.split(',').map((t) => t.trim()).filter(Boolean))],
    track_ids: d.track_ids,
    topic_ids: d.topic_ids,
    stage_ids: d.stage_ids,
    status: d.status,
  }
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

export function ResourceForm({ value, onChange }: { value: ResourceDraft; onChange: (d: ResourceDraft) => void }) {
  const data = useStore((s) => s.data)
  const tracks = activeTracks(data)
  const topics = activeTopics(data)
  const stages = data.stages.filter((s) => !s.archived_at).sort((a, b) => a.position - b.position)
  const [topicQuery, setTopicQuery] = useState('')
  const shownTopics = topics
    .filter((t) => value.topic_ids.includes(t.id) || t.title.toLowerCase().includes(topicQuery.toLowerCase()))
    .slice(0, 40)

  return (
    <div className="space-y-3">
      <Field label="Title">
        {(id) => <Input id={id} value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} autoFocus />}
      </Field>
      <Field label="URL (optional)" hint="Leave empty for books or offline references.">
        {(id) => (
          <Input id={id} type="url" inputMode="url" placeholder="https://…" value={value.url} onChange={(e) => onChange({ ...value, url: e.target.value })} />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          {(id) => (
            <Select id={id} value={value.type} onChange={(e) => onChange({ ...value, type: e.target.value as ResourceType })}>
              {RESOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Status (whole resource)">
          {(id) => (
            <Select id={id} value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value as ResourceStatus })}>
              {RESOURCE_STATUS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Description (optional)">
        {(id) => <Textarea id={id} rows={2} value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} />}
      </Field>
      <Field label="Tags (comma separated)">
        {(id) => <Input id={id} value={value.tags} onChange={(e) => onChange({ ...value, tags: e.target.value })} />}
      </Field>

      {tracks.length > 0 && (
        <fieldset>
          <legend className="mb-1 text-[13px] font-medium text-muted">Tracks (optional)</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {tracks.map((t) => (
              <label key={t.id} className="inline-flex items-center gap-1.5 text-sm">
                <input type="checkbox" className="accent-[var(--accent)]" checked={value.track_ids.includes(t.id)} onChange={() => onChange({ ...value, track_ids: toggle(value.track_ids, t.id) })} />
                {t.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {stages.length > 0 && (
        <fieldset>
          <legend className="mb-1 text-[13px] font-medium text-muted">Stages (optional)</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {stages.map((s) => (
              <label key={s.id} className="inline-flex items-center gap-1.5 text-sm">
                <input type="checkbox" className="accent-[var(--accent)]" checked={value.stage_ids.includes(s.id)} onChange={() => onChange({ ...value, stage_ids: toggle(value.stage_ids, s.id) })} />
                {s.title}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {topics.length > 0 && (
        <fieldset>
          <legend className="mb-1 text-[13px] font-medium text-muted">Topics (optional)</legend>
          <Input aria-label="Filter topics" placeholder="Filter topics…" value={topicQuery} onChange={(e) => setTopicQuery(e.target.value)} className="mb-1.5 h-8" />
          <div className="flex max-h-32 flex-wrap gap-x-4 gap-y-1 overflow-y-auto">
            {shownTopics.map((t) => (
              <label key={t.id} className="inline-flex items-center gap-1.5 text-sm">
                <input type="checkbox" className="accent-[var(--accent)]" checked={value.topic_ids.includes(t.id)} onChange={() => onChange({ ...value, topic_ids: toggle(value.topic_ids, t.id) })} />
                {t.title}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  )
}
