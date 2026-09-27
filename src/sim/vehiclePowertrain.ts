/** Training-car dynamics tuning (m, s, m/s² and rpm). These are simulation parameters,
 * not exam thresholds or a claim to reproduce a particular production car. */
export const VEHICLE_POWERTRAIN = {
  fullThrottleAcceleration: 3.2,
  rollingResistance: 0.12,
  aerodynamicDrag: 0.0025,
  manualEngineBrakeBase: 0.22,
  manualEngineBrakeSpeedFactor: 0.025,
  automaticEngineBrakeBase: 0.08,
  automaticEngineBrakeSpeedFactor: 0.008,
  engineBrakeReleaseThrottle: 0.2,
  torqueTaperRpm: 4500,
  redlineRpm: 6200,
  automaticRatioSpeedScale: 15,
  automaticCreepAcceleration: 0.9,
  automaticCreepSpeed: 1.15,
  biteAcceleration: 0.85,
  minSlippingClutch: 0.28,
  maxSlippingClutch: 0.72,
  reverseDriveFactor: 0.54,
  reverseRpmPerMps: 900,
  maxForwardSpeed: 16,
  maxReverseSpeed: 5.5,
} as const

export const MANUAL_GEARS: Readonly<Record<number, { driveFactor: number; rpmPerMps: number }>> = {
  1: { driveFactor: 1, rpmPerMps: 720 },
  2: { driveFactor: 0.78, rpmPerMps: 470 },
  3: { driveFactor: 0.62, rpmPerMps: 330 },
  4: { driveFactor: 0.52, rpmPerMps: 250 },
  5: { driveFactor: 0.45, rpmPerMps: 205 },
}
