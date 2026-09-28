import { CURVE_CENTERLINE } from '../subject2/CurveDrivingCourse'
import type { Subject2ProjectId } from '../subject2/courseStartPoses'
import type { CoachPlan, CoachWaypoint } from './coachController'

function curveWaypoints(): CoachWaypoint[] {
  return CURVE_CENTERLINE.map((point, index) => ({
    x: point.x,
    z: point.z,
    targetSpeedMps: index > CURVE_CENTERLINE.length - 8 ? 0.9 : 1.25,
    gear: 1,
    arrivalRadiusMeters: 0.8,
    label: `曲线行驶示范 · ${Math.min(100, Math.round(index / (CURVE_CENTERLINE.length - 1) * 100))}%`,
  }))
}

const CURVE_DRIVING_COACH_PLAN: CoachPlan = {
  id: 'curve-driving',
  title: '曲线行驶教练示范',
  waypoints: curveWaypoints(),
  lookAheadWaypoints: 4,
}

export function subject2CoachPlan(project: Subject2ProjectId): CoachPlan | null {
  if (project === 'curve-driving') return CURVE_DRIVING_COACH_PLAN
  return null
}

export function subject2CoachSupported(project: Subject2ProjectId) {
  return subject2CoachPlan(project) !== null
}
