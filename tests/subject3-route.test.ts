import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SUBJECT3_EVENTS,
  SUBJECT3_ROUTE_LENGTH,
  SUBJECT3_SEGMENTS,
  actorRoutePose,
  poseAtRouteDistance,
  projectToSubject3Route,
} from '../src/subject3/subject3Route'

const near = (actual: number, expected: number, epsilon = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`)

test('Subject 3 route is longer than 3 km and every event lies inside it', () => {
  assert.ok(SUBJECT3_ROUTE_LENGTH > 3000)
  for (const event of SUBJECT3_EVENTS) {
    assert.ok(event.start >= 0)
    assert.ok(event.end > event.start, `${event.id} must have positive length`)
    assert.ok(event.end <= SUBJECT3_ROUTE_LENGTH, `${event.id} must fit inside route`)
  }
})

function normalizeAngle(angle: number) {
  let value = angle
  while (value > Math.PI) value -= Math.PI * 2
  while (value < -Math.PI) value += Math.PI * 2
  return value
}

function eventById(id: string) {
  const event = SUBJECT3_EVENTS.find(item => item.id === id)
  assert.ok(event, `missing Subject 3 event ${id}`)
  return event
}

function routeHeadingDeltaForEvent(id: string) {
  const event = eventById(id)
  return normalizeAngle(
    poseAtRouteDistance(event.end).heading -
    poseAtRouteDistance(event.start).heading,
  )
}

test('named Subject 3 turn events match their actual route direction', () => {
  for (const id of ['left-turn-1', 'left-turn-2', 'left-turn-3']) {
    near(routeHeadingDeltaForEvent(id), -Math.PI / 2)
  }
  near(routeHeadingDeltaForEvent('right-turn-1'), Math.PI / 2)
})

test('Subject 3 u-turn reverses travel direction and preserves total route length', () => {
  const delta = routeHeadingDeltaForEvent('uturn')
  near(Math.abs(delta), Math.PI)
  near(SUBJECT3_ROUTE_LENGTH, 4420)
})

test('Subject 3 event windows are ordered and do not overlap', () => {
  for (let i = 1; i < SUBJECT3_EVENTS.length; i++) {
    const previous = SUBJECT3_EVENTS[i - 1]
    const current = SUBJECT3_EVENTS[i]
    assert.ok(
      current.start > previous.end,
      `${current.id} must start after ${previous.id} ends`,
    )
  }
})

test('poseAtRouteDistance round-trips to zero-lateral route projection', () => {
  const samples = [
    0,
    100,
    699,
    700,
    1020,
    1640,
    2280,
    3460,
    SUBJECT3_ROUTE_LENGTH - 1,
  ]

  for (const distance of samples) {
    const pose = poseAtRouteDistance(distance)
    const projection = projectToSubject3Route(pose.x, pose.z)
    near(projection.progress, distance, 1e-6)
    near(projection.lateral, 0, 1e-6)
  }
})

test('route segment start distances are continuous', () => {
  let expectedStart = 0
  for (const segment of SUBJECT3_SEGMENTS) {
    near(segment.startDistance, expectedStart)
    expectedStart += segment.length
  }
  near(expectedStart, SUBJECT3_ROUTE_LENGTH)
})

test('every route segment is axis-aligned and has a normalized right vector', () => {
  for (const segment of SUBJECT3_SEGMENTS) {
    const dx = segment.b.x - segment.a.x
    const dz = segment.b.z - segment.a.z
    assert.ok(dx === 0 || dz === 0, 'current exam route segments must remain axis-aligned')
    near(Math.hypot(segment.rightX, segment.rightZ), 1)
  }
})

test('actorRoutePose is spatially continuous across corner junctions without teleportation', () => {
  // Test across the 700m corner junction with lateral = -8.75 (oncoming lane)
  const lateral = -8.75
  const step = 0.1 // 10cm step
  for (let d = 680; d <= 720; d += step) {
    const p1 = actorRoutePose(d, lateral)
    const p2 = actorRoutePose(d + step, lateral)
    const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z)
    // Moving 10cm along the route should not cause a multi-meter teleportation jump
    assert.ok(
      dist < 0.25,
      `Teleportation jump detected at distance ${d}: step distance ${dist} > 0.25m`,
    )
  }
})
