import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  SUBJECT3_COACH_PULL_OVER_STOP_PROGRESS,
  createSubject3CoachRuntime,
  stepSubject3Coach,
} from '../src/coach/subject3Coach'
import { DRIVING_RULES } from '../src/rules/drivingRules'
import { actorContactCircles } from '../src/sim/collisionActorGeometry'
import { checkVehicleCircleCollision } from '../src/sim/vehicleCollision'
import { forwardFromHeading, rightFromHeading } from '../src/sim/vehicleFrame'
import { stepVehiclePhysics, type PhysicsVehicle } from '../src/sim/vehiclePhysics'
import { MANUAL_GEARS } from '../src/sim/vehiclePowertrain'
import {
  createSubject3Runtime,
  updateSubject3,
  type Subject3Vehicle,
} from '../src/subject3/Subject3Course'
import {
  RIGHT_EDGE_OFFSET,
  SAME_DIRECTION_DIVIDER,
  SUBJECT3_EVENTS,
  actorRoutePose,
  poseAtRouteDistance,
  projectToSubject3Route,
} from '../src/subject3/subject3Route'
import {
  SUBJECT3_CUT_IN_SCOOTER,
  createSubject3TrafficState,
  removeSubject3TrafficHazard,
  removeSubject3TrafficVehicle,
  subject3CutInScooterRouteState,
  updateSubject3TrafficHazard,
  updateSubject3TrafficHazardFromWorld,
  updateSubject3TrafficVehicle,
} from '../src/subject3/subject3Traffic'
import {
  SUBJECT3_PRACTICE_SLICES,
  subject3PracticeRuntimeSeed,
  subject3PracticeSliceById,
  type Subject3PracticeSliceId,
} from '../src/subject3/subject3Practice'

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
      projectToSubject3Route(vehicle.x, vehicle.z).progress >= SUBJECT3_COACH_PULL_OVER_STOP_PROGRESS &&
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

function runSubject3PracticeCoach(
  automatic: boolean,
  practiceSlice: Subject3PracticeSliceId,
) {
  const dt = 0.05
  const slice = subject3PracticeSliceById(practiceSlice)
  const vehicle = vehicleAtProgress(slice.startDistance)
  vehicle.engineOn = false
  vehicle.gear = 0
  vehicle.handbrake = true
  vehicle.clutch = automatic ? 0 : 1

  let coach = createSubject3CoachRuntime()
  let course = createSubject3Runtime(
    subject3PracticeRuntimeSeed(practiceSlice),
  )
  const traffic = createSubject3TrafficState()
  let stallCount = 0

  for (let frame = 0; frame < 12_000 && !course.completed; frame++) {
    const next = stepSubject3Coach(
      vehicle,
      coach,
      dt,
      automatic,
      false,
      traffic,
      practiceSlice,
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
      practiceSlice === 'pull-over' &&
      projectToSubject3Route(vehicle.x, vehicle.z).progress >=
        SUBJECT3_COACH_PULL_OVER_STOP_PROGRESS &&
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
      false,
      practiceSlice,
    )
    course = result.runtime
    const projection = projectToSubject3Route(vehicle.x, vehicle.z)

    assert.deepEqual(
      result.infractions,
      [],
      JSON.stringify({
        automatic,
        practiceSlice,
        frame,
        progress: projection.progress,
        lateral: projection.lateral,
        speedKmh: Math.abs(vehicle.speed) * 3.6,
        gear: vehicle.gear,
        clutch: vehicle.clutch,
        event: SUBJECT3_EVENTS[course.eventIndex]?.id ?? 'done',
        status: command.status,
        infractions: result.infractions.map(item => item.id),
      }),
    )
  }

  assert.equal(
    stallCount,
    0,
    `${automatic ? 'C2' : 'C1'} ${practiceSlice} must not stall`,
  )
  assert.equal(
    course.completed,
    true,
    `${automatic ? 'C2' : 'C1'} ${practiceSlice} should complete`,
  )
}

for (const automatic of [false, true]) {
  for (const slice of SUBJECT3_PRACTICE_SLICES) {
    test(`${automatic ? 'C2' : 'C1'} Subject 3 coach completes ${slice.id} practice through real physics without infractions`, () => {
      runSubject3PracticeCoach(automatic, slice.id)
    })
  }
}

type DefensiveScenario = 'sudden-brake' | 'cut-in' | 'pedestrian'

