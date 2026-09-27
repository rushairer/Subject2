import type { TrainingPackRoundHistoryEntry } from './trainingPackHistory'
import type { TrainingPackLicenseType } from './trainingPackHistory'
import type { TrainingPlan, TrainingPlanItem } from './trainingPlan'
import type { TrainingPackId } from './trainingPacks'

export type DailyTrainingTaskStatus = 'pending' | 'completed'

export interface DailyTrainingTask {
  packId: TrainingPackId
  title: string
  summary: string
  state: TrainingPlanItem['state']
  stateLabel: string
  status: DailyTrainingTaskStatus
  todayRoundCount: number
  completedAt: number | null
}

export interface DailyTrainingPlan {
  tasks: DailyTrainingTask[]
  completedCount: number
  totalCount: number
  nextTask: DailyTrainingTask | null
  isComplete: boolean
  balanceNotice: string | null
}

function isSameLocalDay(a: number, b: number) {
  const left = new Date(a)
  const right = new Date(b)
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

export function buildDailyTrainingPlan({
  candidateName,
  licenseType,
  history,
  trainingPlan,
  now,
  limit = 2,
}: {
  candidateName: string
  licenseType: TrainingPackLicenseType
  history: readonly TrainingPackRoundHistoryEntry[]
  trainingPlan: TrainingPlan
  now: number
  limit?: number
}): DailyTrainingPlan {
  const scopedToday = history.filter(entry => (
    entry.candidateName === candidateName &&
    entry.licenseType === licenseType &&
    isSameLocalDay(entry.createdAt, now)
  ))

  const tasks = trainingPlan.items.slice(0, Math.max(0, limit)).map(item => {
    const todayRounds = scopedToday
      .filter(entry => entry.packId === item.packId)
      .sort((a, b) => b.createdAt - a.createdAt)

    return {
      packId: item.packId,
      title: item.title,
      summary: item.summary,
      state: item.state,
      stateLabel: item.label,
      status: todayRounds.length > 0 ? 'completed' as const : 'pending' as const,
      todayRoundCount: todayRounds.length,
      completedAt: todayRounds[0]?.createdAt ?? null,
    }
  })

  const completedCount = tasks.filter(task => task.status === 'completed').length
  const nextTask = tasks.find(task => task.status === 'pending') ?? null
  const repeatedTask = tasks.find(task => (
    task.todayRoundCount > 1 &&
    tasks.some(other => other.packId !== task.packId && other.status === 'pending')
  ))

  return {
    tasks,
    completedCount,
    totalCount: tasks.length,
    nextTask,
    isComplete: tasks.length > 0 && completedCount === tasks.length,
    balanceNotice: repeatedTask
      ? `今天已经完成“${repeatedTask.title}” ${repeatedTask.todayRoundCount} 轮，下一项切换到另一训练包，避免连续只刷同一类能力。`
      : null,
  }
}
