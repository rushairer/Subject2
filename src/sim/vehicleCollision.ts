import { TRAINING_CAR } from './vehicleDimensions'
import {
  forwardFromHeading,
  rightFromHeading,
  worldPointFromVehicle,
  type XZVector,
} from './vehicleFrame'

export interface CircleObstacle {
  x: number
  z: number
  radius: number
}

export interface VehiclePose {
  x: number
  z: number
  heading: number
}

export interface InteractiveVehicle extends VehiclePose {
  speed: number
}

export type Vehicle = InteractiveVehicle

// One snapshot per physics frame, shared by every course collision adapter.
// Weak keys avoid retaining completed practice sessions or replaced vehicles.
const beforePhysicsPose = new WeakMap<VehiclePose, VehiclePose>()

export function recordVehicleBeforePhysics(vehicle: VehiclePose): void {
  beforePhysicsPose.set(vehicle, {
    x: vehicle.x, z: vehicle.z, heading: vehicle.heading,
  })
}

export function vehiclePoseBeforePhysics(vehicle: VehiclePose): VehiclePose | undefined {
  return beforePhysicsPose.get(vehicle)
}

export interface VehicleCircleCollisionResult {
  colliding: boolean
  distance: number
  penetration: number
  normal: XZVector
  contactPoint: XZVector
  relativeLongitudinal: number
  relativeLateral: number
}

/**
 * Checks 2D intersection between a circular obstacle and the rectangular vehicle body footprint.
 * Returns exact penetration, contact point, and collision normal pointing from the vehicle to the obstacle.
 */
export function checkVehicleCircleCollision(
  vehicle: VehiclePose,
  obstacle: CircleObstacle,
  dimensions: { lengthMeters: number; widthMeters: number } = TRAINING_CAR,
): VehicleCircleCollisionResult {
  const halfLength = dimensions.lengthMeters / 2
  const halfWidth = dimensions.widthMeters / 2

  const forward = forwardFromHeading(vehicle.heading)
  const right = rightFromHeading(vehicle.heading)

  const dx = obstacle.x - vehicle.x
  const dz = obstacle.z - vehicle.z

  // Relative coordinate in vehicle-local frame:
  // +longitudinal = forward, +lateral = right
  const longitudinal = dx * forward.x + dz * forward.z
  const lateral = dx * right.x + dz * right.z

  // Closest point on the vehicle body rectangle
  const clampedLong = Math.max(-halfLength, Math.min(halfLength, longitudinal))
  const clampedLat = Math.max(-halfWidth, Math.min(halfWidth, lateral))

  const contactPoint = worldPointFromVehicle(
    vehicle.x,
    vehicle.z,
    vehicle.heading,
    clampedLong,
    clampedLat,
  )

  const dLong = longitudinal - clampedLong
  const dLat = lateral - clampedLat
  const distSq = dLong * dLong + dLat * dLat
  const dist = Math.sqrt(distSq)

  if (dist < 1e-9) {
    // Obstacle center is inside or on the vehicle body perimeter
    const dFront = halfLength - longitudinal
    const dBack = longitudinal - (-halfLength)
    const dRight = halfWidth - lateral
    const dLeft = lateral - (-halfWidth)

    const minD = Math.min(dFront, dBack, dRight, dLeft)
    let normLong = 0
    let normLat = 0
    if (minD === dFront) normLong = 1
    else if (minD === dBack) normLong = -1
    else if (minD === dRight) normLat = 1
    else normLat = -1

    const normal: XZVector = {
      x: forward.x * normLong + right.x * normLat,
      z: forward.z * normLong + right.z * normLat,
    }

    return {
      colliding: true,
      distance: -minD,
      penetration: obstacle.radius + minD,
      normal,
      contactPoint,
      relativeLongitudinal: longitudinal,
      relativeLateral: lateral,
    }
  }

  // Decimal body dimensions can put an exact painted/rendered contact a few
  // ulps outside the radius. This is far below a meaningful physical gap.
  const colliding = dist <= obstacle.radius + 1e-9
  const normLong = dLong / dist
  const normLat = dLat / dist
  const normal: XZVector = {
    x: forward.x * normLong + right.x * normLat,
    z: forward.z * normLong + right.z * normLat,
  }

  return {
    colliding,
    distance: dist - obstacle.radius,
    penetration: colliding ? Math.max(0, obstacle.radius - dist) : 0,
    normal,
    contactPoint,
    relativeLongitudinal: longitudinal,
    relativeLateral: lateral,
  }
}
