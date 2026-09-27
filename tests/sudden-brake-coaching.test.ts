import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSuddenBrakeCoachingReport,
  type SuddenBrakeCoachingSample,
} from '../src/coaching/suddenBrakeCoaching'

function sample(
  t: number,
  overrides: Partial<SuddenBrakeCoachingSample> = {},
): SuddenBrakeCoachingSample {
  return {
    t,
    project: 'subject3',
    speed: 8,
    throttle: 0.6,
    brake: 0,
    leadVehicleId: 'sudden-brake',
    leadScenario: 'sudden-brake',
    leadSpeedMps: 8.5,
    leadGapMeters: 24,
    leadTimeGapSeconds: 3,
    leadTimeToCollisionSeconds: 6,
    ...overrides,
  }
}

test('ordinary lead traffic never creates sudden-brake coaching', () => {
  const report = buildSuddenBrakeCoachingReport([
    sample(0, { leadScenario: undefined, leadVehicleId: 'flow-a', leadSpeedMps: 8.5 }),
    sample(0.2, { leadScenario: undefined, leadVehicleId: 'flow-a', leadSpeedMps: 7 }),
    sample(0.4, { leadScenario: undefined, leadVehicleId: 'flow-a', leadSpeedMps: 5 }),
  ])

  assert.equal(report.scenarioSampleCount, 0)
  assert.deepEqual(report.events, [])
})

test('far-away sudden-brake actor is observed but not treated as a relevant response event', () => {
  const report = buildSuddenBrakeCoachingReport([
    sample(0, { leadTimeGapSeconds: 6.2, leadSpeedMps: 8.5 }),
    sample(0.2, { leadTimeGapSeconds: 6.0, leadSpeedMps: 7 }),
  ])

  assert.equal(report.scenarioSampleCount, 2)
  assert.deepEqual(report.events, [])
})

test('gentle lead deceleration stays below the sudden-brake trigger', () => {
  const report = buildSuddenBrakeCoachingReport([
    sample(0, { leadSpeedMps: 8.5 }),
    sample(0.2, { leadSpeedMps: 8.1 }),
    sample(0.4, { leadSpeedMps: 7.8 }),
  ])

  assert.deepEqual(report.events, [])
})

test('sudden lead deceleration records throttle release, brake response and risk minima', () => {
  const report = buildSuddenBrakeCoachingReport([
    sample(0, {
      leadSpeedMps: 8.5,
      throttle: 0.62,
      leadTimeGapSeconds: 3.2,
      leadGapMeters: 25,
      leadTimeToCollisionSeconds: 7,
    }),
    sample(0.2, {
      leadSpeedMps: 7.0,
      throttle: 0.62,
      leadTimeGapSeconds: 3.0,
      leadGapMeters: 23,
      leadTimeToCollisionSeconds: 5,
    }),
    sample(0.4, {
      leadSpeedMps: 5.5,
      throttle: 0.3,
      brake: 0,
      leadTimeGapSeconds: 2.6,
      leadGapMeters: 19,
      leadTimeToCollisionSeconds: 3.4,
    }),
    sample(0.6, {
      leadSpeedMps: 4.0,
      throttle: 0,
      brake: 0.28,
      leadTimeGapSeconds: 2.1,
      leadGapMeters: 15,
      leadTimeToCollisionSeconds: 2.4,
    }),
    sample(0.8, {
      leadSpeedMps: 2.5,
      throttle: 0,
      brake: 0.66,
      leadTimeGapSeconds: 1.8,
      leadGapMeters: 12,
      leadTimeToCollisionSeconds: 1.6,
    }),
    sample(1.0, {
      leadSpeedMps: 1.0,
      throttle: 0,
      brake: 0.4,
      leadTimeGapSeconds: 2.0,
      leadGapMeters: 11,
      leadTimeToCollisionSeconds: 2.1,
    }),
  ])

  assert.equal(report.events.length, 1)
  const event = report.events[0]
  assert.equal(event.vehicleId, 'sudden-brake')
  assert.ok(event.leadDecelerationMps2 > 7)
  assert.equal(event.triggerTime, 0.2)
  assert.equal(event.triggerTimeGapSeconds, 3)
  assert.ok(Math.abs((event.throttleReleaseSeconds ?? Infinity) - 0.2) < 0.001)
  assert.ok(Math.abs((event.brakeReactionSeconds ?? Infinity) - 0.4) < 0.001)
  assert.equal(event.maximumBrake, 0.66)
  assert.equal(event.minimumTimeGapSeconds, 1.8)
  assert.equal(event.minimumGapMeters, 11)
  assert.equal(event.minimumTimeToCollisionSeconds, 1.6)
  assert.equal(event.representativeTime, 0.8)
})

