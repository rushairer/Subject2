export interface StoredCandidate {
  name: string
  gender: '男' | '女' | '其他'
  age: number
  licenseType: 'C1' | 'C2'
}

export interface ExamHistoryEntry {
  id: string
  createdAt: number
  candidateName: string
  licenseType: 'C1' | 'C2'
  examId: string
  mode: 'practice' | 'exam'
  score: number
  passed: boolean
  infractionCount: number
}

const PROFILE_KEY = 'subject2.candidate.v1'
const HISTORY_KEY = 'subject2.examHistory.v1'
const HISTORY_LIMIT = 20

export function loadCandidate(): StoredCandidate | null {
  if (typeof window === 'undefined') return null
  try {
    const value = window.localStorage.getItem(PROFILE_KEY)
    if (!value) return null
    const parsed = JSON.parse(value) as StoredCandidate
    if (!parsed.name || !['C1', 'C2'].includes(parsed.licenseType)) return null
    return parsed
  } catch {
    return null
  }
}

export function saveCandidate(candidate: StoredCandidate) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(candidate))
  } catch {
    // Local storage can be unavailable in privacy modes; the simulator still works in-memory.
  }
}

export function loadExamHistory(): ExamHistoryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const value = window.localStorage.getItem(HISTORY_KEY)
    if (!value) return []
    const parsed = JSON.parse(value) as ExamHistoryEntry[]
    return Array.isArray(parsed) ? parsed.slice(0, HISTORY_LIMIT) : []
  } catch {
    return []
  }
}

export function appendExamHistory(entry: ExamHistoryEntry) {
  if (typeof window === 'undefined') return
  try {
    const next = [entry, ...loadExamHistory()].slice(0, HISTORY_LIMIT)
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    // Ignore storage failures; result rendering remains available for the current session.
  }
}
