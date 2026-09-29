import type { ReplayTrainingProjectId } from '../replay/replayTrainingFocus'
import {
  buildTrainingPackReport,
  type TrainingPackStageResult,
} from './trainingPackReport'
import {
  TRAINING_PACKS,
  trainingPackById,
  type TrainingPackId,
} from './trainingPacks'

export type TrainingPackLicenseType = 'C1' | 'C2'

export interface TrainingPackRoundStageSnapshot {
  index: number
  project: ReplayTrainingProjectId
  score: number
  completed: boolean
  passed: boolean
  habitInfractionCount: number
  fatalCount: number
  totalInfractionCount: number
}

export interface TrainingPackRoundHistoryEntry {
  id: string
  createdAt: number
  candidateName: string
  licenseType: TrainingPackLicenseType
  packId: TrainingPackId
  recordedStages: number
  totalStages: number
  completedStages: number
  passedStages: number
  habitInfractions: number
  totalFatalInfractions: number
  totalInfractions: number
  stages: TrainingPackRoundStageSnapshot[]
}

export type TrainingPackMultiRoundTrend =
  | 'improving'
  | 'steady'
  | 'needs-attention'
  | 'mixed'
  | 'insufficient'

export interface TrainingPackRoundComparison {
  rounds: TrainingPackRoundHistoryEntry[]
  trend: TrainingPackMultiRoundTrend
  stableImprovement: boolean
  baseline: TrainingPackRoundHistoryEntry | null
  latest: TrainingPackRoundHistoryEntry | null
}

const HISTORY_KEY = 'subject2.trainingPackHistory.v1'
const HISTORY_LIMIT = 40
const COMPARISON_LIMIT = 5
const PACK_IDS = new Set(TRAINING_PACKS.map(pack => pack.id))

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function trainingPackStagesArePersonalEvidence(
  stages: readonly TrainingPackStageResult[],
) {
  return stages.length > 0 && stages.every(stage => !stage.coachAssisted)
}

export function trainingPackHistoryMatchesCurrentDefinition(
  entry: Pick<TrainingPackRoundHistoryEntry, 'packId' | 'totalStages'>,
) {
  return entry.totalStages === trainingPackById(entry.packId).stages.length
}

function isHistoryEntry(value: unknown): value is TrainingPackRoundHistoryEntry {
  if (value == null || typeof value !== 'object') return false
  const entry = value as Partial<TrainingPackRoundHistoryEntry>
  return (
    typeof entry.id === 'string' &&
    isFiniteNonNegative(entry.createdAt) &&
    typeof entry.candidateName === 'string' &&
    (entry.licenseType === 'C1' || entry.licenseType === 'C2') &&
    typeof entry.packId === 'string' &&
    PACK_IDS.has(entry.packId as TrainingPackId) &&
    isFiniteNonNegative(entry.recordedStages) &&
    isFiniteNonNegative(entry.totalStages) &&
    isFiniteNonNegative(entry.completedStages) &&
    isFiniteNonNegative(entry.passedStages) &&
    isFiniteNonNegative(entry.habitInfractions) &&
    isFiniteNonNegative(entry.totalFatalInfractions) &&
    isFiniteNonNegative(entry.totalInfractions) &&
    Array.isArray(entry.stages)
  )
}

export function buildTrainingPackHistoryEntry({
  id,
  createdAt,
  candidateName,
  licenseType,
  packId,
  stages,
}: {
  id: string
  createdAt: number
  candidateName: string
  licenseType: TrainingPackLicenseType
  packId: TrainingPackId
  stages: readonly TrainingPackStageResult[]
}): TrainingPackRoundHistoryEntry {
  if (!trainingPackStagesArePersonalEvidence(stages)) {
    throw new Error('Coach-assisted training stages cannot be persisted as personal history')
  }
  const report = buildTrainingPackReport(packId, stages)

  return {
    id,
    createdAt,
    candidateName,
    licenseType,
    packId,
    recordedStages: report.recordedStages,
    totalStages: report.totalStages,
    completedStages: report.completedStages,
    passedStages: report.passedStages,
    habitInfractions: report.habitInfractions,
    totalFatalInfractions: report.totalFatalInfractions,
    totalInfractions: report.totalInfractions,
    stages: report.stages.map(stage => ({
      index: stage.index,
      project: stage.project,
      score: stage.score,
      completed: stage.completed,
      passed: stage.passed,
      habitInfractionCount: stage.habitInfractionCount,
      fatalCount: stage.fatalCount,
      totalInfractionCount: stage.infractions.length,
    })),
  }
}

