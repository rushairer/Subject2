import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDrivingDynamicsHazardInsights,
} from '../src/replay/drivingDynamicsHazardInsights'
import type {
  DrivingDynamicsHazardComparisonGroup,
} from '../src/replay/drivingDynamicsHazardComparison'

function group(
  items: DrivingDynamicsHazardComparisonGroup['items'],
): DrivingDynamicsHazardComparisonGroup {
  return {
    kind: 'pedestrian',
    label: '行人横穿',
    glyph: '人',
    items,
  }
}

function item(
  id: string,
  triggerTime: number,
  overrides: Partial<DrivingDynamicsHazardComparisonGroup['items'][number]> = {},
): DrivingDynamicsHazardComparisonGroup['items'][number] {
  return {
    id,
    kind: 'pedestrian',
    label: '行人横穿',
    glyph: '人',
    triggerTime,
    ...overrides,
  }
}

test('factual insights describe adjacent brake timing differences without ranking language', () => {
  const [result] = buildDrivingDynamicsHazardInsights([
    group([
      item('a', 10, { brakeReactionSeconds: 0.9 }),
      item('b', 20, { brakeReactionSeconds: 0.5 }),
      item('c', 30, { brakeReactionSeconds: 0.8 }),
    ]),
  ])

  assert.deepEqual(
    result.insights.map(insight => insight.text),
    [
      '第 2 次记录到开始制动比第 1 次早 0.4 秒。',
      '第 3 次记录到开始制动比第 2 次晚 0.3 秒。',
    ],
  )
  assert.equal(
    result.insights.some(insight =>
      /最好|最差|优秀|更好|更差|得分/.test(insight.text),
    ),
    false,
  )
})

test('factual insights describe missing analyzer evidence explicitly instead of treating it as zero', () => {
  const [result] = buildDrivingDynamicsHazardInsights([
    group([
      item('a', 10, {
        brakeReactionSeconds: 0.7,
        stopReactionSeconds: 1.8,
      }),
      item('b', 20, {
        brakeReactionSeconds: 0.5,
      }),
      item('c', 30, {
        brakeReactionSeconds: 0.6,
        stopReactionSeconds: 2.1,
      }),
    ]),
  ])

  assert.equal(
    result.insights[0].text,
    '3 次行人横穿中，2 次记录到车辆停止数据，1 次没有该项证据。',
  )
  assert.ok(result.insights.some(insight =>
    insight.text === '第 2 次没有记录到车辆停止数据；第 1 次记录为 1.8 秒。',
  ))
  assert.ok(result.insights.some(insight =>
    insight.text === '第 3 次记录到车辆停止 2.1 秒；第 2 次没有该项证据。',
  ))
})

test('factual insights ignore sub-threshold numerical noise but report meaningful speed and steering changes', () => {
  const comparison: DrivingDynamicsHazardComparisonGroup = {
    kind: 'cut-in',
    label: '电动车加塞',
    glyph: '切',
    items: [
      {
        id: 'a',
        kind: 'cut-in',
        label: '电动车加塞',
        glyph: '切',
        triggerTime: 10,
        triggerSpeedKmh: 20,
        minimumPostTriggerSpeedKmh: 12,
        steeringChangeTurns: 0.10,
      },
      {
        id: 'b',
        kind: 'cut-in',
        label: '电动车加塞',
        glyph: '切',
        triggerTime: 20,
        triggerSpeedKmh: 20.6,
        minimumPostTriggerSpeedKmh: 9,
        steeringChangeTurns: 0.16,
      },
    ],
  }

  const [result] = buildDrivingDynamicsHazardInsights([comparison])

  assert.deepEqual(
    result.insights.map(insight => insight.text),
    [
      '第 2 次触发后 ≤3 秒最低车速比第 1 次低 3.0 km/h。',
    ],
  )
})

test('factual insights stay empty when comparable evidence has no display-worthy difference', () => {
  const [result] = buildDrivingDynamicsHazardInsights([
    group([
      item('a', 10, {
        brakeReactionSeconds: 0.50,
        triggerSpeedKmh: 20.0,
      }),
      item('b', 20, {
        brakeReactionSeconds: 0.55,
        triggerSpeedKmh: 20.5,
      }),
    ]),
  ])

  assert.deepEqual(result.insights, [])
})

test('factual insights emit at most one reaction and one vehicle-state difference per adjacent event pair', () => {
  const [result] = buildDrivingDynamicsHazardInsights([
    group([
      item('a', 10, {
        brakeReactionSeconds: 1.0,
        throttleReleaseSeconds: 0.8,
        triggerSpeedKmh: 30,
        minimumPostTriggerSpeedKmh: 20,
      }),
      item('b', 20, {
        brakeReactionSeconds: 0.5,
        throttleReleaseSeconds: 0.3,
        triggerSpeedKmh: 25,
        minimumPostTriggerSpeedKmh: 10,
      }),
    ]),
  ])

  const pairInsights = result.insights.filter(insight =>
    insight.eventIds.length === 2 &&
    insight.eventIds[0] === 'a' &&
    insight.eventIds[1] === 'b',
  )

  assert.deepEqual(
    pairInsights.map(insight => insight.text),
    [
      '第 2 次记录到开始制动比第 1 次早 0.5 秒。',
      '第 2 次触发附近速度比第 1 次低 5.0 km/h。',
    ],
  )
})
