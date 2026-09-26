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
import { vehicleBodyFootprint } from '../sim/vehicleFootprint'
import {
  footprintIntersectsAxisAlignedRect,
  footprintTouchesOutsideRectUnion,
  wheelContactFootprints,
  type AxisAlignedRect,
} from '../sim/wheelContact'

export const SIDE_PARKING = {
  carLength: TRAINING_CAR.lengthMeters,
  carWidth: TRAINING_CAR.widthMeters,
  bayLength: 7.6,
  bayWidth: 2.5,
  laneWidth: 3.4,
  frontEdgeLength: 4.5,
  rearEdgeLength: 1.0,
  timeLimitSeconds: SUBJECT2_RULE_LIMITS.sideParking.timeLimitSeconds,
  stopLimitSeconds: SUBJECT2_RULE_LIMITS.sideParking.stopLimitSeconds,
} as const

const laneHalf = SIDE_PARKING.laneWidth / 2
const bayHalfLength = SIDE_PARKING.bayLength / 2
const bayMouthX = laneHalf
const bayBackX = bayMouthX + SIDE_PARKING.bayWidth
const laneStartZ = bayHalfLength + SIDE_PARKING.frontEdgeLength + 2.5
const laneEndZ = -bayHalfLength - SIDE_PARKING.rearEdgeLength - 2.5
// Finish while the whole vehicle is still inside the modeled exit lane.
// The old laneEndZ + 0.8 threshold forced the front of a legal exiting car
// beyond laneEndZ before completion, causing a false line-contact penalty.
const exitCompleteZ = laneEndZ + SIDE_PARKING.carLength / 2 + 0.2

export const SIDE_PARKING_GEOMETRY = {
  laneHalf,
  bayHalfLength,
  bayMouthX,
  bayBackX,
  laneStartZ,
  laneEndZ,
  exitCompleteZ,
} as const

export type SideParkingPhase = 'approach' | 'reverse' | 'parked' | 'exit' | 'complete'

export interface SideParkingVehicle {
  x: number
  z: number
  heading: number
  steering?: number
  speed: number
  gear: number
  engineOn: boolean
  leftIndicator: boolean
}

export interface SideParkingInfraction {
  id: string
  title: string
  points: number
  fatal?: boolean
}

export interface SideParkingRuntime {
  phase: SideParkingPhase
  entered: boolean
  started: boolean
  elapsed: number
  stopSeconds: number
  stopPenaltyLatched: boolean
  parkedHoldSeconds: number
  contactLatched: boolean
  exitSignalChecked: boolean
  completed: boolean
}

export function createSideParkingRuntime(): SideParkingRuntime {
  return {
    phase: 'approach',
    entered: false,
    started: false,
    elapsed: 0,
    stopSeconds: 0,
    stopPenaltyLatched: false,
    parkedHoldSeconds: 0,
    contactLatched: false,
    exitSignalChecked: false,
    completed: false,
  }
}

function allowedRoadRects(): readonly AxisAlignedRect[] {
  const g = SIDE_PARKING_GEOMETRY
  return [
    {
      minX: -g.laneHalf,
      maxX: g.laneHalf,
      minZ: g.laneEndZ,
      maxZ: g.laneStartZ,
    },
    {
      minX: g.bayMouthX,
      maxX: g.bayBackX,
      minZ: -g.bayHalfLength,
      maxZ: g.bayHalfLength,
    },
  ]
}

function boundaryLineRects(): readonly AxisAlignedRect[] {
  const g = SIDE_PARKING_GEOMETRY
  const line = SUBJECT2_BOUNDARY_LINE_WIDTH_METERS
  const laneCenterZ = (g.laneStartZ + g.laneEndZ) / 2
  const laneLength = g.laneStartZ - g.laneEndZ
  return [
    subject2LineRect(-g.laneHalf, laneCenterZ, line, laneLength),
    subject2LineRect(
      g.laneHalf,
      (g.bayHalfLength + g.laneStartZ) / 2,
      line,
      g.laneStartZ - g.bayHalfLength,
    ),
    subject2LineRect(
      g.laneHalf,
      (g.laneEndZ - g.bayHalfLength) / 2,
      line,
      -g.bayHalfLength - g.laneEndZ,
    ),
    subject2LineRect(
      (g.bayMouthX + g.bayBackX) / 2,
      g.bayHalfLength,
      SIDE_PARKING.bayWidth,
      line,
    ),
    subject2LineRect(
      (g.bayMouthX + g.bayBackX) / 2,
      -g.bayHalfLength,
      SIDE_PARKING.bayWidth,
      line,
    ),
    subject2LineRect(g.bayBackX, 0, line, SIDE_PARKING.bayLength),
  ]
}

