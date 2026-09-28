import { DRIVING_RULES } from '../rules/drivingRules'
import { CURVE_CENTERLINE } from '../subject2/CurveDrivingCourse'
import { RIGHT_ANGLE_GEOMETRY } from '../subject2/RightAngleCourse'
import { REVERSE_PARKING_GEOMETRY } from '../subject2/ReverseParkingCourse'
import { SIDE_PARKING_GEOMETRY } from '../subject2/SideParkingCourse'
import { SLOPE_GEOMETRY, SLOPE_START } from '../subject2/SlopeStartCourse'
import type { Subject2ProjectId } from '../subject2/courseStartPoses'
import { normalizeHeadingDelta } from '../sim/vehicleFrame'
import { localPointToWorld } from '../subject2/courseTransform'
import {
  SUBJECT2_EXAM_PLACEMENTS,
  subject2ExamTransitions,
} from '../subject2/subject2ExamLayout'
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
  const turnStartZ = -0.98
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


function reverseParkingWaypoints(): CoachWaypoint[] {
  const g = REVERSE_PARKING_GEOMETRY
  const bayCenterX = (g.bayMouthX + g.bayBackX) / 2
  const rearAxle = DRIVING_RULES.steering.rearAxleFromCenterMeters
  const reverseStagingX = 0
  const reverseTurnStartZ = 5.0 + rearAxle
  const exitTurnRadius = 4.31
  // Drive far enough out of the bay that the 4.4 m body is substantially
  // inside the 6.7 m lane before beginning the 90-degree forward turn.
  const outboundTurnX = 1.7
  const outboundLaneX = outboundTurnX + rearAxle - exitTurnRadius
  const exitTurnZ = exitTurnRadius + rearAxle
  const turnStartZ = reverseTurnStartZ
  const northStopZ = g.startControlZ + 0.65
  const points: CoachWaypoint[] = []

  const push = (waypoint: CoachWaypoint) => points.push(waypoint)

  const appendControlledPath = (
    start: { x: number; z: number; heading: number },
    gear: -1 | 1,
    segments: readonly { steering: number; distance: number }[],
    label: string,
  ) => {
    let pose = { ...start }
    const stepMeters = 0.25

    for (const segment of segments) {
      const steps = Math.max(1, Math.ceil(segment.distance / stepMeters))
      const distancePerStep = segment.distance / steps
      for (let index = 0; index < steps; index++) {
        const signedDistance = distancePerStep * gear
        const forwardX = Math.sin(pose.heading)
        const forwardZ = -Math.cos(pose.heading)
        let rearAxleX = pose.x - forwardX * rearAxle
        let rearAxleZ = pose.z - forwardZ * rearAxle
        const headingDelta =
          signedDistance / DRIVING_RULES.steering.wheelbaseMeters *
          Math.tan(segment.steering)
        const headingMid = pose.heading + headingDelta * 0.5
        rearAxleX += Math.sin(headingMid) * signedDistance
        rearAxleZ -= Math.cos(headingMid) * signedDistance
        const heading = pose.heading + headingDelta
        pose = {
          x: rearAxleX + Math.sin(heading) * rearAxle,
          z: rearAxleZ - Math.cos(heading) * rearAxle,
          heading,
        }
        push({
          x: pose.x,
          z: pose.z,
          targetSpeedMps: Math.abs(segment.steering) > 0.3 ? 0.42 : 0.36,
          gear,
          // Waypoints are generated about 0.25 m apart. Keep the capture
          // radius below that spacing so one physics step cannot consume
          // multiple arc points and switch curvature before the car arrives.
          arrivalRadiusMeters: 0.12,
          pathCurvaturePerMeter:
            gear * Math.tan(segment.steering) /
            DRIVING_RULES.steering.wheelbaseMeters,
          label,
        })
      }
    }
    return pose
  }

  const reverseParkingSegments = [
    { steering: -0.58, distance: 0.75 },
    { steering: 0, distance: 0.75 },
    { steering: -0.58, distance: 2.25 },
    { steering: -0.15, distance: 0.25 },
    { steering: -0.58, distance: 3.5 },
    { steering: -0.45, distance: 0.25 },
    { steering: 0, distance: 2.9 },
  ] as const
  const secondReverseParkingSegments = reverseParkingSegments.map(
    (segment, index) => ({
      steering: -segment.steering,
      // Keep a little extra rear clearance from the 5.1 m bay back line on
      // the mirrored second entry. The real body judge includes all corners.
      distance:
        index === reverseParkingSegments.length - 1
          ? segment.distance - 0.15
          : segment.distance,
    }),
  )

  const forwardExitArcPoint = (theta: number, north: boolean) => {
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    return {
      x: outboundTurnX + rearAxle * (1 - cos) - exitTurnRadius * sin,
      z: north
        ? exitTurnRadius * (1 - cos) + rearAxle * sin
        : -(exitTurnRadius * (1 - cos) + rearAxle * sin),
    }
  }

  // Enter straight, then use the available approach length to move onto the
  // reverse staging line. Avoid making waypoint 0 a large lateral correction.
  ;[
    [0, 6.0],
    [reverseStagingX * 0.35, 6.35],
    [reverseStagingX * 0.72, 6.7],
    [reverseStagingX, 7.05],
    [reverseStagingX, 7.4],
    [reverseStagingX, 7.7],
    [reverseStagingX, 8.0],
    [reverseStagingX, 8.25],
  ].forEach(([x, z], index, staging) => push({
    x,
    z,
    targetSpeedMps: index < staging.length - 3 ? 0.62 : 0.48,
    gear: 1,
    arrivalRadiusMeters: 0.42,
    ...(index >= staging.length - 3
      ? { pathCurvaturePerMeter: 0, headingHoldRadians: Math.PI }
      : {}),
    label: index < staging.length - 3
      ? '倒车入库示范 · 驶过起始控制线并平顺调整倒库位置'
      : '倒车入库示范 · 保持直线，车身回正',
  }))
  push({
    x: reverseStagingX,
    z: northStopZ,
    targetSpeedMps: 0,
    gear: 1,
    stop: true,
    holdSeconds: 0.3,
    arrivalRadiusMeters: 0.18,
    label: '倒车入库示范 · 停稳，准备挂倒挡',
  })

  for (let z = northStopZ - 0.3; z > turnStartZ + 0.16; z -= 0.3) {
    push({
      x: reverseStagingX,
      z,
      targetSpeedMps: 0.5,
      gear: -1,
      arrivalRadiusMeters: 0.14,
      pathCurvaturePerMeter: 0,
      headingHoldRadians: Math.PI,
      label: '第一次倒库 · 保持车身朝向并直线后倒到转向点',
    })
  }

  const firstTurnPose = {
    x: reverseStagingX,
    z: turnStartZ,
    heading: Math.PI,
  }
  push({
    x: firstTurnPose.x,
    z: firstTurnPose.z,
    targetSpeedMps: 0.4,
    gear: -1,
    arrivalRadiusMeters: 0.12,
    pathCurvaturePerMeter: 0,
    headingHoldRadians: Math.PI,
    requireCapture: true,
    label: '第一次倒库 · 精确对中后进入复合转向',
  })
  const firstParkPose = appendControlledPath(
    firstTurnPose,
    -1,
    reverseParkingSegments,
    '第一次倒库 · 按车身扫掠余量完成复合转向',
  )

  push({
    x: firstParkPose.x,
    z: firstParkPose.z,
    targetSpeedMps: 0,
    gear: -1,
    stop: true,
    holdSeconds: 0.72,
    arrivalRadiusMeters: 0.18,
    pathCurvaturePerMeter: 0,
    label: '第一次倒库 · 完全入库并停稳',
  })


  for (let x = bayCenterX - 0.3; x > outboundTurnX + 0.16; x -= 0.3) {
    push({
      x,
      z: 0,
      targetSpeedMps: 0.5,
      gear: 1,
      arrivalRadiusMeters: 0.35,
      label: '第一次出库 · 直线驶出库位',
    })
  }

  const southArcSteps = 36
  {
    const point = forwardExitArcPoint(0, false)
    push({
      ...point,
      targetSpeedMps: 0.46,
      gear: 1,
      arrivalRadiusMeters: 0.12,
      pathCurvaturePerMeter: 0,
      requireCapture: true,
      label: '驶向另一端 · 精确到达出库转向点',
    })
  }
  for (let index = 1; index <= southArcSteps; index++) {
    const theta = Math.PI / 2 * (index / southArcSteps)
    const point = forwardExitArcPoint(theta, false)
    push({
      ...point,
      targetSpeedMps: 0.56,
      gear: 1,
      arrivalRadiusMeters: 0.09,
      pathCurvaturePerMeter: 1 / exitTurnRadius,
      label: '驶向另一端 · 按后轴转弯半径进入纵向车道',
    })
  }

  const secondSetupStartPose = {
    x: outboundLaneX,
    z: -exitTurnZ,
    heading: 0,
  }
  push({
    x: secondSetupStartPose.x,
    z: secondSetupStartPose.z,
    targetSpeedMps: 0.46,
    gear: 1,
    arrivalRadiusMeters: 0.14,
    requireCapture: true,
    label: '驶向另一端 · 出库后进入第二次倒库摆位',
  })
  const secondStagingPose = appendControlledPath(
    secondSetupStartPose,
    1,
    [
      { steering: 0.58, distance: 1.65 },
      { steering: -0.58, distance: 1.65 },
    ],
    '驶向另一端 · S 形横移并重新回正车身',
  )
  push({
    x: secondStagingPose.x,
    z: secondStagingPose.z,
    targetSpeedMps: 0,
    gear: 1,
    stop: true,
    holdSeconds: 0.3,
    arrivalRadiusMeters: 0.18,
    pathCurvaturePerMeter: 0,
    headingHoldRadians: 0,
    label: '另一端控制线外停稳 · 车身已回正，准备第二次倒库',
  })

  for (
    let z = secondStagingPose.z + 0.3;
    z < -turnStartZ - 0.16;
    z += 0.3
  ) {
    push({
      x: secondStagingPose.x,
      z,
      targetSpeedMps: 0.5,
      gear: -1,
      arrivalRadiusMeters: 0.14,
      pathCurvaturePerMeter: 0,
      headingHoldRadians: 0,
      label: '第二次倒库 · 保持车身朝向并直线后倒到转向点',
    })
  }

  const secondTurnPose = {
    x: secondStagingPose.x,
    z: -turnStartZ,
    heading: 0,
  }
  push({
    x: secondTurnPose.x,
    z: secondTurnPose.z,
    targetSpeedMps: 0.4,
    gear: -1,
    arrivalRadiusMeters: 0.12,
    pathCurvaturePerMeter: 0,
    headingHoldRadians: 0,
    requireCapture: true,
    label: '第二次倒库 · 精确对中后进入复合转向',
  })
  const secondParkPose = appendControlledPath(
    secondTurnPose,
    -1,
    secondReverseParkingSegments,
    '第二次倒库 · 按车身扫掠余量完成复合转向',
  )

  push({
    x: bayCenterX,
    z: 0,
    targetSpeedMps: 0,
    gear: -1,
    stop: true,
    holdSeconds: 0.72,
    arrivalRadiusMeters: 0.18,
    pathCurvaturePerMeter: 0,
    headingHoldRadians: Math.PI * 1.5,
    label: '第二次倒库 · 对准库位中心后停稳',
  })


  for (let x = bayCenterX - 0.3; x > outboundTurnX + 0.16; x -= 0.3) {
    push({
      x,
      z: 0,
      targetSpeedMps: 0.5,
      gear: 1,
      arrivalRadiusMeters: 0.35,
      label: '第二次出库 · 直线驶出库位',
    })
  }

  const northArcSteps = 36
  {
    const point = forwardExitArcPoint(0, true)
    push({
      ...point,
      targetSpeedMps: 0.46,
      gear: 1,
      arrivalRadiusMeters: 0.12,
      pathCurvaturePerMeter: 0,
      requireCapture: true,
      label: '返回起始端 · 精确到达出库转向点',
    })
  }
  for (let index = 1; index <= northArcSteps; index++) {
    const theta = Math.PI / 2 * (index / northArcSteps)
    const point = forwardExitArcPoint(theta, true)
    push({
      ...point,
      targetSpeedMps: 0.56,
      gear: 1,
      arrivalRadiusMeters: 0.09,
      pathCurvaturePerMeter: -1 / exitTurnRadius,
      label: '返回起始端 · 按后轴转弯半径进入纵向车道',
    })
  }

  for (let z = exitTurnZ + 0.4; z < northStopZ - 0.16; z += 0.4) {
    push({
      x: outboundLaneX,
      z,
      targetSpeedMps: 0.72,
      gear: 1,
      arrivalRadiusMeters: 0.46,
      label: '返回起始端 · 保持直线驶过控制线',
    })
  }
  push({
    x: outboundLaneX,
    z: northStopZ,
    targetSpeedMps: 0.7,
    gear: 1,
    arrivalRadiusMeters: 0.1,
    label: '倒车入库示范 · 完成项目',
  })

  return points
}


