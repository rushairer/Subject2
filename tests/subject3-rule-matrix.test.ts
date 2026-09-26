import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  SUBJECT3_INFRACTION_RULES,
  SUBJECT3_RULE_LIMITS,
  subject3Infraction,
} from '../src/rules/subject3Rules'
import { passLineForExam } from '../src/session/sessionResult'

const expectedRules = {
  signal: { points: 100, fatal: true },
  signalLead: { points: 100, fatal: true },
  observationMinor: { points: 10, fatal: false },
  observationRequired: { points: 100, fatal: true },
  straightDirection: { points: 100, fatal: true },
  gearSkip: { points: 100, fatal: true },
  gearMinimum: { points: 100, fatal: true },
  gearDuration: { points: 10, fatal: false },
  speedFatal: { points: 100, fatal: true },
  speedMinor: { points: 10, fatal: false },
  parkingBrakeMinor: { points: 10, fatal: false },
  path: { points: 100, fatal: true },
  yield: { points: 100, fatal: true },
  pullOverStop: { points: 100, fatal: true },
  pullOverCrossLine: { points: 100, fatal: true },
  pullOverDistanceFail: { points: 100, fatal: true },
  pullOverDistanceMinor: { points: 10, fatal: false },
  roadBoundary: { points: 100, fatal: true },
  seatbelt: { points: 100, fatal: true },
  nightLightsOff: { points: 100, fatal: true },
  nightStartMinor: { points: 10, fatal: false },
  collision: { points: 100, fatal: true },
} as const

test('Subject 3 rule matrix preserves the validated scoring baseline', () => {
  assert.equal(SUBJECT3_RULE_LIMITS.passScore, 90)
  assert.deepEqual(SUBJECT3_INFRACTION_RULES, expectedRules)
})

test('Subject 3 infraction factory applies matrix severity without changing IDs or titles', () => {
  assert.deepEqual(
    subject3Infraction(
      'subject3-crosswalk-yield',
      '人行横道有行人通行时未停车礼让',
      'yield',
    ),
    {
      id: 'subject3-crosswalk-yield',
      title: '人行横道有行人通行时未停车礼让',
      points: 100,
      fatal: true,
    },
  )

  assert.deepEqual(
    subject3Infraction(
      'subject3-straight-1-observation',
      '直线行驶过程中未适时观察后方交通情况',
      'observationMinor',
    ),
    {
      id: 'subject3-straight-1-observation',
      title: '直线行驶过程中未适时观察后方交通情况',
      points: 10,
      fatal: false,
    },
  )
})

test('Subject 3 state machine contains no inline penalty severity literals', () => {
  const source = readFileSync(
    new URL('../src/subject3/Subject3Course.tsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /subject3Infraction/)
  assert.doesNotMatch(source, /\bpoints:\s*\d/)
  assert.doesNotMatch(source, /\bfatal:\s*(?:true|false)/)
})

test('Subject 3 pass line is sourced from the rule matrix', () => {
  assert.equal(passLineForExam('subject3'), SUBJECT3_RULE_LIMITS.passScore)
  assert.equal(passLineForExam('subject3'), 90)
})


test('App renderer loop no longer owns Subject 3 global penalties', () => {
  const source = readFileSync(
    new URL('../src/App.tsx', import.meta.url),
    'utf8',
  )

  assert.doesNotMatch(source, /session\.examId === 'subject3' \? 50/)
  assert.match(source, /if \(session\.examId !== 'subject3'\)/)
})
