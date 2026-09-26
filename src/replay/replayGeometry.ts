import { forwardFromHeading, normalizeHeadingDelta, rightFromHeading } from '../sim/vehicleFrame'

export interface ReplayPoint {
  x: number
  z: number
}

export interface ReplayFrame {
  originX: number
  originZ: number
  heading: number
}

/**
 * Converts world X/Z into the driver's initial local frame.
 *
 * local x > 0 = vehicle right
 * local z > 0 = vehicle forward
 *
 * User-facing replay maps therefore always render:
 *   top    = initial forward
 *   right  = initial vehicle right
 *   left   = initial vehicle left
 */
export function toReplayLocal(point: ReplayPoint, frame: ReplayFrame): ReplayPoint {
  const dx = point.x - frame.originX
  const dz = point.z - frame.originZ
  const forward = forwardFromHeading(frame.heading)
  const right = rightFromHeading(frame.heading)
  return {
    x: dx * right.x + dz * right.z,
    z: dx * forward.x + dz * forward.z,
  }
}


/**
 * Converts a world heading into the same initial-driver-relative frame used
 * by replay X/Z coordinates. Positive values remain right turns on screen.
 */
export function toReplayHeading(heading: number, frameHeading: number) {
  return normalizeHeadingDelta(heading - frameHeading)
}
