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

function polygonAxes(points: readonly XZVector[]) {
  const axes: XZVector[] = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const edgeX = b.x - a.x
    const edgeZ = b.z - a.z
    const length = Math.hypot(edgeX, edgeZ)
    if (length <= 1e-12) continue
    axes.push({
      x: -edgeZ / length,
      z: edgeX / length,
    })
  }
  return axes
}

function projectPolygon(
  polygon: readonly XZVector[],
  axis: XZVector,
) {
  let min = Infinity
  let max = -Infinity
  for (const point of polygon) {
    const value = point.x * axis.x + point.z * axis.z
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  return { min, max }
}

/**
 * Separating-axis test for convex polygons. Exact edge/vertex contact counts
 * as intersection so rendered vehicle contact cannot slip through judging.
 */
export function convexPolygonsIntersect(
  a: readonly XZVector[],
  b: readonly XZVector[],
  touchToleranceMeters = 1e-6,
) {
  if (a.length < 3 || b.length < 3) return false
  for (const axis of [...polygonAxes(a), ...polygonAxes(b)]) {
    const pa = projectPolygon(a, axis)
    const pb = projectPolygon(b, axis)
    if (
      pa.max < pb.min - touchToleranceMeters ||
      pb.max < pa.min - touchToleranceMeters
    ) {
      return false
    }
  }
  return true
}

export interface PolygonPenetrationResult {
  intersecting: boolean
  penetration: number
  normal: XZVector
}

/**
 * Calculates penetration depth and separation normal (pointing from B to A)
 * between two intersecting convex polygons using SAT.
 */
export function convexPolygonPenetration(
  a: readonly XZVector[],
  b: readonly XZVector[],
  touchToleranceMeters = 1e-6,
): PolygonPenetrationResult {
  if (a.length < 3 || b.length < 3) {
    return { intersecting: false, penetration: 0, normal: { x: 0, z: 0 } }
  }

  let minOverlap = Infinity
  let bestAxis: XZVector = { x: 0, z: 0 }

  for (const axis of [...polygonAxes(a), ...polygonAxes(b)]) {
    const pa = projectPolygon(a, axis)
    const pb = projectPolygon(b, axis)
    if (
      pa.max < pb.min - touchToleranceMeters ||
      pb.max < pa.min - touchToleranceMeters
    ) {
      return { intersecting: false, penetration: 0, normal: { x: 0, z: 0 } }
    }

    const overlap = Math.min(pa.max - pb.min, pb.max - pa.min)
    if (overlap < minOverlap) {
      minOverlap = overlap
      bestAxis = axis
    }
  }

  let centerAx = 0
  let centerAz = 0
  for (const p of a) {
    centerAx += p.x
    centerAz += p.z
  }
  centerAx /= a.length
  centerAz /= a.length

  let centerBx = 0
  let centerBz = 0
  for (const p of b) {
    centerBx += p.x
    centerBz += p.z
  }
  centerBx /= b.length
  centerBz /= b.length

  const dirX = centerAx - centerBx
  const dirZ = centerAz - centerBz
  const sign = dirX * bestAxis.x + dirZ * bestAxis.z < 0 ? -1 : 1

  return {
    intersecting: true,
    penetration: Math.max(0, minOverlap),
    normal: {
      x: bestAxis.x * sign,
      z: bestAxis.z * sign,
    },
  }
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

  // Fast-path exact containment in one convex rectangle. Besides avoiding
  // unnecessary clipping work, this prevents floating-point seam noise when
  // overlapping route rectangles subdivide a body that is already wholly
  // inside a single legal road rectangle.
  const coordinateTolerance = 1e-10
  if (legalRects.some(rect =>
    polygon.every(point =>
      point.x >= rect.minX - coordinateTolerance &&
      point.x <= rect.maxX + coordinateTolerance &&
      point.z >= rect.minZ - coordinateTolerance &&
      point.z <= rect.maxZ + coordinateTolerance
    )
  )) {
    return false
  }

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

  // Clipping a polygon across many internal rectangle seams accumulates
  // tiny floating-point area error. Keep the tolerance many orders of
  // magnitude below any physically meaningful tire/body overlap while
  // scaling it with polygon area.
  const areaTolerance = Math.max(1e-9, totalArea * 1e-9)
  return coveredArea < totalArea - areaTolerance
}
