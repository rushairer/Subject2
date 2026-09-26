import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type MutableRefObject, type ReactElement } from 'react'
import * as THREE from 'three'
import { DRIVING_RULES } from '../rules/drivingRules'
import { polygonTouchesOutsideRectUnion } from '../sim/planarGeometry'
import { TRAINING_CAR } from '../sim/vehicleDimensions'
import { vehicleBodyFootprint } from '../sim/vehicleFootprint'
import { sceneYawFromHeading, worldPointFromVehicle } from '../sim/vehicleFrame'
import {
  CENTER_LINE_OFFSET,
  LANE_WIDTH,
  LEFT_EDGE_OFFSET,
  OPPOSITE_DIVIDER,
  ROAD_CENTER_OFFSET,
  ROAD_WIDTH,
  RIGHT_EDGE_OFFSET,
  SAME_DIRECTION_DIVIDER,
  SUBJECT3_EVENTS,
  SUBJECT3_ROUTE,
  SUBJECT3_ROUTE_LENGTH,
  SUBJECT3_ROUTE_NODE_PAD_SIZE,
  SUBJECT3_SEGMENTS,
  SUBJECT3_START,
  poseAtRouteDistance,
  projectToSubject3Route,
  subject3RoadRectsNearProgress,
  type Point,
  type RouteSegment,
  type Subject3RouteEvent,
} from './subject3Route'

export { SUBJECT3_START } from './subject3Route'

export interface Subject3Vehicle {
  x: number
  z: number
  heading: number
  speed: number
  steering: number
  gear: number
  engineOn: boolean
  handbrake: boolean
  leftIndicator: boolean
  rightIndicator: boolean
  horn: boolean
  seatbelt: boolean
  lowBeam: boolean
  highBeam: boolean
  leftSignalAge: number
  rightSignalAge: number
  lookLeft: boolean
  lookRight: boolean
  lookBack: boolean
}

export interface Subject3Infraction {
  id: string
  title: string
  points: number
  fatal?: boolean
}

export interface Subject3Runtime {
  eventIndex: number
  started: boolean
  eventActive: boolean
  eventMaxSpeed: number
  eventMaxSteering: number
  eventMaxGear: number
  minLateral: number
  maxLateral: number
  lastLateral: number
  minBodyLateral: number
  eventStartHeading: number
  lastHeading: number
  leftSignalSeen: boolean
  rightSignalSeen: boolean
  leftSignalLeadAtManeuver: number
  rightSignalLeadAtManeuver: number
  maneuverStarted: boolean
  returnManeuverStarted: boolean
  eventStartLateral: number
  leftObservedBeforeManeuver: boolean
  rightObservedBeforeManeuver: boolean
  backObservedBeforeManeuver: boolean
  hornSeen: boolean
  stopSeen: boolean
  pullOverStopSeconds: number
  pullOverStopGap: number | null
  pullOverSecuredStopSeen: boolean
  completed: boolean
  progress: number
}

function resetEventStats(runtime: Subject3Runtime) {
  runtime.eventActive = false
  runtime.eventMaxSpeed = 0
  runtime.eventMaxSteering = 0
  runtime.eventMaxGear = 0
  runtime.minLateral = 0
  runtime.maxLateral = 0
  runtime.lastLateral = 0
  runtime.minBodyLateral = 0
  runtime.eventStartHeading = 0
  runtime.lastHeading = 0
  runtime.leftSignalSeen = false
  runtime.rightSignalSeen = false
  runtime.leftSignalLeadAtManeuver = 0
  runtime.rightSignalLeadAtManeuver = 0
  runtime.maneuverStarted = false
  runtime.returnManeuverStarted = false
  runtime.eventStartLateral = 0
  runtime.leftObservedBeforeManeuver = false
  runtime.rightObservedBeforeManeuver = false
  runtime.backObservedBeforeManeuver = false
  runtime.hornSeen = false
  runtime.stopSeen = false
  runtime.pullOverStopSeconds = 0
  runtime.pullOverStopGap = null
  runtime.pullOverSecuredStopSeen = false
}

export function createSubject3Runtime(): Subject3Runtime {
  return {
    eventIndex: 0,
    started: false,
    eventActive: false,
    eventMaxSpeed: 0,
    eventMaxSteering: 0,
    eventMaxGear: 0,
    minLateral: 0,
    maxLateral: 0,
    lastLateral: 0,
    minBodyLateral: 0,
    eventStartHeading: 0,
    lastHeading: 0,
    leftSignalSeen: false,
    rightSignalSeen: false,
    leftSignalLeadAtManeuver: 0,
    rightSignalLeadAtManeuver: 0,
    maneuverStarted: false,
    returnManeuverStarted: false,
    eventStartLateral: 0,
    leftObservedBeforeManeuver: false,
    rightObservedBeforeManeuver: false,
    backObservedBeforeManeuver: false,
    hornSeen: false,
    stopSeen: false,
    pullOverStopSeconds: 0,
    pullOverStopGap: null,
    pullOverSecuredStopSeen: false,
    completed: false,
    progress: 0,
  }
}

