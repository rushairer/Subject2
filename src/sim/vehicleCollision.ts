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

  const colliding = dist <= obstacle.radius
  const normLong = dLong / dist
  const normLat = dLat / dist
  const normal: XZVector = {
    x: forward.x * normLong + right.x * normLat,
    z: forward.z * normLong + right.z * normLat,
  }

  return {
    colliding,
    distance: dist - obstacle.radius,
    penetration: colliding ? obstacle.radius - dist : 0,
    normal,
    contactPoint,
    relativeLongitudinal: longitudinal,
    relativeLateral: lateral,
  }
}

export interface ConeImpactResult {
  impactSpeed: number
  knockAxis: [number, number, number]
  slideDir: [number, number]
  initialSlideSpeed: number
}

/**
 * Calculates knockdown tilt axis and slide trajectory when a vehicle collides with a traffic cone.
 */
export function calculateConeImpact(
  vehicle: VehiclePose & { speed: number },
  obstacle: CircleObstacle,
  collision: VehicleCircleCollisionResult,
): ConeImpactResult {
  const impactSpeed = Math.max(0.18, Math.abs(vehicle.speed))
  const forward = forwardFromHeading(vehicle.heading)

  let dirX: number
  let dirZ: number

  if (Math.abs(vehicle.speed) > 0.05) {
    const sgn = vehicle.speed >= 0 ? 1 : -1
    dirX = forward.x * sgn
    dirZ = forward.z * sgn
  } else {
    // If vehicle has minimal velocity, use collision push normal
    dirX = collision.normal.x
    dirZ = collision.normal.z
  }

  const len = Math.hypot(dirX, dirZ) || 1
  const normDirX = dirX / len
  const normDirZ = dirZ / len

  // In Three.js: axis = up x dir = (0, 1, 0) x (normDirX, 0, normDirZ) = (normDirZ, 0, -normDirX)
  const knockAxis: [number, number, number] = [normDirZ, 0, -normDirX]
  const slideDir: [number, number] = [normDirX, normDirZ]
  const initialSlideSpeed = Math.min(2.8, 0.45 + impactSpeed * 0.75)

  return {
    impactSpeed,
    knockAxis,
    slideDir,
    initialSlideSpeed,
  }
}

/**
 * Resolves a collision between the vehicle and a rigid, immovable obstacle (e.g. sign pole).
 * Prevents the vehicle from clipping through by resetting penetration and zeroing vehicle speed.
 */
export function resolveRigidCircleObstacle(
  vehicle: { x: number; z: number; heading: number; speed: number },
  obstacle: CircleObstacle,
  dimensions?: { lengthMeters: number; widthMeters: number },
): { collided: boolean; impactSpeed: number } {
  const collision = checkVehicleCircleCollision(vehicle, obstacle, dimensions)
  if (!collision.colliding) {
    return { collided: false, impactSpeed: 0 }
  }

  const impactSpeed = Math.abs(vehicle.speed)
  const pushBack = collision.penetration + 0.02
  vehicle.x -= collision.normal.x * pushBack
  vehicle.z -= collision.normal.z * pushBack
  vehicle.speed = 0

  return { collided: true, impactSpeed }
}
