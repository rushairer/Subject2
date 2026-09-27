import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildTrainingPlan,
  type TrainingPlanState,
} from '../src/training/trainingPlan'
import type { TrainingPackRoundHistoryEntry } from '../src/training/trainingPackHistory'
import type { TrainingPackId } from '../src/training/trainingPacks'

function round({
  id,
  createdAt,
  packId,
  habitInfractions,
  fatal = 0,
  completedStages,
  totalStages,
  candidateName = '计划考生',
  licenseType = 'C2',
}: {
  id: string
  createdAt: number
  packId: TrainingPackId
  habitInfractions: number
  fatal?: number
  completedStages?: number
  totalStages?: number
  candidateName?: string
  licenseType?: 'C1' | 'C2'
}): TrainingPackRoundHistoryEntry {
  const resolvedTotal = totalStages ?? (packId === 'space-position' ? 4 : 2)
  const resolvedCompleted = completedStages ?? resolvedTotal
  return {
    id,
    createdAt,
    candidateName,
    licenseType,
    packId,
    recordedStages: resolvedTotal,
    totalStages: resolvedTotal,
    completedStages: resolvedCompleted,
    passedStages: resolvedCompleted,
    habitInfractions,
    totalFatalInfractions: fatal,
    totalInfractions: habitInfractions + fatal,
    stages: [],
  }
}

function stateFor(
  history: TrainingPackRoundHistoryEntry[],
  packId: TrainingPackId,
): TrainingPlanState {
  const plan = buildTrainingPlan({
    candidateName: '计划考生',
    licenseType: 'C2',
    history,
  })
  return plan.items.find(item => item.packId === packId)!.state
}

test('no history recommends establishing a baseline in configured pack order', () => {
  const plan = buildTrainingPlan({
    candidateName: '计划考生',
    licenseType: 'C2',
    history: [],
  })

  assert.equal(plan.recommended.packId, 'space-position')
  assert.equal(plan.recommended.state, 'baseline')
  assert.equal(plan.totalRounds, 0)
  assert.ok(plan.items.every(item => item.state === 'baseline'))
})

test('fatal evidence takes priority over an unseen pack', () => {
  const history = [
    round({
      id: 'obs-1',
      createdAt: 1,
      packId: 'observation-signal',
      habitInfractions: 1,
      fatal: 1,
    }),
  ]
  const plan = buildTrainingPlan({
    candidateName: '计划考生',
    licenseType: 'C2',
    history,
  })

  assert.equal(plan.recommended.packId, 'observation-signal')
  assert.equal(plan.recommended.state, 'priority')
  assert.match(plan.recommended.detail, /不合格/)
})

test('an incomplete latest round remains priority even without fatal evidence', () => {
  const history = [
    round({
      id: 'space-1',
      createdAt: 1,
      packId: 'space-position',
      habitInfractions: 0,
      completedStages: 3,
      totalStages: 4,
    }),
  ]

  assert.equal(stateFor(history, 'space-position'), 'priority')
})

test('mixed evidence stays in reinforcement instead of claiming stability', () => {
  const history = [
    round({ id: 'obs-1', createdAt: 1, packId: 'observation-signal', habitInfractions: 4 }),
    round({ id: 'obs-2', createdAt: 2, packId: 'observation-signal', habitInfractions: 1 }),
    round({ id: 'obs-3', createdAt: 3, packId: 'observation-signal', habitInfractions: 2 }),
  ]

  assert.equal(stateFor(history, 'observation-signal'), 'reinforce')
})

test('continuous improvement with remaining target errors still requires reinforcement', () => {
  const history = [
    round({ id: 'space-1', createdAt: 1, packId: 'space-position', habitInfractions: 4 }),
    round({ id: 'space-2', createdAt: 2, packId: 'space-position', habitInfractions: 2 }),
    round({ id: 'space-3', createdAt: 3, packId: 'space-position', habitInfractions: 1 }),
  ]
  const plan = buildTrainingPlan({
    candidateName: '计划考生',
    licenseType: 'C2',
    history,
  })
  const item = plan.items.find(value => value.packId === 'space-position')!

  assert.equal(item.stableImprovement, true)
  assert.equal(item.state, 'reinforce')
})

test('three improving rounds ending with zero target errors can lower priority', () => {
  const history = [
    round({ id: 'obs-1', createdAt: 1, packId: 'observation-signal', habitInfractions: 3 }),
    round({ id: 'obs-2', createdAt: 2, packId: 'observation-signal', habitInfractions: 1 }),
    round({ id: 'obs-3', createdAt: 3, packId: 'observation-signal', habitInfractions: 0 }),
  ]
  const plan = buildTrainingPlan({
    candidateName: '计划考生',
    licenseType: 'C2',
    history,
  })
  const item = plan.items.find(value => value.packId === 'observation-signal')!

  assert.equal(item.stableImprovement, true)
  assert.equal(item.state, 'maintain')
  assert.equal(item.label, '降低优先级')
})

test('history from another candidate or license does not influence the plan', () => {
  const history = [
    round({
      id: 'other-candidate',
      createdAt: 1,
      packId: 'observation-signal',
      habitInfractions: 8,
      fatal: 2,
      candidateName: '其他人',
    }),
    round({
      id: 'other-license',
      createdAt: 2,
      packId: 'observation-signal',
      habitInfractions: 8,
      fatal: 2,
      licenseType: 'C1',
    }),
  ]
  const plan = buildTrainingPlan({
    candidateName: '计划考生',
    licenseType: 'C2',
    history,
  })

  assert.equal(plan.totalRounds, 0)
  assert.equal(plan.recommended.state, 'baseline')
})
