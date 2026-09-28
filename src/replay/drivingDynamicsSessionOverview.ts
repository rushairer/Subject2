import type {
  DrivingDynamicsEventKind,
  DrivingDynamicsEventMarker,
} from './drivingDynamicsEvents'

export interface DrivingDynamicsSessionOverviewCounts {
  total: number
  suddenBrake: number
  cutIn: number
  pedestrian: number
  withThrottleRelease: number
  withBrakeResponse: number
  withStop: number
  withSteeringChange: number
}

export interface DrivingDynamicsSessionOverviewMarker {
  id: string
  kind: DrivingDynamicsEventKind
  label: string
  glyph: string
  triggerTime: number
  relativeTime: number
  ratio: number
}

export interface DrivingDynamicsSessionOverview {
  startTime: number
  endTime: number
  durationSeconds: number
  counts: DrivingDynamicsSessionOverviewCounts
  markers: DrivingDynamicsSessionOverviewMarker[]
}

function finite(value: number | undefined): value is number {
  return value != null && Number.isFinite(value)
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

export function buildDrivingDynamicsSessionOverview(
  events: readonly DrivingDynamicsEventMarker[],
  startTime: number,
  endTime: number,
): DrivingDynamicsSessionOverview {
  const safeStart = Number.isFinite(startTime) ? startTime : 0
  const safeEnd = Number.isFinite(endTime)
    ? Math.max(safeStart, endTime)
    : safeStart
  const durationSeconds = Math.max(0, safeEnd - safeStart)

  const counts: DrivingDynamicsSessionOverviewCounts = {
    total: events.length,
    suddenBrake: 0,
    cutIn: 0,
    pedestrian: 0,
    withThrottleRelease: 0,
    withBrakeResponse: 0,
    withStop: 0,
    withSteeringChange: 0,
  }

  for (const event of events) {
    if (event.kind === 'sudden-brake') counts.suddenBrake += 1
    if (event.kind === 'cut-in') counts.cutIn += 1
    if (event.kind === 'pedestrian') counts.pedestrian += 1

    if (finite(event.response.throttleReleaseSeconds)) {
      counts.withThrottleRelease += 1
    }
    if (finite(event.response.brakeReactionSeconds)) {
      counts.withBrakeResponse += 1
    }
    if (finite(event.response.stopReactionSeconds)) {
      counts.withStop += 1
    }
    if (
      finite(event.response.maximumSteeringWheelChangeTurns) &&
      event.response.maximumSteeringWheelChangeTurns >= 0.05
    ) {
      counts.withSteeringChange += 1
    }
  }

  const markers = events
    .filter(event => Number.isFinite(event.triggerTime))
    .map(event => {
      const relativeTime = event.triggerTime - safeStart
      const ratio = durationSeconds <= 0
        ? 0
        : clamp01(relativeTime / durationSeconds)

      return {
        id: event.id,
        kind: event.kind,
        label: event.label,
        glyph: event.glyph,
        triggerTime: event.triggerTime,
        relativeTime,
        ratio,
      }
    })
    .sort((a, b) =>
      a.triggerTime - b.triggerTime ||
      a.kind.localeCompare(b.kind) ||
      a.id.localeCompare(b.id),
    )

  return {
    startTime: safeStart,
    endTime: safeEnd,
    durationSeconds,
    counts,
    markers,
  }
}
