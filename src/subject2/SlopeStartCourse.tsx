import { useMemo, type MutableRefObject, type ReactElement } from 'react'
import * as THREE from 'three'
import type { Vehicle } from '../sim/vehicleCollision'
import type { VehicleAudioState } from '../audio/vehicleAudio'
import type { CoursePlacement } from './courseTransform'
import { SignPost } from './SignPost'
import { SUBJECT2_NATIONAL_RULE_PROFILE, type Subject2RuleProfile } from '../rules/subject2RuleProfile'
import { SUBJECT2_BOUNDARY_LINE_WIDTH_METERS } from './courseMarkings'
import { SUBJECT2_RULE_LIMITS, subject2Infraction } from '../rules/subject2Rules'
import { TRAINING_CAR } from '../sim/vehicleDimensions'
import { worldPointFromVehicle } from '../sim/vehicleFrame'
import { wheelContactFootprints } from '../sim/wheelContact'

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
  startLimitSeconds: SUBJECT2_RULE_LIMITS.slopeStart.startLimitSeconds,
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
  steering?: number
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

function frontBumperZ(vehicle: SlopeVehicle) {
  return worldPointFromVehicle(vehicle.x, vehicle.z, vehicle.heading, TRAINING_CAR.lengthMeters / 2, 0).z
}

function rightBodyGap(vehicle: SlopeVehicle) {
  const rightSide = worldPointFromVehicle(vehicle.x, vehicle.z, vehicle.heading, 0, TRAINING_CAR.widthMeters / 2)
  return SLOPE_GEOMETRY.roadHalf - rightSide.x
}

function exceedsMeasurement(value: number, limit: number, measurementEpsilon: number) {
  return value > limit + measurementEpsilon
}

