import type { CircleObstacle, VehiclePose } from './vehicleCollision'
import { worldPointFromVehicle } from './vehicleFrame'

/** Shared mesh/contact dimensions; the same cone is used in both exam subjects. */
export const TRAFFIC_CONE = {
  baseWidth: 0.34,
  baseHeight: 0.03,
  bodyCenterHeight: 0.23,
  bodyHeight: 0.44,
  bodyBottomRadius: 0.15,
  bodyTopRadius: 0.045,
  collarCenterHeight: 0.26,
  collarHeight: 0.10,
  collarBottomRadius: 0.098,
  collarTopRadius: 0.075,
} as const

interface ConeTilt {
  tiltX: number
  tiltZ: number
}

/** Euler XYZ matches the nested Three group used by useCollisionBody.animate. */
function tiltedAxis(tilt: ConeTilt) {
  return {
    x: -Math.sin(tilt.tiltZ),
    z: Math.sin(tilt.tiltX) * Math.cos(tilt.tiltZ),
  }
}

/**
 * Compact circles cover the base and short tapered-body sections. Their centres
 * follow the actual tilted mesh axis instead of enlarging one empty disk around
 * an upright position after the cone falls. All returned centres are world-space.
 */
export function trafficConeContactCircles(base: VehiclePose, tilt: ConeTilt): CircleObstacle[] {
  const axis = tiltedAxis(tilt)
  const projectedAxisLength = Math.hypot(axis.x, axis.z)
  const circleAt = (height: number, radius: number): CircleObstacle => ({
    ...worldPointFromVehicle(base.x, base.z, base.heading, -axis.z * height, axis.x * height),
    radius,
  })
  const baseCircle = circleAt(TRAFFIC_CONE.baseHeight / 2,
    TRAFFIC_CONE.baseWidth / Math.SQRT2 + TRAFFIC_CONE.baseHeight / 2 * projectedAxisLength)
  const circles = [baseCircle]
  if (projectedAxisLength < 1e-8) return circles

  const sections = 5
  const sectionHeight = TRAFFIC_CONE.bodyHeight / sections
  const bodyBottom = TRAFFIC_CONE.bodyCenterHeight - TRAFFIC_CONE.bodyHeight / 2
  for (let section = 0; section < sections; section++) {
    const radius = TRAFFIC_CONE.bodyBottomRadius
      + (TRAFFIC_CONE.bodyTopRadius - TRAFFIC_CONE.bodyBottomRadius) * section / sections
      + sectionHeight / 2 * projectedAxisLength
    const circle = circleAt(bodyBottom + sectionHeight * (section + 0.5), radius)
    // Upright/lower sections already fully covered by the base add no contact.
    if (Math.hypot(circle.x - baseCircle.x, circle.z - baseCircle.z) + radius > baseCircle.radius) {
      circles.push(circle)
    }
  }
  const collar = circleAt(TRAFFIC_CONE.collarCenterHeight,
    TRAFFIC_CONE.collarBottomRadius + TRAFFIC_CONE.collarHeight / 2 * projectedAxisLength)
  if (Math.hypot(collar.x - baseCircle.x, collar.z - baseCircle.z) + collar.radius > baseCircle.radius) {
    circles.push(collar)
  }
  return circles
}

/** Raise the tilted square rubber base just enough to rest on the ground. */
export function trafficConeGroundLift(tilt: ConeTilt) {
  return TRAFFIC_CONE.baseWidth / 2 * (
    Math.abs(Math.cos(tilt.tiltX) * Math.sin(tilt.tiltZ))
    + Math.abs(Math.sin(tilt.tiltX))
  )
}
