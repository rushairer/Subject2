import assert from 'node:assert/strict'
import test from 'node:test'
import { effectiveRoadFriction, roadSurfaceFriction } from '../src/sim/roadSurface'
import {
  RAIN_WATER,
  advanceRainWater,
  aquaplaningSeverity,
  createRainWaterState,
  localRainWaterDepthMm,
} from '../src/sim/rainWater'
import { stepVehiclePhysics, type PhysicsVehicle } from '../src/sim/vehiclePhysics'
import { kinematicTireTelemetry } from '../src/sim/vehicleTireDynamics'

const inputs = { throttle: 0, brake: 1, clutch: 0, steer: 0 }

function car(speed: number, overrides: Partial<PhysicsVehicle> = {}): PhysicsVehicle {
  return {
    x: 0, z: 0, heading: 0, speed,
    steering: 0, steeringWheelAngle: 0, throttle: 0, brake: 0, clutch: 0,
    gear: 0, engineOn: false, engineRpm: 0, stallTimer: 0,
    handbrake: false, ...overrides,
  }
}

test('rainfall accumulates in physics time, drains, and remains bounded', () => {
  const state = createRainWaterState()
  assert.equal(state.averageDepthMm, RAIN_WATER.initialAverageDepthMm)
  const initial = localRainWaterDepthMm(state, 0, 0)
  advanceRainWater(state, 60)
  assert.equal(state.elapsedSeconds, 60)
  assert.ok(state.averageDepthMm > RAIN_WATER.initialAverageDepthMm)
  assert.ok(localRainWaterDepthMm(state, 0, 0) > initial)
  advanceRainWater(state, 3600)
  assert.equal(state.averageDepthMm, RAIN_WATER.maximumAverageDepthMm)
  assert.ok(localRainWaterDepthMm(state, 0, 0) <= RAIN_WATER.maximumLocalDepthMm)
  const snapshot = structuredClone(state)
  advanceRainWater(state, 0)
  advanceRainWater(state, Number.NaN)
  advanceRainWater(state, -4)
  assert.deepEqual(state, snapshot)
})

test('world-space pooled water is deterministic, continuous and coordinate dependent', () => {
  const state = createRainWaterState()
  const a = localRainWaterDepthMm(state, 0, 0)
  const b = localRainWaterDepthMm(state, 18, 40)
  assert.ok(a > 0 && b > 0 && a !== b)
  assert.equal(a, localRainWaterDepthMm(state, 0, 0))
  assert.ok(Math.abs(a - localRainWaterDepthMm(state, 0.001, 0)) < 0.01)
  assert.equal(localRainWaterDepthMm(state, Number.NaN, 0), 0)
})

test('risk needs BOTH water and speed, is continuous, bounded and monotonic', () => {
  assert.equal(aquaplaningSeverity(0, 8), 0)
  assert.equal(aquaplaningSeverity(30, 0), 0)
  assert.equal(aquaplaningSeverity(10, 6), 0)
  assert.ok(aquaplaningSeverity(28, 5.5) > aquaplaningSeverity(20, 5.5))
  assert.ok(aquaplaningSeverity(24, 6) > aquaplaningSeverity(24, 2))
  assert.ok(aquaplaningSeverity(21, 4) > 0.1)
  assert.ok(aquaplaningSeverity(25, 5) < 1)
  assert.equal(aquaplaningSeverity(100, 30), 1)
  assert.equal(aquaplaningSeverity(Number.NaN, 4), 0)
  assert.equal(aquaplaningSeverity(25, Number.POSITIVE_INFINITY), 0)
})

test('rain grip falls with speed and depth; all prior preset coefficients remain exact', () => {
  assert.equal(roadSurfaceFriction('rain'), roadSurfaceFriction('wet'))
  for (const legacy of ['dry', 'wet', 'lowGrip'] as const) {
    assert.equal(effectiveRoadFriction(legacy, 40, 10), roadSurfaceFriction(legacy))
  }
  const noWater = effectiveRoadFriction('rain', 25, 0)
  const slow = effectiveRoadFriction('rain', 8, 7)
  const deep = effectiveRoadFriction('rain', 25, 7)
  const shallower = effectiveRoadFriction('rain', 25, 2)
  assert.equal(noWater, roadSurfaceFriction('wet'))
  assert.equal(slow, roadSurfaceFriction('wet'))
  assert.ok(deep < shallower && shallower < noWater)
  assert.ok(deep > 0, 'the wheel must retain finite contact grip')
})

