import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyCollisionMotion,
  createCollisionMotion,
  stepCollisionMotion,
} from '../src/sim/collisionResponse'
import { TRAINING_CAR } from '../src/sim/vehicleDimensions'
import { forwardFromHeading, worldPointFromVehicle } from '../src/sim/vehicleFrame'
import { stepVehiclePhysics, type PhysicsVehicle } from '../src/sim/vehiclePhysics'
import {
  SUBJECT3_TRAFFIC_CAR,
  createSubject3TrafficState,
  resolveSubject3VehicleCollision,
  subject3VehicleCollision,
  updateSubject3TrafficAfterImpact,
} from '../src/subject3/subject3Traffic'
import { poseAtRouteDistance } from '../src/subject3/subject3Route'

const near = (actual: number, expected: number, epsilon = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`)

function playerAt(x: number, z: number, heading: number, speed = 0): PhysicsVehicle {
  return {
    x, z, heading, speed,
    steering: 0, steeringWheelAngle: 0, throttle: 0, brake: 0, clutch: 0,
    gear: 1, engineOn: true, engineRpm: 820, stallTimer: 0, handbrake: false,
  }
}

test('Subject 3 car contact uses relative actor motion without changing the stationary player ignition', () => {
  const heading = -0.7
  const player = playerAt(12, -30, heading)
  const contactDistance = (TRAINING_CAR.lengthMeters + SUBJECT3_TRAFFIC_CAR.lengthMeters) / 2
  const actorPosition = worldPointFromVehicle(player.x, player.z, heading, contactDistance - 0.02)
  const actor = { ...actorPosition, heading: heading + Math.PI }
  const actorForward = forwardFromHeading(actor.heading)
  const impact = resolveSubject3VehicleCollision(player, actor, {
    x: actorForward.x * 3,
    z: actorForward.z * 3,
  })

  assert.equal(impact.collided, true)
  assert.equal(impact.kind, 'vehicle')
  near(impact.impactSpeed, 3)
  near(player.speed, 0)
  assert.ok(impact.strength > 0)
  assert.equal(player.engineOn, true)
  assert.equal(subject3VehicleCollision(player, actor), false)
})

test('Subject 3 head-on contact combines both approach speeds and does not synthesize reversing', () => {
  const player = playerAt(0, 0, 0, 4)
  const actor = {
    x: 0,
    z: -(TRAINING_CAR.lengthMeters + SUBJECT3_TRAFFIC_CAR.lengthMeters) / 2 + 0.01,
    heading: Math.PI,
  }
  const impact = resolveSubject3VehicleCollision(player, actor, { x: 0, z: 6 })
  assert.equal(impact.collided, true)
  near(impact.impactSpeed, 10)
  near(player.speed, 0)
  assert.equal(player.engineOn, true)
  assert.equal(subject3VehicleCollision(player, actor), false)
})

test('matching traffic speed produces no impact impulse even when contact needs separation', () => {
  const heading = Math.PI / 2
  const player = playerAt(0, 0, heading, 4)
  const actor = { x: 4, z: 0, heading }
  const impact = resolveSubject3VehicleCollision(player, actor, { x: 4, z: 0 })
  assert.equal(impact.collided, true)
  near(impact.impactSpeed, 0)
  near(impact.strength, 0)
  near(player.speed, 4)
  assert.equal(subject3VehicleCollision(player, actor), false)
})

test('physics-integrated traffic impact moves its actor then permits braking and reverse escape', () => {
  const routePose = poseAtRouteDistance(200)
  const player = playerAt(routePose.x, routePose.z, routePose.heading)
  const actor = {
    ...worldPointFromVehicle(routePose.x, routePose.z, routePose.heading, 7),
    heading: routePose.heading,
  }
  const motion = createCollisionMotion()
  const traffic = createSubject3TrafficState()
  const dt = 1 / 60
  const drive = { throttle: 0.4, brake: 0, clutch: 0, steer: 0 }
  const options = { automatic: true, grade: 0 }
  let firstImpactSpeed = 0
  let collided = false

  for (let frame = 0; frame < 600; frame += 1) {
    stepVehiclePhysics(player, drive, dt, options)
    const incomingSpeed = player.speed
    const impact = resolveSubject3VehicleCollision(player, actor)
    if (impact.collided) {
      collided = true
      firstImpactSpeed = impact.impactSpeed
      assert.ok(player.speed > 0 && player.speed < incomingSpeed, 'a traffic car absorbs part of the impact')
      applyCollisionMotion(motion, impact)
      break
    }
  }
  assert.equal(collided, true)
  assert.ok(firstImpactSpeed > 0.5)
  assert.equal(motion.active, true)

  const currentActor = () => ({
    x: actor.x + motion.offsetX,
    z: actor.z + motion.offsetZ,
    heading: actor.heading,
  })
  for (let frame = 0; frame < 120; frame += 1) {
    stepVehiclePhysics(player, { ...drive, throttle: 0, brake: 1 }, dt, options)
    stepCollisionMotion(motion, 'vehicle', dt)
    const impact = resolveSubject3VehicleCollision(player, currentActor(), {
      x: motion.velocityX,
      z: motion.velocityZ,
    })
    applyCollisionMotion(motion, impact)
  }
  const record = updateSubject3TrafficAfterImpact(traffic, 'impact-target', actor, motion, false)
  assert.ok(record.progress > 207, 'pushed traffic is published at its displaced route position')
  assert.equal(record.opposite, false)
  near(player.speed, 0)
  assert.equal(player.engineOn, true)

  const beforeReverse = Math.hypot(player.x - currentActor().x, player.z - currentActor().z)
  player.gear = -1
  for (let frame = 0; frame < 180; frame += 1) {
    stepVehiclePhysics(player, drive, dt, options)
    stepCollisionMotion(motion, 'vehicle', dt)
    const impact = resolveSubject3VehicleCollision(player, currentActor(), {
      x: motion.velocityX,
      z: motion.velocityZ,
    })
    assert.equal(impact.collided, false)
  }
  assert.ok(player.speed < -0.5)
  assert.ok(Math.hypot(player.x - currentActor().x, player.z - currentActor().z) > beforeReverse + 1)
  assert.equal(player.engineOn, true)
})
