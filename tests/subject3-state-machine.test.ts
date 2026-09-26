import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createSubject3Runtime,
  updateSubject3,
  type Subject3Runtime,
  type Subject3Vehicle,
} from '../src/subject3/Subject3Course'
import {
  RIGHT_EDGE_OFFSET,
  SUBJECT3_EVENTS,
  poseAtRouteDistance,
} from '../src/subject3/subject3Route'

function eventIndex(id: string) {
  const index = SUBJECT3_EVENTS.findIndex(event => event.id === id)
  assert.ok(index >= 0, `missing Subject 3 event ${id}`)
  return index
}

function runtimeFor(id: string): Subject3Runtime {
  return {
    ...createSubject3Runtime(),
    eventIndex: eventIndex(id),
    started: true,
  }
}

function vehicleAt(
  distance: number,
  lateral = 0,
  overrides: Partial<Subject3Vehicle> = {},
): Subject3Vehicle {
  const pose = poseAtRouteDistance(distance)
  return {
    x: pose.x + pose.rightX * lateral,
    z: pose.z + pose.rightZ * lateral,
    heading: pose.heading,
    speed: 1.5,
    steering: 0,
    gear: 2,
    engineOn: true,
    handbrake: false,
    leftIndicator: false,
    rightIndicator: false,
    horn: false,
    seatbelt: true,
    lowBeam: true,
    highBeam: false,
    leftSignalAge: 0,
    rightSignalAge: 0,
    lookLeft: false,
    lookRight: false,
    lookBack: false,
    ...overrides,
  }
}

function hasInfraction(
  result: { infractions: Array<{ id: string }> },
  suffix: string,
) {
  return result.infractions.some(item => item.id.endsWith(suffix))
}

test('legal Subject 3 start advances to the next event with no penalty', () => {
  const event = SUBJECT3_EVENTS[eventIndex('start')]
  let runtime = runtimeFor('start')

  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    speed: 1,
    leftIndicator: true,
    leftSignalAge: 3.2,
    lookLeft: true,
  }), runtime, false, false, 0.1)
  runtime = result.runtime
  assert.equal(runtime.maneuverStarted, true)
  assert.equal(result.infractions.length, 0)

  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    speed: 1,
    leftIndicator: true,
    leftSignalAge: 4,
    lookLeft: true,
  }), runtime, false, false, 0.1)

  assert.equal(result.runtime.eventIndex, eventIndex('straight-1'))
  assert.deepEqual(result.infractions, [])
})

test('start requires left signal lead time and observation', () => {
  const event = SUBJECT3_EVENTS[eventIndex('start')]
  let runtime = runtimeFor('start')

  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    speed: 1,
    leftIndicator: false,
    leftSignalAge: 0,
    lookLeft: false,
    lookBack: false,
  }), runtime, false, false, 0.1)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(event.end + 1), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'signal'), true)
  assert.equal(hasInfraction(result, 'left-signal-lead'), true)
  assert.equal(hasInfraction(result, 'left-observation'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('signal'))?.fatal, true)
})

test('straight-driving instability is a fatal event failure', () => {
  const event = SUBJECT3_EVENTS[eventIndex('straight-1')]
  let runtime = runtimeFor('straight-1')

  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    steering: 0.55,
  }), runtime, false, false, 0.1)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    steering: 0.55,
  }), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'direction'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('direction'))?.fatal, true)
})

test('manual gear event penalizes insufficient upshift while automatic mode does not', () => {
  const event = SUBJECT3_EVENTS[eventIndex('gear')]

  let runtime = runtimeFor('gear')
  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    gear: 2,
  }), runtime, false, false, 0.1)
  runtime = result.runtime
  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    gear: 2,
  }), runtime, false, false, 0.1)
  assert.equal(hasInfraction(result, 'gear'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('gear'))?.points, 10)

  runtime = runtimeFor('gear')
  result = updateSubject3(vehicleAt(event.start + 1, 0, {
    gear: 2,
  }), runtime, true, false, 0.1)
  runtime = result.runtime
  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    gear: 2,
  }), runtime, true, false, 0.1)
  assert.equal(hasInfraction(result, 'gear'), false)
})

