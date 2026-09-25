import { useEffect, useMemo, type ReactElement } from 'react'
import * as THREE from 'three'

type Point = { x: number; z: number }

export const SUBJECT3_ROUTE: Point[] = [
  { x: 0, z: 80 },
  { x: 0, z: -620 },
  { x: 320, z: -620 },
  { x: 320, z: -1240 },
  { x: -320, z: -1240 },
  { x: -320, z: -1880 },
  { x: 0, z: -1880 },
  { x: 0, z: -2230 },
  { x: 70, z: -2230 },
  { x: 70, z: -2120 },
  { x: -250, z: -2120 },
  { x: -250, z: -2450 },
]

const LANE_WIDTH = 3.5
const ROAD_WIDTH = 14
const ROAD_CENTER_OFFSET = -5.25
const RIGHT_EDGE_OFFSET = 1.75
const SAME_DIRECTION_DIVIDER = -1.75
const CENTER_LINE_OFFSET = -5.25
const OPPOSITE_DIVIDER = -8.75
const LEFT_EDGE_OFFSET = -12.25

interface RouteSegment {
  a: Point
  b: Point
  length: number
  startDistance: number
  heading: number
  rightX: number
  rightZ: number
}

function buildSegments() {
  let cumulative = 0
  return SUBJECT3_ROUTE.slice(0, -1).map((a, index) => {
    const b = SUBJECT3_ROUTE[index + 1]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const length = Math.hypot(dx, dz)
    const heading = Math.atan2(dx, -dz)
    const segment: RouteSegment = {
      a,
      b,
      length,
      startDistance: cumulative,
      heading,
      rightX: -dz / length,
      rightZ: dx / length,
    }
    cumulative += length
    return segment
  })
}

export const SUBJECT3_SEGMENTS = buildSegments()
export const SUBJECT3_ROUTE_LENGTH = SUBJECT3_SEGMENTS.reduce((sum, segment) => sum + segment.length, 0)
export const SUBJECT3_START = SUBJECT3_ROUTE[0]

export function poseAtRouteDistance(distance: number) {
  const clamped = Math.max(0, Math.min(SUBJECT3_ROUTE_LENGTH, distance))
  const segment = SUBJECT3_SEGMENTS.find(item => clamped <= item.startDistance + item.length) ?? SUBJECT3_SEGMENTS[SUBJECT3_SEGMENTS.length - 1]
  const t = Math.max(0, Math.min(1, (clamped - segment.startDistance) / segment.length))
  return {
    x: segment.a.x + (segment.b.x - segment.a.x) * t,
    z: segment.a.z + (segment.b.z - segment.a.z) * t,
    heading: segment.heading,
    rightX: segment.rightX,
    rightZ: segment.rightZ,
  }
}

export function projectToSubject3Route(x: number, z: number) {
  let bestDistance = Number.POSITIVE_INFINITY
  let bestProgress = 0
  let bestLateral = 0
  let bestHeading = 0

  for (const segment of SUBJECT3_SEGMENTS) {
    const dx = segment.b.x - segment.a.x
    const dz = segment.b.z - segment.a.z
    const lengthSq = segment.length * segment.length
    const t = Math.max(0, Math.min(1, ((x - segment.a.x) * dx + (z - segment.a.z) * dz) / lengthSq))
    const nx = segment.a.x + dx * t
    const nz = segment.a.z + dz * t
    const ox = x - nx
    const oz = z - nz
    const distance = Math.hypot(ox, oz)
    if (distance < bestDistance) {
      bestDistance = distance
      bestProgress = segment.startDistance + segment.length * t
      bestLateral = ox * segment.rightX + oz * segment.rightZ
      bestHeading = segment.heading
    }
  }

  return { distance: bestDistance, progress: bestProgress, lateral: bestLateral, heading: bestHeading }
}

type EventKind =
  | 'start'
  | 'straight'
  | 'gear'
  | 'slow'
  | 'left-turn'
  | 'right-turn'
  | 'lane-change'
  | 'meeting'
  | 'overtake'
  | 'uturn'
  | 'pull-over'

export interface Subject3RouteEvent {
  id: string
  title: string
  instruction: string
  start: number
  end: number
  kind: EventKind
  speedLimit?: number
}

