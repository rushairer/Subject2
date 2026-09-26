import type { MutableRefObject, ReactElement } from 'react'
import type { Vehicle } from '../sim/vehicleCollision'
import type { VehicleAudioState } from '../audio/vehicleAudio'
import type { CoursePlacement } from './courseTransform'
import { TrafficCone } from './TrafficCone'
import { SignPost } from './SignPost'
import { SUBJECT2_NATIONAL_RULE_PROFILE, type Subject2RuleProfile } from '../rules/subject2RuleProfile'
import { SUBJECT2_BOUNDARY_LINE_WIDTH_METERS } from './courseMarkings'
import { SUBJECT2_RULE_LIMITS, subject2Infraction } from '../rules/subject2Rules'
import { polygonTouchesOutsideRectUnion, type AxisAlignedRect } from '../sim/planarGeometry'
import { TRAINING_CAR } from '../sim/vehicleDimensions'
import { vehicleBodyFootprint } from '../sim/vehicleFootprint'
import { worldPointFromVehicle } from '../sim/vehicleFrame'

export const REVERSE_PARKING = {
  carLength: TRAINING_CAR.lengthMeters,
  carWidth: TRAINING_CAR.widthMeters,
  bayWidth: 2.3,
  bayLength: 5.1,
  laneWidth: 6.7,
  controlDistance: 6.7,
  timeLimitSeconds: SUBJECT2_RULE_LIMITS.reverseParking.timeLimitSeconds,
  stopLimitSeconds: SUBJECT2_RULE_LIMITS.reverseParking.stopLimitSeconds,
} as const

const laneHalf = REVERSE_PARKING.laneWidth / 2
const bayHalf = REVERSE_PARKING.bayWidth / 2
const startControlZ = bayHalf + REVERSE_PARKING.controlDistance
const oppositeControlZ = -startControlZ
const bayMouthX = laneHalf
const bayBackX = bayMouthX + REVERSE_PARKING.bayLength

export const REVERSE_PARKING_GEOMETRY = {
  laneHalf,
  bayHalf,
  bayMouthX,
  bayBackX,
  startControlZ,
  oppositeControlZ,
  laneEndZ: startControlZ + 3.6,
} as const

export type ReverseParkingPhase =
  | 'approach'
  | 'first-reverse'
  | 'first-parked'
  | 'cross-to-opposite'
  | 'second-reverse'
  | 'second-parked'
  | 'exit'
  | 'complete'

export interface ReverseParkingVehicle {
  x: number
  z: number
  heading: number
  speed: number
  gear: number
  engineOn: boolean
}

export interface ReverseParkingInfraction {
  id: string
  title: string
  points: number
  fatal?: boolean
}

export interface ReverseParkingRuntime {
  phase: ReverseParkingPhase
  started: boolean
  elapsed: number
  firstControlPassed: boolean
  oppositeControlPassed: boolean
  stopSeconds: number
  stopPenaltyLatched: boolean
  parkedHoldSeconds: number
  completed: boolean
}

export interface ReverseParkingUpdate {
  runtime: ReverseParkingRuntime
  infractions: ReverseParkingInfraction[]
  status: string
}

export function createReverseParkingRuntime(): ReverseParkingRuntime {
  return {
    phase: 'approach',
    started: false,
    elapsed: 0,
    firstControlPassed: false,
    oppositeControlPassed: false,
    stopSeconds: 0,
    stopPenaltyLatched: false,
    parkedHoldSeconds: 0,
    completed: false,
  }
}

function allowedRoadRects(): readonly AxisAlignedRect[] {
  const g = REVERSE_PARKING_GEOMETRY
  return [
    {
      minX: -g.laneHalf,
      maxX: g.laneHalf,
      minZ: -g.laneEndZ,
      maxZ: g.laneEndZ,
    },
    {
      minX: g.bayMouthX,
      maxX: g.bayBackX,
      minZ: -g.bayHalf,
      maxZ: g.bayHalf,
    },
  ]
}

function frontWheelZs(vehicle: ReverseParkingVehicle) {
  const axle = TRAINING_CAR.frontAxleFromCenterMeters
  const halfTrack = TRAINING_CAR.trackWidthMeters / 2
  const right = worldPointFromVehicle(vehicle.x, vehicle.z, vehicle.heading, axle, halfTrack)
  const left = worldPointFromVehicle(vehicle.x, vehicle.z, vehicle.heading, axle, -halfTrack)
  return [right.z, left.z]

}

function fullyInsideBay(vehicle: ReverseParkingVehicle) {
  const g = REVERSE_PARKING_GEOMETRY
  return vehicleBodyFootprint(vehicle).every(point =>
    point.x > g.bayMouthX + 0.02 &&
    point.x < g.bayBackX - 0.02 &&
    point.z > -g.bayHalf + 0.02 &&
    point.z < g.bayHalf - 0.02,
  )
}

