/**
 * Surface presets for optional grip training. The coefficients are simulator
 * tuning parameters, not measured road/tyre values or exam requirements.
 * The historical dry preset must preserve existing C1/C2 physics baselines.
 */
import { aquaplaningSeverity } from './rainWater'
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
  rain: {
    label: '暴雨积水',
    frictionCoefficient: 0.62,
    description: '动态积水与速度相关的水滑风险；仅供进阶训练',
  },
} as const

export type RoadSurfaceId = keyof typeof ROAD_SURFACES

export const ROAD_SURFACE_IDS: readonly RoadSurfaceId[] = [
  'dry', 'wet', 'lowGrip', 'rain',
]

export function roadSurfaceFriction(surface: RoadSurfaceId = 'dry'): number {
  return ROAD_SURFACES[surface].frictionCoefficient
}

export function relativeRoadGrip(surface: RoadSurfaceId = 'dry'): number {
  return roadSurfaceFriction(surface) / roadSurfaceFriction('dry')
}

/**
 * Rain uses the established wet road baseline plus a bounded loss of tire
 * contact as speed and standing water rise. All legacy presets are identical
 * to their previous coefficients, regardless of the supplied water fields.
 */
export function effectiveRoadFriction(
  surface: RoadSurfaceId = 'dry',
  groundSpeedMps = 0,
  localWaterDepthMm = 0,
): number {
  const baseline = roadSurfaceFriction(surface)
  if (surface !== 'rain') return baseline
  return baseline * (1 - 0.77 * aquaplaningSeverity(groundSpeedMps, localWaterDepthMm))
}
