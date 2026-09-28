import {
  buildCutInResponseCoachingReport,
  type CutInResponseCoachingEvent,
  type CutInResponseCoachingSample,
} from '../coaching/cutInResponseCoaching'
import {
  buildPedestrianResponseCoachingReport,
  type PedestrianResponseCoachingEvent,
  type PedestrianResponseCoachingSample,
} from '../coaching/pedestrianResponseCoaching'
import {
  buildSuddenBrakeCoachingReport,
  type SuddenBrakeCoachingEvent,
  type SuddenBrakeCoachingSample,
} from '../coaching/suddenBrakeCoaching'
import {
  drivingDynamicsEventId,
  type DrivingDynamicsEventKind,
} from './drivingDynamicsEventIdentity'
import type { DrivingDynamicsSample } from './drivingDynamicsTimeline'

export type DrivingDynamicsEventSample =
  DrivingDynamicsSample &
  SuddenBrakeCoachingSample &
  CutInResponseCoachingSample &
  PedestrianResponseCoachingSample

export type { DrivingDynamicsEventKind } from './drivingDynamicsEventIdentity'

export interface DrivingDynamicsEventResponseEvidence {
  throttleReleaseSeconds?: number
  brakeReactionSeconds?: number
  stopReactionSeconds?: number
  maximumBrake?: number
  maximumSteeringWheelChangeTurns?: number
}

export interface DrivingDynamicsEventMarker {
  id: string
  kind: DrivingDynamicsEventKind
  label: string
  glyph: string
  summary: string
  t: number
  triggerTime: number
  project: string
  sampleIndex: number
  speedKmh: number
  response: DrivingDynamicsEventResponseEvidence
}

export interface DrivingDynamicsEventSelection {
  event: DrivingDynamicsEventMarker | null
  index: number
  total: number
  previous: DrivingDynamicsEventMarker | null
  next: DrivingDynamicsEventMarker | null
}

const EVENT_META: Record<
  DrivingDynamicsEventKind,
  { label: string; glyph: string }
> = {
  'sudden-brake': { label: '前车急刹', glyph: '急' },
  'cut-in': { label: '电动车加塞', glyph: '切' },
  pedestrian: { label: '行人横穿', glyph: '人' },
}

function finite(value: number | undefined): value is number {
  return value != null && Number.isFinite(value)
}

function seconds(value: number) {
  return `${value.toFixed(1)} 秒`
}

function meters(value: number) {
  return `${value.toFixed(1)} m`
}

function suddenBrakeSummary(event: SuddenBrakeCoachingEvent) {
  const parts: string[] = []

  if (finite(event.minimumTimeGapSeconds)) {
    parts.push(`最小时距 ${seconds(event.minimumTimeGapSeconds)}`)
  } else {
    parts.push(`触发时距 ${seconds(event.triggerTimeGapSeconds)}`)
  }
  if (finite(event.minimumGapMeters)) {
    parts.push(`最近前车 ${meters(event.minimumGapMeters)}`)
  }
  parts.push(
    finite(event.brakeReactionSeconds)
      ? `制动反应 ${seconds(event.brakeReactionSeconds)}`
      : '未记录到明显制动反应',
  )

  return parts.join(' · ')
}

function cutInSummary(event: CutInResponseCoachingEvent) {
  const parts: string[] = []

  if (finite(event.minimumPlanarDistanceMeters)) {
    parts.push(`最近距离 ${meters(event.minimumPlanarDistanceMeters)}`)
  } else {
    parts.push(
      `切入位置 前后 ${meters(Math.abs(event.triggerAheadMeters))} · 横向 ${meters(Math.abs(event.triggerLateralMeters))}`,
    )
  }
  if (finite(event.throttleReleaseSeconds)) {
    parts.push(`松油门 ${seconds(event.throttleReleaseSeconds)}`)
  }
  parts.push(
    finite(event.brakeReactionSeconds)
      ? `制动反应 ${seconds(event.brakeReactionSeconds)}`
      : '未记录到明显制动反应',
  )

  return parts.join(' · ')
}

function pedestrianSummary(event: PedestrianResponseCoachingEvent) {
  const parts: string[] = []

  if (finite(event.minimumPlanarDistanceMeters)) {
    parts.push(`最近距离 ${meters(event.minimumPlanarDistanceMeters)}`)
  } else {
    parts.push(
      `进入冲突区 前后 ${meters(Math.abs(event.triggerAheadMeters))} · 横向 ${meters(Math.abs(event.triggerLateralMeters))}`,
    )
  }
  if (finite(event.stopReactionSeconds)) {
    parts.push(`停车反应 ${seconds(event.stopReactionSeconds)}`)
  } else {
    parts.push(`最低车速 ${(event.minimumSpeedMps * 3.6).toFixed(1)} km/h`)
  }
  if (finite(event.brakeReactionSeconds)) {
    parts.push(`制动反应 ${seconds(event.brakeReactionSeconds)}`)
  }

  return parts.join(' · ')
}

