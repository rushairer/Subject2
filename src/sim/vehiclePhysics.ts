import { DRIVING_RULES } from '../rules/drivingRules'
import { forwardFromHeading, rightFromHeading } from './vehicleFrame'
import { recordVehicleBeforePhysics } from './vehicleCollision'
import { effectiveRoadFriction, relativeRoadGrip, roadSurfaceFriction, type RoadSurfaceId } from './roadSurface'
import {
  advanceRainWater,
  createRainWaterState,
  localRainWaterDepthMm,
  type RainWaterState,
} from './rainWater'
import {
  TRAINING_CAR_DYNAMICS,
  kinematicTireTelemetry,
  kinematicYawRate,
  shouldUseDynamicTireModel,
  stepTireDynamics,
  type TireTelemetry,
} from './vehicleTireDynamics'
import { MANUAL_GEARS, VEHICLE_POWERTRAIN } from './vehiclePowertrain'
import {
  createAbsAxleState,
  stepAbsAxleState,
  type AbsAxleState,
} from './vehicleBrakeDynamics'

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
  /** Body-center lateral velocity, positive to vehicle-right. */
  lateralSpeed?: number
  /** Heading rate, positive for a right turn. */
  yawRate?: number
  /** Visual wheel rotation multiplier from longitudinal tire slip. */
  frontWheelRotationFactor?: number
  /** Visual wheel rotation multiplier from longitudinal tire slip. */
  rearWheelRotationFactor?: number
  absFrontPressureFactor?: number
  absRearPressureFactor?: number
  absActive?: boolean
  /** Shallow local water depth and contact-risk indicators for practice HUD. */
  localWaterDepthMm?: number
  aquaplaningSeverity?: number
}

export interface PhysicsInput {
  throttle: number
  brake: number
  clutch: number
  steer: number
  steeringWheelTarget?: number
}

export interface PhysicsStepResult {
  stalled: boolean
  tire: TireTelemetry
  abs: AbsAxleState
}

