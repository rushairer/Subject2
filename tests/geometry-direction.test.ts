import assert from 'node:assert/strict'
import test from 'node:test'
import {
  forwardFromHeading,
  leftFromHeading,
  rightFromHeading,
  turnDirection,
  worldPointFromVehicle,
} from '../src/sim/vehicleFrame'
import {
  SUBJECT3_EVENTS,
  SUBJECT3_SEGMENTS,
  projectToSubject3Route,
} from '../src/subject3/subject3Route'

const near = (actual: number, expected: number, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`)

test('canonical vehicle frame: heading 0 faces -Z and +X is right', () => {
  const forward = forwardFromHeading(0)
  const right = rightFromHeading(0)
  const left = leftFromHeading(0)
  near(forward.x, 0)
  near(forward.z, -1)
  near(right.x, 1)
  near(right.z, 0)
  near(left.x, -1)
  near(left.z, 0)
})

test('heading pi reverses world-space left/right without changing vehicle semantics', () => {
  const right = worldPointFromVehicle(0, 0, Math.PI, 0, 1)
  const left = worldPointFromVehicle(0, 0, Math.PI, 0, -1)
  near(right.x, -1)
  near(left.x, 1)
})

test('positive heading delta is a right turn and negative is a left turn', () => {
  assert.equal(turnDirection(0, Math.PI / 2), 'right')
  assert.equal(turnDirection(0, -Math.PI / 2), 'left')
  assert.equal(turnDirection(Math.PI / 2, 0), 'left')
})

test('subject3 positive lateral offset is route-right', () => {
  near(projectToSubject3Route(1, 0).lateral, 1)
  near(projectToSubject3Route(-1, 0).lateral, -1)
})

test('subject3 named turn events agree with actual route geometry', () => {
  const turnEvents = SUBJECT3_EVENTS.filter(event =>
    event.kind === 'left-turn' || event.kind === 'right-turn',
  )
  for (const event of turnEvents) {
    const boundaries = SUBJECT3_SEGMENTS.slice(0, -1)
      .map((segment, index) => ({
        distance: segment.startDistance + segment.length,
        from: segment.heading,
        to: SUBJECT3_SEGMENTS[index + 1].heading,
      }))
      .filter(boundary => boundary.distance >= event.start && boundary.distance <= event.end)
    assert.ok(boundaries.length > 0, `${event.id} must contain a route turn`)
    for (const boundary of boundaries) {
      assert.equal(
        turnDirection(boundary.from, boundary.to),
        event.kind === 'left-turn' ? 'left' : 'right',
        `${event.id} route turn must match its instruction`,
      )
    }
  }
})

test('subject3 U-turn geometry turns left throughout the maneuver', () => {
  const event = SUBJECT3_EVENTS.find(item => item.kind === 'uturn')
  assert.ok(event)
  const boundaries = SUBJECT3_SEGMENTS.slice(0, -1)
    .map((segment, index) => ({
      distance: segment.startDistance + segment.length,
      from: segment.heading,
      to: SUBJECT3_SEGMENTS[index + 1].heading,
    }))
    .filter(boundary => boundary.distance >= event.start && boundary.distance <= event.end)
  assert.ok(boundaries.length >= 2)
  for (const boundary of boundaries) assert.equal(turnDirection(boundary.from, boundary.to), 'left')
})