function normalizeAngle(angle: number) {
  let value = angle
  while (value > Math.PI) value -= Math.PI * 2
  while (value < -Math.PI) value += Math.PI * 2
  return value
}

function vehicleRightEdgeGap(vehicle: Subject3Vehicle) {
  const halfLength = TRAINING_CAR.lengthMeters / 2
  const halfWidth = TRAINING_CAR.widthMeters / 2
  const frontRight = worldPointFromVehicle(vehicle.x, vehicle.z, vehicle.heading, halfLength, halfWidth)
  const rearRight = worldPointFromVehicle(vehicle.x, vehicle.z, vehicle.heading, -halfLength, halfWidth)
  const rightMostLateral = Math.max(
    projectToSubject3Route(frontRight.x, frontRight.z).lateral,
    projectToSubject3Route(rearRight.x, rearRight.z).lateral,
  )
  return RIGHT_EDGE_OFFSET - rightMostLateral
}

function requireSignalLead(
  event: Subject3RouteEvent,
  runtime: Subject3Runtime,
  direction: 'left' | 'right',
  add: (suffix: string, title: string, points: number, fatal?: boolean) => void,
) {
  const age = direction === 'left' ? runtime.leftSignalLeadAtManeuver : runtime.rightSignalLeadAtManeuver
  if (age < DRIVING_RULES.subject3.signalLeadSeconds) {
    add(
      `${direction}-signal-lead`,
      `${event.title}前开启${direction === 'left' ? '左' : '右'}转向灯不足 ${DRIVING_RULES.subject3.signalLeadSeconds} 秒即开始转向`,
      100,
      true,
    )
  }
}

function requireObservation(
  event: Subject3RouteEvent,
  runtime: Subject3Runtime,
  direction: 'left' | 'right',
  add: (suffix: string, title: string, points: number, fatal?: boolean) => void,
) {
  const observed = direction === 'left'
    ? runtime.leftObservedBeforeManeuver || runtime.backObservedBeforeManeuver
    : runtime.rightObservedBeforeManeuver || runtime.backObservedBeforeManeuver
  if (!observed) {
    add(
      `${direction}-observation`,
      `${event.title}前未完成${direction === 'left' ? '左侧/后方' : '右侧/后方'}观察`,
      10,
    )
  }
}

function requireIntersectionObservation(
  event: Subject3RouteEvent,
  runtime: Subject3Runtime,
  add: (suffix: string, title: string, points: number, fatal?: boolean) => void,
) {
  if (!runtime.leftObservedBeforeManeuver || !runtime.rightObservedBeforeManeuver) {
    add(
      'observation',
      `${event.title}前未完整观察左、右方交通情况`,
      100,
      true,
    )
  }
}

function routeHeadingAtEventEnd(event: Subject3RouteEvent) {
  return poseAtRouteDistance(event.end).heading
}

function requireTurnCompletion(
  event: Subject3RouteEvent,
  runtime: Subject3Runtime,
  add: (suffix: string, title: string, points: number, fatal?: boolean) => void,
) {
  const headingError = Math.abs(normalizeAngle(
    runtime.lastHeading - routeHeadingAtEventEnd(event),
  ))
  if (
    !runtime.maneuverStarted ||
    headingError > DRIVING_RULES.subject3.maneuverHeadingToleranceRadians
  ) {
    add(
      'path',
      `${event.title}未按考试路线完成规定转向`,
      100,
      true,
    )
  }
}

