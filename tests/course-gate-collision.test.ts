import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveCircleImpact } from '../src/sim/collisionResponse'
import { checkVehicleCircleCollision } from '../src/sim/vehicleCollision'
import { TRAINING_CAR } from '../src/sim/vehicleDimensions'
import { worldPointFromVehicle } from '../src/sim/vehicleFrame'
import { stepVehiclePhysics, type PhysicsVehicle } from '../src/sim/vehiclePhysics'
import { COURSE_GATE_GEOMETRY, courseGatePosts } from '../src/subject2/courseGateGeometry'
import { localPoseToWorld } from '../src/subject2/courseTransform'
import {
  SUBJECT2_C1_SEQUENCE,
  subject2ExamWorldStartPose,
} from '../src/subject2/subject2ExamLayout'

const near = (actual: number, expected: number, epsilon = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`)

test('all five course gates share their rendered left/right post positions', () => {
  assert.equal(SUBJECT2_C1_SEQUENCE.length, 5)
  for (const project of SUBJECT2_C1_SEQUENCE) {
    const pose = subject2ExamWorldStartPose(project)
    const posts = courseGatePosts(pose)
    assert.equal(posts.length, 2)
    assert.deepEqual(posts.map(post => post.side), ['left', 'right'])
    for (const post of posts) {
      const rendered = localPoseToWorld({ x: post.localX, z: 0, heading: 0 }, pose)
      near(post.x, rendered.x)
      near(post.z, rendered.z)
      near(post.radius, COURSE_GATE_GEOMETRY.postRadiusMeters)
    }
  }
})

test('course gates remain open for centered forward and reverse travel', () => {
  for (const project of SUBJECT2_C1_SEQUENCE) {
    const pose = subject2ExamWorldStartPose(project)
    const posts = courseGatePosts(pose)
    for (const speed of [-2, 2]) {
      for (let longitudinal = -4; longitudinal <= 4; longitudinal += 0.25) {
        const position = worldPointFromVehicle(pose.x, pose.z, pose.heading, longitudinal)
        const player = { ...position, heading: pose.heading, speed }
        for (const post of posts) {
          const result = resolveCircleImpact(player, post, 'pole')
          assert.equal(result.collided, false, `${project} center opening must remain passable`)
        }
        near(player.speed, speed)
        near(player.x, position.x)
        near(player.z, position.z)
      }
    }
  }
})

for (const heading of [0, Math.PI / 2, -0.63, Math.PI]) {
  test(`rotated gate posts resolve front, reverse and side contact at heading ${heading}`, () => {
    const gate = { x: 17.3, z: -21.8, heading }
    for (const post of courseGatePosts(gate)) {
      for (const approach of [-1, 1] as const) {
        const distance = TRAINING_CAR.lengthMeters / 2 + post.radius
        const position = worldPointFromVehicle(post.x, post.z, heading, -approach * distance)
        const player = { ...position, heading, speed: approach * 2 }
        assert.equal(checkVehicleCircleCollision(player, post).colliding, true)
        const result = resolveCircleImpact(player, post, 'pole')
        assert.equal(result.collided, true)
        near(result.impactSpeed, 2)
        near(player.speed, 0)
        assert.equal(checkVehicleCircleCollision(player, post).colliding, false)

        const safePosition = worldPointFromVehicle(post.x, post.z, heading, -approach * (distance + 1e-5))
        const safePlayer = { ...safePosition, heading, speed: approach * 2 }
        assert.equal(resolveCircleImpact(safePlayer, post, 'pole').collided, false)
        near(safePlayer.speed, approach * 2)
      }

      const lateralContact = TRAINING_CAR.widthMeters / 2 + post.radius
      const inward = post.side === 'left' ? 1 : -1
      const sidePosition = worldPointFromVehicle(post.x, post.z, heading, 0, inward * lateralContact)
      const sidePlayer = { ...sidePosition, heading, speed: 2 }
      const sideImpact = resolveCircleImpact(sidePlayer, post, 'pole')
      assert.equal(sideImpact.collided, true)
      near(sideImpact.impactSpeed, 0)
      near(sidePlayer.speed, 2)
      assert.equal(checkVehicleCircleCollision(sidePlayer, post).colliding, false)

      const safeSide = worldPointFromVehicle(post.x, post.z, heading, 0, inward * (lateralContact + 1e-5))
      assert.equal(resolveCircleImpact({ ...safeSide, heading, speed: 2 }, post, 'pole').collided, false)
    }
  })
}

test('physics-integrated gate impact stops entry but allows reverse escape with engine running', () => {
  const gate = subject2ExamWorldStartPose('reverse-parking')
  const post = courseGatePosts(gate)[1]
  const start = worldPointFromVehicle(post.x, post.z, gate.heading, -4)
  const player: PhysicsVehicle = {
    ...start, heading: gate.heading, speed: 0,
    steering: 0, steeringWheelAngle: 0, throttle: 0, brake: 0, clutch: 0,
    gear: 1, engineOn: true, engineRpm: 820, stallTimer: 0, handbrake: false,
  }
  const input = { throttle: 0.4, brake: 0, clutch: 0, steer: 0 }
  let collided = false
  for (let frame = 0; frame < 600; frame += 1) {
    stepVehiclePhysics(player, input, 1 / 60, { automatic: true, grade: 0 })
    if (resolveCircleImpact(player, post, 'pole').collided) {
      collided = true
      break
    }
  }
  assert.equal(collided, true)
  near(player.speed, 0)
  assert.equal(player.engineOn, true)
  const stoppedDistance = Math.hypot(player.x - post.x, player.z - post.z)

  player.gear = -1
  for (let frame = 0; frame < 180; frame += 1) {
    stepVehiclePhysics(player, input, 1 / 60, { automatic: true, grade: 0 })
    assert.equal(resolveCircleImpact(player, post, 'pole').collided, false)
  }
  assert.ok(player.speed < -0.5)
  assert.ok(Math.hypot(player.x - post.x, player.z - post.z) > stoppedDistance + 1)
  assert.equal(player.engineOn, true)
})