function sideParkingWaypoints(): CoachWaypoint[] {
  const g = SIDE_PARKING_GEOMETRY
  const rearAxle = DRIVING_RULES.steering.rearAxleFromCenterMeters
  const wheelbase = DRIVING_RULES.steering.wheelbaseMeters
  const staging = { x: 0.6, z: -5.4, heading: 0 }
  const points: CoachWaypoint[] = []

  const push = (waypoint: CoachWaypoint) => points.push(waypoint)

  const appendKinematicPath = (
    start: { x: number; z: number; heading: number },
    gear: -1 | 1,
    segments: readonly { steering: number; distance: number }[],
    label: string,
    leftIndicator: boolean,
  ) => {
    let pose = { ...start }
    const stepMeters = 0.22

    for (const segment of segments) {
      const steps = Math.max(1, Math.ceil(segment.distance / stepMeters))
      const distancePerStep = segment.distance / steps
      for (let index = 0; index < steps; index++) {
        const signedDistance = distancePerStep * gear
        const forwardX = Math.sin(pose.heading)
        const forwardZ = -Math.cos(pose.heading)
        let rearAxleX = pose.x - forwardX * rearAxle
        let rearAxleZ = pose.z - forwardZ * rearAxle
        const headingDelta =
          signedDistance / wheelbase * Math.tan(segment.steering)
        const headingMid = pose.heading + headingDelta * 0.5
        rearAxleX += Math.sin(headingMid) * signedDistance
        rearAxleZ -= Math.cos(headingMid) * signedDistance
        const heading = pose.heading + headingDelta
        pose = {
          x: rearAxleX + Math.sin(heading) * rearAxle,
          z: rearAxleZ - Math.cos(heading) * rearAxle,
          heading,
        }
        push({
          x: pose.x,
          z: pose.z,
          targetSpeedMps: 0.42,
          gear,
          arrivalRadiusMeters: 0.11,
          pathCurvaturePerMeter:
            gear * Math.tan(segment.steering) / wheelbase,
          leftIndicator,
          label,
        })
      }
    }
    return pose
  }

  ;[
    [0, 7.5],
    [0.08, 6.0],
    [0.22, 4.0],
    [0.4, 2.0],
    [0.54, 0],
    [staging.x, -2.0],
    [staging.x, -3.4],
    [staging.x, -4.4],
  ].forEach(([x, z], index, approach) => push({
    x,
    z,
    targetSpeedMps: index < approach.length - 3 ? 0.72 : 0.52,
    gear: 1,
    arrivalRadiusMeters: 0.42,
    ...(index >= approach.length - 3
      ? { pathCurvaturePerMeter: 0, headingHoldRadians: 0 }
      : {}),
    label: index < approach.length - 3
      ? '侧方停车示范 · 驶过库位并靠右调整'
      : '侧方停车示范 · 保持车身平行，准备停车挂倒挡',
  }))
  push({
    x: staging.x,
    z: staging.z,
    targetSpeedMps: 0,
    gear: 1,
    stop: true,
    holdSeconds: 0.35,
    arrivalRadiusMeters: 0.16,
    pathCurvaturePerMeter: 0,
    headingHoldRadians: 0,
    label: '侧方停车示范 · 停稳，准备挂倒挡',
  })

  const parkedPose = appendKinematicPath(
    staging,
    -1,
    [
      { steering: 0.58, distance: 3.25 },
      { steering: -0.58, distance: 3.25 },
    ],
    '侧方停车示范 · 倒车右打后左打回正入库',
    false,
  )

  push({
    x: parkedPose.x,
    z: parkedPose.z,
    targetSpeedMps: 0,
    gear: -1,
    stop: true,
    holdSeconds: 0.72,
    // The bay has ample longitudinal clearance; capture the stop early enough
    // to brake before automatic creep can step past a tiny point target.
    arrivalRadiusMeters: 0.5,
    pathCurvaturePerMeter: 0,
    headingHoldRadians: 0,
    label: '侧方停车示范 · 车身完全入库并停稳',
  })

  appendKinematicPath(
    parkedPose,
    1,
    [
      { steering: -0.58, distance: 3.25 },
      { steering: 0.58, distance: 3.25 },
    ],
    '侧方停车示范 · 左灯开启，前进驶出库位',
    true,
  )

  push({
    x: staging.x,
    z: Math.min(staging.z, g.exitCompleteZ - 0.25),
    targetSpeedMps: 0.62,
    gear: 1,
    arrivalRadiusMeters: 0.2,
    pathCurvaturePerMeter: 0,
    headingHoldRadians: 0,
    leftIndicator: false,
    label: '侧方停车示范 · 驶出完成',
  })

  return points
}


