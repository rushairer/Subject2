import assert from 'node:assert/strict'
import test from 'node:test'
import { DRIVING_RULES } from '../src/rules/drivingRules'
import {
  stepVehiclePhysics,
  type PhysicsVehicle,
} from '../src/sim/vehiclePhysics'
import { TRAINING_CAR_DYNAMICS } from '../src/sim/vehicleTireDynamics'

function vehicle(overrides: Partial<PhysicsVehicle> = {}): PhysicsVehicle {
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

function steeringWheelForRoadAngle(roadAngle: number) {
  return (
    roadAngle /
    DRIVING_RULES.steering.roadWheelMaxAngleRadians *
    DRIVING_RULES.steering.wheelTurnsLockToLock *
    Math.PI
  )
}

test('training car drivetrain is explicitly front-wheel drive with a rear parking brake model', () => {
  assert.equal(TRAINING_CAR_DYNAMICS.driveAxle, 'front')
  assert.ok(TRAINING_CAR_DYNAMICS.serviceBrakeFrontBias > 0.5)
  assert.ok(TRAINING_CAR_DYNAMICS.rearGripFractionWithParkingBrake < 0.2)
})

test('ordinary low-speed exam steering stays on the deterministic kinematic model', () => {
  const roadAngle = 0.35
  const car = vehicle({
    speed: 2,
    steering: roadAngle,
    steeringWheelAngle: steeringWheelForRoadAngle(roadAngle),
  })
  const result = stepVehiclePhysics(car, {
    throttle: 0,
    brake: 0,
    clutch: 0,
    steer: 0,
    steeringWheelTarget: car.steeringWheelAngle,
  }, 1 / 60, {
    automatic: true,
    grade: 0,
  })

  assert.equal(result.tire.model, 'kinematic')
  assert.equal(result.tire.frontSlipAngleRadians, 0)
  assert.equal(result.tire.rearSlipAngleRadians, 0)
})

test('a moving handbrake turn unlocks rear lateral grip and produces a real sideslip state', () => {
  const roadAngle = 0.28
  const car = vehicle({
    speed: 12,
    steering: roadAngle,
    steeringWheelAngle: steeringWheelForRoadAngle(roadAngle),
    handbrake: true,
  })
  let maximumRearSkid = 0
  let sawDynamic = false

  for (let frame = 0; frame < 30; frame += 1) {
    const result = stepVehiclePhysics(car, {
      throttle: 0,
      brake: 0,
      clutch: 0,
      steer: 0,
      steeringWheelTarget: car.steeringWheelAngle,
    }, 1 / 60, {
      automatic: true,
      grade: 0,
    })
    sawDynamic ||= result.tire.model === 'dynamic'
    maximumRearSkid = Math.max(maximumRearSkid, result.tire.rearSkidSeverity)
  }

  assert.equal(sawDynamic, true)
  assert.ok(maximumRearSkid > 0.85, `rear skid severity ${maximumRearSkid}`)
  assert.ok(Math.abs(car.lateralSpeed ?? 0) > 0.15, `lateral speed ${car.lateralSpeed}`)
  assert.ok(Math.abs(car.heading) > 0.2, `heading ${car.heading}`)
})

test('pulling the handbrake while travelling straight does not invent a sideways impulse', () => {
  const car = vehicle({ speed: 12, handbrake: true })

  for (let frame = 0; frame < 60; frame += 1) {
    stepVehiclePhysics(car, {
      throttle: 0,
      brake: 0,
      clutch: 0,
      steer: 0,
      steeringWheelTarget: 0,
    }, 1 / 60, {
      automatic: true,
      grade: 0,
    })
  }

  assert.ok(Math.abs(car.x) < 1e-6, `unexpected lateral displacement ${car.x}`)
  assert.ok(Math.abs(car.heading) < 1e-6, `unexpected yaw ${car.heading}`)
})

test('front-drive acceleration consumes front tire grip during a saturated high-speed turn', () => {
  const roadAngle = 0.32
  const make = () => vehicle({
    speed: 14,
    steering: roadAngle,
    steeringWheelAngle: steeringWheelForRoadAngle(roadAngle),
    gear: 4,
    engineOn: true,
    engineRpm: 3000,
  })
  const coast = make()
  const power = make()
  let coastUsage = 0
  let powerUsage = 0

  for (let frame = 0; frame < 24; frame += 1) {
    const coastResult = stepVehiclePhysics(coast, {
      throttle: 0,
      brake: 0,
      clutch: 0,
      steer: 0,
      steeringWheelTarget: coast.steeringWheelAngle,
    }, 1 / 60, {
      automatic: false,
      grade: 0,
    })
    const powerResult = stepVehiclePhysics(power, {
      throttle: 1,
      brake: 0,
      clutch: 0,
      steer: 0,
      steeringWheelTarget: power.steeringWheelAngle,
    }, 1 / 60, {
      automatic: false,
      grade: 0,
    })
    coastUsage = Math.max(coastUsage, coastResult.tire.frontGripUsage)
    powerUsage = Math.max(powerUsage, powerResult.tire.frontGripUsage)
  }

  assert.ok(powerUsage > coastUsage + 0.1, `coast=${coastUsage}, power=${powerUsage}`)
  assert.ok(
    Math.abs(power.heading) < Math.abs(coast.heading),
    `powered FWD turn should understeer: coast=${coast.heading}, power=${power.heading}`,
  )
})
