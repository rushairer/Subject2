import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildFollowingDistanceCoachingReport,
  type FollowingDistanceCoachingSample,
} from '../src/coaching/followingDistanceCoaching'
import { observeSubject3LeadVehicle } from '../src/subject3/subject3LeadVehicle'
import {
  createSubject3TrafficState,
  updateSubject3TrafficVehicle,
} from '../src/subject3/subject3Traffic'
import { actorRoutePose } from '../src/subject3/subject3Route'

function sample(
  t: number,
  overrides: Partial<FollowingDistanceCoachingSample> = {},
): FollowingDistanceCoachingSample {
  return {
    t,
    project: 'subject3',
    speed: 8,
    leadVehicleId: 'flow-b',
    leadGapMeters: 28,
    leadTimeGapSeconds: 3.5,
    leadClosingSpeedMps: 0,
    ...overrides,
  }
}

function series(
  values: Array<Partial<FollowingDistanceCoachingSample>>,
  stepSeconds = 0.3,
) {
  return values.map((overrides, index) => sample(index * stepSeconds, overrides))
}

test('samples without a lead vehicle do not create following-distance evidence', () => {
  const report = buildFollowingDistanceCoachingReport(series(
    Array.from({ length: 10 }, () => ({
      leadVehicleId: undefined,
      leadGapMeters: undefined,
      leadTimeGapSeconds: undefined,
    })),
  ))

  assert.equal(report.observedSampleCount, 0)
  assert.deepEqual(report.segments, [])
})

test('brief short-gap exposure is ignored as a transient', () => {
  const report = buildFollowingDistanceCoachingReport(series([
    { leadTimeGapSeconds: 2.2, leadGapMeters: 17 },
    { leadTimeGapSeconds: 2.1, leadGapMeters: 16 },
    { leadTimeGapSeconds: 2.0, leadGapMeters: 15 },
    { leadTimeGapSeconds: 1.9, leadGapMeters: 14 },
    { leadTimeGapSeconds: 3.4, leadGapMeters: 27 },
  ]))

  assert.deepEqual(report.segments, [])
})

test('sustained sub-three-second following creates a coaching segment', () => {
  const report = buildFollowingDistanceCoachingReport(series(
    Array.from({ length: 8 }, (_, index) => ({
      leadTimeGapSeconds: index === 4 ? 1.55 : 2.2,
      leadGapMeters: index === 4 ? 12 : 17,
      leadClosingSpeedMps: index === 4 ? 3.2 : 1.1,
      leadTimeToCollisionSeconds: index === 4 ? 3.75 : 15,
    })),
  ))

  assert.equal(report.segments.length, 1)
  const segment = report.segments[0]
  assert.equal(segment.vehicleId, 'flow-b')
  assert.ok(segment.durationSeconds >= 1.5)
  assert.equal(segment.minimumTimeGapSeconds, 1.55)
  assert.equal(segment.minimumGapMeters, 12)
  assert.equal(segment.representativeClosingSpeedMps, 3.2)
  assert.equal(segment.representativeTimeToCollisionSeconds, 3.75)
})

test('a recovered safe gap breaks short-gap continuity', () => {
  const report = buildFollowingDistanceCoachingReport(series([
    ...Array.from({ length: 4 }, () => ({
      leadTimeGapSeconds: 2.1,
      leadGapMeters: 16,
    })),
    { leadTimeGapSeconds: 3.4, leadGapMeters: 28 },
    ...Array.from({ length: 4 }, () => ({
      leadTimeGapSeconds: 2.0,
      leadGapMeters: 15,
    })),
  ]))

  assert.deepEqual(report.segments, [])
})

test('switching to a different lead vehicle splits evidence', () => {
  const report = buildFollowingDistanceCoachingReport(series([
    ...Array.from({ length: 4 }, () => ({
      leadVehicleId: 'flow-a',
      leadTimeGapSeconds: 2,
      leadGapMeters: 15,
    })),
    ...Array.from({ length: 4 }, () => ({
      leadVehicleId: 'flow-b',
      leadTimeGapSeconds: 2,
      leadGapMeters: 15,
    })),
  ]))

  assert.deepEqual(report.segments, [])
})

test('low-speed queueing is excluded from three-second coaching', () => {
  const report = buildFollowingDistanceCoachingReport(series(
    Array.from({ length: 10 }, () => ({
      speed: 1.5,
      leadTimeGapSeconds: 1.2,
      leadGapMeters: 2,
    })),
  ))

  assert.equal(report.observedSampleCount, 0)
  assert.deepEqual(report.segments, [])
})

test('non-Subject-3 samples are ignored', () => {
  const report = buildFollowingDistanceCoachingReport(series(
    Array.from({ length: 10 }, () => ({
      project: 'right-angle',
      leadTimeGapSeconds: 1.5,
      leadGapMeters: 8,
    })),
  ))

  assert.equal(report.observedSampleCount, 0)
})

test('report preserves overall minimum observed gap even when it is not sustained', () => {
  const report = buildFollowingDistanceCoachingReport(series([
    { leadTimeGapSeconds: 3.6, leadGapMeters: 30 },
    { leadTimeGapSeconds: 2.6, leadGapMeters: 20 },
    { leadTimeGapSeconds: 1.7, leadGapMeters: 11 },
    { leadTimeGapSeconds: 3.2, leadGapMeters: 26 },
  ]))

  assert.equal(report.minimumTimeGapSeconds, 1.7)
  assert.equal(report.minimumGapMeters, 11)
  assert.deepEqual(report.segments, [])
})


test('live lead-vehicle geometry feeds the coaching report without scoring data', () => {
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficVehicle(traffic, 'flow-b', 1020, 0, 8, false)
  const pose = actorRoutePose(1000, 0)
  const player = { x: pose.x, z: pose.z, speed: 10 }
  const lead = observeSubject3LeadVehicle(player, traffic)
  assert.ok(lead)
  assert.ok(lead.timeGapSeconds < 3)

  const samples = Array.from({ length: 8 }, (_, index) => ({
    t: index * 0.3,
    project: 'subject3',
    speed: player.speed,
    leadVehicleId: lead.vehicleId,
    leadGapMeters: lead.bumperGapMeters,
    leadTimeGapSeconds: lead.timeGapSeconds,
    leadClosingSpeedMps: lead.closingSpeedMps,
    leadTimeToCollisionSeconds: lead.timeToCollisionSeconds,
  }))

  const report = buildFollowingDistanceCoachingReport(samples)
  assert.equal(report.segments.length, 1)
  assert.equal(report.segments[0].vehicleId, 'flow-b')
})
