import { DRIVING_RULES } from '../rules/drivingRules'
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
  const approachX = 0.62
  const turnStartZ = -1.18
  const rearAxle = DRIVING_RULES.steering.rearAxleFromCenterMeters
  const rearTurnRadius =
    DRIVING_RULES.steering.wheelbaseMeters /
    Math.tan(DRIVING_RULES.steering.roadWheelMaxAngleRadians)
  const turnCenter = {
    x: approachX - rearTurnRadius,
    z: turnStartZ + rearAxle,
  }
  const startVector = {
    x: rearTurnRadius,
    z: -rearAxle,
  }
  const waypoints: CoachWaypoint[] = []

  for (let z = 6.6; z > turnStartZ; z -= 0.55) {
    waypoints.push({
      x: approachX,
      z,
      targetSpeedMps: z > 1 ? 0.92 : 0.72,
      gear: 1,
      arrivalRadiusMeters: 0.62,
      leftIndicator: true,
      label: z > 1
        ? '直角转弯示范 · 靠右低速进场'
        : '直角转弯示范 · 左灯已开启，准备转弯',
    })
  }
  waypoints.push({
    x: approachX,
    z: turnStartZ,
    targetSpeedMps: 0.65,
    gear: 1,
    arrivalRadiusMeters: 0.5,
    leftIndicator: true,
    label: '直角转弯示范 · 到达转向起点',
  })

  const arcSteps = 30
  let exitX = approachX
  let exitZ = turnStartZ
  for (let index = 1; index <= arcSteps; index++) {
    const theta = -Math.PI / 2 * (index / arcSteps)
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    const rotatedX = startVector.x * cos - startVector.z * sin
    const rotatedZ = startVector.x * sin + startVector.z * cos
    const x = turnCenter.x + rotatedX
    const z = turnCenter.z + rotatedZ
    exitX = x
    exitZ = z
    waypoints.push({
      x,
      z,
      targetSpeedMps: 0.62,
      gear: 1,
      arrivalRadiusMeters: 0.48,
      leftIndicator: theta > -1.28,
      label: theta > -1.28
        ? '直角转弯示范 · 按车辆最小转弯半径连续左转'
        : '直角转弯示范 · 出弯回正并关闭左转向灯',
    })
  }

  for (let x = exitX - 0.55; x > -7.0; x -= 0.55) {
    waypoints.push({
      x,
      z: exitZ,
      targetSpeedMps: 0.82,
      gear: 1,
      arrivalRadiusMeters: 0.52,
      leftIndicator: false,
      label: '直角转弯示范 · 保持直线驶出',
    })
  }
  waypoints.push({
    x: -7.38,
    z: exitZ,
    targetSpeedMps: 0.78,
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
