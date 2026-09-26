import { DRIVING_RULES } from '../rules/drivingRules'
import { forwardFromHeading } from './vehicleFrame'

export interface PhysicsVehicle {
  x: number
  z: number
  heading: number
  speed: number
  steering: number
  steeringWheelAngle: number
  throttle: number
  brake: number
  clutch: number
  gear: number
  engineOn: boolean
  engineRpm: number
  stallTimer: number
  handbrake: boolean
}

export interface PhysicsInput {
  throttle: number
  brake: number
  clutch: number
  steer: number
  steeringWheelTarget?: number
}

export interface PhysicsOptions {
  automatic: boolean
  grade: number
  /** World-space heading of the uphill direction for the supplied grade. */
  gradeHeading?: number
}

const gearRatioFactor: Record<number, number> = {
  1: 1,
  2: 0.78,
  3: 0.62,
  4: 0.52,
  5: 0.45,
}

const coupledRpmPerMps: Record<number, number> = {
  1: 720,
  2: 470,
  3: 330,
  4: 250,
  5: 205,
}

export function longitudinalGravityAcceleration(
  heading: number,
  grade: number,
  gradeHeading = 0,
) {
  if (Math.abs(grade) <= 0.001) return 0
  const vehicleForward = forwardFromHeading(heading)
  const uphillForward = forwardFromHeading(gradeHeading)
  const uphillAlignment =
    vehicleForward.x * uphillForward.x +
    vehicleForward.z * uphillForward.z
  return -grade * 9.81 * uphillAlignment
}

