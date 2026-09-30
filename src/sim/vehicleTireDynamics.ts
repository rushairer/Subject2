import { TRAINING_CAR } from './vehicleDimensions'

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value))

/**
 * Training-car handling parameters. These are simulator tuning values, not a
 * claim to reproduce one exact production Santana variant.
 */
export const TRAINING_CAR_DYNAMICS = {
  driveAxle: 'front',
  massKg: 1250,
  yawInertiaKgM2: 2250,
  gravityMps2: 9.81,
  frontStaticWeightFraction: 0.61,
  centerOfMassHeightMeters: 0.52,
  tireFrictionCoefficient: 0.92,
  frontCorneringAccelerationPerRadian: 43,
  rearCorneringAccelerationPerRadian: 46,
  serviceBrakeAcceleration: 9.4,
  serviceBrakeFrontBias: 0.70,
  parkingBrakeAcceleration: 5.2,
  rearGripFractionWithParkingBrake: 0.10,
  minimumDynamicSpeedMps: 4,
  nonlinearDemandFraction: 0.90,
  slipAngleForFullSkidRadians: 0.18,
} as const

export interface WheelNormalLoads {
  frontLeftN: number
  frontRightN: number
  rearLeftN: number
  rearRightN: number
  frontAxleN: number
  rearAxleN: number
  totalN: number
}

export interface TireDynamicsState {
  /** Body-center lateral velocity, positive to vehicle-right. */
  lateralSpeed: number
  /** Heading rate, positive for a right turn. */
  yawRate: number
}

export interface TireTelemetry {
  model: 'kinematic' | 'dynamic'
  driveAxle: typeof TRAINING_CAR_DYNAMICS.driveAxle
  lateralSpeedMps: number
  yawRateRps: number
  sideslipAngleRadians: number
  frontSlipAngleRadians: number
  rearSlipAngleRadians: number
  frontGripUsage: number
  rearGripUsage: number
  frontSkidSeverity: number
  rearSkidSeverity: number
  /** 1 = free rolling at road speed, 0 = longitudinally locked. */
  frontWheelRotationFactor: number
  /** 1 = free rolling at road speed, 0 = longitudinally locked. */
  rearWheelRotationFactor: number
  /** Instantaneous four-wheel vertical loads after longitudinal/lateral transfer. */
  normalLoads: WheelNormalLoads
  /** Body-forward acceleration used for longitudinal load transfer. */
  longitudinalAccelerationMps2: number
  /** Body-right acceleration used for lateral load transfer. */
  lateralAccelerationMps2: number
}

export interface TireDynamicsInput {
  longitudinalSpeed: number
  steering: number
  /** Signed body-forward drive acceleration. Reverse drive is negative. */
  driveAcceleration: number
  brake: number
  handbrake: boolean
  lateralAccelerationEstimate?: number
}

export function calculateWheelNormalLoads(
  longitudinalAccelerationMps2: number,
  lateralAccelerationMps2: number,
): WheelNormalLoads {
  const dynamics = TRAINING_CAR_DYNAMICS
  const totalN = dynamics.massKg * dynamics.gravityMps2
  const staticFrontN = totalN * dynamics.frontStaticWeightFraction

  // Positive longitudinal acceleration unloads the front axle; braking in the
  // forward direction is negative and therefore transfers load forward.
  const longitudinalTransferN =
    dynamics.massKg *
    longitudinalAccelerationMps2 *
    dynamics.centerOfMassHeightMeters /
    TRAINING_CAR.wheelbaseMeters
  const minimumAxleN = totalN * 0.05
  const frontAxleN = clamp(
    staticFrontN - longitudinalTransferN,
    minimumAxleN,
    totalN - minimumAxleN,
  )
  const rearAxleN = totalN - frontAxleN

  // Positive lateral acceleration is vehicle-right, so load transfers to the
  // left/outside wheels. Split roll moment between axles in proportion to the
  // instantaneous axle load, then preserve each axle's total vertical load.
  const lateralShiftN =
    dynamics.massKg *
    lateralAccelerationMps2 *
    dynamics.centerOfMassHeightMeters /
    TRAINING_CAR.trackWidthMeters
  const frontShare = frontAxleN / totalN
  const rearShare = rearAxleN / totalN
  const frontShift = clamp(
    lateralShiftN * frontShare,
    -frontAxleN * 0.48,
    frontAxleN * 0.48,
  )
  const rearShift = clamp(
    lateralShiftN * rearShare,
    -rearAxleN * 0.48,
    rearAxleN * 0.48,
  )

  return {
    frontLeftN: frontAxleN / 2 + frontShift,
    frontRightN: frontAxleN / 2 - frontShift,
    rearLeftN: rearAxleN / 2 + rearShift,
    rearRightN: rearAxleN / 2 - rearShift,
    frontAxleN,
    rearAxleN,
    totalN,
  }
}

