import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ROAD_SURFACES,
  ROAD_SURFACE_IDS,
  relativeRoadGrip,
  roadSurfaceFriction,
  type RoadSurfaceId,
} from '../src/sim/roadSurface'
import { stepVehiclePhysics, type PhysicsVehicle } from '../src/sim/vehiclePhysics'
import {
  TRAINING_CAR_DYNAMICS,
  kinematicTireTelemetry,
  shouldUseDynamicTireModel,
} from '../src/sim/vehicleTireDynamics'

function car(overrides: Partial<PhysicsVehicle> = {}): PhysicsVehicle {
  return {
    x: 0, z: 0, heading: 0, speed: 0,
    steering: 0, steeringWheelAngle: 0, throttle: 0, brake: 0,
    clutch: 0, gear: 1, engineOn: false, engineRpm: 0,
    stallTimer: 0, handbrake: false, ...overrides,
  }
}

const idle = { throttle: 0, brake: 0, clutch: 0, steer: 0 }

test('road surfaces are explicit finite ordered simulator grip presets', () => {
  assert.deepEqual(ROAD_SURFACE_IDS, ['dry', 'wet', 'lowGrip'])
  assert.equal(roadSurfaceFriction('dry'), TRAINING_CAR_DYNAMICS.tireFrictionCoefficient)
  assert.equal(relativeRoadGrip('dry'), 1)
  assert.ok(ROAD_SURFACES.dry.frictionCoefficient > ROAD_SURFACES.wet.frictionCoefficient)
  assert.ok(ROAD_SURFACES.wet.frictionCoefficient > ROAD_SURFACES.lowGrip.frictionCoefficient)
  assert.ok(ROAD_SURFACE_IDS.every(id =>
    Number.isFinite(roadSurfaceFriction(id)) && roadSurfaceFriction(id) > 0 &&
    ROAD_SURFACES[id].label.length > 0))
})

test('omitting the surface reproduces the exact dry exam physics across different controls', () => {
  const scenes = [
    { car: car({ speed: 2, gear: -1, steering: -0.2 }), input: idle },
    { car: car({ speed: 12, handbrake: true, steering: 0.24,
      lateralSpeed: 1.2, yawRate: 0.35 }), input: { ...idle, brake: 0.6 } },
    { car: car({ speed: 8, gear: 1, engineOn: true, engineRpm: 2400 }),
      input: { ...idle, throttle: 0.45 } },
  ]
  for (const scene of scenes) {
    const implicit = structuredClone(scene.car)
    const explicit = structuredClone(scene.car)
    const a = stepVehiclePhysics(implicit, scene.input, 1 / 30,
      { automatic: true, grade: 0 })
    const b = stepVehiclePhysics(explicit, scene.input, 1 / 30,
      { automatic: true, grade: 0, surface: 'dry' })
    assert.deepEqual(implicit, explicit)
    assert.deepEqual(a, b)
  }
})

test('wet and low-grip surfaces increase real full-stop time and travel distance', () => {
  const stop = (surface: RoadSurfaceId) => {
    const vehicle = car({ speed: 20, gear: 0 })
    let elapsed = 0
    for (let frame = 0; frame < 900 && vehicle.speed > 0.05; frame++) {
      const next = stepVehiclePhysics(vehicle, { ...idle, brake: 1 }, 1 / 60,
        { automatic: true, grade: 0, surface })
      assert.ok(Number.isFinite(vehicle.speed) && Number.isFinite(vehicle.z))
      assert.ok(Number.isFinite(next.tire.frontGripUsage))
      assert.ok(Number.isFinite(next.tire.rearGripUsage))
      elapsed += 1 / 60
    }
    assert.ok(vehicle.speed <= 0.05, `${surface}: car must eventually stop`)
    return { elapsed, distance: -vehicle.z }
  }

  const dry = stop('dry')
  const wet = stop('wet')
  const lowGrip = stop('lowGrip')
  assert.ok(dry.distance > 10)
  assert.ok(wet.distance > dry.distance + 3,
    `wet ${wet.distance}m vs dry ${dry.distance}m`)
  assert.ok(lowGrip.distance > wet.distance + 6,
    `low-grip ${lowGrip.distance}m vs wet ${wet.distance}m`)
  assert.ok(dry.elapsed < wet.elapsed && wet.elapsed < lowGrip.elapsed)
})

test('front-wheel-drive traction is reduced on slick takeoff with the same throttle', () => {
  const launch = (surface: RoadSurfaceId) => {
    const vehicle = car({ engineOn: true, engineRpm: 1000, gear: 1 })
    for (let frame = 0; frame < 45; frame++) {
      stepVehiclePhysics(vehicle, { ...idle, throttle: 1 }, 1 / 60,
        { automatic: true, grade: 0, surface })
    }
    return vehicle.speed
  }
  const dry = launch('dry')
  const lowGrip = launch('lowGrip')
  assert.ok(dry > lowGrip + 0.5, `dry ${dry}m/s vs low-grip ${lowGrip}m/s`)
  assert.ok(lowGrip > 0, 'slippery takeoff is slow, not impossible')
})

test('the same steering and braking load consumes more tire grip on wet asphalt', () => {
  const input = {
    longitudinalSpeed: 12,
    steering: 0.17,
    driveAcceleration: 0,
    brake: 0.36,
    handbrake: false,
  }
  const state = { lateralSpeed: 0.2, yawRate: 0.3 }
  const dry = kinematicTireTelemetry({ ...input, surface: 'dry' }, state)
  const wet = kinematicTireTelemetry({ ...input, surface: 'wet' }, state)
  const lowGrip = kinematicTireTelemetry({ ...input, surface: 'lowGrip' }, state)
  assert.ok(wet.frontGripUsage > dry.frontGripUsage)
  assert.ok(lowGrip.frontGripUsage > wet.frontGripUsage)
  assert.ok(lowGrip.normalLoads.totalN > 0)
  assert.equal(dry.driveAxle, 'front')
  assert.ok(shouldUseDynamicTireModel({
    ...input, surface: 'lowGrip', brake: 0,
  }), 'sharp steering under low grip must activate the nonlinear tire model')
})

test('a long low-grip frame agrees with the same sequence of internal physics substeps', () => {
  const original = car({ speed: 14, lateralSpeed: 0.6, yawRate: 0.18,
    steering: 0.2, handbrake: true })
  const a = structuredClone(original)
  const b = structuredClone(original)
  const input = { ...idle, brake: 0.25 }
  const options = { automatic: true, grade: 0, surface: 'wet' as const }
  const combined = stepVehiclePhysics(a, input, 0.1, options)
  let repeated
  for (let i = 0; i < 6; i++) {
    repeated = stepVehiclePhysics(b, input, 1 / 60, options)
  }
  assert.deepEqual(a, b)
  assert.deepEqual(combined, repeated)
})

test('low-speed reverse parking remains kinematic on every surface', () => {
  for (const surface of ROAD_SURFACE_IDS) {
    const vehicle = car({ speed: -0.4, gear: -1, steering: 0.28,
      lateralSpeed: 0.4, yawRate: 0.25 })
    const output = stepVehiclePhysics(vehicle, idle, 1 / 60,
      { automatic: true, grade: 0, surface })
    assert.equal(output.tire.model, 'kinematic')
    assert.ok(vehicle.speed < 0)
    assert.ok(Number.isFinite(vehicle.heading))
  }
})
