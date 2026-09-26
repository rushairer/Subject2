import {
  SUBJECT2_NATIONAL_RULE_PROFILE,
  type Subject2RuleProfile,
} from '../rules/subject2RuleProfile'
import { SUBJECT3_RULE_LIMITS } from '../rules/subject3Rules'

export type SessionResultStatus = 'passed' | 'failed' | 'incomplete'

export function passLineForExam(
  examId: string,
  profile: Subject2RuleProfile = SUBJECT2_NATIONAL_RULE_PROFILE,
) {
  return examId === 'subject3' ? SUBJECT3_RULE_LIMITS.passScore : profile.limits.passScore
}

export function assessSessionResult({ examId, score, completed, infractions, ruleProfile }: {
  examId: string
  score: number
  completed: boolean
  infractions: readonly { fatal?: boolean }[]
  ruleProfile?: Subject2RuleProfile
}): { passLine: number; passed: boolean; status: SessionResultStatus } {
  const passLine = passLineForExam(examId, ruleProfile)
  const failed = !Number.isFinite(score) || score < passLine || infractions.some(item => item.fatal)
  const status: SessionResultStatus = failed ? 'failed' : completed ? 'passed' : 'incomplete'
  return { passLine, passed: status === 'passed', status }
}
