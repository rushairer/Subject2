import { frontWindshieldPoint, WINDSHIELD_HEIGHT } from './windshieldGeometry'

export type WindshieldWiperMode = 'off' | 'slow' | 'fast'

export const WINDSHIELD_WIPER_MODES: readonly WindshieldWiperMode[] = [
  'off', 'slow', 'fast',
]

export interface GlassCoordinate {
  /** Metres right of vehicle center on the windshield. */
  x: number
  /** Metres above the lower windshield edge along the glass. */
  y: number
}

export interface WiperStroke {
  pivot: GlassCoordinate
  armEnd: GlassCoordinate
  bladeStart: GlassCoordinate
  bladeEnd: GlassCoordinate
}

export const WINDSHIELD_WIPERS = {
  slowCycleSeconds: 1.6,
  fastCycleSeconds: 0.78,
  parkedAngleRadians: 0.16,
  sweepRadians: 0.91,
  bladeClearanceMeters: 0.045,
} as const

const WIPER_ARMS = [
  { x: -0.57, y: 0.07, armMeters: 0.42, bladeHalfMeters: 0.15 },
  { x: 0.12, y: 0.07, armMeters: 0.42, bladeHalfMeters: 0.15 },
] as const

/** Normalized out-and-back wiping phase. No hidden motion when parked. */
export function wiperSweepPosition(
  mode: WindshieldWiperMode,
  elapsedSeconds: number,
): number {
  if (mode === 'off' || !Number.isFinite(elapsedSeconds)) return 0
  const cycle = mode === 'fast'
    ? WINDSHIELD_WIPERS.fastCycleSeconds
    : WINDSHIELD_WIPERS.slowCycleSeconds
  const progress = ((elapsedSeconds % cycle) + cycle) % cycle / cycle
  return (1 - Math.cos(progress * Math.PI * 2)) / 2
}

export function windshieldWiperStrokes(phase: number): readonly WiperStroke[] {
  const sweep = Math.max(0, Math.min(1, Number.isFinite(phase) ? phase : 0))
  const angle = WINDSHIELD_WIPERS.parkedAngleRadians +
    sweep * WINDSHIELD_WIPERS.sweepRadians
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  return WIPER_ARMS.map(arm => ({
    pivot: { x: arm.x, y: arm.y },
    armEnd: {
      x: arm.x + arm.armMeters * dx,
      y: arm.y + arm.armMeters * dy,
    },
    bladeStart: {
      x: arm.x + (arm.armMeters - arm.bladeHalfMeters) * dx,
      y: arm.y + (arm.armMeters - arm.bladeHalfMeters) * dy,
    },
    bladeEnd: {
      x: arm.x + (arm.armMeters + arm.bladeHalfMeters) * dx,
      y: arm.y + (arm.armMeters + arm.bladeHalfMeters) * dy,
    },
  }))
}

/** Small real-width clearing lane swept by each physical rubber blade. */
export function isGlassDropBeingWiped(
  point: GlassCoordinate,
  strokes: readonly WiperStroke[],
): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false
  if (point.y < 0 || point.y > WINDSHIELD_HEIGHT) return false
  return strokes.some(stroke => {
    const { bladeStart: a, bladeEnd: b } = stroke
    const abx = b.x - a.x
    const aby = b.y - a.y
    const lengthSquared = abx * abx + aby * aby
    const progress = lengthSquared <= 1e-10
      ? 0
      : Math.max(0, Math.min(1,
        ((point.x - a.x) * abx + (point.y - a.y) * aby) /
          lengthSquared))
    return Math.hypot(
      point.x - (a.x + abx * progress),
      point.y - (a.y + aby * progress),
    ) <= WINDSHIELD_WIPERS.bladeClearanceMeters
  })
}

/** Returns the point on the single canonical glass, toward the driver. */
/**
 * Sweep-aware contact against the radial rubber-blade footprint. Unlike a
 * current-frame-only test, this covers every angle traversed between 30 Hz or
 * 60 Hz frames without spawning intermediate Three.js geometry.
 */
export function isGlassDropWipedDuringSweep(
  point: GlassCoordinate,
  previousPhase: number,
  currentPhase: number,
): boolean {
  if (![point.x, point.y, previousPhase, currentPhase].every(Number.isFinite)) return false
  if (point.y < 0 || point.y > WINDSHIELD_HEIGHT) return false
  const from = WINDSHIELD_WIPERS.parkedAngleRadians +
    Math.max(0, Math.min(1, previousPhase)) * WINDSHIELD_WIPERS.sweepRadians
  const to = WINDSHIELD_WIPERS.parkedAngleRadians +
    Math.max(0, Math.min(1, currentPhase)) * WINDSHIELD_WIPERS.sweepRadians
  for (const arm of WIPER_ARMS) {
    const distance = Math.hypot(point.x - arm.x, point.y - arm.y)
    const near = arm.armMeters - arm.bladeHalfMeters
    const far = arm.armMeters + arm.bladeHalfMeters
    const clearance = WINDSHIELD_WIPERS.bladeClearanceMeters
    if (distance < near - clearance || distance > far + clearance) continue
    const angle = Math.atan2(point.y - arm.y, point.x - arm.x)
    const angularClearance = Math.asin(Math.min(1, clearance / Math.max(distance, clearance)))
    if (angle >= Math.min(from, to) - angularClearance &&
        angle <= Math.max(from, to) + angularClearance) return true
  }
  return false
}

export function wiperGlassPoint(
  coordinate: GlassCoordinate,
  offset = 0.027,
): [number, number, number] {
  return frontWindshieldPoint(coordinate.x, coordinate.y, offset)
}
