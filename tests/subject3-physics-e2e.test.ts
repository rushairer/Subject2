import assert from 'node:assert/strict'
import test from 'node:test'
import { DRIVING_RULES } from '../src/rules/drivingRules'
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

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * clamp(t, 0, 1)
}

function desiredLateral(progress: number) {
  if (progress >= 1835 && progress < 1915) {
    return lerp(0, -2.2, (progress - 1835) / 80)
  }
  if (progress >= 1915 && progress < 2040) return -2.2
  if (progress >= 2040 && progress < 2060) {
    return lerp(-2.2, 0, (progress - 2040) / 20)
  }

  if (progress >= 2060 && progress < 2110) {
    return lerp(0, -2.2, (progress - 2060) / 50)
  }
  if (progress >= 2110 && progress < 2160) return -2.2
  if (progress >= 2160 && progress < 2210) {
    return lerp(-2.2, -1.0, (progress - 2160) / 50)
  }
  if (progress >= 2210 && progress < 2240) return -1.0
  if (progress >= 2240 && progress < 2270) {
    return lerp(-1.0, 0, (progress - 2240) / 30)
  }

  if (progress >= 4100 && progress < 4170) {
    return lerp(0, 0.6, (progress - 4100) / 70)
  }
  if (progress >= 4170) return 0.6
  return 0
}

function signalState(progress: number) {
  const left =
    progress <= 120 ||
    (progress >= 625 && progress <= 770) ||
    (progress >= 1835 && progress < 2135) ||
    (progress >= 2235 && progress <= 2380) ||
    (progress >= 2835 && progress <= 3020) ||
    (progress >= 3435 && progress <= 3820)

  const right =
    (progress >= 915 && progress <= 1090) ||
    (progress >= 2135 && progress <= 2240) ||
    progress >= 4070

  return { left, right }
}

function targetWorld(progress: number, lateral: number) {
  const pose = poseAtRouteDistance(progress)
  return {
    x: pose.x + pose.rightX * lateral,
    z: pose.z + pose.rightZ * lateral,
  }
}

function manualGearState(progress: number, elapsed: number) {
  const gearEvent = SUBJECT3_EVENTS.find(event => event.id === 'gear')
  assert.ok(gearEvent)

  if (elapsed < 3.3) {
    return { gear: 1, clutch: 1 }
  }
  if (elapsed < 4.3) {
    return {
      gear: 1,
      clutch: DRIVING_RULES.manualTransmission.biteClutchPosition,
    }
  }
  if (progress < gearEvent.start) {
    return { gear: 1, clutch: 0 }
  }
  if (progress < gearEvent.start + 5) {
    return { gear: 2, clutch: 1 }
  }
  if (progress < gearEvent.start + 40) {
    return { gear: 2, clutch: 0 }
  }
  if (progress < gearEvent.start + 45) {
    return { gear: 3, clutch: 1 }
  }
  if (progress < gearEvent.start + 80) {
    return { gear: 3, clutch: 0 }
  }
  if (progress < gearEvent.start + 85) {
    return { gear: 4, clutch: 1 }
  }
  if (progress < gearEvent.end + 10) {
    return { gear: 4, clutch: 0 }
  }
  if (progress < gearEvent.end + 15) {
    return { gear: 3, clutch: 1 }
  }
  return { gear: 3, clutch: 0 }
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

    const signals = signalState(before.progress)
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
      const manual = manualGearState(before.progress, elapsed)
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
      desiredLateral(before.progress),
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

    const physics = stepVehiclePhysics(
      vehicle,
      {
        throttle:
          waitingForStart || stoppingForPullOver
            ? 0
            : automatic
              ? 0.75
              : elapsed < 4.3
                ? 0.45
                : 0.85,
        brake: stoppingForPullOver ? 1 : 0,
        clutch,
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
        `targetLateral=${desiredLateral(before.progress).toFixed(3)} ` +
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
