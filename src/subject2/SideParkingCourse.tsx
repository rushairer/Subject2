import type { ReactElement } from 'react'
import { TRAINING_CAR } from '../sim/vehicleDimensions'
import { worldPointFromVehicle } from '../sim/vehicleFrame'

export const SIDE_PARKING = {
  carLength: TRAINING_CAR.lengthMeters,
  carWidth: TRAINING_CAR.widthMeters,
  bayLength: 7.6,
  bayWidth: 2.5,
  laneWidth: 3.4,
  frontEdgeLength: 4.5,
  rearEdgeLength: 1.0,
  timeLimitSeconds: 90,
  stopLimitSeconds: 2,
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

function corners(vehicle: SideParkingVehicle) {
  const halfLength = SIDE_PARKING.carLength / 2
  const halfWidth = SIDE_PARKING.carWidth / 2
  return [
    worldPointFromVehicle(vehicle.x, vehicle.z, vehicle.heading, halfLength, halfWidth),
    worldPointFromVehicle(vehicle.x, vehicle.z, vehicle.heading, halfLength, -halfWidth),
    worldPointFromVehicle(vehicle.x, vehicle.z, vehicle.heading, -halfLength, halfWidth),
    worldPointFromVehicle(vehicle.x, vehicle.z, vehicle.heading, -halfLength, -halfWidth),
  ].map(point => [point.x, point.z] as const)

}

function pointAllowed(x: number, z: number) {
  const g = SIDE_PARKING_GEOMETRY
  const lane = x >= -g.laneHalf && x <= g.laneHalf && z <= g.laneStartZ && z >= g.laneEndZ
  const bay = x >= g.bayMouthX && x <= g.bayBackX && Math.abs(z) <= g.bayHalfLength
  return lane || bay
}

function bodyOutside(vehicle: SideParkingVehicle) {
  return corners(vehicle).some(([x, z]) => !pointAllowed(x, z))
}

function fullyInsideBay(vehicle: SideParkingVehicle) {
  const g = SIDE_PARKING_GEOMETRY
  return corners(vehicle).every(([x, z]) =>
    x > g.bayMouthX + 0.02 &&
    x < g.bayBackX - 0.02 &&
    z > -g.bayHalfLength + 0.02 &&
    z < g.bayHalfLength - 0.02,
  )
}

function centerInsideBay(vehicle: SideParkingVehicle) {
  const g = SIDE_PARKING_GEOMETRY
  return vehicle.x > g.bayMouthX && vehicle.x < g.bayBackX && Math.abs(vehicle.z) < g.bayHalfLength
}

function status(runtime: SideParkingRuntime) {
  const timer = runtime.started ? ` · ${Math.ceil(runtime.elapsed)} / ${SIDE_PARKING.timeLimitSeconds}s` : ''
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
): { runtime: SideParkingRuntime; infractions: SideParkingInfraction[]; status: string } {
  const runtime = { ...previous }
  const infractions: SideParkingInfraction[] = []
  if (runtime.completed) return { runtime, infractions, status: status(runtime) }

  const movingReverse = vehicle.speed < -0.08
  const movingForward = vehicle.speed > 0.08
  const stopped = Math.abs(vehicle.speed) < 0.035
  const inBay = fullyInsideBay(vehicle)

  if (runtime.phase === 'approach' && movingReverse) {
    runtime.phase = 'reverse'
    runtime.started = true
  }

  if (runtime.started && runtime.phase !== 'complete') {
    runtime.elapsed += dt
    if (runtime.elapsed > SIDE_PARKING.timeLimitSeconds) {
      infractions.push({
        id: 'side-parking-timeout',
        title: '侧方停车项目完成时间超过 90 秒',
        points: 100,
        fatal: true,
      })
    }
  }

  if (runtime.started && bodyOutside(vehicle)) {
    if (!runtime.contactLatched) {
      infractions.push({
        id: `side-parking-line-contact-${Math.floor(runtime.elapsed * 10)}`,
        title: '侧方停车行驶中车轮或车身触碰边线',
        points: 10,
      })
      runtime.contactLatched = true
    }
  } else {
    runtime.contactLatched = false
  }

  if (runtime.phase === 'reverse' && stopped && inBay) {
    runtime.parkedHoldSeconds += dt
    if (runtime.parkedHoldSeconds >= 0.35) {
      runtime.phase = 'parked'
      runtime.parkedHoldSeconds = 0
      runtime.stopSeconds = 0
      runtime.stopPenaltyLatched = false
    }
  } else if (runtime.phase === 'reverse' && stopped && centerInsideBay(vehicle) && !inBay) {
    runtime.parkedHoldSeconds += dt
    if (runtime.parkedHoldSeconds >= 0.5) {
      infractions.push({
        id: 'side-parking-body-out-after-stop',
        title: '侧方停车入库停止后车身出线',
        points: 100,
        fatal: true,
      })
    }
  } else {
    runtime.parkedHoldSeconds = 0
  }

  if (runtime.phase === 'parked' && movingForward) {
    if (!runtime.exitSignalChecked) {
      runtime.exitSignalChecked = true
      if (!vehicle.leftIndicator) {
        infractions.push({
          id: 'side-parking-exit-signal',
          title: '侧方停车出库时未使用或错误使用转向灯',
          points: 10,
        })
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
    if (runtime.stopSeconds > SIDE_PARKING.stopLimitSeconds && !runtime.stopPenaltyLatched) {
      infractions.push({
        id: `side-parking-stop-${Math.floor(runtime.elapsed * 10)}`,
        title: '侧方停车中途停车超过 2 秒',
        points: 5,
      })
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

export function SideParkingCourse(): ReactElement {
  const g = SIDE_PARKING_GEOMETRY
  const laneCenterZ = (g.laneStartZ + g.laneEndZ) / 2
  const laneLength = g.laneStartZ - g.laneEndZ
  return <group>
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.025, laneCenterZ]}>
      <planeGeometry args={[SIDE_PARKING.laneWidth, laneLength]} />
      <meshStandardMaterial color="#3c4144" roughness={1} />
    </mesh>
    <mesh rotation-x={-Math.PI / 2} position={[(g.bayMouthX + g.bayBackX) / 2, -0.024, 0]}>
      <planeGeometry args={[SIDE_PARKING.bayWidth, SIDE_PARKING.bayLength]} />
      <meshStandardMaterial color="#3c4144" roughness={1} />
    </mesh>

    <Line x={-g.laneHalf} z={laneCenterZ} width={0.12} depth={laneLength} />
    <Line x={g.laneHalf} z={(g.bayHalfLength + g.laneStartZ) / 2} width={0.12} depth={g.laneStartZ - g.bayHalfLength} />
    <Line x={g.laneHalf} z={(g.laneEndZ - g.bayHalfLength) / 2} width={0.12} depth={-g.bayHalfLength - g.laneEndZ} />

    <Line x={(g.bayMouthX + g.bayBackX) / 2} z={g.bayHalfLength} width={SIDE_PARKING.bayWidth} depth={0.12} />
    <Line x={(g.bayMouthX + g.bayBackX) / 2} z={-g.bayHalfLength} width={SIDE_PARKING.bayWidth} depth={0.12} />
    <Line x={g.bayBackX} z={0} width={0.12} depth={SIDE_PARKING.bayLength} />

    <mesh rotation-x={-Math.PI / 2} position={[0, -0.08, 0]}>
      <planeGeometry args={[45, 40]} />
      <meshStandardMaterial color="#637657" />
    </mesh>
  </group>
}
