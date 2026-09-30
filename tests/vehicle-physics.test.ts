import assert from 'node:assert/strict'
import test from 'node:test'
import { SUBJECT2_EXAM_PLACEMENTS } from '../src/subject2/subject2ExamLayout'
import {
  longitudinalGravityAcceleration,
  stepVehiclePhysics,
  type PhysicsVehicle,
} from '../src/sim/vehiclePhysics'

const near = (actual: number, expected: number, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`)

function vehicle(heading: number, handbrake = false): PhysicsVehicle {
  return {
    x: 0,
    z: 0,
    heading,
    speed: 0,
    steering: 0,
    steeringWheelAngle: 0,
    throttle: 0,
    brake: 0,
    clutch: 0,
    gear: 0,
    engineOn: false,
    engineRpm: 0,
    stallTimer: 0,
    handbrake,
  }
}

const idleInput = {
  throttle: 0,
  brake: 0,
  clutch: 0,
  steer: 0,
}

test('slope gravity is projected onto vehicle heading', () => {
  const grade = 0.1
  near(longitudinalGravityAcceleration(0, grade, 0), -0.981)
  near(longitudinalGravityAcceleration(Math.PI, grade, 0), 0.981)
  near(longitudinalGravityAcceleration(Math.PI / 2, grade, 0), 0, 1e-12)
})

test('slope gravity follows a rotated course uphill heading', () => {
  const uphill = Math.PI / 2
  const grade = 0.1
  near(longitudinalGravityAcceleration(uphill, grade, uphill), -0.981)
  near(longitudinalGravityAcceleration(-Math.PI / 2, grade, uphill), 0.981)
})

test('a stopped vehicle rolls downhill relative to its actual orientation', () => {
  const uphill = vehicle(0)
  stepVehiclePhysics(uphill, idleInput, 0.1, {
    automatic: true,
    grade: 0.1,
    gradeHeading: 0,
  })
  assert.ok(uphill.speed < 0, 'vehicle facing uphill must roll backward')

  const downhill = vehicle(Math.PI)
  stepVehiclePhysics(downhill, idleInput, 0.1, {
    automatic: true,
    grade: 0.1,
    gradeHeading: 0,
  })
  assert.ok(downhill.speed > 0, 'vehicle facing downhill must roll forward')
})

test('a vehicle perpendicular to the slope has no longitudinal gravity drift', () => {
  const acrossSlope = vehicle(Math.PI / 2)
  stepVehiclePhysics(acrossSlope, idleInput, 0.1, {
    automatic: true,
    grade: 0.1,
    gradeHeading: 0,
  })
  near(acrossSlope.speed, 0)
})

test('parking brake prevents gravity rollback', () => {
  const held = vehicle(0, true)
  stepVehiclePhysics(held, idleInput, 0.5, {
    automatic: true,
    grade: 0.1,
    gradeHeading: 0,
  })
  near(held.speed, 0)
})

test('continuous slope placement supplies the world-space uphill heading', () => {
  const uphillHeading = SUBJECT2_EXAM_PLACEMENTS['slope-start'].heading
  const uphill = vehicle(uphillHeading)
  stepVehiclePhysics(uphill, idleInput, 0.1, {
    automatic: true,
    grade: 0.1,
    gradeHeading: uphillHeading,
  })
  assert.ok(uphill.speed < 0)
})

test('engine-off rollback on rotated slopes is consistent across rendering rates', () => {
  for (const uphillHeading of [0, Math.PI / 2]) {
    const speeds: number[] = []
    for (const hz of [20, 30, 60, 120]) {
      const rolling = vehicle(uphillHeading)
      for (let frame = 0; frame < hz; frame++) {
        stepVehiclePhysics(rolling, idleInput, 1 / hz, {
          automatic: false, grade: 0.1, gradeHeading: uphillHeading,
        })
      }
      assert.ok(rolling.speed < -0.8, `gravity was swallowed at ${hz}Hz: ${rolling.speed}`)
      speeds.push(rolling.speed)
    }
    assert.ok(Math.max(...speeds) - Math.min(...speeds) < 0.01)
  }
})

test('light service brake opposes slope gravity continuously; sufficient brake holds', () => {
  for (const heading of [0, Math.PI]) {
    const speeds = [0.049, 0.05, 0.051, 0.2].map(brake => {
      const rolling = vehicle(heading)
      for (let frame = 0; frame < 60; frame++) {
        stepVehiclePhysics(rolling, { ...idleInput, brake }, 1 / 60, {
          automatic: true, grade: 0.1, gradeHeading: 0,
        })
      }
      return rolling.speed
    })
    assert.ok(speeds.slice(0, 3).every(speed => Math.abs(speed) > 0.3))
    assert.ok(Math.abs(speeds[0] - speeds[2]) < 0.03)
    assert.equal(speeds[3], 0)
  }
})


test('downhill gravity can carry the vehicle beyond the former 57.6 km/h clamp', () => {
  const downhill = vehicle(Math.PI)
  downhill.speed = 15.5

  for (let frame = 0; frame < 300; frame += 1) {
    stepVehiclePhysics(downhill, idleInput, 1 / 60, {
      automatic: false,
      grade: 0.1,
      gradeHeading: 0,
    })
  }

  const speedKmh = downhill.speed * 3.6
  assert.ok(speedKmh > 60, `downhill speed still looks hard-capped: ${speedKmh}`)
  assert.ok(speedKmh < 90, `road load failed to bound short downhill acceleration: ${speedKmh}`)
})
