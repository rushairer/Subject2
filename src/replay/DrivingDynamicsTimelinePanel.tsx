import { useEffect, useMemo, useState } from 'react'
import {
  buildDrivingDynamicsEventMarkers,
  drivingDynamicsEventSelection,
  type DrivingDynamicsEventKind,
  type DrivingDynamicsEventMarker,
  type DrivingDynamicsEventSample,
} from './drivingDynamicsEvents'
import {
  buildDrivingDynamicsTimeline,
  dynamicsGearLabel,
} from './drivingDynamicsTimeline'
import {
  buildDrivingDynamicsEventContext,
  type DrivingDynamicsEventContext,
  type DrivingDynamicsEventContextSample,
} from './drivingDynamicsEventContext'
import {
  buildDrivingDynamicsReactionChain,
  type DrivingDynamicsReactionChain,
} from './drivingDynamicsReactionChain'
import {
  buildDrivingDynamicsSessionOverview,
  type DrivingDynamicsSessionOverview,
} from './drivingDynamicsSessionOverview'
import {
  DEFAULT_DRIVING_DYNAMICS_HAZARD_FILTER,
  drivingDynamicsHazardFilterActive,
  filterDrivingDynamicsHazardEvents,
  type DrivingDynamicsHazardEvidenceFilter,
  type DrivingDynamicsHazardFilter,
  type DrivingDynamicsHazardKindFilter,
} from './drivingDynamicsHazardFilter'
import {
  buildDrivingDynamicsHazardComparisons,
  type DrivingDynamicsHazardComparisonGroup,
} from './drivingDynamicsHazardComparison'
import {
  buildDrivingDynamicsHazardInsights,
  type DrivingDynamicsHazardInsightGroup,
} from './drivingDynamicsHazardInsights'

const VIEW_WIDTH = 1000
const VIEW_HEIGHT = 230
const SPEED_TOP = 24
const SPEED_BOTTOM = 132
const GEAR_TOP = 158
const GEAR_BOTTOM = 214

const CONTEXT_VIEW_WIDTH = 1000
const CONTEXT_VIEW_HEIGHT = 292
const CONTEXT_PLOT_LEFT = 105
const CONTEXT_PLOT_RIGHT = 982
const CONTEXT_TRACKS = {
  speed: { top: 20, bottom: 72 },
  throttle: { top: 86, bottom: 138 },
  brake: { top: 152, bottom: 204 },
  steering: { top: 218, bottom: 270 },
} as const

