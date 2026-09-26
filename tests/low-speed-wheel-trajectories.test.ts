import assert from 'node:assert/strict'
import test from 'node:test'
import { DRIVING_RULES } from '../src/rules/drivingRules'
import { TRAINING_CAR } from '../src/sim/vehicleDimensions'
import { rightFromHeading, worldPointFromVehicle } from '../src/sim/vehicleFrame'
import { stepVehiclePhysics, type PhysicsVehicle } from '../src/sim/vehiclePhysics'
import { wheelContactFootprints } from '../src/sim/wheelContact'

const near = (actual: number, expected: number, epsilon: number, message?: string) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, message ?? `${actual} != ${expected}`)

function rollingVehicle(speed: number, steering: number): PhysicsVehicle {
  const maxSteeringWheelAngle = DRIVING_RULES.steering.wheelTurnsLockToLock * Math.PI
  const steeringWheelAngle =
    steering / DRIVING_RULES.steering.roadWheelMaxAngleRadians * maxSteeringWheelAngle
  return {
    x: 0,
    z: 0,
    heading: 0,
    speed,
    steering,
    steeringWheelAngle,
    throttle: 0,
    brake: 0,
    clutch: 0,
    gear: speed < 0 ? -1 : 1,
    engineOn: false,
    engineRpm: 0,
    stallTimer: 0,
    handbrake: false,
  }
}

function integrate(vehicle: PhysicsVehicle, seconds: number, hz: number) {
  const dt = 1 / hz
  const frames = Math.round(seconds * hz)
  const steeringWheelTarget = vehicle.steeringWheelAngle
  for (let i = 0; i < frames; i++) {
    stepVehiclePhysics(vehicle, {
      throttle: 0,
      brake: 0,
      clutch: 0,
      steer: 0,
      steeringWheelTarget,
    }, dt, {
      automatic: true,
      grade: 0,
    })
  }
}

function turningCenter(vehicle: PhysicsVehicle, steering: number) {
  const rearAxle = worldPointFromVehicle(
    vehicle.x,
    vehicle.z,
    vehicle.heading,
    -TRAINING_CAR.rearAxleFromCenterMeters,
    0,
  )
  const right = rightFromHeading(vehicle.heading)
  const radius = TRAINING_CAR.wheelbaseMeters / Math.tan(Math.abs(steering))
  const side = Math.sign(steering)
  return {
    x: rearAxle.x + right.x * radius * side,
    z: rearAxle.z + right.z * radius * side,
    radius,
  }
}

test('maximum low-speed steering follows the bicycle-model rear-axle circle', () => {
  const steering = DRIVING_RULES.steering.roadWheelMaxAngleRadians
  const vehicle = rollingVehicle(1.2, steering)
  const center = turningCenter(vehicle, steering)
  const initialRearAxle = worldPointFromVehicle(
    vehicle.x,
    vehicle.z,
    vehicle.heading,
    -TRAINING_CAR.rearAxleFromCenterMeters,
    0,
  )
  near(
    Math.hypot(initialRearAxle.x - center.x, initialRearAxle.z - center.z),
    center.radius,
    1e-9,
  )

  integrate(vehicle, 1.0, 120)

  const rearAxle = worldPointFromVehicle(
    vehicle.x,
    vehicle.z,
    vehicle.heading,
    -TRAINING_CAR.rearAxleFromCenterMeters,
    0,
  )
  near(
    Math.hypot(rearAxle.x - center.x, rearAxle.z - center.z),
    center.radius,
    0.002,
    'rear axle must stay on one low-speed turning circle',
  )
  assert.ok(vehicle.heading > 0, 'positive steering while moving forward must turn right')
})

test('all four wheel centers preserve their own concentric low-speed trajectories', () => {
  const steering = DRIVING_RULES.steering.roadWheelMaxAngleRadians
  const vehicle = rollingVehicle(1.0, steering)
  const center = turningCenter(vehicle, steering)
  const initial = Object.fromEntries(
    wheelContactFootprints(vehicle).map(wheel => [
      wheel.id,
      Math.hypot(wheel.center.x - center.x, wheel.center.z - center.z),
    ]),
  )

  for (let i = 0; i < 120; i++) {
    integrate(vehicle, 1 / 120, 120)
    for (const wheel of wheelContactFootprints(vehicle)) {
      const radius = Math.hypot(
        wheel.center.x - center.x,
        wheel.center.z - center.z,
      )
      near(
        radius,
        initial[wheel.id],
        0.003,
        `${wheel.id} must remain on its own concentric trajectory`,
      )
    }
  }

  assert.ok(initial['rear-right'] < initial['rear-left'], 'right rear is the inner rear wheel')
  assert.ok(initial['front-right'] < initial['front-left'], 'right front is the inner front wheel')
  assert.ok(initial['front-right'] > initial['rear-right'], 'front inner wheel travels a larger radius than rear inner wheel')
})

test('reverse driving traverses the same steering circle backwards without flipping the ICR', () => {
  const steering = DRIVING_RULES.steering.roadWheelMaxAngleRadians
  const vehicle = rollingVehicle(-1.0, steering)
  const center = turningCenter(vehicle, steering)
  const initialRearAxle = worldPointFromVehicle(
    vehicle.x,
    vehicle.z,
    vehicle.heading,
    -TRAINING_CAR.rearAxleFromCenterMeters,
    0,
  )
  const radius = Math.hypot(
    initialRearAxle.x - center.x,
    initialRearAxle.z - center.z,
  )

  integrate(vehicle, 0.8, 120)

  const rearAxle = worldPointFromVehicle(
    vehicle.x,
    vehicle.z,
    vehicle.heading,
    -TRAINING_CAR.rearAxleFromCenterMeters,
    0,
  )
  near(
    Math.hypot(rearAxle.x - center.x, rearAxle.z - center.z),
    radius,
    0.002,
  )
  assert.ok(vehicle.heading < 0, 'positive steering while reversing must yaw the nose left')
})

test('low-speed trajectory is stable across 60 Hz and 120 Hz integration', () => {
  const steering = 0.42
  const at60 = rollingVehicle(1.1, steering)
  const at120 = rollingVehicle(1.1, steering)

  integrate(at60, 1.0, 60)
  integrate(at120, 1.0, 120)

  near(at60.x, at120.x, 0.01)
  near(at60.z, at120.z, 0.01)
  near(at60.heading, at120.heading, 0.002)
})

test('zero steering preserves a straight rear-axle trajectory', () => {
  const vehicle = rollingVehicle(1.0, 0)
  integrate(vehicle, 1.0, 120)

  near(vehicle.x, 0, 1e-9)
  near(vehicle.heading, 0, 1e-9)
  assert.ok(vehicle.z < 0)
})
