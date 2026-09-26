import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createKeyboardSteeringState,
  resetKeyboardSteering,
  calculateSpeedSensitivity,
  stepKeyboardSteer,
  KEYBOARD_STEERING_CONFIG,
} from '../src/input/keyboardSteering'

test('speed sensitivity preserves 100% rate at low speeds and attenuates at highway speeds', () => {
  // Low speed (Subject 2 parking: 0 - 10 km/h)
  assert.equal(calculateSpeedSensitivity(0), 1.0)
  assert.equal(calculateSpeedSensitivity(10 / 3.6), 1.0)
  assert.equal(calculateSpeedSensitivity(5 / 3.6), 1.0)

  // High speed (Subject 3: 45+ km/h)
  assert.equal(calculateSpeedSensitivity(45 / 3.6), KEYBOARD_STEERING_CONFIG.highSpeedRateFactor)
  assert.equal(calculateSpeedSensitivity(60 / 3.6), KEYBOARD_STEERING_CONFIG.highSpeedRateFactor)

  // Intermediate speed is smoothly interpolated
  const midSensitivity = calculateSpeedSensitivity(27.5 / 3.6)
  assert.ok(midSensitivity < 1.0 && midSensitivity > KEYBOARD_STEERING_CONFIG.highSpeedRateFactor)
})

test('initial tap operates in the gentle micro-adjustment zone for fine straight tracking', () => {
  const state = createKeyboardSteeringState()
  const dt = 0.05
  // First tap frame
  const steer = stepKeyboardSteer(state, {
    left: false,
    right: true,
    currentAngle: 0,
    speed: 0,
    dt,
  })

  // Steer should equal tapRateFactor (0.22) * 1.0 (low speed factor)
  assert.ok(Math.abs(steer - KEYBOARD_STEERING_CONFIG.tapRateFactor) < 1e-4)
  assert.ok(state.holdTime > 0)
})

test('holding steering key ramps smoothly to full rate', () => {
  const state = createKeyboardSteeringState()
  const dt = 0.05

  // Step through 0.5s of holding right
  let lastSteer = 0
  for (let t = 0; t < 0.5; t += dt) {
    lastSteer = stepKeyboardSteer(state, {
      left: false,
      right: true,
      currentAngle: 0,
      speed: 0,
      dt,
    })
  }

  // At 0.5s (which exceeds rampDelay + rampUpDuration = 0.40s), steer should reach 1.0
  assert.equal(lastSteer, 1.0)
})

test('counter-steering back toward center provides immediate 100% responsiveness without tap lag', () => {
  const state = createKeyboardSteeringState()
  // Currently turned right (currentAngle = 1.0 rad), driver presses Left
  const steer = stepKeyboardSteer(state, {
    left: true,
    right: false,
    currentAngle: 1.0,
    speed: 0,
    dt: 0.05,
  })

  // Must immediately produce -1.0 (no 0.22 micro-zone lag when returning wheel to center)
  assert.equal(steer, -1.0)
})

test('counter-steering snaps cleanly to zero when step crosses center', () => {
  const state = createKeyboardSteeringState()
  const dt = 0.02
  const currentAngle = 0.05 // small right angle
  const steer = stepKeyboardSteer(state, {
    left: true,
    right: false,
    currentAngle,
    speed: 0,
    dt,
  })

  // Expected step = steer * baseRate * dt
  const step = steer * KEYBOARD_STEERING_CONFIG.baseRate * dt
  assert.ok(Math.abs(currentAngle + step) < 1e-9, 'must land exactly on 0')
})

test('dual-key press (A + D) triggers fast centering assist', () => {
  const state = createKeyboardSteeringState()
  const dt = 0.05
  const currentAngle = 1.5 // turned right

  const steer = stepKeyboardSteer(state, {
    left: true,
    right: true,
    currentAngle,
    speed: 0,
    dt,
  })

  // Steer must be negative (returning toward 0)
  assert.ok(steer < 0)
  assert.equal(steer, (-KEYBOARD_STEERING_CONFIG.dualKeyCenteringRate) / KEYBOARD_STEERING_CONFIG.baseRate)
})

test('caster self-centering holds angle at crawling speeds and returns wheel at road speeds', () => {
  const state = createKeyboardSteeringState()
  const currentAngle = 0.5

  // 1. Crawling speed (Subject 2: 1.0 m/s = 3.6 km/h) -> should NOT return (holds angle in S-curves)
  const steerCrawl = stepKeyboardSteer(state, {
    left: false,
    right: false,
    currentAngle,
    speed: 1.0,
    dt: 0.05,
  })
  assert.equal(steerCrawl, 0, 'angle must hold at Subject 2 crawling speeds')

  // 2. Reversing (negative speed) -> should NOT return
  const steerReverse = stepKeyboardSteer(state, {
    left: false,
    right: false,
    currentAngle,
    speed: -2.0,
    dt: 0.05,
  })
  assert.equal(steerReverse, 0, 'angle must hold when reversing')

  // 3. Road speed (Subject 3: 8.0 m/s = 28.8 km/h) -> returns toward center
  const steerRoad = stepKeyboardSteer(state, {
    left: false,
    right: false,
    currentAngle,
    speed: 8.0,
    dt: 0.05,
  })
  assert.ok(steerRoad < 0, 'must steer left toward center when angle is positive')

  // 4. Deadband snap: small angle within deadband snaps to exact 0
  const smallAngle = 0.01
  const steerSnap = stepKeyboardSteer(state, {
    left: false,
    right: false,
    currentAngle: smallAngle,
    speed: 8.0,
    dt: 0.05,
  })
  const snapDelta = steerSnap * KEYBOARD_STEERING_CONFIG.baseRate * 0.05
  assert.ok(Math.abs(smallAngle + snapDelta) < 1e-9, 'must snap small angle to exact 0')
})

test('switching direction resets hold ramp-up', () => {
  const state = createKeyboardSteeringState()
  // Hold right for 0.5s (reaches full speed)
  for (let t = 0; t < 0.5; t += 0.05) {
    stepKeyboardSteer(state, { left: false, right: true, currentAngle: 0, speed: 0, dt: 0.05 })
  }
  assert.ok(state.holdTime >= 0.5)

  // Switch to left from 0 angle
  const steerLeft = stepKeyboardSteer(state, { left: true, right: false, currentAngle: 0, speed: 0, dt: 0.05 })
  // Hold time should have reset for the new direction
  assert.ok(state.holdTime <= 0.06)
  assert.ok(Math.abs(steerLeft - (-KEYBOARD_STEERING_CONFIG.tapRateFactor)) < 1e-4)
})
