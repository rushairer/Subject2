import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createSubject3Runtime,
  updateSubject3,
  type Subject3Runtime,
  type Subject3Vehicle,
} from '../src/subject3/Subject3Course'
import { DRIVING_RULES } from '../src/rules/drivingRules'
import { TRAINING_CAR } from '../src/sim/vehicleDimensions'
import {
  CENTER_LINE_OFFSET,
  RIGHT_EDGE_OFFSET,
  SUBJECT3_EVENTS,
  poseAtRouteDistance,
} from '../src/subject3/subject3Route'
import {
  SUBJECT3_OVERTAKE_TARGET_PROGRESS,
  createSubject3TrafficState,
} from '../src/subject3/subject3Traffic'

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

test('moving without a seatbelt is immediately fatal', () => {
  const result = updateSubject3(vehicleAt(80, 0, {
    speed: 1,
    seatbelt: false,
  }), createSubject3Runtime(), false, false, 0.1)

  assert.equal(
    result.infractions.some(item => item.id === 'subject3-seatbelt'),
    true,
  )
  assert.equal(
    result.infractions.find(item => item.id === 'subject3-seatbelt')?.fatal,
    true,
  )
})

test('being stationary before fastening the seatbelt is not penalized yet', () => {
  const result = updateSubject3(vehicleAt(20, 0, {
    speed: 0,
    seatbelt: false,
  }), createSubject3Runtime(), false, false, 0.1)

  assert.equal(
    result.infractions.some(item => item.id === 'subject3-seatbelt'),
    false,
  )
})

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
    lookBack: true,
  }), runtime, false, false, 0.1)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    steering: 0.55,
    lookBack: true,
  }), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'direction'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('direction'))?.fatal, true)
})

test('straight driving requires periodic rear-traffic observation', () => {
  const event = SUBJECT3_EVENTS[eventIndex('straight-1')]
  let runtime = runtimeFor('straight-1')

  let result = updateSubject3(vehicleAt(event.start + 1), runtime, false, false, 0.1)
  runtime = result.runtime
  result = updateSubject3(vehicleAt(event.end + 1), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'observation'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('observation'))?.points, 10)

  runtime = runtimeFor('straight-1')
  result = updateSubject3(vehicleAt(event.start + 1, 0, {
    lookBack: true,
  }), runtime, false, false, 0.1)
  runtime = result.runtime
  result = updateSubject3(vehicleAt(event.end + 1), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'observation'), false)
})

test('manual gear event fails if fourth gear is never reached while automatic mode is exempt', () => {
  const event = SUBJECT3_EVENTS[eventIndex('gear')]

  let runtime = runtimeFor('gear')
  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    gear: 2,
  }), runtime, false, false, 0.1)
  runtime = result.runtime
  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    gear: 3,
  }), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'gear'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('gear'))?.points, 100)
  assert.equal(result.infractions.find(item => item.id.endsWith('gear'))?.fatal, true)

  runtime = runtimeFor('gear')
  result = updateSubject3(vehicleAt(event.start + 1, 0, {
    gear: 2,
  }), runtime, true, false, 0.1)
  runtime = result.runtime
  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    gear: 2,
  }), runtime, true, false, 0.1)

  assert.equal(hasInfraction(result, 'gear'), false)
  assert.equal(hasInfraction(result, 'skip-gear'), false)
  assert.equal(hasInfraction(result, 'high-gear-duration'), false)
})

test('manual gear event rejects skipped upshifts', () => {
  const event = SUBJECT3_EVENTS[eventIndex('gear')]
  let runtime = runtimeFor('gear')

  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    gear: 2,
  }), runtime, false, false, 0.1)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(event.start + 60, 0, {
    gear: 4,
  }), runtime, false, false, 5.1)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    gear: 4,
  }), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'skip-gear'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('skip-gear'))?.fatal, true)
})

test('manual gear event penalizes insufficient time in fourth gear or above', () => {
  const event = SUBJECT3_EVENTS[eventIndex('gear')]
  let runtime = runtimeFor('gear')

  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    gear: 2,
  }), runtime, false, false, 0.1)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(event.start + 50, 0, {
    gear: 3,
  }), runtime, false, false, 0.1)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(event.start + 100, 0, {
    gear: 4,
  }), runtime, false, false, 1.0)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    gear: 4,
  }), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'gear'), false)
  assert.equal(hasInfraction(result, 'skip-gear'), false)
  assert.equal(hasInfraction(result, 'high-gear-duration'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('high-gear-duration'))?.points, 10)
  assert.equal(result.infractions.find(item => item.id.endsWith('high-gear-duration'))?.fatal, false)
})

