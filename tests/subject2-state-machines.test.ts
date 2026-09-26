import assert from 'node:assert/strict'
import test from 'node:test'
import {
  REVERSE_PARKING_GEOMETRY,
  createReverseParkingRuntime,
  updateReverseParking,
  type ReverseParkingRuntime,
} from '../src/subject2/ReverseParkingCourse'
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
  CURVE_CENTERLINE,
  CURVE_DRIVING,
  createCurveRuntime,
  updateCurveDriving,
} from '../src/subject2/CurveDrivingCourse'
import {
  RIGHT_ANGLE_GEOMETRY,
  createRightAngleRuntime,
  updateRightAngle,
} from '../src/subject2/RightAngleCourse'

function hasInfraction(result: { infractions: Array<{ id: string }> }, id: string) {
  return result.infractions.some(item => item.id === id)
}

function curveHeading(index: number) {
  const current = CURVE_CENTERLINE[index]
  const next = CURVE_CENTERLINE[Math.min(index + 1, CURVE_CENTERLINE.length - 1)]
  return Math.atan2(next.x - current.x, -(next.z - current.z))
}

test('reverse parking completes the canonical two-bay state sequence without penalties', () => {
  const g = REVERSE_PARKING_GEOMETRY
  let runtime: ReverseParkingRuntime = createReverseParkingRuntime()

  let result = updateReverseParking({
    x: 0,
    z: 6.6,
    heading: Math.PI,
    speed: -0.5,
    gear: -1,
    engineOn: true,
  }, runtime, 0.1)
  runtime = result.runtime
  assert.equal(runtime.phase, 'first-reverse')
  assert.equal(runtime.firstControlPassed, true)
  assert.equal(result.infractions.length, 0)

  const bayX = (g.bayMouthX + g.bayBackX) / 2
  for (let i = 0; i < 2; i++) {
    result = updateReverseParking({
      x: bayX,
      z: 0,
      heading: Math.PI / 2,
      speed: 0,
      gear: -1,
      engineOn: true,
    }, runtime, 0.2)
    runtime = result.runtime
    assert.equal(result.infractions.length, 0)
  }
  assert.equal(runtime.phase, 'first-parked')

  result = updateReverseParking({
    x: bayX,
    z: 0,
    heading: Math.PI / 2,
    speed: 0.5,
    gear: 1,
    engineOn: true,
  }, runtime, 0.1)
  runtime = result.runtime
  assert.equal(runtime.phase, 'cross-to-opposite')
  assert.equal(result.infractions.length, 0)

  result = updateReverseParking({
    x: 0,
    z: -9.2,
    heading: 0,
    speed: 0.5,
    gear: 1,
    engineOn: true,
  }, runtime, 0.1)
  runtime = result.runtime
  assert.equal(runtime.oppositeControlPassed, true)
  assert.equal(result.infractions.length, 0)

  result = updateReverseParking({
    x: 0,
    z: -9.2,
    heading: 0,
    speed: -0.5,
    gear: -1,
    engineOn: true,
  }, runtime, 0.1)
  runtime = result.runtime
  assert.equal(runtime.phase, 'second-reverse')
  assert.equal(result.infractions.length, 0)

  for (let i = 0; i < 2; i++) {
    result = updateReverseParking({
      x: bayX,
      z: 0,
      heading: -Math.PI / 2,
      speed: 0,
      gear: -1,
      engineOn: true,
    }, runtime, 0.2)
    runtime = result.runtime
    assert.equal(result.infractions.length, 0)
  }
  assert.equal(runtime.phase, 'second-parked')

  result = updateReverseParking({
    x: bayX,
    z: 0,
    heading: -Math.PI / 2,
    speed: 0.5,
    gear: 1,
    engineOn: true,
  }, runtime, 0.1)
  runtime = result.runtime
  assert.equal(runtime.phase, 'exit')
  assert.equal(result.infractions.length, 0)

  result = updateReverseParking({
    x: 0,
    z: 6.6,
    heading: Math.PI,
    speed: 0.5,
    gear: 1,
    engineOn: true,
  }, runtime, 0.1)
  assert.equal(result.runtime.phase, 'complete')
  assert.equal(result.runtime.completed, true)
  assert.equal(result.infractions.length, 0)
})

