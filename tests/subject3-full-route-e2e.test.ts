import assert from 'node:assert/strict'
import test from 'node:test'
import { DRIVING_RULES } from '../src/rules/drivingRules'
import { assessSessionResult } from '../src/session/sessionResult'
import {
  createSubject3Runtime,
  updateSubject3,
  type Subject3Runtime,
  type Subject3Vehicle,
} from '../src/subject3/Subject3Course'
import {
  SUBJECT3_EVENTS,
  SUBJECT3_ROUTE_LENGTH,
  poseAtRouteDistance,
} from '../src/subject3/subject3Route'
import {
  SUBJECT3_OVERTAKE_TARGET_PROGRESS,
  createSubject3TrafficState,
  type Subject3TrafficState,
} from '../src/subject3/subject3Traffic'

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

function runGoldenSubject3(automatic: boolean) {
  let runtime = createSubject3Runtime()
  const traffic = createSubject3TrafficState()
  const infractions: Array<{ id: string; points: number; fatal?: boolean }> = []
  const visited: string[] = []

  const step = (
    distance: number,
    lateral = 0,
    overrides: Partial<Subject3Vehicle> = {},
    dt = 0.1,
  ) => {
    const result = updateSubject3(
      vehicleAt(distance, lateral, overrides),
      runtime,
      automatic,
      false,
      dt,
      traffic,
      true,
    )
    runtime = result.runtime
    infractions.push(...result.infractions)
    assert.deepEqual(
      result.infractions,
      [],
      `unexpected infraction at ${distance.toFixed(1)}m: ${result.infractions.map(item => item.id).join(', ')}`,
    )
    return result
  }

  const finishEvent = (
    id: string,
    drive: (event: (typeof SUBJECT3_EVENTS)[number]) => void,
  ) => {
    const index = SUBJECT3_EVENTS.findIndex(event => event.id === id)
    assert.equal(runtime.eventIndex, index, `expected ${id} to be active`)
    const event = SUBJECT3_EVENTS[index]
    visited.push(id)
    drive(event)
    assert.equal(
      runtime.eventIndex,
      index + 1,
      `${id} should advance exactly one event`,
    )
    assert.equal(runtime.eventActive, false)
    assert.equal(runtime.maneuverStarted, false)
    assert.equal(runtime.returnManeuverStarted, false)
  }

  finishEvent('start', event => {
    step(event.start + 1, 0, {
      speed: 1,
      leftIndicator: true,
      leftSignalAge: 3.2,
      lookLeft: true,
    })
    step(event.end + 1, 0, {
      speed: 1,
      leftIndicator: true,
      leftSignalAge: 4,
      lookLeft: true,
    })
  })

  finishEvent('straight-1', event => {
    step(event.start + 1, 0, { lookBack: true })
    step(event.end + 1, 0, { lookBack: true })
  })

  finishEvent('gear', event => {
    if (automatic) {
      step(event.start + 1, 0, { gear: 2 })
      step(event.end + 1, 0, { gear: 2 })
      return
    }

    step(event.start + 1, 0, { gear: 2 })
    step(event.start + 45, 0, { gear: 3 })
    step(event.start + 90, 0, { gear: 4 }, 5.1)
    step(event.end + 1, 0, { gear: 4 })
  })

  const finishTurn = (
    id: string,
    direction: 'left' | 'right',
  ) => finishEvent(id, event => {
    const left = direction === 'left'
    step(event.start + 1, 0, {
      steering: left ? -0.2 : 0.2,
      leftIndicator: left,
      rightIndicator: !left,
      leftSignalAge: left ? 3.2 : 0,
      rightSignalAge: left ? 0 : 3.2,
      lookLeft: true,
      lookRight: true,
    })
    step(event.end + 1, 0, {
      leftIndicator: left,
      rightIndicator: !left,
      leftSignalAge: left ? 4 : 0,
      rightSignalAge: left ? 0 : 4,
      lookLeft: true,
      lookRight: true,
    })
  })

  finishTurn('left-turn-1', 'left')

  for (const id of ['intersection'] as const) {
    finishEvent(id, event => {
      step(event.start + 1, 0, { lookLeft: true, lookRight: true })
      step(event.end + 1, 0, { lookLeft: true, lookRight: true })
    })
  }

  finishTurn('right-turn-1', 'right')

  for (const id of ['school', 'bus-stop'] as const) {
    finishEvent(id, event => {
      step(event.start + 1, 0, { lookLeft: true, lookRight: true })
      step(event.end + 1, 0, { lookLeft: true, lookRight: true })
    })
  }

  finishEvent('meeting', event => {
    step(event.start + 1)
    step(event.end + 1)
  })

  finishEvent('lane-change', event => {
    step(event.start + 1, 0, {
      steering: -0.2,
      leftIndicator: true,
      leftSignalAge: 3.2,
      lookLeft: true,
    })
    step((event.start + event.end) / 2, -2.2, {
      leftIndicator: true,
      leftSignalAge: 4,
      lookLeft: true,
    })
    step(event.end + 1, -2.2, {
      leftIndicator: true,
      leftSignalAge: 4.5,
      lookLeft: true,
    })
  })

  finishEvent('overtake', event => {
    step(event.start + 1, 0, {
      steering: -0.2,
      leftIndicator: true,
      leftSignalAge: 3.2,
      lookLeft: true,
    })
    step(event.start + 55, -2.2, {
      leftIndicator: true,
      leftSignalAge: 4,
      lookLeft: true,
    })
    step(
      SUBJECT3_OVERTAKE_TARGET_PROGRESS +
        DRIVING_RULES.subject3.overtake.passClearanceMeters +
        1,
      -2.2,
      {
        leftIndicator: true,
        leftSignalAge: 4.5,
        lookLeft: true,
      },
    )
    step(event.end - 35, -1.0, {
      rightIndicator: true,
      rightSignalAge: 3.2,
      lookRight: true,
    })
    step(event.end + 1, -1.0, {
      rightIndicator: true,
      rightSignalAge: 4,
      lookRight: true,
    })
  })

  finishTurn('left-turn-2', 'left')

  finishEvent('crosswalk', event => {
    step(event.start + 1, 0, {
      lookLeft: true,
      lookRight: true,
    })

    traffic.crosswalkPedestrianConflict = true
    step((event.start + event.end) / 2, 0, {
      speed: 0,
      lookLeft: true,
      lookRight: true,
    }, 0.2)
    assert.equal(runtime.crosswalkConflictSeen, true)
    assert.equal(runtime.crosswalkYieldStopSeen, true)

    traffic.crosswalkPedestrianConflict = false
    step(event.end + 1, 0, {
      lookLeft: true,
      lookRight: true,
    })
  })

  finishEvent('straight-2', event => {
    step(event.start + 1, 0, { lookBack: true })
    step(event.end + 1, 0, { lookBack: true })
  })

  finishTurn('left-turn-3', 'left')

  finishEvent('intersection-2', event => {
    step(event.start + 1, 0, { lookLeft: true, lookRight: true })
    step(event.end + 1, 0, { lookLeft: true, lookRight: true })
  })

  finishEvent('uturn', event => {
    step(event.start + 1, 0, {
      steering: -0.2,
      leftIndicator: true,
      leftSignalAge: 3.2,
      lookLeft: true,
    })
    step(event.end + 1, 0, {
      leftIndicator: true,
      leftSignalAge: 4,
      lookLeft: true,
    })
  })

  const pullOverIndex = SUBJECT3_EVENTS.findIndex(event => event.id === 'pull-over')
  assert.equal(runtime.eventIndex, pullOverIndex)
  visited.push('pull-over')
  const pullOver = SUBJECT3_EVENTS[pullOverIndex]

  step(pullOver.start + 1, 0, {
    steering: 0.2,
    rightIndicator: true,
    rightSignalAge: 3.2,
    lookRight: true,
  })
  step(pullOver.start + 60, 0.6, {
    speed: 0,
    gear: 0,
    handbrake: true,
    rightIndicator: true,
    rightSignalAge: 4,
    lookRight: true,
  }, 1.0)

  assert.equal(runtime.pullOverSecuredStopSeen, true)
  assert.equal(runtime.completed, true)
  assert.deepEqual(visited, SUBJECT3_EVENTS.map(event => event.id))

  return { runtime, infractions }
}

