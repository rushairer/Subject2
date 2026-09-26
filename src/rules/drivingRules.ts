import { TRAINING_CAR } from '../sim/vehicleDimensions'

export const DRIVING_RULES = {
  steering: {
    wheelTurnsLockToLock: 2.7,
    wheelTurnsPerSecond: 1.0,
    roadWheelMaxAngleRadians: 0.58,
    wheelbaseMeters: TRAINING_CAR.wheelbaseMeters,
    trackWidthMeters: TRAINING_CAR.trackWidthMeters,
    rearAxleFromCenterMeters: TRAINING_CAR.rearAxleFromCenterMeters,
  },
  manualTransmission: {
    idleRpm: 820,
    stallRpm: 560,
    stallDelaySeconds: 0.42,
    biteClutchPosition: 0.52,
    stallThrottleThreshold: 0.16,
    stallSpeedThreshold: 0.62,
  },
} as const
