import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildReplayTrainingFocus,
  replayHabitForInfraction,
} from '../src/replay/replayTrainingFocus'

test('replayHabitForInfraction maps rule families to one primary habit', () => {
  assert.equal(
    replayHabitForInfraction({ id: 'subject3-seatbelt', title: '未使用安全带', points: 100, fatal: true }),
    'safety-routine',
  )
  assert.equal(
    replayHabitForInfraction({ id: 'subject3-left-turn-1-signal-lead', title: '转向灯提前量不足', points: 100, fatal: true }),
    'observation-signal',
  )
  assert.equal(
    replayHabitForInfraction({ id: 'side-parking-line-contact-4', title: '车轮触碰边线', points: 10 }),
    'space-position',
  )
  assert.equal(
    replayHabitForInfraction({ id: 'subject3-crosswalk-yield', title: '未停车礼让', points: 100, fatal: true }),
    'hazard-response',
  )
})

test('training focus prioritizes fatal groups, then actual points and recurrence', () => {
  const focus = buildReplayTrainingFocus([
    { id: 'speed-control', title: '速度控制不当', points: 10, t: 5 },
    { id: 'reverse-parking-stop-1', title: '中途停车', points: 5, t: 7 },
    { id: 'side-parking-line-contact-1', title: '车轮触线', points: 10, t: 10 },
    { id: 'side-parking-line-contact-2', title: '再次触线', points: 10, t: 12 },
    { id: 'subject3-seatbelt', title: '未使用安全带', points: 100, fatal: true, t: 1 },
    { id: 'engine-stall-1', title: '发动机熄火', points: 10, t: 15 },
  ])

  assert.deepEqual(
    focus.map(item => item.id),
    ['safety-routine', 'space-position', 'speed-flow'],
  )
  assert.equal(focus[0].fatalCount, 1)
  assert.equal(focus[1].totalPoints, 20)
  assert.equal(focus[1].count, 2)
  assert.equal(focus.length, 3)
})

test('training focus uses the highest-severity event as the representative evidence', () => {
  const focus = buildReplayTrainingFocus([
    { id: 'right-angle-no-signal', title: '未打转向灯', points: 10, t: 4, project: 'right-angle' },
    { id: 'subject3-left-turn-signal', title: '左转前未正确使用转向灯', points: 100, fatal: true, t: 20, project: 'subject3' },
    { id: 'subject3-straight-observation', title: '未观察后方', points: 10, t: 12, project: 'subject3' },
  ])

  assert.equal(focus[0].id, 'observation-signal')
  assert.equal(focus[0].representative.id, 'subject3-left-turn-signal')
})

test('training focus remains deterministic for equal-severity groups and supports limits', () => {
  const focus = buildReplayTrainingFocus([
    { id: 'future-a', title: '项目 A', points: 10, t: 9 },
    { id: 'speed-control', title: '速度控制', points: 10, t: 3 },
    { id: 'engine-stall-1', title: '熄火', points: 10, t: 6 },
  ], 2)

  assert.deepEqual(
    focus.map(item => item.id),
    ['speed-flow', 'vehicle-control'],
  )
})

test('training focus returns empty output for clean sessions or disabled limit', () => {
  assert.deepEqual(buildReplayTrainingFocus([]), [])
  assert.deepEqual(
    buildReplayTrainingFocus([{ id: 'speed-control', title: '速度控制', points: 10 }], 0),
    [],
  )
})