function nearestSampleIndex(
  samples: readonly DrivingDynamicsEventSample[],
  targetTime: number,
) {
  let bestIndex = 0
  let bestDistance = Infinity

  for (let index = 0; index < samples.length; index += 1) {
    const distance = Math.abs(samples[index].t - targetTime)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  }

  return bestIndex
}

function marker(
  samples: readonly DrivingDynamicsEventSample[],
  kind: DrivingDynamicsEventKind,
  id: string,
  t: number,
  triggerTime: number,
  summary: string,
  response: DrivingDynamicsEventResponseEvidence,
): DrivingDynamicsEventMarker | undefined {
  if (!Number.isFinite(t) || !Number.isFinite(triggerTime) || samples.length === 0) {
    return undefined
  }

  const sampleIndex = nearestSampleIndex(samples, t)
  const sample = samples[sampleIndex]
  const meta = EVENT_META[kind]

  return {
    id: drivingDynamicsEventId(kind, id, triggerTime),
    kind,
    label: meta.label,
    glyph: meta.glyph,
    summary,
    t,
    triggerTime,
    project: sample.project,
    sampleIndex,
    speedKmh: Math.abs(sample.speed) * 3.6,
    response,
  }
}

export function buildDrivingDynamicsEventMarkers(
  input: readonly DrivingDynamicsEventSample[],
): DrivingDynamicsEventMarker[] {
  const samples = input
    .filter(sample =>
      Number.isFinite(sample.t) &&
      Number.isFinite(sample.speed) &&
      Number.isFinite(sample.gear),
    )
    .slice()
    .sort((a, b) => a.t - b.t)

  if (samples.length === 0) return []

  const suddenBrake = buildSuddenBrakeCoachingReport(samples)
  const cutIn = buildCutInResponseCoachingReport(samples)
  const pedestrian = buildPedestrianResponseCoachingReport(samples)
  const markers: DrivingDynamicsEventMarker[] = []

  for (const event of suddenBrake.events) {
    const item = marker(
      samples,
      'sudden-brake',
      event.vehicleId,
      event.representativeTime,
      event.triggerTime,
      suddenBrakeSummary(event),
      {
        throttleReleaseSeconds: event.throttleReleaseSeconds,
        brakeReactionSeconds: event.brakeReactionSeconds,
        maximumBrake: event.maximumBrake,
      },
    )
    if (item) markers.push(item)
  }

  for (const event of cutIn.events) {
    const item = marker(
      samples,
      'cut-in',
      event.hazardId,
      event.representativeTime,
      event.triggerTime,
      cutInSummary(event),
      {
        throttleReleaseSeconds: event.throttleReleaseSeconds,
        brakeReactionSeconds: event.brakeReactionSeconds,
        maximumBrake: event.maximumBrake,
        maximumSteeringWheelChangeTurns:
          event.maximumSteeringWheelChangeRadians == null
            ? undefined
            : event.maximumSteeringWheelChangeRadians / (Math.PI * 2),
      },
    )
    if (item) markers.push(item)
  }

  for (const event of pedestrian.events) {
    const item = marker(
      samples,
      'pedestrian',
      event.hazardId,
      event.representativeTime,
      event.triggerTime,
      pedestrianSummary(event),
      {
        throttleReleaseSeconds: event.throttleReleaseSeconds,
        brakeReactionSeconds: event.brakeReactionSeconds,
        stopReactionSeconds: event.stopReactionSeconds,
        maximumBrake: event.maximumBrake,
      },
    )
    if (item) markers.push(item)
  }

  return markers.sort((a, b) => a.t - b.t || a.kind.localeCompare(b.kind))
}

export function drivingDynamicsEventSelection(
  events: readonly DrivingDynamicsEventMarker[],
  selectedEventId?: string | null,
): DrivingDynamicsEventSelection {
  if (events.length === 0) {
    return {
      event: null,
      index: -1,
      total: 0,
      previous: null,
      next: null,
    }
  }

  const selectedIndex = selectedEventId
    ? events.findIndex(event => event.id === selectedEventId)
    : -1
  const index = selectedIndex >= 0 ? selectedIndex : 0

  return {
    event: events[index],
    index,
    total: events.length,
    previous: index > 0 ? events[index - 1] : null,
    next: index < events.length - 1 ? events[index + 1] : null,
  }
}
