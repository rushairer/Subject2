import { LANE_WIDTH, projectToSubject3Route } from './subject3Route'
import type { Subject3TrafficState } from './subject3Traffic'

export const SUBJECT3_CUT_IN_OBSERVATION = {
  maximumAheadMeters: 45,
  maximumBehindMeters: 4,
  // Keep cut-in evidence visible while the candidate is stopped so coach
  // mode can hold position until the slower scooter has actually cleared.
  minimumPlayerSpeedMps: 0,
  conflictLateralToleranceMeters: LANE_WIDTH * 0.55,
} as const

export interface Subject3CutInObservation {
  hazardId: string
  progressDeltaMeters: number
  lateralDeltaMeters: number
  longitudinalSpeedMps: number
  lateralSpeedMps: number
  closingSpeedMps: number
  timeToLongitudinalMeetSeconds?: number
  conflict: boolean
}

export function observeSubject3CutInHazard(
  player: { x: number; z: number; speed: number },
  traffic: Readonly<Subject3TrafficState>,
): Subject3CutInObservation | undefined {
  const projection = projectToSubject3Route(player.x, player.z)
  let best: Subject3CutInObservation | undefined
  let bestDistance = Infinity

  for (const hazard of Object.values(traffic.hazards)) {
    if (hazard.kind !== 'cut-in-scooter' || !hazard.active) continue

    const progressDeltaMeters = hazard.progress - projection.progress
    if (
      progressDeltaMeters < -SUBJECT3_CUT_IN_OBSERVATION.maximumBehindMeters ||
      progressDeltaMeters > SUBJECT3_CUT_IN_OBSERVATION.maximumAheadMeters
    ) {
      continue
    }

    const lateralDeltaMeters = hazard.lateral - projection.lateral
    const distance = Math.hypot(progressDeltaMeters, lateralDeltaMeters)
    if (distance >= bestDistance) continue

    const closingSpeedMps = player.speed - hazard.longitudinalSpeedMps
    bestDistance = distance
    best = {
      hazardId: hazard.id,
      progressDeltaMeters,
      lateralDeltaMeters,
      longitudinalSpeedMps: hazard.longitudinalSpeedMps,
      lateralSpeedMps: hazard.lateralSpeedMps,
      closingSpeedMps,
      timeToLongitudinalMeetSeconds:
        progressDeltaMeters > 0 && closingSpeedMps > 0.1
          ? progressDeltaMeters / closingSpeedMps
          : undefined,
      conflict:
        hazard.conflict &&
        Math.abs(lateralDeltaMeters) <=
          SUBJECT3_CUT_IN_OBSERVATION.conflictLateralToleranceMeters,
    }
  }

  return best
}


export const SUBJECT3_PEDESTRIAN_OBSERVATION = {
  maximumAheadMeters: 60,
  maximumBehindMeters: 4,
} as const

export interface Subject3PedestrianObservation {
  hazardId: string
  progressDeltaMeters: number
  lateralDeltaMeters: number
  lateralSpeedMps: number
  planarDistanceMeters: number
  conflict: boolean
  timeToCrosswalkSeconds?: number
}

export function observeSubject3PedestrianHazard(
  player: { x: number; z: number; speed: number },
  traffic: Readonly<Subject3TrafficState>,
): Subject3PedestrianObservation | undefined {
  const projection = projectToSubject3Route(player.x, player.z)
  let best: Subject3PedestrianObservation | undefined
  let bestDistance = Infinity

  for (const hazard of Object.values(traffic.hazards)) {
    if (hazard.kind !== 'crosswalk-pedestrian' || !hazard.active) continue

    const progressDeltaMeters = hazard.progress - projection.progress
    if (
      progressDeltaMeters < -SUBJECT3_PEDESTRIAN_OBSERVATION.maximumBehindMeters ||
      progressDeltaMeters > SUBJECT3_PEDESTRIAN_OBSERVATION.maximumAheadMeters
    ) {
      continue
    }

    const lateralDeltaMeters = hazard.lateral - projection.lateral
    const planarDistanceMeters = Math.hypot(
      progressDeltaMeters,
      lateralDeltaMeters,
    )
    if (planarDistanceMeters >= bestDistance) continue

    bestDistance = planarDistanceMeters
    best = {
      hazardId: hazard.id,
      progressDeltaMeters,
      lateralDeltaMeters,
      lateralSpeedMps: hazard.lateralSpeedMps,
      planarDistanceMeters,
      conflict: hazard.conflict,
      timeToCrosswalkSeconds:
        progressDeltaMeters > 0 && player.speed > 0.1
          ? progressDeltaMeters / player.speed
          : undefined,
    }
  }

  return best
}
