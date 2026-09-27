import assert from 'node:assert/strict'
import test from 'node:test'
import { createPedalControlsState, stepPedalControls, type PedalControlsInput } from '../src/input/pedalControls'
import { DRIVING_RULES } from '../src/rules/drivingRules'
import { stepVehiclePhysics, type PhysicsVehicle } from '../src/sim/vehiclePhysics'

function driving(automatic: boolean, gear = 1, speedKmh = 0, hz = 60) {
  const vehicle: PhysicsVehicle = {
    x: 0, z: 0, heading: 0, speed: speedKmh / 3.6,
    steering: 0, steeringWheelAngle: 0, throttle: 0, brake: 0, clutch: 0,
    gear, engineOn: true, engineRpm: speedKmh ? 2000 : DRIVING_RULES.manualTransmission.idleRpm,
    stallTimer: 0, handbrake: false,
  }
  const pedals = createPedalControlsState()
  let stalls = 0
  return {
    vehicle,
    get stalls() { return stalls },
    step(keys: Partial<PedalControlsInput> = {}, grade = 0, gradeHeading = 0) {
      const output = stepPedalControls(pedals, {
        throttleKey: false, brakeKey: false, clutchFloorKey: false, clutchBiteKey: false,
        automatic, speed: vehicle.speed, gear: vehicle.gear, dt: 1 / hz, ...keys,
      })
      stalls += Number(stepVehiclePhysics(vehicle, { ...output, steer: 0 }, 1 / hz, { automatic, grade, gradeHeading }).stalled)
      return vehicle.speed * 3.6
    },
  }
}

test('lifting at 20 km/h leaves time to correct speed and lower gears brake more strongly', () => {
  const speeds = [true, false, false, false].map((automatic, index) => {
    const sim = driving(automatic, [1, 1, 2, 3][index], 20)
    for (let i = 0; i < 60; i++) sim.step()
    const speed = sim.vehicle.speed * 3.6
    assert.ok(speed > 17 && speed < 20, `coasting lost too much speed: ${speed}`)
    assert.equal(sim.stalls, 0)
    return speed
  })
  assert.ok(speeds[1] < speeds[2] && speeds[2] < speeds[3] && speeds[3] < speeds[0])
})

test('short keyboard corrections hold road speed without rapid oscillation at 20, 30 and 60 Hz', () => {
  for (const automatic of [true, false]) {
    const outcomes: number[] = []
    for (const hz of [20, 30, 60]) {
      const sim = driving(automatic, automatic ? 1 : 2, 20, hz)
      let throttleKey = false
      let changes = 0
      let min = Infinity
      let max = -Infinity
      for (let i = 0; i < 20 * hz; i++) {
        // A driver checks speed ten times a second with a visible dead band;
        // the only actuator is the real W key, not a perfect analogue throttle.
        if (i % (hz / 10) === 0) {
          const speed = sim.vehicle.speed * 3.6
          const next = speed < 19.6 ? true : speed > 20.4 ? false : throttleKey
          changes += Number(next !== throttleKey)
          throttleKey = next
        }
        const speed = sim.step({ throttleKey })
        min = Math.min(min, speed)
        max = Math.max(max, speed)
      }
      assert.ok(min >= 18.5 && max <= 21.5, `${automatic ? 'C2' : 'C1'} ${hz}Hz range ${min}..${max}`)
      assert.ok(changes >= 4 && changes <= 50, `correction count ${changes}`)
      assert.equal(sim.stalls, 0)
      outcomes.push(sim.vehicle.speed * 3.6)
    }
    assert.ok(Math.max(...outcomes) - Math.min(...outcomes) < 1)
  }
})

test('half-linkage and automatic idle both sustain controlled forward and reverse creep', () => {
  for (const automatic of [true, false]) for (const gear of [1, -1]) {
    const finalSpeeds: number[] = []
    for (const hz of [20, 30, 60]) {
      const sim = driving(automatic, gear, 0, hz)
      for (let i = 0; i < 15 * hz; i++) sim.step({ clutchBiteKey: !automatic && i === 0 })
      const speed = sim.vehicle.speed * 3.6
      assert.equal(Math.sign(speed), gear)
      assert.ok(Math.abs(speed) > 1 && Math.abs(speed) < 4.5, `creep speed ${speed}`)
      assert.equal(sim.stalls, 0)
      assert.ok(sim.vehicle.engineRpm >= DRIVING_RULES.manualTransmission.idleRpm)
      finalSpeeds.push(speed)
    }
    assert.ok(Math.max(...finalSpeeds) - Math.min(...finalSpeeds) < 0.1)
  }
})

test('neutral and a depressed clutch coast farther than an engaged manual gear', () => {
  const engaged = driving(false, 2, 20)
  const neutral = driving(false, 0, 20)
  const disconnected = driving(false, 2, 20)
  for (let i = 0; i < 120; i++) {
    engaged.step()
    neutral.step()
    disconnected.step({ clutchFloorKey: true })
  }
  assert.ok(neutral.vehicle.speed > engaged.vehicle.speed)
  assert.ok(disconnected.vehicle.speed > engaged.vehicle.speed)
  assert.ok(Math.abs(neutral.vehicle.speed - disconnected.vehicle.speed) < 0.01)
})

test('braking overrides held W and stops in both directions without reversing speed', () => {
  for (const automatic of [true, false]) for (const direction of [1, -1]) {
    const sim = driving(automatic, direction, direction * 15)
    for (let i = 0; i < 120; i++) {
      sim.step({ throttleKey: true, brakeKey: true, clutchFloorKey: !automatic })
      assert.equal(sim.vehicle.throttle, 0)
      assert.ok(sim.vehicle.speed * direction >= 0)
    }
    assert.equal(sim.vehicle.speed, 0)
    assert.equal(sim.stalls, 0)
  }
})

test('higher manual gears extend the usable speed range instead of lowering top speed', () => {
  const speeds = [1, 2, 3].map(gear => {
    const sim = driving(false, gear, 20)
    for (let i = 0; i < 1800; i++) sim.step({ throttleKey: true })
    assert.equal(sim.stalls, 0)
    return sim.vehicle.speed * 3.6
  })
  assert.ok(speeds[0] > 25 && speeds[0] < 32)
  assert.ok(speeds[1] > speeds[0] + 8)
  assert.ok(speeds[2] > speeds[1] + 8)
})

test('C1 can add power from the bite point on a rotated uphill without losing the gravity frame', () => {
  for (const heading of [0, Math.PI / 2]) {
    const sim = driving(false)
    sim.vehicle.heading = heading
    for (let i = 0; i < 180; i++) {
      sim.step({ throttleKey: true, clutchBiteKey: true }, 0.1, heading)
    }
    assert.ok(sim.vehicle.speed > 0.5)
    assert.equal(sim.stalls, 0)
  }
})
