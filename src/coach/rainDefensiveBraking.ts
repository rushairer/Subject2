import { effectiveRoadFriction, roadSurfaceFriction } from '../sim/roadSurface'
import { TRAINING_CAR_DYNAMICS } from '../sim/vehicleTireDynamics'

/**
 * Simulator coaching envelopes, NOT examination limits or real-world
 * calibrated stopping distances. The same rain coefficient drives actual
 * road braking and this predictive driving input.
 */
export const RAIN_COACH_DEFENSE = {
  followingGapSeconds: 3.2,
  reactionSeconds: 0.75,
  reserveBumperGapMeters: 6.5,
  minimumBrakingEfficiency: 0.78,
  maximumRequestedBrake: 0.94,
  maximumExtraHazardLookaheadMeters: 12,
} as const

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value))

export interface RainCoachStoppingEnvelope {
  availableDecelerationMps2: number
  predictedClosingStopMeters: number
  warningGapMeters: number
  requestedBrake: number
  earlyHazardLookaheadMeters: number
}

/**
 * Read the existing tire-road friction loss; never invent a second rain tire
 * coefficient in coach mode. Closing-stop distance considers the difference
 * to the lead's speed, not full-stop distance against a moving vehicle.
 */
export function rainCoachStoppingEnvelope(
  playerSpeedMps: number,
  localWaterDepthMm: number,
  closingSpeedMps: number,
  bumperGapMeters: number,
): RainCoachStoppingEnvelope {
  const speed = Number.isFinite(playerSpeedMps)
    ? Math.max(0, playerSpeedMps) : 0
  const depth = Number.isFinite(localWaterDepthMm)
    ? Math.max(0, localWaterDepthMm) : 0
  const closing = Number.isFinite(closingSpeedMps)
    ? Math.max(0, closingSpeedMps) : 0
  const gap = Number.isFinite(bumperGapMeters)
    ? Math.max(0, bumperGapMeters) : 0
  const relativeGrip = effectiveRoadFriction('rain', speed, depth) /
    roadSurfaceFriction('dry')
  const availableDecelerationMps2 =
    TRAINING_CAR_DYNAMICS.serviceBrakeAcceleration *
      relativeGrip * RAIN_COACH_DEFENSE.minimumBrakingEfficiency
  const predictedClosingStopMeters =
    closing * closing / (2 * availableDecelerationMps2)
  const warningGapMeters =
    RAIN_COACH_DEFENSE.reserveBumperGapMeters +
    closing * RAIN_COACH_DEFENSE.reactionSeconds +
    predictedClosingStopMeters
  const effectiveGap = Math.max(
    0.35,
    gap - RAIN_COACH_DEFENSE.reserveBumperGapMeters -
      closing * RAIN_COACH_DEFENSE.reactionSeconds,
  )
  const neededDeceleration = closing * closing / (2 * effectiveGap)
  const requestedBrake = clamp(
    neededDeceleration / availableDecelerationMps2,
    0,
    RAIN_COACH_DEFENSE.maximumRequestedBrake,
  )
  const earlyHazardLookaheadMeters = clamp(
    speed * speed / (2 * availableDecelerationMps2) * 0.65,
    0,
    RAIN_COACH_DEFENSE.maximumExtraHazardLookaheadMeters,
  )

  return {
    availableDecelerationMps2,
    predictedClosingStopMeters,
    warningGapMeters,
    requestedBrake,
    earlyHazardLookaheadMeters,
  }
}
