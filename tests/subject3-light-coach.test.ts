import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  applySubject3LightCoachAction,
  subject3LightCoachSequence,
} from '../src/coach/subject3LightCoach'
import {
  createNightLightAttempt,
  nightLightAnswerSatisfied,
  observeNightLightState,
  type NightLightAnswer,
} from '../src/subject3/nightLightExam'

function runCoachAnswer(
  answer: NightLightAnswer,
  initial = { lowBeam: false, highBeam: false },
) {
  const vehicle = { ...initial }
  const attempt = createNightLightAttempt()
  const sequence = subject3LightCoachSequence(answer, vehicle)

  for (const action of sequence) {
    applySubject3LightCoachAction(vehicle, attempt, action)
    observeNightLightState(attempt, vehicle)
  }

  return { vehicle, attempt, sequence }
}

test('coach near-beam preflight still requires one real recorded action', () => {
  const { vehicle, attempt, sequence } = runCoachAnswer('low')

  assert.equal(sequence.length, 1)
  assert.equal(sequence[0]!.control, 'low-toggle')
  assert.equal(attempt.actionCount, 1)
  assert.equal(vehicle.lowBeam, true)
  assert.equal(vehicle.highBeam, false)
  assert.equal(
    nightLightAnswerSatisfied('low', attempt, vehicle),
    true,
  )
})

test('near-beam prompt performs two real L toggles when low beam is already on', () => {
  const { vehicle, attempt, sequence } = runCoachAnswer(
    'low',
    { lowBeam: true, highBeam: false },
  )

  assert.deepEqual(
    sequence.map(action => action.control),
    ['low-toggle', 'low-toggle'],
  )
  assert.equal(attempt.actionCount, 2)
  assert.equal(vehicle.lowBeam, true)
  assert.equal(vehicle.highBeam, false)
  assert.equal(
    nightLightAnswerSatisfied('low', attempt, vehicle),
    true,
  )
})

test('near-beam prompt closes an existing high beam with the real K toggle', () => {
  const { vehicle, attempt, sequence } = runCoachAnswer(
    'low',
    { lowBeam: true, highBeam: true },
  )

  assert.deepEqual(
    sequence.map(action => action.control),
    ['high-toggle'],
  )
  assert.equal(vehicle.lowBeam, true)
  assert.equal(vehicle.highBeam, false)
  assert.equal(
    nightLightAnswerSatisfied('low', attempt, vehicle),
    true,
  )
})

test('coach flash preflight mirrors K on then K off and returns to low beam', () => {
  const { vehicle, attempt, sequence } = runCoachAnswer('flash')

  assert.deepEqual(
    sequence.map(action => action.control),
    ['high-toggle', 'high-toggle'],
  )
  assert.equal(attempt.actionCount, 2)
  assert.equal(attempt.sawHighBeam, true)
  assert.equal(attempt.sawLowBeamAfterHigh, true)
  assert.equal(vehicle.lowBeam, true)
  assert.equal(vehicle.highBeam, false)
  assert.equal(
    nightLightAnswerSatisfied('flash', attempt, vehicle),
    true,
  )
})

test('flash prompt first clears a pre-existing high beam before starting a fresh flash attempt', () => {
  const { vehicle, attempt, sequence } = runCoachAnswer(
    'flash',
    { lowBeam: true, highBeam: true },
  )

  assert.deepEqual(
    sequence.map(action => action.control),
    ['high-toggle', 'high-toggle', 'high-toggle'],
  )
  assert.equal(attempt.actionCount, 3)
  assert.equal(attempt.sawHighBeam, true)
  assert.equal(attempt.sawLowBeamAfterHigh, true)
  assert.equal(vehicle.lowBeam, true)
  assert.equal(vehicle.highBeam, false)
  assert.equal(
    nightLightAnswerSatisfied('flash', attempt, vehicle),
    true,
  )
})

const lightTestSource = readFileSync(
  new URL('../src/subject3/NightLightTest.tsx', import.meta.url),
  'utf8',
)
const appSource = readFileSync(
  new URL('../src/App.tsx', import.meta.url),
  'utf8',
)

test('light preflight coach goes through NightLightTest instead of bypassing it', () => {
  assert.match(lightTestSource, /subject3LightCoachSequence/)
  assert.match(lightTestSource, /applySubject3LightCoachAction/)
  assert.match(lightTestSource, /nightLightAnswerSatisfied/)
  assert.match(lightTestSource, /recordNightLightAction/)
  assert.match(lightTestSource, /coachActive/)
  assert.match(appSource, /coachActive=\{coachActive\}/)
  assert.match(appSource, /onCoachStatus=\{setCoachStatus\}/)
  assert.match(
    appSource,
    /drivingReady && activeExamId === 'subject3' && !lightTestDone/,
  )
  assert.doesNotMatch(appSource, /coachActive.*setLightTestDone\(true\)/)
})

test('Subject 3 coach button is available before daytime light preflight completes', () => {
  assert.match(
    appSource,
    /const coachSupported = activeExamId === 'subject3'\s*\? true/,
  )
})
