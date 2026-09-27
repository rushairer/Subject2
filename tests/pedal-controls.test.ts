import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createPedalControlsState,
  resetPedalControls,
  stepPedalControls,
  PEDAL_CONFIG,
} from '../src/input/pedalControls'

test('throttle leaves time for light corrections, deepens on hold, and releases promptly', () => {
  const state = createPedalControlsState()
  const dt = 0.05

  // First tap frame
  const initial = stepPedalControls(state, {
    throttleKey: true,
    brakeKey: false,
    clutchFloorKey: false,
    clutchBiteKey: false,
    automatic: false,
    speed: 0,
    gear: 1,
    dt,
  })

  assert.equal(initial.throttle, PEDAL_CONFIG.tapThrottle)

  // A deliberate half-second press must still be light, not already full power.
  let finalThrottle = 0
  for (let i = 0; i < 9; i++) {
    finalThrottle = stepPedalControls(state, {
      throttleKey: true,
      brakeKey: false,
      clutchFloorKey: false,
      clutchBiteKey: false,
      automatic: false,
      speed: 10,
      gear: 2,
      dt,
    }).throttle
  }

  assert.ok(finalThrottle >= 0.15 && finalThrottle < 0.3)

  const input = {
    throttleKey: true, brakeKey: false, clutchFloorKey: false, clutchBiteKey: false,
    automatic: false, speed: 10, gear: 2, dt,
  }
  let previous = finalThrottle
  for (let i = 0; i < 24; i++) {
    finalThrottle = stepPedalControls(state, input).throttle
    assert.ok(finalThrottle >= previous && finalThrottle <= 1)
    previous = finalThrottle
  }
  assert.equal(finalThrottle, 1)

  // Release throttle
  const released = stepPedalControls(state, {
    throttleKey: false,
    brakeKey: false,
    clutchFloorKey: false,
    clutchBiteKey: false,
    automatic: false,
    speed: 10,
    gear: 2,
    dt,
  })
  assert.ok(released.throttle > 0 && released.throttle < 1)
  for (let i = 0; i < 6; i++) stepPedalControls(state, { ...input, throttleKey: false })
  assert.equal(state.throttle, 0)
})

test('braking and input reset immediately cancel residual throttle', () => {
  const state = createPedalControlsState()
  const input = {
    throttleKey: true, brakeKey: false, clutchFloorKey: false, clutchBiteKey: false,
    automatic: true, speed: 5, gear: 1, dt: 0.05,
  }
  for (let i = 0; i < 40; i++) stepPedalControls(state, input)
  assert.equal(stepPedalControls(state, { ...input, brakeKey: true }).throttle, 0)
  assert.equal(stepPedalControls(state, input).throttle, PEDAL_CONFIG.tapThrottle)
  resetPedalControls(state)
  assert.equal(stepPedalControls(state, { ...input, throttleKey: false }).throttle, 0)
})

test('repressing during release does not snap the pedal down to its initial opening', () => {
  const state = createPedalControlsState()
  const input = {
    throttleKey: true, brakeKey: false, clutchFloorKey: false, clutchBiteKey: false,
    automatic: true, speed: 5, gear: 1, dt: 0.05,
  }
  for (let i = 0; i < 40; i++) stepPedalControls(state, input)
  const release = stepPedalControls(state, { ...input, throttleKey: false }).throttle
  assert.equal(stepPedalControls(state, input).throttle, release)
})

test('progressive brake provides gentle deceleration on tap and full brake on hold', () => {
  const state = createPedalControlsState()
  const dt = 0.05

  const initial = stepPedalControls(state, {
    throttleKey: false,
    brakeKey: true,
    clutchFloorKey: false,
    clutchBiteKey: false,
    automatic: false,
    speed: 10,
    gear: 3,
    dt,
  })

  assert.equal(initial.brake, PEDAL_CONFIG.normalTapBrake)

  let fullBrake = 0
  for (let t = 0; t < 0.5; t += dt) {
    fullBrake = stepPedalControls(state, {
      throttleKey: false,
      brakeKey: true,
      clutchFloorKey: false,
      clutchBiteKey: false,
      automatic: false,
      speed: 10,
      gear: 3,
      dt,
    }).brake
  }

  assert.equal(fullBrake, 1.0)
})

