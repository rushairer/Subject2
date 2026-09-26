import type { MutableRefObject, ReactElement } from 'react'
import type { Vehicle } from '../sim/vehicleCollision'
import type { VehicleAudioState } from '../audio/vehicleAudio'
import type { CoursePlacement } from './courseTransform'
import { TrafficCone } from './TrafficCone'
import { SUBJECT2_NATIONAL_RULE_PROFILE, type Subject2RuleProfile } from '../rules/subject2RuleProfile'
import {
  SUBJECT2_BOUNDARY_LINE_WIDTH_METERS,
  subject2LineRect,
} from './courseMarkings'
import { SUBJECT2_RULE_LIMITS, subject2Infraction } from '../rules/subject2Rules'
import { TRAINING_CAR } from '../sim/vehicleDimensions'
import {
  footprintIntersectsAxisAlignedRect,
  footprintTouchesOutsideRectUnion,
  wheelContactFootprints,
  type AxisAlignedRect,
} from '../sim/wheelContact'

export const RIGHT_ANGLE = {
  carLength: TRAINING_CAR.lengthMeters,
  carWidth: TRAINING_CAR.widthMeters,
  roadWidth: 3.6,
  legLength: 6.8,
  stopLimitSeconds: SUBJECT2_RULE_LIMITS.rightAngle.stopLimitSeconds,
} as const

const half = RIGHT_ANGLE.roadWidth / 2
const entryMaxZ = 8.8
const cornerCenterZ = -3.6
const horizontalMinX = -8.8

export const RIGHT_ANGLE_GEOMETRY = {
  half,
  entryMaxZ,
  cornerCenterZ,
  horizontalMinX,
} as const

export interface RightAngleVehicle {
  x: number
  z: number
  heading: number
  steering?: number
  speed: number
  engineOn: boolean
  leftIndicator: boolean
}

export interface RightAngleInfraction {
  id: string
  title: string
  points: number
  fatal?: boolean
}

export interface RightAngleRuntime {
  phase: 'approach' | 'turning' | 'exit' | 'complete'
  entered: boolean
  stopSeconds: number
  stopPenaltyLatched: boolean
  stopPenaltySequence: number
  turnSignalChecked: boolean
  signalCloseChecked: boolean
  completed: boolean
}

export function createRightAngleRuntime(): RightAngleRuntime {
  return {
    phase: 'approach',
    entered: false,
    stopSeconds: 0,
    stopPenaltyLatched: false,
    stopPenaltySequence: 0,
    turnSignalChecked: false,
    signalCloseChecked: false,
    completed: false,
  }
}

function allowedRoadRects(): readonly AxisAlignedRect[] {
  const g = RIGHT_ANGLE_GEOMETRY
  return [
    {
      minX: -g.half,
      maxX: g.half,
      minZ: g.cornerCenterZ - g.half,
      maxZ: g.entryMaxZ,
    },
    {
      minX: g.horizontalMinX,
      maxX: g.half,
      minZ: g.cornerCenterZ - g.half,
      maxZ: g.cornerCenterZ + g.half,
    },
  ]
}

function boundaryLineRects(): readonly AxisAlignedRect[] {
  const g = RIGHT_ANGLE_GEOMETRY
  const line = SUBJECT2_BOUNDARY_LINE_WIDTH_METERS
  const entryLength = g.entryMaxZ - (g.cornerCenterZ - g.half)
  const entryCenterZ = (g.entryMaxZ + g.cornerCenterZ - g.half) / 2
  const exitLength = g.half - g.horizontalMinX
  const exitCenterX = (g.horizontalMinX + g.half) / 2
  return [
    subject2LineRect(g.half, entryCenterZ, line, entryLength),
    subject2LineRect(
      -g.half,
      (g.entryMaxZ + g.cornerCenterZ + g.half) / 2,
      line,
      g.entryMaxZ - (g.cornerCenterZ + g.half),
    ),
    subject2LineRect(
      (g.horizontalMinX - g.half) / 2,
      g.cornerCenterZ + g.half,
      g.half - g.horizontalMinX,
      line,
    ),
    subject2LineRect(
      exitCenterX,
      g.cornerCenterZ - g.half,
      exitLength,
      line,
    ),
    subject2LineRect(
      g.horizontalMinX,
      g.cornerCenterZ,
      line,
      RIGHT_ANGLE.roadWidth,
    ),
  ]
}

