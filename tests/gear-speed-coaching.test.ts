import assert from 'node:assert/strict'
import test from 'node:test'
import { buildGearSpeedCoachingReport, type GearSpeedCoachingSample } from '../src/coaching/gearSpeedCoaching'

function sample(
  t: number,
  overrides: Partial<GearSpeedCoachingSample> = {},
): GearSpeedCoachingSample {
  return {
    t,
    project: 'subject3',
    speed: 6,
    gear: 3,
    automatic: false,
    engineOn: true,
    engineRpm: 1800,
    clutch: 0,
    ...overrides,
  }
}

function series(
  values: Array<Partial<GearSpeedCoachingSample>>,
  stepSeconds = 0.3,
) {
  return values.map((overrides, index) => sample(index * stepSeconds, overrides))
}

test('automatic sessions are excluded from manual gear-speed coaching', () => {
  const report = buildGearSpeedCoachingReport(series(
    Array.from({ length: 10 }, () => ({
      automatic: true,
      engineRpm: 700,
      gear: 5,
    })),
  ))

  assert.equal(report.applicableSampleCount, 0)
  assert.deepEqual(report.segments, [])
})

test('disengaged clutch and launch-speed samples are excluded', () => {
  const report = buildGearSpeedCoachingReport([
    sample(0, { engineRpm: 800, clutch: 1 }),
    sample(0.3, { engineRpm: 800, clutch: 0, speed: 0.7 }),
  ])

  assert.equal(report.applicableSampleCount, 0)
  assert.deepEqual(report.segments, [])
})

test('brief low-rpm mismatch is ignored as a shift transient', () => {
  const report = buildGearSpeedCoachingReport(series([
    { engineRpm: 900, gear: 4 },
    { engineRpm: 900, gear: 4 },
    { engineRpm: 900, gear: 4 },
    { engineRpm: 900, gear: 4 },
    { engineRpm: 900, gear: 4 },
    { engineRpm: 1700, gear: 4 },
  ]))

  assert.equal(report.applicableSampleCount, 6)
  assert.deepEqual(report.segments, [])
})

test('sustained low-rpm driving creates a non-scoring coaching segment', () => {
  const report = buildGearSpeedCoachingReport(series(
    Array.from({ length: 8 }, (_, index) => ({
      engineRpm: index === 4 ? 820 : 930,
      gear: 5,
      speed: 5.5,
    })),
  ))

  assert.equal(report.segments.length, 1)
  const segment = report.segments[0]
  assert.equal(segment.kind, 'low-rpm')
  assert.equal(segment.gear, 5)
  assert.ok(segment.durationSeconds >= 1.5)
  assert.equal(segment.representativeRpm, 820)
  assert.ok(segment.representativeSpeedKmh > 19)
})

test('sustained high-rpm driving creates a high-rpm coaching segment', () => {
  const report = buildGearSpeedCoachingReport(series(
    Array.from({ length: 8 }, (_, index) => ({
      engineRpm: index === 5 ? 4200 : 3800,
      gear: 1,
      speed: 8,
    })),
  ))

  assert.equal(report.segments.length, 1)
  const segment = report.segments[0]
  assert.equal(segment.kind, 'high-rpm')
  assert.equal(segment.gear, 1)
  assert.equal(segment.representativeRpm, 4200)
})

test('matched samples break mismatch continuity', () => {
  const report = buildGearSpeedCoachingReport(series([
    ...Array.from({ length: 4 }, () => ({ engineRpm: 900, gear: 5 })),
    { engineRpm: 1800, gear: 5 },
    ...Array.from({ length: 4 }, () => ({ engineRpm: 900, gear: 5 })),
  ]))

  assert.deepEqual(report.segments, [])
})

test('gear changes split otherwise continuous mismatch evidence', () => {
  const report = buildGearSpeedCoachingReport(series([
    ...Array.from({ length: 7 }, () => ({ engineRpm: 900, gear: 4 })),
    ...Array.from({ length: 7 }, () => ({ engineRpm: 900, gear: 5 })),
  ]))

  assert.equal(report.segments.length, 2)
  assert.deepEqual(report.segments.map(item => item.gear), [4, 5])
})

test('large sampling gaps split mismatch evidence', () => {
  const samples = [
    sample(0, { engineRpm: 900, gear: 5 }),
    sample(0.3, { engineRpm: 900, gear: 5 }),
    sample(0.6, { engineRpm: 900, gear: 5 }),
    sample(2.0, { engineRpm: 900, gear: 5 }),
    sample(2.3, { engineRpm: 900, gear: 5 }),
    sample(2.6, { engineRpm: 900, gear: 5 }),
  ]

  const report = buildGearSpeedCoachingReport(samples)
  assert.deepEqual(report.segments, [])
})

test('non-Subject-3 samples do not create gear-speed coaching evidence', () => {
  const report = buildGearSpeedCoachingReport(series(
    Array.from({ length: 10 }, () => ({
      project: 'right-angle',
      engineRpm: 900,
      gear: 5,
    })),
  ))

  assert.equal(report.applicableSampleCount, 0)
  assert.deepEqual(report.segments, [])
})
