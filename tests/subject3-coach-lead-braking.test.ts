import assert from 'node:assert/strict'
import test from 'node:test'
import { createSubject3CoachRuntime, stepSubject3Coach } from '../src/coach/subject3Coach'
import { DRIVING_RULES } from '../src/rules/drivingRules'
import { stepVehiclePhysics, type PhysicsVehicle } from '../src/sim/vehiclePhysics'
import { MANUAL_GEARS } from '../src/sim/vehiclePowertrain'
import { TRAINING_CAR } from '../src/sim/vehicleDimensions'
import {
  actorRoutePose, poseAtRouteDistance, projectToSubject3Route,
} from '../src/subject3/subject3Route'
import {
  createSubject3TrafficState,
  SUBJECT3_TRAFFIC_CAR,
  subject3VehicleCollision,
  updateSubject3TrafficVehicle,
} from '../src/subject3/subject3Traffic'

function vehicleAt(progress: number, speed: number): PhysicsVehicle {
  const pose = poseAtRouteDistance(progress)
  return {
    x: pose.x, z: pose.z, heading: pose.heading, speed,
    steering: 0, steeringWheelAngle: 0, throttle: 0, brake: 0, clutch: 0,
    gear: 3, engineOn: true, engineRpm: speed * MANUAL_GEARS[3]!.rpmPerMps,
    stallTimer: 0, handbrake: false,
  }
}

test('coach uses more than cruise brake when a stopped lead is close at road speed', () => {
  const vehicle = vehicleAt(1200, 6)
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficVehicle(traffic, 'lead', 1212, 0, 0, false, 'sudden-brake')
  const close = stepSubject3Coach(vehicle, createSubject3CoachRuntime(),
    0.05, true, false, traffic).command
  assert.ok(close.brake > 0.65, `brake ${close.brake} must match a short stopping gap`)
  assert.equal(close.throttle, 0)
  assert.match(close.status, /急刹/)

  updateSubject3TrafficVehicle(traffic, 'lead', 1245, 0, 0, false, 'sudden-brake')
  const distant = stepSubject3Coach(vehicle, createSubject3CoachRuntime(),
    0.05, true, false, traffic).command
  assert.equal(distant.brake, 0, 'a distant lead cannot cause an emergency brake')
})

test('coach does not emergency brake for a lead already matching road speed', () => {
  const vehicle = vehicleAt(1200, 6)
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficVehicle(traffic, 'lead', 1209, 0, 6, false, 'sudden-brake')
  const command = stepSubject3Coach(vehicle, createSubject3CoachRuntime(),
    0.05, true, false, traffic).command
  assert.ok(command.brake < 0.2)
  assert.ok(command.throttle >= 0)
})

test('an already stopped coach does not accelerate into a parked lead but resumes when it moves', () => {
  const vehicle = vehicleAt(1200, 0)
  vehicle.gear = 1
  vehicle.engineRpm = DRIVING_RULES.manualTransmission.idleRpm
  const traffic = createSubject3TrafficState()
  updateSubject3TrafficVehicle(traffic, 'lead', 1209, 0, 0, false, 'sudden-brake')
  const stopped = stepSubject3Coach(vehicle, createSubject3CoachRuntime(),
    0.05, true, false, traffic)
  assert.equal(stopped.command.throttle, 0)
  assert.equal(stopped.command.brake, 0)
  assert.match(stopped.command.status, /急刹/)

  updateSubject3TrafficVehicle(traffic, 'lead', 1214, 0, 4, false, 'sudden-brake')
  const resumed = stepSubject3Coach(vehicle, stopped.runtime,
    0.05, true, false, traffic)
  assert.ok(resumed.command.throttle > 0, 'coach should move when space is available')
  assert.equal(resumed.command.brake, 0)
})

function runPhysicalLeadingStopAndResume(automatic: boolean) {
  const dt = 0.05
  const startProgress = 1200
  const car = vehicleAt(startProgress, 6)
  if (automatic) {
    car.gear = 1
    car.engineRpm = DRIVING_RULES.manualTransmission.idleRpm + 6 * 95
  }
  let runtime = createSubject3CoachRuntime()
  const traffic = createSubject3TrafficState()
  let leadProgress = startProgress + 25
  let peakBrake = 0
  let minimumGap = Infinity
  let minimumSpeedDuringStop = Infinity
  let recovered = false
  let stallCount = 0
  let progressWhenReleased = startProgress

  for (let frame = 0; frame < 440; frame += 1) {
    const leadSpeed = frame < 160 ? 0 : frame < 280 ? 4 : 6
    updateSubject3TrafficVehicle(
      traffic, 'moving-lead', leadProgress, 0, leadSpeed,
      false, 'sudden-brake',
    )
    const next = stepSubject3Coach(
      car, runtime, dt, automatic, false, traffic,
    )
    runtime = next.runtime
    const command = next.command
    car.engineOn = command.engineOn
    car.handbrake = command.handbrake
    car.gear = command.gear
    const physics = stepVehiclePhysics(car, {
      throttle: command.throttle,
      brake: command.brake,
      clutch: command.clutch,
      steer: 0,
      steeringWheelTarget: command.steeringWheelTarget,
    }, dt, { automatic, grade: 0 })
    if (physics.stalled) stallCount += 1

    const observedProgress = projectToSubject3Route(car.x, car.z).progress
    const actor = actorRoutePose(leadProgress, 0)
    const bumperGap = leadProgress - observedProgress -
      (TRAINING_CAR.lengthMeters + SUBJECT3_TRAFFIC_CAR.lengthMeters) / 2
    assert.equal(subject3VehicleCollision(car, actor), false,
      `${automatic ? 'C2' : 'C1'} hit lead at ${frame}, gap ${bumperGap.toFixed(2)}m`)
    minimumGap = Math.min(minimumGap, bumperGap)
    peakBrake = Math.max(peakBrake, command.brake)
    if (frame < 160) minimumSpeedDuringStop = Math.min(minimumSpeedDuringStop, Math.abs(car.speed))
    if (frame === 160) progressWhenReleased = observedProgress
    if (frame > 320 && car.speed > 2) recovered = true
    assert.ok(Number.isFinite(car.speed) && Number.isFinite(car.heading))
    assert.ok(Number.isFinite(car.x) && Number.isFinite(car.z))
    leadProgress += leadSpeed * dt
  }

  assert.equal(stallCount, 0, 'the defensive stop cannot stall C1 or C2')
  assert.ok(peakBrake > 0.3, `strong braking never activated: ${peakBrake}`)
  assert.ok(minimumGap > 0.1, `unsafe bumper clearance: ${minimumGap}`)
  assert.ok(minimumSpeedDuringStop < 0.6,
    `coach did not stop behind the waiting lead: ${minimumSpeedDuringStop}`)
  assert.ok(recovered, 'coach never resumed road speed after the lead moved away')
  assert.ok(projectToSubject3Route(car.x, car.z).progress > progressWhenReleased + 10,
    'post-hazard progress must come from real vehicle physics')
}

for (const automatic of [false, true]) {
  test(`${automatic ? 'C2' : 'C1'} coach physically brakes for a stopped lead and resumes without contact or stall`,
    () => runPhysicalLeadingStopAndResume(automatic))
}