function slopeStartWaypoints(): CoachWaypoint[] {
  const stopX =
    SLOPE_GEOMETRY.roadHalf -
    SLOPE_START.carWidth / 2 -
    0.2
  const stopZ =
    SLOPE_GEOMETRY.stopLineZ +
    SLOPE_START.carLength / 2
  const points: CoachWaypoint[] = []

  const push = (waypoint: CoachWaypoint) => points.push(waypoint)

  ;[
    [0.4, 10.2, 0.75],
    [0.44, 8.2, 0.72],
    [0.48, 6.2, 0.62],
    [stopX, 4.5, 0.5],
    [stopX, 3.2, 0.4],
    [stopX, 2.4, 0.28],
    [stopX, 1.95, 0.2],
  ].forEach(([x, z, speed]) => push({
    x,
    z,
    targetSpeedMps: speed,
    gear: 1,
    arrivalRadiusMeters: z < 3 ? 0.16 : 0.4,
    pathCurvaturePerMeter: 0,
    headingHoldRadians: 0,
    label: z < 3
      ? '坡道示范 · 低速对准桩杆线与右侧边距'
      : '坡道示范 · 保持右侧 20cm 参考间距上坡',
  }))

  push({
    x: stopX,
    z: stopZ,
    targetSpeedMps: 0,
    gear: 1,
    stop: true,
    holdSeconds: 1.55,
    arrivalRadiusMeters: 0.14,
    pathCurvaturePerMeter: 0,
    headingHoldRadians: 0,
    handbrake: true,
    label: '坡道示范 · 定点停稳并拉紧手刹',
  })

  ;[
    [0.8, 0.42],
    [-0.4, 0.5],
    [-2.0, 0.62],
    [-5.0, 0.72],
    [-9.0, 0.82],
    [-14.5, 0.85],
    [SLOPE_GEOMETRY.roadEndZ + 0.4, 0.78],
  ].forEach(([z, speed]) => push({
    x: stopX,
    z,
    targetSpeedMps: speed,
    gear: 1,
    arrivalRadiusMeters:
      z <= SLOPE_GEOMETRY.roadEndZ + 0.5 ? 0.15 : 0.35,
    pathCurvaturePerMeter: 0,
    headingHoldRadians: 0,
    handbrake: false,
    label: z > 0
      ? '坡道示范 · 松手刹平稳起步'
      : '坡道示范 · 保持直线驶过坡顶',
  }))

  return points
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

const REVERSE_PARKING_COACH_PLAN: CoachPlan = {
  id: 'reverse-parking',
  title: '倒车入库教练示范',
  waypoints: reverseParkingWaypoints(),
  lookAheadWaypoints: 3,
  steeringGain: 0.45,
  // Curved reverse-parking waypoints are derived from the rear-axle circle.
  // Use that exact curvature on arcs; body-center pursuit briefly points the
  // opposite way while steering builds and would otherwise pull off the arc.
  curvatureFeedforwardBlend: 1,
}

const SIDE_PARKING_COACH_PLAN: CoachPlan = {
  id: 'side-parking',
  title: '侧方停车教练示范',
  waypoints: sideParkingWaypoints(),
  lookAheadWaypoints: 2,
  steeringGain: 0.5,
  curvatureFeedforwardBlend: 1,
}

const SLOPE_START_COACH_PLAN: CoachPlan = {
  id: 'slope-start',
  title: '坡道定点停车与起步教练示范',
  waypoints: slopeStartWaypoints(),
  lookAheadWaypoints: 2,
  steeringGain: 0.45,
  curvatureFeedforwardBlend: 1,
}

export function subject2CoachPlan(project: Subject2ProjectId): CoachPlan | null {
  if (project === 'curve-driving') return CURVE_DRIVING_COACH_PLAN
  if (project === 'right-angle') return RIGHT_ANGLE_COACH_PLAN
  if (project === 'reverse-parking') return REVERSE_PARKING_COACH_PLAN
  if (project === 'side-parking') return SIDE_PARKING_COACH_PLAN
  if (project === 'slope-start') return SLOPE_START_COACH_PLAN
  return null
}

export function subject2CoachSupported(project: Subject2ProjectId) {
  return subject2CoachPlan(project) !== null
}

function worldCoachPlan(
  project: Subject2ProjectId,
  localPlan: CoachPlan,
): CoachPlan {
  const placement = SUBJECT2_EXAM_PLACEMENTS[project]
  return {
    ...localPlan,
    id: `continuous:${project}`,
    title: `${localPlan.title} · 连续考试`,
    waypoints: localPlan.waypoints.map(waypoint => {
      const point = localPointToWorld(waypoint, placement)
      return {
        ...waypoint,
        ...point,
        headingHoldRadians:
          waypoint.headingHoldRadians == null
            ? undefined
            : normalizeHeadingDelta(
                waypoint.headingHoldRadians + placement.heading,
              ),
      }
    }),
  }
}

function transitionCoachPlan(
  project: Subject2ProjectId,
  automatic: boolean,
): CoachPlan | null {
  const transition = subject2ExamTransitions(automatic)
    .find(item => item.to === project)
  if (!transition) return null

  const dx = transition.end.x - transition.start.x
  const dz = transition.end.z - transition.start.z
  const distance = Math.hypot(dx, dz)
  if (distance < 0.1) return null
  const heading = Math.atan2(dx, -dz)
  const steps = Math.max(2, Math.ceil(distance / 2.2))
  const waypoints: CoachWaypoint[] = []

  for (let index = 1; index <= steps; index++) {
    const progress = index / steps
    waypoints.push({
      x: transition.start.x + dx * progress,
      z: transition.start.z + dz * progress,
      targetSpeedMps: index === steps ? 0.9 : 1.45,
      gear: 1,
      arrivalRadiusMeters: index === steps ? 0.55 : 0.9,
      pathCurvaturePerMeter: 0,
      headingHoldRadians: heading,
      label: `连接道路 · 前往${subject2CoachPlan(project)?.title.replace('教练示范', '') ?? project}`,
    })
  }

  return {
    id: `continuous-transition:${transition.from}:${transition.to}`,
    title: `连接道路 · ${transition.from} → ${transition.to}`,
    waypoints,
    lookAheadWaypoints: 3,
    steeringGain: 0.65,
    curvatureFeedforwardBlend: 1,
  }
}

export function subject2ContinuousCoachPlan(
  project: Subject2ProjectId,
  entered: boolean,
  automatic: boolean,
): CoachPlan | null {
  const localPlan = subject2CoachPlan(project)
  if (!localPlan) return null
  if (entered) return worldCoachPlan(project, localPlan)
  return transitionCoachPlan(project, automatic)
}