function normalizedAngle(angle: number) {
  let a = angle
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

function status(runtime: RightAngleRuntime) {
  switch (runtime.phase) {
    case 'approach': return '直角转弯：进入转弯前开启左转向灯，控制车身靠右并低速行驶'
    case 'turning': return '正在左直角转弯：观察左侧车头与道路边缘，避免车轮轧线'
    case 'exit': return '转弯完成：回正方向并及时关闭左转向灯'
    case 'complete': return '直角转弯项目完成，可结束查看本项目成绩'
  }
}

export function updateRightAngle(
  vehicle: RightAngleVehicle,
  previous: RightAngleRuntime,
  dt: number,
  profile: Subject2RuleProfile = SUBJECT2_NATIONAL_RULE_PROFILE,
): { runtime: RightAngleRuntime; infractions: RightAngleInfraction[]; status: string } {
  const runtime = { ...previous }
  const infractions: RightAngleInfraction[] = []
  const rules = profile.limits.rightAngle
  if (runtime.completed) return { runtime, infractions, status: status(runtime) }

  const stopped = Math.abs(vehicle.speed) < 0.035
  const heading = normalizedAngle(vehicle.heading)
  const inEntryLane =
    Math.abs(vehicle.x) <= RIGHT_ANGLE_GEOMETRY.half &&
    vehicle.z <= RIGHT_ANGLE_GEOMETRY.entryMaxZ &&
    vehicle.z >= RIGHT_ANGLE_GEOMETRY.cornerCenterZ - RIGHT_ANGLE_GEOMETRY.half

  if (!runtime.entered && inEntryLane) runtime.entered = true

  if (
    runtime.entered &&
    wheelContactFootprints(vehicle).some(footprint =>
      footprintTouchesOutsideRectUnion(footprint, allowedRoadRects(), 0) ||
      boundaryLineRects().some(rect =>
        footprintIntersectsAxisAlignedRect(footprint, rect),
      ),
    )
  ) {
    infractions.push(subject2Infraction('right-angle-wheel-out'))
  }

  const enteringTurn =
    runtime.entered &&
    (vehicle.z < RIGHT_ANGLE_GEOMETRY.cornerCenterZ + 2.2 || heading < -0.15)
  if (runtime.phase === 'approach' && enteringTurn) {
    runtime.phase = 'turning'
    if (!runtime.turnSignalChecked) {
      runtime.turnSignalChecked = true
      if (!vehicle.leftIndicator) {
        infractions.push(subject2Infraction('right-angle-no-signal'))
      }
    }
  }

  const alignedWithExit = heading < -1.15 && heading > -1.95 && vehicle.x < -2.2
  if (runtime.phase === 'turning' && alignedWithExit) {
    runtime.phase = 'exit'
  }

  if (runtime.phase === 'exit' && vehicle.x < -4.2 && !runtime.signalCloseChecked) {
    runtime.signalCloseChecked = true
    if (vehicle.leftIndicator) {
      infractions.push(subject2Infraction('right-angle-signal-not-cancelled'))
    }
  }

  if (runtime.phase === 'exit' && vehicle.x < -7.2) {
    runtime.phase = 'complete'
    runtime.completed = true
  }

  if (runtime.entered && !['complete'].includes(runtime.phase) && stopped && vehicle.engineOn) {
    runtime.stopSeconds += dt
    if (runtime.stopSeconds > rules.stopLimitSeconds && !runtime.stopPenaltyLatched) {
      runtime.stopPenaltySequence += 1
      infractions.push(subject2Infraction('right-angle-stop', runtime.stopPenaltySequence))
      runtime.stopPenaltyLatched = true
    }
  } else if (!stopped) {
    runtime.stopSeconds = 0
    runtime.stopPenaltyLatched = false
  }

  return { runtime, infractions, status: status(runtime) }
}

function Line({ x, z, width, depth }: { x: number; z: number; width: number; depth: number }) {
  return <mesh rotation-x={-Math.PI / 2} position={[x, 0.012, z]}>
    <planeGeometry args={[width, depth]} />
    <meshBasicMaterial color="#f3d34a" />
  </mesh>
}

export interface RightAngleCourseProps {
  vehicle?: MutableRefObject<Vehicle>
  placement?: CoursePlacement
  audioContext?: AudioContext | null
  audioState?: VehicleAudioState
}

export function RightAngleCourse({
  vehicle,
  placement,
  audioContext,
  audioState,
}: RightAngleCourseProps = {}): ReactElement {
  const g = RIGHT_ANGLE_GEOMETRY
  const entryLength = g.entryMaxZ - (g.cornerCenterZ - g.half)
  const entryCenterZ = (g.entryMaxZ + g.cornerCenterZ - g.half) / 2
  const exitLength = g.half - g.horizontalMinX
  const exitCenterX = (g.horizontalMinX + g.half) / 2

  return <group>
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.025, entryCenterZ]}>
      <planeGeometry args={[RIGHT_ANGLE.roadWidth, entryLength]} />
      <meshStandardMaterial color="#3c4144" roughness={1} />
    </mesh>
    <mesh rotation-x={-Math.PI / 2} position={[exitCenterX, -0.024, g.cornerCenterZ]}>
      <planeGeometry args={[exitLength, RIGHT_ANGLE.roadWidth]} />
      <meshStandardMaterial color="#3c4144" roughness={1} />
    </mesh>

    <Line x={g.half} z={entryCenterZ} width={SUBJECT2_BOUNDARY_LINE_WIDTH_METERS} depth={entryLength} />
    <Line x={-g.half} z={(g.entryMaxZ + g.cornerCenterZ + g.half) / 2} width={SUBJECT2_BOUNDARY_LINE_WIDTH_METERS} depth={g.entryMaxZ - (g.cornerCenterZ + g.half)} />
    <Line x={(g.horizontalMinX - g.half) / 2} z={g.cornerCenterZ + g.half} width={g.half - g.horizontalMinX} depth={SUBJECT2_BOUNDARY_LINE_WIDTH_METERS} />
    <Line x={exitCenterX} z={g.cornerCenterZ - g.half} width={exitLength} depth={SUBJECT2_BOUNDARY_LINE_WIDTH_METERS} />
    <Line x={g.horizontalMinX} z={g.cornerCenterZ} width={SUBJECT2_BOUNDARY_LINE_WIDTH_METERS} depth={RIGHT_ANGLE.roadWidth} />

    {/* Inner corner apex traffic cone */}
    <TrafficCone
      x={-g.half - 0.22}
      z={g.cornerCenterZ + g.half + 0.22}
      vehicle={vehicle}
      placement={placement}
      audioContext={audioContext}
      audioState={audioState}
    />

    <mesh rotation-x={-Math.PI / 2} position={[0, -0.08, 0]}>
      <planeGeometry args={[42, 42]} />
      <meshStandardMaterial color="#637657" />
    </mesh>
  </group>
}
