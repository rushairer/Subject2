import {
  localRainWaterDepthMm,
  type RainWaterState,
} from './rainWater'

/**
 * Coarse, world-anchored puddle decals sampled from the same continuous depth
 * field as the wheel physics. These visual footprints do not define grip,
 * collisions, road geometry or examination boundaries.
 */
export const RAIN_PUDDLES = {
  cellMeters: 7,
  visibleCellRadius: 4,
  minimumDepthMm: 2.05,
  maximumVisualDepthMm: 7.5,
} as const

export interface RainPuddleVisual {
  x: number
  z: number
  depthMm: number
  /** Visual water footprint, not a new physics collision geometry. */
  radiusX: number
  radiusZ: number
  intensity: number
}

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value))

function cellJitter(x: number, z: number, salt: number): number {
  const seed = Math.sin(x * 72.113 + z * 17.173 + salt * 53.17) * 43758.5453
  return seed - Math.floor(seed)
}

export function rainPuddlesNear(
  state: Readonly<RainWaterState>,
  worldX: number,
  worldZ: number,
): RainPuddleVisual[] {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return []
  const { cellMeters, visibleCellRadius, minimumDepthMm, maximumVisualDepthMm } =
    RAIN_PUDDLES
  const centerX = Math.floor(worldX / cellMeters)
  const centerZ = Math.floor(worldZ / cellMeters)
  const puddles: RainPuddleVisual[] = []
  for (let dx = -visibleCellRadius; dx <= visibleCellRadius; dx += 1) {
    for (let dz = -visibleCellRadius; dz <= visibleCellRadius; dz += 1) {
      const cellX = centerX + dx
      const cellZ = centerZ + dz
      const x = (cellX + 0.22 + cellJitter(cellX, cellZ, 1) * 0.56) *
        cellMeters
      const z = (cellZ + 0.22 + cellJitter(cellX, cellZ, 2) * 0.56) *
        cellMeters
      const depthMm = localRainWaterDepthMm(state, x, z)
      if (depthMm <= minimumDepthMm) continue

      const intensity = clamp(
        (depthMm - minimumDepthMm) / (maximumVisualDepthMm - minimumDepthMm),
        0, 1,
      )
      const footprint = 0.55 + intensity * 1.95
      puddles.push({
        x,
        z,
        depthMm,
        radiusX: footprint * (0.78 + cellJitter(cellX, cellZ, 3) * 0.38),
        radiusZ: footprint * (0.65 + cellJitter(cellX, cellZ, 4) * 0.42),
        intensity,
      })
    }
  }
  return puddles
}