export interface PhysicsOptions {
  automatic: boolean
  grade: number
  /** World-space heading of the uphill direction for the supplied grade. */
  gradeHeading?: number
  /** Defaults to the training car's production ABS configuration. */
  absEnabled?: boolean
  /** Optional training condition. Unspecified keeps the exact dry baseline. */
  surface?: RoadSurfaceId
  /** Shared mutable rain accumulation state, stepped by the physics integrator. */
  rainWater?: RainWaterState
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

// Internal integrator for one bounded physics step. Keep the legacy 60 Hz
// execution path unchanged so parking geometry and coach trajectories retain
// their existing deterministic reference.
function stepVehiclePhysicsSubstep(
  vehicle: PhysicsVehicle,
  input: PhysicsInput,
  dt: number,
  options: PhysicsOptions,
): PhysicsStepResult {
  if (dt <= 0) {
    const yawRate = kinematicYawRate(vehicle.speed, vehicle.steering)
    const lateralSpeed =
      yawRate * DRIVING_RULES.steering.rearAxleFromCenterMeters
    const tire = kinematicTireTelemetry({
      longitudinalSpeed: vehicle.speed,
      steering: vehicle.steering,
      driveAcceleration: 0,
      brake: input.brake,
      handbrake: vehicle.handbrake,
      surface: options.surface,
    }, { lateralSpeed, yawRate })
    const abs = createAbsAxleState()
    return { stalled: false, tire, abs }
  }
  const {
    automatic,
    grade,
    gradeHeading = 0,
    absEnabled = true,
    surface = 'dry',
    rainWater,
  } = options
  // Advance weather on exactly the same bounded substeps as the vehicle.
  // The optional rain preset never mutates an exam or ordinary dry session.
  if (surface === 'rain' && rainWater) advanceRainWater(rainWater, dt)
  const localWaterDepthMm = surface === 'rain'
    ? localRainWaterDepthMm(rainWater ?? createRainWaterState(), vehicle.x, vehicle.z)
    : 0
  const roadGroundSpeed = () => Math.hypot(vehicle.speed, vehicle.lateralSpeed ?? 0)
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
  let driveAcceleration = 0

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

  if (vehicle.engineOn && vehicle.gear !== 0) {
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
    // A wet front-drive axle cannot put unlimited engine torque into the
    // road. Keep the dry branch bit-for-bit identical for existing exams.
    const frontAxleTraction = effectiveRoadFriction(
      surface, roadGroundSpeed(), localWaterDepthMm,
    ) * TRAINING_CAR_DYNAMICS.gravityMps2 *
      TRAINING_CAR_DYNAMICS.frontStaticWeightFraction
    driveAcceleration = surface === 'dry'
      ? driveForce
      : Math.min(driveForce, frontAxleTraction)
    vehicle.speed += driveAcceleration * direction * dt

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
  if (!vehicle.handbrake || Math.abs(vehicle.speed) > 0.08) {
    vehicle.speed += longitudinalGravityAcceleration(
      vehicle.heading,
      grade,
      gradeHeading,
    ) * dt
  }

  const previousAbs: AbsAxleState = {
    frontPressureFactor: vehicle.absFrontPressureFactor ?? 1,
    rearPressureFactor: vehicle.absRearPressureFactor ?? 1,
    active: vehicle.absActive ?? false,
  }
  const previewYawRate = kinematicYawRate(
    vehicle.speed,
    vehicle.steering,
  )
  const previewTire = kinematicTireTelemetry({
    longitudinalSpeed: vehicle.speed,
    steering: vehicle.steering,
    driveAcceleration: driveAcceleration * direction,
    brake: input.brake,
    handbrake: vehicle.handbrake,
    frontServiceBrakeFactor: previousAbs.frontPressureFactor,
    rearServiceBrakeFactor: previousAbs.rearPressureFactor,
    lateralAccelerationEstimate: vehicle.speed * previewYawRate,
    surface,
    localWaterDepthMm,
    groundSpeedMps: roadGroundSpeed(),
  }, {
    lateralSpeed: vehicle.lateralSpeed ?? 0,
    yawRate: vehicle.yawRate ?? previewYawRate,
  })
  const abs = vehicle.handbrake
    ? createAbsAxleState()
    : stepAbsAxleState(
        previousAbs,
        previewTire,
        input.brake,
        vehicle.speed,
        dt,
        absEnabled,
      )
  vehicle.absFrontPressureFactor = abs.frontPressureFactor
  vehicle.absRearPressureFactor = abs.rearPressureFactor
  vehicle.absActive = abs.active

  const effectiveServiceBraking =
    input.brake *
    TRAINING_CAR_DYNAMICS.serviceBrakeAcceleration *
    (
      TRAINING_CAR_DYNAMICS.serviceBrakeFrontBias *
        abs.frontPressureFactor +
      (1 - TRAINING_CAR_DYNAMICS.serviceBrakeFrontBias) *
        abs.rearPressureFactor
    )
  const requestedBraking =
    effectiveServiceBraking +
    (vehicle.handbrake
      ? TRAINING_CAR_DYNAMICS.parkingBrakeAcceleration
      : 0)
  // Limit available longitudinal tire/road force in low-grip practice.
  // The established dry tuning and low-speed parking path stay unchanged.
  const braking = surface === 'dry'
    ? requestedBraking
    : Math.min(requestedBraking,
        TRAINING_CAR_DYNAMICS.serviceBrakeAcceleration *
          (surface === 'rain'
            ? effectiveRoadFriction(surface, roadGroundSpeed(), localWaterDepthMm) /
              roadSurfaceFriction('dry')
            : relativeRoadGrip(surface)))
  if (Math.abs(vehicle.speed) > 0.001) {
    vehicle.speed -= Math.sign(vehicle.speed) * Math.min(
      Math.abs(vehicle.speed),
      braking * dt,
    )
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

  const rearAxleFromCenter = DRIVING_RULES.steering.rearAxleFromCenterMeters
  const headingBefore = vehicle.heading
  const requestedYawRate = kinematicYawRate(vehicle.speed, vehicle.steering)
  const kinematicLateralSpeed = requestedYawRate * rearAxleFromCenter
  const previousLateralSpeed =
    vehicle.lateralSpeed ?? kinematicLateralSpeed
  const previousYawRate = vehicle.yawRate ?? requestedYawRate
  const groundSpeedBefore = Math.hypot(
    vehicle.speed,
    previousLateralSpeed,
  )
  const tireInput = {
    longitudinalSpeed: vehicle.speed,
    steering: vehicle.steering,
    driveAcceleration: driveAcceleration * direction,
    brake: input.brake,
    handbrake: vehicle.handbrake,
    frontServiceBrakeFactor: abs.frontPressureFactor,
    rearServiceBrakeFactor: abs.rearPressureFactor,
    surface,
    localWaterDepthMm,
    groundSpeedMps: groundSpeedBefore,
  }
  const lateralRecoveryError = Math.abs(
    previousLateralSpeed - kinematicLateralSpeed,
  )
  const yawRecoveryError = Math.abs(
    previousYawRate - requestedYawRate,
  )
  const recoveringFromSlip =
    groundSpeedBefore >
      TRAINING_CAR_DYNAMICS.recoveryMinimumGroundSpeedMps &&
    (
      lateralRecoveryError >
        TRAINING_CAR_DYNAMICS.recoveryLateralSpeedErrorMps ||
      yawRecoveryError >
        TRAINING_CAR_DYNAMICS.recoveryYawRateErrorRps
    )
  // Reverse Subject 2 maneuvers intentionally remain on the exact
  // kinematic bicycle. The current nonlinear tire equations are calibrated
  // for forward road-speed handling; feeding reverse velocity into them can
  // invert slip-angle signs and corrupt deterministic parking geometry.
  const dynamicTires =
    vehicle.gear >= 0 &&
    groundSpeedBefore >
      TRAINING_CAR_DYNAMICS.recoveryMinimumGroundSpeedMps &&
    (
      shouldUseDynamicTireModel(tireInput) ||
      recoveringFromSlip
    )

  let tire: TireTelemetry

  if (dynamicTires) {
    const dynamics = stepTireDynamics({
      longitudinalSpeed: vehicle.speed,
      lateralSpeed: previousLateralSpeed,
      yawRate: previousYawRate,
    }, tireInput, dt)
    vehicle.speed =
      dynamics.state.longitudinalSpeed ?? vehicle.speed
    vehicle.lateralSpeed = dynamics.state.lateralSpeed
    vehicle.yawRate = dynamics.state.yawRate

    if (!Number.isFinite(vehicle.speed)) {
      vehicle.speed = 0
    } else {
      vehicle.speed = Math.max(
        -powertrain.numericalSafetySpeed,
        Math.min(
          powertrain.numericalSafetySpeed,
          vehicle.speed,
        ),
      )
    }

    const headingDelta = vehicle.yawRate * dt
    const headingMid = headingBefore + headingDelta * 0.5
    const forwardMid = forwardFromHeading(headingMid)
    const rightMid = rightFromHeading(headingMid)
    vehicle.x += (
      forwardMid.x * vehicle.speed +
      rightMid.x * vehicle.lateralSpeed
    ) * dt
    vehicle.z += (
      forwardMid.z * vehicle.speed +
      rightMid.z * vehicle.lateralSpeed
    ) * dt
    vehicle.heading = headingBefore + headingDelta
    tire = dynamics.telemetry
  } else {
    // Preserve the exact rear-axle kinematic bicycle at low speed. Subject 2
    // geometry depends on this deterministic path and should not inherit tire
    // solver noise when the tires are comfortably inside their grip budget.
    const forwardBefore = forwardFromHeading(headingBefore)
    let rearAxleX = vehicle.x - forwardBefore.x * rearAxleFromCenter
    let rearAxleZ = vehicle.z - forwardBefore.z * rearAxleFromCenter
    const headingDelta = requestedYawRate * dt
    const headingMid = headingBefore + headingDelta * 0.5

    rearAxleX += Math.sin(headingMid) * vehicle.speed * dt
    rearAxleZ -= Math.cos(headingMid) * vehicle.speed * dt
    vehicle.heading = headingBefore + headingDelta

    const forwardAfter = forwardFromHeading(vehicle.heading)
    vehicle.x = rearAxleX + forwardAfter.x * rearAxleFromCenter
    vehicle.z = rearAxleZ + forwardAfter.z * rearAxleFromCenter
    vehicle.lateralSpeed = kinematicLateralSpeed
    vehicle.yawRate = requestedYawRate
    tire = kinematicTireTelemetry(
      tireInput,
      {
        lateralSpeed: kinematicLateralSpeed,
        yawRate: requestedYawRate,
      },
    )
  }

  if (surface === 'rain') {
    vehicle.localWaterDepthMm = localWaterDepthMm
    vehicle.aquaplaningSeverity = tire.aquaplaningSeverity ?? 0
  }
  vehicle.frontWheelRotationFactor = tire.frontWheelRotationFactor
  vehicle.rearWheelRotationFactor = tire.rearWheelRotationFactor
  return { stalled, tire, abs }
}


/** Long render frames must not turn into one large, unstable physics step. */
export const MAX_PHYSICS_STEP_SECONDS = 1 / 60

/**
 * Advance the same drivetrain, tires, ABS and rigid-body pose through bounded
 * substeps. At 60 Hz or faster this is the existing one-step integrator; at
 * lower frame rates controls are held constant while physics catches up.
 * Keep the stall event from any internal step, not just the final step.
 */
export function stepVehiclePhysics(
  vehicle: PhysicsVehicle,
  input: PhysicsInput,
  dt: number,
  options: PhysicsOptions,
): PhysicsStepResult {
  // The collision pipeline runs after physics at frame priority -1. Expose
  // the unmodified body pose once per frame, before any internal substeps.
  recordVehicleBeforePhysics(vehicle)
  if (!Number.isFinite(dt)) {
    return stepVehiclePhysicsSubstep(vehicle, input, 0, options)
  }
  if (dt <= MAX_PHYSICS_STEP_SECONDS) {
    return stepVehiclePhysicsSubstep(vehicle, input, dt, options)
  }

  const count = Math.ceil(dt / MAX_PHYSICS_STEP_SECONDS)
  const h = dt / count
  let stalled = false
  let last: PhysicsStepResult | undefined
  for (let i = 0; i < count; i += 1) {
    last = stepVehiclePhysicsSubstep(vehicle, input, h, options)
    stalled ||= last.stalled
  }
  // A positive dt always takes at least one substep.
  return { ...last!, stalled }
}
