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
  createCurveRuntime,
  updateCurveDriving,
} from '../src/subject2/CurveDrivingCourse'
import {
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
