import { DRIVING_RULES } from '../rules/drivingRules'
import { kinematicYawRate } from '../sim/vehicleTireDynamics'

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value))

/**
 * Non-scoring stability support for Golden Driver. Reads the SAME tire solver
 * velocities that the learner sees. It issues ordinary wheel/pedal commands;
 * the physics, collision resolver and exam judge remain authoritative.
 */
export interface CoachStabilityVehicle {
  speed: number
  /** Geometric body-center speed to vehicle right (m/s). */
  lateralSpeed?: number
  /** Clockwise/right yaw rate (radians/s). */
  yawRate?: number
}

export interface CoachStabilityCommand {
  steeringWheelTarget: number
  throttle: number
  brake: number
}

export interface CoachStabilityResult extends CoachStabilityCommand {
  active: boolean
  sideslipAngleRadians: number
}

/** No correction is active during low-speed/reverse parking geometry. */
export const COACH_STABILITY = {
  minimumForwardSpeedMps: 4.2,
  interventionSideslipRadians: 0.16,
  interventionYawErrorRps: 0.65,
  maximumRoadWheelCorrectionRadians: 0.18,
  maximumRecoveryThrottle: 0.08,
} as const

export function assistCoachStability(
  vehicle: Readonly<CoachStabilityVehicle>,
  planned: Readonly<CoachStabilityCommand>,
): CoachStabilityResult {
  const inactive: CoachStabilityResult = {
    ...planned, active: false, sideslipAngleRadians: 0,
  }

  const { speed, lateralSpeed, yawRate } = vehicle
  if (!Number.isFinite(speed) || speed < COACH_STABILITY.minimumForwardSpeedMps ||
      lateralSpeed == null || yawRate == null ||
      !Number.isFinite(lateralSpeed) || !Number.isFinite(yawRate) ||
      !Number.isFinite(planned.steeringWheelTarget)) return inactive

  const sideslipAngleRadians = Math.atan2(lateralSpeed, speed)
  const maxSteeringWheelAngle = DRIVING_RULES.steering.wheelTurnsLockToLock * Math.PI
  const maxRoadWheelAngle = DRIVING_RULES.steering.roadWheelMaxAngleRadians
  const plannedRoadWheel = clamp(planned.steeringWheelTarget /
    maxSteeringWheelAngle * maxRoadWheelAngle, -maxRoadWheelAngle, maxRoadWheelAngle)
  const yawError = yawRate - kinematicYawRate(speed, plannedRoadWheel)

  if (Math.abs(sideslipAngleRadians) < COACH_STABILITY.interventionSideslipRadians &&
      Math.abs(yawError) < COACH_STABILITY.interventionYawErrorRps) {
    return { ...inactive, sideslipAngleRadians }
  }

  // Align the body's longitudinal axis with the actual direction of travel,
  // while damping excess rotation. Positive slip means ground velocity is
  // right of the nose, so steer right; extra right yaw is corrected left.
  // This is deliberately a bounded driver counter-steer, not a reset of v/r.
  const correction = clamp(
    sideslipAngleRadians * 0.9 - yawError * 0.17,
    -COACH_STABILITY.maximumRoadWheelCorrectionRadians,
    COACH_STABILITY.maximumRoadWheelCorrectionRadians,
  )
  const roadWheel = clamp(plannedRoadWheel + correction,
    -maxRoadWheelAngle, maxRoadWheelAngle)
  return {
    active: true,
    sideslipAngleRadians,
    steeringWheelTarget: roadWheel / maxRoadWheelAngle * maxSteeringWheelAngle,
    throttle: Math.min(planned.throttle, COACH_STABILITY.maximumRecoveryThrottle),
    // An actual traffic hazard or planned precision stop keeps brake priority.
    brake: planned.brake,
  }
}
