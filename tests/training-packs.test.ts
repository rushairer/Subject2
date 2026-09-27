import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TRAINING_PACKS,
  nextTrainingPackState,
  trainingPackById,
  trainingPackForHabit,
  trainingPackProject,
} from '../src/training/trainingPacks'

test('space-position coaching maps to the four-course boundary-control pack', () => {
  const pack = trainingPackForHabit('space-position')
  assert.equal(pack?.id, 'space-position')
  assert.deepEqual(pack?.projects, [
    'reverse-parking',
    'side-parking',
    'curve-driving',
    'right-angle',
  ])
})

test('observation coaching maps to right-angle then Subject 3', () => {
  const pack = trainingPackForHabit('observation-signal')
  assert.equal(pack?.id, 'observation-signal')
  assert.deepEqual(pack?.projects, ['right-angle', 'subject3'])
})

test('unmapped habits keep targeted-project fallback instead of inventing a pack', () => {
  assert.equal(trainingPackForHabit('safety-routine'), null)
  assert.equal(trainingPackForHabit('hazard-response'), null)
})

test('training pack state resolves the current project and advances deterministically', () => {
  assert.equal(trainingPackProject({ id: 'space-position', index: 0 }), 'reverse-parking')
  assert.deepEqual(
    nextTrainingPackState({ id: 'space-position', index: 0 }),
    { id: 'space-position', index: 1 },
  )
  assert.equal(nextTrainingPackState({ id: 'observation-signal', index: 1 }), null)
})

test('training pack identifiers stay unique', () => {
  assert.equal(
    new Set(TRAINING_PACKS.map(pack => pack.id)).size,
    TRAINING_PACKS.length,
  )
  assert.equal(trainingPackById('space-position').title, '车身边线控制')
})
