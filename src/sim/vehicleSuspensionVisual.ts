const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value))

/**
 * Visual suspension response. These values shape coachwork attitude only;
 * judged vehicle geometry, wheel contacts and collision footprints stay in the
 * canonical rigid-body frame.
 */
export const SUSPENSION_VISUAL = {
  rollCenterHeightMeters: 0.46,
  pitchRadiansPerMps2: 0.0068,
  rollRadiansPerMps2: 0.0092,
  maxPitchRadians: 0.060,
  maxRollRadians: 0.078,
  springStiffness: 62,
  springDamping: 14.5,
  maxAngularVelocityRps: 1.8,
} as const

export interface SuspensionVisualPose {
  pitch: number
  roll: number
}

export interface SuspensionVisualState extends SuspensionVisualPose {
  pitchVelocity: number
  rollVelocity: number
}

export function createSuspensionVisualState(): SuspensionVisualState {
  return {
    pitch: 0,
    roll: 0,
    pitchVelocity: 0,
    rollVelocity: 0,
  }
}

export function suspensionTargetPose(
  longitudinalAccelerationMps2: number,
  lateralAccelerationMps2: number,
): SuspensionVisualPose {
  return {
    // Vehicle nose is -Z. Negative X rotation lowers -Z, so braking
    // (negative longitudinal acceleration) produces a visible nose dive.
    pitch: clamp(
      longitudinalAccelerationMps2 *
        SUSPENSION_VISUAL.pitchRadiansPerMps2,
      -SUSPENSION_VISUAL.maxPitchRadians,
      SUSPENSION_VISUAL.maxPitchRadians,
    ),
    // Positive lateral acceleration is vehicle-right and loads the left
    // outside tires. Positive Z rotation lowers the left side accordingly.
    roll: clamp(
      lateralAccelerationMps2 *
        SUSPENSION_VISUAL.rollRadiansPerMps2,
      -SUSPENSION_VISUAL.maxRollRadians,
      SUSPENSION_VISUAL.maxRollRadians,
    ),
  }
}

export function stepSuspensionVisual(
  state: SuspensionVisualState,
  target: SuspensionVisualPose,
  dt: number,
): SuspensionVisualState {
  if (dt <= 0) return state

  const substeps = Math.max(1, Math.ceil(dt / (1 / 120)))
  const h = dt / substeps
  let pitch = state.pitch
  let roll = state.roll
  let pitchVelocity = state.pitchVelocity
  let rollVelocity = state.rollVelocity

  for (let index = 0; index < substeps; index += 1) {
    const pitchAcceleration =
      (target.pitch - pitch) * SUSPENSION_VISUAL.springStiffness -
      pitchVelocity * SUSPENSION_VISUAL.springDamping
    const rollAcceleration =
      (target.roll - roll) * SUSPENSION_VISUAL.springStiffness -
      rollVelocity * SUSPENSION_VISUAL.springDamping

    pitchVelocity = clamp(
      pitchVelocity + pitchAcceleration * h,
      -SUSPENSION_VISUAL.maxAngularVelocityRps,
      SUSPENSION_VISUAL.maxAngularVelocityRps,
    )
    rollVelocity = clamp(
      rollVelocity + rollAcceleration * h,
      -SUSPENSION_VISUAL.maxAngularVelocityRps,
      SUSPENSION_VISUAL.maxAngularVelocityRps,
    )
    pitch += pitchVelocity * h
    roll += rollVelocity * h
  }

  return {
    pitch: clamp(
      pitch,
      -SUSPENSION_VISUAL.maxPitchRadians * 1.12,
      SUSPENSION_VISUAL.maxPitchRadians * 1.12,
    ),
    roll: clamp(
      roll,
      -SUSPENSION_VISUAL.maxRollRadians * 1.12,
      SUSPENSION_VISUAL.maxRollRadians * 1.12,
    ),
    pitchVelocity,
    rollVelocity,
  }
}
