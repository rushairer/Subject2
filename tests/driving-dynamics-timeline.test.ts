import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDrivingDynamicsTimeline,
  dynamicsGearLabel,
  type DrivingDynamicsSample,
} from '../src/replay/drivingDynamicsTimeline'

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
