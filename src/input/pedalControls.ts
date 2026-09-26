import { DRIVING_RULES } from '../rules/drivingRules'

export interface PedalControlsState {
  throttleHoldTime: number
  brakeHoldTime: number
  lastBrakeReleaseTime: number
  isEmergencyBrake: boolean
  biteLatched: boolean
  biteOffset: number // Micro-adjustment to bite point: -0.1 to +0.1
}

export interface PedalControlsInput {
  throttleKey: boolean
  brakeKey: boolean
  clutchFloorKey: boolean
  clutchBiteKey: boolean
  automatic: boolean
  speed: number // m/s
  gear: number
  dt: number
}

export interface PedalControlsOutput {
  throttle: number
  brake: number
  clutch: number
  biteLatched: boolean
}

export const PEDAL_CONFIG = {
  // Throttle progression
  tapThrottle: 0.28,
  throttleRampDelay: 0.12, // Duration of the gentle micro-throttle zone
  throttleRampDuration: 0.32, // Duration to ramp from tapThrottle to 1.0

  // Brake progression
  normalTapBrake: 0.28,
  normalBrakeRampDelay: 0.14,
  normalBrakeRampDuration: 0.26,

  // Low-speed C2 automatic brake modulation (allows creeping at 3-5 km/h)
  autoCreepTapBrake: 0.20,
  autoCreepBrakeRampDelay: 0.25,
  autoCreepBrakeRampDuration: 0.25,

  // Double-tap emergency brake threshold (seconds)
  doubleTapBrakeWindow: 0.26,

  // Base bite point from rules
  baseBitePosition: DRIVING_RULES.manualTransmission.biteClutchPosition, // 0.52
  minBitePosition: 0.38,
  maxBitePosition: 0.64,
  biteAdjustStep: 0.03,
} as const

export function createPedalControlsState(): PedalControlsState {
  return {
    throttleHoldTime: 0,
    brakeHoldTime: 0,
    lastBrakeReleaseTime: -999,
    isEmergencyBrake: false,
    biteLatched: false,
    biteOffset: 0,
  }
}

export function resetPedalControls(state: PedalControlsState) {
  state.throttleHoldTime = 0
  state.brakeHoldTime = 0
  state.lastBrakeReleaseTime = -999
  state.isEmergencyBrake = false
  state.biteLatched = false
  state.biteOffset = 0
}

/**
 * Calculates smoothed, progressive throttle, brake and clutch values.
 * Features:
 * 1. Gentle initial throttle for smooth acceleration and steady cruising.
 * 2. Progressive braking with light deceleration on tap, full brake on hold,
 *    and instant 100% emergency brake on double-tap.
 * 3. Low-speed brake modulation for C2 automatic reverse/parking control.
 * 4. Half-linkage latch (C1 Shift cruise) with micro-adjustments via W/S.
 */
