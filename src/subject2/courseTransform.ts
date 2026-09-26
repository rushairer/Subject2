import {
  forwardFromHeading,
  normalizeHeadingDelta,
  rightFromHeading,
} from '../sim/vehicleFrame'

export interface XZPoint {
  x: number
  z: number
}

export interface CoursePose extends XZPoint {
  heading: number
}

export interface CoursePlacement extends CoursePose {}

export function localPointToWorld(point: XZPoint, placement: CoursePlacement): XZPoint {
  const right = rightFromHeading(placement.heading)
  const forward = forwardFromHeading(placement.heading)
  return {
    x: placement.x + right.x * point.x - forward.x * point.z,
    z: placement.z + right.z * point.x - forward.z * point.z,
  }
}

export function worldPointToLocal(point: XZPoint, placement: CoursePlacement): XZPoint {
  const dx = point.x - placement.x
  const dz = point.z - placement.z
  const right = rightFromHeading(placement.heading)
  const forward = forwardFromHeading(placement.heading)
  return {
    x: dx * right.x + dz * right.z,
    z: -(dx * forward.x + dz * forward.z),
  }
}

export function localPoseToWorld(pose: CoursePose, placement: CoursePlacement): CoursePose {
  return {
    ...localPointToWorld(pose, placement),
    heading: normalizeHeadingDelta(pose.heading + placement.heading),
  }
}

export function worldPoseToLocal(pose: CoursePose, placement: CoursePlacement): CoursePose {
  return {
    ...worldPointToLocal(pose, placement),
    heading: normalizeHeadingDelta(pose.heading - placement.heading),
  }
}

export function placementAligningLocalPose(
  localPose: CoursePose,
  worldPose: CoursePose,
): CoursePlacement {
  const heading = normalizeHeadingDelta(worldPose.heading - localPose.heading)
  const right = rightFromHeading(heading)
  const forward = forwardFromHeading(heading)
  return {
    x: worldPose.x - right.x * localPose.x + forward.x * localPose.z,
    z: worldPose.z - right.z * localPose.x + forward.z * localPose.z,
    heading,
  }
}