function runPhysicalDefensiveStopRecovery(
  automatic: boolean,
  scenario: DefensiveScenario,
) {
  const dt = 0.05
  const startProgress =
    scenario === 'pedestrian' ? 2500 : scenario === 'cut-in' ? 1500 : 2700
  const vehicle = vehicleAtProgress(startProgress, 6)
  vehicle.handbrake = false
  vehicle.gear = automatic ? 1 : 3
  vehicle.clutch = 0
  vehicle.engineRpm = automatic
    ? DRIVING_RULES.manualTransmission.idleRpm + 6 * 95
    : 6 * MANUAL_GEARS[3]!.rpmPerMps

  const traffic = createSubject3TrafficState()
  let coach = createSubject3CoachRuntime()
  let hazardProgress = startProgress + 14
  let sawBrake = false
  let sawFullClutch = false
  let sawRecovery = false
  let minSpeedBeforeClear = Number.POSITIVE_INFINITY
  let minGapBeforeClear = Number.POSITIVE_INFINITY
  let stallCount = 0
  let progressAtClear = startProgress

  const setHazard = () => {
    const projection = projectToSubject3Route(vehicle.x, vehicle.z)

    if (scenario === 'sudden-brake') {
      updateSubject3TrafficVehicle(
        traffic,
        'physical-sudden-brake',
        hazardProgress,
        projection.lateral,
        0,
        false,
        'sudden-brake',
      )
      return
    }

    if (scenario === 'cut-in') {
      updateSubject3TrafficHazard(
        traffic,
        'physical-cut-in',
        'cut-in-scooter',
        hazardProgress,
        projection.lateral,
        0,
        -0.8,
        true,
        true,
      )
      return
    }

    traffic.crosswalkPedestrianConflict = true
    updateSubject3TrafficHazard(
      traffic,
      'physical-pedestrian',
      'crosswalk-pedestrian',
      hazardProgress,
      projection.lateral,
      0,
      -0.6,
      true,
      true,
    )
  }

  const clearHazard = () => {
    if (scenario === 'sudden-brake') {
      removeSubject3TrafficVehicle(traffic, 'physical-sudden-brake')
    } else if (scenario === 'cut-in') {
      removeSubject3TrafficHazard(traffic, 'physical-cut-in')
    } else {
      traffic.crosswalkPedestrianConflict = false
      removeSubject3TrafficHazard(traffic, 'physical-pedestrian')
    }
  }

  for (let frame = 0; frame < 320; frame++) {
    const hazardActive = frame < 100
    if (hazardActive) setHazard()
    else if (frame === 100) {
      clearHazard()
      progressAtClear = projectToSubject3Route(
        vehicle.x,
        vehicle.z,
      ).progress
    }

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

    sawBrake ||= command.brake > 0.4
    if (!automatic) sawFullClutch ||= command.clutch > 0.95
    sawRecovery ||= /危险解除/.test(command.status)

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

    const projection = projectToSubject3Route(vehicle.x, vehicle.z)
    if (hazardActive) {
      minSpeedBeforeClear = Math.min(
        minSpeedBeforeClear,
        Math.abs(vehicle.speed),
      )
      minGapBeforeClear = Math.min(
        minGapBeforeClear,
        hazardProgress - projection.progress,
      )
    }
  }

  const finalProgress = projectToSubject3Route(
    vehicle.x,
    vehicle.z,
  ).progress

  assert.equal(
    stallCount,
    0,
    `${automatic ? 'C2' : 'C1'} ${scenario} must not stall`,
  )
  assert.equal(vehicle.engineOn, true)
  assert.equal(sawBrake, true)
  if (!automatic) assert.equal(sawFullClutch, true)
  assert.ok(
    minSpeedBeforeClear < 0.35,
    `${automatic ? 'C2' : 'C1'} ${scenario} should physically stop before clear: ${minSpeedBeforeClear}`,
  )
  assert.ok(
    minGapBeforeClear > 3.5,
    `${automatic ? 'C2' : 'C1'} ${scenario} should preserve physical clearance: ${minGapBeforeClear}`,
  )
  assert.ok(
    finalProgress > progressAtClear + 12,
    `${automatic ? 'C2' : 'C1'} ${scenario} should resume after clear`,
  )
  if (!automatic) {
    assert.equal(sawRecovery, true)
    assert.ok(vehicle.gear >= 2)
  }
}

for (const automatic of [false, true]) {
  for (const scenario of [
    'sudden-brake',
    'cut-in',
    'pedestrian',
  ] as const) {
    test(`${automatic ? 'C2' : 'C1'} Subject 3 coach physically stops and resumes for ${scenario}`, () => {
      runPhysicalDefensiveStopRecovery(automatic, scenario)
    })
  }
}


