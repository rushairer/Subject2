import {
  replayHabitForInfraction,
  type ReplayHabitId,
  type ReplayTrainingProjectId,
} from '../replay/replayTrainingFocus'
import { trainingPackById, type TrainingPackId } from './trainingPacks'

export interface TrainingPackStageInfraction {
  id: string
  title: string
  points: number
  fatal?: boolean
}

export interface TrainingPackStageResult {
  packId: TrainingPackId
  index: number
  project: ReplayTrainingProjectId
  score: number
  completed: boolean
  passed: boolean
  infractions: readonly TrainingPackStageInfraction[]
}

export type TrainingPackTrend =
  | 'improving'
  | 'steady'
  | 'needs-attention'
  | 'insufficient'

export interface TrainingPackStageSummary extends TrainingPackStageResult {
  habitInfractionCount: number
  fatalCount: number
}

export interface TrainingPackReport {
  packId: TrainingPackId
  totalStages: number
  recordedStages: number
  completedStages: number
  passedStages: number
  totalInfractions: number
  totalFatalInfractions: number
  habitInfractions: number
  trend: TrainingPackTrend
  firstHabitInfractionCount: number | null
  lastHabitInfractionCount: number | null
  stages: TrainingPackStageSummary[]
  recommendedRetryProject: ReplayTrainingProjectId | null
}

function relevantHabitCount(
  habits: readonly ReplayHabitId[],
  infractions: readonly TrainingPackStageInfraction[],
) {
  return infractions.filter(item => habits.includes(replayHabitForInfraction(item))).length
}

function summarizeStage(
  habits: readonly ReplayHabitId[],
  stage: TrainingPackStageResult,
): TrainingPackStageSummary {
  return {
    ...stage,
    habitInfractionCount: relevantHabitCount(habits, stage.infractions),
    fatalCount: stage.infractions.filter(item => item.fatal).length,
  }
}

function compareRetryPriority(
  a: TrainingPackStageSummary,
  b: TrainingPackStageSummary,
) {
  if (b.fatalCount !== a.fatalCount) return b.fatalCount - a.fatalCount
  if (b.habitInfractionCount !== a.habitInfractionCount) {
    return b.habitInfractionCount - a.habitInfractionCount
  }
  if (b.infractions.length !== a.infractions.length) {
    return b.infractions.length - a.infractions.length
  }
  if (a.score !== b.score) return a.score - b.score
  return a.index - b.index
}

function stageTrend(stages: readonly TrainingPackStageSummary[]): TrainingPackTrend {
  if (stages.length < 2) return 'insufficient'

  const first = stages[0]
  const last = stages[stages.length - 1]

  if (last.fatalCount < first.fatalCount) return 'improving'
  if (last.fatalCount > first.fatalCount) return 'needs-attention'
  if (last.habitInfractionCount < first.habitInfractionCount) return 'improving'
  if (last.habitInfractionCount > first.habitInfractionCount) return 'needs-attention'
  return 'steady'
}

export function buildTrainingPackReport(
  packId: TrainingPackId,
  stageResults: readonly TrainingPackStageResult[],
): TrainingPackReport {
  const pack = trainingPackById(packId)
  const stages = stageResults
    .filter(stage => stage.packId === packId)
    .map(stage => summarizeStage(pack.habits, stage))
    .toSorted((a, b) => a.index - b.index)

  const retryCandidate = stages.length > 0
    ? [...stages].sort(compareRetryPriority)[0]
    : null

  return {
    packId,
    totalStages: pack.projects.length,
    recordedStages: stages.length,
    completedStages: stages.filter(stage => stage.completed).length,
    passedStages: stages.filter(stage => stage.passed).length,
    totalInfractions: stages.reduce((sum, stage) => sum + stage.infractions.length, 0),
    totalFatalInfractions: stages.reduce((sum, stage) => sum + stage.fatalCount, 0),
    habitInfractions: stages.reduce((sum, stage) => sum + stage.habitInfractionCount, 0),
    trend: stageTrend(stages),
    firstHabitInfractionCount: stages.length > 0 ? stages[0].habitInfractionCount : null,
    lastHabitInfractionCount: stages.length > 0 ? stages[stages.length - 1].habitInfractionCount : null,
    stages,
    recommendedRetryProject: retryCandidate?.project ?? null,
  }
}
