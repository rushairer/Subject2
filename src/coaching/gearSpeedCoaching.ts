import { DRIVING_RULES } from '../rules/drivingRules'

export type GearSpeedCoachingKind = 'low-rpm' | 'high-rpm'

export interface GearSpeedCoachingSample {
  t: number
  project: string
  speed: number
  gear: number
  automatic?: boolean
  engineOn?: boolean
  engineRpm?: number
  clutch?: number
}

export interface GearSpeedCoachingSegment {
  kind: GearSpeedCoachingKind
  project: string
  gear: number
  startTime: number
  endTime: number
  durationSeconds: number
  representativeTime: number
  representativeSpeedKmh: number
  representativeRpm: number
}

export interface GearSpeedCoachingReport {
  applicableSampleCount: number
  assessedSeconds: number
  mismatchSeconds: number
  segments: GearSpeedCoachingSegment[]
}

interface ClassifiedSample {
  sample: GearSpeedCoachingSample
  kind: GearSpeedCoachingKind | 'matched'
}

function classifySample(sample: GearSpeedCoachingSample): ClassifiedSample | null {
  const {
    minimumSpeedKmh,
    maximumClutchPosition,
    minimumRecommendedRpm,
    maximumRecommendedRpm,
  } = DRIVING_RULES.manualTransmission.gearSpeedCoaching

  if (
    sample.project !== 'subject3' ||
    sample.automatic === true ||
    sample.gear <= 0 ||
    sample.engineOn !== true ||
    sample.engineRpm == null ||
    sample.clutch == null ||
    !Number.isFinite(sample.engineRpm) ||
    !Number.isFinite(sample.clutch)
  ) {
    return null
  }

  const speedKmh = Math.abs(sample.speed) * 3.6
  if (
    speedKmh < minimumSpeedKmh ||
    sample.clutch > maximumClutchPosition
  ) {
    return null
  }

  if (sample.engineRpm < minimumRecommendedRpm) {
    return { sample, kind: 'low-rpm' }
  }
  if (sample.engineRpm > maximumRecommendedRpm) {
    return { sample, kind: 'high-rpm' }
  }
  return { sample, kind: 'matched' }
}

function segmentDuration(samples: readonly GearSpeedCoachingSample[]) {
  if (samples.length < 2) return 0
  return Math.max(0, samples[samples.length - 1].t - samples[0].t)
}

function representativeSample(
  samples: readonly GearSpeedCoachingSample[],
  kind: GearSpeedCoachingKind,
) {
  if (kind === 'low-rpm') {
    return samples.reduce((worst, sample) =>
      (sample.engineRpm ?? Infinity) < (worst.engineRpm ?? Infinity) ? sample : worst,
    )
  }
  return samples.reduce((worst, sample) =>
    (sample.engineRpm ?? -Infinity) > (worst.engineRpm ?? -Infinity) ? sample : worst,
  )
}

export function buildGearSpeedCoachingReport(
  samples: readonly GearSpeedCoachingSample[],
): GearSpeedCoachingReport {
  const {
    minimumSustainedSeconds,
    maximumSampleGapSeconds,
  } = DRIVING_RULES.manualTransmission.gearSpeedCoaching

  const classified = samples
    .map(classifySample)
    .filter((item): item is ClassifiedSample => item != null)
    .sort((a, b) => a.sample.t - b.sample.t)

  const segments: GearSpeedCoachingSegment[] = []
  let current: GearSpeedCoachingSample[] = []
  let currentKind: GearSpeedCoachingKind | null = null
  let currentGear = 0

  const flush = () => {
    if (currentKind == null || current.length === 0) {
      current = []
      currentKind = null
      currentGear = 0
      return
    }

    const durationSeconds = segmentDuration(current)
    if (durationSeconds >= minimumSustainedSeconds) {
      const representative = representativeSample(current, currentKind)
      segments.push({
        kind: currentKind,
        project: representative.project,
        gear: currentGear,
        startTime: current[0].t,
        endTime: current[current.length - 1].t,
        durationSeconds,
        representativeTime: representative.t,
        representativeSpeedKmh: Math.abs(representative.speed) * 3.6,
        representativeRpm: representative.engineRpm ?? 0,
      })
    }

    current = []
    currentKind = null
    currentGear = 0
  }

  let previous: ClassifiedSample | null = null
  for (const item of classified) {
    const gap = previous == null ? 0 : item.sample.t - previous.sample.t
    const mismatchKind = item.kind === 'matched' ? null : item.kind
    const continues =
      mismatchKind != null &&
      currentKind === mismatchKind &&
      currentGear === item.sample.gear &&
      previous != null &&
      gap >= 0 &&
      gap <= maximumSampleGapSeconds

    if (!continues) flush()

    if (mismatchKind != null) {
      if (current.length === 0) {
        currentKind = mismatchKind
        currentGear = item.sample.gear
      }
      current.push(item.sample)
    }

    previous = item
  }
  flush()

  let assessedSeconds = 0
  for (let index = 1; index < classified.length; index += 1) {
    const previousSample = classified[index - 1].sample
    const currentSample = classified[index].sample
    const gap = currentSample.t - previousSample.t
    if (gap >= 0 && gap <= maximumSampleGapSeconds) assessedSeconds += gap
  }

  const mismatchSeconds = segments.reduce(
    (sum, segment) => sum + segment.durationSeconds,
    0,
  )

  return {
    applicableSampleCount: classified.length,
    assessedSeconds,
    mismatchSeconds,
    segments,
  }
}
