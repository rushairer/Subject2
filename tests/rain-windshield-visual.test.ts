import assert from 'node:assert/strict'
import test from 'node:test'
import { createRainWaterState, advanceRainWater, localRainWaterDepthMm } from '../src/sim/rainWater'
import { RAIN_PUDDLES, rainPuddlesNear } from '../src/sim/rainPuddles'
import {
  FRONT_WINDSHIELD, WINDSHIELD_HEIGHT,
  frontWindshieldPoint,
} from '../src/cockpit/windshieldGeometry'
import {
  WINDSHIELD_WIPERS,
  windshieldWiperStrokes,
  wiperSweepPosition,
  wiperGlassPoint,
  isGlassDropBeingWiped,
} from '../src/cockpit/windshieldWipers'

test('puddle decals use exactly the world-space local depth field owned by physics', () => {
  const water = createRainWaterState()
  const puddles = rainPuddlesNear(water, 0, 0)
  assert.ok(puddles.length > 0)
  assert.ok(puddles.length <= (2 * RAIN_PUDDLES.visibleCellRadius + 1) ** 2)
  for (const puddle of puddles) {
    assert.equal(puddle.depthMm,
      localRainWaterDepthMm(water, puddle.x, puddle.z))
    assert.ok(puddle.depthMm > RAIN_PUDDLES.minimumDepthMm)
    assert.ok(puddle.radiusX > 0 && puddle.radiusZ > 0)
    assert.ok(puddle.intensity >= 0 && puddle.intensity <= 1)
  }
})

test('world-anchored pools do not jump when a vehicle moves inside one cell', () => {
  const state = createRainWaterState()
  const first = rainPuddlesNear(state, 1, -2)
  const moved = rainPuddlesNear(state, 2, -1)
  assert.deepEqual(first, moved)
  assert.deepEqual(rainPuddlesNear(state, 1, -2), first)
  assert.deepEqual(rainPuddlesNear(state, Number.NaN, 1), [])
})

test('increasing true pooled water expands existing decals, never reducing their size', () => {
  const water = createRainWaterState()
  const before = rainPuddlesNear(water, 0, 0)
  advanceRainWater(water, 160)
  const after = rainPuddlesNear(water, 0, 0)
  assert.ok(after.length >= before.length)
  const byPosition = new Map(after.map(p => [`${p.x}:${p.z}`, p]))
  for (const puddle of before) {
    const enlarged = byPosition.get(`${puddle.x}:${puddle.z}`)
    assert.ok(enlarged, 'existing physical pool has disappeared')
    assert.ok(enlarged!.depthMm >= puddle.depthMm)
    assert.ok(enlarged!.radiusX >= puddle.radiusX)
    assert.ok(enlarged!.radiusZ >= puddle.radiusZ)
  }
})

test('wiper glass points share exact Santana production windshield endpoints', () => {
  assert.deepEqual(frontWindshieldPoint(0, 0), [
    0, FRONT_WINDSHIELD.lowerY, FRONT_WINDSHIELD.lowerZ,
  ])
  assert.deepEqual(frontWindshieldPoint(0, WINDSHIELD_HEIGHT), [
    0, FRONT_WINDSHIELD.upperY, FRONT_WINDSHIELD.upperZ,
  ])
  const outsideLeft = frontWindshieldPoint(-12, WINDSHIELD_HEIGHT)
  assert.equal(outsideLeft[0], -FRONT_WINDSHIELD.upperHalfWidth)
  const inward = frontWindshieldPoint(0, 0.2, 0.03)
  assert.ok(inward[2] > frontWindshieldPoint(0, 0.2)[2],
    'droplets are positioned on the driver's side of the glass')
})

test('physical wiper arms and rubber blades stay on the glass at every sweep stage', () => {
  for (let t = 0; t <= 100; t += 1) {
    const strokes = windshieldWiperStrokes(t / 100)
    assert.equal(strokes.length, 2)
    for (const stroke of strokes) {
      for (const point of [
        stroke.pivot, stroke.armEnd, stroke.bladeStart, stroke.bladeEnd,
      ]) {
        assert.ok(point.y > 0 && point.y < WINDSHIELD_HEIGHT)
        const maxHalfWidth = FRONT_WINDSHIELD.lowerHalfWidth +
          (FRONT_WINDSHIELD.upperHalfWidth - FRONT_WINDSHIELD.lowerHalfWidth) *
            point.y / WINDSHIELD_HEIGHT
        assert.ok(Math.abs(point.x) < maxHalfWidth,
          `wiper left glass at ${point.x}m, ${point.y}m`)
        assert.ok(wiperGlassPoint(point).every(Number.isFinite))
      }
    }
  }
})

test('off wipers remain parked; slow and fast sweep with distinct physical periods', () => {
  assert.equal(wiperSweepPosition('off', 10), 0)
  assert.equal(wiperSweepPosition('off', Number.NaN), 0)
  assert.equal(wiperSweepPosition('slow', 0), 0)
  assert.equal(wiperSweepPosition('fast', 0), 0)
  assert.ok(wiperSweepPosition('slow', WINDSHIELD_WIPERS.slowCycleSeconds / 2) > 0.99)
  assert.ok(wiperSweepPosition('fast', WINDSHIELD_WIPERS.fastCycleSeconds / 2) > 0.99)
  assert.ok(wiperSweepPosition('fast', 0.33) >
    wiperSweepPosition('slow', 0.33))
  assert.ok(Math.abs(wiperSweepPosition('fast', WINDSHIELD_WIPERS.fastCycleSeconds)) < 1e-9)
  assert.deepEqual(windshieldWiperStrokes(-42), windshieldWiperStrokes(0))
})

test('wiper clears only droplets in its real blade footprint, preserving side glass', () => {
  const strokes = windshieldWiperStrokes(0.7)
  for (const stroke of strokes) {
    const center = {
      x: (stroke.bladeStart.x + stroke.bladeEnd.x) / 2,
      y: (stroke.bladeStart.y + stroke.bladeEnd.y) / 2,
    }
    assert.ok(isGlassDropBeingWiped(center, strokes))
  }
  assert.equal(isGlassDropBeingWiped({ x: 0.79, y: 0.52 }, strokes), false)
  assert.equal(isGlassDropBeingWiped({ x: 0, y: -0.2 }, strokes), false)
  assert.equal(isGlassDropBeingWiped({ x: Number.NaN, y: 0.3 }, strokes), false)
})