test('manual gear event passes a sequential upshift held in fourth gear long enough', () => {
  const event = SUBJECT3_EVENTS[eventIndex('gear')]
  let runtime = runtimeFor('gear')

  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    gear: 2,
  }), runtime, false, false, 0.1)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(event.start + 45, 0, {
    gear: 3,
  }), runtime, false, false, 0.1)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(event.start + 90, 0, {
    gear: 4,
  }), runtime, false, false, 5.1)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    gear: 4,
  }), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'gear'), false)
  assert.equal(hasInfraction(result, 'skip-gear'), false)
  assert.equal(hasInfraction(result, 'high-gear-duration'), false)
})

test('slow-zone speeding is fatal and independent from observation coverage', () => {
  const event = SUBJECT3_EVENTS[eventIndex('school')]
  let runtime = runtimeFor('school')
  const speed = 34 / 3.6

  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    speed,
    lookLeft: true,
    lookRight: true,
  }), runtime, false, false, 0.1)
  runtime = result.runtime
  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    speed,
    lookLeft: true,
    lookRight: true,
  }), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'speed'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('speed'))?.points, 100)
  assert.equal(result.infractions.find(item => item.id.endsWith('speed'))?.fatal, true)
  assert.equal(hasInfraction(result, 'observation'), false)
})

test('intersection, school, bus-stop and crosswalk slow zones require left/right observation', () => {
  for (const id of ['intersection', 'school', 'bus-stop', 'crosswalk', 'intersection-2']) {
    const event = SUBJECT3_EVENTS[eventIndex(id)]
    let runtime = runtimeFor(id)

    let result = updateSubject3(vehicleAt(event.start + 1, 0, {
      lookLeft: true,
      lookRight: false,
    }), runtime, false, false, 0.1)
    runtime = result.runtime

    result = updateSubject3(vehicleAt(event.end + 1, 0, {
      lookLeft: true,
      lookRight: false,
    }), runtime, false, false, 0.1)

    assert.equal(hasInfraction(result, 'observation'), true, `${id} must require both-side observation`)
    assert.equal(result.infractions.find(item => item.id.endsWith('observation'))?.fatal, true)
  }
})

test('observed slow zones pass without a false observation penalty', () => {
  for (const id of ['intersection', 'school', 'bus-stop', 'crosswalk', 'intersection-2']) {
    const event = SUBJECT3_EVENTS[eventIndex(id)]
    let runtime = runtimeFor(id)

    let result = updateSubject3(vehicleAt(event.start + 1, 0, {
      lookLeft: true,
      lookRight: true,
    }), runtime, false, false, 0.1)
    runtime = result.runtime

    result = updateSubject3(vehicleAt(event.end + 1, 0, {
      lookLeft: true,
      lookRight: true,
    }), runtime, false, false, 0.1)

    assert.equal(hasInfraction(result, 'observation'), false, `${id} should accept both-side observation`)
  }
})

test('intersection turn speeding is fatal under the same deceleration rule', () => {
  const event = SUBJECT3_EVENTS[eventIndex('left-turn-1')]
  const speed = 34 / 3.6
  let runtime = runtimeFor('left-turn-1')

  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    speed,
    steering: -0.2,
    leftIndicator: true,
    leftSignalAge: 3.2,
    lookLeft: true,
    lookRight: true,
  }), runtime, false, false, 0.1)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    speed,
    leftIndicator: true,
    leftSignalAge: 4,
    lookLeft: true,
    lookRight: true,
  }), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'speed'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('speed'))?.fatal, true)
})

test('crosswalk pedestrian conflict requires a real yield stop', () => {
  const event = SUBJECT3_EVENTS[eventIndex('crosswalk')]
  const traffic = createSubject3TrafficState()
  traffic.crosswalkPedestrianConflict = true
  let runtime = runtimeFor('crosswalk')

  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    lookLeft: true,
    lookRight: true,
  }), runtime, false, false, 0.1, traffic)
  runtime = result.runtime

  traffic.crosswalkPedestrianConflict = false
  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    lookLeft: true,
    lookRight: true,
  }), runtime, false, false, 0.1, traffic)

  assert.equal(hasInfraction(result, 'yield'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('yield'))?.fatal, true)
})

