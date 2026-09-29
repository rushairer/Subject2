import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildCoachTeachingHint } from '../src/coach/coachTeaching'

function vehicle(overrides: Record<string, unknown> = {}) {
  return {
    speed: 1.5,
    gear: 1,
    steeringWheelAngle: 0,
    throttle: 0.18,
    brake: 0,
    clutch: 0,
    handbrake: false,
    leftIndicator: false,
    rightIndicator: false,
    lowBeam: false,
    highBeam: false,
    ...overrides,
  }
}

test('Subject 2 reverse-parking explanation stays tied to the actual coach action', () => {
  const hint = buildCoachTeachingHint({
    examId: 'reverse-parking',
    status: '第一次倒库 · 保持车身朝向并直线后倒到转向点',
    automatic: true,
    vehicle: vehicle({
      speed: -0.7,
      gear: -1,
      steeringWheelAngle: -Math.PI / 2,
    }),
  })

  assert.ok(hint)
  assert.match(hint.action, /第一次倒库/)
  assert.match(hint.reason, /后轮轨迹/)
  assert.match(hint.watch, /库角/)
  assert.match(hint.operation, /R 挡/)
  assert.match(hint.operation, /左打 0\.25 圈/)
})

test('Subject 3 light preflight explanation teaches the real lamp sequence', () => {
  const hint = buildCoachTeachingHint({
    examId: 'subject3',
    status: '灯光预检 · 夜间通过没有交通信号灯控制的路口 · 切换远光灯',
    automatic: true,
    vehicle: vehicle({
      lowBeam: true,
      highBeam: true,
    }),
  })

  assert.ok(hint)
  assert.match(hint.action, /灯光预检/)
  assert.match(hint.reason, /远光再切回近光/)
  assert.match(hint.watch, /最终回到近光/)
  assert.match(hint.operation, /远光灯/)
})

test('Subject 3 hazard explanations identify braking as a defensive response', () => {
  const hint = buildCoachTeachingHint({
    examId: 'subject3',
    status: '科目三示范 · 前车急刹，正在制动避让',
    automatic: true,
    vehicle: vehicle({
      speed: 4,
      throttle: 0,
      brake: 0.64,
    }),
  })

  assert.ok(hint)
  assert.equal(hint.action, '前车急刹，正在制动避让')
  assert.match(hint.reason, /安全纵向间距/)
  assert.match(hint.watch, /车距/)
  assert.match(hint.operation, /制动 64%/)
})

test('Subject 3 lane-change explanation preserves observation-signal-maneuver ordering', () => {
  const hint = buildCoachTeachingHint({
    examId: 'subject3',
    status: '科目三示范 · 变更车道',
    automatic: false,
    vehicle: vehicle({
      gear: 3,
      leftIndicator: true,
      clutch: 0.06,
      steeringWheelAngle: -Math.PI,
    }),
  })

  assert.ok(hint)
  assert.match(hint.reason, /观察 → 提前打灯 → 平缓横移/)
  assert.match(hint.watch, /左后方/)
  assert.match(hint.operation, /3 挡/)
  assert.match(hint.operation, /左转向灯/)
})

test('empty coach status produces no teaching card', () => {
  assert.equal(buildCoachTeachingHint({
    examId: 'curve-driving',
    status: '',
    automatic: true,
    vehicle: vehicle(),
  }), null)
})

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('live coach teaching remains a presentation layer in the HUD', () => {
  assert.match(app, /buildCoachTeachingHint/)
  assert.match(app, /aria-label="教练实时讲解"/)
  assert.match(app, /为什么这样做/)
  assert.match(app, /观察重点/)
  assert.doesNotMatch(app, /coachTeaching\.points/)
  assert.doesNotMatch(app, /coachTeaching\.fatal/)
})
