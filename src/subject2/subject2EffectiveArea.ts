import { polygonTouchesOutsideConvexUnion } from '../sim/planarGeometry'
import { orientedRectangleFootprint, vehicleBodyFootprint, type VehicleBodyPose } from '../sim/vehicleFootprint'
import { subject2Infraction } from '../rules/subject2Rules'
import { localPointToWorld } from './courseTransform'
import { SUBJECT2_START_POSES, type Subject2ProjectId } from './courseStartPoses'
import { SUBJECT2_GROUNDS, SUBJECT2_CONNECTION_ROAD_WIDTH } from './courseGroundGeometry'
import { SLOPE_GEOMETRY } from './SlopeStartCourse'
import {
  SUBJECT2_EXAM_PLACEMENTS,
  subject2ExamSequence,
  subject2ExamTransitions,
} from './subject2ExamLayout'

/** Outer playable surface, not a replacement for wheel-line/body-out judges. */
function localGround(project: Subject2ProjectId) {
  if (project === 'slope-start') {
    return orientedRectangleFootprint({
      x: 0, z: (SLOPE_GEOMETRY.roadStartZ + SLOPE_GEOMETRY.roadEndZ) / 2, heading: 0,
    }, SLOPE_GEOMETRY.roadStartZ - SLOPE_GEOMETRY.roadEndZ, SUBJECT2_GROUNDS[project].width)
  }
  const ground = SUBJECT2_GROUNDS[project]
  return orientedRectangleFootprint({ x: 0, z: 0, heading: 0 }, ground.length, ground.width)
}

const localAreas = Object.fromEntries(
  (Object.keys(SUBJECT2_GROUNDS) as Subject2ProjectId[]).map(project => [project, [
    localGround(project),
    // Some canonical starts put the rear over the terrain edge. That existing
    // spawn footprint is legal; it must not create an immediate false failure.
    vehicleBodyFootprint(SUBJECT2_START_POSES[project]),
  ]]),
) as Record<Subject2ProjectId, ReturnType<typeof localGround>[]>

function examArea(automatic: boolean) {
  const grounds = subject2ExamSequence(automatic).flatMap(project =>
    localAreas[project].map(region => region.map(point =>
      localPointToWorld(point, SUBJECT2_EXAM_PLACEMENTS[project]),
    )),
  )
  const connections = subject2ExamTransitions(automatic).map(({ start, end }) => {
    const dx = end.x - start.x
    const dz = end.z - start.z
    return orientedRectangleFootprint({
      x: (start.x + end.x) / 2,
      z: (start.z + end.z) / 2,
      heading: Math.atan2(dx, -dz),
    }, Math.hypot(dx, dz), SUBJECT2_CONNECTION_ROAD_WIDTH)
  })
  return [...grounds, ...connections]
}

const continuousAreas = { manual: examArea(false), automatic: examArea(true) }

/** Runs even before a maneuver starts and while its project judge is disabled. */
export function subject2EffectiveAreaInfraction(
  vehicle: VehicleBodyPose,
  project: Subject2ProjectId,
  continuous: boolean,
  automatic: boolean,
) {
  const regions = continuous
    ? continuousAreas[automatic ? 'automatic' : 'manual']
    : localAreas[project]
  return polygonTouchesOutsideConvexUnion(vehicleBodyFootprint(vehicle), regions)
    ? subject2Infraction('subject2-effective-area-exit')
    : undefined
}
