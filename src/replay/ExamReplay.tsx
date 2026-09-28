import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { CURVE_CENTERLINE, CURVE_DRIVING } from '../subject2/CurveDrivingCourse'
import { REVERSE_PARKING_GEOMETRY } from '../subject2/ReverseParkingCourse'
import { RIGHT_ANGLE_GEOMETRY } from '../subject2/RightAngleCourse'
import { SIDE_PARKING_GEOMETRY } from '../subject2/SideParkingCourse'
import { SLOPE_GEOMETRY } from '../subject2/SlopeStartCourse'
import { SUBJECT3_ROUTE, poseAtRouteDistance } from '../subject3/subject3Route'
import {
  subject3PracticeSliceById,
  subject3PracticeSliceTitle,
  type Subject3PracticeSliceId,
} from '../subject3/subject3Practice'
import { toReplayHeading, toReplayLocal, type ReplayPoint } from './replayGeometry'
import { nearestReplaySample } from './replayContext'
import { replayDiagnosis, replayOperationSlice } from './replayDiagnosis'
import { buildReplayTrainingFocus, type ReplayTrainingFocus, type ReplayTrainingProjectId } from './replayTrainingFocus'
import { trainingPackForHabit, type TrainingPackId } from '../training/trainingPacks'
import { GearSpeedCoachingPanel } from './GearSpeedCoachingPanel'
import { FollowingDistanceCoachingPanel } from './FollowingDistanceCoachingPanel'
import { NightLightingCoachingPanel } from './NightLightingCoachingPanel'
import { SuddenBrakeCoachingPanel } from './SuddenBrakeCoachingPanel'
import { CutInResponseCoachingPanel } from './CutInResponseCoachingPanel'
import { PedestrianResponseCoachingPanel } from './PedestrianResponseCoachingPanel'
import { DrivingDynamicsTimeline } from './DrivingDynamicsTimelinePanel'
import {
  coachDeviationStats,
  coachReferencePathForReplay,
  type CoachReferencePoint,
} from './coachTrajectoryComparison'