export function stepVehiclePhysics(
  vehicle: PhysicsVehicle,
  input: PhysicsInput,
  dt: number,
  options: PhysicsOptions,
) {
  const { automatic, grade, gradeHeading = 0 } = options
  vehicle.throttle = input.throttle
  vehicle.brake = input.brake
  vehicle.clutch = automatic ? 0 : input.clutch

  const maxSteeringWheelAngle = DRIVING_RULES.steering.wheelTurnsLockToLock * Math.PI
  const steeringWheelRate = DRIVING_RULES.steering.wheelTurnsPerSecond * Math.PI * 2
  vehicle.steeringWheelAngle = input.steeringWheelTarget == null
    ? Math.max(
        -maxSteeringWheelAngle,
        Math.min(
          maxSteeringWheelAngle,
          vehicle.steeringWheelAngle + input.steer * steeringWheelRate * dt,
        ),
      )
    : Math.max(
        -maxSteeringWheelAngle,
        Math.min(
          maxSteeringWheelAngle,
          vehicle.steeringWheelAngle +
            (input.steeringWheelTarget - vehicle.steeringWheelAngle) * Math.min(1, dt * 28),
        ),
      )
  vehicle.steering =
    (vehicle.steeringWheelAngle / maxSteeringWheelAngle) *
    DRIVING_RULES.steering.roadWheelMaxAngleRadians

  const direction = vehicle.gear < 0 ? -1 : 1
  const absGear = Math.max(1, Math.abs(vehicle.gear))
  const clutchEngagement = automatic ? 1 : Math.max(0, Math.min(1, 1 - vehicle.clutch))
  let stalled = false

  if (vehicle.engineOn) {
    if (automatic) {
      const targetRpm = DRIVING_RULES.manualTransmission.idleRpm + input.throttle * 2700 + Math.abs(vehicle.speed) * 95
      vehicle.engineRpm += (targetRpm - vehicle.engineRpm) * Math.min(1, dt * 6)
      vehicle.stallTimer = 0
    } else {
      const freeRpm = DRIVING_RULES.manualTransmission.idleRpm + input.throttle * 3200
      const wheelCoupledRpm = Math.abs(vehicle.speed) * (coupledRpmPerMps[absGear] ?? 205)
      const coupling = vehicle.gear === 0 ? 0 : clutchEngagement * 0.92
      const torqueSupportRpm = input.throttle * 1200 * coupling
      const targetRpm = Math.max(
        320,
        freeRpm * (1 - coupling) + wheelCoupledRpm * coupling + torqueSupportRpm,
      )
      vehicle.engineRpm += (targetRpm - vehicle.engineRpm) * Math.min(1, dt * 8)

      const stallRisk =
        vehicle.gear !== 0 &&
        clutchEngagement > 0.82 &&
        Math.abs(vehicle.speed) < DRIVING_RULES.manualTransmission.stallSpeedThreshold &&
        input.throttle < DRIVING_RULES.manualTransmission.stallThrottleThreshold

      const loadedLowRpm =
        vehicle.gear !== 0 &&
        clutchEngagement > 0.72 &&
        vehicle.engineRpm < DRIVING_RULES.manualTransmission.stallRpm &&
        input.throttle < 0.35

      if (stallRisk || loadedLowRpm) {
        vehicle.stallTimer += dt
      } else {
        vehicle.stallTimer = Math.max(0, vehicle.stallTimer - dt * 2.5)
      }

      if (vehicle.stallTimer >= DRIVING_RULES.manualTransmission.stallDelaySeconds) {
        vehicle.engineOn = false
        vehicle.engineRpm = 0
        vehicle.stallTimer = 0
        stalled = true
      }
    }
  } else {
    vehicle.engineRpm += (0 - vehicle.engineRpm) * Math.min(1, dt * 10)
    vehicle.stallTimer = 0
  }

  if (vehicle.engineOn && !vehicle.handbrake && vehicle.gear !== 0) {
    const reverseFactor = vehicle.gear < 0 ? 0.54 : (gearRatioFactor[absGear] ?? 0.42)
    const throttleForce = input.throttle * 6.4
    const biteAssist =
      !automatic &&
      vehicle.clutch > 0.28 &&
      vehicle.clutch < 0.72 &&
      vehicle.engineRpm > 650
        ? 0.85
        : 0
    const automaticCreep = automatic && input.throttle < 0.05 ? 0.58 : 0
    const driveForce = (throttleForce + biteAssist + automaticCreep) * reverseFactor * clutchEngagement
    vehicle.speed += driveForce * direction * dt

    if (!automatic && input.throttle < 0.05 && clutchEngagement > 0.72) {
      vehicle.speed *= Math.pow(0.991, dt * 60)
    }
  }

  if (!vehicle.handbrake && input.brake < 0.05) {
    vehicle.speed += longitudinalGravityAcceleration(
      vehicle.heading,
      grade,
      gradeHeading,
    ) * dt
  }

  const braking = input.brake * 9.4 + (vehicle.handbrake ? 12.5 : 0)
  if (Math.abs(vehicle.speed) > 0.001) {
    vehicle.speed -= Math.sign(vehicle.speed) * Math.min(Math.abs(vehicle.speed), braking * dt)
  }

  vehicle.speed *= Math.pow(0.988, dt * 60)
  vehicle.speed = Math.max(-5.5, Math.min(16, vehicle.speed))
  if (!vehicle.engineOn && Math.abs(vehicle.speed) < 0.025) vehicle.speed = 0

  const wheelbase = DRIVING_RULES.steering.wheelbaseMeters
  const rearAxleFromCenter = DRIVING_RULES.steering.rearAxleFromCenterMeters
  const headingBefore = vehicle.heading
  const forwardBefore = forwardFromHeading(headingBefore)

  // Kinematic bicycle model: the rear axle is the constrained axle, while
  // the front axle steers. Vehicle x/z remains the body center so existing
  // exam geometry and collision checks continue to use the same reference.
  let rearAxleX = vehicle.x - forwardBefore.x * rearAxleFromCenter
  let rearAxleZ = vehicle.z - forwardBefore.z * rearAxleFromCenter

  const yawRate =
    Math.abs(vehicle.steering) < 0.0001
      ? 0
      : (vehicle.speed / wheelbase) * Math.tan(vehicle.steering)
  const headingDelta = yawRate * dt
  const headingMid = headingBefore + headingDelta * 0.5

  rearAxleX += Math.sin(headingMid) * vehicle.speed * dt
  rearAxleZ -= Math.cos(headingMid) * vehicle.speed * dt
  vehicle.heading = headingBefore + headingDelta

  const forwardAfter = forwardFromHeading(vehicle.heading)
  vehicle.x = rearAxleX + forwardAfter.x * rearAxleFromCenter
  vehicle.z = rearAxleZ + forwardAfter.z * rearAxleFromCenter

  return { stalled }
}
