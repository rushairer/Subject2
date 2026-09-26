import { TRAINING_CAR } from './vehicleDimensions'
import { worldPointFromVehicle, type XZVector } from './vehicleFrame'

export type WheelId = 'front-left' | 'front-right' | 'rear-left' | 'rear-right'

export interface WheelContactVehicle {
  x: number
  z: number
  heading: number
  /** Virtual bicycle-model road-wheel angle; positive turns right. */
  steering?: number
}

export interface WheelContactFootprint {
  id: WheelId
  center: XZVector
  heading: number
  corners: readonly [XZVector, XZVector, XZVector, XZVector]
}

export interface AxisAlignedRect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export function ackermannFrontAngles(virtualAngle: number) {
  if (Math.abs(virtualAngle) < 0.0001) return { left: 0, right: 0 }

  const wheelbase = TRAINING_CAR.wheelbaseMeters
  const halfTrack = TRAINING_CAR.trackWidthMeters / 2
  const sign = Math.sign(virtualAngle)
  const radius = wheelbase / Math.tan(Math.abs(virtualAngle))
  const inner = Math.atan(wheelbase / Math.max(0.15, radius - halfTrack))
  const outer = Math.atan(wheelbase / (radius + halfTrack))

  return sign > 0
    ? { left: outer, right: inner }
    : { left: -inner, right: -outer }
}

function contactCorners(center: XZVector, heading: number) {
  const halfLength = TRAINING_CAR.tireContactPatchLengthMeters / 2
  const halfWidth = TRAINING_CAR.tireWidthMeters / 2
  return [
    worldPointFromVehicle(center.x, center.z, heading, halfLength, halfWidth),
    worldPointFromVehicle(center.x, center.z, heading, halfLength, -halfWidth),
    worldPointFromVehicle(center.x, center.z, heading, -halfLength, -halfWidth),
    worldPointFromVehicle(center.x, center.z, heading, -halfLength, halfWidth),
  ] as const
}

export function wheelContactFootprints(
  vehicle: WheelContactVehicle,
): readonly WheelContactFootprint[] {
  const halfTrack = TRAINING_CAR.trackWidthMeters / 2
  const front = TRAINING_CAR.frontAxleFromCenterMeters
  const rear = TRAINING_CAR.rearAxleFromCenterMeters
  const steering = vehicle.steering ?? 0
  const frontAngles = ackermannFrontAngles(steering)

  const frontLeftCenter = worldPointFromVehicle(
    vehicle.x,
    vehicle.z,
    vehicle.heading,
    front,
    -halfTrack,
  )
  const frontRightCenter = worldPointFromVehicle(
    vehicle.x,
    vehicle.z,
    vehicle.heading,
    front,
    halfTrack,
  )
  const rearLeftCenter = worldPointFromVehicle(
    vehicle.x,
    vehicle.z,
    vehicle.heading,
    -rear,
    -halfTrack,
  )
  const rearRightCenter = worldPointFromVehicle(
    vehicle.x,
    vehicle.z,
    vehicle.heading,
    -rear,
    halfTrack,
  )

  const items: Array<[WheelId, XZVector, number]> = [
    ['front-left', frontLeftCenter, vehicle.heading + frontAngles.left],
    ['front-right', frontRightCenter, vehicle.heading + frontAngles.right],
    ['rear-left', rearLeftCenter, vehicle.heading],
    ['rear-right', rearRightCenter, vehicle.heading],
  ]

  return items.map(([id, center, heading]) => ({
    id,
    center,
    heading,
    corners: contactCorners(center, heading),
  }))
}

export function wheelContactSamplePoints(
  footprint: WheelContactFootprint,
): readonly XZVector[] {
  const [a, b, c, d] = footprint.corners
  const midpoint = (p: XZVector, q: XZVector): XZVector => ({
    x: (p.x + q.x) / 2,
    z: (p.z + q.z) / 2,
  })
  return [
    a,
    b,
    c,
    d,
    midpoint(a, b),
    midpoint(b, c),
    midpoint(c, d),
    midpoint(d, a),
    footprint.center,
  ]
}

function polygonArea(points: readonly XZVector[]) {
  let twiceArea = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    twiceArea += a.x * b.z - b.x * a.z
  }
  return Math.abs(twiceArea) / 2
}