test('crosswalk yield stop satisfies a live pedestrian conflict', () => {
  const event = SUBJECT3_EVENTS[eventIndex('crosswalk')]
  const traffic = createSubject3TrafficState()
  traffic.crosswalkPedestrianConflict = true
  let runtime = runtimeFor('crosswalk')

  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    lookLeft: true,
    lookRight: true,
  }), runtime, false, false, 0.1, traffic)
  runtime = result.runtime

  result = updateSubject3(vehicleAt((event.start + event.end) / 2, 0, {
    speed: 0,
    lookLeft: true,
    lookRight: true,
  }), runtime, false, false, 0.2, traffic)
  runtime = result.runtime

  assert.equal(runtime.crosswalkConflictSeen, true)
  assert.equal(runtime.crosswalkYieldStopSeen, true)

  traffic.crosswalkPedestrianConflict = false
  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    lookLeft: true,
    lookRight: true,
  }), runtime, false, false, 0.1, traffic)

  assert.equal(hasInfraction(result, 'yield'), false)
})

test('crosswalk does not require an artificial stop when no pedestrian conflict occurs', () => {
  const event = SUBJECT3_EVENTS[eventIndex('crosswalk')]
  const traffic = createSubject3TrafficState()
  let runtime = runtimeFor('crosswalk')

  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    lookLeft: true,
    lookRight: true,
  }), runtime, false, false, 0.1, traffic)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    lookLeft: true,
    lookRight: true,
  }), runtime, false, false, 0.1, traffic)

  assert.equal(result.infractions.some(item => item.id.endsWith('yield')), false)
})

test('legal left and right turns require both-side observation and finish on the route heading', () => {
  for (const [id, steering, indicator] of [
    ['left-turn-1', -0.2, 'left'] as const,
    ['right-turn-1', 0.2, 'right'] as const,
  ]) {
    const event = SUBJECT3_EVENTS[eventIndex(id)]
    let runtime = runtimeFor(id)

    let result = updateSubject3(vehicleAt(event.start + 1, 0, {
      steering,
      leftIndicator: indicator === 'left',
      rightIndicator: indicator === 'right',
      leftSignalAge: indicator === 'left' ? 3.2 : 0,
      rightSignalAge: indicator === 'right' ? 3.2 : 0,
      lookLeft: true,
      lookRight: true,
    }), runtime, false, false, 0.1)
    runtime = result.runtime

    result = updateSubject3(vehicleAt(event.end + 1, 0, {
      leftIndicator: indicator === 'left',
      rightIndicator: indicator === 'right',
      leftSignalAge: indicator === 'left' ? 4 : 0,
      rightSignalAge: indicator === 'right' ? 4 : 0,
      lookLeft: true,
      lookRight: true,
    }), runtime, false, false, 0.1)

    assert.deepEqual(result.infractions, [], `${id} should complete legally`)
  }
})

test('intersection turn fails if one traffic side was never observed', () => {
  const event = SUBJECT3_EVENTS[eventIndex('left-turn-1')]
  let runtime = runtimeFor('left-turn-1')

  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    steering: -0.2,
    leftIndicator: true,
    leftSignalAge: 3.2,
    lookLeft: true,
    lookRight: false,
  }), runtime, false, false, 0.1)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    leftIndicator: true,
    leftSignalAge: 4,
    lookLeft: true,
    lookRight: false,
  }), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'observation'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('observation'))?.fatal, true)
})

test('turn event fails when the vehicle reaches the event end with the wrong heading', () => {
  const event = SUBJECT3_EVENTS[eventIndex('right-turn-1')]
  const startPose = poseAtRouteDistance(event.start + 1)
  let runtime = runtimeFor('right-turn-1')

  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    steering: 0.2,
    rightIndicator: true,
    rightSignalAge: 3.2,
    lookLeft: true,
    lookRight: true,
  }), runtime, false, false, 0.1)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    heading: startPose.heading,
    rightIndicator: true,
    rightSignalAge: 4,
    lookLeft: true,
    lookRight: true,
  }), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'path'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('path'))?.fatal, true)
})

