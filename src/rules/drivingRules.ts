import { TRAINING_CAR } from '../sim/vehicleDimensions'

const TRAINING_MANUAL_HIGHEST_FORWARD_GEAR = 5

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
    highestForwardGear: TRAINING_MANUAL_HIGHEST_FORWARD_GEAR,
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
    maneuverHeadingToleranceRadians: 0.45,
    roadBoundaryToleranceMeters: 0.55,
    laneChangeTargetLateralMeters: -2.0,
    overtakeTargetLateralMeters: -2.0,
    overtakeReturnLateralMeters: -1.25,
    overtake: {
      passClearanceMeters: TRAINING_CAR.lengthMeters,
    },
    gear: {
      minimumRequiredGear: TRAINING_MANUAL_HIGHEST_FORWARD_GEAR - 1,
      minimumHighGearSeconds: 5,
    },
    crosswalk: {
      stoppedSpeedMps: 0.08,
    },
    pullOver: {
      idealMaxGapMeters: 0.30,
      warningMaxGapMeters: 0.50,
      stableStopSeconds: 0.9,
      stoppedSpeedMps: 0.08,
    },
  },
} as const
