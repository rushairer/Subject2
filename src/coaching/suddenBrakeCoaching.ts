import { DRIVING_RULES } from '../rules/drivingRules'

export interface SuddenBrakeCoachingSample {
  t: number
  project: string
  speed: number
  throttle?: number
  brake?: number
  leadVehicleId?: string
  leadScenario?: 'sudden-brake'
  leadSpeedMps?: number
  leadGapMeters?: number
  leadTimeGapSeconds?: number
  leadTimeToCollisionSeconds?: number
}

export interface SuddenBrakeCoachingEvent {
  vehicleId: string
  triggerTime: number
  representativeTime: number
  leadDecelerationMps2: number
  triggerTimeGapSeconds: number
  minimumTimeGapSeconds?: number
  minimumGapMeters?: number
  minimumTimeToCollisionSeconds?: number
  baselineThrottle?: number
  throttleReleaseSeconds?: number
  brakeReactionSeconds?: number
  maximumBrake: number
}

export interface SuddenBrakeCoachingReport {
  scenarioSampleCount: number
  events: SuddenBrakeCoachingEvent[]
}

function finite(value: number | undefined): value is number {
  return value != null && Number.isFinite(value)
}

function minimumFinite(
  samples: readonly SuddenBrakeCoachingSample[],
  pick: (sample: SuddenBrakeCoachingSample) => number | undefined,
) {
  let minimum = Infinity
  for (const sample of samples) {
    const value = pick(sample)
    if (finite(value)) minimum = Math.min(minimum, value)
  }
  return Number.isFinite(minimum) ? minimum : undefined
}

function representativeTime(
  samples: readonly SuddenBrakeCoachingSample[],
  fallback: number,
) {
  let best: SuddenBrakeCoachingSample | undefined
  let bestRisk = Infinity

  for (const sample of samples) {
    const ttc = sample.leadTimeToCollisionSeconds
    if (finite(ttc) && ttc >= 0 && ttc < bestRisk) {
      best = sample
      bestRisk = ttc
    }
  }
  if (best) return best.t

  for (const sample of samples) {
    const gap = sample.leadTimeGapSeconds
    if (finite(gap) && gap >= 0 && gap < bestRisk) {
      best = sample
      bestRisk = gap
    }
  }
  return best?.t ?? fallback
}

export function buildSuddenBrakeCoachingReport(
  input: readonly SuddenBrakeCoachingSample[],
): SuddenBrakeCoachingReport {
  const rules = DRIVING_RULES.subject3.suddenBrakeCoaching
  const samples = input
    .filter(sample => Number.isFinite(sample.t))
    .slice()
    .sort((a, b) => a.t - b.t)

  const scenarioSampleCount = samples.filter(
    sample => sample.project === 'subject3' && sample.leadScenario === 'sudden-brake',
  ).length

  const events: SuddenBrakeCoachingEvent[] = []
  let cooldownUntil = -Infinity

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const current = samples[index]
    if (current.t <= cooldownUntil) continue
    if (
      previous.project !== 'subject3' ||
      current.project !== 'subject3' ||
      previous.leadScenario !== 'sudden-brake' ||
      current.leadScenario !== 'sudden-brake' ||
      !previous.leadVehicleId ||
      previous.leadVehicleId !== current.leadVehicleId ||
      !finite(previous.leadSpeedMps) ||
      !finite(current.leadSpeedMps) ||
      !finite(current.leadTimeGapSeconds)
    ) {
      continue
    }

    const dt = current.t - previous.t
    if (dt <= 0 || dt > rules.maximumSampleGapSeconds) continue
    if (Math.abs(current.speed) * 3.6 < rules.minimumPlayerSpeedKmh) continue
    if (current.leadTimeGapSeconds > rules.maximumRelevantTimeGapSeconds) continue

    const leadDecelerationMps2 =
      (previous.leadSpeedMps - current.leadSpeedMps) / dt
    if (leadDecelerationMps2 < rules.minimumLeadDecelerationMps2) continue

    const triggerTime = current.t
    const reactionEnd = triggerTime + rules.reactionWindowSeconds
    const evidenceEnd = triggerTime + rules.evidenceWindowSeconds
    const responseSamples = samples.filter(
      sample =>
        sample.project === 'subject3' &&
        sample.t >= triggerTime &&
        sample.t <= reactionEnd,
    )
    const evidenceSamples = samples.filter(
      sample =>
        sample.project === 'subject3' &&
        sample.t >= triggerTime &&
        sample.t <= evidenceEnd &&
        sample.leadVehicleId === current.leadVehicleId,
    )

    const baselineThrottle = finite(previous.throttle)
      ? previous.throttle
      : finite(current.throttle)
        ? current.throttle
        : undefined

    let throttleReleaseSeconds: number | undefined
    if (finite(baselineThrottle) && baselineThrottle >= rules.throttleReleaseDelta) {
      const released = responseSamples.find(sample =>
        finite(sample.throttle) &&
        sample.throttle <= Math.max(0, baselineThrottle - rules.throttleReleaseDelta),
      )
      if (released) throttleReleaseSeconds = Math.max(0, released.t - triggerTime)
    }

    const braking = responseSamples.find(
      sample => finite(sample.brake) && sample.brake >= rules.brakeResponseThreshold,
    )
    const brakeReactionSeconds = braking
      ? Math.max(0, braking.t - triggerTime)
      : undefined
    const maximumBrake = responseSamples.reduce(
      (maximum, sample) => finite(sample.brake) ? Math.max(maximum, sample.brake) : maximum,
      0,
    )

    events.push({
      vehicleId: current.leadVehicleId,
      triggerTime,
      representativeTime: representativeTime(evidenceSamples, triggerTime),
      leadDecelerationMps2,
      triggerTimeGapSeconds: current.leadTimeGapSeconds,
      minimumTimeGapSeconds: minimumFinite(
        evidenceSamples,
        sample => sample.leadTimeGapSeconds,
      ),
      minimumGapMeters: minimumFinite(
        evidenceSamples,
        sample => sample.leadGapMeters,
      ),
      minimumTimeToCollisionSeconds: minimumFinite(
        evidenceSamples,
        sample => sample.leadTimeToCollisionSeconds,
      ),
      baselineThrottle,
      throttleReleaseSeconds,
      brakeReactionSeconds,
      maximumBrake,
    })

    cooldownUntil = evidenceEnd
  }

  return {
    scenarioSampleCount,
    events,
  }
}
