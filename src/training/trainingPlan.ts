import {
  compareTrainingPackRounds,
  type TrainingPackLicenseType,
  type TrainingPackMultiRoundTrend,
  type TrainingPackRoundHistoryEntry,
} from './trainingPackHistory'
import {
  TRAINING_PACKS,
  type TrainingPackId,
} from './trainingPacks'

export type TrainingPlanState =
  | 'priority'
  | 'reinforce'
  | 'baseline'
  | 'maintain'

export interface TrainingPlanItem {
  packId: TrainingPackId
  title: string
  summary: string
  state: TrainingPlanState
  label: string
  detail: string
  roundCount: number
  trend: TrainingPackMultiRoundTrend
  stableImprovement: boolean
  latestHabitInfractions: number | null
  latestFatalInfractions: number | null
  latestIncompleteStages: number | null
  latestCompletedStages: number | null
  totalStages: number
}

export interface TrainingPlan {
  items: TrainingPlanItem[]
  recommended: TrainingPlanItem
  totalRounds: number
}

const STATE_RANK: Record<TrainingPlanState, number> = {
  priority: 0,
  reinforce: 1,
  baseline: 2,
  maintain: 3,
}

function latestIncompleteStages(entry: TrainingPackRoundHistoryEntry) {
  return Math.max(0, entry.recordedStages - entry.completedStages)
}

function classifyPlanItem(
  entries: readonly TrainingPackRoundHistoryEntry[],
): Omit<TrainingPlanItem, 'packId' | 'title' | 'summary' | 'totalStages'> {
  const comparison = compareTrainingPackRounds(entries)
  const latest = comparison.latest
  const roundCount = comparison.rounds.length

  if (!latest) {
    return {
      state: 'baseline',
      label: '建立基线',
      detail: '还没有完整训练包记录。先完整练一轮，后续才能判断这个习惯是在改善、持平还是反弹。',
      roundCount: 0,
      trend: 'insufficient',
      stableImprovement: false,
      latestHabitInfractions: null,
      latestFatalInfractions: null,
      latestIncompleteStages: null,
      latestCompletedStages: null,
    }
  }

  const incompleteStages = latestIncompleteStages(latest)

  if (
    latest.totalFatalInfractions > 0 ||
    incompleteStages > 0 ||
    comparison.trend === 'needs-attention'
  ) {
    const detail = latest.totalFatalInfractions > 0
      ? `最近一轮仍有 ${latest.totalFatalInfractions} 条不合格记录，优先把严重错误消掉再观察趋势。`
      : incompleteStages > 0
        ? `最近一轮有 ${incompleteStages} 个阶段未完整完成，先把动作流程练完整。`
        : '最近一轮关键错误证据比当前比较窗口的起点更多，建议立即回到这个训练包巩固。'

    return {
      state: 'priority',
      label: '优先巩固',
      detail,
      roundCount,
      trend: comparison.trend,
      stableImprovement: comparison.stableImprovement,
      latestHabitInfractions: latest.habitInfractions,
      latestFatalInfractions: latest.totalFatalInfractions,
      latestIncompleteStages: incompleteStages,
      latestCompletedStages: latest.completedStages,
    }
  }

  if (
    comparison.trend === 'mixed' ||
    latest.habitInfractions > 0 ||
    comparison.trend === 'improving'
  ) {
    let detail = '已经出现改善，但还需要继续训练确认是否能稳定保持。'

    if (comparison.trend === 'mixed') {
      detail = '最近几轮有改善也有反弹，暂时还不能把这个习惯视为稳定。'
    } else if (comparison.stableImprovement && latest.habitInfractions > 0) {
      detail = `虽然已经连续改善，但最近一轮仍有 ${latest.habitInfractions} 条目标习惯错误，继续巩固更合适。`
    } else if (roundCount === 1 && latest.habitInfractions > 0) {
      detail = `首轮记录到 ${latest.habitInfractions} 条目标习惯错误，再练一轮才能判断变化方向。`
    } else if (latest.habitInfractions > 0) {
      detail = `最近一轮仍有 ${latest.habitInfractions} 条目标习惯错误，继续训练直到证据稳定下降。`
    }

    return {
      state: 'reinforce',
      label: '继续巩固',
      detail,
      roundCount,
      trend: comparison.trend,
      stableImprovement: comparison.stableImprovement,
      latestHabitInfractions: latest.habitInfractions,
      latestFatalInfractions: latest.totalFatalInfractions,
      latestIncompleteStages: incompleteStages,
      latestCompletedStages: latest.completedStages,
    }
  }

  if (roundCount < 2) {
    return {
      state: 'baseline',
      label: '再练一轮',
      detail: '当前只有一轮完整记录，且没有记录到目标习惯错误。再完成一轮后才开始做跨轮次判断。',
      roundCount,
      trend: comparison.trend,
      stableImprovement: comparison.stableImprovement,
      latestHabitInfractions: latest.habitInfractions,
      latestFatalInfractions: latest.totalFatalInfractions,
      latestIncompleteStages: incompleteStages,
      latestCompletedStages: latest.completedStages,
    }
  }

  return {
    state: 'maintain',
    label: comparison.stableImprovement ? '降低优先级' : '保持手感',
    detail: comparison.stableImprovement
      ? '最近至少三轮关键错误证据没有反弹并出现实际下降，且最近一轮未记录目标习惯错误。可以降低优先级，改为定期复练。'
      : `最近 ${roundCount} 轮没有记录到目标习惯错误，也没有严重或未完成阶段。保持周期性复练即可。`,
    roundCount,
    trend: comparison.trend,
    stableImprovement: comparison.stableImprovement,
    latestHabitInfractions: latest.habitInfractions,
    latestFatalInfractions: latest.totalFatalInfractions,
    latestIncompleteStages: incompleteStages,
    latestCompletedStages: latest.completedStages,
  }
}

function evidenceValue(value: number | null) {
  return value ?? -1
}

export function buildTrainingPlan({
  candidateName,
  licenseType,
  history,
}: {
  candidateName: string
  licenseType: TrainingPackLicenseType
  history: readonly TrainingPackRoundHistoryEntry[]
}): TrainingPlan {
  const scopedHistory = history.filter(entry => (
    entry.candidateName === candidateName &&
    entry.licenseType === licenseType
  ))

  const items = TRAINING_PACKS.map((pack, index) => {
    const entries = scopedHistory.filter(entry => entry.packId === pack.id)
    const classified = classifyPlanItem(entries)

    return {
      packId: pack.id,
      title: pack.title,
      summary: pack.summary,
      totalStages: pack.projects.length,
      sourceIndex: index,
      ...classified,
    }
  }).sort((a, b) => {
    const stateDelta = STATE_RANK[a.state] - STATE_RANK[b.state]
    if (stateDelta !== 0) return stateDelta

    const fatalDelta = evidenceValue(b.latestFatalInfractions) - evidenceValue(a.latestFatalInfractions)
    if (fatalDelta !== 0) return fatalDelta

    const incompleteDelta = evidenceValue(b.latestIncompleteStages) - evidenceValue(a.latestIncompleteStages)
    if (incompleteDelta !== 0) return incompleteDelta

    const habitDelta = evidenceValue(b.latestHabitInfractions) - evidenceValue(a.latestHabitInfractions)
    if (habitDelta !== 0) return habitDelta

    return a.sourceIndex - b.sourceIndex
  }).map(({ sourceIndex: _sourceIndex, ...item }) => item)

  if (items.length === 0) {
    throw new Error('Training plan requires at least one configured training pack.')
  }

  return {
    items,
    recommended: items[0],
    totalRounds: scopedHistory.length,
  }
}
