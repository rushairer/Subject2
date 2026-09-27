import assert from 'node:assert/strict'
import test from 'node:test'
import { TRAINING_CAR } from '../src/sim/vehicleDimensions'
import {
  SUBJECT3_LEAD_OBSERVATION,
  SUBJECT3_ONCOMING_OBSERVATION,
  observeSubject3LeadVehicle,
  observeSubject3OncomingVehicle,
} from '../src/subject3/subject3LeadVehicle'
import {
  SUBJECT3_TRAFFIC_CAR,
  createSubject3TrafficState,
  updateSubject3TrafficVehicle,
} from '../src/subject3/subject3Traffic'
import { actorRoutePose } from '../src/subject3/subject3Route'

function playerAt(progress: number, lateral = 0, speed = 10) {
  const pose = actorRoutePose(progress, lateral)
  return {
    x: pose.x,
    z: pose.z,
    speed,
  }
}

test('lead observation ignores opposing and adjacent-lane traffic', () => {
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficVehicle(traffic, 'opposing-close', 1008, 0, 8, true)
  updateSubject3TrafficVehicle(traffic, 'adjacent-close', 1010, -3.5, 8, false)
  updateSubject3TrafficVehicle(traffic, 'same-lane', 1025, 0, 8, false)

  const observation = observeSubject3LeadVehicle(playerAt(1000), traffic)
  assert.equal(observation?.vehicleId, 'same-lane')
})

test('lead observation chooses the nearest same-lane vehicle ahead', () => {
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficVehicle(traffic, 'far', 1060, 0, 7, false)
  updateSubject3TrafficVehicle(traffic, 'near', 1030, 0.2, 8, false)
  updateSubject3TrafficVehicle(traffic, 'behind', 990, 0, 9, false)

  const observation = observeSubject3LeadVehicle(playerAt(1000), traffic)
  assert.equal(observation?.vehicleId, 'near')
  assert.ok(Math.abs((observation?.centerDistanceMeters ?? 0) - 30) < 0.01)
})

test('bumper gap subtracts both vehicle half-lengths from route-center distance', () => {
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficVehicle(traffic, 'lead', 1020, 0, 8, false)

  const observation = observeSubject3LeadVehicle(playerAt(1000, 0, 10), traffic)
  assert.ok(observation)

  const expected =
    20 - (TRAINING_CAR.lengthMeters + SUBJECT3_TRAFFIC_CAR.lengthMeters) / 2
  assert.ok(Math.abs(observation.bumperGapMeters - expected) < 0.01)
  assert.ok(Math.abs(observation.timeGapSeconds - expected / 10) < 0.01)
})

test('closing speed produces time-to-collision only while the player is gaining', () => {
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficVehicle(traffic, 'lead', 1040, 0, 6, false)

  const gaining = observeSubject3LeadVehicle(playerAt(1000, 0, 10), traffic)
  assert.ok(gaining)
  assert.equal(gaining.closingSpeedMps, 4)
  assert.ok((gaining.timeToCollisionSeconds ?? Infinity) > 0)

  const fallingBack = observeSubject3LeadVehicle(playerAt(1000, 0, 5), traffic)
  assert.ok(fallingBack)
  assert.equal(fallingBack.closingSpeedMps, -1)
  assert.equal(fallingBack.timeToCollisionSeconds, undefined)
})

test('very slow player speed does not produce unstable time-gap telemetry', () => {
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficVehicle(traffic, 'lead', 1015, 0, 0, false)

  const observation = observeSubject3LeadVehicle(
    playerAt(1000, 0, SUBJECT3_LEAD_OBSERVATION.minimumPlayerSpeedMps - 0.01),
    traffic,
  )
  assert.equal(observation, undefined)
})

test('actors beyond the observation horizon are ignored', () => {
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficVehicle(traffic, 'too-far', 1000 + SUBJECT3_LEAD_OBSERVATION.maximumLookaheadMeters + 1, 0, 8, false)

  assert.equal(observeSubject3LeadVehicle(playerAt(1000), traffic), undefined)
})


test('reversing does not produce forward following-gap telemetry', () => {
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficVehicle(traffic, 'lead', 1015, 0, 0, false)

  assert.equal(
    observeSubject3LeadVehicle(playerAt(1000, 0, -3), traffic),
    undefined,
  )
})


test('oncoming observation chooses the nearest opposing vehicle ahead', () => {
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficVehicle(traffic, 'same-direction', 1010, 0, 8, false)
  updateSubject3TrafficVehicle(traffic, 'oncoming-far', 1120, -8.75, 9, true)
  updateSubject3TrafficVehicle(traffic, 'oncoming-near', 1060, -8.75, 7, true)

  const observation = observeSubject3OncomingVehicle(playerAt(1000, 0, 10), traffic)
  assert.equal(observation?.vehicleId, 'oncoming-near')
  assert.ok(Math.abs((observation?.centerDistanceMeters ?? 0) - 60) < 0.01)
  assert.equal(observation?.closingSpeedMps, 17)
  assert.ok((observation?.timeToMeetSeconds ?? Infinity) > 0)
})

test('oncoming observation ignores opposing vehicles already behind the player', () => {
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficVehicle(traffic, 'behind', 980, -8.75, 8, true)

  assert.equal(
    observeSubject3OncomingVehicle(playerAt(1000, 0, 10), traffic),
    undefined,
  )
})

test('oncoming observation respects the forward observation horizon and reverse filter', () => {
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficVehicle(
    traffic,
    'too-far',
    1000 + SUBJECT3_ONCOMING_OBSERVATION.maximumLookaheadMeters + 1,
    -8.75,
    8,
    true,
  )

  assert.equal(observeSubject3OncomingVehicle(playerAt(1000, 0, 10), traffic), undefined)
  assert.equal(observeSubject3OncomingVehicle(playerAt(1000, 0, -2), traffic), undefined)
})
