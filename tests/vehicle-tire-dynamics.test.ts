import assert from 'node:assert/strict'
import test from 'node:test'
import { DRIVING_RULES } from '../src/rules/drivingRules'
import {
  stepVehiclePhysics,
  type PhysicsVehicle,
} from '../src/sim/vehiclePhysics'
import {
  TRAINING_CAR_DYNAMICS,
  calculateWheelNormalLoads,
} from '../src/sim/vehicleTireDynamics'

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
  let coastFrontSlip = 0
  let powerFrontSlip = 0

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
    coastFrontSlip = Math.max(
      coastFrontSlip,
      Math.abs(coastResult.tire.frontSlipAngleRadians),
    )
    powerFrontSlip = Math.max(
      powerFrontSlip,
      Math.abs(powerResult.tire.frontSlipAngleRadians),
    )
  }

  // Once both cases sit on the friction circle their total grip usage is
  // intentionally ~= 1. FWD throttle consumes longitudinal capacity, so the
  // physically meaningful difference is extra front slip / reduced yaw.
  assert.ok(
    powerFrontSlip >= coastFrontSlip,
    `powered FWD tire should not need less slip: coast=${coastFrontSlip}, power=${powerFrontSlip}`,
  )
  assert.ok(
    Math.abs(power.heading) < Math.abs(coast.heading),
    `powered FWD turn should understeer: coast=${coast.heading}, power=${power.heading}`,
  )
})


test('with ABS disabled, hard braking can lock the unloaded rear axle without inventing yaw', () => {
  const car = vehicle({ speed: 14 })

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

  assert.ok(result.tire.rearSkidSeverity > 0.2, JSON.stringify(result.tire))
  assert.ok(result.tire.rearWheelRotationFactor < 0.8, JSON.stringify(result.tire))
  assert.ok(Math.abs(car.heading) < 1e-9)
  assert.ok(Math.abs(car.lateralSpeed ?? 0) < 1e-9)
})

test('moving parking brake locks rear wheel rotation before front wheel rotation', () => {
  const car = vehicle({ speed: 10, handbrake: true })
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

  assert.ok(result.tire.rearWheelRotationFactor < 0.15, JSON.stringify(result.tire))
  assert.ok(result.tire.frontWheelRotationFactor > 0.95, JSON.stringify(result.tire))
})


test('static wheel loads conserve vehicle weight and preserve front-heavy balance', () => {
  const loads = calculateWheelNormalLoads(0, 0)
  const expectedTotal =
    TRAINING_CAR_DYNAMICS.massKg * TRAINING_CAR_DYNAMICS.gravityMps2
  assert.ok(Math.abs(loads.totalN - expectedTotal) < 1e-6)
  assert.ok(
    Math.abs(
      loads.frontLeftN + loads.frontRightN +
      loads.rearLeftN + loads.rearRightN -
      expectedTotal
    ) < 1e-6,
  )
  assert.ok(loads.frontAxleN > loads.rearAxleN)
  assert.ok(Math.abs(loads.frontLeftN - loads.frontRightN) < 1e-9)
})

test('hard forward braking transfers vertical load from rear axle to front axle', () => {
  const staticLoads = calculateWheelNormalLoads(0, 0)
  const brakingLoads = calculateWheelNormalLoads(-8.5, 0)
  assert.ok(brakingLoads.frontAxleN > staticLoads.frontAxleN + 1500)
  assert.ok(brakingLoads.rearAxleN < staticLoads.rearAxleN - 1500)
  assert.ok(
    Math.abs(brakingLoads.totalN - staticLoads.totalN) < 1e-6,
  )
})

test('rightward cornering loads the left outside tires while conserving each axle', () => {
  const staticLoads = calculateWheelNormalLoads(0, 0)
  const cornering = calculateWheelNormalLoads(0, 6)
  assert.ok(cornering.frontLeftN > cornering.frontRightN)
  assert.ok(cornering.rearLeftN > cornering.rearRightN)
  assert.ok(
    Math.abs(cornering.frontAxleN - staticLoads.frontAxleN) < 1e-6,
  )
  assert.ok(
    Math.abs(cornering.rearAxleN - staticLoads.rearAxleN) < 1e-6,
  )
})

test('tire telemetry exposes forward load transfer during a full service stop', () => {
  const car = vehicle({ speed: 14 })
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
  assert.ok(
    result.tire.normalLoads.frontAxleN >
      result.tire.normalLoads.rearAxleN,
  )
  assert.ok(result.tire.longitudinalAccelerationMps2 < -8)
})


