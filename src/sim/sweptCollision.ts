import { convexPolygonsIntersect } from './planarGeometry'
import { TRAINING_CAR } from './vehicleDimensions'
import {
  checkVehicleCircleCollision,
  type CircleObstacle,
  type VehiclePose,
} from './vehicleCollision'
import { orientedRectangleFootprint, vehicleBodyFootprint } from './vehicleFootprint'
import { normalizeHeadingDelta, type XZVector } from './vehicleFrame'

// CCD is limited to one real driving frame, not an arbitrary teleport between
// exam projects or a newly spawned actor's unrelated prior location.
const MAX_FRAME_TRANSLATION_METERS = 12
const CONTACT_SKIN_METERS = 1e-6
const MAX_ADVANCEMENT_ITERATIONS = 160
const VEHICLE_SWEEP_RADIUS_METERS = Math.hypot(
  TRAINING_CAR.lengthMeters / 2,
  TRAINING_CAR.widthMeters / 2,
)

export function interpolateCollisionPose(
  before: VehiclePose,
  after: VehiclePose,
  fraction: number,
): VehiclePose {
  return {
    x: before.x + (after.x - before.x) * fraction,
    z: before.z + (after.z - before.z) * fraction,
    heading: before.heading + normalizeHeadingDelta(after.heading - before.heading) * fraction,
  }
}

function interpolateCircle(before: CircleObstacle, after: CircleObstacle, fraction: number): CircleObstacle {
  return {
    x: before.x + (after.x - before.x) * fraction,
    z: before.z + (after.z - before.z) * fraction,
    radius: before.radius + (after.radius - before.radius) * fraction,
  }
}

export { interpolateCircle as interpolateCollisionCircle }

function finitePose(pose: VehiclePose) {
  return Number.isFinite(pose.x) && Number.isFinite(pose.z) && Number.isFinite(pose.heading)
}

function finiteCircle(circle: CircleObstacle) {
  return Number.isFinite(circle.x) && Number.isFinite(circle.z) &&
    Number.isFinite(circle.radius) && circle.radius >= 0
}

function travel(a: XZVector, b: XZVector) {
  return Math.hypot(b.x - a.x, b.z - a.z)
}

function validTravel(before: XZVector, after: XZVector) {
  return travel(before, after) <= MAX_FRAME_TRANSLATION_METERS
}

function relativeTravel(
  playerBefore: XZVector,
  playerAfter: XZVector,
  actorBefore: XZVector,
  actorAfter: XZVector,
) {
  return Math.hypot(
    (playerAfter.x - playerBefore.x) - (actorAfter.x - actorBefore.x),
    (playerAfter.z - playerBefore.z) - (actorAfter.z - actorBefore.z),
  )
}

/**
 * Conservative advancement for a signed separation distance. The distance
 * between moving rigid bodies cannot change faster than their relative center
 * travel plus the arc travel of their rotating corners. Therefore a step of
 * gap / upperBound cannot skip an intervening collision, even when both
 * endpoints are separated. This checks the actual narrow-phase shapes rather
 * than replacing oriented cars with collision circles.
 */
function firstContactFraction(
  distanceAt: (fraction: number) => number,
  changeBoundMeters: number,
): number | null {
  if (!Number.isFinite(changeBoundMeters) || changeBoundMeters <= 0) return null
  const initialGap = distanceAt(0)
  // Starting overlap is owned by the ordinary discrete resolver. Do not
  // restart old contacts or rewind a vehicle while it is escaping.
  if (!Number.isFinite(initialGap) || initialGap <= 0) return null
  if (initialGap > changeBoundMeters + CONTACT_SKIN_METERS) return null

  let fraction = 0
  for (let iteration = 0; iteration < MAX_ADVANCEMENT_ITERATIONS; iteration += 1) {
    const gap = distanceAt(fraction)
    if (!Number.isFinite(gap)) return null
    if (gap <= CONTACT_SKIN_METERS) return fraction
    if (gap > (1 - fraction) * changeBoundMeters + CONTACT_SKIN_METERS) return null
    const nextFraction = Math.min(1, fraction + gap / changeBoundMeters)
    if (nextFraction <= fraction + 1e-13) return gap <= CONTACT_SKIN_METERS * 4 ? fraction : null
    fraction = nextFraction
  }
  return distanceAt(1) <= CONTACT_SKIN_METERS ? 1 : null
}