const EVENT_OFFSETS: Record<DrivingDynamicsEventKind, number> = {
  'sudden-brake': 16,
  'cut-in': 32,
  pedestrian: 48,
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function timeX(t: number, start: number, duration: number) {
  if (duration <= 0) return 0
  return clamp01((t - start) / duration) * VIEW_WIDTH
}

function speedY(speedKmh: number, speedScaleMax: number) {
  const ratio = clamp01(speedKmh / Math.max(1, speedScaleMax))
  return SPEED_BOTTOM - ratio * (SPEED_BOTTOM - SPEED_TOP)
}

function eventY(
  kind: DrivingDynamicsEventKind,
  curveY: number,
) {
  const offset = EVENT_OFFSETS[kind]
  return curveY < (SPEED_TOP + SPEED_BOTTOM) / 2
    ? Math.min(SPEED_BOTTOM - 8, curveY + offset)
    : Math.max(SPEED_TOP + 8, curveY - offset)
}

function gearValue(gear: number) {
  return Math.max(-1, Math.min(5, gear))
}

function gearY(gear: number) {
  const ratio = (gearValue(gear) + 1) / 6
  return GEAR_BOTTOM - ratio * (GEAR_BOTTOM - GEAR_TOP)
}

function speedPath(
  samples: ReturnType<typeof buildDrivingDynamicsTimeline>['chartSamples'],
  start: number,
  duration: number,
  speedScaleMax: number,
) {
  return samples.map((sample, index) => {
    const x = timeX(sample.t, start, duration)
    const y = speedY(Math.abs(sample.speed) * 3.6, speedScaleMax)
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
}

function gearPath(
  samples: ReturnType<typeof buildDrivingDynamicsTimeline>['chartSamples'],
  start: number,
  duration: number,
) {
  if (samples.length === 0) return ''
  const first = samples[0]
  let path = `M ${timeX(first.t, start, duration).toFixed(2)} ${gearY(first.gear).toFixed(2)}`
  for (let index = 1; index < samples.length; index += 1) {
    const sample = samples[index]
    const x = timeX(sample.t, start, duration)
    const y = gearY(sample.gear)
    path += ` H ${x.toFixed(2)} V ${y.toFixed(2)}`
  }
  return path
}

function durationLabel(seconds: number) {
  if (seconds < 60) return `${seconds.toFixed(1)} 秒`
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.round(seconds % 60)
  return `${minutes} 分 ${remainder} 秒`
}

function contextTimeX(relativeTime: number, windowSeconds: number) {
  const duration = Math.max(0.2, windowSeconds * 2)
  const ratio = clamp01((relativeTime + windowSeconds) / duration)
  return CONTEXT_PLOT_LEFT +
    ratio * (CONTEXT_PLOT_RIGHT - CONTEXT_PLOT_LEFT)
}

function contextValueY(
  value: number,
  minimum: number,
  maximum: number,
  top: number,
  bottom: number,
) {
  const range = Math.max(0.0001, maximum - minimum)
  const ratio = clamp01((value - minimum) / range)
  return bottom - ratio * (bottom - top)
}

function contextSeriesPath(
  samples: readonly DrivingDynamicsEventContextSample[],
  windowSeconds: number,
  pick: (sample: DrivingDynamicsEventContextSample) => number | undefined,
  minimum: number,
  maximum: number,
  top: number,
  bottom: number,
) {
  let path = ''
  let drawing = false

  for (const sample of samples) {
    const value = pick(sample)
    if (value == null || !Number.isFinite(value)) {
      drawing = false
      continue
    }

    const x = contextTimeX(sample.relativeTime, windowSeconds)
    const y = contextValueY(value, minimum, maximum, top, bottom)
    path += `${drawing ? ' L' : ' M'} ${x.toFixed(2)} ${y.toFixed(2)}`
    drawing = true
  }

  return path
}

function contextPercentLabel(value: number | undefined) {
  return value == null ? '--' : `${Math.round(value)}%`
}

function contextSteeringLabel(turns: number | undefined) {
  if (turns == null) return '--'
  if (Math.abs(turns) < 0.01) return '回正'
  return `${turns < 0 ? '左' : '右'} ${Math.abs(turns).toFixed(2)} 圈`
}

function contextRelativeTimeLabel(value: number | undefined) {
  if (value == null) return '--'
  if (Math.abs(value) < 0.05) return '0.0s'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}s`
}

const OVERVIEW_EVENT_ROWS: {
  kind: DrivingDynamicsEventKind
  label: string
}[] = [
  { kind: 'sudden-brake', label: '前车急刹' },
  { kind: 'cut-in', label: '电动车加塞' },
  { kind: 'pedestrian', label: '行人横穿' },
]

const HAZARD_KIND_FILTERS: {
  value: DrivingDynamicsHazardKindFilter
  label: string
}[] = [
  { value: 'all', label: '全部类型' },
  { value: 'sudden-brake', label: '急刹' },
  { value: 'cut-in', label: '加塞' },
  { value: 'pedestrian', label: '行人' },
]

const HAZARD_EVIDENCE_FILTERS: {
  value: DrivingDynamicsHazardEvidenceFilter
  label: string
}[] = [
  { value: 'all', label: '全部证据' },
  { value: 'brake', label: '记录到制动' },
  { value: 'stop', label: '记录到停车' },
  { value: 'steering', label: '记录到明显转向' },
  { value: 'no-auto-response', label: '暂无后续摘要' },
]

function sessionTimeLabel(seconds: number) {
  if (seconds < 60) return `${seconds.toFixed(0)}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.round(seconds % 60)
  return `${minutes}m ${remainder}s`
}

function comparisonSeconds(value: number | undefined) {
  return value == null ? '—' : `${value.toFixed(1)}s`
}

function comparisonSpeed(value: number | undefined) {
  return value == null ? '—' : `${value.toFixed(1)} km/h`
}

function comparisonSteering(value: number | undefined) {
  return value == null ? '—' : `${value.toFixed(2)} 圈`
}

function HazardPeerComparison({
  groups,
  insightGroups,
  sessionStartTime,
  selectedEventId,
  onSelect,
}: {
  groups: readonly DrivingDynamicsHazardComparisonGroup[]
  insightGroups: readonly DrivingDynamicsHazardInsightGroup[]
  sessionStartTime: number
  selectedEventId?: string | null
  onSelect: (eventId: string) => void
}) {
  if (groups.length === 0) return null

  return <div className="replay-hazard-comparison" aria-label="同类风险事件横向对比">
    <div className="replay-hazard-comparison-head">
      <span>
        <small>PEER EVENT COMPARISON</small>
        <b>同类风险事件横向对比</b>
      </span>
      <em>只比较当前筛选结果中重复出现的同类事件，不做排名或评分。</em>
    </div>

    {groups.map(group => <section
      className={`replay-hazard-comparison-group ${group.kind}`}
      key={group.kind}
      aria-label={`${group.label}横向对比`}
    >
      <div className="replay-hazard-comparison-group-head">
        <span className={`replay-hazard-kind ${group.kind}`}>{group.glyph}</span>
        <span>
          <b>{group.label}</b>
          <small>{group.items.length} 次同类事件 · 按真实触发时间排序</small>
        </span>
      </div>

      {(() => {
        const insightGroup = insightGroups.find(item => item.kind === group.kind)
        const insights = insightGroup?.insights ?? []
        return <div className="replay-hazard-insights" aria-label={`${group.label}事实洞察`}>
          <div className="replay-hazard-insights-head">
            <b>事实洞察</b>
            <small>只描述可复核差异，不评价处理优劣。</small>
          </div>
          {insights.length > 0
            ? <ul>
                {insights.map(insight => <li
                  key={insight.id}
                  className={insight.kind}
                >
                  {insight.text}
                </li>)}
              </ul>
            : <p>
                当前可比较指标没有形成超过摘要显示阈值的差异；完整数值仍保留在下表。
              </p>}
        </div>
      })()}

      <div className="replay-hazard-comparison-table-wrap">
        <table className="replay-hazard-comparison-table">
          <thead>
            <tr>
              <th scope="col">对比项</th>
              {group.items.map((item, index) => {
                const selected = item.id === selectedEventId
                return <th
                  scope="col"
                  key={item.id}
                  className={selected ? 'selected' : ''}
                >
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelect(item.id)}
                  >
                    <b>第 {index + 1} 次</b>
                    <small>
                      {sessionTimeLabel(Math.max(0, item.triggerTime - sessionStartTime))}
                    </small>
                  </button>
                </th>
              })}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">触发附近速度</th>
              {group.items.map(item => <td key={item.id}>
                {comparisonSpeed(item.triggerSpeedKmh)}
              </td>)}
            </tr>
            <tr>
              <th scope="row">松油门</th>
              {group.items.map(item => <td key={item.id}>
                {comparisonSeconds(item.throttleReleaseSeconds)}
              </td>)}
            </tr>
            <tr>
              <th scope="row">开始制动</th>
              {group.items.map(item => <td key={item.id}>
                {comparisonSeconds(item.brakeReactionSeconds)}
              </td>)}
            </tr>
            <tr>
              <th scope="row">车辆停止</th>
              {group.items.map(item => <td key={item.id}>
                {comparisonSeconds(item.stopReactionSeconds)}
              </td>)}
            </tr>
            <tr>
              <th scope="row">触发后 ≤3 秒最低车速</th>
              {group.items.map(item => <td key={item.id}>
                {comparisonSpeed(item.minimumPostTriggerSpeedKmh)}
              </td>)}
            </tr>
            <tr>
              <th scope="row">方向盘变化</th>
              {group.items.map(item => <td key={item.id}>
                {comparisonSteering(item.steeringChangeTurns)}
              </td>)}
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        “—”表示当前证据没有该指标。松油门/制动/停车来自既有教练分析器；
        最低车速最多取触发后 3 秒真实轨迹，录像边界不足时只使用实际覆盖；方向盘变化仅显示已有结构化证据。
      </p>
    </section>)}
  </div>
}

function HazardSessionOverview({
  overview,
  selectedEventId,
  filter,
  filteredEventIds,
  filteredCount,
  onFilterChange,
  onSelect,
}: {
  overview: DrivingDynamicsSessionOverview
  selectedEventId?: string | null
  filter: DrivingDynamicsHazardFilter
  filteredEventIds: ReadonlySet<string>
  filteredCount: number
  onFilterChange: (filter: DrivingDynamicsHazardFilter) => void
  onSelect: (eventId: string) => void
}) {
  const { counts } = overview
  const filterActive = drivingDynamicsHazardFilterActive(filter)

  return <div className="replay-hazard-overview" aria-label="整场风险复盘总览">
    <div className="replay-hazard-overview-head">
      <span>
        <small>SESSION HAZARD OVERVIEW</small>
        <b>整场风险复盘总览</b>
      </span>
      <strong>
        {filterActive
          ? `筛选 ${filteredCount}/${counts.total} 个风险事件`
          : `共 ${counts.total} 个风险事件`}
      </strong>
    </div>

    <div className="replay-hazard-overview-counts">
      <span className="sudden-brake"><b>{counts.suddenBrake}</b><small>前车急刹</small></span>
      <span className="cut-in"><b>{counts.cutIn}</b><small>电动车加塞</small></span>
      <span className="pedestrian"><b>{counts.pedestrian}</b><small>行人横穿</small></span>
    </div>

    <p className="replay-hazard-overview-evidence">
      记录到：
      <b>松油门 {counts.withThrottleRelease} 个</b>
      <b>制动反应 {counts.withBrakeResponse} 个</b>
      <b>停车 {counts.withStop} 个</b>
      <b>方向盘明显变化 {counts.withSteeringChange} 个</b>
      <em>仅汇总已有复盘证据，不代表事件处理质量或考试得分。</em>
    </p>

    <div className="replay-hazard-filters" aria-label="风险事件筛选">
      <div className="replay-hazard-filter-row">
        <span>事件类型</span>
        <div>
          {HAZARD_KIND_FILTERS.map(option => <button
            type="button"
            key={option.value}
            className={filter.kind === option.value ? 'selected' : ''}
            aria-pressed={filter.kind === option.value}
            onClick={() => onFilterChange({
              ...filter,
              kind: option.value,
            })}
          >
            {option.label}
          </button>)}
        </div>
      </div>
      <div className="replay-hazard-filter-row">
        <span>证据状态</span>
        <div>
          {HAZARD_EVIDENCE_FILTERS.map(option => <button
            type="button"
            key={option.value}
            className={filter.evidence === option.value ? 'selected' : ''}
            aria-pressed={filter.evidence === option.value}
            onClick={() => onFilterChange({
              ...filter,
              evidence: option.value,
            })}
          >
            {option.label}
          </button>)}
          {filterActive && <button
            type="button"
            className="reset"
            onClick={() => onFilterChange(DEFAULT_DRIVING_DYNAMICS_HAZARD_FILTER)}
          >
            清除筛选
          </button>}
        </div>
      </div>
      <p>
        当前显示 {filteredCount}/{counts.total} 个事件；“暂无后续摘要”仅表示当前 ±3 秒窗口未自动归纳出后续节点，不等于没有采取有效避险动作。
      </p>
    </div>

    <div className="replay-hazard-overview-timeline">
      <div className="replay-hazard-overview-time-scale">
        <span>0s</span>
        <span>{sessionTimeLabel(overview.durationSeconds)}</span>
      </div>

      {OVERVIEW_EVENT_ROWS.map(row => {
        const markers = overview.markers.filter(marker => marker.kind === row.kind)
        return <div className="replay-hazard-overview-lane" key={row.kind}>
          <span className="replay-hazard-overview-lane-label">{row.label}</span>
          <div className="replay-hazard-overview-track">
            {markers.map(marker => {
              const included = filteredEventIds.has(marker.id)
              const selected = included && marker.id === selectedEventId
              return <button
                type="button"
                key={marker.id}
                className={`replay-hazard-overview-marker ${marker.kind}${selected ? ' selected' : ''}${included ? '' : ' filtered-out'}`}
                style={{ left: `${(marker.ratio * 100).toFixed(2)}%` }}
                aria-label={`${marker.label}，整场第 ${sessionTimeLabel(Math.max(0, marker.relativeTime))} 触发`}
                aria-pressed={selected}
                aria-disabled={!included}
                disabled={!included}
                tabIndex={included ? 0 : -1}
                title={included
                  ? `${marker.label} · ${sessionTimeLabel(Math.max(0, marker.relativeTime))}`
                  : `${marker.label} · 不在当前筛选结果中`}
                onClick={() => {
                  if (included) onSelect(marker.id)
                }}
              >
                {marker.glyph}
              </button>
            })}
          </div>
        </div>
      })}
    </div>

    <p className="replay-hazard-overview-note">
      亮色事件属于当前筛选结果；点击即可切换下方详细复盘。灰色事件保留整场位置参考，不参与当前上一/下一导航。
    </p>
  </div>
}

function HazardEventContextChart({
  context,
  reactionChain,
}: {
  context: DrivingDynamicsEventContext
  reactionChain: DrivingDynamicsReactionChain
}) {
  const trigger = context.triggerSample
  const truncated =
    context.beforeCoverageSeconds < context.windowSeconds - 0.05 ||
    context.afterCoverageSeconds < context.windowSeconds - 0.05
  const triggerX = contextTimeX(0, context.windowSeconds)
  const steeringScale = context.steeringScaleTurns

  if (context.samples.length === 0) {
    return <div className="replay-hazard-context empty">
      当前事件附近没有可用的同项目轨迹样本。
    </div>
  }

  const tracks = [
    {
      key: 'speed',
      label: '速度',
      detail: `0–${context.speedScaleMaxKmh} km/h`,
      path: contextSeriesPath(
        context.samples,
        context.windowSeconds,
        sample => sample.speedKmh,
        0,
        context.speedScaleMaxKmh,
        CONTEXT_TRACKS.speed.top,
        CONTEXT_TRACKS.speed.bottom,
      ),
      top: CONTEXT_TRACKS.speed.top,
      bottom: CONTEXT_TRACKS.speed.bottom,
    },
    {
      key: 'throttle',
      label: '油门',
      detail: '0–100%',
      path: contextSeriesPath(
        context.samples,
        context.windowSeconds,
        sample => sample.throttlePercent,
        0,
        100,
        CONTEXT_TRACKS.throttle.top,
        CONTEXT_TRACKS.throttle.bottom,
      ),
      top: CONTEXT_TRACKS.throttle.top,
      bottom: CONTEXT_TRACKS.throttle.bottom,
    },
    {
      key: 'brake',
      label: '制动',
      detail: '0–100%',
      path: contextSeriesPath(
        context.samples,
        context.windowSeconds,
        sample => sample.brakePercent,
        0,
        100,
        CONTEXT_TRACKS.brake.top,
        CONTEXT_TRACKS.brake.bottom,
      ),
      top: CONTEXT_TRACKS.brake.top,
      bottom: CONTEXT_TRACKS.brake.bottom,
    },
    {
      key: 'steering',
      label: '方向盘',
      detail: `±${steeringScale.toFixed(2)} 圈`,
      path: contextSeriesPath(
        context.samples,
        context.windowSeconds,
        sample => sample.steeringTurns,
        -steeringScale,
        steeringScale,
        CONTEXT_TRACKS.steering.top,
        CONTEXT_TRACKS.steering.bottom,
      ),
      top: CONTEXT_TRACKS.steering.top,
      bottom: CONTEXT_TRACKS.steering.bottom,
    },
  ]

  return <div className="replay-hazard-context">
    <div className="replay-hazard-context-head">
      <span>
        <b>事件前后操作链</b>
        <small>
          以真实触发时刻为 0 秒，查看前 {context.windowSeconds.toFixed(0)} 秒到后 {context.windowSeconds.toFixed(0)} 秒连续采样。
        </small>
      </span>
      <i className={truncated ? 'truncated' : ''}>
        覆盖 前 {context.beforeCoverageSeconds.toFixed(1)}s / 后 {context.afterCoverageSeconds.toFixed(1)}s
      </i>
    </div>

    <div className="replay-hazard-reaction-chain" aria-label="风险事件反应链自动摘要">
      <div className="replay-hazard-reaction-chain-head">
        <span>
          <b>反应链自动摘要</b>
          <small>只按已记录的分析器证据与轨迹采样排序，不评价反应好坏。</small>
        </span>
        <i>{reactionChain.steps.length - 1} 个后续节点</i>
      </div>
      <p>{reactionChain.summary}</p>
      {reactionChain.hasObservedResponse
        ? <ol>
            {reactionChain.steps.map(step => <li
              key={`${step.kind}:${step.timeSeconds.toFixed(3)}:${step.label}`}
              className={step.kind}
            >
              <time>{contextRelativeTimeLabel(step.timeSeconds)}</time>
              <span>
                <b>{step.label}</b>
                {step.detail && <small>{step.detail}</small>}
              </span>
            </li>)}
          </ol>
        : <em>
            当前窗口没有足够的后续反应节点可自动归纳；请结合下面的连续曲线查看。
          </em>}
    </div>

    <div className="replay-hazard-trigger-title">
      触发附近状态 · 最近采样点 {contextRelativeTimeLabel(trigger?.relativeTime)}
    </div>
    <div className="replay-hazard-trigger-readout" aria-label="风险事件触发附近操作状态">
      <span><b>{trigger ? trigger.speedKmh.toFixed(1) : '--'}</b><small>km/h</small></span>
      <span><b>{contextPercentLabel(trigger?.throttlePercent)}</b><small>油门</small></span>
      <span><b>{contextPercentLabel(trigger?.brakePercent)}</b><small>制动</small></span>
      <span><b>{contextSteeringLabel(trigger?.steeringTurns)}</b><small>方向盘</small></span>
    </div>

    <div className="replay-hazard-context-chart">
      <svg
        viewBox={`0 0 ${CONTEXT_VIEW_WIDTH} ${CONTEXT_VIEW_HEIGHT}`}
        role="img"
        aria-label="风险事件前后三秒的速度、油门、制动和方向盘连续变化"
      >
        <rect
          className="replay-hazard-context-before"
          x={CONTEXT_PLOT_LEFT}
          y="8"
          width={triggerX - CONTEXT_PLOT_LEFT}
          height="270"
        />
        <rect
          className="replay-hazard-context-after"
          x={triggerX}
          y="8"
          width={CONTEXT_PLOT_RIGHT - triggerX}
          height="270"
        />

        {tracks.map(track => <g key={track.key}>
          <line
            className="replay-hazard-context-grid"
            x1={CONTEXT_PLOT_LEFT}
            x2={CONTEXT_PLOT_RIGHT}
            y1={track.bottom}
            y2={track.bottom}
          />
          {track.key === 'steering' && <line
            className="replay-hazard-context-zero"
            x1={CONTEXT_PLOT_LEFT}
            x2={CONTEXT_PLOT_RIGHT}
            y1={(track.top + track.bottom) / 2}
            y2={(track.top + track.bottom) / 2}
          />}
          <text className="replay-hazard-context-label" x="8" y={track.top + 17}>
            {track.label}
          </text>
          <text className="replay-hazard-context-scale" x="8" y={track.top + 35}>
            {track.detail}
          </text>
          <path
            className={`replay-hazard-context-line ${track.key}`}
            d={track.path}
          />
        </g>)}

        <line
          className="replay-hazard-context-trigger"
          x1={triggerX}
          x2={triggerX}
          y1="8"
          y2="278"
        />
        <text className="replay-hazard-context-trigger-label" x={triggerX + 8} y="18">
          触发
        </text>
        <text className="replay-hazard-context-time" x={CONTEXT_PLOT_LEFT} y="289">
          -{context.windowSeconds.toFixed(0)}s
        </text>
        <text className="replay-hazard-context-time" x={triggerX} y="289" textAnchor="middle">
          0s
        </text>
        <text className="replay-hazard-context-time" x={CONTEXT_PLOT_RIGHT} y="289" textAnchor="end">
          +{context.windowSeconds.toFixed(0)}s
        </text>
      </svg>
    </div>

    {truncated && <p className="replay-hazard-context-note">
      本段录像靠近训练开始或结束，仅展示实际存在的采样；缺失部分不会补值或推测。
    </p>}
  </div>
}

export function DrivingDynamicsTimeline({
  samples,
  selectedEventId,
  projectLabel,
  onSelect,
}: {
  samples: readonly DrivingDynamicsEventSample[]
  selectedEventId?: string | null
  projectLabel: (project: string) => string
  onSelect: (project: string, time: number, eventId?: string, options?: { scroll?: boolean }) => void
}) {
  const model = useMemo(
    () => buildDrivingDynamicsTimeline(samples),
    [samples],
  )
  const events = useMemo(
    () => buildDrivingDynamicsEventMarkers(model.samples),
    [model.samples],
  )
  const sessionOverview = useMemo(
    () => buildDrivingDynamicsSessionOverview(
      events,
      model.startTime,
      model.endTime,
    ),
    [events, model.endTime, model.startTime],
  )
  const [hazardFilter, setHazardFilter] = useState<DrivingDynamicsHazardFilter>(
    DEFAULT_DRIVING_DYNAMICS_HAZARD_FILTER,
  )
  const filterResult = useMemo(
    () => filterDrivingDynamicsHazardEvents(
      model.samples,
      events,
      hazardFilter,
    ),
    [events, hazardFilter, model.samples],
  )
  const filteredEvents = filterResult.events
  const filteredEventIds = useMemo(
    () => new Set(filteredEvents.map(event => event.id)),
    [filteredEvents],
  )
  const hazardComparisons = useMemo(
    () => buildDrivingDynamicsHazardComparisons(
      model.samples,
      filteredEvents,
    ),
    [filteredEvents, model.samples],
  )
  const hazardInsights = useMemo(
    () => buildDrivingDynamicsHazardInsights(hazardComparisons),
    [hazardComparisons],
  )
  const [cursorIndex, setCursorIndex] = useState(0)
  const selection = drivingDynamicsEventSelection(filteredEvents, selectedEventId)
  const selectedEvent = selectedEventId
    ? filteredEvents.find(event => event.id === selectedEventId) ?? null
    : null
  const browserEvent = selection.event
  const browserContext = useMemo(
    () => browserEvent
      ? buildDrivingDynamicsEventContext(model.samples, browserEvent)
      : null,
    [browserEvent, model.samples],
  )
  const browserReactionChain = useMemo(
    () => browserEvent && browserContext
      ? buildDrivingDynamicsReactionChain(browserContext, browserEvent)
      : null,
    [browserContext, browserEvent],
  )

  useEffect(() => {
    const selectedInFilter = selectedEventId
      ? filteredEvents.some(event => event.id === selectedEventId)
      : false

    if (filteredEvents.length > 0) {
      if (selectedInFilter) return
      const first = filteredEvents[0]
      setCursorIndex(first.sampleIndex)
      onSelect(first.project, first.t, first.id, { scroll: false })
      return
    }

    if (!selectedEventId || model.samples.length === 0) return
    const safeIndex = Math.max(
      0,
      Math.min(model.samples.length - 1, cursorIndex),
    )
    const sample = model.samples[safeIndex]
    onSelect(sample.project, sample.t, undefined, { scroll: false })
  }, [
    cursorIndex,
    filteredEvents,
    model.samples,
    onSelect,
    selectedEventId,
  ])

  if (model.samples.length < 2) return null

  const safeCursorIndex = Math.max(
    0,
    Math.min(model.samples.length - 1, cursorIndex),
  )
  const current = model.samples[safeCursorIndex]
  const speedScaleMax = Math.max(
    10,
    Math.ceil(model.maxSpeedKmh / 10) * 10,
  )
  const currentX = timeX(
    current.t,
    model.startTime,
    model.durationSeconds,
  )
  const currentSpeedY = speedY(
    Math.abs(current.speed) * 3.6,
    speedScaleMax,
  )
  const currentGearY = gearY(current.gear)

  const focusEvent = (
    event: DrivingDynamicsEventMarker,
    options?: { scroll?: boolean },
  ) => {
    setCursorIndex(event.sampleIndex)
    onSelect(event.project, event.t, event.id, options)
  }


  return <section className="replay-dynamics" aria-labelledby="replay-dynamics-title">
    <div className="replay-dynamics-head">
      <div>
        <div className="eyebrow">DRIVING DYNAMICS</div>
        <h3 id="replay-dynamics-title">速度 / 挡位时间轴</h3>
      </div>
      <p>
        沿整场轨迹查看速度与挡位变化；前车急刹、电动车加塞和行人横穿会直接标在速度曲线上。
        拖动游标或点击事件均可定位轨迹证据，该图不参与考试评分。
      </p>
    </div>

    <div className="replay-dynamics-meta">
      <i>总时长 {durationLabel(model.durationSeconds)}</i>
      <i>最高速度 {model.maxSpeedKmh.toFixed(1)} km/h</i>
      <i>挡位变化 {model.gearChanges.length} 次</i>
      <i>危险事件 {events.length} 个</i>
    </div>

    <div className="replay-dynamics-chart">
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label="整场训练速度曲线、挡位变化与危险交通事件图"
      >
        <line className="replay-dynamics-grid" x1="0" x2={VIEW_WIDTH} y1={SPEED_BOTTOM} y2={SPEED_BOTTOM} />
        <line className="replay-dynamics-grid" x1="0" x2={VIEW_WIDTH} y1={SPEED_TOP} y2={SPEED_TOP} />
        <line className="replay-dynamics-divider" x1="0" x2={VIEW_WIDTH} y1="146" y2="146" />
        <path
          className="replay-dynamics-speed"
          d={speedPath(model.chartSamples, model.startTime, model.durationSeconds, speedScaleMax)}
        />
        <path
          className="replay-dynamics-gear"
          d={gearPath(model.chartSamples, model.startTime, model.durationSeconds)}
        />
        {events.map(event => {
          const x = timeX(event.t, model.startTime, model.durationSeconds)
          const curveY = speedY(event.speedKmh, speedScaleMax)
          const markerY = eventY(event.kind, curveY)
          const included = filteredEventIds.has(event.id)
          const selected = included && selectedEventId === event.id
          return <g
            key={event.id}
            className={`replay-dynamics-event ${event.kind}${selected ? ' selected' : ''}${included ? '' : ' filtered-out'}`}
            transform={`translate(${x.toFixed(2)} ${markerY.toFixed(2)})`}
            role="button"
            tabIndex={included ? 0 : -1}
            aria-label={included
              ? `${event.label} · 点击查看轨迹证据`
              : `${event.label} · 不在当前筛选结果中`}
            aria-pressed={selected}
            aria-disabled={!included}
            onClick={() => {
              if (included) focusEvent(event)
            }}
            onKeyDown={keyboardEvent => {
              if (!included) return
              if (keyboardEvent.key !== 'Enter' && keyboardEvent.key !== ' ') return
              keyboardEvent.preventDefault()
              focusEvent(event)
            }}
          >
            <title>
              {included
                ? `${event.label} · 点击查看轨迹证据`
                : `${event.label} · 不在当前筛选结果中`}
            </title>
            <line x1="0" x2="0" y1="0" y2={(curveY - markerY).toFixed(2)} />
            <circle r="11" />
            <text x="0" y="4" textAnchor="middle">{event.glyph}</text>
          </g>
        })}
        <line
          className="replay-dynamics-cursor"
          x1={currentX}
          x2={currentX}
          y1="12"
          y2="218"
        />
        <circle className="replay-dynamics-speed-point" cx={currentX} cy={currentSpeedY} r="6" />
        <circle className="replay-dynamics-gear-point" cx={currentX} cy={currentGearY} r="5" />
        <text className="replay-dynamics-label" x="8" y="18">速度</text>
        <text className="replay-dynamics-label" x="8" y="156">挡位</text>
        <text className="replay-dynamics-scale" x={VIEW_WIDTH - 8} y="18" textAnchor="end">
          {speedScaleMax} km/h
        </text>
        <text className="replay-dynamics-scale" x={VIEW_WIDTH - 8} y={SPEED_BOTTOM - 6} textAnchor="end">
          0
        </text>
      </svg>
    </div>

    {events.length > 0 && <>
      <HazardSessionOverview
        overview={sessionOverview}
        selectedEventId={selectedEventId}
        filter={hazardFilter}
        filteredEventIds={filteredEventIds}
        filteredCount={filterResult.filtered}
        onFilterChange={setHazardFilter}
        onSelect={eventId => {
          const event = filteredEvents.find(item => item.id === eventId)
          if (event) focusEvent(event, { scroll: false })
        }}
      />

      <HazardPeerComparison
        groups={hazardComparisons}
        insightGroups={hazardInsights}
        sessionStartTime={model.startTime}
        selectedEventId={selectedEventId}
        onSelect={eventId => {
          const event = filteredEvents.find(item => item.id === eventId)
          if (event) focusEvent(event, { scroll: false })
        }}
      />

      <div
        className="replay-hazard-browser"
        aria-label="多事件快速复盘"
        onKeyDown={keyboardEvent => {
          if (keyboardEvent.key === 'ArrowLeft' && selection.previous) {
            keyboardEvent.preventDefault()
            focusEvent(selection.previous, { scroll: false })
          }
          if (keyboardEvent.key === 'ArrowRight' && selection.next) {
            keyboardEvent.preventDefault()
            focusEvent(selection.next, { scroll: false })
          }
        }}
      >
        <div className="replay-hazard-browser-head">
          <span>
            <small>多事件快速复盘</small>
            <strong>
              {selection.total > 0
                ? <>当前第 {selection.index + 1}/{selection.total} 个风险事件</>
                : <>当前筛选暂无风险事件</>}
            </strong>
          </span>
          <span className="replay-hazard-browser-nav">
            <button
              type="button"
              disabled={!selection.previous}
              onClick={() => {
                if (selection.previous) focusEvent(selection.previous, { scroll: false })
              }}
              aria-label="上一风险事件"
            >
              ← 上一事件
            </button>
            <button
              type="button"
              disabled={!selection.next}
              onClick={() => {
                if (selection.next) focusEvent(selection.next, { scroll: false })
              }}
              aria-label="下一风险事件"
            >
              下一事件 →
            </button>
          </span>
        </div>

        {selection.total === 0 && <div className="replay-hazard-filter-empty" role="status">
          当前筛选组合没有风险事件。可以调整事件类型或证据状态，或在上方清除筛选。
        </div>}

        {browserEvent && <div className="replay-hazard-browser-summary" role="status">
          <span className={`replay-hazard-kind ${browserEvent.kind}`}>
            {browserEvent.glyph}
          </span>
          <span className="replay-hazard-browser-copy">
            <b>{browserEvent.label}</b>
            <small>
              触发 {(browserEvent.triggerTime - model.startTime).toFixed(1)}s · 证据位置 {(browserEvent.t - model.startTime).toFixed(1)}s · {projectLabel(browserEvent.project)}
            </small>
            <em>{browserEvent.summary}</em>
          </span>
          <button
            type="button"
            className="replay-focus-evidence-btn"
            onClick={() => focusEvent(browserEvent, { scroll: true })}
          >
            查看当前轨迹
          </button>
        </div>}

        {browserContext && browserReactionChain && <HazardEventContextChart
          context={browserContext}
          reactionChain={browserReactionChain}
        />}
      </div>

      <div className="replay-dynamics-events" aria-label="当前筛选风险事件">
      {filteredEvents.map(event => {
        const selected = selectedEventId === event.id
        return <button
          type="button"
          key={event.id}
          className={`replay-dynamics-event-chip ${event.kind}${selected ? ' selected' : ''}`}
          aria-pressed={selected}
          onClick={() => focusEvent(event)}
        >
          <b>{event.label}</b>
          <small>
            {(event.t - model.startTime).toFixed(1)}s · {event.speedKmh.toFixed(1)} km/h
          </small>
        </button>
      })}
      </div>
    </>}

    {selectedEvent && <div className="replay-dynamics-current-event" role="status">
      <b>当前事件 · {selectedEvent.label}</b>
      <span>
        {(selectedEvent.t - model.startTime).toFixed(1)}s · {selectedEvent.speedKmh.toFixed(1)} km/h · 对应教练证据卡已高亮
      </span>
    </div>}

    <input
      className="replay-dynamics-scrubber"
      type="range"
      min={0}
      max={model.samples.length - 1}
      step={1}
      value={safeCursorIndex}
      onChange={event => setCursorIndex(Number(event.target.value))}
      aria-label="速度和挡位时间轴游标"
    />

    <div className="replay-dynamics-readout">
      <span><b>{(current.t - model.startTime).toFixed(1)}s</b><small>相对时间</small></span>
      <span><b>{projectLabel(current.project)}</b><small>当前项目</small></span>
      <span><b>{(Math.abs(current.speed) * 3.6).toFixed(1)}</b><small>km/h</small></span>
      <span><b>{dynamicsGearLabel(current)}</b><small>挡位</small></span>
      <button
        type="button"
        className="replay-focus-evidence-btn"
        onClick={() => onSelect(current.project, current.t, undefined, { scroll: true })}
      >
        定位到这段轨迹
      </button>
    </div>
  </section>
}
