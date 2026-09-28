import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDrivingDynamicsSessionOverview,
} from '../src/replay/drivingDynamicsSessionOverview'
import type {
  DrivingDynamicsEventKind,
  DrivingDynamicsEventMarker,
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

test('session overview counts hazard kinds and recorded response evidence without scoring', () => {
  const overview = buildDrivingDynamicsSessionOverview([
    event('a', 'sudden-brake', 20, {
      throttleReleaseSeconds: 0.3,
      brakeReactionSeconds: 0.7,
      maximumBrake: 0.8,
    }),
    event('b', 'sudden-brake', 50, {
      brakeReactionSeconds: 1.0,
      maximumBrake: 0.6,
    }),
    event('c', 'cut-in', 35, {
      throttleReleaseSeconds: 0.4,
      maximumSteeringWheelChangeTurns: 0.12,
    }),
    event('d', 'pedestrian', 70, {
      brakeReactionSeconds: 0.5,
      stopReactionSeconds: 1.8,
      maximumBrake: 1,
    }),
    event('e', 'pedestrian', 85),
  ], 10, 100)

  assert.deepEqual(overview.counts, {
    total: 5,
    suddenBrake: 2,
    cutIn: 1,
    pedestrian: 2,
    withThrottleRelease: 2,
    withBrakeResponse: 3,
    withStop: 1,
    withSteeringChange: 1,
  })
})

test('session overview positions markers by real trigger time and sorts them chronologically', () => {
  const overview = buildDrivingDynamicsSessionOverview([
    event('late', 'pedestrian', 90),
    event('early', 'cut-in', 20),
    event('middle', 'sudden-brake', 50),
  ], 10, 110)

  assert.deepEqual(
    overview.markers.map(marker => ({
      id: marker.id,
      relativeTime: marker.relativeTime,
      ratio: marker.ratio,
    })),
    [
      { id: 'early', relativeTime: 10, ratio: 0.1 },
      { id: 'middle', relativeTime: 40, ratio: 0.4 },
      { id: 'late', relativeTime: 80, ratio: 0.8 },
    ],
  )
})

test('session overview clamps markers to session boundaries and handles zero-duration replay safely', () => {
  const clamped = buildDrivingDynamicsSessionOverview([
    event('before', 'cut-in', 5),
    event('inside', 'sudden-brake', 15),
    event('after', 'pedestrian', 30),
  ], 10, 20)

  assert.deepEqual(
    clamped.markers.map(marker => marker.ratio),
    [0, 0.5, 1],
  )

  const zero = buildDrivingDynamicsSessionOverview([
    event('same', 'cut-in', 10),
  ], 10, 10)

  assert.equal(zero.durationSeconds, 0)
  assert.equal(zero.markers[0].ratio, 0)
})

test('session overview treats tiny steering evidence as display noise rather than a counted response', () => {
  const overview = buildDrivingDynamicsSessionOverview([
    event('small', 'cut-in', 10, {
      maximumSteeringWheelChangeTurns: 0.049,
    }),
    event('visible', 'cut-in', 20, {
      maximumSteeringWheelChangeTurns: 0.05,
    }),
  ], 0, 30)

  assert.equal(overview.counts.withSteeringChange, 1)
})


test('session overview stays empty and safe when there are no replay hazard events', () => {
  const overview = buildDrivingDynamicsSessionOverview([], Number.NaN, Number.NaN)

  assert.equal(overview.startTime, 0)
  assert.equal(overview.endTime, 0)
  assert.equal(overview.durationSeconds, 0)
  assert.equal(overview.counts.total, 0)
  assert.deepEqual(overview.markers, [])
})