function runBusStopScooterCoach(automatic: boolean) {
  const dt = 0.05
  const vehicle = vehicleAtProgress(1275, 6)
  vehicle.handbrake = false
  vehicle.gear = automatic ? 1 : 3
  vehicle.clutch = 0
  vehicle.engineRpm = automatic
    ? DRIVING_RULES.manualTransmission.idleRpm + 6 * 95
    : 6 * MANUAL_GEARS[3]!.rpmPerMps

  const traffic = createSubject3TrafficState()
  let coach = createSubject3CoachRuntime()
  let scooterTriggered = false
  let scooterElapsedSeconds = 0
  let sawBrake = false
  let sawYield = false
  let sawResume = false
  let stallCount = 0
  let minimumPhysicalClearance = Number.POSITIVE_INFINITY
  let progressAtYield = 0
  let minimumSpeedDuringConflict = Number.POSITIVE_INFINITY

  for (let frame = 0; frame < 2_600; frame++) {
    const before = projectToSubject3Route(vehicle.x, vehicle.z)
    if (
      !scooterTriggered &&
      before.progress > SUBJECT3_CUT_IN_SCOOTER.triggerProgress
    ) {
      scooterTriggered = true
    }
    if (scooterTriggered) scooterElapsedSeconds += dt

    const scooterRoute = subject3CutInScooterRouteState(
      scooterTriggered,
      scooterElapsedSeconds,
    )
    const scooterPose = actorRoutePose(
      scooterRoute.progress,
      scooterRoute.lateral,
    )
    const forward = forwardFromHeading(scooterPose.heading)
    const right = rightFromHeading(scooterPose.heading)
    const velocity = {
      x:
        forward.x * scooterRoute.longitudinalSpeedMps +
        right.x * scooterRoute.lateralSpeedMps,
      z:
        forward.z * scooterRoute.longitudinalSpeedMps +
        right.z * scooterRoute.lateralSpeedMps,
    }
    const conflict =
      scooterTriggered &&
      scooterRoute.lateral <= RIGHT_EDGE_OFFSET &&
      scooterRoute.lateral >= SAME_DIRECTION_DIVIDER

    updateSubject3TrafficHazardFromWorld(
      traffic,
      'cut-in-scooter',
      'cut-in-scooter',
      scooterPose,
      velocity,
      scooterTriggered,
      conflict,
    )

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

    sawBrake ||= command.brake > 0.4

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

    const scooterCircles = actorContactCircles(
      'scooter',
      {
        x: scooterPose.x,
        z: scooterPose.z,
        heading: scooterPose.heading,
      },
      { tiltX: 0, tiltZ: 0 },
    )
    for (const circle of scooterCircles) {
      const contact = checkVehicleCircleCollision(vehicle, circle)
      minimumPhysicalClearance = Math.min(
        minimumPhysicalClearance,
        contact.distance,
      )
      assert.equal(
        contact.colliding,
        false,
        JSON.stringify({
          automatic,
          frame,
          player: projectToSubject3Route(vehicle.x, vehicle.z),
          scooterRoute,
          command: command.status,
          clearance: contact.distance,
        }),
      )
    }

    const after = projectToSubject3Route(vehicle.x, vehicle.z)
    if (scooterTriggered && conflict) {
      minimumSpeedDuringConflict = Math.min(
        minimumSpeedDuringConflict,
        Math.abs(vehicle.speed),
      )
      if (
        !sawYield &&
        command.brake > 0.4 &&
        Math.abs(vehicle.speed) < 4
      ) {
        sawYield = true
        progressAtYield = after.progress
      }
    }
    if (
      sawYield &&
      after.progress > progressAtYield + 18 &&
      Math.abs(vehicle.speed) > 2
    ) {
      sawResume = true
    }

    if (sawResume && after.progress > 1510) break
  }

  const finalProgress = projectToSubject3Route(
    vehicle.x,
    vehicle.z,
  ).progress

  assert.equal(stallCount, 0)
  assert.equal(vehicle.engineOn, true)
  assert.equal(sawBrake, true)
  assert.equal(sawYield, true)
  assert.ok(
    minimumSpeedDuringConflict < 4,
    `${automatic ? 'C2' : 'C1'} should materially slow for the bus-stop scooter: ${minimumSpeedDuringConflict}`,
  )
  assert.equal(sawResume, true)
  assert.ok(
    minimumPhysicalClearance > 0.35,
    `${automatic ? 'C2' : 'C1'} bus-stop scooter clearance too small: ${minimumPhysicalClearance}`,
  )
  assert.ok(
    finalProgress > 1510,
    `${automatic ? 'C2' : 'C1'} should safely continue beyond the bus stop: ${finalProgress}`,
  )
}

for (const automatic of [false, true]) {
  test(`${automatic ? 'C2' : 'C1'} coach safely yields to the real bus-stop cut-in scooter lifecycle`, () => {
    runBusStopScooterCoach(automatic)
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

test('full and targeted Subject 3 sessions expose one coach across preflight and road driving', () => {
  assert.match(app, /stepSubject3Coach\(/)
  assert.match(app, /session\.subject3Practice/)
  assert.match(app, /activeExamId === 'subject3'/)
  assert.match(app, /\? true/)
  assert.match(app, /coachActive=\{coachActive\}/)
  assert.match(app, /onCoachStatus=\{setCoachStatus\}/)
  assert.match(app, /subject3Traffic\.current/)
})
