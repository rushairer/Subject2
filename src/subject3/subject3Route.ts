import { rightFromHeading } from '../sim/vehicleFrame'

export type Point = { x: number; z: number }

/**
 * X is mirrored from the earlier prototype so every named turn agrees with
 * the canonical vehicle frame without changing segment lengths/event mileage.
 */
export const SUBJECT3_ROUTE: Point[] = [
  { x: 0, z: 80 },
  { x: 0, z: -620 },
  { x: -320, z: -620 },
  { x: -320, z: -1240 },
  { x: 320, z: -1240 },
  { x: 320, z: -1880 },
  { x: 0, z: -1880 },
  { x: 0, z: -2230 },
  { x: -70, z: -2230 },
  { x: -70, z: -2120 },
  { x: 250, z: -2120 },
  { x: 250, z: -2450 },
]

export const LANE_WIDTH = 3.5
export const ROAD_WIDTH = 14
export const ROAD_CENTER_OFFSET = -5.25
export const RIGHT_EDGE_OFFSET = 1.75
export const SAME_DIRECTION_DIVIDER = -1.75
export const CENTER_LINE_OFFSET = -5.25
export const OPPOSITE_DIVIDER = -8.75
export const LEFT_EDGE_OFFSET = -12.25

export interface RouteSegment {
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
    const right = rightFromHeading(heading)
    const segment: RouteSegment = {
      a,
      b,
      length,
      startDistance: cumulative,
      heading,
      rightX: right.x,
      rightZ: right.z,
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

export type EventKind =
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