test('low-speed C2 automatic uses softer brake modulation for smooth crawling and parking', () => {
  const state = createPedalControlsState()
  const dt = 0.05

  // C2 automatic creeping at 1.5 m/s (~5.4 km/h) in gear 1 (D)
  const initial = stepPedalControls(state, {
    throttleKey: false,
    brakeKey: true,
    clutchFloorKey: false,
    clutchBiteKey: false,
    automatic: true,
    speed: 1.5,
    gear: 1,
    dt,
  })

  assert.equal(initial.brake, PEDAL_CONFIG.autoCreepTapBrake)
  assert.ok(initial.brake < PEDAL_CONFIG.normalTapBrake)
})

test('double-tap on brake activates instant 100% emergency brake', () => {
  const state = createPedalControlsState()
  const dt = 0.05

  // First tap and release
  stepPedalControls(state, {
    throttleKey: false,
    brakeKey: true,
    clutchFloorKey: false,
    clutchBiteKey: false,
    automatic: false,
    speed: 10,
    gear: 3,
    dt,
  })
  stepPedalControls(state, {
    throttleKey: false,
    brakeKey: false,
    clutchFloorKey: false,
    clutchBiteKey: false,
    automatic: false,
    speed: 10,
    gear: 3,
    dt,
  })

  // Quick second press (within double-tap window)
  const emergency = stepPedalControls(state, {
    throttleKey: false,
    brakeKey: true,
    clutchFloorKey: false,
    clutchBiteKey: false,
    automatic: false,
    speed: 10,
    gear: 3,
    dt,
  })

  assert.equal(emergency.brake, 1.0)
})

test('half-linkage latch allows relaxed Subject 2 cruising and cancels cleanly', () => {
  const state = createPedalControlsState()
  const dt = 0.05

  // 1. Press Shift once to latch
  const latched = stepPedalControls(state, {
    throttleKey: false,
    brakeKey: false,
    clutchFloorKey: false,
    clutchBiteKey: true,
    automatic: false,
    speed: 1.0,
    gear: 1,
    dt,
  })
  assert.equal(latched.biteLatched, true)
  assert.ok(Math.abs(latched.clutch - PEDAL_CONFIG.baseBitePosition) < 1e-4)

  // 2. Release Shift: clutch remains latched at bite point without holding key
  const cruising = stepPedalControls(state, {
    throttleKey: false,
    brakeKey: false,
    clutchFloorKey: false,
    clutchBiteKey: false,
    automatic: false,
    speed: 1.2,
    gear: 1,
    dt,
  })
  assert.equal(cruising.biteLatched, true)
  assert.ok(Math.abs(cruising.clutch - PEDAL_CONFIG.baseBitePosition) < 1e-4)

  // 3. Pressing C to floor cancels latch
  const floor = stepPedalControls(state, {
    throttleKey: false,
    brakeKey: false,
    clutchFloorKey: true,
    clutchBiteKey: false,
    automatic: false,
    speed: 1.2,
    gear: 1,
    dt,
  })
  assert.equal(floor.biteLatched, false)
  assert.equal(floor.clutch, 1.0)

  // 4. Releasing C leaves clutch engaged with latch disengaged
  const normal = stepPedalControls(state, {
    throttleKey: false,
    brakeKey: false,
    clutchFloorKey: false,
    clutchBiteKey: false,
    automatic: false,
    speed: 1.2,
    gear: 1,
    dt,
  })
  assert.equal(normal.biteLatched, false)
  assert.equal(normal.clutch, 0)
})

test('automatic transmission always zeroes clutch and disables bite latch', () => {
  const state = createPedalControlsState()
  const result = stepPedalControls(state, {
    throttleKey: false,
    brakeKey: false,
    clutchFloorKey: true,
    clutchBiteKey: true,
    automatic: true,
    speed: 5.0,
    gear: 1,
    dt: 0.05,
  })
  assert.equal(result.clutch, 0)
  assert.equal(result.biteLatched, false)
})
