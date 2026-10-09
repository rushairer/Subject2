/**
 * Surface presets for optional grip training. The coefficients are simulator
 * tuning parameters, not measured road/tyre values or exam requirements.
 * The historical dry preset must preserve existing C1/C2 physics baselines.
 */
export const ROAD_SURFACES = {
  dry: {
    label: '干燥路面',
    frictionCoefficient: 0.92,
    description: '标准考试与教练示范基线',
  },
  wet: {
    label: '潮湿路面',
    frictionCoefficient: 0.62,
    description: '减小轮胎附着，练习提前减速和柔和转向',
  },
  lowGrip: {
    label: '低附着路面',
    frictionCoefficient: 0.38,
    description: '进阶稳定性训练；不能等同于具体雨雪道路的实测参数',
  },
} as const

export type RoadSurfaceId = keyof typeof ROAD_SURFACES

export const ROAD_SURFACE_IDS: readonly RoadSurfaceId[] = [
  'dry', 'wet', 'lowGrip',
]

export function roadSurfaceFriction(surface: RoadSurfaceId = 'dry'): number {
  return ROAD_SURFACES[surface].frictionCoefficient
}

export function relativeRoadGrip(surface: RoadSurfaceId = 'dry'): number {
  return roadSurfaceFriction(surface) / roadSurfaceFriction('dry')
}
