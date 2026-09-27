import type {
  ReplayHabitId,
  ReplayTrainingProjectId,
} from '../replay/replayTrainingFocus'
import type { Subject3PracticeSliceId } from '../subject3/subject3Practice'

export type TrainingPackId = 'space-position' | 'observation-signal'

export interface TrainingPackStageDefinition {
  project: ReplayTrainingProjectId
  label: string
  subject3Practice?: Subject3PracticeSliceId
}

export interface TrainingPackDefinition {
  id: TrainingPackId
  title: string
  summary: string
  habits: readonly ReplayHabitId[]
  stages: readonly TrainingPackStageDefinition[]
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
    stages: [
      { project: 'reverse-parking', label: '倒车入库' },
      { project: 'side-parking', label: '侧方停车' },
      { project: 'curve-driving', label: '曲线行驶' },
      { project: 'right-angle', label: '直角转弯' },
    ],
  },
  {
    id: 'observation-signal',
    title: '观察与信号',
    summary: '把观察、转向灯和车辆动作的先后关系练成稳定流程。',
    habits: ['observation-signal'],
    stages: [
      { project: 'right-angle', label: '直角转弯' },
      {
        project: 'subject3',
        label: '路口左右转弯',
        subject3Practice: 'intersection-turns',
      },
      {
        project: 'subject3',
        label: '变更车道',
        subject3Practice: 'lane-change',
      },
      {
        project: 'subject3',
        label: '靠边停车',
        subject3Practice: 'pull-over',
      },
    ],
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

export function trainingPackStage(
  state: TrainingPackSessionState,
): TrainingPackStageDefinition {
  const pack = trainingPackById(state.id)
  const stage = pack.stages[state.index]
  if (!stage) throw new Error(`Invalid training pack stage: ${state.id}#${state.index}`)
  return stage
}

export function trainingPackProject(
  state: TrainingPackSessionState,
): ReplayTrainingProjectId {
  return trainingPackStage(state).project
}

export function trainingPackStageLabel(state: TrainingPackSessionState) {
  return trainingPackStage(state).label
}

export function nextTrainingPackState(
  state: TrainingPackSessionState,
): TrainingPackSessionState | null {
  const pack = trainingPackById(state.id)
  const nextIndex = state.index + 1
  return nextIndex < pack.stages.length
    ? { id: state.id, index: nextIndex }
    : null
}
