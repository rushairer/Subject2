import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDrivingDynamicsEventContext,
} from '../src/replay/drivingDynamicsEventContext'
import {
  buildDrivingDynamicsReactionChain,
} from '../src/replay/drivingDynamicsReactionChain'
import type {
  DrivingDynamicsEventMarker,
  DrivingDynamicsEventSample,
} from '../src/replay/drivingDynamicsEvents'

function sample(
  t: number,
  overrides: Partial<DrivingDynamicsEventSample> = {},
): DrivingDynamicsEventSample {
  return {
    t,
    project: 'subject3',
    speed: 20 / 3.6,
    gear: 2,
    automatic: false,
    throttle: 0.5,
    brake: 0,
    steeringWheelAngle: 0,
    ...overrides,
  }
}

function event(
  overrides: Partial<DrivingDynamicsEventMarker> = {},
): DrivingDynamicsEventMarker {
  return {
    id: 'cut-in:demo:10.000',
    kind: 'cut-in',
    label: '电动车加塞',
    glyph: '切',
    summary: '测试事件',
    t: 10.5,
    triggerTime: 10,
    project: 'subject3',
    sampleIndex: 2,
    speedKmh: 18,
    response: {},
    ...overrides,
  }
}

test('reaction chain reuses analyzer response times and adds factual speed/steering evidence in time order', () => {
  const marker = event({
    response: {
      throttleReleaseSeconds: 0.4,
      brakeReactionSeconds: 0.8,
      maximumBrake: 0.8,
      maximumSteeringWheelChangeTurns: 0.12,
    },
  })
  const context = buildDrivingDynamicsEventContext([
    sample(9.8, { speed: 20 / 3.6, steeringWheelAngle: 0 }),
    sample(10, { speed: 20 / 3.6, throttle: 0.5, brake: 0, steeringWheelAngle: 0 }),
    sample(10.4, { speed: 19 / 3.6, throttle: 0.3, brake: 0, steeringWheelAngle: 0 }),
    sample(10.8, { speed: 17 / 3.6, throttle: 0.2, brake: 0.2, steeringWheelAngle: Math.PI * 0.2 }),
    sample(11.4, { speed: 12 / 3.6, throttle: 0, brake: 0.8, steeringWheelAngle: Math.PI * 0.24 }),
  ], marker)

  const chain = buildDrivingDynamicsReactionChain(context, marker)

  assert.deepEqual(
    chain.steps.map(step => ({
      kind: step.kind,
      time: Number(step.timeSeconds.toFixed(1)),
      label: step.label,
      source: step.source,
    })),
    [
      { kind: 'trigger', time: 0, label: '电动车加塞触发', source: 'trajectory' },
      { kind: 'throttle', time: 0.4, label: '松油门', source: 'analyzer' },
      { kind: 'brake', time: 0.8, label: '开始制动', source: 'analyzer' },
      { kind: 'speed', time: 1.4, label: '车速降至 12.0 km/h', source: 'trajectory' },
      { kind: 'steering', time: 1.4, label: '方向盘变化 0.12 圈', source: 'trajectory' },
    ],
  )
  assert.equal(
    chain.summary,
    '电动车加塞触发 → +0.4s 松油门 → +0.8s 开始制动 → +1.4s 车速降至 12.0 km/h → +1.4s 方向盘变化 0.12 圈',
  )
  assert.equal(chain.hasObservedResponse, true)
  assert.match(chain.steps[2].detail ?? '', /最大制动 80%/)
})

test('reaction chain uses analyzer stop evidence and avoids duplicate minimum-speed wording', () => {
  const marker = event({
    kind: 'pedestrian',
    label: '行人横穿',
    glyph: '人',
    response: {
      throttleReleaseSeconds: 0.2,
      brakeReactionSeconds: 0.5,
      stopReactionSeconds: 1.6,
      maximumBrake: 1,
    },
  })
  const context = buildDrivingDynamicsEventContext([
    sample(10, { speed: 15 / 3.6 }),
    sample(10.5, { speed: 10 / 3.6, brake: 0.4 }),
    sample(11.6, { speed: 0, brake: 1 }),
  ], marker)

  const chain = buildDrivingDynamicsReactionChain(context, marker)

  assert.deepEqual(chain.steps.map(step => step.kind), [
    'trigger',
    'throttle',
    'brake',
    'stop',
  ])
  assert.match(chain.summary, /\+1\.6s 车辆停止/)
  assert.equal(chain.steps.some(step => step.kind === 'speed'), false)
})

test('reaction chain does not invent reactions when analyzers and trajectory do not support them', () => {
  const marker = event()
  const context = buildDrivingDynamicsEventContext([
    sample(9.9, { speed: 20 / 3.6 }),
    sample(10, { speed: 20 / 3.6 }),
    sample(11, { speed: 20 / 3.6 }),
  ], marker)

  const chain = buildDrivingDynamicsReactionChain(context, marker)

  assert.deepEqual(chain.steps.map(step => step.kind), ['trigger'])
  assert.equal(chain.summary, '电动车加塞触发')
  assert.equal(chain.hasObservedResponse, false)
})

test('reaction chain ignores tiny speed and steering fluctuations used only as display noise', () => {
  const marker = event({
    response: {
      maximumSteeringWheelChangeTurns: 0.03,
    },
  })
  const context = buildDrivingDynamicsEventContext([
    sample(9.9, { speed: 20 / 3.6, steeringWheelAngle: 0 }),
    sample(10, { speed: 20 / 3.6, steeringWheelAngle: 0 }),
    sample(11, { speed: 19.6 / 3.6, steeringWheelAngle: Math.PI * 0.04 }),
  ], marker)

  const chain = buildDrivingDynamicsReactionChain(context, marker)

  assert.deepEqual(chain.steps.map(step => step.kind), ['trigger'])
})
