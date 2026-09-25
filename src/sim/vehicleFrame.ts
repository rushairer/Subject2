/**
 * Canonical vehicle-local frame used throughout Subject2.
 *
 * heading = 0:
 *   forward = world -Z
 *   right   = world +X
 *
 * Positive heading / steering turns the vehicle to the right.
 * Positive route lateral offset is also to the vehicle/route right.
 */
export interface XZVector {
  x: number
  z: number
}

export function forwardFromHeading(heading: number): XZVector {
  return { x: Math.sin(heading), z: -Math.cos(heading) }
}

export function rightFromHeading(heading: number): XZVector {
  return { x: Math.cos(heading), z: Math.sin(heading) }
}

export function leftFromHeading(heading: number): XZVector {
  const right = rightFromHeading(heading)
  return { x: -right.x, z: -right.z }
}

export function worldPointFromVehicle(
  x: number,
  z: number,
  heading: number,
  forwardMeters = 0,
  rightMeters = 0,
): XZVector {
  const forward = forwardFromHeading(heading)
  const right = rightFromHeading(heading)
  return {
    x: x + forward.x * forwardMeters + right.x * rightMeters,
    z: z + forward.z * forwardMeters + right.z * rightMeters,
  }
}

export function normalizeHeadingDelta(delta: number) {
  let value = delta
  while (value > Math.PI) value -= Math.PI * 2
  while (value < -Math.PI) value += Math.PI * 2
  return value
}

export type TurnDirection = 'left' | 'right' | 'straight'

export function turnDirection(fromHeading: number, toHeading: number, epsilon = 1e-6): TurnDirection {
  const delta = normalizeHeadingDelta(toHeading - fromHeading)
  if (delta > epsilon) return 'right'
  if (delta < -epsilon) return 'left'
  return 'straight'
}
