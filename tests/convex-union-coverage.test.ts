import assert from 'node:assert/strict'
import test from 'node:test'
import { polygonTouchesOutsideConvexUnion } from '../src/sim/planarGeometry'
import { vehicleBodyFootprint } from '../src/sim/vehicleFootprint'
import type { XZVector } from '../src/sim/vehicleFrame'
import { localPointToWorld } from '../src/subject2/courseTransform'

const rectangle = (minX: number, maxX: number, minZ: number, maxZ: number): XZVector[] => [
  { x: minX, z: minZ }, { x: maxX, z: minZ },
  { x: maxX, z: maxZ }, { x: minX, z: maxZ },
]

test('convex union accepts one containing region with either polygon winding', () => {
  const car = vehicleBodyFootprint({ x: 0, z: 0, heading: Math.PI / 7 })
  const ground = rectangle(-5, 5, -5, 5)
  assert.equal(polygonTouchesOutsideConvexUnion(car, [ground]), false)
  assert.equal(polygonTouchesOutsideConvexUnion(car, [[...ground].reverse()]), false)
  assert.equal(polygonTouchesOutsideConvexUnion([...car].reverse(), [ground]), false)
})

test('adjacent and overlapping rotated regions cover a car spanning an internal seam', () => {
  const polygon = rectangle(-1, 1, -2, 2)
  const variants = [
    [rectangle(-2, 0, -3, 3), rectangle(0, 2, -3, 3)],
    [rectangle(-2, 0.2, -3, 3), rectangle(-0.2, 2, -3, 3)],
  ]
  for (const heading of [0, Math.PI / 2, -Math.PI / 3, 0.781]) {
    const placement = { x: 307.049, z: -1240.297, heading }
    const worldPolygon = polygon.map(point => localPointToWorld(point, placement))
    for (const regions of variants) {
      const worldRegions = regions.map(region => region.map(point => localPointToWorld(point, placement)))
      assert.equal(polygonTouchesOutsideConvexUnion(worldPolygon, worldRegions), false)
      assert.equal(polygonTouchesOutsideConvexUnion(worldPolygon, [...worldRegions].reverse()), false)
    }
  }
})

test('coverage detects an interior missing patch even when every body corner is legal', () => {
  const car = rectangle(-1, 1, -2, 2)
  const ground = [
    rectangle(-2, -0.2, -3, 3), rectangle(0.2, 2, -3, 3),
    rectangle(-2, 2, -3, -0.3), rectangle(-2, 2, 0.3, 3),
  ]
  assert.ok(car.every(point => ground.some(region =>
    point.x >= region[0].x && point.x <= region[1].x
    && point.z >= region[0].z && point.z <= region[2].z)))
  assert.equal(polygonTouchesOutsideConvexUnion(car, ground), true)
})

test('L-shaped ground union catches an edge crossing the notch despite safe corners', () => {
  const polygon = [
    { x: -2, z: -0.8 }, { x: -0.8, z: -2 },
    { x: 2, z: 0.8 }, { x: 0.8, z: 2 },
  ]
  const regions = [rectangle(-3, 3, -3, 0.9), rectangle(-3, 0.9, -3, 3)]
  assert.ok(polygon.every(point => point.x <= 0.9 || point.z <= 0.9))
  assert.equal(polygonTouchesOutsideConvexUnion(polygon, regions), true)
})

test('an independently rotated connection rectangle fills the gap between ground pads', () => {
  const car = vehicleBodyFootprint({ x: 0, z: 0, heading: Math.PI / 4 })
  const connection = rectangle(-1.2, 1.2, -6, 6).map(point => localPointToWorld(point, {
    x: 0, z: 0, heading: Math.PI / 4,
  }))
  const pads = [rectangle(-8, -1, -8, 8), rectangle(1, 8, -8, 8)]
  assert.equal(polygonTouchesOutsideConvexUnion(car, pads), true)
  assert.equal(polygonTouchesOutsideConvexUnion(car, [...pads, connection]), false)
})

test('exact outer-edge contact is contained while a one-millimetre escape remains outside', () => {
  const ground = rectangle(-1, 1, -2, 2)
  assert.equal(polygonTouchesOutsideConvexUnion(ground, [ground]), false)
  const outside = ground.map(point => ({ x: point.x + 0.001, z: point.z }))
  assert.equal(polygonTouchesOutsideConvexUnion(outside, [ground]), true)
})

test('microscopic seam area is tolerated without erasing a physically meaningful gap', () => {
  const car = rectangle(-1, 1, -2, 2)
  const regionsWithGap = (gap: number) => [
    rectangle(-2, -gap / 2, -3, 3), rectangle(gap / 2, 2, -3, 3),
  ]
  assert.equal(polygonTouchesOutsideConvexUnion(car, regionsWithGap(1e-10)), false)
  assert.equal(polygonTouchesOutsideConvexUnion(car, regionsWithGap(0.001)), true)
  assert.equal(polygonTouchesOutsideConvexUnion(car, regionsWithGap(1e-6), 1e-8), true)
  assert.equal(polygonTouchesOutsideConvexUnion(car, regionsWithGap(1e-6), 0), true)
})

test('tiny residual fragments accumulate against one total area tolerance', () => {
  const car = rectangle(-1, 1, -2, 2)
  const gap = 1e-9
  const regions = [
    rectangle(-2, -0.5, -3, 3),
    rectangle(-0.5 + gap, 0, -3, 3),
    rectangle(gap, 0.5, -3, 3),
    rectangle(0.5 + gap, 2, -3, 3),
  ]
  // Each 4e-9 m² seam is below tolerance; their 12e-9 m² sum is above it.
  assert.equal(polygonTouchesOutsideConvexUnion(car, regions, 1e-8), true)
})

test('overlapping secondary regions never invalidate containment under large translations', () => {
  const car = vehicleBodyFootprint({ x: 0, z: 0, heading: 1.604 })
  const regions = [rectangle(-4, 4, -4, 4), rectangle(-10, 0.2, -0.7, 0.8), rectangle(-0.3, 10, -0.6, 0.9)]
  const placement = { x: 1e6 + 0.049, z: -1e6 - 0.297, heading: -0.37 }
  assert.equal(polygonTouchesOutsideConvexUnion(
    car.map(point => localPointToWorld(point, placement)),
    regions.map(region => region.map(point => localPointToWorld(point, placement))),
  ), false)
})

test('no legal region and degenerate inputs fail closed without counting zero-area coverage', () => {
  const car = rectangle(-1, 1, -2, 2)
  assert.equal(polygonTouchesOutsideConvexUnion(car, []), true)
  assert.equal(polygonTouchesOutsideConvexUnion(car, [[{ x: 0, z: 0 }, { x: 1, z: 0 }]]), true)
  assert.equal(polygonTouchesOutsideConvexUnion([], [car]), true)
  assert.equal(polygonTouchesOutsideConvexUnion([{ x: 0, z: 0 }], [car]), true)
})
