import assert from 'node:assert/strict'
import test from 'node:test'
import { createRainWaterState, advanceRainWater, localRainWaterDepthMm } from '../src/sim/rainWater'
import { RAIN_PUDDLES, rainPuddleSamplingKey, rainPuddlesNear } from '../src/sim/rainPuddles'
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
  isGlassDropWipedDuringSweep,
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
    "droplets are positioned on the driver-side surface of the glass")
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


test('water depth tiers produce no false pools, sparse shallow pools and broader deep reflections', () => {
  const water = createRainWaterState()
  const summaries = [0.5, 2.4, 5, 8].map(depth => {
    water.averageDepthMm = depth
    const pools = rainPuddlesNear(water, 0, 0)
    return {
      count: pools.length,
      area: pools.reduce((sum, p) => sum + Math.PI * p.radiusX * p.radiusZ, 0),
      brightness: pools.reduce((sum, p) => sum + p.intensity, 0),
    }
  })
  assert.equal(summaries[0].count, 0)
  assert.ok(summaries[1].count > 0)
  assert.ok(summaries[2].count >= summaries[1].count)
  assert.ok(summaries[3].count >= summaries[2].count)
  for (let i = 2; i < summaries.length; i += 1) {
    assert.ok(summaries[i].area > summaries[i - 1].area)
    assert.ok(summaries[i].brightness > summaries[i - 1].brightness)
  }
})

test('puddle instance cache invalidates only on meaningful water change or world-grid crossing', () => {
  const water = createRainWaterState()
  const key = rainPuddleSamplingKey(water, 1, 1)
  assert.equal(rainPuddleSamplingKey(water, 2, 2), key)
  water.averageDepthMm += 0.005
  assert.equal(rainPuddleSamplingKey(water, 1, 1), key)
  water.averageDepthMm += 0.2
  assert.notEqual(rainPuddleSamplingKey(water, 1, 1), key)
  assert.notEqual(rainPuddleSamplingKey(water, 8, 1), rainPuddleSamplingKey(water, 1, 1))
  assert.equal(rainPuddleSamplingKey(water, Number.NaN, 1), null)
})

test('continuous blade arc clears an intermediate drop missed by endpoint-only samples', () => {
  const mid = windshieldWiperStrokes(0.48)[0]
  const point = {
    x: (mid.bladeStart.x + mid.bladeEnd.x) / 2,
    y: (mid.bladeStart.y + mid.bladeEnd.y) / 2,
  }
  assert.equal(isGlassDropBeingWiped(point, windshieldWiperStrokes(0.05)), false)
  assert.equal(isGlassDropBeingWiped(point, windshieldWiperStrokes(0.9)), false)
  assert.ok(isGlassDropWipedDuringSweep(point, 0.05, 0.9))
  assert.ok(isGlassDropWipedDuringSweep(point, 0.9, 0.05))
  assert.equal(isGlassDropWipedDuringSweep({ x: 0.79, y: 0.52 }, 0, 1), false)
  assert.equal(isGlassDropWipedDuringSweep({ x: Number.NaN, y: 0.3 }, 0, 1), false)
})

test('fast wipers clear the same physical target at 30 and 60 FPS', () => {
  const stroke = windshieldWiperStrokes(0.58)[0]
  const point = {
    x: (stroke.bladeStart.x + stroke.bladeEnd.x) / 2,
    y: (stroke.bladeStart.y + stroke.bladeEnd.y) / 2,
  }
  for (const hz of [30, 60]) {
    let previous = 0
    let cleared = false
    for (let index = 1; index <= hz; index += 1) {
      const phase = wiperSweepPosition('fast', index / hz)
      cleared ||= isGlassDropWipedDuringSweep(point, previous, phase)
      previous = phase
    }
    assert.ok(cleared, `fast sweep must clear target even at ${hz} FPS`)
  }
})
