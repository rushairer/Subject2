import { useMemo } from 'react'
import { DRIVING_RULES } from '../rules/drivingRules'
import {
  buildFollowingDistanceCoachingReport,
  type FollowingDistanceCoachingSample,
  type FollowingDistanceCoachingSegment,
} from '../coaching/followingDistanceCoaching'

function durationLabel(seconds: number) {
  return seconds < 10 ? `${seconds.toFixed(1)} 秒` : `${Math.round(seconds)} 秒`
}

function adviceFor(segment: FollowingDistanceCoachingSegment) {
  if (segment.representativeClosingSpeedMps > 2) {
    return '正在明显追近前车，优先提前收油并准备制动，避免把减速空间压缩到最后一刻。'
  }
  return '保持稳定车速并逐步拉开距离，以至少约 3 秒的缓冲空间作为本模拟训练参考。'
}

export function FollowingDistanceCoachingPanel({
  samples,
  onSelect,
}: {
  samples: readonly FollowingDistanceCoachingSample[]
  onSelect: (time: number) => void
}) {
  const report = useMemo(
    () => buildFollowingDistanceCoachingReport(samples),
    [samples],
  )
  const referenceSeconds =
    DRIVING_RULES.subject3.followingCoaching.referenceTimeGapSeconds

  if (report.observedSampleCount < 2) return null

  return <section className="replay-focus following-distance-coaching" aria-labelledby="following-distance-coaching-title">
    <div className="replay-focus-head">
      <div>
        <div className="eyebrow">FOLLOWING DISTANCE COACHING</div>
        <h3 id="following-distance-coaching-title">跟车安全训练观察</h3>
      </div>
      <p className="replay-focus-description">
        依据同车道前车的实际路线位置计算车身净距，并结合当前车速换算时距。
        以 {referenceSeconds} 秒跟车法作为训练参考；这是教练提示，不是全国统一考试扣分阈值，也不改变本次成绩。
      </p>
    </div>

    <div className="replay-focus-meta">
      <i>有效跟车 {durationLabel(report.observedSeconds)}</i>
      <i>持续偏近 {durationLabel(report.shortGapSeconds)}</i>
      {report.minimumTimeGapSeconds != null &&
        <i>最小时距 {report.minimumTimeGapSeconds.toFixed(1)} 秒</i>}
      {report.minimumGapMeters != null &&
        <i>最小净距 {report.minimumGapMeters.toFixed(1)} m</i>}
    </div>

    <div className="replay-focus-grid">
      {report.segments.length === 0
        ? <article className="replay-focus-card" aria-label="跟车安全训练观察未发现持续异常">
            <span className="replay-focus-rank">✓</span>
            <span className="replay-focus-copy">
              <strong>未发现持续的跟车过近</strong>
              <span>
                当前可分析片段里，没有出现持续超过训练过滤窗口的
                {referenceSeconds} 秒以下跟车状态。
              </span>
              <span className="replay-focus-practice">
                <b>说明</b>
                短暂切入、换道和瞬时距离变化不会单独判定为问题；仍应结合道路、天气和前车状态主动留出更大余量。
              </span>
            </span>
          </article>
        : report.segments.map((segment, index) =>
            <article
              className="replay-focus-card"
              key={`${segment.vehicleId}-${segment.startTime}`}
              aria-label={`跟车安全训练观察 ${index + 1}：跟车时距持续偏短`}
            >
              <span className="replay-focus-rank">{index + 1}</span>
              <span className="replay-focus-copy">
                <strong>跟车时距持续偏短</strong>
                <span>
                  最小 {segment.minimumTimeGapSeconds.toFixed(1)} 秒 ·
                  净距 {segment.minimumGapMeters.toFixed(1)} m ·
                  持续 {durationLabel(segment.durationSeconds)}
                </span>
                <span className="replay-focus-practice">
                  <b>训练建议</b>
                  {adviceFor(segment)}
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