test('actual car braking lengthens as water builds, beyond static wet asphalt', () => {
  const stop = (surface: 'wet' | 'rain') => {
    const vehicle = car(25)
    const water = createRainWaterState()
    for (let frame = 0; frame < 900 && vehicle.speed > 0.05; frame++) {
      const result = stepVehiclePhysics(vehicle, inputs, 1 / 60, {
        automatic: true, grade: 0, surface, rainWater: water,
      })
      assert.ok(Number.isFinite(vehicle.z) && Number.isFinite(vehicle.speed))
      if (surface === 'rain') {
        assert.ok((result.tire.aquaplaningSeverity ?? 0) >= 0)
        assert.ok(Number.isFinite(vehicle.localWaterDepthMm))
      } else {
        assert.equal(result.tire.aquaplaningSeverity, undefined)
      }
    }
    assert.ok(vehicle.speed < 0.05, 'the car must eventually stop')
    return -vehicle.z
  }
  const wetDistance = stop('wet')
  const rainDistance = stop('rain')
  assert.ok(rainDistance > wetDistance + 1,
    `accumulated water must increase stop distance: wet ${wetDistance}, rain ${rainDistance}`)
})

test('aquaplaning tire telemetry matches one shared four-wheel friction budget', () => {
  const input = {
    longitudinalSpeed: 25, steering: 0.15, driveAcceleration: 0,
    brake: 0.4, handbrake: false, surface: 'rain' as const,
  }
  const state = { lateralSpeed: 0.4, yawRate: 0.3 }
  const shallow = kinematicTireTelemetry({
    ...input, localWaterDepthMm: 0,
  }, state)
  const deep = kinematicTireTelemetry({
    ...input, localWaterDepthMm: 7,
  }, state)
  assert.equal(shallow.aquaplaningSeverity, 0)
  assert.ok((deep.aquaplaningSeverity ?? 0) > 0.5)
  assert.ok(deep.frontGripUsage > shallow.frontGripUsage)
  assert.ok(deep.rearGripUsage > shallow.rearGripUsage)
  assert.ok(Number.isFinite(deep.normalLoads.totalN))
})

test('C1 and C2 low-speed reverse geometry is identical on rain and static wet', () => {
  for (const automatic of [false, true]) {
    const base = car(-0.6, { gear: -1, steering: 0.3, steeringWheelAngle: 2.4 })
    const wet = structuredClone(base)
    const rain = structuredClone(base)
    const a = stepVehiclePhysics(wet, { ...inputs, brake: 0 }, 1 / 60,
      { automatic, grade: 0, surface: 'wet' })
    const b = stepVehiclePhysics(rain, { ...inputs, brake: 0 }, 1 / 60,
      { automatic, grade: 0, surface: 'rain', rainWater: createRainWaterState() })
    assert.equal(a.tire.model, 'kinematic')
    assert.equal(b.tire.model, 'kinematic')
    assert.equal(wet.x, rain.x)
    assert.equal(wet.z, rain.z)
    assert.equal(wet.heading, rain.heading)
    assert.equal(wet.speed, rain.speed)
  }
})

test('rain accumulation and vehicle physics agree between 30Hz and 60Hz', () => {
  const a = car(22, { gear: 2, engineOn: true, engineRpm: 2300,
    lateralSpeed: 0.9, yawRate: 0.24, steeringWheelAngle: 0.25,
    handbrake: true })
  const b = structuredClone(a)
  const waterA = createRainWaterState()
  const waterB = createRainWaterState()
  const input = { throttle: 0, brake: 0.3, clutch: 0, steer: 0 }
  for (let i = 0; i < 30; i++) {
    stepVehiclePhysics(a, input, 1 / 30,
      { automatic: true, grade: 0, surface: 'rain', rainWater: waterA })
  }
  for (let i = 0; i < 60; i++) {
    stepVehiclePhysics(b, input, 1 / 60,
      { automatic: true, grade: 0, surface: 'rain', rainWater: waterB })
  }
  assert.deepEqual(a, b)
  assert.deepEqual(waterA, waterB)
  assert.ok(waterA.averageDepthMm > RAIN_WATER.initialAverageDepthMm)
})

test('dry baseline cannot accumulate weather or add a phantom risk field', () => {
  const a = car(18)
  const b = structuredClone(a)
  const rainyState = createRainWaterState()
  const dryResult = stepVehiclePhysics(a, inputs, 0.1, {
    automatic: true, grade: 0,
  })
  const explicitResult = stepVehiclePhysics(b, inputs, 0.1, {
    automatic: true, grade: 0, surface: 'dry', rainWater: rainyState,
  })
  assert.deepEqual(a, b)
  assert.deepEqual(dryResult, explicitResult)
  assert.equal(a.localWaterDepthMm, undefined)
  assert.equal(a.aquaplaningSeverity, undefined)
  assert.equal(rainyState.elapsedSeconds, 0)
})
