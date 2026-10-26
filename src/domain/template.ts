// The optional "AI/ML for Protein Design" starter template, importable in parts.
// Resource sections are intentionally empty: no invented titles or URLs.
import { studyDaysFrom } from '../lib/dates'
import { applyChanges, insert, type Change } from './changes'
import {
  newBlock, newCheckpoint, newGoal, newRecurringBlock, newSession, newSessionTemplate, newStage,
  newTask, newTopic, newTrack, type Ctx,
} from './factories'
import { planOccurrences } from './recurrence'
import type { Block, ISODate, Session, Snapshot, Task, TaskBlueprint, Track, Weekday } from './types'

export const TEMPLATE_NAME = 'AI/ML for Protein Design'

type TrackKey = 'bio' | 'comp' | 'ai'

const TRACKS: { key: TrackKey; name: string; color: string }[] = [
  { key: 'bio', name: 'Biology', color: 'emerald' },
  { key: 'comp', name: 'Computational foundations', color: 'sky' },
  { key: 'ai', name: 'AI/application', color: 'amber' },
]

interface StageSeed {
  title: string
  weeks: [number, number]
  topics: Record<TrackKey, string[]>
  checkpoints: string[]
}

const STAGES: StageSeed[] = [
  {
    title: 'Establish foundations', weeks: [4, 6],
    topics: {
      bio: ['Protein chemistry and structure', 'Essential molecular and cellular biology'],
      comp: ['Python', 'NumPy', 'Git', 'Command line', 'Linear algebra', 'Probability'],
      ai: ['ML workflows', 'Baselines', 'Losses', 'Evaluation', 'Basic PyTorch'],
    },
    checkpoints: ['Analyze a sequence', 'Explain structural chemistry', 'Manipulate arrays', 'Train and debug a small model'],
  },
  {
    title: 'Understand interactions and measurements', weeks: [4, 6],
    topics: {
      bio: ['Binding thermodynamics and kinetics', 'Antibodies', 'Signaling', 'Target biology', 'Assays'],
      comp: ['Calculus', 'Optimization', 'Statistics', 'Curve fitting', 'Scientific data handling'],
      ai: ['Supervised learning', 'Uncertainty', 'Leakage', 'Generalization'],
    },
    checkpoints: ['Distinguish affinity, specificity, and function', 'Interpret an assay', 'Design a defensible evaluation'],
  },
  {
    title: 'Learn sequence modeling', weeks: [6, 8],
    topics: {
      bio: ['Evolution', 'Conservation', 'Mutations', 'Sequence–function relationships'],
      comp: ['Tensor programming', 'Batching', 'Data pipelines', 'Relevant algorithms'],
      ai: ['Attention', 'Transformers', 'Protein language models', 'Embeddings', 'Adaptation'],
    },
    checkpoints: ['Trace attention tensor shapes', 'Explain a training objective', 'Compare a protein model with a baseline'],
  },
  {
    title: 'Learn structural modeling', weeks: [6, 8],
    topics: {
      bio: ['Structural methods', 'Interfaces', 'Dynamics', 'Conformational change'],
      comp: ['Geometry', 'Graphs', 'Rotations', 'Symmetry'],
      ai: ['Structure prediction', 'Geometric learning', 'Inverse folding'],
    },
    checkpoints: ['Explain geometric requirements', 'Inspect a complex', 'Distinguish confidence from experimental evidence'],
  },
  {
    title: 'Study generative protein design', weeks: [6, 8],
    topics: {
      bio: ['Developability', 'Stability', 'Specificity', 'Biological function'],
      comp: ['Sampling', 'Probabilistic modeling', 'Computational experiments'],
      ai: ['Diffusion', 'Autoregressive models', 'Conditioning', 'Design objectives', 'Candidate selection'],
    },
    checkpoints: ['Explain training and sampling', 'Run a manageable workflow', 'Identify unverified claims'],
  },
  {
    title: 'Focused research-style project', weeks: [8, 12],
    topics: {
      bio: ['Study one target or protein family'],
      comp: ['Reproducible pipeline', 'Comparisons', 'Error analysis'],
      ai: ['Reproduce a result', 'Test a focused change', 'Propose validation'],
    },
    checkpoints: ['Produce reproducible results', 'Defend a narrow conclusion with limitations'],
  },
]

