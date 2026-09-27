import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPedestrianResponseCoachingReport,
  type PedestrianResponseCoachingSample,
} from '../src/coaching/pedestrianResponseCoaching'

function sample(
  t: number,
  overrides: Partial<PedestrianResponseCoachingSample> = {},
): PedestrianResponseCoachingSample {
  return {
    t,
    project: 'subject3',
    speed: 7,
    throttle: 0.5,
    brake: 0,
    pedestrianHazardId: 'crosswalk-pedestrian',
    pedestrianConflict: false,
    pedestrianProgressDeltaMeters: 24,
    pedestrianLateralDeltaMeters: 1.6,
    pedestrianLateralSpeedMps: -1.8,
    pedestrianPlanarDistanceMeters: Math.hypot(24, 1.6),
    pedestrianTimeToCrosswalkSeconds: 24 / 7,
    ...overrides,
  }
}

test('ordinary samples do not create pedestrian response coaching', () => {
  const report = buildPedestrianResponseCoachingReport([
    sample(0, { pedestrianHazardId: undefined }),
    sample(0.2, { pedestrianHazardId: undefined }),
  ])

  assert.equal(report.scenarioSampleCount, 0)
  assert.deepEqual(report.events, [])
})

test('pedestrian conflict transition records throttle, brake and stop response evidence', () => {
  const report = buildPedestrianResponseCoachingReport([
    sample(0, {
      pedestrianConflict: false,
      throttle: 0.62,
      pedestrianProgressDeltaMeters: 25,
      pedestrianPlanarDistanceMeters: 25.2,
    }),
    sample(0.2, {
      pedestrianConflict: true,
      throttle: 0.62,
      pedestrianProgressDeltaMeters: 22,
      pedestrianLateralDeltaMeters: 1.4,
      pedestrianPlanarDistanceMeters: 22.1,
    }),
    sample(0.4, {
      pedestrianConflict: true,
      throttle: 0.25,
      speed: 6,
      pedestrianProgressDeltaMeters: 19,
      pedestrianLateralDeltaMeters: 0.8,
      pedestrianPlanarDistanceMeters: 19.1,
    }),
    sample(0.6, {
      pedestrianConflict: true,
      throttle: 0,
      brake: 0.3,
      speed: 4,
      pedestrianProgressDeltaMeters: 15,
      pedestrianLateralDeltaMeters: 0.2,
      pedestrianPlanarDistanceMeters: 15,
    }),
    sample(1.0, {
      pedestrianConflict: true,
      throttle: 0,
      brake: 0.7,
      speed: 1.5,
      pedestrianProgressDeltaMeters: 10,
      pedestrianLateralDeltaMeters: -0.4,
      pedestrianPlanarDistanceMeters: 10,
    }),
    sample(1.4, {
      pedestrianConflict: true,
      throttle: 0,
      brake: 0.55,
      speed: 0.05,
      pedestrianProgressDeltaMeters: 7,
      pedestrianLateralDeltaMeters: -0.8,
      pedestrianPlanarDistanceMeters: 7.1,
    }),
  ])

  assert.equal(report.events.length, 1)
  const event = report.events[0]
  assert.equal(event.hazardId, 'crosswalk-pedestrian')
  assert.equal(event.triggerTime, 0.2)
  assert.equal(event.triggerAheadMeters, 22)
  assert.equal(event.triggerLateralMeters, 1.4)
  assert.ok(Math.abs((event.throttleReleaseSeconds ?? Infinity) - 0.2) < 0.001)
  assert.ok(Math.abs((event.brakeReactionSeconds ?? Infinity) - 0.4) < 0.001)
  assert.ok(Math.abs((event.stopReactionSeconds ?? Infinity) - 1.2) < 0.001)
  assert.equal(event.maximumBrake, 0.7)
  assert.equal(event.minimumSpeedMps, 0.05)
  assert.equal(event.minimumPlanarDistanceMeters, 7.1)
  assert.equal(event.representativeTime, 1.4)
})

test('continuous pedestrian conflict does not create duplicate events', () => {
  const report = buildPedestrianResponseCoachingReport([
    sample(0, { pedestrianConflict: false }),
    sample(0.2, { pedestrianConflict: true }),
    sample(0.4, { pedestrianConflict: true }),
    sample(0.6, { pedestrianConflict: true }),
  ])

  assert.equal(report.events.length, 1)
})

test('distant conflict transition is kept as scenario evidence but not timed', () => {
  const report = buildPedestrianResponseCoachingReport([
    sample(0, {
      pedestrianConflict: false,
      pedestrianProgressDeltaMeters: 55,
    }),
    sample(0.2, {
      pedestrianConflict: true,
      pedestrianProgressDeltaMeters: 52,
    }),
  ])

  assert.equal(report.scenarioSampleCount, 2)
  assert.deepEqual(report.events, [])
})

test('low candidate speed suppresses response timing at trigger', () => {
  const report = buildPedestrianResponseCoachingReport([
    sample(0, { speed: 0.5, pedestrianConflict: false }),
    sample(0.2, { speed: 0.5, pedestrianConflict: true }),
  ])

  assert.deepEqual(report.events, [])
})

test('large sample gaps cannot fabricate a pedestrian conflict transition', () => {
  const report = buildPedestrianResponseCoachingReport([
    sample(0, { pedestrianConflict: false }),
    sample(1.2, { pedestrianConflict: true }),
  ])

  assert.deepEqual(report.events, [])
})

test('already-low throttle does not fabricate throttle release evidence', () => {
  const report = buildPedestrianResponseCoachingReport([
    sample(0, { pedestrianConflict: false, throttle: 0.04 }),
    sample(0.2, { pedestrianConflict: true, throttle: 0.04 }),
    sample(0.4, { pedestrianConflict: true, throttle: 0, brake: 0.2 }),
  ])

  const event = report.events[0]
  assert.ok(event)
  assert.equal(event.baselineThrottle, 0.04)
  assert.equal(event.throttleReleaseSeconds, undefined)
  assert.ok(Math.abs((event.brakeReactionSeconds ?? Infinity) - 0.2) < 0.001)
})

test('missing pedal evidence remains analyzable without inventing a response', () => {
  const report = buildPedestrianResponseCoachingReport([
    sample(0, {
      pedestrianConflict: false,
      throttle: undefined,
      brake: undefined,
    }),
    sample(0.2, {
      pedestrianConflict: true,
      throttle: undefined,
      brake: undefined,
    }),
    sample(0.6, {
      pedestrianConflict: true,
      throttle: undefined,
      brake: undefined,
      speed: 0.05,
    }),
  ])

  assert.equal(report.events.length, 1)
  const event = report.events[0]
  assert.equal(event.baselineThrottle, undefined)
  assert.equal(event.throttleReleaseSeconds, undefined)
  assert.equal(event.brakeReactionSeconds, undefined)
  assert.equal(event.maximumBrake, 0)
  assert.ok(event.stopReactionSeconds != null)
})