function evaluateEvent(event: Subject3RouteEvent, runtime: Subject3Runtime, automatic: boolean, night: boolean) {
  const infractions: Subject3Infraction[] = []
  const add = (suffix: string, title: string, points: number, fatal = false) =>
    infractions.push({ id: `subject3-${event.id}-${suffix}`, title, points, fatal })

  if (event.kind === 'start') {
    if (!runtime.leftSignalSeen) add('signal', '起步前未正确使用左转向灯', 100, true)
    requireSignalLead(event, runtime, 'left', add)
    requireObservation(event, runtime, 'left', add)
    if (night && !runtime.hornSeen && false) add('night', '夜间起步操作不完整', 10)
  }

  if (event.kind === 'straight' && runtime.eventMaxSteering > 0.5) {
    add('direction', '直线行驶方向控制不稳，车辆行驶状态明显异常', 100, true)
  }

  if (event.kind === 'gear' && !automatic && runtime.eventMaxGear < 3) {
    add('gear', '加减挡位项目未完成合理挡位变化', 10)
  }

  if ((event.kind === 'slow' || event.kind === 'meeting' || event.kind === 'left-turn' || event.kind === 'right-turn' || event.kind === 'uturn' || event.kind === 'pull-over') &&
      event.speedLimit && runtime.eventMaxSpeed > event.speedLimit + 3) {
    add('speed', `${event.title}时未按道路情景合理减速`, 10)
  }

  if (event.kind === 'left-turn') {
    if (!runtime.leftSignalSeen) add('signal', '左转弯前未正确使用左转向灯', 100, true)
    requireSignalLead(event, runtime, 'left', add)
    requireIntersectionObservation(event, runtime, add)
    requireTurnCompletion(event, runtime, add)
  }
  if (event.kind === 'right-turn') {
    if (!runtime.rightSignalSeen) add('signal', '右转弯前未正确使用右转向灯', 100, true)
    requireSignalLead(event, runtime, 'right', add)
    requireIntersectionObservation(event, runtime, add)
    requireTurnCompletion(event, runtime, add)
  }
  if (event.kind === 'uturn') {
    if (!runtime.leftSignalSeen) add('signal', '掉头前未正确使用左转向灯', 100, true)
    requireSignalLead(event, runtime, 'left', add)
    requireObservation(event, runtime, 'left', add)
    requireTurnCompletion(event, runtime, add)
  }

  if (
    event.kind === 'meeting' &&
    runtime.minBodyLateral < CENTER_LINE_OFFSET
  ) {
    add('opposite-lane', '会车时车身越过道路中心线进入对向车道', 100, true)
  }

  if (event.kind === 'lane-change') {
    if (!runtime.leftSignalSeen) add('signal', '变更车道前未正确使用左转向灯', 100, true)
    requireSignalLead(event, runtime, 'left', add)
    requireObservation(event, runtime, 'left', add)
    if (runtime.minLateral > DRIVING_RULES.subject3.laneChangeTargetLateralMeters) {
      add('path', '未完成指令要求的变更车道动作', 100, true)
    } else if (runtime.lastLateral > DRIVING_RULES.subject3.laneChangeTargetLateralMeters) {
      add('completion', '变更车道项目结束时未保持在目标左侧车道', 100, true)
    }
  }

  if (event.kind === 'overtake') {
    if (!runtime.leftSignalSeen) add('left-signal', '超车前未正确使用左转向灯', 100, true)
    if (!runtime.rightSignalSeen) add('right-signal', '超车后返回原车道前未正确使用右转向灯', 100, true)
    requireSignalLead(event, runtime, 'left', add)
    requireObservation(event, runtime, 'left', add)
    if (runtime.rightSignalLeadAtManeuver < DRIVING_RULES.subject3.signalLeadSeconds) add('right-signal-lead', '超车返回原车道前右转向灯开启不足 3 秒', 100, true)
    if (!runtime.rightObservedBeforeManeuver && !runtime.backObservedBeforeManeuver) add('right-observation', '超车返回原车道前未观察右侧/后方交通情况', 10)
    if (runtime.minLateral > DRIVING_RULES.subject3.overtakeTargetLateralMeters) {
      add('path', '未完成有效的超车车道变化', 100, true)
    }
    if (
      !runtime.returnManeuverStarted ||
      runtime.lastLateral <= DRIVING_RULES.subject3.overtakeReturnLateralMeters
    ) {
      add('return-path', '超车项目结束时未完成返回原车道', 100, true)
    }
  }

  if (event.kind === 'pull-over') {
    if (!runtime.rightSignalSeen) add('signal', '靠边停车前未正确使用右转向灯', 100, true)
    requireSignalLead(event, runtime, 'right', add)
    requireObservation(event, runtime, 'right', add)
    if (!runtime.pullOverSecuredStopSeen || runtime.pullOverStopGap == null) {
      add('stop', '未在靠边停车项目区域内完成稳定停车并完成驻车操作', 100, true)
    } else if (runtime.pullOverStopGap < 0) {
      add('distance-cross-line', '靠边停车时车身越过道路右侧边缘线', 100, true)
    } else if (runtime.pullOverStopGap > DRIVING_RULES.subject3.pullOver.warningMaxGapMeters) {
      add('distance-fail', '停车后车身距离道路右侧边缘线超过 50cm', 100, true)
    } else if (runtime.pullOverStopGap > DRIVING_RULES.subject3.pullOver.idealMaxGapMeters) {
      add('distance-10', '停车后车身距离道路右侧边缘线超过 30cm 但未超过 50cm', 10)
    }
  }

  return infractions
}

function instructionFor(runtime: Subject3Runtime) {
  if (runtime.completed) return `科目三道路驾驶路线完成 · 实际路线长度 ${(SUBJECT3_ROUTE_LENGTH / 1000).toFixed(2)} km`
  const event = SUBJECT3_EVENTS[runtime.eventIndex]
  if (!event) return '继续沿考试路线安全行驶，准备完成靠边停车。'
  if (runtime.progress < event.start) return `下一项目：${event.title} · ${event.instruction}`
  return `${event.title} · ${event.instruction}`
}