function gripAcceleration(normalLoadN: number) {
  return (
    TRAINING_CAR_DYNAMICS.tireFrictionCoefficient *
    normalLoadN /
    TRAINING_CAR_DYNAMICS.massKg
  )
}

function lateralCapacity(totalGrip: number, longitudinalDemand: number) {
  return Math.sqrt(Math.max(0, totalGrip ** 2 - longitudinalDemand ** 2))
}

function forceBudget(
  input: TireDynamicsInput,
  lateralAccelerationMps2: number,
) {
  const serviceBraking =
    clamp(input.brake, 0, 1) * TRAINING_CAR_DYNAMICS.serviceBrakeAcceleration
  const parkingBraking =
    input.handbrake ? TRAINING_CAR_DYNAMICS.parkingBrakeAcceleration : 0
  const travelSign =
    Math.sign(input.longitudinalSpeed) ||
    Math.sign(input.driveAcceleration) ||
    1
  const longitudinalAccelerationMps2 =
    input.driveAcceleration -
    travelSign * (serviceBraking + parkingBraking)
  const normalLoads = calculateWheelNormalLoads(
    longitudinalAccelerationMps2,
    lateralAccelerationMps2,
  )

  const frontLongitudinal =
    Math.abs(input.driveAcceleration) +
    serviceBraking * TRAINING_CAR_DYNAMICS.serviceBrakeFrontBias
  const rearLongitudinal =
    serviceBraking * (1 - TRAINING_CAR_DYNAMICS.serviceBrakeFrontBias) +
    parkingBraking

  const frontLeftGrip = gripAcceleration(normalLoads.frontLeftN)
  const frontRightGrip = gripAcceleration(normalLoads.frontRightN)
  const rearLeftGrip = gripAcceleration(normalLoads.rearLeftN)
  const rearRightGrip = gripAcceleration(normalLoads.rearRightN)
  const frontWheelLongitudinal = frontLongitudinal / 2
  const rearWheelLongitudinal = rearLongitudinal / 2
  const rearCorneringFactor = input.handbrake
    ? TRAINING_CAR_DYNAMICS.rearGripFractionWithParkingBrake
    : 1

  return {
    normalLoads,
    longitudinalAccelerationMps2,
    lateralAccelerationMps2,
    frontLongitudinal,
    rearLongitudinal,
    frontWheelLongitudinal,
    rearWheelLongitudinal,
    frontLeftGrip,
    frontRightGrip,
    rearLeftGrip,
    rearRightGrip,
    frontGrip: frontLeftGrip + frontRightGrip,
    rearGrip: rearLeftGrip + rearRightGrip,
    frontLateral:
      lateralCapacity(frontLeftGrip, frontWheelLongitudinal) +
      lateralCapacity(frontRightGrip, frontWheelLongitudinal),
    rearLateral:
      lateralCapacity(
        rearLeftGrip * rearCorneringFactor,
        rearWheelLongitudinal,
      ) +
      lateralCapacity(
        rearRightGrip * rearCorneringFactor,
        rearWheelLongitudinal,
      ),
  }
}

export function kinematicYawRate(
  longitudinalSpeed: number,
  steering: number,
) {
  if (Math.abs(steering) < 0.0001) return 0
  return (
    longitudinalSpeed /
    TRAINING_CAR.wheelbaseMeters *
    Math.tan(steering)
  )
}

function requestedLateralAcceleration(input: TireDynamicsInput) {
  return input.lateralAccelerationEstimate ?? (
    input.longitudinalSpeed *
    kinematicYawRate(input.longitudinalSpeed, input.steering)
  )
}

