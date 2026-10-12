import { forwardFromHeading, rightFromHeading } from './vehicleFrame'

/**
 * Small, bounded rain-only visual spray: not an extra aquaplaning/braking
 * heuristic. All depths are samples of the authoritative rainWater field.
 */
export const RAIN_TIRE_SPRAY = {
  minSpeedMps: 1.8,
  fullSpeedMps: 15,
  minDepthMm: 1.2,
  fullDepthMm: 7,
  maxDropletsPerWheelSecond: 36,
  capacity: 128,
  gravityMps2: 9.81,
  minDropletY: 0.035,
} as const

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

/** No water/speed, no splash. Both depth and actual vehicle speed matter. */
export function rainTireSprayEmissionRate(speedMps: number, depthMm: number): number {
  if (!Number.isFinite(speedMps) || !Number.isFinite(depthMm)) return 0
  const speed = Math.abs(speedMps)
  if (speed <= RAIN_TIRE_SPRAY.minSpeedMps ||
      depthMm <= RAIN_TIRE_SPRAY.minDepthMm) return 0
  const speedFactor = clamp01(
    (speed - RAIN_TIRE_SPRAY.minSpeedMps) /
      (RAIN_TIRE_SPRAY.fullSpeedMps - RAIN_TIRE_SPRAY.minSpeedMps),
  )
  const depthFactor = clamp01(
    (depthMm - RAIN_TIRE_SPRAY.minDepthMm) /
      (RAIN_TIRE_SPRAY.fullDepthMm - RAIN_TIRE_SPRAY.minDepthMm),
  )
  return RAIN_TIRE_SPRAY.maxDropletsPerWheelSecond * speedFactor * depthFactor
}

export interface SprayVelocity {
  vx: number
  vy: number
  vz: number
}

/**
 * Departing droplets retain some wheel motion in world coordinates, but
 * trail rapidly behind the vehicle. A signed speed reverses the plume.
 */
export function rainTireSprayVelocity(
  wheelHeading: number,
  speedMps: number,
  depthMm: number,
  phase: number,
): SprayVelocity {
  if (![wheelHeading, speedMps, depthMm, phase].every(Number.isFinite)) {
    return { vx: 0, vy: 0, vz: 0 }
  }
  const forward = forwardFromHeading(wheelHeading)
  const right = rightFromHeading(wheelHeading)
  const sideways = Math.sin(phase) * (0.2 + Math.min(0.3, Math.abs(speedMps) * 0.012))
  const carriedSpeed = speedMps * 0.17
  return {
    vx: forward.x * carriedSpeed + right.x * sideways,
    vy: 0.38 + Math.min(1.05, Math.abs(speedMps) * 0.052) +
      Math.min(0.75, Math.max(0, depthMm) * 0.08),
    vz: forward.z * carriedSpeed + right.z * sideways,
  }
}
