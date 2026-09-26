import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createExamProgress,
  enterExamProject,
  completeExamProject,
  advanceExamProgress,
  isExamComplete,
} from '../src/session/examProgress'
import {
  CURVE_CENTERLINE,
  createCurveRuntime,
  updateCurveDriving,
} from '../src/subject2/CurveDrivingCourse'
import {
  REVERSE_PARKING_GEOMETRY,
  createReverseParkingRuntime,
  updateReverseParking,
} from '../src/subject2/ReverseParkingCourse'
import {
  createRightAngleRuntime,
  updateRightAngle,
} from '../src/subject2/RightAngleCourse'
import {
  SIDE_PARKING_GEOMETRY,
  createSideParkingRuntime,
  updateSideParking,
} from '../src/subject2/SideParkingCourse'
import {
  SLOPE_GEOMETRY,
  createSlopeRuntime,
  updateSlopeStart,
} from '../src/subject2/SlopeStartCourse'
import {
  SUBJECT2_EXAM_PLACEMENTS,
  subject2ExamDistanceToStart,
  subject2ExamLocalVehicle,
  subject2ExamSequence,
  subject2ExamWorldStartPose,
} from '../src/subject2/subject2ExamLayout'
import { localPoseToWorld, type CoursePose } from '../src/subject2/courseTransform'
import type { Subject2ProjectId } from '../src/subject2/courseStartPoses'

type BaseVehicle = CoursePose & {
  speed: number
  engineOn: boolean
}

function asWorld<T extends BaseVehicle>(project: Subject2ProjectId, local: T): T {
  return {
    ...local,
    ...localPoseToWorld(local, SUBJECT2_EXAM_PLACEMENTS[project]),
  }
}

function localAgain<T extends BaseVehicle>(project: Subject2ProjectId, local: T): T {
  return subject2ExamLocalVehicle(project, asWorld(project, local))
}

function assertClean(result: { infractions: Array<{ id: string }> }) {
  assert.deepEqual(result.infractions, [])
}

function curveHeading(index: number) {
  const current = CURVE_CENTERLINE[index]
  const next = CURVE_CENTERLINE[Math.min(index + 1, CURVE_CENTERLINE.length - 1)]
  return Math.atan2(next.x - current.x, -(next.z - current.z))
}

function completeReverseParking() {
  const project: Subject2ProjectId = 'reverse-parking'
  const g = REVERSE_PARKING_GEOMETRY
  const bayX = (g.bayMouthX + g.bayBackX) / 2
  let runtime = createReverseParkingRuntime()

  let result = updateReverseParking(localAgain(project, {
    x: 0, z: 6.6, heading: Math.PI,
    speed: -0.5, gear: -1, engineOn: true,
  }), runtime, 0.1)
  runtime = result.runtime
  assertClean(result)

  for (let i = 0; i < 2; i++) {
    result = updateReverseParking(localAgain(project, {
      x: bayX, z: 0, heading: Math.PI / 2,
      speed: 0, gear: -1, engineOn: true,
    }), runtime, 0.2)
    runtime = result.runtime
    assertClean(result)
  }

  result = updateReverseParking(localAgain(project, {
    x: bayX, z: 0, heading: Math.PI / 2,
    speed: 0.5, gear: 1, engineOn: true,
  }), runtime, 0.1)
  runtime = result.runtime
  assertClean(result)

  result = updateReverseParking(localAgain(project, {
    x: 0, z: -9.2, heading: 0,
    speed: 0.5, gear: 1, engineOn: true,
  }), runtime, 0.1)
  runtime = result.runtime
  assertClean(result)

  result = updateReverseParking(localAgain(project, {
    x: 0, z: -9.2, heading: 0,
    speed: -0.5, gear: -1, engineOn: true,
  }), runtime, 0.1)
  runtime = result.runtime
  assertClean(result)

  for (let i = 0; i < 2; i++) {
    result = updateReverseParking(localAgain(project, {
      x: bayX, z: 0, heading: -Math.PI / 2,
      speed: 0, gear: -1, engineOn: true,
    }), runtime, 0.2)
    runtime = result.runtime
    assertClean(result)
  }

  result = updateReverseParking(localAgain(project, {
    x: bayX, z: 0, heading: -Math.PI / 2,
    speed: 0.5, gear: 1, engineOn: true,
  }), runtime, 0.1)
  runtime = result.runtime
  assertClean(result)

  result = updateReverseParking(localAgain(project, {
    x: 0, z: 6.6, heading: Math.PI,
    speed: 0.5, gear: 1, engineOn: true,
  }), runtime, 0.1)
  assertClean(result)
  return result.runtime.completed
}

function completeSideParking() {
  const project: Subject2ProjectId = 'side-parking'
  const g = SIDE_PARKING_GEOMETRY
  const bayX = (g.bayMouthX + g.bayBackX) / 2
  let runtime = createSideParkingRuntime()

  let result = updateSideParking(localAgain(project, {
    x: 0, z: 8.2, heading: 0,
    speed: -0.5, gear: -1, engineOn: true, leftIndicator: false,
  }), runtime, 0.1)
  runtime = result.runtime
  assertClean(result)

  for (let i = 0; i < 2; i++) {
    result = updateSideParking(localAgain(project, {
      x: bayX, z: 0, heading: 0,
      speed: 0, gear: -1, engineOn: true, leftIndicator: false,
    }), runtime, 0.2)
    runtime = result.runtime
    assertClean(result)
  }

  result = updateSideParking(localAgain(project, {
    x: bayX, z: 0, heading: 0,
    speed: 0.5, gear: 1, engineOn: true, leftIndicator: true,
  }), runtime, 0.1)
  runtime = result.runtime
  assertClean(result)

  result = updateSideParking(localAgain(project, {
    x: 0, z: g.exitCompleteZ - 0.05, heading: 0,
    speed: 0.5, gear: 1, engineOn: true, leftIndicator: false,
  }), runtime, 0.1)
  assertClean(result)
  return result.runtime.completed
}

