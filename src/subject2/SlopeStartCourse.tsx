import { useMemo, type ReactElement } from 'react'
import * as THREE from 'three'
import { TRAINING_CAR } from '../sim/vehicleDimensions'
import { worldPointFromVehicle } from '../sim/vehicleFrame'

export const SLOPE_START = {
  carLength: TRAINING_CAR.lengthMeters,
  carWidth: TRAINING_CAR.widthMeters,
  roadWidth: 3.2,
  rampLength: 20,
  minVerticalRadius: 20,
  stopLineDistanceFromBottom: 6.6,
  stopLineWidth: 0.3,
  controlOffset: 0.5,
  grade: 0.10,
  startLimitSeconds: 30,
} as const

export const SLOPE_GEOMETRY = {
  roadStartZ: 12,
  slopeBottomZ: 6,
  slopeTopZ: -14,
  roadEndZ: -20,
  stopLineZ: 6 - 6.6,
  roadHalf: 1.6,
} as const

export function getSlopePose(z: number) {
  if (z >= SLOPE_GEOMETRY.slopeBottomZ) return { y: 0, pitch: 0, grade: 0 }
  if (z <= SLOPE_GEOMETRY.slopeTopZ) return { y: SLOPE_START.rampLength * SLOPE_START.grade, pitch: 0, grade: 0 }
  const distance = SLOPE_GEOMETRY.slopeBottomZ - z
  return {
    y: distance * SLOPE_START.grade,
    pitch: Math.atan(SLOPE_START.grade),
    grade: SLOPE_START.grade,
  }
}

export interface SlopeVehicle {
  x: number
  z: number
  heading: number
  speed: number
  engineOn: boolean
  handbrake: boolean
}

export interface SlopeInfraction {
  id: string
  title: string
  points: number
  fatal?: boolean
}

export interface SlopeRuntime {
  phase: 'approach' | 'stopped' | 'starting' | 'complete'
  entered: boolean
  stopHoldSeconds: number
  stopEvaluated: boolean
  parkingBrakeEvaluated: boolean
  startElapsed: number
  stopCenterZ: number
  maxRollback: number
  rollbackEvaluated: boolean
  completed: boolean
}

export function createSlopeRuntime(): SlopeRuntime {
  return {
    phase: 'approach',
    entered: false,
    stopHoldSeconds: 0,
    stopEvaluated: false,
    parkingBrakeEvaluated: false,
    startElapsed: 0,
    stopCenterZ: 0,
    maxRollback: 0,
    rollbackEvaluated: false,
    completed: false,
  }
}

