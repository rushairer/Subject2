import {
  buildDrivingDynamicsEventContext,
} from './drivingDynamicsEventContext'
import type {
  DrivingDynamicsEventKind,
  DrivingDynamicsEventMarker,
  DrivingDynamicsEventSample,
} from './drivingDynamicsEvents'

export interface DrivingDynamicsHazardComparisonItem {
  id: string
  kind: DrivingDynamicsEventKind
  label: string
  glyph: string
  triggerTime: number
  triggerSpeedKmh?: number
  throttleReleaseSeconds?: number
  brakeReactionSeconds?: number
  stopReactionSeconds?: number
  minimumPostTriggerSpeedKmh?: number
  steeringChangeTurns?: number
}

export interface DrivingDynamicsHazardComparisonGroup {
  kind: DrivingDynamicsEventKind
  label: string
  glyph: string
  items: DrivingDynamicsHazardComparisonItem[]
}

const KIND_ORDER: DrivingDynamicsEventKind[] = [
  'sudden-brake',
  'cut-in',
  'pedestrian',
]

function finite(value: number | undefined): value is number {
  return value != null && Number.isFinite(value)
}

function minimumPostTriggerSpeedKmh(
  samples: ReturnType<typeof buildDrivingDynamicsEventContext>['samples'],
) {
  const post = samples.filter(sample => sample.relativeTime >= 0)
  if (post.length === 0) return undefined

  let minimum = post[0].speedKmh
  for (let index = 1; index < post.length; index += 1) {
    minimum = Math.min(minimum, post[index].speedKmh)
  }
  return minimum
}

function comparisonItem(
  samples: readonly DrivingDynamicsEventSample[],
  event: DrivingDynamicsEventMarker,
): DrivingDynamicsHazardComparisonItem {
  const context = buildDrivingDynamicsEventContext(samples, event)

  return {
    id: event.id,
    kind: event.kind,
    label: event.label,
    glyph: event.glyph,
    triggerTime: event.triggerTime,
    triggerSpeedKmh: context.triggerSample?.speedKmh,
    throttleReleaseSeconds: finite(event.response.throttleReleaseSeconds)
      ? event.response.throttleReleaseSeconds
      : undefined,
    brakeReactionSeconds: finite(event.response.brakeReactionSeconds)
      ? event.response.brakeReactionSeconds
      : undefined,
    stopReactionSeconds: finite(event.response.stopReactionSeconds)
      ? event.response.stopReactionSeconds
      : undefined,
    minimumPostTriggerSpeedKmh: minimumPostTriggerSpeedKmh(context.samples),
    steeringChangeTurns: finite(event.response.maximumSteeringWheelChangeTurns)
      ? event.response.maximumSteeringWheelChangeTurns
      : undefined,
  }
}

export function buildDrivingDynamicsHazardComparisons(
  samples: readonly DrivingDynamicsEventSample[],
  events: readonly DrivingDynamicsEventMarker[],
): DrivingDynamicsHazardComparisonGroup[] {
  const groups: DrivingDynamicsHazardComparisonGroup[] = []

  for (const kind of KIND_ORDER) {
    const peers = events
      .filter(event => event.kind === kind)
      .slice()
      .sort((a, b) =>
        a.triggerTime - b.triggerTime ||
        a.id.localeCompare(b.id),
      )

    if (peers.length < 2) continue

    groups.push({
      kind,
      label: peers[0].label,
      glyph: peers[0].glyph,
      items: peers.map(event => comparisonItem(samples, event)),
    })
  }

  return groups
}
