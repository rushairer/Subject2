import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SUBJECT3_CUT_IN_OBSERVATION,
  observeSubject3CutInHazard,
} from '../src/subject3/subject3HazardObservation'
import {
  createSubject3TrafficState,
  updateSubject3TrafficHazard,
} from '../src/subject3/subject3Traffic'
import { actorRoutePose } from '../src/subject3/subject3Route'

function playerAt(progress: number, lateral = 0, speed = 10) {
  const pose = actorRoutePose(progress, lateral)
  return { x: pose.x, z: pose.z, speed }
}

function publishCutIn(
  traffic: ReturnType<typeof createSubject3TrafficState>,
  id: string,
  progress: number,
  lateral: number,
  overrides: {
    longitudinalSpeedMps?: number
    lateralSpeedMps?: number
    active?: boolean
    conflict?: boolean
  } = {},
) {
  return updateSubject3TrafficHazard(
    traffic,
    id,
    'cut-in-scooter',
    progress,
    lateral,
    overrides.longitudinalSpeedMps ?? 3.2,
    overrides.lateralSpeedMps ?? -0.97,
    overrides.active ?? true,
    overrides.conflict ?? true,
  )
}

test('cut-in observation ignores inactive, unrelated and distant hazards', () => {
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficHazard(
    traffic,
    'pedestrian',
    'crosswalk-pedestrian',
    1010,
    0,
    0,
    -1,
    true,
    true,
  )
  publishCutIn(traffic, 'inactive', 1012, 1.2, { active: false })
  publishCutIn(
    traffic,
    'too-far',
    1000 + SUBJECT3_CUT_IN_OBSERVATION.maximumAheadMeters + 1,
    1,
  )

  assert.equal(observeSubject3CutInHazard(playerAt(1000), traffic), undefined)
})

test('cut-in observation reports route-relative motion and longitudinal meeting time', () => {
  const traffic = createSubject3TrafficState()
  publishCutIn(traffic, 'cut-in', 1020, 1.4, {
    longitudinalSpeedMps: 4,
    lateralSpeedMps: -1,
  })

  const observation = observeSubject3CutInHazard(playerAt(1000, 0, 10), traffic)
  assert.ok(observation)
  assert.equal(observation.hazardId, 'cut-in')
  assert.ok(Math.abs(observation.progressDeltaMeters - 20) < 0.01)
  assert.ok(Math.abs(observation.lateralDeltaMeters - 1.4) < 0.01)
  assert.equal(observation.closingSpeedMps, 6)
  assert.ok(Math.abs((observation.timeToLongitudinalMeetSeconds ?? 0) - 20 / 6) < 0.01)
  assert.equal(observation.conflict, true)
})

test('candidate lane position participates in cut-in conflict classification', () => {
  const traffic = createSubject3TrafficState()
  publishCutIn(traffic, 'cut-in', 1015, 1.6)

  const rightLane = observeSubject3CutInHazard(playerAt(1000, 0), traffic)
  assert.equal(rightLane?.conflict, true)

  const adjacentLane = observeSubject3CutInHazard(playerAt(1000, -3.5), traffic)
  assert.equal(adjacentLane?.conflict, false)
})

test('cut-in observation chooses the nearest relevant hazard', () => {
  const traffic = createSubject3TrafficState()
  publishCutIn(traffic, 'far', 1035, 1.2)
  publishCutIn(traffic, 'near', 1010, 1.1)

  const observation = observeSubject3CutInHazard(playerAt(1000), traffic)
  assert.equal(observation?.hazardId, 'near')
})

test('longitudinal meeting time is omitted when the hazard is behind or pulling away', () => {
  const traffic = createSubject3TrafficState()
  publishCutIn(traffic, 'behind', 998, 1.1, { longitudinalSpeedMps: 3 })
  let observation = observeSubject3CutInHazard(playerAt(1000, 0, 10), traffic)
  assert.equal(observation?.timeToLongitudinalMeetSeconds, undefined)

  traffic.hazards = {}
  publishCutIn(traffic, 'pulling-away', 1015, 1.1, { longitudinalSpeedMps: 12 })
  observation = observeSubject3CutInHazard(playerAt(1000, 0, 10), traffic)
  assert.equal(observation?.closingSpeedMps, -2)
  assert.equal(observation?.timeToLongitudinalMeetSeconds, undefined)
})

test('very low candidate speed suppresses cut-in observation', () => {
  const traffic = createSubject3TrafficState()
  publishCutIn(traffic, 'cut-in', 1010, 1.2)

  assert.equal(
    observeSubject3CutInHazard(
      playerAt(1000, 0, SUBJECT3_CUT_IN_OBSERVATION.minimumPlayerSpeedMps - 0.01),
      traffic,
    ),
    undefined,
  )
})
