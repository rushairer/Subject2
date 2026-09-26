import { Vector3 } from 'three'
import { TRAINING_CAR } from '../sim/vehicleDimensions'
import { aimMirror } from './mirrorProjection'

// Also used by the first-person camera: moving the seat must not silently leave
// the mirrors calibrated for a different eye point.
export const DRIVER_EYE = { right: -0.43, height: 1.36, forward: -0.18 } as const
const eye = new Vector3(DRIVER_EYE.right, DRIVER_EYE.height, -DRIVER_EYE.forward)
const sideX = TRAINING_CAR.widthMeters / 2 + 0.14

// Separate left/right calibration accounts for the off-center driver. A narrow
// strip of the rear flank remains visible at each inner edge as a spatial cue.
export const VEHICLE_MIRRORS = [
  { id: 'center', position: new Vector3(-0.06, 1.49, -0.57), width: 0.32, height: 0.095, radius: 0.013,
    target: new Vector3(0, 1.20, 8), textureWidth: 768, textureHeight: 228 },
  { id: 'left', position: new Vector3(-sideX, 1.17, -0.72), width: 0.25, height: 0.15, radius: 0.026,
    target: new Vector3(-1.40, 0.85, 5), textureWidth: 512, textureHeight: 308 },
  { id: 'right', position: new Vector3(sideX, 1.17, -0.72), width: 0.25, height: 0.15, radius: 0.026,
    target: new Vector3(1.18, 1.00, 5), textureWidth: 512, textureHeight: 308 },
].map(mirror => ({ ...mirror, quaternion: aimMirror(mirror.position, eye, mirror.target) }))
