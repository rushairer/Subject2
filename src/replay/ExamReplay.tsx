import type { ReactElement } from 'react'
import { CURVE_CENTERLINE, CURVE_DRIVING } from '../subject2/CurveDrivingCourse'
import { REVERSE_PARKING_GEOMETRY } from '../subject2/ReverseParkingCourse'
import { RIGHT_ANGLE_GEOMETRY } from '../subject2/RightAngleCourse'
import { SIDE_PARKING_GEOMETRY } from '../subject2/SideParkingCourse'
import { SLOPE_GEOMETRY } from '../subject2/SlopeStartCourse'
import { SUBJECT3_ROUTE } from '../subject3/subject3Route'
import { toReplayLocal, type ReplayPoint } from './replayGeometry'

export interface TrajectorySample {
  t: number
  x: number
  z: number
  speed: number
  gear: number
  heading: number
  project: string
}

export interface ReplayInfraction {
  id: string
  title: string
  points: number
  fatal?: boolean
  t?: number
  x?: number
  z?: number
  project?: string
}

type ReferenceKind = 'boundary' | 'control' | 'guide'

interface ReferenceLine {
  points: ReplayPoint[]
  kind: ReferenceKind
}

function projectLabel(project: string) {
  const labels: Record<string, string> = {
    'reverse-parking': '倒车入库',
    'side-parking': '侧方停车',
    'slope-start': '坡道定点停车和起步',
    'curve-driving': '曲线行驶',
    'right-angle': '直角转弯',
    'subject3': '科目三道路驾驶',
  }
  return labels[project] ?? project
}

function pathStats(samples: TrajectorySample[]) {
  let distance = 0
  let maxSpeed = 0
  for (let i = 0; i < samples.length; i++) {
    maxSpeed = Math.max(maxSpeed, Math.abs(samples[i].speed) * 3.6)
    if (i > 0) distance += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z)
  }
  const duration = samples.length > 1 ? samples[samples.length - 1].t - samples[0].t : 0
  return { distance, maxSpeed, duration }
}

function rectangle(x1: number, x2: number, z1: number, z2: number): ReplayPoint[] {
  return [
    { x: x1, z: z1 },
    { x: x2, z: z1 },
    { x: x2, z: z2 },
    { x: x1, z: z2 },
    { x: x1, z: z1 },
  ]
}

function offsetPolyline(points: ReplayPoint[], offset: number): ReplayPoint[] {
  return points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)]
    const next = points[Math.min(points.length - 1, index + 1)]
    const tx = next.x - previous.x
    const tz = next.z - previous.z
    const length = Math.hypot(tx, tz) || 1
    const rightX = -tz / length
    const rightZ = tx / length
    return {
      x: point.x + rightX * offset,
      z: point.z + rightZ * offset,
    }
  })
}

function referenceLinesForProject(project: string): ReferenceLine[] {
  if (project === 'reverse-parking') {
    const g = REVERSE_PARKING_GEOMETRY
    return [
      { points: rectangle(-g.laneHalf, g.laneHalf, -g.laneEndZ, g.laneEndZ), kind: 'boundary' },
      { points: rectangle(g.bayMouthX, g.bayBackX, -g.bayHalf, g.bayHalf), kind: 'boundary' },
      { points: [{ x: -g.laneHalf, z: g.startControlZ }, { x: g.laneHalf, z: g.startControlZ }], kind: 'control' },
      { points: [{ x: -g.laneHalf, z: g.oppositeControlZ }, { x: g.laneHalf, z: g.oppositeControlZ }], kind: 'control' },
    ]
  }

  if (project === 'side-parking') {
    const g = SIDE_PARKING_GEOMETRY
    return [
      { points: rectangle(-g.laneHalf, g.laneHalf, g.laneEndZ, g.laneStartZ), kind: 'boundary' },
      { points: rectangle(g.bayMouthX, g.bayBackX, -g.bayHalfLength, g.bayHalfLength), kind: 'boundary' },
    ]
  }

  if (project === 'right-angle') {
    const g = RIGHT_ANGLE_GEOMETRY
    return [
      { points: rectangle(-g.half, g.half, g.cornerCenterZ - g.half, g.entryMaxZ), kind: 'boundary' },
      { points: rectangle(g.horizontalMinX, g.half, g.cornerCenterZ - g.half, g.cornerCenterZ + g.half), kind: 'boundary' },
    ]
  }

  if (project === 'slope-start') {
    const g = SLOPE_GEOMETRY
    return [
      { points: rectangle(-g.roadHalf, g.roadHalf, g.roadEndZ, g.roadStartZ), kind: 'boundary' },
      { points: [{ x: -g.roadHalf, z: g.stopLineZ }, { x: g.roadHalf, z: g.stopLineZ }], kind: 'control' },
    ]
  }

  if (project === 'curve-driving') {
    const half = CURVE_DRIVING.roadWidth / 2
    return [
      { points: offsetPolyline(CURVE_CENTERLINE, half), kind: 'boundary' },
      { points: offsetPolyline(CURVE_CENTERLINE, -half), kind: 'boundary' },
      { points: CURVE_CENTERLINE, kind: 'guide' },
    ]
  }

  if (project === 'subject3') {
    return [{ points: SUBJECT3_ROUTE, kind: 'guide' }]
  }

  return []
}

