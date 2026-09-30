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
}

export interface TireDynamicsInput {
  longitudinalSpeed: number
  steering: number
  driveAcceleration: number
  brake: number
  handbrake: boolean
}

function axleGripAcceleration(weightFraction: number) {
  return (
    TRAINING_CAR_DYNAMICS.tireFrictionCoefficient *
    TRAINING_CAR_DYNAMICS.gravityMps2 *
    weightFraction
  )
}

function lateralCapacity(totalGrip: number, longitudinalDemand: number) {
  return Math.sqrt(Math.max(0, totalGrip ** 2 - longitudinalDemand ** 2))
}

function forceBudget(input: TireDynamicsInput) {
  const frontWeight = TRAINING_CAR_DYNAMICS.frontStaticWeightFraction
  const rearWeight = 1 - frontWeight
  const frontGrip = axleGripAcceleration(frontWeight)
  const rearGrip = axleGripAcceleration(rearWeight)
  const serviceBraking =
    clamp(input.brake, 0, 1) * TRAINING_CAR_DYNAMICS.serviceBrakeAcceleration
  const frontLongitudinal =
    Math.abs(input.driveAcceleration) +
    serviceBraking * TRAINING_CAR_DYNAMICS.serviceBrakeFrontBias
  const rearLongitudinal =
    serviceBraking * (1 - TRAINING_CAR_DYNAMICS.serviceBrakeFrontBias) +
    (input.handbrake ? TRAINING_CAR_DYNAMICS.parkingBrakeAcceleration : 0)
  const rearCorneringGrip = rearGrip * (
    input.handbrake
      ? TRAINING_CAR_DYNAMICS.rearGripFractionWithParkingBrake
      : 1
  )

  return {
    frontGrip,
    rearGrip,
    frontLongitudinal,
    rearLongitudinal,
    frontLateral: lateralCapacity(frontGrip, frontLongitudinal),
    rearLateral: lateralCapacity(rearCorneringGrip, rearLongitudinal),
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

export function shouldUseDynamicTireModel(input: TireDynamicsInput) {
  if (input.longitudinalSpeed <= TRAINING_CAR_DYNAMICS.minimumDynamicSpeedMps) {
    return false
  }
  if (input.handbrake) return true

  const budget = forceBudget(input)
  const yawRate = kinematicYawRate(
    input.longitudinalSpeed,
    input.steering,
  )
  const requestedLateralAcceleration =
    Math.abs(input.longitudinalSpeed * yawRate)
  const availableLateralAcceleration =
    budget.frontLateral + budget.rearLateral

  return (
    requestedLateralAcceleration >
    availableLateralAcceleration *
      TRAINING_CAR_DYNAMICS.nonlinearDemandFraction
  )
}

function longitudinalSkidSeverity(gripUsage: number) {
  // Longitudinal lock starts only when requested braking/drive force is at the
  // friction limit. Cornering may begin to scrub earlier without locking the
  // wheel, so keep this threshold separate from lateral skid severity.
  return clamp((gripUsage - 0.96) / 0.16, 0, 1)
}

function skidSeverity(slipAngle: number, gripUsage: number) {
  const angular = Math.abs(slipAngle) /
    TRAINING_CAR_DYNAMICS.slipAngleForFullSkidRadians
  const saturation = (gripUsage - 0.78) / 0.22
  return clamp(Math.max(angular, saturation), 0, 1)
}

export function kinematicTireTelemetry(
  input: TireDynamicsInput,
  state: TireDynamicsState,
): TireTelemetry {
  const budget = forceBudget(input)
  const speed = Math.max(0.1, Math.abs(input.longitudinalSpeed))
  const frontGripUsage = clamp(
    budget.frontLongitudinal / Math.max(0.001, budget.frontGrip),
    0,
    2,
  )
  const rearGripUsage = clamp(
    budget.rearLongitudinal / Math.max(0.001, budget.rearGrip),
    0,
    2,
  )
  const frontLongitudinalSkid = longitudinalSkidSeverity(frontGripUsage)
  const rearLongitudinalSkid = longitudinalSkidSeverity(rearGripUsage)
  return {
    model: 'kinematic',
    driveAxle: TRAINING_CAR_DYNAMICS.driveAxle,
    lateralSpeedMps: state.lateralSpeed,
    yawRateRps: state.yawRate,
    sideslipAngleRadians: Math.atan2(state.lateralSpeed, speed),
    frontSlipAngleRadians: 0,
    rearSlipAngleRadians: 0,
    frontGripUsage,
    rearGripUsage,
    frontSkidSeverity: frontLongitudinalSkid,
    rearSkidSeverity: rearLongitudinalSkid,
    frontWheelRotationFactor: 1 - frontLongitudinalSkid,
    rearWheelRotationFactor: 1 - rearLongitudinalSkid,
  }
}

export function stepTireDynamics(
  state: TireDynamicsState,
  input: TireDynamicsInput,
  dt: number,
) {
  const budget = forceBudget(input)
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

  for (let step = 0; step < substeps; step += 1) {
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

    // Small chassis damping prevents numerical energy gain while leaving tire
    // saturation, not an arbitrary heading clamp, responsible for recovery.
    lateralSpeed *= Math.exp(-0.10 * h)
    yawRate *= Math.exp(-0.06 * h)
  }

  const lateralLimit = Math.abs(input.longitudinalSpeed) * 1.4 + 2
  lateralSpeed = clamp(lateralSpeed, -lateralLimit, lateralLimit)
  yawRate = clamp(yawRate, -3.5, 3.5)

  const frontGripUsage = Math.hypot(
    budget.frontLongitudinal,
    frontLateralAcceleration,
  ) / Math.max(0.001, budget.frontGrip)
  const rearGripUsage = Math.hypot(
    budget.rearLongitudinal,
    rearLateralAcceleration,
  ) / Math.max(0.001, budget.rearGrip)
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
        longitudinalSkidSeverity(
          budget.frontLongitudinal / Math.max(0.001, budget.frontGrip),
        ),
      ),
      rearSkidSeverity: Math.max(
        skidSeverity(rearSlipAngle, rearGripUsage),
        longitudinalSkidSeverity(
          budget.rearLongitudinal / Math.max(0.001, budget.rearGrip),
        ),
      ),
      frontWheelRotationFactor: 1 - longitudinalSkidSeverity(
        budget.frontLongitudinal / Math.max(0.001, budget.frontGrip),
      ),
      rearWheelRotationFactor: 1 - longitudinalSkidSeverity(
        budget.rearLongitudinal / Math.max(0.001, budget.rearGrip),
      ),
    } satisfies TireTelemetry,
  }
}
