import assert from 'node:assert/strict'
import test from 'node:test'
import { sequentialDrivingGear } from '../src/input/drivingKeyboard'
import { createPedalControlsState, stepPedalControls } from '../src/input/pedalControls'
import { createKeyboardSteeringState, stepKeyboardSteer, KEYBOARD_STEERING_CONFIG } from '../src/input/keyboardSteering'
import { DRIVING_RULES } from '../src/rules/drivingRules'

test('sequential shifts respect manual bounds, neutral, explicit reverse and C2 exemption', () => {
  let gear = 0
  for (let i = 1; i <= DRIVING_RULES.manualTransmission.highestForwardGear; i++) {
    gear = sequentialDrivingGear(gear, 1, false)
    assert.equal(gear, i)
  }
  assert.equal(sequentialDrivingGear(gear, 1, false), gear)
  assert.equal(sequentialDrivingGear(2, -1, false), 1)
  assert.equal(sequentialDrivingGear(1, -1, false), 0)
  assert.equal(sequentialDrivingGear(0, -1, false), 0)
  assert.equal(sequentialDrivingGear(-1, 1, false), -1)
  assert.equal(sequentialDrivingGear(1, 1, true), 1)
})

test('dedicated center key returns either lock exactly to zero while stationary or reversing', () => {
  for (const speed of [0, -2, 10]) for (const sign of [-1, 1]) {
    let angle = sign * 5
    const state = createKeyboardSteeringState()
    for (let i = 0; i < 100; i++) {
      angle += stepKeyboardSteer(state, { center: true, left: false, right: false, currentAngle: angle, speed, dt: 0.02 }) * KEYBOARD_STEERING_CONFIG.baseRate * 0.02
      assert.ok(angle * sign >= -1e-12)
    }
    assert.equal(angle, 0)
  }
})

const pedalInput = { throttleKey: false, brakeKey: false, clutchFloorKey: false, clutchBiteKey: false, automatic: true, speed: 1, gear: 1, dt: 0.05 }
test('repeated low-speed brake taps stay gentle in forward and reverse', () => {
  for (const speed of [1, -1]) {
    const state = createPedalControlsState()
    for (let i = 0; i < 8; i++) {
      const output = stepPedalControls(state, { ...pedalInput, speed, brakeKey: true })
      assert.ok(output.brake < 0.3)
      stepPedalControls(state, { ...pedalInput, speed })
    }
  }
})
test('brake double-tap expires by simulation time even if frames execute instantly', () => {
  const state = createPedalControlsState()
  const input = { ...pedalInput, speed: 10 }
  stepPedalControls(state, { ...input, brakeKey: true })
  for (let i = 0; i < 10; i++) stepPedalControls(state, input)
  assert.ok(stepPedalControls(state, { ...input, brakeKey: true }).brake < 1)
})
test('braking takes priority over a held throttle, which restarts gently after brake release', () => {
  const state = createPedalControlsState()
  for (let i = 0; i < 20; i++) stepPedalControls(state, { ...pedalInput, throttleKey: true })
  assert.equal(stepPedalControls(state, { ...pedalInput, throttleKey: true, brakeKey: true }).throttle, 0)
  assert.ok(stepPedalControls(state, { ...pedalInput, throttleKey: true }).throttle < 0.3)
})
