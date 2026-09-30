import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SUBJECT3_CUT_IN_OBSERVATION,
  observeSubject3CutInHazard,
  observeSubject3PedestrianHazard,
} from '../src/subject3/subject3HazardObservation'
import {
  createSubject3TrafficState,
  subject3CutInScooterActive,
  subject3CutInScooterRouteState,
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

test('bus-stop scooter stays active after five seconds until it actually stops', () => {
  const beforeFive = subject3CutInScooterRouteState(true, 4.9)
  const afterFive = subject3CutInScooterRouteState(true, 8)

  assert.equal(subject3CutInScooterActive(true, false), true)
  assert.equal(subject3CutInScooterActive(true, true), false)
  assert.equal(subject3CutInScooterActive(false, false), false)
  assert.ok(afterFive.progress > beforeFive.progress)
  assert.equal(afterFive.lateralSpeedMps, 0)
})

test('cut-in observation remains available while the candidate is stopped', () => {
  const traffic = createSubject3TrafficState()
  publishCutIn(traffic, 'cut-in', 1010, 1.2)

  const observation = observeSubject3CutInHazard(
    playerAt(1000, 0, 0),
    traffic,
  )
  assert.ok(observation)
  assert.equal(observation.hazardId, 'cut-in')
  assert.equal(observation.conflict, true)
  assert.equal(observation.timeToLongitudinalMeetSeconds, undefined)
})


test('pedestrian observation keeps active crossing evidence while the candidate stops', () => {
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficHazard(
    traffic,
    'crosswalk-pedestrian',
    'crosswalk-pedestrian',
    1020,
    0.8,
    0,
    -1.4,
    true,
    true,
  )

  const moving = observeSubject3PedestrianHazard(playerAt(1000, 0, 10), traffic)
  assert.ok(moving)
  assert.equal(moving.hazardId, 'crosswalk-pedestrian')
  assert.equal(moving.conflict, true)
  assert.ok(Math.abs(moving.progressDeltaMeters - 20) < 0.01)
  assert.ok(Math.abs((moving.timeToCrosswalkSeconds ?? 0) - 2) < 0.01)

  const stopped = observeSubject3PedestrianHazard(playerAt(1000, 0, 0), traffic)
  assert.ok(stopped, 'stopping must not erase pedestrian evidence from replay')
  assert.equal(stopped.timeToCrosswalkSeconds, undefined)
})

test('pedestrian observation ignores inactive and out-of-horizon actors', () => {
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficHazard(
    traffic,
    'inactive',
    'crosswalk-pedestrian',
    1010,
    0,
    0,
    -1,
    false,
    true,
  )
  assert.equal(observeSubject3PedestrianHazard(playerAt(1000), traffic), undefined)

  updateSubject3TrafficHazard(
    traffic,
    'far',
    'crosswalk-pedestrian',
    1100,
    0,
    0,
    -1,
    true,
    true,
  )
  assert.equal(observeSubject3PedestrianHazard(playerAt(1000), traffic), undefined)
})

test('pedestrian observation preserves conflict and route-relative lateral evidence', () => {
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficHazard(
    traffic,
    'crosswalk-pedestrian',
    'crosswalk-pedestrian',
    1015,
    -2.2,
    0,
    -1.9,
    true,
    false,
  )

  const observation = observeSubject3PedestrianHazard(playerAt(1000, 0, 8), traffic)
  assert.ok(observation)
  assert.equal(observation.conflict, false)
  assert.ok(Math.abs(observation.lateralDeltaMeters + 2.2) < 0.01)
  assert.equal(observation.lateralSpeedMps, -1.9)
  assert.ok(
    Math.abs(
      observation.planarDistanceMeters - Math.hypot(15, 2.2),
    ) < 0.01,
  )
})
