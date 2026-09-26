import { DRIVING_RULES } from '../rules/drivingRules'

export interface KeyboardSteeringState {
  holdTime: number
  lastDirection: -1 | 0 | 1
}

export interface KeyboardSteeringInput {
  left: boolean
  right: boolean
  currentAngle: number
  speed: number // in m/s (vehicle.speed)
  dt: number
}

export const KEYBOARD_STEERING_CONFIG = {
  // Lock-to-lock limits and base turn rate
  maxAngle: DRIVING_RULES.steering.wheelTurnsLockToLock * Math.PI,
  baseRate: DRIVING_RULES.steering.wheelTurnsPerSecond * Math.PI * 2,

  // Hold ramp-up parameters
  tapRateFactor: 0.22,
  rampDelaySeconds: 0.12,
  rampUpDurationSeconds: 0.28,

  // Speed-sensitive steering parameters
  lowSpeedThresholdKmh: 10,
  highSpeedThresholdKmh: 45,
  highSpeedRateFactor: 0.42,

  // Caster self-centering parameters
  centeringSpeedThresholdMps: 1.5, // ~5.4 km/h
  centeringBaseRate: 1.8,
  centeringSpeedMultiplier: 0.35,
  centeringMaxRate: 6.0,
  centeringDeadband: 0.015,

  // Dual-key (A+D) centering assist
  dualKeyCenteringRate: 14.0,
} as const

export function createKeyboardSteeringState(): KeyboardSteeringState {
  return {
    holdTime: 0,
    lastDirection: 0,
  }
}

export function resetKeyboardSteering(state: KeyboardSteeringState) {
  state.holdTime = 0
  state.lastDirection = 0
}

/**
 * Calculates the speed-scaling factor for steering rate.
 * At low speeds (<=10 km/h, Subject 2 range), full responsiveness (1.0) is retained.
 * At higher road speeds (45+ km/h, Subject 3 range), sensitivity is reduced to 0.42 to prevent twitching/weaving.
 */
export function calculateSpeedSensitivity(speedMps: number): number {
  const speedKmh = Math.abs(speedMps) * 3.6
  const { lowSpeedThresholdKmh, highSpeedThresholdKmh, highSpeedRateFactor } = KEYBOARD_STEERING_CONFIG
  if (speedKmh <= lowSpeedThresholdKmh) return 1.0
  if (speedKmh >= highSpeedThresholdKmh) return highSpeedRateFactor
  const progress = (speedKmh - lowSpeedThresholdKmh) / (highSpeedThresholdKmh - lowSpeedThresholdKmh)
  return 1.0 - progress * (1.0 - highSpeedRateFactor)
}

/**
 * Calculates effective steering rate multiplier for keyboard driving.
 * Supports:
 * - Tap micro-adjustments for fine straight-line tracking
 * - Smooth progressive acceleration on hold for quick lock-to-lock maneuvers
 * - Instant responsive return when counter-steering back toward center
 * - Dual-key (A+D) snap-to-center assist
 * - Speed-sensitive attenuation at highway speeds
 * - Caster self-centering when driving forward without active steering inputs
 */
export function stepKeyboardSteer(
  state: KeyboardSteeringState,
  input: KeyboardSteeringInput,
): number {
  const { left, right, currentAngle, speed, dt } = input
  if (dt <= 0) return 0

  const {
    baseRate,
    tapRateFactor,
    rampDelaySeconds,
    rampUpDurationSeconds,
    centeringSpeedThresholdMps,
    centeringBaseRate,
    centeringSpeedMultiplier,
    centeringMaxRate,
    centeringDeadband,
    dualKeyCenteringRate,
  } = KEYBOARD_STEERING_CONFIG

  // 1. Dual-key press (both A and D held): active fast return to center
  if (left && right) {
    state.holdTime = 0
    state.lastDirection = 0
    if (Math.abs(currentAngle) < centeringDeadband) {
      return currentAngle === 0 ? 0 : -currentAngle / (baseRate * dt)
    }
    const maxStep = dualKeyCenteringRate * dt
    if (Math.abs(currentAngle) <= maxStep) {
      return -currentAngle / (baseRate * dt)
    }
    return (-Math.sign(currentAngle) * dualKeyCenteringRate) / baseRate
  }

  const desiredDirection: -1 | 0 | 1 = right ? 1 : left ? -1 : 0
  const speedFactor = calculateSpeedSensitivity(speed)

  // 2. Active single-direction steering input
  if (desiredDirection !== 0) {
    // 2A. Counter-steering back toward center:
    // When the driver steers opposite to the current turn (e.g. angle > 0 and turning left),
    // provide immediate full return speed without tap lag, and snap cleanly to 0 if crossing center.
    const isCounterSteering = desiredDirection * currentAngle < -0.01
    if (isCounterSteering) {
      state.holdTime = 0
      state.lastDirection = desiredDirection
      const effectiveRate = baseRate * speedFactor
      const step = desiredDirection * effectiveRate * dt
      // Snap to 0 if this step would cross or land on zero
      if (Math.sign(currentAngle) !== Math.sign(currentAngle + step)) {
        return -currentAngle / (baseRate * dt)
      }
      return (desiredDirection * effectiveRate) / baseRate
    }

    // 2B. Initiating a turn or increasing turn angle:
    if (state.lastDirection !== desiredDirection) {
      state.holdTime = 0
      state.lastDirection = desiredDirection
    }
    state.holdTime += dt

    let rampFactor = tapRateFactor
    if (state.holdTime > rampDelaySeconds) {
      const rampProgress = Math.min(1, (state.holdTime - rampDelaySeconds) / rampUpDurationSeconds)
      rampFactor = tapRateFactor + rampProgress * (1.0 - tapRateFactor)
    }

    return desiredDirection * rampFactor * speedFactor
  }

  // 3. No steering input (A/D released)
  state.holdTime = 0
  state.lastDirection = 0

  // If already within center deadband, ensure exact 0.0
  if (Math.abs(currentAngle) < centeringDeadband) {
    if (currentAngle !== 0) {
      return -currentAngle / (baseRate * dt)
    }
    return 0
  }

  // Caster self-centering: active only when vehicle moves forward above low-speed threshold.
  // When parked or crawling at Subject 2 creeping speeds (< 5.4 km/h), the steering angle holds.
  const forwardSpeed = speed
  if (forwardSpeed >= centeringSpeedThresholdMps) {
    const returnRate = Math.min(
      centeringMaxRate,
      centeringBaseRate + (forwardSpeed - centeringSpeedThresholdMps) * centeringSpeedMultiplier,
    )
    const maxStep = returnRate * dt
    if (Math.abs(currentAngle) <= maxStep) {
      return -currentAngle / (baseRate * dt)
    }
    return (-Math.sign(currentAngle) * returnRate) / baseRate
  }

  return 0
}
