import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDrivingDynamicsTimeline,
  dynamicsGearLabel,
  type DrivingDynamicsSample,
} from '../src/replay/drivingDynamicsTimeline'
import {
  buildDrivingDynamicsEventMarkers,
  drivingDynamicsEventId,
  type DrivingDynamicsEventSample,
} from '../src/replay/drivingDynamicsEvents'

function sample(
  t: number,
  overrides: Partial<DrivingDynamicsSample> = {},
): DrivingDynamicsSample {
  return {
    t,
    project: 'subject3',
    speed: 5,
    gear: 1,
    automatic: false,
    ...overrides,
  }
}

test('timeline sorts samples and reports duration and maximum speed', () => {
  const model = buildDrivingDynamicsTimeline([
    sample(4, { speed: 8 }),
    sample(1, { speed: 2 }),
    sample(2.5, { speed: -10 }),
  ])

  assert.deepEqual(model.samples.map(item => item.t), [1, 2.5, 4])
  assert.equal(model.startTime, 1)
  assert.equal(model.endTime, 4)
  assert.equal(model.durationSeconds, 3)
  assert.equal(model.maxSpeedKmh, 36)
})

test('invalid trajectory samples are excluded without corrupting the timeline', () => {
  const model = buildDrivingDynamicsTimeline([
    sample(0),
    sample(Number.NaN),
    sample(1, { speed: Number.POSITIVE_INFINITY }),
    sample(2, { project: '' }),
    sample(3),
  ])

  assert.deepEqual(model.samples.map(item => item.t), [0, 3])
})

test('gear changes are detected at the sample where the new gear becomes active', () => {
  const model = buildDrivingDynamicsTimeline([
    sample(0, { gear: 1 }),
    sample(0.2, { gear: 1 }),
    sample(0.4, { gear: 0 }),
    sample(0.6, { gear: 2 }),
    sample(0.8, { gear: 2 }),
  ])

  assert.deepEqual(
    model.gearChanges.map(item => ({
      index: item.sampleIndex,
      from: item.fromGear,
      to: item.toGear,
      t: item.t,
    })),
    [
      { index: 2, from: 1, to: 0, t: 0.4 },
      { index: 3, from: 0, to: 2, t: 0.6 },
    ],
  )
})

test('chart downsampling preserves first, last and every gear transition', () => {
  const samples = Array.from({ length: 1000 }, (_, index) =>
    sample(index * 0.2, {
      gear: index < 250 ? 1 : index < 500 ? 2 : index < 750 ? 3 : 4,
      speed: index / 100,
    }),
  )
  const model = buildDrivingDynamicsTimeline(samples, 40)
  const chartIndices = new Set(model.chartSamples.map(item => item.sampleIndex))

  assert.ok(model.chartSamples.length < samples.length)
  assert.ok(chartIndices.has(0))
  assert.ok(chartIndices.has(999))
  for (const index of [249, 250, 499, 500, 749, 750]) {
    assert.ok(chartIndices.has(index), `expected chart to preserve gear boundary sample ${index}`)
  }
})

test('small trajectories remain lossless in chart data', () => {
  const samples = [
    sample(0, { gear: 1 }),
    sample(0.2, { gear: 2 }),
    sample(0.4, { gear: 3 }),
  ]
  const model = buildDrivingDynamicsTimeline(samples, 360)

  assert.equal(model.chartSamples.length, 3)
  assert.deepEqual(model.chartSamples.map(item => item.sampleIndex), [0, 1, 2])
})

test('empty input produces a safe empty model', () => {
  assert.deepEqual(buildDrivingDynamicsTimeline([]), {
    samples: [],
    chartSamples: [],
    startTime: 0,
    endTime: 0,
    durationSeconds: 0,
    maxSpeedKmh: 0,
    gearChanges: [],
  })
})

test('gear labels distinguish reverse, neutral, manual and automatic drive', () => {
  assert.equal(dynamicsGearLabel({ gear: -1, automatic: false }), 'R')
  assert.equal(dynamicsGearLabel({ gear: 0, automatic: false }), 'N')
  assert.equal(dynamicsGearLabel({ gear: 4, automatic: false }), '4')
  assert.equal(dynamicsGearLabel({ gear: 1, automatic: true }), 'D')
})


function eventSample(
  t: number,
  overrides: Partial<DrivingDynamicsEventSample> = {},
): DrivingDynamicsEventSample {
  return {
    t,
    project: 'subject3',
    speed: 8,
    gear: 2,
    automatic: false,
    throttle: 0.5,
    brake: 0,
    ...overrides,
  }
}