test('reverse parking rejects reversing before the start control line', () => {
  const result = updateReverseParking({
    x: 0,
    z: 5.7,
    heading: Math.PI,
    speed: -0.5,
    gear: -1,
    engineOn: true,
  }, createReverseParkingRuntime(), 0.1)

  assert.equal(result.runtime.phase, 'first-reverse')
  assert.equal(hasInfraction(result, 'reverse-before-first-control'), true)
  assert.equal(result.infractions.find(item => item.id === 'reverse-before-first-control')?.fatal, true)
})

test('side parking completes a legal park-and-exit sequence with no false boundary penalty', () => {
  const g = SIDE_PARKING_GEOMETRY
  let runtime = createSideParkingRuntime()

  let result = updateSideParking({
    x: 0,
    z: 8.2,
    heading: 0,
    speed: -0.5,
    gear: -1,
    engineOn: true,
    leftIndicator: false,
  }, runtime, 0.1)
  runtime = result.runtime
  assert.equal(runtime.entered, true)
  assert.equal(runtime.phase, 'reverse')
  assert.equal(result.infractions.length, 0)

  const bayX = (g.bayMouthX + g.bayBackX) / 2
  for (let i = 0; i < 2; i++) {
    result = updateSideParking({
      x: bayX,
      z: 0,
      heading: 0,
      speed: 0,
      gear: -1,
      engineOn: true,
      leftIndicator: false,
    }, runtime, 0.2)
    runtime = result.runtime
    assert.equal(result.infractions.length, 0)
  }
  assert.equal(runtime.phase, 'parked')

  result = updateSideParking({
    x: bayX,
    z: 0,
    heading: 0,
    speed: 0.5,
    gear: 1,
    engineOn: true,
    leftIndicator: true,
  }, runtime, 0.1)
  runtime = result.runtime
  assert.equal(runtime.phase, 'exit')
  assert.equal(result.infractions.length, 0)

  result = updateSideParking({
    x: 0,
    z: g.exitCompleteZ - 0.05,
    heading: 0,
    speed: 0.5,
    gear: 1,
    engineOn: true,
    leftIndicator: false,
  }, runtime, 0.1)
  assert.equal(result.runtime.phase, 'complete')
  assert.equal(result.runtime.completed, true)
  assert.equal(result.infractions.length, 0)
})

test('side parking charges the missing left signal exactly when leaving the bay', () => {
  const g = SIDE_PARKING_GEOMETRY
  const parked = {
    ...createSideParkingRuntime(),
    phase: 'parked' as const,
    started: true,
  }
  const result = updateSideParking({
    x: (g.bayMouthX + g.bayBackX) / 2,
    z: 0,
    heading: 0,
    speed: 0.5,
    gear: 1,
    engineOn: true,
    leftIndicator: false,
  }, parked, 0.1)

  assert.equal(result.runtime.phase, 'exit')
  assert.equal(hasInfraction(result, 'side-parking-exit-signal'), true)
  assert.equal(result.infractions.find(item => item.id === 'side-parking-exit-signal')?.points, 10)
})

test('slope start completes a correctly positioned stop and launch', () => {
  let runtime = createSlopeRuntime()

  let result = updateSlopeStart({
    x: 0.4,
    z: 6.5,
    heading: 0,
    speed: 0.5,
    engineOn: true,
    handbrake: false,
  }, runtime, 0.1)
  runtime = result.runtime
  assert.equal(runtime.entered, true)
  assert.equal(result.infractions.length, 0)

  result = updateSlopeStart({
    x: 0.4,
    z: 1.6,
    heading: 0,
    speed: 0,
    engineOn: true,
    handbrake: true,
  }, runtime, 0.5)
  runtime = result.runtime
  assert.equal(runtime.phase, 'stopped')
  assert.equal(result.infractions.length, 0)

  result = updateSlopeStart({
    x: 0.4,
    z: 1.6,
    heading: 0,
    speed: 0,
    engineOn: true,
    handbrake: true,
  }, runtime, 0.3)
  runtime = result.runtime
  assert.equal(result.infractions.length, 0)

  result = updateSlopeStart({
    x: 0.4,
    z: 1.5,
    heading: 0,
    speed: 0.5,
    engineOn: true,
    handbrake: false,
  }, runtime, 0.1)
  runtime = result.runtime
  assert.equal(runtime.phase, 'starting')
  assert.equal(result.infractions.length, 0)

  result = updateSlopeStart({
    x: 0.4,
    z: SLOPE_GEOMETRY.roadEndZ + 0.5,
    heading: 0,
    speed: 0.5,
    engineOn: true,
    handbrake: false,
  }, runtime, 0.1)
  assert.equal(result.runtime.phase, 'complete')
  assert.equal(result.runtime.completed, true)
  assert.equal(result.infractions.length, 0)
})