export function shouldUseDynamicTireModel(input: TireDynamicsInput) {
  if (input.longitudinalSpeed <= TRAINING_CAR_DYNAMICS.minimumDynamicSpeedMps) {
    return false
  }
  if (input.handbrake) return true

  const lateralAcceleration = requestedLateralAcceleration(input)
  const budget = forceBudget(input, lateralAcceleration)
  const requested = Math.abs(lateralAcceleration)
  const available = budget.frontLateral + budget.rearLateral

  return (
    requested >
    available * TRAINING_CAR_DYNAMICS.nonlinearDemandFraction
  )
}

function longitudinalSkidSeverity(gripUsage: number) {
  return clamp((gripUsage - 0.96) / 0.16, 0, 1)
}

function skidSeverity(slipAngle: number, gripUsage: number) {
  const angular = Math.abs(slipAngle) /
    TRAINING_CAR_DYNAMICS.slipAngleForFullSkidRadians
  const saturation = (gripUsage - 0.78) / 0.22
  return clamp(Math.max(angular, saturation), 0, 1)
}

function axleUsage(
  leftGrip: number,
  rightGrip: number,
  wheelLongitudinal: number,
  axleLateral: number,
  leftNormal: number,
  rightNormal: number,
) {
  const axleNormal = Math.max(0.001, leftNormal + rightNormal)
  const leftLateral = axleLateral * leftNormal / axleNormal
  const rightLateral = axleLateral * rightNormal / axleNormal
  return Math.max(
    Math.hypot(wheelLongitudinal, leftLateral) /
      Math.max(0.001, leftGrip),
    Math.hypot(wheelLongitudinal, rightLateral) /
      Math.max(0.001, rightGrip),
  )
}

function axleLongitudinalUsage(
  leftGrip: number,
  rightGrip: number,
  wheelLongitudinal: number,
) {
  return Math.max(
    wheelLongitudinal / Math.max(0.001, leftGrip),
    wheelLongitudinal / Math.max(0.001, rightGrip),
  )
}

export function kinematicTireTelemetry(
  input: TireDynamicsInput,
  state: TireDynamicsState,
): TireTelemetry {
  const speed = Math.max(0.1, Math.abs(input.longitudinalSpeed))
  const lateralAcceleration = requestedLateralAcceleration(input)
  const budget = forceBudget(input, lateralAcceleration)
  const frontLongitudinalUsage = axleLongitudinalUsage(
    budget.frontLeftGrip,
    budget.frontRightGrip,
    budget.frontWheelLongitudinal,
  )
  const rearLongitudinalUsage = axleLongitudinalUsage(
    budget.rearLeftGrip,
    budget.rearRightGrip,
    budget.rearWheelLongitudinal,
  )
  const frontLongitudinalSkid =
    longitudinalSkidSeverity(frontLongitudinalUsage)
  const rearLongitudinalSkid =
    longitudinalSkidSeverity(rearLongitudinalUsage)

  return {
    model: 'kinematic',
    driveAxle: TRAINING_CAR_DYNAMICS.driveAxle,
    lateralSpeedMps: state.lateralSpeed,
    yawRateRps: state.yawRate,
    sideslipAngleRadians: Math.atan2(state.lateralSpeed, speed),
    frontSlipAngleRadians: 0,
    rearSlipAngleRadians: 0,
    frontGripUsage: frontLongitudinalUsage,
    rearGripUsage: rearLongitudinalUsage,
    frontSkidSeverity: frontLongitudinalSkid,
    rearSkidSeverity: rearLongitudinalSkid,
    frontWheelRotationFactor: 1 - frontLongitudinalSkid,
    rearWheelRotationFactor: 1 - rearLongitudinalSkid,
    normalLoads: budget.normalLoads,
    longitudinalAccelerationMps2: budget.longitudinalAccelerationMps2,
    lateralAccelerationMps2: lateralAcceleration,
  }
}