const SAMPLE_WEEK: Record<TrackKey, string>[] = [
  {
    bio: 'Draw the relationship between atoms, amino acids, sequences, and folded proteins',
    comp: 'Write a Python amino-acid-sequence validator',
    ai: 'Define a prediction task’s inputs, outputs, labels, and baseline',
  },
  {
    bio: 'Compare amino-acid side-chain properties',
    comp: 'Count residue frequencies',
    ai: 'Compare token IDs, one-hot encoding, and embeddings',
  },
  {
    bio: 'Explain levels of protein structure',
    comp: 'Calculate distances between 3-D coordinates',
    ai: 'Trace a small network’s forward pass and tensor shapes',
  },
  {
    bio: 'Explain major interactions and steric clashes',
    comp: 'Practice matrix multiplication',
    ai: 'Explain loss, gradients, and parameter updates',
  },
  {
    bio: 'Recall and connect the week’s concepts',
    comp: 'Combine exercises into a documented script',
    ai: 'Review outputs, identify gaps, and plan next steps',
  },
]

export const STRUCTURE_STEPS: TaskBlueprint[] = [
  { title: 'Recall', est_min: 10 },
  { title: 'Learn', est_min: 40 },
  { title: 'Break', est_min: 10 },
  { title: 'Practice', est_min: 50 },
  { title: 'Close and record next steps', est_min: 10 },
].map((s) => ({ ...s, description: '', required: false, output: '' }))

export interface TemplateOptions {
  tracks: boolean
  goal: boolean
  roadmap: boolean
  structure: boolean
  schedule: boolean
  sampleWeek: boolean
}

export interface CalendarInputs {
  startDate: ISODate
  studyDays: Weekday[]
}

export const ALL_PARTS: TemplateOptions = {
  tracks: true, goal: true, roadmap: true, structure: true, schedule: true, sampleWeek: true,
}

/** Whether the chosen parts create calendar entries (and therefore need a start date). */
export function needsCalendar(opts: TemplateOptions): boolean {
  return opts.schedule || opts.sampleWeek
}

/**
 * Builds the selected template parts. Calendar parts only use `cal`, and only
 * ever create entries for the first study week — never months ahead.
 * Existing tracks with the same names are reused instead of duplicated.
 */
