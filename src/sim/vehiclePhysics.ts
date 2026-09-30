import { DRIVING_RULES } from '../rules/drivingRules'
import { forwardFromHeading } from './vehicleFrame'
import { MANUAL_GEARS, VEHICLE_POWERTRAIN } from './vehiclePowertrain'

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
  if (dt <= 0) return { stalled: false }
  const { automatic, grade, gradeHeading = 0 } = options
  const powertrain = VEHICLE_POWERTRAIN
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
  const manualGear = MANUAL_GEARS[absGear] ?? MANUAL_GEARS[DRIVING_RULES.manualTransmission.highestForwardGear]
  const rpmPerMps = vehicle.gear < 0 ? powertrain.reverseRpmPerMps : manualGear.rpmPerMps
  const clutchEngagement = automatic ? 1 : Math.max(0, Math.min(1, 1 - vehicle.clutch))
  const slippingClutch = !automatic && vehicle.clutch > powertrain.minSlippingClutch && vehicle.clutch < powertrain.maxSlippingClutch
  let stalled = false

  if (vehicle.engineOn) {
    if (automatic) {
      const targetRpm = DRIVING_RULES.manualTransmission.idleRpm + input.throttle * 2700 + Math.abs(vehicle.speed) * 95
      vehicle.engineRpm += (targetRpm - vehicle.engineRpm) * Math.min(1, dt * 6)
      vehicle.stallTimer = 0
    } else {
      const freeRpm = DRIVING_RULES.manualTransmission.idleRpm + input.throttle * 3200
      const wheelCoupledRpm = Math.abs(vehicle.speed) * rpmPerMps
      const coupling = vehicle.gear === 0 ? 0 : clutchEngagement * 0.92
      const torqueSupportRpm = input.throttle * 1200 * coupling
      const targetRpm = Math.max(
        slippingClutch ? DRIVING_RULES.manualTransmission.idleRpm : 320,
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
    const driveFactor = vehicle.gear < 0
      ? powertrain.reverseDriveFactor
      : automatic
        ? 1 / (1 + Math.abs(vehicle.speed) / powertrain.automaticRatioSpeedScale)
        : manualGear.driveFactor
    // A lower gear provides more launch torque, but cannot keep pulling beyond
    // its usable engine speed. Higher gears extend the usable speed range.
    const coupledRpm = Math.max(0, vehicle.speed * direction) * rpmPerMps
    const torqueAvailability = automatic ? 1 : Math.max(0, Math.min(1,
      (powertrain.redlineRpm - coupledRpm) / (powertrain.redlineRpm - powertrain.torqueTaperRpm),
    ))
    const throttleForce = input.throttle * powertrain.fullThrottleAcceleration * torqueAvailability
    const creepSpeed = automatic
      ? powertrain.automaticCreepSpeed
      : DRIVING_RULES.manualTransmission.idleRpm / rpmPerMps * (slippingClutch
        ? clutchEngagement / (1 - DRIVING_RULES.manualTransmission.biteClutchPosition)
        : 1)
    const creepHeadroom = Math.max(0, Math.min(1, 1 - vehicle.speed * direction / creepSpeed))
    const biteAssist = slippingClutch ? powertrain.biteAcceleration * creepHeadroom : 0
    // Creep is idle torque at walking speed, never propulsion at road speed.
    const automaticCreep = automatic ? powertrain.automaticCreepAcceleration * creepHeadroom * (1 - input.throttle) : 0
    const driveForce = (throttleForce + biteAssist + automaticCreep) * driveFactor * clutchEngagement
    vehicle.speed += driveForce * direction * dt

    const closedThrottle = Math.max(0, 1 - input.throttle / powertrain.engineBrakeReleaseThrottle)
    const engineBraking = automatic
      ? powertrain.automaticEngineBrakeBase + Math.abs(vehicle.speed) * powertrain.automaticEngineBrakeSpeedFactor
      : (powertrain.manualEngineBrakeBase + Math.abs(vehicle.speed) * powertrain.manualEngineBrakeSpeedFactor) * manualGear.driveFactor * clutchEngagement
    // Idle torque and engine braking must not fight each other during creep.
    const brakingAboveIdle = automatic || slippingClutch
      ? Math.max(0, Math.min(1, Math.abs(vehicle.speed) / creepSpeed - 1))
      : 1
    const engineBrakeStep = engineBraking * closedThrottle * brakingAboveIdle * dt
    vehicle.speed -= Math.sign(vehicle.speed) * Math.min(Math.abs(vehicle.speed), engineBrakeStep)
  }

  // Service braking opposes gravity; a lightly pressed pedal is not a hill hold.
  if (!vehicle.handbrake) {
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

  const resistance = powertrain.rollingResistance + powertrain.aerodynamicDrag * vehicle.speed ** 2
  vehicle.speed -= Math.sign(vehicle.speed) * Math.min(Math.abs(vehicle.speed), resistance * dt)

  // This is not a performance limiter. Normal top speed must emerge from the
  // balance between drivetrain force, gearing, road load and grade. The guard
  // only prevents a corrupted/unstable state from exploding the simulation.
  if (!Number.isFinite(vehicle.speed)) {
    vehicle.speed = 0
  } else {
    vehicle.speed = Math.max(
      -powertrain.numericalSafetySpeed,
      Math.min(powertrain.numericalSafetySpeed, vehicle.speed),
    )
  }

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
