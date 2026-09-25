import type { ReactElement } from 'react'
import { TRAINING_CAR } from '../sim/vehicleDimensions'

export const REVERSE_PARKING = {
  carLength: TRAINING_CAR.lengthMeters,
  carWidth: TRAINING_CAR.widthMeters,
  bayWidth: 2.3,
  bayLength: 5.1,
  laneWidth: 6.7,
  controlDistance: 6.7,
  timeLimitSeconds: 210,
  stopLimitSeconds: 2,
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

function pointInAllowedArea(x: number, z: number) {
  const g = REVERSE_PARKING_GEOMETRY
  const inLane = x >= -g.laneHalf && x <= g.laneHalf && Math.abs(z) <= g.laneEndZ
  const inBay = x >= g.bayMouthX && x <= g.bayBackX && Math.abs(z) <= g.bayHalf
  return inLane || inBay
}

function carCorners(vehicle: ReverseParkingVehicle) {
  const halfLength = REVERSE_PARKING.carLength / 2
  const halfWidth = REVERSE_PARKING.carWidth / 2
  const forwardX = Math.sin(vehicle.heading)
  const forwardZ = -Math.cos(vehicle.heading)
  const rightX = Math.cos(vehicle.heading)
  const rightZ = Math.sin(vehicle.heading)
  return [
    [vehicle.x + forwardX * halfLength + rightX * halfWidth, vehicle.z + forwardZ * halfLength + rightZ * halfWidth],
    [vehicle.x + forwardX * halfLength - rightX * halfWidth, vehicle.z + forwardZ * halfLength - rightZ * halfWidth],
    [vehicle.x - forwardX * halfLength + rightX * halfWidth, vehicle.z - forwardZ * halfLength + rightZ * halfWidth],
    [vehicle.x - forwardX * halfLength - rightX * halfWidth, vehicle.z - forwardZ * halfLength - rightZ * halfWidth],
  ] as const
}

function frontWheelZs(vehicle: ReverseParkingVehicle) {
  const axleFromCenter = TRAINING_CAR.frontAxleFromCenterMeters
  const halfTrack = TRAINING_CAR.trackWidthMeters / 2
  const forwardX = Math.sin(vehicle.heading)
  const forwardZ = -Math.cos(vehicle.heading)
  const rightX = Math.cos(vehicle.heading)
  const rightZ = Math.sin(vehicle.heading)
  const axleX = vehicle.x + forwardX * axleFromCenter
  const axleZ = vehicle.z + forwardZ * axleFromCenter
  return [
    axleZ + rightZ * halfTrack,
    axleZ - rightZ * halfTrack,
  ]
}

function fullyInsideBay(vehicle: ReverseParkingVehicle) {
  const g = REVERSE_PARKING_GEOMETRY
  return carCorners(vehicle).every(([x, z]) =>
    x > g.bayMouthX + 0.02 &&
    x < g.bayBackX - 0.02 &&
    z > -g.bayHalf + 0.02 &&
    z < g.bayHalf - 0.02,
  )
}

function bodyOutsideProject(vehicle: ReverseParkingVehicle) {
  return carCorners(vehicle).some(([x, z]) => !pointInAllowedArea(x, z))
}

function statusFor(runtime: ReverseParkingRuntime) {
  const seconds = runtime.started ? ` · ${Math.ceil(runtime.elapsed)} / ${REVERSE_PARKING.timeLimitSeconds}s` : ''
  switch (runtime.phase) {
    case 'approach': return '驶过右侧控制线后停车，挂 R 挡开始第一次倒库'
    case 'first-reverse': return '第一次倒车入库：观察右后视镜与库角，车身完全入库后停车' + seconds
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
): ReverseParkingUpdate {
  const runtime = { ...previous }
  const infractions: ReverseParkingInfraction[] = []
  if (runtime.completed) return { runtime, infractions, status: statusFor(runtime) }

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
      infractions.push({
        id: 'reverse-before-first-control',
        title: '倒车前两个前轮触地点未均驶过起始控制线',
        points: 100,
        fatal: true,
      })
    }
    runtime.phase = 'first-reverse'
    runtime.started = true
  }

  if (runtime.started && runtime.phase !== 'complete') {
    runtime.elapsed += dt
    if (runtime.elapsed > REVERSE_PARKING.timeLimitSeconds) {
      infractions.push({
        id: 'reverse-parking-timeout',
        title: '倒车入库项目完成时间超过 210 秒',
        points: 100,
        fatal: true,
      })
    }
  }

  if (runtime.started && bodyOutsideProject(vehicle)) {
    infractions.push({
      id: 'reverse-parking-body-out',
      title: '倒车入库过程中车身出线',
      points: 100,
      fatal: true,
    })
  }

  const inBay = fullyInsideBay(vehicle)
  const parkingPhase = runtime.phase === 'first-reverse' || runtime.phase === 'second-reverse'
  if (parkingPhase && stopped && inBay) {
    runtime.parkedHoldSeconds += dt
    if (runtime.parkedHoldSeconds >= 0.35) {
      runtime.phase = runtime.phase === 'first-reverse' ? 'first-parked' : 'second-parked'
      runtime.parkedHoldSeconds = 0
      runtime.stopSeconds = 0
      runtime.stopPenaltyLatched = false
    }
  } else {
    runtime.parkedHoldSeconds = 0
  }

  if (runtime.phase === 'first-reverse' && movingForward && !inBay) {
    infractions.push({
      id: 'first-reverse-not-in-bay',
      title: '第一次倒库不入',
      points: 100,
      fatal: true,
    })
  }
  if (runtime.phase === 'second-reverse' && movingForward && !inBay) {
    infractions.push({
      id: 'second-reverse-not-in-bay',
      title: '第二次倒库不入',
      points: 100,
      fatal: true,
    })
  }

  if (runtime.phase === 'first-parked' && movingForward) {
    runtime.phase = 'cross-to-opposite'
    runtime.oppositeControlPassed = false
  }

  if (runtime.phase === 'cross-to-opposite' && movingReverse) {
    if (!runtime.oppositeControlPassed) {
      infractions.push({
        id: 'reverse-before-opposite-control',
        title: '第二次倒车前两个前轮触地点未均驶过另一端控制线',
        points: 100,
        fatal: true,
      })
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
    if (runtime.stopSeconds > REVERSE_PARKING.stopLimitSeconds && !runtime.stopPenaltyLatched) {
      infractions.push({
        id: `reverse-parking-stop-${Math.floor(runtime.elapsed * 10)}`,
        title: '倒车入库中途停车超过 2 秒',
        points: 5,
      })
      runtime.stopPenaltyLatched = true
    }
  } else if (!stopped) {
    runtime.stopSeconds = 0
    runtime.stopPenaltyLatched = false
  }

  return { runtime, infractions, status: statusFor(runtime) }
}

function GroundLine({ x, z, width, depth }: { x: number; z: number; width: number; depth: number }) {
  return <mesh rotation-x={-Math.PI / 2} position={[x, 0.012, z]}>
    <planeGeometry args={[width, depth]} />
    <meshBasicMaterial color="#f3d34a" />
  </mesh>
}

export function ReverseParkingCourse(): ReactElement {
  const g = REVERSE_PARKING_GEOMETRY
  return <group>
    <mesh rotation-x={-Math.PI / 2} position={[2.6, -0.025, 0]}>
      <planeGeometry args={[18, g.laneEndZ * 2 + 4]} />
      <meshStandardMaterial color="#3c4144" roughness={1} />
    </mesh>

    <GroundLine x={-g.laneHalf} z={0} width={0.12} depth={g.laneEndZ * 2} />
    <GroundLine x={g.laneHalf} z={(g.bayHalf + g.laneEndZ) / 2} width={0.12} depth={g.laneEndZ - g.bayHalf} />
    <GroundLine x={g.laneHalf} z={-(g.bayHalf + g.laneEndZ) / 2} width={0.12} depth={g.laneEndZ - g.bayHalf} />

    <GroundLine x={0} z={g.startControlZ} width={REVERSE_PARKING.laneWidth} depth={0.12} />
    <GroundLine x={0} z={g.oppositeControlZ} width={REVERSE_PARKING.laneWidth} depth={0.12} />

    <GroundLine x={(g.bayMouthX + g.bayBackX) / 2} z={g.bayHalf} width={REVERSE_PARKING.bayLength} depth={0.12} />
    <GroundLine x={(g.bayMouthX + g.bayBackX) / 2} z={-g.bayHalf} width={REVERSE_PARKING.bayLength} depth={0.12} />
    <GroundLine x={g.bayBackX} z={0} width={0.12} depth={REVERSE_PARKING.bayWidth} />

    {[
      [g.bayMouthX + 0.35, g.bayHalf + 0.45],
      [g.bayMouthX + 0.35, -g.bayHalf - 0.45],
      [g.bayBackX - 0.25, g.bayHalf + 0.45],
      [g.bayBackX - 0.25, -g.bayHalf - 0.45],
    ].map(([x, z], i) => <group key={i} position={[x, 0, z]}>
      <mesh position={[0, 0.22, 0]}><cylinderGeometry args={[0.12, 0.16, 0.44, 16]} /><meshStandardMaterial color="#df6a31" /></mesh>
      <mesh position={[0, 0.29, 0]}><cylinderGeometry args={[0.13, 0.13, 0.06, 16]} /><meshStandardMaterial color="#f4f4f4" /></mesh>
    </group>)}

    <group position={[-2.45, 0, 0]}>
      <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[0.06, 0.08, 2.8, 8]} /><meshStandardMaterial color="#777" /></mesh>
      <mesh position={[0, 2.55, 0]}><boxGeometry args={[0.08, 0.8, 1.55]} /><meshStandardMaterial color="#176aa7" /></mesh>
    </group>

    <mesh rotation-x={-Math.PI / 2} position={[0, -0.08, 0]}>
      <planeGeometry args={[60, 48]} />
      <meshStandardMaterial color="#627557" />
    </mesh>
  </group>
}
