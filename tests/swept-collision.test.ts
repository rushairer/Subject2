import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveSweptCircleImpact,
  resolveSweptCircleCompoundImpact,
  resolveSweptPolygonImpact,
  resolveSweptVehicleImpact,
} from '../src/sim/collisionResponse'
import {
  checkVehicleCircleCollision,
  vehiclePoseBeforePhysics,
  type InteractiveVehicle,
} from '../src/sim/vehicleCollision'
import {
  sweptCircleContactFraction,
  sweptVehicleContactFraction,
} from '../src/sim/sweptCollision'
import { TRAINING_CAR } from '../src/sim/vehicleDimensions'
import { forwardFromHeading, worldPointFromVehicle } from '../src/sim/vehicleFrame'
import { stepVehiclePhysics, type PhysicsVehicle } from '../src/sim/vehiclePhysics'
import { convexPolygonsIntersect } from '../src/sim/planarGeometry'
import { orientedRectangleFootprint, vehicleBodyFootprint } from '../src/sim/vehicleFootprint'

function car(x: number, z: number, heading: number, speed: number): InteractiveVehicle {
  return { x, z, heading, speed }
}

const close = (actual: number, expected: number, tolerance = 1e-5) =>
  assert.ok(Math.abs(actual - expected) < tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`)

test('a fast car cannot tunnel through a narrow pole between disjoint frame endpoints', () => {
  const before = car(0, 0, 0, 18)
  const after = car(0, -8, 0, 18)
  const pole = { x: 0, z: -5, radius: 0.06 }
  assert.equal(checkVehicleCircleCollision(before, pole).colliding, false)
  assert.equal(checkVehicleCircleCollision(after, pole).colliding, false)

  const contact = resolveSweptCircleImpact(after, before, pole, 'pole')
  assert.equal(contact.collided, true)
  close(contact.impactSpeed, 18)
  close(after.speed, 0)
  assert.ok(after.z > -3 && after.z < -2.5, 'the car stops at its FIRST contact, not beyond the pole')
  assert.equal(checkVehicleCircleCollision(after, pole).colliding, false)
})

test('reverse sweep uses the rear bumper and never invents forward motion', () => {
  const before = car(0, 0, 0, -16)
  const after = car(0, 8, 0, -16)
  const pole = { x: 0, z: 5, radius: 0.08 }
  assert.equal(checkVehicleCircleCollision(after, pole).colliding, false)
  const impact = resolveSweptCircleImpact(after, before, pole, 'tree')
  assert.equal(impact.collided, true)
  close(impact.impactSpeed, 16)
  assert.ok(after.z > 2 && after.z < 3)
  assert.ok(after.speed <= 0)
})

test('a rotated world placement gives the same swept bumper collision', () => {
  const heading = Math.PI / 2
  const before = car(12, -30, heading, 18)
  const endPoint = worldPointFromVehicle(before.x, before.z, heading, 8)
  const actorPoint = worldPointFromVehicle(before.x, before.z, heading, 5)
  const after = car(endPoint.x, endPoint.z, heading, 18)
  const impact = resolveSweptCircleImpact(after, before,
    { ...actorPoint, radius: 0.06 }, 'pole')
  assert.equal(impact.collided, true)
  assert.ok(after.x > before.x + 2.5 && after.x < before.x + 3)
  close(after.z, before.z)
})

test('a narrow but genuine lateral clearance must not become a swept crash', () => {
  const before = car(0, 0, 0, 18)
  const after = car(0, -8, 0, 18)
  const pole = { x: TRAINING_CAR.widthMeters / 2 + 0.06 + 0.025,
    z: -5, radius: 0.06 }
  assert.equal(sweptCircleContactFraction(before, after, pole, pole), null)
  const impact = resolveSweptCircleImpact(after, before, pole, 'pole')
  assert.equal(impact.collided, false)
  close(after.z, -8)
  close(after.speed, 18)
})

test('a moving pedestrian crossing a stopped car is caught between clear endpoints', () => {
  const before = car(0, 0, 0, 0)
  const after = car(0, 0, 0, 0)
  const from = { x: -4, z: 0, radius: 0.16 }
  const to = { x: 4, z: 0, radius: 0.16 }
  assert.equal(checkVehicleCircleCollision(before, from).colliding, false)
  assert.equal(checkVehicleCircleCollision(after, to).colliding, false)
  const impact = resolveSweptCircleImpact(after, before, to,
    'pedestrian', { x: 8, z: 0 }, from)
  assert.equal(impact.collided, true)
  close(impact.impactSpeed, 8)
  close(after.speed, 0)
  assert.ok(impact.actorVelocity.x > 0)
})

test('swept compound cone uses one impact, not one impulse per proxy', () => {
  const before = car(0, 0, 0, 12)
  const after = car(0, -8, 0, 12)
  const circles = [
    { x: 0, z: -5, radius: 0.1 },
    { x: 0.12, z: -5, radius: 0.1 },
  ]
  const impact = resolveSweptCircleCompoundImpact(after, before, circles, 'cone')
  assert.equal(impact.collided, true)
  assert.ok(impact.impactSpeed > 10)
  assert.ok(after.speed > 10, 'a small cone should not stop a moving car')
  assert.ok(after.z > -3 && after.z < -2.5)
  for (const circle of circles) {
    assert.equal(checkVehicleCircleCollision(after, circle).colliding, false)
  }
})

test('moving vehicle sweeps preserve the oriented actor footprint, not a center circle', () => {
  const before = car(0, 0, 0, 17)
  const after = car(0, -12, 0, 17)
  const actor = { x: 0, z: -6, heading: Math.PI / 2 }
  const dimensions = { lengthMeters: 4.2, widthMeters: 1.9 }
  assert.equal(convexPolygonsIntersect(vehicleBodyFootprint(before),
    orientedRectangleFootprint(actor, dimensions.lengthMeters, dimensions.widthMeters)), false)
  assert.equal(convexPolygonsIntersect(vehicleBodyFootprint(after),
    orientedRectangleFootprint(actor, dimensions.lengthMeters, dimensions.widthMeters)), false)
  const impact = resolveSweptVehicleImpact(after, before, actor, dimensions)
  assert.equal(impact.collided, true)
  assert.ok(impact.impactSpeed > 10)
  assert.ok(after.speed > 0 && after.speed < 17)
  assert.ok(after.z > -4 && after.z < -2)
  assert.equal(convexPolygonsIntersect(vehicleBodyFootprint(after),
    orientedRectangleFootprint(actor, dimensions.lengthMeters, dimensions.widthMeters)), false)
})

test('an oncoming car crossing a stopped player is detected from relative travel', () => {
  const player = car(0, 0, 0, 0)
  const actorBefore = { x: -6, z: 0, heading: Math.PI / 2 }
  const actorAfter = { x: 6, z: 0, heading: Math.PI / 2 }
  const dimensions = { lengthMeters: 4.2, widthMeters: 1.9 }
  assert.equal(sweptVehicleContactFraction(player, player, actorBefore,
    actorAfter, dimensions) !== null, true)
  const impact = resolveSweptVehicleImpact(player, player,
    actorAfter, dimensions, { x: 12, z: 0 }, actorBefore)
  assert.equal(impact.collided, true)
  close(impact.impactSpeed, 12)
  close(player.speed, 0)
})

test('thin building footprints block a high-speed sweep but leave adjacent roads clear', () => {
  const wall = [
    { x: -0.1, z: -5.08 }, { x: 0.1, z: -5.08 },
    { x: 0.1, z: -4.92 }, { x: -0.1, z: -4.92 },
  ]
  const before = car(0, 0, 0, 15)
  const after = car(0, -8, 0, 15)
  const impact = resolveSweptPolygonImpact(after, before, wall)
  assert.equal(impact.collided, true)
  assert.ok(after.z > -3 && after.z < -2)
  close(after.speed, 0)
  assert.equal(convexPolygonsIntersect(vehicleBodyFootprint(after), wall), false)

  const bypass = car(4, -8, 0, 15)
  assert.equal(resolveSweptPolygonImpact(bypass, car(4, 0, 0, 15), wall).collided, false)
  close(bypass.z, -8)
})

test('teleport-like pose changes and nonfinite actors are not fabricated collisions', () => {
  const before = car(0, 0, 0, 15)
  const after = car(0, -100, 0, 15)
  const pole = { x: 0, z: -50, radius: 0.1 }
  assert.equal(sweptCircleContactFraction(before, after, pole, pole), null)
  const impact = resolveSweptCircleImpact(after, before, pole, 'pole')
  assert.equal(impact.collided, false)
  close(after.z, -100)
  assert.equal(sweptCircleContactFraction(before, car(0, -8, 0, 15),
    { x: NaN, z: -5, radius: 0.1 }, pole), null)
})

test('physics supplies a fresh immutable frame-start pose to every collision adapter', () => {
  const player: PhysicsVehicle = {
    x: 0, z: 0, heading: 0, speed: 18,
    steering: 0, steeringWheelAngle: 0, throttle: 0,
    brake: 0, clutch: 0, gear: 0,
    engineOn: false, engineRpm: 0, stallTimer: 0, handbrake: false,
  }
  const before = { x: player.x, z: player.z, heading: player.heading }
  const options = { automatic: true, grade: 0 }
  const controls = { throttle: 0, brake: 0, clutch: 0, steer: 0 }
  stepVehiclePhysics(player, controls, 0.05, options)
  assert.deepEqual(vehiclePoseBeforePhysics(player), before)
  assert.ok(player.z < -0.8)
  const secondBefore = { x: player.x, z: player.z, heading: player.heading }
  stepVehiclePhysics(player, controls, 0.05, options)
  assert.deepEqual(vehiclePoseBeforePhysics(player), secondBefore)
  assert.notDeepEqual(vehiclePoseBeforePhysics(player), before)

  const actorPose = worldPointFromVehicle(before.x, before.z, before.heading, 2.75)
  const impact = resolveSweptCircleImpact(player, vehiclePoseBeforePhysics(player),
    { ...actorPose, radius: 0.08 }, 'pole')
  assert.equal(impact.collided, true)
  assert.ok(player.speed < 18)
  const forward = forwardFromHeading(player.heading)
  assert.ok(Number.isFinite(forward.x) && Number.isFinite(forward.z))
})
