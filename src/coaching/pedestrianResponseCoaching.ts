import { DRIVING_RULES } from '../rules/drivingRules'

export interface PedestrianResponseCoachingSample {
  t: number
  project: string
  speed: number
  throttle?: number
  brake?: number
  pedestrianHazardId?: string
  pedestrianConflict?: boolean
  pedestrianProgressDeltaMeters?: number
  pedestrianLateralDeltaMeters?: number
  pedestrianLateralSpeedMps?: number
  pedestrianPlanarDistanceMeters?: number
  pedestrianTimeToCrosswalkSeconds?: number
}

export interface PedestrianResponseCoachingEvent {
  hazardId: string
  triggerTime: number
  representativeTime: number
  triggerAheadMeters: number
  triggerLateralMeters: number
  minimumPlanarDistanceMeters?: number
  baselineThrottle?: number
  throttleReleaseSeconds?: number
  brakeReactionSeconds?: number
  stopReactionSeconds?: number
  maximumBrake: number
  minimumSpeedMps: number
}

export interface PedestrianResponseCoachingReport {
  scenarioSampleCount: number
  events: PedestrianResponseCoachingEvent[]
}

function finite(value: number | undefined): value is number {
  return value != null && Number.isFinite(value)
}

function representativeTime(
  samples: readonly PedestrianResponseCoachingSample[],
  fallback: number,
) {
  let bestTime = fallback
  let bestDistance = Infinity

  for (const sample of samples) {
    if (!finite(sample.pedestrianPlanarDistanceMeters)) continue
    if (sample.pedestrianPlanarDistanceMeters < bestDistance) {
      bestDistance = sample.pedestrianPlanarDistanceMeters
      bestTime = sample.t
    }
  }

  return bestTime
}

export function buildPedestrianResponseCoachingReport(
  input: readonly PedestrianResponseCoachingSample[],
): PedestrianResponseCoachingReport {
  const rules = DRIVING_RULES.subject3.pedestrianResponseCoaching
  const samples = input
    .filter(sample => Number.isFinite(sample.t))
    .slice()
    .sort((a, b) => a.t - b.t)

  const scenarioSampleCount = samples.filter(
    sample => sample.project === 'subject3' && !!sample.pedestrianHazardId,
  ).length

  const events: PedestrianResponseCoachingEvent[] = []
  let cooldownUntil = -Infinity

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const current = samples[index]
    if (current.t <= cooldownUntil) continue
    if (
      previous.project !== 'subject3' ||
      current.project !== 'subject3' ||
      !previous.pedestrianHazardId ||
      previous.pedestrianHazardId !== current.pedestrianHazardId ||
      current.pedestrianConflict !== true ||
      previous.pedestrianConflict === true ||
      !finite(current.pedestrianProgressDeltaMeters) ||
      !finite(current.pedestrianLateralDeltaMeters)
    ) {
      continue
    }

    const dt = current.t - previous.t
    if (dt <= 0 || dt > rules.maximumSampleGapSeconds) continue
    if (Math.abs(current.speed) * 3.6 < rules.minimumPlayerSpeedKmh) continue
    if (
      current.pedestrianProgressDeltaMeters >
        rules.maximumRelevantAheadMeters ||
      current.pedestrianProgressDeltaMeters <
        -rules.maximumRelevantBehindMeters
    ) {
      continue
    }

    const triggerTime = current.t
    const reactionEnd = triggerTime + rules.reactionWindowSeconds
    const evidenceEnd = triggerTime + rules.evidenceWindowSeconds
    const responseSamples = samples.filter(
      sample =>
        sample.project === 'subject3' &&
        sample.pedestrianHazardId === current.pedestrianHazardId &&
        sample.t >= triggerTime &&
        sample.t <= reactionEnd,
    )
    const evidenceSamples = samples.filter(
      sample =>
        sample.project === 'subject3' &&
        sample.pedestrianHazardId === current.pedestrianHazardId &&
        sample.t >= triggerTime &&
        sample.t <= evidenceEnd,
    )

    const baselineThrottle = finite(previous.throttle)
      ? previous.throttle
      : finite(current.throttle)
        ? current.throttle
        : undefined

    let throttleReleaseSeconds: number | undefined
    if (
      finite(baselineThrottle) &&
      baselineThrottle >= rules.throttleReleaseDelta
    ) {
      const released = responseSamples.find(
        sample =>
          finite(sample.throttle) &&
          sample.throttle <=
            Math.max(0, baselineThrottle - rules.throttleReleaseDelta),
      )
      if (released) {
        throttleReleaseSeconds = Math.max(0, released.t - triggerTime)
      }
    }

    const braking = responseSamples.find(
      sample =>
        finite(sample.brake) &&
        sample.brake >= rules.brakeResponseThreshold,
    )
    const brakeReactionSeconds = braking
      ? Math.max(0, braking.t - triggerTime)
      : undefined

    const stopped = evidenceSamples.find(
      sample =>
        Math.abs(sample.speed) <= DRIVING_RULES.subject3.crosswalk.stoppedSpeedMps,
    )
    const stopReactionSeconds = stopped
      ? Math.max(0, stopped.t - triggerTime)
      : undefined

    const maximumBrake = responseSamples.reduce(
      (maximum, sample) =>
        finite(sample.brake) ? Math.max(maximum, sample.brake) : maximum,
      0,
    )
    const minimumSpeedMps = evidenceSamples.reduce(
      (minimum, sample) => Math.min(minimum, Math.abs(sample.speed)),
      Math.abs(current.speed),
    )
    const minimumPlanarDistanceMeters = evidenceSamples.reduce<number | undefined>(
      (minimum, sample) => {
        if (!finite(sample.pedestrianPlanarDistanceMeters)) return minimum
        return minimum == null
          ? sample.pedestrianPlanarDistanceMeters
          : Math.min(minimum, sample.pedestrianPlanarDistanceMeters)
      },
      undefined,
    )

    events.push({
      hazardId: current.pedestrianHazardId,
      triggerTime,
      representativeTime: representativeTime(evidenceSamples, triggerTime),
      triggerAheadMeters: current.pedestrianProgressDeltaMeters,
      triggerLateralMeters: current.pedestrianLateralDeltaMeters,
      minimumPlanarDistanceMeters,
      baselineThrottle,
      throttleReleaseSeconds,
      brakeReactionSeconds,
      stopReactionSeconds,
      maximumBrake,
      minimumSpeedMps,
    })

    cooldownUntil = evidenceEnd
  }

  return { scenarioSampleCount, events }
}
