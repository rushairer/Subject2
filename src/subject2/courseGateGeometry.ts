import { worldPointFromVehicle } from '../sim/vehicleFrame'
import type { CircleObstacle, VehiclePose } from '../sim/vehicleCollision'

/** The gate has two solid posts; its elevated crossbar is not a road barrier. */
export const COURSE_GATE_GEOMETRY = {
  postOffsetMeters: 2.25,
  postRadiusMeters: 0.09,
  postTopRadiusMeters: 0.07,
  postHeightMeters: 2.1,
  crossbarHeightMeters: 2.05,
  crossbarThicknessMeters: 0.12,
} as const

export interface CourseGatePost extends CircleObstacle {
  side: 'left' | 'right'
  localX: number
}

/** World-space posts share the exact canonical gate pose used by rendering. */
export function courseGatePosts(pose: VehiclePose): CourseGatePost[] {
  return ([-1, 1] as const).map(side => {
    const localX = side * COURSE_GATE_GEOMETRY.postOffsetMeters
    return {
      ...worldPointFromVehicle(pose.x, pose.z, pose.heading, 0, localX),
      radius: COURSE_GATE_GEOMETRY.postRadiusMeters,
      side: side < 0 ? 'left' : 'right',
      localX,
    }
  })
}
