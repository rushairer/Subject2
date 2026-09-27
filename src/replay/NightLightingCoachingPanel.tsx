import { useMemo } from 'react'
import { DRIVING_RULES } from '../rules/drivingRules'
import {
  buildNightLightingCoachingReport,
  type NightLightingCoachingSample,
  type NightLightingCoachingSegment,
} from '../coaching/nightLightingCoaching'

function durationLabel(seconds: number) {
  return seconds < 10 ? `${seconds.toFixed(1)} 秒` : `${Math.round(seconds)} 秒`
}

function segmentTitle(segment: NightLightingCoachingSegment) {
  return segment.kind === 'meeting-high-beam'
    ? '会车接近时仍持续使用远光灯'
    : '近距跟车时仍持续使用远光灯'
}

function segmentEvidence(segment: NightLightingCoachingSegment) {
  if (segment.kind === 'meeting-high-beam') {
    return `最近对向车约 ${segment.minimumOncomingDistanceMeters?.toFixed(0) ?? '--'} m · 车速 ${segment.representativeSpeedKmh.toFixed(1)} km/h · 持续 ${durationLabel(segment.durationSeconds)}`
  }

  const gap = segment.minimumLeadGapMeters != null
    ? ` · 最小净距 ${segment.minimumLeadGapMeters.toFixed(1)} m`
    : ''
  return `最小时距 ${segment.minimumLeadTimeGapSeconds?.toFixed(1) ?? '--'} 秒${gap} · 车速 ${segment.representativeSpeedKmh.toFixed(1)} km/h · 持续 ${durationLabel(segment.durationSeconds)}`
}

function segmentAdvice(segment: NightLightingCoachingSegment) {
  if (segment.kind === 'meeting-high-beam') {
    return '发现对向车辆后应提前切回近光。本训练按法规明确的 150 米会车要求复盘，避免远光影响对向驾驶人视线。'
  }
  return '近距离跟随前车时不要持续使用远光。本模拟用既有 3 秒跟车训练参考筛选近距场景，实际道路仍应按环境主动留出更大余量。'
}

export function NightLightingCoachingPanel({
  samples,
  onSelect,
}: {
  samples: readonly NightLightingCoachingSample[]
  onSelect: (time: number) => void
}) {
  const report = useMemo(
    () => buildNightLightingCoachingReport(samples),
    [samples],
  )
  const meetingDistance =
    DRIVING_RULES.subject3.nightLightingCoaching.meetingLowBeamDistanceMeters
  const followingReference =
    DRIVING_RULES.subject3.followingCoaching.referenceTimeGapSeconds

  if (report.observedSampleCount < 2) return null

  return <section className="replay-focus night-lighting-coaching" aria-labelledby="night-lighting-coaching-title">
    <div className="replay-focus-head">
      <div>
        <div className="eyebrow">NIGHT LIGHTING COACHING</div>
        <h3 id="night-lighting-coaching-title">夜间灯光训练观察</h3>
      </div>
      <p className="replay-focus-description">
        复盘夜间真实交通上下文中的远光使用：会车按 {meetingDistance} 米改用近光要求检查；
        近距跟车用 {followingReference} 秒训练参考筛选。这里仅做证据提示，不额外改变考试成绩。
      </p>
    </div>

    <div className="replay-focus-meta">
      <i>有效夜间行驶 {durationLabel(report.observedSeconds)}</i>
      <i>需复盘片段 {report.segments.length} 段</i>
      <i>持续上下文 {durationLabel(report.issueSeconds)}</i>
    </div>

    <div className="replay-focus-grid">
      {report.segments.length === 0
        ? <article className="replay-focus-card" aria-label="夜间灯光训练观察未发现持续异常">
            <span className="replay-focus-rank">✓</span>
            <span className="replay-focus-copy">
              <strong>未发现持续的不当远光交通上下文</strong>
              <span>当前可分析片段里，没有发现会车接近或近距跟车时持续使用远光灯的情况。</span>
              <span className="replay-focus-practice">
                <b>说明</b>
                自由道路正常远光不会被当成问题；短暂远近光切换也会被持续时间过滤。
              </span>
            </span>
          </article>
        : report.segments.map((segment, index) =>
            <article
              className="replay-focus-card"
              key={`${segment.kind}-${segment.vehicleId}-${segment.startTime}`}
              aria-label={`夜间灯光训练观察 ${index + 1}：${segmentTitle(segment)}`}
            >
              <span className="replay-focus-rank">{index + 1}</span>
              <span className="replay-focus-copy">
                <strong>{segmentTitle(segment)}</strong>
                <span>{segmentEvidence(segment)}</span>
                <span className="replay-focus-practice">
                  <b>训练建议</b>
                  {segmentAdvice(segment)}
                </span>
                <span className="replay-focus-actions">
                  <button
                    type="button"
                    className="replay-focus-evidence-btn"
                    onClick={() => onSelect(segment.representativeTime)}
                  >
                    查看这段轨迹证据
                  </button>
                </span>
              </span>
            </article>,
          )}
    </div>
  </section>
}
