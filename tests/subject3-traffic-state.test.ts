import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SUBJECT3_CROSSING_DURATION_SECONDS,
  SUBJECT3_CROSSWALK_PROGRESS,
  SUBJECT3_TRAFFIC_CAR,
  SUBJECT3_OVERTAKE_TARGET_PROGRESS,
  createSubject3TrafficState,
  crossingPedestrianMotion,
  removeSubject3TrafficHazard,
  removeSubject3TrafficVehicle,
  subject3TrafficCollision,
  subject3VehicleCollision,
  updateSubject3TrafficAfterImpact,
  updateSubject3TrafficHazard,
  updateSubject3TrafficHazardFromWorld,
  updateSubject3TrafficVehicle,
} from '../src/subject3/subject3Traffic'
import { createCollisionMotion } from '../src/sim/collisionResponse'
import { TRAINING_CAR } from '../src/sim/vehicleDimensions'
import { forwardFromHeading, rightFromHeading, worldPointFromVehicle } from '../src/sim/vehicleFrame'
import {
  CENTER_LINE_OFFSET,
  RIGHT_EDGE_OFFSET,
  SUBJECT3_EVENTS,
  poseAtRouteDistance,
} from '../src/subject3/subject3Route'

const near = (actual: number, expected: number, epsilon = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`)

test('traffic state starts clear with an empty deterministic vehicle registry', () => {
  assert.deepEqual(createSubject3TrafficState(), {
    crosswalkPedestrianConflict: false,
    vehicles: {},
    hazards: {},
  })
})

test('traffic vehicle telemetry updates in place and can be removed', () => {
  const traffic = createSubject3TrafficState()
  const first = updateSubject3TrafficVehicle(traffic, 'flow-b', 1540, 0, 7.5, false)

  const second = updateSubject3TrafficVehicle(traffic, 'flow-b', 1543.25, 0, 6.4, false)

  assert.equal(second, first, 'per-frame publication should mutate stable telemetry objects')
  assert.deepEqual(traffic.vehicles['flow-b'], {
    id: 'flow-b',
    progress: 1543.25,
    lateral: 0,
    speedMps: 6.4,
    opposite: false,
  })

  removeSubject3TrafficVehicle(traffic, 'flow-b')
  assert.deepEqual(traffic.vehicles, {})
})

test('traffic scenario tags are explicit and do not leak into ordinary flow actors', () => {
  const traffic = createSubject3TrafficState()

  updateSubject3TrafficVehicle(traffic, 'flow-a', 620, 0, 9.2, false)
  updateSubject3TrafficVehicle(
    traffic,
    'sudden-brake',
    720,
    0,
    8.5,
    false,
    'sudden-brake',
  )

  assert.equal(traffic.vehicles['flow-a'].scenario, undefined)
  assert.equal(traffic.vehicles['sudden-brake'].scenario, 'sudden-brake')

  updateSubject3TrafficVehicle(traffic, 'sudden-brake', 722, 0, 8.2, false)
  assert.equal(traffic.vehicles['sudden-brake'].scenario, undefined)
})

test('hazard telemetry updates in place, keeps scenario semantics explicit and can be removed', () => {
  const traffic = createSubject3TrafficState()
  const first = updateSubject3TrafficHazard(
    traffic,
    'cut-in-scooter',
    'cut-in-scooter',
    1400,
    2.4,
    3.2,
    -0.9,
    true,
    false,
  )
  const second = updateSubject3TrafficHazard(
    traffic,
    'cut-in-scooter',
    'cut-in-scooter',
    1400.6,
    1.4,
    3.1,
    -0.95,
    true,
    true,
  )

  assert.equal(second, first, 'per-frame hazard publication should preserve object identity')
  assert.deepEqual(traffic.hazards['cut-in-scooter'], {
    id: 'cut-in-scooter',
    kind: 'cut-in-scooter',
    progress: 1400.6,
    lateral: 1.4,
    longitudinalSpeedMps: 3.1,
    lateralSpeedMps: -0.95,
    active: true,
    conflict: true,
  })

  removeSubject3TrafficHazard(traffic, 'cut-in-scooter')
  assert.deepEqual(traffic.hazards, {})
})

test('world-space hazard publication projects position and velocity into route coordinates', () => {
  const traffic = createSubject3TrafficState()
  const route = poseAtRouteDistance(1250)
  const point = worldPointFromVehicle(route.x, route.z, route.heading, 0.65, -0.9)
  const forward = forwardFromHeading(route.heading)
  const right = rightFromHeading(route.heading)
  const velocity = {
    x: forward.x * 4.2 + right.x * -1.1,
    z: forward.z * 4.2 + right.z * -1.1,
  }

  const hazard = updateSubject3TrafficHazardFromWorld(
    traffic,
    'crosswalk-pedestrian',
    'crosswalk-pedestrian',
    point,
    velocity,
    true,
    true,
  )

  near(hazard.progress, 1250.65)
  near(hazard.lateral, -0.9)
  near(hazard.longitudinalSpeedMps, 4.2)
  near(hazard.lateralSpeedMps, -1.1)
  assert.equal(hazard.active, true)
  assert.equal(hazard.conflict, true)
})

test('traffic registry keeps same-direction and opposing actors distinguishable', () => {
  const traffic = createSubject3TrafficState()

  updateSubject3TrafficVehicle(traffic, 'flow-a', 620, -3.5, 9.2, false)
  updateSubject3TrafficVehicle(traffic, 'oncoming-a', 1900, -8.75, 10.5, true)

  assert.equal(traffic.vehicles['flow-a'].opposite, false)
  assert.equal(traffic.vehicles['oncoming-a'].opposite, true)
  assert.equal(Object.keys(traffic.vehicles).length, 2)
})

test('post-impact telemetry follows displaced world positions on rotated route segments', () => {
  for (const progress of [200, 850, 1250, 1900]) {
    const route = poseAtRouteDistance(progress)
    const base = { ...worldPointFromVehicle(route.x, route.z, route.heading, 0, -3.5), heading: route.heading }
    const forward = forwardFromHeading(route.heading)
    const right = rightFromHeading(route.heading)
    const motion = {
      ...createCollisionMotion(),
      active: true,
      offsetX: forward.x * 0.7 + right.x * 0.4,
      offsetZ: forward.z * 0.7 + right.z * 0.4,
      velocityX: forward.x * 1.6 + right.x * 0.8,
      velocityZ: forward.z * 1.6 + right.z * 0.8,
    }
    const state = createSubject3TrafficState()
    const existing = updateSubject3TrafficVehicle(state, 'crashed-car', progress, -3.5, 8, true)
    const updated = updateSubject3TrafficAfterImpact(state, 'crashed-car', base, motion, true)
    assert.equal(updated, existing, 'per-frame impact publication preserves stable telemetry identity')
    near(updated.progress, progress + 0.7)
    near(updated.lateral, -3.1)
    near(updated.speedMps, 1.6)
    assert.equal(updated.opposite, false)
  }
})

test('post-impact telemetry reports reverse travel and preserves original direction after settling', () => {
  const base = poseAtRouteDistance(850)
  const forward = forwardFromHeading(base.heading)
  const right = rightFromHeading(base.heading)
  const state = createSubject3TrafficState()
  const motion = createCollisionMotion()
  motion.active = true

  motion.velocityX = forward.x * -2
  motion.velocityZ = forward.z * -2
  const reverse = updateSubject3TrafficAfterImpact(state, 'car', base, motion, false)
  near(reverse.speedMps, 2)
  assert.equal(reverse.opposite, true)

  for (const originallyOpposite of [false, true]) {
    for (const longitudinalSpeed of [-0.04, 0, 0.04]) {
      motion.velocityX = forward.x * longitudinalSpeed + right.x * 2
      motion.velocityZ = forward.z * longitudinalSpeed + right.z * 2
      const settled = updateSubject3TrafficAfterImpact(state, 'car', base, motion, originallyOpposite)
      near(settled.speedMps, Math.abs(longitudinalSpeed))
      assert.equal(settled.opposite, originallyOpposite)
    }
  }
})

test('crossing pedestrian uses the rendered crosswalk progress', () => {
  const motion = crossingPedestrianMotion(false, 0)
  assert.equal(motion.progress, SUBJECT3_CROSSWALK_PROGRESS)
  assert.equal(motion.conflict, false)
})

test('pedestrian conflict is true only while the actor occupies our carriageway', () => {
  const beforeRoad = crossingPedestrianMotion(true, 0)
  assert.ok(beforeRoad.lateral > RIGHT_EDGE_OFFSET)
  assert.equal(beforeRoad.conflict, false)

  const entering = crossingPedestrianMotion(true, 1.0)
  assert.ok(entering.lateral <= RIGHT_EDGE_OFFSET)
  assert.ok(entering.lateral >= CENTER_LINE_OFFSET)
  assert.equal(entering.conflict, true)

  const crossed = crossingPedestrianMotion(
    true,
    SUBJECT3_CROSSING_DURATION_SECONDS,
  )
  assert.ok(crossed.lateral < CENTER_LINE_OFFSET)
  assert.equal(crossed.conflict, false)
})

test('pedestrian motion is clamped after the crossing completes', () => {
  const atEnd = crossingPedestrianMotion(
    true,
    SUBJECT3_CROSSING_DURATION_SECONDS,
  )
  const later = crossingPedestrianMotion(
    true,
    SUBJECT3_CROSSING_DURATION_SECONDS + 20,
  )
  assert.deepEqual(later, atEnd)
})


test('overtake target sits inside the modeled overtake event window', () => {
  const event = SUBJECT3_EVENTS.find(item => item.id === 'overtake')
  assert.ok(event)
  assert.ok(SUBJECT3_OVERTAKE_TARGET_PROGRESS > event.start)
  assert.ok(SUBJECT3_OVERTAKE_TARGET_PROGRESS < event.end)
})


test('traffic collision uses one strict shared distance boundary', () => {
  const player = { x: 0, z: 0 }

  assert.equal(
    subject3TrafficCollision(player, { x: 2.59, z: 0 }, 2.6),
    true,
  )
  assert.equal(
    subject3TrafficCollision(player, { x: 2.6, z: 0 }, 2.6),
    false,
  )
  assert.equal(
    subject3TrafficCollision(player, { x: 2.61, z: 0 }, 2.6),
    false,
  )
})


test('vehicle collision uses full longitudinal body footprints, not a 2.6m center radius', () => {
  const player = { x: 0, z: 0, heading: 0 }
  const longitudinalContact =
    (TRAINING_CAR.lengthMeters + SUBJECT3_TRAFFIC_CAR.lengthMeters) / 2

  assert.equal(
    subject3TrafficCollision(player, { x: 0, z: -4 }, 2.6),
    false,
    'legacy center-radius model misses a realistic rear/front overlap',
  )
  assert.equal(
    subject3VehicleCollision(player, {
      x: 0,
      z: -longitudinalContact + 0.01,
      heading: 0,
    }),
    true,
  )
  assert.equal(
    subject3VehicleCollision(player, {
      x: 0,
      z: -longitudinalContact,
      heading: 0,
    }),
    true,
    'exact bumper contact counts as collision',
  )
  assert.equal(
    subject3VehicleCollision(player, {
      x: 0,
      z: -longitudinalContact - 0.01,
      heading: 0,
    }),
    false,
  )
})

test('vehicle collision avoids false side-by-side hits from a circular proxy', () => {
  const player = { x: 0, z: 0, heading: 0 }
  const lateralContact =
    (TRAINING_CAR.widthMeters + SUBJECT3_TRAFFIC_CAR.widthMeters) / 2

  assert.equal(
    subject3TrafficCollision(player, { x: 2.5, z: 0 }, 2.6),
    true,
    'legacy center-radius model falsely collides with a separate adjacent car',
  )
  assert.equal(
    subject3VehicleCollision(player, {
      x: lateralContact + 0.01,
      z: 0,
      heading: 0,
    }),
    false,
  )
  assert.equal(
    subject3VehicleCollision(player, {
      x: lateralContact,
      z: 0,
      heading: 0,
    }),
    true,
    'exact side contact counts as collision',
  )
  assert.equal(
    subject3VehicleCollision(player, {
      x: lateralContact - 0.01,
      z: 0,
      heading: 0,
    }),
    true,
  )
})

test('vehicle collision respects traffic-car heading for angled contact', () => {
  const player = { x: 0, z: 0, heading: 0 }

  assert.equal(
    subject3VehicleCollision(player, {
      x: 2.2,
      z: -1.6,
      heading: Math.PI / 2,
    }),
    true,
  )
  assert.equal(
    subject3VehicleCollision(player, {
      x: 4.5,
      z: -1.6,
      heading: Math.PI / 2,
    }),
    false,
  )
})
