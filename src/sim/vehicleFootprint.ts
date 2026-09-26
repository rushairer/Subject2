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

export function vehicleBodyFootprint(
  vehicle: VehicleBodyPose,
): VehicleBodyFootprint {
  const halfLength = TRAINING_CAR.lengthMeters / 2
  const halfWidth = TRAINING_CAR.widthMeters / 2
  return [
    worldPointFromVehicle(
      vehicle.x,
      vehicle.z,
      vehicle.heading,
      halfLength,
      halfWidth,
    ),
    worldPointFromVehicle(
      vehicle.x,
      vehicle.z,
      vehicle.heading,
      halfLength,
      -halfWidth,
    ),
    worldPointFromVehicle(
      vehicle.x,
      vehicle.z,
      vehicle.heading,
      -halfLength,
      -halfWidth,
    ),
    worldPointFromVehicle(
      vehicle.x,
      vehicle.z,
      vehicle.heading,
      -halfLength,
      halfWidth,
    ),
  ]
}