export function stepTireDynamics(
  state: TireDynamicsState,
  input: TireDynamicsInput,
  dt: number,
) {
  const frontDistance = TRAINING_CAR.frontAxleFromCenterMeters
  const rearDistance = TRAINING_CAR.rearAxleFromCenterMeters
  const speedForAngles = Math.max(2, input.longitudinalSpeed)
  const substeps = Math.max(1, Math.ceil(dt / 0.01))
  const h = dt / substeps
  let lateralSpeed = state.lateralSpeed
  let yawRate = state.yawRate
  let frontSlipAngle = 0
  let rearSlipAngle = 0
  let frontLateralAcceleration = 0
  let rearLateralAcceleration = 0
  let budget = forceBudget(
    input,
    input.longitudinalSpeed * yawRate,
  )

  for (let step = 0; step < substeps; step += 1) {
    const lateralAccelerationEstimate =
      input.longitudinalSpeed * yawRate
    budget = forceBudget(input, lateralAccelerationEstimate)

    frontSlipAngle =
      input.steering -
      Math.atan2(
        lateralSpeed + frontDistance * yawRate,
        speedForAngles,
      )
    rearSlipAngle =
      -Math.atan2(
        lateralSpeed - rearDistance * yawRate,
        speedForAngles,
      )

    frontLateralAcceleration = clamp(
      TRAINING_CAR_DYNAMICS.frontCorneringAccelerationPerRadian *
        frontSlipAngle,
      -budget.frontLateral,
      budget.frontLateral,
    )
    rearLateralAcceleration = clamp(
      TRAINING_CAR_DYNAMICS.rearCorneringAccelerationPerRadian *
        rearSlipAngle,
      -budget.rearLateral,
      budget.rearLateral,
    )

    const lateralAcceleration =
      frontLateralAcceleration +
      rearLateralAcceleration -
      input.longitudinalSpeed * yawRate
    const yawAcceleration =
      TRAINING_CAR_DYNAMICS.massKg /
      TRAINING_CAR_DYNAMICS.yawInertiaKgM2 *
      (
        frontDistance * frontLateralAcceleration -
        rearDistance * rearLateralAcceleration
      )

    lateralSpeed += lateralAcceleration * h
    yawRate += yawAcceleration * h

    lateralSpeed *= Math.exp(-0.10 * h)
    yawRate *= Math.exp(-0.06 * h)
  }

  const lateralLimit = Math.abs(input.longitudinalSpeed) * 1.4 + 2
  lateralSpeed = clamp(lateralSpeed, -lateralLimit, lateralLimit)
  yawRate = clamp(yawRate, -3.5, 3.5)

  const lateralAccelerationMps2 =
    frontLateralAcceleration + rearLateralAcceleration
  budget = forceBudget(input, lateralAccelerationMps2)

  const frontGripUsage = axleUsage(
    budget.frontLeftGrip,
    budget.frontRightGrip,
    budget.frontWheelLongitudinal,
    frontLateralAcceleration,
    budget.normalLoads.frontLeftN,
    budget.normalLoads.frontRightN,
  )
  const rearGripUsage = axleUsage(
    budget.rearLeftGrip,
    budget.rearRightGrip,
    budget.rearWheelLongitudinal,
    rearLateralAcceleration,
    budget.normalLoads.rearLeftN,
    budget.normalLoads.rearRightN,
  )
  const frontLongitudinalUsage = axleLongitudinalUsage(
    budget.frontLeftGrip,
    budget.frontRightGrip,
    budget.frontWheelLongitudinal,
  )
  const rearLongitudinalUsage = axleLongitudinalUsage(
    budget.rearLeftGrip,
    budget.rearRightGrip,
    budget.rearWheelLongitudinal,
  )
  const nextState = { lateralSpeed, yawRate }

  return {
    state: nextState,
    telemetry: {
      model: 'dynamic',
      driveAxle: TRAINING_CAR_DYNAMICS.driveAxle,
      lateralSpeedMps: lateralSpeed,
      yawRateRps: yawRate,
      sideslipAngleRadians: Math.atan2(
        lateralSpeed,
        Math.max(0.1, Math.abs(input.longitudinalSpeed)),
      ),
      frontSlipAngleRadians: frontSlipAngle,
      rearSlipAngleRadians: rearSlipAngle,
      frontGripUsage,
      rearGripUsage,
      frontSkidSeverity: Math.max(
        skidSeverity(frontSlipAngle, frontGripUsage),
        longitudinalSkidSeverity(frontLongitudinalUsage),
      ),
      rearSkidSeverity: Math.max(
        skidSeverity(rearSlipAngle, rearGripUsage),
        longitudinalSkidSeverity(rearLongitudinalUsage),
      ),
      frontWheelRotationFactor:
        1 - longitudinalSkidSeverity(frontLongitudinalUsage),
      rearWheelRotationFactor:
        1 - longitudinalSkidSeverity(rearLongitudinalUsage),
      normalLoads: budget.normalLoads,
      longitudinalAccelerationMps2: budget.longitudinalAccelerationMps2,
      lateralAccelerationMps2,
    } satisfies TireTelemetry,
  }
}
