import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDrivingDynamicsSingleEventSummary,
} from '../src/replay/drivingDynamicsSingleEventSummary'
import type {
  DrivingDynamicsEventContext,
} from '../src/replay/drivingDynamicsEventContext'
import type {
  DrivingDynamicsEventKind,
  DrivingDynamicsEventMarker,
} from '../src/replay/drivingDynamicsEvents'

function event(
  kind: DrivingDynamicsEventKind,
  overrides: Partial<DrivingDynamicsEventMarker> = {},
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
    id: `${kind}:demo`,
    kind,
    label,
    glyph,
    summary: '最近距离 4.2 m · 松油门 0.4 秒 · 制动反应 0.8 秒',
    t: 10.4,
    triggerTime: 10,
    project: 'subject3',
    sampleIndex: 0,
    speedKmh: 20,
    response: {},
    ...overrides,
  }
}

function context(
  overrides: Partial<DrivingDynamicsEventContext> = {},
): DrivingDynamicsEventContext {
  return {
    eventId: 'demo',
    triggerTime: 10,
    beforeCoverageSeconds: 3,
    afterCoverageSeconds: 3,
    windowSeconds: 3,
    speedScaleMaxKmh: 30,
    steeringScaleTurns: 0.5,
    triggerSample: {
      t: 10,
      relativeTime: 0,
      project: 'subject3',
      speedKmh: 20,
      throttlePercent: 20,
      brakePercent: 0,
      steeringTurns: 0,
    },
    samples: [
      {
        t: 10,
        relativeTime: 0,
        project: 'subject3',
        speedKmh: 20,
        throttlePercent: 20,
        brakePercent: 0,
        steeringTurns: 0,
      },
      {
        t: 12,
        relativeTime: 2,
        project: 'subject3',
        speedKmh: 8,
        throttlePercent: 0,
        brakePercent: 80,
        steeringTurns: 0.1,
      },
    ],
    ...overrides,
  }
}

test('single-event summary separates hazard facts from driver response and vehicle result', () => {
  const summary = buildDrivingDynamicsSingleEventSummary(
    event('cut-in', {
      response: {
        throttleReleaseSeconds: 0.4,
        brakeReactionSeconds: 0.8,
        maximumBrake: 0.8,
        maximumSteeringWheelChangeTurns: 0.12,
      },
    }),
    context(),
  )

  assert.deepEqual(summary.sections.map(item => item.title), [
    '发生了什么',
    '你做了什么',
    '车辆结果如何',
    '哪些证据缺失',
  ])
  assert.deepEqual(summary.sections[0].details, [
    '最近距离 4.2 m。',
  ])
  assert.deepEqual(summary.sections[1].details, [
    '触发后 0.4 秒记录到松油门。',
    '触发后 0.8 秒记录到开始制动。',
    '记录到方向盘变化 0.12 圈。',
    '分析窗口内最大制动输入 80%。',
  ])
  assert.deepEqual(summary.sections[2].details, [
    '触发附近最近速度采样为 20.0 km/h。',
    '触发后最多 3 秒内最低记录车速为 8.0 km/h。',
  ])
  assert.match(summary.sections[3].text, /核心证据均有记录/)
})

test('single-event summary only reports event-kind-relevant missing structured evidence', () => {
  const sudden = buildDrivingDynamicsSingleEventSummary(
    event('sudden-brake', {
      summary: '最小时距 1.2 秒 · 最近前车 6.4 m · 未记录到明显制动反应',
    }),
    context(),
  )
  assert.deepEqual(sudden.sections[3].details, [
    '未记录到明确的松油门时刻。',
    '未记录到明确的开始制动时刻。',
  ])
  assert.equal(
    sudden.sections[3].details.some(item => /停车|方向盘/.test(item)),
    false,
  )

  const cutIn = buildDrivingDynamicsSingleEventSummary(
    event('cut-in'),
    context(),
  )
  assert.ok(cutIn.sections[3].details.includes('未记录到结构化方向盘变化量。'))

  const pedestrian = buildDrivingDynamicsSingleEventSummary(
    event('pedestrian'),
    context(),
  )
  assert.ok(pedestrian.sections[3].details.includes('未记录到车辆停止时刻。'))
  assert.equal(
    pedestrian.sections[3].details.some(item => /结构化方向盘/.test(item)),
    false,
  )
})

test('single-event summary discloses truncated context and missing raw channels without inferring data', () => {
  const summary = buildDrivingDynamicsSingleEventSummary(
    event('cut-in', {
      response: {
        throttleReleaseSeconds: 0.4,
        brakeReactionSeconds: 0.8,
        maximumSteeringWheelChangeTurns: 0.1,
      },
    }),
    context({
      beforeCoverageSeconds: 0.8,
      afterCoverageSeconds: 1.4,
      triggerSample: {
        t: 10,
        relativeTime: 0,
        project: 'subject3',
        speedKmh: 20,
      },
      samples: [{
        t: 10,
        relativeTime: 0,
        project: 'subject3',
        speedKmh: 20,
      }],
    }),
  )

  assert.deepEqual(summary.sections[3].details, [
    '触发前轨迹仅覆盖 0.8 秒，少于计划的 3 秒。',
    '触发后轨迹仅覆盖 1.4 秒，少于计划的 3 秒。',
    '当前上下文没有油门连续采样。',
    '当前上下文没有制动连续采样。',
    '当前上下文没有方向盘连续采样。',
  ])
})

test('single-event summary keeps analyzer stop evidence even when it is outside visible curve coverage', () => {
  const summary = buildDrivingDynamicsSingleEventSummary(
    event('pedestrian', {
      response: {
        throttleReleaseSeconds: 0.3,
        brakeReactionSeconds: 0.6,
        stopReactionSeconds: 3.8,
      },
    }),
    context({
      afterCoverageSeconds: 2.5,
    }),
  )

  assert.ok(summary.sections[2].details.some(item =>
    item === '分析器记录到触发后 3.8 秒车辆停止；该时刻超出当前可见曲线覆盖。',
  ))
})

test('single-event summary handles an empty same-project context explicitly', () => {
  const summary = buildDrivingDynamicsSingleEventSummary(
    event('pedestrian'),
    context({
      beforeCoverageSeconds: 0,
      afterCoverageSeconds: 0,
      triggerSample: null,
      samples: [],
    }),
  )

  assert.deepEqual(summary.sections[2].details, [
    '不补造缺失的速度或停车结果。',
  ])
  assert.ok(summary.sections[3].details.includes(
    '事件附近没有可用的同项目连续轨迹采样。',
  ))
})
