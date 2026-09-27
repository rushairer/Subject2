import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDailyTrainingPlan } from '../src/training/dailyTrainingPlan'
import { buildTrainingPlan } from '../src/training/trainingPlan'
import type { TrainingPackRoundHistoryEntry } from '../src/training/trainingPackHistory'
import type { TrainingPackId } from '../src/training/trainingPacks'

const NOW = new Date(2026, 8, 27, 12, 0, 0).getTime()
const YESTERDAY = new Date(2026, 8, 26, 12, 0, 0).getTime()

function round({
  id,
  packId,
  createdAt = NOW,
  habitInfractions = 0,
  fatal = 0,
  candidateName = '今日考生',
  licenseType = 'C2',
}: {
  id: string
  packId: TrainingPackId
  createdAt?: number
  habitInfractions?: number
  fatal?: number
  candidateName?: string
  licenseType?: 'C1' | 'C2'
}): TrainingPackRoundHistoryEntry {
  const totalStages = packId === 'space-position' ? 4 : 2
  return {
    id,
    createdAt,
    candidateName,
    licenseType,
    packId,
    recordedStages: totalStages,
    totalStages,
    completedStages: totalStages,
    passedStages: totalStages,
    habitInfractions,
    totalFatalInfractions: fatal,
    totalInfractions: habitInfractions + fatal,
    stages: [],
  }
}

function daily(history: TrainingPackRoundHistoryEntry[]) {
  const plan = buildTrainingPlan({
    candidateName: '今日考生',
    licenseType: 'C2',
    history,
  })
  return buildDailyTrainingPlan({
    candidateName: '今日考生',
    licenseType: 'C2',
    history,
    trainingPlan: plan,
    now: NOW,
  })
}

test('fresh candidate gets two balanced pending packs in long-term priority order', () => {
  const plan = daily([])

  assert.equal(plan.totalCount, 2)
  assert.equal(plan.completedCount, 0)
  assert.equal(plan.nextTask?.packId, 'space-position')
  assert.deepEqual(plan.tasks.map(task => task.packId), [
    'space-position',
    'observation-signal',
  ])
})

test('severe historical evidence can move observation-signal to today first', () => {
  const history = [
    round({
      id: 'old-observation',
      packId: 'observation-signal',
      createdAt: YESTERDAY,
      habitInfractions: 2,
      fatal: 1,
    }),
  ]
  const plan = daily(history)

  assert.equal(plan.nextTask?.packId, 'observation-signal')
  assert.equal(plan.tasks[0].state, 'priority')
})

test('a pack completed today is marked done and the other pack becomes next', () => {
  const history = [
    round({
      id: 'today-observation',
      packId: 'observation-signal',
      habitInfractions: 1,
    }),
    round({
      id: 'old-observation',
      packId: 'observation-signal',
      createdAt: YESTERDAY,
      habitInfractions: 3,
      fatal: 1,
    }),
  ]
  const plan = daily(history)

  const observation = plan.tasks.find(task => task.packId === 'observation-signal')!
  assert.equal(observation.status, 'completed')
  assert.equal(observation.todayRoundCount, 1)
  assert.equal(plan.nextTask?.packId, 'space-position')
  assert.equal(plan.completedCount, 1)
})

test('repeating one pack today does not replace the other planned pack', () => {
  const history = [
    round({ id: 'obs-1', packId: 'observation-signal', habitInfractions: 1 }),
    round({ id: 'obs-2', packId: 'observation-signal', createdAt: NOW - 60_000, habitInfractions: 1 }),
    round({
      id: 'old-observation',
      packId: 'observation-signal',
      createdAt: YESTERDAY,
      habitInfractions: 3,
      fatal: 1,
    }),
  ]
  const plan = daily(history)

  assert.equal(plan.nextTask?.packId, 'space-position')
  assert.match(plan.balanceNotice ?? '', /2 轮/)
  assert.match(plan.balanceNotice ?? '', /避免连续只刷/)
})

test('yesterday history influences priority but does not count as today complete', () => {
  const history = [
    round({
      id: 'yesterday-space',
      packId: 'space-position',
      createdAt: YESTERDAY,
      habitInfractions: 4,
    }),
  ]
  const plan = daily(history)

  assert.equal(plan.tasks.find(task => task.packId === 'space-position')?.status, 'pending')
  assert.equal(plan.completedCount, 0)
})

test('different candidate and license history cannot complete current daily tasks', () => {
  const history = [
    round({
      id: 'other-candidate',
      packId: 'space-position',
      candidateName: '其他人',
    }),
    round({
      id: 'other-license',
      packId: 'observation-signal',
      licenseType: 'C1',
    }),
  ]
  const plan = daily(history)

  assert.equal(plan.completedCount, 0)
})

test('both packs completed today closes the daily plan', () => {
  const history = [
    round({ id: 'space', packId: 'space-position' }),
    round({ id: 'observation', packId: 'observation-signal' }),
  ]
  const plan = daily(history)

  assert.equal(plan.isComplete, true)
  assert.equal(plan.completedCount, 2)
  assert.equal(plan.nextTask, null)
})

test('limit can intentionally reduce the daily workload', () => {
  const plan = buildTrainingPlan({
    candidateName: '今日考生',
    licenseType: 'C2',
    history: [],
  })
  const dailyPlan = buildDailyTrainingPlan({
    candidateName: '今日考生',
    licenseType: 'C2',
    history: [],
    trainingPlan: plan,
    now: NOW,
    limit: 1,
  })

  assert.equal(dailyPlan.totalCount, 1)
  assert.equal(dailyPlan.tasks.length, 1)
})
