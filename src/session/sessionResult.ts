import { SUBJECT2_RULE_LIMITS } from '../rules/subject2Rules'

export type SessionResultStatus = 'passed' | 'failed' | 'incomplete'

export function passLineForExam(examId: string) {
  return examId === 'subject3' ? 90 : SUBJECT2_RULE_LIMITS.passScore
}

export function assessSessionResult({ examId, score, completed, infractions }: {
  examId: string
  score: number
  completed: boolean
  infractions: readonly { fatal?: boolean }[]
}): { passLine: number; passed: boolean; status: SessionResultStatus } {
  const passLine = passLineForExam(examId)
  const failed = !Number.isFinite(score) || score < passLine || infractions.some(item => item.fatal)
  const status: SessionResultStatus = failed ? 'failed' : completed ? 'passed' : 'incomplete'
  return { passLine, passed: status === 'passed', status }
}