export const SUBJECT3_EVENTS: Subject3RouteEvent[] = [
  { id: 'start', title: '上车准备与起步', instruction: '请完成上车准备，系好安全带，开启左转向灯，观察后方交通后起步。', start: 0, end: 120, kind: 'start' },
  { id: 'straight-1', title: '直线行驶', instruction: '前方直线行驶，请合理控制车速和方向，保持安全车距。', start: 160, end: 430, kind: 'straight' },
  { id: 'gear', title: '加减挡位操作', instruction: '请根据车速和道路情况完成加减挡位操作。', start: 450, end: 640, kind: 'gear' },
  { id: 'left-turn-1', title: '路口左转弯', instruction: '前方路口左转，请提前开启左转向灯并减速观察。', start: 650, end: 770, kind: 'left-turn', speedLimit: 30 },
  { id: 'intersection', title: '直行通过路口', instruction: '前方路口直行，请减速观察，安全通过。', start: 790, end: 930, kind: 'slow', speedLimit: 30 },
  { id: 'right-turn-1', title: '路口右转弯', instruction: '前方路口右转，请提前开启右转向灯并减速观察。', start: 940, end: 1090, kind: 'right-turn', speedLimit: 30 },
  { id: 'school', title: '通过学校区域', instruction: '前方学校区域，请减速慢行并注意学生。', start: 1120, end: 1300, kind: 'slow', speedLimit: 30 },
  { id: 'bus-stop', title: '通过公共汽车站', instruction: '前方公共汽车站，请减速观察站台和行人。', start: 1320, end: 1490, kind: 'slow', speedLimit: 30 },
  { id: 'meeting', title: '会车', instruction: '前方会车，请降低车速，保持安全横向距离。', start: 1660, end: 1840, kind: 'meeting', speedLimit: 30 },
  { id: 'lane-change', title: '变更车道', instruction: '请向左变更车道，提前开启左转向灯并观察后方交通。', start: 1860, end: 2040, kind: 'lane-change' },
  { id: 'overtake', title: '超车', instruction: '请完成超车：观察、开启左转向灯驶入左侧车道，超过目标车辆后开启右转向灯返回。', start: 2060, end: 2240, kind: 'overtake' },
  { id: 'left-turn-2', title: '路口左转弯', instruction: '前方路口左转，请减速、观察并正确使用转向灯。', start: 2260, end: 2380, kind: 'left-turn', speedLimit: 30 },
  { id: 'crosswalk', title: '通过人行横道', instruction: '前方人行横道，请减速观察行人，必要时停车让行。', start: 2460, end: 2620, kind: 'slow', speedLimit: 30 },
  { id: 'straight-2', title: '直线行驶', instruction: '继续直线行驶，保持车辆稳定并控制安全车距。', start: 2640, end: 2840, kind: 'straight' },
  { id: 'left-turn-3', title: '路口左转弯', instruction: '前方路口左转，请提前开启左转向灯。', start: 2860, end: 3020, kind: 'left-turn', speedLimit: 30 },
  { id: 'intersection-2', title: '直行通过路口', instruction: '前方路口，请减速观察后安全通过。', start: 3040, end: 3210, kind: 'slow', speedLimit: 30 },
  { id: 'uturn', title: '掉头', instruction: '前方允许掉头，请开启左转向灯，观察交通情况后完成掉头。', start: 3460, end: 3820, kind: 'uturn', speedLimit: 30 },
  { id: 'pull-over', title: '靠边停车', instruction: '请靠边停车：开启右转向灯，观察右侧和后方交通，在安全位置平稳停车。', start: 4100, end: 4370, kind: 'pull-over', speedLimit: 30 },
]

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
  leftSignalSeen: boolean
  rightSignalSeen: boolean
  hornSeen: boolean
  stopSeen: boolean
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
  runtime.leftSignalSeen = false
  runtime.rightSignalSeen = false
  runtime.hornSeen = false
  runtime.stopSeen = false
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
    leftSignalSeen: false,
    rightSignalSeen: false,
    hornSeen: false,
    stopSeen: false,
    completed: false,
    progress: 0,
  }
}

