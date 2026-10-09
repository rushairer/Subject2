import assert from 'node:assert/strict'
import test from 'node:test'
import { DRIVING_RULES } from '../src/rules/drivingRules'
import {
  COACH_STABILITY,
  assistCoachStability,
} from '../src/coach/coachStabilityAssist'
import {
  createCoachRuntime,
  stepCoachController,
  type CoachPlan,
} from '../src/coach/coachController'
import {
  createSubject3CoachRuntime,
  stepSubject3Coach,
} from '../src/coach/subject3Coach'
import { createSubject3TrafficState } from '../src/subject3/subject3Traffic'
import { poseAtRouteDistance } from '../src/subject3/subject3Route'
import { stepVehiclePhysics, type PhysicsVehicle } from '../src/sim/vehiclePhysics'

const command = { steeringWheelTarget: 0, throttle: 0.4, brake: 0 }

test('normal aligned traffic and every low-speed or reverse parking state remain unchanged', () => {
  const states = [
    { speed: 8, lateralSpeed: 0.25, yawRate: 0.12 },
    { speed: 2, lateralSpeed: -4, yawRate: 1.6 },
    { speed: -5, lateralSpeed: 3, yawRate: -1 },
    { speed: 8 },
    { speed: 8, lateralSpeed: Number.NaN, yawRate: 1 },
  ]
  for (const vehicle of states) {
    const result = assistCoachStability(vehicle, command)
    assert.equal(result.active, false)
    assert.equal(result.throttle, command.throttle)
    assert.equal(result.brake, command.brake)
    assert.equal(result.steeringWheelTarget, command.steeringWheelTarget)
  }
})

test('a sharp planned corner is not mistaken for measured spin before yaw builds', () => {
  const maxWheel = DRIVING_RULES.steering.wheelTurnsLockToLock * Math.PI
  for (const requested of [-maxWheel, maxWheel]) {
    const result = assistCoachStability(
      { speed: 9, lateralSpeed: 0, yawRate: 0.05 },
      { steeringWheelTarget: requested, throttle: 0.34, brake: 0 },
    )
    assert.equal(result.active, false)
    assert.equal(result.steeringWheelTarget, requested)
    assert.equal(result.throttle, 0.34)
  }
})

test('a clockwise spin with leftward slip counter-steers left without resetting yaw or braking', () => {
  const vehicle = { speed: 10, lateralSpeed: -3, yawRate: 0.85 }
  const planned = { steeringWheelTarget: 0, throttle: 0.38, brake: 0.7 }
  const result = assistCoachStability(vehicle, planned)
  assert.equal(result.active, true)
  assert.ok(result.steeringWheelTarget < 0)
  assert.ok(result.throttle <= COACH_STABILITY.maximumRecoveryThrottle)
  assert.equal(result.brake, planned.brake, 'an actual emergency stop must retain brake authority')
  assert.equal(vehicle.lateralSpeed, -3)
  assert.equal(vehicle.yawRate, 0.85)
})

test('opposite slip and spin produce symmetric positive counter-steering', () => {
  const right = assistCoachStability(
    { speed: 10, lateralSpeed: 3, yawRate: -0.85 },
    command,
  )
  const left = assistCoachStability(
    { speed: 10, lateralSpeed: -3, yawRate: 0.85 },
    command,
  )
  assert.equal(right.active, true)
  assert.equal(left.active, true)
  assert.ok(right.steeringWheelTarget > 0)
  assert.ok(left.steeringWheelTarget < 0)
  assert.ok(Math.abs(right.steeringWheelTarget + left.steeringWheelTarget) < 1e-9)
})

test('assisted steering is strictly bounded to the training car steering geometry', () => {
  const maxWheel = DRIVING_RULES.steering.wheelTurnsLockToLock * Math.PI
  for (const slip of [-20, -6, 6, 20]) {
    const result = assistCoachStability(
      { speed: 8, lateralSpeed: slip, yawRate: -3 },
      { steeringWheelTarget: maxWheel, throttle: 1, brake: 0 },
    )
    assert.equal(result.active, true)
    assert.ok(Math.abs(result.steeringWheelTarget) <= maxWheel)
    assert.ok(result.throttle <= COACH_STABILITY.maximumRecoveryThrottle)
  }
})

