import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  SUBJECT2_INFRACTION_RULES,
  SUBJECT2_RULE_LIMITS,
  subject2Infraction,
} from '../src/rules/subject2Rules'
import { passLineForExam } from '../src/session/sessionResult'

const expectedRuleIds = [
  'reverse-before-first-control',
  'reverse-parking-timeout',
  'reverse-parking-body-out',
  'first-reverse-not-in-bay',
  'second-reverse-not-in-bay',
  'reverse-before-opposite-control',
  'reverse-parking-stop',
  'side-parking-timeout',
  'side-parking-line-contact',
  'side-parking-body-out-after-stop',
  'side-parking-exit-signal',
  'side-parking-stop',
  'slope-wheel-line',
  'slope-stop-longitudinal-fail',
  'slope-stop-longitudinal-10',
  'slope-right-gap-fail',
  'slope-right-gap-10',
  'slope-no-parking-brake',
  'slope-start-timeout',
  'slope-rollback-fail',
  'slope-rollback-10',
  'curve-wheel-line',
  'curve-reverse',
  'curve-stop',
  'right-angle-wheel-out',
  'right-angle-no-signal',
  'right-angle-signal-not-cancelled',
  'right-angle-stop',
] as const

test('Subject 2 rule matrix contains every current infraction exactly once', () => {
  const ids = Object.keys(SUBJECT2_INFRACTION_RULES)
  assert.deepEqual(ids, expectedRuleIds)
  assert.equal(new Set(ids).size, ids.length)

  const counts = Object.values(SUBJECT2_INFRACTION_RULES).reduce<Record<string, number>>((result, rule) => {
    result[rule.project] = (result[rule.project] ?? 0) + 1
    return result
  }, {})

  assert.deepEqual(counts, {
    'reverse-parking': 7,
    'side-parking': 5,
    'slope-start': 9,
    'curve-driving': 3,
    'right-angle': 4,
  })
})

test('Subject 2 rule limits preserve the validated baseline', () => {
  assert.equal(SUBJECT2_RULE_LIMITS.passScore, 80)
  assert.deepEqual(SUBJECT2_RULE_LIMITS.reverseParking, {
    timeLimitSeconds: 210,
    stopLimitSeconds: 2,
    parkedHoldSeconds: 0.35,
  })
  assert.deepEqual(SUBJECT2_RULE_LIMITS.sideParking, {
    timeLimitSeconds: 90,
    stopLimitSeconds: 2,
    parkedHoldSeconds: 0.35,
    bodyOutAfterStopHoldSeconds: 0.5,
  })
  assert.deepEqual(SUBJECT2_RULE_LIMITS.slopeStart, {
    stopHoldSeconds: 0.5,
    startLimitSeconds: 30,
    parkingBrakeCheckSeconds: 1.2,
    stopLongitudinalMinorMeters: 0.15,
    stopLongitudinalFatalMeters: 0.5,
    rightGapMinorMeters: 0.3,
    rightGapFatalMeters: 0.5,
    rollbackMinimumMeters: 0.02,
    rollbackFatalMeters: 0.3,
    rollbackEvaluateAfterForwardMeters: 0.35,
    measurementEpsilon: 1e-6,
  })
  assert.deepEqual(SUBJECT2_RULE_LIMITS.curveDriving, { stopLimitSeconds: 2 })
  assert.deepEqual(SUBJECT2_RULE_LIMITS.rightAngle, { stopLimitSeconds: 2 })
})

test('central infraction factory preserves fixed and sequenced IDs', () => {
  assert.deepEqual(subject2Infraction('slope-wheel-line'), {
    id: 'slope-wheel-line',
    title: '坡道行驶中车轮触轧道路边缘线',
    points: 100,
    fatal: true,
  })
  assert.deepEqual(subject2Infraction('right-angle-stop', 2), {
    id: 'right-angle-stop-2',
    title: '直角转弯中途停车超过 2 秒',
    points: 5,
  })
})

test('all rule-matrix entries are named by state-machine regression coverage', () => {
  const stateMachineTests = readFileSync(
    new URL('./subject2-state-machines.test.ts', import.meta.url),
    'utf8',
  )
  for (const id of expectedRuleIds) {
    assert.ok(stateMachineTests.includes(id), `missing regression reference for ${id}`)
  }
})

test('course judges source penalties from the central rule matrix', () => {
  const courses = [
    'ReverseParkingCourse.tsx',
    'SideParkingCourse.tsx',
    'SlopeStartCourse.tsx',
    'CurveDrivingCourse.tsx',
    'RightAngleCourse.tsx',
  ]

  for (const file of courses) {
    const source = readFileSync(new URL(`../src/subject2/${file}`, import.meta.url), 'utf8')
    assert.match(source, /subject2Infraction/)
    assert.doesNotMatch(source, /\bpoints:\s*\d/)
    assert.doesNotMatch(source, /\bfatal:\s*(?:true|false)/)
  }
})

test('session pass-line logic uses the shared Subject 2 baseline', () => {
  assert.equal(passLineForExam('reverse-parking'), 80)
  assert.equal(passLineForExam('subject2-exam'), 80)
  assert.equal(passLineForExam('subject3'), 90)
})
