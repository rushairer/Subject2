import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDrivingDynamicsHazardComparisons,
} from '../src/replay/drivingDynamicsHazardComparison'
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
    t: triggerTime + 0.2,
    triggerTime,
    project: 'subject3',
    sampleIndex: 0,
    speedKmh: 20,
    response,
  }
}

function close(actual: number | undefined, expected: number) {
  assert.notEqual(actual, undefined)
  assert.ok(Math.abs((actual ?? 0) - expected) < 1e-9)
}

function sample(
  t: number,
  speedKmh: number,
  project = 'subject3',
): DrivingDynamicsEventSample {
  return {
    t,
    project,
    speed: speedKmh / 3.6,
    gear: 2,
    automatic: false,
    throttle: 0.4,
    brake: 0,
    steeringWheelAngle: 0,
  }
}

test('same-kind comparison groups only repeated event kinds and keeps chronological order', () => {
  const events = [
    event('ped-2', 'pedestrian', 30),
    event('cut-1', 'cut-in', 12),
    event('ped-1', 'pedestrian', 20),
    event('brake-2', 'sudden-brake', 18),
    event('brake-1', 'sudden-brake', 10),
  ]

  const groups = buildDrivingDynamicsHazardComparisons([], events)

  assert.deepEqual(
    groups.map(group => ({
      kind: group.kind,
      ids: group.items.map(item => item.id),
    })),
    [
      { kind: 'sudden-brake', ids: ['brake-1', 'brake-2'] },
      { kind: 'pedestrian', ids: ['ped-1', 'ped-2'] },
    ],
  )
})

test('comparison uses trigger-near speed and post-trigger three-second minimum from trajectory evidence', () => {
  const events = [
    event('cut-a', 'cut-in', 10, {
      throttleReleaseSeconds: 0.3,
      brakeReactionSeconds: 0.7,
      maximumSteeringWheelChangeTurns: 0.12,
    }),
    event('cut-b', 'cut-in', 20, {
      throttleReleaseSeconds: 0.5,
      maximumSteeringWheelChangeTurns: 0.08,
    }),
  ]
  const samples = [
    sample(9.8, 30),
    sample(10.05, 28),
    sample(11, 22),
    sample(12.9, 15),
    sample(13.2, 5),
    sample(19.9, 24),
    sample(20.1, 23),
    sample(21, 21),
    sample(22.8, 19),
    sample(23.2, 10),
  ]

  const [group] = buildDrivingDynamicsHazardComparisons(samples, events)

  assert.equal(group.kind, 'cut-in')
  close(group.items[0].triggerSpeedKmh, 28)
  close(group.items[0].minimumPostTriggerSpeedKmh, 15)
  assert.equal(group.items[0].throttleReleaseSeconds, 0.3)
  assert.equal(group.items[0].brakeReactionSeconds, 0.7)
  assert.equal(group.items[0].stopReactionSeconds, undefined)
  assert.equal(group.items[0].steeringChangeTurns, 0.12)

  // Equidistant trigger-near samples intentionally keep the earlier recorded sample.
  close(group.items[1].triggerSpeedKmh, 24)
  close(group.items[1].minimumPostTriggerSpeedKmh, 19)
})

test('comparison preserves analyzer timing even when a response occurs beyond the visible three-second context', () => {
  const events = [
    event('ped-a', 'pedestrian', 10, {
      brakeReactionSeconds: 0.6,
      stopReactionSeconds: 3.6,
    }),
    event('ped-b', 'pedestrian', 20, {
      brakeReactionSeconds: 0.8,
      stopReactionSeconds: 2.4,
    }),
  ]
  const samples = [
    sample(10, 15),
    sample(12.8, 8),
    sample(20, 16),
    sample(22.8, 0),
  ]

  const [group] = buildDrivingDynamicsHazardComparisons(samples, events)

  assert.equal(group.items[0].stopReactionSeconds, 3.6)
  close(group.items[0].minimumPostTriggerSpeedKmh, 8)
  assert.equal(group.items[1].stopReactionSeconds, 2.4)
  close(group.items[1].minimumPostTriggerSpeedKmh, 0)
})

test('comparison leaves missing metrics empty instead of inferring values or borrowing another project', () => {
  const events = [
    event('brake-a', 'sudden-brake', 10),
    event('brake-b', 'sudden-brake', 20),
  ]
  const samples = [
    sample(10, 18, 'curve-driving'),
    sample(20, 16, 'curve-driving'),
  ]

  const [group] = buildDrivingDynamicsHazardComparisons(samples, events)

  assert.equal(group.items[0].triggerSpeedKmh, undefined)
  assert.equal(group.items[0].minimumPostTriggerSpeedKmh, undefined)
  assert.equal(group.items[0].brakeReactionSeconds, undefined)
  assert.equal(group.items[0].steeringChangeTurns, undefined)
})
