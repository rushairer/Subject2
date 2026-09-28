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

function runCoachAnswer(answer: NightLightAnswer) {
  const vehicle = { lowBeam: false, highBeam: false }
  const attempt = createNightLightAttempt()
  const sequence = subject3LightCoachSequence(answer)

  for (const action of sequence) {
    applySubject3LightCoachAction(vehicle, attempt, action)
    observeNightLightState(attempt, vehicle)
  }

  return { vehicle, attempt, sequence }
}

test('coach near-beam preflight still requires one real recorded action', () => {
  const { vehicle, attempt, sequence } = runCoachAnswer('low')

  assert.equal(sequence.length, 1)
  assert.equal(attempt.actionCount, 1)
  assert.equal(vehicle.lowBeam, true)
  assert.equal(vehicle.highBeam, false)
  assert.equal(
    nightLightAnswerSatisfied('low', attempt, vehicle),
    true,
  )
})

test('coach flash preflight performs high beam then returns to low beam', () => {
  const { vehicle, attempt, sequence } = runCoachAnswer('flash')

  assert.equal(sequence.length, 2)
  assert.equal(sequence[0]!.highBeam, true)
  assert.equal(sequence[1]!.lowBeam, true)
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
  assert.doesNotMatch(appSource, /coachActive.*setLightTestDone\(true\)/)
})

test('Subject 3 coach button is available before daytime light preflight completes', () => {
  assert.match(
    appSource,
    /const coachSupported = activeExamId === 'subject3'\s*\? true/,
  )
})
