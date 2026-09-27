import { useMemo } from 'react'
import {
  buildGearSpeedCoachingReport,
  type GearSpeedCoachingSample,
  type GearSpeedCoachingSegment,
} from '../coaching/gearSpeedCoaching'

function segmentTitle(segment: GearSpeedCoachingSegment) {
  return segment.kind === 'low-rpm'
    ? '转速持续偏低 · 挡位可能偏高'
    : '转速持续偏高 · 挡位可能偏低'
}

function segmentAdvice(segment: GearSpeedCoachingSegment) {
  return segment.kind === 'low-rpm'
    ? '结合前方道路条件，考虑及时减挡，避免发动机长期低转负荷。'
    : '道路条件允许时平顺升挡，避免长时间以低挡高转行驶。'
}

function durationLabel(seconds: number) {
  return seconds < 10 ? `${seconds.toFixed(1)} 秒` : `${Math.round(seconds)} 秒`
}

export function GearSpeedCoachingPanel({
  samples,
  onSelect,
}: {
  samples: readonly GearSpeedCoachingSample[]
  onSelect: (project: string, time: number) => void
}) {
  const report = useMemo(
    () => buildGearSpeedCoachingReport(samples),
    [samples],
  )

  if (report.applicableSampleCount < 2) return null

  const mismatchRatio = report.assessedSeconds > 0
    ? report.mismatchSeconds / report.assessedSeconds
    : 0

  return <section className="replay-focus" aria-labelledby="gear-speed-coaching-title">
    <div className="replay-focus-head">
      <div>
        <div className="eyebrow">MANUAL GEAR COACHING</div>
        <h3 id="gear-speed-coaching-title">挡位—车速训练观察</h3>
      </div>
      <p className="replay-focus-description">
        依据本次模拟车的发动机转速、实际车速、挡位和离合结合状态识别持续且明显的不匹配。
        这是训练提示，不是考试扣分项，也不改变本次成绩。
      </p>
    </div>

    <div className="replay-focus-meta">
      <i>有效观察 {durationLabel(report.assessedSeconds)}</i>
      <i>持续不匹配 {durationLabel(report.mismatchSeconds)}</i>
      <i>占比 {(mismatchRatio * 100).toFixed(0)}%</i>
    </div>

    <div className="replay-focus-grid">
      {report.segments.length === 0
        ? <article className="replay-focus-card" aria-label="挡位车速匹配未发现持续异常">
            <span className="replay-focus-rank">✓</span>
            <span className="replay-focus-copy">
              <strong>未发现持续的明显挡速不匹配</strong>
              <span>当前可分析片段里，发动机转速整体处于本模拟车的建议训练区间。</span>
              <span className="replay-focus-practice">
                <b>说明</b>
                这只代表本次模拟数据没有出现持续异常，不等于真实道路驾驶能力已达标。
              </span>
            </span>
          </article>
        : report.segments.map((segment, index) =>
            <article
              className="replay-focus-card"
              key={`${segment.kind}-${segment.gear}-${segment.startTime}`}
              aria-label={`挡位车速训练观察 ${index + 1}：${segmentTitle(segment)}`}
            >
              <span className="replay-focus-rank">{index + 1}</span>
              <span className="replay-focus-copy">
                <strong>{segmentTitle(segment)}</strong>
                <span>
                  {segment.gear} 挡 · 约 {segment.representativeSpeedKmh.toFixed(1)} km/h ·
                  {Math.round(segment.representativeRpm)} rpm · 持续 {durationLabel(segment.durationSeconds)}
                </span>
                <span className="replay-focus-practice">
                  <b>训练建议</b>
                  {segmentAdvice(segment)}
                </span>
                <span className="replay-focus-actions">
                  <button
                    type="button"
                    className="replay-focus-evidence-btn"
                    onClick={() => onSelect(segment.project, segment.representativeTime)}
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
