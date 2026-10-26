import { useState } from 'react'
import { planStudyGuide } from '../../domain/studyGuide'
import { isISODate } from '../../lib/dates'
import { act } from '../../state/actions'
import { useStore } from '../../state/store'
import { Button } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { Field, Input } from '../ui/field'

export function StudyGuideScheduleDialog({ start, onClose }: { start: string; onClose: () => void }) {
  const data = useStore(s => s.data)
  const ctx = useStore(s => s.ctx)
  const [date, setDate] = useState(start)
  const [preview, setPreview] = useState(false)
  const valid = isISODate(date) && (data.settings[0]?.study_days.length ?? 0) > 0
  const plan = preview && valid ? planStudyGuide(data, date, ctx) : null
  return <Dialog open onOpenChange={o => !o && onClose()} title="Schedule the protein design guide" size="lg"
    description="Place the imported backlog in stage and track order on your configured study days."
    footer={<><Button onClick={onClose}>Cancel</Button>{!preview ? <Button variant="primary" disabled={!valid} onClick={() => setPreview(true)}>Preview schedule</Button> : <><Button onClick={() => setPreview(false)}>Change date</Button><Button variant="primary" disabled={!plan?.placements.length} onClick={() => { if (plan) void act(plan.changes, { label: 'Study guide scheduled' }).then(ok => { if (ok) onClose() }) }}>Add to calendar</Button></>}</>}>
    <Field label="Start date">{id => <Input id={id} type="date" value={date} onChange={e => { setDate(e.target.value); setPreview(false) }} />}</Field>
    {!valid && <p className="mt-2 text-sm text-destructive">Choose a valid date and at least one study day in Settings.</p>}
    <p className="mt-3 text-sm text-muted">Up to one lesson per track per study day, within your daily capacity. Each lesson is a starting block that you can extend or split. The stage duration estimates are not deadlines.</p>
    <p className="mt-2 text-sm text-muted">Unstarted original sample sessions may be returned to your backlog; notes, completed work, and occupied slots are kept. Already scheduled guide sessions stay where they are.</p>
    {plan && <div className="mt-4"><p className="text-sm font-medium">{plan.placements.length} lessons to schedule{plan.placements.length ? ` · ${plan.placements[0].date} to ${plan.placements[plan.placements.length - 1].date}` : ''}</p>
      {plan.remaining > 0 && <p className="mt-2 text-sm text-destructive">{plan.remaining} lessons could not fit. Check your daily capacity and schedule settings.</p>}
      <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto text-sm">{plan.placements.map((p,i) => <li key={i}><span className="text-muted">{p.date} · {p.track}</span> — {p.title}{p.replaced && <span className="text-muted"> (replaces sample: {p.replaced})</span>}</li>)}</ul>
      {!plan.placements.length && <p className="mt-2 text-sm text-muted">No unscheduled guide lessons found. Import the guide from Curriculum first, or check whether its sessions are already scheduled.</p>}
    </div>}
  </Dialog>
}
