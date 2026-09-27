import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildTrainingPackHistoryEntry,
  compareTrainingPackRoundEvidence,
  compareTrainingPackRounds,
  trainingPackHistoryMatchesCurrentDefinition,
  type TrainingPackRoundHistoryEntry,
} from '../src/training/trainingPackHistory'

function round(
  id: string,
  createdAt: number,
  habitInfractions: number,
  totalFatalInfractions = 0,
  completedStages = 4,
): TrainingPackRoundHistoryEntry {
  return {
    id,
    createdAt,
    candidateName: '训练考生',
    licenseType: 'C2',
    packId: 'observation-signal',
    recordedStages: 4,
    totalStages: 4,
    completedStages,
    passedStages: completedStages,
    habitInfractions,
    totalFatalInfractions,
    totalInfractions: habitInfractions,
    stages: [],
  }
}

test('history snapshot is derived from real pack-stage evidence', () => {
  const entry = buildTrainingPackHistoryEntry({
    id: 'round-1',
    createdAt: 123,
    candidateName: '训练考生',
    licenseType: 'C2',
    packId: 'space-position',
    stages: [
      {
        packId: 'space-position',
        index: 0,
        project: 'reverse-parking',
        score: 80,
        completed: true,
        passed: true,
        infractions: [
          { id: 'reverse-parking-body-out-1', title: '车身出线', points: 10 },
        ],
      },
      {
        packId: 'space-position',
        index: 1,
        project: 'side-parking',
        score: 90,
        completed: false,
        passed: false,
        infractions: [
          { id: 'side-parking-line-contact-1', title: '触线', points: 100, fatal: true },
        ],
      },
    ],
  })

  assert.equal(entry.recordedStages, 2)
  assert.equal(entry.completedStages, 1)
  assert.equal(entry.habitInfractions, 2)
  assert.equal(entry.totalFatalInfractions, 1)
  assert.deepEqual(entry.stages.map(stage => stage.habitInfractionCount), [1, 1])
})

test('round comparison prefers fewer fatal events before other evidence', () => {
  const safer = round('safer', 2, 4, 0, 1)
  const fatal = round('fatal', 1, 0, 1, 2)
  assert.ok(compareTrainingPackRoundEvidence(safer, fatal) < 0)
})

test('two improving rounds show improvement without claiming stable improvement', () => {
  const comparison = compareTrainingPackRounds([
    round('first', 1, 4, 1),
    round('second', 2, 1, 0),
  ])

  assert.equal(comparison.trend, 'improving')
  assert.equal(comparison.stableImprovement, false)
  assert.equal(comparison.baseline?.habitInfractions, 4)
  assert.equal(comparison.latest?.habitInfractions, 1)
})

test('three non-worsening rounds with evidence reduction count as stable improvement', () => {
  const comparison = compareTrainingPackRounds([
    round('first', 1, 4, 1),
    round('second', 2, 2, 0),
    round('third', 3, 1, 0),
  ])

  assert.equal(comparison.trend, 'improving')
  assert.equal(comparison.stableImprovement, true)
})

test('an improved baseline-to-latest result with an intervening regression stays mixed', () => {
  const comparison = compareTrainingPackRounds([
    round('first', 1, 5),
    round('second', 2, 2),
    round('third', 3, 4),
  ])

  assert.equal(comparison.trend, 'mixed')
  assert.equal(comparison.stableImprovement, false)
})

test('latest round becoming worse than baseline needs attention', () => {
  const comparison = compareTrainingPackRounds([
    round('first', 1, 1),
    round('second', 2, 3),
  ])

  assert.equal(comparison.trend, 'needs-attention')
})

test('only the most recent five rounds participate in the visible comparison', () => {
  const comparison = compareTrainingPackRounds([
    round('r1', 1, 8),
    round('r2', 2, 7),
    round('r3', 3, 6),
    round('r4', 4, 5),
    round('r5', 5, 4),
    round('r6', 6, 3),
  ])

  assert.deepEqual(comparison.rounds.map(item => item.id), ['r2', 'r3', 'r4', 'r5', 'r6'])
})


test('obsolete two-stage observation history is excluded from current four-stage comparisons', () => {
  assert.equal(trainingPackHistoryMatchesCurrentDefinition({
    packId: 'observation-signal',
    totalStages: 2,
  }), false)
  assert.equal(trainingPackHistoryMatchesCurrentDefinition({
    packId: 'observation-signal',
    totalStages: 4,
  }), true)
  assert.equal(trainingPackHistoryMatchesCurrentDefinition({
    packId: 'space-position',
    totalStages: 4,
  }), true)
})
