import { useMemo, type ReactElement } from 'react'
import * as THREE from 'three'
import { TRAINING_CAR } from '../sim/vehicleDimensions'
import { worldPointFromVehicle } from '../sim/vehicleFrame'

export const CURVE_DRIVING = {
  radius: 7.5,
  roadWidth: 3.5,
  arcDegrees: 135,
  stopLimitSeconds: 2,
  carLength: TRAINING_CAR.lengthMeters,
  trackWidth: TRAINING_CAR.trackWidthMeters,
} as const

type Point = { x: number; z: number }

const START_X = 12.8
const START_Z = 10
const ARC = Math.PI * 3 / 4

function buildCenterline(): Point[] {
  const r = CURVE_DRIVING.radius
  const c1 = { x: START_X - r, z: START_Z }
  const points: Point[] = []
  const steps = 48

  for (let i = 0; i <= steps; i++) {
    const theta = -ARC * (i / steps)
    points.push({ x: c1.x + r * Math.cos(theta), z: c1.z + r * Math.sin(theta) })
  }

  const join = points[points.length - 1]
  const c2 = { x: join.x * 2 - c1.x, z: join.z * 2 - c1.z }
  for (let i = 1; i <= steps; i++) {
    const theta = Math.PI / 4 + ARC * (i / steps)
    points.push({ x: c2.x + r * Math.cos(theta), z: c2.z + r * Math.sin(theta) })
  }

  return points
}

export const CURVE_CENTERLINE = buildCenterline()
export const CURVE_START = CURVE_CENTERLINE[0]
export const CURVE_FINISH = CURVE_CENTERLINE[CURVE_CENTERLINE.length - 1]

export interface CurveVehicle {
  x: number
  z: number
  heading: number
  speed: number
  engineOn: boolean
}

export interface CurveInfraction {
  id: string
  title: string
  points: number
  fatal?: boolean
}

export interface CurveRuntime {
  started: boolean
  progressIndex: number
  stopSeconds: number
  stopPenaltyLatched: boolean
  reverseLatched: boolean
  completed: boolean
}

export function createCurveRuntime(): CurveRuntime {
  return {
    started: false,
    progressIndex: 0,
    stopSeconds: 0,
    stopPenaltyLatched: false,
    reverseLatched: false,
    completed: false,
  }
}

function distanceToSegment(px: number, pz: number, a: Point, b: Point) {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const lengthSq = dx * dx + dz * dz
  if (lengthSq === 0) return Math.hypot(px - a.x, pz - a.z)
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / lengthSq))
  return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t))
}

function nearestProgress(x: number, z: number) {
  let best = Number.POSITIVE_INFINITY
  let bestIndex = 0
  for (let i = 0; i < CURVE_CENTERLINE.length - 1; i++) {
    const d = distanceToSegment(x, z, CURVE_CENTERLINE[i], CURVE_CENTERLINE[i + 1])
    if (d < best) {
      best = d
      bestIndex = i
    }
  }
  return { distance: best, index: bestIndex }
}

function wheelPoints(vehicle: CurveVehicle) {
  const halfTrack = TRAINING_CAR.trackWidthMeters / 2
  const front = TRAINING_CAR.frontAxleFromCenterMeters
  const rear = TRAINING_CAR.rearAxleFromCenterMeters
  return [
    worldPointFromVehicle(vehicle.x, vehicle.z, vehicle.heading, front, halfTrack),
    worldPointFromVehicle(vehicle.x, vehicle.z, vehicle.heading, front, -halfTrack),
    worldPointFromVehicle(vehicle.x, vehicle.z, vehicle.heading, -rear, halfTrack),
    worldPointFromVehicle(vehicle.x, vehicle.z, vehicle.heading, -rear, -halfTrack),
  ].map(point => [point.x, point.z] as const)

}

function status(runtime: CurveRuntime) {
  if (runtime.completed) return '曲线行驶项目完成，可结束查看本项目成绩'
  if (!runtime.started) return '曲线行驶：一挡低速前进进入 S 弯，保持车轮不触轧两侧边线'
  const percent = Math.min(100, Math.round(runtime.progressIndex / (CURVE_CENTERLINE.length - 2) * 100))
  return `曲线行驶进行中 · 路线进度 ${percent}% · 保持连续前进，不要中途停车`
}

