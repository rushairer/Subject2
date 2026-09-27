import assert from 'node:assert/strict'
import test from 'node:test'
import { DRIVING_RULES } from '../src/rules/drivingRules'
import {
  createTurnSignalAutoCancelState,
  stepTurnSignalAutoCancel,
} from '../src/input/turnSignalAutoCancel'

function step(
  state: ReturnType<typeof createTurnSignalAutoCancelState>,
  overrides: Partial<Parameters<typeof stepTurnSignalAutoCancel>[1]> = {},
) {
  return stepTurnSignalAutoCancel(state, {
    steeringWheelAngle: 0,
    leftIndicator: false,
    rightIndicator: false,
    hazard: false,
    ...overrides,
  })
}

test('small lane-change steering does not auto-cancel the active signal', () => {
  const state = createTurnSignalAutoCancelState()
  const arm = DRIVING_RULES.turnSignal.autoCancelArmWheelAngleRadians

  let output = step(state, {
    leftIndicator: true,
    steeringWheelAngle: -arm * 0.6,
  })
  assert.equal(output.leftIndicator, true)
  assert.equal(state.leftArmed, false)

  output = step(state, {
    leftIndicator: true,
    steeringWheelAngle: 0,
  })
  assert.equal(output.leftIndicator, true)
  assert.equal(state.leftArmed, false)
})

test('left signal arms on a real left turn and cancels after steering returns near center', () => {
  const state = createTurnSignalAutoCancelState()
  const arm = DRIVING_RULES.turnSignal.autoCancelArmWheelAngleRadians
  const returned = DRIVING_RULES.turnSignal.autoCancelReturnWheelAngleRadians * 0.5

  let output = step(state, {
    leftIndicator: true,
    steeringWheelAngle: -arm - 0.1,
  })
  assert.equal(output.leftIndicator, true)
  assert.equal(state.leftArmed, true)

  output = step(state, {
    leftIndicator: true,
    steeringWheelAngle: -arm * 0.7,
  })
  assert.equal(output.leftIndicator, true)
  assert.equal(state.leftArmed, true)

  output = step(state, {
    leftIndicator: true,
    steeringWheelAngle: -returned,
  })
  assert.equal(output.leftIndicator, false)
  assert.equal(state.leftArmed, false)
})

test('right signal arms on a real right turn and cancels after steering returns near center', () => {
  const state = createTurnSignalAutoCancelState()
  const arm = DRIVING_RULES.turnSignal.autoCancelArmWheelAngleRadians
  const returned = DRIVING_RULES.turnSignal.autoCancelReturnWheelAngleRadians * 0.5

  let output = step(state, {
    rightIndicator: true,
    steeringWheelAngle: arm + 0.1,
  })
  assert.equal(output.rightIndicator, true)
  assert.equal(state.rightArmed, true)

  output = step(state, {
    rightIndicator: true,
    steeringWheelAngle: returned,
  })
  assert.equal(output.rightIndicator, false)
  assert.equal(state.rightArmed, false)
})

test('hazard lights suppress and clear steering-column auto-cancel state', () => {
  const state = createTurnSignalAutoCancelState()
  const arm = DRIVING_RULES.turnSignal.autoCancelArmWheelAngleRadians

  step(state, {
    leftIndicator: true,
    steeringWheelAngle: -arm - 0.1,
  })
  assert.equal(state.leftArmed, true)

  let output = step(state, {
    leftIndicator: true,
    hazard: true,
    steeringWheelAngle: 0,
  })
  assert.equal(output.leftIndicator, true)
  assert.equal(state.leftArmed, false)
  assert.equal(state.rightArmed, false)

  output = step(state, {
    leftIndicator: true,
    steeringWheelAngle: 0,
  })
  assert.equal(output.leftIndicator, true)
})

test('switching signal direction clears the previous armed side', () => {
  const state = createTurnSignalAutoCancelState()
  const arm = DRIVING_RULES.turnSignal.autoCancelArmWheelAngleRadians

  step(state, {
    leftIndicator: true,
    steeringWheelAngle: -arm - 0.1,
  })
  assert.equal(state.leftArmed, true)

  const output = step(state, {
    rightIndicator: true,
    steeringWheelAngle: arm + 0.1,
  })
  assert.equal(output.rightIndicator, true)
  assert.equal(state.leftArmed, false)
  assert.equal(state.rightArmed, true)
})
