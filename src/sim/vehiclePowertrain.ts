/** Training-car dynamics tuning (m, s, m/s² and rpm). These are simulation parameters,
 * not exam thresholds or a claim to reproduce a particular production car. */
export const VEHICLE_POWERTRAIN = {
  fullThrottleAcceleration: 3.2,
  rollingResistance: 0.12,
  // Quadratic road-load term. Keep this low enough that road speed emerges
  // from available power + gearing instead of an artificial speed ceiling.
  aerodynamicDrag: 0.0005,
  manualEngineBrakeBase: 0.22,
  manualEngineBrakeSpeedFactor: 0.025,
  automaticEngineBrakeBase: 0.08,
  automaticEngineBrakeSpeedFactor: 0.008,
  engineBrakeReleaseThrottle: 0.2,
  torqueTaperRpm: 5000,
  redlineRpm: 6200,
  automaticRatioSpeedScale: 15,
  automaticCreepAcceleration: 0.9,
  automaticCreepSpeed: 1.15,
  biteAcceleration: 0.85,
  minSlippingClutch: 0.28,
  maxSlippingClutch: 0.72,
  reverseDriveFactor: 0.54,
  reverseRpmPerMps: 900,
  // Numerical corruption guard only; normal drivetrain/road-load equilibrium
  // is far below this value and must determine actual vehicle top speed.
  numericalSafetySpeed: 75,
} as const

export const MANUAL_GEARS: Readonly<Record<number, { driveFactor: number; rpmPerMps: number }>> = {
  1: { driveFactor: 1, rpmPerMps: 720 },
  2: { driveFactor: 0.78, rpmPerMps: 470 },
  3: { driveFactor: 0.62, rpmPerMps: 330 },
  4: { driveFactor: 0.52, rpmPerMps: 235 },
  5: { driveFactor: 0.45, rpmPerMps: 170 },
}
