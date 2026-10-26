import { useSearchParams } from 'react-router-dom'
import { GoalsPanel } from '../components/curriculum/GoalsPanel'
import { StagesPanel } from '../components/curriculum/StagesPanel'
import { TemplatesPanel } from '../components/curriculum/TemplatesPanel'
import { TopicsPanel } from '../components/curriculum/TopicsPanel'
import { TracksManager } from '../components/curriculum/TracksManager'
import { PageHeader, Segmented } from '../components/ui/misc'

type Tab = 'topics' | 'stages' | 'goals' | 'tracks' | 'templates'
const TABS: Tab[] = ['topics', 'stages', 'goals', 'tracks', 'templates']

export function CurriculumPage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab') as Tab | null
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'topics'
  return (
    <div>
      <PageHeader
        title="Curriculum"
        subtitle="Organize what you’re learning. Nothing here is mandatory — fill in only the relationships that help."
      />
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
