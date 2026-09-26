export type SessionResultStatus = 'passed' | 'failed' | 'incomplete'

export function assessSessionResult({ examId, score, completed, infractions }: {
  examId: string
  score: number
  completed: boolean
  infractions: readonly { fatal?: boolean }[]
}): { passLine: number; passed: boolean; status: SessionResultStatus } {
  const passLine = examId === 'subject3' ? 90 : 80
  const failed = !Number.isFinite(score) || score < passLine || infractions.some(item => item.fatal)
  const status: SessionResultStatus = failed ? 'failed' : completed ? 'passed' : 'incomplete'
  return { passLine, passed: status === 'passed', status }
}