test('handbrake drift recovers to stable forward travel after release and steering return', () => {
  const roadAngle = 0.34
  const car = vehicle({
    speed: 10,
    steering: roadAngle,
    steeringWheelAngle: steeringWheelForRoadAngle(roadAngle),
    handbrake: true,
    engineOn: true,
    engineRpm: 2200,
    gear: 1,
  })

  let releaseSideslip = 0
  let releaseYawRate = 0

  for (let frame = 0; frame < 18; frame += 1) {
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
    releaseSideslip = Math.abs(result.tire.sideslipAngleRadians)
    releaseYawRate = Math.abs(result.tire.yawRateRps)
  }

  assert.ok(
    releaseSideslip > 0.08,
    `handbrake failed to create meaningful sideslip: ${releaseSideslip}`,
  )
  assert.ok(
    releaseYawRate > 0.2,
    `handbrake failed to create meaningful yaw: ${releaseYawRate}`,
  )

  car.handbrake = false
  let final = null as ReturnType<typeof stepVehiclePhysics> | null
  let sawRecoveryDynamicModel = false

  for (let frame = 0; frame < 120; frame += 1) {
    final = stepVehiclePhysics(car, {
      throttle: 0.38,
      brake: 0,
      clutch: 0,
      steer: 0,
      steeringWheelTarget: 0,
    }, 1 / 60, {
      automatic: true,
      grade: 0,
    })
    if (final.tire.model === 'dynamic') {
      sawRecoveryDynamicModel = true
    }
  }

  assert.equal(sawRecoveryDynamicModel, true)
  assert.ok(final)
  assert.ok(
    Math.abs(final.tire.sideslipAngleRadians) < 0.04,
    `sideslip did not recover: ${final.tire.sideslipAngleRadians}`,
  )
  assert.ok(
    Math.abs(final.tire.yawRateRps) < 0.08,
    `yaw did not recover: ${final.tire.yawRateRps}`,
  )
  assert.ok(
    Math.abs(car.lateralSpeed ?? 0) <
      Math.max(0.2, Math.abs(car.speed) * 0.06),
    `velocity did not realign: u=${car.speed}, v=${car.lateralSpeed}`,
  )
  assert.ok(
    car.speed > 2,
    `car failed to resume forward travel: u=${car.speed}`,
  )
})


test('reverse gear stays on deterministic kinematics even with stale forward-slip state', () => {
  const roadAngle = -0.4
  const car = vehicle({
    speed: -0.45,
    gear: -1,
    steering: roadAngle,
    steeringWheelAngle: steeringWheelForRoadAngle(roadAngle),
    lateralSpeed: 0.35,
    yawRate: 0.22,
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
  assert.ok(Math.abs(car.heading) < 0.02, `reverse heading exploded: ${car.heading}`)
  assert.ok(Math.abs(car.yawRate ?? 0) < 0.2)
})


test('dynamic CG axle arms are consistent with the configured static weight distribution', () => {
  const dynamics = TRAINING_CAR_DYNAMICS
  const wheelbase = DRIVING_RULES.steering.wheelbaseMeters

  assert.ok(
    Math.abs(
      dynamics.frontAxleFromCgMeters +
      dynamics.rearAxleFromCgMeters -
      wheelbase
    ) < 1e-9,
  )
  assert.ok(
    Math.abs(
      dynamics.rearAxleFromCgMeters / wheelbase -
      dynamics.frontStaticWeightFraction
    ) < 1e-9,
  )
  assert.ok(
    dynamics.frontAxleFromCgMeters <
      dynamics.rearAxleFromCgMeters,
  )
  assert.ok(dynamics.cgForwardFromBodyCenterMeters > 0)
})


test('dynamic slide motion remains close across 30, 60 and 120 Hz frame rates', () => {
  const simulate = (hz: number) => {
    const roadAngle = 0.27
    const car = vehicle({
      speed: 10,
      gear: 1,
      engineOn: true,
      engineRpm: 2200,
      steering: roadAngle,
      steeringWheelAngle: steeringWheelForRoadAngle(roadAngle),
      handbrake: true,
    })
    let dynamicFrames = 0
    for (let frame = 0; frame < hz * 3; frame += 1) {
      if (frame >= hz * 0.3) car.handbrake = false
      const recovering = frame >= hz * 0.3
      const output = stepVehiclePhysics(car, {
        throttle: recovering ? 0.38 : 0,
        brake: 0,
        clutch: 0,
        steer: 0,
        steeringWheelTarget: recovering ? 0 : steeringWheelForRoadAngle(roadAngle),
      }, 1 / hz, { automatic: true, grade: 0 })
      assert.ok(Number.isFinite(car.x) && Number.isFinite(car.z))
      assert.ok(Number.isFinite(car.heading) && Number.isFinite(car.speed))
      assert.ok(Number.isFinite(car.lateralSpeed) && Number.isFinite(car.yawRate))
      if (output.tire.model === 'dynamic') dynamicFrames++
    }
    assert.ok(dynamicFrames > hz / 5, 'test must exercise dynamic tire integration')
    assert.ok(car.speed > 1, 'recovered car must move forward')
    return car
  }

  const baseline = simulate(120)
  for (const hz of [30, 60]) {
    const actual = simulate(hz)
    const positionError = Math.hypot(actual.x - baseline.x, actual.z - baseline.z)
    assert.ok(positionError < 2.5, `${hz}Hz drift location diverged by ${positionError}m`)
    assert.ok(Math.abs(actual.speed - baseline.speed) < 1, `${hz}Hz speed diverged`)
    assert.ok(Math.abs(actual.heading - baseline.heading) < 0.4, `${hz}Hz heading diverged`)
  }
})