function bodyOutsideProject(vehicle: ReverseParkingVehicle) {
  return polygonTouchesOutsideRectUnion(
    vehicleBodyFootprint(vehicle),
    allowedRoadRects(),
    0,
  )
}

function statusFor(runtime: ReverseParkingRuntime, timeLimitSeconds: number = SUBJECT2_RULE_LIMITS.reverseParking.timeLimitSeconds) {
  const seconds = runtime.started ? ` · ${Math.ceil(runtime.elapsed)} / ${timeLimitSeconds}s` : ''
  switch (runtime.phase) {
    case 'approach': return '驶过起始端控制线后停车，挂 R 挡开始第一次倒库'
    case 'first-reverse': return '第一次倒车入库：观察左后视镜与库角，车身完全入库后停车' + seconds
    case 'first-parked': return '第一次入库完成：挂前进挡驶出，前往另一端控制线' + seconds
    case 'cross-to-opposite': return '驶向另一端控制线，确保两个前轮触地点均越过控制线' + seconds
    case 'second-reverse': return '第二次倒车入库：车身完全入库并停稳' + seconds
    case 'second-parked': return '第二次入库完成：前进驶出并返回起始端' + seconds
    case 'exit': return '驶出库区，返回起始端控制线' + seconds
    case 'complete': return '倒车入库项目完成，可结束查看本项目成绩'
  }
}

export function updateReverseParking(
  vehicle: ReverseParkingVehicle,
  previous: ReverseParkingRuntime,
  dt: number,
  profile: Subject2RuleProfile = SUBJECT2_NATIONAL_RULE_PROFILE,
): ReverseParkingUpdate {
  const runtime = { ...previous }
  const infractions: ReverseParkingInfraction[] = []
  const rules = profile.limits.reverseParking
  if (runtime.completed) return { runtime, infractions, status: statusFor(runtime, rules.timeLimitSeconds) }

  const [frontA, frontB] = frontWheelZs(vehicle)
  if (frontA >= REVERSE_PARKING_GEOMETRY.startControlZ && frontB >= REVERSE_PARKING_GEOMETRY.startControlZ) {
    runtime.firstControlPassed = true
  }
  if (frontA <= REVERSE_PARKING_GEOMETRY.oppositeControlZ && frontB <= REVERSE_PARKING_GEOMETRY.oppositeControlZ) {
    runtime.oppositeControlPassed = true
  }

  const movingReverse = vehicle.speed < -0.08
  const movingForward = vehicle.speed > 0.08
  const stopped = Math.abs(vehicle.speed) < 0.035

  if (runtime.phase === 'approach' && movingReverse) {
    if (!runtime.firstControlPassed) {
      infractions.push(subject2Infraction('reverse-before-first-control'))
    }
    runtime.phase = 'first-reverse'
    runtime.started = true
  }

  if (runtime.started && runtime.phase !== 'complete') {
    runtime.elapsed += dt
    if (runtime.elapsed > rules.timeLimitSeconds) {
      infractions.push(subject2Infraction('reverse-parking-timeout'))
    }
  }

  if (runtime.started && bodyOutsideProject(vehicle)) {
    infractions.push(subject2Infraction('reverse-parking-body-out'))
  }

  const inBay = fullyInsideBay(vehicle)
  const parkingPhase = runtime.phase === 'first-reverse' || runtime.phase === 'second-reverse'
  if (parkingPhase && stopped && inBay) {
    runtime.parkedHoldSeconds += dt
    if (runtime.parkedHoldSeconds >= rules.parkedHoldSeconds) {
      runtime.phase = runtime.phase === 'first-reverse' ? 'first-parked' : 'second-parked'
      runtime.parkedHoldSeconds = 0
      runtime.stopSeconds = 0
      runtime.stopPenaltyLatched = false
    }
  } else {
    runtime.parkedHoldSeconds = 0
  }

  if (runtime.phase === 'first-reverse' && movingForward && !inBay) {
    infractions.push(subject2Infraction('first-reverse-not-in-bay'))
  }
  if (runtime.phase === 'second-reverse' && movingForward && !inBay) {
    infractions.push(subject2Infraction('second-reverse-not-in-bay'))
  }

  if (runtime.phase === 'first-parked' && movingForward) {
    runtime.phase = 'cross-to-opposite'
    runtime.oppositeControlPassed = false
  }

  if (runtime.phase === 'cross-to-opposite' && movingReverse) {
    if (!runtime.oppositeControlPassed) {
      infractions.push(subject2Infraction('reverse-before-opposite-control'))
    }
    runtime.phase = 'second-reverse'
  }

  if (runtime.phase === 'second-parked' && movingForward) {
    runtime.phase = 'exit'
  }

  if (runtime.phase === 'exit' && frontA >= REVERSE_PARKING_GEOMETRY.startControlZ && frontB >= REVERSE_PARKING_GEOMETRY.startControlZ) {
    runtime.phase = 'complete'
    runtime.completed = true
  }

  const mayPenalizeStop =
    runtime.started &&
    !['first-parked', 'second-parked', 'complete'].includes(runtime.phase) &&
    !(parkingPhase && inBay)

  if (mayPenalizeStop && stopped && vehicle.engineOn) {
    runtime.stopSeconds += dt
    if (runtime.stopSeconds > rules.stopLimitSeconds && !runtime.stopPenaltyLatched) {
      infractions.push(subject2Infraction('reverse-parking-stop', Math.floor(runtime.elapsed * 10)))
      runtime.stopPenaltyLatched = true
    }
  } else if (!stopped) {
    runtime.stopSeconds = 0
    runtime.stopPenaltyLatched = false
  }

  return { runtime, infractions, status: statusFor(runtime, rules.timeLimitSeconds) }
}

