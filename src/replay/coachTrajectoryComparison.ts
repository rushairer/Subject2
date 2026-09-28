import {
  subject2CoachPlan,
  subject2ContinuousCoachPlan,
} from '../coach/subject2Coach'
import {
  subject2ExamTransitions,
} from '../subject2/subject2ExamLayout'
import {
  subject2StartPose,
  type Subject2ProjectId,
} from '../subject2/courseStartPoses'

export interface CoachReferencePoint {
  x: number
  z: number
}

const SUBJECT2_PROJECTS = new Set<Subject2ProjectId>([
  'reverse-parking',
  'side-parking',
  'slope-start',
  'curve-driving',
  'right-angle',
])

function subject2Project(project: string): Subject2ProjectId | null {
  return SUBJECT2_PROJECTS.has(project as Subject2ProjectId)
    ? project as Subject2ProjectId
    : null
}

export function coachReferencePathForReplay(
  project: string,
  automatic: boolean,
): CoachReferencePoint[] {
  if (project.startsWith('transition:')) {
    const [, from, to] = project.split(':')
    const target = subject2Project(to)
    if (!target) return []

    let transitionAutomatic = automatic
    let transition = subject2ExamTransitions(transitionAutomatic)
      .find(item => item.from === from && item.to === target)
    if (!transition) {
      transitionAutomatic = !automatic
      transition = subject2ExamTransitions(transitionAutomatic)
        .find(item => item.from === from && item.to === target)
    }
    const plan = transition
      ? subject2ContinuousCoachPlan(target, false, transitionAutomatic)
      : null
    if (!transition || !plan) return []

    return [
      { x: transition.start.x, z: transition.start.z },
      ...plan.waypoints.map(point => ({ x: point.x, z: point.z })),
    ]
  }

  const target = subject2Project(project)
  if (!target) return []
  const plan = subject2CoachPlan(target)
  if (!plan) return []
  const start = subject2StartPose(target)

  return [
    { x: start.x, z: start.z },
    ...plan.waypoints.map(point => ({ x: point.x, z: point.z })),
  ]
}

export function distanceToCoachPath(
  point: CoachReferencePoint,
  path: readonly CoachReferencePoint[],
): number | null {
  if (path.length === 0) return null
  if (path.length === 1) {
    return Math.hypot(point.x - path[0]!.x, point.z - path[0]!.z)
  }

  let best = Number.POSITIVE_INFINITY
  for (let index = 1; index < path.length; index++) {
    const start = path[index - 1]!
    const end = path[index]!
    const dx = end.x - start.x
    const dz = end.z - start.z
    const lengthSquared = dx * dx + dz * dz

    if (lengthSquared < 1e-9) {
      best = Math.min(best, Math.hypot(point.x - start.x, point.z - start.z))
      continue
    }

    const projection = Math.max(
      0,
      Math.min(
        1,
        ((point.x - start.x) * dx + (point.z - start.z) * dz) /
          lengthSquared,
      ),
    )
    const nearestX = start.x + dx * projection
    const nearestZ = start.z + dz * projection
    best = Math.min(
      best,
      Math.hypot(point.x - nearestX, point.z - nearestZ),
    )
  }

  return Number.isFinite(best) ? best : null
}

export interface CoachDeviationStats {
  averageMeters: number
  maxMeters: number
  maxIndex: number
  distances: number[]
}

export function coachDeviationStats(
  samples: readonly CoachReferencePoint[],
  path: readonly CoachReferencePoint[],
): CoachDeviationStats | null {
  if (samples.length === 0 || path.length === 0) return null

  const distances = samples.map(sample =>
    distanceToCoachPath(sample, path) ?? 0,
  )
  let maxMeters = 0
  let maxIndex = 0
  let total = 0

  distances.forEach((distance, index) => {
    total += distance
    if (distance > maxMeters) {
      maxMeters = distance
      maxIndex = index
    }
  })

  return {
    averageMeters: total / distances.length,
    maxMeters,
    maxIndex,
    distances,
  }
}
