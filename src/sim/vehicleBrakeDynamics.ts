export const ABS_CONFIG = {
  enabled: true,
  minimumSpeedMps: 2.5,
  minimumBrakeCommand: 0.45,
  releaseWheelRotationFactor: 0.78,
  minimumPressureFactor: 0.24,
  releaseRatePerSecond: 13,
  reapplyRatePerSecond: 4.8,
} as const

export interface AbsAxleState {
  frontPressureFactor: number
  rearPressureFactor: number
  active: boolean
}

export interface AbsPreview {
  frontWheelRotationFactor: number
  rearWheelRotationFactor: number
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export function createAbsAxleState(): AbsAxleState {
  return {
    frontPressureFactor: 1,
    rearPressureFactor: 1,
    active: false,
  }
}

function stepAxlePressure(
  current: number,
  wheelRotationFactor: number,
  dt: number,
) {
  if (wheelRotationFactor < ABS_CONFIG.releaseWheelRotationFactor) {
    return Math.max(
      ABS_CONFIG.minimumPressureFactor,
      current - ABS_CONFIG.releaseRatePerSecond * dt,
    )
  }
  return Math.min(
    1,
    current + ABS_CONFIG.reapplyRatePerSecond * dt,
  )
}

export function stepAbsAxleState(
  state: AbsAxleState,
  preview: AbsPreview,
  brakeCommand: number,
  speedMps: number,
  dt: number,
  enabled = ABS_CONFIG.enabled,
): AbsAxleState {
  const brake = clamp01(brakeCommand)
  if (
    !enabled ||
    brake < ABS_CONFIG.minimumBrakeCommand ||
    Math.abs(speedMps) < ABS_CONFIG.minimumSpeedMps
  ) {
    return createAbsAxleState()
  }

  const frontPressureFactor = stepAxlePressure(
    state.frontPressureFactor,
    preview.frontWheelRotationFactor,
    dt,
  )
  const rearPressureFactor = stepAxlePressure(
    state.rearPressureFactor,
    preview.rearWheelRotationFactor,
    dt,
  )

  return {
    frontPressureFactor,
    rearPressureFactor,
    active:
      frontPressureFactor < 0.999 ||
      rearPressureFactor < 0.999 ||
      preview.frontWheelRotationFactor <
        ABS_CONFIG.releaseWheelRotationFactor ||
      preview.rearWheelRotationFactor <
        ABS_CONFIG.releaseWheelRotationFactor,
  }
}
