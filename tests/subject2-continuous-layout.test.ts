import assert from 'node:assert/strict'
import test from 'node:test'
import { createCurveRuntime, updateCurveDriving } from '../src/subject2/CurveDrivingCourse'
import { createRightAngleRuntime, updateRightAngle } from '../src/subject2/RightAngleCourse'
import { createSideParkingRuntime, updateSideParking } from '../src/subject2/SideParkingCourse'
import { createSlopeRuntime, updateSlopeStart } from '../src/subject2/SlopeStartCourse'
import { SUBJECT2_START_POSES } from '../src/subject2/courseStartPoses'
import {
  localPoseToWorld,
  placementAligningLocalPose,
  worldPoseToLocal,
  type CoursePose,
} from '../src/subject2/courseTransform'
import {
  SUBJECT2_C1_SEQUENCE,
  SUBJECT2_EXAM_PLACEMENTS,
  subject2ExamDistanceToStart,
  subject2ExamLocalPose,
  subject2ExamLocalVehicle,
  subject2ExamTransitions,
  subject2ExamWorldExitPose,
  subject2ExamWorldStartPose,
} from '../src/subject2/subject2ExamLayout'

const near = (actual: number, expected: number, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`)

function nearPose(actual: CoursePose, expected: CoursePose, epsilon = 1e-9) {
  near(actual.x, expected.x, epsilon)
  near(actual.z, expected.z, epsilon)
  near(actual.heading, expected.heading, epsilon)
}

test('course local/world pose transforms round-trip position and heading', () => {
  const local = { x: 3.2, z: -4.1, heading: 0.7 }
  const target = { x: 18, z: -27, heading: -1.1 }
  const placement = placementAligningLocalPose(local, target)

  nearPose(localPoseToWorld(local, placement), target)
  nearPose(worldPoseToLocal(target, placement), local)
})

test('continuous layout maps every canonical project start back to its local frame', () => {
  for (const project of SUBJECT2_C1_SEQUENCE) {
    const world = subject2ExamWorldStartPose(project)
    const local = subject2ExamLocalPose(project, world)
    nearPose(local, SUBJECT2_START_POSES[project], 1e-8)

    const direct = localPoseToWorld(
      SUBJECT2_START_POSES[project],
      SUBJECT2_EXAM_PLACEMENTS[project],
    )
    nearPose(world, direct, 1e-8)
  }
})

test('continuous layout starts with a forward-facing reverse-parking entry', () => {
  const start = subject2ExamWorldStartPose('reverse-parking')
  near(start.x, 0)
  near(start.z, 20)
  near(start.heading, 0)
})

test('continuous entry distance is zero at the canonical project start', () => {
  for (const project of SUBJECT2_C1_SEQUENCE) {
    const start = subject2ExamWorldStartPose(project)
    near(subject2ExamDistanceToStart(project, start), 0)
  }
})

test('continuous entry distance matches each transition endpoint distance', () => {
  for (const transition of subject2ExamTransitions(false)) {
    const expected = Math.hypot(
      transition.end.x - transition.start.x,
      transition.end.z - transition.start.z,
    )
    near(subject2ExamDistanceToStart(transition.to, transition.start), expected, 1e-8)
  }
})

test('continuous C1 transitions connect each project exit to the next project entry', () => {
  const transitions = subject2ExamTransitions(false)
  assert.equal(transitions.length, SUBJECT2_C1_SEQUENCE.length - 1)

  transitions.forEach((transition, index) => {
    assert.equal(transition.from, SUBJECT2_C1_SEQUENCE[index])
    assert.equal(transition.to, SUBJECT2_C1_SEQUENCE[index + 1])
    nearPose(transition.start, subject2ExamWorldExitPose(transition.from), 1e-8)
    nearPose(transition.end, subject2ExamWorldStartPose(transition.to), 1e-8)
    assert.ok(
      Math.hypot(
        transition.end.x - transition.start.x,
        transition.end.z - transition.start.z,
      ) > 5,
      `${transition.from} -> ${transition.to} transition must have usable driving distance`,
    )
  })
})


test('side-parking judging remains dormant on the transition road before its entrance', () => {
  const start = subject2ExamWorldStartPose('side-parking')
  const local = subject2ExamLocalPose('side-parking', {
    x: start.x,
    z: start.z + 15,
    heading: start.heading,
  })

  const result = updateSideParking({
    ...local,
    speed: -0.5,
    gear: -1,
    engineOn: true,
    leftIndicator: false,
  }, createSideParkingRuntime(), 0.1)

  assert.equal(result.runtime.entered, false)
  assert.equal(result.runtime.started, false)
  assert.equal(result.runtime.phase, 'approach')
  assert.equal(result.infractions.length, 0)
})

test('side-parking judging activates at the canonical entry lane', () => {
  const start = SUBJECT2_START_POSES['side-parking']
  const result = updateSideParking({
    ...start,
    speed: 0.5,
    gear: 1,
    engineOn: true,
    leftIndicator: false,
  }, createSideParkingRuntime(), 0.1)

  assert.equal(result.runtime.entered, true)
  assert.equal(result.runtime.started, false)
  assert.equal(result.infractions.length, 0)
})

test('slope judging remains dormant on the transition road before its entrance', () => {
  const start = subject2ExamWorldStartPose('slope-start')
  const local = subject2ExamLocalPose('slope-start', {
    x: start.x,
    z: start.z + 15,
    heading: start.heading,
  })

  const result = updateSlopeStart({
    ...local,
    speed: 0.5,
    engineOn: true,
    handbrake: false,
  }, createSlopeRuntime(), 0.1)

  assert.equal(result.runtime.entered, false)
  assert.equal(result.runtime.phase, 'approach')
  assert.equal(result.infractions.length, 0)
})

test('slope judging activates on the canonical approach road', () => {
  const start = SUBJECT2_START_POSES['slope-start']
  const result = updateSlopeStart({
    ...start,
    speed: 0.5,
    engineOn: true,
    handbrake: false,
  }, createSlopeRuntime(), 0.1)

  assert.equal(result.runtime.entered, true)
  assert.equal(result.runtime.phase, 'approach')
  assert.equal(result.infractions.length, 0)
})

test('curve judging remains dormant on the transition road before its entrance', () => {
  const start = subject2ExamWorldStartPose('curve-driving')
  const local = subject2ExamLocalPose('curve-driving', {
    x: start.x,
    z: start.z + 15,
    heading: start.heading,
  })

  const result = updateCurveDriving({
    ...local,
    speed: 0.5,
    engineOn: true,
  }, createCurveRuntime(), 0.1)

  assert.equal(result.runtime.started, false)
  assert.equal(result.infractions.length, 0)
})

test('right-angle judging remains dormant before the entry lane', () => {
  const start = subject2ExamWorldStartPose('right-angle')
  const local = subject2ExamLocalPose('right-angle', {
    x: start.x,
    z: start.z + 15,
    heading: start.heading,
  })

  const result = updateRightAngle({
    ...local,
    speed: 0.5,
    engineOn: true,
    leftIndicator: false,
  }, createRightAngleRuntime(), 0.1)

  assert.equal(result.runtime.entered, false)
  assert.equal(result.runtime.phase, 'approach')
  assert.equal(result.infractions.length, 0)
})

test('right-angle judging activates once the vehicle reaches the canonical entry', () => {
  const start = SUBJECT2_START_POSES['right-angle']
  const result = updateRightAngle({
    ...start,
    speed: 0.5,
    engineOn: true,
    leftIndicator: true,
  }, createRightAngleRuntime(), 0.1)

  assert.equal(result.runtime.entered, true)
  assert.equal(result.runtime.phase, 'approach')
  assert.equal(result.infractions.length, 0)
})


test('continuous local vehicle conversion preserves drivetrain state', () => {
  const worldStart = subject2ExamWorldStartPose('reverse-parking')
  const worldVehicle = {
    ...worldStart,
    speed: 1.25,
    gear: 1,
    steering: 0.18,
    engineOn: true,
    handbrake: false,
  }

  const local = subject2ExamLocalVehicle('reverse-parking', worldVehicle)

  nearPose(local, SUBJECT2_START_POSES['reverse-parking'], 1e-8)
  assert.equal(local.speed, worldVehicle.speed)
  assert.equal(local.gear, worldVehicle.gear)
  assert.equal(local.steering, worldVehicle.steering)
  assert.equal(local.engineOn, worldVehicle.engineOn)
  assert.equal(local.handbrake, worldVehicle.handbrake)
})
