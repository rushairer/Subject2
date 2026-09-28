import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCoachRuntime,
  stepCoachController,
} from '../src/coach/coachController'
import { subject2CoachPlan } from '../src/coach/subject2Coach'
import {
  CURVE_CENTERLINE,
  createCurveRuntime,
  updateCurveDriving,
} from '../src/subject2/CurveDrivingCourse'
import {
  createRightAngleRuntime,
  updateRightAngle,
} from '../src/subject2/RightAngleCourse'
import { subject2StartPose } from '../src/subject2/courseStartPoses'
import { stepVehiclePhysics } from '../src/sim/vehiclePhysics'

function curveHeading(index: number) {
  const current = CURVE_CENTERLINE[index]
  const next = CURVE_CENTERLINE[Math.min(index + 1, CURVE_CENTERLINE.length - 1)]
  return Math.atan2(next.x - current.x, -(next.z - current.z))
}

test('coach curve plan drives the real physics through the real judge without penalties', () => {
  const plan = subject2CoachPlan('curve-driving')
  assert.ok(plan)

  const start = CURVE_CENTERLINE[0]
  const vehicle = {
    x: start.x,
    z: start.z,
    heading: curveHeading(0),
    speed: 0,
    steering: 0,
    steeringWheelAngle: 0,
    throttle: 0,
    brake: 0,
    clutch: 0,
    gear: 1,
    engineOn: true,
    engineRpm: 820,
    stallTimer: 0,
    handbrake: false,
  }

  let coach = createCoachRuntime()
  let course = createCurveRuntime()
  const infractions: string[] = []
  const dt = 0.02

  for (let frame = 0; frame < 5000 && !course.completed; frame++) {
    const next = stepCoachController(plan, vehicle, coach, dt, true)
    coach = next.runtime
    vehicle.gear = next.command.gear
    vehicle.engineOn = next.command.engineOn
    vehicle.handbrake = next.command.handbrake

    stepVehiclePhysics(vehicle, {
      throttle: next.command.throttle,
      brake: next.command.brake,
      clutch: next.command.clutch,
      steer: 0,
      steeringWheelTarget: next.command.steeringWheelTarget,
    }, dt, {
      automatic: true,
      grade: 0,
    })

    const judged = updateCurveDriving(vehicle, course, dt)
    course = judged.runtime
    infractions.push(...judged.infractions.map(item => item.id))
  }

  assert.equal(course.completed, true)
  assert.deepEqual(infractions, [])
})



test('coach right-angle plan drives the real physics through the real judge without penalties', () => {
  const plan = subject2CoachPlan('right-angle')
  assert.ok(plan)

  const start = subject2StartPose('right-angle')
  assert.ok(start)
  const vehicle = {
    x: start.x,
    z: start.z,
    heading: start.heading,
    speed: 0,
    steering: 0,
    steeringWheelAngle: 0,
    throttle: 0,
    brake: 0,
    clutch: 0,
    gear: 1,
    engineOn: true,
    engineRpm: 820,
    stallTimer: 0,
    handbrake: false,
    leftIndicator: false,
    rightIndicator: false,
  }

  let coach = createCoachRuntime()
  let course = createRightAngleRuntime()
  const infractions: string[] = []
  const dt = 0.02

  for (let frame = 0; frame < 5000 && !course.completed; frame++) {
    const next = stepCoachController(plan, vehicle, coach, dt, true)
    coach = next.runtime
    vehicle.gear = next.command.gear
    vehicle.engineOn = next.command.engineOn
    vehicle.handbrake = next.command.handbrake
    vehicle.leftIndicator = next.command.leftIndicator
    vehicle.rightIndicator = next.command.rightIndicator

    stepVehiclePhysics(vehicle, {
      throttle: next.command.throttle,
      brake: next.command.brake,
      clutch: next.command.clutch,
      steer: 0,
      steeringWheelTarget: next.command.steeringWheelTarget,
    }, dt, {
      automatic: true,
      grade: 0,
    })

    const judged = updateRightAngle(vehicle, course, dt)
    course = judged.runtime
    infractions.push(...judged.infractions.map(item => item.id))
  }

  assert.equal(course.completed, true)
  assert.deepEqual(infractions, [])
})

test('coach controller only completes after reaching the final waypoint', () => {
  const plan = {
    id: 'straight',
    title: 'straight',
    waypoints: [
      { x: 0, z: -1, targetSpeedMps: 1, gear: 1 as const },
      { x: 0, z: -2, targetSpeedMps: 0, gear: 1 as const, stop: true, holdSeconds: 0.2 },
    ],
  }
  let runtime = createCoachRuntime()

  let result = stepCoachController(plan, {
    x: 0,
    z: 0,
    heading: 0,
    speed: 0,
    gear: 1,
  }, runtime, 0.1, true)
  runtime = result.runtime
  assert.equal(runtime.completed, false)

  result = stepCoachController(plan, {
    x: 0,
    z: -2,
    heading: 0,
    speed: 0,
    gear: 1,
  }, { ...runtime, waypointIndex: 1 }, 0.1, true)
  assert.equal(result.runtime.completed, false)

  result = stepCoachController(plan, {
    x: 0,
    z: -2,
    heading: 0,
    speed: 0,
    gear: 1,
  }, result.runtime, 0.1, true)
  assert.equal(result.runtime.completed, true)
  assert.equal(result.command.brake, 0)
})