test('meeting fails if the vehicle body crosses the center line into opposing traffic', () => {
  const event = SUBJECT3_EVENTS[eventIndex('meeting')]
  const lateral =
    CENTER_LINE_OFFSET +
    TRAINING_CAR.widthMeters / 2 -
    0.02
  let runtime = runtimeFor('meeting')

  let result = updateSubject3(vehicleAt(event.start + 1, lateral), runtime, false, false, 0.1)
  runtime = result.runtime
  result = updateSubject3(vehicleAt(event.end + 1, lateral), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'opposite-lane'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('opposite-lane'))?.fatal, true)
})

test('meeting remains legal when the full body stays on its own side of the center line', () => {
  const event = SUBJECT3_EVENTS[eventIndex('meeting')]
  const lateral =
    CENTER_LINE_OFFSET +
    TRAINING_CAR.widthMeters / 2 +
    0.02
  let runtime = runtimeFor('meeting')

  let result = updateSubject3(vehicleAt(event.start + 1, lateral), runtime, false, false, 0.1)
  runtime = result.runtime
  result = updateSubject3(vehicleAt(event.end + 1, lateral), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'opposite-lane'), false)
})

test('u-turn must actually reverse the route heading', () => {
  const event = SUBJECT3_EVENTS[eventIndex('uturn')]
  let runtime = runtimeFor('uturn')

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

  assert.equal(hasInfraction(result, 'path'), false)

  runtime = runtimeFor('uturn')
  result = updateSubject3(vehicleAt(event.start + 1, 0, {
    steering: -0.2,
    leftIndicator: true,
    leftSignalAge: 3.2,
    lookLeft: true,
  }), runtime, false, false, 0.1)
  runtime = result.runtime

  const startHeading = poseAtRouteDistance(event.start + 1).heading
  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    heading: startHeading,
    leftIndicator: true,
    leftSignalAge: 4,
    lookLeft: true,
  }), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'path'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('path'))?.fatal, true)
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

test('lane change must end in the target lane, not merely visit it briefly', () => {
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

  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    leftIndicator: true,
    leftSignalAge: 5,
    lookLeft: true,
  }), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'completion'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('completion'))?.fatal, true)
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

  result = updateSubject3(vehicleAt(
    SUBJECT3_OVERTAKE_TARGET_PROGRESS +
      DRIVING_RULES.subject3.overtake.passClearanceMeters +
      1,
    -2.2,
    {
      leftIndicator: true,
      leftSignalAge: 4.5,
      lookLeft: true,
    },
  ), runtime, false, false, 0.1)
  runtime = result.runtime
  assert.equal(runtime.overtakeTargetPassed, true)

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

test('overtake cannot start the return before actually passing the target vehicle', () => {
  const event = SUBJECT3_EVENTS[eventIndex('overtake')]
  let runtime = runtimeFor('overtake')

  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    steering: -0.2,
    leftIndicator: true,
    leftSignalAge: 3.2,
    lookLeft: true,
  }), runtime, false, false, 0.1)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(
    SUBJECT3_OVERTAKE_TARGET_PROGRESS - 8,
    -2.2,
    {
      leftIndicator: true,
      leftSignalAge: 4,
      lookLeft: true,
    },
  ), runtime, false, false, 0.1)
  runtime = result.runtime
  assert.equal(runtime.overtakeTargetPassed, false)

  result = updateSubject3(vehicleAt(
    SUBJECT3_OVERTAKE_TARGET_PROGRESS - 4,
    -1.0,
    {
      rightIndicator: true,
      rightSignalAge: 3.2,
      lookRight: true,
    },
  ), runtime, false, false, 0.1)
  runtime = result.runtime
  assert.equal(runtime.returnManeuverStarted, false)

  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    rightIndicator: true,
    rightSignalAge: 4,
    lookRight: true,
  }), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'target-pass'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('target-pass'))?.fatal, true)
})

test('overtake must finish back in the original lane after starting the return', () => {
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

  result = updateSubject3(vehicleAt(
    SUBJECT3_OVERTAKE_TARGET_PROGRESS +
      DRIVING_RULES.subject3.overtake.passClearanceMeters +
      1,
    -2.2,
    {
      leftIndicator: true,
      leftSignalAge: 4.5,
      lookLeft: true,
    },
  ), runtime, false, false, 0.1)
  runtime = result.runtime
  assert.equal(runtime.overtakeTargetPassed, true)

  result = updateSubject3(vehicleAt(event.start + 120, -1.0, {
    rightIndicator: true,
    rightSignalAge: 3.2,
    lookRight: true,
  }), runtime, false, false, 0.1)
  runtime = result.runtime
  assert.equal(runtime.returnManeuverStarted, true)

  result = updateSubject3(vehicleAt(event.end + 1, -1.5, {
    rightIndicator: true,
    rightSignalAge: 4,
    lookRight: true,
  }), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'return-path'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('return-path'))?.fatal, true)
})

