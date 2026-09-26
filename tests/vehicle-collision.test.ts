import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateConeImpact,
  checkVehicleCircleCollision,
  resolveRigidCircleObstacle,
} from '../src/sim/vehicleCollision'
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

test('calculateConeImpact produces valid tilt axis and slide direction', () => {
  const vehicle = { x: 0, z: 0, heading: 0, speed: 2.0 }
  const obstacle = { x: 0, z: -2.2, radius: 0.2 }
  const collision = checkVehicleCircleCollision(vehicle, obstacle)
  const impact = calculateConeImpact(vehicle, obstacle, collision)

  assert.ok(impact.impactSpeed >= 2.0)
  // Moving forward in -Z: slideDir should be along -Z
  assert.ok(Math.abs(impact.slideDir[0]) < 1e-4)
  assert.ok(impact.slideDir[1] < -0.9)
  // Knock axis should be perpendicular to dir: (0, 0, -1) has knockAxis = (-1, 0, 0)
  assert.ok(impact.knockAxis[0] < -0.9)
  assert.equal(impact.knockAxis[1], 0)
})

test('calculateConeImpact handles reverse driving impact', () => {
  const vehicle = { x: 0, z: 0, heading: 0, speed: -1.5 }
  const obstacle = { x: 0, z: 2.2, radius: 0.2 }
  const collision = checkVehicleCircleCollision(vehicle, obstacle)
  const impact = calculateConeImpact(vehicle, obstacle, collision)

  assert.ok(impact.impactSpeed >= 1.5)
  // Reversing towards +Z: slideDir should be along +Z
  assert.ok(impact.slideDir[1] > 0.9)
  // Knock axis should be (1, 0, 0)
  assert.ok(impact.knockAxis[0] > 0.9)
})

test('resolveRigidCircleObstacle pushes car out and stops velocity', () => {
  const halfLength = TRAINING_CAR.lengthMeters / 2
  const vehicle = { x: 0, z: 0, heading: 0, speed: 2.5 }
  // Obstacle penetrated 0.05m inside front bumper
  const obstacle = { x: 0, z: -(halfLength - 0.05), radius: 0.15 }

  const outcome = resolveRigidCircleObstacle(vehicle, obstacle)
  assert.equal(outcome.collided, true)
  assert.equal(vehicle.speed, 0)
  // Vehicle should have been pushed backward (towards +Z, away from front obstacle)
  assert.ok(vehicle.z > 0.05)

  // Re-checking after push-back should show no penetration
  const recheck = checkVehicleCircleCollision(vehicle, obstacle)
  assert.equal(recheck.colliding, false)
})