export function buildTemplate(current: Snapshot, opts: TemplateOptions, ctx: Ctx, cal?: CalendarInputs): Change[] {
  const changes: Change[] = []
  const trackIds = new Map<TrackKey, string>()
  const wantTracks = opts.tracks || opts.sampleWeek || opts.schedule

  if (wantTracks) {
    const created: Track[] = []
    const basePos = current.tracks.length
    TRACKS.forEach((t, i) => {
      const existing = current.tracks.find((x) => !x.archived_at && x.name.toLowerCase() === t.name.toLowerCase())
      if (existing) trackIds.set(t.key, existing.id)
      else {
        const row = newTrack(ctx, { name: t.name, color: t.color, position: basePos + i })
        created.push(row)
        trackIds.set(t.key, row.id)
      }
    })
    if (created.length) changes.push(insert('tracks', created))
  }

  let goalId: string | null = null
  if (opts.goal) {
    const goal = newGoal(ctx, { title: 'Evaluate AI-generated protein binders', position: current.goals.length })
    goalId = goal.id
    changes.push(insert('goals', [goal]))
  }

  if (opts.roadmap) {
    const stages = STAGES.map((s, i) =>
      newStage(ctx, {
        title: s.title, position: current.stages.length + i, est_weeks_min: s.weeks[0], est_weeks_max: s.weeks[1],
      }),
    )
    const topics = STAGES.flatMap((s, i) =>
      (Object.keys(s.topics) as TrackKey[]).flatMap((key) =>
        s.topics[key].map((title, j) =>
          newTopic(ctx, {
            title, stage_id: stages[i].id, position: j,
            track_ids: trackIds.has(key) ? [trackIds.get(key)!] : [],
            goal_ids: goalId ? [goalId] : [],
          }),
        ),
      ),
    )
    const checkpoints = STAGES.flatMap((s, i) =>
      s.checkpoints.map((title, j) => newCheckpoint(ctx, { title, stage_id: stages[i].id, position: j })),
    )
    changes.push(insert('stages', stages), insert('topics', topics), insert('checkpoints', checkpoints))
  }

  if (opts.structure) {
    changes.push(
      insert('session_templates', [
        newSessionTemplate(ctx, {
          name: 'Two-hour study session', planned_min: 120, tasks: STRUCTURE_STEPS,
          description: 'Suggested flow inside one session. Edit or ignore any step.',
        }),
      ]),
    )
  }

  if (!needsCalendar(opts) || !cal) return changes

  const weekDates = studyDaysFrom(cal.startDate, cal.studyDays, 5)
  if (opts.schedule) {
    const rules = TRACKS.map((t) =>
      newRecurringBlock(ctx, {
        title: t.name, track_id: trackIds.get(t.key) ?? null, weekdays: cal.studyDays, duration_min: 120,
        starts_on: cal.startDate,
      }),
    )
    changes.push(insert('recurring_blocks', rules))
  }

  // Occurrences are created with their sample sessions already attached (one
  // insert instead of an insert plus one update per block), after the sessions
  // they reference.
  const lastDate = weekDates[weekDates.length - 1] ?? cal.startDate
  const occurrences = opts.schedule ? planOccurrences(applyChanges(current, changes), cal.startDate, lastDate, ctx) : []
  if (opts.sampleWeek) {
    const withSlots = applyChanges(current, [...changes, ...(occurrences.length ? [insert('blocks', occurrences)] : [])])
    const sample = sampleWeek(withSlots, weekDates, trackIds, opts, ctx)
    changes.push(insert('sessions', sample.sessions), insert('tasks', sample.tasks))
    const linked = occurrences.map((b) => (sample.assign.has(b.id) ? { ...b, session_id: sample.assign.get(b.id)! } : b))
    if (linked.length) changes.push(insert('blocks', linked))
    if (sample.blocks.length) changes.push(insert('blocks', sample.blocks))
  } else if (occurrences.length) {
    changes.push(insert('blocks', occurrences))
  }
  return changes
}

interface SampleWeek {
  sessions: Session[]
  tasks: Task[]
  blocks: Block[] // one-off blocks when there is no recurring slot
  assign: Map<string, string> // recurring slot block id → session id
}

function sampleWeek(
  snap: Snapshot, dates: ISODate[], trackIds: Map<TrackKey, string>, opts: TemplateOptions, ctx: Ctx,
): SampleWeek {
  const out: SampleWeek = { sessions: [], tasks: [], blocks: [], assign: new Map() }
  const firstStage = opts.roadmap ? snap.stages.find((s) => s.title === STAGES[0].title) : undefined

  for (const [dayIndex, day] of SAMPLE_WEEK.entries()) {
    const date = dates[dayIndex]
    if (!date) break
    for (const [k, prompt] of Object.entries(day) as [TrackKey, string][]) {
      const trackId = trackIds.get(k) ?? null
      const topic = firstStage
        ? snap.topics.find((t) => t.stage_id === firstStage.id && trackId && t.track_ids.includes(trackId))
        : undefined
      const session = newSession(ctx, { title: prompt, track_id: trackId, topic_id: topic?.id ?? null, planned_min: 120 })
      out.sessions.push(session)
      out.tasks.push(newTask(ctx, { session_id: session.id, title: prompt, required: true, position: 0 }))
      if (opts.structure) {
        STRUCTURE_STEPS.forEach((s, i) => out.tasks.push(newTask(ctx, { ...s, session_id: session.id, position: i + 1 })))
      }
      const slot = snap.blocks.find(
        (b) => b.date === date && b.recurrence_id && b.track_id === trackId && !b.session_id && !out.assign.has(b.id),
      )
      if (slot) {
        out.assign.set(slot.id, session.id)
      } else {
        const position = snap.blocks.filter((b) => b.date === date).length + out.blocks.filter((b) => b.date === date).length
        out.blocks.push(newBlock(ctx, { date, position, session_id: session.id, track_id: trackId, duration_min: 120 }))
      }
    }
  }
  return out
}
