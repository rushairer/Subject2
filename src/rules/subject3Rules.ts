export const SUBJECT3_RULE_LIMITS = {
  passScore: 90,
} as const

export interface Subject3InfractionRule {
  points: number
  fatal: boolean
}

export const SUBJECT3_INFRACTION_RULES = {
  signal: { points: 100, fatal: true },
  signalLead: { points: 100, fatal: true },
  observationMinor: { points: 10, fatal: false },
  observationRequired: { points: 100, fatal: true },
  straightDirection: { points: 100, fatal: true },
  gearSkip: { points: 100, fatal: true },
  gearMinimum: { points: 100, fatal: true },
  gearDuration: { points: 10, fatal: false },
  speedFatal: { points: 100, fatal: true },
  speedMinor: { points: 10, fatal: false },
  parkingBrakeMinor: { points: 10, fatal: false },
  path: { points: 100, fatal: true },
  yield: { points: 100, fatal: true },
  pullOverStop: { points: 100, fatal: true },
  pullOverCrossLine: { points: 100, fatal: true },
  pullOverDistanceFail: { points: 100, fatal: true },
  pullOverDistanceMinor: { points: 10, fatal: false },
  roadBoundary: { points: 100, fatal: true },
  seatbelt: { points: 100, fatal: true },
  nightLightsOff: { points: 100, fatal: true },
  nightStartMinor: { points: 10, fatal: false },
  lightTest: { points: 100, fatal: true },
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
