import assert from 'node:assert/strict'
import test from 'node:test'
import {
  polygonArea,
  polygonTouchesOutsideRectUnion,
  type AxisAlignedRect,
} from '../src/sim/planarGeometry'
import { TRAINING_CAR } from '../src/sim/vehicleDimensions'
import { vehicleBodyFootprint } from '../src/sim/vehicleFootprint'
import {
  REVERSE_PARKING_GEOMETRY,
  createReverseParkingRuntime,
  updateReverseParking,
} from '../src/subject2/ReverseParkingCourse'

const near = (actual: number, expected: number, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`)

function reverseAllowedRects(): readonly AxisAlignedRect[] {
  const g = REVERSE_PARKING_GEOMETRY
  return [
    {
      minX: -g.laneHalf,
      maxX: g.laneHalf,
      minZ: -g.laneEndZ,
      maxZ: g.laneEndZ,
    },
    {
      minX: g.bayMouthX,
      maxX: g.bayBackX,
      minZ: -g.bayHalf,
      maxZ: g.bayHalf,
    },
  ]
}

function pointInRectUnion(
  point: { x: number; z: number },
  rects: readonly AxisAlignedRect[],
) {
  return rects.some(rect =>
    point.x >= rect.minX &&
    point.x <= rect.maxX &&
    point.z >= rect.minZ &&
    point.z <= rect.maxZ
  )
}

test('vehicle body footprint preserves the configured training-car area', () => {
  const footprint = vehicleBodyFootprint({ x: 1.2, z: -3.4, heading: 0.73 })
  near(
    polygonArea(footprint),
    TRAINING_CAR.lengthMeters * TRAINING_CAR.widthMeters,
    1e-9,
  )
})

test('exact polygon coverage catches concave-corner body escape that four corners miss', () => {
  const pose = {
    x: 2.5,
    z: 0.5,
    heading: 25 * Math.PI / 180,
  }
  const footprint = vehicleBodyFootprint(pose)
  const legal = reverseAllowedRects()

  assert.equal(
    footprint.every(point => pointInRectUnion(point, legal)),
    true,
    'fixture must reproduce the old corner-only false negative',
  )
  assert.equal(
    polygonTouchesOutsideRectUnion(footprint, legal, 0),
    true,
    'the body polygon crosses the forbidden concave notch',
  )
})

test('reverse parking reports body-out for the concave-corner overlap', () => {
  const result = updateReverseParking({
    x: 2.5,
    z: 0.5,
    heading: 25 * Math.PI / 180,
    speed: -0.5,
    gear: -1,
    engineOn: true,
  }, {
    ...createReverseParkingRuntime(),
    phase: 'first-reverse',
    started: true,
    firstControlPassed: true,
  }, 0.1)

  assert.equal(
    result.infractions.some(item => item.id === 'reverse-parking-body-out'),
    true,
  )
})

test('body tangent to the legal rectangle boundary is not treated as body-out', () => {
  const g = REVERSE_PARKING_GEOMETRY
  const vehicle = {
    x: 0,
    z: 0,
    heading: 0,
  }
  const footprint = vehicleBodyFootprint(vehicle)
  const wideRoad: AxisAlignedRect[] = [{
    minX: -TRAINING_CAR.widthMeters / 2,
    maxX: TRAINING_CAR.widthMeters / 2,
    minZ: -g.laneEndZ,
    maxZ: g.laneEndZ,
  }]

  assert.equal(
    polygonTouchesOutsideRectUnion(footprint, wideRoad, 0),
    false,
  )
})