test('slope start rejects a badly positioned stop', () => {
  let runtime = createSlopeRuntime()
  runtime.entered = true

  const result = updateSlopeStart({
    x: 0,
    z: 3.0,
    heading: 0,
    speed: 0,
    engineOn: true,
    handbrake: true,
  }, runtime, 0.5)

  assert.equal(result.runtime.phase, 'stopped')
  assert.equal(hasInfraction(result, 'slope-stop-longitudinal-fail'), true)
  assert.equal(hasInfraction(result, 'slope-right-gap-fail'), true)
})

test('curve driving starts at the entrance and completes near the canonical finish', () => {
  let runtime = createCurveRuntime()
  const start = CURVE_CENTERLINE[0]

  let result = updateCurveDriving({
    x: start.x,
    z: start.z,
    heading: curveHeading(0),
    speed: 0.5,
    engineOn: true,
  }, runtime, 0.1)
  runtime = result.runtime
  assert.equal(runtime.started, true)
  assert.equal(result.infractions.length, 0)

  const finishIndex = CURVE_CENTERLINE.length - 4
  const finish = CURVE_CENTERLINE[finishIndex]
  result = updateCurveDriving({
    x: finish.x,
    z: finish.z,
    heading: curveHeading(finishIndex),
    speed: 0.5,
    engineOn: true,
  }, runtime, 0.1)

  assert.equal(result.runtime.completed, true)
  assert.equal(result.infractions.length, 0)
})

test('curve driving treats reverse movement as a fatal error and latches it', () => {
  const index = 10
  const point = CURVE_CENTERLINE[index]
  let runtime = {
    ...createCurveRuntime(),
    started: true,
    progressIndex: index,
  }

  let result = updateCurveDriving({
    x: point.x,
    z: point.z,
    heading: curveHeading(index),
    speed: -0.5,
    engineOn: true,
  }, runtime, 0.1)
  runtime = result.runtime
  assert.equal(hasInfraction(result, 'curve-reverse'), true)
  assert.equal(result.infractions.find(item => item.id === 'curve-reverse')?.fatal, true)

  result = updateCurveDriving({
    x: point.x,
    z: point.z,
    heading: curveHeading(index),
    speed: -0.5,
    engineOn: true,
  }, runtime, 0.1)
  assert.equal(hasInfraction(result, 'curve-reverse'), false)
})

test('right-angle legal sequence reaches complete with correct signal lifecycle', () => {
  let runtime = createRightAngleRuntime()

  let result = updateRightAngle({
    x: 0,
    z: 0,
    heading: -0.2,
    speed: 0.5,
    engineOn: true,
    leftIndicator: true,
  }, runtime, 0.1)
  runtime = result.runtime
  assert.equal(runtime.phase, 'turning')
  assert.equal(result.infractions.length, 0)

  result = updateRightAngle({
    x: -3,
    z: -3.6,
    heading: -Math.PI / 2,
    speed: 0.5,
    engineOn: true,
    leftIndicator: true,
  }, runtime, 0.1)
  runtime = result.runtime
  assert.equal(runtime.phase, 'exit')
  assert.equal(result.infractions.length, 0)

  result = updateRightAngle({
    x: -4.5,
    z: -3.6,
    heading: -Math.PI / 2,
    speed: 0.5,
    engineOn: true,
    leftIndicator: false,
  }, runtime, 0.1)
  runtime = result.runtime
  assert.equal(runtime.signalCloseChecked, true)
  assert.equal(result.infractions.length, 0)

  result = updateRightAngle({
    x: -7.21,
    z: -3.6,
    heading: -Math.PI / 2,
    speed: 0.5,
    engineOn: true,
    leftIndicator: false,
  }, runtime, 0.1)
  assert.equal(result.runtime.phase, 'complete')
  assert.equal(result.runtime.completed, true)
  assert.equal(result.infractions.length, 0)
})