test('brief pull-over stop does not count as a completed parking maneuver', () => {
  const event = SUBJECT3_EVENTS[eventIndex('pull-over')]
  let runtime = runtimeFor('pull-over')

  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    steering: 0.2,
    rightIndicator: true,
    rightSignalAge: 3.2,
    lookRight: true,
  }), runtime, false, false, 0.1)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(event.start + 30, 0.55, {
    speed: 0,
    gear: 0,
    handbrake: true,
    rightIndicator: true,
    rightSignalAge: 4,
    lookRight: true,
  }), runtime, false, false, 0.2)
  runtime = result.runtime
  assert.equal(runtime.pullOverSecuredStopSeen, false)

  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    speed: 1.5,
    gear: 1,
    handbrake: false,
    rightIndicator: true,
    rightSignalAge: 5,
    lookRight: true,
  }), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'stop'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('stop'))?.fatal, true)
})

test('stable stop without neutral and parking brake is still an incomplete pull-over', () => {
  const event = SUBJECT3_EVENTS[eventIndex('pull-over')]
  let runtime = runtimeFor('pull-over')

  let result = updateSubject3(vehicleAt(event.start + 1, 0, {
    steering: 0.2,
    rightIndicator: true,
    rightSignalAge: 3.2,
    lookRight: true,
  }), runtime, false, false, 0.1)
  runtime = result.runtime

  result = updateSubject3(vehicleAt(event.start + 30, 0.55, {
    speed: 0,
    gear: 1,
    handbrake: false,
    rightIndicator: true,
    rightSignalAge: 4,
    lookRight: true,
  }), runtime, false, false, 1.0)
  runtime = result.runtime

  assert.equal(runtime.pullOverStopSeconds >= DRIVING_RULES.subject3.pullOver.stableStopSeconds, true)
  assert.equal(runtime.pullOverSecuredStopSeen, false)
  assert.equal(runtime.completed, false)

  result = updateSubject3(vehicleAt(event.end + 1, 0, {
    speed: 1.5,
    gear: 1,
    handbrake: false,
    rightIndicator: true,
    rightSignalAge: 5,
    lookRight: true,
  }), runtime, false, false, 0.1)

  assert.equal(hasInfraction(result, 'stop'), true)
  assert.equal(result.infractions.find(item => item.id.endsWith('stop'))?.fatal, true)
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

test('road boundary uses the full vehicle body even while the center remains inside', () => {
  const centerLateral =
    RIGHT_EDGE_OFFSET +
    DRIVING_RULES.subject3.roadBoundaryToleranceMeters -
    TRAINING_CAR.widthMeters / 2 +
    0.01

  assert.ok(centerLateral < RIGHT_EDGE_OFFSET, 'fixture center must still be inside the painted road edge')

  const result = updateSubject3(vehicleAt(200, centerLateral), {
    ...createSubject3Runtime(),
    started: true,
  }, false, false, 0.1)

  assert.equal(
    result.infractions.some(item => item.id === 'subject3-road-boundary'),
    true,
  )
})

test('body tangent to the tolerated Subject 3 road boundary remains legal', () => {
  const centerLateral =
    RIGHT_EDGE_OFFSET +
    DRIVING_RULES.subject3.roadBoundaryToleranceMeters -
    TRAINING_CAR.widthMeters / 2

  const result = updateSubject3(vehicleAt(200, centerLateral), {
    ...createSubject3Runtime(),
    started: true,
  }, false, false, 0.1)

  assert.equal(
    result.infractions.some(item => item.id === 'subject3-road-boundary'),
    false,
  )
})

test('full-body boundary judging does not reject a legal vehicle at a 90-degree route corner', () => {
  const result = updateSubject3(vehicleAt(700), {
    ...createSubject3Runtime(),
    started: true,
  }, false, false, 0.1)

  assert.equal(
    result.infractions.some(item => item.id === 'subject3-road-boundary'),
    false,
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
