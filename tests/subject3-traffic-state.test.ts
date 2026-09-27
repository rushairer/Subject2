import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SUBJECT3_CROSSING_DURATION_SECONDS,
  SUBJECT3_CROSSWALK_PROGRESS,
  SUBJECT3_TRAFFIC_CAR,
  SUBJECT3_OVERTAKE_TARGET_PROGRESS,
  createSubject3TrafficState,
  crossingPedestrianMotion,
  removeSubject3TrafficVehicle,
  subject3TrafficCollision,
  subject3VehicleCollision,
  updateSubject3TrafficVehicle,
} from '../src/subject3/subject3Traffic'
import { TRAINING_CAR } from '../src/sim/vehicleDimensions'
import {
  CENTER_LINE_OFFSET,
  RIGHT_EDGE_OFFSET,
  SUBJECT3_EVENTS,
} from '../src/subject3/subject3Route'

test('traffic state starts clear with an empty deterministic vehicle registry', () => {
  assert.deepEqual(createSubject3TrafficState(), {
    crosswalkPedestrianConflict: false,
    vehicles: {},
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
  updateSubject3TrafficVehicle(traffic, 'sudden-brake', 720, 0, 8.5, false, 'sudden-brake')

  assert.equal(traffic.vehicles['flow-a'].scenario, undefined)
  assert.equal(traffic.vehicles['sudden-brake'].scenario, 'sudden-brake')

  updateSubject3TrafficVehicle(traffic, 'sudden-brake', 722, 0, 8.2, false)
  assert.equal(traffic.vehicles['sudden-brake'].scenario, undefined)
})

test('traffic registry keeps same-direction and opposing actors distinguishable', () => {
  const traffic = createSubject3TrafficState()

  updateSubject3TrafficVehicle(traffic, 'flow-a', 620, -3.5, 9.2, false)
  updateSubject3TrafficVehicle(traffic, 'oncoming-a', 1900, -8.75, 10.5, true)

  assert.equal(traffic.vehicles['flow-a'].opposite, false)
  assert.equal(traffic.vehicles['oncoming-a'].opposite, true)
  assert.equal(Object.keys(traffic.vehicles).length, 2)
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
