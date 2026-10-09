import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RAIN_COACH_DEFENSE,
  rainCoachStoppingEnvelope,
} from '../src/coach/rainDefensiveBraking'
import {
  createSubject3CoachRuntime,
  stepSubject3Coach,
} from '../src/coach/subject3Coach'
import { DRIVING_RULES } from '../src/rules/drivingRules'
import { createRainWaterState, localRainWaterDepthMm } from '../src/sim/rainWater'
import { stepVehiclePhysics, type PhysicsVehicle } from '../src/sim/vehiclePhysics'
import { TRAINING_CAR } from '../src/sim/vehicleDimensions'
import { MANUAL_GEARS } from '../src/sim/vehiclePowertrain'
import {
  actorRoutePose,
  poseAtRouteDistance,
  projectToSubject3Route,
} from '../src/subject3/subject3Route'
import {
  createSubject3TrafficState,
  SUBJECT3_TRAFFIC_CAR,
  subject3VehicleCollision,
  updateSubject3TrafficHazard,
  updateSubject3TrafficVehicle,
} from '../src/subject3/subject3Traffic'

const stoppingRoad = { surface: 'rain' as const, localWaterDepthMm: 5.4 }

function carAt(progress: number, speed: number): PhysicsVehicle {
  const pose = poseAtRouteDistance(progress)
  return {
    x: pose.x, z: pose.z, heading: pose.heading, speed,
    steering: 0, steeringWheelAngle: 0, throttle: 0, brake: 0, clutch: 0,
    gear: 3, engineOn: true, engineRpm: speed * MANUAL_GEARS[3]!.rpmPerMps,
    stallTimer: 0, handbrake: false,
  }
}

test('rain anticipatory stop envelope uses the same water/speed tire-road coefficient', () => {
  const shallow = rainCoachStoppingEnvelope(16, 0, 12, 35)
  const deep = rainCoachStoppingEnvelope(16, 7, 12, 35)
  assert.ok(deep.availableDecelerationMps2 < shallow.availableDecelerationMps2)
  assert.ok(deep.predictedClosingStopMeters > shallow.predictedClosingStopMeters)
  assert.ok(deep.warningGapMeters > shallow.warningGapMeters)
  assert.ok(deep.requestedBrake >= shallow.requestedBrake)
  assert.ok(deep.earlyHazardLookaheadMeters > shallow.earlyHazardLookaheadMeters)
  assert.ok(deep.requestedBrake <= RAIN_COACH_DEFENSE.maximumRequestedBrake)
  assert.ok(Number.isFinite(deep.availableDecelerationMps2))
})

test('zero speed and nonfinite traffic measurements cannot create phantom braking', () => {
  const stationary = rainCoachStoppingEnvelope(0, Number.NaN, 0, 9)
  assert.equal(stationary.predictedClosingStopMeters, 0)
  assert.equal(stationary.requestedBrake, 0)
  assert.equal(stationary.earlyHazardLookaheadMeters, 0)
  const invalid = rainCoachStoppingEnvelope(
    Number.NaN, Number.POSITIVE_INFINITY, Number.NaN, Number.NaN,
  )
  assert.ok(Object.values(invalid).every(Number.isFinite))
  assert.equal(invalid.requestedBrake, 0)
})

test('rain coach recognizes a stationary lead earlier than unchanged dry coach', () => {
  const player = carAt(1200, 6)
  const traffic = createSubject3TrafficState()
  const centerGap = 22 +
    (TRAINING_CAR.lengthMeters + SUBJECT3_TRAFFIC_CAR.lengthMeters) / 2
  updateSubject3TrafficVehicle(
    traffic, 'rain-lead', 1200 + centerGap, 0, 0, false, 'sudden-brake',
  )
  const dry = stepSubject3Coach(player, createSubject3CoachRuntime(),
    0.05, true, false, traffic)
  const rain = stepSubject3Coach(player, createSubject3CoachRuntime(),
    0.05, true, false, traffic, undefined, stoppingRoad)
  assert.equal(dry.command.brake, 0)
  assert.ok(dry.command.throttle >= 0)
  assert.ok(rain.command.brake > dry.command.brake)
  assert.equal(rain.command.throttle, 0)
  assert.match(rain.command.status, /雨天前车急刹/)
  assert.equal(dry.runtime.defensiveRecovery, false)
})

test('normal lead flow and exam traffic remain unchanged without a rain environment', () => {
  const vehicle = carAt(1200, 6)
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficVehicle(traffic, 'lead', 1240, 0, 6)
  const implicit = stepSubject3Coach(vehicle, createSubject3CoachRuntime(),
    0.05, false, false, traffic)
  const explicitDry = stepSubject3Coach(vehicle, createSubject3CoachRuntime(),
    0.05, false, false, traffic, undefined, undefined)
  assert.deepEqual(implicit, explicitDry)
})

