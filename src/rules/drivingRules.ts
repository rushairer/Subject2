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
  turnSignal: {
    // Mechanical steering-column cancellation: arm only after a real turn,
    // then release when the wheel returns close to center.
    autoCancelArmWheelAngleRadians: Math.PI / 2,
    autoCancelReturnWheelAngleRadians: 0.18,
  },
  manualTransmission: {
    highestForwardGear: TRAINING_MANUAL_HIGHEST_FORWARD_GEAR,
    idleRpm: 820,
    stallRpm: 560,
    stallDelaySeconds: 0.42,
    biteClutchPosition: 0.52,
    stallThrottleThreshold: 0.16,
    stallSpeedThreshold: 0.62,
    // Simulator coaching heuristics only. These values do not represent
    // national exam scoring thresholds and must never emit infractions.
    gearSpeedCoaching: {
      minimumSpeedKmh: 3,
      maximumClutchPosition: 0.18,
      minimumRecommendedRpm: 1050,
      maximumRecommendedRpm: 3400,
      minimumSustainedSeconds: 1.5,
      maximumSampleGapSeconds: 0.65,
    },
  },
  subject3: {
    signalLeadSeconds: 3,
    maneuverSteeringThreshold: 0.18,
    maneuverLateralThreshold: 0.42,
    maneuverHeadingToleranceRadians: 0.45,
    roadBoundaryToleranceMeters: 0.55,
    routeSpeedLimitKmh: 50,
    routeOverspeedGraceSeconds: 1.2,
    parkingBrakeMovingThresholdMps: 0.25,
    laneChangeTargetLateralMeters: -2.0,
    overtakeTargetLateralMeters: -2.0,
    overtakeReturnLateralMeters: -1.25,
    overtake: {
      passClearanceMeters: TRAINING_CAR.lengthMeters,
    },
    // Coaching reference only. The 3-second gap comes from public traffic
    // safety guidance and is not a nationwide Subject 3 scoring threshold.
    followingCoaching: {
      referenceTimeGapSeconds: 3,
      minimumSpeedKmh: 8,
      minimumSustainedSeconds: 1.5,
      maximumSampleGapSeconds: 0.65,
    },
    // Road-traffic law context, surfaced as replay coaching rather than a
    // simulator-side scoring rule because traffic telemetry remains approximate.
    nightLightingCoaching: {
      meetingLowBeamDistanceMeters: 150,
      minimumSpeedKmh: 3,
      minimumSustainedSeconds: 0.8,
      maximumSampleGapSeconds: 0.65,
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
