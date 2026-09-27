import { DRIVING_RULES } from '../rules/drivingRules'

export interface FollowingDistanceCoachingSample {
  t: number
  project: string
  speed: number
  leadVehicleId?: string
  leadGapMeters?: number
  leadTimeGapSeconds?: number
  leadClosingSpeedMps?: number
  leadTimeToCollisionSeconds?: number
}

export interface FollowingDistanceCoachingSegment {
  vehicleId: string
  startTime: number
  endTime: number
  durationSeconds: number
  representativeTime: number
  minimumGapMeters: number
  minimumTimeGapSeconds: number
  representativeSpeedKmh: number
  representativeClosingSpeedMps: number
  representativeTimeToCollisionSeconds?: number
}

export interface FollowingDistanceCoachingReport {
  observedSampleCount: number
  observedSeconds: number
  shortGapSeconds: number
  minimumGapMeters?: number
  minimumTimeGapSeconds?: number
  segments: FollowingDistanceCoachingSegment[]
}

function eligibleSample(sample: FollowingDistanceCoachingSample) {
  const minimumSpeedKmh =
    DRIVING_RULES.subject3.followingCoaching.minimumSpeedKmh
  const speedKmh = sample.speed * 3.6

  return (
    sample.project === 'subject3' &&
    speedKmh >= minimumSpeedKmh &&
    typeof sample.leadVehicleId === 'string' &&
    sample.leadVehicleId.length > 0 &&
    sample.leadGapMeters != null &&
    Number.isFinite(sample.leadGapMeters) &&
    sample.leadTimeGapSeconds != null &&
    Number.isFinite(sample.leadTimeGapSeconds)
  )
}

function segmentDuration(samples: readonly FollowingDistanceCoachingSample[]) {
  if (samples.length < 2) return 0
  return Math.max(0, samples[samples.length - 1].t - samples[0].t)
}

function representativeSample(
  samples: readonly FollowingDistanceCoachingSample[],
) {
  return samples.reduce((worst, sample) =>
    (sample.leadTimeGapSeconds ?? Infinity) <
    (worst.leadTimeGapSeconds ?? Infinity)
      ? sample
      : worst,
  )
}

export function buildFollowingDistanceCoachingReport(
  samples: readonly FollowingDistanceCoachingSample[],
): FollowingDistanceCoachingReport {
  const {
    referenceTimeGapSeconds,
    minimumSustainedSeconds,
    maximumSampleGapSeconds,
  } = DRIVING_RULES.subject3.followingCoaching

  const sorted = [...samples].sort((a, b) => a.t - b.t)
  const eligible = sorted.filter(eligibleSample)

  let observedSeconds = 0
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]
    const current = sorted[index]
    if (!eligibleSample(previous) || !eligibleSample(current)) continue
    const gap = current.t - previous.t
    if (
      current.leadVehicleId === previous.leadVehicleId &&
      gap >= 0 &&
      gap <= maximumSampleGapSeconds
    ) {
      observedSeconds += gap
    }
  }

  const minimumGapMeters = eligible.length > 0
    ? eligible.reduce(
        (minimum, sample) => Math.min(minimum, sample.leadGapMeters ?? Infinity),
        Infinity,
      )
    : undefined
  const minimumTimeGapSeconds = eligible.length > 0
    ? eligible.reduce(
        (minimum, sample) => Math.min(minimum, sample.leadTimeGapSeconds ?? Infinity),
        Infinity,
      )
    : undefined

  const segments: FollowingDistanceCoachingSegment[] = []
  let current: FollowingDistanceCoachingSample[] = []
  let currentVehicleId: string | null = null
  let previousEligible: FollowingDistanceCoachingSample | null = null

  const flush = () => {
    if (current.length === 0 || currentVehicleId == null) {
      current = []
      currentVehicleId = null
      return
    }

    const durationSeconds = segmentDuration(current)
    if (durationSeconds >= minimumSustainedSeconds) {
      const representative = representativeSample(current)
      const minimumGapMeters = current.reduce(
        (minimum, sample) => Math.min(minimum, sample.leadGapMeters ?? Infinity),
        Infinity,
      )
      const minimumTimeGapSeconds = current.reduce(
        (minimum, sample) => Math.min(minimum, sample.leadTimeGapSeconds ?? Infinity),
        Infinity,
      )
      segments.push({
        vehicleId: currentVehicleId,
        startTime: current[0].t,
        endTime: current[current.length - 1].t,
        durationSeconds,
        representativeTime: representative.t,
        minimumGapMeters,
        minimumTimeGapSeconds,
        representativeSpeedKmh: representative.speed * 3.6,
        representativeClosingSpeedMps: representative.leadClosingSpeedMps ?? 0,
        representativeTimeToCollisionSeconds:
          representative.leadTimeToCollisionSeconds,
      })
    }

    current = []
    currentVehicleId = null
  }

  for (const sample of sorted) {
    if (!eligibleSample(sample)) {
      flush()
      previousEligible = null
      continue
    }

    const isShortGap =
      (sample.leadTimeGapSeconds ?? Infinity) < referenceTimeGapSeconds
    if (!isShortGap) {
      flush()
      previousEligible = sample
      continue
    }

    const gap =
      previousEligible == null ? Infinity : sample.t - previousEligible.t
    const continues =
      current.length > 0 &&
      currentVehicleId === sample.leadVehicleId &&
      previousEligible?.leadVehicleId === sample.leadVehicleId &&
      gap >= 0 &&
      gap <= maximumSampleGapSeconds

    if (!continues) flush()

    if (current.length === 0) {
      currentVehicleId = sample.leadVehicleId ?? null
    }
    current.push(sample)
    previousEligible = sample
  }
  flush()

  return {
    observedSampleCount: eligible.length,
    observedSeconds,
    shortGapSeconds: segments.reduce(
      (sum, segment) => sum + segment.durationSeconds,
      0,
    ),
    minimumGapMeters:
      minimumGapMeters != null && Number.isFinite(minimumGapMeters)
        ? minimumGapMeters
        : undefined,
    minimumTimeGapSeconds:
      minimumTimeGapSeconds != null && Number.isFinite(minimumTimeGapSeconds)
        ? minimumTimeGapSeconds
        : undefined,
    segments,
  }
}
