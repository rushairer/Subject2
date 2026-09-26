export type Subject2RuleProject =
  | 'reverse-parking'
  | 'side-parking'
  | 'slope-start'
  | 'curve-driving'
  | 'right-angle'

export const SUBJECT2_RULE_LIMITS = {
  passScore: 80,
  reverseParking: {
    timeLimitSeconds: 210,
    stopLimitSeconds: 2,
    parkedHoldSeconds: 0.35,
  },
  sideParking: {
    timeLimitSeconds: 90,
    stopLimitSeconds: 2,
    parkedHoldSeconds: 0.35,
    bodyOutAfterStopHoldSeconds: 0.5,
  },
  slopeStart: {
    stopHoldSeconds: 0.5,
    startLimitSeconds: 30,
    parkingBrakeCheckSeconds: 1.2,
    stopLongitudinalMinorMeters: 0.15,
    stopLongitudinalFatalMeters: 0.5,
    rightGapMinorMeters: 0.3,
    rightGapFatalMeters: 0.5,
    rollbackMinimumMeters: 0.02,
    rollbackFatalMeters: 0.3,
    rollbackEvaluateAfterForwardMeters: 0.35,
    measurementEpsilon: 1e-6,
  },
  curveDriving: {
    stopLimitSeconds: 2,
  },
  rightAngle: {
    stopLimitSeconds: 2,
  },
} as const

export interface Subject2InfractionRule {
  project: Subject2RuleProject
  id: string
  title: string
  points: number
  fatal: boolean
}

