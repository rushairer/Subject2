import {
  CENTER_LINE_OFFSET,
  RIGHT_EDGE_OFFSET,
} from './subject3Route'

export const SUBJECT3_OVERTAKE_TARGET_PROGRESS = 2140
export const SUBJECT3_OVERTAKE_TARGET_LATERAL = 0

export const SUBJECT3_CROSSWALK_PROGRESS = 2520
export const SUBJECT3_CROSSWALK_TRIGGER_PROGRESS = 2440
export const SUBJECT3_CROSSING_DURATION_SECONDS = 4.8
export const SUBJECT3_CROSSING_START_LATERAL = 3.4
export const SUBJECT3_CROSSING_END_LATERAL = -5.7

export interface Subject3TrafficState {
  crosswalkPedestrianConflict: boolean
}

export function createSubject3TrafficState(): Subject3TrafficState {
  return {
    crosswalkPedestrianConflict: false,
  }
}

export function crossingPedestrianMotion(
  triggered: boolean,
  elapsedSeconds: number,
) {
  const t = triggered
    ? Math.max(0, Math.min(1, elapsedSeconds / SUBJECT3_CROSSING_DURATION_SECONDS))
    : 0
  const lateral =
    SUBJECT3_CROSSING_START_LATERAL +
    (SUBJECT3_CROSSING_END_LATERAL - SUBJECT3_CROSSING_START_LATERAL) * t
  const conflict =
    triggered &&
    lateral <= RIGHT_EDGE_OFFSET &&
    lateral >= CENTER_LINE_OFFSET

  return {
    progress: SUBJECT3_CROSSWALK_PROGRESS,
    lateral,
    conflict,
  }
}


export function subject3TrafficCollision(
  player: { x: number; z: number },
  actor: { x: number; z: number },
  radiusMeters = 2.6,
) {
  return Math.hypot(player.x - actor.x, player.z - actor.z) < radiusMeters
}
