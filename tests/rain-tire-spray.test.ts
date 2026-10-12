import assert from 'node:assert/strict'
import test from 'node:test'
import { createRainWaterState, localRainWaterDepthMm } from '../src/sim/rainWater'
import { wheelContactFootprints } from '../src/sim/wheelContact'
import {
  RAIN_TIRE_SPRAY,
  rainTireSprayEmissionRate,
  rainTireSprayVelocity,
} from '../src/sim/rainTireSpray'

test('parked, almost dry and invalid measurements never invent wheel spray', () => {
  for (const depth of [0, 0.8, 3, 10]) {
    assert.equal(rainTireSprayEmissionRate(0, depth), 0)
    assert.equal(rainTireSprayEmissionRate(1.8, depth), 0)
  }
  assert.equal(rainTireSprayEmissionRate(15, 0), 0)
  assert.equal(rainTireSprayEmissionRate(15, 1.2), 0)
  assert.equal(rainTireSprayEmissionRate(Number.NaN, 4), 0)
  assert.equal(rainTireSprayEmissionRate(12, Number.POSITIVE_INFINITY), 0)
  assert.ok(RAIN_TIRE_SPRAY.capacity <= 128)
})

test('spray increases monotonically with speed and actual water depth, and is bounded', () => {
  const speedRates = [2, 5, 10, 15, 30]
    .map(speed => rainTireSprayEmissionRate(speed, 6))
  for (let i = 1; i < speedRates.length; i += 1) {
    assert.ok(speedRates[i] >= speedRates[i - 1])
  }
  assert.ok(speedRates[2] > speedRates[0])
  const depths = [1.5, 3, 5, 7, 10]
    .map(depth => rainTireSprayEmissionRate(12, depth))
  for (let i = 1; i < depths.length; i += 1) {
    assert.ok(depths[i] >= depths[i - 1])
  }
  assert.ok(depths[2] > depths[0])
  assert.equal(rainTireSprayEmissionRate(100, 100),
    RAIN_TIRE_SPRAY.maxDropletsPerWheelSecond)
  assert.equal(rainTireSprayEmissionRate(-12, 5), rainTireSprayEmissionRate(12, 5))
})

test('spray reverses direction with signed wheel rolling speed, not steering or weather', () => {
  const forward = rainTireSprayVelocity(0, 12, 5, 0)
  const reverse = rainTireSprayVelocity(0, -12, 5, 0)
  assert.ok(forward.vz < 0)
  assert.ok(reverse.vz > 0)
  assert.equal(forward.vz, -reverse.vz)
  assert.ok(forward.vy > 0)
  assert.equal(forward.vy, reverse.vy)
  const side = rainTireSprayVelocity(Math.PI / 2, 12, 5, 0)
  assert.ok(side.vx > 0)
  assert.ok(Math.abs(side.vz) < 1e-9)
  assert.deepEqual(rainTireSprayVelocity(Number.NaN, 12, 5, 0),
    { vx: 0, vy: 0, vz: 0 })
})

test('spray wheel sampling uses real canonical four wheel footprints and one rainwater field', () => {
  const water = createRainWaterState()
  const car = { x: 0, z: 0, heading: 0, steering: 0, speed: 10 }
  const wheels = wheelContactFootprints(car)
  assert.equal(wheels.length, 4)
  const rates = wheels.map(wheel => {
    const depth = localRainWaterDepthMm(water, wheel.center.x, wheel.center.z)
    return rainTireSprayEmissionRate(car.speed, depth)
  })
  assert.ok(rates.every(rate => rate > 0))
  const before = [...rates]
  water.averageDepthMm = 7
  assert.ok(wheels.every((wheel, index) => {
    const depth = localRainWaterDepthMm(water, wheel.center.x, wheel.center.z)
    return rainTireSprayEmissionRate(car.speed, depth) > before[index]
  }))
  assert.equal(car.speed, 10, 'visual spray must never mutate vehicle physics')
})
