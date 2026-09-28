import {
  buildDrivingDynamicsEventContext,
} from './drivingDynamicsEventContext'
import {
  buildDrivingDynamicsReactionChain,
} from './drivingDynamicsReactionChain'
import type {
  DrivingDynamicsEventKind,
  DrivingDynamicsEventMarker,
  DrivingDynamicsEventSample,
} from './drivingDynamicsEvents'

export type DrivingDynamicsHazardKindFilter =
  | 'all'
  | DrivingDynamicsEventKind

export type DrivingDynamicsHazardEvidenceFilter =
  | 'all'
  | 'brake'
  | 'stop'
  | 'steering'
  | 'no-auto-response'

export interface DrivingDynamicsHazardFilter {
  kind: DrivingDynamicsHazardKindFilter
  evidence: DrivingDynamicsHazardEvidenceFilter
}

export interface DrivingDynamicsHazardFilterResult {
  events: DrivingDynamicsEventMarker[]
  total: number
  filtered: number
  active: boolean
}

export const DEFAULT_DRIVING_DYNAMICS_HAZARD_FILTER: DrivingDynamicsHazardFilter = {
  kind: 'all',
  evidence: 'all',
}

function finite(value: number | undefined): value is number {
  return value != null && Number.isFinite(value)
}

export function drivingDynamicsHazardFilterActive(
  filter: DrivingDynamicsHazardFilter,
) {
  return filter.kind !== 'all' || filter.evidence !== 'all'
}

function eventMatchesEvidence(
  samples: readonly DrivingDynamicsEventSample[],
  event: DrivingDynamicsEventMarker,
  evidence: DrivingDynamicsHazardEvidenceFilter,
) {
  if (evidence === 'all') return true
  if (evidence === 'brake') {
    return finite(event.response.brakeReactionSeconds)
  }
  if (evidence === 'stop') {
    return finite(event.response.stopReactionSeconds)
  }
  if (evidence === 'steering') {
    return finite(event.response.maximumSteeringWheelChangeTurns) &&
      event.response.maximumSteeringWheelChangeTurns >= 0.05
  }

  const context = buildDrivingDynamicsEventContext(samples, event)
  const chain = buildDrivingDynamicsReactionChain(context, event)
  return !chain.hasObservedResponse
}

export function filterDrivingDynamicsHazardEvents(
  samples: readonly DrivingDynamicsEventSample[],
  events: readonly DrivingDynamicsEventMarker[],
  filter: DrivingDynamicsHazardFilter,
): DrivingDynamicsHazardFilterResult {
  const filteredEvents = events.filter(event =>
    (filter.kind === 'all' || event.kind === filter.kind) &&
    eventMatchesEvidence(samples, event, filter.evidence),
  )

  return {
    events: filteredEvents,
    total: events.length,
    filtered: filteredEvents.length,
    active: drivingDynamicsHazardFilterActive(filter),
  }
}
