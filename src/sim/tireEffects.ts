import type { TireTelemetry } from './vehicleTireDynamics'
import type { WheelId } from './wheelContact'

export const TIRE_EFFECT_THRESHOLDS = {
  markMinimumSpeedMps: 1.5,
  markMinimumSeverity: 0.18,
  smokeMinimumSpeedMps: 3.0,
  smokeMinimumSeverity: 0.48,
} as const

export function wheelSkidSeverity(
  tire: TireTelemetry,
  wheelId: WheelId,
) {
  return wheelId.startsWith('front-')
    ? tire.frontSkidSeverity
    : tire.rearSkidSeverity
}

export function tireSmokeEmissionRate(
  tire: TireTelemetry,
  speedMps: number,
  wheelId: WheelId,
) {
  const speed = Math.abs(speedMps)
  const severity = wheelSkidSeverity(tire, wheelId)
  if (
    speed < TIRE_EFFECT_THRESHOLDS.smokeMinimumSpeedMps ||
    severity < TIRE_EFFECT_THRESHOLDS.smokeMinimumSeverity
  ) {
    return 0
  }

  const severityHeadroom =
    (severity - TIRE_EFFECT_THRESHOLDS.smokeMinimumSeverity) /
    (1 - TIRE_EFFECT_THRESHOLDS.smokeMinimumSeverity)
  const speedFactor = Math.min(1.4, speed / 12)
  return Math.max(0, severityHeadroom) * speedFactor * 18
}