test('right-angle reports missing entry signal and uncleared exit signal', () => {
  let runtime = createRightAngleRuntime()

  let result = updateRightAngle({
    x: 0,
    z: 0,
    heading: -0.2,
    speed: 0.5,
    engineOn: true,
    leftIndicator: false,
  }, runtime, 0.1)
  runtime = result.runtime
  assert.equal(hasInfraction(result, 'right-angle-no-signal'), true)

  result = updateRightAngle({
    x: -3,
    z: -3.6,
    heading: -Math.PI / 2,
    speed: 0.5,
    engineOn: true,
    leftIndicator: true,
  }, runtime, 0.1)
  runtime = result.runtime
  assert.equal(runtime.phase, 'exit')

  result = updateRightAngle({
    x: -4.5,
    z: -3.6,
    heading: -Math.PI / 2,
    speed: 0.5,
    engineOn: true,
    leftIndicator: true,
  }, runtime, 0.1)
  assert.equal(hasInfraction(result, 'right-angle-signal-not-cancelled'), true)
})


test('reverse parking reports timeout, body-out, failed bay entry and stop penalty on their canonical conditions', () => {
  let runtime: ReverseParkingRuntime = {
    ...createReverseParkingRuntime(),
    phase: 'first-reverse',
    started: true,
    firstControlPassed: true,
    elapsed: 209.95,
  }

  let result = updateReverseParking({
    x: 0,
    z: 0,
    heading: Math.PI,
    speed: -0.5,
    gear: -1,
    engineOn: true,
  }, runtime, 0.1)
  assert.equal(hasInfraction(result, 'reverse-parking-timeout'), true)
  assert.equal(result.infractions.find(item => item.id === 'reverse-parking-timeout')?.fatal, true)

  result = updateReverseParking({
    x: -10,
    z: 0,
    heading: Math.PI,
    speed: -0.5,
    gear: -1,
    engineOn: true,
  }, {
    ...createReverseParkingRuntime(),
    phase: 'first-reverse',
    started: true,
    firstControlPassed: true,
  }, 0.1)
  assert.equal(hasInfraction(result, 'reverse-parking-body-out'), true)

  result = updateReverseParking({
    x: 0,
    z: 0,
    heading: Math.PI,
    speed: 0.5,
    gear: 1,
    engineOn: true,
  }, {
    ...createReverseParkingRuntime(),
    phase: 'first-reverse',
    started: true,
    firstControlPassed: true,
  }, 0.1)
  assert.equal(hasInfraction(result, 'first-reverse-not-in-bay'), true)

  runtime = {
    ...createReverseParkingRuntime(),
    phase: 'cross-to-opposite',
    started: true,
    firstControlPassed: true,
  }
  result = updateReverseParking({
    x: 0,
    z: 0,
    heading: 0,
    speed: 0,
    gear: 1,
    engineOn: true,
  }, runtime, 2.1)
  assert.equal(result.infractions.some(item => item.id.startsWith('reverse-parking-stop-')), true)
  assert.equal(result.infractions.find(item => item.id.startsWith('reverse-parking-stop-'))?.points, 5)
})

test('side parking covers timeout, boundary contact, body-out-after-stop and stop penalty', () => {
  let result = updateSideParking({
    x: 0,
    z: 0,
    heading: 0,
    speed: -0.5,
    gear: -1,
    engineOn: true,
    leftIndicator: false,
  }, {
    ...createSideParkingRuntime(),
    phase: 'reverse',
    entered: true,
    started: true,
    elapsed: 89.95,
  }, 0.1)
  assert.equal(hasInfraction(result, 'side-parking-timeout'), true)

  result = updateSideParking({
    x: -10,
    z: 0,
    heading: 0,
    speed: -0.5,
    gear: -1,
    engineOn: true,
    leftIndicator: false,
  }, {
    ...createSideParkingRuntime(),
    phase: 'reverse',
    entered: true,
    started: true,
  }, 0.1)
  assert.equal(result.infractions.some(item => item.id.startsWith('side-parking-line-contact-')), true)

  const g = SIDE_PARKING_GEOMETRY
  result = updateSideParking({
    x: g.bayMouthX + 0.15,
    z: 0,
    heading: 0,
    speed: 0,
    gear: -1,
    engineOn: true,
    leftIndicator: false,
  }, {
    ...createSideParkingRuntime(),
    phase: 'reverse',
    entered: true,
    started: true,
    parkedHoldSeconds: 0.4,
  }, 0.11)
  assert.equal(hasInfraction(result, 'side-parking-body-out-after-stop'), true)

  result = updateSideParking({
    x: 0,
    z: 0,
    heading: 0,
    speed: 0,
    gear: -1,
    engineOn: true,
    leftIndicator: false,
  }, {
    ...createSideParkingRuntime(),
    phase: 'reverse',
    entered: true,
    started: true,
  }, 2.1)
  assert.equal(result.infractions.some(item => item.id.startsWith('side-parking-stop-')), true)
})

