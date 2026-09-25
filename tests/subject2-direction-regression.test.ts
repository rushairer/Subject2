import assert from 'node:assert/strict'
import test from 'node:test'
import { CURVE_CENTERLINE } from '../src/subject2/CurveDrivingCourse'
import { REVERSE_PARKING_GEOMETRY } from '../src/subject2/ReverseParkingCourse'
import { RIGHT_ANGLE_GEOMETRY, createRightAngleRuntime, updateRightAngle } from '../src/subject2/RightAngleCourse'
import { SIDE_PARKING_GEOMETRY } from '../src/subject2/SideParkingCourse'
import { SLOPE_GEOMETRY } from '../src/subject2/SlopeStartCourse'
import { SUBJECT2_START_POSES } from '../src/subject2/courseStartPoses'
import { toReplayLocal } from '../src/replay/replayGeometry'
import { TRAINING_CAR } from '../src/sim/vehicleDimensions'
import { turnDirection, worldPointFromVehicle } from '../src/sim/vehicleFrame'
import { stepVehiclePhysics } from '../src/sim/vehiclePhysics'

const near = (actual: number, expected: number, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`)

const localFromStart = (
  project: keyof typeof SUBJECT2_START_POSES,
  point: { x: number; z: number },
) => {
  const start = SUBJECT2_START_POSES[project]
  return toReplayLocal(point, {
    originX: start.x,
    originZ: start.z,
    heading: start.heading,
  })
}

test('reverse parking bay is on the initial vehicle-left and control lines preserve forward/rear meaning', () => {
  const g = REVERSE_PARKING_GEOMETRY
  const bay = localFromStart('reverse-parking', {
    x: (g.bayMouthX + g.bayBackX) / 2,
    z: 0,
  })
  const startControl = localFromStart('reverse-parking', { x: 0, z: g.startControlZ })
  const oppositeControl = localFromStart('reverse-parking', { x: 0, z: g.oppositeControlZ })

  assert.ok(bay.x < 0, 'reverse-parking bay must be on the driver-left at the start pose')
  assert.ok(startControl.z > 0, 'start control line must be in front of the initial vehicle')
  assert.ok(oppositeControl.z < 0, 'opposite control line must be behind the initial vehicle')
})

test('side parking bay is on the initial vehicle-right', () => {
  const g = SIDE_PARKING_GEOMETRY
  const bay = localFromStart('side-parking', {
    x: (g.bayMouthX + g.bayBackX) / 2,
    z: 0,
  })

  assert.ok(bay.x > 0, 'side-parking bay must be on the driver-right at the start pose')
  assert.ok(bay.z > 0, 'side-parking bay must initially be ahead of the vehicle')
})

test('slope start pose preserves the intended 30 cm right-side body gap', () => {
  const start = SUBJECT2_START_POSES['slope-start']
  const rightBody = worldPointFromVehicle(
    start.x,
    start.z,
    start.heading,
    0,
    TRAINING_CAR.widthMeters / 2,
  )
  near(SLOPE_GEOMETRY.roadHalf - rightBody.x, 0.30)

  const stopLine = localFromStart('slope-start', { x: 0, z: SLOPE_GEOMETRY.stopLineZ })
  assert.ok(stopLine.z > 0, 'slope stop line must be ahead of the start pose')
})

test('right-angle course exits to vehicle-left and negative heading begins the left turn', () => {
  const g = RIGHT_ANGLE_GEOMETRY
  const exitCenter = localFromStart('right-angle', {
    x: (g.horizontalMinX + g.half) / 2,
    z: g.cornerCenterZ,
  })
  assert.ok(exitCenter.x < 0, 'right-angle exit leg must be on the initial vehicle-left')
  assert.equal(turnDirection(0, -Math.PI / 2), 'left')

  const leftTurn = updateRightAngle({
    x: 0,
    z: 0,
    heading: -0.2,
    speed: 0.5,
    engineOn: true,
    leftIndicator: true,
  }, createRightAngleRuntime(), 0.016)
  assert.equal(leftTurn.runtime.phase, 'turning')

  const wrongWay = updateRightAngle({
    x: 0,
    z: 0,
    heading: 0.2,
    speed: 0.5,
    engineOn: true,
    leftIndicator: true,
  }, createRightAngleRuntime(), 0.016)
  assert.equal(wrongWay.runtime.phase, 'approach')
})

test('curve-driving centerline is a true S bend: left first, then right', () => {
  const headings = CURVE_CENTERLINE.slice(0, -1).map((point, index) => {
    const next = CURVE_CENTERLINE[index + 1]
    return Math.atan2(next.x - point.x, -(next.z - point.z))
  })
  const turns = headings.slice(0, -1)
    .map((heading, index) => turnDirection(heading, headings[index + 1]))
    .filter(direction => direction !== 'straight')

  assert.ok(turns.length > 0)
  assert.equal(turns[0], 'left')
  assert.equal(turns[turns.length - 1], 'right')
  assert.ok(turns.includes('left'))
  assert.ok(turns.includes('right'))
})

function physicsVehicle(speed: number, gear: number) {
  return {
    x: 0,
    z: 0,
    heading: 0,
    speed,
    steering: 0,
    steeringWheelAngle: 0,
    throttle: 0,
    brake: 0,
    clutch: 0,
    gear,
    engineOn: false,
    engineRpm: 0,
    stallTimer: 0,
    handbrake: false,
  }
}

test('positive steering turns the vehicle right while driving forward', () => {
  const vehicle = physicsVehicle(2, 1)
  stepVehiclePhysics(vehicle, {
    throttle: 0,
    brake: 0,
    clutch: 0,
    steer: 0,
    steeringWheelTarget: 2,
  }, 0.1, { automatic: true, grade: 0 })

  assert.ok(vehicle.steering > 0)
  assert.ok(vehicle.heading > 0, 'forward + right steering must increase heading')
})

test('positive steering while reversing sends the rear axle right while the nose yaws left', () => {
  const vehicle = physicsVehicle(-2, -1)
  stepVehiclePhysics(vehicle, {
    throttle: 0,
    brake: 0,
    clutch: 0,
    steer: 0,
    steeringWheelTarget: 2,
  }, 0.1, { automatic: true, grade: 0 })

  const rearAxle = worldPointFromVehicle(
    vehicle.x,
    vehicle.z,
    vehicle.heading,
    -TRAINING_CAR.rearAxleFromCenterMeters,
    0,
  )

  assert.ok(vehicle.steering > 0)
  assert.ok(vehicle.heading < 0, 'reverse + right steering must yaw the vehicle nose left')
  assert.ok(rearAxle.x > 0, 'reverse + right steering must move the rear axle to vehicle-right')
})