function wheelTouchesBoundary(vehicle: SideParkingVehicle) {
  const legalRects = allowedRoadRects()
  const lineRects = boundaryLineRects()
  return wheelContactFootprints(vehicle).some(footprint =>
    footprintTouchesOutsideRectUnion(footprint, legalRects, 0) ||
    lineRects.some(rect => footprintIntersectsAxisAlignedRect(footprint, rect)),
  )
}

function fullyInsideBay(vehicle: SideParkingVehicle) {
  const g = SIDE_PARKING_GEOMETRY
  return vehicleBodyFootprint(vehicle).every(point =>
    point.x > g.bayMouthX + 0.02 &&
    point.x < g.bayBackX - 0.02 &&
    point.z > -g.bayHalfLength + 0.02 &&
    point.z < g.bayHalfLength - 0.02,
  )
}

function centerInsideBay(vehicle: SideParkingVehicle) {
  const g = SIDE_PARKING_GEOMETRY
  return vehicle.x > g.bayMouthX && vehicle.x < g.bayBackX && Math.abs(vehicle.z) < g.bayHalfLength
}

function status(runtime: SideParkingRuntime, timeLimitSeconds: number = SUBJECT2_RULE_LIMITS.sideParking.timeLimitSeconds) {
  const timer = runtime.started ? ` · ${Math.ceil(runtime.elapsed)} / ${timeLimitSeconds}s` : ''
  switch (runtime.phase) {
    case 'approach': return '向前驶过库位，调整车身与右侧边线距离，准备挂 R 挡'
    case 'reverse': return '倒车入侧方库：结合右后视镜观察库角与车身' + timer
    case 'parked': return '车辆已停入库位：开启左转向灯，挂前进挡驶出' + timer
    case 'exit': return '驶出侧方停车区域，保持车身不触碰道路边线' + timer
    case 'complete': return '侧方停车项目完成，可结束查看本项目成绩'
  }
}

export function updateSideParking(
  vehicle: SideParkingVehicle,
  previous: SideParkingRuntime,
  dt: number,
  profile: Subject2RuleProfile = SUBJECT2_NATIONAL_RULE_PROFILE,
): { runtime: SideParkingRuntime; infractions: SideParkingInfraction[]; status: string } {
  const runtime = { ...previous }
  const infractions: SideParkingInfraction[] = []
  const rules = profile.limits.sideParking
  if (runtime.completed) return { runtime, infractions, status: status(runtime, rules.timeLimitSeconds) }

  const movingReverse = vehicle.speed < -0.08
  const movingForward = vehicle.speed > 0.08
  const stopped = Math.abs(vehicle.speed) < 0.035
  const inBay = fullyInsideBay(vehicle)
  const inEntryLane =
    Math.abs(vehicle.x) <= SIDE_PARKING_GEOMETRY.laneHalf &&
    vehicle.z <= SIDE_PARKING_GEOMETRY.laneStartZ &&
    vehicle.z >= SIDE_PARKING_GEOMETRY.laneEndZ

  if (!runtime.entered && inEntryLane) runtime.entered = true

  if (runtime.phase === 'approach' && runtime.entered && movingReverse) {
    runtime.phase = 'reverse'
    runtime.started = true
  }

  if (runtime.started && runtime.phase !== 'complete') {
    runtime.elapsed += dt
    if (runtime.elapsed > rules.timeLimitSeconds) {
      infractions.push(subject2Infraction('side-parking-timeout'))
    }
  }

  if (runtime.started && wheelTouchesBoundary(vehicle)) {
    if (!runtime.contactLatched) {
      infractions.push(subject2Infraction('side-parking-line-contact', Math.floor(runtime.elapsed * 10)))
      runtime.contactLatched = true
    }
  } else {
    runtime.contactLatched = false
  }

  if (runtime.phase === 'reverse' && stopped && inBay) {
    runtime.parkedHoldSeconds += dt
    if (runtime.parkedHoldSeconds >= rules.parkedHoldSeconds) {
      runtime.phase = 'parked'
      runtime.parkedHoldSeconds = 0
      runtime.stopSeconds = 0
      runtime.stopPenaltyLatched = false
    }
  } else if (runtime.phase === 'reverse' && stopped && centerInsideBay(vehicle) && !inBay) {
    runtime.parkedHoldSeconds += dt
    if (runtime.parkedHoldSeconds >= rules.bodyOutAfterStopHoldSeconds) {
      infractions.push(subject2Infraction('side-parking-body-out-after-stop'))
    }
  } else {
    runtime.parkedHoldSeconds = 0
  }

  if (runtime.phase === 'parked' && movingForward) {
    if (!runtime.exitSignalChecked) {
      runtime.exitSignalChecked = true
      if (!vehicle.leftIndicator) {
        infractions.push(subject2Infraction('side-parking-exit-signal'))
      }
    }
    runtime.phase = 'exit'
  }

  if (runtime.phase === 'exit' && vehicle.z < SIDE_PARKING_GEOMETRY.exitCompleteZ && Math.abs(vehicle.x) < SIDE_PARKING_GEOMETRY.laneHalf) {
    runtime.phase = 'complete'
    runtime.completed = true
  }

  const mayPenalizeStop = runtime.started && !['parked', 'complete'].includes(runtime.phase) && !(runtime.phase === 'reverse' && inBay)
  if (mayPenalizeStop && stopped && vehicle.engineOn) {
    runtime.stopSeconds += dt
    if (runtime.stopSeconds > rules.stopLimitSeconds && !runtime.stopPenaltyLatched) {
      infractions.push(subject2Infraction('side-parking-stop', Math.floor(runtime.elapsed * 10)))
      runtime.stopPenaltyLatched = true
    }
  } else if (!stopped) {
    runtime.stopSeconds = 0
    runtime.stopPenaltyLatched = false
  }

  return { runtime, infractions, status: status(runtime, rules.timeLimitSeconds) }
}

