import { DRIVING_RULES } from '../rules/drivingRules'

export interface CutInResponseCoachingSample {
  t: number
  project: string
  speed: number
  throttle?: number
  brake?: number
  steeringWheelAngle?: number
  cutInHazardId?: string
  cutInConflict?: boolean
  cutInProgressDeltaMeters?: number
  cutInLateralDeltaMeters?: number
  cutInLongitudinalSpeedMps?: number
  cutInLateralSpeedMps?: number
  cutInClosingSpeedMps?: number
  cutInTimeToLongitudinalMeetSeconds?: number
}

export interface CutInResponseCoachingEvent {
  hazardId: string
  triggerTime: number
  representativeTime: number
  triggerAheadMeters: number
  triggerLateralMeters: number
  minimumPlanarDistanceMeters?: number
  minimumAbsoluteLongitudinalDistanceMeters?: number
  minimumAbsoluteLateralDistanceMeters?: number
  minimumTimeToLongitudinalMeetSeconds?: number
  baselineThrottle?: number
  throttleReleaseSeconds?: number
  brakeReactionSeconds?: number
  maximumBrake: number
  maximumSteeringWheelChangeRadians?: number
}

export interface CutInResponseCoachingReport {
  scenarioSampleCount: number
  events: CutInResponseCoachingEvent[]
}

function finite(value: number | undefined): value is number {
  return value != null && Number.isFinite(value)
}

function minimumFinite(
  samples: readonly CutInResponseCoachingSample[],
  pick: (sample: CutInResponseCoachingSample) => number | undefined,
) {
  let minimum = Infinity
  for (const sample of samples) {
    const value = pick(sample)
    if (finite(value)) minimum = Math.min(minimum, value)
  }
  return Number.isFinite(minimum) ? minimum : undefined
}

function representativeTime(
  samples: readonly CutInResponseCoachingSample[],
  fallback: number,
) {
  let bestTime = fallback
  let bestDistance = Infinity

  for (const sample of samples) {
    if (
      !finite(sample.cutInProgressDeltaMeters) ||
      !finite(sample.cutInLateralDeltaMeters)
    ) {
      continue
    }
    const distance = Math.hypot(
      sample.cutInProgressDeltaMeters,
      sample.cutInLateralDeltaMeters,
    )
    if (distance < bestDistance) {
      bestDistance = distance
      bestTime = sample.t
    }
  }

  return bestTime
}

export function buildCutInResponseCoachingReport(
  input: readonly CutInResponseCoachingSample[],
): CutInResponseCoachingReport {
  const rules = DRIVING_RULES.subject3.cutInCoaching
  const samples = input
    .filter(sample => Number.isFinite(sample.t))
    .slice()
    .sort((a, b) => a.t - b.t)

  const scenarioSampleCount = samples.filter(
    sample => sample.project === 'subject3' && !!sample.cutInHazardId,
  ).length

  const events: CutInResponseCoachingEvent[] = []
  let cooldownUntil = -Infinity

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const current = samples[index]
    if (current.t <= cooldownUntil) continue
    if (
      previous.project !== 'subject3' ||
      current.project !== 'subject3' ||
      !previous.cutInHazardId ||
      previous.cutInHazardId !== current.cutInHazardId ||
      current.cutInConflict !== true ||
      previous.cutInConflict === true ||
      !finite(current.cutInProgressDeltaMeters) ||
      !finite(current.cutInLateralDeltaMeters)
    ) {
      continue
    }

    const dt = current.t - previous.t
    if (dt <= 0 || dt > rules.maximumSampleGapSeconds) continue
    if (Math.abs(current.speed) * 3.6 < rules.minimumPlayerSpeedKmh) continue
    if (
      current.cutInProgressDeltaMeters >
        rules.maximumRelevantAheadMeters ||
      current.cutInProgressDeltaMeters <
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
        sample.cutInHazardId === current.cutInHazardId &&
        sample.t >= triggerTime &&
        sample.t <= reactionEnd,
    )
    const evidenceSamples = samples.filter(
      sample =>
        sample.project === 'subject3' &&
        sample.cutInHazardId === current.cutInHazardId &&
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
    const maximumBrake = responseSamples.reduce(
      (maximum, sample) =>
        finite(sample.brake) ? Math.max(maximum, sample.brake) : maximum,
      0,
    )

    const baselineSteering = finite(previous.steeringWheelAngle)
      ? previous.steeringWheelAngle
      : finite(current.steeringWheelAngle)
        ? current.steeringWheelAngle
        : undefined
    const maximumSteeringWheelChangeRadians = finite(baselineSteering)
      ? responseSamples.reduce((maximum, sample) => {
          if (!finite(sample.steeringWheelAngle)) return maximum
          return Math.max(
            maximum,
            Math.abs(sample.steeringWheelAngle - baselineSteering),
          )
        }, 0)
      : undefined

    const minimumPlanarDistanceMeters = minimumFinite(
      evidenceSamples,
      sample =>
        finite(sample.cutInProgressDeltaMeters) &&
        finite(sample.cutInLateralDeltaMeters)
          ? Math.hypot(
              sample.cutInProgressDeltaMeters,
              sample.cutInLateralDeltaMeters,
            )
          : undefined,
    )

    events.push({
      hazardId: current.cutInHazardId,
      triggerTime,
      representativeTime: representativeTime(evidenceSamples, triggerTime),
      triggerAheadMeters: current.cutInProgressDeltaMeters,
      triggerLateralMeters: current.cutInLateralDeltaMeters,
      minimumPlanarDistanceMeters,
      minimumAbsoluteLongitudinalDistanceMeters: minimumFinite(
        evidenceSamples,
        sample =>
          finite(sample.cutInProgressDeltaMeters)
            ? Math.abs(sample.cutInProgressDeltaMeters)
            : undefined,
      ),
      minimumAbsoluteLateralDistanceMeters: minimumFinite(
        evidenceSamples,
        sample =>
          finite(sample.cutInLateralDeltaMeters)
            ? Math.abs(sample.cutInLateralDeltaMeters)
            : undefined,
      ),
      minimumTimeToLongitudinalMeetSeconds: minimumFinite(
        evidenceSamples,
        sample => sample.cutInTimeToLongitudinalMeetSeconds,
      ),
      baselineThrottle,
      throttleReleaseSeconds,
      brakeReactionSeconds,
      maximumBrake,
      maximumSteeringWheelChangeRadians,
    })

    cooldownUntil = evidenceEnd
  }

  return { scenarioSampleCount, events }
}