test('already-low throttle does not fabricate a throttle-release reaction', () => {
  const report = buildSuddenBrakeCoachingReport([
    sample(0, { leadSpeedMps: 8.5, throttle: 0.05 }),
    sample(0.2, { leadSpeedMps: 7.0, throttle: 0.05 }),
    sample(0.4, { leadSpeedMps: 5.5, throttle: 0, brake: 0.2 }),
  ])

  const event = report.events[0]
  assert.ok(event)
  assert.equal(event.baselineThrottle, 0.05)
  assert.equal(event.throttleReleaseSeconds, undefined)
  assert.ok(Math.abs((event.brakeReactionSeconds ?? Infinity) - 0.2) < 0.001)
})

test('older trajectory samples without pedal fields remain analyzable', () => {
  const report = buildSuddenBrakeCoachingReport([
    sample(0, { leadSpeedMps: 8.5, throttle: undefined, brake: undefined }),
    sample(0.2, { leadSpeedMps: 7.0, throttle: undefined, brake: undefined }),
    sample(0.4, { leadSpeedMps: 5.5, throttle: undefined, brake: undefined }),
  ])

  assert.equal(report.events.length, 1)
  const event = report.events[0]
  assert.equal(event.baselineThrottle, undefined)
  assert.equal(event.throttleReleaseSeconds, undefined)
  assert.equal(event.brakeReactionSeconds, undefined)
  assert.equal(event.maximumBrake, 0)
})

test('large sample gaps cannot manufacture a lead deceleration rate', () => {
  const report = buildSuddenBrakeCoachingReport([
    sample(0, { leadSpeedMps: 8.5 }),
    sample(1.2, { leadSpeedMps: 2.0 }),
  ])

  assert.deepEqual(report.events, [])
})

test('repeated deceleration samples inside one evidence window produce one event', () => {
  const report = buildSuddenBrakeCoachingReport([
    sample(0, { leadSpeedMps: 8.5 }),
    sample(0.2, { leadSpeedMps: 7 }),
    sample(0.4, { leadSpeedMps: 5.5 }),
    sample(0.6, { leadSpeedMps: 4 }),
    sample(0.8, { leadSpeedMps: 2.5 }),
  ])

  assert.equal(report.events.length, 1)
})

test('a second separated sudden-brake encounter can create another evidence event', () => {
  const report = buildSuddenBrakeCoachingReport([
    sample(0, { leadVehicleId: 'sudden-a', leadSpeedMps: 8.5 }),
    sample(0.2, { leadVehicleId: 'sudden-a', leadSpeedMps: 7 }),
    sample(4.0, { leadVehicleId: 'sudden-b', leadSpeedMps: 8.5 }),
    sample(4.2, { leadVehicleId: 'sudden-b', leadSpeedMps: 7 }),
  ])

  assert.deepEqual(report.events.map(event => event.vehicleId), ['sudden-a', 'sudden-b'])
})

test('low-speed candidate motion is excluded from reaction timing', () => {
  const report = buildSuddenBrakeCoachingReport([
    sample(0, { speed: 0.8, leadSpeedMps: 8.5 }),
    sample(0.2, { speed: 0.8, leadSpeedMps: 7 }),
  ])

  assert.deepEqual(report.events, [])
})
