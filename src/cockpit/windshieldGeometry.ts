import { TRAINING_CAR } from '../sim/vehicleDimensions'

/**
 * Canonical windshield glazing plane from SantanaBody. Coordinates are in the
 * body frame (forward = -Z), not the camera or rear-view mirror frame.
 */
export const FRONT_WINDSHIELD = {
  lowerY: 1.04,
  upperY: 1.64,
  lowerZ: -1.0,
  upperZ: -0.38,
  lowerHalfWidth: TRAINING_CAR.widthMeters / 2 - 0.035,
  upperHalfWidth: 0.72,
} as const

export const WINDSHIELD_HEIGHT = FRONT_WINDSHIELD.upperY -
  FRONT_WINDSHIELD.lowerY
export const WINDSHIELD_INCLINE = Math.atan2(
  FRONT_WINDSHIELD.upperZ - FRONT_WINDSHIELD.lowerZ,
  WINDSHIELD_HEIGHT,
)

/** Point on the actual sloped glass. Positive offset faces the driver's eye. */
export function frontWindshieldPoint(
  x: number,
  heightFromBottom: number,
  inwardOffset = 0,
): [number, number, number] {
  const h = Math.max(0, Math.min(WINDSHIELD_HEIGHT, heightFromBottom))
  const fraction = h / WINDSHIELD_HEIGHT
  const halfWidth = FRONT_WINDSHIELD.lowerHalfWidth +
    (FRONT_WINDSHIELD.upperHalfWidth - FRONT_WINDSHIELD.lowerHalfWidth) *
      fraction
  const clampedX = Math.max(-halfWidth, Math.min(halfWidth, x))
  return [
    clampedX,
    FRONT_WINDSHIELD.lowerY + h - Math.sin(WINDSHIELD_INCLINE) * inwardOffset,
    FRONT_WINDSHIELD.lowerZ +
      (FRONT_WINDSHIELD.upperZ - FRONT_WINDSHIELD.lowerZ) * fraction +
      Math.cos(WINDSHIELD_INCLINE) * inwardOffset,
  ]
}
