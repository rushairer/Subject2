import assert from 'node:assert/strict'
import test from 'node:test'
import { SUBJECT2_BOUNDARY_LINE_WIDTH_METERS } from '../src/subject2/courseMarkings'
import { REVERSE_PARKING } from '../src/subject2/ReverseParkingCourse'
import { SIDE_PARKING } from '../src/subject2/SideParkingCourse'
import { SLOPE_START } from '../src/subject2/SlopeStartCourse'
import { CURVE_DRIVING } from '../src/subject2/CurveDrivingCourse'
import { RIGHT_ANGLE } from '../src/subject2/RightAngleCourse'

test('Subject 2 venue geometry matches the GA 1029-2022 small-passenger-car profile', () => {
  assert.equal(SUBJECT2_BOUNDARY_LINE_WIDTH_METERS, 0.15)

  assert.equal(REVERSE_PARKING.bayLength, 5.1)
  assert.equal(REVERSE_PARKING.bayWidth, 2.3)
  assert.equal(REVERSE_PARKING.laneWidth, 6.7)
  assert.equal(REVERSE_PARKING.controlDistance, 6.7)

  assert.equal(SIDE_PARKING.bayLength, 7.6)
  assert.equal(SIDE_PARKING.bayWidth, 2.5)
  assert.equal(SIDE_PARKING.laneWidth, 3.4)
  assert.equal(SIDE_PARKING.frontEdgeLength, 4.5)
  assert.equal(SIDE_PARKING.rearEdgeLength, 1.0)

  assert.equal(SLOPE_START.roadWidth, 3.2)
  assert.equal(SLOPE_START.rampLength, 20)
  assert.equal(SLOPE_START.minVerticalRadius, 20)
  assert.equal(SLOPE_START.stopLineWidth, 0.3)
  assert.equal(SLOPE_START.controlOffset, 0.5)
  assert.equal(SLOPE_START.grade, 0.10)

  assert.equal(CURVE_DRIVING.radius, 7.5)
  assert.equal(CURVE_DRIVING.roadWidth, 3.5)

  assert.equal(RIGHT_ANGLE.roadWidth, 3.6)
  assert.equal(RIGHT_ANGLE.legLength, 6.8)
})
