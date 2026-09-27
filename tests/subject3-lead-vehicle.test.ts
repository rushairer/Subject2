import assert from 'node:assert/strict'
import test from 'node:test'
import { TRAINING_CAR } from '../src/sim/vehicleDimensions'
import {
  SUBJECT3_LEAD_OBSERVATION,
  observeSubject3LeadVehicle,
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
  updateSubject3TrafficVehicle(traffic, {
    id: 'opposing-close',
    progress: 1008,
    lateral: 0,
    speedMps: 8,
    opposite: true,
  })
  updateSubject3TrafficVehicle(traffic, {
    id: 'adjacent-close',
    progress: 1010,
    lateral: -3.5,
    speedMps: 8,
    opposite: false,
  })
  updateSubject3TrafficVehicle(traffic, {
    id: 'same-lane',
    progress: 1025,
    lateral: 0,
    speedMps: 8,
    opposite: false,
  })

  const observation = observeSubject3LeadVehicle(playerAt(1000), traffic)
  assert.equal(observation?.vehicleId, 'same-lane')
})

test('lead observation chooses the nearest same-lane vehicle ahead', () => {
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficVehicle(traffic, {
    id: 'far',
    progress: 1060,
    lateral: 0,
    speedMps: 7,
    opposite: false,
  })
  updateSubject3TrafficVehicle(traffic, {
    id: 'near',
    progress: 1030,
    lateral: 0.2,
    speedMps: 8,
    opposite: false,
  })
  updateSubject3TrafficVehicle(traffic, {
    id: 'behind',
    progress: 990,
    lateral: 0,
    speedMps: 9,
    opposite: false,
  })

  const observation = observeSubject3LeadVehicle(playerAt(1000), traffic)
  assert.equal(observation?.vehicleId, 'near')
  assert.ok(Math.abs((observation?.centerDistanceMeters ?? 0) - 30) < 0.01)
})

test('bumper gap subtracts both vehicle half-lengths from route-center distance', () => {
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficVehicle(traffic, {
    id: 'lead',
    progress: 1020,
    lateral: 0,
    speedMps: 8,
    opposite: false,
  })

  const observation = observeSubject3LeadVehicle(playerAt(1000, 0, 10), traffic)
  assert.ok(observation)

  const expected =
    20 - (TRAINING_CAR.lengthMeters + SUBJECT3_TRAFFIC_CAR.lengthMeters) / 2
  assert.ok(Math.abs(observation.bumperGapMeters - expected) < 0.01)
  assert.ok(Math.abs(observation.timeGapSeconds - expected / 10) < 0.01)
})

test('closing speed produces time-to-collision only while the player is gaining', () => {
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficVehicle(traffic, {
    id: 'lead',
    progress: 1040,
    lateral: 0,
    speedMps: 6,
    opposite: false,
  })

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
  updateSubject3TrafficVehicle(traffic, {
    id: 'lead',
    progress: 1015,
    lateral: 0,
    speedMps: 0,
    opposite: false,
  })

  const observation = observeSubject3LeadVehicle(
    playerAt(1000, 0, SUBJECT3_LEAD_OBSERVATION.minimumPlayerSpeedMps - 0.01),
    traffic,
  )
  assert.equal(observation, undefined)
})

test('actors beyond the observation horizon are ignored', () => {
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficVehicle(traffic, {
    id: 'too-far',
    progress: 1000 + SUBJECT3_LEAD_OBSERVATION.maximumLookaheadMeters + 1,
    lateral: 0,
    speedMps: 8,
    opposite: false,
  })

  assert.equal(observeSubject3LeadVehicle(playerAt(1000), traffic), undefined)
})
