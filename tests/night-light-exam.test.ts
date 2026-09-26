import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createNightLightAttempt,
  nightLightAnswerSatisfied,
  observeNightLightState,
  recordNightLightAction,
} from '../src/subject3/nightLightExam'

const low = { lowBeam: true, highBeam: false }
const high = { lowBeam: true, highBeam: true }
const dark = { lowBeam: false, highBeam: false }

test('low-beam prompt requires an operator action and a final low-beam state', () => {
  const attempt = createNightLightAttempt()
  observeNightLightState(attempt, low)
  assert.equal(nightLightAnswerSatisfied('low', attempt, low), false)

  recordNightLightAction(attempt)
  observeNightLightState(attempt, low)
  assert.equal(nightLightAnswerSatisfied('low', attempt, low), true)
  assert.equal(nightLightAnswerSatisfied('low', attempt, high), false)
  assert.equal(nightLightAnswerSatisfied('low', attempt, dark), false)
})

test('flash prompt cannot be satisfied by pressing low-beam controls twice', () => {
  const attempt = createNightLightAttempt()

  recordNightLightAction(attempt)
  observeNightLightState(attempt, dark)
  recordNightLightAction(attempt)
  observeNightLightState(attempt, low)

  assert.equal(attempt.actionCount, 2)
  assert.equal(attempt.sawHighBeam, false)
  assert.equal(nightLightAnswerSatisfied('flash', attempt, low), false)
})

test('flash prompt requires observing high beam followed by a return to low beam', () => {
  const attempt = createNightLightAttempt()

  recordNightLightAction(attempt)
  observeNightLightState(attempt, high)
  assert.equal(attempt.sawHighBeam, true)
  assert.equal(nightLightAnswerSatisfied('flash', attempt, high), false)

  recordNightLightAction(attempt)
  observeNightLightState(attempt, low)

  assert.equal(attempt.sawLowBeamAfterHigh, true)
  assert.equal(nightLightAnswerSatisfied('flash', attempt, low), true)
})

test('ending with high beam still fails a flash prompt', () => {
  const attempt = createNightLightAttempt()

  recordNightLightAction(attempt)
  observeNightLightState(attempt, high)
  recordNightLightAction(attempt)
  observeNightLightState(attempt, low)
  recordNightLightAction(attempt)
  observeNightLightState(attempt, high)

  assert.equal(attempt.sawHighBeam, true)
  assert.equal(attempt.sawLowBeamAfterHigh, true)
  assert.equal(nightLightAnswerSatisfied('flash', attempt, high), false)
})

test('each prompt gets a fresh light attempt state', () => {
  const first = createNightLightAttempt()
  recordNightLightAction(first)
  observeNightLightState(first, high)

  const second = createNightLightAttempt()
  assert.deepEqual(second, {
    actionCount: 0,
    sawHighBeam: false,
    sawLowBeamAfterHigh: false,
  })
})
