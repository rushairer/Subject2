import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_DRIVING_DYNAMICS_HAZARD_FILTER,
  drivingDynamicsHazardFilterActive,
  filterDrivingDynamicsHazardEvents,
} from '../src/replay/drivingDynamicsHazardFilter'
import type {
  DrivingDynamicsEventKind,
  DrivingDynamicsEventMarker,
  DrivingDynamicsEventSample,
} from '../src/replay/drivingDynamicsEvents'

function event(
  id: string,
  kind: DrivingDynamicsEventKind,
  triggerTime: number,
  response: DrivingDynamicsEventMarker['response'] = {},
): DrivingDynamicsEventMarker {
  const label = kind === 'sudden-brake'
    ? '前车急刹'
    : kind === 'cut-in'
      ? '电动车加塞'
      : '行人横穿'
  const glyph = kind === 'sudden-brake'
    ? '急'
    : kind === 'cut-in'
      ? '切'
      : '人'

  return {
    id,
    kind,
    label,
    glyph,
    summary: 'test',
    t: triggerTime,
    triggerTime,
    project: 'subject3',
    sampleIndex: 0,
    speedKmh: 20,
    response,
  }
}

function sample(
  t: number,
  speedKmh = 20,
): DrivingDynamicsEventSample {
  return {
    t,
    project: 'subject3',
    speed: speedKmh / 3.6,
    gear: 2,
    automatic: false,
    throttle: 0.5,
    brake: 0,
    steeringWheelAngle: 0,
  }
}

const events = [
  event('brake', 'sudden-brake', 10, {
    brakeReactionSeconds: 0.6,
    maximumBrake: 0.8,
  }),
  event('steer', 'cut-in', 20, {
    maximumSteeringWheelChangeTurns: 0.12,
  }),
  event('stop', 'pedestrian', 30, {
    brakeReactionSeconds: 0.4,
    stopReactionSeconds: 1.5,
    maximumBrake: 1,
  }),
  event('plain', 'pedestrian', 40),
]

const samples = [
  sample(9.9), sample(10), sample(10.6, 18),
  sample(19.9), sample(20), sample(20.8, 18),
  sample(29.9), sample(30), sample(31.5, 0),
  sample(39.9), sample(40), sample(41, 20),
]

test('default hazard filter keeps the full chronological event set', () => {
  const result = filterDrivingDynamicsHazardEvents(
    samples,
    events,
    DEFAULT_DRIVING_DYNAMICS_HAZARD_FILTER,
  )

  assert.equal(result.active, false)
  assert.equal(result.total, 4)
  assert.equal(result.filtered, 4)
  assert.deepEqual(result.events.map(item => item.id), [
    'brake',
    'steer',
    'stop',
    'plain',
  ])
})

test('hazard type and evidence filters compose without mutating event order', () => {
  const pedestriansWithBrake = filterDrivingDynamicsHazardEvents(
    samples,
    events,
    { kind: 'pedestrian', evidence: 'brake' },
  )

  assert.equal(pedestriansWithBrake.active, true)
  assert.deepEqual(
    pedestriansWithBrake.events.map(item => item.id),
    ['stop'],
  )

  const cutIns = filterDrivingDynamicsHazardEvents(
    samples,
    events,
    { kind: 'cut-in', evidence: 'all' },
  )
  assert.deepEqual(cutIns.events.map(item => item.id), ['steer'])
})

test('hazard evidence filters reuse structured analyzer response evidence', () => {
  assert.deepEqual(
    filterDrivingDynamicsHazardEvents(
      samples,
      events,
      { kind: 'all', evidence: 'brake' },
    ).events.map(item => item.id),
    ['brake', 'stop'],
  )

  assert.deepEqual(
    filterDrivingDynamicsHazardEvents(
      samples,
      events,
      { kind: 'all', evidence: 'stop' },
    ).events.map(item => item.id),
    ['stop'],
  )

  assert.deepEqual(
    filterDrivingDynamicsHazardEvents(
      samples,
      events,
      { kind: 'all', evidence: 'steering' },
    ).events.map(item => item.id),
    ['steer'],
  )
})

test('no-auto-response filter uses the same context reaction-chain model as detail replay', () => {
  const result = filterDrivingDynamicsHazardEvents(
    samples,
    events,
    { kind: 'all', evidence: 'no-auto-response' },
  )

  assert.deepEqual(
    result.events.map(item => item.id),
    ['plain'],
  )
})

test('hazard filter active state changes only when a real filter is selected', () => {
  assert.equal(
    drivingDynamicsHazardFilterActive({ kind: 'all', evidence: 'all' }),
    false,
  )
  assert.equal(
    drivingDynamicsHazardFilterActive({ kind: 'pedestrian', evidence: 'all' }),
    true,
  )
  assert.equal(
    drivingDynamicsHazardFilterActive({ kind: 'all', evidence: 'brake' }),
    true,
  )
})