export function updateSubject3(
  vehicle: Subject3Vehicle,
  previous: Subject3Runtime,
  automatic: boolean,
  night: boolean,
  dt: number,
): { runtime: Subject3Runtime; infractions: Subject3Infraction[]; status: string } {
  const runtime = { ...previous }
  const infractions: Subject3Infraction[] = []
  if (runtime.completed) return { runtime, infractions, status: instructionFor(runtime) }

  const projection = projectToSubject3Route(vehicle.x, vehicle.z)
  runtime.progress = Math.max(runtime.progress, projection.progress)

  const roadRects = subject3RoadRectsNearProgress(
    projection.progress,
    DRIVING_RULES.subject3.roadBoundaryToleranceMeters,
  )
  if (
    polygonTouchesOutsideRectUnion(
      vehicleBodyFootprint(vehicle),
      roadRects,
      0,
    )
  ) {
    infractions.push({
      id: 'subject3-road-boundary',
      title: '科目三道路驾驶中车辆驶出道路边界',
      points: 100,
      fatal: true,
    })
  }

  if (!runtime.started && Math.abs(vehicle.speed) > 0.2) runtime.started = true

  if (night && Math.abs(vehicle.speed) > 0.2 && !vehicle.lowBeam && !vehicle.highBeam) {
    infractions.push({
      id: 'subject3-night-lights-off',
      title: '夜间道路驾驶时未开启前照灯',
      points: 100,
      fatal: true,
    })
  }

  const event = SUBJECT3_EVENTS[runtime.eventIndex]
  if (event && runtime.progress >= event.start) {
    if (!runtime.eventActive) {
      runtime.eventActive = true
      runtime.eventStartLateral = projection.lateral
      runtime.eventStartHeading = vehicle.heading
      runtime.lastHeading = vehicle.heading
    }
    const kmh = Math.abs(vehicle.speed) * 3.6
    runtime.eventMaxSpeed = Math.max(runtime.eventMaxSpeed, kmh)
    runtime.eventMaxSteering = Math.max(runtime.eventMaxSteering, Math.abs(vehicle.steering))
    runtime.eventMaxGear = Math.max(runtime.eventMaxGear, vehicle.gear > 0 ? vehicle.gear : 0)
    runtime.minLateral = Math.min(runtime.minLateral, projection.lateral)
    runtime.maxLateral = Math.max(runtime.maxLateral, projection.lateral)
    runtime.lastLateral = projection.lateral
    runtime.lastHeading = vehicle.heading
    const minBodyLateral = Math.min(
      ...vehicleBodyFootprint(vehicle).map(point =>
        projectToSubject3Route(point.x, point.z).lateral,
      ),
    )
    runtime.minBodyLateral = Math.min(runtime.minBodyLateral, minBodyLateral)
    runtime.leftSignalSeen ||= vehicle.leftIndicator
    runtime.rightSignalSeen ||= vehicle.rightIndicator
    runtime.hornSeen ||= vehicle.horn

    const relevantLeft = event.kind === 'start' || event.kind === 'left-turn' || event.kind === 'lane-change' || event.kind === 'overtake' || event.kind === 'uturn'
    const relevantRight = event.kind === 'right-turn' || event.kind === 'pull-over'
    const lateralDelta = projection.lateral - runtime.eventStartLateral
    const steeringStarted = Math.abs(vehicle.steering) >= DRIVING_RULES.subject3.maneuverSteeringThreshold
    const lateralStarted = Math.abs(lateralDelta) >= DRIVING_RULES.subject3.maneuverLateralThreshold
    const startRolling = event.kind === 'start' && Math.abs(vehicle.speed) > 0.2

    if (!runtime.maneuverStarted && (steeringStarted || lateralStarted || startRolling)) {
      runtime.maneuverStarted = true
      if (relevantLeft) runtime.leftSignalLeadAtManeuver = vehicle.leftSignalAge
      if (relevantRight) runtime.rightSignalLeadAtManeuver = vehicle.rightSignalAge
      runtime.leftObservedBeforeManeuver ||= vehicle.lookLeft
      runtime.rightObservedBeforeManeuver ||= vehicle.lookRight
      runtime.backObservedBeforeManeuver ||= vehicle.lookBack
    } else if (!runtime.maneuverStarted) {
      runtime.leftObservedBeforeManeuver ||= vehicle.lookLeft
      runtime.rightObservedBeforeManeuver ||= vehicle.lookRight
      runtime.backObservedBeforeManeuver ||= vehicle.lookBack
    }

    if (event.kind === 'overtake' && runtime.maneuverStarted && !runtime.returnManeuverStarted) {
      runtime.rightObservedBeforeManeuver ||= vehicle.lookRight
      runtime.backObservedBeforeManeuver ||= vehicle.lookBack
    }

    if (
      event.kind === 'overtake' &&
      runtime.minLateral <= DRIVING_RULES.subject3.overtakeTargetLateralMeters &&
      !runtime.returnManeuverStarted &&
      projection.lateral > DRIVING_RULES.subject3.overtakeReturnLateralMeters
    ) {
      runtime.returnManeuverStarted = true
      runtime.rightSignalLeadAtManeuver = vehicle.rightSignalAge
      runtime.rightObservedBeforeManeuver ||= vehicle.lookRight
      runtime.backObservedBeforeManeuver ||= vehicle.lookBack
    }

    const stopped = Math.abs(vehicle.speed) < DRIVING_RULES.subject3.pullOver.stoppedSpeedMps
    runtime.stopSeen ||= stopped
    if (event.kind === 'pull-over' && stopped) {
      runtime.pullOverStopSeconds += dt
      runtime.pullOverStopGap = vehicleRightEdgeGap(vehicle)
    } else if (event.kind === 'pull-over' && Math.abs(vehicle.speed) > 0.2) {
      runtime.pullOverStopSeconds = 0
    }

    if (
      event.kind === 'pull-over' &&
      runtime.pullOverStopSeconds >= DRIVING_RULES.subject3.pullOver.stableStopSeconds &&
      vehicle.handbrake &&
      vehicle.gear === 0
    ) {
      runtime.pullOverSecuredStopSeen = true
      infractions.push(...evaluateEvent(event, runtime, automatic, night))
      runtime.completed = true
      return { runtime, infractions, status: instructionFor(runtime) }
    }

    if (runtime.progress > event.end) {
      infractions.push(...evaluateEvent(event, runtime, automatic, night))
      runtime.eventIndex += 1
      resetEventStats(runtime)
    }
  }

  if (runtime.progress >= SUBJECT3_ROUTE_LENGTH - 35) {
    runtime.completed = true
  }

  return { runtime, infractions, status: instructionFor(runtime) }
}

