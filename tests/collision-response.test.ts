import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COLLISION_PROFILES,
  applyCollisionMotion,
  collisionMotionPose,
  createCollisionMotion,
  resolveCircleImpact,
  resolveCircleCompoundImpact,
  resolvePolygonImpact,
  resolveVehicleImpact,
  stepCollisionMotion,
  type CollisionKind,
} from '../src/sim/collisionResponse'
import { checkVehicleCircleCollision } from '../src/sim/vehicleCollision'
import { TRAINING_CAR } from '../src/sim/vehicleDimensions'
import { orientedRectangleFootprint, vehicleBodyFootprint } from '../src/sim/vehicleFootprint'
import { convexPolygonsIntersect } from '../src/sim/planarGeometry'
import { worldPointFromVehicle } from '../src/sim/vehicleFrame'
import { trafficConeContactCircles } from '../src/sim/trafficConeGeometry'

const halfLength = TRAINING_CAR.lengthMeters / 2
const halfWidth = TRAINING_CAR.widthMeters / 2
const trafficCar = { lengthMeters: 4.2, widthMeters: 1.8 }
const close = (actual: number, expected: number, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`)
}
const player = (speed = 4, heading = 0) => ({ x: 0, z: 0, heading, speed })
const frontCircle = (radius = 0.35) => ({ x: 0, z: -(halfLength + radius - 0.02), radius })

test('each obstacle kind has a distinct named material response and speed loss', () => {
  const remainingSpeeds = new Map<CollisionKind, number>()
  for (const kind of Object.keys(COLLISION_PROFILES) as CollisionKind[]) {
    const car = player()
    const impact = resolveCircleImpact(car, frontCircle(), kind)
    assert.equal(impact.kind, kind)
    assert.equal(impact.collided, true)
    close(impact.impactSpeed, 4)
    assert.ok(COLLISION_PROFILES[kind].label.length > 0)
    remainingSpeeds.set(kind, car.speed)
  }
  assert.ok(remainingSpeeds.get('cone')! > remainingSpeeds.get('pedestrian')!)
  assert.ok(remainingSpeeds.get('pedestrian')! > remainingSpeeds.get('scooter')!)
  assert.ok(remainingSpeeds.get('scooter')! > remainingSpeeds.get('vehicle')!)
  assert.ok(remainingSpeeds.get('vehicle')! > 0)
  for (const kind of ['pole', 'tree', 'building'] as const) close(remainingSpeeds.get(kind)!, 0)
  assert.notEqual(COLLISION_PROFILES.pole.angularFrequency, COLLISION_PROFILES.tree.angularFrequency)
  assert.notEqual(COLLISION_PROFILES.pedestrian.maxTilt, COLLISION_PROFILES.scooter.maxTilt)
})

test('circle contact is body based, separates fully, and counts the exact bumper boundary', () => {
  for (const gap of [-0.08, 0, 0.000001]) {
    const car = player()
    const obstacle = { x: 0, z: -(halfLength + 0.35 + gap), radius: 0.35 }
    const impact = resolveCircleImpact(car, obstacle, 'pedestrian')
    assert.equal(impact.collided, gap <= 0)
    if (impact.collided) {
      assert.ok(impact.normal.z < -0.999)
      assert.equal(checkVehicleCircleCollision(car, obstacle).colliding, false)
    } else {
      assert.deepEqual(car, player())
      close(impact.strength, 0)
    }
  }
})

test('inside-body circles use a separating normal even when the actor center is embedded', () => {
  const car = player()
  const obstacle = { x: halfWidth - 0.02, z: 0, radius: 0.3 }
  const impact = resolveCircleImpact(car, obstacle, 'tree')
  assert.equal(impact.collided, true)
  close(impact.normal.x, 1)
  close(car.speed, 4)
  assert.equal(checkVehicleCircleCollision(car, obstacle).colliding, false)
})

test('forward, reverse and rotated collisions retain canonical vehicle-frame directions', () => {
  for (const heading of [0, Math.PI / 2, -Math.PI / 3, Math.PI]) {
    for (const direction of [1, -1]) {
      const car = player(direction * 3, heading)
      const obstaclePosition = worldPointFromVehicle(0, 0, heading, direction * (halfLength + 0.1))
      const obstacle = { ...obstaclePosition, radius: 0.25 }
      const impact = resolveCircleImpact(car, obstacle, 'pole')
      assert.equal(impact.collided, true)
      close(impact.impactSpeed, 3)
      close(car.speed, 0)
      assert.ok(car.x * impact.normal.x + car.z * impact.normal.z < 0)
      assert.equal(checkVehicleCircleCollision(car, obstacle).colliding, false)
    }
  }
})

test('fixed contact retains tangential travel and separates without braking retreat', () => {
  const tangentCar = player(3)
  const sideCircle = { x: halfWidth + 0.1, z: 0, radius: 0.2 }
  const tangent = resolveCircleImpact(tangentCar, sideCircle, 'pole')
  close(tangent.impactSpeed, 0)
  close(tangentCar.speed, 3)
  close(tangent.strength, 0)
  assert.equal(checkVehicleCircleCollision(tangentCar, sideCircle).colliding, false)

  const retreatingCar = player(-2)
  const retreat = resolveCircleImpact(retreatingCar, frontCircle(), 'tree')
  assert.equal(retreat.collided, true)
  close(retreat.impactSpeed, 0)
  close(retreatingCar.speed, -2)
  close(retreat.strength, 0)
})

test('glancing corner contact loses only the normal projection, not all forward speed', () => {
  const car = player(4)
  const obstacle = { x: halfWidth + 0.15, z: -(halfLength + 0.15), radius: 0.25 }
  const impact = resolveCircleImpact(car, obstacle, 'pole')
  close(impact.normal.x, Math.SQRT1_2)
  close(impact.normal.z, -Math.SQRT1_2)
  close(impact.impactSpeed, 4 * Math.SQRT1_2)
  close(car.speed, 2)
  assert.equal(checkVehicleCircleCollision(car, obstacle).colliding, false)
})

test('impact severity follows relative normal approach, not player absolute speed', () => {
  const matching = player(4)
  const matchingImpact = resolveCircleImpact(matching, frontCircle(), 'pedestrian', { x: 0, z: -4 })
  close(matchingImpact.impactSpeed, 0)
  close(matchingImpact.strength, 0)
  close(matching.speed, 4)

  const receding = player(4)
  const recedingImpact = resolveCircleImpact(receding, frontCircle(), 'pedestrian', { x: 0, z: -6 })
  close(recedingImpact.impactSpeed, 0)
  close(receding.speed, 4)

  const approaching = player(4)
  const approachingImpact = resolveCircleImpact(approaching, frontCircle(), 'scooter', { x: 0, z: 2 })
  close(approachingImpact.impactSpeed, 6)
  assert.ok(approaching.speed >= 0 && approaching.speed < 4)
  assert.ok(approachingImpact.actorVelocity.z < 0)

  const lateral = player(4)
  const lateralImpact = resolveCircleImpact(lateral, frontCircle(), 'scooter', { x: 3, z: 0 })
  close(lateralImpact.impactSpeed, 4)
})

test('high-speed impacts keep light-actor momentum instead of flattening to one response', () => {
  for (const kind of ['pedestrian', 'scooter', 'cone'] as const) {
    const low = resolveCircleImpact(player(4), frontCircle(), kind)
    const high = resolveCircleImpact(player(14), frontCircle(), kind)
    const lowSpeed = Math.hypot(low.actorVelocity.x, low.actorVelocity.z)
    const highSpeed = Math.hypot(high.actorVelocity.x, high.actorVelocity.z)
    assert.ok(highSpeed > lowSpeed * 2.5, `${kind} high-speed transfer should remain visibly stronger`)
    assert.ok(high.strength > low.strength)
    assert.ok(high.strength < 1)

    const lowMotion = createCollisionMotion()
    const highMotion = createCollisionMotion()
    applyCollisionMotion(lowMotion, low)
    applyCollisionMotion(highMotion, high)
    stepCollisionMotion(lowMotion, kind, 0.2)
    stepCollisionMotion(highMotion, kind, 0.2)
    assert.ok(
      Math.hypot(highMotion.offsetX, highMotion.offsetZ) > Math.hypot(lowMotion.offsetX, lowMotion.offsetZ) * 2.5,
      `${kind} displacement should scale with transferred momentum`,
    )
    assert.ok(collisionMotionPose(highMotion, kind, 0).lift > 0, `${kind} severe impact should have a brief ballistic phase`)
  }
})

test('glancing severe impacts add deterministic yaw while head-on impacts do not invent spin', () => {
  const corner = { x: halfWidth + 0.15, z: -(halfLength + 0.15), radius: 0.25 }
  const glancingImpact = resolveCircleImpact(player(14), corner, 'scooter')
  const glancingMotion = createCollisionMotion()
  applyCollisionMotion(glancingMotion, glancingImpact)
  stepCollisionMotion(glancingMotion, 'scooter', 0.3)
  assert.ok(Math.abs(collisionMotionPose(glancingMotion, 'scooter', 0).yaw) > 0.05)

  const headOnImpact = resolveCircleImpact(player(14), frontCircle(), 'scooter')
  const headOnMotion = createCollisionMotion()
  applyCollisionMotion(headOnMotion, headOnImpact)
  stepCollisionMotion(headOnMotion, 'scooter', 0.3)
  close(collisionMotionPose(headOnMotion, 'scooter', 0).yaw, 0)
})

test('stationary player can receive moving traffic contact without fabricated reverse speed', () => {
  const car = player(0)
  const actor = { x: 0, z: -(halfLength + trafficCar.lengthMeters / 2 - 0.05), heading: Math.PI }
  const impact = resolveVehicleImpact(car, actor, trafficCar, { x: 0, z: 3 })
  assert.equal(impact.collided, true)
  close(impact.impactSpeed, 3)
  close(car.speed, 0)
  assert.equal(convexPolygonsIntersect(vehicleBodyFootprint(car), orientedRectangleFootprint(
    actor, trafficCar.lengthMeters, trafficCar.widthMeters,
  )), false)
})

test('vehicle impact uses full oriented body SAT for exact contact and adjacent separation', () => {
  for (const lateral of [0, halfWidth + trafficCar.widthMeters / 2 + 0.001]) {
    const car = player()
    const actor = { x: lateral, z: -(halfLength + trafficCar.lengthMeters / 2), heading: 0 }
    const impact = resolveVehicleImpact(car, actor, trafficCar)
    assert.equal(impact.collided, lateral === 0)
    if (impact.collided) {
      assert.ok(impact.normal.z < -0.999)
      assert.equal(convexPolygonsIntersect(vehicleBodyFootprint(car), orientedRectangleFootprint(
        actor, trafficCar.lengthMeters, trafficCar.widthMeters,
      )), false)
    }
  }
})

test('angled car contact separates oriented bodies and preserves travel sign', () => {
  for (const speed of [-3, 3]) {
    const car = player(speed, Math.PI / 5)
    const actor = { x: 1, z: -2.5, heading: -Math.PI / 4 }
    const impact = resolveVehicleImpact(car, actor, trafficCar)
    assert.equal(impact.collided, true)
    close(Math.hypot(impact.normal.x, impact.normal.z), 1)
    assert.ok(car.speed * speed >= 0)
    assert.ok(Math.abs(car.speed) <= Math.abs(speed))
    assert.equal(convexPolygonsIntersect(vehicleBodyFootprint(car), orientedRectangleFootprint(
      actor, trafficCar.lengthMeters, trafficCar.widthMeters,
    )), false)
  }
})

test('building footprint contact stops head-on travel but permits tangent and retreat', () => {
  const building = [
    { x: -10, z: -3 }, { x: 10, z: -3 },
    { x: 10, z: -2 }, { x: -10, z: -2 },
  ]
  const car = player()
  const impact = resolvePolygonImpact(car, building, 'building')
  assert.equal(impact.collided, true)
  close(impact.normal.z, -1)
  close(impact.impactSpeed, 4)
  close(car.speed, 0)
  assert.equal(convexPolygonsIntersect(vehicleBodyFootprint(car), building), false)

  const retreating = player(-1)
  const retreat = resolvePolygonImpact(retreating, building, 'building')
  close(retreating.speed, -1)
  close(retreat.impactSpeed, 0)

  const tangent = { ...player(2, Math.PI / 2), z: -1.2 }
  const tangentImpact = resolvePolygonImpact(tangent, building, 'building')
  assert.equal(tangentImpact.collided, true)
  close(tangent.speed, 2)
  close(tangentImpact.impactSpeed, 0)
})

test('zero and very slow overlaps separate but cannot activate a dramatic animation', () => {
  for (const speed of [0, 0.05, 0.12]) {
    for (const kind of Object.keys(COLLISION_PROFILES) as CollisionKind[]) {
      const motion = createCollisionMotion()
      const car = player(speed)
      const obstacle = frontCircle()
      const impact = resolveCircleImpact(car, obstacle, kind)
      assert.equal(impact.collided, true)
      close(impact.strength, 0)
      applyCollisionMotion(motion, impact)
      stepCollisionMotion(motion, kind, 1)
      assert.equal(motion.active, false)
      assert.deepEqual(collisionMotionPose(motion, kind, 0), { tiltX: 0, tiltZ: 0, yaw: 0, lift: 0 })
      close(motion.offsetX, 0)
      close(motion.offsetZ, 0)
      assert.equal(checkVehicleCircleCollision(car, obstacle).colliding, false)
    }
  }
})

test('actor motion uses bounded exact exponential damping independent of frame rate', () => {
  for (const kind of ['pedestrian', 'vehicle', 'scooter', 'cone'] as const) {
    const impact = resolveCircleImpact(player(20), frontCircle(), kind)
    const coarse = createCollisionMotion()
    const fine = createCollisionMotion()
    applyCollisionMotion(coarse, impact)
    applyCollisionMotion(fine, impact)
    stepCollisionMotion(coarse, kind, 2)
    for (let frame = 0; frame < 240; frame++) stepCollisionMotion(fine, kind, 1 / 120)
    close(coarse.offsetX, fine.offsetX)
    close(coarse.offsetZ, fine.offsetZ)
    close(coarse.velocityX, fine.velocityX)
    close(coarse.velocityZ, fine.velocityZ)
    const coarsePose = collisionMotionPose(coarse, kind, 0)
    const finePose = collisionMotionPose(fine, kind, 0)
    close(coarsePose.tiltX, finePose.tiltX)
    close(coarsePose.tiltZ, finePose.tiltZ)
    close(coarsePose.yaw, finePose.yaw)
    close(coarsePose.lift, finePose.lift)
    stepCollisionMotion(coarse, kind, 100)
    assert.ok(Math.hypot(coarse.offsetX, coarse.offsetZ) <= COLLISION_PROFILES[kind].maxDisplacement)
    assert.equal(coarse.active, true)
    close(coarse.velocityX, 0)
    close(coarse.velocityZ, 0)
  }
})

test('fixed scenery never translates and has different damped spring responses', () => {
  const poses = new Map<string, ReturnType<typeof collisionMotionPose>>()
  for (const kind of ['pole', 'tree', 'building'] as const) {
    const impact = resolveCircleImpact(player(), frontCircle(), kind)
    close(impact.actorVelocity.x, 0)
    close(impact.actorVelocity.z, 0)
    const motion = createCollisionMotion()
    applyCollisionMotion(motion, impact)
    stepCollisionMotion(motion, kind, 0.1)
    poses.set(kind, collisionMotionPose(motion, kind, 0))
    close(motion.offsetX, 0)
    close(motion.offsetZ, 0)
    stepCollisionMotion(motion, kind, 10)
    const settled = collisionMotionPose(motion, kind, 0)
    close(settled.tiltX, 0)
    close(settled.tiltZ, 0)
  }
  assert.notEqual(poses.get('pole')!.tiltX, poses.get('tree')!.tiltX)
  close(poses.get('building')!.tiltX, 0)
  close(poses.get('building')!.tiltZ, 0)
})

test('pedestrian stumble, scooter and cone falls, and vehicle suspension have distinct settled poses', () => {
  const settled = new Map<string, ReturnType<typeof collisionMotionPose>>()
  for (const kind of ['pedestrian', 'vehicle', 'scooter', 'cone'] as const) {
    const motion = createCollisionMotion()
    applyCollisionMotion(motion, resolveCircleImpact(player(), frontCircle(), kind))
    stepCollisionMotion(motion, kind, 0.12)
    const moving = collisionMotionPose(motion, kind, 0)
    if (kind === 'vehicle') assert.ok(moving.lift > 0)
    stepCollisionMotion(motion, kind, 10)
    settled.set(kind, collisionMotionPose(motion, kind, 0))
  }
  assert.ok(Math.abs(settled.get('pedestrian')!.tiltX) > 0.45)
  assert.ok(Math.abs(settled.get('pedestrian')!.tiltX) <= 1.48)
  assert.ok(Math.abs(settled.get('scooter')!.tiltX) > 1)
  assert.ok(Math.abs(settled.get('scooter')!.tiltX) <= 1.5)
  assert.ok(Math.abs(settled.get('cone')!.tiltX) > 1.45)
  assert.ok(Math.abs(settled.get('cone')!.tiltX) <= 1.52)
  close(settled.get('vehicle')!.tiltX, 0)
  close(settled.get('vehicle')!.tiltZ, 0)
  close(settled.get('vehicle')!.lift, 0)
})

test('impact refresh preserves actor displacement and ignored contacts do not restart motion', () => {
  const motion = createCollisionMotion()
  const impact = resolveCircleImpact(player(), frontCircle(), 'scooter')
  applyCollisionMotion(motion, impact)
  stepCollisionMotion(motion, 'scooter', 0.5)
  const offset = motion.offsetZ
  applyCollisionMotion(motion, { ...impact, strength: 0, impactSpeed: 0 })
  close(motion.elapsed, 0.5)
  close(motion.offsetZ, offset)
  applyCollisionMotion(motion, impact)
  close(motion.elapsed, 0.5)
  close(motion.offsetZ, offset)
  for (const dt of [0, -1, NaN, Infinity]) stepCollisionMotion(motion, 'scooter', dt)
  close(motion.elapsed, 0.5)
  close(motion.offsetZ, offset)
})

test('repeated contact updates velocity without restarting the same spring animation each frame', () => {
  const motion = createCollisionMotion()
  const impact = resolveCircleImpact(player(), frontCircle(), 'vehicle')
  applyCollisionMotion(motion, impact)
  for (let frame = 0; frame < 30; frame++) {
    stepCollisionMotion(motion, 'vehicle', 1 / 60)
    applyCollisionMotion(motion, { ...impact, actorVelocity: { x: 0.4, z: -0.5 } })
  }
  close(motion.elapsed, 0.5)
  close(motion.velocityX, 0.4)
  close(motion.velocityZ, -0.5)
  assert.notEqual(collisionMotionPose(motion, 'vehicle', 0).tiltX, 0)
  stepCollisionMotion(motion, 'vehicle', 0.2)
  applyCollisionMotion(motion, impact)
  close(motion.elapsed, 0)
})

test('weaker recontacts keep settled pedestrian, scooter and cone poses and max strength', () => {
  for (const kind of ['pedestrian', 'scooter', 'cone'] as const) {
    const motion = createCollisionMotion()
    const first = resolveCircleImpact(player(), frontCircle(), kind)
    applyCollisionMotion(motion, first)
    stepCollisionMotion(motion, kind, 2)
    const pose = collisionMotionPose(motion, kind, 0)
    applyCollisionMotion(motion, {
      ...first, impactSpeed: 1, strength: 0.2,
      normal: { x: 1, z: 0 }, actorVelocity: { x: 0.1, z: 0.1 },
    })
    close(motion.elapsed, 2)
    close(motion.strength, first.strength)
    close(motion.impactSpeed, first.impactSpeed)
    close(motion.velocityX, 0.1)
    assert.deepEqual(collisionMotionPose(motion, kind, 0), pose)
  }
})

test('compound contacts transfer only one impulse despite multiple overlapped front proxies', () => {
  for (const kind of ['cone', 'pedestrian', 'scooter', 'vehicle'] as const) {
    const obstacle = frontCircle()
    const single = player(4)
    const compound = player(4)
    const actorVelocity = { x: 0, z: -0.5 }
    const expected = resolveCircleImpact(single, obstacle, kind, actorVelocity)
    const actual = resolveCircleCompoundImpact(compound, [
      { ...obstacle, x: -0.2 }, obstacle, { ...obstacle, x: 0.2 }, { ...obstacle },
    ], kind, actorVelocity)
    close(compound.speed, single.speed)
    close(actual.impactSpeed, expected.impactSpeed)
    close(actual.actorVelocity.x, expected.actorVelocity.x)
    close(actual.actorVelocity.z, expected.actorVelocity.z)
    close(compound.z, single.z)
  }
})

test('compound circle chains separate fully for leaned pedestrians, scooters and cones', () => {
  for (const heading of [0, Math.PI / 2, -Math.PI / 3]) {
    for (const kind of ['pedestrian', 'scooter', 'cone'] as const) {
      const base = worldPointFromVehicle(0, 0, heading, halfLength + 0.1, 0.05)
      const circles = kind === 'cone'
        ? trafficConeContactCircles({ ...base, heading }, { tiltX: 1.1, tiltZ: -0.5 })
        : Array.from({ length: 6 }, (_, section) => ({
          ...worldPointFromVehicle(base.x, base.z, heading,
            -section * (kind === 'scooter' ? 0.18 : 0.11), section * 0.04),
          radius: kind === 'scooter' ? 0.34 : 0.25,
        }))
      const car = player(3, heading)
      const initial = circles.map(circle => checkVehicleCircleCollision(car, circle))
        .filter(contact => contact.colliding)
        .sort((a, b) => b.penetration - a.penetration)[0]
      assert.ok(initial)
      const expectedCar = player(3, heading)
      const primaryCircle = circles.find(circle => checkVehicleCircleCollision(expectedCar, circle).penetration === initial.penetration)!
      const expectedImpact = resolveCircleImpact(expectedCar, primaryCircle, kind)
      const impact = resolveCircleCompoundImpact(car, circles, kind)
      assert.equal(impact.collided, true)
      close(car.speed, expectedCar.speed)
      close(impact.impactSpeed, expectedImpact.impactSpeed)
      assert.ok(circles.every(circle => !checkVehicleCircleCollision(car, circle).colliding))
    }
  }
})

test('compound resolution uses bounded escape for an initially embedded opposed circle union', () => {
  const car = player(0)
  const circles = [
    { x: -1, z: 0, radius: 0.35 },
    { x: 1, z: 0, radius: 0.35 },
    { x: 0, z: -2.3, radius: 0.35 },
    { x: 0, z: 2.3, radius: 0.35 },
  ]
  const impact = resolveCircleCompoundImpact(car, circles, 'scooter')
  assert.equal(impact.collided, true)
  close(impact.impactSpeed, 0)
  close(car.speed, 0)
  assert.ok(Number.isFinite(car.x) && Number.isFinite(car.z))
  assert.ok(Math.hypot(car.x, car.z) < 6)
  assert.ok(circles.every(circle => !checkVehicleCircleCollision(car, circle).colliding))
})

test('compound reverse contacts keep signed speed and retreat stays unbraked', () => {
  const circles = [
    { x: -0.1, z: halfLength + 0.1, radius: 0.3 },
    { x: 0.1, z: halfLength + 0.15, radius: 0.3 },
  ]
  const reverse = player(-3)
  const impact = resolveCircleCompoundImpact(reverse, circles, 'cone')
  assert.equal(impact.collided, true)
  close(impact.impactSpeed, 3)
  assert.ok(reverse.speed < 0 && reverse.speed > -3)
  assert.ok(circles.every(circle => !checkVehicleCircleCollision(reverse, circle).colliding))
  const retreat = player(2)
  const retreatImpact = resolveCircleCompoundImpact(retreat, circles, 'cone')
  close(retreatImpact.impactSpeed, 0)
  close(retreat.speed, 2)
  assert.ok(circles.every(circle => !checkVehicleCircleCollision(retreat, circle).colliding))
})

test('empty and entirely distant compounds leave both bodies unchanged', () => {
  for (const circles of [[], [{ x: 100, z: -100, radius: 0.5 }]]) {
    const car = player(3)
    const velocity = { x: 1, z: -2 }
    const impact = resolveCircleCompoundImpact(car, circles, 'pedestrian', velocity)
    assert.equal(impact.collided, false)
    assert.deepEqual(car, player(3))
    assert.deepEqual(impact.actorVelocity, velocity)
    close(impact.impactSpeed, 0)
  }
})
