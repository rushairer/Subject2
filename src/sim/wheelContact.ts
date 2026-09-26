import {
  polygonIntersectsAxisAlignedRect,
  polygonTouchesOutsideRectUnion,
  type AxisAlignedRect,
} from './planarGeometry'
import { TRAINING_CAR } from './vehicleDimensions'
import { worldPointFromVehicle, type XZVector } from './vehicleFrame'

export type { AxisAlignedRect } from './planarGeometry'

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

export function footprintIntersectsAxisAlignedRect(
  footprint: WheelContactFootprint,
  rect: AxisAlignedRect,
  touchToleranceMeters = 1e-6,
) {
  return polygonIntersectsAxisAlignedRect(
    footprint.corners,
    rect,
    touchToleranceMeters,
  )
}

export function footprintTouchesOutsideRectUnion(
  footprint: WheelContactFootprint,
  rects: readonly AxisAlignedRect[],
  boundaryClearanceMeters = 1e-6,
) {
  return polygonTouchesOutsideRectUnion(
    footprint.corners,
    rects,
    boundaryClearanceMeters,
  )
}
