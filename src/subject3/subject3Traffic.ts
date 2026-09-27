import { convexPolygonsIntersect } from '../sim/planarGeometry'
import { resolveVehicleImpact, type CollisionMotion } from '../sim/collisionResponse'
import { forwardFromHeading, type XZVector } from '../sim/vehicleFrame'
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

export interface Subject3TrafficVehicleState {
  id: string
  progress: number
  lateral: number
  speedMps: number
  opposite: boolean
}

export interface Subject3TrafficState {
  crosswalkPedestrianConflict: boolean
  vehicles: Record<string, Subject3TrafficVehicleState>
}

export function createSubject3TrafficState(): Subject3TrafficState {
  return {
    crosswalkPedestrianConflict: false,
    vehicles: {},
  }
}

export function updateSubject3TrafficVehicle(
  state: Subject3TrafficState,
  id: string,
  progress: number,
  lateral: number,
  speedMps: number,
  opposite: boolean,
) {
  const current = state.vehicles[id]
  if (current) {
    current.progress = progress
    current.lateral = lateral
    current.speedMps = speedMps
    current.opposite = opposite
    return current
  }

  const next: Subject3TrafficVehicleState = {
    id,
    progress,
    lateral,
    speedMps,
    opposite,
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
