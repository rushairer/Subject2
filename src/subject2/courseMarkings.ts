import type { AxisAlignedRect } from '../sim/wheelContact'

// GA 1029-2022 6.2.7.1: ordinary Subject 2 project figure lines are 150 mm ± 5 mm.\nexport const SUBJECT2_BOUNDARY_LINE_WIDTH_METERS = 0.15

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
