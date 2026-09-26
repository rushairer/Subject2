import { TRAINING_CAR } from './vehicleDimensions'
import { worldPointFromVehicle, type XZVector } from './vehicleFrame'

export interface VehicleBodyPose {
  x: number
  z: number
  heading: number
}

export type VehicleBodyFootprint = readonly [
  XZVector,
  XZVector,
  XZVector,
  XZVector,
]

export function orientedRectangleFootprint(
  pose: VehicleBodyPose,
  lengthMeters: number,
  widthMeters: number,
): VehicleBodyFootprint {
  const halfLength = lengthMeters / 2
  const halfWidth = widthMeters / 2
  return [
    worldPointFromVehicle(
      pose.x,
      pose.z,
      pose.heading,
      halfLength,
      halfWidth,
    ),
    worldPointFromVehicle(
      pose.x,
      pose.z,
      pose.heading,
      halfLength,
      -halfWidth,
    ),
    worldPointFromVehicle(
      pose.x,
      pose.z,
      pose.heading,
      -halfLength,
      -halfWidth,
    ),
    worldPointFromVehicle(
      pose.x,
      pose.z,
      pose.heading,
      -halfLength,
      halfWidth,
    ),
  ]
}

export function vehicleBodyFootprint(
  vehicle: VehicleBodyPose,
): VehicleBodyFootprint {
  return orientedRectangleFootprint(
    vehicle,
    TRAINING_CAR.lengthMeters,
    TRAINING_CAR.widthMeters,
  )
}