type Boundary = {
  inside(point: XZVector): boolean
  intersect(a: XZVector, b: XZVector): XZVector
}

function clipPolygon(
  polygon: readonly XZVector[],
  boundary: Boundary,
): XZVector[] {
  if (polygon.length === 0) return []
  const output: XZVector[] = []
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i]
    const previous = polygon[(i + polygon.length - 1) % polygon.length]
    const currentInside = boundary.inside(current)
    const previousInside = boundary.inside(previous)

    if (currentInside) {
      if (!previousInside) output.push(boundary.intersect(previous, current))
      output.push(current)
    } else if (previousInside) {
      output.push(boundary.intersect(previous, current))
    }
  }
  return output
}

function clipPolygonToRect(
  polygon: readonly XZVector[],
  rect: AxisAlignedRect,
) {
  let result = [...polygon]
  const boundaries: Boundary[] = [
    {
      inside: p => p.x >= rect.minX,
      intersect: (a, b) => {
        const t = (rect.minX - a.x) / (b.x - a.x)
        return { x: rect.minX, z: a.z + (b.z - a.z) * t }
      },
    },
    {
      inside: p => p.x <= rect.maxX,
      intersect: (a, b) => {
        const t = (rect.maxX - a.x) / (b.x - a.x)
        return { x: rect.maxX, z: a.z + (b.z - a.z) * t }
      },
    },
    {
      inside: p => p.z >= rect.minZ,
      intersect: (a, b) => {
        const t = (rect.minZ - a.z) / (b.z - a.z)
        return { x: a.x + (b.x - a.x) * t, z: rect.minZ }
      },
    },
    {
      inside: p => p.z <= rect.maxZ,
      intersect: (a, b) => {
        const t = (rect.maxZ - a.z) / (b.z - a.z)
        return { x: a.x + (b.x - a.x) * t, z: rect.maxZ }
      },
    },
  ]

  for (const boundary of boundaries) {
    result = clipPolygon(result, boundary)
    if (result.length === 0) break
  }
  return result
}

function uniqueSorted(values: number[]) {
  return [...new Set(values)].sort((a, b) => a - b)
}

/**
 * Exact area coverage against a union of axis-aligned rectangles.
 *
 * Rect boundaries are split into disjoint cells first, avoiding overlap
 * double-counting. A tiny clearance shrinks the legal region so an exact
 * tire-to-line touch counts as contact instead of "still inside".
 */
export function footprintTouchesOutsideRectUnion(
  footprint: WheelContactFootprint,
  rects: readonly AxisAlignedRect[],
  boundaryClearanceMeters = 1e-6,
) {
  const legalRects = rects
    .map(rect => ({
      minX: rect.minX + boundaryClearanceMeters,
      maxX: rect.maxX - boundaryClearanceMeters,
      minZ: rect.minZ + boundaryClearanceMeters,
      maxZ: rect.maxZ - boundaryClearanceMeters,
    }))
    .filter(rect => rect.minX < rect.maxX && rect.minZ < rect.maxZ)

  const footprintArea = polygonArea(footprint.corners)
  if (footprintArea <= 0 || legalRects.length === 0) return true

  const xs = uniqueSorted(legalRects.flatMap(rect => [rect.minX, rect.maxX]))
  const zs = uniqueSorted(legalRects.flatMap(rect => [rect.minZ, rect.maxZ]))

  let coveredArea = 0
  for (let xi = 0; xi < xs.length - 1; xi++) {
    const minX = xs[xi]
    const maxX = xs[xi + 1]
    const centerX = (minX + maxX) / 2
    for (let zi = 0; zi < zs.length - 1; zi++) {
      const minZ = zs[zi]
      const maxZ = zs[zi + 1]
      const centerZ = (minZ + maxZ) / 2
      const covered = legalRects.some(rect =>
        centerX >= rect.minX &&
        centerX <= rect.maxX &&
        centerZ >= rect.minZ &&
        centerZ <= rect.maxZ
      )
      if (!covered) continue
      coveredArea += polygonArea(clipPolygonToRect(
        footprint.corners,
        { minX, maxX, minZ, maxZ },
      ))
    }
  }

  return coveredArea < footprintArea - 1e-10
}