function wheelPoints(vehicle: SlopeVehicle) {
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

function frontBumperZ(vehicle: SlopeVehicle) {
  return worldPointFromVehicle(vehicle.x, vehicle.z, vehicle.heading, TRAINING_CAR.lengthMeters / 2, 0).z
}

function rightBodyGap(vehicle: SlopeVehicle) {
  const rightSide = worldPointFromVehicle(vehicle.x, vehicle.z, vehicle.heading, 0, TRAINING_CAR.widthMeters / 2)
  return SLOPE_GEOMETRY.roadHalf - rightSide.x
}

function status(runtime: SlopeRuntime) {
  switch (runtime.phase) {
    case 'approach':
      return '坡道定点停车：保持右侧车身距边线 30cm 内，将前保险杠停在桩杆线上'
    case 'stopped':
      return `已定点停车 · 拉紧手刹并在 30 秒内平稳起步 · ${Math.ceil(runtime.startElapsed)} / 30s`
    case 'starting':
      return '坡道起步：油离配合，防止后溜，继续驶过坡顶'
    case 'complete':
      return '坡道定点停车和起步项目完成，可结束查看本项目成绩'
  }
}

export function updateSlopeStart(
  vehicle: SlopeVehicle,
  previous: SlopeRuntime,
  dt: number,
): { runtime: SlopeRuntime; infractions: SlopeInfraction[]; status: string } {
  const runtime = { ...previous }
  const infractions: SlopeInfraction[] = []
  if (runtime.completed) return { runtime, infractions, status: status(runtime) }

  const movingForward = vehicle.speed > 0.08
  const stopped = Math.abs(vehicle.speed) < 0.035

  if (!runtime.entered && movingForward && vehicle.z < SLOPE_GEOMETRY.slopeBottomZ + 1) runtime.entered = true

  if (runtime.entered && wheelPoints(vehicle).some(([x]) => Math.abs(x) >= SLOPE_GEOMETRY.roadHalf)) {
    infractions.push({
      id: 'slope-wheel-line',
      title: '坡道行驶中车轮触轧道路边缘线',
      points: 100,
      fatal: true,
    })
  }

  if (runtime.phase === 'approach' && runtime.entered && stopped) {
    runtime.stopHoldSeconds += dt
    if (runtime.stopHoldSeconds >= 0.5) {
      runtime.phase = 'stopped'
      runtime.stopCenterZ = vehicle.z
      runtime.startElapsed = 0

      if (!runtime.stopEvaluated) {
        runtime.stopEvaluated = true
        const longitudinalError = Math.abs(frontBumperZ(vehicle) - SLOPE_GEOMETRY.stopLineZ)
        if (longitudinalError > 0.5) {
          infractions.push({
            id: 'slope-stop-longitudinal-fail',
            title: '定点停车后前保险杠距桩杆线前后偏差超过 50cm',
            points: 100,
            fatal: true,
          })
        } else if (longitudinalError > SLOPE_START.stopLineWidth / 2) {
          infractions.push({
            id: 'slope-stop-longitudinal-10',
            title: '定点停车后前保险杠未定于桩杆线，前后偏差不超过 50cm',
            points: 10,
          })
        }

        const gap = rightBodyGap(vehicle)
        if (gap > 0.5) {
          infractions.push({
            id: 'slope-right-gap-fail',
            title: '定点停车后车身距右侧道路边缘线超过 50cm',
            points: 100,
            fatal: true,
          })
        } else if (gap > 0.3) {
          infractions.push({
            id: 'slope-right-gap-10',
            title: '定点停车后车身距右侧道路边缘线超过 30cm 但未超过 50cm',
            points: 10,
          })
        }
      }
    }
  } else if (runtime.phase === 'approach' && !stopped) {
    runtime.stopHoldSeconds = 0
  }

  if (runtime.phase === 'stopped') {
    runtime.startElapsed += dt
    runtime.maxRollback = Math.max(runtime.maxRollback, vehicle.z - runtime.stopCenterZ)

    if (!runtime.parkingBrakeEvaluated && runtime.stopHoldSeconds + runtime.startElapsed > 1.2) {
      runtime.parkingBrakeEvaluated = true
      if (!vehicle.handbrake) {
        infractions.push({
          id: 'slope-no-parking-brake',
          title: '停车后未拉紧驻车制动器',
          points: 10,
        })
      }
    }

    if (runtime.startElapsed > SLOPE_START.startLimitSeconds) {
      infractions.push({
        id: 'slope-start-timeout',
        title: '坡道起步超过规定的 30 秒',
        points: 100,
        fatal: true,
      })
    }

    if (movingForward) {
      runtime.phase = 'starting'
    }
  }

  if (runtime.phase === 'starting') {
    runtime.maxRollback = Math.max(runtime.maxRollback, vehicle.z - runtime.stopCenterZ)
    if (!runtime.rollbackEvaluated && vehicle.z < runtime.stopCenterZ - 0.35) {
      runtime.rollbackEvaluated = true
      if (runtime.maxRollback > 0.30) {
        infractions.push({
          id: 'slope-rollback-fail',
          title: '坡道起步车辆后溜距离超过 30cm',
          points: 100,
          fatal: true,
        })
      } else if (runtime.maxRollback > 0.02) {
        infractions.push({
          id: 'slope-rollback-10',
          title: '坡道起步车辆发生后溜，距离不超过 30cm',
          points: 10,
        })
      }
    }

    if (vehicle.z < SLOPE_GEOMETRY.roadEndZ + 1) {
      runtime.phase = 'complete'
      runtime.completed = true
    }
  }

  return { runtime, infractions, status: status(runtime) }
}

function surfaceGeometry(width: number, yOffset = 0) {
  const positions: number[] = []
  const indices: number[] = []
  const segments = 80
  const start = SLOPE_GEOMETRY.roadStartZ
  const end = SLOPE_GEOMETRY.roadEndZ
  for (let i = 0; i <= segments; i++) {
    const z = start + (end - start) * (i / segments)
    const y = getSlopePose(z).y + yOffset
    positions.push(-width / 2, y, z, width / 2, y, z)
    if (i < segments) {
      const a = i * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function Marking({ z, width, depth, color }: { z: number; width: number; depth: number; color: string }) {
  const pose = getSlopePose(z)
  return <mesh position={[0, pose.y + 0.035, z]} rotation-x={pose.pitch}>
    <boxGeometry args={[width, 0.025, depth]} />
    <meshBasicMaterial color={color} />
  </mesh>
}

export function SlopeStartCourse(): ReactElement {
  const terrain = useMemo(() => surfaceGeometry(24, -0.07), [])
  const road = useMemo(() => surfaceGeometry(SLOPE_START.roadWidth, 0), [])
  const leftEdge = useMemo(() => surfaceGeometry(0.12, 0.025), [])

  return <group>
    <mesh geometry={terrain}><meshStandardMaterial color="#637657" roughness={1} /></mesh>
    <mesh geometry={road}><meshStandardMaterial color="#3c4144" roughness={1} /></mesh>

    <group position-x={-SLOPE_GEOMETRY.roadHalf + 0.06}><mesh geometry={leftEdge}><meshBasicMaterial color="#f3d34a" /></mesh></group>
    <group position-x={SLOPE_GEOMETRY.roadHalf - 0.06}><mesh geometry={leftEdge}><meshBasicMaterial color="#f3d34a" /></mesh></group>

    <Marking z={SLOPE_GEOMETRY.stopLineZ} width={SLOPE_START.roadWidth} depth={SLOPE_START.stopLineWidth} color="#f5f5f2" />
    <Marking z={SLOPE_GEOMETRY.stopLineZ + SLOPE_START.controlOffset + SLOPE_START.stopLineWidth / 2} width={SLOPE_START.roadWidth} depth={0.08} color="#f3d34a" />
    <Marking z={SLOPE_GEOMETRY.stopLineZ - SLOPE_START.controlOffset - SLOPE_START.stopLineWidth / 2} width={SLOPE_START.roadWidth} depth={0.08} color="#f3d34a" />

    <group position={[SLOPE_GEOMETRY.roadHalf + 0.55, getSlopePose(SLOPE_GEOMETRY.stopLineZ).y, SLOPE_GEOMETRY.stopLineZ]}>
      <mesh position={[0, 1.0, 0]}><cylinderGeometry args={[0.035, 0.035, 2.0, 10]} /><meshStandardMaterial color="#f2f2f2" /></mesh>
      <mesh position={[0, 1.75, 0]}><boxGeometry args={[0.08, 0.55, 0.9]} /><meshStandardMaterial color="#176aa7" /></mesh>
    </group>
  </group>
}