function completeSlopeStart() {
  const project: Subject2ProjectId = 'slope-start'
  let runtime = createSlopeRuntime()

  let result = updateSlopeStart(localAgain(project, {
    x: 0.4, z: 6.5, heading: 0,
    speed: 0.5, engineOn: true, handbrake: false,
  }), runtime, 0.1)
  runtime = result.runtime
  assertClean(result)

  result = updateSlopeStart(localAgain(project, {
    x: 0.4, z: 1.6, heading: 0,
    speed: 0, engineOn: true, handbrake: true,
  }), runtime, 0.5)
  runtime = result.runtime
  assertClean(result)

  result = updateSlopeStart(localAgain(project, {
    x: 0.4, z: 1.6, heading: 0,
    speed: 0, engineOn: true, handbrake: true,
  }), runtime, 0.3)
  runtime = result.runtime
  assertClean(result)

  result = updateSlopeStart(localAgain(project, {
    x: 0.4, z: 1.5, heading: 0,
    speed: 0.5, engineOn: true, handbrake: false,
  }), runtime, 0.1)
  runtime = result.runtime
  assertClean(result)

  result = updateSlopeStart(localAgain(project, {
    x: 0.4, z: SLOPE_GEOMETRY.roadEndZ + 0.5, heading: 0,
    speed: 0.5, engineOn: true, handbrake: false,
  }), runtime, 0.1)
  assertClean(result)
  return result.runtime.completed
}

function completeCurveDriving() {
  const project: Subject2ProjectId = 'curve-driving'
  let runtime = createCurveRuntime()
  const start = CURVE_CENTERLINE[0]

  let result = updateCurveDriving(localAgain(project, {
    x: start.x, z: start.z, heading: curveHeading(0),
    speed: 0.5, engineOn: true,
  }), runtime, 0.1)
  runtime = result.runtime
  assertClean(result)

  const finishIndex = CURVE_CENTERLINE.length - 4
  const finish = CURVE_CENTERLINE[finishIndex]
  result = updateCurveDriving(localAgain(project, {
    x: finish.x, z: finish.z, heading: curveHeading(finishIndex),
    speed: 0.5, engineOn: true,
  }), runtime, 0.1)
  assertClean(result)
  return result.runtime.completed
}

function completeRightAngle() {
  const project: Subject2ProjectId = 'right-angle'
  let runtime = createRightAngleRuntime()

  let result = updateRightAngle(localAgain(project, {
    x: 0, z: 0, heading: -0.2,
    speed: 0.5, engineOn: true, leftIndicator: true,
  }), runtime, 0.1)
  runtime = result.runtime
  assertClean(result)

  result = updateRightAngle(localAgain(project, {
    x: -3, z: -3.6, heading: -Math.PI / 2,
    speed: 0.5, engineOn: true, leftIndicator: true,
  }), runtime, 0.1)
  runtime = result.runtime
  assertClean(result)

  result = updateRightAngle(localAgain(project, {
    x: -4.5, z: -3.6, heading: -Math.PI / 2,
    speed: 0.5, engineOn: true, leftIndicator: false,
  }), runtime, 0.1)
  runtime = result.runtime
  assertClean(result)

  result = updateRightAngle(localAgain(project, {
    x: -7.21, z: -3.6, heading: -Math.PI / 2,
    speed: 0.5, engineOn: true, leftIndicator: false,
  }), runtime, 0.1)
  assertClean(result)
  return result.runtime.completed
}

function completeProject(project: Subject2ProjectId) {
  switch (project) {
    case 'reverse-parking': return completeReverseParking()
    case 'side-parking': return completeSideParking()
    case 'slope-start': return completeSlopeStart()
    case 'curve-driving': return completeCurveDriving()
    case 'right-angle': return completeRightAngle()
  }
}

for (const automatic of [false, true]) {
  test(`${automatic ? 'C2' : 'C1'} continuous exam survives world/local transforms and completes every applicable judge`, () => {
    const sequence = subject2ExamSequence(automatic)
    let progress = createExamProgress(sequence[0], true)
    const visited: Subject2ProjectId[] = []

    for (let index = 0; index < sequence.length; index++) {
      const project = sequence[index]
      assert.equal(progress.project, project)
      assert.equal(progress.entered, true)
      assert.equal(progress.completed, false)

      visited.push(project)
      assert.equal(completeProject(project), true)
      progress = completeExamProject(progress, project)

      if (index === sequence.length - 1) break

      progress = advanceExamProgress(progress, sequence)
      const next = sequence[index + 1]
      assert.equal(progress.project, next)
      assert.equal(progress.entered, false)
      assert.equal(progress.completed, false)

      const nextStart = subject2ExamWorldStartPose(next)
      assert.equal(subject2ExamDistanceToStart(next, nextStart), 0)
      progress = enterExamProject(progress, next)
    }

    assert.deepEqual(visited, sequence)
    assert.equal(isExamComplete(progress, sequence), true)
    assert.equal(visited.includes('slope-start'), !automatic)
  })
}