function PathMap({
  project,
  samples,
  infractions,
}: {
  project: string
  samples: TrajectorySample[]
  infractions: ReplayInfraction[]
}) {
  const width = 640
  const height = 310
  const margin = 30

  const first = samples[0]
  const frame = { originX: first.x, originZ: first.z, heading: first.heading }
  const localSamples = samples.map(sample => ({
    ...sample,
    ...toReplayLocal(sample, frame),
  }))
  const localReferences = referenceLinesForProject(project).map(line => ({
    ...line,
    points: line.points.map(point => toReplayLocal(point, frame)),
  }))

  const allPoints = [
    ...localSamples.map(({ x, z }) => ({ x, z })),
    ...localReferences.flatMap(line => line.points),
  ]
  const xs = allPoints.map(item => item.x)
  const zs = allPoints.map(item => item.z)
  const rawMinX = Math.min(...xs)
  const rawMaxX = Math.max(...xs)
  const rawMinZ = Math.min(...zs)
  const rawMaxZ = Math.max(...zs)
  const rangeX = Math.max(4, rawMaxX - rawMinX)
  const rangeZ = Math.max(4, rawMaxZ - rawMinZ)
  const centerX = (rawMinX + rawMaxX) / 2
  const centerZ = (rawMinZ + rawMaxZ) / 2
  const minX = centerX - rangeX / 2
  const minZ = centerZ - rangeZ / 2
  const scale = Math.min((width - margin * 2) / rangeX, (height - margin * 2) / rangeZ)
  const offsetX = (width - rangeX * scale) / 2
  const offsetY = (height - rangeZ * scale) / 2
  const mapPoint = (x: number, z: number) => [
    offsetX + (x - minX) * scale,
    height - (offsetY + (z - minZ) * scale),
  ] as const

  const points = localSamples.map(item => mapPoint(item.x, item.z).join(',')).join(' ')
  const start = mapPoint(localSamples[0].x, localSamples[0].z)
  const end = mapPoint(localSamples[localSamples.length - 1].x, localSamples[localSamples.length - 1].z)

  return <svg className="replay-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="本次驾驶轨迹俯视图；屏幕上方为车辆初始前进方向">
    <rect x="0" y="0" width={width} height={height} rx="18" className="replay-map-bg" />

    {localReferences.map((line, index) => (
      <polyline
        key={`${line.kind}-${index}`}
        points={line.points.map(point => mapPoint(point.x, point.z).join(',')).join(' ')}
        className={`replay-reference ${line.kind}`}
      />
    ))}

    <polyline points={points} className="replay-path-shadow" />
    <polyline points={points} className="replay-path" />

    <line x1={start[0]} y1={start[1] - 8} x2={start[0]} y2={start[1] - 23} className="replay-start-heading" />
    <path d={`M ${start[0] - 4} ${start[1] - 20} L ${start[0]} ${start[1] - 27} L ${start[0] + 4} ${start[1] - 20} Z`} className="replay-start-heading-arrow" />

    <circle cx={start[0]} cy={start[1]} r="6" className="replay-start" />
    <circle cx={end[0]} cy={end[1]} r="6" className="replay-end" />

    {infractions.filter(item => item.x != null && item.z != null).map(item => {
      const local = toReplayLocal({ x: item.x!, z: item.z! }, frame)
      const [x, y] = mapPoint(local.x, local.z)
      return <g key={item.id + String(item.t)}>
        <circle cx={x} cy={y} r="8" className={item.fatal ? 'replay-error fatal' : 'replay-error'} />
        <circle cx={x} cy={y} r="3" className="replay-error-core" />
      </g>
    })}

    <g className="replay-orientation" transform="translate(18 18)">
      <rect x="0" y="0" width="100" height="45" rx="9" />
      <text x="10" y="18">↑ 初始车头</text>
      <text x="10" y="35">左 ←　→ 右</text>
    </g>
  </svg>
}

function ReplayLegend() {
  return <div className="replay-legend" aria-label="轨迹图例">
    <span><i className="replay-legend-dot start" />起点</span>
    <span><i className="replay-legend-dot end" />终点</span>
    <span><i className="replay-legend-dot error" />扣分位置</span>
    <span><i className="replay-legend-dot fatal" />不合格位置</span>
  </div>
}

export function ExamReplay({
  samples,
  infractions,
}: {
  samples: TrajectorySample[]
  infractions: ReplayInfraction[]
}): ReactElement | null {
  if (samples.length < 2) return null

  const projects = Array.from(new Set(samples.map(item => item.project)))

  return <section className="replay-section">
    <div className="replay-heading">
      <div>
        <div className="eyebrow">DRIVING REPLAY</div>
        <h3>驾驶轨迹复盘</h3>
      </div>
      <ReplayLegend />
    </div>

    <div className="replay-projects">
      {projects.map(project => {
        const projectSamples = samples.filter(item => item.project === project)
        if (projectSamples.length < 2) return null
        const projectInfractions = infractions.filter(item => item.project === project)
        const stats = pathStats(projectSamples)
        return <article className="replay-project" key={project}>
          <div className="replay-project-title">
            <strong>{projectLabel(project)}</strong>
            <div>
              <span>{stats.distance >= 1000 ? `${(stats.distance / 1000).toFixed(2)} km` : `${Math.round(stats.distance)} m`}</span>
              <span>最高 {Math.round(stats.maxSpeed)} km/h</span>
              <span>{Math.round(stats.duration)} s</span>
            </div>
          </div>
          <PathMap project={project} samples={projectSamples} infractions={projectInfractions} />
        </article>
      })}
    </div>

    <div className="replay-timeline">
      <h3>错误时间轴</h3>
      {infractions.length === 0
        ? <p>本次没有扣分事件。</p>
        : [...infractions]
            .sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
            .map(item => <div className="replay-event" key={item.id + String(item.t)}>
              <time>{item.t != null ? `${item.t.toFixed(1)}s` : '--'}</time>
              <div>
                <strong>{item.title}</strong>
                <span>{item.project ? projectLabel(item.project) : '驾驶过程'}</span>
              </div>
              <b>{item.fatal ? '不合格' : `-${item.points}`}</b>
            </div>)}
    </div>
  </section>
}
