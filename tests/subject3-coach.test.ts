import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  createSubject3CoachRuntime,
  stepSubject3Coach,
} from '../src/coach/subject3Coach'
import { DRIVING_RULES } from '../src/rules/drivingRules'
import { stepVehiclePhysics, type PhysicsVehicle } from '../src/sim/vehiclePhysics'
import {
  createSubject3Runtime,
  updateSubject3,
  type Subject3Vehicle,
} from '../src/subject3/Subject3Course'
import {
  SUBJECT3_EVENTS,
  poseAtRouteDistance,
  projectToSubject3Route,
} from '../src/subject3/subject3Route'
import {
  createSubject3TrafficState,
  updateSubject3TrafficHazard,
  updateSubject3TrafficVehicle,
} from '../src/subject3/subject3Traffic'

type IntegratedVehicle = PhysicsVehicle & Subject3Vehicle

function vehicleAtProgress(progress: number, speed = 0): IntegratedVehicle {
  const pose = poseAtRouteDistance(progress)
  return {
    x: pose.x,
    z: pose.z,
    heading: pose.heading,
    speed,
    steering: 0,
    steeringWheelAngle: 0,
    throttle: 0,
    brake: 0,
    clutch: 0,
    gear: 1,
    engineOn: true,
    engineRpm: DRIVING_RULES.manualTransmission.idleRpm,
    stallTimer: 0,
    handbrake: true,
    leftIndicator: false,
    rightIndicator: false,
    horn: false,
    seatbelt: true,
    lowBeam: false,
    highBeam: false,
    leftSignalAge: 0,
    rightSignalAge: 0,
    lookLeft: false,
    lookRight: false,
    lookBack: false,
  }
}

function runSubject3Coach(automatic: boolean) {
  const dt = 0.05
  const maxFrames = automatic ? 18_000 : 32_000
  const vehicle = vehicleAtProgress(0)
  vehicle.clutch = automatic ? 0 : 1

  let coach = createSubject3CoachRuntime()
  let course = createSubject3Runtime()
  const traffic = createSubject3TrafficState()
  const completedEvents: string[] = []
  let lastEventIndex = 0
  let maxAbsLateral = 0
  let stallCount = 0

  for (let frame = 0; frame < maxFrames && !course.completed; frame++) {
    const next = stepSubject3Coach(
      vehicle,
      coach,
      dt,
      automatic,
      false,
      traffic,
    )
    coach = next.runtime
    const command = next.command

    vehicle.engineOn = command.engineOn
    vehicle.handbrake = command.handbrake
    vehicle.seatbelt = command.seatbelt
    vehicle.gear = command.gear
    vehicle.leftIndicator = command.leftIndicator
    vehicle.rightIndicator = command.rightIndicator
    vehicle.lowBeam = command.lowBeam
    vehicle.highBeam = command.highBeam
    vehicle.horn = command.horn
    vehicle.lookLeft = command.lookLeft
    vehicle.lookRight = command.lookRight
    vehicle.lookBack = command.lookBack

    const physics = stepVehiclePhysics(vehicle, {
      throttle: command.throttle,
      brake: command.brake,
      clutch: command.clutch,
      steer: 0,
      steeringWheelTarget: command.steeringWheelTarget,
    }, dt, {
      automatic,
      grade: 0,
    })
    if (physics.stalled) stallCount += 1

    vehicle.leftSignalAge = vehicle.leftIndicator
      ? vehicle.leftSignalAge + dt
      : 0
    vehicle.rightSignalAge = vehicle.rightIndicator
      ? vehicle.rightSignalAge + dt
      : 0

    if (
      projectToSubject3Route(vehicle.x, vehicle.z).progress >= 4180 &&
      Math.abs(vehicle.speed) < 0.05
    ) {
      vehicle.speed = 0
      vehicle.gear = 0
      vehicle.handbrake = true
      if (!automatic) vehicle.clutch = 1
    }

    const result = updateSubject3(
      vehicle,
      course,
      automatic,
      false,
      dt,
      traffic,
      true,
    )
    course = result.runtime
    const projection = projectToSubject3Route(vehicle.x, vehicle.z)
    maxAbsLateral = Math.max(maxAbsLateral, Math.abs(projection.lateral))

    assert.deepEqual(
      result.infractions,
      [],
      JSON.stringify({
        automatic,
        frame,
        progress: projection.progress,
        lateral: projection.lateral,
        heading: vehicle.heading,
        speedKmh: Math.abs(vehicle.speed) * 3.6,
        gear: vehicle.gear,
        clutch: vehicle.clutch,
        event: SUBJECT3_EVENTS[course.eventIndex]?.id ?? 'done',
        status: command.status,
        infractions: result.infractions.map(item => item.id),
      }),
    )

    if (course.eventIndex !== lastEventIndex) {
      assert.equal(course.eventIndex, lastEventIndex + 1)
      completedEvents.push(SUBJECT3_EVENTS[lastEventIndex]!.id)
      lastEventIndex = course.eventIndex
    }
  }

  assert.equal(stallCount, 0)
  assert.equal(course.completed, true)
  assert.equal(course.pullOverSecuredStopSeen, true)
  assert.deepEqual(
    [...completedEvents, 'pull-over'],
    SUBJECT3_EVENTS.map(event => event.id),
  )
  assert.ok(maxAbsLateral < 2.5)
}