for (const automatic of [false, true]) {
  test(`${automatic ? 'C2' : 'C1'} Subject 3 golden route completes every event in order with no stale state`, () => {
    const { runtime, infractions } = runGoldenSubject3(automatic)

    assert.equal(infractions.length, 0)
    assert.equal(runtime.completed, true)

    const result = assessSessionResult({
      examId: 'subject3',
      score: 100,
      completed: runtime.completed,
      infractions,
    })
    assert.deepEqual(result, {
      passLine: 90,
      passed: true,
      status: 'passed',
    })
  })
}

test('reaching the physical route end cannot skip unfinished Subject 3 events', () => {
  const result = updateSubject3(
    vehicleAt(SUBJECT3_ROUTE_LENGTH - 5, 0, {
      speed: 1,
      seatbelt: true,
      lowBeam: true,
    }),
    createSubject3Runtime(),
    false,
    false,
    0.1,
    createSubject3TrafficState(),
    true,
  )

  assert.equal(result.runtime.completed, false)
  assert.notEqual(result.runtime.eventIndex, SUBJECT3_EVENTS.length)
})

test('passing the final pull-over window without a secured stop remains incomplete', () => {
  const pullOverIndex = SUBJECT3_EVENTS.findIndex(event => event.id === 'pull-over')
  const runtime: Subject3Runtime = {
    ...createSubject3Runtime(),
    eventIndex: pullOverIndex,
    started: true,
  }
  const pullOver = SUBJECT3_EVENTS[pullOverIndex]

  const result = updateSubject3(
    vehicleAt(pullOver.end + 1, 0, {
      speed: 1.5,
      rightIndicator: true,
      rightSignalAge: 4,
      lookRight: true,
    }),
    runtime,
    false,
    false,
    0.1,
    createSubject3TrafficState(),
    true,
  )

  assert.equal(result.runtime.completed, false)
  assert.equal(
    result.infractions.some(item => item.id.endsWith('stop')),
    true,
  )

  const assessed = assessSessionResult({
    examId: 'subject3',
    score: 0,
    completed: result.runtime.completed,
    infractions: result.infractions,
  })
  assert.equal(assessed.passed, false)
  assert.equal(assessed.status, 'failed')
})
