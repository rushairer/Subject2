import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import {
  applyCollisionMotion,
  collisionMotionPose,
  createCollisionMotion,
  resolveCircleCompoundImpact,
  stepCollisionMotion,
} from '../src/sim/collisionResponse'
import { checkVehicleCircleCollision } from '../src/sim/vehicleCollision'
import { TRAINING_CAR } from '../src/sim/vehicleDimensions'
import { TRAFFIC_CONE, trafficConeContactCircles, trafficConeGroundLift } from '../src/sim/trafficConeGeometry'
import { localPointToWorld, localPoseToWorld, worldPoseToLocal, type CoursePlacement } from '../src/subject2/courseTransform'

const close = (actual: number, expected: number, tolerance = 1e-8) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`)
}
const placements: CoursePlacement[] = [
  { x: 0, z: 0, heading: 0 },
  { x: 82, z: -126, heading: Math.PI / 2 },
  { x: -45, z: 19, heading: -Math.PI / 3 },
]

test('shared cone response is equivalent in standalone and rotated continuous-course placements', () => {
  const base = { x: 0.2, z: -TRAINING_CAR.lengthMeters / 2 - 0.12, heading: 0 }
  const results = placements.map(placement => {
    const worldBase = localPoseToWorld(base, placement)
    const car = { ...localPoseToWorld({ x: 0, z: 0, heading: 0 }, placement), speed: 3 }
    const motion = createCollisionMotion()
    const initialCircles = trafficConeContactCircles(worldBase, { tiltX: 0, tiltZ: 0 })
    assert.equal(initialCircles.length, 1)
    const impact = resolveCircleCompoundImpact(car, initialCircles, 'cone')
    assert.equal(impact.collided, true)
    assert.equal(checkVehicleCircleCollision(car, initialCircles[0]).colliding, false)
    applyCollisionMotion(motion, impact)
    for (let frame = 0; frame < 60; frame++) stepCollisionMotion(motion, 'cone', 1 / 60)
    const displacedBase = { ...worldBase, x: worldBase.x + motion.offsetX, z: worldBase.z + motion.offsetZ }
    const pose = collisionMotionPose(motion, 'cone', placement.heading)
    return {
      car: worldPoseToLocal(car, placement), speed: car.speed,
      base: worldPoseToLocal(displacedBase, placement),
      pose, circles: trafficConeContactCircles(displacedBase, pose).map(circle => ({
        ...worldPoseToLocal({ ...circle, heading: placement.heading }, placement), radius: circle.radius,
      })),
    }
  })
  const baseline = results[0]
  for (const result of results.slice(1)) {
    close(result.car.x, baseline.car.x)
    close(result.car.z, baseline.car.z)
    close(result.speed, baseline.speed)
    close(result.base.x, baseline.base.x)
    close(result.base.z, baseline.base.z)
    close(result.pose.tiltX, baseline.pose.tiltX)
    close(result.pose.tiltZ, baseline.pose.tiltZ)
    assert.equal(result.circles.length, baseline.circles.length)
    for (let index = 0; index < result.circles.length; index++) {
      close(result.circles[index].x, baseline.circles[index].x)
      close(result.circles[index].z, baseline.circles[index].z)
      close(result.circles[index].radius, baseline.circles[index].radius)
    }
  }
})

test('fallen cone contact follows actual mesh tilt and covers tapered body and rubber corners', () => {
  for (const placement of placements) {
    const base = localPoseToWorld({ x: 2, z: -6, heading: 0 }, placement)
    for (const pose of [
      { tiltX: 0, tiltZ: 0 },
      { tiltX: -1.45, tiltZ: 0 },
      { tiltX: 0, tiltZ: 1.45 },
      { tiltX: -1.45 / Math.SQRT2, tiltZ: -1.45 / Math.SQRT2 },
    ]) {
      const circles = trafficConeContactCircles(base, pose)
      const rotation = new THREE.Euler(pose.tiltX, 0, pose.tiltZ, 'XYZ')
      const covered = (point: THREE.Vector3) => {
        const rotated = point.clone().applyEuler(rotation)
        const world = localPointToWorld({ x: rotated.x, z: rotated.z }, base)
        assert.ok(circles.some(circle =>
          Math.hypot(world.x - circle.x, world.z - circle.z) <= circle.radius + 1e-9),
        `uncovered mesh point at (${world.x}, ${world.z})`)
      }
      for (const baseX of [-TRAFFIC_CONE.baseWidth / 2, TRAFFIC_CONE.baseWidth / 2]) {
        for (const baseZ of [-TRAFFIC_CONE.baseWidth / 2, TRAFFIC_CONE.baseWidth / 2]) {
          for (const height of [0, TRAFFIC_CONE.baseHeight]) covered(new THREE.Vector3(baseX, height, baseZ))
        }
      }
      for (let section = 0; section <= 20; section++) {
        const progress = section / 20
        const height = TRAFFIC_CONE.bodyCenterHeight - TRAFFIC_CONE.bodyHeight / 2 + TRAFFIC_CONE.bodyHeight * progress
        const radius = TRAFFIC_CONE.bodyBottomRadius + (TRAFFIC_CONE.bodyTopRadius - TRAFFIC_CONE.bodyBottomRadius) * progress
        for (let angle = 0; angle < 16; angle++) {
          const theta = angle * Math.PI / 8
          covered(new THREE.Vector3(Math.cos(theta) * radius, height, Math.sin(theta) * radius))
        }
      }
    }
  }
})

test('fallen cone proxies leave space beyond the base on the unoccupied side', () => {
  const circles = trafficConeContactCircles({ x: 0, z: 0, heading: 0 }, { tiltX: -1.45, tiltZ: 0 })
  assert.ok(circles.length > 1)
  assert.ok(circles.every(circle => circle.z <= 0))
  assert.equal(circles.some(circle => Math.hypot(circle.x, 0.35 - circle.z) <= circle.radius), false)
  assert.ok(circles.some(circle => Math.hypot(circle.x, -0.44 - circle.z) <= circle.radius))
})

test('ground support lift rests the tilted base on the floor without raising upright cones', () => {
  close(trafficConeGroundLift({ tiltX: 0, tiltZ: 0 }), 0)
  for (const tilt of [
    { tiltX: -1.45, tiltZ: 0 },
    { tiltX: 0.5, tiltZ: -0.8 },
    { tiltX: -1, tiltZ: -1 },
  ]) {
    const rotation = new THREE.Euler(tilt.tiltX, 0, tilt.tiltZ, 'XYZ')
    const lift = trafficConeGroundLift(tilt)
    let minimumY = Infinity
    for (const x of [-TRAFFIC_CONE.baseWidth / 2, TRAFFIC_CONE.baseWidth / 2]) {
      for (const z of [-TRAFFIC_CONE.baseWidth / 2, TRAFFIC_CONE.baseWidth / 2]) {
        minimumY = Math.min(minimumY, new THREE.Vector3(x, 0, z).applyEuler(rotation).y + lift)
      }
    }
    close(minimumY, 0)
  }
})
