import assert from 'node:assert/strict'
import test from 'node:test'
import {
  replayDiagnosis,
  replayOperationSlice,
} from '../src/replay/replayDiagnosis'

const samples = [
  { t: 0, project: 'reverse-parking', speed: 0 },
  { t: 1.5, project: 'reverse-parking', speed: 1 },
  { t: 3, project: 'reverse-parking', speed: 2 },
  { t: 4.5, project: 'reverse-parking', speed: 3 },
  { t: 6, project: 'reverse-parking', speed: 4 },
  { t: 7.5, project: 'reverse-parking', speed: 5 },
  { t: 9, project: 'reverse-parking', speed: 6 },
  { t: 6, project: 'side-parking', speed: 99 },
]

test('replayOperationSlice returns actual same-project samples around the event', () => {
  const slice = replayOperationSlice(samples, 'reverse-parking', 4.5)
  assert.deepEqual(
    slice.map(item => [item.offsetSeconds, item.sample.t, item.sample.speed]),
    [
      [-3, 1.5, 1],
      [-1.5, 3, 2],
      [0, 4.5, 3],
      [1.5, 6, 4],
      [3, 7.5, 5],
    ],
  )
})

test('replayOperationSlice never fabricates unavailable before/after samples', () => {
  const atStart = replayOperationSlice(samples, 'reverse-parking', 0)
  assert.deepEqual(
    atStart.map(item => item.offsetSeconds),
    [0, 1.5, 3],
  )

  const nearEnd = replayOperationSlice(samples, 'reverse-parking', 7.5)
  assert.deepEqual(
    nearEnd.map(item => item.offsetSeconds),
    [-3, -1.5, 0, 1.5],
  )
})

test('replay diagnosis gives specific advice for known rule families', () => {
  assert.match(
    replayDiagnosis({
      id: 'slope-rollback-10',
      title: '坡道起步车辆发生后溜，距离不超过 30cm',
    }).advice,
    /驱动力|离合/,
  )

  assert.match(
    replayDiagnosis({
      id: 'subject3-left-turn-1-signal-lead',
      title: '左转弯前转向灯开启不足 3 秒',
    }).reason,
    /提前量/,
  )
})

test('replay diagnosis keeps an explicit conservative fallback', () => {
  const result = replayDiagnosis({ id: 'future-rule', title: '未来规则' })
  assert.match(result.reason, /系统在该时刻记录/)
  assert.match(result.advice, /前后 3 秒/)
})
