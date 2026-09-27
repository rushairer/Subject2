import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TRAINING_PACKS,
  nextTrainingPackState,
  trainingPackById,
  trainingPackForHabit,
  trainingPackProject,
  trainingPackStage,
  trainingPackStageLabel,
} from '../src/training/trainingPacks'

test('space-position coaching keeps the four boundary-control stages', () => {
  const pack = trainingPackForHabit('space-position')
  assert.equal(pack?.id, 'space-position')
  assert.deepEqual(pack?.stages.map(stage => stage.project), [
    'reverse-parking',
    'side-parking',
    'curve-driving',
    'right-angle',
  ])
})

test('observation coaching uses event-level Subject 3 stages instead of a full-road stage', () => {
  const pack = trainingPackForHabit('observation-signal')
  assert.equal(pack?.id, 'observation-signal')
  assert.deepEqual(
    pack?.stages.map(stage => ({
      project: stage.project,
      subject3Practice: stage.subject3Practice ?? null,
    })),
    [
      { project: 'right-angle', subject3Practice: null },
      { project: 'subject3', subject3Practice: 'intersection-turns' },
      { project: 'subject3', subject3Practice: 'lane-change' },
      { project: 'subject3', subject3Practice: 'pull-over' },
    ],
  )
})

test('unmapped habits keep targeted-project fallback instead of inventing a pack', () => {
  assert.equal(trainingPackForHabit('safety-routine'), null)
  assert.equal(trainingPackForHabit('hazard-response'), null)
})

test('training pack state resolves project, slice metadata and label deterministically', () => {
  assert.equal(trainingPackProject({ id: 'space-position', index: 0 }), 'reverse-parking')
  assert.equal(trainingPackProject({ id: 'observation-signal', index: 1 }), 'subject3')
  assert.equal(
    trainingPackStage({ id: 'observation-signal', index: 1 }).subject3Practice,
    'intersection-turns',
  )
  assert.equal(
    trainingPackStageLabel({ id: 'observation-signal', index: 2 }),
    '变更车道',
  )
  assert.deepEqual(
    nextTrainingPackState({ id: 'observation-signal', index: 1 }),
    { id: 'observation-signal', index: 2 },
  )
  assert.equal(nextTrainingPackState({ id: 'observation-signal', index: 3 }), null)
})

test('training pack identifiers stay unique', () => {
  assert.equal(
    new Set(TRAINING_PACKS.map(pack => pack.id)).size,
    TRAINING_PACKS.length,
  )
  assert.equal(trainingPackById('space-position').title, '车身边线控制')
})
