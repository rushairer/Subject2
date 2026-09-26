import assert from 'node:assert/strict'
import test from 'node:test'
import { rightFromHeading } from '../src/sim/vehicleFrame'
import { TRAINING_CAR } from '../src/sim/vehicleDimensions'
import {
  ackermannFrontAngles,
  footprintIntersectsAxisAlignedRect,
  footprintTouchesOutsideRectUnion,
  wheelContactFootprints,
  type AxisAlignedRect,
  type WheelContactFootprint,
} from '../src/sim/wheelContact'
import { SUBJECT2_BOUNDARY_LINE_WIDTH_METERS } from '../src/subject2/courseMarkings'
import {
  createSlopeRuntime,
  SLOPE_GEOMETRY,
  updateSlopeStart,
} from '../src/subject2/SlopeStartCourse'
import {
  createRightAngleRuntime,
  updateRightAngle,
} from '../src/subject2/RightAngleCourse'
import {
  createSideParkingRuntime,
  updateSideParking,
} from '../src/subject2/SideParkingCourse'

const near = (actual: number, expected: number, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`)

test('straight wheel contact centers match the real axle and track geometry', () => {
  const footprints = wheelContactFootprints({ x: 0, z: 0, heading: 0, steering: 0 })
  const byId = Object.fromEntries(footprints.map(item => [item.id, item]))

  near(byId['front-left'].center.x, -TRAINING_CAR.trackWidthMeters / 2)
  near(byId['front-left'].center.z, -TRAINING_CAR.frontAxleFromCenterMeters)
  near(byId['front-right'].center.x, TRAINING_CAR.trackWidthMeters / 2)
  near(byId['front-right'].center.z, -TRAINING_CAR.frontAxleFromCenterMeters)
  near(byId['rear-left'].center.x, -TRAINING_CAR.trackWidthMeters / 2)
  near(byId['rear-left'].center.z, TRAINING_CAR.rearAxleFromCenterMeters)
  near(byId['rear-right'].center.x, TRAINING_CAR.trackWidthMeters / 2)
  near(byId['rear-right'].center.z, TRAINING_CAR.rearAxleFromCenterMeters)
})

test('Ackermann steering gives the inside front wheel the larger steering angle', () => {
  const right = ackermannFrontAngles(0.4)
  assert.ok(right.right > right.left)
  assert.ok(right.left > 0)

  const left = ackermannFrontAngles(-0.4)
  assert.ok(Math.abs(left.left) > Math.abs(left.right))
  assert.ok(left.left < 0)
  assert.ok(left.right < 0)
})

test('front tire footprints follow Ackermann headings while rear tires follow the body', () => {
  const steering = 0.4
  const footprints = wheelContactFootprints({ x: 0, z: 0, heading: 0.3, steering })
  const byId = Object.fromEntries(footprints.map(item => [item.id, item]))
  const front = ackermannFrontAngles(steering)

  near(byId['front-left'].heading, 0.3 + front.left)
  near(byId['front-right'].heading, 0.3 + front.right)
  near(byId['rear-left'].heading, 0.3)
  near(byId['rear-right'].heading, 0.3)
})

test('tire footprint has finite tread width instead of a zero-area wheel-center point', () => {
  const footprint = wheelContactFootprints({
    x: 0,
    z: 0,
    heading: 0,
    steering: 0,
  }).find(item => item.id === 'front-right')
  assert.ok(footprint)

  const xs = footprint.corners.map(point => point.x)
  const zs = footprint.corners.map(point => point.z)
  near(Math.max(...xs) - Math.min(...xs), TRAINING_CAR.tireWidthMeters)
  near(Math.max(...zs) - Math.min(...zs), TRAINING_CAR.tireContactPatchLengthMeters)
})

test('rectangle-union coverage catches a tire patch crossing a concave road corner', () => {
  const legal: AxisAlignedRect[] = [
    { minX: -1, maxX: 1, minZ: -1, maxZ: 3 },
    { minX: -3, maxX: 1, minZ: -1, maxZ: 1 },
  ]
  const footprint: WheelContactFootprint = {
    id: 'front-left',
    center: { x: -1, z: 1 },
    heading: 0,
    corners: [
      { x: -0.9, z: 1.1 },
      { x: -1.1, z: 1.1 },
      { x: -1.1, z: 0.9 },
      { x: -0.9, z: 0.9 },
    ],
  }

  assert.equal(footprintTouchesOutsideRectUnion(footprint, legal), true)
})

test('slope line contact begins at the inner edge of the painted boundary line', () => {
  const safeX =
    SLOPE_GEOMETRY.roadHalf -
    SUBJECT2_BOUNDARY_LINE_WIDTH_METERS -
    TRAINING_CAR.trackWidthMeters / 2 -
    TRAINING_CAR.tireWidthMeters / 2 -
    0.001
  const touchingX = safeX + 0.002
  const runtime = { ...createSlopeRuntime(), entered: true }

  const safe = updateSlopeStart({
    x: safeX,
    z: 6.5,
    heading: 0,
    steering: 0,
    speed: 0.5,
    engineOn: true,
    handbrake: false,
  }, runtime, 0.1)
  assert.equal(safe.infractions.some(item => item.id === 'slope-wheel-line'), false)

  const touching = updateSlopeStart({
    x: touchingX,
    z: 6.5,
    heading: 0,
    steering: 0,
    speed: 0.5,
    engineOn: true,
    handbrake: false,
  }, runtime, 0.1)
  assert.equal(touching.infractions.some(item => item.id === 'slope-wheel-line'), true)
})

test('right-angle line judge triggers at the painted line before the road boundary', () => {
  const halfRoad = 1.8
  const vehicleX =
    halfRoad -
    SUBJECT2_BOUNDARY_LINE_WIDTH_METERS / 2 -
    TRAINING_CAR.trackWidthMeters / 2 -
    TRAINING_CAR.tireWidthMeters / 2 +
    0.005

  const result = updateRightAngle({
    x: vehicleX,
    z: 0,
    heading: 0,
    steering: 0,
    speed: 0.5,
    engineOn: true,
    leftIndicator: true,
  }, {
    ...createRightAngleRuntime(),
    entered: true,
  }, 0.1)

  assert.equal(result.infractions.some(item => item.id === 'right-angle-wheel-out'), true)
})

test('side-parking line judge uses the painted lane-edge rectangle', () => {
  const laneHalf = 1.7
  const safeX =
    laneHalf -
    SUBJECT2_BOUNDARY_LINE_WIDTH_METERS / 2 -
    TRAINING_CAR.trackWidthMeters / 2 -
    TRAINING_CAR.tireWidthMeters / 2 -
    0.001
  const runtime = {
    ...createSideParkingRuntime(),
    phase: 'reverse' as const,
    entered: true,
    started: true,
  }

  const safe = updateSideParking({
    x: safeX,
    z: 5,
    heading: 0,
    steering: 0,
    speed: -0.5,
    gear: -1,
    engineOn: true,
    leftIndicator: false,
  }, runtime, 0.1)
  assert.equal(safe.infractions.some(item => item.id.startsWith('side-parking-line-contact-')), false)

  const contact = updateSideParking({
    x: safeX + 0.002,
    z: 5,
    heading: 0,
    steering: 0,
    speed: -0.5,
    gear: -1,
    engineOn: true,
    leftIndicator: false,
  }, runtime, 0.1)
  assert.equal(contact.infractions.some(item => item.id.startsWith('side-parking-line-contact-')), true)
})

test('tire-to-painted-line tangent contact counts as an intersection', () => {
  const footprint = wheelContactFootprints({
    x: 0,
    z: 0,
    heading: 0,
    steering: 0,
  }).find(item => item.id === 'rear-right')
  assert.ok(footprint)
  const outerX = Math.max(...footprint.corners.map(point => point.x))

  assert.equal(
    footprintIntersectsAxisAlignedRect(footprint, {
      minX: outerX,
      maxX: outerX + 0.12,
      minZ: -10,
      maxZ: 10,
    }),
    true,
  )
})

test('route-right vector remains consistent with tire lateral geometry', () => {
  const heading = 0.63
  const right = rightFromHeading(heading)
  const footprints = wheelContactFootprints({ x: 2, z: -3, heading, steering: 0 })
  const left = footprints.find(item => item.id === 'rear-left')
  const rightWheel = footprints.find(item => item.id === 'rear-right')
  assert.ok(left && rightWheel)

  const dx = rightWheel.center.x - left.center.x
  const dz = rightWheel.center.z - left.center.z
  near(dx * right.x + dz * right.z, TRAINING_CAR.trackWidthMeters)
})
