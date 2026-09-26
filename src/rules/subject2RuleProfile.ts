import {
  SUBJECT2_RULE_LIMITS,
  type Subject2RuleLimits,
} from './subject2Rules'

export type Subject2RuleProfileScope = 'national' | 'local' | 'venue'

export type Subject2RuleLimitOverrides = {
  passScore?: number
  reverseParking?: Partial<Subject2RuleLimits['reverseParking']>
  sideParking?: Partial<Subject2RuleLimits['sideParking']>
  slopeStart?: Partial<Subject2RuleLimits['slopeStart']>
  curveDriving?: Partial<Subject2RuleLimits['curveDriving']>
  rightAngle?: Partial<Subject2RuleLimits['rightAngle']>
}

export interface Subject2RuleProfile {
  id: string
  label: string
  scope: Subject2RuleProfileScope
  sourceNote: string
  limits: Subject2RuleLimits
}

export interface CreateSubject2RuleProfileInput {
  id: string
  label: string
  scope: Subject2RuleProfileScope
  sourceNote: string
  overrides?: Subject2RuleLimitOverrides
}

function positive(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number`)
  }
}

function nonNegative(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number`)
  }
}

export function validateSubject2RuleLimits(limits: Subject2RuleLimits) {
  if (!Number.isFinite(limits.passScore) || limits.passScore <= 0 || limits.passScore > 100) {
    throw new Error('passScore must be within (0, 100]')
  }

  positive(limits.reverseParking.timeLimitSeconds, 'reverseParking.timeLimitSeconds')
  positive(limits.reverseParking.stopLimitSeconds, 'reverseParking.stopLimitSeconds')
  positive(limits.reverseParking.parkedHoldSeconds, 'reverseParking.parkedHoldSeconds')

  positive(limits.sideParking.timeLimitSeconds, 'sideParking.timeLimitSeconds')
  positive(limits.sideParking.stopLimitSeconds, 'sideParking.stopLimitSeconds')
  positive(limits.sideParking.parkedHoldSeconds, 'sideParking.parkedHoldSeconds')
  positive(limits.sideParking.bodyOutAfterStopHoldSeconds, 'sideParking.bodyOutAfterStopHoldSeconds')

  positive(limits.slopeStart.stopHoldSeconds, 'slopeStart.stopHoldSeconds')
  positive(limits.slopeStart.startLimitSeconds, 'slopeStart.startLimitSeconds')
  positive(limits.slopeStart.parkingBrakeCheckSeconds, 'slopeStart.parkingBrakeCheckSeconds')
  nonNegative(limits.slopeStart.stopLongitudinalMinorMeters, 'slopeStart.stopLongitudinalMinorMeters')
  positive(limits.slopeStart.stopLongitudinalFatalMeters, 'slopeStart.stopLongitudinalFatalMeters')
  nonNegative(limits.slopeStart.rightGapMinorMeters, 'slopeStart.rightGapMinorMeters')
  positive(limits.slopeStart.rightGapFatalMeters, 'slopeStart.rightGapFatalMeters')
  nonNegative(limits.slopeStart.rollbackMinimumMeters, 'slopeStart.rollbackMinimumMeters')
  positive(limits.slopeStart.rollbackFatalMeters, 'slopeStart.rollbackFatalMeters')
  nonNegative(limits.slopeStart.rollbackEvaluateAfterForwardMeters, 'slopeStart.rollbackEvaluateAfterForwardMeters')
  nonNegative(limits.slopeStart.measurementEpsilon, 'slopeStart.measurementEpsilon')

  if (limits.slopeStart.stopLongitudinalMinorMeters >= limits.slopeStart.stopLongitudinalFatalMeters) {
    throw new Error('slopeStart longitudinal minor limit must be below fatal limit')
  }
  if (limits.slopeStart.rightGapMinorMeters >= limits.slopeStart.rightGapFatalMeters) {
    throw new Error('slopeStart right-gap minor limit must be below fatal limit')
  }
  if (limits.slopeStart.rollbackMinimumMeters >= limits.slopeStart.rollbackFatalMeters) {
    throw new Error('slopeStart rollback minimum must be below fatal limit')
  }

  positive(limits.curveDriving.stopLimitSeconds, 'curveDriving.stopLimitSeconds')
  positive(limits.rightAngle.stopLimitSeconds, 'rightAngle.stopLimitSeconds')

  return limits
}

export function createSubject2RuleProfile(
  input: CreateSubject2RuleProfileInput,
): Subject2RuleProfile {
  const id = input.id.trim()
  const label = input.label.trim()
  const sourceNote = input.sourceNote.trim()
  if (!id) throw new Error('rule profile id is required')
  if (!label) throw new Error('rule profile label is required')
  if (!sourceNote) throw new Error('rule profile sourceNote is required')

  const overrides = input.overrides ?? {}
  const limits: Subject2RuleLimits = {
    passScore: overrides.passScore ?? SUBJECT2_RULE_LIMITS.passScore,
    reverseParking: {
      ...SUBJECT2_RULE_LIMITS.reverseParking,
      ...overrides.reverseParking,
    },
    sideParking: {
      ...SUBJECT2_RULE_LIMITS.sideParking,
      ...overrides.sideParking,
    },
    slopeStart: {
      ...SUBJECT2_RULE_LIMITS.slopeStart,
      ...overrides.slopeStart,
    },
    curveDriving: {
      ...SUBJECT2_RULE_LIMITS.curveDriving,
      ...overrides.curveDriving,
    },
    rightAngle: {
      ...SUBJECT2_RULE_LIMITS.rightAngle,
      ...overrides.rightAngle,
    },
  }

  validateSubject2RuleLimits(limits)
  return { id, label, scope: input.scope, sourceNote, limits }
}

export const SUBJECT2_NATIONAL_RULE_PROFILE = createSubject2RuleProfile({
  id: 'cn-national-baseline',
  label: '中国大陆科目二全国规则基线',
  scope: 'national',
  sourceNote: 'Repository baseline; preserves the validated Subject 2 rule values already used by the simulator.',
})
