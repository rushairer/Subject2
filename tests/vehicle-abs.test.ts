import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createAbsAxleState,
  stepAbsAxleState,
} from '../src/sim/vehicleBrakeDynamics'
import {
  stepVehiclePhysics,
  type PhysicsVehicle,
} from '../src/sim/vehiclePhysics'

function vehicle(): PhysicsVehicle {
  return {
    x: 0,
    z: 0,
    heading: 0,
    speed: 16,
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
  }
}

test('ABS releases only the axle whose preview indicates impending lock', () => {
  const initial = createAbsAxleState()
  const next = stepAbsAxleState(initial, {
    frontWheelRotationFactor: 1,
    rearWheelRotationFactor: 0.2,
  }, 1, 15, 1 / 60, true)

  assert.equal(next.frontPressureFactor, 1)
  assert.ok(next.rearPressureFactor < 0.9, JSON.stringify(next))
  assert.equal(next.active, true)
})

test('ABS reapplies released pressure when wheel rotation recovers', () => {
  let state = {
    frontPressureFactor: 1,
    rearPressureFactor: 0.35,
    active: true,
  }
  for (let frame = 0; frame < 6; frame += 1) {
    state = stepAbsAxleState(state, {
      frontWheelRotationFactor: 1,
      rearWheelRotationFactor: 1,
    }, 1, 12, 1 / 60, true)
  }
  assert.ok(state.rearPressureFactor > 0.7, JSON.stringify(state))
})

test('service ABS does not interfere with the mechanical parking brake path', () => {
  const car = vehicle()
  car.handbrake = true
  const result = stepVehiclePhysics(car, {
    throttle: 0,
    brake: 0,
    clutch: 0,
    steer: 0,
    steeringWheelTarget: 0,
  }, 1 / 60, {
    automatic: true,
    grade: 0,
  })

  assert.equal(result.abs.active, false)
  assert.equal(result.abs.frontPressureFactor, 1)
  assert.equal(result.abs.rearPressureFactor, 1)
  assert.ok(result.tire.rearWheelRotationFactor < 0.2)
})

test('full service braking activates ABS and prevents sustained rear-wheel lock', () => {
  const car = vehicle()
  let activeFrames = 0
  let lockedFrames = 0
  let minimumRearRotation = 1

  for (let frame = 0; frame < 120; frame += 1) {
    const result = stepVehiclePhysics(car, {
      throttle: 0,
      brake: 1,
      clutch: 0,
      steer: 0,
      steeringWheelTarget: 0,
    }, 1 / 60, {
      automatic: true,
      grade: 0,
    })
    if (result.abs.active) activeFrames += 1
    if (result.tire.rearWheelRotationFactor < 0.2) lockedFrames += 1
    minimumRearRotation = Math.min(
      minimumRearRotation,
      result.tire.rearWheelRotationFactor,
    )
  }

  assert.ok(activeFrames > 5, `ABS active for only ${activeFrames} frames`)
  assert.ok(
    lockedFrames < 20,
    `rear remained near-lock for ${lockedFrames} frames`,
  )
  assert.ok(minimumRearRotation < 0.95)
  assert.ok(car.speed < 5, `car failed to decelerate: ${car.speed}`)
})

test('disabling ABS allows sustained rear lock under the same full-brake command', () => {
  const car = vehicle()
  let lockedFrames = 0

  for (let frame = 0; frame < 40; frame += 1) {
    const result = stepVehiclePhysics(car, {
      throttle: 0,
      brake: 1,
      clutch: 0,
      steer: 0,
      steeringWheelTarget: 0,
    }, 1 / 60, {
      automatic: true,
      grade: 0,
      absEnabled: false,
    })
    if (result.tire.rearWheelRotationFactor < 0.2) lockedFrames += 1
  }

  assert.ok(lockedFrames > 20, `rear locked for only ${lockedFrames} frames`)
})