test('slope start distinguishes 10-point and fatal stop-position bands', () => {
  const nearLongitudinal = updateSlopeStart({
    x: 0.4,
    z: 1.9,
    heading: 0,
    speed: 0,
    engineOn: true,
    handbrake: true,
  }, {
    ...createSlopeRuntime(),
    entered: true,
  }, 0.5)
  assert.equal(hasInfraction(nearLongitudinal, 'slope-stop-longitudinal-10'), true)
  assert.equal(hasInfraction(nearLongitudinal, 'slope-stop-longitudinal-fail'), false)

  const fatalLongitudinal = updateSlopeStart({
    x: 0.4,
    z: 2.3,
    heading: 0,
    speed: 0,
    engineOn: true,
    handbrake: true,
  }, {
    ...createSlopeRuntime(),
    entered: true,
  }, 0.5)
  assert.equal(hasInfraction(fatalLongitudinal, 'slope-stop-longitudinal-fail'), true)
})

test('slope start reports missing parking brake and start timeout', () => {
  let result = updateSlopeStart({
    x: 0.4,
    z: 1.6,
    heading: 0,
    speed: 0,
    engineOn: true,
    handbrake: false,
  }, {
    ...createSlopeRuntime(),
    phase: 'stopped',
    entered: true,
    stopCenterZ: 1.6,
    stopHoldSeconds: 0.5,
    startElapsed: 0.7,
  }, 0.1)
  assert.equal(hasInfraction(result, 'slope-no-parking-brake'), true)

  result = updateSlopeStart({
    x: 0.4,
    z: 1.6,
    heading: 0,
    speed: 0,
    engineOn: true,
    handbrake: true,
  }, {
    ...createSlopeRuntime(),
    phase: 'stopped',
    entered: true,
    stopCenterZ: 1.6,
    startElapsed: 29.95,
    parkingBrakeEvaluated: true,
  }, 0.1)
  assert.equal(hasInfraction(result, 'slope-start-timeout'), true)
  assert.equal(result.infractions.find(item => item.id === 'slope-start-timeout')?.fatal, true)
})

test('slope start distinguishes minor and fatal rollback thresholds', () => {
  let result = updateSlopeStart({
    x: 0.4,
    z: 1.1,
    heading: 0,
    speed: 0.5,
    engineOn: true,
    handbrake: false,
  }, {
    ...createSlopeRuntime(),
    phase: 'starting',
    entered: true,
    stopCenterZ: 1.6,
    maxRollback: 0.2,
  }, 0.1)
  assert.equal(hasInfraction(result, 'slope-rollback-10'), true)
  assert.equal(hasInfraction(result, 'slope-rollback-fail'), false)

  result = updateSlopeStart({
    x: 0.4,
    z: 1.1,
    heading: 0,
    speed: 0.5,
    engineOn: true,
    handbrake: false,
  }, {
    ...createSlopeRuntime(),
    phase: 'starting',
    entered: true,
    stopCenterZ: 1.6,
    maxRollback: 0.31,
  }, 0.1)
  assert.equal(hasInfraction(result, 'slope-rollback-fail'), true)
})

test('curve driving reports wheel-line contact and latches a stop penalty until movement resumes', () => {
  const index = 12
  const point = CURVE_CENTERLINE[index]
  const heading = curveHeading(index)
  const perpendicular = heading + Math.PI / 2
  const offset = CURVE_DRIVING.roadWidth / 2 + 1.0

  let result = updateCurveDriving({
    x: point.x + Math.sin(perpendicular) * offset,
    z: point.z - Math.cos(perpendicular) * offset,
    heading,
    speed: 0.5,
    engineOn: true,
  }, {
    ...createCurveRuntime(),
    started: true,
    progressIndex: index,
  }, 0.1)
  assert.equal(hasInfraction(result, 'curve-wheel-line'), true)

  let runtime = {
    ...createCurveRuntime(),
    started: true,
    progressIndex: index,
  }
  result = updateCurveDriving({
    x: point.x,
    z: point.z,
    heading,
    speed: 0,
    engineOn: true,
  }, runtime, 2.1)
  runtime = result.runtime
  assert.equal(result.infractions.some(item => item.id.startsWith('curve-stop-')), true)

  result = updateCurveDriving({
    x: point.x,
    z: point.z,
    heading,
    speed: 0,
    engineOn: true,
  }, runtime, 0.2)
  assert.equal(result.infractions.some(item => item.id.startsWith('curve-stop-')), false)
})

