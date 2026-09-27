import { TRAINING_CAR } from '../sim/vehicleDimensions'
import { LANE_WIDTH, projectToSubject3Route } from './subject3Route'
import {
  SUBJECT3_TRAFFIC_CAR,
  type Subject3TrafficState,
  type Subject3TrafficVehicleState,
} from './subject3Traffic'

export const SUBJECT3_LEAD_OBSERVATION = {
  sameLaneToleranceMeters: LANE_WIDTH * 0.42,
  maximumLookaheadMeters: 120,
  minimumPlayerSpeedMps: 0.25,
} as const

export interface Subject3LeadVehicleObservation {
  vehicleId: string
  centerDistanceMeters: number
  bumperGapMeters: number
  timeGapSeconds: number
  leadSpeedMps: number
  closingSpeedMps: number
  timeToCollisionSeconds?: number
}

export function observeSubject3LeadVehicle(
  player: { x: number; z: number; speed: number },
  traffic: Readonly<Subject3TrafficState>,
): Subject3LeadVehicleObservation | undefined {
  const playerSpeed = Math.abs(player.speed)
  if (playerSpeed < SUBJECT3_LEAD_OBSERVATION.minimumPlayerSpeedMps) return undefined

  const projection = projectToSubject3Route(player.x, player.z)
  let lead: Subject3TrafficVehicleState | undefined
  let leadCenterDistance = Infinity

  for (const vehicle of Object.values(traffic.vehicles)) {
    if (vehicle.opposite) continue
    if (
      Math.abs(vehicle.lateral - projection.lateral) >
      SUBJECT3_LEAD_OBSERVATION.sameLaneToleranceMeters
    ) {
      continue
    }

    const centerDistance = vehicle.progress - projection.progress
    if (
      centerDistance <= 0 ||
      centerDistance > SUBJECT3_LEAD_OBSERVATION.maximumLookaheadMeters ||
      centerDistance >= leadCenterDistance
    ) {
      continue
    }

    lead = vehicle
    leadCenterDistance = centerDistance
  }

  if (!lead) return undefined

  const bodyClearance =
    (TRAINING_CAR.lengthMeters + SUBJECT3_TRAFFIC_CAR.lengthMeters) / 2
  const bumperGapMeters = Math.max(0, leadCenterDistance - bodyClearance)
  const closingSpeedMps = playerSpeed - lead.speedMps
  const timeToCollisionSeconds =
    closingSpeedMps > 0.1
      ? bumperGapMeters / closingSpeedMps
      : undefined

  return {
    vehicleId: lead.id,
    centerDistanceMeters: leadCenterDistance,
    bumperGapMeters,
    timeGapSeconds: bumperGapMeters / playerSpeed,
    leadSpeedMps: lead.speedMps,
    closingSpeedMps,
    timeToCollisionSeconds,
  }
}