function GroundLine({ x, z, width, depth }: { x: number; z: number; width: number; depth: number }) {
  return <mesh rotation-x={-Math.PI / 2} position={[x, 0.012, z]}>
    <planeGeometry args={[width, depth]} />
    <meshBasicMaterial color="#f3d34a" />
  </mesh>
}

export interface ReverseParkingCourseProps {
  vehicle?: MutableRefObject<Vehicle>
  placement?: CoursePlacement
  audioContext?: AudioContext | null
  audioState?: VehicleAudioState
}

export function ReverseParkingCourse({
  vehicle,
  placement,
  audioContext,
  audioState,
}: ReverseParkingCourseProps = {}): ReactElement {
  const g = REVERSE_PARKING_GEOMETRY
  return <group>
    <mesh rotation-x={-Math.PI / 2} position={[2.6, -0.025, 0]} receiveShadow>
      <planeGeometry args={[18, g.laneEndZ * 2 + 4]} />
      <meshStandardMaterial color="#3c4144" roughness={1} />
    </mesh>

    <GroundLine x={-g.laneHalf} z={0} width={SUBJECT2_BOUNDARY_LINE_WIDTH_METERS} depth={g.laneEndZ * 2} />
    <GroundLine x={g.laneHalf} z={(g.bayHalf + g.laneEndZ) / 2} width={SUBJECT2_BOUNDARY_LINE_WIDTH_METERS} depth={g.laneEndZ - g.bayHalf} />
    <GroundLine x={g.laneHalf} z={-(g.bayHalf + g.laneEndZ) / 2} width={SUBJECT2_BOUNDARY_LINE_WIDTH_METERS} depth={g.laneEndZ - g.bayHalf} />

    <GroundLine x={0} z={g.startControlZ} width={REVERSE_PARKING.laneWidth} depth={SUBJECT2_BOUNDARY_LINE_WIDTH_METERS} />
    <GroundLine x={0} z={g.oppositeControlZ} width={REVERSE_PARKING.laneWidth} depth={SUBJECT2_BOUNDARY_LINE_WIDTH_METERS} />

    <GroundLine x={(g.bayMouthX + g.bayBackX) / 2} z={g.bayHalf} width={REVERSE_PARKING.bayLength} depth={SUBJECT2_BOUNDARY_LINE_WIDTH_METERS} />
    <GroundLine x={(g.bayMouthX + g.bayBackX) / 2} z={-g.bayHalf} width={REVERSE_PARKING.bayLength} depth={SUBJECT2_BOUNDARY_LINE_WIDTH_METERS} />
    <GroundLine x={g.bayBackX} z={0} width={SUBJECT2_BOUNDARY_LINE_WIDTH_METERS} depth={REVERSE_PARKING.bayWidth} />

    {[
      [g.bayMouthX + 0.35, g.bayHalf + 0.45],
      [g.bayMouthX + 0.35, -g.bayHalf - 0.45],
      [g.bayBackX - 0.25, g.bayHalf + 0.45],
      [g.bayBackX - 0.25, -g.bayHalf - 0.45],
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

    <SignPost
      x={-2.45}
      z={0}
      vehicle={vehicle}
      placement={placement}
      audioContext={audioContext}
      audioState={audioState}
    />

    <mesh rotation-x={-Math.PI / 2} position={[0, -0.08, 0]} receiveShadow>
      <planeGeometry args={[60, 48]} />
      <meshStandardMaterial color="#627557" />
    </mesh>
  </group>
}
