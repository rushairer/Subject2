export const SUBJECT3_RULE_LIMITS = {
  passScore: 90,
  movingSpeedThresholdMps: 0.2,
  roadBoundaryMarginMeters: 0.55,
  signalLeadSeconds: 3,
  maneuverSteeringThreshold: 0.18,
  maneuverLateralThreshold: 0.42,
  straightMaxSteering: 0.5,
  manualMinimumGear: 3,
  speedAllowanceKmh: 3,
  laneChangeRequiredLateralMeters: 2.0,
  overtakeRequiredLateralMeters: 2.0,
  overtakeReturnLateralThresholdMeters: -1.25,
  routeCompletionRemainingMeters: 35,
  trafficCollisionRadiusMeters: 2.6,
  pullOver: {
    idealMaxGapMeters: 0.30,
    warningMaxGapMeters: 0.50,
    stableStopSeconds: 0.9,
    stoppedSpeedMps: 0.08,
  },
} as const

export interface Subject3InfractionRule {
  points: number
  fatal: boolean
}

export const SUBJECT3_INFRACTION_RULES = {
  signal: { points: 100, fatal: true },
  signalLead: { points: 100, fatal: true },
  observation: { points: 10, fatal: false },
  straightDirection: { points: 100, fatal: true },
  gear: { points: 10, fatal: false },
  speed: { points: 10, fatal: false },
  path: { points: 100, fatal: true },
  pullOverStop: { points: 100, fatal: true },
  pullOverCrossLine: { points: 100, fatal: true },
  pullOverDistanceFail: { points: 100, fatal: true },
  pullOverDistanceMinor: { points: 10, fatal: false },
  roadBoundary: { points: 100, fatal: true },
  nightLightsOff: { points: 100, fatal: true },
  nightStartOperation: { points: 10, fatal: false },
  collision: { points: 100, fatal: true },
} as const satisfies Record<string, Subject3InfractionRule>

export type Subject3InfractionRuleId = keyof typeof SUBJECT3_INFRACTION_RULES

export function subject3Infraction(
  id: string,
  title: string,
  ruleId: Subject3InfractionRuleId,
) {
  const rule = SUBJECT3_INFRACTION_RULES[ruleId]
  return {
    id,
    title,
    points: rule.points,
    fatal: rule.fatal,
  }
}
