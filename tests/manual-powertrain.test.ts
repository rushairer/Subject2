import assert from 'node:assert/strict'
import test from 'node:test'
import { DRIVING_RULES } from '../src/rules/drivingRules'
import {
  stepVehiclePhysics,
  type PhysicsInput,
  type PhysicsVehicle,
} from '../src/sim/vehiclePhysics'

function manualVehicle(overrides: Partial<PhysicsVehicle> = {}): PhysicsVehicle {
  return {
    x: 0,
    z: 0,
    heading: 0,
    speed: 0,
    steering: 0,
    steeringWheelAngle: 0,
    throttle: 0,
    brake: 0,
    clutch: 1,
    gear: 1,
    engineOn: true,
    engineRpm: DRIVING_RULES.manualTransmission.idleRpm,
    stallTimer: 0,
    handbrake: false,
    ...overrides,
  }
}

function stepMany(
  vehicle: PhysicsVehicle,
  input: PhysicsInput,
  frames: number,
  automatic = false,
) {
  let stallEvents = 0
  for (let i = 0; i < frames; i++) {
    const result = stepVehiclePhysics(vehicle, input, 1 / 60, {
      automatic,
      grade: 0,
    })
    if (result.stalled) stallEvents += 1
  }
  return stallEvents
}

test('fully depressed clutch disconnects the manual drivetrain and prevents a stall', () => {
  const vehicle = manualVehicle()
  const stalls = stepMany(vehicle, {
    throttle: 0,
    brake: 0,
    clutch: 1,
    steer: 0,
  }, 120)

  assert.equal(stalls, 0)
  assert.equal(vehicle.engineOn, true)
  assert.equal(vehicle.speed, 0)
  assert.ok(Math.abs(vehicle.engineRpm - DRIVING_RULES.manualTransmission.idleRpm) < 1)
})

test('releasing the clutch in gear at idle without throttle stalls exactly once', () => {
  const vehicle = manualVehicle({ clutch: 0 })
  const stalls = stepMany(vehicle, {
    throttle: 0,
    brake: 0,
    clutch: 0,
    steer: 0,
  }, 120)

  assert.equal(stalls, 1)
  assert.equal(vehicle.engineOn, false)
  assert.equal(vehicle.engineRpm, 0)
})

test('the configured bite point with throttle launches without a false stall', () => {
  const vehicle = manualVehicle({ clutch: DRIVING_RULES.manualTransmission.biteClutchPosition })
  const stalls = stepMany(vehicle, {
    throttle: 0.25,
    brake: 0,
    clutch: DRIVING_RULES.manualTransmission.biteClutchPosition,
    steer: 0,
  }, 120)

  assert.equal(stalls, 0)
  assert.equal(vehicle.engineOn, true)
  assert.ok(vehicle.speed > 0.2, `expected forward launch, got ${vehicle.speed}`)
  assert.ok(vehicle.engineRpm > DRIVING_RULES.manualTransmission.idleRpm)
})

test('neutral allows engine revving without moving the vehicle', () => {
  const vehicle = manualVehicle({ gear: 0, clutch: 0 })
  const stalls = stepMany(vehicle, {
    throttle: 0.6,
    brake: 0,
    clutch: 0,
    steer: 0,
  }, 90)

  assert.equal(stalls, 0)
  assert.equal(vehicle.engineOn, true)
  assert.equal(vehicle.speed, 0)
  assert.ok(vehicle.engineRpm > DRIVING_RULES.manualTransmission.idleRpm + 500)
})

test('reverse gear produces negative speed and forward gear produces positive speed', () => {
  const reverse = manualVehicle({ gear: -1, clutch: 0 })
  stepMany(reverse, {
    throttle: 0.5,
    brake: 0,
    clutch: 0,
    steer: 0,
  }, 60)
  assert.ok(reverse.speed < 0)

  const forward = manualVehicle({ gear: 1, clutch: 0 })
  stepMany(forward, {
    throttle: 0.5,
    brake: 0,
    clutch: 0,
    steer: 0,
  }, 60)
  assert.ok(forward.speed > 0)
})

test('parking brake blocks drive force and automatic transmission never stalls', () => {
  const automatic = manualVehicle({
    gear: 1,
    clutch: 0,
    handbrake: true,
  })

  const stalls = stepMany(automatic, {
    throttle: 1,
    brake: 0,
    clutch: 0,
    steer: 0,
  }, 180, true)

  assert.equal(stalls, 0)
  assert.equal(automatic.engineOn, true)
  assert.equal(automatic.speed, 0)
})
