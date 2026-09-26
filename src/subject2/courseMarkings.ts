import type { AxisAlignedRect } from '../sim/wheelContact'

export const SUBJECT2_BOUNDARY_LINE_WIDTH_METERS = 0.12

export function subject2LineRect(
  x: number,
  z: number,
  width: number,
  depth: number,
): AxisAlignedRect {
  return {
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
  }
}
