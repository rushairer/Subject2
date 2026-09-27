import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createSubject3Runtime,
  updateSubject3,
  type Subject3Vehicle,
} from '../src/subject3/Subject3Course'
import {
  subject3PracticeRuntimeSeed,
  subject3PracticeSliceById,
} from '../src/subject3/subject3Practice'
import { poseAtRouteDistance } from '../src/subject3/subject3Route'
import { createSubject3TrafficState } from '../src/subject3/subject3Traffic'

function vehicleAt(distance: number, overrides: Partial<Subject3Vehicle> = {}): Subject3Vehicle {
  const pose = poseAtRouteDistance(distance)
  return {
    x: pose.x,
    z: pose.z,
    heading: pose.heading,
    speed: 0,
    steering: 0,
    gear: 0,
    engineOn: false,
    handbrake: true,
    leftIndicator: false,
    rightIndicator: false,
    horn: false,
    seatbelt: true,
    lowBeam: false,
    highBeam: false,
    leftSignalAge: 0,
    rightSignalAge: 0,
    lookLeft: false,
    lookRight: false,
    lookBack: false,
    ...overrides,
  }
}

test('practice runtime starts at its target window without evaluating earlier Subject 3 events', () => {
  const slice = subject3PracticeSliceById('lane-change')
  const runtime = createSubject3Runtime(subject3PracticeRuntimeSeed('lane-change'))

  const result = updateSubject3(
    vehicleAt(slice.startDistance),
    runtime,
    true,
    false,
    0.1,
    createSubject3TrafficState(),
    false,
    'lane-change',
  )

  assert.equal(result.runtime.eventIndex, slice.startEventIndex)
  assert.equal(result.runtime.completed, false)
  assert.deepEqual(result.infractions, [])
  assert.match(result.status, /下一项目：变更车道/)
})

test('practice slice ends after its configured terminal event even when the attempt fails', () => {
  const slice = subject3PracticeSliceById('lane-change')
  const runtime = createSubject3Runtime(subject3PracticeRuntimeSeed('lane-change'))

  const result = updateSubject3(
    vehicleAt(slice.endDistance + 1, {
      speed: 1,
      gear: 1,
    }),
    runtime,
    true,
    false,
    0.1,
    createSubject3TrafficState(),
    false,
    'lane-change',
  )

  assert.equal(result.runtime.completed, true)
  assert.ok(result.infractions.some(item => item.id.startsWith('subject3-lane-change-')))
  assert.match(result.status, /科目三专项完成 · 变更车道/)
})

test('the same intermediate event never completes the full Subject 3 route', () => {
  const slice = subject3PracticeSliceById('lane-change')
  const runtime = createSubject3Runtime(subject3PracticeRuntimeSeed('lane-change'))

  const result = updateSubject3(
    vehicleAt(slice.endDistance + 1, {
      speed: 1,
      gear: 1,
    }),
    runtime,
    true,
    false,
    0.1,
    createSubject3TrafficState(),
    false,
  )

  assert.equal(result.runtime.completed, false)
  assert.equal(result.runtime.eventIndex, slice.endEventIndex + 1)
  assert.doesNotMatch(result.status, /专项完成/)
})

test('intersection-turn practice completes only after the right-turn terminal event', () => {
  const slice = subject3PracticeSliceById('intersection-turns')
  let runtime = createSubject3Runtime(subject3PracticeRuntimeSeed('intersection-turns'))

  let result = updateSubject3(
    vehicleAt(slice.startEvent.end + 1, { speed: 1, gear: 1 }),
    runtime,
    true,
    false,
    0.1,
    createSubject3TrafficState(),
    false,
    'intersection-turns',
  )
  runtime = result.runtime
  assert.equal(runtime.completed, false)

  const middleEvent = slice.startEventIndex + 1
  result = updateSubject3(
    vehicleAt(subject3PracticeSliceById('intersection-turns').endEvent.start - 1, { speed: 1, gear: 1 }),
    runtime,
    true,
    false,
    0.1,
    createSubject3TrafficState(),
    false,
    'intersection-turns',
  )
  assert.ok(result.runtime.eventIndex >= middleEvent)
  assert.equal(result.runtime.completed, false)

  result = updateSubject3(
    vehicleAt(slice.endDistance + 1, { speed: 1, gear: 1 }),
    result.runtime,
    true,
    false,
    0.1,
    createSubject3TrafficState(),
    false,
    'intersection-turns',
  )
  assert.equal(result.runtime.completed, true)
})