for (const automatic of [false, true]) {
  test(`${automatic ? 'C2' : 'C1'} production Subject 3 coach completes the full real-physics route without infractions`, () => {
    runSubject3Coach(automatic)
  })
}

test('Subject 3 coach brakes for a same-lane sudden-brake vehicle', () => {
  const vehicle = vehicleAtProgress(1200, 6)
  vehicle.handbrake = false
  const projection = projectToSubject3Route(vehicle.x, vehicle.z)
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficVehicle(
    traffic,
    'lead',
    projection.progress + 9,
    projection.lateral,
    0,
    false,
    'sudden-brake',
  )

  const next = stepSubject3Coach(
    vehicle,
    createSubject3CoachRuntime(),
    0.05,
    true,
    false,
    traffic,
  )
  assert.ok(next.command.brake > 0)
  assert.equal(next.command.throttle, 0)
  assert.match(next.command.status, /急刹/)
})

test('Subject 3 coach brakes for a live cut-in conflict', () => {
  const vehicle = vehicleAtProgress(1500, 6)
  vehicle.handbrake = false
  const projection = projectToSubject3Route(vehicle.x, vehicle.z)
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficHazard(
    traffic,
    'cut-in',
    'cut-in-scooter',
    projection.progress + 10,
    projection.lateral + 0.4,
    2,
    -1,
    true,
    true,
  )

  const next = stepSubject3Coach(
    vehicle,
    createSubject3CoachRuntime(),
    0.05,
    true,
    false,
    traffic,
  )
  assert.ok(next.command.brake > 0)
  assert.equal(next.command.throttle, 0)
  assert.match(next.command.status, /加塞/)
})

test('Subject 3 coach stops for a live pedestrian conflict', () => {
  const vehicle = vehicleAtProgress(2500, 5)
  vehicle.handbrake = false
  const projection = projectToSubject3Route(vehicle.x, vehicle.z)
  const traffic = createSubject3TrafficState()
  traffic.crosswalkPedestrianConflict = true
  updateSubject3TrafficHazard(
    traffic,
    'pedestrian',
    'crosswalk-pedestrian',
    projection.progress + 12,
    projection.lateral,
    0,
    -1,
    true,
    true,
  )

  const next = stepSubject3Coach(
    vehicle,
    createSubject3CoachRuntime(),
    0.05,
    true,
    false,
    traffic,
  )
  assert.ok(next.command.brake > 0)
  assert.equal(next.command.throttle, 0)
  assert.match(next.command.status, /行人/)
})

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('full Subject 3 exposes coach takeover only after the light preflight', () => {
  assert.match(app, /stepSubject3Coach\(/)
  assert.match(app, /activeExamId === 'subject3'/)
  assert.match(app, /lightTestDone && session\.subject3Practice == null/)
  assert.match(app, /subject3Traffic\.current/)
})