test('speed-sensitive slow zone penalizes exceeding the event allowance', () => {
  const event = SUBJECT3_EVENTS[eventIndex('school')]
  let runtime = runtimeFor('school')
  const speed = 34 / 3.6

  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    speed,
  }), runtime, false, false, 0.1)
  runtime = result.runtime
  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    speed,
  }), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'speed'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('speed'))?.points, 10)
})

test('lane change requires an actual move into the requested left lane', () => {
  const event = SUBJECT3_EVENTS[eventIndex('lane-change')]
  let runtime = runtimeFor('lane-change')

  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    steering: -0.2,
    leftIndicator: true,
    leftSignalAge: 3.2,
    lookLeft: true,
  }), runtime, false, false, 0.1)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    leftIndicator: true,
    leftSignalAge: 4,
    lookLeft: true,
  }), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'path'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('path'))?.fatal, true)
})

test('a complete observed/signalled lane change passes the event', () => {
  const event = SUBJECT3_EVENTS[eventIndex('lane-change')]
  let runtime = runtimeFor('lane-change')

  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    steering: -0.2,
    leftIndicator: true,
    leftSignalAge: 3.2,
    lookLeft: true,
  }), runtime, false, false, 0.1)
  runtime = result.runtime

  result = updateSubject3(vehicleAt((event.start + event.end) / 2, -2.2, {
    leftIndicator: true,
    leftSignalAge: 4,
    lookLeft: true,
  }), runtime, false, false, 0.1)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(event.end + 1, -2.2, {
    leftIndicator: true,
    leftSignalAge: 5,
    lookLeft: true,
  }), runtime, false, false, 0.1)

  assert.deepEqual(result.infractions, [])
})

test('overtake requires both the outward and return signal/observation sequence', () => {
  const event = SUBJECT3_EVENTS[eventIndex('overtake')]
  let runtime = runtimeFor('overtake')

  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    steering: -0.2,
    leftIndicator: true,
    leftSignalAge: 3.2,
    lookLeft: true,
  }), runtime, false, false, 0.1)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(event.start + 70, -2.2, {
    leftIndicator: true,
    leftSignalAge: 4,
    lookLeft: true,
  }), runtime, false, false, 0.1)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(event.start + 120, -1.0, {
    rightIndicator: true,
    rightSignalAge: 3.2,
    lookRight: true,
  }), runtime, false, false, 0.1)
  runtime = result.runtime
  assert.equal(runtime.returnManeuverStarted, true)

  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    rightIndicator: true,
    rightSignalAge: 4,
    lookRight: true,
  }), runtime, false, false, 0.1)

  assert.deepEqual(result.infractions, [])
})

test('pull-over records the 30-50cm band and completes only after a stable secured stop', () => {
  const event = SUBJECT3_EVENTS[eventIndex('pull-over')]
  let runtime = runtimeFor('pull-over')

  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    steering: 0.2,
    rightIndicator: true,
    rightSignalAge: 3.2,
    lookRight: true,
  }), runtime, false, false, 0.1)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(event.start + 30, 0.45, {
    speed: 0,
    gear: 0,
    handbrake: true,
    rightIndicator: true,
    rightSignalAge: 4,
    lookRight: true,
  }), runtime, false, false, 1.0)

  assert.equal(result.runtime.completed, true)
  assert.equal(hasInfraction(result, 'distance-10'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('distance-10'))?.points, 10)
})

test('night driving with all headlamps off is immediately fatal while moving', () => {
  const result = updateSubject3(vehicleAt(200, 0, {
    speed: 2,
    lowBeam: false,
    highBeam: false,
  }), createSubject3Runtime(), false, true, 0.1)

  assert.equal(
    result.infractions.some(item => item.id === 'subject3-night-lights-off'),
    true,
  )
  assert.equal(
    result.infractions.find(item => item.id === 'subject3-night-lights-off')?.fatal,
    true,
  )
})

test('leaving the modeled Subject 3 road boundary is fatal', () => {
  const result = updateSubject3(vehicleAt(200, RIGHT_EDGE_OFFSET + 0.6), {
    ...createSubject3Runtime(),
    started: true,
  }, false, false, 0.1)

  assert.equal(
    result.infractions.some(item => item.id === 'subject3-road-boundary'),
    true,
  )
  assert.equal(
    result.infractions.find(item => item.id === 'subject3-road-boundary')?.fatal,
    true,
  )
})
