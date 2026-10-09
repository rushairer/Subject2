import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveCircleImpact,
  resolveSweptCircleImpact,
  resolveVehicleImpact,
} from '../src/sim/collisionResponse'
import { TRAINING_CAR } from '../src/sim/vehicleDimensions'
import { TRAINING_CAR_DYNAMICS } from '../src/sim/vehicleTireDynamics'
import { worldPointFromVehicle } from '../src/sim/vehicleFrame'
import { stepVehiclePhysics, type PhysicsVehicle } from '../src/sim/vehiclePhysics'

const close = (actual: number, expected: number, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`)

function slidingVehicle(overrides: Partial<PhysicsVehicle> = {}): PhysicsVehicle {
  return {
    x: 0, z: 0, heading: 0,
    speed: 12, lateralSpeed: 5, yawRate: 0,
    steering: 0, steeringWheelAngle: 0, throttle: 0, brake: 0,
    clutch: 0, gear: 3, engineOn: false, engineRpm: 0, stallTimer: 0,
    handbrake: false, ...overrides,
  }
}

test('sideways slide into a fixed obstacle dissipates lateral momentum without stopping forward travel', () => {
  const car = slidingVehicle()
  const tree = { x: TRAINING_CAR.widthMeters / 2 + 0.19, z: 0, radius: 0.25 }
  const beforeGroundSpeed = Math.hypot(car.speed, car.lateralSpeed!)
  const impact = resolveCircleImpact(car, tree, 'tree')

  assert.equal(impact.collided, true)
  close(impact.impactSpeed, 5)
  close(car.speed, 12)
  assert.ok(Math.abs(car.lateralSpeed!) < 1,
    `lateral velocity was ignored: ${car.lateralSpeed}`)
  assert.ok(car.yawRate! > 0, 'offset CG should convert part of the side impulse to yaw')
  assert.ok(Math.hypot(car.speed, car.lateralSpeed!) < beforeGroundSpeed)
  assert.ok(Number.isFinite(car.x) && Number.isFinite(car.z))
})

test('sliding away from the same obstacle separates without braking or inventing sideways impulse', () => {
  const car = slidingVehicle({ lateralSpeed: -4 })
  const tree = { x: TRAINING_CAR.widthMeters / 2 + 0.19, z: 0, radius: 0.25 }
  const impact = resolveCircleImpact(car, tree, 'tree')
  assert.equal(impact.collided, true)
  close(impact.impactSpeed, 0)
  close(car.speed, 12)
  close(car.lateralSpeed!, -4)
  close(car.yawRate!, 0)
})

test('a spinning car has a real contact-point approach velocity even with zero center travel', () => {
  const car = slidingVehicle({ speed: 0, lateralSpeed: 0, yawRate: 1.2 })
  const obstacle = worldPointFromVehicle(0, 0, 0,
    TRAINING_CAR.lengthMeters / 2 - 0.05,
    TRAINING_CAR.widthMeters / 2 + 0.19)
  const impact = resolveCircleImpact(car, { ...obstacle, radius: 0.25 }, 'pole')
  assert.equal(impact.collided, true)
  assert.ok(impact.impactSpeed > 1.5, `spin contact was ignored: ${impact.impactSpeed}`)
  close(car.speed, 0)
  assert.ok(car.yawRate! >= 0 && car.yawRate! < 1.2)
  assert.ok(Math.abs(car.lateralSpeed!) > 0)
})

test('side-swipe impulse is frame invariant when the world heading rotates', () => {
  const results = [0, Math.PI / 2, -Math.PI / 3, Math.PI].map(heading => {
    const car = slidingVehicle({ heading, yawRate: 0.28 })
    const obstaclePosition = worldPointFromVehicle(0, 0, heading,
      0.4, TRAINING_CAR.widthMeters / 2 + 0.2)
    const impact = resolveCircleImpact(car, { ...obstaclePosition, radius: 0.3 }, 'tree')
    assert.equal(impact.collided, true)
    return { impactSpeed: impact.impactSpeed, speed: car.speed,
      lateral: car.lateralSpeed!, yaw: car.yawRate! }
  })
  const expected = results[0]
  for (const value of results.slice(1)) {
    close(value.impactSpeed, expected.impactSpeed)
    close(value.speed, expected.speed)
    close(value.lateral, expected.lateral)
    close(value.yaw, expected.yaw)
  }
})

test('moving scooter can transfer side impulse to a stationary training car without changing gears', () => {
  const car = slidingVehicle({ speed: 0, lateralSpeed: 0, yawRate: 0, gear: 0 })
  const obstacle = { x: TRAINING_CAR.widthMeters / 2 + 0.16, z: 0, radius: 0.2 }
  const impact = resolveCircleImpact(car, obstacle, 'scooter', { x: -6, z: 0 })
  assert.equal(impact.collided, true)
  close(impact.impactSpeed, 6)
  close(car.speed, 0)
  assert.equal(car.gear, 0)
  assert.ok(car.lateralSpeed! < 0, 'actor should push the stationary body sideways')
  assert.ok(Number.isFinite(car.yawRate))
  assert.ok(impact.actorVelocity.x < 0)
})

test('oriented traffic car side contact reacts to body-center lateral motion, not only forward speed', () => {
  const car = slidingVehicle({ speed: 10, lateralSpeed: 6 })
  const dimensions = { lengthMeters: 4.2, widthMeters: 1.8 }
  const actor = { x: TRAINING_CAR.widthMeters / 2 + dimensions.widthMeters / 2 - 0.05,
    z: 0, heading: 0 }
  const impact = resolveVehicleImpact(car, actor, dimensions)
  assert.equal(impact.collided, true)
  close(impact.impactSpeed, 6)
  close(car.speed, 10)
  assert.ok(car.lateralSpeed! < 4)
  assert.ok(Math.abs(car.yawRate!) < TRAINING_CAR_DYNAMICS.maximumYawRateRps)
})

test('existing longitudinal-only collision callers retain their historical deterministic result', () => {
  const car = { x: 0, z: 0, heading: 0, speed: 4 }
  const obstacle = { x: 0, z: -TRAINING_CAR.lengthMeters / 2 - 0.2,
    radius: 0.25 }
  const impact = resolveCircleImpact(car, obstacle, 'pole')
  assert.equal(impact.collided, true)
  close(impact.impactSpeed, 4)
  close(car.speed, 0)
  assert.equal('lateralSpeed' in car, false)
  assert.equal('yawRate' in car, false)
})

test('a swept sideways collision uses its first contact and reduces real slip speed', () => {
  const before = { x: -4, z: 0, heading: 0 }
  const car = slidingVehicle({ x: 4, z: 0, lateralSpeed: 6 })
  const pole = { x: 0, z: 0, radius: 0.12 }
  const impact = resolveSweptCircleImpact(car, before, pole, 'pole')
  assert.equal(impact.collided, true)
  close(impact.impactSpeed, 6, 1e-4)
  close(car.speed, 12)
  assert.ok(car.x < -1 && car.x > -1.3)
  assert.ok(Math.abs(car.lateralSpeed!) < 1)
})

test('after a severe side impact, the tire solver continues with finite dynamic recovery', () => {
  const car = slidingVehicle({ speed: 11, lateralSpeed: 7, yawRate: 0.35,
    engineOn: true, engineRpm: 2000, gear: 2 })
  const tree = { x: TRAINING_CAR.widthMeters / 2 + 0.12,
    z: -0.1, radius: 0.2 }
  const impact = resolveCircleImpact(car, tree, 'tree')
  assert.equal(impact.collided, true)
  assert.ok(impact.impactSpeed > 5)
  assert.ok(Math.abs(car.yawRate!) <= TRAINING_CAR_DYNAMICS.maximumYawRateRps)
  car.handbrake = false
  for (let frame = 0; frame < 120; frame += 1) {
    stepVehiclePhysics(car, {
      throttle: 0.25, brake: 0, clutch: 0, steer: 0,
      steeringWheelTarget: 0,
    }, 1 / 60, { automatic: true, grade: 0 })
    assert.ok(Number.isFinite(car.speed) && Number.isFinite(car.heading))
    assert.ok(Number.isFinite(car.lateralSpeed) && Number.isFinite(car.yawRate))
    assert.ok(Number.isFinite(car.x) && Number.isFinite(car.z))
  }
  assert.ok(car.speed > 0, 'impact must not strand the car in reverse or NaN')
})