function RoadSegmentMesh({ segment }: { segment: RouteSegment }) {
  const dashCount = Math.floor(segment.length / 14)
  return <group
    position={[(segment.a.x + segment.b.x) / 2, 0, (segment.a.z + segment.b.z) / 2]}
    rotation-y={sceneYawFromHeading(segment.heading)}
  >
    <mesh rotation-x={-Math.PI / 2} position={[ROAD_CENTER_OFFSET, -0.02, 0]}>
      <planeGeometry args={[ROAD_WIDTH, segment.length + 1]} />
      <meshStandardMaterial color="#393e43" roughness={0.96} />
    </mesh>

    {[RIGHT_EDGE_OFFSET, CENTER_LINE_OFFSET, LEFT_EDGE_OFFSET].map((offset, index) =>
      <mesh key={offset} rotation-x={-Math.PI / 2} position={[offset, 0.005 + index * 0.001, 0]}>
        <planeGeometry args={[index === 1 ? 0.13 : 0.11, segment.length]} />
        <meshBasicMaterial color={index === 1 ? '#e3bd38' : '#f1f1ea'} />
      </mesh>
    )}

    {[SAME_DIRECTION_DIVIDER, OPPOSITE_DIVIDER].flatMap(offset =>
      Array.from({ length: dashCount }, (_, index) => {
        const z = -segment.length / 2 + 7 + index * 14
        return <mesh key={`${offset}-${index}`} rotation-x={-Math.PI / 2} position={[offset, 0.008, z]}>
          <planeGeometry args={[0.09, 5]} />
          <meshBasicMaterial color="#ecece6" />
        </mesh>
      })
    )}
  </group>
}