export const SUBJECT2_INFRACTION_RULES = {
  'reverse-before-first-control': {
    project: 'reverse-parking',
    id: 'reverse-before-first-control',
    title: '倒车前两个前轮触地点未均驶过起始控制线',
    points: 100,
    fatal: true,
  },
  'reverse-parking-timeout': {
    project: 'reverse-parking',
    id: 'reverse-parking-timeout',
    title: '倒车入库项目完成时间超过 210 秒',
    points: 100,
    fatal: true,
  },
  'reverse-parking-body-out': {
    project: 'reverse-parking',
    id: 'reverse-parking-body-out',
    title: '倒车入库过程中车身出线',
    points: 100,
    fatal: true,
  },
  'first-reverse-not-in-bay': {
    project: 'reverse-parking',
    id: 'first-reverse-not-in-bay',
    title: '第一次倒库不入',
    points: 100,
    fatal: true,
  },
  'second-reverse-not-in-bay': {
    project: 'reverse-parking',
    id: 'second-reverse-not-in-bay',
    title: '第二次倒库不入',
    points: 100,
    fatal: true,
  },
  'reverse-before-opposite-control': {
    project: 'reverse-parking',
    id: 'reverse-before-opposite-control',
    title: '第二次倒车前两个前轮触地点未均驶过另一端控制线',
    points: 100,
    fatal: true,
  },
  'reverse-parking-stop': {
    project: 'reverse-parking',
    id: 'reverse-parking-stop',
    title: '倒车入库中途停车超过 2 秒',
    points: 5,
    fatal: false,
  },

  'side-parking-timeout': {
    project: 'side-parking',
    id: 'side-parking-timeout',
    title: '侧方停车项目完成时间超过 90 秒',
    points: 100,
    fatal: true,
  },
  'side-parking-line-contact': {
    project: 'side-parking',
    id: 'side-parking-line-contact',
    title: '侧方停车行驶中车轮或车身触碰边线',
    points: 10,
    fatal: false,
  },
  'side-parking-body-out-after-stop': {
    project: 'side-parking',
    id: 'side-parking-body-out-after-stop',
    title: '侧方停车入库停止后车身出线',
    points: 100,
    fatal: true,
  },
  'side-parking-exit-signal': {
    project: 'side-parking',
    id: 'side-parking-exit-signal',
    title: '侧方停车出库时未使用或错误使用转向灯',
    points: 10,
    fatal: false,
  },
  'side-parking-stop': {
    project: 'side-parking',
    id: 'side-parking-stop',
    title: '侧方停车中途停车超过 2 秒',
    points: 5,
    fatal: false,
  },

  'slope-wheel-line': {
    project: 'slope-start',
    id: 'slope-wheel-line',
    title: '坡道行驶中车轮触轧道路边缘线',
    points: 100,
    fatal: true,
  },
  'slope-stop-longitudinal-fail': {
    project: 'slope-start',
    id: 'slope-stop-longitudinal-fail',
    title: '定点停车后前保险杠距桩杆线前后偏差超过 50cm',
    points: 100,
    fatal: true,
  },
  'slope-stop-longitudinal-10': {
    project: 'slope-start',
    id: 'slope-stop-longitudinal-10',
    title: '定点停车后前保险杠未定于桩杆线，前后偏差不超过 50cm',
    points: 10,
    fatal: false,
  },
  'slope-right-gap-fail': {
    project: 'slope-start',
    id: 'slope-right-gap-fail',
    title: '定点停车后车身距右侧道路边缘线超过 50cm',
    points: 100,
    fatal: true,
  },
  'slope-right-gap-10': {
    project: 'slope-start',
    id: 'slope-right-gap-10',
    title: '定点停车后车身距右侧道路边缘线超过 30cm 但未超过 50cm',
    points: 10,
    fatal: false,
  },
  'slope-no-parking-brake': {
    project: 'slope-start',
    id: 'slope-no-parking-brake',
    title: '停车后未拉紧驻车制动器',
    points: 10,
    fatal: false,
  },
  'slope-start-timeout': {
    project: 'slope-start',
    id: 'slope-start-timeout',
    title: '坡道起步超过规定的 30 秒',
    points: 100,
    fatal: true,
  },
  'slope-rollback-fail': {
    project: 'slope-start',
    id: 'slope-rollback-fail',
    title: '坡道起步车辆后溜距离超过 30cm',
    points: 100,
    fatal: true,
  },
  'slope-rollback-10': {
    project: 'slope-start',
    id: 'slope-rollback-10',
    title: '坡道起步车辆发生后溜，距离不超过 30cm',
    points: 10,
    fatal: false,
  },

  'curve-wheel-line': {
    project: 'curve-driving',
    id: 'curve-wheel-line',
    title: '曲线行驶车轮触轧道路边缘线',
    points: 100,
    fatal: true,
  },
  'curve-reverse': {
    project: 'curve-driving',
    id: 'curve-reverse',
    title: '曲线行驶未按规定路线连续前进',
    points: 100,
    fatal: true,
  },
  'curve-stop': {
    project: 'curve-driving',
    id: 'curve-stop',
    title: '曲线行驶中途停车',
    points: 5,
    fatal: false,
  },

  'right-angle-wheel-out': {
    project: 'right-angle',
    id: 'right-angle-wheel-out',
    title: '直角转弯车轮轧道路边缘线',
    points: 100,
    fatal: true,
  },
  'right-angle-no-signal': {
    project: 'right-angle',
    id: 'right-angle-no-signal',
    title: '直角转弯前未使用或错误使用转向灯',
    points: 10,
    fatal: false,
  },
  'right-angle-signal-not-cancelled': {
    project: 'right-angle',
    id: 'right-angle-signal-not-cancelled',
    title: '直角转弯后未关闭转向灯',
    points: 10,
    fatal: false,
  },
  'right-angle-stop': {
    project: 'right-angle',
    id: 'right-angle-stop',
    title: '直角转弯中途停车超过 2 秒',
    points: 5,
    fatal: false,
  },
} as const satisfies Record<string, Subject2InfractionRule>

export type Subject2InfractionRuleId = keyof typeof SUBJECT2_INFRACTION_RULES

export function subject2Infraction(
  ruleId: Subject2InfractionRuleId,
  suffix?: string | number,
) {
  const rule = SUBJECT2_INFRACTION_RULES[ruleId]
  return {
    id: suffix === undefined ? rule.id : `${rule.id}-${suffix}`,
    title: rule.title,
    points: rule.points,
    ...(rule.fatal ? { fatal: true as const } : {}),
  }
}