function Line({ x, z, width, depth }: { x: number; z: number; width: number; depth: number }) {
  return <mesh rotation-x={-Math.PI / 2} position={[x, 0.012, z]}>
    <planeGeometry args={[width, depth]} />
    <meshBasicMaterial color="#f3d34a" />
  </mesh>
}

export interface SideParkingCourseProps {
  vehicle?: MutableRefObject<Vehicle>
  placement?: CoursePlacement
  audioContext?: AudioContext | null
  audioState?: VehicleAudioState
}

export function SideParkingCourse({
  vehicle,
  placement,
  audioContext,
  audioState,
}: SideParkingCourseProps = {}): ReactElement {
  const g = SIDE_PARKING_GEOMETRY
  const laneCenterZ = (g.laneStartZ + g.laneEndZ) / 2
  const laneLength = g.laneStartZ - g.laneEndZ
  return <group>
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.025, laneCenterZ]} receiveShadow>
      <planeGeometry args={[SIDE_PARKING.laneWidth, laneLength]} />
      <meshStandardMaterial color="#3c4144" roughness={1} />
    </mesh>
    <mesh rotation-x={-Math.PI / 2} position={[(g.bayMouthX + g.bayBackX) / 2, -0.024, 0]} receiveShadow>
      <planeGeometry args={[SIDE_PARKING.bayWidth, SIDE_PARKING.bayLength]} />
      <meshStandardMaterial color="#3c4144" roughness={1} />
    </mesh>

    <Line x={-g.laneHalf} z={laneCenterZ} width={SUBJECT2_BOUNDARY_LINE_WIDTH_METERS} depth={laneLength} />
    <Line x={g.laneHalf} z={(g.bayHalfLength + g.laneStartZ) / 2} width={SUBJECT2_BOUNDARY_LINE_WIDTH_METERS} depth={g.laneStartZ - g.bayHalfLength} />
    <Line x={g.laneHalf} z={(g.laneEndZ - g.bayHalfLength) / 2} width={SUBJECT2_BOUNDARY_LINE_WIDTH_METERS} depth={-g.bayHalfLength - g.laneEndZ} />

    <Line x={(g.bayMouthX + g.bayBackX) / 2} z={g.bayHalfLength} width={SIDE_PARKING.bayWidth} depth={SUBJECT2_BOUNDARY_LINE_WIDTH_METERS} />
    <Line x={(g.bayMouthX + g.bayBackX) / 2} z={-g.bayHalfLength} width={SIDE_PARKING.bayWidth} depth={SUBJECT2_BOUNDARY_LINE_WIDTH_METERS} />
    <Line x={g.bayBackX} z={0} width={SUBJECT2_BOUNDARY_LINE_WIDTH_METERS} depth={SIDE_PARKING.bayLength} />

    {[
      [g.bayBackX + 0.25, g.bayHalfLength + 0.3],
      [g.bayBackX + 0.25, -g.bayHalfLength - 0.3],
      [g.bayMouthX + 0.2, -g.bayHalfLength - 0.3],
      [g.bayMouthX + 0.2, g.bayHalfLength + 0.3],
    ].map(([x, z], i) => (
      <TrafficCone
        key={i}
        x={x}
        z={z}
        vehicle={vehicle}
        placement={placement}
        audioContext={audioContext}
        audioState={audioState}
      />
    ))}

    <mesh rotation-x={-Math.PI / 2} position={[0, -0.08, 0]} receiveShadow>
      <planeGeometry args={[45, 40]} />
      <meshStandardMaterial color="#637657" />
    </mesh>
  </group>
}
