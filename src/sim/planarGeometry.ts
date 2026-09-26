import type { XZVector } from './vehicleFrame'

export interface AxisAlignedRect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export function polygonArea(points: readonly XZVector[]) {
  let twiceArea = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    twiceArea += a.x * b.z - b.x * a.z
  }
  return Math.abs(twiceArea) / 2
}

type Boundary = {
  inside(point: XZVector): boolean
  intersect(a: XZVector, b: XZVector): XZVector
}

function clipPolygon(
  polygon: readonly XZVector[],
  boundary: Boundary,
): XZVector[] {
  if (polygon.length === 0) return []
  const output: XZVector[] = []
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i]
    const previous = polygon[(i + polygon.length - 1) % polygon.length]
    const currentInside = boundary.inside(current)
    const previousInside = boundary.inside(previous)

    if (currentInside) {
      if (!previousInside) output.push(boundary.intersect(previous, current))
      output.push(current)
    } else if (previousInside) {
      output.push(boundary.intersect(previous, current))
    }
  }
  return output
}

export function clipPolygonToRect(
  polygon: readonly XZVector[],
  rect: AxisAlignedRect,
) {
  let result = [...polygon]
  const boundaries: Boundary[] = [
    {
      inside: p => p.x >= rect.minX,
      intersect: (a, b) => {
        const t = (rect.minX - a.x) / (b.x - a.x)
        return { x: rect.minX, z: a.z + (b.z - a.z) * t }
      },
    },
    {
      inside: p => p.x <= rect.maxX,
      intersect: (a, b) => {
        const t = (rect.maxX - a.x) / (b.x - a.x)
        return { x: rect.maxX, z: a.z + (b.z - a.z) * t }
      },
    },
    {
      inside: p => p.z >= rect.minZ,
      intersect: (a, b) => {
        const t = (rect.minZ - a.z) / (b.z - a.z)
        return { x: a.x + (b.x - a.x) * t, z: rect.minZ }
      },
    },
    {
      inside: p => p.z <= rect.maxZ,
      intersect: (a, b) => {
        const t = (rect.maxZ - a.z) / (b.z - a.z)
        return { x: a.x + (b.x - a.x) * t, z: rect.maxZ }
      },
    },
  ]

  for (const boundary of boundaries) {
    result = clipPolygon(result, boundary)
    if (result.length === 0) break
  }
  return result
}

export function polygonIntersectsAxisAlignedRect(
  polygon: readonly XZVector[],
  rect: AxisAlignedRect,
  touchToleranceMeters = 1e-6,
) {
  const expanded = {
    minX: rect.minX - touchToleranceMeters,
    maxX: rect.maxX + touchToleranceMeters,
    minZ: rect.minZ - touchToleranceMeters,
    maxZ: rect.maxZ + touchToleranceMeters,
  }
  return polygonArea(clipPolygonToRect(polygon, expanded)) > 1e-12
}

function uniqueSorted(values: number[]) {
  return [...new Set(values)].sort((a, b) => a - b)
}

/**
 * Exact polygon-area coverage against a union of axis-aligned rectangles.
 *
 * Rect boundaries are split into disjoint cells first, avoiding overlap
 * double-counting. A positive clearance shrinks the legal region so an exact
 * touch can be treated as outside where the caller's rule requires that.
 */
export function polygonTouchesOutsideRectUnion(
  polygon: readonly XZVector[],
  rects: readonly AxisAlignedRect[],
  boundaryClearanceMeters = 1e-6,
) {
  const legalRects = rects
    .map(rect => ({
      minX: rect.minX + boundaryClearanceMeters,
      maxX: rect.maxX - boundaryClearanceMeters,
      minZ: rect.minZ + boundaryClearanceMeters,
      maxZ: rect.maxZ - boundaryClearanceMeters,
    }))
    .filter(rect => rect.minX < rect.maxX && rect.minZ < rect.maxZ)

  const totalArea = polygonArea(polygon)
  if (totalArea <= 0 || legalRects.length === 0) return true

  const xs = uniqueSorted(legalRects.flatMap(rect => [rect.minX, rect.maxX]))
  const zs = uniqueSorted(legalRects.flatMap(rect => [rect.minZ, rect.maxZ]))

  let coveredArea = 0
  for (let xi = 0; xi < xs.length - 1; xi++) {
    const minX = xs[xi]
    const maxX = xs[xi + 1]
    const centerX = (minX + maxX) / 2
    for (let zi = 0; zi < zs.length - 1; zi++) {
      const minZ = zs[zi]
      const maxZ = zs[zi + 1]
      const centerZ = (minZ + maxZ) / 2
      const covered = legalRects.some(rect =>
        centerX >= rect.minX &&
        centerX <= rect.maxX &&
        centerZ >= rect.minZ &&
        centerZ <= rect.maxZ
      )
      if (!covered) continue
      coveredArea += polygonArea(clipPolygonToRect(
        polygon,
        { minX, maxX, minZ, maxZ },
      ))
    }
  }

  return coveredArea < totalArea - 1e-10
}
