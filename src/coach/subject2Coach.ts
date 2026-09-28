import { CURVE_CENTERLINE } from '../subject2/CurveDrivingCourse'
import { RIGHT_ANGLE_GEOMETRY } from '../subject2/RightAngleCourse'
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

function rightAngleWaypoints(): CoachWaypoint[] {
  const g = RIGHT_ANGLE_GEOMETRY
  const radius = 2.3
  const innerCorner = {
    x: -g.half,
    z: g.cornerCenterZ + g.half,
  }
  const approachX = innerCorner.x + radius
  const waypoints: CoachWaypoint[] = []

  for (let z = 6.6; z > innerCorner.z; z -= 0.6) {
    waypoints.push({
      x: approachX,
      z,
      targetSpeedMps: z > 1 ? 0.95 : 0.82,
      gear: 1,
      arrivalRadiusMeters: 0.68,
      leftIndicator: true,
      label: z > 1
        ? '直角转弯示范 · 靠右低速进场'
        : '直角转弯示范 · 左灯已开启，准备转弯',
    })
  }
  waypoints.push({
    x: approachX,
    z: innerCorner.z,
    targetSpeedMps: 0.78,
    gear: 1,
    arrivalRadiusMeters: 0.62,
    leftIndicator: true,
    label: '直角转弯示范 · 到达转向起点',
  })

  const arcSteps = 22
  for (let index = 1; index <= arcSteps; index++) {
    const theta = -Math.PI / 2 * (index / arcSteps)
    waypoints.push({
      x: innerCorner.x + radius * Math.cos(theta),
      z: innerCorner.z + radius * Math.sin(theta),
      targetSpeedMps: 0.72,
      gear: 1,
      arrivalRadiusMeters: 0.48,
      leftIndicator: true,
      label: '直角转弯示范 · 连续左转，保持内轮差余量',
    })
  }

  const exitZ = innerCorner.z - radius
  for (let x = -2.45; x > -7.0; x -= 0.65) {
    waypoints.push({
      x,
      z: exitZ,
      targetSpeedMps: x > -4 ? 0.82 : 0.95,
      gear: 1,
      arrivalRadiusMeters: 0.58,
      leftIndicator: x > -4.05,
      label: x > -4.05
        ? '直角转弯示范 · 出弯回正'
        : '直角转弯示范 · 关闭左转向灯并直线驶出',
    })
  }
  waypoints.push({
    x: -7.38,
    z: exitZ,
    targetSpeedMps: 0.82,
    gear: 1,
    arrivalRadiusMeters: 0.1,
    leftIndicator: false,
    label: '直角转弯示范 · 完成项目',
  })

  return waypoints
}

const CURVE_DRIVING_COACH_PLAN: CoachPlan = {
  id: 'curve-driving',
  title: '曲线行驶教练示范',
  waypoints: curveWaypoints(),
  lookAheadWaypoints: 4,
}

const RIGHT_ANGLE_COACH_PLAN: CoachPlan = {
  id: 'right-angle',
  title: '直角转弯教练示范',
  waypoints: rightAngleWaypoints(),
  lookAheadWaypoints: 2,
}

export function subject2CoachPlan(project: Subject2ProjectId): CoachPlan | null {
  if (project === 'curve-driving') return CURVE_DRIVING_COACH_PLAN
  if (project === 'right-angle') return RIGHT_ANGLE_COACH_PLAN
  return null
}

export function subject2CoachSupported(project: Subject2ProjectId) {
  return subject2CoachPlan(project) !== null
}
