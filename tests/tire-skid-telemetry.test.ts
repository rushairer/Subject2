import assert from 'node:assert/strict'
import test from 'node:test'
import { stepVehiclePhysics, type PhysicsVehicle } from '../src/sim/vehiclePhysics'
import { DRIVING_RULES } from '../src/rules/drivingRules'

function car(overrides: Partial<PhysicsVehicle> = {}): PhysicsVehicle {
  return {
    x: 0,
    z: 0,
    heading: 0,
    speed: 0,
    steering: 0,
    steeringWheelAngle: 0,
    throttle: 0,
    brake: 0,
    clutch: 0,
    gear: 3,
    engineOn: false,
    engineRpm: 0,
    stallTimer: 0,
    handbrake: false,
    ...overrides,
  }
}

const wheelTarget = (roadAngle: number) =>
  roadAngle /
  DRIVING_RULES.steering.roadWheelMaxAngleRadians *
  DRIVING_RULES.steering.wheelTurnsLockToLock *
  Math.PI

test('normal low-speed Subject 2 steering produces no skid-mark telemetry', () => {
  const steering = 0.4
  const vehicle = car({
    speed: 1.2,
    steering,
    steeringWheelAngle: wheelTarget(steering),
  })

  for (let frame = 0; frame < 60; frame += 1) {
    const result = stepVehiclePhysics(vehicle, {
      throttle: 0,
      brake: 0,
      clutch: 0,
      steer: 0,
      steeringWheelTarget: vehicle.steeringWheelAngle,
    }, 1 / 60, { automatic: true, grade: 0 })
    assert.equal(result.tire.frontSkidSeverity, 0)
    assert.equal(result.tire.rearSkidSeverity, 0)
  }
})

test('handbrake corner publishes sustained rear skid telemetry for rendering', () => {
  const steering = 0.3
  const vehicle = car({
    speed: 11,
    steering,
    steeringWheelAngle: wheelTarget(steering),
    handbrake: true,
  })
  let markedFrames = 0

  for (let frame = 0; frame < 30; frame += 1) {
    const result = stepVehiclePhysics(vehicle, {
      throttle: 0,
      brake: 0,
      clutch: 0,
      steer: 0,
      steeringWheelTarget: vehicle.steeringWheelAngle,
    }, 1 / 60, { automatic: true, grade: 0 })
    if (result.tire.rearSkidSeverity >= 0.18) markedFrames += 1
  }

  assert.ok(markedFrames >= 20, `only ${markedFrames} frames qualified for marks`)
})