function poseTravelValid(before: VehiclePose, after: VehiclePose) {
  return finitePose(before) && finitePose(after) && validTravel(before, after)
}

/** Car rectangle vs. moving circle, including rotation and actor motion. */
export function sweptCircleContactFraction(
  playerBefore: VehiclePose,
  playerAfter: VehiclePose,
  actorBefore: CircleObstacle,
  actorAfter: CircleObstacle,
): number | null {
  if (!poseTravelValid(playerBefore, playerAfter) ||
      !finiteCircle(actorBefore) || !finiteCircle(actorAfter) ||
      !validTravel(actorBefore, actorAfter)) return null

  const bound = relativeTravel(playerBefore, playerAfter, actorBefore, actorAfter) +
    VEHICLE_SWEEP_RADIUS_METERS *
      Math.abs(normalizeHeadingDelta(playerAfter.heading - playerBefore.heading)) +
    Math.abs(actorAfter.radius - actorBefore.radius)
  return firstContactFraction(t =>
    checkVehicleCircleCollision(
      interpolateCollisionPose(playerBefore, playerAfter, t),
      interpolateCircle(actorBefore, actorAfter, t),
    ).distance, bound)
}

function pointSegmentDistance(point: XZVector, a: XZVector, b: XZVector) {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const denominator = dx * dx + dz * dz
  const fraction = denominator <= 1e-18 ? 0 : Math.max(0, Math.min(1,
    ((point.x - a.x) * dx + (point.z - a.z) * dz) / denominator))
  return Math.hypot(point.x - (a.x + fraction * dx), point.z - (a.z + fraction * dz))
}

/** Exact Euclidean separation of convex footprint polygons, zero at contact. */
function convexFootprintGap(a: readonly XZVector[], b: readonly XZVector[]) {
  if (a.length < 3 || b.length < 3) return Infinity
  if (convexPolygonsIntersect(a, b)) return 0
  let closest = Infinity
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      closest = Math.min(closest,
        pointSegmentDistance(a[i], b[j], b[(j + 1) % b.length]),
        pointSegmentDistance(b[j], a[i], a[(i + 1) % a.length]))
    }
  }
  return closest
}

/** Oriented training car vs. a stationary convex polygon (buildings). */
export function sweptPolygonContactFraction(
  playerBefore: VehiclePose,
  playerAfter: VehiclePose,
  polygon: readonly XZVector[],
): number | null {
  if (!poseTravelValid(playerBefore, playerAfter) || polygon.length < 3 ||
      polygon.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.z))) return null
  const bound = travel(playerBefore, playerAfter) + VEHICLE_SWEEP_RADIUS_METERS *
    Math.abs(normalizeHeadingDelta(playerAfter.heading - playerBefore.heading))
  return firstContactFraction(t => convexFootprintGap(
    vehicleBodyFootprint(interpolateCollisionPose(playerBefore, playerAfter, t)),
    polygon,
  ), bound)
}

/** Full oriented body SAT for both moving/turning road vehicles. */
export function sweptVehicleContactFraction(
  playerBefore: VehiclePose,
  playerAfter: VehiclePose,
  actorBefore: VehiclePose,
  actorAfter: VehiclePose,
  dimensions: { lengthMeters: number; widthMeters: number },
): number | null {
  if (!poseTravelValid(playerBefore, playerAfter) ||
      !poseTravelValid(actorBefore, actorAfter) ||
      !Number.isFinite(dimensions.lengthMeters) || dimensions.lengthMeters <= 0 ||
      !Number.isFinite(dimensions.widthMeters) || dimensions.widthMeters <= 0) return null

  const actorRadius = Math.hypot(dimensions.lengthMeters / 2, dimensions.widthMeters / 2)
  const bound = relativeTravel(playerBefore, playerAfter, actorBefore, actorAfter) +
    VEHICLE_SWEEP_RADIUS_METERS *
      Math.abs(normalizeHeadingDelta(playerAfter.heading - playerBefore.heading)) +
    actorRadius * Math.abs(normalizeHeadingDelta(actorAfter.heading - actorBefore.heading))
  return firstContactFraction(t => convexFootprintGap(
    vehicleBodyFootprint(interpolateCollisionPose(playerBefore, playerAfter, t)),
    orientedRectangleFootprint(
      interpolateCollisionPose(actorBefore, actorAfter, t),
      dimensions.lengthMeters, dimensions.widthMeters,
    ),
  ), bound)
}
