import assert from 'node:assert/strict'
import test from 'node:test'
import { tireSmokeEmissionRate } from '../src/sim/tireEffects'
import type { TireTelemetry } from '../src/sim/vehicleTireDynamics'

function telemetry(
  frontSkidSeverity: number,
  rearSkidSeverity: number,
): TireTelemetry {
  return {
    model: 'dynamic',
    driveAxle: 'front',
    lateralSpeedMps: 0,
    yawRateRps: 0,
    sideslipAngleRadians: 0,
    frontSlipAngleRadians: 0,
    rearSlipAngleRadians: 0,
    frontGripUsage: 0,
    rearGripUsage: 0,
    frontSkidSeverity,
    rearSkidSeverity,
  }
}

test('normal grip never emits tire smoke', () => {
  const tire = telemetry(0.2, 0.2)
  assert.equal(tireSmokeEmissionRate(tire, 15, 'front-left'), 0)
  assert.equal(tireSmokeEmissionRate(tire, 15, 'rear-right'), 0)
})

test('low-speed parking maneuvers remain smoke-free even with transient slip telemetry', () => {
  const tire = telemetry(1, 1)
  assert.equal(tireSmokeEmissionRate(tire, 1.2, 'front-left'), 0)
  assert.equal(tireSmokeEmissionRate(tire, -1.2, 'rear-left'), 0)
})

test('smoke follows the axle that is actually saturated', () => {
  const rearSlide = telemetry(0.1, 0.95)
  assert.equal(tireSmokeEmissionRate(rearSlide, 10, 'front-left'), 0)
  assert.ok(tireSmokeEmissionRate(rearSlide, 10, 'rear-left') > 0)

  const frontPush = telemetry(0.9, 0.1)
  assert.ok(tireSmokeEmissionRate(frontPush, 10, 'front-right') > 0)
  assert.equal(tireSmokeEmissionRate(frontPush, 10, 'rear-right'), 0)
})
