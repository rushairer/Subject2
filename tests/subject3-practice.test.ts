import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SUBJECT3_PRACTICE_SLICES,
  isSubject3PracticeSliceComplete,
  subject3PracticeRuntimeSeed,
  subject3PracticeSliceById,
  subject3PracticeStartPose,
  subject3PracticeStartProjection,
} from '../src/subject3/subject3Practice'

test('Subject 3 practice slices are ordered route windows with real approach distance', () => {
  for (const definition of SUBJECT3_PRACTICE_SLICES) {
    const slice = subject3PracticeSliceById(definition.id)
    assert.ok(slice.approachMeters >= 60)
    assert.ok(slice.startDistance < slice.startEvent.start)
    assert.ok(slice.endDistance >= slice.startEvent.end)
    assert.ok(slice.endEventIndex >= slice.startEventIndex)
  }
})

test('practice start pose round-trips to the configured route distance', () => {
  for (const definition of SUBJECT3_PRACTICE_SLICES) {
    const slice = subject3PracticeSliceById(definition.id)
    const pose = subject3PracticeStartPose(definition.id)
    const projection = subject3PracticeStartProjection(definition.id)

    assert.ok(Math.abs(projection.progress - slice.startDistance) < 1e-6)
    assert.ok(Math.abs(projection.lateral) < 1e-6)
    assert.equal(Number.isFinite(pose.heading), true)
  }
})

test('runtime seed skips all earlier Subject 3 events without fabricating completion', () => {
  const laneChange = subject3PracticeSliceById('lane-change')
  const seed = subject3PracticeRuntimeSeed('lane-change')

  assert.equal(seed.eventIndex, laneChange.startEventIndex)
  assert.equal(seed.progress, laneChange.startDistance)
  assert.equal(laneChange.startEvent.id, 'lane-change')
})

test('intersection-turn slice intentionally covers left turn, intersection and right turn', () => {
  const slice = subject3PracticeSliceById('intersection-turns')
  assert.equal(slice.startEvent.id, 'left-turn-1')
  assert.equal(slice.endEvent.id, 'right-turn-1')
  assert.ok(slice.endEventIndex - slice.startEventIndex >= 2)
})

test('slice completion only matches its configured terminal event', () => {
  assert.equal(isSubject3PracticeSliceComplete('lane-change', 'lane-change'), true)
  assert.equal(isSubject3PracticeSliceComplete('lane-change', 'overtake'), false)
  assert.equal(isSubject3PracticeSliceComplete('intersection-turns', 'left-turn-1'), false)
  assert.equal(isSubject3PracticeSliceComplete('intersection-turns', 'right-turn-1'), true)
})
