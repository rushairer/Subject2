import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SUBJECT2_NATIONAL_RULE_PROFILE,
  createSubject2RuleProfile,
} from '../src/rules/subject2RuleProfile'
import { SUBJECT2_RULE_LIMITS } from '../src/rules/subject2Rules'
import { passLineForExam } from '../src/session/sessionResult'
import {
  createSideParkingRuntime,
  updateSideParking,
} from '../src/subject2/SideParkingCourse'
import {
  createRightAngleRuntime,
  updateRightAngle,
} from '../src/subject2/RightAngleCourse'

function customProfile() {
  return createSubject2RuleProfile({
    id: 'test-venue',
    label: 'Test Venue',
    scope: 'venue',
    sourceNote: 'Regression fixture only.',
    overrides: {
      passScore: 85,
      sideParking: {
        timeLimitSeconds: 120,
      },
      rightAngle: {
        stopLimitSeconds: 3,
      },
      slopeStart: {
        rightGapMinorMeters: 0.35,
      },
    },
  })
}

test('national Subject 2 profile preserves the validated baseline', () => {
  assert.equal(SUBJECT2_NATIONAL_RULE_PROFILE.id, 'cn-national-baseline')
  assert.equal(SUBJECT2_NATIONAL_RULE_PROFILE.scope, 'national')
  assert.deepEqual(SUBJECT2_NATIONAL_RULE_PROFILE.limits, SUBJECT2_RULE_LIMITS)
})

test('rule profile overrides are isolated and do not mutate the national baseline', () => {
  const profile = customProfile()

  assert.equal(profile.limits.passScore, 85)
  assert.equal(profile.limits.sideParking.timeLimitSeconds, 120)
  assert.equal(profile.limits.sideParking.stopLimitSeconds, SUBJECT2_RULE_LIMITS.sideParking.stopLimitSeconds)
  assert.equal(profile.limits.slopeStart.rightGapMinorMeters, 0.35)

  assert.equal(SUBJECT2_RULE_LIMITS.passScore, 80)
  assert.equal(SUBJECT2_RULE_LIMITS.sideParking.timeLimitSeconds, 90)
  assert.equal(SUBJECT2_RULE_LIMITS.slopeStart.rightGapMinorMeters, 0.3)
})

test('rule profiles require provenance and valid ordered thresholds', () => {
  assert.throws(() => createSubject2RuleProfile({
    id: 'missing-source',
    label: 'Missing source',
    scope: 'venue',
    sourceNote: '   ',
  }), /sourceNote is required/)

  assert.throws(() => createSubject2RuleProfile({
    id: 'bad-score',
    label: 'Bad score',
    scope: 'local',
    sourceNote: 'Regression fixture only.',
    overrides: { passScore: 101 },
  }), /passScore/)

  assert.throws(() => createSubject2RuleProfile({
    id: 'bad-gap-band',
    label: 'Bad gap band',
    scope: 'venue',
    sourceNote: 'Regression fixture only.',
    overrides: {
      slopeStart: {
        rightGapMinorMeters: 0.6,
        rightGapFatalMeters: 0.5,
      },
    },
  }), /right-gap minor limit/)
})

test('course judges consume an injected profile while default behavior stays unchanged', () => {
  const profile = customProfile()
  const runtime = {
    ...createSideParkingRuntime(),
    phase: 'reverse' as const,
    entered: true,
    started: true,
    elapsed: 100,
  }
  const vehicle = {
    x: 0,
    z: 0,
    heading: 0,
    speed: -0.5,
    gear: -1,
    engineOn: true,
    leftIndicator: false,
  }

  const baseline = updateSideParking(vehicle, runtime, 0.1)
  assert.equal(baseline.infractions.some(item => item.id === 'side-parking-timeout'), true)

  const overridden = updateSideParking(vehicle, runtime, 0.1, profile)
  assert.equal(overridden.infractions.some(item => item.id === 'side-parking-timeout'), false)
  assert.match(overridden.status, /120s/)
})

test('profile stop thresholds and pass score are injectable without changing Subject 3', () => {
  const profile = customProfile()
  const vehicle = {
    x: 0,
    z: 0,
    heading: -0.2,
    speed: 0,
    engineOn: true,
    leftIndicator: true,
  }
  const runtime = {
    ...createRightAngleRuntime(),
    phase: 'turning' as const,
    entered: true,
  }

  const baseline = updateRightAngle(vehicle, runtime, 2.1)
  assert.equal(baseline.infractions.some(item => item.id.startsWith('right-angle-stop-')), true)

  const overridden = updateRightAngle(vehicle, runtime, 2.1, profile)
  assert.equal(overridden.infractions.some(item => item.id.startsWith('right-angle-stop-')), false)

  assert.equal(passLineForExam('subject2-exam', profile), 85)
  assert.equal(passLineForExam('subject3', profile), 90)
})
