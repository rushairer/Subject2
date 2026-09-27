import { useMemo } from 'react'
import { DRIVING_RULES } from '../rules/drivingRules'
import {
  buildPedestrianResponseCoachingReport,
  type PedestrianResponseCoachingEvent,
  type PedestrianResponseCoachingSample,
} from '../coaching/pedestrianResponseCoaching'

function seconds(value: number | undefined) {
  return value == null ? '--' : `${value.toFixed(1)} 秒`
}

function responseSummary(event: PedestrianResponseCoachingEvent) {
  const rules = DRIVING_RULES.subject3.pedestrianResponseCoaching
  const throttle =
    event.baselineThrottle == null
      ? '松油：旧轨迹未记录油门'
      : event.baselineThrottle < rules.throttleReleaseDelta
        ? '松油：触发时油门已在低位'
        : event.throttleReleaseSeconds != null
          ? `松油反应 ${event.throttleReleaseSeconds.toFixed(1)} 秒`
          : '松油：反应窗内未检测到明显回收'

  const brake =
    event.brakeReactionSeconds != null
      ? `制动反应 ${event.brakeReactionSeconds.toFixed(1)} 秒 · 最大制动 ${Math.round(event.maximumBrake * 100)}%`
      : '制动：反应窗内未检测到明显输入'

  const stop =
    event.stopReactionSeconds != null
      ? `停车状态 ${event.stopReactionSeconds.toFixed(1)} 秒后出现`
      : `证据窗内最低车速 ${(event.minimumSpeedMps * 3.6).toFixed(1)} km/h`

  return { throttle, brake, stop }
}

function riskSummary(event: PedestrianResponseCoachingEvent) {
  const parts = [
    `行人进入冲突区时前方约 ${event.triggerAheadMeters.toFixed(1)} m`,
    `横向差 ${Math.abs(event.triggerLateralMeters).toFixed(1)} m`,
  ]
  if (event.minimumPlanarDistanceMeters != null) {
    parts.push(`最近中心距离约 ${event.minimumPlanarDistanceMeters.toFixed(1)} m`)
  }
  return parts.join(' · ')
}

export function PedestrianResponseCoachingPanel({
  samples,
  onSelect,
}: {
  samples: readonly PedestrianResponseCoachingSample[]
  onSelect: (time: number) => void
}) {
  const report = useMemo(
    () => buildPedestrianResponseCoachingReport(samples),
    [samples],
  )

  if (report.scenarioSampleCount < 2) return null

  return (
    <section
      className="replay-focus pedestrian-response-coaching"
      aria-labelledby="pedestrian-response-coaching-title"
    >
      <div className="replay-focus-head">
        <div>
          <div className="eyebrow">PEDESTRIAN RESPONSE COACHING</div>
          <h3 id="pedestrian-response-coaching-title">行人横穿反应观察</h3>
        </div>
        <p className="replay-focus-description">
          复盘脚本化行人进入本侧车行道后的收油、制动和停车过程。
          考试评分仍由既有“有行人通行时停车礼让”规则负责；这里仅解释轨迹证据，不新增第二套扣分。
        </p>
      </div>

      <div className="replay-focus-meta">
        <i>横穿场景样本 {report.scenarioSampleCount} 个</i>
        <i>可分析冲突 {report.events.length} 次</i>
        <i>
          反应窗 {seconds(
            DRIVING_RULES.subject3.pedestrianResponseCoaching.reactionWindowSeconds,
          )}
        </i>
      </div>

      <div className="replay-focus-grid">
        {report.events.length === 0 ? (
          <article
            className="replay-focus-card"
            aria-label="行人横穿反应观察有效冲突不足"
          >
            <span className="replay-focus-rank">—</span>
            <span className="replay-focus-copy">
              <strong>已记录行人横穿，但没有形成可分析的接近冲突</strong>
              <span>
                可能是候考车距离较远、车速已很低，或采样没有连续覆盖行人进入本侧车行道的瞬间。
              </span>
              <span className="replay-focus-practice">
                <b>说明</b>
                本模块只解释有足够连续证据的反应过程，不用缺失样本推断驾驶表现。
              </span>
            </span>
          </article>
        ) : (
          report.events.map((event, index) => {
            const response = responseSummary(event)
            return (
              <article
                className="replay-focus-card"
                key={`${event.hazardId}-${event.triggerTime}`}
                aria-label={`行人横穿反应观察 ${index + 1}`}
              >
                <span className="replay-focus-rank">{index + 1}</span>
                <span className="replay-focus-copy">
                  <strong>行人进入本侧车行道 · 反应证据</strong>
                  <span>{riskSummary(event)}</span>
                  <span className="replay-focus-practice">
                    <b>操作反应</b>
                    {response.throttle}；{response.brake}；{response.stop}。
                  </span>
                  <span className="replay-focus-practice">
                    <b>训练建议</b>
                    结合轨迹检查是否提前收油、平顺制动，并在冲突持续时为行人留出明确通行空间。
                    这里展示的是过程证据；最终考试扣分仍以既有横道让行规则为准。
                  </span>
                  <span className="replay-focus-actions">
                    <button
                      type="button"
                      className="replay-focus-evidence-btn"
                      onClick={() => onSelect(event.representativeTime)}
                    >
                      查看这段轨迹证据
                    </button>
                  </span>
                </span>
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}