function evaluateEvent(event: Subject3RouteEvent, runtime: Subject3Runtime, automatic: boolean, night: boolean) {
  const infractions: Subject3Infraction[] = []
  const add = (suffix: string, title: string, points: number, fatal = false) =>
    infractions.push({ id: `subject3-${event.id}-${suffix}`, title, points, fatal })

  if (event.kind === 'start') {
    if (!runtime.leftSignalSeen) add('signal', '起步前未正确使用左转向灯', 10)
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

  if (event.kind === 'left-turn' && !runtime.leftSignalSeen) add('signal', '左转弯前未正确使用左转向灯', 10)
  if (event.kind === 'right-turn' && !runtime.rightSignalSeen) add('signal', '右转弯前未正确使用右转向灯', 10)
  if (event.kind === 'uturn' && !runtime.leftSignalSeen) add('signal', '掉头前未正确使用左转向灯', 10)

  if (event.kind === 'lane-change') {
    if (!runtime.leftSignalSeen) add('signal', '变更车道前未正确使用转向灯', 10)
    if (runtime.minLateral > -2.0) add('path', '未完成指令要求的变更车道动作', 100, true)
  }

  if (event.kind === 'overtake') {
    if (!runtime.leftSignalSeen) add('left-signal', '超车前未正确使用左转向灯', 10)
    if (!runtime.rightSignalSeen) add('right-signal', '超车后返回原车道前未正确使用右转向灯', 10)
    if (runtime.minLateral > -2.0) add('path', '未完成有效的超车车道变化', 100, true)
  }

  if (event.kind === 'pull-over') {
    if (!runtime.rightSignalSeen) add('signal', '靠边停车前未正确使用右转向灯', 10)
    if (!runtime.stopSeen) add('stop', '未在靠边停车项目区域内完成停车', 100, true)
    if (runtime.maxLateral < 0.55) add('distance', '靠边停车时未驶向道路右侧合理停车位置', 10)
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
): { runtime: Subject3Runtime; infractions: Subject3Infraction[]; status: string } {
  const runtime = { ...previous }
  const infractions: Subject3Infraction[] = []
  if (runtime.completed) return { runtime, infractions, status: instructionFor(runtime) }

  const projection = projectToSubject3Route(vehicle.x, vehicle.z)
  runtime.progress = Math.max(runtime.progress, projection.progress)

  if (projection.lateral > RIGHT_EDGE_OFFSET + 0.55 || projection.lateral < LEFT_EDGE_OFFSET - 0.55) {
    infractions.push({
      id: 'subject3-road-boundary',
      title: '科目三道路驾驶中车辆驶出道路边界',
      points: 100,
      fatal: true,
    })
  }

  if (!runtime.started && Math.abs(vehicle.speed) > 0.2) runtime.started = true

  const event = SUBJECT3_EVENTS[runtime.eventIndex]
  if (event && runtime.progress >= event.start) {
    runtime.eventActive = true
    const kmh = Math.abs(vehicle.speed) * 3.6
    runtime.eventMaxSpeed = Math.max(runtime.eventMaxSpeed, kmh)
    runtime.eventMaxSteering = Math.max(runtime.eventMaxSteering, Math.abs(vehicle.steering))
    runtime.eventMaxGear = Math.max(runtime.eventMaxGear, vehicle.gear > 0 ? vehicle.gear : 0)
    runtime.minLateral = Math.min(runtime.minLateral, projection.lateral)
    runtime.maxLateral = Math.max(runtime.maxLateral, projection.lateral)
    runtime.leftSignalSeen ||= vehicle.leftIndicator
    runtime.rightSignalSeen ||= vehicle.rightIndicator
    runtime.hornSeen ||= vehicle.horn
    runtime.stopSeen ||= Math.abs(vehicle.speed) < 0.08

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
    rotation-y={segment.heading}
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
    rotation-y={pose.heading}
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
  return <group position={[pose.x + pose.rightX * ROAD_CENTER_OFFSET, 0.012, pose.z + pose.rightZ * ROAD_CENTER_OFFSET]} rotation-y={pose.heading}>
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
  return <group position={[pose.x + pose.rightX * (RIGHT_EDGE_OFFSET + 1.7), 0, pose.z + pose.rightZ * (RIGHT_EDGE_OFFSET + 1.7)]} rotation-y={pose.heading}>
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
    rotation-y={pose.heading + (opposite ? Math.PI : 0)}
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

export function Subject3Course(): ReactElement {
  return <group>
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.09, -1200]}>
      <planeGeometry args={[1400, 5400]} />
      <meshStandardMaterial color="#62755a" roughness={1} />
    </mesh>

    {SUBJECT3_SEGMENTS.map((segment, index) => <RoadSegmentMesh key={index} segment={segment} />)}
    {SUBJECT3_ROUTE.slice(1, -1).map((point, index) => (
      <mesh key={`corner-${index}`} rotation-x={-Math.PI / 2} position={[point.x, -0.015, point.z]}>
        <planeGeometry args={[20, 20]} />
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
