import { convexPolygonsIntersect } from '../sim/planarGeometry'
import { resolveVehicleImpact, type CollisionMotion } from '../sim/collisionResponse'
import { forwardFromHeading, rightFromHeading, type XZVector } from '../sim/vehicleFrame'
import {
  orientedRectangleFootprint,
  vehicleBodyFootprint,
  type VehicleBodyPose,
} from '../sim/vehicleFootprint'
import {
  CENTER_LINE_OFFSET,
  RIGHT_EDGE_OFFSET,
  projectToSubject3Route,
} from './subject3Route'

export const SUBJECT3_TRAFFIC_CAR = {
  lengthMeters: 4.25,
  widthMeters: 1.78,
} as const

export const SUBJECT3_OVERTAKE_TARGET_PROGRESS = 2140
export const SUBJECT3_OVERTAKE_TARGET_LATERAL = 0

export const SUBJECT3_CROSSWALK_PROGRESS = 2520
export const SUBJECT3_CROSSWALK_TRIGGER_PROGRESS = 2440
export const SUBJECT3_CROSSING_DURATION_SECONDS = 4.8
export const SUBJECT3_CROSSING_START_LATERAL = 3.4
export const SUBJECT3_CROSSING_END_LATERAL = -5.7

export const SUBJECT3_CUT_IN_SCOOTER = {
  triggerProgress: 1290,
  startProgress: 1385,
  longitudinalSpeedMps: 3.2,
  startLateral: 3.2,
  endLateral: -0.1,
  lateralDurationSeconds: 3.4,
} as const

export function subject3CutInScooterActive(
  triggered: boolean,
  stopped: boolean,
) {
  return triggered && !stopped
}

export function subject3CutInScooterRouteState(
  triggered: boolean,
  elapsedSeconds: number,
) {
  const elapsed = triggered ? Math.max(0, elapsedSeconds) : 0
  const lateralProgress = Math.max(
    0,
    Math.min(1, elapsed / SUBJECT3_CUT_IN_SCOOTER.lateralDurationSeconds),
  )
  return {
    progress:
      SUBJECT3_CUT_IN_SCOOTER.startProgress +
      SUBJECT3_CUT_IN_SCOOTER.longitudinalSpeedMps * elapsed,
    lateral:
      SUBJECT3_CUT_IN_SCOOTER.startLateral +
      (
        SUBJECT3_CUT_IN_SCOOTER.endLateral -
        SUBJECT3_CUT_IN_SCOOTER.startLateral
      ) * lateralProgress,
    longitudinalSpeedMps: triggered
      ? SUBJECT3_CUT_IN_SCOOTER.longitudinalSpeedMps
      : 0,
    lateralSpeedMps:
      triggered && lateralProgress < 1
        ? (
            SUBJECT3_CUT_IN_SCOOTER.endLateral -
            SUBJECT3_CUT_IN_SCOOTER.startLateral
          ) /
          SUBJECT3_CUT_IN_SCOOTER.lateralDurationSeconds
        : 0,
  }
}

export type Subject3TrafficVehicleScenario = 'sudden-brake'
export type Subject3TrafficHazardKind = 'cut-in-scooter' | 'crosswalk-pedestrian'

export interface Subject3TrafficVehicleState {
  id: string
  progress: number
  lateral: number
  speedMps: number
  opposite: boolean
  scenario?: Subject3TrafficVehicleScenario
}

export interface Subject3TrafficHazardState {
  id: string
  kind: Subject3TrafficHazardKind
  progress: number
  lateral: number
  longitudinalSpeedMps: number
  lateralSpeedMps: number
  active: boolean
  conflict: boolean
}

export interface Subject3TrafficState {
  crosswalkPedestrianConflict: boolean
  vehicles: Record<string, Subject3TrafficVehicleState>
  hazards: Record<string, Subject3TrafficHazardState>
}

export function createSubject3TrafficState(): Subject3TrafficState {
  return {
    crosswalkPedestrianConflict: false,
    vehicles: {},
    hazards: {},
  }
}