test('generic timeline model preserves defensive-driving evidence fields', () => {
  const model = buildDrivingDynamicsTimeline([
    eventSample(0, {
      leadScenario: 'sudden-brake',
      leadVehicleId: 'lead-a',
      cutInHazardId: 'cut-a',
      pedestrianHazardId: 'ped-a',
    }),
    eventSample(0.2),
  ])

  assert.equal(model.samples[0].leadScenario, 'sudden-brake')
  assert.equal(model.samples[0].leadVehicleId, 'lead-a')
  assert.equal(model.samples[0].cutInHazardId, 'cut-a')
  assert.equal(model.samples[0].pedestrianHazardId, 'ped-a')
})

test('dynamics event markers reuse the three coaching evidence moments', () => {
  const samples: DrivingDynamicsEventSample[] = [
    eventSample(0, {
      leadScenario: 'sudden-brake',
      leadVehicleId: 'lead-a',
      leadSpeedMps: 12,
      leadTimeGapSeconds: 2.5,
      leadGapMeters: 20,
      leadTimeToCollisionSeconds: 4.5,
    }),
    eventSample(0.2, {
      leadScenario: 'sudden-brake',
      leadVehicleId: 'lead-a',
      leadSpeedMps: 10.8,
      leadTimeGapSeconds: 2.2,
      leadGapMeters: 17,
      leadTimeToCollisionSeconds: 3.5,
    }),
    eventSample(0.4, {
      leadScenario: 'sudden-brake',
      leadVehicleId: 'lead-a',
      leadSpeedMps: 9.6,
      leadTimeGapSeconds: 1.8,
      leadGapMeters: 14,
      leadTimeToCollisionSeconds: 2.7,
    }),
    eventSample(5, {
      cutInHazardId: 'cut-a',
      cutInConflict: false,
      cutInProgressDeltaMeters: 20,
      cutInLateralDeltaMeters: 2,
    }),
    eventSample(5.2, {
      cutInHazardId: 'cut-a',
      cutInConflict: true,
      cutInProgressDeltaMeters: 15,
      cutInLateralDeltaMeters: 1.2,
    }),
    eventSample(5.4, {
      cutInHazardId: 'cut-a',
      cutInConflict: true,
      cutInProgressDeltaMeters: 9,
      cutInLateralDeltaMeters: 0.5,
    }),
    eventSample(10, {
      pedestrianHazardId: 'ped-a',
      pedestrianConflict: false,
      pedestrianProgressDeltaMeters: 24,
      pedestrianLateralDeltaMeters: 1.6,
      pedestrianPlanarDistanceMeters: 24.1,
    }),
    eventSample(10.2, {
      pedestrianHazardId: 'ped-a',
      pedestrianConflict: true,
      pedestrianProgressDeltaMeters: 18,
      pedestrianLateralDeltaMeters: 0.9,
      pedestrianPlanarDistanceMeters: 18,
    }),
    eventSample(10.4, {
      pedestrianHazardId: 'ped-a',
      pedestrianConflict: true,
      pedestrianProgressDeltaMeters: 12,
      pedestrianLateralDeltaMeters: 0.3,
      pedestrianPlanarDistanceMeters: 12,
    }),
  ]

  const markers = buildDrivingDynamicsEventMarkers(samples)

  assert.deepEqual(
    markers.map(marker => ({
      kind: marker.kind,
      label: marker.label,
      t: marker.t,
      sampleIndex: marker.sampleIndex,
      project: marker.project,
    })),
    [
      {
        kind: 'sudden-brake',
        label: '前车急刹',
        t: 0.4,
        sampleIndex: 2,
        project: 'subject3',
      },
      {
        kind: 'cut-in',
        label: '电动车加塞',
        t: 5.4,
        sampleIndex: 5,
        project: 'subject3',
      },
      {
        kind: 'pedestrian',
        label: '行人横穿',
        t: 10.4,
        sampleIndex: 8,
        project: 'subject3',
      },
    ],
  )

  assert.deepEqual(markers.map(marker => marker.id), [
    drivingDynamicsEventId('sudden-brake', 'lead-a', 0.2),
    drivingDynamicsEventId('cut-in', 'cut-a', 5.2),
    drivingDynamicsEventId('pedestrian', 'ped-a', 10.2),
  ])
})

test('defensive event identity is stable to millisecond trigger precision', () => {
  assert.equal(
    drivingDynamicsEventId('cut-in', 'scooter-a', 12.34549),
    'cut-in:scooter-a:12.345',
  )
  assert.equal(
    drivingDynamicsEventId('cut-in', 'scooter-a', 12.34551),
    'cut-in:scooter-a:12.346',
  )
})

test('dynamics event markers stay empty when coaching reports have no analyzable event', () => {
  const markers = buildDrivingDynamicsEventMarkers([
    eventSample(0),
    eventSample(0.2),
  ])

  assert.deepEqual(markers, [])
})
