import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTrainingPackReport } from '../src/training/trainingPackReport'

test('training pack report summarizes stage evidence without creating a pack score', () => {
  const report = buildTrainingPackReport('space-position', [
    {
      packId: 'space-position',
      index: 0,
      project: 'reverse-parking',
      score: 80,
      completed: true,
      passed: true,
      infractions: [
        { id: 'reverse-parking-body-out-1', title: '车身出线', points: 10 },
        { id: 'reverse-parking-stop-1', title: '中途停车', points: 10 },
      ],
    },
    {
      packId: 'space-position',
      index: 1,
      project: 'side-parking',
      score: 90,
      completed: true,
      passed: true,
      infractions: [
        { id: 'side-parking-line-contact-1', title: '车轮触线', points: 10 },
      ],
    },
  ])

  assert.equal(report.recordedStages, 2)
  assert.equal(report.totalStages, 4)
  assert.equal(report.totalInfractions, 3)
  assert.equal(report.habitInfractions, 2)
  assert.equal(report.completedStages, 2)
  assert.equal(report.passedStages, 2)
})

test('training pack trend compares emitted target-habit evidence conservatively', () => {
  const improving = buildTrainingPackReport('space-position', [
    {
      packId: 'space-position',
      index: 0,
      project: 'reverse-parking',
      score: 70,
      completed: true,
      passed: false,
      infractions: [
        { id: 'reverse-parking-body-out-1', title: '车身出线', points: 10 },
        { id: 'reverse-parking-body-out-2', title: '再次出线', points: 10 },
      ],
    },
    {
      packId: 'space-position',
      index: 1,
      project: 'side-parking',
      score: 90,
      completed: true,
      passed: true,
      infractions: [],
    },
  ])
  assert.equal(improving.trend, 'improving')
  assert.equal(improving.firstHabitInfractionCount, 2)
  assert.equal(improving.lastHabitInfractionCount, 0)

  const needsAttention = buildTrainingPackReport('observation-signal', [
    {
      packId: 'observation-signal',
      index: 0,
      project: 'right-angle',
      score: 100,
      completed: true,
      passed: true,
      infractions: [],
    },
    {
      packId: 'observation-signal',
      index: 1,
      project: 'subject3',
      score: 0,
      completed: false,
      passed: false,
      infractions: [
        { id: 'subject3-left-turn-signal', title: '左转未打灯', points: 100, fatal: true },
      ],
    },
  ])
  assert.equal(needsAttention.trend, 'needs-attention')
})

test('training pack report recommends the stage with strongest existing failure evidence', () => {
  const report = buildTrainingPackReport('space-position', [
    {
      packId: 'space-position',
      index: 0,
      project: 'reverse-parking',
      score: 80,
      completed: true,
      passed: true,
      infractions: [{ id: 'reverse-parking-body-out-1', title: '车身出线', points: 10 }],
    },
    {
      packId: 'space-position',
      index: 1,
      project: 'side-parking',
      score: 0,
      completed: false,
      passed: false,
      infractions: [{ id: 'side-parking-line-contact-1', title: '车轮触线', points: 100, fatal: true }],
    },
  ])

  assert.equal(report.recommendedRetryProject, 'side-parking')
  assert.equal(report.recommendedRetryStageIndex, 1)
})

test('one recorded stage is insufficient for a cross-stage trend', () => {
  const report = buildTrainingPackReport('observation-signal', [
    {
      packId: 'observation-signal',
      index: 0,
      project: 'right-angle',
      score: 90,
      completed: true,
      passed: true,
      infractions: [],
    },
  ])

  assert.equal(report.trend, 'insufficient')
})