export function updateCurveDriving(
  vehicle: CurveVehicle,
  previous: CurveRuntime,
  dt: number,
): { runtime: CurveRuntime; infractions: CurveInfraction[]; status: string } {
  const runtime = { ...previous }
  const infractions: CurveInfraction[] = []
  if (runtime.completed) return { runtime, infractions, status: status(runtime) }

  const movingForward = vehicle.speed > 0.08
  const movingReverse = vehicle.speed < -0.08
  const stopped = Math.abs(vehicle.speed) < 0.035
  const nearest = nearestProgress(vehicle.x, vehicle.z)

  if (!runtime.started && movingForward && nearest.index <= 8) runtime.started = true
  if (runtime.started) runtime.progressIndex = Math.max(runtime.progressIndex, nearest.index)

  if (runtime.started) {
    const halfRoad = CURVE_DRIVING.roadWidth / 2
    if (wheelPoints(vehicle).some(([x, z]) => nearestWheelDistance(x, z) >= halfRoad)) {
      infractions.push({
        id: 'curve-wheel-line',
        title: '曲线行驶车轮触轧道路边缘线',
        points: 100,
        fatal: true,
      })
    }

    if (movingReverse && !runtime.reverseLatched) {
      runtime.reverseLatched = true
      infractions.push({
        id: 'curve-reverse',
        title: '曲线行驶未按规定路线连续前进',
        points: 100,
        fatal: true,
      })
    }

    if (stopped && vehicle.engineOn) {
      runtime.stopSeconds += dt
      if (runtime.stopSeconds > CURVE_DRIVING.stopLimitSeconds && !runtime.stopPenaltyLatched) {
        infractions.push({
          id: `curve-stop-${runtime.progressIndex}`,
          title: '曲线行驶中途停车',
          points: 5,
        })
        runtime.stopPenaltyLatched = true
      }
    } else if (!stopped) {
      runtime.stopSeconds = 0
      runtime.stopPenaltyLatched = false
    }

    if (runtime.progressIndex >= CURVE_CENTERLINE.length - 5 && movingForward) {
      runtime.completed = true
    }
  }

  return { runtime, infractions, status: status(runtime) }
}

function nearestWheelDistance(x: number, z: number) {
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < CURVE_CENTERLINE.length - 1; i++) {
    best = Math.min(best, distanceToSegment(x, z, CURVE_CENTERLINE[i], CURVE_CENTERLINE[i + 1]))
  }
  return best
}

function ribbonGeometry(points: Point[], width: number, offset = 0) {
  const positions: number[] = []
  const indices: number[] = []
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)]
    const next = points[Math.min(points.length - 1, i + 1)]
    const tx = next.x - prev.x
    const tz = next.z - prev.z
    const len = Math.hypot(tx, tz) || 1
    const nx = -tz / len
    const nz = tx / len
    const cx = points[i].x + nx * offset
    const cz = points[i].z + nz * offset
    const half = width / 2
    positions.push(cx + nx * half, 0, cz + nz * half)
    positions.push(cx - nx * half, 0, cz - nz * half)
    if (i < points.length - 1) {
      const a = i * 2
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function CurveDrivingCourse(): ReactElement {
  const road = useMemo(() => ribbonGeometry(CURVE_CENTERLINE, CURVE_DRIVING.roadWidth), [])
  const leftEdge = useMemo(() => ribbonGeometry(CURVE_CENTERLINE, 0.12, CURVE_DRIVING.roadWidth / 2), [])
  const rightEdge = useMemo(() => ribbonGeometry(CURVE_CENTERLINE, 0.12, -CURVE_DRIVING.roadWidth / 2), [])

  return <group>
    <mesh geometry={road} position-y={0.01}><meshStandardMaterial color="#3c4144" roughness={1} /></mesh>
    <mesh geometry={leftEdge} position-y={0.025}><meshBasicMaterial color="#f3d34a" /></mesh>
    <mesh geometry={rightEdge} position-y={0.025}><meshBasicMaterial color="#f3d34a" /></mesh>
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.08, 0]}>
      <planeGeometry args={[70, 55]} />
      <meshStandardMaterial color="#637657" />
    </mesh>
  </group>
}
