import type {
  ReplayHabitId,
  ReplayTrainingProjectId,
} from '../replay/replayTrainingFocus'

export type TrainingPackId = 'space-position' | 'observation-signal'

export interface TrainingPackDefinition {
  id: TrainingPackId
  title: string
  summary: string
  habits: readonly ReplayHabitId[]
  projects: readonly ReplayTrainingProjectId[]
}

export interface TrainingPackSessionState {
  id: TrainingPackId
  index: number
}

export const TRAINING_PACKS: readonly TrainingPackDefinition[] = [
  {
    id: 'space-position',
    title: '车身边线控制',
    summary: '连续训练库线、道路边线、后轮轨迹和车身余量判断。',
    habits: ['space-position'],
    projects: ['reverse-parking', 'side-parking', 'curve-driving', 'right-angle'],
  },
  {
    id: 'observation-signal',
    title: '观察与信号',
    summary: '把观察、转向灯和车辆动作的先后关系练成稳定流程。',
    habits: ['observation-signal'],
    projects: ['right-angle', 'subject3'],
  },
]

const PACK_BY_ID = new Map(
  TRAINING_PACKS.map(pack => [pack.id, pack] as const),
)

export function trainingPackById(id: TrainingPackId): TrainingPackDefinition {
  const pack = PACK_BY_ID.get(id)
  if (!pack) throw new Error(`Unknown training pack: ${id}`)
  return pack
}

export function trainingPackForHabit(
  habit: ReplayHabitId,
): TrainingPackDefinition | null {
  return TRAINING_PACKS.find(pack => pack.habits.includes(habit)) ?? null
}

export function trainingPackProject(
  state: TrainingPackSessionState,
): ReplayTrainingProjectId {
  const pack = trainingPackById(state.id)
  const project = pack.projects[state.index]
  if (!project) throw new Error(`Invalid training pack stage: ${state.id}#${state.index}`)
  return project
}

export function nextTrainingPackState(
  state: TrainingPackSessionState,
): TrainingPackSessionState | null {
  const pack = trainingPackById(state.id)
  const nextIndex = state.index + 1
  return nextIndex < pack.projects.length
    ? { id: state.id, index: nextIndex }
    : null
}
