import assert from 'node:assert/strict'
import test from 'node:test'
import { checkVehicleCircleCollision } from '../src/sim/vehicleCollision'
import { TRAINING_CAR } from '../src/sim/vehicleDimensions'

test('vehicle collision detects clear separation', () => {
  const vehicle = { x: 0, z: 0, heading: 0 }
  const obstacle = { x: 10, z: 10, radius: 0.2 }
  const result = checkVehicleCircleCollision(vehicle, obstacle)

  assert.equal(result.colliding, false)
  assert.ok(result.distance > 5)
  assert.equal(result.penetration, 0)
})

test('vehicle collision detects contact at front bumper', () => {
  // heading = 0 -> forward is -Z
  const halfLength = TRAINING_CAR.lengthMeters / 2
  const vehicle = { x: 0, z: 0, heading: 0 }
  // Place obstacle 0.05m beyond front bumper, with radius 0.15m -> penetration 0.10m
  const obstacle = { x: 0, z: -(halfLength + 0.05), radius: 0.15 }
  const result = checkVehicleCircleCollision(vehicle, obstacle)

  assert.equal(result.colliding, true)
  assert.ok(Math.abs(result.penetration - 0.10) < 1e-4)
  assert.ok(result.normal.z < -0.9) // Points towards -Z (vehicle forward)
})

test('vehicle collision detects contact at rear bumper when reversing', () => {
  // heading = 0 -> rear is +Z
  const halfLength = TRAINING_CAR.lengthMeters / 2
  const vehicle = { x: 0, z: 0, heading: 0 }
  const obstacle = { x: 0, z: halfLength + 0.04, radius: 0.16 }
  const result = checkVehicleCircleCollision(vehicle, obstacle)

  assert.equal(result.colliding, true)
  assert.ok(Math.abs(result.penetration - 0.12) < 1e-4)
  assert.ok(result.normal.z > 0.9) // Points towards +Z (rear)
})

test('vehicle collision detects side body contact', () => {
  // heading = 0 -> right is +X
  const halfWidth = TRAINING_CAR.widthMeters / 2
  const vehicle = { x: 0, z: 0, heading: 0 }
  const obstacle = { x: halfWidth + 0.05, z: 0, radius: 0.20 }
  const result = checkVehicleCircleCollision(vehicle, obstacle)

  assert.equal(result.colliding, true)
  assert.ok(Math.abs(result.penetration - 0.15) < 1e-4)
  assert.ok(result.normal.x > 0.9) // Points right towards +X
})

test('vehicle collision handles rotated vehicle heading', () => {
  // heading = PI/2 -> forward is +X, right is +Z
  const halfLength = TRAINING_CAR.lengthMeters / 2
  const vehicle = { x: 5, z: 5, heading: Math.PI / 2 }
  const obstacle = { x: 5 + halfLength + 0.05, z: 5, radius: 0.20 }
  const result = checkVehicleCircleCollision(vehicle, obstacle)

  assert.equal(result.colliding, true)
  assert.ok(Math.abs(result.penetration - 0.15) < 1e-4)
  assert.ok(result.normal.x > 0.9) // Points along +X (forward)
})

test('vehicle collision resolves the nearest normal when a circle center is inside the bumper', () => {
  const halfLength = TRAINING_CAR.lengthMeters / 2
  const vehicle = { x: 0, z: 0, heading: 0 }
  const obstacle = { x: 0, z: -(halfLength - 0.05), radius: 0.15 }
  const contact = checkVehicleCircleCollision(vehicle, obstacle)
  assert.equal(contact.colliding, true)
  assert.ok(Math.abs(contact.penetration - 0.2) < 1e-9)
  assert.ok(Math.abs(contact.distance + 0.05) < 1e-9)
  assert.deepEqual(contact.normal, { x: 0, z: -1 })
})

test('circle contact starts exactly at the body perimeter and rejects a measurable gap', () => {
  const halfLength = TRAINING_CAR.lengthMeters / 2
  const pedRadius = 0.35
  const vehicle = { x: 0, z: 0, heading: 0 }
  const exact = checkVehicleCircleCollision(vehicle, { x: 0, z: -(halfLength + pedRadius), radius: pedRadius })
  assert.equal(exact.colliding, true)
  assert.ok(exact.penetration >= 0 && exact.penetration < 1e-9)
  const shallow = checkVehicleCircleCollision(vehicle, { x: 0, z: -(halfLength + pedRadius - 0.02), radius: pedRadius })
  assert.equal(shallow.colliding, true)
  assert.ok(Math.abs(shallow.penetration - 0.02) < 1e-9)
  const separated = checkVehicleCircleCollision(vehicle, { x: 0, z: -(halfLength + pedRadius + 1e-6), radius: pedRadius })
  assert.equal(separated.colliding, false)
})
