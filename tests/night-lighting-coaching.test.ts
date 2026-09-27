import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildNightLightingCoachingReport,
  type NightLightingCoachingSample,
} from '../src/coaching/nightLightingCoaching'

function sample(
  t: number,
  overrides: Partial<NightLightingCoachingSample> = {},
): NightLightingCoachingSample {
  return {
    t,
    project: 'subject3',
    speed: 10,
    night: true,
    lowBeam: true,
    highBeam: false,
    ...overrides,
  }
}

function series(
  values: Array<Partial<NightLightingCoachingSample>>,
  stepSeconds = 0.3,
) {
  return values.map((overrides, index) => sample(index * stepSeconds, overrides))
}

test('daytime and low-speed samples are excluded from night lighting coaching', () => {
  const report = buildNightLightingCoachingReport([
    sample(0, { night: false, speed: 10, highBeam: true, oncomingVehicleId: 'a', oncomingDistanceMeters: 80 }),
    sample(0.3, { speed: 0.1, highBeam: true, oncomingVehicleId: 'a', oncomingDistanceMeters: 80 }),
  ])

  assert.equal(report.observedSampleCount, 0)
  assert.deepEqual(report.segments, [])
})

test('free-road high beam use is not treated as a coaching issue', () => {
  const report = buildNightLightingCoachingReport(series(
    Array.from({ length: 8 }, () => ({
      highBeam: true,
    })),
  ))

  assert.equal(report.observedSampleCount, 8)
  assert.deepEqual(report.segments, [])
})

test('brief high beam before meeting is filtered as a switching transient', () => {
  const report = buildNightLightingCoachingReport(series([
    { highBeam: true, oncomingVehicleId: 'oncoming-a', oncomingDistanceMeters: 145 },
    { highBeam: true, oncomingVehicleId: 'oncoming-a', oncomingDistanceMeters: 138 },
    { highBeam: true, oncomingVehicleId: 'oncoming-a', oncomingDistanceMeters: 130 },
    { highBeam: false, oncomingVehicleId: 'oncoming-a', oncomingDistanceMeters: 122 },
  ]))

  assert.deepEqual(report.segments, [])
})

test('sustained high beam inside the 150m meeting context creates coaching evidence', () => {
  const report = buildNightLightingCoachingReport(series(
    Array.from({ length: 6 }, (_, index) => ({
      highBeam: true,
      oncomingVehicleId: 'meeting-opposing',
      oncomingDistanceMeters: 145 - index * 15,
    })),
  ))

  assert.equal(report.segments.length, 1)
  const segment = report.segments[0]
  assert.equal(segment.kind, 'meeting-high-beam')
  assert.equal(segment.vehicleId, 'meeting-opposing')
  assert.ok(segment.durationSeconds >= 0.8)
  assert.equal(segment.minimumOncomingDistanceMeters, 70)
  assert.equal(segment.representativeTime, 1.5)
})

test('high beam outside the 150m meeting boundary is not flagged', () => {
  const report = buildNightLightingCoachingReport(series(
    Array.from({ length: 8 }, (_, index) => ({
      highBeam: true,
      oncomingVehicleId: 'oncoming-a',
      oncomingDistanceMeters: 170 - index,
    })),
  ))

  assert.deepEqual(report.segments, [])
})

test('sustained high beam while following inside the three-second training reference creates evidence', () => {
  const report = buildNightLightingCoachingReport(series(
    Array.from({ length: 6 }, (_, index) => ({
      highBeam: true,
      leadVehicleId: 'flow-b',
      leadTimeGapSeconds: index === 4 ? 1.6 : 2.4,
      leadGapMeters: index === 4 ? 12 : 20,
    })),
  ))

  assert.equal(report.segments.length, 1)
  const segment = report.segments[0]
  assert.equal(segment.kind, 'following-high-beam')
  assert.equal(segment.vehicleId, 'flow-b')
  assert.equal(segment.minimumLeadTimeGapSeconds, 1.6)
  assert.equal(segment.minimumLeadGapMeters, 12)
})

test('following farther than the coaching reference does not create an issue', () => {
  const report = buildNightLightingCoachingReport(series(
    Array.from({ length: 8 }, () => ({
      highBeam: true,
      leadVehicleId: 'flow-b',
      leadTimeGapSeconds: 3.4,
      leadGapMeters: 32,
    })),
  ))

  assert.deepEqual(report.segments, [])
})

test('returning to low beam breaks high-beam issue continuity', () => {
  const report = buildNightLightingCoachingReport(series([
    ...Array.from({ length: 3 }, () => ({
      highBeam: true,
      leadVehicleId: 'flow-b',
      leadTimeGapSeconds: 2,
      leadGapMeters: 16,
    })),
    {
      highBeam: false,
      leadVehicleId: 'flow-b',
      leadTimeGapSeconds: 2,
      leadGapMeters: 16,
    },
    ...Array.from({ length: 3 }, () => ({
      highBeam: true,
      leadVehicleId: 'flow-b',
      leadTimeGapSeconds: 2,
      leadGapMeters: 16,
    })),
  ]))

  assert.deepEqual(report.segments, [])
})

test('switching traffic actors splits evidence instead of merging unrelated encounters', () => {
  const report = buildNightLightingCoachingReport(series([
    ...Array.from({ length: 3 }, () => ({
      highBeam: true,
      oncomingVehicleId: 'oncoming-a',
      oncomingDistanceMeters: 120,
    })),
    ...Array.from({ length: 3 }, () => ({
      highBeam: true,
      oncomingVehicleId: 'oncoming-b',
      oncomingDistanceMeters: 110,
    })),
  ]))

  assert.deepEqual(report.segments, [])
})

test('simultaneous close following and meeting contexts remain separate evidence segments', () => {
  const report = buildNightLightingCoachingReport(series(
    Array.from({ length: 6 }, () => ({
      highBeam: true,
      leadVehicleId: 'flow-b',
      leadTimeGapSeconds: 2.2,
      leadGapMeters: 18,
      oncomingVehicleId: 'oncoming-a',
      oncomingDistanceMeters: 100,
    })),
  ))

  assert.deepEqual(
    report.segments.map(segment => segment.kind).sort(),
    ['following-high-beam', 'meeting-high-beam'],
  )
})
