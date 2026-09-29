export type CoachDemoExamId = 'subject2-exam' | 'subject3'
export type CoachDemoTimeOfDay = 'day' | 'night'

export interface CoachDemoSessionState {
  coachDemo?: boolean
}

export function createCoachDemoSession(
  examId: CoachDemoExamId,
  time: CoachDemoTimeOfDay,
) {
  return {
    examId,
    mode: 'practice' as const,
    time,
    coachDemo: true as const,
  }
}

export function isCoachDemoSession(
  session: CoachDemoSessionState,
) {
  return session.coachDemo === true
}

export function shouldPersistPersonalResult(
  session: CoachDemoSessionState,
) {
  return !isCoachDemoSession(session)
}