export function updateSubject3TrafficVehicle(
  state: Subject3TrafficState,
  id: string,
  progress: number,
  lateral: number,
  speedMps: number,
  opposite: boolean,
  scenario?: Subject3TrafficVehicleScenario,
) {
  const current = state.vehicles[id]
  if (current) {
    current.progress = progress
    current.lateral = lateral
    current.speedMps = speedMps
    current.opposite = opposite
    if (scenario) current.scenario = scenario
    else delete current.scenario
    return current
  }

  const next: Subject3TrafficVehicleState = {
    id,
    progress,
    lateral,
    speedMps,
    opposite,
    ...(scenario ? { scenario } : {}),
  }
  state.vehicles[id] = next
  return next
}

export function removeSubject3TrafficVehicle(
  state: Subject3TrafficState,
  id: string,
) {
  delete state.vehicles[id]
}

export function updateSubject3TrafficHazard(
  state: Subject3TrafficState,
  id: string,
  kind: Subject3TrafficHazardKind,
  progress: number,
  lateral: number,
  longitudinalSpeedMps: number,
  lateralSpeedMps: number,
  active: boolean,
  conflict: boolean,
) {
  const current = state.hazards[id]
  if (current) {
    current.kind = kind
    current.progress = progress
    current.lateral = lateral
    current.longitudinalSpeedMps = longitudinalSpeedMps
    current.lateralSpeedMps = lateralSpeedMps
    current.active = active
    current.conflict = conflict
    return current
  }

  const next: Subject3TrafficHazardState = {
    id,
    kind,
    progress,
    lateral,
    longitudinalSpeedMps,
    lateralSpeedMps,
    active,
    conflict,
  }
  state.hazards[id] = next
  return next
}

export function updateSubject3TrafficHazardFromWorld(
  state: Subject3TrafficState,
  id: string,
  kind: Subject3TrafficHazardKind,
  actor: { x: number; z: number },
  velocity: XZVector,
  active: boolean,
  conflict: boolean,
) {
  const projection = projectToSubject3Route(actor.x, actor.z)
  const routeForward = forwardFromHeading(projection.heading)
  const routeRight = rightFromHeading(projection.heading)
  return updateSubject3TrafficHazard(
    state,
    id,
    kind,
    projection.progress,
    projection.lateral,
    velocity.x * routeForward.x + velocity.z * routeForward.z,
    velocity.x * routeRight.x + velocity.z * routeRight.z,
    active,
    conflict,
  )
}

export function removeSubject3TrafficHazard(
  state: Subject3TrafficState,
  id: string,
) {
  delete state.hazards[id]
}

/** Publish the same displaced world pose and velocity used by physical actors. */
export function updateSubject3TrafficAfterImpact(
  state: Subject3TrafficState,
  id: string,
  base: VehicleBodyPose,
  motion: CollisionMotion,
  opposite: boolean,
) {
  const projection = projectToSubject3Route(base.x + motion.offsetX, base.z + motion.offsetZ)
  const routeForward = forwardFromHeading(projection.heading)
  const signedSpeed = motion.velocityX * routeForward.x + motion.velocityZ * routeForward.z
  return updateSubject3TrafficVehicle(
    state,
    id,
    projection.progress,
    projection.lateral,
    Math.abs(signedSpeed),
    signedSpeed < -0.05 ? true : signedSpeed > 0.05 ? false : opposite,
  )
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

export function subject3VehicleCollision(
  player: VehicleBodyPose,
  actor: VehicleBodyPose,
) {
  return convexPolygonsIntersect(
    vehicleBodyFootprint(player),
    orientedRectangleFootprint(
      actor,
      SUBJECT3_TRAFFIC_CAR.lengthMeters,
      SUBJECT3_TRAFFIC_CAR.widthMeters,
    ),
  )
}

/** Subject 3 supplies actor dimensions; all physical response belongs to the shared engine. */
export function resolveSubject3VehicleCollision(
  player: { x: number; z: number; heading: number; speed: number },
  actor: VehicleBodyPose,
  actorVelocity?: XZVector,
) {
  return resolveVehicleImpact(player, actor, SUBJECT3_TRAFFIC_CAR, actorVelocity)
}