test('right-angle wheel-out is fatal and stop penalties are deterministic across separate stops', () => {
  let result = updateRightAngle({
    x: RIGHT_ANGLE_GEOMETRY.half + 1,
    z: 0,
    heading: 0,
    speed: 0.5,
    engineOn: true,
    leftIndicator: true,
  }, {
    ...createRightAngleRuntime(),
    entered: true,
  }, 0.1)
  assert.equal(hasInfraction(result, 'right-angle-wheel-out'), true)
  assert.equal(result.infractions.find(item => item.id === 'right-angle-wheel-out')?.fatal, true)

  let runtime = {
    ...createRightAngleRuntime(),
    entered: true,
    phase: 'turning' as const,
  }
  result = updateRightAngle({
    x: 0,
    z: 0,
    heading: -0.2,
    speed: 0,
    engineOn: true,
    leftIndicator: true,
  }, runtime, 2.1)
  runtime = result.runtime
  assert.equal(hasInfraction(result, 'right-angle-stop-1'), true)

  result = updateRightAngle({
    x: 0,
    z: 0,
    heading: -0.2,
    speed: 0.5,
    engineOn: true,
    leftIndicator: true,
  }, runtime, 0.1)
  runtime = result.runtime

  result = updateRightAngle({
    x: 0,
    z: 0,
    heading: -0.2,
    speed: 0,
    engineOn: true,
    leftIndicator: true,
  }, runtime, 2.1)
  assert.equal(hasInfraction(result, 'right-angle-stop-2'), true)
})


test('reverse parking rejects the second reverse before the opposite control line and a failed second bay entry', () => {
  let result = updateReverseParking({
    x: 0,
    z: 0,
    heading: 0,
    speed: -0.5,
    gear: -1,
    engineOn: true,
  }, {
    ...createReverseParkingRuntime(),
    phase: 'cross-to-opposite',
    started: true,
    firstControlPassed: true,
    oppositeControlPassed: false,
  }, 0.1)

  assert.equal(hasInfraction(result, 'reverse-before-opposite-control'), true)
  assert.equal(result.infractions.find(item => item.id === 'reverse-before-opposite-control')?.fatal, true)

  result = updateReverseParking({
    x: 0,
    z: 0,
    heading: 0,
    speed: 0.5,
    gear: 1,
    engineOn: true,
  }, {
    ...createReverseParkingRuntime(),
    phase: 'second-reverse',
    started: true,
    firstControlPassed: true,
    oppositeControlPassed: true,
  }, 0.1)

  assert.equal(hasInfraction(result, 'second-reverse-not-in-bay'), true)
  assert.equal(result.infractions.find(item => item.id === 'second-reverse-not-in-bay')?.fatal, true)
})

test('slope start covers wheel-line failure and the 30-50cm right-gap band', () => {
  let result = updateSlopeStart({
    x: 1.0,
    z: 6.5,
    heading: 0,
    speed: 0.5,
    engineOn: true,
    handbrake: false,
  }, createSlopeRuntime(), 0.1)

  assert.equal(hasInfraction(result, 'slope-wheel-line'), true)
  assert.equal(result.infractions.find(item => item.id === 'slope-wheel-line')?.fatal, true)

  result = updateSlopeStart({
    x: 0.3,
    z: 1.6,
    heading: 0,
    speed: 0,
    engineOn: true,
    handbrake: true,
  }, {
    ...createSlopeRuntime(),
    entered: true,
  }, 0.5)

  assert.equal(hasInfraction(result, 'slope-right-gap-10'), true)
  assert.equal(hasInfraction(result, 'slope-right-gap-fail'), false)
  assert.equal(result.infractions.find(item => item.id === 'slope-right-gap-10')?.points, 10)
})
