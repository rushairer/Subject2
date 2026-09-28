import assert from 'node:assert/strict'
import test from 'node:test'
import { createPedalControlsState, stepPedalControls } from '../src/input/pedalControls'
import { DRIVING_RULES } from '../src/rules/drivingRules'
import {
  subject3CoachDesiredLateral,
  subject3CoachManualGearState,
  subject3CoachSignalState,
} from '../src/coach/subject3Coach'
import { assessSessionResult } from '../src/session/sessionResult'
import { stepVehiclePhysics, type PhysicsVehicle } from '../src/sim/vehiclePhysics'
import {
  createSubject3Runtime,
  updateSubject3,
  type Subject3Vehicle,
} from '../src/subject3/Subject3Course'
import {
  SUBJECT3_EVENTS,
  SUBJECT3_ROUTE_LENGTH,
  poseAtRouteDistance,
  projectToSubject3Route,
} from '../src/subject3/subject3Route'
import {
  SUBJECT3_OVERTAKE_TARGET_LATERAL,
  SUBJECT3_OVERTAKE_TARGET_PROGRESS,
  createSubject3TrafficState,
  subject3VehicleCollision,
} from '../src/subject3/subject3Traffic'

type IntegratedVehicle = PhysicsVehicle & Subject3Vehicle

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

function normalizeAngle(angle: number) {
  let value = angle
  while (value > Math.PI) value -= Math.PI * 2
  while (value < -Math.PI) value += Math.PI * 2
  return value
}

function targetWorld(progress: number, lateral: number) {
  const pose = poseAtRouteDistance(progress)
  return {
    x: pose.x + pose.rightX * lateral,
    z: pose.z + pose.rightZ * lateral,
  }
}

