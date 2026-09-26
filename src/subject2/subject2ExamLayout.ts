import { TRAINING_CAR } from '../sim/vehicleDimensions'
import { CURVE_CENTERLINE } from './CurveDrivingCourse'
import { REVERSE_PARKING_GEOMETRY } from './ReverseParkingCourse'
import { RIGHT_ANGLE_GEOMETRY } from './RightAngleCourse'
import { SIDE_PARKING_GEOMETRY } from './SideParkingCourse'
import { SLOPE_GEOMETRY } from './SlopeStartCourse'
import {
  SUBJECT2_START_POSES,
  type Subject2ProjectId,
} from './courseStartPoses'
import {
  localPoseToWorld,
  placementAligningLocalPose,
  worldPoseToLocal,
  type CoursePlacement,
  type CoursePose,
} from './courseTransform'

export const SUBJECT2_C1_SEQUENCE: Subject2ProjectId[] = [
  'reverse-parking',
  'slope-start',
  'side-parking',
  'curve-driving',
  'right-angle',
]

export const SUBJECT2_C2_SEQUENCE: Subject2ProjectId[] = [
  'reverse-parking',
  'side-parking',
  'curve-driving',
  'right-angle',
]

const curveLast = CURVE_CENTERLINE.length - 1
const curvePrevious = CURVE_CENTERLINE[curveLast - 1]
const curveFinish = CURVE_CENTERLINE[curveLast]
const curveFinishHeading = Math.atan2(
  curveFinish.x - curvePrevious.x,
  -(curveFinish.z - curvePrevious.z),
)

export const SUBJECT2_LOCAL_EXIT_POSES: Record<Subject2ProjectId, CoursePose> = {
  'reverse-parking': {
    x: 0,
    z: REVERSE_PARKING_GEOMETRY.startControlZ - TRAINING_CAR.frontAxleFromCenterMeters + 0.15,
    heading: Math.PI,
  },
  'slope-start': {
    x: SUBJECT2_START_POSES['slope-start'].x,
    z: SLOPE_GEOMETRY.roadEndZ + 0.5,
    heading: 0,
  },
  'side-parking': {
    x: 0,
    z: SIDE_PARKING_GEOMETRY.exitCompleteZ - 0.05,
    heading: 0,
  },
  'curve-driving': {
    x: curveFinish.x,
    z: curveFinish.z,
    heading: curveFinishHeading,
  },
  'right-angle': {
    x: RIGHT_ANGLE_GEOMETRY.horizontalMinX + TRAINING_CAR.frontAxleFromCenterMeters + 0.15,
    z: RIGHT_ANGLE_GEOMETRY.cornerCenterZ,
    heading: -Math.PI / 2,
  },
}

const reverseWorldStart: CoursePose = { x: 0, z: 20, heading: 0 }
const slopeWorldStart: CoursePose = { x: 0, z: -15, heading: 0 }
const sideWorldStart: CoursePose = { x: 0, z: -65, heading: 0 }
const curveWorldStart: CoursePose = { x: 0, z: -100, heading: 0 }

const reversePlacement = placementAligningLocalPose(
  SUBJECT2_START_POSES['reverse-parking'],
  reverseWorldStart,
)
const slopePlacement = placementAligningLocalPose(
  SUBJECT2_START_POSES['slope-start'],
  slopeWorldStart,
)
const sidePlacement = placementAligningLocalPose(
  SUBJECT2_START_POSES['side-parking'],
  sideWorldStart,
)
const curvePlacement = placementAligningLocalPose(
  SUBJECT2_START_POSES['curve-driving'],
  curveWorldStart,
)

const curveWorldExit = localPoseToWorld(
  SUBJECT2_LOCAL_EXIT_POSES['curve-driving'],
  curvePlacement,
)
const rightAngleWorldStart: CoursePose = {
  x: curveWorldExit.x,
  z: curveWorldExit.z - 20,
  heading: 0,
}
const rightAnglePlacement = placementAligningLocalPose(
  SUBJECT2_START_POSES['right-angle'],
  rightAngleWorldStart,
)

export const SUBJECT2_EXAM_PLACEMENTS: Record<Subject2ProjectId, CoursePlacement> = {
  'reverse-parking': reversePlacement,
  'slope-start': slopePlacement,
  'side-parking': sidePlacement,
  'curve-driving': curvePlacement,
  'right-angle': rightAnglePlacement,
}

export function subject2ExamWorldStartPose(project: Subject2ProjectId): CoursePose {
  return localPoseToWorld(SUBJECT2_START_POSES[project], SUBJECT2_EXAM_PLACEMENTS[project])
}

export function subject2ExamWorldExitPose(project: Subject2ProjectId): CoursePose {
  return localPoseToWorld(SUBJECT2_LOCAL_EXIT_POSES[project], SUBJECT2_EXAM_PLACEMENTS[project])
}

export function subject2ExamLocalPose(project: Subject2ProjectId, worldPose: CoursePose): CoursePose {
  return worldPoseToLocal(worldPose, SUBJECT2_EXAM_PLACEMENTS[project])
}

export function subject2ExamSequence(automatic: boolean) {
  return automatic ? SUBJECT2_C2_SEQUENCE : SUBJECT2_C1_SEQUENCE
}

export interface Subject2Transition {
  from: Subject2ProjectId
  to: Subject2ProjectId
  start: CoursePose
  end: CoursePose
}

export function subject2ExamTransitions(automatic: boolean): Subject2Transition[] {
  const sequence = subject2ExamSequence(automatic)
  return sequence.slice(0, -1).map((from, index) => {
    const to = sequence[index + 1]
    return {
      from,
      to,
      start: subject2ExamWorldExitPose(from),
      end: subject2ExamWorldStartPose(to),
    }
  })
}
