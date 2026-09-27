import assert from 'node:assert/strict'
import test from 'node:test'
import { Euler, Vector3 } from 'three'
import {
  actorContactCircles,
  COLLISION_ACTOR_DIMENSIONS,
  type CompactCollisionActorKind,
} from '../src/sim/collisionActorGeometry'
import { checkVehicleCircleCollision, type CircleObstacle, type VehiclePose } from '../src/sim/vehicleCollision'
import { TRAINING_CAR } from '../src/sim/vehicleDimensions'
import { rightFromHeading, sceneYawFromHeading, worldPointFromVehicle } from '../src/sim/vehicleFrame'

const upright = { tiltX: 0, tiltZ: 0 }
const origin = { x: 0, z: 0, heading: 0 }
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`)

function renderedPoint(
  local: Vector3,
  pose: VehiclePose,
  tilt: { tiltX: number; tiltZ: number; yaw?: number },
) {
  return local.clone()
    .applyEuler(new Euler(tilt.tiltX, tilt.yaw ?? 0, tilt.tiltZ, 'XYZ'))
    .applyEuler(new Euler(0, sceneYawFromHeading(pose.heading), 0, 'XYZ'))
    .add(new Vector3(pose.x, 0, pose.z))
}

function covered(circles: CircleObstacle[], point: Vector3, label: string) {
  assert.ok(circles.some(circle => Math.hypot(point.x - circle.x, point.z - circle.z) <= circle.radius + 1e-9), label)
}

test('upright pedestrian retains compact standing clearance and separate head proxies', () => {
  const circles = actorContactCircles('pedestrian', origin, upright)
  assert.equal(circles.length, 7)
  assert.equal(Math.max(...circles.map(circle => circle.radius)), COLLISION_ACTOR_DIMENSIONS.pedestrian.standingRadius)
  assert.ok(circles.every(circle => Math.hypot(circle.x, circle.z) + circle.radius <= 0.35))
  assert.ok(circles.some(circle => circle.radius === COLLISION_ACTOR_DIMENSIONS.pedestrian.headRadius))
})

test('upright scooter uses a narrow capsule with distinct upper rider coverage', () => {
  const circles = actorContactCircles('scooter', origin, upright)
  assert.equal(circles.length, 13)
  assert.ok(circles.every(circle => circle.radius <= 0.35))
  assert.ok(Math.max(...circles.map(circle => Math.abs(circle.x) + circle.radius)) <= 0.35)
  assert.ok(Math.min(...circles.map(circle => circle.z - circle.radius)) > -0.75)
  assert.ok(Math.max(...circles.map(circle => circle.z + circle.radius)) < 0.85)
  assert.ok(circles.some(circle => circle.z === COLLISION_ACTOR_DIMENSIONS.scooter.frontWheelZ))
  assert.ok(circles.some(circle => circle.z === COLLISION_ACTOR_DIMENSIONS.scooter.rearWheelZ))
})

test('left and right leaning heads track vehicle-local directions under rotated headings', () => {
  for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 3]) {
    for (const direction of [-1, 1]) {
      const pose = { x: 12, z: -7, heading }
      const tilt = { tiltX: 0, tiltZ: -direction * 0.4 }
      const head = actorContactCircles('pedestrian', pose, tilt)[5]
      const right = rightFromHeading(heading)
      const actualRight = (head.x - pose.x) * right.x + (head.z - pose.z) * right.z
      close(actualRight, direction * COLLISION_ACTOR_DIMENSIONS.pedestrian.headCenterY * Math.sin(0.4))
      const expected = renderedPoint(new Vector3(0, 1.5, 0), pose, tilt)
      close(head.x, expected.x)
      close(head.z, expected.z)
    }
  }
})

test('combined local Euler tilt followed by yaw matches rendered heads and displaced scooter wheels', () => {
  for (const heading of [0, 0.7, -Math.PI / 2, Math.PI]) {
    const pose = { x: -11.3, z: 8.7, heading }
    const tilt = { tiltX: -0.31, tiltZ: 1.1 }
    const pedestrianCircles = actorContactCircles('pedestrian', pose, tilt)
    const scooterCircles = actorContactCircles('scooter', pose, tilt)
    const pedHead = renderedPoint(new Vector3(0, 1.5, 0), pose, tilt)
    const riderHead = renderedPoint(new Vector3(0, 1.3, 0), pose, tilt)
    const frontWheel = renderedPoint(new Vector3(0, 0.18, -0.48), pose, tilt)
    close(pedestrianCircles[5].x, pedHead.x)
    close(pedestrianCircles[5].z, pedHead.z)
    close(scooterCircles[12].x, riderHead.x)
    close(scooterCircles[12].z, riderHead.z)
    close(scooterCircles[0].x, frontWheel.x)
    close(scooterCircles[0].z, frontWheel.z)
  }
})

test('leaning pedestrian proxies cover the rendered torso, head, shoulders and neutral feet', () => {
  const points: Vector3[] = []
  for (const x of [-0.17, 0.17]) for (const y of [0.84, 1.32]) for (const z of [-0.11, 0.11]) {
    points.push(new Vector3(x, y, z))
  }
  for (const x of [-0.262, 0.262]) for (const y of [0.88, 1.26]) points.push(new Vector3(x, y, 0))
  for (const x of [-0.145, 0.145]) for (const z of [-0.12, 0.06]) points.push(new Vector3(x, 0.06, z))
  points.push(new Vector3(0, 1.63, 0), new Vector3(0, 1.692, -0.01))
  for (const tilt of [upright, { tiltX: 0.27, tiltZ: -0.29 }, { tiltX: -0.31, tiltZ: 0.25 }, { tiltX: 0, tiltZ: Math.PI / 2 }]) {
    const pose = { x: 8, z: 3, heading: 1.2 }
    const circles = actorContactCircles('pedestrian', pose, tilt)
    for (const point of points) covered(circles, renderedPoint(point, pose, tilt), `pedestrian ${point.toArray()} / ${JSON.stringify(tilt)}`)
  }
})

test('fallen scooter proxies cover visible bike corners, handlebars and rider overhang', () => {
  const points: Vector3[] = []
  const box = (position: [number, number, number], halfSize: [number, number, number], rotationX = 0) => {
    for (const x of [-halfSize[0], halfSize[0]]) for (const y of [-halfSize[1], halfSize[1]]) for (const z of [-halfSize[2], halfSize[2]]) {
      points.push(new Vector3(x, y, z).applyEuler(new Euler(rotationX, 0, 0)).add(new Vector3(...position)))
    }
  }
  box([0, 0.18, 0], [0.19, 0.04, 0.475])
  box([0, 0.52, -0.42], [0.16, 0.29, 0.07], 0.18)
  box([0, 0.42, 0.22], [0.17, 0.18, 0.3])
  box([0, 0.62, 0.18], [0.16, 0.04, 0.26])
  box([0, 0.68, 0.52], [0.19, 0.18, 0.17])
  box([0, 0.95, 0.06], [0.17, 0.225, 0.11], 0.16)
  box([0, 1.29, -0.1], [0.08, 0.035, 0.03])
  points.push(new Vector3(-0.326, 0.82, -0.38), new Vector3(0.326, 0.82, -0.38), new Vector3(0, 1.45, 0))
  for (const tilt of [upright, { tiltX: 0.12, tiltZ: -1.1 }, { tiltX: -0.12, tiltZ: 1.1 }, { tiltX: 0, tiltZ: Math.PI / 2 }]) {
    const pose = { x: -8, z: -3, heading: -0.83 }
    const circles = actorContactCircles('scooter', pose, tilt)
    for (const point of points) covered(circles, renderedPoint(point, pose, tilt), `scooter ${point.toArray()} / ${JSON.stringify(tilt)}`)
  }
})

test('collision yaw keeps compact proxies aligned with the rendered actor', () => {
  const pose = { x: 5.2, z: -9.4, heading: 0.73 }
  const tilt = { tiltX: -0.24, tiltZ: 1.18, yaw: 0.82 }
  const pedestrianCircles = actorContactCircles('pedestrian', pose, tilt)
  const scooterCircles = actorContactCircles('scooter', pose, tilt)
  const pedestrianHead = renderedPoint(new Vector3(0, 1.5, 0), pose, tilt)
  const scooterHead = renderedPoint(new Vector3(0, 1.3, 0), pose, tilt)
  const frontWheel = renderedPoint(new Vector3(0, 0.18, -0.48), pose, tilt)
  close(pedestrianCircles[5].x, pedestrianHead.x)
  close(pedestrianCircles[5].z, pedestrianHead.z)
  close(scooterCircles[12].x, scooterHead.x)
  close(scooterCircles[12].z, scooterHead.z)
  close(scooterCircles[0].x, frontWheel.x)
  close(scooterCircles[0].z, frontWheel.z)
})

test('vehicle contact occurs at the exact outer proxy boundary with a real gap remaining safe', () => {
  for (const kind of ['pedestrian', 'scooter'] as CompactCollisionActorKind[]) {
    for (const heading of [0, 0.71, Math.PI / 2]) {
      for (const tilt of [upright, { tiltX: -0.1, tiltZ: -1.1 }]) {
        const pose = { x: 4, z: -6, heading }
        const circles = actorContactCircles(kind, pose, tilt)
        const right = rightFromHeading(heading)
        const rightEdge = Math.max(...circles.map(circle => (circle.x - pose.x) * right.x + (circle.z - pose.z) * right.z + circle.radius))
        const vehicleAtGap = (gap: number) => ({
          ...worldPointFromVehicle(pose.x, pose.z, heading, 0, rightEdge + TRAINING_CAR.widthMeters / 2 + gap),
          heading,
        })
        assert.ok(circles.some(circle => checkVehicleCircleCollision(vehicleAtGap(0), circle).colliding), `${kind} touching`)
        assert.ok(circles.every(circle => !checkVehicleCircleCollision(vehicleAtGap(1e-5), circle).colliding), `${kind} separated`)
        assert.ok(circles.some(circle => checkVehicleCircleCollision(vehicleAtGap(-1e-5), circle).penetration > 0), `${kind} overlapping`)
      }
    }
  }
})