function runPhysicalSubject3Route(automatic: boolean) {
  const dt = 0.05
  const maxFrames = automatic ? 15_000 : 30_000
  const start = poseAtRouteDistance(0)
  const vehicle: IntegratedVehicle = {
    x: start.x,
    z: start.z,
    heading: start.heading,
    speed: 0,
    steering: 0,
    steeringWheelAngle: 0,
    throttle: 0,
    brake: 0,
    clutch: automatic ? 0 : 1,
    gear: 1,
    engineOn: true,
    engineRpm: DRIVING_RULES.manualTransmission.idleRpm,
    stallTimer: 0,
    handbrake: true,
    leftIndicator: false,
    rightIndicator: false,
    horn: false,
    seatbelt: true,
    lowBeam: true,
    highBeam: false,
    leftSignalAge: 0,
    rightSignalAge: 0,
    lookLeft: true,
    lookRight: true,
    lookBack: true,
  }

  let runtime = createSubject3Runtime()
  const traffic = createSubject3TrafficState()
  const completedEvents: string[] = []
  let lastEventIndex = runtime.eventIndex
  let maxAbsoluteLateral = 0
  let elapsed = 0
  let stallEvents = 0
  const pedals = createPedalControlsState()
  let throttleKey = false
  let throttlePresses = 0
  let throttleReleases = 0

  const targetPose = poseAtRouteDistance(SUBJECT3_OVERTAKE_TARGET_PROGRESS)
  const overtakeTarget = {
    x:
      targetPose.x +
      targetPose.rightX * SUBJECT3_OVERTAKE_TARGET_LATERAL,
    z:
      targetPose.z +
      targetPose.rightZ * SUBJECT3_OVERTAKE_TARGET_LATERAL,
    heading: targetPose.heading,
  }

  for (let frame = 0; frame < maxFrames && !runtime.completed; frame++) {
    const before = projectToSubject3Route(vehicle.x, vehicle.z)
    const waitingForStart = elapsed < 3.3
    const stoppingForPullOver = before.progress >= 4180

    const signals = subject3CoachSignalState(before.progress)
    vehicle.leftIndicator = signals.left
    vehicle.rightIndicator = signals.right
    vehicle.leftSignalAge = signals.left
      ? vehicle.leftSignalAge + dt
      : 0
    vehicle.rightSignalAge = signals.right
      ? vehicle.rightSignalAge + dt
      : 0

    let clutch = 0
    if (automatic) {
      if (waitingForStart) {
        vehicle.handbrake = true
        vehicle.gear = 1
      } else if (
        stoppingForPullOver &&
        Math.abs(vehicle.speed) < 0.05
      ) {
        vehicle.handbrake = true
        vehicle.gear = 0
      } else {
        vehicle.handbrake = false
        vehicle.gear = 1
      }
    } else {
      const manual = subject3CoachManualGearState(before.progress, elapsed)
      vehicle.gear = manual.gear
      clutch = manual.clutch
      vehicle.handbrake = waitingForStart

      if (stoppingForPullOver) {
        clutch = 1
        vehicle.handbrake = false
        if (Math.abs(vehicle.speed) < 0.05) {
          vehicle.gear = 0
          vehicle.handbrake = true
        }
      }
    }

    const lookAheadProgress = Math.min(
      SUBJECT3_ROUTE_LENGTH,
      before.progress + 6,
    )
    const target = targetWorld(
      lookAheadProgress,
      subject3CoachDesiredLateral(before.progress),
    )
    const desiredHeading = Math.atan2(
      target.x - vehicle.x,
      -(target.z - vehicle.z),
    )
    const headingError = normalizeAngle(
      desiredHeading - vehicle.heading,
    )
    const desiredRoadWheelAngle = clamp(
      headingError * 1.5,
      -DRIVING_RULES.steering.roadWheelMaxAngleRadians,
      DRIVING_RULES.steering.roadWheelMaxAngleRadians,
    )
    const maxSteeringWheelAngle =
      DRIVING_RULES.steering.wheelTurnsLockToLock * Math.PI

    // This test driver observes speed at 10 Hz and taps/holds the real keyboard
    // pedal path. A small deadband avoids frame-perfect analog throttle input.
    // These are driving intentions, not changes to any exam speed threshold.
    const targetSpeedKmh = 22
    if (frame % 2 === 0) {
      const previousThrottleKey = throttleKey
      if (waitingForStart || stoppingForPullOver || clutch === 1) {
        throttleKey = false
      } else if (Math.abs(vehicle.speed) * 3.6 < targetSpeedKmh - 0.4) {
        throttleKey = true
      } else if (Math.abs(vehicle.speed) * 3.6 > targetSpeedKmh + 0.4) {
        throttleKey = false
      }
      if (throttleKey && !previousThrottleKey) throttlePresses += 1
      if (!throttleKey && previousThrottleKey) throttleReleases += 1
    }
    const pedalInput = stepPedalControls(pedals, {
      throttleKey,
      brakeKey: stoppingForPullOver,
      clutchFloorKey: !automatic && clutch === 1,
      clutchBiteKey: !automatic && clutch === DRIVING_RULES.manualTransmission.biteClutchPosition,
      automatic,
      speed: vehicle.speed,
      gear: vehicle.gear,
      dt,
    })

    const physics = stepVehiclePhysics(
      vehicle,
      {
        throttle: pedalInput.throttle,
        brake: pedalInput.brake,
        clutch: pedalInput.clutch,
        steer: 0,
        steeringWheelTarget:
          (desiredRoadWheelAngle /
            DRIVING_RULES.steering.roadWheelMaxAngleRadians) *
          maxSteeringWheelAngle,
      },
      dt,
      {
        automatic,
        grade: 0,
      },
    )
    if (physics.stalled) stallEvents += 1

    assert.equal(
      vehicle.engineOn,
      true,
      `${automatic ? 'C2' : 'C1'} engine stalled near ${before.progress.toFixed(1)}m`,
    )

    if (
      stoppingForPullOver &&
      Math.abs(vehicle.speed) < 0.05
    ) {
      vehicle.speed = 0
      vehicle.gear = 0
      vehicle.handbrake = true
      if (!automatic) vehicle.clutch = 1
    }

    const projection = projectToSubject3Route(
      vehicle.x,
      vehicle.z,
    )
    maxAbsoluteLateral = Math.max(
      maxAbsoluteLateral,
      Math.abs(projection.lateral),
    )

    if (
      Math.abs(
        projection.progress -
          SUBJECT3_OVERTAKE_TARGET_PROGRESS,
      ) < 12
    ) {
      assert.equal(
        subject3VehicleCollision(vehicle, overtakeTarget),
        false,
        'physical overtake must clear the target vehicle',
      )
    }

    const result = updateSubject3(
      vehicle,
      runtime,
      automatic,
      false,
      dt,
      traffic,
      true,
    )
    runtime = result.runtime

    assert.deepEqual(
      result.infractions,
      [],
      `unexpected ${automatic ? 'C2' : 'C1'} Subject 3 infraction near ${projection.progress.toFixed(1)}m ` +
        `lateral=${projection.lateral.toFixed(3)} heading=${vehicle.heading.toFixed(3)} ` +
        `gear=${vehicle.gear} clutch=${vehicle.clutch.toFixed(2)} rpm=${vehicle.engineRpm.toFixed(0)} ` +
        `x=${vehicle.x.toFixed(3)} z=${vehicle.z.toFixed(3)} ` +
        `targetLateral=${subject3CoachDesiredLateral(before.progress).toFixed(3)} ` +
        `event=${SUBJECT3_EVENTS[runtime.eventIndex]?.id ?? 'done'}: ` +
        result.infractions.map(item => item.id).join(', '),
    )

    if (runtime.eventIndex !== lastEventIndex) {
      assert.equal(
        runtime.eventIndex,
        lastEventIndex + 1,
        'physical route may not skip Subject 3 events',
      )
      completedEvents.push(
        SUBJECT3_EVENTS[lastEventIndex].id,
      )
      lastEventIndex = runtime.eventIndex
    }

    elapsed += dt
  }

  assert.equal(stallEvents, 0)
  assert.ok(throttlePresses > 10, 'the route must exercise repeated keyboard acceleration')
  assert.ok(throttleReleases > 10, 'the route must exercise repeated keyboard coasting')
  assert.equal(runtime.completed, true)
  assert.equal(runtime.pullOverSecuredStopSeen, true)
  assert.deepEqual(
    [...completedEvents, 'pull-over'],
    SUBJECT3_EVENTS.map(event => event.id),
  )
  assert.ok(
    runtime.progress > 4180,
    `route stopped too early at ${runtime.progress.toFixed(1)}m`,
  )
  assert.ok(
    maxAbsoluteLateral < 2.5,
    `route follower drifted too far laterally: ${maxAbsoluteLateral.toFixed(3)}m`,
  )

  const result = assessSessionResult({
    examId: 'subject3',
    score: 100,
    completed: runtime.completed,
    infractions: [],
  })
  assert.equal(result.status, 'passed')
  assert.equal(result.passed, true)
}

for (const automatic of [false, true]) {
  test(`${automatic ? 'C2' : 'C1'} physical vehicle can follow the full Subject 3 route and complete every judge`, () => {
    runPhysicalSubject3Route(automatic)
  })
}