test('rain coach recognizes the same existing live cut-in and pedestrian conflicts sooner', () => {
  const car = carAt(1500, 6)
  const traffic = createSubject3TrafficState()
  for (const [kind, delta] of [
    ['cut-in-scooter', 19.5],
    ['crosswalk-pedestrian', 25.5],
  ] as const) {
    traffic.hazards = {}
    updateSubject3TrafficHazard(traffic, kind, kind,
      1500 + delta, 0.4, 0, -1, true, true)
    const normal = stepSubject3Coach(car, createSubject3CoachRuntime(),
      0.05, true, false, traffic)
    const rainy = stepSubject3Coach(car, createSubject3CoachRuntime(),
      0.05, true, false, traffic, undefined, stoppingRoad)
    assert.equal(normal.command.brake, 0, 'dry warning window must stay unchanged')
    assert.ok(rainy.command.brake >= 0.78,
      `${kind} did not trigger wet-road defensive braking`)
    assert.equal(rainy.command.throttle, 0)
  }
})

function runRealRainStopAndResume(automatic: boolean) {
  const dt = 0.05
  const car = carAt(1200, 6)
  if (automatic) {
    car.gear = 1
    car.engineRpm = DRIVING_RULES.manualTransmission.idleRpm + 6 * 95
  }
  const water = createRainWaterState()
  const traffic = createSubject3TrafficState()
  let runtime = createSubject3CoachRuntime()
  let leadProgress = 1225
  let minGap = Infinity
  let maxBrake = 0
  let minStopSpeed = Infinity
  let regainedMotion = false
  let stalls = 0
  let progressAtRelease = 1200
  for (let frame = 0; frame < 470; frame += 1) {
    const actorSpeed = frame < 170 ? 0 : frame < 280 ? 4 : 6
    updateSubject3TrafficVehicle(traffic, 'moving-rain-lead',
      leadProgress, 0, actorSpeed, false, 'sudden-brake')
    const depth = localRainWaterDepthMm(water, car.x, car.z)
    const next = stepSubject3Coach(car, runtime, dt, automatic, false,
      traffic, undefined, { surface: 'rain', localWaterDepthMm: depth })
    runtime = next.runtime
    const command = next.command
    car.engineOn = command.engineOn
    car.gear = command.gear
    car.handbrake = command.handbrake
    const physics = stepVehiclePhysics(car, {
      throttle: command.throttle, brake: command.brake,
      clutch: command.clutch, steer: 0,
      steeringWheelTarget: command.steeringWheelTarget,
    }, dt, { automatic, grade: 0, surface: 'rain', rainWater: water })
    if (physics.stalled) stalls += 1
    maxBrake = Math.max(maxBrake, command.brake)
    if (frame < 170) minStopSpeed = Math.min(minStopSpeed, Math.abs(car.speed))
    const position = projectToSubject3Route(car.x, car.z).progress
    const gap = leadProgress - position -
      (TRAINING_CAR.lengthMeters + SUBJECT3_TRAFFIC_CAR.lengthMeters) / 2
    minGap = Math.min(minGap, gap)
    assert.equal(subject3VehicleCollision(car, actorRoutePose(leadProgress, 0)),
      false, `${automatic ? 'C2' : 'C1'} struck rain lead at frame ${frame}, gap ${gap.toFixed(2)}m`)
    if (frame === 170) progressAtRelease = position
    if (frame > 340 && car.speed > 2) regainedMotion = true
    assert.ok(Number.isFinite(car.speed) && Number.isFinite(car.yawRate))
    assert.ok(Number.isFinite(car.x) && Number.isFinite(car.z))
    leadProgress += actorSpeed * dt
  }
  assert.equal(stalls, 0, 'wet defensive stop must not stall C1/C2')
  assert.ok(maxBrake > 0.3, `rain braking never engaged: ${maxBrake}`)
  assert.ok(minGap > 0.1, `rain gap unsafe: ${minGap}`)
  assert.ok(minStopSpeed < 0.6, `rain coach did not stop: ${minStopSpeed}`)
  assert.equal(regainedMotion, true, 'coach failed to move again once hazard cleared')
  assert.ok(projectToSubject3Route(car.x, car.z).progress > progressAtRelease + 10)
  assert.ok(water.averageDepthMm > 2.4)
}

for (const automatic of [false, true]) {
  test(`${automatic ? 'C2' : 'C1'} Golden Driver physically stops behind a lead on accumulating rain road then recovers`,
    () => runRealRainStopAndResume(automatic))
}
