import { DRIVING_RULES } from '../rules/drivingRules'

export type NightLightingCoachingKind =
  | 'meeting-high-beam'
  | 'following-high-beam'

export interface NightLightingCoachingSample {
  t: number
  project: string
  speed: number
  night?: boolean
  lowBeam?: boolean
  highBeam?: boolean
  leadVehicleId?: string
  leadGapMeters?: number
  leadTimeGapSeconds?: number
  oncomingVehicleId?: string
  oncomingDistanceMeters?: number
}

export interface NightLightingCoachingSegment {
  kind: NightLightingCoachingKind
  vehicleId: string
  startTime: number
  endTime: number
  durationSeconds: number
  representativeTime: number
  representativeSpeedKmh: number
  minimumOncomingDistanceMeters?: number
  minimumLeadTimeGapSeconds?: number
  minimumLeadGapMeters?: number
}

export interface NightLightingCoachingReport {
  observedSampleCount: number
  observedSeconds: number
  issueSeconds: number
  segments: NightLightingCoachingSegment[]
}

interface ContextMatch {
  kind: NightLightingCoachingKind
  vehicleId: string
}

function isObservedNightDriving(sample: NightLightingCoachingSample) {
  const minimumSpeedKmh =
    DRIVING_RULES.subject3.nightLightingCoaching.minimumSpeedKmh
  return (
    sample.project === 'subject3' &&
    sample.night === true &&
    Number.isFinite(sample.t) &&
    Number.isFinite(sample.speed) &&
    Math.abs(sample.speed) * 3.6 >= minimumSpeedKmh
  )
}

function contextMatches(
  sample: NightLightingCoachingSample,
): ContextMatch[] {
  if (!isObservedNightDriving(sample) || sample.highBeam !== true) return []

  const matches: ContextMatch[] = []
  const meetingDistance =
    DRIVING_RULES.subject3.nightLightingCoaching.meetingLowBeamDistanceMeters
  const followingReference =
    DRIVING_RULES.subject3.followingCoaching.referenceTimeGapSeconds

  if (
    typeof sample.oncomingVehicleId === 'string' &&
    sample.oncomingVehicleId.length > 0 &&
    sample.oncomingDistanceMeters != null &&
    Number.isFinite(sample.oncomingDistanceMeters) &&
    sample.oncomingDistanceMeters <= meetingDistance
  ) {
    matches.push({
      kind: 'meeting-high-beam',
      vehicleId: sample.oncomingVehicleId,
    })
  }

  if (
    typeof sample.leadVehicleId === 'string' &&
    sample.leadVehicleId.length > 0 &&
    sample.leadTimeGapSeconds != null &&
    Number.isFinite(sample.leadTimeGapSeconds) &&
    sample.leadTimeGapSeconds <= followingReference
  ) {
    matches.push({
      kind: 'following-high-beam',
      vehicleId: sample.leadVehicleId,
    })
  }

  return matches
}

function segmentDuration(samples: readonly NightLightingCoachingSample[]) {
  if (samples.length < 2) return 0
  return Math.max(0, samples[samples.length - 1].t - samples[0].t)
}

function representativeSample(
  samples: readonly NightLightingCoachingSample[],
  kind: NightLightingCoachingKind,
) {
  if (kind === 'meeting-high-beam') {
    return samples.reduce((worst, sample) =>
      (sample.oncomingDistanceMeters ?? Infinity) <
      (worst.oncomingDistanceMeters ?? Infinity)
        ? sample
        : worst,
    )
  }

  return samples.reduce((worst, sample) =>
    (sample.leadTimeGapSeconds ?? Infinity) <
    (worst.leadTimeGapSeconds ?? Infinity)
      ? sample
      : worst,
  )
}

function buildSegmentsForKind(
  sorted: readonly NightLightingCoachingSample[],
  kind: NightLightingCoachingKind,
) {
  const {
    minimumSustainedSeconds,
    maximumSampleGapSeconds,
  } = DRIVING_RULES.subject3.nightLightingCoaching

  const segments: NightLightingCoachingSegment[] = []
  let current: NightLightingCoachingSample[] = []
  let currentVehicleId: string | null = null
  let previous: NightLightingCoachingSample | null = null

  const flush = () => {
    if (current.length === 0 || currentVehicleId == null) {
      current = []
      currentVehicleId = null
      return
    }

    const durationSeconds = segmentDuration(current)
    if (durationSeconds >= minimumSustainedSeconds) {
      const representative = representativeSample(current, kind)
      const segment: NightLightingCoachingSegment = {
        kind,
        vehicleId: currentVehicleId,
        startTime: current[0].t,
        endTime: current[current.length - 1].t,
        durationSeconds,
        representativeTime: representative.t,
        representativeSpeedKmh: Math.abs(representative.speed) * 3.6,
      }

      if (kind === 'meeting-high-beam') {
        segment.minimumOncomingDistanceMeters = current.reduce(
          (minimum, sample) =>
            Math.min(minimum, sample.oncomingDistanceMeters ?? Infinity),
          Infinity,
        )
      } else {
        segment.minimumLeadTimeGapSeconds = current.reduce(
          (minimum, sample) =>
            Math.min(minimum, sample.leadTimeGapSeconds ?? Infinity),
          Infinity,
        )
        segment.minimumLeadGapMeters = current.reduce(
          (minimum, sample) =>
            Math.min(minimum, sample.leadGapMeters ?? Infinity),
          Infinity,
        )
        if (!Number.isFinite(segment.minimumLeadGapMeters)) {
          segment.minimumLeadGapMeters = undefined
        }
      }

      segments.push(segment)
    }

    current = []
    currentVehicleId = null
  }

  for (const sample of sorted) {
    const match = contextMatches(sample).find(item => item.kind === kind)
    if (!match) {
      flush()
      previous = sample
      continue
    }

    const gap = previous == null ? Infinity : sample.t - previous.t
    const continues =
      current.length > 0 &&
      currentVehicleId === match.vehicleId &&
      gap >= 0 &&
      gap <= maximumSampleGapSeconds

    if (!continues) flush()

    if (current.length === 0) currentVehicleId = match.vehicleId
    current.push(sample)
    previous = sample
  }
  flush()

  return segments
}

export function buildNightLightingCoachingReport(
  input: readonly NightLightingCoachingSample[],
): NightLightingCoachingReport {
  const sorted = input
    .filter(sample => Number.isFinite(sample.t))
    .slice()
    .sort((a, b) => a.t - b.t)

  const observed = sorted.filter(isObservedNightDriving)
  const maximumSampleGapSeconds =
    DRIVING_RULES.subject3.nightLightingCoaching.maximumSampleGapSeconds

  let observedSeconds = 0
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]
    const current = sorted[index]
    if (!isObservedNightDriving(previous) || !isObservedNightDriving(current)) {
      continue
    }
    const gap = current.t - previous.t
    if (gap >= 0 && gap <= maximumSampleGapSeconds) observedSeconds += gap
  }

  const segments = [
    ...buildSegmentsForKind(sorted, 'meeting-high-beam'),
    ...buildSegmentsForKind(sorted, 'following-high-beam'),
  ].sort((a, b) => a.startTime - b.startTime || a.kind.localeCompare(b.kind))

  return {
    observedSampleCount: observed.length,
    observedSeconds,
    issueSeconds: segments.reduce(
      (sum, segment) => sum + segment.durationSeconds,
      0,
    ),
    segments,
  }
}
