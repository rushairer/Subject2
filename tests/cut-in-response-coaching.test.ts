import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCutInResponseCoachingReport,
  type CutInResponseCoachingSample,
} from '../src/coaching/cutInResponseCoaching'

function sample(
  t: number,
  overrides: Partial<CutInResponseCoachingSample> = {},
): CutInResponseCoachingSample {
  return {
    t,
    project: 'subject3',
    speed: 8,
    throttle: 0.55,
    brake: 0,
    steeringWheelAngle: 0,
    cutInHazardId: 'cut-in-scooter',
    cutInConflict: false,
    cutInProgressDeltaMeters: 18,
    cutInLateralDeltaMeters: 2.1,
    cutInLongitudinalSpeedMps: 3.2,
    cutInLateralSpeedMps: -0.97,
    cutInClosingSpeedMps: 4.8,
    cutInTimeToLongitudinalMeetSeconds: 3.75,
    ...overrides,
  }
}

test('ordinary Subject 3 samples do not create cut-in coaching', () => {
  const report = buildCutInResponseCoachingReport([
    sample(0, { cutInHazardId: undefined }),
    sample(0.2, { cutInHazardId: undefined }),
  ])

  assert.equal(report.scenarioSampleCount, 0)
  assert.deepEqual(report.events, [])
})

test('a conflict transition records throttle, brake and steering response evidence', () => {
  const report = buildCutInResponseCoachingReport([
    sample(0, {
      cutInConflict: false,
      throttle: 0.62,
      cutInProgressDeltaMeters: 20,
      cutInLateralDeltaMeters: 2.2,
    }),
    sample(0.2, {
      cutInConflict: true,
      throttle: 0.62,
      cutInProgressDeltaMeters: 18,
      cutInLateralDeltaMeters: 1.7,
      cutInTimeToLongitudinalMeetSeconds: 3.2,
    }),
    sample(0.4, {
      cutInConflict: true,
      throttle: 0.28,
      steeringWheelAngle: 0.12,
      cutInProgressDeltaMeters: 15,
      cutInLateralDeltaMeters: 1.2,
      cutInTimeToLongitudinalMeetSeconds: 2.6,
    }),
    sample(0.6, {
      cutInConflict: true,
      throttle: 0,
      brake: 0.24,
      steeringWheelAngle: -0.4,
      cutInProgressDeltaMeters: 11,
      cutInLateralDeltaMeters: 0.8,
      cutInTimeToLongitudinalMeetSeconds: 1.9,
    }),
    sample(0.8, {
      cutInConflict: true,
      throttle: 0,
      brake: 0.6,
      steeringWheelAngle: -0.3,
      cutInProgressDeltaMeters: 8,
      cutInLateralDeltaMeters: 0.5,
      cutInTimeToLongitudinalMeetSeconds: 1.4,
    }),
  ])

  assert.equal(report.events.length, 1)
  const event = report.events[0]
  assert.equal(event.hazardId, 'cut-in-scooter')
  assert.equal(event.triggerTime, 0.2)
  assert.equal(event.triggerAheadMeters, 18)
  assert.equal(event.triggerLateralMeters, 1.7)
  assert.ok(Math.abs((event.throttleReleaseSeconds ?? Infinity) - 0.2) < 0.001)
  assert.ok(Math.abs((event.brakeReactionSeconds ?? Infinity) - 0.4) < 0.001)
  assert.equal(event.maximumBrake, 0.6)
  assert.equal(event.maximumSteeringWheelChangeRadians, 0.4)
  assert.equal(event.minimumAbsoluteLongitudinalDistanceMeters, 8)
  assert.equal(event.minimumAbsoluteLateralDistanceMeters, 0.5)
  assert.equal(event.minimumTimeToLongitudinalMeetSeconds, 1.4)
  assert.equal(event.representativeTime, 0.8)
})

test('continuous conflict samples do not create duplicate cut-in events', () => {
  const report = buildCutInResponseCoachingReport([
    sample(0, { cutInConflict: false }),
    sample(0.2, { cutInConflict: true }),
    sample(0.4, { cutInConflict: true }),
    sample(0.6, { cutInConflict: true }),
  ])

  assert.equal(report.events.length, 1)
})

test('a distant conflict transition is retained as scenario evidence but not a response event', () => {
  const report = buildCutInResponseCoachingReport([
    sample(0, {
      cutInConflict: false,
      cutInProgressDeltaMeters: 40,
    }),
    sample(0.2, {
      cutInConflict: true,
      cutInProgressDeltaMeters: 38,
    }),
  ])

  assert.equal(report.scenarioSampleCount, 2)
  assert.deepEqual(report.events, [])
})

test('low candidate speed suppresses cut-in reaction timing', () => {
  const report = buildCutInResponseCoachingReport([
    sample(0, { speed: 0.8, cutInConflict: false }),
    sample(0.2, { speed: 0.8, cutInConflict: true }),
  ])

  assert.deepEqual(report.events, [])
})

test('large sample gaps cannot manufacture a cut-in conflict transition', () => {
  const report = buildCutInResponseCoachingReport([
    sample(0, { cutInConflict: false }),
    sample(1.2, { cutInConflict: true }),
  ])

  assert.deepEqual(report.events, [])
})

test('already-low throttle does not fabricate throttle release latency', () => {
  const report = buildCutInResponseCoachingReport([
    sample(0, { cutInConflict: false, throttle: 0.04 }),
    sample(0.2, { cutInConflict: true, throttle: 0.04 }),
    sample(0.4, { cutInConflict: true, throttle: 0, brake: 0.2 }),
  ])

  const event = report.events[0]
  assert.ok(event)
  assert.equal(event.baselineThrottle, 0.04)
  assert.equal(event.throttleReleaseSeconds, undefined)
  assert.ok(Math.abs((event.brakeReactionSeconds ?? Infinity) - 0.2) < 0.001)
})

test('older trajectory samples without pedal or steering fields remain analyzable', () => {
  const report = buildCutInResponseCoachingReport([
    sample(0, {
      cutInConflict: false,
      throttle: undefined,
      brake: undefined,
      steeringWheelAngle: undefined,
    }),
    sample(0.2, {
      cutInConflict: true,
      throttle: undefined,
      brake: undefined,
      steeringWheelAngle: undefined,
    }),
  ])

  assert.equal(report.events.length, 1)
  const event = report.events[0]
  assert.equal(event.baselineThrottle, undefined)
  assert.equal(event.throttleReleaseSeconds, undefined)
  assert.equal(event.brakeReactionSeconds, undefined)
  assert.equal(event.maximumBrake, 0)
  assert.equal(event.maximumSteeringWheelChangeRadians, undefined)
})

test('separate cut-in encounters can create separate evidence events', () => {
  const report = buildCutInResponseCoachingReport([
    sample(0, { cutInHazardId: 'cut-a', cutInConflict: false }),
    sample(0.2, { cutInHazardId: 'cut-a', cutInConflict: true }),
    sample(4.0, { cutInHazardId: 'cut-b', cutInConflict: false }),
    sample(4.2, { cutInHazardId: 'cut-b', cutInConflict: true }),
  ])

  assert.deepEqual(report.events.map(event => event.hazardId), ['cut-a', 'cut-b'])
})
