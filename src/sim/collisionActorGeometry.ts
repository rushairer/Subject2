import type { CircleObstacle, VehiclePose } from './vehicleCollision'
import { worldPointFromVehicle } from './vehicleFrame'

export type CompactCollisionActorKind = 'pedestrian' | 'scooter'

/** Dimensions of ArticulatedPedestrian and ScooterModel, in their local mesh frame. */
export const COLLISION_ACTOR_DIMENSIONS = {
  pedestrian: {
    standingRadius: 0.35,
    torsoCenterY: 1.08,
    shoulderWidth: 0.44,
    headCenterY: 1.5,
    headRadius: 0.13,
    hairCenterY: 1.56,
    hairCenterZ: -0.01,
    hairRadius: 0.132,
  },
  scooter: {
    originHeight: 0.18,
    frontWheelZ: -0.48,
    rearWheelZ: 0.42,
    wheelCenterY: 0.18,
    wheelRadius: 0.18,
    helmetCenterY: 1.3,
    helmetRadius: 0.15,
    riderMaxHeight: 1.45,
  },
} as const

interface LocalContactSphere {
  x: number
  y: number
  z: number
  radius: number
}

const pedestrian = COLLISION_ACTOR_DIMENSIONS.pedestrian
const scooter = COLLISION_ACTOR_DIMENSIONS.scooter

// Overlapping small spheres follow the spine as the person leans. Keeping the
// base radius preserves existing standing clearance without inflating one
// obstacle to cover the entire horizontal overhang of the tilted model.
const PEDESTRIAN_CONTACT_SPHERES: readonly LocalContactSphere[] = [
  { x: 0, y: 0, z: 0, radius: pedestrian.standingRadius },
  { x: 0, y: 0.38, z: 0, radius: 0.28 },
  { x: 0, y: 0.75, z: 0, radius: 0.26 },
  { x: 0, y: pedestrian.torsoCenterY, z: 0, radius: 0.34 },
  { x: 0, y: 1.26, z: 0, radius: 0.27 },
  { x: 0, y: pedestrian.headCenterY, z: 0, radius: pedestrian.headRadius },
  { x: 0, y: pedestrian.hairCenterY, z: pedestrian.hairCenterZ, radius: pedestrian.hairRadius },
]

// Capsule-like wheel/deck coverage plus separate frame, handlebars and rider
// regions. Unlike a single 0.9 m circle, these stay narrow beside an upright
// scooter while the upper regions follow the actual falling rider.
const SCOOTER_CONTACT_SPHERES: readonly LocalContactSphere[] = [
  { x: 0, y: scooter.wheelCenterY, z: scooter.frontWheelZ, radius: 0.185 },
  { x: 0, y: 0.18, z: -0.26, radius: 0.24 },
  { x: 0, y: 0.18, z: 0, radius: 0.24 },
  { x: 0, y: 0.18, z: 0.26, radius: 0.24 },
  { x: 0, y: scooter.wheelCenterY, z: scooter.rearWheelZ, radius: 0.185 },
  // The apron itself leans 0.18 radians around its model-local X axis.
  { x: 0, y: 0.52 - Math.cos(0.18) * 0.145, z: -0.42 - Math.sin(0.18) * 0.145, radius: 0.228 },
  { x: 0, y: 0.52 + Math.cos(0.18) * 0.145, z: -0.42 + Math.sin(0.18) * 0.145, radius: 0.228 },
  { x: 0, y: 0.88, z: -0.37, radius: 0.34 },
  { x: 0, y: 0.46, z: 0.08, radius: 0.33 },
  { x: 0, y: 0.46, z: 0.37, radius: 0.33 },
  { x: 0, y: 0.68, z: 0.52, radius: 0.313 },
  { x: 0, y: 0.95, z: 0.06, radius: 0.304 },
  // The extra centimetre covers the visor projecting ahead of the helmet.
  { x: 0, y: scooter.helmetCenterY, z: 0, radius: scooter.helmetRadius + 0.01 },
]

/**
 * Compact radial proxies only for people and scooters; cars use body polygons.
 *
 * Render hierarchy: world position / yaw=-heading -> local Euler XYZ tilt ->
 * model. With Y=0, XYZ applies the local Z rotation first, then X. The outer
 * scooter group's originHeight is a vertical translation after tilt, so it
 * never enters this ground-plane projection.
 */
export function actorContactCircles(
  kind: CompactCollisionActorKind,
  pose: VehiclePose,
  tilt: { tiltX: number; tiltZ: number; yaw?: number },
): CircleObstacle[] {
  const spheres = kind === 'pedestrian' ? PEDESTRIAN_CONTACT_SPHERES : SCOOTER_CONTACT_SPHERES
  const sinX = Math.sin(tilt.tiltX)
  const cosX = Math.cos(tilt.tiltX)
  const sinY = Math.sin(tilt.yaw ?? 0)
  const cosY = Math.cos(tilt.yaw ?? 0)
  const sinZ = Math.sin(tilt.tiltZ)
  const cosZ = Math.cos(tilt.tiltZ)
  return spheres.map(sphere => {
    // Three.js Euler XYZ applies the local Z, then Y, then X rotations to a point.
    // Match that order so collision proxies follow the spun/leaned rendered actor.
    const rotatedX = sphere.x * cosZ - sphere.y * sinZ
    const rotatedY = sphere.x * sinZ + sphere.y * cosZ
    const yawX = rotatedX * cosY + sphere.z * sinY
    const yawZ = -rotatedX * sinY + sphere.z * cosY
    const localZ = rotatedY * sinX + yawZ * cosX
    const point = worldPointFromVehicle(pose.x, pose.z, pose.heading, -localZ, yawX)
    return { x: point.x, z: point.z, radius: sphere.radius }
  })
}
