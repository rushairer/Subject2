import {
  buildCutInResponseCoachingReport,
  type CutInResponseCoachingSample,
} from '../coaching/cutInResponseCoaching'
import {
  buildPedestrianResponseCoachingReport,
  type PedestrianResponseCoachingSample,
} from '../coaching/pedestrianResponseCoaching'
import {
  buildSuddenBrakeCoachingReport,
  type SuddenBrakeCoachingSample,
} from '../coaching/suddenBrakeCoaching'
import type { DrivingDynamicsSample } from './drivingDynamicsTimeline'

export type DrivingDynamicsEventSample =
  DrivingDynamicsSample &
  SuddenBrakeCoachingSample &
  CutInResponseCoachingSample &
  PedestrianResponseCoachingSample

export type DrivingDynamicsEventKind =
  | 'sudden-brake'
  | 'cut-in'
  | 'pedestrian'

export interface DrivingDynamicsEventMarker {
  id: string
  kind: DrivingDynamicsEventKind
  label: string
  glyph: string
  t: number
  triggerTime: number
  project: string
  sampleIndex: number
  speedKmh: number
}

const EVENT_META: Record<
  DrivingDynamicsEventKind,
  { label: string; glyph: string }
> = {
  'sudden-brake': { label: '前车急刹', glyph: '急' },
  'cut-in': { label: '电动车加塞', glyph: '切' },
  pedestrian: { label: '行人横穿', glyph: '人' },
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
): DrivingDynamicsEventMarker | undefined {
  if (!Number.isFinite(t) || !Number.isFinite(triggerTime) || samples.length === 0) {
    return undefined
  }

  const sampleIndex = nearestSampleIndex(samples, t)
  const sample = samples[sampleIndex]
  const meta = EVENT_META[kind]

  return {
    id: `${kind}:${id}:${triggerTime.toFixed(3)}`,
    kind,
    label: meta.label,
    glyph: meta.glyph,
    t,
    triggerTime,
    project: sample.project,
    sampleIndex,
    speedKmh: Math.abs(sample.speed) * 3.6,
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
    )
    if (item) markers.push(item)
  }

  return markers.sort((a, b) => a.t - b.t || a.kind.localeCompare(b.kind))
}