test('Subject 3 production coach applies recovery commands only for measurable slide', () => {
  const pose = poseAtRouteDistance(1200)
  const car = { x: pose.x, z: pose.z, heading: pose.heading,
    speed: 9, gear: 1 }
  const traffic = createSubject3TrafficState()
  const normal = stepSubject3Coach(car, createSubject3CoachRuntime(), 0.05,
    true, false, traffic)
  const sliding = stepSubject3Coach({
    ...car, lateralSpeed: -3.5, yawRate: 0.9,
  }, createSubject3CoachRuntime(), 0.05, true, false, traffic)

  assert.ok(sliding.command.steeringWheelTarget < normal.command.steeringWheelTarget,
    'coach must countersteer the detected leftward velocity vector')
  assert.ok(sliding.command.throttle <= COACH_STABILITY.maximumRecoveryThrottle)
  assert.match(sliding.command.status, /侧滑/)
  assert.doesNotMatch(normal.command.status, /侧滑/)
})

test('Subject 2 coach shares assist only for a road-speed slide, never parking geometry', () => {
  const plan: CoachPlan = { id: 'stability', title: 'stability',
    waypoints: [{ x: 0, z: -70, gear: 1, targetSpeedMps: 7 }] }
  const normal = stepCoachController(plan,
    { x: 0, z: 0, heading: 0, gear: 1, speed: 9 },
    createCoachRuntime(), 0.05, true)
  const sliding = stepCoachController(plan,
    { x: 0, z: 0, heading: 0, gear: 1, speed: 9,
      lateralSpeed: -3, yawRate: 0.9 },
    createCoachRuntime(), 0.05, true)
  assert.ok(sliding.command.steeringWheelTarget < normal.command.steeringWheelTarget)
  assert.match(sliding.command.status, /侧滑/)

  const parking = stepCoachController(plan,
    { x: 0, z: 0, heading: 0, gear: 1, speed: 1,
      lateralSpeed: -3, yawRate: 0.9 },
    createCoachRuntime(), 0.05, true)
  const parkingNormal = stepCoachController(plan,
    { x: 0, z: 0, heading: 0, gear: 1, speed: 1 },
    createCoachRuntime(), 0.05, true)
  assert.deepEqual(parking.command, parkingNormal.command)
})

test('bounded coach countersteer passes through real physics and dissipates dynamic slip', () => {
  const car: PhysicsVehicle = {
    x: 0, z: 0, heading: 0, speed: 10,
    steering: 0, steeringWheelAngle: 0,
    throttle: 0, brake: 0, clutch: 0,
    gear: 2, engineOn: true, engineRpm: 2400, stallTimer: 0,
    handbrake: false, lateralSpeed: -3, yawRate: 0.82,
  }
  let activated = false
  let stalled = false
  for (let frame = 0; frame < 180; frame++) {
    const control = assistCoachStability(car, {
      steeringWheelTarget: 0, throttle: 0.22, brake: 0,
    })
    activated ||= control.active
    const output = stepVehiclePhysics(car, {
      throttle: control.throttle, brake: control.brake,
      clutch: 0, steer: 0,
      steeringWheelTarget: control.steeringWheelTarget,
    }, 1 / 60, { automatic: true, grade: 0 })
    stalled ||= output.stalled
    assert.ok(Number.isFinite(car.speed) && Number.isFinite(car.heading))
    assert.ok(Number.isFinite(car.lateralSpeed) && Number.isFinite(car.yawRate))
    assert.ok(Number.isFinite(car.x) && Number.isFinite(car.z))
  }
  assert.equal(activated, true)
  assert.equal(stalled, false)
  assert.ok(car.speed > 1, 'the recovering car must still be able to advance')
  assert.ok(Math.abs(car.lateralSpeed ?? 0) < 1,
    `excess slide did not dissipate: ${car.lateralSpeed}`)
  assert.ok(Math.abs(car.yawRate ?? 0) < 0.3,
    `excess spin did not dissipate: ${car.yawRate}`)
})