export function stepPedalControls(
  state: PedalControlsState,
  input: PedalControlsInput,
): PedalControlsOutput {
  const {
    throttleKey,
    brakeKey,
    clutchFloorKey,
    clutchBiteKey,
    automatic,
    speed,
    gear,
    dt,
  } = input

  if (dt <= 0) {
    return {
      throttle: 0,
      brake: 0,
      clutch: automatic ? 0 : clutchFloorKey ? 1 : 0,
      biteLatched: false,
    }
  }

  // --- 1. Throttle Calculation ---
  let throttle = 0
  if (throttleKey) {
    state.throttleHoldTime += dt
    if (state.throttleHoldTime <= PEDAL_CONFIG.throttleRampDelay) {
      throttle = PEDAL_CONFIG.tapThrottle
    } else {
      const progress = Math.min(
        1,
        (state.throttleHoldTime - PEDAL_CONFIG.throttleRampDelay) / PEDAL_CONFIG.throttleRampDuration,
      )
      throttle = PEDAL_CONFIG.tapThrottle + progress * (1.0 - PEDAL_CONFIG.tapThrottle)
    }
  } else {
    state.throttleHoldTime = 0
  }

  // --- 2. Brake Calculation ---
  let brake = 0
  if (brakeKey) {
    // Detect double-tap on brake
    if (state.brakeHoldTime === 0) {
      const now = performance.now ? performance.now() / 1000 : Date.now() / 1000
      if (now - state.lastBrakeReleaseTime <= PEDAL_CONFIG.doubleTapBrakeWindow) {
        state.isEmergencyBrake = true
      }
    }
    state.brakeHoldTime += dt

    if (state.isEmergencyBrake) {
      brake = 1.0
    } else {
      const isAutoLowSpeed = automatic && Math.abs(speed) < 2.5 && gear !== 0
      const tapBrake = isAutoLowSpeed
        ? PEDAL_CONFIG.autoCreepTapBrake
        : PEDAL_CONFIG.normalTapBrake
      const delay = isAutoLowSpeed
        ? PEDAL_CONFIG.autoCreepBrakeRampDelay
        : PEDAL_CONFIG.normalBrakeRampDelay
      const duration = isAutoLowSpeed
        ? PEDAL_CONFIG.autoCreepBrakeRampDuration
        : PEDAL_CONFIG.normalBrakeRampDuration

      if (state.brakeHoldTime <= delay) {
        brake = tapBrake
      } else {
        const progress = Math.min(1, (state.brakeHoldTime - delay) / duration)
        brake = tapBrake + progress * (1.0 - tapBrake)
      }
    }
  } else {
    if (state.brakeHoldTime > 0) {
      const now = performance.now ? performance.now() / 1000 : Date.now() / 1000
      state.lastBrakeReleaseTime = now
    }
    state.brakeHoldTime = 0
    state.isEmergencyBrake = false
  }

  // --- 3. Clutch & Half-Linkage Latch Calculation ---
  let clutch = 0
  if (automatic) {
    state.biteLatched = false
    state.biteOffset = 0
    clutch = 0
  } else {
    // Pressing C (clutch to floor) immediately cancels latch
    if (clutchFloorKey) {
      state.biteLatched = false
      state.biteOffset = 0
      clutch = 1.0
    } else {
      // Shift key activates latch or manual hold
      if (clutchBiteKey) {
        state.biteLatched = true
      }

      // Strong brake (> 0.5), shifting into neutral, or full throttle upshifts cancel latch
      if (brake > 0.5 || gear === 0 || (throttle > 0.4 && gear >= 2)) {
        state.biteLatched = false
        state.biteOffset = 0
      }

      if (state.biteLatched || clutchBiteKey) {
        // Micro-adjustment of clutch in latch mode:
        // W lifts clutch slightly (creeps faster); S depresses clutch slightly (creeps slower)
        if (state.biteLatched && !clutchBiteKey) {
          if (throttleKey && state.throttleHoldTime < 0.15) {
            state.biteOffset = Math.max(
              PEDAL_CONFIG.minBitePosition - PEDAL_CONFIG.baseBitePosition,
              state.biteOffset - PEDAL_CONFIG.biteAdjustStep * dt * 8,
            )
          } else if (brakeKey && state.brakeHoldTime < 0.15) {
            state.biteOffset = Math.min(
              PEDAL_CONFIG.maxBitePosition - PEDAL_CONFIG.baseBitePosition,
              state.biteOffset + PEDAL_CONFIG.biteAdjustStep * dt * 8,
            )
          }
        }
        clutch = Math.min(
          PEDAL_CONFIG.maxBitePosition,
          Math.max(PEDAL_CONFIG.minBitePosition, PEDAL_CONFIG.baseBitePosition + state.biteOffset),
        )
      } else {
        clutch = 0
      }
    }
  }

  return {
    throttle,
    brake,
    clutch,
    biteLatched: state.biteLatched,
  }
}