function makeSignTexture(label: string, accent: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 300
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = accent
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 18
  ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24)
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '700 62px system-ui, sans-serif'
  const chunks = label.length > 5 ? [label.slice(0, Math.ceil(label.length / 2)), label.slice(Math.ceil(label.length / 2))] : [label]
  chunks.forEach((text, index) => {
    const y = chunks.length === 1 ? 150 : 112 + index * 82
    ctx.fillText(text, 256, y)
  })
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function RouteSign({ distance, label, accent = '#176aa7' }: { distance: number; label: string; accent?: string }) {
  const pose = poseAtRouteDistance(distance)
  const texture = useMemo(() => makeSignTexture(label, accent), [accent, label])
  useEffect(() => () => texture.dispose(), [texture])
  const lateral = RIGHT_EDGE_OFFSET + 2.1
  return <group
    position={[pose.x + pose.rightX * lateral, 0, pose.z + pose.rightZ * lateral]}
    rotation-y={sceneYawFromHeading(pose.heading)}
  >
    <mesh position={[0, 1.5, 0]}>
      <cylinderGeometry args={[0.05, 0.06, 3, 8]} />
      <meshStandardMaterial color="#7c858b" metalness={0.55} />
    </mesh>
    <mesh position={[0, 2.55, 0.02]}>
      <planeGeometry args={[1.45, 0.85]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  </group>
}

function Crosswalk({ distance }: { distance: number }) {
  const pose = poseAtRouteDistance(distance)
  return <group position={[pose.x + pose.rightX * ROAD_CENTER_OFFSET, 0.012, pose.z + pose.rightZ * ROAD_CENTER_OFFSET]} rotation-y={sceneYawFromHeading(pose.heading)}>
    {Array.from({ length: 8 }, (_, index) =>
      <mesh key={index} rotation-x={-Math.PI / 2} position={[0, 0, -3.1 + index * 0.88]}>
        <planeGeometry args={[ROAD_WIDTH - 0.8, 0.48]} />
        <meshBasicMaterial color="#f5f5f3" />
      </mesh>
    )}
  </group>
}

function TrafficLight({ distance }: { distance: number }) {
  const pose = poseAtRouteDistance(distance)
  return <group position={[pose.x + pose.rightX * (RIGHT_EDGE_OFFSET + 1.7), 0, pose.z + pose.rightZ * (RIGHT_EDGE_OFFSET + 1.7)]} rotation-y={sceneYawFromHeading(pose.heading)}>
    <mesh position={[0, 2.4, 0]}><cylinderGeometry args={[0.07, 0.09, 4.8, 10]} /><meshStandardMaterial color="#555b5d" /></mesh>
    <mesh position={[0, 4.4, 0]}><boxGeometry args={[0.5, 1.15, 0.28]} /><meshStandardMaterial color="#16191b" /></mesh>
    <mesh position={[0, 4.72, 0.15]}><circleGeometry args={[0.12, 20]} /><meshBasicMaterial color="#4b1717" /></mesh>
    <mesh position={[0, 4.4, 0.15]}><circleGeometry args={[0.12, 20]} /><meshBasicMaterial color="#514b17" /></mesh>
    <mesh position={[0, 4.08, 0.15]}><circleGeometry args={[0.12, 20]} /><meshBasicMaterial color="#35cf69" /></mesh>
  </group>
}

function StaticCar({ distance, lateral, opposite = false, color = '#d7d9dd' }: { distance: number; lateral: number; opposite?: boolean; color?: string }) {
  const pose = poseAtRouteDistance(distance)
  return <group
    position={[pose.x + pose.rightX * lateral, 0.45, pose.z + pose.rightZ * lateral]}
    rotation-y={sceneYawFromHeading(pose.heading) + (opposite ? Math.PI : 0)}
  >
    <mesh><boxGeometry args={[1.75, 0.65, 4.2]} /><meshStandardMaterial color={color} metalness={0.22} roughness={0.48} /></mesh>
    <mesh position={[0, 0.45, -0.15]}><boxGeometry args={[1.5, 0.55, 1.9]} /><meshStandardMaterial color="#60707a" metalness={0.5} roughness={0.28} /></mesh>
  </group>
}

function Pedestrian({ distance, lateral, color }: { distance: number; lateral: number; color: string }) {
  const pose = poseAtRouteDistance(distance)
  return <group position={[pose.x + pose.rightX * lateral, 0, pose.z + pose.rightZ * lateral]}>
    <mesh position={[0, 1.05, 0]}><cylinderGeometry args={[0.18, 0.23, 1.25, 12]} /><meshStandardMaterial color={color} /></mesh>
    <mesh position={[0, 1.88, 0]}><sphereGeometry args={[0.25, 14, 10]} /><meshStandardMaterial color="#d7aa82" /></mesh>
  </group>
}


function CarBody({ color = '#c7cbd0' }: { color?: string }) {
  return <group>
    <mesh position={[0, 0.38, 0]}><boxGeometry args={[1.78, 0.62, 4.25]} /><meshStandardMaterial color={color} metalness={0.22} roughness={0.46} /></mesh>
    <mesh position={[0, 0.82, -0.2]}><boxGeometry args={[1.48, 0.55, 1.9]} /><meshStandardMaterial color="#526775" metalness={0.48} roughness={0.25} /></mesh>
    <mesh position={[-0.58, 0.36, 2.13]}><boxGeometry args={[0.35, 0.13, 0.04]} /><meshStandardMaterial color="#8d1717" emissive="#4a0909" emissiveIntensity={0.8} /></mesh>
    <mesh position={[0.58, 0.36, 2.13]}><boxGeometry args={[0.35, 0.13, 0.04]} /><meshStandardMaterial color="#8d1717" emissive="#4a0909" emissiveIntensity={0.8} /></mesh>
  </group>
}

function actorWorldPosition(progress: number, lateral: number) {
  const pose = poseAtRouteDistance(progress)
  return {
    pose,
    x: pose.x + pose.rightX * lateral,
    z: pose.z + pose.rightZ * lateral,
  }
}

function checkVehicleCollision(
  player: MutableRefObject<Subject3Vehicle>,
  x: number,
  z: number,
  id: string,
  onInfraction: (item: Subject3Infraction) => void,
  radius = 2.6,
) {
  const distance = Math.hypot(player.current.x - x, player.current.z - z)
  if (distance < radius) {
    onInfraction({
      id,
      title: '道路驾驶过程中与其他交通参与者发生碰撞',
      points: 100,
      fatal: true,
    })
  }
}

function MovingTrafficCar({
  player,
  onInfraction,
  id,
  startProgress,
  speed,
  lateral,
  opposite = false,
  color,
}: {
  player: MutableRefObject<Subject3Vehicle>
  onInfraction: (item: Subject3Infraction) => void
  id: string
  startProgress: number
  speed: number
  lateral: number
  opposite?: boolean
  color: string
}) {
  const group = useRef<THREE.Group>(null)
  const progress = useRef(startProgress)

  useFrame((_, delta) => {
    progress.current += (opposite ? -1 : 1) * speed * delta
    if (progress.current > SUBJECT3_ROUTE_LENGTH - 40) progress.current = 120
    if (progress.current < 60) progress.current = SUBJECT3_ROUTE_LENGTH - 80
    const world = actorWorldPosition(progress.current, lateral)
    if (group.current) {
      group.current.position.set(world.x, 0.04, world.z)
      group.current.rotation.y = sceneYawFromHeading(world.pose.heading) + (opposite ? Math.PI : 0)
    }
    checkVehicleCollision(player, world.x, world.z, `subject3-collision-${id}`, onInfraction)
  })

  return <group ref={group}><CarBody color={color} /></group>
}

function SuddenBrakeCar({
  player,
  onInfraction,
}: {
  player: MutableRefObject<Subject3Vehicle>
  onInfraction: (item: Subject3Infraction) => void
}) {
  const group = useRef<THREE.Group>(null)
  const progress = useRef(2760)
  const speed = useRef(8.5)

  useFrame((_, delta) => {
    const playerProgress = projectToSubject3Route(player.current.x, player.current.z).progress
    if (playerProgress > 2660 && playerProgress < 2920) {
      if (playerProgress > 2725) speed.current = Math.max(0, speed.current - 7.5 * delta)
      progress.current += speed.current * delta
    }
    const world = actorWorldPosition(progress.current, 0)
    if (group.current) {
      group.current.position.set(world.x, 0.04, world.z)
      group.current.rotation.y = sceneYawFromHeading(world.pose.heading)
    }
    checkVehicleCollision(player, world.x, world.z, 'subject3-collision-sudden-brake', onInfraction)
  })

  return <group ref={group}><CarBody color="#d8d4c9" /></group>
}

function CrossingPedestrian({
  player,
  onInfraction,
}: {
  player: MutableRefObject<Subject3Vehicle>
  onInfraction: (item: Subject3Infraction) => void
}) {
  const group = useRef<THREE.Group>(null)
  const elapsed = useRef(0)
  const triggered = useRef(false)
  const progress = 2532

  useFrame((_, delta) => {
    const playerProgress = projectToSubject3Route(player.current.x, player.current.z).progress
    if (!triggered.current && playerProgress > 2440) triggered.current = true
    if (triggered.current) elapsed.current = Math.min(6, elapsed.current + delta)
    const t = Math.min(1, elapsed.current / 4.8)
    const lateral = 3.4 - t * 9.1
    const world = actorWorldPosition(progress, lateral)
    if (group.current) group.current.position.set(world.x, 0, world.z)
    if (triggered.current) {
      checkVehicleCollision(player, world.x, world.z, 'subject3-collision-pedestrian', onInfraction, 1.45)
    }
  })

  return <group ref={group}>
    <mesh position={[0, 1.03, 0]}><cylinderGeometry args={[0.18, 0.23, 1.25, 12]} /><meshStandardMaterial color="#3f75a2" /></mesh>
    <mesh position={[0, 1.85, 0]}><sphereGeometry args={[0.24, 14, 10]} /><meshStandardMaterial color="#d8aa80" /></mesh>
  </group>
}

function CutInScooter({
  player,
  onInfraction,
}: {
  player: MutableRefObject<Subject3Vehicle>
  onInfraction: (item: Subject3Infraction) => void
}) {
  const group = useRef<THREE.Group>(null)
  const elapsed = useRef(0)
  const triggered = useRef(false)
  const progress = useRef(1385)

  useFrame((_, delta) => {
    const playerProgress = projectToSubject3Route(player.current.x, player.current.z).progress
    if (!triggered.current && playerProgress > 1290) triggered.current = true
    if (triggered.current) {
      elapsed.current = Math.min(5, elapsed.current + delta)
      progress.current += 3.2 * delta
    }
    const t = Math.min(1, elapsed.current / 3.4)
    const lateral = 3.2 - t * 3.3
    const world = actorWorldPosition(progress.current, lateral)
    if (group.current) {
      group.current.position.set(world.x, 0.18, world.z)
      group.current.rotation.y = sceneYawFromHeading(world.pose.heading)
    }
    if (triggered.current) {
      checkVehicleCollision(player, world.x, world.z, 'subject3-collision-scooter', onInfraction, 1.55)
    }
  })

  return <group ref={group}>
    <mesh position={[0, 0.38, 0]}><boxGeometry args={[0.48, 0.42, 1.45]} /><meshStandardMaterial color="#343b40" /></mesh>
    <mesh position={[0, 0.92, 0.08]}><cylinderGeometry args={[0.15, 0.19, 0.9, 12]} /><meshStandardMaterial color="#bf584b" /></mesh>
    <mesh position={[0, 1.54, 0.08]}><sphereGeometry args={[0.2, 12, 9]} /><meshStandardMaterial color="#d6a67e" /></mesh>
    <mesh position={[-0.27, 0.18, -0.48]} rotation-z={Math.PI / 2}><torusGeometry args={[0.23, 0.045, 10, 18]} /><meshStandardMaterial color="#111" /></mesh>
    <mesh position={[-0.27, 0.18, 0.48]} rotation-z={Math.PI / 2}><torusGeometry args={[0.23, 0.045, 10, 18]} /><meshStandardMaterial color="#111" /></mesh>
  </group>
}

function DynamicTraffic({
  player,
  onInfraction,
}: {
  player: MutableRefObject<Subject3Vehicle>
  onInfraction: (item: Subject3Infraction) => void
}) {
  return <>
    <MovingTrafficCar player={player} onInfraction={onInfraction} id="flow-a" startProgress={620} speed={9.2} lateral={-3.5} color="#40698e" />
    <MovingTrafficCar player={player} onInfraction={onInfraction} id="flow-b" startProgress={1540} speed={7.5} lateral={0} color="#b5b8b3" />
    <MovingTrafficCar player={player} onInfraction={onInfraction} id="oncoming-a" startProgress={1900} speed={10.5} lateral={-8.75} opposite color="#a84742" />
    <MovingTrafficCar player={player} onInfraction={onInfraction} id="oncoming-b" startProgress={3650} speed={8.6} lateral={-8.75} opposite color="#4f6e51" />
    <SuddenBrakeCar player={player} onInfraction={onInfraction} />
    <CrossingPedestrian player={player} onInfraction={onInfraction} />
    <CutInScooter player={player} onInfraction={onInfraction} />
  </>
}

export function Subject3Course({
  player,
  onInfraction,
}: {
  player: MutableRefObject<Subject3Vehicle>
  onInfraction: (item: Subject3Infraction) => void
}): ReactElement {
  return <group>
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.09, -1200]}>
      <planeGeometry args={[1400, 5400]} />
      <meshStandardMaterial color="#62755a" roughness={1} />
    </mesh>

    {SUBJECT3_SEGMENTS.map((segment, index) => <RoadSegmentMesh key={index} segment={segment} />)}
    {SUBJECT3_ROUTE.map((point, index) => (
      <mesh key={`route-node-${index}`} rotation-x={-Math.PI / 2} position={[point.x, -0.015, point.z]}>
        <planeGeometry args={[SUBJECT3_ROUTE_NODE_PAD_SIZE, SUBJECT3_ROUTE_NODE_PAD_SIZE]} />
        <meshStandardMaterial color="#393e43" roughness={0.96} />
      </mesh>
    ))}

    <RouteSign distance={45} label="考试起点" />
    <RouteSign distance={520} label="限速50" accent="#b23a2d" />
    <RouteSign distance={1160} label="学校区域" />
    <RouteSign distance={1360} label="公交站" />
    <RouteSign distance={2460} label="人行横道" />
    <RouteSign distance={3470} label="允许掉头" />
    <RouteSign distance={4110} label="靠边停车" />

    <Crosswalk distance={850} />
    <Crosswalk distance={2520} />
    <TrafficLight distance={850} />
    <TrafficLight distance={3090} />

    <StaticCar distance={1735} lateral={-8.75} opposite color="#bd4b42" />
    <StaticCar distance={2140} lateral={0} color="#d4d4d0" />
    <StaticCar distance={2185} lateral={-3.5} color="#395f88" />

    <Pedestrian distance={1205} lateral={3.2} color="#e2a544" />
    <Pedestrian distance={2530} lateral={1.1} color="#4e79aa" />
    <Pedestrian distance={2540} lateral={-0.4} color="#8c5d92" />

    <DynamicTraffic player={player} onInfraction={onInfraction} />

    {SUBJECT3_EVENTS.filter((_, index) => index % 2 === 0).map((event, index) => {
      const pose = poseAtRouteDistance((event.start + event.end) / 2)
      const side = index % 2 === 0 ? RIGHT_EDGE_OFFSET + 7 : LEFT_EDGE_OFFSET - 7
      return <group key={`building-${event.id}`} position={[pose.x + pose.rightX * side, 0, pose.z + pose.rightZ * side]}>
        <mesh position={[0, 3, 0]}><boxGeometry args={[7, 6, 10]} /><meshStandardMaterial color={index % 3 === 0 ? '#b8b2a6' : '#9daab0'} roughness={0.85} /></mesh>
        <mesh position={[side > 0 ? -4.2 : 4.2, 1.2, 0]}><cylinderGeometry args={[0.18, 0.22, 2.4, 10]} /><meshStandardMaterial color="#625649" /></mesh>
        <mesh position={[side > 0 ? -4.2 : 4.2, 3.2, 0]}><sphereGeometry args={[1.35, 12, 9]} /><meshStandardMaterial color="#41694a" /></mesh>
      </group>
    })}
  </group>
}