function status(runtime: SlopeRuntime, startLimitSeconds: number = SUBJECT2_RULE_LIMITS.slopeStart.startLimitSeconds) {
  switch (runtime.phase) {
    case 'approach':
      return '坡道定点停车：保持右侧车身距边线 30cm 内，将前保险杠停在桩杆线上'
    case 'stopped':
      return `已定点停车 · 拉紧手刹并在 ${startLimitSeconds} 秒内平稳起步 · ${Math.ceil(runtime.startElapsed)} / ${startLimitSeconds}s`
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
  profile: Subject2RuleProfile = SUBJECT2_NATIONAL_RULE_PROFILE,
): { runtime: SlopeRuntime; infractions: SlopeInfraction[]; status: string } {
  const runtime = { ...previous }
  const infractions: SlopeInfraction[] = []
  const rules = profile.limits.slopeStart
  if (runtime.completed) return { runtime, infractions, status: status(runtime, rules.startLimitSeconds) }

  const movingForward = vehicle.speed > 0.08
  const stopped = Math.abs(vehicle.speed) < 0.035
  const inCourseEntry =
    Math.abs(vehicle.x) <= SLOPE_GEOMETRY.roadHalf &&
    vehicle.z <= SLOPE_GEOMETRY.roadStartZ &&
    vehicle.z >= SLOPE_GEOMETRY.roadEndZ

  if (!runtime.entered && movingForward && inCourseEntry) runtime.entered = true

  if (
    runtime.entered &&
    wheelContactFootprints(vehicle).some(footprint =>
      footprint.corners.some(point =>
        Math.abs(point.x) >= SLOPE_GEOMETRY.roadHalf - SUBJECT2_BOUNDARY_LINE_WIDTH_METERS,
      ),
    )
  ) {
    infractions.push(subject2Infraction('slope-wheel-line'))
  }

  if (runtime.phase === 'approach' && runtime.entered && stopped) {
    runtime.stopHoldSeconds += dt
    if (runtime.stopHoldSeconds >= rules.stopHoldSeconds) {
      runtime.phase = 'stopped'
      runtime.stopCenterZ = vehicle.z
      runtime.startElapsed = 0

      if (!runtime.stopEvaluated) {
        runtime.stopEvaluated = true
        const longitudinalError = Math.abs(frontBumperZ(vehicle) - SLOPE_GEOMETRY.stopLineZ)
        if (exceedsMeasurement(longitudinalError, rules.stopLongitudinalFatalMeters, rules.measurementEpsilon)) {
          infractions.push(subject2Infraction('slope-stop-longitudinal-fail'))
        } else if (exceedsMeasurement(longitudinalError, rules.stopLongitudinalMinorMeters, rules.measurementEpsilon)) {
          infractions.push(subject2Infraction('slope-stop-longitudinal-10'))
        }

        const gap = rightBodyGap(vehicle)
        if (exceedsMeasurement(gap, rules.rightGapFatalMeters, rules.measurementEpsilon)) {
          infractions.push(subject2Infraction('slope-right-gap-fail'))
        } else if (exceedsMeasurement(gap, rules.rightGapMinorMeters, rules.measurementEpsilon)) {
          infractions.push(subject2Infraction('slope-right-gap-10'))
        }
      }
    }
  } else if (runtime.phase === 'approach' && !stopped) {
    runtime.stopHoldSeconds = 0
  }

  if (runtime.phase === 'stopped') {
    runtime.startElapsed += dt
    runtime.maxRollback = Math.max(runtime.maxRollback, vehicle.z - runtime.stopCenterZ)

    if (!runtime.parkingBrakeEvaluated && runtime.stopHoldSeconds + runtime.startElapsed > rules.parkingBrakeCheckSeconds) {
      runtime.parkingBrakeEvaluated = true
      if (!vehicle.handbrake) {
        infractions.push(subject2Infraction('slope-no-parking-brake'))
      }
    }

    if (runtime.startElapsed > rules.startLimitSeconds) {
      infractions.push(subject2Infraction('slope-start-timeout'))
    }

    if (movingForward) {
      runtime.phase = 'starting'
    }
  }

  if (runtime.phase === 'starting') {
    runtime.maxRollback = Math.max(runtime.maxRollback, vehicle.z - runtime.stopCenterZ)
    if (!runtime.rollbackEvaluated && vehicle.z < runtime.stopCenterZ - rules.rollbackEvaluateAfterForwardMeters) {
      runtime.rollbackEvaluated = true
      if (exceedsMeasurement(runtime.maxRollback, rules.rollbackFatalMeters, rules.measurementEpsilon)) {
        infractions.push(subject2Infraction('slope-rollback-fail'))
      } else if (exceedsMeasurement(runtime.maxRollback, rules.rollbackMinimumMeters, rules.measurementEpsilon)) {
        infractions.push(subject2Infraction('slope-rollback-10'))
      }
    }

    if (vehicle.z < SLOPE_GEOMETRY.roadEndZ + 1) {
      runtime.phase = 'complete'
      runtime.completed = true
    }
  }

  return { runtime, infractions, status: status(runtime, rules.startLimitSeconds) }
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

export interface SlopeStartCourseProps {
  vehicle?: MutableRefObject<Vehicle>
  placement?: CoursePlacement
  audioContext?: AudioContext | null
  audioState?: VehicleAudioState
}

export function SlopeStartCourse({
  vehicle,
  placement,
  audioContext,
  audioState,
}: SlopeStartCourseProps = {}): ReactElement {
  const terrain = useMemo(() => surfaceGeometry(24, -0.07), [])
  const road = useMemo(() => surfaceGeometry(SLOPE_START.roadWidth, 0), [])
  const leftEdge = useMemo(() => surfaceGeometry(SUBJECT2_BOUNDARY_LINE_WIDTH_METERS, 0.025), [])

  return <group>
    <mesh geometry={terrain} receiveShadow><meshStandardMaterial color="#637657" roughness={1} /></mesh>
    <mesh geometry={road} receiveShadow><meshStandardMaterial color="#3c4144" roughness={1} /></mesh>

    <group position-x={-SLOPE_GEOMETRY.roadHalf + SUBJECT2_BOUNDARY_LINE_WIDTH_METERS / 2}><mesh geometry={leftEdge}><meshBasicMaterial color="#f3d34a" /></mesh></group>
    <group position-x={SLOPE_GEOMETRY.roadHalf - SUBJECT2_BOUNDARY_LINE_WIDTH_METERS / 2}><mesh geometry={leftEdge}><meshBasicMaterial color="#f3d34a" /></mesh></group>

    <Marking z={SLOPE_GEOMETRY.stopLineZ} width={SLOPE_START.roadWidth} depth={SLOPE_START.stopLineWidth} color="#f5f5f2" />
    <Marking z={SLOPE_GEOMETRY.stopLineZ + SLOPE_START.controlOffset + SLOPE_START.stopLineWidth / 2} width={SLOPE_START.roadWidth} depth={0.08} color="#f3d34a" />
    <Marking z={SLOPE_GEOMETRY.stopLineZ - SLOPE_START.controlOffset - SLOPE_START.stopLineWidth / 2} width={SLOPE_START.roadWidth} depth={0.08} color="#f3d34a" />

    <group position-y={getSlopePose(SLOPE_GEOMETRY.stopLineZ).y}>
      <SignPost
        x={SLOPE_GEOMETRY.roadHalf + 0.55}
        z={SLOPE_GEOMETRY.stopLineZ}
        vehicle={vehicle}
        placement={placement}
        audioContext={audioContext}
        audioState={audioState}
      />
    </group>
  </group>
}
