import { useSearchParams } from 'react-router-dom'
import { buildStudyGuide } from '../domain/studyGuide'
import { useStore } from '../state/store'
import { Button } from '../components/ui/button'
import { act } from '../state/actions'
import { GoalsPanel } from '../components/curriculum/GoalsPanel'
import { StagesPanel } from '../components/curriculum/StagesPanel'
import { TemplatesPanel } from '../components/curriculum/TemplatesPanel'
import { TopicsPanel } from '../components/curriculum/TopicsPanel'
import { TracksManager } from '../components/curriculum/TracksManager'
import { PageHeader, Segmented } from '../components/ui/misc'

type Tab = 'topics' | 'stages' | 'goals' | 'tracks' | 'templates'
const TABS: Tab[] = ['topics', 'stages', 'goals', 'tracks', 'templates']

export function CurriculumPage() {
  const data = useStore((s) => s.data)
  const ctx = useStore((s) => s.ctx)
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab') as Tab | null
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'topics'
  return (
    <div>
      <PageHeader
        title="Curriculum"
        subtitle="Organize what you’re learning. Nothing here is mandatory — fill in only the relationships that help."
      />
      <div className="mb-5 rounded-lg border border-line bg-surface p-4">
        <p className="text-sm font-medium">Protein design study guide</p>
        <p className="mt-1 text-sm text-muted">Add an editable six-stage guide, projects, and linked resources to your backlog. No calendar dates are assigned; existing notes and progress are kept. Re-import adds only missing lessons.</p>
        <Button className="mt-3" size="sm" onClick={() => {
          const changes = buildStudyGuide(data, ctx)
          if (changes.length) void act(changes, { label: 'Study guide added' })
        }}>Add study guide to backlog</Button>
      </div>
      <Segmented
        label="Curriculum section"
        value={tab}
        onChange={(t) => setParams({ tab: t })}
        className="mb-5 flex-wrap"
        options={[
          { value: 'topics', label: 'Topics' },
          { value: 'stages', label: 'Stages & checkpoints' },
          { value: 'goals', label: 'Goals' },
          { value: 'tracks', label: 'Tracks' },
          { value: 'templates', label: 'Templates' },
        ]}
      />
      {tab === 'topics' && <TopicsPanel />}
      {tab === 'stages' && <StagesPanel />}
      {tab === 'goals' && <GoalsPanel />}
      {tab === 'tracks' && <TracksManager />}
      {tab === 'templates' && <TemplatesPanel />}
    </div>
  )
}
