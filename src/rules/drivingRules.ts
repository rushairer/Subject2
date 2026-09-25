export const DRIVING_RULES = {
  steering: {
    wheelTurnsLockToLock: 2.7,
    wheelTurnsPerSecond: 1.0,
    roadWheelMaxAngleRadians: 0.58,
  },
  manualTransmission: {
    idleRpm: 820,
    stallRpm: 560,
    stallDelaySeconds: 0.42,
    biteClutchPosition: 0.52,
    stallThrottleThreshold: 0.16,
    stallSpeedThreshold: 0.62,
  },
  subject3: {
    signalLeadSeconds: 3,
    maneuverSteeringThreshold: 0.18,
    maneuverLateralThreshold: 0.42,
    pullOver: {
      idealMaxGapMeters: 0.30,
      warningMaxGapMeters: 0.50,
      stableStopSeconds: 0.9,
      stoppedSpeedMps: 0.08,
    },
  },
} as const
