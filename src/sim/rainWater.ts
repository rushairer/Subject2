/**
 * Deterministic standing-water training environment.
 *
 * Rates, depths and wavelength are simulator scenarios, not meteorological
 * measurements or a predictive aquaplaning standard. Rendering, HUD and the
 * shared tire solver consume the same evolving state.
 */
export const RAIN_WATER = {
  initialAverageDepthMm: 2.4,
  rainfallMmPerHour: 175,
  drainageMmPerHour: 28,
  maximumAverageDepthMm: 8,
  maximumLocalDepthMm: 10,
  // Patches repeat smoothly across the entire world, including Subject 3.
  minimumPatchMultiplier: 0.62,
  patchMultiplierVariation: 0.76,
} as const

export interface RainWaterState {
  elapsedSeconds: number
  averageDepthMm: number
}

export function createRainWaterState(): RainWaterState {
  return {
    elapsedSeconds: 0,
    averageDepthMm: RAIN_WATER.initialAverageDepthMm,
  }
}

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value))

/**
 * Evolves in the same fixed/bounded substeps as the vehicle model. The
 * container is deliberately mutable to avoid a second animation clock.
 */
export function advanceRainWater(state: RainWaterState, dt: number): RainWaterState {
  if (!Number.isFinite(dt) || dt <= 0) return state
  const inflowMmPerSecond = RAIN_WATER.rainfallMmPerHour / 3600
  const outflowMmPerSecond = RAIN_WATER.drainageMmPerHour / 3600
  const depth = Number.isFinite(state.averageDepthMm) ? state.averageDepthMm : 0
  const runoff = outflowMmPerSecond * clamp(depth / 2, 0, 1)
  state.averageDepthMm = clamp(
    depth + (inflowMmPerSecond - runoff) * dt,
    0,
    RAIN_WATER.maximumAverageDepthMm,
  )
  state.elapsedSeconds += dt
  return state
}

/**
 * Low-frequency wet/pooled patches, fixed in world coordinates. Smooth
 * spatial variation prevents a sudden discontinuous grip jump at a tile edge.
 */
export function localRainWaterDepthMm(
  state: Readonly<RainWaterState>,
  x: number,
  z: number,
): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0
  const depth = Number.isFinite(state.averageDepthMm)
    ? clamp(state.averageDepthMm, 0, RAIN_WATER.maximumAverageDepthMm)
    : 0
  const pooling = (1 + Math.sin(x * 0.047 + z * 0.074)) * 0.5
  return clamp(
    depth * (RAIN_WATER.minimumPatchMultiplier +
      RAIN_WATER.patchMultiplierVariation * pooling),
    0, RAIN_WATER.maximumLocalDepthMm,
  )
}

/**
 * Continuous risk proxy. Speed and water depth BOTH matter. It neither
 * supplies an artificial steering impulse nor fabricates wheel-lock events.
 */
export function aquaplaningSeverity(groundSpeedMps: number, depthMm: number): number {
  if (!Number.isFinite(groundSpeedMps) || !Number.isFinite(depthMm)) return 0
  const depthFactor = clamp((depthMm - 0.6) / 4.4, 0, 1)
  const speedFactor = clamp((Math.abs(groundSpeedMps) - 11) / 18, 0, 1)
  return depthFactor * speedFactor
}