export function loadTrainingPackHistory({
  candidateName,
  licenseType,
  packId,
}: {
  candidateName?: string
  licenseType?: TrainingPackLicenseType
  packId?: TrainingPackId
} = {}): TrainingPackRoundHistoryEntry[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(isHistoryEntry)
      .filter(trainingPackHistoryMatchesCurrentDefinition)
      .filter(entry => candidateName == null || entry.candidateName === candidateName)
      .filter(entry => licenseType == null || entry.licenseType === licenseType)
      .filter(entry => packId == null || entry.packId === packId)
      .slice(0, HISTORY_LIMIT)
  } catch {
    return []
  }
}

export function appendTrainingPackHistory(entry: TrainingPackRoundHistoryEntry) {
  if (typeof window === 'undefined') return

  try {
    const existing = loadTrainingPackHistory()
    const next = [
      entry,
      ...existing.filter(item => item.id !== entry.id),
    ].slice(0, HISTORY_LIMIT)
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    // History is optional coaching context; the active result remains usable in-memory.
  }
}

function incompleteStageCount(round: TrainingPackRoundHistoryEntry) {
  return Math.max(0, round.recordedStages - round.completedStages)
}

/**
 * Negative means a has stronger evidence of improvement than b.
 * This is deliberately lexicographic rather than a synthesized coaching score.
 */
export function compareTrainingPackRoundEvidence(
  a: TrainingPackRoundHistoryEntry,
  b: TrainingPackRoundHistoryEntry,
) {
  if (a.totalFatalInfractions !== b.totalFatalInfractions) {
    return a.totalFatalInfractions - b.totalFatalInfractions
  }

  const incompleteDelta = incompleteStageCount(a) - incompleteStageCount(b)
  if (incompleteDelta !== 0) return incompleteDelta

  if (a.habitInfractions !== b.habitInfractions) {
    return a.habitInfractions - b.habitInfractions
  }

  return 0
}

export function compareTrainingPackRounds(
  entries: readonly TrainingPackRoundHistoryEntry[],
): TrainingPackRoundComparison {
  const rounds = [...entries]
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-COMPARISON_LIMIT)

  if (rounds.length < 2) {
    return {
      rounds,
      trend: 'insufficient',
      stableImprovement: false,
      baseline: rounds[0] ?? null,
      latest: rounds[rounds.length - 1] ?? null,
    }
  }

  const baseline = rounds[0]
  const latest = rounds[rounds.length - 1]
  const baselineDelta = compareTrainingPackRoundEvidence(latest, baseline)
  const adjacentDeltas = rounds.slice(1).map((round, index) => (
    compareTrainingPackRoundEvidence(round, rounds[index])
  ))
  const neverWorse = adjacentDeltas.every(delta => delta <= 0)
  const improvedAtLeastOnce = adjacentDeltas.some(delta => delta < 0)
  const stableImprovement = rounds.length >= 3 && neverWorse && improvedAtLeastOnce

  let trend: TrainingPackMultiRoundTrend
  if (stableImprovement) trend = 'improving'
  else if (baselineDelta < 0) trend = adjacentDeltas.some(delta => delta > 0) ? 'mixed' : 'improving'
  else if (baselineDelta > 0) trend = 'needs-attention'
  else trend = adjacentDeltas.some(delta => delta !== 0) ? 'mixed' : 'steady'

  return {
    rounds,
    trend,
    stableImprovement,
    baseline,
    latest,
  }
}