export interface TrajectorySample {
  t: number
  x: number
  z: number
  speed: number
  gear: number
  heading: number
  project: string
  steeringWheelAngle?: number
  leftIndicator?: boolean
  rightIndicator?: boolean
  handbrake?: boolean
  automatic?: boolean
  engineOn?: boolean
  engineRpm?: number
  clutch?: number
  throttle?: number
  brake?: number
  night?: boolean
  lowBeam?: boolean
  highBeam?: boolean
  leadVehicleId?: string
  leadScenario?: 'sudden-brake'
  leadSpeedMps?: number
  leadGapMeters?: number
  leadTimeGapSeconds?: number
  leadClosingSpeedMps?: number
  leadTimeToCollisionSeconds?: number
  oncomingVehicleId?: string
  oncomingDistanceMeters?: number
  oncomingTimeToMeetSeconds?: number
  cutInHazardId?: string
  cutInConflict?: boolean
  cutInProgressDeltaMeters?: number
  cutInLateralDeltaMeters?: number
  cutInLongitudinalSpeedMps?: number
  cutInLateralSpeedMps?: number
  cutInClosingSpeedMps?: number
  cutInTimeToLongitudinalMeetSeconds?: number
  pedestrianHazardId?: string
  pedestrianConflict?: boolean
  pedestrianProgressDeltaMeters?: number
  pedestrianLateralDeltaMeters?: number
  pedestrianLateralSpeedMps?: number
  pedestrianPlanarDistanceMeters?: number
  pedestrianTimeToCrosswalkSeconds?: number
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

const PROJECT_LABELS: Record<string, string> = {
  'reverse-parking': '倒车入库',
  'side-parking': '侧方停车',
  'slope-start': '坡道定点停车和起步',
  'curve-driving': '曲线行驶',
  'right-angle': '直角转弯',
  'subject3': '科目三道路驾驶',
}

function projectLabel(project: string) {
  if (project.startsWith('transition:')) {
    const [, from, to] = project.split(':')
    return `连接道路 · ${PROJECT_LABELS[from] ?? from} → ${PROJECT_LABELS[to] ?? to}`
  }
  return PROJECT_LABELS[project] ?? project
}

function projectActionLabel(project: ReplayTrainingProjectId) {
  return ({
    'reverse-parking': '倒库',
    'side-parking': '侧方',
    'slope-start': '坡道',
    'curve-driving': 'S 弯',
    'right-angle': '直角',
    'subject3': '科目三',
  } satisfies Record<ReplayTrainingProjectId, string>)[project]
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

function referenceLinesForProject(
  project: string,
  subject3Practice?: Subject3PracticeSliceId,
): ReferenceLine[] {
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
    if (!subject3Practice) {
      return [{ points: SUBJECT3_ROUTE, kind: 'guide' }]
    }

    const slice = subject3PracticeSliceById(subject3Practice)
    const points: ReplayPoint[] = []
    const stepMeters = 5
    for (
      let progress = slice.startDistance;
      progress < slice.endDistance;
      progress += stepMeters
    ) {
      const pose = poseAtRouteDistance(progress)
      points.push({ x: pose.x, z: pose.z })
    }
    const end = poseAtRouteDistance(slice.endDistance)
    points.push({ x: end.x, z: end.z })
    return [{ points, kind: 'guide' }]
  }

  return []
}

function PathMap({
  project,
  samples,
  infractions,
  cursorIndex,
  coachReference,
  subject3Practice,
}: {
  project: string
  samples: TrajectorySample[]
  infractions: ReplayInfraction[]
  cursorIndex: number
  coachReference: CoachReferencePoint[]
  subject3Practice?: Subject3PracticeSliceId
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
  const localReferences = referenceLinesForProject(
    project,
    subject3Practice,
  ).map(line => ({
    ...line,
    points: line.points.map(point => toReplayLocal(point, frame)),
  }))
  const localCoachReference = coachReference.map(point =>
    toReplayLocal(point, frame),
  )

  const allPoints = [
    ...localSamples.map(({ x, z }) => ({ x, z })),
    ...localReferences.flatMap(line => line.points),
    ...localCoachReference,
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

  const safeCursorIndex = Math.max(0, Math.min(cursorIndex, localSamples.length - 1))
  const cursorSample = localSamples[safeCursorIndex]
  const cursorScreen = mapPoint(cursorSample.x, cursorSample.z)
  const cursorHeadingDegrees = toReplayHeading(
    samples[safeCursorIndex].heading,
    first.heading,
  ) * 180 / Math.PI
  const points = localSamples.map(item => mapPoint(item.x, item.z).join(',')).join(' ')
  const coachPoints = localCoachReference
    .map(item => mapPoint(item.x, item.z).join(','))
    .join(' ')
  const progressPoints = localSamples
    .slice(0, safeCursorIndex + 1)
    .map(item => mapPoint(item.x, item.z).join(','))
    .join(' ')
  const start = mapPoint(localSamples[0].x, localSamples[0].z)
  const end = mapPoint(localSamples[localSamples.length - 1].x, localSamples[localSamples.length - 1].z)

  return <svg className="replay-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="本次驾驶轨迹与教练标准轨迹对照俯视图；屏幕上方为车辆初始前进方向">
    <rect x="0" y="0" width={width} height={height} rx="18" className="replay-map-bg" />

    {localReferences.map((line, index) => (
      <polyline
        key={`${line.kind}-${index}`}
        points={line.points.map(point => mapPoint(point.x, point.z).join(',')).join(' ')}
        className={`replay-reference ${line.kind}`}
      />
    ))}

    {coachPoints && <polyline points={coachPoints} className="replay-coach-path" />}
    <polyline points={points} className="replay-path-shadow" />
    <polyline points={points} className="replay-path" />
    {safeCursorIndex > 0 && <polyline points={progressPoints} className="replay-path-progress" />}

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

    <g
      className="replay-car-cursor"
      transform={`translate(${cursorScreen[0]} ${cursorScreen[1]}) rotate(${cursorHeadingDegrees})`}
      aria-label="当前复盘位置"
    >
      <circle r="10" className="replay-car-halo" />
      <path d="M 0 -10 L 6 7 L 0 4 L -6 7 Z" className="replay-car-shape" />
      <circle r="2.5" className="replay-car-center" />
    </g>

    <g className="replay-orientation" transform="translate(18 18)">
      <rect x="0" y="0" width="100" height="45" rx="9" />
      <text x="10" y="18">↑ 初始车头</text>
      <text x="10" y="35">左 ←　→ 右</text>
    </g>
  </svg>
}

function ReplayLegend() {
  return <div className="replay-legend" aria-label="轨迹图例">
    <span><i className="replay-legend-line coach" />教练标准</span>
    <span><i className="replay-legend-dot start" />起点</span>
    <span><i className="replay-legend-dot end" />终点</span>
    <span><i className="replay-legend-dot error" />扣分位置</span>
    <span><i className="replay-legend-dot fatal" />不合格位置</span>
  </div>
}

function gearLabel(sample: TrajectorySample) {
  if (sample.gear < 0) return 'R'
  if (sample.gear === 0) return 'N'
  if (sample.automatic) return 'D'
  return String(sample.gear)
}

function steeringLabel(angle = 0) {
  if (Math.abs(angle) < 0.03) return '回正'
  return `${angle < 0 ? '左' : '右'} ${(Math.abs(angle) / (Math.PI * 2)).toFixed(2)} 圈`
}

function indicatorLabel(sample: TrajectorySample) {
  if (sample.leftIndicator && sample.rightIndicator) return '双闪'
  if (sample.leftIndicator) return '左转向'
  if (sample.rightIndicator) return '右转向'
  return '关闭'
}

function headlampLabel(sample: TrajectorySample) {
  if (sample.highBeam) return '远光'
  if (sample.lowBeam) return '近光'
  return '关闭'
}

function pedalLabel(value: number | undefined) {
  return value == null ? '--' : `${Math.round(value * 100)}%`
}

function operationOffsetLabel(offsetSeconds: number) {
  if (offsetSeconds === 0) return '扣分时'
  return offsetSeconds < 0
    ? `前 ${Math.abs(offsetSeconds).toFixed(1)}s`
    : `后 ${offsetSeconds.toFixed(1)}s`
}

function TrainingFocusSummary({
  items,
  projects,
  onSelect,
  onStartTraining,
  onStartTrainingPack,
  onStartSubject3Practice,
}: {
  items: ReplayTrainingFocus[]
  projects: Set<string>
  onSelect: (item: ReplayTrainingFocus) => void
  onStartTraining?: (project: ReplayTrainingProjectId) => void
  onStartTrainingPack?: (packId: TrainingPackId) => void
  onStartSubject3Practice?: (slice: Subject3PracticeSliceId) => void
}) {
  if (items.length === 0) return null

  return <section className="replay-focus" aria-labelledby="replay-focus-title">
    <div className="replay-focus-head">
      <div>
        <div className="eyebrow">TRAINING PRIORITIES</div>
        <h3 id="replay-focus-title">本次优先改进</h3>
      </div>
      <p className="replay-focus-description">先解决最影响成绩和安全的 2–3 个习惯；有跨项目训练包时优先连续练习，也可以只回练本次证据所在项目。</p>
    </div>

    <div className="replay-focus-grid">
      {items.map((item, index) => {
        const representative = item.representative
        const canFocus =
          representative.t != null &&
          representative.project != null &&
          projects.has(representative.project)
        const sliceTitle = subject3PracticeSliceTitle(item.recommendedSubject3Practice ?? undefined)
        const canTrainSlice =
          item.recommendedSubject3Practice != null &&
          sliceTitle != null &&
          onStartSubject3Practice != null
        const canTrain =
          !canTrainSlice &&
          item.recommendedProject != null &&
          onStartTraining != null
        const pack = trainingPackForHabit(item.id)
        const canStartPack = pack != null && onStartTrainingPack != null

        return <article
          key={item.id}
          className="replay-focus-card"
          aria-label={`优先改进 ${index + 1}：${item.title}`}
        >
          <span className="replay-focus-rank">{index + 1}</span>
          <span className="replay-focus-copy">
            <strong>{item.title}</strong>
            <span>{item.summary}</span>
            <span className="replay-focus-meta">
              <i>{item.count} 条相关记录</i>
              {item.fatalCount > 0
                ? <i className="fatal">含 {item.fatalCount} 条不合格</i>
                : <i>相关扣分 {item.totalPoints} 分</i>}
            </span>
            <span className="replay-focus-practice"><b>训练重点</b>{item.practice}</span>
            <span className="replay-focus-evidence">
              {item.evidenceTitles.map(title => <i key={title}>{title}</i>)}
            </span>
            <span className="replay-focus-actions">
              <button
                type="button"
                className="replay-focus-evidence-btn"
                disabled={!canFocus}
                onClick={() => {
                  if (canFocus) onSelect(item)
                }}
              >
                {canFocus ? '查看轨迹证据' : '查看下方明细'}
              </button>
              {canStartPack && <button
                type="button"
                className="replay-focus-pack-btn"
                onClick={() => onStartTrainingPack(pack!.id)}
              >
                训练包 · {pack!.title}
              </button>}
              {canTrainSlice && <button
                type="button"
                className="replay-focus-training-btn"
                onClick={() => onStartSubject3Practice(item.recommendedSubject3Practice!)}
              >
                {canStartPack ? '回练' : '专项训练'} · {sliceTitle}
              </button>}
              {canTrain && <button
                type="button"
                className="replay-focus-training-btn"
                onClick={() => onStartTraining(item.recommendedProject!)}
              >
                {canStartPack ? '回练' : '专项训练'} · {projectActionLabel(item.recommendedProject!)}
              </button>}
            </span>
          </span>
        </article>
      })}
    </div>
  </section>
}

function ProjectReplay({
  project,
  samples,
  infractions,
  focusTime,
  focusToken,
  focusScroll = true,
  subject3Practice,
}: {
  project: string
  samples: TrajectorySample[]
  infractions: ReplayInfraction[]
  focusTime?: number
  focusToken?: number
  focusScroll?: boolean
  subject3Practice?: Subject3PracticeSliceId
}) {
  const [cursorIndex, setCursorIndex] = useState(samples.length - 1)
  const articleRef = useRef<HTMLElement>(null)

  useEffect(() => {
    setCursorIndex(samples.length - 1)
  }, [project, samples.length])

  useEffect(() => {
    if (focusTime == null || focusToken == null) return
    let nearestIndex = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    samples.forEach((sample, index) => {
      const distance = Math.abs(sample.t - focusTime)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = index
      }
    })
    setCursorIndex(nearestIndex)
    if (focusScroll) {
      articleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [focusTime, focusToken, focusScroll, samples])

  const safeCursorIndex = Math.max(0, Math.min(cursorIndex, samples.length - 1))
  const current = samples[safeCursorIndex]
  const stats = pathStats(samples)
  const automatic = samples.find(sample => sample.automatic != null)?.automatic ?? true
  const coachReference = useMemo(
    () => coachReferencePathForReplay(
      project,
      automatic,
      project === 'subject3' ? subject3Practice : undefined,
    ),
    [project, automatic, subject3Practice],
  )
  const coachDeviation = useMemo(
    () => coachDeviationStats(samples, coachReference),
    [samples, coachReference],
  )
  const currentCoachDeviation = coachDeviation?.distances[safeCursorIndex]
  const projectElapsed = current.t - samples[0].t

  return <article className="replay-project" ref={articleRef}>
    <div className="replay-project-title">
      <strong>{
        project === 'subject3' && subject3Practice
          ? `科目三专项 · ${subject3PracticeSliceById(subject3Practice).title}`
          : projectLabel(project)
      }</strong>
      <div>
        <span>{stats.distance >= 1000 ? `${(stats.distance / 1000).toFixed(2)} km` : `${Math.round(stats.distance)} m`}</span>
        <span>最高 {Math.round(stats.maxSpeed)} km/h</span>
        <span>{Math.round(stats.duration)} s</span>
        {coachDeviation && <span className="replay-coach-stat">平均偏差 {coachDeviation.averageMeters.toFixed(2)} m</span>}
        {coachDeviation && <span className="replay-coach-stat">最大偏差 {coachDeviation.maxMeters.toFixed(2)} m</span>}
      </div>
    </div>

    <PathMap
      project={project}
      samples={samples}
      infractions={infractions}
      cursorIndex={safeCursorIndex}
      coachReference={coachReference}
      subject3Practice={subject3Practice}
    />

    <div className="replay-scrubber">
      <div className="replay-scrubber-head">
        <strong>时间复盘</strong>
        <span>{projectElapsed.toFixed(1)}s / {stats.duration.toFixed(1)}s</span>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, samples.length - 1)}
        step={1}
        value={safeCursorIndex}
        onChange={event => setCursorIndex(Number(event.target.value))}
        aria-label={`${projectLabel(project)}复盘时间轴`}
      />
      <div className="replay-live-readout">
        <span><b>{(Math.abs(current.speed) * 3.6).toFixed(1)}</b><small>km/h</small></span>
        <span><b>{gearLabel(current)}</b><small>挡位</small></span>
        <span><b>{steeringLabel(current.steeringWheelAngle)}</b><small>方向盘</small></span>
        <span><b>{indicatorLabel(current)}</b><small>转向灯</small></span>
        <span><b>{current.handbrake ? '拉起' : '释放'}</b><small>手刹</small></span>
        <span><b>{headlampLabel(current)}</b><small>前照灯</small></span>
        <span><b>{pedalLabel(current.throttle)}</b><small>油门</small></span>
        <span><b>{pedalLabel(current.brake)}</b><small>制动</small></span>
        {currentCoachDeviation != null &&
          <span className="replay-coach-deviation">
            <b>{currentCoachDeviation.toFixed(2)} m</b>
            <small>距教练标准轨迹</small>
          </span>}
        {current.leadTimeGapSeconds != null && current.leadGapMeters != null &&
          <span>
            <b>{current.leadTimeGapSeconds.toFixed(1)} 秒</b>
            <small>前车时距 · {current.leadGapMeters.toFixed(1)} m</small>
          </span>}
        {current.cutInHazardId && current.cutInProgressDeltaMeters != null &&
          current.cutInLateralDeltaMeters != null &&
          <span>
            <b>{current.cutInConflict ? '已切入' : '接近中'}</b>
            <small>
              加塞目标 · 纵向 {current.cutInProgressDeltaMeters.toFixed(1)} m · 横向 {Math.abs(current.cutInLateralDeltaMeters).toFixed(1)} m
            </small>
          </span>}
        {current.pedestrianHazardId &&
          current.pedestrianProgressDeltaMeters != null &&
          current.pedestrianLateralDeltaMeters != null &&
          <span>
            <b>{current.pedestrianConflict ? '冲突中' : '横穿中'}</b>
            <small>
              行人 · 前后 {current.pedestrianProgressDeltaMeters.toFixed(1)} m · 横向 {Math.abs(current.pedestrianLateralDeltaMeters).toFixed(1)} m
            </small>
          </span>}
      </div>
    </div>
  </article>
}

export function ExamReplay({
  samples,
  infractions,
  onStartTraining,
  onStartTrainingPack,
  onStartSubject3Practice,
  subject3Practice,
}: {
  samples: TrajectorySample[]
  infractions: ReplayInfraction[]
  onStartTraining?: (project: ReplayTrainingProjectId) => void
  onStartTrainingPack?: (packId: TrainingPackId) => void
  onStartSubject3Practice?: (slice: Subject3PracticeSliceId) => void
  subject3Practice?: Subject3PracticeSliceId
}): ReactElement | null {
  const [focusRequest, setFocusRequest] = useState<{
    project: string
    t: number
    token: number
    scroll: boolean
  } | null>(null)
  const [selectedHazardEventId, setSelectedHazardEventId] = useState<string | null>(null)
  const focusReplay = useCallback((
    project: string,
    t: number,
    hazardEventId?: string,
    options?: { scroll?: boolean },
  ) => {
    setSelectedHazardEventId(hazardEventId ?? null)
    setFocusRequest(previous => ({
      project,
      t,
      token: (previous?.token ?? 0) + 1,
      scroll: options?.scroll ?? true,
    }))
  }, [])

  const projects = useMemo(
    () => Array.from(new Set(samples.map(item => item.project))),
    [samples],
  )
  const projectSet = useMemo(() => new Set(projects), [projects])
  const trainingFocus = useMemo(
    () => buildReplayTrainingFocus(infractions, 3),
    [infractions],
  )

  if (samples.length < 2) return null

  return <section className="replay-section">
    <div className="replay-heading">
      <div>
        <div className="eyebrow">DRIVING REPLAY</div>
        <h3>驾驶轨迹复盘</h3>
      </div>
      <ReplayLegend />
    </div>

    <TrainingFocusSummary
      items={trainingFocus}
      projects={projectSet}
      onSelect={item => {
        const representative = item.representative
        if (representative.project == null || representative.t == null) return
        focusReplay(representative.project!, representative.t!)
      }}
      onStartTraining={onStartTraining}
      onStartTrainingPack={onStartTrainingPack}
      onStartSubject3Practice={onStartSubject3Practice}
    />

    <GearSpeedCoachingPanel
      samples={samples}
      onSelect={(project, t) => focusReplay(project, t)}
    />

    <FollowingDistanceCoachingPanel
      samples={samples}
      onSelect={t => focusReplay('subject3', t)}
    />

    <SuddenBrakeCoachingPanel
      samples={samples}
      selectedEventId={selectedHazardEventId}
      onSelect={(t, eventId) => focusReplay('subject3', t, eventId)}
    />

    <CutInResponseCoachingPanel
      samples={samples}
      selectedEventId={selectedHazardEventId}
      onSelect={(t, eventId) => focusReplay('subject3', t, eventId)}
    />

    <PedestrianResponseCoachingPanel
      samples={samples}
      selectedEventId={selectedHazardEventId}
      onSelect={(t, eventId) => focusReplay('subject3', t, eventId)}
    />

    <NightLightingCoachingPanel
      samples={samples}
      onSelect={t => focusReplay('subject3', t)}
    />

    <DrivingDynamicsTimeline
      samples={samples}
      selectedEventId={selectedHazardEventId}
      projectLabel={projectLabel}
      onSelect={(project, t, eventId, options) => focusReplay(project, t, eventId, options)}
    />

    <div className="replay-projects">
      {projects.map(project => {
        const projectSamples = samples.filter(item => item.project === project)
        if (projectSamples.length < 2) return null
        const projectInfractions = infractions.filter(item => item.project === project)
        return <ProjectReplay
          key={project}
          project={project}
          samples={projectSamples}
          infractions={projectInfractions}
          focusTime={focusRequest?.project === project ? focusRequest.t : undefined}
          focusToken={focusRequest?.project === project ? focusRequest.token : undefined}
          focusScroll={focusRequest?.project === project ? focusRequest.scroll : undefined}
          subject3Practice={project === 'subject3' ? subject3Practice : undefined}
        />
      })}
    </div>

    <div className="replay-timeline">
      <h3>错误时间轴</h3>
      {infractions.length === 0
        ? <p>本次没有扣分事件。</p>
        : [...infractions]
            .sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
            .map(item => {
              const canFocus =
                item.t != null &&
                item.project != null &&
                projects.includes(item.project)
              const context = nearestReplaySample(samples, item.project, item.t)
              const operationSlice = replayOperationSlice(samples, item.project, item.t)
              const diagnosis = replayDiagnosis(item)
              return <button
                type="button"
                className={`replay-event${canFocus ? ' interactive' : ''}`}
                key={item.id + String(item.t)}
                disabled={!canFocus}
                onClick={() => {
                  if (!canFocus) return
                  focusReplay(item.project!, item.t!)
                }}
              >
                <time>{item.t != null ? `${item.t.toFixed(1)}s` : '--'}</time>
                <span className="replay-event-copy">
                  <strong>{item.title}</strong>
                  <span>{item.project ? projectLabel(item.project) : '驾驶过程'}</span>
                  {context && <span className="replay-event-context" aria-label="扣分时操作状态">
                    <i>{(Math.abs(context.speed) * 3.6).toFixed(1)} km/h</i>
                    <i>{gearLabel(context)} 挡</i>
                    <i>方向盘 {steeringLabel(context.steeringWheelAngle)}</i>
                    <i>{indicatorLabel(context)}</i>
                    <i>手刹{context.handbrake ? '拉起' : '释放'}</i>
                  </span>}
                  <span className="replay-event-diagnosis">
                    <span><b>原因</b>{diagnosis.reason}</span>
                    <span><b>建议</b>{diagnosis.advice}</span>
                  </span>
                  {operationSlice.length > 0 && <span className="replay-operation-slice" aria-label="扣分前后操作切片">
                    {operationSlice.map(point => <span
                      className={point.offsetSeconds === 0 ? 'replay-operation-point event' : 'replay-operation-point'}
                      key={point.offsetSeconds}
                    >
                      <em>{operationOffsetLabel(point.offsetSeconds)}</em>
                      <strong>{(Math.abs(point.sample.speed) * 3.6).toFixed(1)} km/h · {gearLabel(point.sample)}</strong>
                      <small>方向盘 {steeringLabel(point.sample.steeringWheelAngle)}</small>
                      <small>{indicatorLabel(point.sample)} · 手刹{point.sample.handbrake ? '拉起' : '释放'}</small>
                    </span>)}
                  </span>}
                </span>
                <b>{item.fatal ? '不合格' : `-${item.points}`}</b>
              </button>
            })}
    </div>
  </section>
}
